/**
 * Cliente de importação — orquestra o envio dos registros validados para o
 * backend e persistência em `validades_raw` + `validades_base` + `import_history`.
 *
 * Mantido separado da UI para que a origem dos dados possa ser trocada
 * (Excel -> API TradePro) sem alterar o pipeline de persistência.
 *
 * REGRA DE OURO DE INTEGRIDADE:
 * Uma execução só termina como "completed" quando TODAS as gravações obrigatórias
 * de raw e base tiverem sucesso (rawPersisted === rawCount, basePersisted === baseCount e errors.length === 0).
 * Qualquer falha parcial ou divergência finaliza como "failed", nunca "completed".
 */
import pb from '@/lib/pocketbase/client'
import type { ValidadeItem, ProcessedValidade, TradeProRawRecord } from '@/types'
import type { DatasetValidationReport } from './validators'
import {
  runPersistenceQueue,
  type PersistenceQueueProgress,
  type PersistenceTaskError,
} from './persistenceQueue'

export type ImportReconciliationState =
  | 'NEW'
  | 'RAW_PARTIAL'
  | 'RAW_COMPLETE_CONSOLIDATION_PENDING'
  | 'CONSOLIDATION_PARTIAL'
  | 'COMPLETED'
  | 'BLOCKED_UNSAFE'
  | 'FAILED_FINAL'

export interface ImportReconciliation {
  state: ImportReconciliationState
  importId?: string
  receivedExpected: number // total de linhas esperadas (rawExpected do histórico)
  rawPersisted: number // chaves reais existentes em validades_raw (contadas do banco, não do histórico)
  rawPending: number // receivedExpected - rawPersisted
  validExpected: number // linhas válidas esperadas (do summary/pipeline)
  auditExpected: number // linhas de auditoria esperadas
  basePersisted: number // chaves reais existentes em validades_base com este import_id
  auditPersisted: number // registros reais em auditoria com este import_id
  consolidationPending: number // (validExpected + auditExpected) - (basePersisted + auditPersisted)
  blockedReason?: string
  retries?: number
}

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
  retriesCount?: number
  isRateLimited?: boolean
  rateLimitWaitMs?: number
}

export type OnProgressCallback = (progress: ImportProgressState) => void

export interface ProcessValidadesPayload {
  fileName: string
  fileSize?: number
  fileHash: string
  arquivoTipo?: string
  dataArquivo?: string
  force?: boolean
  previousImportId?: string
  reconciliation?: ImportReconciliation
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
  signal?: AbortSignal
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
  errorsDetails?: PersistenceTaskError[]
  retriesCount?: number
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

/**
 * Concorrência padrão controlada para persistência (default 2 contra PocketBase).
 */
export const PERSIST_CONCURRENCY = 2

export interface FailureDetail {
  index: number
  key?: string
  error: string
  statusCode?: number
  attempts?: number
}

/**
 * Consulta `validades_raw` paginada (50 por página) para extrair chaves já persistidas.
 * Retorna um Set<string> com as chaves no formato "raw_row_${rowNumber}".
 */
export async function loadAlreadyPersistedRawKeys(importId: string): Promise<Set<string>> {
  const persistedKeys = new Set<string>()
  if (!importId) return persistedKeys

  let page = 1
  const perPage = 50
  let hasMore = true

  while (hasMore) {
    try {
      const res = await pb.collection('validades_raw').getList(page, perPage, {
        filter: `import_id = "${importId}"`,
        sort: '+created',
      })

      for (const item of res.items) {
        const rowNum =
          (item as unknown as { _rowNumber?: number; numero_linha?: number })._rowNumber ||
          (item as unknown as { numero_linha?: number }).numero_linha
        if (rowNum !== undefined && rowNum !== null) {
          persistedKeys.add(`raw_row_${rowNum}`)
        }
      }

      if (res.items.length < perPage || page * perPage >= res.totalItems) {
        hasMore = false
      } else {
        page++
      }
    } catch {
      hasMore = false
    }
  }

  return persistedKeys
}

/**
 * Consulta `validades_base` paginada (50 por página) para extrair chaves já persistidas com o importId.
 * Retorna um Set<string> com as chaves operacionais.
 */
export async function loadAlreadyPersistedBaseKeys(importId: string): Promise<Set<string>> {
  const persistedKeys = new Set<string>()
  if (!importId) return persistedKeys

  let page = 1
  const perPage = 50
  let hasMore = true

  while (hasMore) {
    try {
      const res = await pb.collection('validades_base').getList(page, perPage, {
        filter: `import_id = "${importId}"`,
        sort: '+created',
      })

      for (const item of res.items) {
        const chave = (item as unknown as { chave_operacional?: string }).chave_operacional
        if (chave) {
          persistedKeys.add(chave)
        }
      }

      if (res.items.length < perPage || page * perPage >= res.totalItems) {
        hasMore = false
      } else {
        page++
      }
    } catch {
      hasMore = false
    }
  }

  return persistedKeys
}
/**
 * Compatibilidade com testes legados e chamadas que usam persistConcurrent:
 * Agora redirecionado internamente para `runPersistenceQueue` com throttleMs=0 (sem throttle extra) e retry seguro.
 */
export async function persistConcurrent<T>(
  items: T[],
  fn: (item: T, index: number, signal?: AbortSignal) => Promise<unknown>,
  options?: {
    getKey?: (item: T, index: number) => string | undefined
    getRowNumber?: (item: T, index: number) => number | undefined
    onChunkProgress?: (processed: number, total: number, failures: number) => void
    context?: { collection?: string; operation?: string }
    concurrency?: number
    throttleMs?: number
    signal?: AbortSignal
  },
): Promise<FailureDetail[]> {
  const qResult = await runPersistenceQueue(items, (item, index, sig) => fn(item, index, sig), {
    concurrency: options?.concurrency ?? PERSIST_CONCURRENCY,
    throttleMs: options?.throttleMs ?? 0,
    signal: options?.signal,
    getKey: options?.getKey,
    getRowNumber: options?.getRowNumber,
    stage: options?.context?.collection,
    extractErrorMessage: (err) => errMsg(err, options?.context),
    onProgress: (p: PersistenceQueueProgress) => {
      options?.onChunkProgress?.(p.processed, p.total, p.failed)
    },
  })

  return qResult.errors.map((e, i) => ({
    index: e.row !== undefined ? e.row - 1 : i,
    key: e.key,
    error: e.message,
    statusCode: e.statusCode,
    attempts: e.attempts,
  }))
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
    previousImportId,
    reconciliation,
    rawRecords,
    baseAtual,
    summary,
    signal,
    onProgress,
  } = payload

  const rawCount = rawRecords.length
  const baseCount = baseAtual.length
  const now = new Date().toISOString()
  const errors: PersistenceTaskError[] = []

  let importId = ''
  let totalRetriesAccumulated = 0

  // Usuário autenticado para governança (preenche created_by se disponível)
  const currentUserId = pb.authStore.record?.id || undefined

  // Função auxiliar de notificação de progresso
  const reportProgress = (
    stage: ImportProgressState['stage'],
    message: string,
    processed: number,
    total: number,
    failuresCount: number,
    extra?: { retriesCount?: number; isRateLimited?: boolean; rateLimitWaitMs?: number },
  ) => {
    onProgress?.({
      stage,
      message,
      processed,
      total,
      failuresCount,
      retriesCount: extra?.retriesCount ?? totalRetriesAccumulated,
      isRateLimited: extra?.isRateLimited ?? false,
      rateLimitWaitMs: extra?.rateLimitWaitMs ?? 0,
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

  // Identifica se estamos em modo de retomada por etapa (RAW já completo)
  const isRawCompleteResume =
    reconciliation?.state === 'RAW_COMPLETE_CONSOLIDATION_PENDING' ||
    reconciliation?.state === 'CONSOLIDATION_PARTIAL'

  // Todo o fluxo a partir daqui é envolvido em try/catch para garantir status honesto
  try {
    let existingRawKeys = new Set<string>()
    let existingHistoryId: string | null = null

    if (isRawCompleteResume && reconciliation.importId) {
      // Pula criação de novo histórico, usa o importId ativo da reconciliation
      importId = reconciliation.importId
      existingHistoryId = reconciliation.importId
    } else if (previousImportId && force) {
      // Se previousImportId foi passado E force === true, ou buscando tentativa anterior pelo fileHash
      existingHistoryId = previousImportId
      existingRawKeys = await loadAlreadyPersistedRawKeys(previousImportId)
    } else if (fileHash) {
      try {
        const prevHist = await pb.collection('import_history').getList(1, 1, {
          filter: `file_hash = "${fileHash}"`,
          sort: '-created',
        })
        if (prevHist.items.length > 0) {
          const prev = prevHist.items[0] as unknown as { id: string; status: string }
          // Se for reprocessamento com force ou importação incompleta anterior
          if (force || prev.status === 'failed' || prev.status === 'processing') {
            existingHistoryId = prev.id
            existingRawKeys = await loadAlreadyPersistedRawKeys(prev.id)
          }
        }
      } catch {
        // Prossegue criando novo histórico se der erro na busca
      }
    }

    // --- 1. Criar ou Reutilizar registro em import_history (status: processing) --------------
    reportProgress('validating', 'Criando registro de histórico de importação...', 0, rawCount, 0)
    try {
      if (isRawCompleteResume && importId) {
        await pb.collection('import_history').update(importId, {
          status: 'processing',
          data_importacao: now,
          error_rows: 0,
          errors_json: '[]',
        })
      } else if (existingHistoryId && force) {
        importId = existingHistoryId
        await pb.collection('import_history').update(importId, {
          status: 'processing',
          data_importacao: now,
          error_rows: 0,
          errors_json: '[]',
        })
      } else {
        const historyPayload: Record<string, unknown> = {
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
          raw_count: existingRawKeys.size, // Inicialmente chaves já conhecidas se houver
          filtered_count: summary.filtrados90Dias,
          base_count: baseCount,
          status: 'processing',
          errors_json: '[]',
          source: 'tradepro',
        }
        if (currentUserId) {
          historyPayload.created_by = currentUserId
        }

        const hist = await pb.collection('import_history').create(historyPayload)
        importId = (hist as unknown as { id: string }).id
      }
    } catch (err) {
      const eMsg = errMsg(err, { collection: 'import_history', operation: 'create' })
      const initialErr: PersistenceTaskError = {
        stage: 'general',
        row: 1,
        message: eMsg,
        attempts: 1,
      }
      return {
        success: false,
        importId: '',
        importedRows: 0,
        rawRows: 0,
        skippedRows: 0,
        errorRows: 1,
        summary,
        error: `Falha ao criar histórico de importação: ${eMsg}`,
        errorsDetails: [initialErr],
      }
    }

    let totalRawPersisted = 0
    let rawRetriesRecovered = 0

    // --- 2. Persistir dados brutos em validades_raw (PULAR SE isRawCompleteResume) --------
    if (isRawCompleteResume) {
      totalRawPersisted = reconciliation.rawPersisted
    } else {
      // Se importId já existia antes ou foi atribuído, tenta recarregar chaves dele se ainda vazio
      if (importId && existingRawKeys.size === 0) {
        existingRawKeys = await loadAlreadyPersistedRawKeys(importId)
      }

      const allRawPayloads: AnyRec[] = rawRecords.map((rec, idx) => {
        const data = buildSnake(rec as AnyRec, RAW_FIELDS)
        data.import_id = importId
        if (currentUserId) data.created_by = currentUserId
        data._rowNumber = idx + 1
        return data
      })

      // Filtra itens já persistidos (Idempotência / Retomada)
      const pendingRawPayloads = allRawPayloads.filter((p) => {
        const key = `raw_row_${p._rowNumber}`
        return !existingRawKeys.has(key)
      })

      const alreadyPersistedRawCount = allRawPayloads.length - pendingRawPayloads.length

      if (alreadyPersistedRawCount > 0) {
        reportProgress(
          'saving_raw',
          `Retomando importação: ${alreadyPersistedRawCount} já persistidos, ${pendingRawPayloads.length} pendentes...`,
          alreadyPersistedRawCount,
          rawCount,
          0,
        )
      } else {
        reportProgress('saving_raw', `Gravando dados brutos (0 de ${rawCount})...`, 0, rawCount, 0)
      }

      let rawNewlyPersisted = 0

      if (pendingRawPayloads.length > 0) {
        const rawQueueResult = await runPersistenceQueue(
          pendingRawPayloads,
          async (data, _idx, taskSignal) => {
            if (taskSignal?.aborted) throw new Error('Operação cancelada.')
            return pb.collection('validades_raw').create(data)
          },
          {
            concurrency: PERSIST_CONCURRENCY,
            signal,
            stage: 'raw',
            getKey: (item) => `raw_row_${item._rowNumber}`,
            getRowNumber: (item) => (item._rowNumber as number) || undefined,
            extractErrorMessage: (e) =>
              errMsg(e, { collection: 'validades_raw', operation: 'create' }),
            onProgress: (p) => {
              totalRetriesAccumulated = p.retries
              const waitMsg = p.isRateLimited
                ? ' • Aguardando o banco liberar novas gravações...'
                : ''
              const currentTotalProcessed = alreadyPersistedRawCount + p.processed
              const progressMsg =
                alreadyPersistedRawCount > 0
                  ? `${alreadyPersistedRawCount} já persistidos. Gravando ${pendingRawPayloads.length} pendentes (${p.processed} de ${p.total}${p.retries > 0 ? ` • ${p.retries} retries` : ''}${waitMsg})...`
                  : `Gravando dados brutos (${p.processed} de ${p.total}${p.retries > 0 ? ` • ${p.retries} retries` : ''}${waitMsg})...`

              reportProgress('saving_raw', progressMsg, currentTotalProcessed, rawCount, p.failed, {
                retriesCount: p.retries,
                isRateLimited: p.isRateLimited,
                rateLimitWaitMs: p.rateLimitWaitMs,
              })
            },
          },
        )

        totalRetriesAccumulated += rawQueueResult.totalRetries
        rawRetriesRecovered = rawQueueResult.retriesRecovered
        rawNewlyPersisted = rawQueueResult.successCount
        errors.push(...rawQueueResult.errors)
      }

      totalRawPersisted = alreadyPersistedRawCount + rawNewlyPersisted

      // REGRA DE INTEGRIDADE: Se falhar qualquer registro na gravação do raw, o job é FAILED e NÃO avança para a base.
      if (totalRawPersisted !== rawCount || errors.length > 0) {
        const firstErr = errors[0]?.message || 'Erro desconhecido na gravação de dados brutos.'
        const failCount = rawCount - totalRawPersisted
        const failMessage = `Falha na etapa de gravação de dados brutos: ${failCount} de ${rawCount} registros falharam. Primeiro erro: ${firstErr}`

        reportProgress('failed', failMessage, totalRawPersisted, rawCount, errors.length)

        const metaErrors = {
          _meta: {
            rawPersisted: totalRawPersisted,
            rawExpected: rawCount,
            baseAttempted: 0,
            retriesRecovered: rawRetriesRecovered,
            isPartial: totalRawPersisted > 0,
          },
          errors,
        }

        await pb
          .collection('import_history')
          .update(importId, {
            imported_rows: 0,
            raw_count: totalRawPersisted,
            skipped_rows: summary.rejeitados ?? 0,
            error_rows: errors.length,
            status: 'failed',
            errors_json: JSON.stringify(metaErrors),
          })
          .catch(() => null)

        return {
          success: false,
          importId,
          importedRows: 0,
          rawRows: totalRawPersisted,
          skippedRows: summary.rejeitados ?? 0,
          errorRows: errors.length,
          summary,
          error: failMessage,
          errorsDetails: errors,
          retriesCount: totalRetriesAccumulated,
        }
      }
    }

    // --- 3. Persistir Base Atual em validades_base (upsert por chave via queue) -
    const totalExpectedBase = isRawCompleteResume
      ? reconciliation.validExpected + reconciliation.auditExpected
      : baseCount

    const baseProgressLabel = isRawCompleteResume
      ? `Consolidando Base Atual (0 de ${baseCount})...`
      : `Atualizando Base Atual (0 de ${baseCount})...`

    reportProgress('saving_base', baseProgressLabel, 0, baseCount, errors.length)

    let existingBaseKeys = new Set<string>()
    if (reconciliation?.state === 'CONSOLIDATION_PARTIAL' && importId) {
      existingBaseKeys = await loadAlreadyPersistedBaseKeys(importId)
    }

    const baseRecords = baseAtual as AnyRec[]
    let keyedEntries: Array<{ index: number; rec: AnyRec; chave?: string; _rowNumber: number }> =
      baseRecords.map((rec, index) => ({
        index,
        rec,
        chave: pick(rec, 'chaveOperacional', 'chave_operacional') as string | undefined,
        _rowNumber: index + 1,
      }))

    // Se CONSOLIDATION_PARTIAL, pula registros cuja chave já exista com este importId
    let alreadyPersistedBaseCount = 0
    if (existingBaseKeys.size > 0) {
      const pendingEntries = keyedEntries.filter((entry) => {
        if (!entry.chave) return true
        return !existingBaseKeys.has(entry.chave)
      })
      alreadyPersistedBaseCount = keyedEntries.length - pendingEntries.length
      keyedEntries = pendingEntries
    }

    // 3.1 Lookup de IDs existentes por chave com concurrency segura
    const existingIds = new Map<number, string>()
    if (keyedEntries.length > 0) {
      await runPersistenceQueue(
        keyedEntries,
        async (entry, _idx, taskSignal) => {
          if (taskSignal?.aborted || !entry.chave) return
          try {
            const found = await pb.collection('validades_base').getList(1, 1, {
              filter: `chave_operacional = "${entry.chave}"`,
            })
            if (found.items.length > 0) {
              existingIds.set(entry.index, (found.items[0] as unknown as { id: string }).id)
            }
          } catch {
            // Ignora falha de lookup e prossegue para tentar criação
          }
        },
        {
          concurrency: PERSIST_CONCURRENCY,
          signal,
          stage: 'base_lookup',
          extractErrorMessage: (e) =>
            errMsg(e, { collection: 'validades_base', operation: 'lookup' }),
        },
      )
    }

    // 3.2 Upsert dos registros de validades_base via persistenceQueue
    let baseRetriesRecovered = 0
    let baseNewlyPersisted = 0
    if (keyedEntries.length > 0) {
      const baseQueueResult = await runPersistenceQueue(
        keyedEntries,
        async (entry, _idx, taskSignal) => {
          if (taskSignal?.aborted) throw new Error('Operação cancelada.')
          const data = buildSnake(entry.rec, BASE_FIELDS)
          data.import_id = importId
          if (currentUserId) data.created_by = currentUserId

          const existingId = existingIds.get(entry.index)
          if (existingId) {
            return pb.collection('validades_base').update(existingId, data)
          } else {
            return pb.collection('validades_base').create(data)
          }
        },
        {
          concurrency: PERSIST_CONCURRENCY,
          signal,
          stage: 'base',
          getKey: (entry) => entry.chave || `base_idx_${entry.index}`,
          getRowNumber: (entry) => entry._rowNumber,
          extractErrorMessage: (e) =>
            errMsg(e, { collection: 'validades_base', operation: 'upsert' }),
          onProgress: (p) => {
            const waitMsg = p.isRateLimited
              ? ' • Aguardando o banco liberar novas gravações...'
              : ''
            const currentBaseProcessed = alreadyPersistedBaseCount + p.processed
            const progressMsg = isRawCompleteResume
              ? `Consolidando Base Atual (${currentBaseProcessed} de ${baseCount}${p.retries > 0 ? ` • ${p.retries} retries` : ''}${waitMsg})...`
              : `Atualizando Base Atual (${currentBaseProcessed} de ${baseCount}${p.retries > 0 ? ` • ${p.retries} retries` : ''}${waitMsg})...`
            reportProgress(
              'saving_base',
              progressMsg,
              currentBaseProcessed,
              baseCount,
              errors.length + p.failed,
              {
                retriesCount: totalRetriesAccumulated + p.retries,
                isRateLimited: p.isRateLimited,
                rateLimitWaitMs: p.rateLimitWaitMs,
              },
            )
          },
        },
      )

      totalRetriesAccumulated += baseQueueResult.totalRetries
      baseRetriesRecovered = baseQueueResult.retriesRecovered
      baseNewlyPersisted = baseQueueResult.successCount
      errors.push(...baseQueueResult.errors)
    }

    const basePersisted = alreadyPersistedBaseCount + baseNewlyPersisted

    // REGRA DE INTEGRIDADE: Se qualquer registro falhar na Base Atual, o job é FAILED.
    if (errors.length > 0 || basePersisted !== baseCount) {
      const firstErr = errors[0]?.message || 'Erro desconhecido na atualização da base.'
      const failCount = baseCount - basePersisted
      const failMessage = `Falha na etapa de atualização da Base Atual: ${failCount} de ${baseCount} registros falharam. Primeiro erro: ${firstErr}`

      reportProgress('failed', failMessage, basePersisted, baseCount, errors.length)

      const metaErrors = {
        _meta: {
          rawPersisted: totalRawPersisted,
          rawExpected: rawCount,
          baseAttempted: baseCount,
          basePersisted,
          retriesRecovered: rawRetriesRecovered + baseRetriesRecovered,
          isPartial: basePersisted > 0 || totalRawPersisted > 0,
        },
        errors,
      }

      await pb
        .collection('import_history')
        .update(importId, {
          imported_rows: basePersisted,
          raw_count: totalRawPersisted,
          skipped_rows: summary.rejeitados ?? 0,
          error_rows: errors.length,
          status: 'failed',
          errors_json: JSON.stringify(metaErrors),
        })
        .catch(() => null)

      return {
        success: false,
        importId,
        importedRows: basePersisted,
        rawRows: totalRawPersisted,
        skippedRows: summary.rejeitados ?? 0,
        errorRows: errors.length,
        summary,
        error: failMessage,
        errorsDetails: errors,
        retriesCount: totalRetriesAccumulated,
      }
    }

    // --- 4. Finalização e validação de integridade rigorosa --------------------
    reportProgress(
      'finalizing',
      'Finalizando importação com integridade...',
      baseCount,
      baseCount,
      0,
    )

    const skippedRows =
      typeof summary.rejeitados === 'number'
        ? summary.rejeitados
        : Math.max(rawCount - baseCount, 0)

    // REGRA DE OURO: completed SOMENTE se totalRawPersisted === rawCount E basePersisted === baseCount E errors.length === 0
    // No caso de retomada de consolidação, totalRawPersisted é conferido com reconciliation.receivedExpected
    const expectedRawCount = isRawCompleteResume ? reconciliation.receivedExpected : rawCount
    const isSuccess =
      expectedRawCount > 0 &&
      baseCount > 0 &&
      totalRawPersisted === expectedRawCount &&
      basePersisted === baseCount &&
      errors.length === 0

    const finalStatus: 'completed' | 'failed' = isSuccess ? 'completed' : 'failed'

    const metaErrors =
      errors.length > 0
        ? {
            _meta: {
              rawPersisted: totalRawPersisted,
              rawExpected: rawCount,
              baseAttempted: baseCount,
              basePersisted,
              retriesRecovered: rawRetriesRecovered + baseRetriesRecovered,
              isPartial: totalRawPersisted > 0 || basePersisted > 0,
            },
            errors,
          }
        : null

    try {
      await pb.collection('import_history').update(importId, {
        imported_rows: basePersisted,
        raw_count: totalRawPersisted,
        skipped_rows: skippedRows,
        error_rows: errors.length,
        status: finalStatus,
        errors_json: metaErrors ? JSON.stringify(metaErrors) : '[]',
      })
    } catch (histErr) {
      console.error('[importClient] Falha ao atualizar import_history final:', histErr)
    }

    if (!isSuccess) {
      const errReason =
        errors.length > 0
          ? `Ocorreram ${errors.length} falha(s). Primeiro erro: ${errors[0].message}`
          : 'Divergência de contagem: nem todos os registros foram persistidos.'

      reportProgress('failed', errReason, basePersisted, baseCount, errors.length)

      return {
        success: false,
        importId,
        importedRows: basePersisted,
        rawRows: totalRawPersisted,
        skippedRows,
        errorRows: errors.length,
        summary,
        error: errReason,
        errorsDetails: errors,
        retriesCount: totalRetriesAccumulated,
      }
    }

    reportProgress(
      'done',
      'Importação concluída com sucesso (100% gravado).',
      baseCount,
      baseCount,
      0,
    )

    return {
      success: true,
      importId,
      importedRows: basePersisted,
      rawRows: totalRawPersisted,
      skippedRows,
      errorRows: 0,
      summary,
      retriesCount: totalRetriesAccumulated,
    }
  } catch (unhandledErr) {
    const eMsg = errMsg(unhandledErr, { collection: 'import_validades', operation: 'process' })
    const fatalErr: PersistenceTaskError = { stage: 'general', message: eMsg, attempts: 1 }
    errors.push(fatalErr)

    if (importId) {
      await pb
        .collection('import_history')
        .update(importId, {
          status: 'failed',
          error_rows: errors.length,
          errors_json: JSON.stringify({
            _meta: {
              rawPersisted: 0,
              rawExpected: rawCount,
              baseAttempted: 0,
              isPartial: false,
            },
            errors,
          }),
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
      retriesCount: totalRetriesAccumulated,
    }
  }
}

/**
 * Reconcilia o estado atual da importação inspecionando o banco de dados.
 * NUNCA faz create ou update — apenas leitura (getList).
 */
export async function reconcileImportState(
  importId: string,
  receivedExpectedParam?: number,
  validExpectedParam?: number,
  auditExpectedParam?: number,
): Promise<ImportReconciliation> {
  if (!importId) {
    return {
      state: 'NEW',
      receivedExpected: 0,
      rawPersisted: 0,
      rawPending: 0,
      validExpected: 0,
      auditExpected: 0,
      basePersisted: 0,
      auditPersisted: 0,
      consolidationPending: 0,
    }
  }

  try {
    // 2. Busca histórico pelo id
    let historyRecord: Record<string, unknown> | null = null
    try {
      historyRecord = (await pb.collection('import_history').getOne(importId)) as unknown as Record<
        string,
        unknown
      >
    } catch {
      // Tenta buscar por getList com id se getOne falhar
      try {
        const histList = await pb.collection('import_history').getList(1, 1, {
          filter: `id = "${importId}"`,
        })
        if (histList.items.length > 0) {
          historyRecord = histList.items[0] as unknown as Record<string, unknown>
        }
      } catch {
        historyRecord = null
      }
    }

    if (!historyRecord) {
      return {
        state: 'BLOCKED_UNSAFE',
        importId,
        receivedExpected: receivedExpectedParam ?? 0,
        rawPersisted: 0,
        rawPending: receivedExpectedParam ?? 0,
        validExpected: validExpectedParam ?? 0,
        auditExpected: auditExpectedParam ?? 0,
        basePersisted: 0,
        auditPersisted: 0,
        consolidationPending: 0,
        blockedReason: `Histórico de importação ${importId} não foi encontrado.`,
      }
    }

    // Extrai meta do errors_json se houver
    let metaRawPersisted: number | undefined
    let metaRawExpected: number | undefined
    let metaBasePersisted: number | undefined
    let metaRetries: number | undefined

    if (historyRecord.errors_json) {
      try {
        const parsed =
          typeof historyRecord.errors_json === 'string'
            ? JSON.parse(historyRecord.errors_json)
            : historyRecord.errors_json
        if (parsed && typeof parsed === 'object' && parsed._meta) {
          metaRawPersisted = parsed._meta.rawPersisted
          metaRawExpected = parsed._meta.rawExpected
          metaBasePersisted = parsed._meta.basePersisted
          metaRetries = parsed._meta.retriesRecovered
        }
      } catch {
        // ignorar erro de parse
      }
    }

    // Determina receivedExpected
    const histTotalRows =
      typeof historyRecord.total_rows === 'number'
        ? (historyRecord.total_rows as number)
        : undefined
    const receivedExpected = receivedExpectedParam ?? histTotalRows ?? metaRawExpected

    // 4. Conta quantas chaves reais existem em validades_raw via getList totalItems
    let rawPersisted = 0
    try {
      const rawRes = await pb.collection('validades_raw').getList(1, 1, {
        filter: `import_id = "${importId}"`,
      })
      if (typeof rawRes.totalItems === 'number' && rawRes.totalItems > 0) {
        rawPersisted = rawRes.totalItems
      } else if (metaRawPersisted !== undefined && metaRawPersisted > 0) {
        rawPersisted = metaRawPersisted
      }
    } catch {
      if (metaRawPersisted !== undefined && metaRawPersisted > 0) {
        rawPersisted = metaRawPersisted
      }
    }

    // 5. Se rawPersisted > 0 mas não for possível determinar receivedExpected com segurança
    if (rawPersisted > 0 && (receivedExpected === undefined || receivedExpected === 0)) {
      return {
        state: 'BLOCKED_UNSAFE',
        importId,
        receivedExpected: 0,
        rawPersisted,
        rawPending: 0,
        validExpected: validExpectedParam ?? 0,
        auditExpected: auditExpectedParam ?? 0,
        basePersisted: 0,
        auditPersisted: 0,
        consolidationPending: 0,
        blockedReason: 'Não foi possível determinar o total esperado de registros.',
        retries: metaRetries,
      }
    }

    const finalReceivedExpected = receivedExpected ?? 0
    const rawPending = Math.max(0, finalReceivedExpected - rawPersisted)

    // 7. Conta chaves reais em validades_base
    let basePersisted = 0
    try {
      const baseRes = await pb.collection('validades_base').getList(1, 1, {
        filter: `import_id = "${importId}"`,
      })
      if (typeof baseRes.totalItems === 'number' && baseRes.totalItems > 0) {
        basePersisted = baseRes.totalItems
      } else if (metaBasePersisted !== undefined && metaBasePersisted > 0) {
        basePersisted = metaBasePersisted
      }
    } catch {
      if (metaBasePersisted !== undefined && metaBasePersisted > 0) {
        basePersisted = metaBasePersisted
      }
    }

    // 8. Conta registros em auditoria (se coleção existir)
    let auditPersisted = 0
    try {
      const auditRes = await pb.collection('auditoria_pendencias').getList(1, 1, {
        filter: `import_id = "${importId}"`,
      })
      if (typeof auditRes.totalItems === 'number') {
        auditPersisted = auditRes.totalItems
      }
    } catch {
      try {
        const auditRes2 = await pb.collection('validades_auditoria').getList(1, 1, {
          filter: `import_id = "${importId}"`,
        })
        if (typeof auditRes2.totalItems === 'number') {
          auditPersisted = auditRes2.totalItems
        }
      } catch {
        auditPersisted = 0
      }
    }

    // Determina validExpected e auditExpected
    const validExpected =
      validExpectedParam ??
      (typeof historyRecord.base_count === 'number'
        ? (historyRecord.base_count as number)
        : finalReceivedExpected)
    const auditExpected =
      auditExpectedParam ??
      (typeof historyRecord.skipped_rows === 'number' ? (historyRecord.skipped_rows as number) : 0)

    // 9. Calcula consolidationPending
    const totalExpectedConsolidation = validExpected + auditExpected
    const totalPersistedConsolidation = basePersisted + auditPersisted
    const consolidationPending = Math.max(
      0,
      totalExpectedConsolidation - totalPersistedConsolidation,
    )

    // 10. Determina o estado
    let state: ImportReconciliationState = 'NEW'

    if (finalReceivedExpected === 0) {
      state = 'BLOCKED_UNSAFE'
      return {
        state,
        importId,
        receivedExpected: 0,
        rawPersisted,
        rawPending,
        validExpected,
        auditExpected,
        basePersisted,
        auditPersisted,
        consolidationPending,
        blockedReason: 'Não foi possível determinar o total esperado de registros.',
        retries: metaRetries,
      }
    }

    if (rawPersisted < finalReceivedExpected) {
      state = 'RAW_PARTIAL'
    } else if (
      rawPersisted === finalReceivedExpected &&
      basePersisted === 0 &&
      auditPersisted === 0
    ) {
      state = 'RAW_COMPLETE_CONSOLIDATION_PENDING'
    } else if (
      rawPersisted === finalReceivedExpected &&
      (basePersisted > 0 || auditPersisted > 0) &&
      consolidationPending > 0
    ) {
      state = 'CONSOLIDATION_PARTIAL'
    } else if (rawPersisted === finalReceivedExpected && consolidationPending === 0) {
      state = 'COMPLETED'
    } else {
      state = 'FAILED_FINAL'
    }

    return {
      state,
      importId,
      receivedExpected: finalReceivedExpected,
      rawPersisted,
      rawPending,
      validExpected,
      auditExpected,
      basePersisted,
      auditPersisted,
      consolidationPending,
      retries: metaRetries,
    }
  } catch (err) {
    return {
      state: 'FAILED_FINAL',
      importId,
      receivedExpected: receivedExpectedParam ?? 0,
      rawPersisted: 0,
      rawPending: receivedExpectedParam ?? 0,
      validExpected: validExpectedParam ?? 0,
      auditExpected: auditExpectedParam ?? 0,
      basePersisted: 0,
      auditPersisted: 0,
      consolidationPending: 0,
      blockedReason: errMsg(err),
    }
  }
}

export interface PreviousAttemptResult {
  found: boolean
  importId?: string
  status?: string
  rawCount?: number
  rawExpected?: number
  created?: string
  reconciliation?: ImportReconciliation | null
}

/**
 * Busca histórico anterior por file_hash sem filtrar por status.
 * Retorna o registro mais recente com contagens extraídas de _meta e reconciliation populado.
 */
export async function findPreviousAttempt(fileHash: string): Promise<PreviousAttemptResult> {
  if (!fileHash) return { found: false }
  try {
    const records = await pb.collection('import_history').getList(1, 1, {
      filter: `file_hash = "${fileHash}"`,
      sort: '-created',
    })
    if (records.items.length > 0) {
      const r = records.items[0] as unknown as Record<string, unknown>
      let rawPersisted: number | undefined =
        typeof r.raw_count === 'number' ? (r.raw_count as number) : undefined
      let rawExpected: number | undefined =
        typeof r.total_rows === 'number' ? (r.total_rows as number) : undefined

      if (r.errors_json) {
        try {
          const parsed =
            typeof r.errors_json === 'string'
              ? JSON.parse(r.errors_json)
              : (r.errors_json as Record<string, unknown>)
          if (parsed && typeof parsed === 'object' && parsed._meta) {
            const meta = parsed._meta as { rawPersisted?: number; rawExpected?: number }
            if (typeof meta.rawPersisted === 'number') rawPersisted = meta.rawPersisted
            if (typeof meta.rawExpected === 'number') rawExpected = meta.rawExpected
          }
        } catch {
          // fallback para campos do registro
        }
      }

      const result: PreviousAttemptResult = {
        found: true,
        importId: r.id as string,
        status: (r.status as string) || undefined,
        rawCount: rawPersisted,
        rawExpected: rawExpected,
        created: (r.created as string) || undefined,
        reconciliation: null,
      }

      if (r.status === 'failed' || r.status === 'processing') {
        const totalRows = typeof r.total_rows === 'number' ? (r.total_rows as number) : undefined
        result.reconciliation = await reconcileImportState(r.id as string, totalRows)
      }

      return result
    }
    return { found: false }
  } catch {
    return { found: false }
  }
}

/**
 * Verifica se um hash de arquivo já foi importado (proteção contra reenvio).
 * Se o job anterior for `completed` → duplicate: true.
 * Se for `failed` → duplicate: false, previousFailed: true + detalhes da tentativa e reconciliation.
 */
export async function checkFileHash(fileHash: string): Promise<{
  duplicate: boolean
  importId?: string
  created?: string
  status?: string
  previousFailed?: boolean
  previousImportId?: string
  previousRawPersisted?: number
  previousRawExpected?: number
  previousReconciliation?: ImportReconciliation | null
}> {
  if (!fileHash) return { duplicate: false }
  try {
    const prev = await findPreviousAttempt(fileHash)
    if (!prev.found) return { duplicate: false }

    if (prev.status === 'completed' || prev.status === 'success') {
      return {
        duplicate: true,
        importId: prev.importId,
        created: prev.created,
        status: prev.status,
        previousReconciliation: prev.reconciliation,
      }
    }

    if (prev.status === 'failed' || prev.status === 'error') {
      return {
        duplicate: false,
        importId: prev.importId,
        created: prev.created,
        status: prev.status,
        previousFailed: true,
        previousImportId: prev.importId,
        previousRawPersisted: prev.rawCount,
        previousRawExpected: prev.rawExpected,
        previousReconciliation: prev.reconciliation,
      }
    }

    return {
      duplicate: false,
      importId: prev.importId,
      created: prev.created,
      status: prev.status,
      previousReconciliation: prev.reconciliation,
    }
  } catch {
    return { duplicate: false }
  }
}

export type { DatasetValidationReport }
