migrate(
  (app) => {
    // Collection 'stores' já existe da migration 0003.
    // Vamos garantir que os campos necessários estejam presentes ou popular a tabela 'stores' a partir das lojas existentes na `validades_base`.

    const storesCol = app.findCollectionByNameOrId('stores')

    // Adiciona campos adicionais caso não existam para enriquecer a entidade Loja
    // Ex: store_code / codigo_externo, network_name, etc.
    if (!storesCol.fields.getByName('codigo_loja')) {
      storesCol.fields.add(new TextField({ name: 'codigo_loja' }))
    }
    if (!storesCol.fields.getByName('nome_loja')) {
      storesCol.fields.add(new TextField({ name: 'nome_loja' }))
    }
    if (!storesCol.fields.getByName('rede_nome')) {
      storesCol.fields.add(new TextField({ name: 'rede_nome' }))
    }

    app.save(storesCol)

    // Opcional: popular/sincronizar tabela `stores` a partir dos dados existentes em `validades_base`
    try {
      const validadesRecords = app.findRecordsByFilter(
        'validades_base',
        'is_base_atual = true',
        '',
        1000,
        0,
      )
      const knownCodes = new Set()

      for (const rec of validadesRecords) {
        const storeCode = (rec.getString('codigo_loja') || '').trim()
        const storeName = (rec.getString('nome_loja') || rec.getString('razao_social') || '').trim()
        const razaoSocial = (rec.getString('razao_social') || '').trim()
        const city = (rec.getString('cidade') || '').trim()
        const state = (rec.getString('estado') || '').trim()
        const cnpj = (rec.getString('cnpj') || rec.getString('cpf_cnpj') || '').trim()
        const networkName = (
          rec.getString('fantasia') ||
          rec.getString('rede') ||
          'Grupo Pereira'
        ).trim()

        if (!storeCode && !storeName) continue

        const codeKey = storeCode || storeName

        if (!knownCodes.has(codeKey)) {
          knownCodes.add(codeKey)

          // Verifica se já existe na collection stores
          let existing = null
          try {
            if (storeCode) {
              existing = app.findFirstRecordByData('stores', 'codigo_externo', storeCode)
            }
          } catch (_) {}

          if (!existing) {
            const storeRecord = new Record(storesCol)
            storeRecord.set('codigo_externo', storeCode || '000')
            storeRecord.set('codigo_loja', storeCode || '000')
            storeRecord.set('nome', storeName || storeCode)
            storeRecord.set('nome_loja', storeName || storeCode)
            storeRecord.set('razao_social', razaoSocial || storeName)
            storeRecord.set('cnpj', cnpj)
            storeRecord.set('cidade', city)
            storeRecord.set('estado', state)
            storeRecord.set('rede_nome', networkName)
            storeRecord.set('ativo', true)
            app.save(storeRecord)
          }
        }
      }
    } catch (e) {
      console.log('Erro ao sincronizar lojas de validades_base:', e)
    }
  },
  (app) => {
    // Revert optional changes if needed
  },
)
