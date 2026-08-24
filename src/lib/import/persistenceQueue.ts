/**
 * Fila de Persistência com Concorrência Controlada, Retry Inteligente e Exponential Backoff com Jitter.
 *
 * Projetada para eliminar perda de registros em importações volumosas contra o PocketBase / Skip Cloud.
 *
 * Características principais:
 * - Concorrência configurável baixa (default: 2, nunca Promise.all agressivo).
 * - Retry apenas para erros transitórios: HTTP 429 (Rate Limit), 408 (Request Timeout), 5xx e falhas de rede.
 * - Erros 4xx de validação/client-side (exceto 408/429): NÃO sofrem retry (falha imediata com preservação do erro).
 * - Respeito automático ao header / campo Retry-After em respostas 429.
 * - Exponential backoff com jitter aleatório para evitar thundering herd.
 * - Suporte a cancelamento seguro via AbortSignal.
 * - Callback de progresso detalhado: { processed, success, failed, retries, isRateLimited, rateLimitWaitMs, total }.
 * - Injeção de função de sleep (mockável para testes ultrarrápidos e determinísticos).
 */

export interface PersistenceQueueProgress {
  processed: number
  success: number
  failed: number
  retries: number
  isRateLimited: boolean
  rateLimitWaitMs: number
  total: number
}

export interface PersistenceQueueOptions {
  /** Concorrência máxima (default: 2). */
  concurrency?: number
  /** Número máximo de tentativas por item (default: 5). */
  maxRetries?: number
  /** Backoff inicial em milissegundos (default: 400ms). */
  initialBackoffMs?: number
  /** Backoff máximo em milissegundos (default: 8000ms). */
  maxBackoffMs?: number
  /** Fator multiplicador para o backoff exponencial (default: 2). */
  backoffFactor?: number
  /** Função de sleep customizável / mockável (default: setTimeout em Promise). */
  sleepFn?: (ms: number, signal?: AbortSignal) => Promise<void>
  /** AbortSignal opcional para cancelamento seguro. */
  signal?: AbortSignal
  /** Callback acionado a cada mudança de progresso ou retry. */
  onProgress?: (progress: PersistenceQueueProgress) => void
  /** Notificação ao entrar/sair de estado de rate limit (429). */
  onRateLimitStatus?: (isWaiting: boolean, waitMs: number) => void
}

export interface PersistenceTaskError {
  stage?: string
  row?: number
  key?: string
  message: string
  statusCode?: number
  attempts: number
}

export interface PersistenceQueueResult<T, R> {
  successCount: number
  failureCount: number
  totalRetries: number
  results: Array<{ item: T; index: number; result?: R; error?: PersistenceTaskError }>
  errors: PersistenceTaskError[]
  aborted: boolean
}

/**
 * Determina se um erro capturado é transitório (deve sofrer retry) ou definitivo (falha imediata).
 */
export function isTransientError(err: unknown): {
  isTransient: boolean
  statusCode?: number
  retryAfterMs?: number
} {
  if (!err) return { isTransient: false }

  const e = err as {
    status?: number
    statusCode?: number
    code?: number | string
    name?: string
    message?: string
    response?: {
      code?: number
      status?: number
      headers?: Record<string, string> | { get?: (name: string) => string | null }
      data?: Record<string, unknown>
      message?: string
    }
    headers?: Record<string, string> | { get?: (name: string) => string | null }
  }

  // 1. Extração do status HTTP
  const rawStatus =
    e.status ||
    e.statusCode ||
    (typeof e.code === 'number' ? e.code : undefined) ||
    e.response?.status ||
    (typeof e.response?.code === 'number' ? e.response.code : undefined)

  const status = typeof rawStatus === 'number' ? rawStatus : undefined

  // 2. Extração de Retry-After se disponível
  let retryAfterMs: number | undefined
  const headers = e.response?.headers || e.headers
  if (headers) {
    let retryAfterVal: string | null = null
    if (typeof (headers as { get?: (name: string) => string | null }).get === 'function') {
      retryAfterVal =
        (headers as { get: (name: string) => string | null }).get('retry-after') ||
        (headers as { get: (name: string) => string | null }).get('Retry-After')
    } else if (typeof headers === 'object') {
      const hObj = headers as Record<string, string>
      retryAfterVal = hObj['retry-after'] || hObj['Retry-After'] || null
    }

    if (retryAfterVal) {
      const parsedSec = Number(retryAfterVal)
      if (!Number.isNaN(parsedSec) && parsedSec > 0) {
        retryAfterMs = parsedSec * 1000
      } else {
        // Pode ser formato HTTP-Date
        const dateVal = Date.parse(retryAfterVal)
        if (!Number.isNaN(dateVal)) {
          const diff = dateVal - Date.now()
          if (diff > 0) retryAfterMs = diff
        }
      }
    }
  }

  // 3. Checagem de Rate Limit (HTTP 429 ou mensagem específica)
  const errMsgLower = (e.message || e.response?.message || '').toLowerCase()
  if (
    status === 429 ||
    errMsgLower.includes('too many requests') ||
    errMsgLower.includes('rate limit') ||
    errMsgLower.includes('429')
  ) {
    return { isTransient: true, statusCode: 429, retryAfterMs }
  }

  // 4. Request Timeout (HTTP 408) ou Gateway Timeout / Bad Gateway (502, 503, 504, 500)
  if (status === 408 || (status && status >= 500 && status <= 599)) {
    return { isTransient: true, statusCode: status, retryAfterMs }
  }

  // 5. Erros de rede, conexões abortadas ou timeouts sem status HTTP formal
  const isNetworkError =
    errMsgLower.includes('network') ||
    errMsgLower.includes('failed to fetch') ||
    errMsgLower.includes('fetch failed') ||
    errMsgLower.includes('econnreset') ||
    errMsgLower.includes('etimedout') ||
    errMsgLower.includes('socket hang up') ||
    (e.name === 'TypeError' && errMsgLower.includes('fetch'))

  if (isNetworkError) {
    return { isTransient: true, statusCode: status || 0, retryAfterMs }
  }

  // 6. Erros 4xx de validação ou outros erros de negócio (ex: 400 Bad Request, 401, 403, 404, 409 Conflict, 422)
  // NÃO devem ser repetidos: falha imediata.
  return { isTransient: false, statusCode: status }
}

/**
 * Implementação padrão de sleep com suporte a AbortSignal.
 */
export const defaultSleep = (ms: number, signal?: AbortSignal): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      return reject(new Error('Operação cancelada pelo usuário (AbortSignal).'))
    }

    const timer = setTimeout(() => {
      cleanup()
      resolve()
    }, ms)

    const onAbort = () => {
      cleanup()
      clearTimeout(timer)
      reject(new Error('Operação cancelada pelo usuário (AbortSignal).'))
    }

    const cleanup = () => {
      if (signal) {
        signal.removeEventListener('abort', onAbort)
      }
    }

    if (signal) {
      signal.addEventListener('abort', onAbort)
    }
  })
}

/**
 * Calcula o tempo de espera exponencial com jitter (Full Jitter / Decorrelated Jitter).
 */
export function calculateBackoff(
  attempt: number,
  initialMs: number,
  maxMs: number,
  factor: number,
  retryAfterMs?: number,
): number {
  if (retryAfterMs && retryAfterMs > 0) {
    // Adiciona jitter de até 20% ao Retry-After do servidor
    const jitter = Math.random() * 0.2 * retryAfterMs
    return Math.min(retryAfterMs + jitter, maxMs * 2)
  }

  // backoff = min(maxMs, initialMs * (factor ^ attempt))
  const exponential = initialMs * Math.pow(factor, attempt)
  const capped = Math.min(exponential, maxMs)
  // Full jitter: valor aleatório entre [initialMs/2, capped]
  const minWait = initialMs / 2
  const jitter = minWait + Math.random() * Math.max(0, capped - minWait)
  return Math.round(jitter)
}

/**
 * Processa uma coleção de itens através da Fila de Persistência com controle rigoroso de concorrência e retries.
 */
export async function runPersistenceQueue<T, R = unknown>(
  items: T[],
  taskFn: (item: T, index: number, signal?: AbortSignal) => Promise<R>,
  options?: PersistenceQueueOptions & {
    getKey?: (item: T, index: number) => string | undefined
    getRowNumber?: (item: T, index: number) => number | undefined
    stage?: string
    extractErrorMessage?: (err: unknown) => string
  },
): Promise<PersistenceQueueResult<T, R>> {
  const concurrency = Math.max(1, Math.min(options?.concurrency ?? 2, 4))
  const maxRetries = Math.max(1, options?.maxRetries ?? 5)
  const initialBackoffMs = options?.initialBackoffMs ?? 400
  const maxBackoffMs = options?.maxBackoffMs ?? 8000
  const backoffFactor = options?.backoffFactor ?? 2
  const sleep = options?.sleepFn ?? defaultSleep
  const signal = options?.signal

  const results: Array<{ item: T; index: number; result?: R; error?: PersistenceTaskError }> =
    new Array(items.length)
  const errors: PersistenceTaskError[] = []

  let processedCount = 0
  let successCount = 0
  let failureCount = 0
  let totalRetries = 0
  let isRateLimited = false
  let rateLimitWaitMs = 0
  let nextIndex = 0
  let wasAborted = false

  const emitProgress = () => {
    options?.onProgress?.({
      processed: processedCount,
      success: successCount,
      failed: failureCount,
      retries: totalRetries,
      isRateLimited,
      rateLimitWaitMs,
      total: items.length,
    })
  }

  // Inicia com progresso 0
  emitProgress()

  // Função para processar um único item com tentativas de retry
  const processItem = async (item: T, index: number): Promise<void> => {
    let attempts = 0
    let lastErr: unknown

    const rowNum = options?.getRowNumber ? options.getRowNumber(item, index) : index + 1
    const key = options?.getKey ? options.getKey(item, index) : undefined
    const stage = options?.stage || 'persist'

    while (attempts < maxRetries) {
      if (signal?.aborted) {
        wasAborted = true
        throw new Error('Operação cancelada pelo usuário.')
      }

      attempts++
      try {
        const result = await taskFn(item, index, signal)
        results[index] = { item, index, result }
        successCount++
        processedCount++
        emitProgress()
        return
      } catch (err) {
        lastErr = err
        const { isTransient, statusCode, retryAfterMs } = isTransientError(err)

        if (!isTransient || attempts >= maxRetries) {
          // Erro não transitório (ex: 400 Bad Request) ou esgotamento de retries
          const errMessage = options?.extractErrorMessage
            ? options.extractErrorMessage(err)
            : (err as Error)?.message || 'Erro de persistência'

          const taskError: PersistenceTaskError = {
            stage,
            row: rowNum,
            key,
            message: errMessage,
            statusCode,
            attempts,
          }

          results[index] = { item, index, error: taskError }
          errors.push(taskError)
          failureCount++
          processedCount++
          emitProgress()
          return
        }

        // É erro transitório e temos retries restantes
        totalRetries++
        const waitMs = calculateBackoff(
          attempts - 1,
          initialBackoffMs,
          maxBackoffMs,
          backoffFactor,
          retryAfterMs,
        )

        if (statusCode === 429) {
          isRateLimited = true
          rateLimitWaitMs = waitMs
          options?.onRateLimitStatus?.(true, waitMs)
        }

        emitProgress()

        try {
          await sleep(waitMs, signal)
        } catch (sleepErr) {
          if (signal?.aborted) {
            wasAborted = true
            throw sleepErr
          }
        } finally {
          if (statusCode === 429) {
            isRateLimited = false
            rateLimitWaitMs = 0
            options?.onRateLimitStatus?.(false, 0)
          }
        }
      }
    }

    // Se saiu do while (caso limite)
    const fallbackMsg = options?.extractErrorMessage
      ? options.extractErrorMessage(lastErr)
      : 'Tentativas de persistência esgotadas'
    const finalErr: PersistenceTaskError = {
      stage,
      row: rowNum,
      key,
      message: fallbackMsg,
      attempts,
    }
    results[index] = { item, index, error: finalErr }
    errors.push(finalErr)
    failureCount++
    processedCount++
    emitProgress()
  }

  // Pool de Workers com Concorrência Limitada
  const workers = Array.from({ length: concurrency }, async () => {
    while (nextIndex < items.length) {
      if (signal?.aborted) {
        wasAborted = true
        break
      }

      const currentIndex = nextIndex++
      const currentItem = items[currentIndex]

      try {
        await processItem(currentItem, currentIndex)
      } catch (workerErr) {
        if (signal?.aborted) {
          wasAborted = true
          break
        }
      }
    }
  })

  await Promise.all(workers)

  return {
    successCount,
    failureCount,
    totalRetries,
    results,
    errors,
    aborted: wasAborted,
  }
}
