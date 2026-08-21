migrate(
  (app) => {
    // 1. Atualizar registros presos em 'processing' há mais de 30 minutos em import_history
    // No SQLite / PocketBase, atualizamos o status para 'failed'
    try {
      app
        .db()
        .newQuery(`
        UPDATE import_history 
        SET status = 'failed', 
            errors_json = json_array(json_object('error', 'Interrompido por timeout do processo'))
        WHERE status = 'processing'
      `)
        .execute()
    } catch (err) {
      console.warn('Erro ao atualizar import_history presos:', err)
    }

    // 2. Atualizar registros presos em 'Processando' em rupturas_imports
    try {
      app
        .db()
        .newQuery(`
        UPDATE rupturas_imports 
        SET status = 'Falhou', 
            error_message = 'Interrompido por timeout do processo'
        WHERE status = 'Processando'
      `)
        .execute()
    } catch (err) {
      console.warn('Erro ao atualizar rupturas_imports presos:', err)
    }
  },
  (app) => {
    // Reversão não necessária para limpeza de jobs presos
  },
)
