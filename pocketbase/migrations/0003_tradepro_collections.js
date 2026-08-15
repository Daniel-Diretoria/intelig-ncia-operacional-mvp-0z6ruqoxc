migrate(
  (app) => {
    const authRule = '@request.auth.id != ""'

    // ---------------------------------------------------------------------------
    // Collection: validades_raw — dados brutos de cada importação (camada bruta)
    // Espelha TradeProRawRecord. Preserva identificadores como texto.
    // ---------------------------------------------------------------------------
    const validadesRaw = new Collection({
      name: 'validades_raw',
      type: 'base',
      listRule: authRule,
      viewRule: authRule,
      createRule: authRule,
      updateRule: authRule,
      deleteRule: authRule,
      fields: [
        { name: 'cod_colaborador', type: 'text' },
        { name: 'colaborador', type: 'text' },
        { name: 'cod_supervisor', type: 'text' },
        { name: 'supervisor', type: 'text' },
        { name: 'cpf_cnpj', type: 'text' },
        { name: 'razao_social', type: 'text' },
        { name: 'fantasia', type: 'text' },
        { name: 'cidade', type: 'text' },
        { name: 'estado', type: 'text' },
        { name: 'cod_cliente', type: 'text' },
        { name: 'cliente', type: 'text' },
        { name: 'cod_produto', type: 'text' },
        { name: 'produto', type: 'text' },
        { name: 'cod_barras', type: 'text' },
        { name: 'data_fabricacao', type: 'date' },
        { name: 'realizado', type: 'date' },
        { name: 'quantidade', type: 'number', onlyInt: true },
        { name: 'dias_vencimento_arquivo', type: 'number', onlyInt: true },
        { name: 'validade', type: 'date' },
        { name: 'numero_lote', type: 'text' },
        { name: 'representante', type: 'text' },
        { name: 'cnpj', type: 'text' },
        { name: 'fornecedor', type: 'text' },
        { name: 'numero_linha', type: 'number', onlyInt: true },
        { name: 'data_arquivo', type: 'date' },
        { name: 'data_importacao', type: 'text' },
        {
          name: 'import_id',
          type: 'relation',
          required: false,
          collectionId: app.findCollectionByNameOrId('import_history').id,
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
        'CREATE INDEX idx_validades_raw_import ON validades_raw (import_id)',
        'CREATE INDEX idx_validades_raw_realizado ON validades_raw (realizado)',
      ],
    })
    app.save(validadesRaw)

    // ---------------------------------------------------------------------------
    // Collection: networks — cadastro de redes (criado ANTES de validades_base)
    // ---------------------------------------------------------------------------
    const networks = new Collection({
      name: 'networks',
      type: 'base',
      listRule: authRule,
      viewRule: authRule,
      createRule: authRule,
      updateRule: authRule,
      deleteRule: authRule,
      fields: [
        { name: 'nome', type: 'text', required: true },
        { name: 'codigo_externo', type: 'text' },
        { name: 'cnpj', type: 'text' },
        { name: 'ativo', type: 'bool' },
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
      indexes: ['CREATE UNIQUE INDEX idx_networks_nome ON networks (nome)'],
    })
    app.save(networks)

    // ---------------------------------------------------------------------------
    // Collection: stores — cadastro de lojas (criado ANTES de validades_base)
    // ---------------------------------------------------------------------------
    const stores = new Collection({
      name: 'stores',
      type: 'base',
      listRule: authRule,
      viewRule: authRule,
      createRule: authRule,
      updateRule: authRule,
      deleteRule: authRule,
      fields: [
        { name: 'nome', type: 'text', required: true },
        { name: 'codigo_externo', type: 'text' },
        { name: 'razao_social', type: 'text' },
        { name: 'cnpj', type: 'text' },
        { name: 'cidade', type: 'text' },
        { name: 'estado', type: 'text' },
        { name: 'ativo', type: 'bool' },
        {
          name: 'network_id',
          type: 'relation',
          required: false,
          collectionId: app.findCollectionByNameOrId('networks').id,
          cascadeDelete: false,
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
        'CREATE UNIQUE INDEX idx_stores_codigo ON stores (codigo_externo)',
        'CREATE INDEX idx_stores_network ON stores (network_id)',
      ],
    })
    app.save(stores)

    // ---------------------------------------------------------------------------
    // Collection: validades_base — resultado processado (Base Atual)
    // Espelha ProcessedValidade. Uma linha por ocorrência (Chave Operacional).
    // Criado DEPOIS de stores/networks para poder referenciá-los.
    // ---------------------------------------------------------------------------
    const storesColId = app.findCollectionByNameOrId('stores').id
    const networksColId = app.findCollectionByNameOrId('networks').id

    const validadesBase = new Collection({
      name: 'validades_base',
      type: 'base',
      listRule: authRule,
      viewRule: authRule,
      createRule: authRule,
      updateRule: authRule,
      deleteRule: authRule,
      fields: [
        { name: 'fornecedor', type: 'text' },
        { name: 'razao_social', type: 'text' },
        { name: 'produto', type: 'text' },
        { name: 'cliente', type: 'text' },
        { name: 'cod_cliente', type: 'text' },
        { name: 'cod_produto', type: 'text' },
        { name: 'cod_barras', type: 'text' },
        { name: 'cpf_cnpj', type: 'text' },
        { name: 'cnpj', type: 'text' },
        { name: 'codigo_loja', type: 'text' },
        { name: 'nome_loja', type: 'text' },
        { name: 'rede', type: 'text' },
        { name: 'cidade', type: 'text' },
        { name: 'estado', type: 'text' },
        { name: 'colaborador', type: 'text' },
        { name: 'cod_colaborador', type: 'text' },
        { name: 'supervisor', type: 'text' },
        { name: 'cod_supervisor', type: 'text' },
        { name: 'fantasia', type: 'text' },
        { name: 'representante', type: 'text' },
        { name: 'numero_lote', type: 'text' },
        { name: 'realizado', type: 'date' },
        { name: 'validade_original', type: 'date' },
        { name: 'validade_efetiva', type: 'date' },
        { name: 'data_arquivo', type: 'date' },
        { name: 'data_importacao', type: 'text' },
        { name: 'data_entrada', type: 'date' },
        { name: 'ultima_aparicao', type: 'date' },
        { name: 'quantidade', type: 'number', onlyInt: true },
        { name: 'is_base_atual', type: 'bool' },
        { name: 'chave_operacional', type: 'text' },
        { name: 'chave_dedup', type: 'text' },
        { name: 'correcao_aplicada', type: 'bool' },
        { name: 'regra_correcao', type: 'text' },
        { name: 'dias_vencimento_atual', type: 'number', onlyInt: true },
        { name: 'dias_vencimento_arquivo', type: 'number', onlyInt: true },
        { name: 'dias_vencimento_entrada', type: 'number', onlyInt: true },
        {
          name: 'status_operacional',
          type: 'select',
          required: false,
          values: ['Vencido', 'Crítico', 'Atenção', 'Moderado', 'Normal'],
          maxSelect: 1,
        },
        {
          name: 'status_na_entrada',
          type: 'select',
          required: false,
          values: ['Vencido', 'Crítico', 'Atenção', 'Moderado', 'Normal'],
          maxSelect: 1,
        },
        {
          name: 'situacao_atual',
          type: 'select',
          required: false,
          values: ['Ativo', 'Encerrado/Não Reportado'],
          maxSelect: 1,
        },
        {
          name: 'import_id',
          type: 'relation',
          required: false,
          collectionId: app.findCollectionByNameOrId('import_history').id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'store_id',
          type: 'relation',
          required: false,
          collectionId: storesColId,
          cascadeDelete: false,
          maxSelect: 1,
        },
        {
          name: 'network_id',
          type: 'relation',
          required: false,
          collectionId: networksColId,
          cascadeDelete: false,
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
        'CREATE INDEX idx_validades_base_chave ON validades_base (chave_operacional)',
        'CREATE INDEX idx_validades_base_validade ON validades_base (validade_efetiva)',
        'CREATE INDEX idx_validades_base_realizado ON validades_base (realizado)',
        'CREATE INDEX idx_validades_base_import ON validades_base (import_id)',
        'CREATE INDEX idx_validades_base_loja ON validades_base (nome_loja)',
      ],
    })
    app.save(validadesBase)

    // ---------------------------------------------------------------------------
    // Collection: validades_corrections — tabela de correções de validade
    // Chave: fornecedor + razao_social + produto + validade_errada
    // ---------------------------------------------------------------------------
    const validadesCorrections = new Collection({
      name: 'validades_corrections',
      type: 'base',
      listRule: authRule,
      viewRule: authRule,
      createRule: authRule,
      updateRule: authRule,
      deleteRule: authRule,
      fields: [
        { name: 'fornecedor', type: 'text', required: true },
        { name: 'razao_social', type: 'text', required: true },
        { name: 'produto', type: 'text', required: true },
        { name: 'validade_errada', type: 'date', required: true },
        { name: 'validade_correta', type: 'date', required: true },
        { name: 'regra', type: 'text' },
        { name: 'usuario', type: 'text' },
        { name: 'data_correcao', type: 'date' },
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
        'CREATE UNIQUE INDEX idx_validades_corrections_key ON validades_corrections (fornecedor, razao_social, produto, validade_errada)',
      ],
    })
    app.save(validadesCorrections)

    // ---------------------------------------------------------------------------
    // Collection: store_aliases — aliases de loja
    // ---------------------------------------------------------------------------
    const storeAliases = new Collection({
      name: 'store_aliases',
      type: 'base',
      listRule: authRule,
      viewRule: authRule,
      createRule: authRule,
      updateRule: authRule,
      deleteRule: authRule,
      fields: [
        { name: 'alias', type: 'text', required: true },
        {
          name: 'store_id',
          type: 'relation',
          required: true,
          collectionId: app.findCollectionByNameOrId('stores').id,
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
        'CREATE UNIQUE INDEX idx_store_aliases_alias ON store_aliases (alias)',
        'CREATE INDEX idx_store_aliases_store ON store_aliases (store_id)',
      ],
    })
    app.save(storeAliases)

    // ---------------------------------------------------------------------------
    // Collection: network_aliases — aliases de rede
    // ---------------------------------------------------------------------------
    const networkAliases = new Collection({
      name: 'network_aliases',
      type: 'base',
      listRule: authRule,
      viewRule: authRule,
      createRule: authRule,
      updateRule: authRule,
      deleteRule: authRule,
      fields: [
        { name: 'alias', type: 'text', required: true },
        {
          name: 'network_id',
          type: 'relation',
          required: true,
          collectionId: app.findCollectionByNameOrId('networks').id,
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
        'CREATE UNIQUE INDEX idx_network_aliases_alias ON network_aliases (alias)',
        'CREATE INDEX idx_network_aliases_network ON network_aliases (network_id)',
      ],
    })
    app.save(networkAliases)

    // ---------------------------------------------------------------------------
    // Atualiza import_history com campos novos:
    // hash, arquivo_tipo, raw_count, filtered_count, base_count
    // ---------------------------------------------------------------------------
    const importHistoryCol = app.findCollectionByNameOrId('import_history')
    if (!importHistoryCol.fields.getByName('file_hash')) {
      importHistoryCol.fields.add(new TextField({ name: 'file_hash' }))
    }
    if (!importHistoryCol.fields.getByName('arquivo_tipo')) {
      importHistoryCol.fields.add(new TextField({ name: 'arquivo_tipo' }))
    }
    if (!importHistoryCol.fields.getByName('raw_count')) {
      importHistoryCol.fields.add(new NumberField({ name: 'raw_count', onlyInt: true }))
    }
    if (!importHistoryCol.fields.getByName('filtered_count')) {
      importHistoryCol.fields.add(new NumberField({ name: 'filtered_count', onlyInt: true }))
    }
    if (!importHistoryCol.fields.getByName('base_count')) {
      importHistoryCol.fields.add(new NumberField({ name: 'base_count', onlyInt: true }))
    }
    if (!importHistoryCol.fields.getByName('data_arquivo')) {
      importHistoryCol.fields.add(new DateField({ name: 'data_arquivo' }))
    }
    if (!importHistoryCol.fields.getByName('data_importacao')) {
      importHistoryCol.fields.add(new TextField({ name: 'data_importacao' }))
    }
    // índice para busca por hash (proteção contra reenvio)
    importHistoryCol.addIndex('idx_import_history_hash', false, 'file_hash', '')
    app.save(importHistoryCol)
  },
  (app) => {
    const names = [
      'network_aliases',
      'store_aliases',
      'stores',
      'networks',
      'validades_corrections',
      'validades_base',
      'validades_raw',
    ]
    for (const n of names) {
      try {
        const c = app.findCollectionByNameOrId(n)
        app.delete(c)
      } catch (_) {}
    }
    // remove campos adicionados a import_history
    try {
      const ih = app.findCollectionByNameOrId('import_history')
      for (const f of [
        'file_hash',
        'arquivo_tipo',
        'raw_count',
        'filtered_count',
        'base_count',
        'data_arquivo',
        'data_importacao',
      ]) {
        try {
          ih.fields.removeByName(f)
        } catch (_) {}
      }
      try {
        ih.removeIndex('idx_import_history_hash')
      } catch (_) {}
      app.save(ih)
    } catch (_) {}
  },
)
