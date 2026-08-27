migrate(
  (app) => {
    // ---------------------------------------------------------------------------
    // Migração 0019: Adicionar 'sync_validades' ao campo `action` de `tradepro_sync_jobs`
    // ---------------------------------------------------------------------------
    const syncJobsCol = app.findCollectionByNameOrId('tradepro_sync_jobs')
    if (syncJobsCol) {
      const actionField = syncJobsCol.fields.getByName('action')
      if (actionField) {
        const existingValues = Array.isArray(actionField.values) ? actionField.values : []
        if (!existingValues.includes('sync_validades')) {
          actionField.values = [...existingValues, 'sync_validades']
          app.save(syncJobsCol)
        }
      }
    }
  },
  (app) => {
    const syncJobsCol = app.findCollectionByNameOrId('tradepro_sync_jobs')
    if (syncJobsCol) {
      const actionField = syncJobsCol.fields.getByName('action')
      if (actionField) {
        const existingValues = Array.isArray(actionField.values) ? actionField.values : []
        actionField.values = existingValues.filter((v) => v !== 'sync_validades')
        app.save(syncJobsCol)
      }
    }
  },
)
