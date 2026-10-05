migrate(
  (app) => {
    const regCol = app.findCollectionByNameOrId('industry_registry')

    // industry_store_product_mix: Mix Definido da Loja
    // Representa quais produtos do Mix Oficial da Indústria são esperados/comercializados
    // especificamente naquela loja. Quando não cadastrado, o sistema não presume que
    // todos os produtos do Mix Oficial pertencem à loja.
    const storeMix = new Collection({
      name: 'industry_store_product_mix',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        {
          name: 'industry_id',
          type: 'relation',
          required: true,
          collectionId: regCol.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'store_code', type: 'text' },
        { name: 'store_name', type: 'text', required: true },
        { name: 'codigo_produto', type: 'text' },
        { name: 'cod_barras', type: 'text' },
        { name: 'nome_produto', type: 'text', required: true },
        {
          name: 'status',
          type: 'select',
          values: ['ativo', 'inativo', 'em_avaliacao'],
          required: true,
        },
        {
          name: 'origem_inclusao',
          type: 'text',
        }, // ex: "manual", "aprovacao_observado", "acordo_comercial"
        { name: 'observacao', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_store_mix_ind_store ON industry_store_product_mix (industry_id, store_name)',
        'CREATE INDEX idx_store_mix_prod ON industry_store_product_mix (industry_id, nome_produto)',
      ],
    })
    app.save(storeMix)
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('industry_store_product_mix'))
    } catch (_) {}
  },
)
