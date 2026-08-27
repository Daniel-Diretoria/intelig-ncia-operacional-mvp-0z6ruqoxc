migrate(
  (app) => {
    // Re-disparar job de teste de Validades para validação do hook unificado
    // Job: q3yok02vojau9pn
    try {
      const job = app.findRecordById('tradepro_sync_jobs', 'q3yok02vojau9pn')
      job.set('date_start', '2026-08-01')
      job.set('date_end', '2026-08-26')
      job.set('status', 'pending')
      job.set('started_at', '')
      job.set('finished_at', '')
      job.set('message', '')
      job.set('error_code', '')
      job.set('total_informado', 0)
      job.set('paginas_total', 0)
      job.set('paginas_processadas', 0)
      job.set('registros_lidos', 0)
      job.set('registros_validos', 0)
      job.set('registros_rejeitados', 0)
      job.set('registros_deduplicados', 0)
      job.set('registros_consolidados', 0)
      app.save(job)
    } catch (err) {
      console.log('Erro ao re-disparar job q3yok02vojau9pn: ' + err)
    }
  },
  (app) => {
    // Revert opcional
  },
)
