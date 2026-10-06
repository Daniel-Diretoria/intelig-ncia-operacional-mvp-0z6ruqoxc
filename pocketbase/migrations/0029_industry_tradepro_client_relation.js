migrate(
  (app) => {
    // 1. Atualizar industry_registry com campos de relacionamento TradePro
    const industryRegistry = app.findCollectionByNameOrId('industry_registry')
    if (!industryRegistry.fields.getByName('tradepro_client_id')) {
      industryRegistry.fields.add(
        new TextField({
          name: 'tradepro_client_id',
        }),
      )
    }
    if (!industryRegistry.fields.getByName('tradepro_client_name')) {
      industryRegistry.fields.add(
        new TextField({
          name: 'tradepro_client_name',
        }),
      )
    }
    app.save(industryRegistry)

    // 2. Adicionar índice único/otimizado para busca por tradepro_client_id
    industryRegistry.addIndex(
      'idx_industry_reg_tradepro_client_id',
      false,
      'tradepro_client_id',
      '',
    )
    app.save(industryRegistry)

    // 3. Atualizar industry_config_audit para aceitar módulo 'integracao_tradepro'
    // Como modulo é um select com values restritos, adicionamos 'integracao_tradepro' se ainda não constar
    const auditCol = app.findCollectionByNameOrId('industry_config_audit')
    const moduloField = auditCol.fields.getByName('modulo')
    if (moduloField && Array.isArray(moduloField.values)) {
      if (moduloField.values.indexOf('integracao_tradepro') === -1) {
        moduloField.values.push('integracao_tradepro')
        moduloField.maxSelect = moduloField.values.length
        app.save(auditCol)
      }
    }

    // 4. Garantir que validades_base tenha relation para industry_registry se útil
    const validadesBase = app.findCollectionByNameOrId('validades_base')
    if (!validadesBase.fields.getByName('industry_id')) {
      validadesBase.fields.add(
        new RelationField({
          name: 'industry_id',
          collectionId: industryRegistry.id,
          maxSelect: 1,
          cascadeDelete: false,
        }),
      )
      app.save(validadesBase)
    }

    // 5. Vincular indústrias existentes já conhecidas pelos dados canônicos reais
    // FRUTAP -> Cód. Cliente: 7 (conforme confirmado no relatório TradePro)
    try {
      const frutap = app.findFirstRecordByData('industry_registry', 'nome_chave', 'FRUTAP')
      if (frutap && !frutap.getString('tradepro_client_id')) {
        frutap.set('tradepro_client_id', '7')
        frutap.set('tradepro_client_name', 'FRUTAP')
        app.save(frutap)
      }
    } catch (_) {}
  },
  (app) => {
    try {
      const industryRegistry = app.findCollectionByNameOrId('industry_registry')
      industryRegistry.removeIndex('idx_industry_reg_tradepro_client_id')
      if (industryRegistry.fields.getByName('tradepro_client_id')) {
        industryRegistry.fields.removeByName('tradepro_client_id')
      }
      if (industryRegistry.fields.getByName('tradepro_client_name')) {
        industryRegistry.fields.removeByName('tradepro_client_name')
      }
      app.save(industryRegistry)
    } catch (_) {}

    try {
      const validadesBase = app.findCollectionByNameOrId('validades_base')
      if (validadesBase.fields.getByName('industry_id')) {
        validadesBase.fields.removeByName('industry_id')
        app.save(validadesBase)
      }
    } catch (_) {}
  },
)
