import { describe, it, expect, vi, beforeEach } from 'vitest'
import pb from '@/lib/pocketbase/client'
import {
  testTradeProConnection,
  fetchTradeProBackendStatus,
  triggerTradeProBackendSync,
  isTradeProConfigured,
  getTradeProClient,
} from '../tradeProClient'

describe('tradeProClient — testTradeProConnection and Security Rules', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('1. testTradeProConnection retorna estrutura correta no sucesso HTTP 200 com registros', async () => {
    const mockSuccessResponse = {
      conectado: true,
      statusHttp: 200,
      possuiDados: true,
      registrosRecebidos: 1,
      totalDeRegistrosInformado: 90,
      tempoRespostaMs: 450,
      mensagem: 'Conexão realizada com sucesso.',
    }

    vi.spyOn(pb, 'send').mockResolvedValueOnce(mockSuccessResponse)

    const result = await testTradeProConnection('2026-05-01', '2026-05-15')

    expect(pb.send).toHaveBeenCalledWith('/api/backend/v1/tradepro/test-connection', {
      method: 'POST',
      body: { dataInicial: '2026-05-01', dataFinal: '2026-05-15' },
    })
    expect(result).toEqual(mockSuccessResponse)
    expect(result.conectado).toBe(true)
    expect(result.statusHttp).toBe(200)
    expect(result.possuiDados).toBe(true)
    expect(result.totalDeRegistrosInformado).toBe(90)
  })

  it('2. testTradeProConnection lida com HTTP 204 (sem ocorrências)', async () => {
    const mock204Response = {
      conectado: true,
      statusHttp: 204,
      possuiDados: false,
      registrosRecebidos: 0,
      totalDeRegistrosInformado: 0,
      tempoRespostaMs: 180,
      mensagem: 'Conexão válida, sem ocorrências no período.',
    }

    vi.spyOn(pb, 'send').mockResolvedValueOnce(mock204Response)

    const result = await testTradeProConnection('2026-05-01', '2026-05-10')

    expect(result.conectado).toBe(true)
    expect(result.statusHttp).toBe(204)
    expect(result.possuiDados).toBe(false)
    expect(result.registrosRecebidos).toBe(0)
    expect(result.totalDeRegistrosInformado).toBe(0)
  })

  it('3. testTradeProConnection lida com erro 401 (token recusado ou erro do backend)', async () => {
    const mock401Error = {
      status: 401,
      data: {
        conectado: false,
        statusHttp: 401,
        possuiDados: false,
        registrosRecebidos: 0,
        totalDeRegistrosInformado: 0,
        tempoRespostaMs: 250,
        mensagem: 'Token inválido ou autenticação recusada.',
      },
    }

    vi.spyOn(pb, 'send').mockRejectedValueOnce(mock401Error)

    const result = await testTradeProConnection('2026-05-01', '2026-05-15')

    expect(result.conectado).toBe(false)
    expect(result.statusHttp).toBe(401)
    expect(result.mensagem).toContain('Token inválido')
  })

  it('4. testTradeProConnection lida com erro de rede ou falha sem expor credenciais', async () => {
    vi.spyOn(pb, 'send').mockRejectedValueOnce(new Error('Network connection failed'))

    const result = await testTradeProConnection('2026-05-01', '2026-05-15')

    expect(result.conectado).toBe(false)
    expect(result.statusHttp).toBe(0)
    expect(result.possuiDados).toBe(false)
    expect(result.mensagem).toContain('Network connection failed')
    expect(typeof result.tempoRespostaMs).toBe('number')
  })

  it('5. Segurança: isTradeProConfigured e getTradeProClient nunca retornam tokens no frontend', () => {
    expect(isTradeProConfigured()).toBe(false)
    expect(getTradeProClient()).toBeNull()
  })

  it('6. fetchTradeProBackendStatus retorna fallback seguro em caso de falha', async () => {
    vi.spyOn(pb, 'send').mockRejectedValueOnce(new Error('Backend offline'))

    const status = await fetchTradeProBackendStatus()
    expect(status.isConfigured).toBe(false)
    expect(status.mode).toBe('shadow')
    expect(status.lastSync).toBeNull()
  })

  it('7. triggerTradeProBackendSync lida com resposta e erros de endpoint', async () => {
    vi.spyOn(pb, 'send').mockResolvedValueOnce({
      success: true,
      message: 'Sincronização em modo shadow iniciada com sucesso.',
      mode: 'shadow',
    })

    const res = await triggerTradeProBackendSync('all')
    expect(res.success).toBe(true)
    expect(res.mode).toBe('shadow')
  })
})
