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
  requestValidadesPreview,
  startRupturasSync,
  startValidadesSync,
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
  // Validades Sync V2 (Paginada via Jobs)
  validadesPreviewJob: SyncJobRecord | null
  validadesPreviewStatus: 'idle' | 'loading' | 'success' | 'empty' | 'error'
  validadesSyncJob: SyncJobRecord | null
  validadesSyncStatus: 'idle' | 'syncing' | 'success' | 'paused' | 'error' | 'cancelled'
  retryableValidadesJob: SyncJobRecord | null
  retryableValidadesJobChecked: boolean
  checkForRetryableValidadesJob: (
    dataInicial: string,
    dataFinal: string,
  ) => Promise<SyncJobRecord | null>
  requestValidadesPreview: (dataInicial: string, dataFinal: string) => Promise<SyncJobRecord>
  startValidadesSync: (jobId?: string) => Promise<SyncJobRecord>
  cancelValidadesSync: (jobId?: string) => Promise<void>
  resetValidadesSyncState: () => void
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

  const resetValidadesSyncState = useCallback(() => {
    setValidadesPreviewJob(null)
    setValidadesPreviewStatus('idle')
    setValidadesSyncJob(null)
    setValidadesSyncStatus('idle')
    setRetryableValidadesJob(null)
    setRetryableValidadesJobChecked(false)
  }, [])

  const checkForRetryableValidadesJob = useCallback(
    async (dataInicial: string, dataFinal: string): Promise<SyncJobRecord | null> => {
      setRetryableValidadesJobChecked(true)
      const job = await findRetryableSyncJob(dataInicial, dataFinal, 'sync_validades')
      setRetryableValidadesJob(job)
      return job
    },
    [],
  )

  const handleRequestValidadesPreview = useCallback(
    async (dataInicial: string, dataFinal: string): Promise<SyncJobRecord> => {
      setValidadesPreviewStatus('loading')
      try {
        const job = await requestValidadesPreview(dataInicial, dataFinal)
        setValidadesPreviewJob(job)
        if (job.status === 'error') {
          setValidadesPreviewStatus('error')
        } else if (job.total_informado === 0) {
          setValidadesPreviewStatus('empty')
        } else {
          setValidadesPreviewStatus('success')
        }
        return job
      } catch (err) {
        setValidadesPreviewStatus('error')
        throw err
      }
    },
    [],
  )

  const handleStartValidadesSync = useCallback(
    async (jobIdParam?: string): Promise<SyncJobRecord> => {
      const activeJobId =
        jobIdParam || validadesPreviewJob?.id || validadesSyncJob?.id || retryableValidadesJob?.id
      if (!activeJobId) {
        throw new Error('Nenhum job de validades disponível para iniciar a sincronização.')
      }

      setValidadesSyncStatus('syncing')
      setIsSyncing(true)
      setRetryableValidadesJob(null)

      try {
        const finalJob = await startValidadesSync(activeJobId, (updatedJob) => {
          setValidadesSyncJob(updatedJob)
        })

        setValidadesSyncJob(finalJob)

        if (finalJob.status === 'success') {
          setValidadesSyncStatus('success')
          DataSourceFactory.reset()
          window.dispatchEvent(new Event('diretoria:refresh'))
        } else if (finalJob.status === 'paused') {
          setValidadesSyncStatus('paused')
        } else if (finalJob.status === 'cancelled') {
          setValidadesSyncStatus('cancelled')
        } else {
          setValidadesSyncStatus('error')
        }

        return finalJob
      } catch (err) {
        setValidadesSyncStatus('error')
        throw err
      } finally {
        setIsSyncing(false)
      }
    },
    [validadesSyncJob],
  )

  const handleCancelValidadesSync = useCallback(
    async (jobIdParam?: string): Promise<void> => {
      const targetJobId =
        jobIdParam || validadesSyncJob?.id || validadesPreviewJob?.id || retryableValidadesJob?.id
      if (!targetJobId) return
      try {
        await cancelSyncJob(targetJobId)
        setValidadesSyncStatus('cancelled')
      } catch (err) {
        console.error('[useTradeProApi] Erro ao cancelar sincronização de validades:', err)
        throw err
      }
    },
    [validadesSyncJob],
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
    validadesPreviewJob,
    validadesPreviewStatus,
    validadesSyncJob,
    validadesSyncStatus,
    retryableValidadesJob,
    retryableValidadesJobChecked,
    checkForRetryableValidadesJob,
    requestValidadesPreview: handleRequestValidadesPreview,
    startValidadesSync: handleStartValidadesSync,
    cancelValidadesSync: handleCancelValidadesSync,
    resetValidadesSyncState,
    sync,
    testConnection,
    refreshHistory,
  }
}
