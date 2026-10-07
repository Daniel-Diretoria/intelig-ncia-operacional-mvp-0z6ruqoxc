migrate(
  (app) => {
    // ---------------------------------------------------------------------------
    // Migração 0044: Adicionar 'sync_visitas' ao campo `action` de `tradepro_sync_jobs`
    // e índices de auditoria/deduplicação em `operacional_visitas`
    // ---------------------------------------------------------------------------
    const syncJobsCol = app.findCollectionByNameOrId('tradepro_sync_jobs')
    if (syncJobsCol) {
      const actionField = syncJobsCol.fields.getByName('action')
      if (actionField) {
        const existingValues = Array.isArray(actionField.values) ? actionField.values : []
        if (!existingValues.includes('sync_visitas')) {
          actionField.values = [...existingValues, 'sync_visitas']
          app.save(syncJobsCol)
        }
      }
    }

    // Adiciona índice único ou composto para busca por promotor, loja e data em operacional_visitas
    const visitasCol = app.findCollectionByNameOrId('operacional_visitas')
    if (visitasCol) {
      visitasCol.addIndex(
        'idx_visitas_dedup_promoter_store_data',
        false,
        'promoter_cod,store_code,data',
        '',
      )
      app.save(visitasCol)
    }
  },
  (app) => {
    try {
      const syncJobsCol = app.findCollectionByNameOrId('tradepro_sync_jobs')
      if (syncJobsCol) {
        const actionField = syncJobsCol.fields.getByName('action')
        if (actionField) {
          const existingValues = Array.isArray(actionField.values) ? actionField.values : []
          actionField.values = existingValues.filter((v) => v !== 'sync_visitas')
          app.save(syncJobsCol)
        }
      }

      const visitasCol = app.findCollectionByNameOrId('operacional_visitas')
      if (visitasCol) {
        visitasCol.removeIndex('idx_visitas_dedup_promoter_store_data')
        app.save(visitasCol)
      }
    } catch (_) {}
  },
)
