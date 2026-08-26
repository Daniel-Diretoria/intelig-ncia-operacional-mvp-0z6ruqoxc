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
import {
  fetchTradeProBackendStatus,
  testTradeProConnection,
  type TradeProTestConnectionResult,
} from '@/lib/api/tradeProClient'
import { DataSourceFactory } from '@/lib/data/dataSourceFactory'

export interface UseTradeProApiReturn {
  isConfigured: boolean
  isSyncing: boolean
  syncProgress: { step: string; percent: number }
  lastSyncResult: SyncResult | null
  syncHistory: SyncLogRecord[]
  isLoadingHistory: boolean
  sync: (type?: 'validades' | 'rupturas' | 'all') => Promise<SyncResult>
  testConnection: (dataInicial: string, dataFinal: string) => Promise<TradeProTestConnectionResult>
  refreshHistory: () => Promise<void>
}

export function useTradeProApi(): UseTradeProApiReturn {
  const [isConfigured, setIsConfigured] = useState<boolean>(false)
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
      const [status, logs] = await Promise.all([fetchTradeProBackendStatus(), getSyncHistory(20)])
      setIsConfigured(status.isConfigured)
      setSyncHistory(logs)
    } catch (err) {
      console.error('[useTradeProApi] Erro ao carregar histórico:', err)
    } finally {
      setIsLoadingHistory(false)
    }
  }, [])

  useEffect(() => {
    refreshHistory()
  }, [refreshHistory])

  const testConnection = useCallback(
    async (dataInicial: string, dataFinal: string): Promise<TradeProTestConnectionResult> => {
      // AbortController com timeout de 30 segundos para segurança
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000)

      try {
        const result = await testTradeProConnection(dataInicial, dataFinal)
        await refreshHistory()
        return result
      } finally {
        clearTimeout(timeoutId)
      }
    },
    [refreshHistory],
  )

  const sync = useCallback(
    async (type: 'validades' | 'rupturas' | 'all' = 'all'): Promise<SyncResult> => {
      setIsSyncing(true)
      setSyncProgress({ step: 'Iniciando sincronização no backend...', percent: 0 })

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
