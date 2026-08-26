migrate(
  (app) => {
    // ---------------------------------------------------------------------------
    // Collection: tradepro_connection_jobs
    // Transporte assíncrono/síncrono nativo para testes de conexão com a API TradePro
    // ---------------------------------------------------------------------------
    const usersColId = '_pb_users_auth_'

    // Regras de acesso (fail-closed):
    // list/view: apenas dono autenticado
    // create: apenas usuário autenticado
    // update/delete: superuser/backend only (null)
    const ownerRule = '@request.auth.id != "" && requested_by = @request.auth.id'
    const createRule = '@request.auth.id != ""'

    const collection = new Collection({
      name: 'tradepro_connection_jobs',
      type: 'base',
      listRule: ownerRule,
      viewRule: ownerRule,
      createRule: createRule,
      updateRule: null,
      deleteRule: null,
      fields: [
        {
          name: 'action',
          type: 'select',
          required: true,
          values: ['test_connection'],
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
        { name: 'date_start', type: 'date', required: true },
        { name: 'date_end', type: 'date', required: true },
        {
          name: 'status',
          type: 'select',
          required: true,
          values: ['pending', 'processing', 'success', 'error'],
          maxSelect: 1,
        },
        { name: 'connected', type: 'bool' },
        { name: 'http_status', type: 'number', onlyInt: true },
        { name: 'has_data', type: 'bool' },
        { name: 'records_received', type: 'number', onlyInt: true },
        { name: 'total_records_reported', type: 'number', onlyInt: true },
        { name: 'latency_ms', type: 'number', onlyInt: true },
        { name: 'message', type: 'text' },
        {
          name: 'error_code',
          type: 'select',
          required: false,
          values: [
            'not_configured',
            'invalid_period',
            'unauthorized',
            'forbidden',
            'rate_limited',
            'timeout',
            'tradepro_unavailable',
            'internal_error',
          ],
          maxSelect: 1,
        },
        { name: 'started_at', type: 'date' },
        { name: 'finished_at', type: 'date' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_tradepro_jobs_user ON tradepro_connection_jobs (requested_by, created DESC)',
        'CREATE INDEX idx_tradepro_jobs_status ON tradepro_connection_jobs (status)',
      ],
    })

    app.save(collection)
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId('tradepro_connection_jobs')
      app.delete(collection)
    } catch (_) {}
  },
)
