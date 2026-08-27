migrate(
  (app) => {
    // Para testar o hook no job existente q3yok02vojau9pn:
    // O hook é onRecordAfterCreateSuccess (para 'pending') e onRecordAfterUpdateSuccess (para 'syncing')
    // Se precisarmos que o hook execute para q3yok02vojau9pn como Create, podemos clonar ou se quisermos testar outro período:
    try {
      const orig = app.findRecordById('tradepro_sync_jobs', 'q3yok02vojau9pn')
      // Deixamos q3yok02vojau9pn com date_start='2026-08-01' e date_end='2026-08-26'
      orig.set('date_start', '2026-08-01')
      orig.set('date_end', '2026-08-26')
      app.save(orig)
    } catch (_) {}
  },
  (app) => {},
)
