migrate(
  (app) => {
    // 1. devolucoes_mensagens_importadas: Tabela para deduplicação persistente e escalável
    // Armazena hashes individuais de mensagens importadas com unicidade estrita
    const devolucoesMensagensImportadas = new Collection({
      name: 'devolucoes_mensagens_importadas',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'hash_mensagem', type: 'text', required: true },
        {
          name: 'batch_id',
          type: 'relation',
          collectionId: app.findCollectionByNameOrId('devolucoes_import_batches').id,
          maxSelect: 1,
        },
        { name: 'file_hash', type: 'text' },
        { name: 'origem_canal', type: 'text' }, // whatsapp
        { name: 'data_hora_msg', type: 'text' },
        { name: 'autor', type: 'text' },
        { name: 'solicitacao_id', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_dev_msg_hash ON devolucoes_mensagens_importadas (hash_mensagem)',
        'CREATE INDEX idx_dev_msg_batch ON devolucoes_mensagens_importadas (batch_id)',
        'CREATE INDEX idx_dev_msg_file_hash ON devolucoes_mensagens_importadas (file_hash)',
      ],
    })
    app.save(devolucoesMensagensImportadas)

    // 2. Normalização defensiva de lotes antigos em devolucoes_import_batches:
    // Se houver algum lote prévio com sol_wmsg_ no campo hashes_mensagens_json,
    // normalizar para wmsg_ retirando o prefixo sol_ para recuperar os hashes reais de mensagem.
    try {
      const batches = app.findRecordsByFilter('devolucoes_import_batches', '', '', 1000, 0)
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i]
        const rawJson = batch.get('hashes_mensagens_json')
        let hashes = []
        if (typeof rawJson === 'string') {
          try {
            hashes = JSON.parse(rawJson)
          } catch (_) {
            hashes = []
          }
        } else if (Array.isArray(rawJson)) {
          hashes = rawJson
        }

        if (Array.isArray(hashes) && hashes.length > 0) {
          const hashesNormalizados = hashes.map((h) => {
            if (typeof h === 'string' && h.startsWith('sol_wmsg_')) {
              return h.replace(/^sol_/, '')
            }
            return h
          })
          batch.set('hashes_mensagens_json', JSON.stringify(hashesNormalizados))
          app.save(batch)

          // Popular devolucoes_mensagens_importadas caso não existam
          for (let j = 0; j < hashesNormalizados.length; j++) {
            const h = hashesNormalizados[j]
            if (typeof h === 'string' && h.startsWith('wmsg_')) {
              try {
                const msgRec = new Record(devolucoesMensagensImportadas)
                msgRec.set('hash_mensagem', h)
                msgRec.set('batch_id', batch.id)
                msgRec.set('file_hash', batch.getString('file_hash'))
                msgRec.set('origem_canal', 'whatsapp')
                app.save(msgRec)
              } catch (_) {
                // Se já existir, ignora erro de duplicidade
              }
            }
          }
        }
      }
    } catch (e) {
      console.log('Aviso ao normalizar lotes anteriores de devolucoes_import_batches:', e)
    }
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('devolucoes_mensagens_importadas'))
    } catch (_) {}
  },
)
