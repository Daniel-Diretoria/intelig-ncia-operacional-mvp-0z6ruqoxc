// Endpoint para deduplicação escalável de mensagens WhatsApp do módulo Devoluções/NF
// POST /backend/v1/devolucoes/verificar-hashes
// Recebe lista de hashes gerados pelo parser do arquivo atual
// Retorna o subconjunto de hashes que já constam na base persistida devolucoes_mensagens_importadas

routerAdd(
  'POST',
  '/backend/v1/devolucoes/verificar-hashes',
  (e) => {
    const body = e.requestInfo().body || {}
    const hashes = body.hashes || []

    if (!Array.isArray(hashes) || hashes.length === 0) {
      return e.json(200, {
        hashesConhecidos: [],
        totalVerificados: 0,
      })
    }

    // Filtrar hashes válidos
    const hashesValidos = []
    for (let i = 0; i < hashes.length; i++) {
      const h = hashes[i]
      if (typeof h === 'string' && h.trim().length > 0) {
        hashesValidos.push(h.trim())
      }
    }

    if (hashesValidos.length === 0) {
      return e.json(200, {
        hashesConhecidos: [],
        totalVerificados: 0,
      })
    }

    const hashesConhecidosSet = {}

    // Consultar em chunks de até 100 itens para não exceder limites de query
    const CHUNK_SIZE = 100
    for (let c = 0; c < hashesValidos.length; c += CHUNK_SIZE) {
      const chunk = hashesValidos.slice(c, c + CHUNK_SIZE)
      const filterConditions = []
      for (let j = 0; j < chunk.length; j++) {
        const escaped = chunk[j].replace(/\\/g, '\\\\').replace(/'/g, "\\'")
        filterConditions.push("hash_mensagem = '" + escaped + "'")
      }
      const filterStr = filterConditions.join(' || ')

      try {
        const records = $app.findRecordsByFilter(
          'devolucoes_mensagens_importadas',
          filterStr,
          '',
          chunk.length,
          0,
        )
        for (let r = 0; r < records.length; r++) {
          const recHash = records[r].getString('hash_mensagem')
          if (recHash) {
            hashesConhecidosSet[recHash] = true
          }
        }
      } catch (err) {
        // Se falhar ou tabela vazia, continua
      }
    }

    const resultadoFinal = Object.keys(hashesConhecidosSet)

    return e.json(200, {
      hashesConhecidos: resultadoFinal,
      totalVerificados: hashesValidos.length,
    })
  },
  $apis.requireAuth(),
)
