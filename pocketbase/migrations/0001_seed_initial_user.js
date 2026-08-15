migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')

    // Idempotente: não insere se o usuário já existir por email
    try {
      app.findAuthRecordByEmail('_pb_users_auth_', 'rhuan.marx@diretoriapromocoes.com.br')
      return // Já existe
    } catch (_) {}

    const record = new Record(users)
    record.setEmail('rhuan.marx@diretoriapromocoes.com.br')
    record.setPassword('Skip@Pass')
    record.setVerified(true)
    record.set('name', 'Rhuan Marx')
    app.save(record)
  },
  (app) => {
    try {
      const record = app.findAuthRecordByEmail(
        '_pb_users_auth_',
        'rhuan.marx@diretoriapromocoes.com.br',
      )
      app.delete(record)
    } catch (_) {}
  },
)
