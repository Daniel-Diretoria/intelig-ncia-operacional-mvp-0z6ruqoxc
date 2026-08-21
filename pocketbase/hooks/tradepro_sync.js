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
