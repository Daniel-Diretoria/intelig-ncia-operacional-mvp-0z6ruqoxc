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

  // Todo o fluxo a partir daqui é envolvido em try/catch para garantir status honesto
  try {
    let existingRawKeys = new Set<string>()
    let existingHistoryId: string | null = null

    // Se reprocessando (force) ou buscando tentativa anterior pelo fileHash
    if (fileHash) {
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
      if (existingHistoryId && force) {
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

        // Se tínhamos chaves de um importId anterior mas criamos novo, atualizamos existingRawKeys se importId mudou
        if (existingHistoryId && existingHistoryId !== importId && existingRawKeys.size > 0) {
          // As chaves estavam no importId antigo, aqui novo histórico foi criado
        }
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

    // Se importId já existia antes ou foi atribuído, tenta recarregar chaves dele se ainda vazio
    if (importId && existingRawKeys.size === 0) {
      existingRawKeys = await loadAlreadyPersistedRawKeys(importId)
    }

    // --- 2. Persistir dados brutos em validades_raw via persistenceQueue --------
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
    let rawRetriesRecovered = 0

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

    const totalRawPersisted = alreadyPersistedRawCount + rawNewlyPersisted

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

    // --- 3. Persistir Base Atual em validades_base (upsert por chave via queue) -
    reportProgress(
      'saving_base',
      `Atualizando Base Atual (0 de ${baseCount})...`,
      0,
      baseCount,
      errors.length,
    )

    const baseRecords = baseAtual as AnyRec[]
    const keyedEntries: Array<{ index: number; rec: AnyRec; chave?: string; _rowNumber: number }> =
      baseRecords.map((rec, index) => ({
        index,
        rec,
        chave: pick(rec, 'chaveOperacional', 'chave_operacional') as string | undefined,
        _rowNumber: index + 1,
      }))

    // 3.1 Lookup de IDs existentes por chave com concurrency segura
    const existingIds = new Map<number, string>()
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

    // 3.2 Upsert dos registros de validades_base via persistenceQueue
    let baseRetriesRecovered = 0
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
          const waitMsg = p.isRateLimited ? ' • Aguardando o banco liberar novas gravações...' : ''
          reportProgress(
            'saving_base',
            `Atualizando Base Atual (${p.processed} de ${p.total}${p.retries > 0 ? ` • ${p.retries} retries` : ''}${waitMsg})...`,
            p.processed,
            p.total,
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
    const basePersisted = baseQueueResult.successCount
    errors.push(...baseQueueResult.errors)

    // REGRA DE INTEGRIDADE: Se qualquer registro falhar na Base Atual, o job é FAILED.
    if (baseQueueResult.failureCount > 0 || basePersisted !== baseCount) {
      const firstErr =
        baseQueueResult.errors[0]?.message || 'Erro desconhecido na atualização da base.'
      const failMessage = `Falha na etapa de atualização da Base Atual: ${baseQueueResult.failureCount} de ${baseCount} registros falharam. Primeiro erro: ${firstErr}`

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
    const isSuccess =
      rawCount > 0 &&
      baseCount > 0 &&
      totalRawPersisted === rawCount &&
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
