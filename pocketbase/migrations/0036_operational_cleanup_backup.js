migrate(
  (app) => {
    // 1. Coleção para backups de segurança antes de limpezas operacionais
    const backupCollection = new Collection({
      name: 'operational_data_backups',
      type: 'base',
      listRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
      viewRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
      createRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
      updateRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
      deleteRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
      fields: [
        { name: 'backup_code', type: 'text', required: true },
        { name: 'motivo', type: 'text', required: true },
        { name: 'executado_por_id', type: 'text', required: true },
        { name: 'executado_por_nome', type: 'text', required: true },
        { name: 'executado_por_email', type: 'text' },
        { name: 'validades_count', type: 'number' },
        { name: 'rupturas_count', type: 'number' },
        { name: 'derived_cross_count', type: 'number' },
        { name: 'derived_audit_count', type: 'number' },
        { name: 'snapshot_json', type: 'json' },
        {
          name: 'status',
          type: 'select',
          values: ['ativo', 'restaurado', 'expirado'],
          required: true,
        },
        { name: 'data_criacao', type: 'text', required: true },
        { name: 'restaurado_em', type: 'text' },
        { name: 'restaurado_por', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_op_backup_code ON operational_data_backups (backup_code)',
        'CREATE INDEX idx_op_backup_status ON operational_data_backups (status)',
        'CREATE INDEX idx_op_backup_created ON operational_data_backups (created DESC)',
      ],
    })
    app.save(backupCollection)

    // 2. Expandir coleção user_audit_log se necessário para permitir novas ações de limpeza e restauração
    try {
      const userAuditLog = app.findCollectionByNameOrId('user_audit_log')
      const acaoField = userAuditLog.fields.getByName('acao')
      if (acaoField && acaoField.values) {
        const existingValues = acaoField.values || []
        const newActions = [
          'limpeza_operacional_executada',
          'backup_operacional_restaurado',
          'limpeza_operacional_preparada',
        ]
        let modified = false
        for (let i = 0; i < newActions.length; i++) {
          if (existingValues.indexOf(newActions[i]) === -1) {
            existingValues.push(newActions[i])
            modified = true
          }
        }
        if (modified) {
          acaoField.values = existingValues
          app.save(userAuditLog)
        }
      }
    } catch (_) {}
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('operational_data_backups')
      app.delete(col)
    } catch (_) {}
  },
)
