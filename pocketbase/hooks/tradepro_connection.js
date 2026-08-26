// Hook para teste de conexão TradePro via criação de registro na coleção `tradepro_connection_jobs`.
// Opera de forma segura e síncrona/após-criação sem depender de routerAdd.
// NUNCA grava tokens, senhas ou cabeçalhos Authorization no banco nem em logs.

onRecordAfterCreateSuccess((e) => {
  const record = e.record
  if (!record || record.collection().name !== 'tradepro_connection_jobs') {
    return
  }

  const userId = record.getString('requested_by')
  const dateStart = record.getString('date_start').split(' ')[0].split('T')[0]
  const dateEnd = record.getString('date_end').split(' ')[0].split('T')[0]

  const nowIso = new Date().toISOString()
  record.set('started_at', nowIso)
  record.set('status', 'processing')

  // 1. Validação de formato e intervalo de datas (máximo 31 dias)
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/
  if (!dateRegex.test(dateStart) || !dateRegex.test(dateEnd) || dateStart > dateEnd) {
    record.set('status', 'error')
    record.set('connected', false)
    record.set('http_status', 400)
    record.set('has_data', false)
    record.set('records_received', 0)
    record.set('total_records_reported', 0)
    record.set('latency_ms', 0)
    record.set('message', 'Período inválido. A data inicial deve ser menor ou igual à final.')
    record.set('error_code', 'invalid_period')
    record.set('finished_at', new Date().toISOString())
    $app.save(record)
    return
  }

  const d1 = new Date(dateStart + 'T00:00:00Z')
  const d2 = new Date(dateEnd + 'T00:00:00Z')
  const diffDays = Math.ceil(Math.abs(d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24))

  if (diffDays > 31) {
    record.set('status', 'error')
    record.set('connected', false)
    record.set('http_status', 400)
    record.set('has_data', false)
    record.set('records_received', 0)
    record.set('total_records_reported', 0)
    record.set('latency_ms', 0)
    record.set('message', 'Intervalo máximo permitido é de 31 dias.')
    record.set('error_code', 'invalid_period')
    record.set('finished_at', new Date().toISOString())
    $app.save(record)
    return
  }

  // 2. Validação de rate limit:
  // - Máximo 3 jobs nos últimos 5 minutos para este usuário
  // - Máximo 1 job em pending/processing concorrente
  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    const recentJobs = $app.findRecordsByFilter(
      'tradepro_connection_jobs',
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
      record.set('connected', false)
      record.set('http_status', 429)
      record.set('has_data', false)
      record.set('records_received', 0)
      record.set('total_records_reported', 0)
      record.set('latency_ms', 0)
      record.set(
        'message',
        'Muitas requisições recentes. Aguarde alguns minutos antes de tentar novamente.',
      )
      record.set('error_code', 'rate_limited')
      record.set('finished_at', new Date().toISOString())
      $app.save(record)
      return
    }

    const concurrentJobs = $app.findRecordsByFilter(
      'tradepro_connection_jobs',
      'requested_by = "' + userId + '" && status = "processing" && id != "' + record.id + '"',
      '-created',
      5,
      0,
    )

    if (concurrentJobs && concurrentJobs.length > 0) {
      record.set('status', 'error')
      record.set('connected', false)
      record.set('http_status', 429)
      record.set('has_data', false)
      record.set('records_received', 0)
      record.set('total_records_reported', 0)
      record.set('latency_ms', 0)
      record.set('message', 'Já existe um teste em processamento. Aguarde a conclusão.')
      record.set('error_code', 'rate_limited')
      record.set('finished_at', new Date().toISOString())
      $app.save(record)
      return
    }
  } catch (rateErr) {
    // se falhar ao consultar registros anteriores, prossegue
  }

  // 3. Obter token protegido do ambiente
  const rawToken = $os.getenv('TRADEPRO_BASIC_TOKEN') || ''
  if (!rawToken.trim()) {
    record.set('status', 'error')
    record.set('connected', false)
    record.set('http_status', 400)
    record.set('has_data', false)
    record.set('records_received', 0)
    record.set('total_records_reported', 0)
    record.set('latency_ms', 0)
    record.set('message', 'Integração não configurada. Cadastre o token protegido no Skip Cloud.')
    record.set('error_code', 'not_configured')
    record.set('finished_at', new Date().toISOString())
    $app.save(record)
    return
  }

  // 4. Montar cabeçalho Authorization
  const trimmedToken = rawToken.trim()
  const authHeader = trimmedToken.startsWith('Basic ') ? trimmedToken : 'Basic ' + trimmedToken

  const url =
    'https://diretoria.tradepro.com.br/diretoria/servicos/v1/relatorio-rupturas/' +
    dateStart +
    '/' +
    dateEnd +
    '?paginaAtual=1&quantidadePorPagina=1&agruparUltimaColetaDoProdutoDoMesmoCliente=1'

  // 5. Executar UMA chamada HTTP, sem retry, timeout 20s
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
  const finishedAt = new Date().toISOString()
  record.set('latency_ms', latencyMs)
  record.set('finished_at', finishedAt)

  if (httpError || !res) {
    const errStr = String(httpError || '')
    let isTimeout = errStr.toLowerCase().indexOf('timeout') !== -1 || latencyMs >= 19000
    record.set('status', 'error')
    record.set('connected', false)
    record.set('http_status', 0)
    record.set('has_data', false)
    record.set('records_received', 0)
    record.set('total_records_reported', 0)
    record.set('error_code', isTimeout ? 'timeout' : 'tradepro_unavailable')
    record.set(
      'message',
      isTimeout
        ? 'Serviço não respondeu dentro do limite de 20 segundos.'
        : 'Erro de comunicação ao conectar à API TradePro.',
    )
    $app.save(record)
    return
  }

  const statusCode = res.statusCode || 0
  record.set('http_status', statusCode)

  if (statusCode === 200) {
    let jsonBody = null
    try {
      jsonBody = res.json
    } catch (_) {}

    let totalDeRegistros = 0
    let possuiDados = false
    let registrosRecebidos = 0

    if (jsonBody && typeof jsonBody === 'object') {
      if (typeof jsonBody.totalDeRegistros === 'number') {
        totalDeRegistros = jsonBody.totalDeRegistros
      } else if (typeof jsonBody.totalDeRegistros === 'string') {
        const parsed = parseInt(jsonBody.totalDeRegistros, 10)
        totalDeRegistros = isNaN(parsed) ? 0 : parsed
      }

      const list = jsonBody.rupturas || jsonBody.data || jsonBody.registros
      if (Array.isArray(list) && list.length > 0) {
        possuiDados = true
        registrosRecebidos = list.length
      } else if (totalDeRegistros > 0) {
        possuiDados = true
        registrosRecebidos = 1
      }
    }

    record.set('status', 'success')
    record.set('connected', true)
    record.set('has_data', possuiDados)
    record.set('records_received', registrosRecebidos)
    record.set('total_records_reported', totalDeRegistros)
    record.set('message', 'Conexão realizada com sucesso.')
    record.set('error_code', '')
  } else if (statusCode === 204) {
    record.set('status', 'success')
    record.set('connected', true)
    record.set('has_data', false)
    record.set('records_received', 0)
    record.set('total_records_reported', 0)
    record.set('message', 'Conexão válida, sem ocorrências no período.')
    record.set('error_code', '')
  } else if (statusCode === 401) {
    record.set('status', 'error')
    record.set('connected', false)
    record.set('has_data', false)
    record.set('records_received', 0)
    record.set('total_records_reported', 0)
    record.set('error_code', 'unauthorized')
    record.set('message', 'Token inválido ou autenticação recusada.')
  } else if (statusCode === 403) {
    record.set('status', 'error')
    record.set('connected', false)
    record.set('has_data', false)
    record.set('records_received', 0)
    record.set('total_records_reported', 0)
    record.set('error_code', 'forbidden')
    record.set('message', 'Usuário sem permissão para acessar o recurso.')
  } else if (statusCode === 404) {
    record.set('status', 'error')
    record.set('connected', false)
    record.set('has_data', false)
    record.set('records_received', 0)
    record.set('total_records_reported', 0)
    record.set('error_code', 'internal_error')
    record.set('message', 'Recurso não encontrado na API TradePro.')
  } else if (statusCode === 429) {
    record.set('status', 'error')
    record.set('connected', false)
    record.set('has_data', false)
    record.set('records_received', 0)
    record.set('total_records_reported', 0)
    record.set('error_code', 'rate_limited')
    record.set('message', 'Limite temporário de requisições. Aguarde antes de tentar novamente.')
  } else if (statusCode >= 500) {
    record.set('status', 'error')
    record.set('connected', false)
    record.set('has_data', false)
    record.set('records_received', 0)
    record.set('total_records_reported', 0)
    record.set('error_code', 'tradepro_unavailable')
    record.set('message', 'Serviço TradePro indisponível no momento.')
  } else {
    record.set('status', 'error')
    record.set('connected', false)
    record.set('has_data', false)
    record.set('records_received', 0)
    record.set('total_records_reported', 0)
    record.set('error_code', 'internal_error')
    record.set('message', 'Falha na resposta do servidor TradePro (HTTP ' + statusCode + ').')
  }

  $app.save(record)
}, 'tradepro_connection_jobs')
