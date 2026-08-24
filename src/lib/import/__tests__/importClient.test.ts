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
  })
})
