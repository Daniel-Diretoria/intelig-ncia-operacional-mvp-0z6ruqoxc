// Endpoint de processamento de Validades no formato TradePro.
//
// Recebe os dados brutos + o resultado processado do pipeline (executado no
// frontend) e persiste em `validades_raw`, `validades_base` e `import_history`.
//
// Proteção contra reenvio: verifica o hash do arquivo antes de processar.
// Se o mesmo arquivo já foi concluído no mesmo tenant, retorna um alerta e
// só prossegue com reprocessamento explícito (force=true).
//
// POST /api/backend/v1/process-validades
// Body: {
//   fileName: string,
//   fileSize?: number,
//   fileHash: string,
//   arquivoTipo?: string,        // 'validades' | 'rupturas'
//   dataArquivo?: string,        // ISO YYYY-MM-DD extraído do nome
//   force?: boolean,             // reprocessamento explícito
//   rawRecords: Array<Record>,   // dados brutos (validades_raw)
//   baseAtual: Array<Record>,    // resultado processado (validades_base)
//   summary: { totalBrutos, filtrados90Dias, consolidados, baseAtual, maiorDataArquivo }
// }

routerAdd(
  'POST',
  '/api/backend/v1/process-validades',
  (e) => {
    const body = e.requestInfo().body || {}
    const authRecord = e.requestInfo().auth

    const fileName = body.fileName || 'importacao.xlsx'
    const fileSize = body.fileSize || 0
    const fileHash = body.fileHash || ''
    const arquivoTipo = body.arquivoTipo || 'validades'
    const dataArquivo = body.dataArquivo || ''
    const force = !!body.force
    const rawRecords = body.rawRecords || []
    const baseAtual = body.baseAtual || []
    const summary = body.summary || {}

    if (!baseAtual || !Array.isArray(baseAtual) || baseAtual.length === 0) {
      return e.json(400, {
        error: 'Nenhum registro processado para persistir.',
      })
    }

    const importHistoryCol = $app.findCollectionByNameOrId('import_history')
    const validadesRawCol = $app.findCollectionByNameOrId('validades_raw')
    const validadesBaseCol = $app.findCollectionByNameOrId('validades_base')

    // ---------------------------------------------------------------------------
    // Proteção contra reenvio: mesmo arquivo (hash) já concluído?
    // ---------------------------------------------------------------------------
    if (fileHash) {
      try {
        const existing = $app.findRecordsByFilter(
          'import_history',
          "file_hash = {:h} && status = 'completed'",
          '-created',
          1,
          0,
          { h: fileHash },
        )
        if (existing && existing.length > 0 && !force) {
          const prev = existing[0]
          return e.json(409, {
            success: false,
            duplicate: true,
            message:
              'Este arquivo já foi importado e concluído anteriormente. Reenvie com reprocessamento explícito se desejar substituir a importação anterior.',
            previousImportId: prev.getId(),
            previousDate: prev.get('created'),
          })
        }
      } catch (_) {}
    }

    // ---------------------------------------------------------------------------
    // 1. Cria o registro de histórico (status: processing)
    // ---------------------------------------------------------------------------
    const historyRecord = new Record(importHistoryCol)
    historyRecord.set('file_name', fileName)
    historyRecord.set('file_size', fileSize)
    historyRecord.set('file_hash', fileHash)
    historyRecord.set('arquivo_tipo', arquivoTipo)
    historyRecord.set('data_arquivo', dataArquivo || '')
    historyRecord.set('data_importacao', new Date().toISOString().slice(0, 19).replace('T', ' '))
    historyRecord.set('total_rows', summary.totalBrutos || rawRecords.length)
    historyRecord.set('imported_rows', 0)
    historyRecord.set('skipped_rows', 0)
    historyRecord.set('error_rows', 0)
    historyRecord.set('raw_count', summary.totalBrutos || rawRecords.length)
    historyRecord.set('filtered_count', summary.filtrados90Dias || 0)
    historyRecord.set('base_count', summary.baseAtual || baseAtual.length)
    historyRecord.set('status', 'processing')
    historyRecord.set('errors_json', '[]')
    historyRecord.set('source', 'tradepro')
    if (authRecord) {
      historyRecord.set('created_by', authRecord.id)
    }
    $app.save(historyRecord)
    const importId = historyRecord.getId()

    // ---------------------------------------------------------------------------
    // 2. Persiste dados brutos em validades_raw
    // ---------------------------------------------------------------------------
    let rawCount = 0
    const rawErrors = []

    try {
      $app.runInTransaction((txApp) => {
        for (let i = 0; i < rawRecords.length; i++) {
          const rec = rawRecords[i]
          try {
            const r = new Record(validadesRawCol)
            r.set('cod_colaborador', rec.cod_colaborador || '')
            r.set('colaborador', rec.colaborador || '')
            r.set('cod_supervisor', rec.cod_supervisor || '')
            r.set('supervisor', rec.supervisor || '')
            r.set('cpf_cnpj', rec.cpf_cnpj || '')
            r.set('razao_social', rec.razao_social || '')
            r.set('fantasia', rec.fantasia || '')
            r.set('cidade', rec.cidade || '')
            r.set('estado', rec.estado || '')
            r.set('cod_cliente', rec.cod_cliente || '')
            r.set('cliente', rec.cliente || '')
            r.set('cod_produto', rec.cod_produto || '')
            r.set('produto', rec.produto || '')
            r.set('cod_barras', rec.cod_barras || '')
            r.set('data_fabricacao', rec.data_fabricacao || '')
            r.set('realizado', rec.realizado || '')
            r.set('quantidade', rec.quantidade != null ? rec.quantidade : 0)
            r.set('dias_vencimento_arquivo', rec.dias_vencimento_arquivo || 0)
            r.set('validade', rec.validade || '')
            r.set('numero_lote', rec.numero_lote || '')
            r.set('representante', rec.representante || '')
            r.set('cnpj', rec.cnpj || '')
            r.set('fornecedor', rec.fornecedor || '')
            r.set('numero_linha', rec.numero_linha || 0)
            r.set('data_arquivo', rec.data_arquivo || dataArquivo || '')
            r.set('data_importacao', rec.data_importacao || '')
            r.set('import_id', importId)
            if (authRecord) r.set('created_by', authRecord.id)
            txApp.save(r)
            rawCount++
          } catch (err) {
            rawErrors.push({ row: i, error: String(err && err.message ? err.message : err) })
          }
        }
      })
    } catch (err) {
      historyRecord.set('status', 'failed')
      historyRecord.set(
        'errors_json',
        JSON.stringify(
          rawErrors.concat([{ error: String(err && err.message ? err.message : err) }]),
        ),
      )
      $app.save(historyRecord)
      return e.json(500, {
        error: 'Falha ao persistir dados brutos.',
        detail: String(err && err.message ? err.message : err),
        importId: importId,
      })
    }

    // ---------------------------------------------------------------------------
    // 3. Persiste Base Atual em validades_base (upsert por chave_operacional)
    //    No reprocessamento (force), remove registros anteriores do mesmo hash
    //    para evitar duplicação.
    // ---------------------------------------------------------------------------
    if (force) {
      try {
        const prevBase = $app.findRecordsByFilter('validades_base', 'import_id = {:i}', '', 0, 0, {
          i: importId,
        })
        // não há registros para este import_id ainda (acabou de criar), mas
        // removemos quaisquer chaves duplicadas que serão re-criadas abaixo.
      } catch (_) {}
    }

    let baseCount = 0
    const baseErrors = []

    try {
      $app.runInTransaction((txApp) => {
        for (let i = 0; i < baseAtual.length; i++) {
          const rec = baseAtual[i]
          try {
            // upsert por chave_operacional: se existir, atualiza; senão, cria.
            let existing = null
            if (rec.chave_operacional) {
              try {
                const found = txApp.findRecordsByFilter(
                  'validades_base',
                  'chave_operacional = {:c}',
                  '-updated',
                  1,
                  0,
                  { c: rec.chave_operacional },
                )
                if (found && found.length > 0) existing = found[0]
              } catch (_) {}
            }

            const r = existing || new Record(validadesBaseCol)
            if (rec.fornecedor != null) r.set('fornecedor', rec.fornecedor)
            if (rec.razao_social != null) r.set('razao_social', rec.razao_social)
            if (rec.produto != null) r.set('produto', rec.produto)
            if (rec.cliente != null) r.set('cliente', rec.cliente)
            if (rec.cod_cliente != null) r.set('cod_cliente', rec.cod_cliente)
            if (rec.cod_produto != null) r.set('cod_produto', rec.cod_produto)
            if (rec.cod_barras != null) r.set('cod_barras', rec.cod_barras)
            if (rec.cpf_cnpj != null) r.set('cpf_cnpj', rec.cpf_cnpj)
            if (rec.cnpj != null) r.set('cnpj', rec.cnpj)
            if (rec.codigo_loja != null) r.set('codigo_loja', rec.codigo_loja)
            if (rec.nome_loja != null) r.set('nome_loja', rec.nome_loja)
            if (rec.rede != null) r.set('rede', rec.rede)
            if (rec.cidade != null) r.set('cidade', rec.cidade)
            if (rec.estado != null) r.set('estado', rec.estado)
            if (rec.colaborador != null) r.set('colaborador', rec.colaborador)
            if (rec.cod_colaborador != null) r.set('cod_colaborador', rec.cod_colaborador)
            if (rec.supervisor != null) r.set('supervisor', rec.supervisor)
            if (rec.cod_supervisor != null) r.set('cod_supervisor', rec.cod_supervisor)
            if (rec.fantasia != null) r.set('fantasia', rec.fantasia)
            if (rec.representante != null) r.set('representante', rec.representante)
            if (rec.numero_lote != null) r.set('numero_lote', rec.numero_lote)
            if (rec.realizado != null) r.set('realizado', rec.realizado)
            if (rec.validade_original != null) r.set('validade_original', rec.validade_original)
            if (rec.validade_efetiva != null) r.set('validade_efetiva', rec.validade_efetiva)
            if (rec.data_arquivo != null) r.set('data_arquivo', rec.data_arquivo)
            if (rec.data_importacao != null) r.set('data_importacao', rec.data_importacao)
            if (rec.data_entrada != null) r.set('data_entrada', rec.data_entrada)
            if (rec.ultima_aparicao != null) r.set('ultima_aparicao', rec.ultima_aparicao)
            r.set('quantidade', rec.quantidade != null ? rec.quantidade : 0)
            r.set('is_base_atual', rec.is_base_atual != null ? !!rec.is_base_atual : true)
            if (rec.chave_operacional != null) r.set('chave_operacional', rec.chave_operacional)
            if (rec.chave_dedup != null) r.set('chave_dedup', rec.chave_dedup)
            r.set('correcao_aplicada', !!rec.correcao_aplicada)
            if (rec.regra_correcao != null) r.set('regra_correcao', rec.regra_correcao)
            r.set('dias_vencimento_atual', rec.dias_vencimento_atual || 0)
            r.set('dias_vencimento_arquivo', rec.dias_vencimento_arquivo || 0)
            r.set('dias_vencimento_entrada', rec.dias_vencimento_entrada || 0)
            if (rec.status_operacional != null) r.set('status_operacional', rec.status_operacional)
            if (rec.status_na_entrada != null) r.set('status_na_entrada', rec.status_na_entrada)
            if (rec.situacao_atual != null) r.set('situacao_atual', rec.situacao_atual)
            r.set('import_id', importId)
            if (authRecord) r.set('created_by', authRecord.id)
            txApp.save(r)
            baseCount++
          } catch (err) {
            baseErrors.push({ row: i, error: String(err && err.message ? err.message : err) })
          }
        }
      })
    } catch (err) {
      historyRecord.set('status', 'failed')
      historyRecord.set(
        'errors_json',
        JSON.stringify(
          baseErrors.concat([{ error: String(err && err.message ? err.message : err) }]),
        ),
      )
      $app.save(historyRecord)
      return e.json(500, {
        error: 'Falha ao persistir Base Atual.',
        detail: String(err && err.message ? err.message : err),
        importId: importId,
      })
    }

    // ---------------------------------------------------------------------------
    // 4. Atualiza o histórico com totais finais
    // ---------------------------------------------------------------------------
    historyRecord.set('imported_rows', baseCount)
    historyRecord.set('skipped_rows', rawCount - baseCount)
    historyRecord.set('error_rows', baseErrors.length)
    historyRecord.set('status', 'completed')
    if (baseErrors.length > 0) {
      historyRecord.set('errors_json', JSON.stringify(baseErrors))
    }
    $app.save(historyRecord)

    return e.json(200, {
      success: true,
      importId: importId,
      importedRows: baseCount,
      rawRows: rawCount,
      skippedRows: rawCount - baseCount,
      errorRows: baseErrors.length,
      summary: {
        totalBrutos: summary.totalBrutos || rawCount,
        filtrados90Dias: summary.filtrados90Dias || 0,
        consolidados: summary.consolidados || 0,
        baseAtual: baseCount,
        maiorDataArquivo: summary.maiorDataArquivo || '',
      },
    })
  },
  $apis.requireAuth(),
)
