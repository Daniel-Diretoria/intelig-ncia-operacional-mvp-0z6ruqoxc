migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('store_promoter_assignments')
    if (col) {
      // 1. Atualizar tipo_vinculo para incluir 'observado_operacao'
      const tipoVinculoField = col.fields.getByName('tipo_vinculo')
      if (tipoVinculoField) {
        const existingValues = Array.isArray(tipoVinculoField.values) ? tipoVinculoField.values : []
        if (!existingValues.includes('observado_operacao')) {
          tipoVinculoField.values = [...existingValues, 'observado_operacao']
        }
      }

      // 2. Adicionar campo estruturado 'ultima_observacao_fonte' (text)
      if (!col.fields.getByName('ultima_observacao_fonte')) {
        col.fields.add(
          new TextField({
            name: 'ultima_observacao_fonte',
            required: false,
          }),
        )
      }

      app.save(col)
    }
  },
  (app) => {
    // Reversão defensiva
    const col = app.findCollectionByNameOrId('store_promoter_assignments')
    if (col) {
      const tipoVinculoField = col.fields.getByName('tipo_vinculo')
      if (tipoVinculoField && Array.isArray(tipoVinculoField.values)) {
        tipoVinculoField.values = tipoVinculoField.values.filter((v) => v !== 'observado_operacao')
      }
      app.save(col)
    }
  },
)
