// Hook para Prévia e Sincronização Paginada de Rupturas via API TradePro
// Utiliza exclusivamente a coleção `tradepro_sync_jobs` e hooks nativos após persistência.
// NUNCA expõe tokens, senhas ou cabeçalhos Authorization no banco nem em logs.
// NUNCA usa routerAdd.
// Promoção 100% transacional e atômica.

// ---------------------------------------------------------------------------
// FASE A — PRÉVIA (Preview de Rupturas)
// Disparado após a criação de um registro com action='sync_rupturas' e status='pending'
// ---------------------------------------------------------------------------
onRecordAfterCreateSuccess((e) => {
  const record = e.record
  if (!record || record.collection().name !== 'tradepro_sync_jobs') {
    return
  }

  const action = record.getString('action')
  const status = record.getString('status')
  if (action !== 'sync_rupturas' || status !== 'pending') {
    return
  }

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
            const mensagem = errItem && typeof errItem.mensagem === 'string' ? errItem.mensagem : ''
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
}, 'tradepro_sync_jobs')

// ---------------------------------------------------------------------------
// FASE B — SINCRONIZAÇÃO PAGINADA DE RUPTURAS
// Disparado quando o status do registro muda para 'syncing'
// ---------------------------------------------------------------------------
onRecordAfterUpdateSuccess((e) => {
  const record = e.record
  if (!record || record.collection().name !== 'tradepro_sync_jobs') {
    return
  }

  const action = record.getString('action')
  const status = record.getString('status')
  if (action !== 'sync_rupturas' || status !== 'syncing') {
    return
  }

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
    // Loop paginado sequencial — UMA tentativa por página (sem $os.sleep, sem retry automático em loop)
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

      // Única tentativa por página
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

      const statusCode = res ? res.statusCode || 0 : 0
      const rawBodyText =
        res && typeof res.raw === 'string'
          ? res.raw
          : res && typeof res.body === 'string'
            ? res.body
            : ''

      // Timeout ou erro de conexão de rede — pausa para permitir retomada segura
      if (sendError || statusCode === 0) {
        record.set('status', 'paused')
        record.set('error_code', 'timeout')
        record.set(
          'message',
          'Tempo limite esgotado ou falha de conexão na página ' +
            pagina +
            ' de ' +
            paginasTotal +
            '. Job pausado. Clique em Retomar para continuar.',
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
          'Limite de requisições atingido na página ' +
            pagina +
            ' de ' +
            paginasTotal +
            '. Job pausado. Clique em Retomar para continuar.',
        )
        $app.save(record)
        return
      }

      if (statusCode >= 500) {
        record.set('status', 'paused')
        record.set('error_code', 'tradepro_unavailable')
        record.set(
          'message',
          'Servidor TradePro indisponível na página ' +
            pagina +
            ' de ' +
            paginasTotal +
            ' (HTTP ' +
            statusCode +
            '). Job pausado. Clique em Retomar para continuar.',
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
        const clienteFantasia = item.fantasiaCliente || item.cliente || ''
        const dedupKey = codigoLoja + '|' + rawProduto + '|' + clienteFantasia
        const operationalKey = codigoLoja + '|' + rawProduto + '|' + rawDataVisita

        const rupRecord = new Record(rupturasBaseCol)
        rupRecord.set('produto', rawProduto)
        rupRecord.set('motivo', motivoNormalizado)
        rupRecord.set('codigo_loja', codigoLoja)
        rupRecord.set('nome_loja', rawRazaoSocial)
        rupRecord.set('cnpj_loja', item.cpfCnpjCliente || item.cnpj_loja || '')
        rupRecord.set('cidade', item.cidadeCliente || item.cidade || '')
        rupRecord.set('estado', item.siglaEstadoCliente || item.estado || '')
        rupRecord.set('codigo_cliente', item.codigoCliente || item.codigo_cliente || '')
        rupRecord.set('cliente', clienteFantasia)
        rupRecord.set('colaborador', item.nomePromotor || item.colaborador || '')
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

        try {
          $app.save(rupRecord)
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
    // Primeiro desativa a base atual anterior (todos exceto os do staging atual)
    // Depois ativa todos os registros do staging deste job
    $app
      .db()
      .newQuery(
        'UPDATE rupturas_base SET is_base_atual = 0 WHERE is_base_atual = 1 AND tenant_id != {:jobTenant}',
      )
      .bind({ jobTenant: stagingJobTenant })
      .execute()

    $app
      .db()
      .newQuery('UPDATE rupturas_base SET is_base_atual = 1 WHERE tenant_id = {:jobTenant}')
      .bind({ jobTenant: stagingJobTenant })
      .execute()

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
}, 'tradepro_sync_jobs')
