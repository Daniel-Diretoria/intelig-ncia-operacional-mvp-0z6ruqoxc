migrate(
  (app) => {
    // ---------------------------------------------------------------------------
    // Collection: tradepro_sync_jobs
    // Sincronização paginada e segura de Rupturas via API TradePro
    // ---------------------------------------------------------------------------
    const usersColId = '_pb_users_auth_'

    // Regras de acesso (fail-closed):
    // list/view: apenas dono autenticado
    // create: apenas usuário autenticado
    // update: apenas dono autenticado (para transição de status preview -> syncing / cancelled)
    // delete: superuser/backend only (null)
    const ownerRule = '@request.auth.id != "" && requested_by = @request.auth.id'
    const createRule = '@request.auth.id != ""'

    const collection = new Collection({
      name: 'tradepro_sync_jobs',
      type: 'base',
      listRule: ownerRule,
      viewRule: ownerRule,
      createRule: createRule,
      updateRule: ownerRule,
      deleteRule: null,
      fields: [
        {
          name: 'action',
          type: 'select',
          required: true,
          values: ['sync_rupturas'],
          maxSelect: 1,
        },
        {
          name: 'requested_by',
          type: 'relation',
          required: true,
          collectionId: usersColId,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'date_start', type: 'text', required: true },
        { name: 'date_end', type: 'text', required: true },
        {
          name: 'status',
          type: 'select',
          required: true,
          values: ['pending', 'preview', 'syncing', 'success', 'error', 'paused', 'cancelled'],
          maxSelect: 1,
        },
        { name: 'total_informado', type: 'number', onlyInt: true },
        { name: 'paginas_total', type: 'number', onlyInt: true },
        { name: 'paginas_processadas', type: 'number', onlyInt: true },
        { name: 'registros_lidos', type: 'number', onlyInt: true },
        { name: 'registros_validos', type: 'number', onlyInt: true },
        { name: 'registros_rejeitados', type: 'number', onlyInt: true },
        { name: 'registros_deduplicados', type: 'number', onlyInt: true },
        { name: 'registros_consolidados', type: 'number', onlyInt: true },
        {
          name: 'error_code',
          type: 'select',
          required: false,
          values: [
            'not_configured',
            'invalid_period',
            'unauthorized',
            'forbidden',
            'precondition_failed',
            'rate_limited',
            'timeout',
            'tradepro_unavailable',
            'internal_error',
          ],
          maxSelect: 1,
        },
        { name: 'message', type: 'text' },
        { name: 'started_at', type: 'date' },
        { name: 'finished_at', type: 'date' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_tradepro_sync_jobs_user ON tradepro_sync_jobs (requested_by, created DESC)',
        'CREATE INDEX idx_tradepro_sync_jobs_status ON tradepro_sync_jobs (status)',
      ],
    })

    app.save(collection)
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId('tradepro_sync_jobs')
      app.delete(collection)
    } catch (_) {}
  },
)
