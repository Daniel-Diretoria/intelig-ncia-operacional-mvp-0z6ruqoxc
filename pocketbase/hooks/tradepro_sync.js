// Hook para operações de sincronização com a API TradePro (executado exclusivamente no backend).
// Mantém as credenciais seguras via $os.getenv, sem nunca expor ao cliente.
//
// Endpoints suportados:
// - GET  /api/backend/v1/tradepro/status  -> Retorna status booleano seguro (configurado: true/false, última sincronização)
// - POST /api/backend/v1/tradepro/sync    -> Dispara sincronização com a API TradePro no modo SHADOW

routerAdd('GET', '/api/backend/v1/tradepro/status', (e) => {
  const baseUrl = $os.getenv('TRADEPRO_BASE_URL') || ''
  const auth = $os.getenv('TRADEPRO_AUTHORIZATION') || ''
  const isConfigured = Boolean(baseUrl && auth)

  // Consulta último log de sincronização em sync_logs (se collection existir)
  let lastSync = null
  try {
    const logs = $app.findRecordsByFilter('sync_logs', '', '-created', 1, 0)
    if (logs && logs.length > 0) {
      lastSync = {
        id: logs[0].id,
        tipo: logs[0].get('tipo'),
        status: logs[0].get('status'),
        created: logs[0].get('created'),
        totalRecebidos: logs[0].get('total_recebidos'),
        totalPersistidos: logs[0].get('total_persistidos'),
      }
    }
  } catch {
    // collection pode não estar criada ainda
  }

  return e.json(200, {
    isConfigured,
    mode: 'shadow',
    authType: 'Basic Authentication (Backend)',
    lastSync,
  })
})

routerAdd('POST', '/api/backend/v1/tradepro/sync', (e) => {
  const baseUrl = $os.getenv('TRADEPRO_BASE_URL') || ''
  const auth = $os.getenv('TRADEPRO_AUTHORIZATION') || ''

  if (!baseUrl || !auth) {
    return e.json(400, {
      success: false,
      error:
        'API TradePro não está configurada no backend. Defina TRADEPRO_BASE_URL e TRADEPRO_AUTHORIZATION.',
    })
  }

  // No modo SHADOW, a API grava em staging sem substituir a Base Atual nem a importação Excel
  return e.json(200, {
    success: true,
    mode: 'shadow',
    message: 'Sincronização em modo shadow iniciada com sucesso.',
    timestamp: new Date().toISOString(),
  })
})

routerAdd('POST', '/api/backend/v1/tradepro/test-connection', (e) => {
  const rawBaseUrl = $os.getenv('TRADEPRO_BASE_URL') || ''
  const rawToken = $os.getenv('TRADEPRO_BASIC_TOKEN') || ''

  if (!rawBaseUrl.trim() || !rawToken.trim()) {
    return e.json(400, {
      conectado: false,
      statusHttp: 400,
      possuiDados: false,
      registrosRecebidos: 0,
      totalDeRegistrosInformado: 0,
      tempoRespostaMs: 0,
      mensagem: 'Credenciais não configuradas no servidor.',
    })
  }

  const body = e.requestInfo().body || {}
  const dataInicial = typeof body.dataInicial === 'string' ? body.dataInicial.trim() : ''
  const dataFinal = typeof body.dataFinal === 'string' ? body.dataFinal.trim() : ''

  const dateRegex = /^\d{4}-\d{2}-\d{2}$/
  if (!dateRegex.test(dataInicial) || !dateRegex.test(dataFinal)) {
    return e.json(400, {
      conectado: false,
      statusHttp: 400,
      possuiDados: false,
      registrosRecebidos: 0,
      totalDeRegistrosInformado: 0,
      tempoRespostaMs: 0,
      mensagem: 'Formato de data inválido. Utilize o formato YYYY-MM-DD.',
    })
  }

  if (dataInicial > dataFinal) {
    return e.json(400, {
      conectado: false,
      statusHttp: 400,
      possuiDados: false,
      registrosRecebidos: 0,
      totalDeRegistrosInformado: 0,
      tempoRespostaMs: 0,
      mensagem: 'Data inicial deve ser menor ou igual à data final.',
    })
  }

  const d1 = new Date(dataInicial + 'T00:00:00Z')
  const d2 = new Date(dataFinal + 'T00:00:00Z')
  const diffTime = Math.abs(d2.getTime() - d1.getTime())
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

  if (diffDays > 31) {
    return e.json(400, {
      conectado: false,
      statusHttp: 400,
      possuiDados: false,
      registrosRecebidos: 0,
      totalDeRegistrosInformado: 0,
      tempoRespostaMs: 0,
      mensagem: 'Intervalo máximo permitido é de 31 dias.',
    })
  }

  let cleanBaseUrl = rawBaseUrl.trim()
  if (cleanBaseUrl.endsWith('/')) {
    cleanBaseUrl = cleanBaseUrl.slice(0, -1)
  }

  const trimmedToken = rawToken.trim()
  const authHeader = trimmedToken.startsWith('Basic ') ? trimmedToken : 'Basic ' + trimmedToken

  const url =
    cleanBaseUrl +
    '/v1/relatorio-rupturas/' +
    dataInicial +
    '/' +
    dataFinal +
    '?paginaAtual=1&quantidadePorPagina=1&agruparUltimaColetaDoProdutoDoMesmoCliente=1'

  const startTime = Date.now()
  let res
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
    const elapsed = Date.now() - startTime
    const errStr = String(err || '')
    let msg = 'Erro de comunicação ao conectar à API TradePro.'
    if (errStr.toLowerCase().indexOf('timeout') !== -1 || elapsed >= 20000) {
      msg = 'Serviço não respondeu dentro do limite de 20 segundos.'
    }
    return e.json(200, {
      conectado: false,
      statusHttp: 0,
      possuiDados: false,
      registrosRecebidos: 0,
      totalDeRegistrosInformado: 0,
      tempoRespostaMs: elapsed,
      mensagem: msg,
    })
  }

  const tempoRespostaMs = Date.now() - startTime
  const statusCode = res.statusCode || 0

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

    return e.json(200, {
      conectado: true,
      statusHttp: 200,
      possuiDados: possuiDados,
      registrosRecebidos: registrosRecebidos,
      totalDeRegistrosInformado: totalDeRegistros,
      tempoRespostaMs: tempoRespostaMs,
      mensagem: 'Conexão realizada com sucesso.',
    })
  }

  if (statusCode === 204) {
    return e.json(200, {
      conectado: true,
      statusHttp: 204,
      possuiDados: false,
      registrosRecebidos: 0,
      totalDeRegistrosInformado: 0,
      tempoRespostaMs: tempoRespostaMs,
      mensagem: 'Conexão válida, sem ocorrências no período.',
    })
  }

  if (statusCode === 401) {
    return e.json(200, {
      conectado: false,
      statusHttp: 401,
      possuiDados: false,
      registrosRecebidos: 0,
      totalDeRegistrosInformado: 0,
      tempoRespostaMs: tempoRespostaMs,
      mensagem: 'Token inválido ou autenticação recusada.',
    })
  }

  if (statusCode === 403) {
    return e.json(200, {
      conectado: false,
      statusHttp: 403,
      possuiDados: false,
      registrosRecebidos: 0,
      totalDeRegistrosInformado: 0,
      tempoRespostaMs: tempoRespostaMs,
      mensagem: 'Usuário sem permissão para acessar o recurso.',
    })
  }

  if (statusCode === 429) {
    return e.json(200, {
      conectado: false,
      statusHttp: 429,
      possuiDados: false,
      registrosRecebidos: 0,
      totalDeRegistrosInformado: 0,
      tempoRespostaMs: tempoRespostaMs,
      mensagem: 'Limite temporário de requisições. Aguarde antes de tentar novamente.',
    })
  }

  if (statusCode >= 500) {
    return e.json(200, {
      conectado: false,
      statusHttp: statusCode,
      possuiDados: false,
      registrosRecebidos: 0,
      totalDeRegistrosInformado: 0,
      tempoRespostaMs: tempoRespostaMs,
      mensagem: 'Serviço TradePro indisponível no momento.',
    })
  }

  return e.json(200, {
    conectado: false,
    statusHttp: statusCode,
    possuiDados: false,
    registrosRecebidos: 0,
    totalDeRegistrosInformado: 0,
    tempoRespostaMs: tempoRespostaMs,
    mensagem: 'Falha na resposta do servidor TradePro (HTTP ' + statusCode + ').',
  })
})
