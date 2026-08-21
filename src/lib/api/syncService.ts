/**
 * Serviço de Sincronização Seguro com a API TradePro.
 *
 * Comunica com o backend seguro via PocketBase hooks.
 * Preserva o histórico de sincronização (sync_logs).
 */
import pb from '@/lib/pocketbase/client'
import { fetchTradeProBackendStatus, triggerTradeProBackendSync } from './tradeProClient'

export interface SyncProgressCallback {
  (step: string, percent: number): void
}

export interface SyncResult {
  success: boolean
  message: string
  tipo?: string
  totalRecebidos?: number
  totalPersistidos?: number
  erros?: string[]
  // Aliases para UI
  totalRows?: number
  newRows?: number
  updatedRows?: number
  durationMs?: number
  type?: string
  errors?: string[]
}

export interface SyncLogRecord {
  id: string
  created: string
  tipo: string
  status: 'success' | 'partial' | 'error' | 'running'
  duracao_ms: number
  total_recebidos: number
  total_persistidos: number
  mensagem_erro?: string
  // Aliases para UI
  total_rows?: number
  new_rows?: number
  updated_rows?: number
  duration_ms?: number
}

export async function syncValidades(onProgress?: SyncProgressCallback): Promise<SyncResult> {
  onProgress?.('Verificando credenciais no servidor...', 20)
  const status = await fetchTradeProBackendStatus()
  if (!status.isConfigured) {
    return {
      success: false,
      message: 'API TradePro não configurada no backend (aguardando credenciais seguras).',
    }
  }

  onProgress?.('Disparando sincronização shadow de validades no backend...', 60)
  const res = await triggerTradeProBackendSync('validades')
  onProgress?.('Concluído', 100)
  return {
    success: res.success,
    message: res.message,
    tipo: 'validades',
    type: 'validades',
    totalRows: 0,
    newRows: 0,
    updatedRows: 0,
    durationMs: 0,
    errors: res.success ? [] : [res.message],
  }
}

export async function syncRupturas(onProgress?: SyncProgressCallback): Promise<SyncResult> {
  onProgress?.('Verificando credenciais no servidor...', 20)
  const status = await fetchTradeProBackendStatus()
  if (!status.isConfigured) {
    return {
      success: false,
      message: 'API TradePro não configurada no backend (aguardando credenciais seguras).',
    }
  }

  onProgress?.('Disparando sincronização shadow de rupturas no backend...', 60)
  const res = await triggerTradeProBackendSync('rupturas')
  onProgress?.('Concluído', 100)
  return {
    success: res.success,
    message: res.message,
    tipo: 'rupturas',
    type: 'rupturas',
    totalRows: 0,
    newRows: 0,
    updatedRows: 0,
    durationMs: 0,
    errors: res.success ? [] : [res.message],
  }
}

export async function syncAll(onProgress?: SyncProgressCallback): Promise<SyncResult> {
  onProgress?.('Verificando credenciais no servidor...', 20)
  const status = await fetchTradeProBackendStatus()
  if (!status.isConfigured) {
    return {
      success: false,
      message: 'API TradePro não configurada no backend (aguardando credenciais seguras).',
    }
  }

  onProgress?.('Disparando sincronização shadow completa no backend...', 60)
  const res = await triggerTradeProBackendSync('all')
  onProgress?.('Concluído', 100)
  return {
    success: res.success,
    message: res.message,
    tipo: 'all',
    type: 'all',
    totalRows: 0,
    newRows: 0,
    updatedRows: 0,
    durationMs: 0,
    errors: res.success ? [] : [res.message],
  }
}

export async function getSyncHistory(limit = 20): Promise<SyncLogRecord[]> {
  try {
    const records = await pb.collection('sync_logs').getList(1, limit, {
      sort: '-created',
    })
    return records.items.map((item) => {
      const r = item as unknown as Record<string, unknown>
      const dur = Number(r.duracao_ms || 0)
      const rec = Number(r.total_recebidos || 0)
      const per = Number(r.total_persistidos || 0)
      return {
        id: String(r.id || ''),
        created: String(r.created || ''),
        tipo: String(r.tipo || 'all'),
        status: (r.status as SyncLogRecord['status']) || 'success',
        duracao_ms: dur,
        total_recebidos: rec,
        total_persistidos: per,
        mensagem_erro: (r.mensagem_erro as string) || undefined,
        total_rows: rec,
        new_rows: per,
        updated_rows: 0,
        duration_ms: dur,
      }
    })
  } catch {
    return []
  }
}
