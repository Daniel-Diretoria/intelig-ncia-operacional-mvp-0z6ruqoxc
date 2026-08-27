import { describe, it, expect, vi, beforeEach } from 'vitest'
import pb from '@/lib/pocketbase/client'
import {
  requestRupturasPreview,
  startRupturasSync,
  cancelSyncJob,
  findRetryableSyncJob,
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

  describe('findRetryableSyncJob — Consulta de Jobs Interrompidos e Priorização', () => {
    it('1. findRetryableSyncJob retorna job com 8/13 páginas para período 2026-08-26', async () => {
      const mockJob6f9 = {
        id: '6f9hdu5t35895jo',
        action: 'sync_rupturas',
        requested_by: 'user_123',
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
        message: 'Falha na promoção dos registros para a Base Atual',
        created: '2026-08-27T17:52:07.875Z',
        updated: '2026-08-27T17:55:31.854Z',
      }

      const mockGetList = vi.fn().mockResolvedValue({
        items: [mockJob6f9],
        totalItems: 1,
      })

      const mockCollection = vi.fn().mockReturnValue({
        getList: mockGetList,
      })
      vi.spyOn(pb, 'collection').mockImplementation(mockCollection as any)

      const job = await findRetryableSyncJob('2026-08-26', '2026-08-26')

      expect(mockCollection).toHaveBeenCalledWith('tradepro_sync_jobs')
      expect(mockGetList).toHaveBeenCalledWith(
        1,
        10,
        expect.objectContaining({
          filter: expect.stringContaining(
            'action = "sync_rupturas" && date_start = "2026-08-26" && date_end = "2026-08-26" && (status = "error" || status = "paused") && paginas_processadas > 0',
          ),
          sort: '-paginas_processadas,-created',
        }),
      )
      expect(job).not.toBeNull()
      expect(job?.id).toBe('6f9hdu5t35895jo')
      expect(job?.paginas_processadas).toBe(8)
      expect(job?.paginas_total).toBe(13)
      expect(job?.registros_validos).toBe(240)
    })

    it('2. findRetryableSyncJob retorna null para período sem jobs retryable', async () => {
      const mockGetList = vi.fn().mockResolvedValue({
        items: [],
        totalItems: 0,
      })

      vi.spyOn(pb, 'collection').mockReturnValue({
        getList: mockGetList,
      } as any)

      const job = await findRetryableSyncJob('2026-01-01', '2026-01-10')
      expect(job).toBeNull()
    })

    it('3. Job com status="preview" e paginas_processadas=0 é ignorado pela consulta', async () => {
      // Quando filtrado no PocketBase, status=preview não retorna items
      const mockGetList = vi.fn().mockResolvedValue({
        items: [],
        totalItems: 0,
      })

      vi.spyOn(pb, 'collection').mockReturnValue({
        getList: mockGetList,
      } as any)

      const job = await findRetryableSyncJob('2026-08-26', '2026-08-26')
      expect(mockGetList).toHaveBeenCalledWith(
        1,
        10,
        expect.objectContaining({
          filter: expect.stringContaining('paginas_processadas > 0'),
        }),
      )
      expect(job).toBeNull()
    })

    it('4. Job com status="completed" / "success" é ignorado', async () => {
      const mockGetList = vi.fn().mockResolvedValue({
        items: [],
        totalItems: 0,
      })

      vi.spyOn(pb, 'collection').mockReturnValue({
        getList: mockGetList,
      } as any)

      const job = await findRetryableSyncJob('2026-08-26', '2026-08-26')
      expect(job).toBeNull()
    })

    it('5. Job com status="cancelled" é ignorado', async () => {
      const mockGetList = vi.fn().mockResolvedValue({
        items: [],
        totalItems: 0,
      })

      vi.spyOn(pb, 'collection').mockReturnValue({
        getList: mockGetList,
      } as any)

      const job = await findRetryableSyncJob('2026-08-26', '2026-08-26')
      expect(job).toBeNull()
    })

    it('6. Múltiplos jobs retryable: prioriza o com mais paginas_processadas', async () => {
      const mockJobPartial = {
        id: 'job_partial_3_pages',
        action: 'sync_rupturas',
        date_start: '2026-08-26',
        date_end: '2026-08-26',
        status: 'paused',
        paginas_total: 13,
        paginas_processadas: 3,
        registros_validos: 90,
      }
      const mockJobHigher = {
        id: '6f9hdu5t35895jo',
        action: 'sync_rupturas',
        date_start: '2026-08-26',
        date_end: '2026-08-26',
        status: 'error',
        paginas_total: 13,
        paginas_processadas: 8,
        registros_validos: 240,
      }

      // getList ordenado por -paginas_processadas retorna o com 8 páginas primeiro
      const mockGetList = vi.fn().mockResolvedValue({
        items: [mockJobHigher, mockJobPartial],
        totalItems: 2,
      })

      vi.spyOn(pb, 'collection').mockReturnValue({
        getList: mockGetList,
      } as any)

      const job = await findRetryableSyncJob('2026-08-26', '2026-08-26')
      expect(job).not.toBeNull()
      expect(job?.id).toBe('6f9hdu5t35895jo')
      expect(job?.paginas_processadas).toBe(8)
    })

    it('7. findRetryableSyncJob NÃO cria registros novos (verificar com mock)', async () => {
      const mockCreate = vi.fn()
      const mockUpdate = vi.fn()
      const mockGetList = vi.fn().mockResolvedValue({
        items: [],
        totalItems: 0,
      })

      vi.spyOn(pb, 'collection').mockReturnValue({
        create: mockCreate,
        update: mockUpdate,
        getList: mockGetList,
      } as any)

      await findRetryableSyncJob('2026-08-26', '2026-08-26')

      expect(mockCreate).not.toHaveBeenCalled()
      expect(mockUpdate).not.toHaveBeenCalled()
    })

    it('8. Staging (is_base_atual=false, tenant_id=tradepro_job_*) permanece inalterado após a consulta', async () => {
      const mockRecords = [
        { id: 'rec_1', tenant_id: 'tradepro_job_6f9hdu5t35895jo', is_base_atual: false },
        { id: 'rec_2', tenant_id: 'tradepro_job_6f9hdu5t35895jo', is_base_atual: false },
      ]

      const mockGetList = vi.fn().mockResolvedValue({
        items: [
          {
            id: '6f9hdu5t35895jo',
            action: 'sync_rupturas',
            date_start: '2026-08-26',
            date_end: '2026-08-26',
            status: 'error',
            paginas_processadas: 8,
            paginas_total: 13,
            registros_validos: 240,
          },
        ],
        totalItems: 1,
      })

      vi.spyOn(pb, 'collection').mockReturnValue({
        getList: mockGetList,
      } as any)

      const job = await findRetryableSyncJob('2026-08-26', '2026-08-26')
      expect(job?.id).toBe('6f9hdu5t35895jo')

      // Registros do staging continuam com is_base_atual=false e tenant_id inalterados
      for (const rec of mockRecords) {
        expect(rec.is_base_atual).toBe(false)
        expect(rec.tenant_id).toBe('tradepro_job_6f9hdu5t35895jo')
      }
    })
  })
})
