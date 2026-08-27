import { describe, it, expect, vi, beforeEach } from 'vitest'
import pb from '@/lib/pocketbase/client'
import {
  testTradeProConnection,
  fetchTradeProBackendStatus,
  triggerTradeProBackendSync,
  isTradeProConfigured,
  getTradeProClient,
} from '../tradeProClient'

describe('tradeProClient — testTradeProConnection via PocketBase Jobs', () => {
  const mockCreate = vi.fn()
  const mockGetOne = vi.fn()
  const mockGetList = vi.fn()

  beforeEach(() => {
    vi.restoreAllMocks()

    // Configura mock de authStore com usuário autenticado padrão
    ;(pb as any).authStore = {
      record: { id: 'user_123', email: 'test@example.com' },
      model: { id: 'user_123', email: 'test@example.com' },
      isValid: true,
      token: 'valid_mock_token',
    }

    vi.spyOn(pb, 'collection').mockImplementation((collectionName: string) => {
      if (collectionName === 'tradepro_connection_jobs') {
        return {
          create: mockCreate,
          getOne: mockGetOne,
          getList: mockGetList,
        } as any
      }
      return {
        create: vi.fn(),
        getOne: vi.fn(),
        getList: vi.fn(),
      } as any
    })
  })

  it('1. testTradeProConnection cria job e busca resultado com sucesso HTTP 200', async () => {
    mockCreate.mockResolvedValueOnce({
      id: 'job_001',
      action: 'test_connection',
      requested_by: 'user_123',
      date_start: '2026-05-01',
      date_end: '2026-05-15',
      status: 'pending',
    })

    mockGetOne.mockResolvedValueOnce({
      id: 'job_001',
      connected: true,
      http_status: 200,
      has_data: true,
      records_received: 1,
      total_records_reported: 90,
      latency_ms: 350,
      message: 'Conexão realizada com sucesso.',
      error_code: '',
    })

    const result = await testTradeProConnection('2026-05-01', '2026-05-15')

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'test_connection',
        requested_by: 'user_123',
        date_start: '2026-05-01',
        date_end: '2026-05-15',
        status: 'pending',
      }),
    )
    expect(mockGetOne).toHaveBeenCalledWith('job_001')

    expect(result.conectado).toBe(true)
    expect(result.statusHttp).toBe(200)
    expect(result.possuiDados).toBe(true)
    expect(result.totalDeRegistrosInformado).toBe(90)
    expect(result.registrosRecebidos).toBe(1)
    expect(result.tempoRespostaMs).toBe(350)
  })

  it('2. testTradeProConnection lida com HTTP 204 (sem ocorrências)', async () => {
    mockCreate.mockResolvedValueOnce({ id: 'job_002' })
    mockGetOne.mockResolvedValueOnce({
      id: 'job_002',
      connected: true,
      http_status: 204,
      has_data: false,
      records_received: 0,
      total_records_reported: 0,
      latency_ms: 180,
      message: 'Conexão válida, sem ocorrências no período.',
      error_code: '',
    })

    const result = await testTradeProConnection('2026-05-01', '2026-05-10')

    expect(result.conectado).toBe(true)
    expect(result.statusHttp).toBe(204)
    expect(result.possuiDados).toBe(false)
    expect(result.registrosRecebidos).toBe(0)
    expect(result.totalDeRegistrosInformado).toBe(0)
  })

  it('3. testTradeProConnection retorna erro de usuário não autenticado', async () => {
    ;(pb as any).authStore = {
      record: null,
      model: null,
      isValid: false,
    }

    const result = await testTradeProConnection('2026-05-01', '2026-05-15')

    expect(result.conectado).toBe(false)
    expect(result.statusHttp).toBe(401)
    expect(result.mensagem).toContain('Usuário não autenticado')
    expect(result.errorCode).toBe('unauthorized')
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('4. testTradeProConnection lida com erro 401 / não configurado retornado pelo job', async () => {
    mockCreate.mockResolvedValueOnce({ id: 'job_003' })
    mockGetOne.mockResolvedValueOnce({
      id: 'job_003',
      connected: false,
      http_status: 401,
      has_data: false,
      records_received: 0,
      total_records_reported: 0,
      latency_ms: 220,
      message: 'Token inválido ou autenticação recusada.',
      error_code: 'unauthorized',
    })

    const result = await testTradeProConnection('2026-05-01', '2026-05-15')

    expect(result.conectado).toBe(false)
    expect(result.statusHttp).toBe(401)
    expect(result.mensagem).toContain('Token inválido')
    expect(result.errorCode).toBe('unauthorized')
  })

  it('5. testTradeProConnection lida com erro not_configured', async () => {
    mockCreate.mockResolvedValueOnce({ id: 'job_004' })
    mockGetOne.mockResolvedValueOnce({
      id: 'job_004',
      connected: false,
      http_status: 400,
      has_data: false,
      records_received: 0,
      total_records_reported: 0,
      latency_ms: 5,
      message: 'Integração não configurada. Cadastre o token protegido no Skip Cloud.',
      error_code: 'not_configured',
    })

    const result = await testTradeProConnection('2026-05-01', '2026-05-15')

    expect(result.conectado).toBe(false)
    expect(result.errorCode).toBe('not_configured')
    expect(result.mensagem).toContain('Integração não configurada')
  })

  it('6. testTradeProConnection lida com timeout e erros 5xx / rate limit', async () => {
    mockCreate.mockResolvedValueOnce({ id: 'job_005' })
    mockGetOne.mockResolvedValueOnce({
      id: 'job_005',
      connected: false,
      http_status: 429,
      has_data: false,
      records_received: 0,
      total_records_reported: 0,
      latency_ms: 10,
      message: 'Muitas requisições recentes. Aguarde alguns minutos antes de tentar novamente.',
      error_code: 'rate_limited',
    })

    const result = await testTradeProConnection('2026-05-01', '2026-05-15')

    expect(result.conectado).toBe(false)
    expect(result.statusHttp).toBe(429)
    expect(result.errorCode).toBe('rate_limited')
  })

  it('7. testTradeProConnection captura rejeição na criação do registro (falha do SDK)', async () => {
    mockCreate.mockRejectedValueOnce({
      status: 500,
      message: 'Database error',
    })

    const result = await testTradeProConnection('2026-05-01', '2026-05-15')

    expect(result.conectado).toBe(false)
    expect(result.statusHttp).toBe(500)
    expect(result.mensagem).toBe('Database error')
  })

  it('8. Segurança: isTradeProConfigured e getTradeProClient nunca retornam tokens no frontend', () => {
    expect(isTradeProConfigured()).toBe(false)
    expect(getTradeProClient()).toBeNull()
  })

  it('9. fetchTradeProBackendStatus retorna histórico a partir da coleção tradepro_connection_jobs', async () => {
    mockGetList.mockResolvedValueOnce({
      items: [
        {
          id: 'job_latest',
          action: 'test_connection',
          status: 'success',
          created: '2026-05-01T12:00:00Z',
          records_received: 1,
          total_records_reported: 120,
        },
      ],
    })

    const status = await fetchTradeProBackendStatus()
    expect(status.isConfigured).toBe(true)
    expect(status.lastSync?.id).toBe('job_latest')
    expect(status.lastSync?.status).toBe('success')
  })

  it('10. triggerTradeProBackendSync orienta utilização de arquivos Excel', async () => {
    const res = await triggerTradeProBackendSync('all')
    expect(res.success).toBe(false)
    expect(res.message).toContain('Excel')
  })

  it('11. testTradeProConnection lida com HTTP 412 (precondition_failed)', async () => {
    mockCreate.mockResolvedValueOnce({ id: 'job_412' })
    mockGetOne.mockResolvedValueOnce({
      id: 'job_412',
      connected: false,
      http_status: 412,
      has_data: false,
      records_received: 0,
      total_records_reported: 0,
      latency_ms: 450,
      message: 'Pré-condição X não atendida',
      error_code: 'precondition_failed',
    })

    const result = await testTradeProConnection('2026-05-01', '2026-05-15')

    expect(result.conectado).toBe(false)
    expect(result.statusHttp).toBe(412)
    expect(result.errorCode).toBe('precondition_failed')
    expect(result.mensagem).toBe('Pré-condição X não atendida')
  })
})
