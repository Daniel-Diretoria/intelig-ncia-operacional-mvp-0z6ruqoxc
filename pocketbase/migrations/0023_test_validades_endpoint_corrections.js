migrate(
  (app) => {
    try {
      const syncCol = app.findCollectionByNameOrId('tradepro_sync_jobs')
      const rec = new Record(syncCol)
      rec.set('id', 'testval00000002')
      rec.set('action', 'sync_validades')
      rec.set('status', 'pending')
      rec.set('date_start', '2026-08-01')
      rec.set('date_end', '2026-08-26')
      rec.set('requested_by', 'bumacp2xh84zjzu')
      rec.set('total_informado', 0)
      rec.set('paginas_total', 0)
      rec.set('paginas_processadas', 0)
      rec.set('registros_lidos', 0)
      rec.set('registros_validos', 0)
      rec.set('registros_rejeitados', 0)
      rec.set('registros_deduplicados', 0)
      rec.set('registros_consolidados', 0)
      app.save(rec)
    } catch (err) {
      console.log('Erro ao criar testval00000002: ' + err)
    }
  },
  (app) => {
    try {
      const rec = app.findRecordById('tradepro_sync_jobs', 'testval00000002')
      app.delete(rec)
    } catch (_) {}
  },
)
