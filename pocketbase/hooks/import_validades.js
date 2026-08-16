// Endpoint de importação de dados de validades.
// Recebe registros já validados pelo frontend e os persiste em `validades_imported`,
// criando também um registro em `import_history` com o resumo da importação.
//
// O frontend faz a leitura do Excel, mapeamento e validação; este hook apenas
// persiste os dados prontos. Isso mantém o pipeline reutilizável para a futura
// sincronização com a API TradePro (basta trocar a origem dos registros).
//
// POST /api/backend/v1/import-validades
// Body: {
//   fileName: string,
//   fileSize?: number,
//   records: Array<{ ...campos de ValidadeItem }>,
//   summary: { totalRows, validRows, invalidRows, warningRows, errors }
// }

routerAdd(
  'POST',
  '/api/backend/v1/import-validades',
  (e) => {
    const body = e.requestInfo().body || {}
    const authRecord = e.requestInfo().auth

    const fileName = body.fileName || 'importacao.xlsx'
    const fileSize = body.fileSize || 0
    const records = body.records || []
    const summary = body.summary || {}

    if (!records || !Array.isArray(records) || records.length === 0) {
      return e.json(400, {
        error: 'Nenhum registro válido para importar.',
      })
    }

    const importHistoryCol = $app.findCollectionByNameOrId('import_history')
    const validadesCol = $app.findCollectionByNameOrId('validades_imported')

    // 1. Cria o registro de histórico (status: processing)
    const historyRecord = new Record(importHistoryCol)
    historyRecord.set('file_name', fileName)
    historyRecord.set('file_size', fileSize)
    historyRecord.set('total_rows', summary.totalRows || records.length)
    historyRecord.set('imported_rows', 0)
    historyRecord.set('skipped_rows', summary.invalidRows || 0)
    historyRecord.set('error_rows', summary.invalidRows || 0)
    historyRecord.set('status', 'processing')
    historyRecord.set('errors_json', JSON.stringify(summary.errors || []))
    historyRecord.set('source', 'excel')
    if (authRecord) {
      historyRecord.set('created_by', authRecord.id)
    }
    $app.save(historyRecord)

    // 2. Insere os registros em validades_imported
    let importedCount = 0
    const importId = historyRecord.id
    const errors = []

    try {
      $app.runInTransaction((txApp) => {
        for (let i = 0; i < records.length; i++) {
          const rec = records[i]
          try {
            const r = new Record(validadesCol)
            r.set('product', rec.product || '')
            r.set('sku', rec.sku || '')
            r.set('lote', rec.lote || '')
            r.set('category', rec.category || 'Mercearia')
            r.set('validade', rec.validade || '')
            r.set('diasRestantes', rec.diasRestantes != null ? rec.diasRestantes : 0)
            r.set('status', rec.status || 'OK')
            r.set('unidade', rec.unidade || 'UN')
            r.set('estoque', rec.estoque != null ? rec.estoque : 0)
            if (rec.cliente) r.set('cliente', rec.cliente)
            if (rec.industria) r.set('industria', rec.industria)
            if (rec.rede) r.set('rede', rec.rede)
            if (rec.loja) r.set('loja', rec.loja)
            if (rec.cidade) r.set('cidade', rec.cidade)
            if (rec.uf) r.set('uf', rec.uf)
            if (rec.promotor) r.set('promotor', rec.promotor)
            if (rec.supervisor) r.set('supervisor', rec.supervisor)
            if (rec.quantidade != null) r.set('quantidade', rec.quantidade)
            if (rec.precoUnitario != null) r.set('precoUnitario', rec.precoUnitario)
            if (rec.ultimaAtualizacao) r.set('ultimaAtualizacao', rec.ultimaAtualizacao)
            r.set('import_id', importId)
            if (authRecord) {
              r.set('created_by', authRecord.id)
            }
            txApp.save(r)
            importedCount++
          } catch (err) {
            errors.push({ row: i, error: String(err && err.message ? err.message : err) })
          }
        }
      })
    } catch (err) {
      // Falha transacional — marca histórico como failed
      historyRecord.set('status', 'failed')
      historyRecord.set(
        'errors_json',
        JSON.stringify(errors.concat([{ error: String(err && err.message ? err.message : err) }])),
      )
      $app.save(historyRecord)
      return e.json(500, {
        error: 'Falha ao persistir registros.',
        detail: String(err && err.message ? err.message : err),
        importId: importId,
      })
    }

    // 3. Atualiza o histórico com totais finais
    historyRecord.set('imported_rows', importedCount)
    historyRecord.set('status', 'completed')
    if (errors.length > 0) {
      historyRecord.set('errors_json', JSON.stringify(errors))
    }
    $app.save(historyRecord)

    return e.json(200, {
      success: true,
      importId: importId,
      importedRows: importedCount,
      skippedRows: (summary.totalRows || records.length) - importedCount,
      errorRows: errors.length,
    })
  },
  $apis.requireAuth(),
)
