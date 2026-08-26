// Hook de autenticação e health check para o app
// Endpoints suportados:
// - GET  /api/backend/v1/app-health  -> Retorna status do backend { ok: true, timestamp: ISO }
// - POST /api/backend/v1/app-login   -> Proxy de autenticação server-to-server

routerAdd('GET', '/api/backend/v1/app-health', (e) => {
  return e.json(200, {
    ok: true,
    timestamp: new Date().toISOString(),
  })
})

routerAdd('POST', '/api/backend/v1/app-login', (e) => {
  // 1. Rate limit por IP (10 tentativas por minuto)
  try {
    const clientIp = e.requestInfo().remoteIP || 'unknown'
    const nowMs = Date.now()
    const windowKey = 'rate_login_' + clientIp + '_' + Math.floor(nowMs / 60000)

    let currentAttempts = 0
    if ($app.cache().has(windowKey)) {
      currentAttempts = Number($app.cache().get(windowKey)) || 0
    }

    if (currentAttempts >= 10) {
      return e.json(429, {
        success: false,
        error: 'Muitas tentativas de login. Aguarde um minuto antes de tentar novamente.',
      })
    }

    $app.cache().set(windowKey, currentAttempts + 1)
  } catch (_) {
    // Falha silenciosa no rate-limit para não travar login caso o cache não responda
  }

  // 2. Extração e validação do body
  const body = e.requestInfo().body || {}
  const rawEmail = typeof body.email === 'string' ? body.email : ''
  const password = typeof body.password === 'string' ? body.password : ''

  const email = rawEmail.trim().toLowerCase()

  if (!email || !password) {
    return e.json(400, {
      success: false,
      error: 'E-mail e senha são obrigatórios.',
    })
  }

  // 3. Obter URL do PocketBase interno
  let pbInstanceUrl = $os.getenv('PB_INSTANCE_URL') || ''
  if (!pbInstanceUrl) {
    pbInstanceUrl = 'http://127.0.0.1:8090'
  }
  if (pbInstanceUrl.endsWith('/')) {
    pbInstanceUrl = pbInstanceUrl.slice(0, -1)
  }

  const authUrl = pbInstanceUrl + '/api/collections/users/auth-with-password'

  // 4. Chamada servidor->servidor para autenticação
  let res
  try {
    res = $http.send({
      url: authUrl,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        identity: email,
        password: password,
      }),
      timeout: 10,
    })
  } catch (err) {
    return e.json(503, {
      success: false,
      error: 'Serviço de autenticação indisponível.',
    })
  }

  const statusCode = res.statusCode || 0

  if (statusCode === 200) {
    const data = res.json || {}
    const token = data.token || ''
    const record = data.record || {}

    return e.json(200, {
      success: true,
      token: token,
      record: {
        id: record.id || '',
        email: record.email || '',
        name: record.name || '',
        role: record.role || 'Administrador',
        verified: Boolean(record.verified),
      },
    })
  }

  if (statusCode === 400) {
    return e.json(401, {
      success: false,
      error: 'E-mail ou senha inválidos.',
    })
  }

  return e.json(503, {
    success: false,
    error: 'Serviço de autenticação indisponível.',
  })
})
