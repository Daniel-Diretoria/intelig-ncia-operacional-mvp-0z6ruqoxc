migrate(
  (app) => {
    // 1. Atualizar select field error_code em tradepro_connection_jobs para incluir 'precondition_failed'
    try {
      const jobsCol = app.findCollectionByNameOrId('tradepro_connection_jobs')
      const errorCodeField = jobsCol.fields.getByName('error_code')
      if (errorCodeField) {
        const currentValues = errorCodeField.values || []
        if (!currentValues.includes('precondition_failed')) {
          errorCodeField.values = [
            'not_configured',
            'invalid_period',
            'unauthorized',
            'forbidden',
            'precondition_failed',
            'rate_limited',
            'timeout',
            'tradepro_unavailable',
            'internal_error',
          ]
          errorCodeField.maxSelect = 1
          app.save(jobsCol)
        }
      }
    } catch (e) {
      console.log('[Migration 0015] Erro ao atualizar error_code em tradepro_connection_jobs:', e)
    }

    // 2. Adicionar índices para is_base_atual em validades_base e rupturas_base (usando col.addIndex)
    try {
      const validadesCol = app.findCollectionByNameOrId('validades_base')
      validadesCol.addIndex('idx_validades_base_atual', false, 'is_base_atual', '')
      app.save(validadesCol)
    } catch (e) {
      console.log('[Migration 0015] Erro ao adicionar idx_validades_base_atual:', e)
    }

    try {
      const rupturasCol = app.findCollectionByNameOrId('rupturas_base')
      rupturasCol.addIndex('idx_rupturas_base_atual', false, 'is_base_atual', '')
      app.save(rupturasCol)
    } catch (e) {
      console.log('[Migration 0015] Erro ao adicionar idx_rupturas_base_atual:', e)
    }
  },
  (app) => {
    try {
      const validadesCol = app.findCollectionByNameOrId('validades_base')
      validadesCol.removeIndex('idx_validades_base_atual')
      app.save(validadesCol)
    } catch (_) {}

    try {
      const rupturasCol = app.findCollectionByNameOrId('rupturas_base')
      rupturasCol.removeIndex('idx_rupturas_base_atual')
      app.save(rupturasCol)
    } catch (_) {}
  },
)
