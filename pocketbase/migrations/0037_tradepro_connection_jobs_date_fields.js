migrate(
  (app) => {
    // Diagnóstico e correção: alterar date_start e date_end de tradepro_connection_jobs de date para text
    try {
      const jobsCol = app.findCollectionByNameOrId('tradepro_connection_jobs')

      const dateStartField = jobsCol.fields.getByName('date_start')
      if (dateStartField && dateStartField.type === 'date') {
        jobsCol.fields.removeByName('date_start')
        jobsCol.fields.add(new TextField({ name: 'date_start', required: true }))
      }

      const dateEndField = jobsCol.fields.getByName('date_end')
      if (dateEndField && dateEndField.type === 'date') {
        jobsCol.fields.removeByName('date_end')
        jobsCol.fields.add(new TextField({ name: 'date_end', required: true }))
      }

      app.save(jobsCol)
      console.log(
        '[Migration 0037] tradepro_connection_jobs date_start e date_end convertidos para text.',
      )
    } catch (err) {
      console.log('[Migration 0037] Erro ao atualizar fields de tradepro_connection_jobs:', err)
      throw err
    }
  },
  (app) => {
    try {
      const jobsCol = app.findCollectionByNameOrId('tradepro_connection_jobs')
      jobsCol.fields.removeByName('date_start')
      jobsCol.fields.add(new DateField({ name: 'date_start', required: true }))
      jobsCol.fields.removeByName('date_end')
      jobsCol.fields.add(new DateField({ name: 'date_end', required: true }))
      app.save(jobsCol)
    } catch (_) {}
  },
)
