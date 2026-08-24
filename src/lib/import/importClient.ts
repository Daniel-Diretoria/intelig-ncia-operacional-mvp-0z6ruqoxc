/**
 * Cliente de importação — orquestra o envio dos registros validados para o
 * backend e persistência em `validades_raw` + `validades_base` + `import_history`.
 *
 * Mantido separado da UI para que a origem dos dados possa ser trocada
 * (Excel -> API TradePro) sem alterar o pipeline de persistência.
 *
 * REGRA DE OURO DE INTEGRIDADE:
 * Uma execução só termina como "completed" quando TODAS as gravações obrigatórias
 * de raw e base tiverem sucesso (rawCount > 0, baseCount > 0 e failures === 0 em ambas as etapas).
 * Qualquer falha parcial finaliza como "failed", nunca "completed".
 *
 * NOTA SOBRE TIMEOUT / ABORT:
 * O SDK atual do PocketBase não oferece suporte universal e seguro a AbortSignal em
 * operações concorrentes em lote no browser sem risco de requisições órfãs não canceláveis.
 * Não usamos Promise.race (para evitar requisições abandonadas em segundo plano). Mantemos
 * status honesto e tratamento robusto de try/catch e report de falhas.
 */
import pb from '@/lib/pocketbase/client'
import type { ValidadeItem, ProcessedValidade, TradeProRawRecord } from '@/types'
import type { DatasetValidationReport } from './validators'

export interface ImportPayload {
  fileName: string
  fileSize: number
  records: ValidadeItem[]
  summary: {
    totalRows: number
    validRows: number
    invalidRows: number
    warningRows: number
    errors: unknown[]
  }
}

export interface ImportResult {
  success: boolean
  importId: string
  importedRows: number
  skippedRows: number
  errorRows: number
  error?: string
}

export async function submitImport(payload: ImportPayload): Promise<ImportResult> {
  try {
    const res = await pb.send('/api/backend/v1/import-validades', {
      method: 'POST',
      body: payload,
    })
    return res as ImportResult
  } catch (err) {
    const e = err as { message?: string; response?: { message?: string } }
    return {
      success: false,
      importId: '',
      importedRows: 0,
      skippedRows: 0,
      errorRows: 0,
      error: e?.response?.message || e?.message || 'Falha ao enviar importação.',
    }
  }
}

// =============================================================================
// TradePro — processamento completo (pipeline + persistência)
// =============================================================================

export interface ImportProgressState {
  stage:
    | 'idle'
    | 'reading'
    | 'validating'
    | 'saving_raw'
    | 'saving_base'
    | 'finalizing'
    | 'done'
    | 'failed'
  message: string
  processed: number
  total: number
  failuresCount: number
}

export type OnProgressCallback = (progress: ImportProgressState) => void

export interface ProcessValidadesPayload {
  fileName: string
  fileSize?: number
  fileHash: string
  arquivoTipo?: string
  dataArquivo?: string
  force?: boolean
  rawRecords: Partial<TradeProRawRecord>[]
  baseAtual: Partial<ProcessedValidade>[]
  summary: {
    totalBrutos: number
    validos?: number
    rejeitados?: number
    filtrados90Dias: number
    consolidados: number
    baseAtual: number
    maiorDataArquivo?: string
  }
  onProgress?: OnProgressCallback
}

export interface ProcessValidadesResult {
  success: boolean
  importId: string
  importedRows: number
  rawRows: number
  skippedRows: number
  errorRows: number
  summary?: {
    totalBrutos: number
    validos?: number
    rejeitados?: number
    filtrados90Dias: number
    consolidados: number
    baseAtual: number
    maiorDataArquivo?: string
  }
  duplicate?: boolean
  message?: string
  previousImportId?: string
  previousDate?: string
  error?: string
  errorsDetails?: Array<{
    stage: 'raw' | 'base' | 'general'
    index?: number
    key?: string
    error: string
  }>
}

type AnyRec = Record<string, unknown>

/** Lê um valor do registro tentando camelCase primeiro, depois snake_case. */
function pick(rec: AnyRec, camel: string, snake: string): unknown {
  const c = rec[camel]
  if (c !== undefined && c !== null && c !== '') return c
  const s = rec[snake]
  if (s !== undefined && s !== null && s !== '') return s
  return undefined
}

/** Constrói o payload snake_case a partir de um registro (camelCase | snake_case). */
function buildSnake(rec: AnyRec, pairs: Array<[snake: string, camel: string]>): AnyRec {
  const out: AnyRec = {}
  for (const [snake, camel] of pairs) {
    const v = pick(rec, camel, snake)
    if (v !== undefined) out[snake] = v
  }
  return out
}

/** Campos mapeados para `validades_raw` (camelCase → snake_case). */
const RAW_FIELDS: Array<[string, string]> = [
  ['cod_colaborador', 'codColaborador'],
  ['colaborador', 'colaborador'],
  ['cod_supervisor', 'codSupervisor'],
  ['supervisor', 'supervisor'],
  ['cpf_cnpj', 'cpfCnpj'],
  ['razao_social', 'razaoSocial'],
  ['fantasia', 'fantasia'],
  ['cidade', 'cidade'],
  ['estado', 'estado'],
  ['cod_cliente', 'codCliente'],
  ['cliente', 'cliente'],
  ['cod_produto', 'codProduto'],
  ['produto', 'produto'],
  ['cod_barras', 'codBarras'],
  ['data_fabricacao', 'dataFabricacao'],
  ['realizado', 'realizado'],
  ['quantidade', 'quantidade'],
  ['dias_vencimento_arquivo', 'diasVencimentoArquivo'],
  ['validade', 'validade'],
  ['numero_lote', 'numeroLote'],
  ['representante', 'representante'],
  ['cnpj', 'cnpj'],
  ['fornecedor', 'fornecedor'],
  ['numero_linha', 'numeroLinha'],
  ['data_arquivo', 'dataArquivo'],
  ['data_importacao', 'dataImportacao'],
]

/** Campos mapeados para `validades_base` (camelCase → snake_case). */
const BASE_FIELDS: Array<[string, string]> = [
  ['fornecedor', 'fornecedor'],
  ['razao_social', 'razaoSocial'],
  ['produto', 'produto'],
  ['cliente', 'cliente'],
  ['cod_cliente', 'codCliente'],
  ['cod_produto', 'codProduto'],
  ['cod_barras', 'codBarras'],
  ['cpf_cnpj', 'cpfCnpj'],
  ['cnpj', 'cnpj'],
  ['codigo_loja', 'codigoLoja'],
  ['nome_loja', 'nomeLoja'],
  ['rede', 'rede'],
  ['cidade', 'cidade'],
  ['estado', 'estado'],
  ['colaborador', 'colaborador'],
  ['cod_colaborador', 'codColaborador'],
  ['supervisor', 'supervisor'],
  ['cod_supervisor', 'codSupervisor'],
  ['fantasia', 'fantasia'],
  ['representante', 'representante'],
  ['numero_lote', 'numeroLote'],
  ['realizado', 'realizado'],
  ['validade_original', 'validadeOriginal'],
  ['validade_efetiva', 'validadeEfetiva'],
  ['data_arquivo', 'dataArquivo'],
  ['data_importacao', 'dataImportacao'],
  ['data_entrada', 'dataEntrada'],
  ['ultima_aparicao', 'ultimaAparicao'],
  ['quantidade', 'quantidade'],
  ['is_base_atual', 'isBaseAtual'],
  ['chave_operacional', 'chaveOperacional'],
  ['chave_dedup', 'chaveDedup'],
  ['correcao_aplicada', 'correcaoAplicada'],
  ['regra_correcao', 'regraCorrecao'],
  ['dias_vencimento_atual', 'diasVencimentoAtual'],
  ['dias_vencimento_arquivo', 'diasVencimentoArquivo'],
  ['dias_vencimento_entrada', 'diasVencimentoEntrada'],
  ['status_operacional', 'statusOperacional'],
  ['status_na_entrada', 'statusNaEntrada'],
  ['situacao_atual', 'situacaoAtual'],
]

/**
 * Sanitiza texto removendo tokens Bearer, headers de autorização e secrets sensíveis.
 */
export function sanitizeErrorMessage(text: string): string {
  if (!text) return ''
  return text
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(/(?:authorization|api-key|secret|password|token)\s*[:=]\s*["']?[^"'}\s,]+/gi, (m) => {
      const parts = m.split(/[:=]/)
      return `${parts[0]}=[REDACTED]`
    })
}

/**
 * Extrator seguro e informativo de mensagem de erro.
 * Captura message, response.message, response.data (incluindo erros de campo), status/code e operação,
 * garantindo NUNCA vazar credenciais ou tokens.
 */
export function errMsg(
  err: unknown,
  context?: { collection?: string; operation?: string },
): string {
  if (!err) return 'Erro desconhecido'

  const parts: string[] = []

  if (typeof err === 'string') {
    return sanitizeErrorMessage(err)
  }

  const e = err as {
    message?: string
    status?: number
    statusCode?: number
    code?: number | string
    response?: {
      message?: string
      code?: number | string
      data?: Record<string, unknown>
    }
    data?: Record<string, unknown>
  }

  const prefix =
    context?.collection || context?.operation
      ? `[${context.collection || ''}${context.collection && context.operation ? ':' : ''}${
          context.operation || ''
        }] `
      : ''

  // 1. response.data field errors (ex: PocketBase validation errors)
  const dataObj = e.response?.data || e.data
  if (dataObj && typeof dataObj === 'object') {
    const fieldErrors: string[] = []
    for (const [key, val] of Object.entries(dataObj)) {
      if (val && typeof val === 'object' && 'message' in (val as Record<string, unknown>)) {
        fieldErrors.push(`${key}: ${(val as { message: string }).message}`)
      } else if (typeof val === 'string') {
        fieldErrors.push(`${key}: ${val}`)
      }
    }
    if (fieldErrors.length > 0) {
      parts.push(fieldErrors.join(', '))
    }
  }

  // 2. response.message
  if (e.response?.message && typeof e.response.message === 'string') {
    if (!parts.includes(e.response.message)) {
      parts.push(e.response.message)
    }
  }

  // 3. err.message
  if (e.message && typeof e.message === 'string') {
    if (!parts.some((p) => p.includes(e.message!))) {
      parts.push(e.message)
    }
  }

  // 4. Status / code
  const code = e.status || e.statusCode || e.response?.code || e.code
  const codeStr = code ? ` (código ${code})` : ''

  if (parts.length === 0) {
    return `${prefix}Erro desconhecido${codeStr}`
  }

  const raw = `${prefix}${parts.join(' — ')}${codeStr}`
  return sanitizeErrorMessage(raw)
}

/** Tamanho do lote de concorrência para persistência (criações/updates paralelos). */
export const PERSIST_CHUNK_SIZE = 25

export interface FailureDetail {
  index: number
  key?: string
  error: string
}

/**
 * Executa `fn` sobre todos os itens em lotes concorrentes (Promise.allSettled),
 * cedendo controle ao event loop entre cada lote para evitar travamento da UI em volumes grandes.
 */
export async function persistConcurrent<T>(
  items: T[],
  fn: (item: T, index: number) => Promise<unknown>,
  options?: {
    getKey?: (item: T, index: number) => string | undefined
    onChunkProgress?: (processed: number, total: number, failures: number) => void
    context?: { collection?: string; operation?: string }
  },
): Promise<FailureDetail[]> {
  const failures: FailureDetail[] = []
  let processed = 0

  for (let start = 0; start < items.length; start += PERSIST_CHUNK_SIZE) {
    const end = Math.min(start + PERSIST_CHUNK_SIZE, items.length)
    const slice = items.slice(start, end)

    const settled = await Promise.allSettled(slice.map((item, i) => fn(item, start + i)))

    settled.forEach((res, i) => {
      const idx = start + i
      if (res.status !== 'fulfilled') {
        const key = options?.getKey ? options.getKey(slice[i], idx) : undefined
        failures.push({
          index: idx,
          key,
          error: errMsg(res.reason, options?.context),
        })
      }
    })

    processed = end
    options?.onChunkProgress?.(processed, items.length, failures.length)

    // Cede controle ao event loop para não travar a interface
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  return failures
}

export async function submitProcessValidades(
  payload: ProcessValidadesPayload,
): Promise<ProcessValidadesResult> {
  const {
    fileName,
    fileSize = 0,
    fileHash,
    arquivoTipo = 'validades',
    dataArquivo,
    force = false,
    rawRecords,
    baseAtual,
    summary,
    onProgress,
  } = payload

  const rawCount = rawRecords.length
  const baseCount = baseAtual.length
  const now = new Date().toISOString()
  const errors: Array<{
    stage: 'raw' | 'base' | 'general'
    index?: number
    key?: string
    error: string
  }> = []

  let importId = ''

  // Função auxiliar de notificação de progresso
  const reportProgress = (
    stage: ImportProgressState['stage'],
    message: string,
    processed: number,
    total: number,
    failuresCount: number,
  ) => {
    onProgress?.({
      stage,
      message,
      processed,
      total,
      failuresCount,
    })
  }

  // --- Proteção contra reenvio ------------------------------------------------
  if (!force && fileHash) {
    try {
      const dup = await pb.collection('import_history').getList(1, 1, {
        filter: `file_hash = "${fileHash}" && status = "completed"`,
        sort: '-created',
      })
      if (dup.items.length > 0) {
        const prev = dup.items[0] as unknown as AnyRec
        return {
          success: false,
          importId: '',
          importedRows: 0,
          rawRows: rawCount,
          skippedRows: 0,
          errorRows: 0,
          summary,
          duplicate: true,
          message:
            'Este arquivo já foi importado e concluído. Marque "Reprocessar" para substituir.',
          previousImportId: prev.id as string,
          previousDate: prev.created as string,
        }
      }
    } catch {
      // Ignora falha na checagem — segue com a importação
    }
  }

  // Todo o fluxo a partir daqui é envolvido em try/catch para garantir status honesto
  try {
    // --- 1. Criar registro em import_history (status: processing) --------------
    reportProgress('validating', 'Criando registro de histórico de importação...', 0, rawCount, 0)
    try {
      const hist = await pb.collection('import_history').create({
        file_name: fileName,
        file_size: fileSize,
        file_hash: fileHash,
        arquivo_tipo: arquivoTipo,
        data_arquivo: dataArquivo || undefined,
        data_importacao: now,
        total_rows: summary.totalBrutos,
        imported_rows: 0,
        skipped_rows: 0,
        error_rows: 0,
        raw_count: rawCount,
        filtered_count: summary.filtrados90Dias,
        base_count: baseCount,
        status: 'processing',
        errors_json: '[]',
        source: 'tradepro',
      })
      importId = (hist as unknown as { id: string }).id
    } catch (err) {
      const eMsg = errMsg(err, { collection: 'import_history', operation: 'create' })
      return {
        success: false,
        importId: '',
        importedRows: 0,
        rawRows: rawCount,
        skippedRows: 0,
        errorRows: 1,
        summary,
        error: `Falha ao criar histórico de importação: ${eMsg}`,
        errorsDetails: [{ stage: 'general', error: eMsg }],
      }
    }

    // --- 2. Persistir dados brutos em validades_raw (lotes concorrentes) --------
    reportProgress('saving_raw', `Gravando raw (0 de ${rawCount})...`, 0, rawCount, 0)

    let rawPersisted = 0
    {
      const payloads: AnyRec[] = rawRecords.map((rec) => {
        const data = buildSnake(rec as AnyRec, RAW_FIELDS)
        data.import_id = importId
        return data
      })

      const rawFailures = await persistConcurrent(
        payloads,
        (data) => pb.collection('validades_raw').create(data),
        {
          getKey: (_item, idx) => `raw_row_${idx + 1}`,
          context: { collection: 'validades_raw', operation: 'create' },
          onChunkProgress: (processed, total, failCount) => {
            reportProgress(
              'saving_raw',
              `Gravando raw (${processed} de ${total})...`,
              processed,
              total,
              failCount,
            )
          },
        },
      )

      rawPersisted = payloads.length - rawFailures.length

      for (const f of rawFailures) {
        errors.push({ stage: 'raw', index: f.index, key: f.key, error: f.error })
      }

      // REGRA a): Se failures.length > 0 na gravação do raw, o job inteiro é FAILED.
      // NÃO continuar para o upsert de base.
      if (rawFailures.length > 0) {
        const firstErr = rawFailures[0]?.error || 'Erro desconhecido na gravação de dados brutos.'
        const failMessage = `Falha na etapa de gravação de dados brutos: ${rawFailures.length} de ${rawCount} registros falharam. Primeiro erro: ${firstErr}`

        reportProgress('failed', failMessage, rawPersisted, rawCount, rawFailures.length)

        await pb
          .collection('import_history')
          .update(importId, {
            imported_rows: 0,
            skipped_rows: summary.rejeitados ?? 0,
            error_rows: errors.length,
            status: 'failed',
            errors_json: JSON.stringify(errors),
          })
          .catch(() => null)

        return {
          success: false,
          importId,
          importedRows: 0,
          rawRows: rawPersisted,
          skippedRows: summary.rejeitados ?? 0,
          errorRows: errors.length,
          summary,
          error: failMessage,
          errorsDetails: errors,
        }
      }
    }

    // --- 3. Persistir Base Atual em validades_base (upsert por chave) ----------
    reportProgress(
      'saving_base',
      `Atualizando base (0 de ${baseCount})...`,
      0,
      baseCount,
      errors.length,
    )

    let basePersisted = 0
    {
      const records = baseAtual as AnyRec[]
      const keyed: Array<{ index: number; rec: AnyRec; chave?: string }> = records.map(
        (rec, index) => ({
          index,
          rec,
          chave: pick(rec, 'chaveOperacional', 'chave_operacional') as string | undefined,
        }),
      )

      // Busca IDs existentes por chave em lotes concorrentes
      const existingIds = new Map<number, string>()
      await persistConcurrent(
        keyed,
        async (entry) => {
          if (!entry.chave) return
          try {
            const found = await pb.collection('validades_base').getList(1, 1, {
              filter: `chave_operacional = "${entry.chave}"`,
            })
            if (found.items.length > 0) {
              existingIds.set(entry.index, (found.items[0] as unknown as { id: string }).id)
            }
          } catch {
            // Ignora falha na busca — tenta criar novo
          }
        },
        { context: { collection: 'validades_base', operation: 'lookup' } },
      )

      // Upsert em lotes concorrentes
      const baseFailures = await persistConcurrent(
        keyed,
        async (entry) => {
          const data = buildSnake(entry.rec, BASE_FIELDS)
          data.import_id = importId
          const existingId = existingIds.get(entry.index)
          if (existingId) {
            await pb.collection('validades_base').update(existingId, data)
          } else {
            await pb.collection('validades_base').create(data)
          }
        },
        {
          getKey: (entry) => entry.chave || `base_idx_${entry.index}`,
          context: { collection: 'validades_base', operation: 'upsert' },
          onChunkProgress: (processed, total, failCount) => {
            reportProgress(
              'saving_base',
              `Atualizando base (${processed} de ${total})...`,
              processed,
              total,
              failCount,
            )
          },
        },
      )

      basePersisted = records.length - baseFailures.length

      for (const f of baseFailures) {
        errors.push({ stage: 'base', index: f.index, key: f.key, error: f.error })
      }

      // REGRA b): Se qualquer lote falhar no upsert de base (failures > 0), o job é FAILED.
      if (baseFailures.length > 0) {
        const firstErr = baseFailures[0]?.error || 'Erro desconhecido na atualização da base.'
        const failMessage = `Falha na etapa de atualização da Base Atual: ${baseFailures.length} de ${baseCount} registros falharam. Primeiro erro: ${firstErr}`

        reportProgress('failed', failMessage, basePersisted, baseCount, errors.length)

        await pb
          .collection('import_history')
          .update(importId, {
            imported_rows: basePersisted,
            skipped_rows: summary.rejeitados ?? 0,
            error_rows: errors.length,
            status: 'failed',
            errors_json: JSON.stringify(errors),
          })
          .catch(() => null)

        return {
          success: false,
          importId,
          importedRows: basePersisted,
          rawRows: rawPersisted,
          skippedRows: summary.rejeitados ?? 0,
          errorRows: errors.length,
          summary,
          error: failMessage,
          errorsDetails: errors,
        }
      }
    }

    // --- 4. Finalização e validação de sucesso total ---------------------------
    reportProgress('finalizing', 'Finalizando importação...', baseCount, baseCount, 0)

    const skippedRows =
      typeof summary.rejeitados === 'number'
        ? summary.rejeitados
        : Math.max(rawCount - baseCount, 0)

    // REGRA c): Só atualizar import_history para "completed" quando rawCount > 0, baseCount > 0 e failures === 0 em ambas as etapas.
    const isSuccess =
      rawCount > 0 &&
      baseCount > 0 &&
      rawPersisted === rawCount &&
      basePersisted === baseCount &&
      errors.length === 0
    const finalStatus: 'completed' | 'failed' = isSuccess ? 'completed' : 'failed'

    try {
      await pb.collection('import_history').update(importId, {
        imported_rows: basePersisted,
        skipped_rows: skippedRows,
        error_rows: errors.length,
        status: finalStatus,
        errors_json: errors.length > 0 ? JSON.stringify(errors) : '[]',
      })
    } catch (histErr) {
      console.error('[importClient] Falha ao atualizar import_history final:', histErr)
    }

    if (!isSuccess) {
      const errReason =
        errors.length > 0
          ? `Ocorreram ${errors.length} falha(s). Primeiro erro: ${errors[0].error}`
          : 'Nenhum registro foi processado para a Base Atual.'

      reportProgress('failed', errReason, basePersisted, baseCount, errors.length)

      return {
        success: false,
        importId,
        importedRows: basePersisted,
        rawRows: rawPersisted,
        skippedRows,
        errorRows: errors.length,
        summary,
        error: errReason,
        errorsDetails: errors,
      }
    }

    reportProgress('done', 'Importação concluída com sucesso.', baseCount, baseCount, 0)

    return {
      success: true,
      importId,
      importedRows: basePersisted,
      rawRows: rawPersisted,
      skippedRows,
      errorRows: 0,
      summary,
    }
  } catch (unhandledErr) {
    // REGRA f): Envolver TODO o fluxo em try/catch: qualquer exceção não capturada atualiza import_history para "failed"
    const eMsg = errMsg(unhandledErr, { collection: 'import_validades', operation: 'process' })
    errors.push({ stage: 'general', error: eMsg })

    if (importId) {
      await pb
        .collection('import_history')
        .update(importId, {
          status: 'failed',
          error_rows: errors.length,
          errors_json: JSON.stringify(errors),
        })
        .catch(() => null)
    }

    reportProgress('failed', `Erro inesperado: ${eMsg}`, 0, rawCount, errors.length)

    return {
      success: false,
      importId,
      importedRows: 0,
      rawRows: 0,
      skippedRows: summary.rejeitados ?? 0,
      errorRows: errors.length,
      summary,
      error: `Exceção não tratada durante o processamento: ${eMsg}`,
      errorsDetails: errors,
    }
  }
}

/**
 * Verifica se um hash de arquivo já foi importado (proteção contra reenvio).
 */
export async function checkFileHash(fileHash: string): Promise<{
  duplicate: boolean
  importId?: string
  created?: string
}> {
  if (!fileHash) return { duplicate: false }
  try {
    const records = await pb.collection('import_history').getList(1, 1, {
      filter: `file_hash = "${fileHash}" && status = "completed"`,
      sort: '-created',
    })
    if (records.items.length > 0) {
      const r = records.items[0] as unknown as Record<string, unknown>
      return {
        duplicate: true,
        importId: r.id as string,
        created: r.created as string,
      }
    }
    return { duplicate: false }
  } catch {
    return { duplicate: false }
  }
}

export type { DatasetValidationReport }
