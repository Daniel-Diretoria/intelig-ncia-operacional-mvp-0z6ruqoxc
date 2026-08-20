import { useState, useCallback, useEffect } from 'react'
import {
  syncValidades,
  syncRupturas,
  syncAll,
  getSyncHistory,
  type SyncResult,
  type SyncLogRecord,
  type SyncProgressCallback,
} from '@/lib/api/syncService'
import { isTradeProConfigured, getTradeProClient } from '@/lib/api/tradeProClient'
import { DataSourceFactory } from '@/lib/data/dataSourceFactory'

export interface UseTradeProApiReturn {
  isConfigured: boolean
  isSyncing: boolean
  syncProgress: { step: string; percent: number }
  lastSyncResult: SyncResult | null
  syncHistory: SyncLogRecord[]
  isLoadingHistory: boolean
  sync: (type?: 'validades' | 'rupturas' | 'all') => Promise<SyncResult>
  testConnection: () => Promise<{ success: boolean; message: string; latencyMs: number }>
  refreshHistory: () => Promise<void>
}

export function useTradeProApi(): UseTradeProApiReturn {
  const [isConfigured, setIsConfigured] = useState<boolean>(() => isTradeProConfigured())
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncProgress, setSyncProgress] = useState<{ step: string; percent: number }>({
    step: '',
    percent: 0,
  })
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null)
  const [syncHistory, setSyncHistory] = useState<SyncLogRecord[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)

  const refreshHistory = useCallback(async () => {
    setIsLoadingHistory(true)
    try {
      const logs = await getSyncHistory(20)
      setSyncHistory(logs)
    } catch (err) {
      console.error('[useTradeProApi] Erro ao carregar histórico:', err)
    } finally {
      setIsLoadingHistory(false)
    }
  }, [])

  useEffect(() => {
    setIsConfigured(isTradeProConfigured())
    refreshHistory()
  }, [refreshHistory])

  const testConnection = useCallback(async () => {
    const client = getTradeProClient()
    if (!client) {
      return {
        success: false,
        message:
          'Variáveis de ambiente VITE_TRADEPRO_API_URL e VITE_TRADEPRO_API_TOKEN não configuradas.',
        latencyMs: 0,
      }
    }
    return client.testConnection()
  }, [])

  const sync = useCallback(
    async (type: 'validades' | 'rupturas' | 'all' = 'all'): Promise<SyncResult> => {
      setIsSyncing(true)
      setSyncProgress({ step: 'Iniciando sincronização...', percent: 0 })

      const handleProgress: SyncProgressCallback = (step, percent) => {
        setSyncProgress({ step, percent })
      }

      try {
        let result: SyncResult
        if (type === 'validades') {
          result = await syncValidades(handleProgress)
        } else if (type === 'rupturas') {
          result = await syncRupturas(handleProgress)
        } else {
          result = await syncAll(handleProgress)
        }

        setLastSyncResult(result)
        await refreshHistory()

        // Notifica outros módulos da aplicação para atualizarem dados da Base Atual
        DataSourceFactory.reset()
        window.dispatchEvent(new Event('diretoria:refresh'))

        return result
      } finally {
        setIsSyncing(false)
        setSyncProgress({ step: '', percent: 0 })
      }
    },
    [refreshHistory],
  )

  return {
    isConfigured,
    isSyncing,
    syncProgress,
    lastSyncResult,
    syncHistory,
    isLoadingHistory,
    sync,
    testConnection,
    refreshHistory,
  }
}
