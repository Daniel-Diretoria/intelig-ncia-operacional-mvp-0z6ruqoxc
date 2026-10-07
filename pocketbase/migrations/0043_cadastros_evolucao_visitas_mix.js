migrate(
  (app) => {
    // 1. Coleção operacional_visitas (Eventos operacionais de visitas de promotores / timeline real)
    if (!app.hasTable('operacional_visitas')) {
      const visitas = new Collection({
        name: 'operacional_visitas',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
        fields: [
          { name: 'data', type: 'text', required: true },
          {
            name: 'promoter_id',
            type: 'relation',
            collectionId: app.findCollectionByNameOrId('promoters').id,
            maxSelect: 1,
          },
          { name: 'promoter_cod', type: 'text' },
          { name: 'promoter_nome', type: 'text', required: true },
          {
            name: 'store_id',
            type: 'relation',
            collectionId: app.findCollectionByNameOrId('stores').id,
            maxSelect: 1,
          },
          { name: 'store_code', type: 'text', required: true },
          { name: 'store_name', type: 'text' },
          { name: 'industry_name', type: 'text' },
          { name: 'hora_inicio', type: 'text' }, // Check-in ou início informado
          { name: 'hora_fim', type: 'text' }, // Check-out ou término informado
          { name: 'duracao_minutos', type: 'number' },
          { name: 'status_roteiro', type: 'text' },
          { name: 'sequencia', type: 'number' },
          { name: 'origem_fonte', type: 'text' }, // ex: 'tradepro_rupturas', 'manual', 'app_diretoria'
          { name: 'observacao', type: 'text' },
          { name: 'dados_brutos_json', type: 'json' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_visitas_data ON operacional_visitas (data)',
          'CREATE INDEX idx_visitas_promoter ON operacional_visitas (promoter_id, data)',
          'CREATE INDEX idx_visitas_store ON operacional_visitas (store_code, data)',
        ],
      })
      app.save(visitas)
    }

    // 2. Expandir store_promoter_assignments com tipo_vinculo ('confirmado' vs 'observado_visita')
    const assignCol = app.findCollectionByNameOrId('store_promoter_assignments')
    if (!assignCol.fields.getByName('tipo_vinculo')) {
      assignCol.fields.add(
        new SelectField({
          name: 'tipo_vinculo',
          values: ['confirmado', 'observado_visita'],
          maxSelect: 1,
        }),
      )
    }
    if (!assignCol.fields.getByName('origem_vinculo')) {
      assignCol.fields.add(
        new TextField({
          name: 'origem_vinculo',
        }),
      )
    }
    app.save(assignCol)

    // 3. Expandir industry_store_product_mix com tipo_presenca ('definido_loja' vs 'observado_operacional') e campos de evidência
    const storeMixCol = app.findCollectionByNameOrId('industry_store_product_mix')
    if (!storeMixCol.fields.getByName('tipo_presenca')) {
      storeMixCol.fields.add(
        new SelectField({
          name: 'tipo_presenca',
          values: ['definido_loja', 'observado_operacional'],
          maxSelect: 1,
        }),
      )
    }
    if (!storeMixCol.fields.getByName('ultima_observacao')) {
      storeMixCol.fields.add(
        new TextField({
          name: 'ultima_observacao',
        }),
      )
    }
    if (!storeMixCol.fields.getByName('evidencia_origem')) {
      storeMixCol.fields.add(
        new TextField({
          name: 'evidencia_origem', // 'tradepro_ruptura', 'tradepro_validade', 'manual'
        }),
      )
    }
    app.save(storeMixCol)
  },
  (app) => {
    try {
      const visitas = app.findCollectionByNameOrId('operacional_visitas')
      app.delete(visitas)
    } catch (_) {}
  },
)
