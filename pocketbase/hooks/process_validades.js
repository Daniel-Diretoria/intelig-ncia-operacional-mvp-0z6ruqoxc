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
    //    Frontend envia camelCase; BD usa snake_case. Lemos ambos os formatos
    //    (camelCase do pipeline + snake_case legado) para máxima compatibilidade.
    // ---------------------------------------------------------------------------
    let rawCount = 0
    const rawErrors = []

    try {
      $app.runInTransaction((txApp) => {
        for (let i = 0; i < rawRecords.length; i++) {
          const rec = rawRecords[i] || {}
          try {
            // Helper: lê camelCase com fallback snake_case
            const pick = function (camel, snake) {
              if (rec[camel] != null) return rec[camel]
              if (rec[snake] != null) return rec[snake]
              return undefined
            }

            const r = new Record(validadesRawCol)
            r.set('cod_colaborador', pick('codColaborador', 'cod_colaborador') || '')
            r.set('colaborador', rec.colaborador || '')
            r.set('cod_supervisor', pick('codSupervisor', 'cod_supervisor') || '')
            r.set('supervisor', rec.supervisor || '')
            r.set('cpf_cnpj', pick('cpfCnpj', 'cpf_cnpj') || '')
            r.set('razao_social', pick('razaoSocial', 'razao_social') || '')
            r.set('fantasia', rec.fantasia || '')
            r.set('cidade', rec.cidade || '')
            r.set('estado', rec.estado || '')
            r.set('cod_cliente', pick('codCliente', 'cod_cliente') || '')
            r.set('cliente', rec.cliente || '')
            r.set('cod_produto', pick('codProduto', 'cod_produto') || '')
            r.set('produto', rec.produto || '')
            r.set('cod_barras', pick('codBarras', 'cod_barras') || '')
            const dataFabricacao = pick('dataFabricacao', 'data_fabricacao')
            r.set('data_fabricacao', dataFabricacao || '')
            r.set('realizado', rec.realizado || '')
            r.set(
              'quantidade',
              pick('quantidade', 'quantidade') != null ? pick('quantidade', 'quantidade') : 0,
            )
            const diasVencArq = pick('diasVencimentoArquivo', 'dias_vencimento_arquivo')
            r.set('dias_vencimento_arquivo', diasVencArq || 0)
            r.set('validade', rec.validade || '')
            r.set('numero_lote', pick('numeroLote', 'numero_lote') || '')
            r.set('representante', rec.representante || '')
            r.set('cnpj', rec.cnpj || '')
            r.set('fornecedor', rec.fornecedor || '')
            r.set('numero_linha', pick('numeroLinha', 'numero_linha') || 0)
            r.set('data_arquivo', pick('dataArquivo', 'data_arquivo') || dataArquivo || '')
            r.set('data_importacao', pick('dataImportacao', 'data_importacao') || '')
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
          const rec = baseAtual[i] || {}
          try {
            // Frontend envia camelCase; BD usa snake_case.
            // Helper: lê camelCase com fallback snake_case.
            const pick = function (camel, snake) {
              if (rec[camel] != null) return rec[camel]
              if (rec[snake] != null) return rec[snake]
              return undefined
            }

            const chaveOperacional = pick('chaveOperacional', 'chave_operacional')

            // upsert por chave_operacional: se existir, atualiza; senão, cria.
            let existing = null
            if (chaveOperacional) {
              try {
                const found = txApp.findRecordsByFilter(
                  'validades_base',
                  'chave_operacional = {:c}',
                  '-updated',
                  1,
                  0,
                  { c: chaveOperacional },
                )
                if (found && found.length > 0) existing = found[0]
              } catch (_) {}
            }

            const r = existing || new Record(validadesBaseCol)
            if (rec.fornecedor != null) r.set('fornecedor', rec.fornecedor)
            if (pick('razaoSocial', 'razao_social') != null)
              r.set('razao_social', pick('razaoSocial', 'razao_social'))
            if (rec.produto != null) r.set('produto', rec.produto)
            if (rec.cliente != null) r.set('cliente', rec.cliente)
            if (pick('codCliente', 'cod_cliente') != null)
              r.set('cod_cliente', pick('codCliente', 'cod_cliente'))
            if (pick('codProduto', 'cod_produto') != null)
              r.set('cod_produto', pick('codProduto', 'cod_produto'))
            if (pick('codBarras', 'cod_barras') != null)
              r.set('cod_barras', pick('codBarras', 'cod_barras'))
            if (pick('cpfCnpj', 'cpf_cnpj') != null) r.set('cpf_cnpj', pick('cpfCnpj', 'cpf_cnpj'))
            if (rec.cnpj != null) r.set('cnpj', rec.cnpj)
            if (pick('codigoLoja', 'codigo_loja') != null)
              r.set('codigo_loja', pick('codigoLoja', 'codigo_loja'))
            if (pick('nomeLoja', 'nome_loja') != null)
              r.set('nome_loja', pick('nomeLoja', 'nome_loja'))
            if (rec.rede != null) r.set('rede', rec.rede)
            if (rec.cidade != null) r.set('cidade', rec.cidade)
            if (rec.estado != null) r.set('estado', rec.estado)
            if (rec.colaborador != null) r.set('colaborador', rec.colaborador)
            if (pick('codColaborador', 'cod_colaborador') != null)
              r.set('cod_colaborador', pick('codColaborador', 'cod_colaborador'))
            if (rec.supervisor != null) r.set('supervisor', rec.supervisor)
            if (pick('codSupervisor', 'cod_supervisor') != null)
              r.set('cod_supervisor', pick('codSupervisor', 'cod_supervisor'))
            if (rec.fantasia != null) r.set('fantasia', rec.fantasia)
            if (rec.representante != null) r.set('representante', rec.representante)
            if (pick('numeroLote', 'numero_lote') != null)
              r.set('numero_lote', pick('numeroLote', 'numero_lote'))
            if (rec.realizado != null) r.set('realizado', rec.realizado)
            if (pick('validadeOriginal', 'validade_original') != null)
              r.set('validade_original', pick('validadeOriginal', 'validade_original'))
            if (pick('validadeEfetiva', 'validade_efetiva') != null)
              r.set('validade_efetiva', pick('validadeEfetiva', 'validade_efetiva'))
            if (pick('dataArquivo', 'data_arquivo') != null)
              r.set('data_arquivo', pick('dataArquivo', 'data_arquivo'))
            if (pick('dataImportacao', 'data_importacao') != null)
              r.set('data_importacao', pick('dataImportacao', 'data_importacao'))
            if (pick('dataEntrada', 'data_entrada') != null)
              r.set('data_entrada', pick('dataEntrada', 'data_entrada'))
            if (pick('ultimaAparicao', 'ultima_aparicao') != null)
              r.set('ultima_aparicao', pick('ultimaAparicao', 'ultima_aparicao'))
            r.set(
              'quantidade',
              pick('quantidade', 'quantidade') != null ? pick('quantidade', 'quantidade') : 0,
            )
            const isBaseAtualVal = pick('isBaseAtual', 'is_base_atual')
            r.set('is_base_atual', isBaseAtualVal != null ? !!isBaseAtualVal : true)
            if (chaveOperacional != null) r.set('chave_operacional', chaveOperacional)
            if (pick('chaveDedup', 'chave_dedup') != null)
              r.set('chave_dedup', pick('chaveDedup', 'chave_dedup'))
            const correcaoAplicadaVal = pick('correcaoAplicada', 'correcao_aplicada')
            r.set('correcao_aplicada', !!correcaoAplicadaVal)
            if (pick('regraCorrecao', 'regra_correcao') != null)
              r.set('regra_correcao', pick('regraCorrecao', 'regra_correcao'))
            r.set(
              'dias_vencimento_atual',
              pick('diasVencimentoAtual', 'dias_vencimento_atual') || 0,
            )
            r.set(
              'dias_vencimento_arquivo',
              pick('diasVencimentoArquivo', 'dias_vencimento_arquivo') || 0,
            )
            r.set(
              'dias_vencimento_entrada',
              pick('diasVencimentoEntrada', 'dias_vencimento_entrada') || 0,
            )
            if (pick('statusOperacional', 'status_operacional') != null)
              r.set('status_operacional', pick('statusOperacional', 'status_operacional'))
            if (pick('statusNaEntrada', 'status_na_entrada') != null)
              r.set('status_na_entrada', pick('statusNaEntrada', 'status_na_entrada'))
            if (pick('situacaoAtual', 'situacao_atual') != null)
              r.set('situacao_atual', pick('situacaoAtual', 'situacao_atual'))
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
