// Hook para Prévia e Sincronização Paginada de Validades via API TradePro
// Utiliza a coleção `tradepro_sync_jobs` com action='sync_validades' e hooks nativos.
// NUNCA expõe tokens, senhas ou cabeçalhos Authorization no banco nem em logs.
// Promoção 100% transacional e atômica. Staging isolation via data_importacao='tradepro_job_<jobId>'.

// ---------------------------------------------------------------------------
// FASE A — PRÉVIA (Preview de Validades)
// Disparado após a criação de um registro com action='sync_validades' e status='pending'
// ---------------------------------------------------------------------------
onRecordAfterCreateSuccess((e) => {
  const record = e.record
  if (!record || record.collection().name !== 'tradepro_sync_jobs') {
    return
  }

  const action = record.getString('action')
  const status = record.getString('status')
  if (action !== 'sync_validades' || status !== 'pending') {
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
      'requested_by = {:userId} && created >= {:since} && action = "sync_validades"',
      '-created',
      20,
      0,
      { userId, since: fiveMinutesAgo },
    )

    if (recentJobs.length > 10) {
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
      'requested_by = {:userId} && status = "syncing" && action = "sync_validades"',
      '-created',
      5,
      0,
      { userId },
    )

    if (concurrentSyncing.length > 0) {
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

  // Endpoint oficial de Validades: /v1/relatorio-validade/{dataInicial}/{dataFinal}/realizado?paginaAtual=1&quantidadePorPagina=1
  const url =
    'https://diretoria.tradepro.com.br/diretoria/servicos/v1/relatorio-validade/' +
    toTradeProDate(dateStart) +
    '/' +
    toTradeProDate(dateEnd) +
    '/realizado?paginaAtual=1&quantidadePorPagina=1'

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
        'User-Agent': 'Inteligencia-Operacional-Validades/1.0',
      },
      timeout: 25,
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
        ? 'Tempo limite de 25s excedido ao consultar o TradePro.'
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
    let totalDeProdutos = 0
    let paginasTotal = 0

    if (res.json && typeof res.json === 'object') {
      const jsonBody = res.json
      if (jsonBody.totalDeProdutos != null) {
        const parsed = parseInt(jsonBody.totalDeProdutos, 10)
        totalDeProdutos = isNaN(parsed) ? 0 : parsed
      }
      if (jsonBody.totalDePaginas != null) {
        const parsedP = parseInt(jsonBody.totalDePaginas, 10)
        paginasTotal = isNaN(parsedP) ? 0 : parsedP
      }
    }

    if (paginasTotal === 0 && totalDeProdutos > 0) {
      paginasTotal = Math.ceil(totalDeProdutos / 30)
    }

    record.set('status', 'preview')
    record.set('error_code', null)
    record.set('total_informado', totalDeProdutos)
    record.set('paginas_total', paginasTotal)
    record.set('paginas_processadas', 0)
    record.set('registros_lidos', 0)
    record.set('registros_validos', 0)
    record.set('registros_rejeitados', 0)
    record.set('registros_deduplicados', 0)
    record.set('registros_consolidados', 0)
    record.set(
      'message',
      totalDeProdutos === 0
        ? 'Nenhum registro de validade encontrado para o período.'
        : 'Prévia carregada: ' + totalDeProdutos + ' registros em ' + paginasTotal + ' páginas.',
    )
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
            const mensagem = errItem && typeof errItem.mensagem === 'string' ? errItem.mensagem : ''
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
}, 'tradepro_sync_jobs')

// ---------------------------------------------------------------------------
// FASE B — SINCRONIZAÇÃO PAGINADA (Syncing de Validades)
// Disparado após update do status para 'syncing' com action='sync_validades'
// ---------------------------------------------------------------------------
onRecordAfterUpdateSuccess((e) => {
  const record = e.record
  if (!record || record.collection().name !== 'tradepro_sync_jobs') {
    return
  }

  const action = record.getString('action')
  const status = record.getString('status')
  if (action !== 'sync_validades' || status !== 'syncing') {
    return
  }

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
      '/realizado?paginaAtual=' +
      pagina +
      '&quantidadePorPagina=' +
      pageSize

    let pageRes = null
    let pageErr = null

    try {
      pageRes = $http.send({
        url: pageUrl,
        method: 'GET',
        headers: {
          Authorization: authHeader,
          Accept: 'application/json',
          'User-Agent': 'Inteligencia-Operacional-Validades/1.0',
        },
        timeout: 25,
      })
    } catch (err) {
      pageErr = err
    }

    if (pageErr) {
      const errStr = String(pageErr || '')
      const isTimeout = /timeout|deadline|exceeded|timed out/i.test(errStr)
      isInterrupted = true
      pauseErrorCode = isTimeout ? 'timeout' : 'tradepro_unavailable'
      pauseMessage = isTimeout
        ? 'Tempo limite de 25s excedido na página ' + pagina + '.'
        : 'Erro de comunicação na página ' + pagina + '.'
      break
    }

    const statusCode = pageRes.statusCode || 0
    const rawBodyText =
      typeof pageRes.raw === 'string'
        ? pageRes.raw
        : typeof pageRes.body === 'string'
          ? pageRes.body
          : JSON.stringify(pageRes.json || {})

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
          'Limite de requisições atingido na página ' +
          pagina +
          '. O job foi pausado com staging preservado. Clique em Retomar para continuar.'
      } else if (statusCode >= 500) {
        pauseErrorCode = 'tradepro_unavailable'
        pauseMessage =
          'Servidor TradePro indisponível na página ' +
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
      }
      if (pageRes.json.totalDeProdutos != null) {
        const pProdutos = parseInt(pageRes.json.totalDeProdutos, 10)
        if (!isNaN(pProdutos) && pProdutos > 0) {
          record.set('total_informado', pProdutos)
        }
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
      const rawCidade = (typeof cliente.cidade === 'string' ? cliente.cidade : cidadeObj.nome || '')
        .toString()
        .trim()
      const rawEstado = (estadoObj.sigla || '').toString().trim()
      const rawPromotorNome = (promotor.nome || '').toString().trim()
      const rawPromotorId = (promotor.id || '').toString().trim()
      const rawCodProduto = (produtoObj.codigo || '').toString().trim()

      const rawQuantidade =
        typeof item.quantidade === 'number' ? item.quantidade : Number(item.quantidade) || 0
      const rawDiasParaVencimento =
        typeof item.diasParaVencimento === 'number'
          ? item.diasParaVencimento
          : Number(item.diasParaVencimento) || 0

      // Validação: campos mínimos essenciais
      if (!rawRazaoSocial || !rawProduto || !rawValidade || !rawRealizado || rawQuantidade < 0) {
        totalRejeitados++
        continue
      }

      const codigoLoja = extractStoreCode(rawRazaoSocial)
      const fornecedor = 'DIRETORIA'
      const chaveOperacional = [
        normKey(fornecedor),
        normKey(rawRazaoSocial),
        normKey(rawProduto),
        rawValidade,
      ].join('|')
      const chaveDedup = chaveOperacional + '|' + rawRealizado
      const statusOp = computeStatusOperacional(rawDiasParaVencimento)

      try {
        const valRecord = new Record(validadesBaseCol)
        valRecord.set('fornecedor', fornecedor)
        valRecord.set('razao_social', rawRazaoSocial)
        valRecord.set('produto', rawProduto)
        valRecord.set('cliente', rawFantasia || rawRazaoSocial)
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

        if (requestedBy) {
          valRecord.set('created_by', requestedBy)
        }

        $app.save(valRecord)
        totalValidos++
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
    const stagingCount = $app.findRecordsByFilter('validades_base', stagingFilter, '', 1, 0).length

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

    const consolidadoStaging = $app.findRecordsByFilter(
      'validades_base',
      'is_base_atual = true && data_importacao = "' + stagingMarker + '"',
      '',
      1,
      0,
    ).length

    record.set('status', 'success')
    record.set('error_code', null)
    record.set('registros_consolidados', totalValidos)
    record.set('registros_deduplicados', totalDeduplicados)
    record.set(
      'message',
      'Sincronização concluída com sucesso: ' +
        totalValidos +
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
}, 'tradepro_sync_jobs')
