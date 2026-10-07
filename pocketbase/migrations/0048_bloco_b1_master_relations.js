migrate(
  (app) => {
    // Obter referências das coleções de destino
    const rupCol = app.findCollectionByNameOrId('rupturas_base')
    const valCol = app.findCollectionByNameOrId('validades_base')

    const mixCol = app.findCollectionByNameOrId('industry_product_mix')
    const promCol = app.findCollectionByNameOrId('promoters')
    const supCol = app.findCollectionByNameOrId('supervisors')

    // 1. rupturas_base: adicionar product_id, promoter_id, supervisor_id
    if (!rupCol.fields.getByName('product_id')) {
      rupCol.fields.add(
        new RelationField({
          name: 'product_id',
          collectionId: mixCol.id,
          maxSelect: 1,
        }),
      )
    }
    if (!rupCol.fields.getByName('promoter_id')) {
      rupCol.fields.add(
        new RelationField({
          name: 'promoter_id',
          collectionId: promCol.id,
          maxSelect: 1,
        }),
      )
    }
    if (!rupCol.fields.getByName('supervisor_id')) {
      rupCol.fields.add(
        new RelationField({
          name: 'supervisor_id',
          collectionId: supCol.id,
          maxSelect: 1,
        }),
      )
    }
    rupCol.addIndex('idx_rup_product', false, 'product_id', '')
    rupCol.addIndex('idx_rup_promoter', false, 'promoter_id', '')
    rupCol.addIndex('idx_rup_supervisor', false, 'supervisor_id', '')
    app.save(rupCol)

    // 2. validades_base: adicionar product_id, promoter_id, supervisor_id
    if (!valCol.fields.getByName('product_id')) {
      valCol.fields.add(
        new RelationField({
          name: 'product_id',
          collectionId: mixCol.id,
          maxSelect: 1,
        }),
      )
    }
    if (!valCol.fields.getByName('promoter_id')) {
      valCol.fields.add(
        new RelationField({
          name: 'promoter_id',
          collectionId: promCol.id,
          maxSelect: 1,
        }),
      )
    }
    if (!valCol.fields.getByName('supervisor_id')) {
      valCol.fields.add(
        new RelationField({
          name: 'supervisor_id',
          collectionId: supCol.id,
          maxSelect: 1,
        }),
      )
    }
    valCol.addIndex('idx_val_product', false, 'product_id', '')
    valCol.addIndex('idx_val_promoter', false, 'promoter_id', '')
    valCol.addIndex('idx_val_supervisor', false, 'supervisor_id', '')
    app.save(valCol)
  },
  (app) => {
    const rupCol = app.findCollectionByNameOrId('rupturas_base')
    rupCol.removeIndex('idx_rup_product')
    rupCol.removeIndex('idx_rup_promoter')
    rupCol.removeIndex('idx_rup_supervisor')
    const rupFields = ['product_id', 'promoter_id', 'supervisor_id']
    for (let i = 0; i < rupFields.length; i++) {
      const f = rupCol.fields.getByName(rupFields[i])
      if (f) rupCol.fields.removeByName(rupFields[i])
    }
    app.save(rupCol)

    const valCol = app.findCollectionByNameOrId('validades_base')
    valCol.removeIndex('idx_val_product')
    valCol.removeIndex('idx_val_promoter')
    valCol.removeIndex('idx_val_supervisor')
    const valFields = ['product_id', 'promoter_id', 'supervisor_id']
    for (let i = 0; i < valFields.length; i++) {
      const f = valCol.fields.getByName(valFields[i])
      if (f) valCol.fields.removeByName(valFields[i])
    }
    app.save(valCol)
  },
)
