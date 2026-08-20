migrate(
  (app) => {
    const authRule = '@request.auth.id != ""'

    // Collection: sync_logs — logs de sincronizações via API TradePro
    const syncLogs = new Collection({
      name: 'sync_logs',
      type: 'base',
      listRule: authRule,
      viewRule: authRule,
      createRule: authRule,
      updateRule: authRule,
      deleteRule: authRule,
      fields: [
        { name: 'tipo', type: 'text' },
        {
          name: 'status',
          type: 'select',
          required: false,
          values: ['success', 'partial', 'error'],
          maxSelect: 1,
        },
        { name: 'total_rows', type: 'number', onlyInt: true },
        { name: 'new_rows', type: 'number', onlyInt: true },
        { name: 'updated_rows', type: 'number', onlyInt: true },
        { name: 'errors', type: 'json' },
        { name: 'duration_ms', type: 'number', onlyInt: true },
        {
          name: 'created_by',
          type: 'relation',
          required: false,
          collectionId: '_pb_users_auth_',
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_sync_logs_tipo ON sync_logs (tipo)',
        'CREATE INDEX idx_sync_logs_status ON sync_logs (status)',
        'CREATE INDEX idx_sync_logs_created ON sync_logs (created DESC)',
      ],
    })
    app.save(syncLogs)
  },
  (app) => {
    try {
      const c = app.findCollectionByNameOrId('sync_logs')
      app.delete(c)
    } catch (_) {}
  },
)
