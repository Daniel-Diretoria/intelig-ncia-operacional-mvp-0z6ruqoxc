migrate(
  (app) => {
    const syncJobsCol = app.findCollectionByNameOrId('tradepro_sync_jobs')
    if (!syncJobsCol.fields.getByName('amostra_estrutura_json')) {
      syncJobsCol.fields.add(
        new JSONField({
          name: 'amostra_estrutura_json',
          maxSize: 1048576, // 1MB
        }),
      )
      app.save(syncJobsCol)
    }
  },
  (app) => {
    try {
      const syncJobsCol = app.findCollectionByNameOrId('tradepro_sync_jobs')
      const f = syncJobsCol.fields.getByName('amostra_estrutura_json')
      if (f) {
        syncJobsCol.fields.removeByName('amostra_estrutura_json')
        app.save(syncJobsCol)
      }
    } catch (_) {}
  },
)
