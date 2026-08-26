migrate(
  (app) => {
    try {
      const record = app.findAuthRecordByEmail(
        '_pb_users_auth_',
        'rhuan.marx@diretoriapromocoes.com.br',
      )
      if (record) {
        record.setPassword('123456789')
        app.save(record)
      }
    } catch (_) {
      // Idempotente: se o usuário não existir, não falhar
    }
  },
  (app) => {
    // Rollback: não faz nada destrutivo
  },
)
