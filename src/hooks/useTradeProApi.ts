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
  requestRupturasPreview,
  startRupturasSync,
  cancelSyncJob,
  findRetryableSyncJob,
  type TradeProTestConnectionResult,
  type SyncJobRecord,
} from '@/lib/api/tradeProClient'
import { DataSourceFactory } from '@/lib/data/dataSourceFactory'

export interface UseTradeProApiReturn {
  isConfigured: boolean
  isSyncing: boolean
  syncProgress: { step: string; percent: number }
  lastSyncResult: SyncResult | null
  syncHistory: SyncLogRecord[]
  isLoadingHistory: boolean
  // Rupturas Sync V2 (Paginada via Jobs)
  rupturasPreviewJob: SyncJobRecord | null
  rupturasPreviewStatus: 'idle' | 'loading' | 'success' | 'empty' | 'error'
  rupturasSyncJob: SyncJobRecord | null
  rupturasSyncStatus: 'idle' | 'syncing' | 'success' | 'paused' | 'error' | 'cancelled'
  retryableJob: SyncJobRecord | null
  retryableJobChecked: boolean
  checkForRetryableJob: (dataInicial: string, dataFinal: string) => Promise<SyncJobRecord | null>
  requestRupturasPreview: (dataInicial: string, dataFinal: string) => Promise<SyncJobRecord>
  startRupturasSync: (jobId: string) => Promise<SyncJobRecord>
  cancelRupturasSync: (jobId: string) => Promise<void>
  resetRupturasSyncState: () => void
  // Métodos legados / compatíveis
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

  // Estados de Sincronização de Rupturas Paginada
  const [rupturasPreviewJob, setRupturasPreviewJob] = useState<SyncJobRecord | null>(null)
  const [rupturasPreviewStatus, setRupturasPreviewStatus] = useState<
    'idle' | 'loading' | 'success' | 'empty' | 'error'
  >('idle')
  const [rupturasSyncJob, setRupturasSyncJob] = useState<SyncJobRecord | null>(null)
  const [rupturasSyncStatus, setRupturasSyncStatus] = useState<
    'idle' | 'syncing' | 'success' | 'paused' | 'error' | 'cancelled'
  >('idle')
  const [retryableJob, setRetryableJob] = useState<SyncJobRecord | null>(null)
  const [retryableJobChecked, setRetryableJobChecked] = useState<boolean>(false)

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

  const checkForRetryableJob = useCallback(
    async (dataInicial: string, dataFinal: string): Promise<SyncJobRecord | null> => {
      try {
        const found = await findRetryableSyncJob(dataInicial, dataFinal)
        setRetryableJob(found)
        setRetryableJobChecked(true)
        return found
      } catch (err) {
        console.error('[useTradeProApi] Erro ao verificar job retryable:', err)
        setRetryableJob(null)
        setRetryableJobChecked(true)
        return null
      }
    },
    [],
  )

  const handleRequestRupturasPreview = useCallback(
    async (dataInicial: string, dataFinal: string): Promise<SyncJobRecord> => {
      setRupturasPreviewStatus('loading')
      try {
        const job = await requestRupturasPreview(dataInicial, dataFinal)
        setRupturasPreviewJob(job)
        if (job.status === 'error') {
          setRupturasPreviewStatus('error')
        } else if (job.total_informado === 0) {
          setRupturasPreviewStatus('empty')
        } else {
          setRupturasPreviewStatus('success')
        }
        return job
      } catch (err) {
        setRupturasPreviewStatus('error')
        throw err
      }
    },
    [],
  )

  const handleStartRupturasSync = useCallback(
    async (jobId: string): Promise<SyncJobRecord> => {
      setRupturasSyncStatus('syncing')
      // Inicializa o job em syncing para feedback imediato no UI antes da primeira resposta do polling
      setRupturasSyncJob((prev) =>
        prev && prev.id === jobId
          ? { ...prev, status: 'syncing' }
          : ({
              id: jobId,
              action: 'sync_rupturas',
              status: 'syncing',
              paginas_processadas: 0,
              paginas_total: rupturasPreviewJob?.paginas_total || 1,
              registros_lidos: 0,
              registros_validos: 0,
              registros_rejeitados: 0,
              registros_consolidados: 0,
              registros_deduplicados: 0,
              total_informado: rupturasPreviewJob?.total_informado || 0,
              date_start: rupturasPreviewJob?.date_start || '',
              date_end: rupturasPreviewJob?.date_end || '',
              message:
                'Preparando a primeira página — nenhuma alteração foi realizada na Base Atual.',
              error_code: '',
              created: new Date().toISOString(),
              updated: new Date().toISOString(),
            } as SyncJobRecord),
      )

      try {
        const finalJob = await startRupturasSync(jobId, (progressJob) => {
          setRupturasSyncJob(progressJob)
          if (progressJob.status === 'paused') {
            setRupturasSyncStatus('paused')
          } else if (progressJob.status === 'cancelled') {
            setRupturasSyncStatus('cancelled')
          } else if (progressJob.status === 'syncing') {
            setRupturasSyncStatus('syncing')
          }
        })

        setRupturasSyncJob(finalJob)
        if (finalJob.status === 'success') {
          setRupturasSyncStatus('success')
          DataSourceFactory.reset()
          window.dispatchEvent(new Event('diretoria:refresh'))
          await refreshHistory()
        } else if (finalJob.status === 'paused') {
          setRupturasSyncStatus('paused')
        } else if (finalJob.status === 'cancelled') {
          setRupturasSyncStatus('cancelled')
        } else {
          setRupturasSyncStatus('error')
        }
        return finalJob
      } catch (err) {
        setRupturasSyncStatus('error')
        throw err
      }
    },
    [refreshHistory],
  )

  const handleCancelRupturasSync = useCallback(
    async (jobId: string): Promise<void> => {
      try {
        await cancelSyncJob(jobId)
        setRupturasSyncStatus('cancelled')
        if (rupturasSyncJob) {
          setRupturasSyncJob({ ...rupturasSyncJob, status: 'cancelled' })
        }
      } catch (err) {
        console.error('[useTradeProApi] Erro ao cancelar sincronização:', err)
        throw err
      }
    },
    [rupturasSyncJob],
  )

  const resetRupturasSyncState = useCallback(() => {
    setRupturasPreviewJob(null)
    setRupturasPreviewStatus('idle')
    setRupturasSyncJob(null)
    setRupturasSyncStatus('idle')
    setRetryableJob(null)
    setRetryableJobChecked(false)
  }, [])

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
    rupturasPreviewJob,
    rupturasPreviewStatus,
    rupturasSyncJob,
    rupturasSyncStatus,
    retryableJob,
    retryableJobChecked,
    checkForRetryableJob,
    requestRupturasPreview: handleRequestRupturasPreview,
    startRupturasSync: handleStartRupturasSync,
    cancelRupturasSync: handleCancelRupturasSync,
    resetRupturasSyncState,
    sync,
    testConnection,
    refreshHistory,
  }
}
