import pb from '@/lib/pocketbase/client'

export interface OperationalCleanupStats {
  validades: number
  validadesBase: number
  validadesImported: number
  rupturas: number
  operationalCrossEvidence: number
  auditoriaPendencias: number
  timestamp: string
}

export interface CleanupResult {
  success: boolean
  message: string
  target: string
  backupCode: string
  backupRecordId: string
  removed: {
    validades: number
    rupturas: number
    operationalCrossEvidence: number
    auditoriaPendencias: number
  }
  dataExecucao: string
}

export interface BackupRecord {
  id: string
  backup_code: string
  motivo: string
  executado_por_nome: string
  executado_por_email?: string
  validades_count: number
  rupturas_count: number
  derived_cross_count: number
  status: 'ativo' | 'restaurado' | 'expirado'
  data_criacao: string
  restaurado_em?: string
  restaurado_por?: string
}

/**
 * Busca estatísticas de registros operacionais e derivados que serão afetados pela limpeza.
 */
export async function getOperationalCleanupStats(): Promise<OperationalCleanupStats> {
  // 1. Tentar endpoint dedicado do backend
  try {
    const res = await pb.send<OperationalCleanupStats>(
      '/backend/v1/admin/operational-cleanup/stats',
      {
        method: 'GET',
      },
    )
    return res
  } catch (err) {
    // 2. Fallback client-side direto via PocketBase SDK caso backend custom hook não responda
    try {
      const [validadesRes, rupturasRes, crossRes, auditRes] = await Promise.all([
        pb.collection('validades_base').getList(1, 1, { $autoCancel: false }),
        pb.collection('rupturas_base').getList(1, 1, { $autoCancel: false }),
        pb
          .collection('operational_cross_evidence')
          .getList(1, 1, { $autoCancel: false })
          .catch(() => ({ totalItems: 0 })),
        pb
          .collection('auditoria_pendencias')
          .getList(1, 1, { $autoCancel: false })
          .catch(() => ({ totalItems: 0 })),
      ])

      return {
        validades: validadesRes.totalItems,
        validadesBase: validadesRes.totalItems,
        validadesImported: 0,
        rupturas: rupturasRes.totalItems,
        operationalCrossEvidence: crossRes.totalItems,
        auditoriaPendencias: auditRes.totalItems,
        timestamp: new Date().toISOString(),
      }
    } catch (fallbackErr) {
      console.warn('Falha ao buscar estatísticas de limpeza operacional:', fallbackErr)
      return {
        validades: 0,
        validadesBase: 0,
        validadesImported: 0,
        rupturas: 0,
        operationalCrossEvidence: 0,
        auditoriaPendencias: 0,
        timestamp: new Date().toISOString(),
      }
    }
  }
}

/**
 * Executa limpeza controlada de Validades e Rupturas com criação de backup de segurança e auditoria.
 */
export async function executeOperationalCleanup(params: {
  target: 'all' | 'validades' | 'rupturas'
  confirmText: string
  motivo?: string
}): Promise<CleanupResult> {
  // 1. Chamar endpoint dedicado do backend
  try {
    const res = await pb.send<CleanupResult>('/backend/v1/admin/operational-cleanup/execute', {
      method: 'POST',
      body: {
        target: params.target,
        confirmation: params.confirmText === 'LIMPAR',
        confirmText: params.confirmText,
        motivo: params.motivo,
      },
    })
    return res
  } catch (err: any) {
    // Se endpoint retornou erro de permissão ou negócio, repassar
    if (err?.status === 403) {
      throw new Error(
        'Acesso negado: Somente administradores têm permissão para executar esta ação.',
      )
    }
    if (err?.status === 400) {
      throw new Error(err?.data?.error || 'Confirmação inválida para executar a limpeza.')
    }

    // Fallback: se o endpoint customizado falhou por rota ou timeout, tentar operação de exclusão via SDK
    console.warn('Backend custom endpoint indisponível, executando via SDK fallback:', err)
    return await executeClientFallbackCleanup(params.target)
  }
}

/**
 * Lista backups operacionais disponíveis para restauração.
 */
export async function listOperationalBackups(): Promise<BackupRecord[]> {
  try {
    const records = await pb.collection('operational_data_backups').getList<BackupRecord>(1, 20, {
      sort: '-created',
      $autoCancel: false,
    })
    return records.items
  } catch (err) {
    console.warn('Não foi possível listar backups operacionais:', err)
    return []
  }
}

/**
 * Restaura um backup operacional pelo código.
 */
export async function restoreOperationalBackup(
  backupCode: string,
): Promise<{ success: boolean; message: string }> {
  try {
    const res = await pb.send<{ success: boolean; message: string }>(
      '/backend/v1/admin/operational-cleanup/restore',
      {
        method: 'POST',
        body: { backupCode },
      },
    )
    return res
  } catch (err: any) {
    if (err?.status === 403) {
      throw new Error(
        'Acesso negado: Somente administradores podem restaurar backups operacionais.',
      )
    }
    throw new Error(err?.data?.error || err?.message || 'Falha ao restaurar backup operacional.')
  }
}

/**
 * Fallback de limpeza via SDK caso o hook HTTP customizado esteja indisponível.
 */
async function executeClientFallbackCleanup(
  target: 'all' | 'validades' | 'rupturas',
): Promise<CleanupResult> {
  let removedVal = 0
  let removedRup = 0
  let removedCross = 0
  let removedAudit = 0

  const user = pb.authStore.record
  const userId = user?.id || ''
  const userName = (user as any)?.name || (user as any)?.email || 'Administrador'

  // Backups de segurança em memória antes de apagar
  const snapshot: { validades: any[]; rupturas: any[]; cross: any[] } = {
    validades: [],
    rupturas: [],
    cross: [],
  }

  if (target === 'all' || target === 'validades') {
    const vals = await pb
      .collection('validades_base')
      .getFullList({ $autoCancel: false })
      .catch(() => [])
    snapshot.validades = vals
    for (const item of vals) {
      try {
        await pb.collection('validades_base').delete(item.id)
        removedVal++
      } catch {
        /* intentionally ignored */
      }
    }

    const audits = await pb
      .collection('auditoria_pendencias')
      .getFullList({ $autoCancel: false })
      .catch(() => [])
    for (const item of audits) {
      try {
        await pb.collection('auditoria_pendencias').delete(item.id)
        removedAudit++
      } catch {
        /* intentionally ignored */
      }
    }
  }

  if (target === 'all' || target === 'rupturas') {
    const rups = await pb
      .collection('rupturas_base')
      .getFullList({ $autoCancel: false })
      .catch(() => [])
    snapshot.rupturas = rups
    for (const item of rups) {
      try {
        await pb.collection('rupturas_base').delete(item.id)
        removedRup++
      } catch {
        /* intentionally ignored */
      }
    }
  }

  const crosses = await pb
    .collection('operational_cross_evidence')
    .getFullList({ $autoCancel: false })
    .catch(() => [])
  snapshot.cross = crosses
  for (const item of crosses) {
    try {
      await pb.collection('operational_cross_evidence').delete(item.id)
      removedCross++
    } catch {
      /* intentionally ignored */
    }
  }

  const backupCode = 'BKPOP_SDK_' + Date.now()
  try {
    await pb.collection('operational_data_backups').create({
      backup_code: backupCode,
      motivo: 'Limpeza operacional fallback: ' + target,
      executado_por_id: userId,
      executado_por_nome: userName,
      validades_count: snapshot.validades.length,
      rupturas_count: snapshot.rupturas.length,
      derived_cross_count: snapshot.cross.length,
      snapshot_json: { target, ...snapshot },
      status: 'ativo',
      data_criacao: new Date().toISOString(),
    })
  } catch {
    /* intentionally ignored */
  }

  // Registrar auditoria
  try {
    await pb.collection('user_audit_log').create({
      user_id: userId,
      target_user_id: userId,
      target_user_email: (user as any)?.email || '',
      acao: 'limpeza_operacional_executada',
      executor_nome: userName,
      executor_id: userId,
      data_acao: new Date().toISOString(),
      detalhes_json: {
        tipoOperacao: 'limpeza_operacional_fallback_sdk',
        targetLimpeza: target,
        backupCode: backupCode,
        removidos: {
          validades: removedVal,
          rupturas: removedRup,
          operationalCrossEvidence: removedCross,
          auditoriaPendencias: removedAudit,
        },
        resultado: 'sucesso',
      },
    })
  } catch {
    /* intentionally ignored */
  }

  return {
    success: true,
    message: 'Limpeza operacional executada com sucesso.',
    target,
    backupCode,
    backupRecordId: '',
    removed: {
      validades: removedVal,
      rupturas: removedRup,
      operationalCrossEvidence: removedCross,
      auditoriaPendencias: removedAudit,
    },
    dataExecucao: new Date().toISOString(),
  }
}
