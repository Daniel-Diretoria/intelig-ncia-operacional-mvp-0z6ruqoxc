migrate(
  (app) => {
    // 1. Atualizar sync_logs com status='Processando' (ou 'processing') criados há mais de 30 minutos -> 'Interrompido'
    try {
      app
        .db()
        .newQuery(`
        UPDATE sync_logs 
        SET status = 'Interrompido', 
            errors_json = json_array('Interrompido por timeout de execução')
        WHERE (status = 'Processando' OR status = 'processing' OR status = 'pending')
          AND datetime(created) < datetime('now', '-30 minutes')
      `)
        .execute()
    } catch (err) {
      console.warn('Erro ao atualizar sync_logs presos:', err)
    }

    // 2. Atualizar rupturas_imports com status='Processando' criados há mais de 30 minutos -> 'Interrompido'
    try {
      app
        .db()
        .newQuery(`
        UPDATE rupturas_imports 
        SET status = 'Interrompido', 
            error_message = 'Interrompido por timeout de execução (> 30 min)'
        WHERE (status = 'Processando' OR status = 'processing' OR status = 'Pendente')
          AND datetime(created) < datetime('now', '-30 minutes')
      `)
        .execute()
    } catch (err) {
      console.warn('Erro ao atualizar rupturas_imports presos:', err)
    }

    // 3. Atualizar import_history com status='processing' criados há mais de 30 minutos -> 'Interrompido'
    try {
      app
        .db()
        .newQuery(`
        UPDATE import_history 
        SET status = 'Interrompido', 
            errors_json = json_array(json_object('error', 'Interrompido por timeout de execução (> 30 min)'))
        WHERE (status = 'processing' OR status = 'Processando' OR status = 'pending')
          AND datetime(created) < datetime('now', '-30 minutes')
      `)
        .execute()
    } catch (err) {
      console.warn('Erro ao atualizar import_history presos:', err)
    }
  },
  (app) => {
    // Reversão não necessária para limpeza de jobs presos
  },
)
