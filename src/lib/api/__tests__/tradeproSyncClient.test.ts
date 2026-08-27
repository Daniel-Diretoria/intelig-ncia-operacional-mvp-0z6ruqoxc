import { describe, it, expect, vi, beforeEach } from 'vitest'
import pb from '@/lib/pocketbase/client'
import {
  requestRupturasPreview,
  startRupturasSync,
  cancelSyncJob,
  type SyncJobRecord,
} from '../tradeProClient'

describe('TradePro Sync Client — Fluxo de Prévia e Sincronização Paginada', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('requestRupturasPreview: cria job de prévia e retorna dados processados', async () => {
    vi.spyOn(pb.authStore, 'record', 'get').mockReturnValue({ id: 'user_123' } as any)

    const mockCreate = vi.fn().mockResolvedValue({ id: 'job_preview_01' })
    const mockGetOne = vi.fn().mockResolvedValue({
      id: 'job_preview_01',
      action: 'sync_rupturas',
      requested_by: 'user_123',
      date_start: '2026-05-01',
      date_end: '2026-05-15',
      status: 'preview',
      total_informado: 383,
      paginas_total: 13,
      paginas_processadas: 0,
      registros_lidos: 0,
      registros_validos: 0,
      registros_rejeitados: 0,
      registros_deduplicados: 0,
      registros_consolidados: 0,
      message: 'Prévia gerada com sucesso.',
      created: '2026-05-15T10:00:00.000Z',
      updated: '2026-05-15T10:00:02.000Z',
    })

    vi.spyOn(pb, 'collection').mockReturnValue({
      create: mockCreate,
      getOne: mockGetOne,
    } as any)

    const result = await requestRupturasPreview('2026-05-01', '2026-05-15')

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'sync_rupturas',
        requested_by: 'user_123',
        date_start: '2026-05-01',
        date_end: '2026-05-15',
        status: 'pending',
      }),
    )
    expect(result.status).toBe('preview')
    expect(result.total_informado).toBe(383)
    expect(result.paginas_total).toBe(13)
  })

  it('requestRupturasPreview: lança erro se usuário não estiver autenticado', async () => {
    vi.spyOn(pb.authStore, 'record', 'get').mockReturnValue(null)
    vi.spyOn(pb.authStore, 'model', 'get').mockReturnValue(null)

    await expect(requestRupturasPreview('2026-05-01', '2026-05-15')).rejects.toThrow(
      /Usuário não autenticado/i,
    )
  })

  it('startRupturasSync: atualiza para syncing e faz polling até status success', async () => {
    const mockUpdate = vi.fn().mockResolvedValue({ id: 'job_sync_01', status: 'syncing' })
    let pollCount = 0
    const mockGetOne = vi.fn().mockImplementation(() => {
      pollCount++
      if (pollCount === 1) {
        return Promise.resolve({
          id: 'job_sync_01',
          action: 'sync_rupturas',
          status: 'syncing',
          paginas_total: 2,
          paginas_processadas: 1,
          registros_lidos: 30,
          registros_validos: 30,
        })
      }
      return Promise.resolve({
        id: 'job_sync_01',
        action: 'sync_rupturas',
        status: 'success',
        paginas_total: 2,
        paginas_processadas: 2,
        registros_lidos: 50,
        registros_validos: 50,
        registros_consolidados: 50,
        message: 'Sincronização de Rupturas concluída com sucesso.',
      })
    })

    vi.spyOn(pb, 'collection').mockReturnValue({
      update: mockUpdate,
      getOne: mockGetOne,
    } as any)

    const onProgress = vi.fn()
    const result = await startRupturasSync('job_sync_01', onProgress)

    expect(mockUpdate).toHaveBeenCalledWith('job_sync_01', {
      status: 'syncing',
      message: 'Sincronização iniciada...',
    })
    expect(onProgress).toHaveBeenCalled()
    expect(result.status).toBe('success')
    expect(result.registros_consolidados).toBe(50)
  })

  it('cancelSyncJob: atualiza job para cancelled', async () => {
    const mockUpdate = vi.fn().mockResolvedValue({ id: 'job_cancel_01' })
    vi.spyOn(pb, 'collection').mockReturnValue({
      update: mockUpdate,
    } as any)

    await cancelSyncJob('job_cancel_01')

    expect(mockUpdate).toHaveBeenCalledWith(
      'job_cancel_01',
      expect.objectContaining({
        status: 'cancelled',
      }),
    )
  })
})
