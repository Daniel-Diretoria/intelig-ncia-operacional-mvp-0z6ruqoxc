migrate(
  (app) => {
    // 1. Atualizar select values de tipo_mix em industry_product_mix para incluir 'fora_mix_oficial'
    const mixCol = app.findCollectionByNameOrId('industry_product_mix')
    if (mixCol) {
      const tipoMixField = mixCol.fields.getByName('tipo_mix')
      if (tipoMixField) {
        const existingValues = Array.isArray(tipoMixField.values) ? tipoMixField.values : []
        if (!existingValues.includes('fora_mix_oficial')) {
          tipoMixField.values = [...existingValues, 'fora_mix_oficial']
          app.save(mixCol)
        }
      }
    }

    // 2. Adicionar 'homologacao_cadastral_executada' e 'vinculo_manual_preservado' em user_audit_log
    const auditCol = app.findCollectionByNameOrId('user_audit_log')
    if (auditCol) {
      const acaoField = auditCol.fields.getByName('acao')
      if (acaoField) {
        const existingValues = Array.isArray(acaoField.values) ? acaoField.values : []
        const toAdd = ['homologacao_cadastral_executada', 'vinculo_manual_preservado']
        let changed = false
        for (let i = 0; i < toAdd.length; i++) {
          if (!existingValues.includes(toAdd[i])) {
            existingValues.push(toAdd[i])
            changed = true
          }
        }
        if (changed) {
          acaoField.values = existingValues
          app.save(auditCol)
        }
      }
    }

    // 3. Adicionar campo 'edicao_manual' (bool) em industry_registry, stores, promoters, supervisors para proteção contra sobrescrita por API
    const collectionsToProtect = ['industry_registry', 'stores', 'promoters', 'supervisors']
    for (let i = 0; i < collectionsToProtect.length; i++) {
      const col = app.findCollectionByNameOrId(collectionsToProtect[i])
      if (col && !col.fields.getByName('edicao_manual')) {
        col.fields.add(
          new BoolField({
            name: 'edicao_manual',
            required: false,
          }),
        )
        if (!col.fields.getByName('origem_fonte')) {
          col.fields.add(
            new TextField({
              name: 'origem_fonte',
            }),
          )
        }
        if (!col.fields.getByName('ultima_observacao_fonte')) {
          col.fields.add(
            new TextField({
              name: 'ultima_observacao_fonte',
            }),
          )
        }
        app.save(col)
      }
    }
  },
  (app) => {
    // Reversão
  },
)
