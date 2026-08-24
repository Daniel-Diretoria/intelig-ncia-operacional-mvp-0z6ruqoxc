import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  errMsg,
  sanitizeErrorMessage,
  persistConcurrent,
  submitProcessValidades,
  type ProcessValidadesPayload,
} from '../importClient'
import pb from '@/lib/pocketbase/client'

describe('Cliente de Importação (importClient)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // Teste c) Função de extração e sanitização de erro
  describe('errMsg e sanitizeErrorMessage', () => {
    it('c.1) deve extrair mensagem de response.data (erros de campo)', () => {
      const err = {
        response: {
          data: {
            produto: { message: 'Campo produto é obrigatório' },
            quantidade: { message: 'Deve ser maior que zero' },
          },
          message: 'Erro de validação',
        },
      }
      const msg = errMsg(err)
      expect(msg).toContain('produto: Campo produto é obrigatório')
      expect(msg).toContain('quantidade: Deve ser maior que zero')
      expect(msg).toContain('Erro de validação')
    })

    it('c.2) deve retornar err.message quando não há response estruturado', () => {
      const err = new Error('Falha de conexão com o PocketBase')
      const msg = errMsg(err)
      expect(msg).toBe('Falha de conexão com o PocketBase')
    })

    it('c.3) deve retornar "Erro desconhecido" para erro completamente opaco', () => {
      expect(errMsg(null)).toBe('Erro desconhecido')
      expect(errMsg(undefined)).toBe('Erro desconhecido')
      expect(errMsg({})).toBe('Erro desconhecido')
    })

    it('c.4) NUNCA deve expor token "Bearer xyz" ou secrets sensíveis', () => {
      const errWithBearer = {
        message:
          'Request failed with Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.token123',
      }
      const sanitized = errMsg(errWithBearer)
      expect(sanitized).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.token123')
      expect(sanitized).toContain('Bearer [REDACTED]')

      const directSanitize = sanitizeErrorMessage('api-key="super-secret-12345"')
      expect(directSanitize).toBe('api-key=[REDACTED]')
    })

    it('c.5) deve incluir contexto de coleção e operação com clareza', () => {
      const err = new Error('Network timeout')
      const msg = errMsg(err, { collection: 'validades_raw', operation: 'create' })
      expect(msg).toBe('[validades_raw:create] Network timeout')
    })
  })

  // Teste b) Status confiável e aborto em caso de falha em persistConcurrent
  describe('Integridade do Pipeline de Importação (submitProcessValidades)', () => {
    it('b) quando persistConcurrent de raw retorna failures, o status final no histórico é "failed", nunca "completed", e não tenta atualizar base', async () => {
      let createdHistoryId = 'hist_123'
      let historyStatusUpdated = ''
      let historyErrorsUpdated = ''
      let rawCreateCallCount = 0
      let baseCreateCallCount = 0

      // Mock PocketBase collections
      const getListMock = vi.fn().mockResolvedValue({ items: [] })
      const createHistMock = vi.fn().mockResolvedValue({ id: createdHistoryId })
      const updateHistMock = vi.fn().mockImplementation((_id, data) => {
        if (data.status) historyStatusUpdated = data.status
        if (data.errors_json) historyErrorsUpdated = data.errors_json
        return Promise.resolve({ id: createdHistoryId, ...data })
      })

      const createRawMock = vi.fn().mockImplementation((data) => {
        rawCreateCallCount++
        // Simula falha no 2º registro
        if (rawCreateCallCount === 2) {
          return Promise.reject(new Error('Erro simulado de banco na gravação do raw'))
        }
        return Promise.resolve({ id: `raw_${rawCreateCallCount}`, ...data })
      })

      const createBaseMock = vi.fn().mockImplementation((data) => {
        baseCreateCallCount++
        return Promise.resolve({ id: `base_${baseCreateCallCount}`, ...data })
      })

      // Injeta mock no pb
      const originalCollection = pb.collection.bind(pb)
      vi.spyOn(pb, 'collection').mockImplementation((collName: string) => {
        if (collName === 'import_history') {
          return {
            getList: getListMock,
            create: createHistMock,
            update: updateHistMock,
          } as unknown as ReturnType<typeof pb.collection>
        }
        if (collName === 'validades_raw') {
          return {
            create: createRawMock,
          } as unknown as ReturnType<typeof pb.collection>
        }
        if (collName === 'validades_base') {
          return {
            getList: getListMock,
            create: createBaseMock,
            update: vi.fn(),
          } as unknown as ReturnType<typeof pb.collection>
        }
        return originalCollection(collName)
      })

      const payload: ProcessValidadesPayload = {
        fileName: 'teste_validades.xlsx',
        fileSize: 1024,
        fileHash: 'hash_test_123',
        rawRecords: [
          { produto: 'Produto 1', realizado: '2026-08-10', quantidade: 10 },
          { produto: 'Produto 2 (Falha)', realizado: '2026-08-10', quantidade: 5 },
          { produto: 'Produto 3', realizado: '2026-08-10', quantidade: 8 },
        ],
        baseAtual: [
          { produto: 'Produto 1', quantidade: 10, chaveOperacional: 'loja1|prod1' },
          { produto: 'Produto 3', quantidade: 8, chaveOperacional: 'loja1|prod3' },
        ],
        summary: {
          totalBrutos: 3,
          validos: 3,
          rejeitados: 0,
          filtrados90Dias: 3,
          consolidados: 0,
          baseAtual: 2,
        },
      }

      const result = await submitProcessValidades(payload)

      // Verificações rigorosas:
      expect(result.success).toBe(false)
      expect(result.errorRows).toBeGreaterThan(0)
      expect(result.error).toContain('Falha na etapa de gravação de dados brutos')
      expect(historyStatusUpdated).toBe('failed')
      expect(historyErrorsUpdated).toContain('Erro simulado de banco na gravação do raw')

      // Não deve ter chamado a gravação da base atual
      expect(baseCreateCallCount).toBe(0)
    })

    it('quando todas as etapas têm sucesso, atualiza status para "completed"', async () => {
      let createdHistoryId = 'hist_ok_456'
      let historyStatusUpdated = ''

      const getListMock = vi.fn().mockResolvedValue({ items: [] })
      const createHistMock = vi.fn().mockResolvedValue({ id: createdHistoryId })
      const updateHistMock = vi.fn().mockImplementation((_id, data) => {
        if (data.status) historyStatusUpdated = data.status
        return Promise.resolve({ id: createdHistoryId, ...data })
      })
      const createRawMock = vi.fn().mockResolvedValue({ id: 'raw_ok' })
      const createBaseMock = vi.fn().mockResolvedValue({ id: 'base_ok' })

      vi.spyOn(pb, 'collection').mockImplementation((collName: string) => {
        if (collName === 'import_history') {
          return {
            getList: getListMock,
            create: createHistMock,
            update: updateHistMock,
          } as unknown as ReturnType<typeof pb.collection>
        }
        if (collName === 'validades_raw') {
          return { create: createRawMock } as unknown as ReturnType<typeof pb.collection>
        }
        if (collName === 'validades_base') {
          return {
            getList: getListMock,
            create: createBaseMock,
            update: vi.fn(),
          } as unknown as ReturnType<typeof pb.collection>
        }
        return {} as unknown as ReturnType<typeof pb.collection>
      })

      const payload: ProcessValidadesPayload = {
        fileName: 'teste_validades_sucesso.xlsx',
        fileSize: 2048,
        fileHash: 'hash_test_sucesso',
        rawRecords: [{ produto: 'Prod A', realizado: '2026-08-10', quantidade: 5 }],
        baseAtual: [{ produto: 'Prod A', quantidade: 5, chaveOperacional: 'loja1|prodA' }],
        summary: {
          totalBrutos: 1,
          validos: 1,
          filtrados90Dias: 1,
          consolidados: 0,
          baseAtual: 1,
        },
      }

      const result = await submitProcessValidades(payload)
      expect(result.success).toBe(true)
      expect(result.errorRows).toBe(0)
      expect(historyStatusUpdated).toBe('completed')
    })

    // Testes novos solicitados para importClient:
    it('a) loadAlreadyPersistedRawKeys: mock pb.collection("validades_raw").getList -> retorna Set com 3 chaves', async () => {
      const { loadAlreadyPersistedRawKeys } = await import('../importClient')

      const getListMock = vi.fn().mockResolvedValue({
        items: [
          { _rowNumber: 1, id: 'raw_1' },
          { _rowNumber: 2, id: 'raw_2' },
          { numero_linha: 5, id: 'raw_5' },
        ],
        totalItems: 3,
      })

      vi.spyOn(pb, 'collection').mockImplementation((collName: string) => {
        if (collName === 'validades_raw') {
          return { getList: getListMock } as unknown as ReturnType<typeof pb.collection>
        }
        return {} as unknown as ReturnType<typeof pb.collection>
      })

      const keysSet = await loadAlreadyPersistedRawKeys('import_test_123')
      expect(keysSet.size).toBe(3)
      expect(keysSet.has('raw_row_1')).toBe(true)
      expect(keysSet.has('raw_row_2')).toBe(true)
      expect(keysSet.has('raw_row_5')).toBe(true)
      expect(keysSet.has('raw_row_3')).toBe(false)
    })

    it('b) submitProcessValidades com force=true e 5 raw records, 3 já persistidos -> apenas 2 são enviados para create', async () => {
      let createdRawItems: unknown[] = []

      const getListHistMock = vi.fn().mockResolvedValue({
        items: [{ id: 'hist_prev_1', status: 'failed' }],
      })
      const updateHistMock = vi.fn().mockResolvedValue({ id: 'hist_prev_1' })
      const getListRawMock = vi.fn().mockResolvedValue({
        items: [{ _rowNumber: 1 }, { _rowNumber: 2 }, { _rowNumber: 3 }],
        totalItems: 3,
      })
      const createRawMock = vi.fn().mockImplementation((data) => {
        createdRawItems.push(data)
        return Promise.resolve({ id: `raw_${createdRawItems.length}`, ...data })
      })
      const createBaseMock = vi.fn().mockResolvedValue({ id: 'base_ok' })
      const getListBaseMock = vi.fn().mockResolvedValue({ items: [] })

      vi.spyOn(pb, 'collection').mockImplementation((collName: string) => {
        if (collName === 'import_history') {
          return {
            getList: getListHistMock,
            create: vi.fn(),
            update: updateHistMock,
          } as unknown as ReturnType<typeof pb.collection>
        }
        if (collName === 'validades_raw') {
          return {
            getList: getListRawMock,
            create: createRawMock,
          } as unknown as ReturnType<typeof pb.collection>
        }
        if (collName === 'validades_base') {
          return {
            getList: getListBaseMock,
            create: createBaseMock,
            update: vi.fn(),
          } as unknown as ReturnType<typeof pb.collection>
        }
        return {} as unknown as ReturnType<typeof pb.collection>
      })

      const payload: ProcessValidadesPayload = {
        fileName: 'teste_retomada.xlsx',
        fileSize: 1024,
        fileHash: 'hash_retomada_123',
        force: true,
        rawRecords: [
          { produto: 'P1', realizado: '2026-08-10', quantidade: 1 },
          { produto: 'P2', realizado: '2026-08-10', quantidade: 2 },
          { produto: 'P3', realizado: '2026-08-10', quantidade: 3 },
          { produto: 'P4', realizado: '2026-08-10', quantidade: 4 },
          { produto: 'P5', realizado: '2026-08-10', quantidade: 5 },
        ],
        baseAtual: [
          { produto: 'P1', quantidade: 1, chaveOperacional: 'c1' },
          { produto: 'P2', quantidade: 2, chaveOperacional: 'c2' },
          { produto: 'P3', quantidade: 3, chaveOperacional: 'c3' },
          { produto: 'P4', quantidade: 4, chaveOperacional: 'c4' },
          { produto: 'P5', quantidade: 5, chaveOperacional: 'c5' },
        ],
        summary: {
          totalBrutos: 5,
          validos: 5,
          filtrados90Dias: 5,
          consolidados: 0,
          baseAtual: 5,
        },
      }

      const res = await submitProcessValidades(payload)
      expect(res.success).toBe(true)
      // Apenas os itens 4 e 5 foram criados na chamada
      expect(createdRawItems.length).toBe(2)
      expect((createdRawItems[0] as { _rowNumber: number })._rowNumber).toBe(4)
      expect((createdRawItems[1] as { _rowNumber: number })._rowNumber).toBe(5)
      expect(res.rawRows).toBe(5) // Total de brutos persistidos (3 anteriores + 2 novos)
    })

    it('c) raw falha parcial (2 de 10 falham 429 definitivo) -> resultado: success=false, rawRows=8, errorRows=2, importedRows=0 (base não tentada)', async () => {
      let createdRawCount = 0
      let updatedHistoryData: Record<string, unknown> = {}

      const getListHistMock = vi.fn().mockResolvedValue({ items: [] })
      const createHistMock = vi.fn().mockResolvedValue({ id: 'hist_partial_1' })
      const updateHistMock = vi.fn().mockImplementation((_id, data) => {
        updatedHistoryData = data
        return Promise.resolve({ id: 'hist_partial_1', ...data })
      })

      const createRawMock = vi.fn().mockImplementation((data) => {
        createdRawCount++
        // Itens 3 e 7 falham 429
        if (data._rowNumber === 3 || data._rowNumber === 7) {
          const err = new Error('Too Many Requests')
          ;(err as unknown as { status: number }).status = 429
          return Promise.reject(err)
        }
        return Promise.resolve({ id: `raw_${data._rowNumber}`, ...data })
      })

      const createBaseMock = vi.fn().mockResolvedValue({ id: 'base_ok' })

      vi.spyOn(pb, 'collection').mockImplementation((collName: string) => {
        if (collName === 'import_history') {
          return {
            getList: getListHistMock,
            create: createHistMock,
            update: updateHistMock,
          } as unknown as ReturnType<typeof pb.collection>
        }
        if (collName === 'validades_raw') {
          return {
            getList: vi.fn().mockResolvedValue({ items: [], totalItems: 0 }),
            create: createRawMock,
          } as unknown as ReturnType<typeof pb.collection>
        }
        if (collName === 'validades_base') {
          return {
            getList: vi.fn().mockResolvedValue({ items: [] }),
            create: createBaseMock,
            update: vi.fn(),
          } as unknown as ReturnType<typeof pb.collection>
        }
        return {} as unknown as ReturnType<typeof pb.collection>
      })

      const rawRecords = Array.from({ length: 10 }, (_, i) => ({
        produto: `Prod_${i + 1}`,
        realizado: '2026-08-10',
        quantidade: 10,
      }))

      const payload: ProcessValidadesPayload = {
        fileName: 'teste_parcial.xlsx',
        fileSize: 1024,
        fileHash: 'hash_parcial_123',
        rawRecords,
        baseAtual: [{ produto: 'Prod_1', quantidade: 10, chaveOperacional: 'c1' }],
        summary: {
          totalBrutos: 10,
          validos: 10,
          filtrados90Dias: 10,
          consolidados: 0,
          baseAtual: 1,
        },
      }

      const res = await submitProcessValidades(payload)

      expect(res.success).toBe(false)
      expect(res.rawRows).toBe(8) // 8 brutos persistidos com sucesso!
      expect(res.errorRows).toBe(2)
      expect(res.importedRows).toBe(0) // Base não foi tentada
      expect(createBaseMock).not.toHaveBeenCalled()

      // d) history update inclui raw_count=8 (persistidos reais), não 0
      expect(updatedHistoryData.raw_count).toBe(8)
      expect(updatedHistoryData.imported_rows).toBe(0)
      expect(updatedHistoryData.status).toBe('failed')
      expect(typeof updatedHistoryData.errors_json).toBe('string')
      const parsedErrors = JSON.parse(updatedHistoryData.errors_json as string)
      expect(parsedErrors._meta.rawPersisted).toBe(8)
      expect(parsedErrors._meta.rawExpected).toBe(10)
      expect(parsedErrors._meta.isPartial).toBe(true)
    })
  })
})
