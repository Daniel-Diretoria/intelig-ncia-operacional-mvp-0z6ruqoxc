import { describe, it, expect, vi, beforeEach } from 'vitest'
import { submitProcessValidades } from '../importClient'
import { formatErrorRows } from '@/lib/export/errorReportExport'
import pb from '@/lib/pocketbase/client'

vi.mock('@/lib/pocketbase/client', () => ({
  default: {
    authStore: { record: { id: 'usr_test_123' } },
    collection: vi.fn(),
  },
}))

describe('submitProcessValidades — Integridade de Job e Simulação de Volume', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('finaliza como completed SOMENTE quando 100% dos registros forem gravados', async () => {
    const rawSaved: Record<string, unknown>[] = []
    const baseSaved: Record<string, unknown>[] = []
    let histUpdated: Record<string, unknown> | null = null

    const mockHistory = {
      create: vi.fn().mockResolvedValue({ id: 'hist_123' }),
      update: vi.fn().mockImplementation(async (_id, data) => {
        histUpdated = data
        return { id: 'hist_123', ...data }
      }),
      getList: vi.fn().mockResolvedValue({ items: [] }),
    }

    const mockRaw = {
      create: vi.fn().mockImplementation(async (data) => {
        rawSaved.push(data)
        return { id: `raw_${rawSaved.length}`, ...data }
      }),
    }

    const mockBase = {
      create: vi.fn().mockImplementation(async (data) => {
        baseSaved.push(data)
        return { id: `base_${baseSaved.length}`, ...data }
      }),
      getList: vi.fn().mockResolvedValue({ items: [] }),
    }

    vi.mocked(pb.collection).mockImplementation((name: string) => {
      if (name === 'import_history')
        return mockHistory as unknown as ReturnType<typeof pb.collection>
      if (name === 'validades_raw') return mockRaw as unknown as ReturnType<typeof pb.collection>
      if (name === 'validades_base') return mockBase as unknown as ReturnType<typeof pb.collection>
      throw new Error(`Unexpected collection: ${name}`)
    })

    const rawRecords = [
      { codProduto: 'P1', produto: 'Prod 1', quantidade: 10 },
      { codProduto: 'P2', produto: 'Prod 2', quantidade: 20 },
    ]
    const baseAtual = [
      { codProduto: 'P1', produto: 'Prod 1', chaveOperacional: 'K1' },
      { codProduto: 'P2', produto: 'Prod 2', chaveOperacional: 'K2' },
    ]

    const result = await submitProcessValidades({
      fileName: 'teste.xlsx',
      fileHash: 'hash_test_1',
      rawRecords,
      baseAtual,
      summary: {
        totalBrutos: 2,
        validos: 2,
        filtrados90Dias: 0,
        consolidados: 2,
        baseAtual: 2,
      },
    })

    expect(result.success).toBe(true)
    expect(result.rawRows).toBe(2)
    expect(result.importedRows).toBe(2)
    expect(result.errorRows).toBe(0)
    expect(rawSaved.length).toBe(2)
    expect(baseSaved.length).toBe(2)
    expect(histUpdated).toMatchObject({
      status: 'completed',
      imported_rows: 2,
      error_rows: 0,
    })
  })

  it('NUNCA marca como completed quando ocorre falha parcial (marca como failed)', async () => {
    let histUpdated: Record<string, unknown> | null = null

    const mockHistory = {
      create: vi.fn().mockResolvedValue({ id: 'hist_fail_1' }),
      update: vi.fn().mockImplementation(async (_id, data) => {
        histUpdated = data
        return { id: 'hist_fail_1', ...data }
      }),
      getList: vi.fn().mockResolvedValue({ items: [] }),
    }

    let rawCount = 0
    const mockRaw = {
      create: vi.fn().mockImplementation(async (data) => {
        rawCount++
        if (rawCount === 2) {
          // Falha não-transitória imediata
          const err = new Error('Field "produto" is invalid')
          ;(err as unknown as { status: number }).status = 400
          throw err
        }
        return { id: `raw_${rawCount}`, ...data }
      }),
    }

    const mockBase = {
      create: vi.fn().mockResolvedValue({ id: 'base_1' }),
      getList: vi.fn().mockResolvedValue({ items: [] }),
    }

    vi.mocked(pb.collection).mockImplementation((name: string) => {
      if (name === 'import_history')
        return mockHistory as unknown as ReturnType<typeof pb.collection>
      if (name === 'validades_raw') return mockRaw as unknown as ReturnType<typeof pb.collection>
      if (name === 'validades_base') return mockBase as unknown as ReturnType<typeof pb.collection>
      throw new Error(`Unexpected collection: ${name}`)
    })

    const rawRecords = [
      { codProduto: 'P1', produto: 'Prod 1' },
      { codProduto: 'P2', produto: 'Prod 2' },
      { codProduto: 'P3', produto: 'Prod 3' },
    ]
    const baseAtual = [
      { codProduto: 'P1', produto: 'Prod 1', chaveOperacional: 'K1' },
      { codProduto: 'P2', produto: 'Prod 2', chaveOperacional: 'K2' },
      { codProduto: 'P3', produto: 'Prod 3', chaveOperacional: 'K3' },
    ]

    const result = await submitProcessValidades({
      fileName: 'teste_falha.xlsx',
      fileHash: 'hash_fail_1',
      rawRecords,
      baseAtual,
      summary: {
        totalBrutos: 3,
        validos: 3,
        filtrados90Dias: 0,
        consolidados: 3,
        baseAtual: 3,
      },
    })

    expect(result.success).toBe(false)
    expect(result.errorRows).toBeGreaterThanOrEqual(1)
    expect(result.error).toContain('Falha na etapa de gravação de dados brutos')
    expect(histUpdated).toMatchObject({
      status: 'failed',
    })
    expect(mockBase.create).not.toHaveBeenCalled() // Aborta antes da base para preservar integridade
  })

  it('simula volume sintético de 5.000 registros com rate limits (429) recuperados', async () => {
    const TOTAL_VOLUME = 5000
    const rawRecords = Array.from({ length: TOTAL_VOLUME }, (_, i) => ({
      codProduto: `PROD_${i + 1}`,
      produto: `Produto Sintético ${i + 1}`,
      quantidade: (i % 10) + 1,
    }))
    const baseAtual = Array.from({ length: TOTAL_VOLUME }, (_, i) => ({
      codProduto: `PROD_${i + 1}`,
      produto: `Produto Sintético ${i + 1}`,
      chaveOperacional: `CHAVE_OP_${i + 1}`,
    }))

    let rawCreatedCount = 0
    let baseCreatedCount = 0
    let rateLimitsHit = 0

    const mockHistory = {
      create: vi.fn().mockResolvedValue({ id: 'hist_synth_5k' }),
      update: vi.fn().mockResolvedValue({ id: 'hist_synth_5k' }),
      getList: vi.fn().mockResolvedValue({ items: [] }),
    }

    // Simula 429 a cada 500 gravações para testar retry transparente
    const mockRaw = {
      create: vi.fn().mockImplementation(async (data) => {
        if (rawCreatedCount > 0 && rawCreatedCount % 500 === 0 && rateLimitsHit < 5) {
          rateLimitsHit++
          const err = new Error('Too Many Requests')
          ;(err as unknown as { status: number }).status = 429
          throw err
        }
        rawCreatedCount++
        return { id: `raw_${rawCreatedCount}`, ...data }
      }),
    }

    const mockBase = {
      create: vi.fn().mockImplementation(async (data) => {
        baseCreatedCount++
        return { id: `base_${baseCreatedCount}`, ...data }
      }),
      getList: vi.fn().mockResolvedValue({ items: [] }),
    }

    vi.mocked(pb.collection).mockImplementation((name: string) => {
      if (name === 'import_history')
        return mockHistory as unknown as ReturnType<typeof pb.collection>
      if (name === 'validades_raw') return mockRaw as unknown as ReturnType<typeof pb.collection>
      if (name === 'validades_base') return mockBase as unknown as ReturnType<typeof pb.collection>
      throw new Error(`Unexpected collection: ${name}`)
    })

    const result = await submitProcessValidades({
      fileName: 'sintetico_5000.xlsx',
      fileHash: 'hash_synth_5000',
      rawRecords,
      baseAtual,
      summary: {
        totalBrutos: TOTAL_VOLUME,
        validos: TOTAL_VOLUME,
        filtrados90Dias: 0,
        consolidados: TOTAL_VOLUME,
        baseAtual: TOTAL_VOLUME,
      },
    })

    expect(result.success).toBe(true)
    expect(result.importedRows).toBe(TOTAL_VOLUME)
    expect(result.rawRows).toBe(TOTAL_VOLUME)
    expect(result.errorRows).toBe(0)
    expect(result.retriesCount).toBeGreaterThanOrEqual(1)
  })

  it('formata adequadamente linhas para exportação de relatório de erros', () => {
    const rawErrors = [
      {
        stage: 'validades_raw',
        row: 142,
        key: 'CHAVE_TESTE_142',
        message: 'Código de barras inválido',
        statusCode: 400,
        attempts: 1,
      },
      {
        stage: 'validades_base',
        row: 508,
        key: 'CHAVE_TESTE_508',
        message: 'Timeout ao persistir registro',
        statusCode: 408,
        attempts: 5,
      },
    ]

    const formatted = formatErrorRows(rawErrors)

    expect(formatted.length).toBe(2)
    expect(formatted[0]).toEqual({
      linha: 142,
      chave: 'CHAVE_TESTE_142',
      etapa: 'validades_raw',
      motivo: 'Código de barras inválido',
      codigo_http: 400,
      tentativas: 1,
    })
    expect(formatted[1]).toEqual({
      linha: 508,
      chave: 'CHAVE_TESTE_508',
      etapa: 'validades_base',
      motivo: 'Timeout ao persistir registro',
      codigo_http: 408,
      tentativas: 5,
    })
  })
})
