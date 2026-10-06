migrate(
  (app) => {
    // 1. product_aliases (Dicionário de Produtos / Aliases confirmados e reutilizáveis)
    const productAliases = new Collection({
      name: 'product_aliases',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'alias', type: 'text', required: true },
        { name: 'alias_normalizado', type: 'text', required: true },
        { name: 'produto_oficial_nome', type: 'text', required: true },
        { name: 'produto_oficial_codigo', type: 'text' },
        { name: 'industria_id', type: 'text' },
        { name: 'industria_nome', type: 'text', required: true },
        { name: 'familia', type: 'text' },
        { name: 'sabor', type: 'text' },
        { name: 'gramatura', type: 'text' },
        { name: 'tipo_alias', type: 'text' }, // sku_direto | familia_generica
        { name: 'confirmado_por', type: 'text' },
        { name: 'origem', type: 'text' }, // importacao_whatsapp | manual | dicionario
        { name: 'status', type: 'select', values: ['ativo', 'inativo'], required: true },
        { name: 'quantidade_utilizacoes', type: 'number' },
        { name: 'ultima_utilizacao', type: 'text' },
        { name: 'observacao', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_prod_aliases_norm ON product_aliases (alias_normalizado)',
        'CREATE INDEX idx_prod_aliases_ind ON product_aliases (industria_nome)',
        'CREATE INDEX idx_prod_aliases_status ON product_aliases (status)',
      ],
    })
    app.save(productAliases)

    // 2. devolucoes_import_batches (Histórico e Deduplicação determinística de conversas WhatsApp)
    const devolucoesImportBatches = new Collection({
      name: 'devolucoes_import_batches',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'file_name', type: 'text', required: true },
        { name: 'file_hash', type: 'text', required: true },
        { name: 'origem_canal', type: 'text' }, // whatsapp
        { name: 'total_mensagens', type: 'number' },
        { name: 'mensagens_conhecidas', type: 'number' },
        { name: 'mensagens_novas', type: 'number' },
        { name: 'solicitacoes_identificadas', type: 'number' },
        { name: 'solicitacoes_revisadas', type: 'number' },
        { name: 'solicitacoes_importadas', type: 'number' },
        { name: 'solicitacoes_ignoradas', type: 'number' },
        { name: 'solicitacoes_incompletas', type: 'number' },
        { name: 'usuario_nome', type: 'text' },
        { name: 'resumo_processamento_json', type: 'json' },
        { name: 'hashes_mensagens_json', type: 'json' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_dev_batch_hash ON devolucoes_import_batches (file_hash)',
        'CREATE INDEX idx_dev_batch_created ON devolucoes_import_batches (created DESC)',
      ],
    })
    app.save(devolucoesImportBatches)
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('devolucoes_import_batches'))
    } catch (_) {}
    try {
      app.delete(app.findCollectionByNameOrId('product_aliases'))
    } catch (_) {}
  },
)
