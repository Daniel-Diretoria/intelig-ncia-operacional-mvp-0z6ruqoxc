migrate(
  (app) => {
    const authRule = '@request.auth.id != ""'

    // ---------------------------------------------------------------------------
    // Collection: rupturas_imports — controle de importações de Rupturas
    // (análoga a import_history, porém específica do módulo de Rupturas).
    // ---------------------------------------------------------------------------
    const rupturasImports = new Collection({
      name: 'rupturas_imports',
      type: 'base',
      listRule: authRule,
      viewRule: authRule,
      createRule: authRule,
      updateRule: authRule,
      deleteRule: authRule,
      fields: [
        { name: 'tenant_id', type: 'text' },
        { name: 'file_name', type: 'text' },
        { name: 'file_hash', type: 'text' },
        { name: 'total_rows_read', type: 'number', onlyInt: true },
        { name: 'total_rows_valid', type: 'number', onlyInt: true },
        { name: 'total_rows_invalid', type: 'number', onlyInt: true },
        { name: 'total_raw_rows_saved', type: 'number', onlyInt: true },
        { name: 'total_rows_processed', type: 'number', onlyInt: true },
        { name: 'total_occurrences_generated', type: 'number', onlyInt: true },
        { name: 'total_audit_records', type: 'number', onlyInt: true },
        { name: 'total_historical_records', type: 'number', onlyInt: true },
        {
          name: 'status',
          type: 'select',
          required: false,
          values: [
            'Recebida',
            'Validando',
            'Processando',
            'Consolidando',
            'Concluída',
            'Concluída com rejeições',
            'Falhou',
            'Cancelada',
          ],
          maxSelect: 1,
        },
        { name: 'error_message', type: 'text' },
        { name: 'batch_config', type: 'json' },
        { name: 'created_at', type: 'text' },
        { name: 'completed_at', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_rupturas_imports_hash ON rupturas_imports (file_hash)',
        'CREATE INDEX idx_rupturas_imports_status ON rupturas_imports (status)',
        'CREATE INDEX idx_rupturas_imports_tenant ON rupturas_imports (tenant_id)',
      ],
    })
    app.save(rupturasImports)

    const rupturasImportsColId = app.findCollectionByNameOrId('rupturas_imports').id

    // ---------------------------------------------------------------------------
    // Collection: rupturas_base — registros vigentes de Rupturas (após dedup).
    // Um registro por Chave Dedup (codigo_loja|produto|cliente), is_base_atual=true.
    // ---------------------------------------------------------------------------
    const rupturasBase = new Collection({
      name: 'rupturas_base',
      type: 'base',
      listRule: authRule,
      viewRule: authRule,
      createRule: authRule,
      updateRule: authRule,
      deleteRule: authRule,
      fields: [
        { name: 'tenant_id', type: 'text' },
        { name: 'produto', type: 'text' },
        {
          name: 'motivo',
          type: 'select',
          required: false,
          values: ['Ruptura Total', 'Sem Estoque Mínimo', 'Estoque Virtual'],
          maxSelect: 1,
        },
        { name: 'codigo_loja', type: 'text' },
        { name: 'nome_loja', type: 'text' },
        { name: 'cnpj_loja', type: 'text' },
        { name: 'cidade', type: 'text' },
        { name: 'estado', type: 'text' },
        { name: 'codigo_cliente', type: 'text' },
        { name: 'cliente', type: 'text' },
        { name: 'colaborador', type: 'text' },
        { name: 'categoria', type: 'text' },
        { name: 'observacao', type: 'text' },
        { name: 'data_visita', type: 'text' },
        { name: 'data_entrada', type: 'text' },
        { name: 'ultima_aparicao', type: 'text' },
        {
          name: 'situacao_atual',
          type: 'select',
          required: false,
          values: ['Ativo', 'Resolvido'],
          maxSelect: 1,
        },
        { name: 'operational_key', type: 'text' },
        { name: 'dedup_key', type: 'text' },
        {
          name: 'source_import_id',
          type: 'relation',
          required: false,
          collectionId: rupturasImportsColId,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'source_row', type: 'number', onlyInt: true },
        { name: 'is_base_atual', type: 'bool' },
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
        'CREATE INDEX idx_rupturas_base_operational ON rupturas_base (operational_key)',
        'CREATE INDEX idx_rupturas_base_dedup ON rupturas_base (dedup_key)',
        'CREATE INDEX idx_rupturas_base_situacao ON rupturas_base (situacao_atual)',
        'CREATE INDEX idx_rupturas_base_loja ON rupturas_base (codigo_loja)',
        'CREATE INDEX idx_rupturas_base_cliente ON rupturas_base (cliente)',
        'CREATE INDEX idx_rupturas_base_visita ON rupturas_base (data_visita)',
        'CREATE INDEX idx_rupturas_base_import ON rupturas_base (source_import_id)',
      ],
    })
    app.save(rupturasBase)

    const rupturasBaseColId = app.findCollectionByNameOrId('rupturas_base').id

    // ---------------------------------------------------------------------------
    // Collection: rupturas_historico — trilha de auditoria das rupturas.
    // Um registro por evento (criacao/atualizacao/resolucao/encerramento).
    // ---------------------------------------------------------------------------
    const rupturasHistorico = new Collection({
      name: 'rupturas_historico',
      type: 'base',
      listRule: authRule,
      viewRule: authRule,
      createRule: authRule,
      updateRule: authRule,
      deleteRule: authRule,
      fields: [
        {
          name: 'ruptura_base_id',
          type: 'relation',
          required: false,
          collectionId: rupturasBaseColId,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'tenant_id', type: 'text' },
        {
          name: 'evento',
          type: 'select',
          required: false,
          values: ['criacao', 'atualizacao', 'resolucao', 'encerramento'],
          maxSelect: 1,
        },
        { name: 'dados_anteriores', type: 'json' },
        { name: 'dados_novos', type: 'json' },
        { name: 'data_evento', type: 'text' },
        {
          name: 'source_import_id',
          type: 'relation',
          required: false,
          collectionId: rupturasImportsColId,
          cascadeDelete: true,
          maxSelect: 1,
        },
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
        'CREATE INDEX idx_rupturas_historico_base ON rupturas_historico (ruptura_base_id)',
        'CREATE INDEX idx_rupturas_historico_evento ON rupturas_historico (evento)',
        'CREATE INDEX idx_rupturas_historico_import ON rupturas_historico (source_import_id)',
      ],
    })
    app.save(rupturasHistorico)
  },
  (app) => {
    const names = ['rupturas_historico', 'rupturas_base', 'rupturas_imports']
    for (const n of names) {
      try {
        const c = app.findCollectionByNameOrId(n)
        app.delete(c)
      } catch (_) {}
    }
  },
)
