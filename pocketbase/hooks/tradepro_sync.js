// Hook unificado para Prévia e Sincronização Paginada de Rupturas e Validades via API TradePro
// Utiliza exclusivamente a coleção `tradepro_sync_jobs` e hooks nativos após persistência.
// Suporta múltiplos fluxos (sync_rupturas e sync_validades) em handlers unificados.
// NUNCA expõe tokens, senhas ou cabeçalhos Authorization no banco nem em logs.
// NUNCA usa routerAdd.
// Promoção 100% transacional e atômica.

// ---------------------------------------------------------------------------
// FASE A — PRÉVIA (Preview de Rupturas ou Validades)
// Disparado após a criação de um registro com status='pending'
// ---------------------------------------------------------------------------
onRecordAfterCreateSuccess((e) => {
  const record = e.record
  if (!record || record.collection().name !== 'tradepro_sync_jobs') {
    return
  }

  const action = record.getString('action')
  const status = record.getString('status')

  if (action === 'sync_rupturas' && status === 'pending') {
    // =========================================================================
    // BLOCO RUPTURAS — PRÉVIA
    // =========================================================================
    const userId = record.getString('requested_by')
    const dateStart = record.getString('date_start').split(' ')[0].split('T')[0]
    const dateEnd = record.getString('date_end').split(' ')[0].split('T')[0]

    const nowIso = new Date().toISOString()
    record.set('started_at', nowIso)

    // 1. Validação estrita de formato e calendário das datas (máximo 31 dias)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    const isValidCalendarDate = (str) => {
      if (!dateRegex.test(str)) return false
      const parts = str.split('-')
      const y = parseInt(parts[0], 10)
      const m = parseInt(parts[1], 10)
      const d = parseInt(parts[2], 10)
      if (m < 1 || m > 12 || d < 1 || d > 31) return false
      const dt = new Date(Date.UTC(y, m - 1, d))
      if (isNaN(dt.getTime())) return false
      return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
    }

    if (!isValidCalendarDate(dateStart) || !isValidCalendarDate(dateEnd) || dateStart > dateEnd) {
      record.set('status', 'error')
      record.set('error_code', 'invalid_period')
      record.set('message', 'Período inválido. A data inicial deve ser menor ou igual à final.')
      record.set('total_informado', 0)
      record.set('paginas_total', 0)
      record.set('finished_at', new Date().toISOString())
      $app.save(record)
      return
    }

    const d1 = new Date(dateStart + 'T00:00:00Z')
    const d2 = new Date(dateEnd + 'T00:00:00Z')
    const diffDays = Math.ceil(Math.abs(d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24))

    if (diffDays > 31) {
      record.set('status', 'error')
      record.set('error_code', 'invalid_period')
      record.set('message', 'Intervalo máximo permitido é de 31 dias.')
      record.set('total_informado', 0)
      record.set('paginas_total', 0)
      record.set('finished_at', new Date().toISOString())
      $app.save(record)
      return
    }

    // 2. Rate limit: máx 3 jobs em 5 min, máx 1 syncing concorrente
    try {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
      const recentJobs = $app.findRecordsByFilter(
        'tradepro_sync_jobs',
        'requested_by = "' +
          userId +
          '" && created >= "' +
          fiveMinutesAgo +
          '" && id != "' +
          record.id +
          '"',
        '-created',
        10,
        0,
      )

      if (recentJobs && recentJobs.length >= 3) {
        record.set('status', 'error')
        record.set('error_code', 'rate_limited')
        record.set(
          'message',
          'Muitas requisições recentes. Aguarde alguns minutos antes de tentar novamente.',
        )
        record.set('total_informado', 0)
        record.set('paginas_total', 0)
        record.set('finished_at', new Date().toISOString())
        $app.save(record)
        return
      }

      const concurrentSyncing = $app.findRecordsByFilter(
        'tradepro_sync_jobs',
        'status = "syncing" && id != "' + record.id + '"',
        '-created',
        5,
        0,
      )

      if (concurrentSyncing && concurrentSyncing.length > 0) {
        record.set('status', 'error')
        record.set('error_code', 'rate_limited')
        record.set(
          'message',
          'Já existe uma sincronização em andamento. Aguarde a conclusão antes de iniciar outra.',
        )
        record.set('total_informado', 0)
        record.set('paginas_total', 0)
        record.set('finished_at', new Date().toISOString())
        $app.save(record)
        return
      }
    } catch (_) {
      // prossegue em caso de falha de consulta de rate limit
    }

    // 3. Obter token protegido do ambiente
    const rawToken = $os.getenv('TRADEPRO_BASIC_TOKEN') || ''
    if (!rawToken.trim()) {
      record.set('status', 'error')
      record.set('error_code', 'not_configured')
      record.set('message', 'Integração não configurada. Cadastre o token protegido no Skip Cloud.')
      record.set('total_informado', 0)
      record.set('paginas_total', 0)
      record.set('finished_at', new Date().toISOString())
      $app.save(record)
      return
    }

    // 4. Montar URL para consulta de página 1 com quantidade 1
    const trimmedToken = rawToken.trim()
    const authHeader = trimmedToken.startsWith('Basic ') ? trimmedToken : 'Basic ' + trimmedToken
    const toTradeProDate = (isoDate) => isoDate.replace(/-/g, '')

    const url =
      'https://diretoria.tradepro.com.br/diretoria/servicos/v1/relatorio-rupturas/' +
      toTradeProDate(dateStart) +
      '/' +
      toTradeProDate(dateEnd) +
      '?paginaAtual=1&quantidadePorPagina=1&agruparUltimaColetaDoProdutoDoMesmoCliente=1'

    // Helper de sanitização inline
    const sanitizeErrorMessage = (rawText, defaultMsg) => {
      let extracted = ''
      try {
        let json = null
        if (rawText) json = JSON.parse(rawText)
        if (json && typeof json === 'object') {
          const candidate =
            json.message ||
            json.mensagem ||
            json.error ||
            json.detail ||
            json.title ||
            json.details ||
            ''
          if (typeof candidate === 'string' && candidate.trim()) {
            extracted = candidate.trim()
          }
        }
      } catch (_) {}

      if (!extracted && rawText && typeof rawText === 'string') {
        const trimmed = rawText.trim()
        if (
          trimmed.length > 0 &&
          trimmed.length <= 300 &&
          !trimmed.startsWith('<html') &&
          !trimmed.startsWith('<!DOCTYPE')
        ) {
          extracted = trimmed
        }
      }

      if (!extracted) extracted = defaultMsg

      let clean = extracted
        .replace(/Authorization:\s*[^\s,;]+/gi, '')
        .replace(/Basic\s+[A-Za-z0-9+/=]+/gi, '')
        .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, '')
        .replace(/token[=:\s]+[A-Za-z0-9\-._~+/]+/gi, '')
        .replace(/password[=:\s]+[^\s,;]+/gi, '')
        .replace(/senha[=:\s]+[^\s,;]+/gi, '')
        .replace(/https?:\/\/[^\s?#]+(\?[^\s#]*)?/gi, '[URL]')
        .replace(/cookie[=:\s]+[^\s,;]+/gi, '')
        .replace(/[A-Za-z0-9+/=]{40,}/g, '')
        .replace(/\s+/g, ' ')
        .trim()

      if (!clean) clean = defaultMsg
      if (clean.length > 300) clean = clean.substring(0, 300)
      return clean
    }

    // 5. Executar chamada HTTP de prévia (timeout 20s)
    const startTime = Date.now()
    let res = null
    let httpError = null

    try {
      res = $http.send({
        url: url,
        method: 'GET',
        headers: {
          Authorization: authHeader,
          Accept: 'application/json',
        },
        timeout: 20,
      })
    } catch (err) {
      httpError = err
    }

    const latencyMs = Date.now() - startTime

    if (httpError || !res) {
      const errStr = String(httpError || '')
      let isTimeout = errStr.toLowerCase().indexOf('timeout') !== -1 || latencyMs >= 19000
      record.set('status', 'error')
      record.set('error_code', isTimeout ? 'timeout' : 'tradepro_unavailable')
      record.set(
        'message',
        isTimeout
          ? 'Serviço não respondeu dentro do limite de 20 segundos.'
          : 'Erro de comunicação ao conectar à API TradePro.',
      )
      record.set('total_informado', 0)
      record.set('paginas_total', 0)
      record.set('finished_at', new Date().toISOString())
      $app.save(record)
      return
    }

    const statusCode = res.statusCode || 0
    const rawBodyText =
      typeof res.raw === 'string' ? res.raw : typeof res.body === 'string' ? res.body : ''

    if (statusCode === 200) {
      let jsonBody = null
      try {
        jsonBody = res.json
      } catch (_) {}

      let totalDeRegistros = 0
      if (jsonBody && typeof jsonBody === 'object') {
        if (typeof jsonBody.totalDeRegistros === 'number') {
          totalDeRegistros = jsonBody.totalDeRegistros
        } else if (typeof jsonBody.totalDeRegistros === 'string') {
          const parsed = parseInt(jsonBody.totalDeRegistros, 10)
          totalDeRegistros = isNaN(parsed) ? 0 : parsed
        }
      }

      const paginasTotal = Math.ceil(totalDeRegistros / 30)
      record.set('status', 'preview')
      record.set('total_informado', totalDeRegistros)
      record.set('paginas_total', paginasTotal)
      record.set('paginas_processadas', 0)
      record.set('registros_lidos', 0)
      record.set('registros_validos', 0)
      record.set('registros_rejeitados', 0)
      record.set('registros_deduplicados', 0)
      record.set('registros_consolidados', 0)
      record.set('message', 'Prévia gerada com sucesso.')
      record.set('error_code', '')
      $app.save(record)
    } else if (statusCode === 204) {
      record.set('status', 'preview')
      record.set('total_informado', 0)
      record.set('paginas_total', 0)
      record.set('paginas_processadas', 0)
      record.set('registros_lidos', 0)
      record.set('registros_validos', 0)
      record.set('registros_rejeitados', 0)
      record.set('registros_deduplicados', 0)
      record.set('registros_consolidados', 0)
      record.set('message', 'Nenhum registro de ruptura encontrado no período.')
      record.set('error_code', '')
      $app.save(record)
    } else if (statusCode === 401) {
      record.set('status', 'error')
      record.set('error_code', 'unauthorized')
      record.set(
        'message',
        sanitizeErrorMessage(rawBodyText, 'Token inválido ou autenticação recusada.'),
      )
      record.set('total_informado', 0)
      record.set('paginas_total', 0)
      record.set('finished_at', new Date().toISOString())
      $app.save(record)
    } else if (statusCode === 403) {
      record.set('status', 'error')
      record.set('error_code', 'forbidden')
      record.set(
        'message',
        sanitizeErrorMessage(rawBodyText, 'Usuário sem permissão para acessar o recurso.'),
      )
      record.set('total_informado', 0)
      record.set('paginas_total', 0)
      record.set('finished_at', new Date().toISOString())
      $app.save(record)
    } else if (statusCode === 412) {
      let custom412Raw = rawBodyText
      try {
        const parsed412Json = typeof res.json === 'object' ? res.json : JSON.parse(rawBodyText)
        if (parsed412Json && Array.isArray(parsed412Json.erros) && parsed412Json.erros.length > 0) {
          const items = parsed412Json.erros.slice(0, 5)
          const mapped = items
            .map((errItem) => {
              const campo = errItem && typeof errItem.campo === 'string' ? errItem.campo : ''
              const codigo = errItem && typeof errItem.codigo === 'string' ? errItem.codigo : ''
              const mensagem =
                errItem && typeof errItem.mensagem === 'string' ? errItem.mensagem : ''
              if (campo && codigo) return campo + ': ' + mensagem + ' (' + codigo + ')'
              if (campo) return campo + ': ' + mensagem
              if (codigo) return mensagem + ' (' + codigo + ')'
              return mensagem || ''
            })
            .filter(Boolean)
          if (mapped.length > 0) custom412Raw = mapped.join(' | ')
        }
      } catch (_) {}

      record.set('status', 'error')
      record.set('error_code', 'precondition_failed')
      record.set(
        'message',
        sanitizeErrorMessage(
          custom412Raw,
          'O TradePro recusou uma pré-condição da solicitação (HTTP 412).',
        ),
      )
      record.set('total_informado', 0)
      record.set('paginas_total', 0)
      record.set('finished_at', new Date().toISOString())
      $app.save(record)
    } else if (statusCode === 429) {
      record.set('status', 'error')
      record.set('error_code', 'rate_limited')
      record.set(
        'message',
        sanitizeErrorMessage(
          rawBodyText,
          'Limite temporário de requisições. Aguarde antes de tentar novamente.',
        ),
      )
      record.set('total_informado', 0)
      record.set('paginas_total', 0)
      record.set('finished_at', new Date().toISOString())
      $app.save(record)
    } else if (statusCode >= 500) {
      record.set('status', 'error')
      record.set('error_code', 'tradepro_unavailable')
      record.set(
        'message',
        sanitizeErrorMessage(rawBodyText, 'Serviço TradePro indisponível no momento.'),
      )
      record.set('total_informado', 0)
      record.set('paginas_total', 0)
      record.set('finished_at', new Date().toISOString())
      $app.save(record)
    } else {
      record.set('status', 'error')
      record.set('error_code', 'internal_error')
      record.set(
        'message',
        sanitizeErrorMessage(
          rawBodyText,
          'Falha na resposta do servidor TradePro (HTTP ' + statusCode + ').',
        ),
      )
      record.set('total_informado', 0)
      record.set('paginas_total', 0)
      record.set('finished_at', new Date().toISOString())
      $app.save(record)
    }
  } else if (action === 'sync_validades' && status === 'pending') {
    // =========================================================================
    // BLOCO VALIDADES — PRÉVIA
    // =========================================================================
    const userId = record.getString('requested_by')
    const dateStart = record.getString('date_start').split(' ')[0].split('T')[0]
    const dateEnd = record.getString('date_end').split(' ')[0].split('T')[0]

    const nowIso = new Date().toISOString()
    record.set('started_at', nowIso)

    // 1. Validação estrita de formato e calendário das datas (máximo 31 dias)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    const isValidCalendarDate = (str) => {
      if (!dateRegex.test(str)) return false
      const parts = str.split('-')
      const y = parseInt(parts[0], 10)
      const m = parseInt(parts[1], 10)
      const d = parseInt(parts[2], 10)
      if (m < 1 || m > 12 || d < 1 || d > 31) return false
      const dt = new Date(Date.UTC(y, m - 1, d))
      if (isNaN(dt.getTime())) return false
      return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
    }

    if (!isValidCalendarDate(dateStart) || !isValidCalendarDate(dateEnd) || dateStart > dateEnd) {
      record.set('status', 'error')
      record.set('error_code', 'invalid_period')
      record.set('message', 'Período inválido. A data inicial deve ser menor ou igual à final.')
      record.set('total_informado', 0)
      record.set('paginas_total', 0)
      record.set('finished_at', new Date().toISOString())
      $app.save(record)
      return
    }

    const d1 = new Date(dateStart + 'T00:00:00Z')
    const d2 = new Date(dateEnd + 'T00:00:00Z')
    const diffDays = Math.ceil(Math.abs(d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24))
    if (diffDays > 31) {
      record.set('status', 'error')
      record.set('error_code', 'invalid_period')
      record.set('message', 'O intervalo máximo permitido para consulta é de 31 dias.')
      record.set('total_informado', 0)
      record.set('paginas_total', 0)
      record.set('finished_at', new Date().toISOString())
      $app.save(record)
      return
    }

    // 2. Proteção contra abuso e Rate Limit (máximo 10 requisições por usuário a cada 5 minutos)
    try {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
      const recentJobs = $app.findRecordsByFilter(
        'tradepro_sync_jobs',
        'requested_by = "' +
          userId +
          '" && created >= "' +
          fiveMinutesAgo +
          '" && action = "sync_validades" && id != "' +
          record.id +
          '"',
        '-created',
        20,
        0,
      )

      if (recentJobs && recentJobs.length > 10) {
        record.set('status', 'error')
        record.set('error_code', 'rate_limited')
        record.set(
          'message',
          'Muitas consultas recentes. Aguarde alguns minutos antes de consultar novamente.',
        )
        record.set('total_informado', 0)
        record.set('paginas_total', 0)
        record.set('finished_at', new Date().toISOString())
        $app.save(record)
        return
      }
    } catch (_) {}

    // 3. Previne execuções concorrentes do mesmo usuário
    try {
      const concurrentSyncing = $app.findRecordsByFilter(
        'tradepro_sync_jobs',
        'requested_by = "' +
          userId +
          '" && status = "syncing" && action = "sync_validades" && id != "' +
          record.id +
          '"',
        '-created',
        5,
        0,
      )

      if (concurrentSyncing && concurrentSyncing.length > 0) {
        record.set('status', 'error')
        record.set('error_code', 'rate_limited')
        record.set(
          'message',
          'Já existe uma sincronização de validades em andamento. Aguarde a conclusão.',
        )
        record.set('total_informado', 0)
        record.set('paginas_total', 0)
        record.set('finished_at', new Date().toISOString())
        $app.save(record)
        return
      }
    } catch (_) {}

    // 4. Obtenção Segura do Token
    const rawToken = $os.getenv('TRADEPRO_BASIC_TOKEN') || ''
    if (!rawToken || rawToken.trim() === '') {
      record.set('status', 'error')
      record.set('error_code', 'not_configured')
      record.set('message', 'Token de autenticação TradePro não configurado.')
      record.set('total_informado', 0)
      record.set('paginas_total', 0)
      record.set('finished_at', new Date().toISOString())
      $app.save(record)
      return
    }

    const trimmedToken = rawToken.trim()
    const authHeader = trimmedToken.startsWith('Basic ') ? trimmedToken : 'Basic ' + trimmedToken
    const toTradeProDate = (isoDate) => isoDate.replace(/-/g, '')

    // Endpoint oficial de Validades: /v1/relatorio-validade/{dataInicial}/{dataFinal}?paginaAtual=1&quantidadePorPagina=1
    const url =
      'https://diretoria.tradepro.com.br/diretoria/servicos/v1/relatorio-validade/' +
      toTradeProDate(dateStart) +
      '/' +
      toTradeProDate(dateEnd) +
      '?paginaAtual=1&quantidadePorPagina=1'

    const sanitizeErrorMessage = (rawText, defaultMsg) => {
      if (!rawText) return defaultMsg
      try {
        const parsed = JSON.parse(rawText)
        if (parsed && typeof parsed === 'object') {
          const candidate =
            parsed.mensagem ||
            parsed.message ||
            parsed.error ||
            parsed.descricao ||
            (Array.isArray(parsed.erros) &&
              parsed.erros[0] &&
              (parsed.erros[0].mensagem || parsed.erros[0].message))
          if (candidate && typeof candidate === 'string') {
            const clean = candidate.trim()
            if (!/secret|key|token|auth|bearer|pass|pwd|header/i.test(clean)) {
              return clean.length > 200 ? clean.substring(0, 197) + '...' : clean
            }
          }
        }
      } catch (_) {}
      const trimmed = rawText.trim()
      if (!/secret|key|token|auth|bearer|pass|pwd|header|<html|<!doctype/i.test(trimmed)) {
        return trimmed.length > 200 ? trimmed.substring(0, 197) + '...' : trimmed
      }
      return defaultMsg
    }

    let res = null
    let httpError = null
    const startTime = Date.now()

    try {
      res = $http.send({
        url: url,
        method: 'GET',
        headers: {
          Authorization: authHeader,
          Accept: 'application/json',
        },
        timeout: 20,
      })
    } catch (err) {
      httpError = err
    }

    const latencyMs = Date.now() - startTime

    if (httpError) {
      const errStr = String(httpError || '')
      const isTimeout = /timeout|deadline|exceeded|timed out/i.test(errStr)
      record.set('status', 'error')
      record.set('error_code', isTimeout ? 'timeout' : 'tradepro_unavailable')
      record.set(
        'message',
        isTimeout
          ? 'Serviço não respondeu dentro do limite de 20 segundos.'
          : 'Erro de comunicação ao conectar à API TradePro.',
      )
      record.set('total_informado', 0)
      record.set('paginas_total', 0)
      record.set('finished_at', new Date().toISOString())
      $app.save(record)
      return
    }

    const statusCode = res.statusCode || 0
    const rawBodyText =
      typeof res.raw === 'string'
        ? res.raw
        : typeof res.body === 'string'
          ? res.body
          : JSON.stringify(res.json || {})

    if (statusCode === 200) {
      let totalDetectado = 0
      let paginasTotal = 0
      let itensRetornados = 0
      let nomeCampoTotalDetectado = ''
      let amostraEstrutura = null

      if (res.json && typeof res.json === 'object') {
        const jsonBody = res.json

        // 1. Extração segura de campos de primeiro nível e tipos
        const bodyKeys = Object.keys(jsonBody)
        const camposRaiz = {}
        for (let k = 0; k < bodyKeys.length; k++) {
          const keyName = bodyKeys[k]
          const val = jsonBody[keyName]
          if (Array.isArray(val)) {
            camposRaiz[keyName] = 'array[' + val.length + ']'
          } else if (val === null) {
            camposRaiz[keyName] = 'null'
          } else {
            camposRaiz[keyName] = typeof val
          }
        }

        // 2. Detecção dinâmica do campo de total:
        const prioridades = [
          'totalDeRegistros',
          'totalRegistros',
          'totalDeProdutos',
          'totalProdutos',
          'totalDeValidades',
          'totalValidades',
          'totalDeItens',
          'totalItens',
          'total',
          'quantidadeTotal',
          'totalGeral',
          'totalGeralRegistros',
        ]

        for (let p = 0; p < prioridades.length; p++) {
          const cand = prioridades[p]
          if (jsonBody[cand] != null) {
            const parsed = parseInt(jsonBody[cand], 10)
            if (!isNaN(parsed) && parsed >= 0) {
              totalDetectado = parsed
              nomeCampoTotalDetectado = cand
              break
            }
          }
        }

        if (totalDetectado === 0) {
          for (let k = 0; k < bodyKeys.length; k++) {
            const key = bodyKeys[k]
            const lower = key.toLowerCase()
            if (
              lower.indexOf('total') !== -1 &&
              lower.indexOf('pagina') === -1 &&
              lower.indexOf('page') === -1
            ) {
              const parsed = parseInt(jsonBody[key], 10)
              if (!isNaN(parsed) && parsed > 0) {
                totalDetectado = parsed
                nomeCampoTotalDetectado = key
                break
              }
            }
          }
        }

        // Localiza a lista de itens
        let listaValidades = null
        let nomeLista = ''
        const arrayCandidates = ['validade', 'validades', 'registros', 'data', 'produtos', 'itens']
        for (let a = 0; a < arrayCandidates.length; a++) {
          const arrKey = arrayCandidates[a]
          if (Array.isArray(jsonBody[arrKey])) {
            listaValidades = jsonBody[arrKey]
            nomeLista = arrKey
            itensRetornados = listaValidades.length
            break
          }
        }

        // 3. CÁLCULO E CONTRATO DE PAGINAÇÃO:
        // A prévia consulta com ?paginaAtual=1&quantidadePorPagina=1.
        // O TradePro responde totalDePaginas baseado na quantidadePorPagina da requisição (ex.: 501 páginas de 1 item).
        // Para a sincronização real, usamos lotes de 30 itens (quantidadePorPagina=30).
        // A quantidade real de páginas para percorrer o dataset com lote 30 é Math.ceil(totalDetectado / 30).
        // Se a requisição de prévia usou quantidadePorPagina = 1 (ou se totalDePaginas == totalDetectado),
        // recalculamos para o lote padrão 30.
        const reqQtdPorPagina =
          jsonBody.quantidadePorPagina != null ? parseInt(jsonBody.quantidadePorPagina, 10) : 1
        const apiTotalPaginas =
          jsonBody.totalDePaginas != null
            ? parseInt(jsonBody.totalDePaginas, 10)
            : jsonBody.quantidadeDePaginas != null
              ? parseInt(jsonBody.quantidadeDePaginas, 10)
              : jsonBody.paginas != null
                ? parseInt(jsonBody.paginas, 10)
                : 0

        const TAMANHO_LOTE_SYNC = 30
        if (totalDetectado > 0) {
          paginasTotal = Math.ceil(totalDetectado / TAMANHO_LOTE_SYNC)
        } else if (apiTotalPaginas > 0) {
          if (reqQtdPorPagina === 1 || apiTotalPaginas === totalDetectado) {
            paginasTotal = Math.ceil(apiTotalPaginas / TAMANHO_LOTE_SYNC)
            totalDetectado = apiTotalPaginas
          } else {
            paginasTotal = apiTotalPaginas
          }
        } else if (itensRetornados > 0) {
          totalDetectado = itensRetornados
          paginasTotal = Math.ceil(totalDetectado / TAMANHO_LOTE_SYNC)
        }

        // 4. DIAGNÓSTICO SEGURO DA ESTRUTURA DA AMOSTRA (sem dados sensíveis)
        // Extrai metadados do primeiro item retornado se disponível
        const itemAmostra = listaValidades && listaValidades.length > 0 ? listaValidades[0] : null
        let itemEstrutura = null
        let diagnosticoCliente = {
          temCodClienteRaiz: false,
          temClienteRaiz: false,
          temClienteObjeto: false,
          camposClienteDetectados: [],
          codClienteEncontrado: '',
          clienteNomeEncontrado: '',
          temFornecedor: false,
          fornecedorValor: '',
        }

        if (itemAmostra && typeof itemAmostra === 'object') {
          itemEstrutura = {}
          const itemKeys = Object.keys(itemAmostra)
          for (let ik = 0; ik < itemKeys.length; ik++) {
            const k = itemKeys[ik]
            const v = itemAmostra[k]
            if (v === null) {
              itemEstrutura[k] = 'null'
            } else if (Array.isArray(v)) {
              itemEstrutura[k] = 'array[' + v.length + ']'
            } else if (typeof v === 'object') {
              const subKeys = Object.keys(v)
              const subObj = {}
              for (let sk = 0; sk < subKeys.length; sk++) {
                const subK = subKeys[sk]
                const subV = v[subK]
                if (typeof subV === 'object' && subV !== null) {
                  subObj[subK] = 'object(' + Object.keys(subV).join(',') + ')'
                } else {
                  subObj[subK] = typeof subV
                }
              }
              itemEstrutura[k] = subObj
            } else {
              itemEstrutura[k] = typeof v
            }
          }

          // Inspeciona campos de identificação de Cliente / Cód. Cliente
          if (itemAmostra.codCliente != null) {
            diagnosticoCliente.temCodClienteRaiz = true
            diagnosticoCliente.codClienteEncontrado = String(itemAmostra.codCliente)
            diagnosticoCliente.camposClienteDetectados.push('codCliente')
          }
          if (itemAmostra.cod_cliente != null) {
            diagnosticoCliente.temCodClienteRaiz = true
            diagnosticoCliente.codClienteEncontrado = String(itemAmostra.cod_cliente)
            diagnosticoCliente.camposClienteDetectados.push('cod_cliente')
          }
          if (itemAmostra.codigoCliente != null) {
            diagnosticoCliente.temCodClienteRaiz = true
            diagnosticoCliente.codClienteEncontrado = String(itemAmostra.codigoCliente)
            diagnosticoCliente.camposClienteDetectados.push('codigoCliente')
          }
          if (itemAmostra.clienteNome != null || itemAmostra.nomeCliente != null) {
            diagnosticoCliente.temClienteRaiz = true
            diagnosticoCliente.clienteNomeEncontrado = String(
              itemAmostra.clienteNome || itemAmostra.nomeCliente,
            )
            diagnosticoCliente.camposClienteDetectados.push('clienteNome')
          }

          if (itemAmostra.cliente && typeof itemAmostra.cliente === 'object') {
            diagnosticoCliente.temClienteObjeto = true
            const cKeys = Object.keys(itemAmostra.cliente)
            for (let ck = 0; ck < cKeys.length; ck++) {
              diagnosticoCliente.camposClienteDetectados.push('cliente.' + cKeys[ck])
            }
            if (itemAmostra.cliente.codigoCliente != null) {
              diagnosticoCliente.codClienteEncontrado = String(itemAmostra.cliente.codigoCliente)
            } else if (itemAmostra.cliente.codigo != null) {
              diagnosticoCliente.codClienteEncontrado = String(itemAmostra.cliente.codigo)
            } else if (itemAmostra.cliente.codCliente != null) {
              diagnosticoCliente.codClienteEncontrado = String(itemAmostra.cliente.codCliente)
            }
          }

          if (itemAmostra.fornecedor != null) {
            diagnosticoCliente.temFornecedor = true
            diagnosticoCliente.fornecedorValor = String(itemAmostra.fornecedor)
          }

          // Dados operacionais seguros da amostra (Loja, Produto, Promotor, Data, Quantidade, Validade)
          // Sem credenciais, tokens, cabeçalhos nem URLs internas
          const promotorObj =
            itemAmostra.promotor && typeof itemAmostra.promotor === 'object'
              ? itemAmostra.promotor
              : {}
          const clienteLojaObj =
            itemAmostra.cliente && typeof itemAmostra.cliente === 'object'
              ? itemAmostra.cliente
              : {}
          const produtoObj =
            itemAmostra.produto && typeof itemAmostra.produto === 'object'
              ? itemAmostra.produto
              : {}
          const cidadeObj =
            clienteLojaObj.cidade && typeof clienteLojaObj.cidade === 'object'
              ? clienteLojaObj.cidade
              : {}
          const estadoObj =
            cidadeObj.estado && typeof cidadeObj.estado === 'object' ? cidadeObj.estado : {}

          amostraEstrutura = {
            capturadoEm: new Date().toISOString(),
            endpoint: '/v1/relatorio-validade',
            metadadosPaginacao: {
              campoTotal: nomeCampoTotalDetectado || 'totalDeRegistros',
              totalDeRegistros: totalDetectado,
              paginaAtual: jsonBody.paginaAtual != null ? Number(jsonBody.paginaAtual) : 1,
              quantidadePorPaginaApi: reqQtdPorPagina,
              totalDePaginasApi: apiTotalPaginas,
              quantidadePorPaginaLotePrevisto: TAMANHO_LOTE_SYNC,
              totalDePaginasPrevistas: paginasTotal,
              nomeColecao: nomeLista || 'validade',
              itensRetornados: itensRetornados,
            },
            camposRespostaRaiz: camposRaiz,
            estruturaItemValidade: itemEstrutura,
            diagnosticoCliente: diagnosticoCliente,
            amostraOperacionalSegura: {
              promotor: {
                id: promotorObj.id != null ? String(promotorObj.id) : '',
                nome: promotorObj.nome != null ? String(promotorObj.nome) : '',
              },
              loja: {
                razaoSocial: clienteLojaObj.razaoSocial || '',
                fantasia: clienteLojaObj.fantasia || '',
                cpfCnpj: clienteLojaObj.cpfCnpj || '',
                cidade:
                  typeof clienteLojaObj.cidade === 'string'
                    ? clienteLojaObj.cidade
                    : cidadeObj.nome || '',
                estado: estadoObj.sigla || '',
              },
              produto: {
                codigo: produtoObj.codigo != null ? String(produtoObj.codigo) : '',
                descricao: produtoObj.descricao || '',
              },
              coleta: {
                dataRealizado: itemAmostra.realizado || '',
                validade: itemAmostra.validade || '',
                diasParaVencimento:
                  itemAmostra.diasParaVencimento != null
                    ? Number(itemAmostra.diasParaVencimento)
                    : null,
                quantidade: itemAmostra.quantidade != null ? Number(itemAmostra.quantidade) : null,
              },
              fornecedor: itemAmostra.fornecedor || 'DIRETORIA',
            },
          }
        } else {
          amostraEstrutura = {
            capturadoEm: new Date().toISOString(),
            endpoint: '/v1/relatorio-validade',
            metadadosPaginacao: {
              campoTotal: nomeCampoTotalDetectado || 'totalDeRegistros',
              totalDeRegistros: totalDetectado,
              paginaAtual: jsonBody.paginaAtual != null ? Number(jsonBody.paginaAtual) : 1,
              quantidadePorPaginaApi: reqQtdPorPagina,
              totalDePaginasApi: apiTotalPaginas,
              quantidadePorPaginaLotePrevisto: TAMANHO_LOTE_SYNC,
              totalDePaginasPrevistas: paginasTotal,
              nomeColecao: nomeLista || 'validade',
              itensRetornados: itensRetornados,
            },
            camposRespostaRaiz: camposRaiz,
            estruturaItemValidade: null,
            diagnosticoCliente: diagnosticoCliente,
            amostraOperacionalSegura: null,
          }
        }

        console.log(
          '[tradepro] validades preview: campoTotal=' +
            (nomeCampoTotalDetectado || 'nenhum') +
            ', totalDetectado=' +
            totalDetectado +
            ', paginasTotalCalculadas=' +
            paginasTotal +
            ', totalDePaginasApi=' +
            apiTotalPaginas +
            ', itensRetornadosNaPagina=' +
            itensRetornados,
        )
      }

      record.set('status', 'preview')
      record.set('error_code', null)
      record.set('total_informado', totalDetectado)
      record.set('paginas_total', paginasTotal)
      if (amostraEstrutura) {
        record.set('amostra_estrutura_json', amostraEstrutura)
      }
      record.set('paginas_processadas', 0)
      record.set('registros_lidos', 0)
      record.set('registros_validos', 0)
      record.set('registros_rejeitados', 0)
      record.set('registros_deduplicados', 0)
      record.set('registros_consolidados', 0)

      let previewMsg = ''
      if (totalDetectado === 0 && paginasTotal === 0 && itensRetornados === 0) {
        previewMsg = 'Nenhum registro de validade encontrado para o período.'
      } else {
        previewMsg =
          'Prévia carregada: ' + totalDetectado + ' registros em ' + paginasTotal + ' páginas.'
      }

      record.set('message', previewMsg)
      record.set('finished_at', new Date().toISOString())
      $app.save(record)
      return
    }

    if (statusCode === 204) {
      record.set('status', 'preview')
      record.set('error_code', null)
      record.set('total_informado', 0)
      record.set('paginas_total', 0)
      record.set('paginas_processadas', 0)
      record.set('registros_lidos', 0)
      record.set('registros_validos', 0)
      record.set('registros_rejeitados', 0)
      record.set('registros_deduplicados', 0)
      record.set('registros_consolidados', 0)
      record.set('message', 'Nenhum registro de validade no período (HTTP 204).')
      record.set('finished_at', new Date().toISOString())
      $app.save(record)
      return
    }

    // Tratamento de Erros HTTP
    record.set('status', 'error')
    record.set('total_informado', 0)
    record.set('paginas_total', 0)
    record.set('finished_at', new Date().toISOString())

    if (statusCode === 401) {
      record.set('error_code', 'unauthorized')
      record.set(
        'message',
        sanitizeErrorMessage(rawBodyText, 'Token inválido ou autenticação recusada.'),
      )
    } else if (statusCode === 403) {
      record.set('error_code', 'forbidden')
      record.set(
        'message',
        sanitizeErrorMessage(rawBodyText, 'Usuário sem permissão para acessar o recurso.'),
      )
    } else if (statusCode === 412) {
      record.set('error_code', 'precondition_failed')
      let cleanDetail = ''
      try {
        const parsed412Json = typeof res.json === 'object' ? res.json : JSON.parse(rawBodyText)
        if (parsed412Json && Array.isArray(parsed412Json.erros) && parsed412Json.erros.length > 0) {
          const items = parsed412Json.erros.slice(0, 5)
          const mapped = items
            .map((errItem) => {
              const campo = errItem && typeof errItem.campo === 'string' ? errItem.campo : ''
              const codigo = errItem && typeof errItem.codigo === 'string' ? errItem.codigo : ''
              const mensagem =
                errItem && typeof errItem.mensagem === 'string' ? errItem.mensagem : ''
              if (campo && mensagem) return campo + ': ' + mensagem
              if (mensagem) return mensagem
              if (codigo) return 'Código: ' + codigo
              return ''
            })
            .filter(Boolean)
          if (mapped.length > 0) {
            cleanDetail = ' ' + mapped.join(' | ')
          }
        }
      } catch (_) {}

      record.set(
        'message',
        sanitizeErrorMessage(
          rawBodyText,
          'O TradePro recusou uma pré-condição da solicitação (HTTP 412).',
        ) + cleanDetail,
      )
    } else if (statusCode === 429) {
      record.set('error_code', 'rate_limited')
      record.set(
        'message',
        sanitizeErrorMessage(
          rawBodyText,
          'Limite de requisições excedido no TradePro. Tente novamente em instantes.',
        ),
      )
    } else if (statusCode >= 500) {
      record.set('error_code', 'tradepro_unavailable')
      record.set(
        'message',
        sanitizeErrorMessage(rawBodyText, 'Serviço TradePro indisponível no momento.'),
      )
    } else {
      record.set('error_code', 'internal_error')
      record.set(
        'message',
        sanitizeErrorMessage(
          rawBodyText,
          'Falha na resposta do servidor TradePro (HTTP ' + statusCode + ').',
        ),
      )
    }

    $app.save(record)
  } else if (action === 'sync_visitas' && status === 'pending') {
    // =========================================================================
    // BLOCO VISITAS — PRÉVIA
    // =========================================================================
    const userId = record.getString('requested_by')
    const dateStart = record.getString('date_start').split(' ')[0].split('T')[0]
    const dateEnd = record.getString('date_end').split(' ')[0].split('T')[0]

    const nowIso = new Date().toISOString()
    record.set('started_at', nowIso)

    // 1. Validação estrita de formato e calendário das datas (máximo 31 dias)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    const isValidCalendarDate = (str) => {
      if (!dateRegex.test(str)) return false
      const parts = str.split('-')
      const y = parseInt(parts[0], 10)
      const m = parseInt(parts[1], 10)
      const d = parseInt(parts[2], 10)
      if (m < 1 || m > 12 || d < 1 || d > 31) return false
      const dt = new Date(Date.UTC(y, m - 1, d))
      if (isNaN(dt.getTime())) return false
      return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
    }

    if (!isValidCalendarDate(dateStart) || !isValidCalendarDate(dateEnd) || dateStart > dateEnd) {
      record.set('status', 'error')
      record.set('error_code', 'invalid_period')
      record.set('message', 'Período inválido. A data inicial deve ser menor ou igual à final.')
      record.set('total_informado', 0)
      record.set('paginas_total', 0)
      record.set('finished_at', new Date().toISOString())
      $app.save(record)
      return
    }

    const d1 = new Date(dateStart + 'T00:00:00Z')
    const d2 = new Date(dateEnd + 'T00:00:00Z')
    const diffDays = Math.ceil(Math.abs(d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24))
    if (diffDays > 31) {
      record.set('status', 'error')
      record.set('error_code', 'invalid_period')
      record.set('message', 'O intervalo máximo permitido para consulta é de 31 dias.')
      record.set('total_informado', 0)
      record.set('paginas_total', 0)
      record.set('finished_at', new Date().toISOString())
      $app.save(record)
      return
    }

    // 2. Proteção contra abuso e Rate Limit
    try {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
      const recentJobs = $app.findRecordsByFilter(
        'tradepro_sync_jobs',
        'requested_by = "' +
          userId +
          '" && created >= "' +
          fiveMinutesAgo +
          '" && action = "sync_visitas" && id != "' +
          record.id +
          '"',
        '-created',
        20,
        0,
      )

      if (recentJobs && recentJobs.length > 10) {
        record.set('status', 'error')
        record.set('error_code', 'rate_limited')
        record.set(
          'message',
          'Muitas consultas recentes. Aguarde alguns minutos antes de consultar novamente.',
        )
        record.set('total_informado', 0)
        record.set('paginas_total', 0)
        record.set('finished_at', new Date().toISOString())
        $app.save(record)
        return
      }
    } catch (_) {}

    // 3. Previne execuções concorrentes do mesmo usuário para sync_visitas
    try {
      const concurrentSyncing = $app.findRecordsByFilter(
        'tradepro_sync_jobs',
        'requested_by = "' +
          userId +
          '" && status = "syncing" && action = "sync_visitas" && id != "' +
          record.id +
          '"',
        '-created',
        5,
        0,
      )

      if (concurrentSyncing && concurrentSyncing.length > 0) {
        record.set('status', 'error')
        record.set('error_code', 'rate_limited')
        record.set(
          'message',
          'Já existe uma sincronização de visitas em andamento. Aguarde a conclusão.',
        )
        record.set('total_informado', 0)
        record.set('paginas_total', 0)
        record.set('finished_at', new Date().toISOString())
        $app.save(record)
        return
      }
    } catch (_) {}

    // 4. Obtenção Segura do Token
    const rawToken = $os.getenv('TRADEPRO_BASIC_TOKEN') || ''
    if (!rawToken || rawToken.trim() === '') {
      record.set('status', 'error')
      record.set('error_code', 'not_configured')
      record.set('message', 'Token de autenticação TradePro não configurado.')
      record.set('total_informado', 0)
      record.set('paginas_total', 0)
      record.set('finished_at', new Date().toISOString())
      $app.save(record)
      return
    }

    const trimmedToken = rawToken.trim()
    const authHeader = trimmedToken.startsWith('Basic ') ? trimmedToken : 'Basic ' + trimmedToken
    const toTradeProDate = (isoDate) => isoDate.replace(/-/g, '')

    // Endpoint oficial de Visitas: /v1/relatorio-visitas/{dataInicial}/{dataFinal}?paginaAtual=1&quantidadePorPagina=1
    const url =
      'https://diretoria.tradepro.com.br/diretoria/servicos/v1/relatorio-visitas/' +
      toTradeProDate(dateStart) +
      '/' +
      toTradeProDate(dateEnd) +
      '?paginaAtual=1&quantidadePorPagina=1'

    const sanitizeErrorMessage = (rawText, defaultMsg) => {
      if (!rawText) return defaultMsg
      try {
        const parsed = JSON.parse(rawText)
        if (parsed && typeof parsed === 'object') {
          const candidate =
            parsed.mensagem ||
            parsed.message ||
            parsed.error ||
            parsed.descricao ||
            (Array.isArray(parsed.erros) &&
              parsed.erros[0] &&
              (parsed.erros[0].mensagem || parsed.erros[0].message))
          if (candidate && typeof candidate === 'string') {
            const clean = candidate.trim()
            if (!/secret|key|token|auth|bearer|pass|pwd|header/i.test(clean)) {
              return clean.length > 200 ? clean.substring(0, 197) + '...' : clean
            }
          }
        }
      } catch (_) {}
      const trimmed = rawText.trim()
      if (!/secret|key|token|auth|bearer|pass|pwd|header|<html|<!doctype/i.test(trimmed)) {
        return trimmed.length > 200 ? trimmed.substring(0, 197) + '...' : trimmed
      }
      return defaultMsg
    }

    let res = null
    let httpError = null
    const startTime = Date.now()

    try {
      res = $http.send({
        url: url,
        method: 'GET',
        headers: {
          Authorization: authHeader,
          Accept: 'application/json',
        },
        timeout: 20,
      })
    } catch (err) {
      httpError = err
    }

    const latencyMs = Date.now() - startTime

    if (httpError) {
      const errStr = String(httpError || '')
      const isTimeout = /timeout|deadline|exceeded|timed out/i.test(errStr)
      record.set('status', 'error')
      record.set('error_code', isTimeout ? 'timeout' : 'tradepro_unavailable')
      record.set(
        'message',
        isTimeout
          ? 'Serviço não respondeu dentro do limite de 20 segundos.'
          : 'Erro de comunicação ao conectar à API TradePro.',
      )
      record.set('total_informado', 0)
      record.set('paginas_total', 0)
      record.set('finished_at', new Date().toISOString())
      $app.save(record)
      return
    }

    const statusCode = res.statusCode || 0
    const rawBodyText =
      typeof res.raw === 'string'
        ? res.raw
        : typeof res.body === 'string'
          ? res.body
          : JSON.stringify(res.json || {})

    if (statusCode === 200) {
      let totalDetectado = 0
      let paginasTotal = 0
      let itensRetornados = 0
      let amostraEstrutura = null

      if (res.json && typeof res.json === 'object') {
        const jsonBody = res.json

        // Total de registros
        if (typeof jsonBody.totalDeRegistros === 'number') {
          totalDetectado = jsonBody.totalDeRegistros
        } else if (typeof jsonBody.totalDeRegistros === 'string') {
          const parsed = parseInt(jsonBody.totalDeRegistros, 10)
          totalDetectado = isNaN(parsed) ? 0 : parsed
        }

        const TAMANHO_LOTE_SYNC = 30
        const reqQtdPorPagina =
          jsonBody.quantidadePorPagina != null ? parseInt(jsonBody.quantidadePorPagina, 10) : 1
        const apiTotalPaginas =
          jsonBody.totalDePaginas != null ? parseInt(jsonBody.totalDePaginas, 10) : 0

        if (totalDetectado > 0) {
          paginasTotal = Math.ceil(totalDetectado / TAMANHO_LOTE_SYNC)
        } else if (apiTotalPaginas > 0) {
          paginasTotal = Math.ceil(apiTotalPaginas / TAMANHO_LOTE_SYNC)
          totalDetectado = apiTotalPaginas
        }

        const listaVisitas = Array.isArray(jsonBody.visitas) ? jsonBody.visitas : []
        itensRetornados = listaVisitas.length

        // Metadados seguros da amostra (sem senhas, tokens ou cabeçalhos)
        const itemAmostra = listaVisitas[0] || null
        if (itemAmostra) {
          amostraEstrutura = {
            capturadoEm: new Date().toISOString(),
            endpoint: '/v1/relatorio-visitas',
            totalDeRegistros: totalDetectado,
            paginasTotalCalculadas: paginasTotal,
            amostraPromotor: {
              idPromotor: itemAmostra.idPromotor != null ? String(itemAmostra.idPromotor) : '',
              nomePromotor: itemAmostra.nomePromotor || '',
              idSupervisor:
                itemAmostra.idSupervisor != null ? String(itemAmostra.idSupervisor) : '',
              nomeSupervisor: itemAmostra.nomeSupervisor || '',
              visitasPrevistas:
                itemAmostra.visitasPrevistas != null ? Number(itemAmostra.visitasPrevistas) : 0,
              visitasRealizadas:
                itemAmostra.visitasRealizadas != null ? Number(itemAmostra.visitasRealizadas) : 0,
              percentualVisitas: itemAmostra.percentualVisitas || '',
            },
          }
        }
      }

      record.set('status', 'preview')
      record.set('error_code', null)
      record.set('total_informado', totalDetectado)
      record.set('paginas_total', paginasTotal)
      if (amostraEstrutura) {
        record.set('amostra_estrutura_json', amostraEstrutura)
      }
      record.set('paginas_processadas', 0)
      record.set('registros_lidos', 0)
      record.set('registros_validos', 0)
      record.set('registros_rejeitados', 0)
      record.set('registros_deduplicados', 0)
      record.set('registros_consolidados', 0)

      let previewMsg = ''
      if (totalDetectado === 0 && paginasTotal === 0 && itensRetornados === 0) {
        previewMsg = 'Nenhum registro de visitas encontrado para o período.'
      } else {
        previewMsg =
          'Prévia carregada: ' +
          totalDetectado +
          ' registros de promotores em ' +
          paginasTotal +
          ' páginas.'
      }

      record.set('message', previewMsg)
      record.set('finished_at', new Date().toISOString())
      $app.save(record)
      return
    }

    if (statusCode === 204) {
      record.set('status', 'preview')
      record.set('error_code', null)
      record.set('total_informado', 0)
      record.set('paginas_total', 0)
      record.set('paginas_processadas', 0)
      record.set('registros_lidos', 0)
      record.set('registros_validos', 0)
      record.set('registros_rejeitados', 0)
      record.set('registros_deduplicados', 0)
      record.set('registros_consolidados', 0)
      record.set('message', 'Nenhum registro de visitas no período (HTTP 204).')
      record.set('finished_at', new Date().toISOString())
      $app.save(record)
      return
    }

    // Tratamento de falhas HTTP
    record.set('status', 'error')
    record.set('total_informado', 0)
    record.set('paginas_total', 0)
    record.set('finished_at', new Date().toISOString())

    if (statusCode === 401) {
      record.set('error_code', 'unauthorized')
      record.set(
        'message',
        sanitizeErrorMessage(rawBodyText, 'Token inválido ou autenticação recusada.'),
      )
    } else if (statusCode === 403) {
      record.set('error_code', 'forbidden')
      record.set(
        'message',
        sanitizeErrorMessage(rawBodyText, 'Usuário sem permissão para acessar o recurso.'),
      )
    } else if (statusCode === 429) {
      record.set('error_code', 'rate_limited')
      record.set(
        'message',
        sanitizeErrorMessage(
          rawBodyText,
          'Limite de requisições excedido no TradePro. Tente novamente em instantes.',
        ),
      )
    } else if (statusCode >= 500) {
      record.set('error_code', 'tradepro_unavailable')
      record.set(
        'message',
        sanitizeErrorMessage(rawBodyText, 'Serviço TradePro indisponível no momento.'),
      )
    } else {
      record.set('error_code', 'internal_error')
      record.set(
        'message',
        sanitizeErrorMessage(
          rawBodyText,
          'Falha na resposta do servidor TradePro (HTTP ' + statusCode + ').',
        ),
      )
    }

    $app.save(record)
  }
}, 'tradepro_sync_jobs')

// ---------------------------------------------------------------------------
// FASE B — SINCRONIZAÇÃO PAGINADA (Rupturas ou Validades)
// Disparado quando o status do registro muda para 'syncing'
// ---------------------------------------------------------------------------
onRecordAfterUpdateSuccess((e) => {
  const record = e.record
  if (!record || record.collection().name !== 'tradepro_sync_jobs') {
    return
  }

  const action = record.getString('action')
  const status = record.getString('status')

  if (action === 'sync_rupturas' && status === 'syncing') {
    // =========================================================================
    // BLOCO RUPTURAS — SINCRONIZAÇÃO PAGINADA
    // =========================================================================

    // Proteção anti-recursão:
    // Só inicia processamento quando a transição é DE 'pending', 'preview', 'error' ou 'paused' PARA 'syncing'.
    // Se o status original já era 'syncing', o update foi apenas de progresso pelo $app.save(record).
    try {
      const originalStatus = record.original() ? record.original().getString('status') : ''
      if (originalStatus === 'syncing') {
        return
      }
    } catch (_) {}

    const rawToken = $os.getenv('TRADEPRO_BASIC_TOKEN') || ''
    if (!rawToken.trim()) {
      record.set('status', 'error')
      record.set('error_code', 'not_configured')
      record.set('message', 'Token de autenticação TradePro não configurado.')
      record.set('finished_at', new Date().toISOString())
      $app.save(record)
      return
    }

    const trimmedToken = rawToken.trim()
    const authHeader = trimmedToken.startsWith('Basic ') ? trimmedToken : 'Basic ' + trimmedToken
    const toTradeProDate = (isoDate) => isoDate.replace(/-/g, '')

    const dateStart = record.getString('date_start').split(' ')[0].split('T')[0]
    const dateEnd = record.getString('date_end').split(' ')[0].split('T')[0]
    const requestedBy = record.getString('requested_by')
    const jobId = record.id

    const totalInformado = record.getInt('total_informado') || 0
    const paginasTotal = record.getInt('paginas_total') || Math.ceil(totalInformado / 30) || 1
    let paginaInicial = record.getInt('paginas_processadas') || 0
    if (paginaInicial < 1) paginaInicial = 1
    else paginaInicial = paginaInicial + 1 // retoma da próxima se já processou páginas

    // Se o total é zero
    if (totalInformado === 0) {
      record.set('status', 'success')
      record.set('registros_consolidados', 0)
      record.set('message', 'Nenhum registro a ser sincronizado.')
      record.set('finished_at', new Date().toISOString())
      $app.save(record)
      return
    }

    // Carrega indústrias cadastradas para mapear tradepro_client_id -> industry_id e nome canônico
    const industryMapByClientId = {}
    try {
      const allIndustries = $app.findRecordsByFilter(
        'industry_registry',
        'id != ""',
        'nome',
        1000,
        0,
      )
      if (allIndustries && allIndustries.length > 0) {
        for (let indIdx = 0; indIdx < allIndustries.length; indIdx++) {
          const indRec = allIndustries[indIdx]
          const tId = (indRec.getString('tradepro_client_id') || '').trim()
          if (tId) {
            industryMapByClientId[tId] = {
              id: indRec.id,
              nome: indRec.getString('nome'),
              tradepro_client_id: tId,
              tradepro_client_name: indRec.getString('tradepro_client_name'),
            }
          }
        }
      }
    } catch (indErr) {
      console.log(
        '[tradepro_sync] Aviso: falha ao carregar industry_registry em rupturas: ' + indErr,
      )
    }

    // Sanitizador recursivo de payloads de itens da API TradePro
    // Remove apenas chaves sensíveis (case-insensitive: token, authorization, password, senha, secret, cookie, header)
    const isSensitivePayloadKey = (k) => {
      if (!k || typeof k !== 'string') return false
      const lower = k.toLowerCase()
      return (
        lower.indexOf('token') !== -1 ||
        lower.indexOf('authorization') !== -1 ||
        lower.indexOf('password') !== -1 ||
        lower.indexOf('senha') !== -1 ||
        lower.indexOf('secret') !== -1 ||
        lower.indexOf('cookie') !== -1 ||
        lower.indexOf('header') !== -1
      )
    }

    const sanitizePayloadRecursive = (val) => {
      if (val === null || val === undefined) return val
      if (Array.isArray(val)) {
        return val.map((elem) => sanitizePayloadRecursive(elem))
      }
      if (typeof val === 'object') {
        const out = {}
        const keys = Object.keys(val)
        for (let kIdx = 0; kIdx < keys.length; kIdx++) {
          const k = keys[kIdx]
          if (isSensitivePayloadKey(k)) {
            continue
          }
          out[k] = sanitizePayloadRecursive(val[k])
        }
        return out
      }
      return val
    }

    // Helpers de pipeline de Rupturas inline
    const normalizeRupturaMotivo = (motivo) => {
      const m = (motivo || '')
        .trim()
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
      if (m.indexOf('RUPTURA TOTAL') !== -1) return 'Ruptura Total'
      if (
        m.indexOf('ZERADO') !== -1 ||
        m.indexOf('SEM ESTOQUE MINIMO') !== -1 ||
        m.indexOf('SEM ESTOQUE MÍNIMO') !== -1
      ) {
        return 'Sem Estoque Mínimo'
      }
      if (m.indexOf('ESTOQUE VIRTUAL') !== -1) return 'Estoque Virtual'
      return 'Ruptura Total'
    }

    const extractStoreCode = (razaoSocial) => {
      const rs = (razaoSocial || '').trim()
      if (!rs) return ''
      const m = rs.match(/^(\d+)/)
      if (m) return m[1]
      const m2 = rs.match(/^([^-–]+?)[\s]*[-–]/)
      if (m2) return m2[1].trim()
      return ''
    }

    const sanitizeErrorMessage = (rawText, defaultMsg) => {
      let extracted = ''
      try {
        let json = null
        if (rawText) json = JSON.parse(rawText)
        if (json && typeof json === 'object') {
          const candidate =
            json.message ||
            json.mensagem ||
            json.error ||
            json.detail ||
            json.title ||
            json.details ||
            ''
          if (typeof candidate === 'string' && candidate.trim()) extracted = candidate.trim()
        }
      } catch (_) {}

      if (!extracted && rawText && typeof rawText === 'string') {
        const trimmed = rawText.trim()
        if (
          trimmed.length > 0 &&
          trimmed.length <= 300 &&
          !trimmed.startsWith('<html') &&
          !trimmed.startsWith('<!DOCTYPE')
        ) {
          extracted = trimmed
        }
      }

      if (!extracted) extracted = defaultMsg

      let clean = extracted
        .replace(/Authorization:\s*[^\s,;]+/gi, '')
        .replace(/Basic\s+[A-Za-z0-9+/=]+/gi, '')
        .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, '')
        .replace(/token[=:\s]+[A-Za-z0-9\-._~+/]+/gi, '')
        .replace(/password[=:\s]+[^\s,;]+/gi, '')
        .replace(/senha[=:\s]+[^\s,;]+/gi, '')
        .replace(/https?:\/\/[^\s?#]+(\?[^\s#]*)?/gi, '[URL]')
        .replace(/cookie[=:\s]+[^\s,;]+/gi, '')
        .replace(/[A-Za-z0-9+/=]{40,}/g, '')
        .replace(/\s+/g, ' ')
        .trim()

      if (!clean) clean = defaultMsg
      if (clean.length > 300) clean = clean.substring(0, 300)
      return clean
    }

    const rupturasBaseCol = $app.findCollectionByNameOrId('rupturas_base')

    let registrosLidos = record.getInt('registros_lidos') || 0
    let registrosValidos = record.getInt('registros_validos') || 0
    let registrosRejeitados = record.getInt('registros_rejeitados') || 0

    // Se paginaInicial > paginasTotal, significa que todas as páginas já foram baixadas para staging.
    // Pula o loop e vai direto para a validação e promoção.
    if (paginaInicial <= paginasTotal) {
      // Loop paginado sequencial com retry autônomo (5s, 15s, 30s, 30s, 30s)
      for (let pagina = paginaInicial; pagina <= paginasTotal; pagina++) {
        // Verifica se o job foi cancelado pelo frontend entre as páginas
        try {
          const checkRecord = $app.findRecordById('tradepro_sync_jobs', jobId)
          if (checkRecord.getString('status') === 'cancelled') {
            return // interrompe processamento
          }
        } catch (_) {}

        const pageUrl =
          'https://diretoria.tradepro.com.br/diretoria/servicos/v1/relatorio-rupturas/' +
          toTradeProDate(dateStart) +
          '/' +
          toTradeProDate(dateEnd) +
          '?paginaAtual=' +
          pagina +
          '&quantidadePorPagina=30&agruparUltimaColetaDoProdutoDoMesmoCliente=1'

        let res = null
        let sendError = null
        let statusCode = 0
        let rawBodyText = ''
        const maxAttempts = 5
        const retryDelaysMs = [5000, 15000, 30000, 30000, 30000]

        // Per-page retry loop com backoff progressivo
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          sendError = null
          res = null

          try {
            res = $http.send({
              url: pageUrl,
              method: 'GET',
              headers: {
                Authorization: authHeader,
                Accept: 'application/json',
              },
              timeout: 20,
            })
          } catch (err) {
            sendError = err
          }

          statusCode = res ? res.statusCode || 0 : 0
          rawBodyText =
            res && typeof res.raw === 'string'
              ? res.raw
              : res && typeof res.body === 'string'
                ? res.body
                : ''

          const isTransient =
            Boolean(sendError) || statusCode === 0 || statusCode === 429 || statusCode >= 500

          if (!isTransient) {
            // Sucesso (200, 204) ou erro fatal cliente (401, 403, 412, etc.)
            break
          }

          // Se for transitório e ainda tiver tentativas restantes, faz sleep e atualiza status
          if (attempt < maxAttempts) {
            const waitTime = retryDelaysMs[attempt - 1] || 30000
            const concluidas = Math.max(0, pagina - 1)
            record.set(
              'message',
              'Aguardando liberação do TradePro. ' +
                concluidas +
                ' páginas concluídas. ' +
                registrosValidos +
                ' registros preservados. Tentativa automática ' +
                (attempt + 1) +
                ' de 5...',
            )
            $app.save(record)

            try {
              sleep(waitTime)
            } catch (_) {}
          }
        }

        // Se após até 5 tentativas ainda houver falha transitória
        if (sendError || statusCode === 0) {
          record.set('status', 'paused')
          record.set('error_code', 'timeout')
          record.set(
            'message',
            'Tempo limite esgotado após 5 tentativas na página ' +
              pagina +
              ' de ' +
              paginasTotal +
              '. Job pausado com staging preservado. Clique em Retomar para continuar.',
          )
          $app.save(record)
          return
        }

        if (statusCode === 401) {
          record.set('status', 'error')
          record.set('error_code', 'unauthorized')
          record.set(
            'message',
            sanitizeErrorMessage(rawBodyText, 'Autenticação recusada pelo TradePro.'),
          )
          record.set('finished_at', new Date().toISOString())
          $app.save(record)
          return
        }

        if (statusCode === 403) {
          record.set('status', 'error')
          record.set('error_code', 'forbidden')
          record.set(
            'message',
            sanitizeErrorMessage(
              rawBodyText,
              'Acesso não autorizado aos dados da página ' + pagina + '.',
            ),
          )
          record.set('finished_at', new Date().toISOString())
          $app.save(record)
          return
        }

        if (statusCode === 412) {
          record.set('status', 'error')
          record.set('error_code', 'precondition_failed')
          record.set(
            'message',
            sanitizeErrorMessage(
              rawBodyText,
              'Pré-condição recusada na página ' + pagina + ' (HTTP 412).',
            ),
          )
          record.set('finished_at', new Date().toISOString())
          $app.save(record)
          return
        }

        if (statusCode === 429) {
          record.set('status', 'paused')
          record.set('error_code', 'rate_limited')
          record.set(
            'message',
            'Limite de requisições mantido após 5 tentativas na página ' +
              pagina +
              ' de ' +
              paginasTotal +
              '. Staging preservado. Clique em Retomar para continuar.',
          )
          $app.save(record)
          return
        }

        if (statusCode >= 500) {
          record.set('status', 'paused')
          record.set('error_code', 'tradepro_unavailable')
          record.set(
            'message',
            'Servidor TradePro indisponível após 5 tentativas na página ' +
              pagina +
              ' de ' +
              paginasTotal +
              ' (HTTP ' +
              statusCode +
              '). Staging preservado. Clique em Retomar para continuar.',
          )
          $app.save(record)
          return
        }

        if (statusCode !== 200 && statusCode !== 204) {
          record.set('status', 'error')
          record.set('error_code', 'internal_error')
          record.set(
            'message',
            sanitizeErrorMessage(
              rawBodyText,
              'Falha inesperada ao processar página ' + pagina + ' (HTTP ' + statusCode + ').',
            ),
          )
          record.set('finished_at', new Date().toISOString())
          $app.save(record)
          return
        }

        // Processamento dos itens da página
        let jsonBody = null
        try {
          jsonBody = res.json
        } catch (_) {}

        const itens =
          jsonBody && Array.isArray(jsonBody.rupturas)
            ? jsonBody.rupturas
            : jsonBody && Array.isArray(jsonBody.data)
              ? jsonBody.data
              : []

        registrosLidos += itens.length

        for (let i = 0; i < itens.length; i++) {
          const item = itens[i]
          if (!item) continue

          const rawProduto = item.descricaoAtividade || item.produto || ''
          const rawRazaoSocial = item.razaoSocialCliente || item.nome_loja || ''
          const rawDataVisita = (item.dataVisita || '').split(' ')[0].split('T')[0]
          const rawMotivo = item.descricaoMotivo || item.motivo || ''

          if (!rawProduto || !rawRazaoSocial || !rawDataVisita || !rawMotivo) {
            registrosRejeitados++
            continue
          }

          registrosValidos++
          const codigoLoja = extractStoreCode(rawRazaoSocial)
          const motivoNormalizado = normalizeRupturaMotivo(rawMotivo)
          // Preserva semântica bruta da fonte
          const rawFantasia = (item.fantasiaCliente || '').toString().trim()
          const rawClienteNome = (item.cliente || '').toString().trim()
          const rawCodigoCliente = (item.codigoCliente || item.codigo_cliente || '')
            .toString()
            .trim()

          // Preservação de identificadores fortes adicionais de Rupturas
          const rawIdPromotor = (item.idPromotor != null ? String(item.idPromotor) : '').trim()
          const rawNomePromotor = (item.nomePromotor || item.colaborador || '').toString().trim()
          const rawIdSupervisor = (
            item.idSupervisor != null ? String(item.idSupervisor) : ''
          ).trim()
          const rawNomeSupervisor = (item.nomeSupervisor || '').toString().trim()
          const rawIdCliente = (item.idCliente != null ? String(item.idCliente) : '').trim()
          const rawIdAtividade = (item.idAtividade != null ? String(item.idAtividade) : '').trim()
          const rawIdAtividadeRuptura = (
            item.idAtividadeRuptura != null ? String(item.idAtividadeRuptura) : ''
          ).trim()
          const rawStatusRoteiro = (item.statusRoteiro || '').toString().trim()
          const rawIdRoteiroPadrao = (
            item.idRoteiroPadrao != null ? String(item.idRoteiroPadrao) : ''
          ).trim()
          const rawDescricaoRoteiroPadrao = (item.descricaoRoteiroPadrao || '').toString().trim()
          const rawHoraInicioRoteiro = (item.horaInicioExecucaoRoteiro || '').toString().trim()
          const rawHoraFinalRoteiro = (item.horaFinalExecucaoRoteiro || '').toString().trim()
          const rawDataHoraExecucao = (item.dataHoraExecucaoAtividade || '').toString().trim()
          const rawCnpjFornecedor = (item.cnpjFornecedor || '').toString().trim()
          const rawDescricaoFornecedor = (item.descricaoFornecedor || '').toString().trim()
          const rawCodigoFamilia = (
            item.codigoFamilia != null ? String(item.codigoFamilia) : ''
          ).trim()
          const rawDescricaoFamilia = (item.descricaoFamilia || '').toString().trim()

          // SEMÂNTICA COMPROVADA E FIXADA DE RUPTURAS:
          // Em Rupturas TradePro, codigoCliente é o código da LOJA (ex: "165").
          // codigoCliente NUNCA resolve Indústria, NUNCA busca industryMapByClientId, NUNCA gera pendência de indústria!
          // Indústria em Rupturas só é resolvida via Produto Mestre (industry_product_mix).
          let resolvedIndustryName = ''
          let resolvedIndustryId = ''

          // Resolução de Loja no cadastro mestre
          let storeDbId = ''
          if (codigoLoja) {
            try {
              const stList = $app.findRecordsByFilter(
                'stores',
                'codigo_externo = "' +
                  codigoLoja.replace(/"/g, '\\"') +
                  '" || codigo_loja = "' +
                  codigoLoja.replace(/"/g, '\\"') +
                  '"',
                '-created',
                1,
                0,
              )
              if (stList && stList.length > 0) {
                storeDbId = stList[0].id
              }
            } catch (_) {}
          }

          // Resolução de Promotor no cadastro mestre
          let promoterDbId = ''
          if (rawIdPromotor) {
            try {
              const pList = $app.findRecordsByFilter(
                'promoters',
                'codigo_externo = "' + rawIdPromotor.replace(/"/g, '\\"') + '"',
                '-created',
                1,
                0,
              )
              if (pList && pList.length > 0) {
                promoterDbId = pList[0].id
              }
            } catch (_) {}
          }

          // Resolução de Supervisor no cadastro mestre
          let supervisorDbId = ''
          if (rawIdSupervisor) {
            try {
              const sList = $app.findRecordsByFilter(
                'supervisors',
                'codigo_externo = "' + rawIdSupervisor.replace(/"/g, '\\"') + '"',
                '-created',
                1,
                0,
              )
              if (sList && sList.length > 0) {
                supervisorDbId = sList[0].id
              }
            } catch (_) {}
          }

          // Resolução de Produto no cadastro mestre
          let productDbId = ''
          if (rawProduto) {
            try {
              const prList = $app.findRecordsByFilter(
                'industry_product_mix',
                'nome_produto = "' + rawProduto.replace(/"/g, '\\"') + '"',
                '-created',
                1,
                0,
              )
              if (prList && prList.length > 0) {
                const matchedPr = prList[0]
                productDbId = matchedPr.id
                // Indústria em Rupturas obtida via Produto Mestre único
                const prodIndId = (matchedPr.getString('industry_id') || '').trim()
                if (prodIndId) {
                  resolvedIndustryId = prodIndId
                  resolvedIndustryName = (matchedPr.getString('industry_name') || '').trim()
                }
              }
            } catch (_) {}
          }

          const industriaNormalizada = resolvedIndustryName || 'Não identificada'
          // Rede real vem de fantasiaCliente (ou item.redeCliente se fornecido)
          const redeReal = rawFantasia || (item.redeCliente || '').toString().trim()

          // Status factual de normalização: completo só quando as relações obrigatórias estão realmente resolvidas
          // para serem persistidas no registro: productDbId, storeDbId (e promotor/supervisor se fornecidos)
          const isComplete = Boolean(
            storeDbId &&
            productDbId &&
            resolvedIndustryId &&
            (rawIdPromotor ? promoterDbId : true) &&
            (rawIdSupervisor ? supervisorDbId : true),
          )
          const statusNormalizacao = isComplete ? 'completo' : 'parcial'

          // Deduplicação determinística refinada:
          // Se houver idAtividadeRuptura ou idAtividade, usa identificador externo exclusivo
          // Caso contrário, combina loja + produto + dataVisita + idPromotor + motivo
          const eventoIdExterno = rawIdAtividadeRuptura || rawIdAtividade
          const dedupKey = eventoIdExterno
            ? 'ext_' + eventoIdExterno
            : [
                codigoLoja,
                rawProduto,
                industriaNormalizada,
                rawDataVisita,
                rawIdPromotor,
                motivoNormalizado,
              ].join('|')
          const operationalKey = codigoLoja + '|' + rawProduto + '|' + rawDataVisita

          // Item 1: dados_brutos_json como item original completo com sanitização recursiva de chaves sensíveis
          const sanitizedRawPayload = sanitizePayloadRecursive(item)

          const rupRecord = new Record(rupturasBaseCol)
          rupRecord.set('produto', rawProduto)
          rupRecord.set('motivo', motivoNormalizado)
          rupRecord.set('codigo_loja', codigoLoja)
          rupRecord.set('nome_loja', rawRazaoSocial)
          rupRecord.set('razao_social', rawRazaoSocial)
          rupRecord.set('rede', redeReal)
          rupRecord.set('fantasia', rawFantasia)
          rupRecord.set('tradepro_cliente_nome', rawClienteNome || rawFantasia)
          rupRecord.set('cnpj_loja', item.cpfCnpjCliente || item.cnpj_loja || '')
          rupRecord.set('cidade', item.cidadeCliente || item.cidade || '')
          rupRecord.set('estado', item.siglaEstadoCliente || item.estado || '')
          rupRecord.set('codigo_cliente', rawCodigoCliente)
          rupRecord.set('cliente', industriaNormalizada)
          rupRecord.set('colaborador', rawNomePromotor)
          rupRecord.set('categoria', item.descricaoCategoria || item.categoria || '')
          rupRecord.set('observacao', item.observacaoRuptura || item.observacao || '')
          rupRecord.set('data_visita', rawDataVisita)
          rupRecord.set('data_entrada', rawDataVisita)
          rupRecord.set('ultima_aparicao', rawDataVisita)
          rupRecord.set('situacao_atual', 'Ativo')
          rupRecord.set('operational_key', operationalKey)
          rupRecord.set('dedup_key', dedupKey)
          rupRecord.set('source_row', i + 1 + (pagina - 1) * 30)
          rupRecord.set('is_base_atual', false) // staging durante a sincronização
          if (requestedBy) {
            rupRecord.set('created_by', requestedBy)
          }
          // Armazena tenant_id com marcador do job para promoção atômica segura
          rupRecord.set('tenant_id', 'tradepro_job_' + jobId)

          // Campos explícitos do Bloco B.1
          rupRecord.set('source_type', 'tradepro_api')
          rupRecord.set('source_job_id', jobId)
          rupRecord.set('source_endpoint', 'relatorio-rupturas')
          rupRecord.set('source_synced_at', new Date().toISOString())
          rupRecord.set('dados_brutos_json', sanitizedRawPayload)
          rupRecord.set('status_normalizacao', statusNormalizacao)

          // IDs externos da fonte preservados
          rupRecord.set('id_promotor', rawIdPromotor)
          rupRecord.set('id_supervisor', rawIdSupervisor)
          rupRecord.set('nome_supervisor', rawNomeSupervisor)
          rupRecord.set('id_cliente', rawIdCliente)
          rupRecord.set('id_atividade', rawIdAtividade)
          rupRecord.set('id_atividade_ruptura', rawIdAtividadeRuptura)
          rupRecord.set('status_roteiro', rawStatusRoteiro)
          rupRecord.set('id_roteiro_padrao', rawIdRoteiroPadrao)
          rupRecord.set('descricao_roteiro_padrao', rawDescricaoRoteiroPadrao)
          rupRecord.set('hora_inicio_execucao_roteiro', rawHoraInicioRoteiro)
          rupRecord.set('hora_final_execucao_roteiro', rawHoraFinalRoteiro)
          rupRecord.set('data_hora_execucao_atividade', rawDataHoraExecucao)
          rupRecord.set('cnpj_fornecedor', rawCnpjFornecedor)
          rupRecord.set('descricao_fornecedor', rawDescricaoFornecedor)
          rupRecord.set('codigo_familia', rawCodigoFamilia)
          rupRecord.set('descricao_familia', rawDescricaoFamilia)

          // Item 2: Persistir relações mestres no evento (migração 0048)
          if (resolvedIndustryId) rupRecord.set('industry_id', resolvedIndustryId)
          if (storeDbId) rupRecord.set('store_id', storeDbId)
          if (productDbId) rupRecord.set('product_id', productDbId)
          if (promoterDbId) rupRecord.set('promoter_id', promoterDbId)
          if (supervisorDbId) rupRecord.set('supervisor_id', supervisorDbId)

          try {
            $app.save(rupRecord)

            // Vínculo Promotor -> Loja via Ruptura gera 'observado_operacao' (NUNCA observado_visita nem confirmado)
            if (rawIdPromotor && codigoLoja && promoterDbId) {
              try {
                const assignCol = $app.findCollectionByNameOrId('store_promoter_assignments')
                if (assignCol) {
                  const assignFilter =
                    'promoter_id = "' +
                    promoterDbId +
                    '" && store_code = "' +
                    codigoLoja.replace(/"/g, '\\"') +
                    '" && status = "ativo"'
                  const existingAssigns = $app.findRecordsByFilter(
                    'store_promoter_assignments',
                    assignFilter,
                    '-created',
                    1,
                    0,
                  )

                  if (existingAssigns && existingAssigns.length > 0) {
                    const existingAss = existingAssigns[0]
                    // Se o vínculo já é confirmado, NUNCA rebaixa nem sobrescreve observação manual!
                    existingAss.set(
                      'ultima_observacao_fonte',
                      'Ruptura registrada em ' + rawDataVisita + ' (Job ' + jobId + ')',
                    )
                    $app.save(existingAss)
                  } else {
                    const newAss = new Record(assignCol)
                    newAss.set('promoter_id', promoterDbId)
                    newAss.set('promoter_nome', rawNomePromotor)
                    newAss.set('store_code', codigoLoja)
                    newAss.set('store_name', rawRazaoSocial)
                    if (storeDbId) newAss.set('store_id', storeDbId)
                    if (resolvedIndustryId) {
                      newAss.set('industry_id', resolvedIndustryId)
                      newAss.set('industry_name', resolvedIndustryName)
                    }
                    newAss.set('status', 'ativo')
                    newAss.set('tipo_vinculo', 'observado_operacao') // estritamente observado_operacao
                    newAss.set('origem_vinculo', 'Ruptura registrada em ' + rawDataVisita)
                    newAss.set('data_inicio', rawDataVisita)
                    newAss.set(
                      'ultima_observacao_fonte',
                      'Atividade operacional de Ruptura (Job ' + jobId + ')',
                    )
                    $app.save(newAss)
                  }
                }
              } catch (_) {}
            }

            // Item 3: Pendências idempotentes
            // codigoCliente em Rupturas é Loja (NUNCA gera pendência de indústria).
            // Apenas Loja, Promotor e Supervisor não resolvidos geram pendência se ausentes.
            if (codigoLoja && !storeDbId) {
              try {
                const pendCol = $app.findCollectionByNameOrId('cadastros_pendencias')
                if (pendCol) {
                  const pendFilter =
                    'tipo_entidade = "loja" && valor_identificador = "' +
                    codigoLoja.replace(/"/g, '\\"') +
                    '" && status = "pendente"'
                  const existingPend = $app.findRecordsByFilter(
                    'cadastros_pendencias',
                    pendFilter,
                    '-created',
                    1,
                    0,
                  )
                  if (!existingPend || existingPend.length === 0) {
                    const pRec = new Record(pendCol)
                    pRec.set('tipo_entidade', 'loja')
                    pRec.set('valor_identificador', codigoLoja)
                    pRec.set('codigo_externo', codigoLoja)
                    pRec.set('nome_identificado', rawRazaoSocial)
                    pRec.set('origem_fonte', 'tradepro_api_rupturas')
                    pRec.set('status', 'pendente')
                    pRec.set('volume_ocorrencias', 1)
                    pRec.set('contexto_adicional', {
                      razaoSocial: rawRazaoSocial,
                      fantasia: rawFantasia,
                    })
                    $app.save(pRec)
                  }
                }
              } catch (_) {}
            }

            if (rawIdPromotor && !promoterDbId) {
              try {
                const pendCol = $app.findCollectionByNameOrId('cadastros_pendencias')
                if (pendCol) {
                  const pendFilter =
                    'tipo_entidade = "promotor" && valor_identificador = "' +
                    rawIdPromotor.replace(/"/g, '\\"') +
                    '" && status = "pendente"'
                  const existingPend = $app.findRecordsByFilter(
                    'cadastros_pendencias',
                    pendFilter,
                    '-created',
                    1,
                    0,
                  )
                  if (!existingPend || existingPend.length === 0) {
                    const pRec = new Record(pendCol)
                    pRec.set('tipo_entidade', 'promotor')
                    pRec.set('valor_identificador', rawIdPromotor)
                    pRec.set('codigo_externo', rawIdPromotor)
                    pRec.set('nome_identificado', rawNomePromotor)
                    pRec.set('origem_fonte', 'tradepro_api_rupturas')
                    pRec.set('status', 'pendente')
                    pRec.set('volume_ocorrencias', 1)
                    $app.save(pRec)
                  }
                }
              } catch (_) {}
            }

            if (rawIdSupervisor && !supervisorDbId) {
              try {
                const pendCol = $app.findCollectionByNameOrId('cadastros_pendencias')
                if (pendCol) {
                  const pendFilter =
                    'tipo_entidade = "supervisor" && valor_identificador = "' +
                    rawIdSupervisor.replace(/"/g, '\\"') +
                    '" && status = "pendente"'
                  const existingPend = $app.findRecordsByFilter(
                    'cadastros_pendencias',
                    pendFilter,
                    '-created',
                    1,
                    0,
                  )
                  if (!existingPend || existingPend.length === 0) {
                    const pRec = new Record(pendCol)
                    pRec.set('tipo_entidade', 'supervisor')
                    pRec.set('valor_identificador', rawIdSupervisor)
                    pRec.set('codigo_externo', rawIdSupervisor)
                    pRec.set('nome_identificado', rawNomeSupervisor)
                    pRec.set('origem_fonte', 'tradepro_api_rupturas')
                    pRec.set('status', 'pendente')
                    pRec.set('volume_ocorrencias', 1)
                    $app.save(pRec)
                  }
                }
              } catch (_) {}
            }
          } catch (saveErr) {
            // se falhar gravação individual, incrementa rejeitados e prossegue
            registrosRejeitados++
          }
        }

        // Atualiza progresso no job após cada página (anti-recursão protege o loop)
        record.set('paginas_processadas', pagina)
        record.set('registros_lidos', registrosLidos)
        record.set('registros_validos', registrosValidos)
        record.set('registros_rejeitados', registrosRejeitados)
        $app.save(record)
      }
    }

    // ---------------------------------------------------------------------------
    // VALIDAÇÃO E PROMOÇÃO DO STAGING PARA A BASE ATUAL (TRANSAÇÃO ATÔMICA)
    // Só executa após TODAS as páginas terem sido concluídas.
    // Se qualquer validação falhar, NUNCA desativa a Base Atual anterior e marca erro.
    // ---------------------------------------------------------------------------
    try {
      // 6a. Contar staging do job de forma segura via findRecordsByFilter
      const stagingJobTenant = 'tradepro_job_' + jobId
      const stagingFilter = 'tenant_id = "' + stagingJobTenant + '"'
      const stagingRecords = $app.findRecordsByFilter(
        'rupturas_base',
        stagingFilter,
        '-created',
        100000,
        0,
      )
      const countStaging = stagingRecords ? stagingRecords.length : 0

      // 6b. Validar totais do staging
      if (countStaging === 0 && totalInformado > 0) {
        throw new Error('Nenhum registro encontrado no staging para promoção.')
      }

      // 6c & 6d. Deduplicação e normalização já foram executadas na inserção do staging

      // 6e. Promoção Atômica:
      // Executa em transação única atômica (runInTransaction):
      // 1) Desativa a base atual anterior (todos os registros com is_base_atual = 1 cujo tenant_id != jobTenant)
      // 2) Ativa os registros do staging deste job (is_base_atual = 1 WHERE tenant_id = jobTenant)
      $app.runInTransaction((txApp) => {
        txApp
          .db()
          .newQuery(
            'UPDATE rupturas_base SET is_base_atual = 0 WHERE is_base_atual = 1 AND tenant_id != {:jobTenant}',
          )
          .bind({ jobTenant: stagingJobTenant })
          .execute()

        txApp
          .db()
          .newQuery('UPDATE rupturas_base SET is_base_atual = 1 WHERE tenant_id = {:jobTenant}')
          .bind({ jobTenant: stagingJobTenant })
          .execute()
      })

      // Contagem segura dos registros promovidos
      const promovidosRecords = $app.findRecordsByFilter(
        'rupturas_base',
        'is_base_atual = true && tenant_id = "' + stagingJobTenant + '"',
        '-created',
        100000,
        0,
      )
      const totalPromovidos = promovidosRecords ? promovidosRecords.length : countStaging

      // Finalizar job com sucesso
      record.set('status', 'success')
      record.set('registros_consolidados', totalPromovidos)
      record.set('registros_deduplicados', Math.max(0, registrosValidos - totalPromovidos))
      record.set(
        'message',
        'Sincronização de Rupturas concluída com sucesso. ' +
          totalPromovidos +
          ' registros consolidados na Base Atual.',
      )
      record.set('error_code', '')
      record.set('finished_at', new Date().toISOString())
      $app.save(record)
    } catch (promoErr) {
      const cleanPromoMsg = sanitizeErrorMessage(
        String(promoErr || ''),
        'Falha na validação ou promoção dos registros para a Base Atual.',
      )
      record.set('status', 'error')
      record.set('error_code', 'internal_error')
      record.set('message', 'Falha na promoção dos registros para a Base Atual: ' + cleanPromoMsg)
      record.set('finished_at', new Date().toISOString())
      $app.save(record)
    }
  } else if (action === 'sync_validades' && status === 'syncing') {
    // =========================================================================
    // BLOCO VALIDADES — SINCRONIZAÇÃO PAGINADA
    // =========================================================================

    // Prevenção estrita anti-recursão: processar apenas se o status ANTERIOR não era 'syncing'
    try {
      const originalStatus = record.original() ? record.original().getString('status') : ''
      if (originalStatus === 'syncing') {
        return
      }
    } catch (_) {}

    const rawToken = $os.getenv('TRADEPRO_BASIC_TOKEN') || ''
    if (!rawToken || rawToken.trim() === '') {
      record.set('status', 'error')
      record.set('error_code', 'not_configured')
      record.set('message', 'Token de autenticação TradePro não configurado.')
      record.set('finished_at', new Date().toISOString())
      $app.save(record)
      return
    }

    const trimmedToken = rawToken.trim()
    const authHeader = trimmedToken.startsWith('Basic ') ? trimmedToken : 'Basic ' + trimmedToken
    const toTradeProDate = (isoDate) => isoDate.replace(/-/g, '')

    const dateStart = record.getString('date_start').split(' ')[0].split('T')[0]
    const dateEnd = record.getString('date_end').split(' ')[0].split('T')[0]
    const jobId = record.id
    const requestedBy = record.getString('requested_by')
    const stagingMarker = 'tradepro_job_' + jobId

    const d1 = new Date(dateStart + 'T00:00:00Z')
    const d2 = new Date(dateEnd + 'T00:00:00Z')
    const diffDays = Math.ceil(Math.abs(d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24))
    if (diffDays > 31) {
      record.set('status', 'error')
      record.set('error_code', 'invalid_period')
      record.set('message', 'O intervalo máximo permitido é de 31 dias.')
      record.set('finished_at', new Date().toISOString())
      $app.save(record)
      return
    }

    // Normalização de string para chave operacional
    const normKey = (s) => {
      return (s || '')
        .toString()
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
    }

    // Função pura para extrair código de loja a partir da razão social
    const extractStoreCode = (razaoSocial) => {
      if (!razaoSocial || typeof razaoSocial !== 'string') return ''
      const trimmed = razaoSocial.trim()
      const numericMatch = trimmed.match(/^(\d+)/)
      if (numericMatch) return numericMatch[1]
      const dashMatch = trimmed.match(/^([A-Za-z0-9]+)\s*[-_]/)
      if (dashMatch) return dashMatch[1].trim()
      return ''
    }

    // Classificação de status operacional por dias para vencimento
    const computeStatusOperacional = (dias) => {
      if (dias < 0) return 'Vencido'
      if (dias < 30) return 'Crítico'
      if (dias < 60) return 'Atenção'
      if (dias < 90) return 'Moderado'
      return 'Normal'
    }

    const sanitizeErrorMessage = (rawText, defaultMsg) => {
      if (!rawText) return defaultMsg
      try {
        const parsed = JSON.parse(rawText)
        if (parsed && typeof parsed === 'object') {
          const candidate =
            parsed.mensagem ||
            parsed.message ||
            parsed.error ||
            parsed.descricao ||
            (Array.isArray(parsed.erros) &&
              parsed.erros[0] &&
              (parsed.erros[0].mensagem || parsed.erros[0].message))
          if (candidate && typeof candidate === 'string') {
            const clean = candidate.trim()
            if (!/secret|key|token|auth|bearer|pass|pwd|header/i.test(clean)) {
              return clean.length > 200 ? clean.substring(0, 197) + '...' : clean
            }
          }
        }
      } catch (_) {}
      const trimmed = rawText.trim()
      if (!/secret|key|token|auth|bearer|pass|pwd|header|<html|<!doctype/i.test(trimmed)) {
        return trimmed.length > 200 ? trimmed.substring(0, 197) + '...' : trimmed
      }
      return defaultMsg
    }

    const validadesBaseCol = $app.findCollectionByNameOrId('validades_base')
    if (!validadesBaseCol) {
      record.set('status', 'error')
      record.set('error_code', 'internal_error')
      record.set('message', 'Coleção validades_base não encontrada.')
      record.set('finished_at', new Date().toISOString())
      $app.save(record)
      return
    }

    // Carrega indústrias cadastradas para mapear tradepro_client_id -> industry_id
    // Cache em memória durante a execução deste job
    const industryMapByClientId = {}
    const industryMapByName = {}
    try {
      const allIndustries = $app.findRecordsByFilter(
        'industry_registry',
        'id != ""',
        'nome',
        1000,
        0,
      )
      if (allIndustries && allIndustries.length > 0) {
        for (let indIdx = 0; indIdx < allIndustries.length; indIdx++) {
          const indRec = allIndustries[indIdx]
          const tId = (indRec.getString('tradepro_client_id') || '').trim()
          const nKey = (indRec.getString('nome_chave') || indRec.getString('nome') || '')
            .trim()
            .toUpperCase()
          if (tId) {
            industryMapByClientId[tId] = {
              id: indRec.id,
              nome: indRec.getString('nome'),
              tradepro_client_id: tId,
              tradepro_client_name: indRec.getString('tradepro_client_name'),
            }
          }
          if (nKey) {
            industryMapByName[nKey] = {
              id: indRec.id,
              nome: indRec.getString('nome'),
              tradepro_client_id: tId,
              tradepro_client_name: indRec.getString('tradepro_client_name'),
            }
          }
        }
      }
    } catch (indErr) {
      console.log('[tradepro_sync] Aviso: falha ao carregar industry_registry: ' + indErr)
    }

    let paginasTotal = record.getInt('paginas_total') || 1
    const startPage = (record.getInt('paginas_processadas') || 0) + 1

    let totalLidos = record.getInt('registros_lidos') || 0
    let totalValidos = record.getInt('registros_validos') || 0
    let totalRejeitados = record.getInt('registros_rejeitados') || 0
    let totalDeduplicados = record.getInt('registros_deduplicados') || 0

    const pageSize = 30
    let isInterrupted = false
    let pauseMessage = ''
    let pauseErrorCode = ''

    for (let pagina = startPage; pagina <= paginasTotal; pagina++) {
      // 1. Verifica se houve solicitação de cancelamento pelo usuário
      try {
        const checkRecord = $app.findRecordById('tradepro_sync_jobs', jobId)
        if (checkRecord && checkRecord.getString('status') === 'cancelled') {
          isInterrupted = true
          pauseMessage = 'Sincronização cancelada pelo usuário.'
          break
        }
      } catch (_) {}

      const pageUrl =
        'https://diretoria.tradepro.com.br/diretoria/servicos/v1/relatorio-validade/' +
        toTradeProDate(dateStart) +
        '/' +
        toTradeProDate(dateEnd) +
        '?paginaAtual=' +
        pagina +
        '&quantidadePorPagina=' +
        pageSize

      let pageRes = null
      let pageErr = null
      let statusCode = 0
      let rawBodyText = ''
      const maxAttemptsValidades = 5
      const retryDelaysValidades = [5000, 15000, 30000, 30000, 30000]

      // Per-page retry loop com backoff progressivo para Validades
      for (let attempt = 1; attempt <= maxAttemptsValidades; attempt++) {
        pageErr = null
        pageRes = null

        try {
          pageRes = $http.send({
            url: pageUrl,
            method: 'GET',
            headers: {
              Authorization: authHeader,
              Accept: 'application/json',
            },
            timeout: 20,
          })
        } catch (err) {
          pageErr = err
        }

        statusCode = pageRes ? pageRes.statusCode || 0 : 0
        rawBodyText =
          pageRes && typeof pageRes.raw === 'string'
            ? pageRes.raw
            : pageRes && typeof pageRes.body === 'string'
              ? pageRes.body
              : JSON.stringify(pageRes ? pageRes.json || {} : {})

        const isTransient =
          Boolean(pageErr) || statusCode === 0 || statusCode === 429 || statusCode >= 500

        if (!isTransient) {
          // 200, 204 ou erro definitivo
          break
        }

        if (attempt < maxAttemptsValidades) {
          const waitTime = retryDelaysValidades[attempt - 1] || 30000
          const concluidas = Math.max(0, pagina - 1)
          record.set(
            'message',
            'Aguardando liberação do TradePro. ' +
              concluidas +
              ' páginas concluídas. ' +
              totalValidos +
              ' registros preservados. Tentativa automática ' +
              (attempt + 1) +
              ' de 5...',
          )
          $app.save(record)

          try {
            sleep(waitTime)
          } catch (_) {}
        }
      }

      if (pageErr || statusCode === 0) {
        const errStr = String(pageErr || '')
        const isTimeout = /timeout|deadline|exceeded|timed out/i.test(errStr) || statusCode === 0
        isInterrupted = true
        pauseErrorCode = isTimeout ? 'timeout' : 'tradepro_unavailable'
        pauseMessage =
          'Tempo limite esgotado após 5 tentativas na página ' +
          pagina +
          ' de ' +
          paginasTotal +
          '. O staging foi preservado. Clique em Retomar para continuar.'
        break
      }

      // HTTP 204: sem mais dados
      if (statusCode === 204) {
        break
      }

      // Tratamento de falhas HTTP na página
      if (statusCode !== 200) {
        isInterrupted = true
        if (statusCode === 401) {
          pauseErrorCode = 'unauthorized'
          pauseMessage = sanitizeErrorMessage(rawBodyText, 'Autenticação recusada pelo TradePro.')
        } else if (statusCode === 403) {
          pauseErrorCode = 'forbidden'
          pauseMessage = sanitizeErrorMessage(
            rawBodyText,
            'Acesso não autorizado aos dados de validades.',
          )
        } else if (statusCode === 412) {
          pauseErrorCode = 'precondition_failed'
          let cleanDetail = ''
          try {
            const parsed412Json =
              typeof pageRes.json === 'object' ? pageRes.json : JSON.parse(rawBodyText)
            if (
              parsed412Json &&
              Array.isArray(parsed412Json.erros) &&
              parsed412Json.erros.length > 0
            ) {
              const items = parsed412Json.erros.slice(0, 5)
              const mapped = items
                .map((errItem) => {
                  const campo = errItem && typeof errItem.campo === 'string' ? errItem.campo : ''
                  const codigo = errItem && typeof errItem.codigo === 'string' ? errItem.codigo : ''
                  const mensagem =
                    errItem && typeof errItem.mensagem === 'string' ? errItem.mensagem : ''
                  if (campo && mensagem) return campo + ': ' + mensagem
                  if (mensagem) return mensagem
                  if (codigo) return 'Código: ' + codigo
                  return ''
                })
                .filter(Boolean)
              if (mapped.length > 0) {
                cleanDetail = ' ' + mapped.join(' | ')
              }
            }
          } catch (_) {}
          pauseMessage =
            sanitizeErrorMessage(
              rawBodyText,
              'Pré-condição recusada na página ' + pagina + ' (HTTP 412).',
            ) + cleanDetail
        } else if (statusCode === 429) {
          pauseErrorCode = 'rate_limited'
          pauseMessage =
            'Limite de requisições mantido após 5 tentativas na página ' +
            pagina +
            '. O job foi pausado com staging preservado. Clique em Retomar para continuar.'
        } else if (statusCode >= 500) {
          pauseErrorCode = 'tradepro_unavailable'
          pauseMessage =
            'Servidor TradePro indisponível após 5 tentativas na página ' +
            pagina +
            ' (HTTP ' +
            statusCode +
            '). O job foi pausado e pode ser retomado.'
        } else {
          pauseErrorCode = 'internal_error'
          pauseMessage =
            'Resposta inesperada na página ' +
            pagina +
            ' (HTTP ' +
            statusCode +
            '): ' +
            sanitizeErrorMessage(rawBodyText, 'Erro no servidor TradePro.')
        }
        break
      }

      // Processar itens retornados
      let validadesList = []
      if (pageRes.json && typeof pageRes.json === 'object') {
        if (Array.isArray(pageRes.json.validade)) {
          validadesList = pageRes.json.validade
        }
        if (pageRes.json.totalDePaginas != null) {
          const pTotal = parseInt(pageRes.json.totalDePaginas, 10)
          if (!isNaN(pTotal) && pTotal > paginasTotal) {
            paginasTotal = pTotal
            record.set('paginas_total', paginasTotal)
          }
        } else if (pageRes.json.quantidadeDePaginas != null) {
          const pTotal = parseInt(pageRes.json.quantidadeDePaginas, 10)
          if (!isNaN(pTotal) && pTotal > paginasTotal) {
            paginasTotal = pTotal
            record.set('paginas_total', paginasTotal)
          }
        }

        // Detecção defensiva de total durante paginação
        let pTotalDetectado = 0
        const prioridadesPaginacao = [
          'totalDeRegistros',
          'totalRegistros',
          'totalDeProdutos',
          'totalProdutos',
          'totalDeValidades',
          'totalValidades',
          'totalDeItens',
          'totalItens',
          'total',
          'quantidadeTotal',
        ]
        for (let pp = 0; pp < prioridadesPaginacao.length; pp++) {
          const candKey = prioridadesPaginacao[pp]
          if (pageRes.json[candKey] != null) {
            const pVal = parseInt(pageRes.json[candKey], 10)
            if (!isNaN(pVal) && pVal > 0) {
              pTotalDetectado = pVal
              break
            }
          }
        }
        if (pTotalDetectado > 0) {
          record.set('total_informado', pTotalDetectado)
        }
      }

      if (validadesList.length === 0) {
        // Página vazia — atingiu o final
        break
      }

      // Gravação dos itens da página no Staging de validades_base
      for (let i = 0; i < validadesList.length; i++) {
        const item = validadesList[i]
        totalLidos++

        if (!item || typeof item !== 'object') {
          totalRejeitados++
          continue
        }

        const promotor = item.promotor && typeof item.promotor === 'object' ? item.promotor : {}
        const cliente = item.cliente && typeof item.cliente === 'object' ? item.cliente : {}
        const cidadeObj = cliente.cidade && typeof cliente.cidade === 'object' ? cliente.cidade : {}
        const estadoObj =
          cidadeObj.estado && typeof cidadeObj.estado === 'object' ? cidadeObj.estado : {}
        const produtoObj = item.produto && typeof item.produto === 'object' ? item.produto : {}

        const rawRazaoSocial = (cliente.razaoSocial || '').toString().trim()
        const rawProduto = (produtoObj.descricao || '').toString().trim()
        const rawValidade = (item.validade || '').toString().trim()
        const rawRealizado = (item.realizado || '').toString().trim()
        const rawFantasia = (cliente.fantasia || '').toString().trim()
        const rawCpfCnpj = (cliente.cpfCnpj || '').toString().trim()
        const rawCidade = (
          typeof cliente.cidade === 'string' ? cliente.cidade : cidadeObj.nome || ''
        )
          .toString()
          .trim()
        const rawEstado = (estadoObj.sigla || '').toString().trim()
        const rawPromotorNome = (promotor.nome || '').toString().trim()
        const rawPromotorId = (promotor.id != null ? String(promotor.id) : '').trim()
        // Cód. Produto preservando zeros à esquerda como texto estrito
        const rawCodProduto = (produtoObj.codigo != null ? String(produtoObj.codigo) : '').trim()

        // Auditoria estrita da regra Cód. Cliente em Validades:
        // Cód. Cliente TradePro -> Indústria.
        // NUNCA utilizar código da unidade/loja (ex: cliente.codigo) como Cód. Cliente da Indústria!
        // No payload de Validades:
        // item.codCliente ou item.cod_cliente ou item.codigoCliente representam a Indústria se presentes.
        // Já cliente.codigo representa o código da LOJA!
        const rawCodCliente = (
          item.codCliente != null
            ? String(item.codCliente)
            : item.cod_cliente != null
              ? String(item.cod_cliente)
              : item.codigoCliente != null
                ? String(item.codigoCliente)
                : ''
        ).trim()

        const rawLojaCodigoUnidade = (cliente.codigo != null ? String(cliente.codigo) : '').trim()

        const rawClienteNome = (
          item.clienteNome != null
            ? String(item.clienteNome)
            : item.cliente_nome != null
              ? String(item.cliente_nome)
              : item.nomeCliente != null
                ? String(item.nomeCliente)
                : ''
        ).trim()

        // Preservação de campos operacionais reais adicionais de Validades
        const rawDataFabricacao = (
          item.fabricacao ||
          item.dataFabricacao ||
          item.data_fabricacao ||
          ''
        )
          .toString()
          .trim()
        const rawNumeroLote = (item.lote || item.numeroLote || item.numero_lote || '')
          .toString()
          .trim()
        const rawRepresentante = (item.representante || '').toString().trim()
        const rawCodigoBarras = (
          item.codigoBarras ||
          item.codigo_barras ||
          item.ean ||
          (produtoObj.codigoBarras ? String(produtoObj.codigoBarras) : '')
        )
          .toString()
          .trim()
        const rawSupervisorId = (
          item.idSupervisor != null
            ? String(item.idSupervisor)
            : promotor.idSupervisor != null
              ? String(promotor.idSupervisor)
              : ''
        ).trim()
        const rawSupervisorNome = (item.nomeSupervisor || promotor.nomeSupervisor || '')
          .toString()
          .trim()

        // Resolução de Indústria SKIP via tradepro_client_id:
        // A chave primária de vínculo é SEMPRE o código (tradepro_client_id)
        let resolvedIndustryId = ''
        let resolvedIndustryName = ''
        if (rawCodCliente && industryMapByClientId[rawCodCliente]) {
          resolvedIndustryId = industryMapByClientId[rawCodCliente].id
          resolvedIndustryName = industryMapByClientId[rawCodCliente].nome
        }

        // Quantidade 0 CONTINUA VÁLIDA: nunca descartar nem tratar como ausente
        const rawQuantidade =
          typeof item.quantidade === 'number'
            ? item.quantidade
            : item.quantidade !== undefined && item.quantidade !== null && item.quantidade !== ''
              ? Number(item.quantidade)
              : 0
        const rawDiasParaVencimento =
          typeof item.diasParaVencimento === 'number'
            ? item.diasParaVencimento
            : Number(item.diasParaVencimento) || 0

        // Validação: campos mínimos essenciais (quantidade 0 é estritamente permitida)
        if (
          !rawRazaoSocial ||
          !rawProduto ||
          !rawValidade ||
          !rawRealizado ||
          isNaN(rawQuantidade) ||
          rawQuantidade < 0
        ) {
          totalRejeitados++
          continue
        }

        const codigoLoja = rawLojaCodigoUnidade || extractStoreCode(rawRazaoSocial)
        // O fornecedor é preservado separadamente e NUNCA substitui nem infere a Indústria
        const fornecedor = (item.fornecedor || 'DIRETORIA').toString().trim()

        // Resolução de Loja mestre
        let storeDbId = ''
        if (codigoLoja) {
          try {
            const stList = $app.findRecordsByFilter(
              'stores',
              'codigo_externo = "' +
                codigoLoja.replace(/"/g, '\\"') +
                '" || codigo_loja = "' +
                codigoLoja.replace(/"/g, '\\"') +
                '"',
              '-created',
              1,
              0,
            )
            if (stList && stList.length > 0) storeDbId = stList[0].id
          } catch (_) {}
        }

        // Resolução de Promotor mestre por cod_colaborador / idPromotor
        let promoterDbId = ''
        if (rawPromotorId) {
          try {
            const prList = $app.findRecordsByFilter(
              'promoters',
              'codigo_externo = "' + rawPromotorId.replace(/"/g, '\\"') + '"',
              '-created',
              1,
              0,
            )
            if (prList && prList.length > 0) promoterDbId = prList[0].id
          } catch (_) {}
        }

        // Resolução de Supervisor mestre por cod_supervisor / idSupervisor
        let supervisorDbId = ''
        if (rawSupervisorId) {
          try {
            const sList = $app.findRecordsByFilter(
              'supervisors',
              'codigo_externo = "' + rawSupervisorId.replace(/"/g, '\\"') + '"',
              '-created',
              1,
              0,
            )
            if (sList && sList.length > 0) supervisorDbId = sList[0].id
          } catch (_) {}
        }

        // Resolução de Produto mestre: Indústria conhecida + Cód. Produto prioritariamente, ou Nome
        let productDbId = ''
        if (resolvedIndustryId) {
          try {
            if (rawCodProduto) {
              const pByCode = $app.findRecordsByFilter(
                'industry_product_mix',
                'industry_id = "' +
                  resolvedIndustryId +
                  '" && codigo_produto = "' +
                  rawCodProduto.replace(/"/g, '\\"') +
                  '"',
                '-created',
                1,
                0,
              )
              if (pByCode && pByCode.length > 0) productDbId = pByCode[0].id
            }
            if (!productDbId && rawProduto) {
              const pByName = $app.findRecordsByFilter(
                'industry_product_mix',
                'industry_id = "' +
                  resolvedIndustryId +
                  '" && nome_produto = "' +
                  rawProduto.replace(/"/g, '\\"') +
                  '"',
                '-created',
                1,
                0,
              )
              if (pByName && pByName.length > 0) productDbId = pByName[0].id
            }
          } catch (_) {}
        }

        // Status factual de normalização: completo só quando relações obrigatórias estão gravadas no registro
        const isComplete = Boolean(
          resolvedIndustryId &&
          storeDbId &&
          productDbId &&
          (rawPromotorId ? promoterDbId : true) &&
          (rawSupervisorId ? supervisorDbId : true),
        )
        const statusNormalizacao = isComplete ? 'completo' : 'parcial'

        // Deduplicação não colapsa ocorrências legítimas distintas
        const chaveOperacional = [
          normKey(fornecedor),
          normKey(rawRazaoSocial),
          normKey(rawProduto),
          rawValidade,
          rawNumeroLote,
        ].join('|')
        const chaveDedup =
          chaveOperacional + '|' + rawRealizado + '|' + rawPromotorId + '|' + String(rawQuantidade)
        const statusOp = computeStatusOperacional(rawDiasParaVencimento)

        // Item 1: dados_brutos_json como item original completo com sanitização recursiva de chaves sensíveis
        // (remove token, authorization, password, senha, secret, cookie, header)
        const isSensitiveKeyVal = (k) => {
          if (!k || typeof k !== 'string') return false
          const lower = k.toLowerCase()
          return (
            lower.indexOf('token') !== -1 ||
            lower.indexOf('authorization') !== -1 ||
            lower.indexOf('password') !== -1 ||
            lower.indexOf('senha') !== -1 ||
            lower.indexOf('secret') !== -1 ||
            lower.indexOf('cookie') !== -1 ||
            lower.indexOf('header') !== -1
          )
        }
        const sanitizePayloadRecursiveVal = (val) => {
          if (val === null || val === undefined) return val
          if (Array.isArray(val)) {
            return val.map((elem) => sanitizePayloadRecursiveVal(elem))
          }
          if (typeof val === 'object') {
            const out = {}
            const keys = Object.keys(val)
            for (let kIdx = 0; kIdx < keys.length; kIdx++) {
              const k = keys[kIdx]
              if (isSensitiveKeyVal(k)) continue
              out[k] = sanitizePayloadRecursiveVal(val[k])
            }
            return out
          }
          return val
        }

        const sanitizedRawValidadePayload = sanitizePayloadRecursiveVal(item)

        try {
          const industriaValidade = resolvedIndustryName || 'Não identificada'
          const redeValidade = rawFantasia || ''

          const valRecord = new Record(validadesBaseCol)
          valRecord.set('fornecedor', fornecedor)
          valRecord.set('razao_social', rawRazaoSocial)
          valRecord.set('produto', rawProduto)
          valRecord.set('cliente', industriaValidade)
          valRecord.set('cod_cliente', rawCodCliente)
          valRecord.set('rede', redeValidade)
          if (resolvedIndustryId) {
            valRecord.set('industry_id', resolvedIndustryId)
          } else {
            valRecord.set('industry_id', '')
          }
          if (storeDbId) {
            valRecord.set('store_id', storeDbId)
          }
          // Item 2: Persistir relações mestres no evento em Validades (migração 0048)
          if (productDbId) {
            valRecord.set('product_id', productDbId)
          }
          if (promoterDbId) {
            valRecord.set('promoter_id', promoterDbId)
          }
          if (supervisorDbId) {
            valRecord.set('supervisor_id', supervisorDbId)
          }

          valRecord.set('fantasia', rawFantasia)
          valRecord.set('codigo_loja', codigoLoja)
          valRecord.set('nome_loja', rawRazaoSocial)
          valRecord.set('cpf_cnpj', rawCpfCnpj)
          valRecord.set('cnpj', rawCpfCnpj)
          valRecord.set('cidade', rawCidade)
          valRecord.set('estado', rawEstado)
          valRecord.set('colaborador', rawPromotorNome)
          valRecord.set('cod_colaborador', rawPromotorId)
          valRecord.set('cod_produto', rawCodProduto)
          valRecord.set('realizado', rawRealizado)
          valRecord.set('validade_original', rawValidade)
          valRecord.set('validade_efetiva', rawValidade)
          valRecord.set('quantidade', rawQuantidade)
          valRecord.set('dias_vencimento_entrada', rawDiasParaVencimento)
          valRecord.set('dias_vencimento_atual', rawDiasParaVencimento)
          valRecord.set('data_entrada', rawRealizado)
          valRecord.set('ultima_aparicao', rawRealizado)
          valRecord.set('chave_operacional', chaveOperacional)
          valRecord.set('chave_dedup', chaveDedup)
          valRecord.set('status_operacional', statusOp)
          valRecord.set('status_na_entrada', statusOp)
          valRecord.set('situacao_atual', 'Ativo')
          valRecord.set('is_base_atual', false) // staging durante a sincronização
          valRecord.set('data_importacao', stagingMarker) // marcador de staging

          // Campos explícitos do Bloco B.1
          valRecord.set('source_type', 'tradepro_api')
          valRecord.set('source_job_id', jobId)
          valRecord.set('source_endpoint', 'relatorio-validade')
          valRecord.set('source_synced_at', new Date().toISOString())
          valRecord.set('dados_brutos_json', sanitizedRawValidadePayload)
          valRecord.set('status_normalizacao', statusNormalizacao)
          if (rawDataFabricacao) valRecord.set('data_fabricacao', rawDataFabricacao)
          if (rawNumeroLote) valRecord.set('lote', rawNumeroLote)
          if (rawCodigoBarras) valRecord.set('codigo_barras', rawCodigoBarras)
          if (rawSupervisorId) valRecord.set('id_supervisor', rawSupervisorId)
          if (rawSupervisorNome) valRecord.set('supervisor', rawSupervisorNome)
          if (rawRepresentante) valRecord.set('representante', rawRepresentante)

          if (requestedBy) {
            valRecord.set('created_by', requestedBy)
          }

          $app.save(valRecord)
          totalValidos++

          // Vínculo Promotor -> Loja via Validade gera 'observado_operacao' (NUNCA observado_visita nem confirmado)
          if (rawPromotorId && codigoLoja && promoterDbId) {
            try {
              const assignCol = $app.findCollectionByNameOrId('store_promoter_assignments')
              if (assignCol) {
                const assignFilter =
                  'promoter_id = "' +
                  promoterDbId +
                  '" && store_code = "' +
                  codigoLoja.replace(/"/g, '\\"') +
                  '" && status = "ativo"'
                const existingAssigns = $app.findRecordsByFilter(
                  'store_promoter_assignments',
                  assignFilter,
                  '-created',
                  1,
                  0,
                )

                if (existingAssigns && existingAssigns.length > 0) {
                  const existingAss = existingAssigns[0]
                  existingAss.set(
                    'ultima_observacao_fonte',
                    'Validade registrada em ' + rawRealizado + ' (Job ' + jobId + ')',
                  )
                  $app.save(existingAss)
                } else {
                  const newAss = new Record(assignCol)
                  newAss.set('promoter_id', promoterDbId)
                  newAss.set('promoter_nome', rawPromotorNome)
                  newAss.set('store_code', codigoLoja)
                  newAss.set('store_name', rawRazaoSocial)
                  if (storeDbId) newAss.set('store_id', storeDbId)
                  if (resolvedIndustryId) {
                    newAss.set('industry_id', resolvedIndustryId)
                    newAss.set('industry_name', resolvedIndustryName)
                  }
                  newAss.set('status', 'ativo')
                  newAss.set('tipo_vinculo', 'observado_operacao') // estritamente observado_operacao
                  newAss.set('origem_vinculo', 'Validade registrada em ' + rawRealizado)
                  newAss.set('data_inicio', rawRealizado)
                  newAss.set(
                    'ultima_observacao_fonte',
                    'Atividade operacional de Validade (Job ' + jobId + ')',
                  )
                  $app.save(newAss)
                }
              }
            } catch (_) {}
          }

          // Item 3: Pendências idempotentes em Validades
          // Sem soma cega de volume_ocorrencias + 1; cria apenas se não existir como pendente
          if (rawCodCliente && !resolvedIndustryId) {
            try {
              const pendCol = $app.findCollectionByNameOrId('cadastros_pendencias')
              if (pendCol) {
                const pendFilter =
                  'tipo_entidade = "industria" && valor_identificador = "' +
                  rawCodCliente.replace(/"/g, '\\"') +
                  '" && status = "pendente"'
                const existingPend = $app.findRecordsByFilter(
                  'cadastros_pendencias',
                  pendFilter,
                  '-created',
                  1,
                  0,
                )
                if (!existingPend || existingPend.length === 0) {
                  const pRec = new Record(pendCol)
                  pRec.set('tipo_entidade', 'industria')
                  pRec.set('valor_identificador', rawCodCliente)
                  pRec.set('codigo_externo', rawCodCliente)
                  pRec.set('nome_identificado', rawClienteNome || 'Cliente #' + rawCodCliente)
                  pRec.set('origem_fonte', 'tradepro_api_validades')
                  pRec.set('status', 'pendente')
                  pRec.set('volume_ocorrencias', 1)
                  pRec.set('contexto_adicional', { job_id: jobId, endpoint: 'relatorio-validade' })
                  $app.save(pRec)
                }
              }
            } catch (_) {}
          }

          if (codigoLoja && !storeDbId) {
            try {
              const pendCol = $app.findCollectionByNameOrId('cadastros_pendencias')
              if (pendCol) {
                const pendFilter =
                  'tipo_entidade = "loja" && valor_identificador = "' +
                  codigoLoja.replace(/"/g, '\\"') +
                  '" && status = "pendente"'
                const existingPend = $app.findRecordsByFilter(
                  'cadastros_pendencias',
                  pendFilter,
                  '-created',
                  1,
                  0,
                )
                if (!existingPend || existingPend.length === 0) {
                  const pRec = new Record(pendCol)
                  pRec.set('tipo_entidade', 'loja')
                  pRec.set('valor_identificador', codigoLoja)
                  pRec.set('codigo_externo', codigoLoja)
                  pRec.set('nome_identificado', rawRazaoSocial)
                  pRec.set('origem_fonte', 'tradepro_api_validades')
                  pRec.set('status', 'pendente')
                  pRec.set('volume_ocorrencias', 1)
                  pRec.set('contexto_adicional', {
                    razaoSocial: rawRazaoSocial,
                    fantasia: rawFantasia,
                  })
                  $app.save(pRec)
                }
              }
            } catch (_) {}
          }

          if (rawPromotorId && !promoterDbId) {
            try {
              const pendCol = $app.findCollectionByNameOrId('cadastros_pendencias')
              if (pendCol) {
                const pendFilter =
                  'tipo_entidade = "promotor" && valor_identificador = "' +
                  rawPromotorId.replace(/"/g, '\\"') +
                  '" && status = "pendente"'
                const existingPend = $app.findRecordsByFilter(
                  'cadastros_pendencias',
                  pendFilter,
                  '-created',
                  1,
                  0,
                )
                if (!existingPend || existingPend.length === 0) {
                  const pRec = new Record(pendCol)
                  pRec.set('tipo_entidade', 'promotor')
                  pRec.set('valor_identificador', rawPromotorId)
                  pRec.set('codigo_externo', rawPromotorId)
                  pRec.set('nome_identificado', rawPromotorNome)
                  pRec.set('origem_fonte', 'tradepro_api_validades')
                  pRec.set('status', 'pendente')
                  pRec.set('volume_ocorrencias', 1)
                  $app.save(pRec)
                }
              }
            } catch (_) {}
          }

          if (rawSupervisorId && !supervisorDbId) {
            try {
              const pendCol = $app.findCollectionByNameOrId('cadastros_pendencias')
              if (pendCol) {
                const pendFilter =
                  'tipo_entidade = "supervisor" && valor_identificador = "' +
                  rawSupervisorId.replace(/"/g, '\\"') +
                  '" && status = "pendente"'
                const existingPend = $app.findRecordsByFilter(
                  'cadastros_pendencias',
                  pendFilter,
                  '-created',
                  1,
                  0,
                )
                if (!existingPend || existingPend.length === 0) {
                  const pRec = new Record(pendCol)
                  pRec.set('tipo_entidade', 'supervisor')
                  pRec.set('valor_identificador', rawSupervisorId)
                  pRec.set('codigo_externo', rawSupervisorId)
                  pRec.set('nome_identificado', rawSupervisorNome)
                  pRec.set('origem_fonte', 'tradepro_api_validades')
                  pRec.set('status', 'pendente')
                  pRec.set('volume_ocorrencias', 1)
                  $app.save(pRec)
                }
              }
            } catch (_) {}
          }

          // Alimentação do Mix Operacional Observado (industry_product_mix):
          // Tupla: Cliente (Indústria vinculada) + Produto observado
          // NUNCA toca no Mix Definido da Loja nem altera produtos para oficiais
          if (resolvedIndustryId && rawProduto) {
            try {
              const cleanProdNome = rawProduto.trim()
              const existingMix = $app.findRecordsByFilter(
                'industry_product_mix',
                'industry_id = "' +
                  resolvedIndustryId +
                  '" && nome_produto = "' +
                  cleanProdNome.replace(/"/g, '\\"') +
                  '"',
                '-created',
                1,
                0,
              )
              if (!existingMix || existingMix.length === 0) {
                const mixCol = $app.findCollectionByNameOrId('industry_product_mix')
                const newMixItem = new Record(mixCol)
                newMixItem.set('industry_id', resolvedIndustryId)
                newMixItem.set('industry_name', resolvedIndustryName)
                newMixItem.set('codigo_produto', rawCodProduto)
                newMixItem.set('nome_produto', cleanProdNome)
                newMixItem.set('categoria', 'Geral')
                newMixItem.set('tipo_mix', 'observado_operacional')
                newMixItem.set('status', 'ativo')
                $app.save(newMixItem)
              }
            } catch (_) {
              // Silencioso se der duplicidade no mix
            }
          }
        } catch (saveErr) {
          totalRejeitados++
        }
      }

      // Atualiza progresso da página no job
      record.set('paginas_processadas', pagina)
      record.set('registros_lidos', totalLidos)
      record.set('registros_validos', totalValidos)
      record.set('registros_rejeitados', totalRejeitados)
      $app.save(record)
    }

    // Se o processamento foi interrompido (erro, rate limit, cancelamento)
    if (isInterrupted) {
      record.set('status', pauseErrorCode === 'rate_limited' ? 'paused' : 'error')
      record.set('error_code', pauseErrorCode || 'tradepro_unavailable')
      record.set(
        'message',
        pauseMessage ||
          'Sincronização de validades pausada na página ' +
            record.getInt('paginas_processadas') +
            '. O staging foi preservado para retomada segura.',
      )
      record.set('finished_at', new Date().toISOString())
      $app.save(record)
      return
    }

    // ---------------------------------------------------------------------------
    // FASE C — PROMOÇÃO ATÔMICA DO STAGING
    // Todas as páginas foram concluídas com sucesso.
    // ---------------------------------------------------------------------------
    try {
      const stagingFilter = 'data_importacao = "' + stagingMarker + '"'
      const stagingRecords = $app.findRecordsByFilter(
        'validades_base',
        stagingFilter,
        '-created',
        100000,
        0,
      )
      const stagingCount = stagingRecords ? stagingRecords.length : 0

      if (stagingCount === 0 && totalValidos === 0) {
        // 0 registros retornados no total
        record.set('status', 'success')
        record.set('error_code', null)
        record.set('registros_consolidados', 0)
        record.set('registros_deduplicados', 0)
        record.set('message', 'Sincronização concluída: nenhum registro no período.')
        record.set('finished_at', new Date().toISOString())
        $app.save(record)
        return
      }

      // Executa transação de promoção atômica:
      // 1. Desativa a Base Atual anterior (apenas registros que NÃO pertencem ao staging atual)
      // 2. Ativa o staging do job atual como Base Atual (is_base_atual = 1)
      $app.runInTransaction((txApp) => {
        // Desativa a base anterior
        txApp
          .db()
          .newQuery(
            'UPDATE validades_base SET is_base_atual = 0 WHERE is_base_atual = 1 AND data_importacao != {:stagingMarker}',
          )
          .bind({ stagingMarker })
          .execute()

        // Ativa o staging atual
        txApp
          .db()
          .newQuery(
            'UPDATE validades_base SET is_base_atual = 1 WHERE data_importacao = {:stagingMarker}',
          )
          .bind({ stagingMarker })
          .execute()
      })

      const promovidosValidades = $app.findRecordsByFilter(
        'validades_base',
        'is_base_atual = true && data_importacao = "' + stagingMarker + '"',
        '-created',
        100000,
        0,
      )
      const totalPromovidos = promovidosValidades ? promovidosValidades.length : stagingCount

      record.set('status', 'success')
      record.set('error_code', null)
      record.set('registros_consolidados', totalPromovidos)
      record.set('registros_deduplicados', totalDeduplicados)
      record.set(
        'message',
        'Sincronização concluída com sucesso: ' +
          totalPromovidos +
          ' validades consolidadas na Base Atual.',
      )
      record.set('finished_at', new Date().toISOString())
      $app.save(record)
    } catch (promoErr) {
      const cleanPromoMsg = sanitizeErrorMessage(
        String(promoErr || ''),
        'Erro interno ao promover registros da Base Atual de Validades.',
      )
      record.set('status', 'error')
      record.set('error_code', 'internal_error')
      record.set('message', cleanPromoMsg)
      record.set('finished_at', new Date().toISOString())
      $app.save(record)
    }
  } else if (action === 'sync_visitas' && status === 'syncing') {
    // =========================================================================
    // BLOCO VISITAS — SINCRONIZAÇÃO PAGINADA
    // =========================================================================
    try {
      const originalStatus = record.original() ? record.original().getString('status') : ''
      if (originalStatus === 'syncing') {
        return
      }
    } catch (_) {}

    const rawToken = $os.getenv('TRADEPRO_BASIC_TOKEN') || ''
    if (!rawToken.trim()) {
      record.set('status', 'error')
      record.set('error_code', 'not_configured')
      record.set('message', 'Token de autenticação TradePro não configurado.')
      record.set('finished_at', new Date().toISOString())
      $app.save(record)
      return
    }

    const trimmedToken = rawToken.trim()
    const authHeader = trimmedToken.startsWith('Basic ') ? trimmedToken : 'Basic ' + trimmedToken
    const toTradeProDate = (isoDate) => isoDate.replace(/-/g, '')

    const dateStart = record.getString('date_start').split(' ')[0].split('T')[0]
    const dateEnd = record.getString('date_end').split(' ')[0].split('T')[0]
    const requestedBy = record.getString('requested_by')
    const jobId = record.id

    const totalInformado = record.getInt('total_informado') || 0
    const paginasTotal = record.getInt('paginas_total') || Math.ceil(totalInformado / 30) || 1
    let paginaInicial = record.getInt('paginas_processadas') || 0
    if (paginaInicial < 1) paginaInicial = 1
    else paginaInicial = paginaInicial + 1

    if (totalInformado === 0) {
      record.set('status', 'success')
      record.set('registros_consolidados', 0)
      record.set('message', 'Nenhum registro a ser sincronizado.')
      record.set('finished_at', new Date().toISOString())
      $app.save(record)
      return
    }

    // Carrega indústrias cadastradas para resolução de vínculos seguros
    const industryMapByClientId = {}
    try {
      const allIndustries = $app.findRecordsByFilter(
        'industry_registry',
        'id != ""',
        'nome',
        1000,
        0,
      )
      if (allIndustries && allIndustries.length > 0) {
        for (let indIdx = 0; indIdx < allIndustries.length; indIdx++) {
          const indRec = allIndustries[indIdx]
          const tId = (indRec.getString('tradepro_client_id') || '').trim()
          if (tId) {
            industryMapByClientId[tId] = {
              id: indRec.id,
              nome: indRec.getString('nome'),
              tradepro_client_id: tId,
            }
          }
        }
      }
    } catch (_) {}

    // Carrega promotores cadastrados para resolução de promoter_id
    const promoterMapByCod = {}
    try {
      const allPromoters = $app.findRecordsByFilter('promoters', 'id != ""', 'nome', 2000, 0)
      if (allPromoters && allPromoters.length > 0) {
        for (let pIdx = 0; pIdx < allPromoters.length; pIdx++) {
          const pRec = allPromoters[pIdx]
          const cod = (pRec.getString('codigo_externo') || '').trim()
          if (cod) {
            promoterMapByCod[cod] = pRec.id
          }
        }
      }
    } catch (_) {}

    // Carrega lojas cadastradas para resolução de store_id
    const storeMapByCode = {}
    try {
      const allStores = $app.findRecordsByFilter('stores', 'id != ""', 'nome', 2000, 0)
      if (allStores && allStores.length > 0) {
        for (let sIdx = 0; sIdx < allStores.length; sIdx++) {
          const sRec = allStores[sIdx]
          const cod = (
            sRec.getString('codigo_loja') ||
            sRec.getString('codigo_externo') ||
            ''
          ).trim()
          if (cod) {
            storeMapByCode[cod] = sRec.id
          }
        }
      }
    } catch (_) {}

    const sanitizeErrorMessage = (rawText, defaultMsg) => {
      let extracted = ''
      try {
        let json = null
        if (rawText) json = JSON.parse(rawText)
        if (json && typeof json === 'object') {
          const candidate =
            json.message ||
            json.mensagem ||
            json.error ||
            json.detail ||
            json.title ||
            json.details ||
            ''
          if (typeof candidate === 'string' && candidate.trim()) extracted = candidate.trim()
        }
      } catch (_) {}

      if (!extracted && rawText && typeof rawText === 'string') {
        const trimmed = rawText.trim()
        if (
          trimmed.length > 0 &&
          trimmed.length <= 300 &&
          !trimmed.startsWith('<html') &&
          !trimmed.startsWith('<!DOCTYPE')
        ) {
          extracted = trimmed
        }
      }

      if (!extracted) extracted = defaultMsg

      let clean = extracted
        .replace(/Authorization:\s*[^\s,;]+/gi, '')
        .replace(/Basic\s+[A-Za-z0-9+/=]+/gi, '')
        .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, '')
        .replace(/token[=:\s]+[A-Za-z0-9\-._~+/]+/gi, '')
        .replace(/password[=:\s]+[^\s,;]+/gi, '')
        .replace(/senha[=:\s]+[^\s,;]+/gi, '')
        .replace(/https?:\/\/[^\s?#]+(\?[^\s#]*)?/gi, '[URL]')
        .replace(/cookie[=:\s]+[^\s,;]+/gi, '')
        .replace(/[A-Za-z0-9+/=]{40,}/g, '')
        .replace(/\s+/g, ' ')
        .trim()

      if (!clean) clean = defaultMsg
      if (clean.length > 300) clean = clean.substring(0, 300)
      return clean
    }

    // Helper para extrair código de loja a partir de razão social / nome da loja
    const extractStoreCode = (razaoSocial) => {
      const rs = (razaoSocial || '').trim()
      if (!rs) return ''
      const m = rs.match(/^(\d+)/)
      if (m) return m[1]
      const m2 = rs.match(/^([^-–]+?)[\s]*[-–]/)
      if (m2) return m2[1].trim()
      return ''
    }

    // Helper para cálculo seguro de duração em minutos (somente se ambos os horários existirem)
    const computeDurationMinutes = (inicio, fim) => {
      if (!inicio || !fim) return 0
      const p1 = String(inicio).trim().split(':')
      const p2 = String(fim).trim().split(':')
      if (p1.length < 2 || p2.length < 2) return 0
      const m1 = parseInt(p1[0], 10) * 60 + parseInt(p1[1], 10)
      const m2 = parseInt(p2[0], 10) * 60 + parseInt(p2[1], 10)
      if (isNaN(m1) || isNaN(m2) || m2 < m1) return 0
      return m2 - m1
    }

    let registrosLidos = record.getInt('registros_lidos') || 0
    let registrosValidos = record.getInt('registros_validos') || 0
    let registrosRejeitados = record.getInt('registros_rejeitados') || 0
    let registrosDeduplicados = record.getInt('registros_deduplicados') || 0

    // Loop paginado sequencial com retry autônomo
    for (let pagina = paginaInicial; pagina <= paginasTotal; pagina++) {
      try {
        const checkRecord = $app.findRecordById('tradepro_sync_jobs', jobId)
        if (checkRecord.getString('status') === 'cancelled') {
          return
        }
      } catch (_) {}

      const pageUrl =
        'https://diretoria.tradepro.com.br/diretoria/servicos/v1/relatorio-visitas/' +
        toTradeProDate(dateStart) +
        '/' +
        toTradeProDate(dateEnd) +
        '?paginaAtual=' +
        pagina +
        '&quantidadePorPagina=30'

      let res = null
      let sendError = null
      let statusCode = 0
      let rawBodyText = ''
      const maxAttempts = 5
      const retryDelaysMs = [5000, 15000, 30000, 30000, 30000]

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        sendError = null
        res = null

        try {
          res = $http.send({
            url: pageUrl,
            method: 'GET',
            headers: {
              Authorization: authHeader,
              Accept: 'application/json',
            },
            timeout: 20,
          })
        } catch (err) {
          sendError = err
        }

        statusCode = res ? res.statusCode || 0 : 0
        rawBodyText =
          res && typeof res.raw === 'string'
            ? res.raw
            : res && typeof res.body === 'string'
              ? res.body
              : ''

        const isTransient =
          Boolean(sendError) || statusCode === 0 || statusCode === 429 || statusCode >= 500

        if (!isTransient) {
          break
        }

        if (attempt < maxAttempts) {
          const waitTime = retryDelaysMs[attempt - 1] || 30000
          const concluidas = Math.max(0, pagina - 1)
          record.set(
            'message',
            'Aguardando liberação do TradePro. ' +
              concluidas +
              ' páginas de visitas concluídas. ' +
              registrosValidos +
              ' visitas preservadas. Tentativa ' +
              (attempt + 1) +
              ' de 5...',
          )
          $app.save(record)

          try {
            sleep(waitTime)
          } catch (_) {}
        }
      }

      if (sendError || statusCode === 0) {
        record.set('status', 'paused')
        record.set('error_code', 'timeout')
        record.set(
          'message',
          'Tempo limite esgotado após 5 tentativas na página ' +
            pagina +
            ' de ' +
            paginasTotal +
            '. Clique em Retomar para continuar.',
        )
        $app.save(record)
        return
      }

      if (statusCode === 401) {
        record.set('status', 'error')
        record.set('error_code', 'unauthorized')
        record.set(
          'message',
          sanitizeErrorMessage(rawBodyText, 'Autenticação recusada pelo TradePro.'),
        )
        record.set('finished_at', new Date().toISOString())
        $app.save(record)
        return
      }

      if (statusCode === 403) {
        record.set('status', 'error')
        record.set('error_code', 'forbidden')
        record.set(
          'message',
          sanitizeErrorMessage(rawBodyText, 'Acesso não autorizado na página ' + pagina + '.'),
        )
        record.set('finished_at', new Date().toISOString())
        $app.save(record)
        return
      }

      if (statusCode === 429) {
        record.set('status', 'paused')
        record.set('error_code', 'rate_limited')
        record.set('message', 'Limite de requisições TradePro. Clique em Retomar para continuar.')
        $app.save(record)
        return
      }

      if (statusCode >= 500) {
        record.set('status', 'paused')
        record.set('error_code', 'tradepro_unavailable')
        record.set(
          'message',
          'Servidor TradePro indisponível na página ' + pagina + ' (HTTP ' + statusCode + ').',
        )
        $app.save(record)
        return
      }

      if (statusCode !== 200 && statusCode !== 204) {
        record.set('status', 'error')
        record.set('error_code', 'internal_error')
        record.set(
          'message',
          sanitizeErrorMessage(
            rawBodyText,
            'Falha inesperada ao processar página ' + pagina + ' (HTTP ' + statusCode + ').',
          ),
        )
        record.set('finished_at', new Date().toISOString())
        $app.save(record)
        return
      }

      // Processamento dos itens da página de Visitas
      let jsonBody = null
      try {
        jsonBody = res.json
      } catch (_) {}

      const promotoresVisitas =
        jsonBody && Array.isArray(jsonBody.visitas)
          ? jsonBody.visitas
          : jsonBody && Array.isArray(jsonBody.data)
            ? jsonBody.data
            : []

      registrosLidos += promotoresVisitas.length

      const operacionalVisitasCol = $app.findCollectionByNameOrId('operacional_visitas')
      const assignmentsCol = $app.findCollectionByNameOrId('store_promoter_assignments')

      for (let pIdx = 0; pIdx < promotoresVisitas.length; pIdx++) {
        const itemPromotor = promotoresVisitas[pIdx]
        if (!itemPromotor) continue

        const rawPromotorId =
          itemPromotor.idPromotor != null
            ? String(itemPromotor.idPromotor).trim()
            : itemPromotor.promotor && itemPromotor.promotor.id != null
              ? String(itemPromotor.promotor.id).trim()
              : ''
        const rawPromotorNome = (
          itemPromotor.nomePromotor ||
          (itemPromotor.promotor && itemPromotor.promotor.nome) ||
          ''
        ).trim()

        const rawSupervisorId =
          itemPromotor.idSupervisor != null
            ? String(itemPromotor.idSupervisor).trim()
            : itemPromotor.supervisor && itemPromotor.supervisor.id != null
              ? String(itemPromotor.supervisor.id).trim()
              : ''
        const rawSupervisorNome = (
          itemPromotor.nomeSupervisor ||
          (itemPromotor.supervisor && itemPromotor.supervisor.nome) ||
          ''
        ).trim()

        const promotorObj = itemPromotor.promotor || {}
        const carteira = Array.isArray(promotorObj.carteiraClientes)
          ? promotorObj.carteiraClientes
          : []

        // Se o promotor tem lojas na carteira com visitas realizadas ou programadas
        // Para cada cliente da carteira, processa a visita/presença factual
        if (carteira.length > 0) {
          for (let cIdx = 0; cIdx < carteira.length; cIdx++) {
            const cliente = carteira[cIdx]
            if (!cliente) continue

            const rawLojaCodigo = cliente.codigo != null ? String(cliente.codigo).trim() : ''
            const rawLojaRazao = (
              cliente.razaoSocial ||
              cliente.nome ||
              cliente.fantasia ||
              ''
            ).trim()
            const rawLojaFantasia = (cliente.fantasia || rawLojaRazao).trim()
            const storeCode =
              rawLojaCodigo || extractStoreCode(rawLojaRazao) || extractStoreCode(rawLojaFantasia)

            // Data factual: usa a data de referência da consulta ou data do evento se fornecida
            const rawData = (cliente.data || cliente.dataVisita || dateStart)
              .split('T')[0]
              .split(' ')[0]

            // Horários REAIS apenas — NUNCA inventar entrada nem saída
            const rawHoraEntrada =
              cliente.horaEntrada || cliente.checkIn || cliente.horaInicio || cliente.hora || null
            const rawHoraSaida = cliente.horaSaida || cliente.checkOut || cliente.horaFim || null
            const cleanHoraEntrada = rawHoraEntrada ? String(rawHoraEntrada).trim() : null
            const cleanHoraSaida = rawHoraSaida ? String(rawHoraSaida).trim() : null

            // Duração somente se ambos os horários existirem
            const duracaoCalculada =
              cleanHoraEntrada && cleanHoraSaida
                ? computeDurationMinutes(cleanHoraEntrada, cleanHoraSaida)
                : 0

            // Status factual
            const statusVisita =
              cliente.realizada === true ||
              cliente.status === 'realizada' ||
              itemPromotor.visitasRealizadas > 0
                ? 'realizada'
                : 'pendente'

            // Resolução de IDs cadastrais seguros
            const promoterDbId = promoterMapByCod[rawPromotorId] || null
            const storeDbId = storeMapByCode[storeCode] || null

            // Deduplicação: verifica se já existe registro com mesmo promotor_cod + store_code + data
            const dedupFilter =
              'promoter_cod = "' +
              rawPromotorId.replace(/"/g, '\\"') +
              '" && store_code = "' +
              storeCode.replace(/"/g, '\\"') +
              '" && data = "' +
              rawData +
              '"'

            try {
              const existingVisitas = $app.findRecordsByFilter(
                'operacional_visitas',
                dedupFilter,
                '-created',
                1,
                0,
              )

              if (existingVisitas && existingVisitas.length > 0) {
                registrosDeduplicados++
                continue // Já gravado, idempotente
              }

              // Criação do registro de visita factual
              const novaVisita = new Record(operacionalVisitasCol)
              novaVisita.set('data', rawData)
              novaVisita.set('promoter_cod', rawPromotorId)
              novaVisita.set('promoter_nome', rawPromotorNome)
              if (promoterDbId) {
                novaVisita.set('promoter_id', promoterDbId)
              }
              novaVisita.set('store_code', storeCode)
              novaVisita.set('store_name', rawLojaRazao || rawLojaFantasia || 'Loja ' + storeCode)
              if (storeDbId) {
                novaVisita.set('store_id', storeDbId)
              }
              if (cleanHoraEntrada) {
                novaVisita.set('hora_inicio', cleanHoraEntrada)
              }
              if (cleanHoraSaida) {
                novaVisita.set('hora_fim', cleanHoraSaida)
              }
              if (duracaoCalculada > 0) {
                novaVisita.set('duracao_minutos', duracaoCalculada)
              }
              novaVisita.set('status_roteiro', statusVisita)
              novaVisita.set('origem_fonte', 'tradepro_api')
              novaVisita.set('dados_brutos_json', {
                itemPromotor: {
                  idPromotor: itemPromotor.idPromotor,
                  nomePromotor: itemPromotor.nomePromotor,
                  idSupervisor: itemPromotor.idSupervisor,
                  nomeSupervisor: itemPromotor.nomeSupervisor,
                  visitasPrevistas: itemPromotor.visitasPrevistas,
                  visitasRealizadas: itemPromotor.visitasRealizadas,
                },
                cliente: cliente,
                sincronizadoEm: new Date().toISOString(),
                jobId: jobId,
              })

              $app.save(novaVisita)
              registrosValidos++

              // Vínculo promotor <-> loja como RELAÇÃO OBSERVADA (store_promoter_assignments)
              // REGRA: "Visita observada não altera roteiro confirmado: vínculo com status observado ('observado_visita'), não confirmado"
              if (rawPromotorId && storeCode && assignmentsCol && promoterDbId) {
                try {
                  const relFilter =
                    'promoter_id = "' +
                    promoterDbId +
                    '" && store_code = "' +
                    storeCode.replace(/"/g, '\\"') +
                    '" && status = "ativo"'
                  const existingRels = $app.findRecordsByFilter(
                    'store_promoter_assignments',
                    relFilter,
                    '-created',
                    1,
                    0,
                  )

                  if (!existingRels || existingRels.length === 0) {
                    const novaRel = new Record(assignmentsCol)
                    novaRel.set('promoter_id', promoterDbId)
                    novaRel.set('promoter_nome', rawPromotorNome)
                    novaRel.set('store_code', storeCode)
                    novaRel.set('store_name', rawLojaRazao || rawLojaFantasia)
                    novaRel.set('status', 'ativo')
                    novaRel.set('tipo_vinculo', 'observado_visita') // NUNCA confirmado automaticamente
                    novaRel.set('origem_vinculo', 'Visita registrada TradePro em ' + rawData)
                    novaRel.set('data_inicio', rawData)
                    novaRel.set(
                      'observacao',
                      'Relação observada através da API de Visitas. Requer confirmação de roteiro pelo administrador.',
                    )
                    if (storeDbId) novaRel.set('store_id', storeDbId)
                    $app.save(novaRel)
                  }
                } catch (_) {}
              }
            } catch (errSave) {
              registrosRejeitados++
            }
          }
        } else {
          // Caso a carteira venha vazia no item do promotor mas ele tenha resumo de visitas realizadas
          // Grava um registro síntese para o promotor sem inventar loja fictícia
          const rawData = dateStart
          const dedupFilter =
            'promoter_cod = "' +
            rawPromotorId.replace(/"/g, '\\"') +
            '" && store_code = "" && data = "' +
            rawData +
            '"'

          try {
            const existingVisitas = $app.findRecordsByFilter(
              'operacional_visitas',
              dedupFilter,
              '-created',
              1,
              0,
            )

            if (!existingVisitas || existingVisitas.length === 0) {
              const novaVisita = new Record(operacionalVisitasCol)
              novaVisita.set('data', rawData)
              novaVisita.set('promoter_cod', rawPromotorId)
              novaVisita.set('promoter_nome', rawPromotorNome)
              const promoterDbId = promoterMapByCod[rawPromotorId] || null
              if (promoterDbId) {
                novaVisita.set('promoter_id', promoterDbId)
              }
              novaVisita.set('store_code', '')
              novaVisita.set('store_name', '')
              novaVisita.set(
                'status_roteiro',
                itemPromotor.visitasRealizadas > 0 ? 'realizada' : 'pendente',
              )
              novaVisita.set('origem_fonte', 'tradepro_api')
              novaVisita.set('dados_brutos_json', {
                itemPromotor: itemPromotor,
                sincronizadoEm: new Date().toISOString(),
                jobId: jobId,
              })

              $app.save(novaVisita)
              registrosValidos++
            } else {
              registrosDeduplicados++
            }
          } catch (_) {
            registrosRejeitados++
          }
        }
      }

      record.set('paginas_processadas', pagina)
      record.set('registros_lidos', registrosLidos)
      record.set('registros_validos', registrosValidos)
      record.set('registros_rejeitados', registrosRejeitados)
      record.set('registros_deduplicados', registrosDeduplicados)
      record.set('registros_consolidados', registrosValidos)
      $app.save(record)
    }

    // Conclusão bem-sucedida do job de visitas
    record.set('status', 'success')
    record.set('error_code', null)
    record.set('registros_consolidados', registrosValidos)
    record.set('registros_deduplicados', registrosDeduplicados)
    record.set(
      'message',
      'Sincronização de visitas concluída com sucesso: ' +
        registrosValidos +
        ' visitas consolidadas (' +
        registrosDeduplicados +
        ' deduplicadas).',
    )
    record.set('finished_at', new Date().toISOString())
    $app.save(record)
  }
}, 'tradepro_sync_jobs')
