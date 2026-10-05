migrate(
  (app) => {
    const regCol = app.findCollectionByNameOrId('industry_registry')
    const covCol = app.findCollectionByNameOrId('industry_store_coverage')
    const mixCol = app.findCollectionByNameOrId('industry_product_mix')
    const resCol = app.findCollectionByNameOrId('industry_research_config')
    const polCol = app.findCollectionByNameOrId('industry_validity_policy')

    // 1. Cria regra padrão do sistema em industry_validity_policy se ainda não existir
    try {
      const existingSystem = app.findFirstRecordByData(
        'industry_validity_policy',
        'nivel_regra',
        'sistema',
      )
    } catch (_) {
      const sysPolicy = new Record(polCol)
      sysPolicy.set('nivel_regra', 'sistema')
      sysPolicy.set('dias_critico', 15)
      sysPolicy.set('dias_atencao', 20)
      sysPolicy.set('dias_moderado', 30)
      sysPolicy.set('shelf_life_padrao_dias', 90)
      sysPolicy.set(
        'justificativa',
        'Regra padrão operacional do sistema SKIP: Crítico <= 15 dias, Atenção <= 20 dias, Moderado <= 30 dias.',
      )
      sysPolicy.set('ativo', true)
      app.save(sysPolicy)
    }

    // 2. Extrai indústrias, lojas e produtos de validades_base (Base Atual)
    try {
      const validades = app.findRecordsByFilter(
        'validades_base',
        'is_base_atual = true',
        '',
        3000,
        0,
      )

      const industriesMap = new Map() // nameKey -> { displayName, stores: Map(storeCode/Name -> storeObj), products: Map(prodName -> prodObj) }

      for (const v of validades) {
        const rawBrand = (
          v.getString('cliente') ||
          v.getString('fornecedor') ||
          'NAO INFORMADA'
        ).trim()
        if (!rawBrand) continue
        const brandKey = rawBrand.toUpperCase()

        if (!industriesMap.has(brandKey)) {
          industriesMap.set(brandKey, {
            displayName: rawBrand,
            stores: new Map(),
            products: new Map(),
          })
        }
        const indData = industriesMap.get(brandKey)

        // Store
        const storeCode = (v.getString('codigo_loja') || '').trim()
        const storeName = (v.getString('nome_loja') || v.getString('razao_social') || 'Loja').trim()
        const storeKey = storeCode ? storeCode : storeName.toUpperCase()
        if (!indData.stores.has(storeKey)) {
          indData.stores.set(storeKey, {
            store_code: storeCode,
            store_name: storeName,
            network_name: (v.getString('rede') || v.getString('fantasia') || '').trim(),
            city: (v.getString('cidade') || '').trim(),
            state: (v.getString('estado') || '').trim(),
          })
        }

        // Product
        const prodName = (v.getString('produto') || '').trim()
        if (prodName && !indData.products.has(prodName.toUpperCase())) {
          indData.products.set(prodName.toUpperCase(), {
            nome_produto: prodName,
            codigo_produto: (v.getString('cod_produto') || '').trim(),
            cod_barras: (v.getString('cod_barras') || '').trim(),
            categoria: (v.getString('categoria') || 'Geral').trim(),
          })
        }
      }

      // Insere cada indústria descoberta no industry_registry
      for (const [brandKey, indData] of industriesMap.entries()) {
        let indRecord = null
        try {
          indRecord = app.findFirstRecordByData('industry_registry', 'nome_chave', brandKey)
        } catch (_) {}

        if (!indRecord) {
          indRecord = new Record(regCol)
          indRecord.set('nome', indData.displayName)
          indRecord.set('nome_chave', brandKey)
          indRecord.set('status', 'ativa')
          indRecord.set('segmento', 'Alimentos / Consumo')
          indRecord.set(
            'observacoes',
            'Indústria identificada a partir do histórico operacional canônico.',
          )
          app.save(indRecord)
        }

        const industryId = indRecord.id

        // Pesquisas padrão configuradas para a indústria
        try {
          app.findFirstRecordByData('industry_research_config', 'industry_id', industryId)
        } catch (_) {
          // Cria pesquisa de Validades
          const resVal = new Record(resCol)
          resVal.set('industry_id', industryId)
          resVal.set('tipo_pesquisa', 'validades')
          resVal.set('ativo', true)
          resVal.set('frequencia', 'semanal')
          resVal.set('dia_esperado', 'terca')
          resVal.set('tolerancia_dias', 1)
          resVal.set('instrucoes', 'Aferição semanal de validades em gôndola e estoque.')
          app.save(resVal)

          // Cria pesquisa de Rupturas
          const resRup = new Record(resCol)
          resRup.set('industry_id', industryId)
          resRup.set('tipo_pesquisa', 'rupturas')
          resRup.set('ativo', true)
          resRup.set('frequencia', 'semanal')
          resRup.set('dia_esperado', 'terca')
          resRup.set('tolerancia_dias', 1)
          resRup.set('instrucoes', 'Aferição de rupturas em gôndola.')
          app.save(resRup)
        }

        // Política de Validade específica da indústria (herda padrão inicial: 15 / 20 / 30)
        try {
          const filter = `industry_id = '${industryId}' && nivel_regra = 'industria'`
          const records = app.findRecordsByFilter('industry_validity_policy', filter, '', 1, 0)
          if (records.length === 0) {
            const indPolicy = new Record(polCol)
            indPolicy.set('industry_id', industryId)
            indPolicy.set('nivel_regra', 'industria')
            indPolicy.set('dias_critico', 15)
            indPolicy.set('dias_atencao', 20)
            indPolicy.set('dias_moderado', 30)
            indPolicy.set('shelf_life_padrao_dias', 60)
            indPolicy.set(
              'justificativa',
              'Política específica da indústria herdada da base de referência.',
            )
            indPolicy.set('ativo', true)
            app.save(indPolicy)
          }
        } catch (_) {}

        // Cobertura de Lojas detectada pelo sistema
        for (const store of indData.stores.values()) {
          try {
            const storeFilter = `industry_id = '${industryId}' && store_name = '${store.store_name.replace(/'/g, "\\'")}'`
            const covRecords = app.findRecordsByFilter(
              'industry_store_coverage',
              storeFilter,
              '',
              1,
              0,
            )
            if (covRecords.length === 0) {
              const covRecord = new Record(covCol)
              covRecord.set('industry_id', industryId)
              covRecord.set('industry_name', indData.displayName)
              covRecord.set('store_code', store.store_code)
              covRecord.set('store_name', store.store_name)
              covRecord.set('network_name', store.network_name)
              covRecord.set('city', store.city)
              covRecord.set('state', store.state)
              covRecord.set('status_relacao', 'detectada')
              covRecord.set('origem_deteccao', 'historico_validades')
              covRecord.set(
                'observacao',
                'Loja detectada automaticamente pelo histórico de atendimento de validades.',
              )
              app.save(covRecord)
            }
          } catch (_) {}
        }

        // Mix de Produtos observado
        for (const prod of indData.products.values()) {
          try {
            const prodFilter = `industry_id = '${industryId}' && nome_produto = '${prod.nome_produto.replace(/'/g, "\\'")}'`
            const mixRecords = app.findRecordsByFilter('industry_product_mix', prodFilter, '', 1, 0)
            if (mixRecords.length === 0) {
              const mixRecord = new Record(mixCol)
              mixRecord.set('industry_id', industryId)
              mixRecord.set('industry_name', indData.displayName)
              mixRecord.set('codigo_produto', prod.codigo_produto)
              mixRecord.set('cod_barras', prod.cod_barras)
              mixRecord.set('nome_produto', prod.nome_produto)
              mixRecord.set('categoria', prod.categoria)
              mixRecord.set('tipo_mix', 'observado_operacional')
              mixRecord.set('status', 'ativo')
              mixRecord.set('shelf_life_dias', 60)
              app.save(mixRecord)
            }
          } catch (_) {}
        }
      }
    } catch (err) {
      console.log('Erro no seed do Cadastro Operacional:', err)
    }
  },
  (app) => {
    // Reversão
  },
)
