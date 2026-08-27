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

  it('4. requestRupturasPreview e startRupturasSync controlam os estados de prévia e sync', async () => {
    const mockPreviewJob: tradeProClientModule.SyncJobRecord = {
      id: 'job_1',
      action: 'sync_rupturas',
      requested_by: 'user_1',
      date_start: '2026-05-01',
      date_end: '2026-05-15',
      status: 'preview',
      total_informado: 120,
      paginas_total: 4,
      paginas_processadas: 0,
      registros_lidos: 0,
      registros_validos: 0,
      registros_rejeitados: 0,
      registros_deduplicados: 0,
      registros_consolidados: 0,
      message: 'Prévia gerada com sucesso.',
      created: '',
      updated: '',
    }

    const mockSyncJob: tradeProClientModule.SyncJobRecord = {
      ...mockPreviewJob,
      status: 'success',
      paginas_processadas: 4,
      registros_lidos: 120,
      registros_validos: 120,
      registros_consolidados: 120,
    }

    vi.spyOn(tradeProClientModule, 'requestRupturasPreview').mockResolvedValueOnce(mockPreviewJob)
    vi.spyOn(tradeProClientModule, 'startRupturasSync').mockResolvedValueOnce(mockSyncJob)

    const { result } = renderHook(() => useTradeProApi())

    await act(async () => {
      const pJob = await result.current.requestRupturasPreview('2026-05-01', '2026-05-15')
      expect(pJob.total_informado).toBe(120)
    })

    expect(result.current.rupturasPreviewStatus).toBe('success')
    expect(result.current.rupturasPreviewJob?.total_informado).toBe(120)

    await act(async () => {
      const sJob = await result.current.startRupturasSync('job_1')
      expect(sJob.status).toBe('success')
    })

    expect(result.current.rupturasSyncStatus).toBe('success')
    expect(result.current.rupturasSyncJob?.registros_consolidados).toBe(120)
  })

  it('5. checkForRetryableJob busca job interrompido e atualiza retryableJob e retryableJobChecked', async () => {
    const mockRetryable: tradeProClientModule.SyncJobRecord = {
      id: '6f9hdu5t35895jo',
      action: 'sync_rupturas',
      requested_by: 'user_1',
      date_start: '2026-08-26',
      date_end: '2026-08-26',
      status: 'error',
      total_informado: 383,
      paginas_total: 13,
      paginas_processadas: 8,
      registros_lidos: 240,
      registros_validos: 240,
      registros_rejeitados: 0,
      registros_deduplicados: 0,
      registros_consolidados: 0,
      message: 'Falha na promoção',
      created: '',
      updated: '',
    }

    vi.spyOn(tradeProClientModule, 'findRetryableSyncJob').mockResolvedValueOnce(mockRetryable)

    const { result } = renderHook(() => useTradeProApi())

    expect(result.current.retryableJob).toBeNull()
    expect(result.current.retryableJobChecked).toBe(false)

    await act(async () => {
      const found = await result.current.checkForRetryableJob('2026-08-26', '2026-08-26')
      expect(found?.id).toBe('6f9hdu5t35895jo')
    })

    expect(result.current.retryableJob?.id).toBe('6f9hdu5t35895jo')
    expect(result.current.retryableJob?.paginas_processadas).toBe(8)
    expect(result.current.retryableJobChecked).toBe(true)

    act(() => {
      result.current.resetRupturasSyncState()
    })

    expect(result.current.retryableJob).toBeNull()
    expect(result.current.retryableJobChecked).toBe(false)
  })
})
