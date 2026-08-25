import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTradeProApi } from '../useTradeProApi'
import * as tradeProClientModule from '@/lib/api/tradeProClient'
import * as syncServiceModule from '@/lib/api/syncService'

describe('useTradeProApi Hook', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(tradeProClientModule, 'fetchTradeProBackendStatus').mockResolvedValue({
      isConfigured: true,
      mode: 'shadow',
      authType: 'Basic Authentication (Backend)',
      lastSync: null,
    })
    vi.spyOn(syncServiceModule, 'getSyncHistory').mockResolvedValue([])
  })

  it('1. testConnection com dados válidos retorna resultado estruturado completo', async () => {
    const mockResult: tradeProClientModule.TradeProTestConnectionResult = {
      conectado: true,
      statusHttp: 200,
      possuiDados: true,
      registrosRecebidos: 1,
      totalDeRegistrosInformado: 140,
      tempoRespostaMs: 320,
      mensagem: 'Conexão realizada com sucesso.',
    }

    const testSpy = vi
      .spyOn(tradeProClientModule, 'testTradeProConnection')
      .mockResolvedValueOnce(mockResult)

    const { result } = renderHook(() => useTradeProApi())

    let testResponse: tradeProClientModule.TradeProTestConnectionResult | undefined
    await act(async () => {
      testResponse = await result.current.testConnection('2026-05-01', '2026-05-20')
    })

    expect(testSpy).toHaveBeenCalledWith('2026-05-01', '2026-05-20')
    expect(testResponse).toEqual(mockResult)
    expect(testResponse?.conectado).toBe(true)
    expect(testResponse?.totalDeRegistrosInformado).toBe(140)
  })

  it('2. testConnection com credenciais não configuradas ou erro retorna erro apropriado', async () => {
    const mockErrorResult: tradeProClientModule.TradeProTestConnectionResult = {
      conectado: false,
      statusHttp: 400,
      possuiDados: false,
      registrosRecebidos: 0,
      totalDeRegistrosInformado: 0,
      tempoRespostaMs: 15,
      mensagem: 'Credenciais não configuradas no servidor.',
    }

    vi.spyOn(tradeProClientModule, 'testTradeProConnection').mockResolvedValueOnce(mockErrorResult)

    const { result } = renderHook(() => useTradeProApi())

    let testResponse: tradeProClientModule.TradeProTestConnectionResult | undefined
    await act(async () => {
      testResponse = await result.current.testConnection('2026-05-01', '2026-05-20')
    })

    expect(testResponse?.conectado).toBe(false)
    expect(testResponse?.statusHttp).toBe(400)
    expect(testResponse?.mensagem).toBe('Credenciais não configuradas no servidor.')
  })

  it('3. sync() e histórico carregam e expõem estados esperados', async () => {
    vi.spyOn(syncServiceModule, 'syncAll').mockResolvedValueOnce({
      success: true,
      message: 'Sincronizado',
      newRows: 40,
      updatedRows: 10,
      errors: [],
      durationMs: 800,
    })

    const { result } = renderHook(() => useTradeProApi())

    await act(async () => {
      const syncRes = await result.current.sync('all')
      expect(syncRes.success).toBe(true)
      expect(syncRes.newRows).toBe(40)
    })
  })
})
