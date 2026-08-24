import { describe, it, expect, vi } from 'vitest'
import {
  runPersistenceQueue,
  isTransientError,
  calculateBackoff,
  type PersistenceQueueProgress,
} from '../persistenceQueue'

describe('persistenceQueue — Fila de Persistência com Concorrência e Retry', () => {
  it('identifica corretamente erros transitórios vs definitivos', () => {
    // 429 Too Many Requests -> transitório
    expect(isTransientError({ status: 429 }).isTransient).toBe(true)
    expect(isTransientError({ response: { status: 429 } }).isTransient).toBe(true)
    expect(isTransientError(new Error('Rate limit exceeded 429')).isTransient).toBe(true)
    expect(isTransientError(new Error('Too Many Requests')).isTransient).toBe(true)

    // 408 Timeout -> transitório
    expect(isTransientError({ status: 408 }).isTransient).toBe(true)

    // 5xx Server Errors -> transitório
    expect(isTransientError({ status: 500 }).isTransient).toBe(true)
    expect(isTransientError({ status: 502 }).isTransient).toBe(true)
    expect(isTransientError({ status: 503 }).isTransient).toBe(true)
    expect(isTransientError({ status: 504 }).isTransient).toBe(true)

    // Erros de rede sem status -> transitório
    expect(isTransientError(new Error('Failed to fetch')).isTransient).toBe(true)
    expect(
      isTransientError(new Error('NetworkError when attempting to fetch resource')).isTransient,
    ).toBe(true)
    expect(isTransientError(new Error('socket hang up')).isTransient).toBe(true)

    // Erros 4xx de validação/client-side -> DEFINITIVO (NÃO transitório)
    expect(isTransientError({ status: 400 }).isTransient).toBe(false)
    expect(isTransientError({ status: 401 }).isTransient).toBe(false)
    expect(isTransientError({ status: 403 }).isTransient).toBe(false)
    expect(isTransientError({ status: 404 }).isTransient).toBe(false)
    expect(isTransientError({ status: 422 }).isTransient).toBe(false)
  })

  it('extrai Retry-After em segundos e converte para ms', () => {
    const res = isTransientError({
      status: 429,
      response: {
        headers: { 'retry-after': '3' },
      },
    })
    expect(res.isTransient).toBe(true)
    expect(res.statusCode).toBe(429)
    expect(res.retryAfterMs).toBe(3000)
  })

  it('calcula exponential backoff com jitter e respeita Retry-After', () => {
    const b1 = calculateBackoff(0, 400, 8000, 2)
    expect(b1).toBeGreaterThanOrEqual(200)
    expect(b1).toBeLessThanOrEqual(400)

    const b2 = calculateBackoff(3, 400, 8000, 2)
    expect(b2).toBeGreaterThanOrEqual(200)
    expect(b2).toBeLessThanOrEqual(3200)

    // Com retryAfterMs
    const bRetry = calculateBackoff(0, 400, 8000, 2, 5000)
    expect(bRetry).toBeGreaterThanOrEqual(5000)
    expect(bRetry).toBeLessThanOrEqual(6000)
  })

  it('processa itens com sucesso sob concorrência baixa sem sleeps desnecessários', async () => {
    const items = [1, 2, 3, 4, 5]
    const processed: number[] = []
    const sleepMock = vi.fn(async () => {})

    const result = await runPersistenceQueue(
      items,
      async (item) => {
        processed.push(item)
        return item * 10
      },
      {
        concurrency: 2,
        sleepFn: sleepMock,
      },
    )

    expect(result.successCount).toBe(5)
    expect(result.failureCount).toBe(0)
    expect(result.totalRetries).toBe(0)
    expect(result.results.map((r) => r.result)).toEqual([10, 20, 30, 40, 50])
    expect(sleepMock).not.toHaveBeenCalled()
  })

  it('executa retry em 429 com sleep mockado e recupera com sucesso', async () => {
    const items = ['item-A', 'item-B']
    const attemptsPerItem = new Map<string, number>()
    const sleepCalls: number[] = []

    const sleepMock = vi.fn(async (ms: number) => {
      sleepCalls.push(ms)
    })

    const result = await runPersistenceQueue(
      items,
      async (item) => {
        const count = attemptsPerItem.get(item) || 0
        attemptsPerItem.set(item, count + 1)

        // item-A falha 2 vezes com 429 e passa na 3ª
        if (item === 'item-A' && count < 2) {
          const err = new Error('Too Many Requests')
          ;(err as unknown as { status: number }).status = 429
          throw err
        }
        return `saved-${item}`
      },
      {
        concurrency: 2,
        maxRetries: 5,
        sleepFn: sleepMock,
      },
    )

    expect(result.successCount).toBe(2)
    expect(result.failureCount).toBe(0)
    expect(result.totalRetries).toBe(2)
    expect(sleepCalls.length).toBe(2)
    expect(attemptsPerItem.get('item-A')).toBe(3)
    expect(attemptsPerItem.get('item-B')).toBe(1)
  })

  it('NÃO repete erros 400 Bad Request (falha imediata)', async () => {
    const items = ['valid', 'bad-request', 'valid-2']
    const attemptsMap = new Map<string, number>()
    const sleepMock = vi.fn(async () => {})

    const result = await runPersistenceQueue(
      items,
      async (item) => {
        const count = (attemptsMap.get(item) || 0) + 1
        attemptsMap.set(item, count)

        if (item === 'bad-request') {
          const err = new Error('Invalid field format')
          ;(err as unknown as { status: number }).status = 400
          throw err
        }
        return `ok-${item}`
      },
      {
        concurrency: 2,
        sleepFn: sleepMock,
        extractErrorMessage: (e) => (e as Error).message,
      },
    )

    expect(result.successCount).toBe(2)
    expect(result.failureCount).toBe(1)
    expect(result.totalRetries).toBe(0)
    expect(sleepMock).not.toHaveBeenCalled()
    expect(attemptsMap.get('bad-request')).toBe(1) // apenas 1 tentativa, sem retry!
    expect(result.errors[0].message).toBe('Invalid field format')
    expect(result.errors[0].statusCode).toBe(400)
  })

  it('registra falha quando esgota o máximo de retries em erro 500', async () => {
    const items = ['flaky']
    let attempts = 0
    const sleepMock = vi.fn(async () => {})

    const result = await runPersistenceQueue(
      items,
      async () => {
        attempts++
        const err = new Error('Internal Server Error')
        ;(err as unknown as { status: number }).status = 500
        throw err
      },
      {
        concurrency: 1,
        maxRetries: 4,
        sleepFn: sleepMock,
      },
    )

    expect(result.successCount).toBe(0)
    expect(result.failureCount).toBe(1)
    expect(result.totalRetries).toBe(3) // 3 retries após a 1ª tentativa
    expect(attempts).toBe(4) // 4 tentativas totais
    expect(result.errors.length).toBe(1)
    expect(result.errors[0].statusCode).toBe(500)
    expect(result.errors[0].attempts).toBe(4)
  })

  it('suporta cancelamento seguro via AbortSignal', async () => {
    const items = [1, 2, 3, 4, 5, 6]
    const controller = new AbortController()
    let processed = 0

    const result = await runPersistenceQueue(
      items,
      async (item) => {
        processed++
        if (item === 2) {
          controller.abort()
        }
        return item
      },
      {
        concurrency: 1,
        signal: controller.signal,
      },
    )

    expect(result.aborted).toBe(true)
    expect(processed).toBeLessThanOrEqual(3)
  })

  it('emite callbacks de progresso com contagens e status de 429', async () => {
    const items = [1, 2]
    const progressUpdates: PersistenceQueueProgress[] = []
    const rateLimitUpdates: Array<{ isWaiting: boolean; waitMs: number }> = []

    const sleepMock = vi.fn(async () => {})
    let firstCall = true

    await runPersistenceQueue(
      items,
      async (item) => {
        if (item === 1 && firstCall) {
          firstCall = false
          const err = new Error('Too Many Requests')
          ;(err as unknown as { status: number }).status = 429
          throw err
        }
        return item
      },
      {
        concurrency: 1,
        sleepFn: sleepMock,
        onProgress: (p) => progressUpdates.push({ ...p }),
        onRateLimitStatus: (isWaiting, waitMs) => rateLimitUpdates.push({ isWaiting, waitMs }),
      },
    )

    expect(progressUpdates.length).toBeGreaterThan(0)
    const lastProgress = progressUpdates[progressUpdates.length - 1]
    expect(lastProgress.processed).toBe(2)
    expect(lastProgress.success).toBe(2)
    expect(lastProgress.retries).toBe(1)

    expect(rateLimitUpdates.length).toBe(2)
    expect(rateLimitUpdates[0].isWaiting).toBe(true)
    expect(rateLimitUpdates[1].isWaiting).toBe(false)
  })
})
