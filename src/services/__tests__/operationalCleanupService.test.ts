import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getOperationalCleanupStats,
  executeOperationalCleanup,
  listOperationalBackups,
  restoreOperationalBackup,
} from '@/services/operationalCleanupService'
import { pb } from '@/lib/pocketbase/client'

vi.mock('@/lib/pocketbase/client', () => {
  return {
    pb: {
      send: vi.fn(),
      collection: vi.fn(),
      authStore: {
        record: {
          id: 'admin_test_user_id',
          name: 'Admin Teste',
          email: 'admin@diretoria.test',
          role: 'admin',
        },
      },
    },
  }
})

describe('operationalCleanupService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('deve obter estatísticas da massa operacional através do endpoint backend', async () => {
    const mockStats = {
      validades: 120,
      validadesBase: 120,
      validadesImported: 0,
      rupturas: 45,
      operationalCrossEvidence: 12,
      auditoriaPendencias: 3,
      timestamp: new Date().toISOString(),
    }

    vi.mocked(pb.send).mockResolvedValueOnce(mockStats)

    const stats = await getOperationalCleanupStats()
    expect(stats.validades).toBe(120)
    expect(stats.rupturas).toBe(45)
    expect(stats.operationalCrossEvidence).toBe(12)
    expect(pb.send).toHaveBeenCalledWith('/backend/v1/admin/operational-cleanup/stats', {
      method: 'GET',
    })
  })

  it('deve executar limpeza com confirmação explícita "LIMPAR"', async () => {
    const mockResult = {
      success: true,
      message: 'Limpeza operacional executada com sucesso.',
      target: 'all',
      backupCode: 'BKPOP_123456_ABCDEF',
      backupRecordId: 'backup_rec_id_1',
      removed: {
        validades: 120,
        rupturas: 45,
        operationalCrossEvidence: 12,
        auditoriaPendencias: 3,
      },
      dataExecucao: new Date().toISOString(),
    }

    vi.mocked(pb.send).mockResolvedValueOnce(mockResult)

    const result = await executeOperationalCleanup({
      target: 'all',
      confirmText: 'LIMPAR',
      motivo: 'Preparação do piloto histórico',
    })

    expect(result.success).toBe(true)
    expect(result.removed.validades).toBe(120)
    expect(result.removed.rupturas).toBe(45)
    expect(result.backupCode).toBe('BKPOP_123456_ABCDEF')
    expect(pb.send).toHaveBeenCalledWith('/backend/v1/admin/operational-cleanup/execute', {
      method: 'POST',
      body: {
        target: 'all',
        confirmation: true,
        confirmText: 'LIMPAR',
        motivo: 'Preparação do piloto histórico',
      },
    })
  })

  it('deve bloquear se usuário não tiver permissão (erro 403)', async () => {
    vi.mocked(pb.send).mockRejectedValueOnce({
      status: 403,
      data: { error: 'Acesso negado. Apenas administradores podem executar.' },
    })

    await expect(
      executeOperationalCleanup({
        target: 'all',
        confirmText: 'LIMPAR',
      }),
    ).rejects.toThrow(/Acesso negado/)
  })

  it('deve listar e restaurar backups operacionais', async () => {
    const mockBackups = [
      {
        id: 'bk_1',
        backup_code: 'BKPOP_1',
        motivo: 'Preparação',
        executado_por_nome: 'Admin',
        validades_count: 50,
        rupturas_count: 20,
        derived_cross_count: 5,
        status: 'ativo',
        data_criacao: new Date().toISOString(),
      },
    ]

    vi.mocked(pb.collection).mockReturnValueOnce({
      getList: vi.fn().mockResolvedValueOnce({ items: mockBackups }),
    } as any)

    const list = await listOperationalBackups()
    expect(list.length).toBe(1)
    expect(list[0].backup_code).toBe('BKPOP_1')

    vi.mocked(pb.send).mockResolvedValueOnce({
      success: true,
      message: 'Backup operacional restaurado com sucesso.',
    })

    const res = await restoreOperationalBackup('BKPOP_1')
    expect(res.success).toBe(true)
    expect(pb.send).toHaveBeenCalledWith('/backend/v1/admin/operational-cleanup/restore', {
      method: 'POST',
      body: { backupCode: 'BKPOP_1' },
    })
  })
})
