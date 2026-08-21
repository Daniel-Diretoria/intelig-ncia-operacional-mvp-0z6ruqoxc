/**
 * Cliente da API TradePro - Camada de integração segura.
 *
 * REGRAS DE SEGURANÇA E ARQUITETURA:
 * - Credenciais e tokens residem ESTRITAMENTE no backend ($os.getenv)
 * - Frontend NUNCA carrega tokens ou Basic Auth em bundle, localStorage ou logs
 * - Frontend apenas consulta o status do backend via pb.send('/api/backend/v1/tradepro/status')
 * - Modo SHADOW: grava em staging e não substitui Excel nem Base Atual sem aprovação
 */
import pb from '@/lib/pocketbase/client'

export interface TradeProStatus {
  isConfigured: boolean
  mode: string
  authType: string
  lastSync?: {
    id: string
    tipo: string
    status: string
    created: string
    totalRecebidos: number
    totalPersistidos: number
  } | null
}

/**
 * Consulta status de configuração segura da API TradePro no backend.
 */
export async function fetchTradeProBackendStatus(): Promise<TradeProStatus> {
  try {
    const res = await pb.send('/api/backend/v1/tradepro/status', {
      method: 'GET',
    })
    return res as TradeProStatus
  } catch {
    return {
      isConfigured: false,
      mode: 'shadow',
      authType: 'Basic Authentication (Backend)',
      lastSync: null,
    }
  }
}

/**
 * Dispara sincronização com o backend (quando configurado no servidor).
 */
export async function triggerTradeProBackendSync(
  tipo: 'validades' | 'rupturas' | 'all' = 'all',
): Promise<{
  success: boolean
  message: string
  mode?: string
}> {
  try {
    const res = await pb.send('/api/backend/v1/tradepro/sync', {
      method: 'POST',
      body: { tipo },
    })
    return res as { success: boolean; message: string; mode?: string }
  } catch (err) {
    const e = err as { message?: string; response?: { error?: string; message?: string } }
    return {
      success: false,
      message:
        e.response?.error ||
        e.response?.message ||
        e.message ||
        'Falha ao iniciar sincronização no backend.',
    }
  }
}

/**
 * Verifica se a API TradePro está configurada (compatibilidade síncrona / estado inicial).
 */
export function isTradeProConfigured(): boolean {
  return false
}

export function getTradeProClient() {
  return null
}
