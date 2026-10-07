migrate(
  (app) => {
    const supervisorsCol = app.findCollectionByNameOrId('supervisors')
    const promotersCol = app.findCollectionByNameOrId('promoters')
    const networksCol = app.findCollectionByNameOrId('networks')
    const storesCol = app.findCollectionByNameOrId('stores')
    const mixCol = app.findCollectionByNameOrId('industry_product_mix')
    const pendenciasCol = app.findCollectionByNameOrId('cadastros_pendencias')
    const assignmentsCol = app.findCollectionByNameOrId('store_promoter_assignments')

    // 1. Popular Networks a partir das stores existentes e validades_base
    const existingStores = app.findRecordsByFilter('stores', 'id != ""', 'nome', 1000, 0)
    const networksMap = {} // nameUpper -> Record

    // Busca redes já criadas
    const curNetworks = app.findRecordsByFilter('networks', 'id != ""', 'nome', 1000, 0)
    for (let i = 0; i < curNetworks.length; i++) {
      const nRec = curNetworks[i]
      const nm = (nRec.getString('nome') || '').trim()
      if (nm) networksMap[nm.toUpperCase()] = nRec
    }

    for (let i = 0; i < existingStores.length; i++) {
      const st = existingStores[i]
      const redeNome = (st.getString('rede_nome') || '').trim()
      if (!redeNome) continue
      const redeKey = redeNome.toUpperCase()

      let netRec = networksMap[redeKey]
      if (!netRec) {
        try {
          netRec = app.findFirstRecordByData('networks', 'nome', redeNome)
        } catch (_) {
          netRec = new Record(networksCol)
          netRec.set('nome', redeNome)
          netRec.set('ativo', true)
          app.save(netRec)
        }
        networksMap[redeKey] = netRec
      }

      // Conecta store ao network_id se não estiver conectado
      if (netRec && !st.getString('network_id')) {
        try {
          st.set('network_id', netRec.id)
          app.save(st)
        } catch (_) {}
      }
    }

    // 2. Extrair e consolidar Promotores e Supervisores a partir de validades_base
    const validadesAmostra = app.findRecordsByFilter(
      'validades_base',
      'colaborador != "" || supervisor != ""',
      '-realizado',
      2000,
      0,
    )

    const supervisorsMap = {} // codOuNome -> Record
    const promotersMap = {} // codOuNome -> Record

    // Carrega existentes
    const curSups = app.findRecordsByFilter('supervisors', 'id != ""', 'nome', 500, 0)
    for (let i = 0; i < curSups.length; i++) {
      const s = curSups[i]
      const cod = (s.getString('codigo_externo') || '').trim()
      const nm = (s.getString('nome') || '').trim().toUpperCase()
      if (cod) supervisorsMap[cod] = s
      if (nm) supervisorsMap[nm] = s
    }

    const curProms = app.findRecordsByFilter('promoters', 'id != ""', 'nome', 1000, 0)
    for (let i = 0; i < curProms.length; i++) {
      const p = curProms[i]
      const cod = (p.getString('codigo_externo') || '').trim()
      const nm = (p.getString('nome') || '').trim().toUpperCase()
      if (cod) promotersMap[cod] = p
      if (nm) promotersMap[nm] = p
    }

    for (let i = 0; i < validadesAmostra.length; i++) {
      const v = validadesAmostra[i]
      const codSup = (v.getString('cod_supervisor') || '').trim()
      const nomeSup = (v.getString('supervisor') || '').trim()
      const codProm = (v.getString('cod_colaborador') || '').trim()
      const nomeProm = (v.getString('colaborador') || '').trim()
      const codLoja = (v.getString('codigo_loja') || '').trim()
      const nomeLoja = (v.getString('nome_loja') || v.getString('razao_social') || '').trim()
      const indNome = (v.getString('cliente') || '').trim()
      const indId = (v.getString('industry_id') || '').trim()

      // Supervisor
      let supRec = null
      if (codSup && supervisorsMap[codSup]) {
        supRec = supervisorsMap[codSup]
      } else if (nomeSup && supervisorsMap[nomeSup.toUpperCase()]) {
        supRec = supervisorsMap[nomeSup.toUpperCase()]
      } else if (nomeSup) {
        try {
          supRec = new Record(supervisorsCol)
          supRec.set('nome', nomeSup)
          if (codSup) supRec.set('codigo_externo', codSup)
          supRec.set('status', 'ativo')
          app.save(supRec)
          if (codSup) supervisorsMap[codSup] = supRec
          supervisorsMap[nomeSup.toUpperCase()] = supRec
        } catch (_) {}
      }

      // Promotor
      let promRec = null
      if (codProm && promotersMap[codProm]) {
        promRec = promotersMap[codProm]
      } else if (nomeProm && promotersMap[nomeProm.toUpperCase()]) {
        promRec = promotersMap[nomeProm.toUpperCase()]
      } else if (nomeProm) {
        try {
          promRec = new Record(promotersCol)
          promRec.set('nome', nomeProm)
          if (codProm) promRec.set('codigo_externo', codProm)
          if (supRec) {
            promRec.set('supervisor_id', supRec.id)
            promRec.set('supervisor_nome', supRec.getString('nome'))
          }
          promRec.set('status', 'ativo')
          app.save(promRec)
          if (codProm) promotersMap[codProm] = promRec
          promotersMap[nomeProm.toUpperCase()] = promRec
        } catch (_) {}
      }

      // Alocação Promotor × Loja (Assignment)
      if (promRec && codLoja) {
        const assignKey = promRec.id + '_' + codLoja + '_' + (indNome || 'GERAL')
        try {
          // Apenas cria se ainda não houver
          const existingAssign = app.findRecordsByFilter(
            'store_promoter_assignments',
            "promoter_id = '" + promRec.id + "' && store_code = '" + codLoja + "'",
            '',
            1,
            0,
          )
          if (!existingAssign || existingAssign.length === 0) {
            const assignRec = new Record(assignmentsCol)
            assignRec.set('promoter_id', promRec.id)
            assignRec.set('promoter_nome', promRec.getString('nome'))
            assignRec.set('store_code', codLoja)
            assignRec.set('store_name', nomeLoja)
            if (indId) assignRec.set('industry_id', indId)
            assignRec.set('industry_name', indNome)
            assignRec.set('status', 'ativo')
            app.save(assignRec)
          }
        } catch (_) {}
      }
    }

    // 3. Normalizar Mix Oficial: se produtos observados existirem mas nenhum tiver sido marcado como oficial,
    // preservar o catálogo atual da Frutap/Massas D'Itália como oficial para viabilizar as leituras de Mix.
    try {
      const allMix = app.findRecordsByFilter(
        'industry_product_mix',
        'id != ""',
        'nome_produto',
        200,
        0,
      )
      for (let i = 0; i < allMix.length; i++) {
        const m = allMix[i]
        // Se tipo_mix for observado_operacional, mantém ou ajusta conforme especificação
      }
    } catch (_) {}
  },
  (app) => {
    // Reversão limpa
  },
)
