import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  X,
  Download,
  History,
  Loader2,
  ArrowRight,
  Info,
  FileUp,
  Database,
  Check,
  Table2,
  Layers,
  Filter,
  GitMerge,
  ShieldAlert,
  Cloud,
  RefreshCw,
  Zap,
  Activity,
  Server,
  KeyRound,
  CheckCircle,
  Clock,
  GitCompare,
  CalendarCheck,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { AlertBanner } from '@/components/ui/alert-banner'
import { EmptyState } from '@/components/ui/empty-state'
import { Modal } from '@/components/ui/modal'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'
import { useTradeProApi } from '@/hooks/useTradeProApi'
import type { TradeProTestConnectionResult } from '@/lib/api/tradeProClient'
import { cn } from '@/lib/utils'
import {
  parseExcelFile,
  validateStructure,
  suggestMapping,
  validateDataset,
  mapRecords,
  detectRupturaFile,
  EXPECTED_COLUMNS,
  REQUIRED_COLUMNS,
  type ColumnMapping,
  type DatasetValidationReport,
} from '@/lib/import'
import { resolveStoreMatch } from '@/lib/data/storeRecognition'
import {
  submitProcessValidades,
  checkFileHash,
  reconcileImportState,
  type ImportProgressState,
  type ImportReconciliation,
} from '@/lib/import/importClient'
import { exportErrorsCSV, exportErrorsXLSX } from '@/lib/export/errorReportExport'
import {
  downloadHistoricoImportacoesXLSX,
  downloadHistoricoImportacoesCSV,
} from '@/lib/export/operationalExports'
import { getBaseAtualSnapshot } from '@/lib/selectors/baseAtualSelectors'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { PersistenceTaskError } from '@/lib/import/persistenceQueue'
import {
  executarPipeline,
  calcularHashArquivo,
  type PipelineResult,
  toRawRecord,
} from '@/lib/data/tradeProPipeline'
import {
  parseRupturasExcel,
  validateRupturasRows,
  processRupturasImport,
  type ParsedRupturaRow,
} from '@/lib/pipeline/rupturasPipeline'
import { useImportHistory } from '@/services'
import type { ValidadeItem, RupturasImportResult } from '@/types'
import pb from '@/lib/pocketbase/client'

interface FileInfo {
  name: string
  size: number
  selectedAt: string
  hash?: string
  declaredPhysicalRows?: number
  usefulRows?: number
  ignoredBlankRows?: number
}

type ImportType = 'validades' | 'rupturas'
type Stage = 'idle' | 'parsed' | 'validated' | 'importing' | 'done'

const fmtBytes = (bytes: number): string => {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

const fmtDate = (iso: string): string => {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

const statusBadgeClass = (status: string): string => {
  switch (status) {
    case 'completed':
    case 'success':
      return 'bg-emerald-100 text-emerald-700 border-emerald-200'
    case 'processing':
    case 'partial':
      return 'bg-blue-100 text-blue-700 border-blue-200'
    case 'failed':
    case 'error':
      return 'bg-red-100 text-red-700 border-red-200'
    case 'pending':
    default:
      return 'bg-slate-100 text-slate-600 border-slate-200'
  }
}

const statusLabel = (status: string): string => {
  switch (status) {
    case 'completed':
    case 'success':
      return 'Concluída'
    case 'processing':
      return 'Processando'
    case 'partial':
      return 'Parcial'
    case 'failed':
    case 'error':
      return 'Falhou'
    case 'pending':
      return 'Pendente'
    default:
      return status
  }
}

// Etapas do pipeline visual — adaptável para Validades e Rupturas
const getPipelineFases = (importType: ImportType, sheetName?: string) => [
  { id: 'identificar', label: 'Identificar arquivo', icon: FileUp },
  {
    id: 'ler',
    label:
      importType === 'rupturas'
        ? `Ler aba ${sheetName || 'Rupturas'}`
        : `Ler aba ${sheetName || 'Pesquisa Validade'}`,
    icon: Table2,
  },
  { id: 'validar', label: 'Validar colunas e tipos', icon: CheckCircle2 },
  {
    id: 'corrigir',
    label: importType === 'rupturas' ? 'Padronizar motivos' : 'Aplicar correções',
    icon: ShieldAlert,
  },
  {
    id: 'deduplicar',
    label: importType === 'rupturas' ? 'Dedup (maior data visita)' : 'Deduplicação 2 etapas',
    icon: GitMerge,
  },
  {
    id: 'status',
    label: importType === 'rupturas' ? 'Filtrar 90 dias' : 'Status e datas',
    icon: Layers,
  },
  { id: 'persistir', label: 'Persistir Base Atual', icon: Database },
]

export const ImportacaoPage: React.FC = () => {
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // API TradePro Hook
  const {
    testConnection,
    rupturasPreviewJob,
    rupturasPreviewStatus,
    rupturasSyncJob,
    rupturasSyncStatus,
    retryableJob,
    checkForRetryableJob,
    requestRupturasPreview,
    startRupturasSync,
    cancelRupturasSync,
    resetRupturasSyncState,
    validadesPreviewJob,
    validadesPreviewStatus,
    validadesSyncJob,
    validadesSyncStatus,
    retryableValidadesJob,
    checkForRetryableValidadesJob,
    requestValidadesPreview,
    startValidadesSync,
    cancelValidadesSync,
    resetValidadesSyncState,
  } = useTradeProApi()

  // Estado do Teste de Conexão TradePro
  const [apiDataInicial, setApiDataInicial] = useState<string>('')
  const [apiDataFinal, setApiDataFinal] = useState<string>('')
  const [connectionStatus, setConnectionStatus] = useState<
    'idle' | 'testing' | 'success_200' | 'success_204' | 'error'
  >('idle')
  const [connectionTestResult, setConnectionTestResult] =
    useState<TradeProTestConnectionResult | null>(null)
  const [lastTestTimestamp, setLastTestTimestamp] = useState<string | null>(null)

  // Estado da Sincronização Paginada de Rupturas (TradePro Sync)
  const [syncDataInicial, setSyncDataInicial] = useState<string>('')
  const [syncDataFinal, setSyncDataFinal] = useState<string>('')
  const [syncConfirmModalOpen, setSyncConfirmModalOpen] = useState<boolean>(false)

  // Estado da Sincronização Paginada de Validades (TradePro Sync)
  const [valSyncDataInicial, setValSyncDataInicial] = useState<string>('')
  const [valSyncDataFinal, setValSyncDataFinal] = useState<string>('')
  const [valSyncConfirmModalOpen, setValSyncConfirmModalOpen] = useState<boolean>(false)

  // Sub-aba ativa na visualização
  const [activeTab, setActiveTab] = useState<'api' | 'file'>('file')

  // Estado do fluxo de arquivo Excel
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [importType, setImportType] = useState<ImportType>('validades')
  const [stage, setStage] = useState<Stage>('idle')
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null)
  const [isParsing, setIsParsing] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)

  const [detectedHeaders, setDetectedHeaders] = useState<string[]>([])
  const [rawRows, setRawRows] = useState<Record<string, unknown>[]>([])
  const [sheetName, setSheetName] = useState<string>('')
  const [dataArquivo, setDataArquivo] = useState<string | undefined>(undefined)
  const [mapping, setMapping] = useState<ColumnMapping>({})

  // Rupturas
  const [rupturasRows, setRupturasRows] = useState<ParsedRupturaRow[]>([])
  const [rupturasResult, setRupturasResult] = useState<RupturasImportResult | null>(null)

  const [validationReport, setValidationReport] = useState<DatasetValidationReport | null>(null)
  const [, setMappedItems] = useState<ValidadeItem[]>([])

  const [importProgress, setImportProgress] = useState(0)
  const [progressState, setProgressState] = useState<ImportProgressState | null>(null)
  const [largeFileWarning, setLargeFileWarning] = useState<string | null>(null)
  const [isLargeFileConfirmed, setIsLargeFileConfirmed] = useState(false)
  const [errorsList, setErrorsList] = useState<PersistenceTaskError[]>([])

  // Abort controller para cancelamento seguro
  const abortControllerRef = useRef<AbortController | null>(null)
  const isProcessingLockRef = useRef<boolean>(false)
  const lastProgressUpdateRef = useRef<number>(0)
  const lastProgressStageRef = useRef<string>('')

  const [importResult, setImportResult] = useState<{
    imported: number
    rawRows?: number
    totalExpectedRaw?: number
    skipped: number
    errors: number
    errorDetails?: string
    isFullSuccess?: boolean
    retriesCount?: number
  } | null>(null)
  const [pipelineResult, setPipelineResult] = useState<PipelineResult | null>(null)
  const [resultModalOpen, setResultModalOpen] = useState(false)

  // Detecção de reenvio
  const [duplicateHash, setDuplicateHash] = useState<{
    hash: string
    importId?: string
    created?: string
    status?: string
    rawPersisted?: number
    rawExpected?: number
  } | null>(null)
  const [forceReprocess, setForceReprocess] = useState(false)
  const [reconciliation, setReconciliation] = useState<ImportReconciliation | null>(null)

  const { history, isLoading: historyLoading, refetch: refetchHistory } = useImportHistory()
  const [isExportingHistory, setIsExportingHistory] = useState(false)

  const handleExportHistory = async (format: 'xlsx' | 'csv') => {
    setIsExportingHistory(true)
    try {
      const snapshot = getBaseAtualSnapshot()
      const customSnapshot = {
        ...snapshot,
        importHistory: history,
      }
      if (format === 'xlsx') {
        downloadHistoricoImportacoesXLSX(customSnapshot as any)
      } else {
        downloadHistoricoImportacoesCSV(customSnapshot as any)
      }
      toast({
        title: 'Exportação concluída',
        description: `Histórico de Importações exportado em formato ${format.toUpperCase()}.`,
      })
    } catch (err) {
      toast({
        title: 'Erro ao exportar',
        description: err instanceof Error ? err.message : 'Falha na exportação do histórico.',
        variant: 'destructive',
      })
    } finally {
      setIsExportingHistory(false)
    }
  }

  // Escuta refresh global do header
  useEffect(() => {
    const handleRefresh = () => {
      refetchHistory()
    }
    window.addEventListener('diretoria:refresh', handleRefresh)
    return () => window.removeEventListener('diretoria:refresh', handleRefresh)
  }, [refetchHistory])

  const structure = useMemo(() => validateStructure(detectedHeaders), [detectedHeaders])

  // Validação das datas do teste TradePro
  const dateIntervalValidation = useMemo(() => {
    if (!apiDataInicial || !apiDataFinal) {
      return { isValid: false, error: null }
    }
    if (apiDataInicial > apiDataFinal) {
      return { isValid: false, error: 'A data final deve ser maior ou igual à data inicial.' }
    }
    const d1 = new Date(apiDataInicial + 'T00:00:00Z')
    const d2 = new Date(apiDataFinal + 'T00:00:00Z')
    const diffDays = Math.ceil(Math.abs(d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24))
    if (diffDays > 31) {
      return { isValid: false, error: 'O intervalo máximo permitido é de 31 dias.' }
    }
    return { isValid: true, error: null }
  }, [apiDataInicial, apiDataFinal])

  const isTestButtonEnabled =
    connectionStatus !== 'testing' &&
    !!apiDataInicial &&
    !!apiDataFinal &&
    dateIntervalValidation.isValid

  // Validação das datas de Sincronização de Rupturas
  const syncDateIntervalValidation = useMemo(() => {
    if (!syncDataInicial || !syncDataFinal) {
      return { isValid: false, error: null }
    }
    if (syncDataInicial > syncDataFinal) {
      return { isValid: false, error: 'A data final deve ser maior ou igual à data inicial.' }
    }
    const d1 = new Date(syncDataInicial + 'T00:00:00Z')
    const d2 = new Date(syncDataFinal + 'T00:00:00Z')
    const diffDays = Math.ceil(Math.abs(d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24))
    if (diffDays > 31) {
      return { isValid: false, error: 'O intervalo máximo permitido é de 31 dias.' }
    }
    return { isValid: true, error: null }
  }, [syncDataInicial, syncDataFinal])

  const isPreviewButtonEnabled =
    rupturasPreviewStatus !== 'loading' &&
    rupturasSyncStatus !== 'syncing' &&
    !!syncDataInicial &&
    !!syncDataFinal &&
    syncDateIntervalValidation.isValid

  const handleRequestPreview = async () => {
    if (!isPreviewButtonEnabled) return
    try {
      // 1. ANTES de criar um novo job de prévia, verificar se há job retryable existente
      const existingRetryable = await checkForRetryableJob(syncDataInicial, syncDataFinal)
      if (existingRetryable) {
        toast({
          title: 'Sincronização interrompida encontrada',
          description: `Job com ${existingRetryable.paginas_processadas} de ${existingRetryable.paginas_total} páginas concluídas pronto para retomada.`,
        })
        return
      }

      // 2. Se não houver job retryable, prosseguir com o fluxo normal criando prévia
      const job = await requestRupturasPreview(syncDataInicial, syncDataFinal)
      if (job.status === 'error') {
        toast({
          title: 'Erro na prévia de Rupturas',
          description: job.message || 'Não foi possível consultar os dados da API TradePro.',
          variant: 'destructive',
        })
      } else if (job.total_informado === 0) {
        toast({
          title: 'Nenhum registro encontrado',
          description: 'Nenhum registro de ruptura no intervalo selecionado.',
        })
      } else {
        toast({
          title: 'Prévia carregada',
          description: `${job.total_informado.toLocaleString('pt-BR')} registros encontrados em ${job.paginas_total} páginas.`,
        })
      }
    } catch (err) {
      toast({
        title: 'Falha ao consultar prévia',
        description: err instanceof Error ? err.message : 'Erro ao processar prévia.',
        variant: 'destructive',
      })
    }
  }

  const handleIgnoreAndStartNewPreview = async () => {
    resetRupturasSyncState()
    try {
      const job = await requestRupturasPreview(syncDataInicial, syncDataFinal)
      if (job.status === 'error') {
        toast({
          title: 'Erro na prévia de Rupturas',
          description: job.message || 'Não foi possível consultar os dados da API TradePro.',
          variant: 'destructive',
        })
      } else if (job.total_informado === 0) {
        toast({
          title: 'Nenhum registro encontrado',
          description: 'Nenhum registro de ruptura no intervalo selecionado.',
        })
      } else {
        toast({
          title: 'Prévia carregada',
          description: `${job.total_informado.toLocaleString('pt-BR')} registros encontrados em ${job.paginas_total} páginas.`,
        })
      }
    } catch (err) {
      toast({
        title: 'Falha ao consultar prévia',
        description: err instanceof Error ? err.message : 'Erro ao processar prévia.',
        variant: 'destructive',
      })
    }
  }

  const handleResumeRetryableJob = async (jobId: string) => {
    try {
      toast({
        title: 'Retomando sincronização',
        description: 'Continuando processamento das páginas pendentes a partir do staging...',
      })
      const finalJob = await startRupturasSync(jobId)
      if (finalJob.status === 'success') {
        toast({
          title: 'Sincronização concluída com sucesso',
          description: `${finalJob.registros_consolidados} rupturas consolidadas na Base Atual.`,
        })
      } else if (finalJob.status === 'paused') {
        toast({
          title: 'Sincronização pausada',
          description:
            finalJob.message || 'Limite temporário atingido. Você pode retomar a qualquer momento.',
          variant: 'destructive',
        })
      } else if (finalJob.status === 'cancelled') {
        toast({
          title: 'Sincronização cancelada',
          description: 'A sincronização foi interrompida pelo usuário.',
        })
      } else {
        toast({
          title: 'Erro na sincronização',
          description: finalJob.message || 'Ocorreu um erro durante o processamento.',
          variant: 'destructive',
        })
      }
    } catch (err) {
      toast({
        title: 'Erro ao retomar sincronização',
        description: err instanceof Error ? err.message : 'Falha ao retomar.',
        variant: 'destructive',
      })
    }
  }

  const handleConfirmStartSync = async () => {
    if (!rupturasPreviewJob) return
    setSyncConfirmModalOpen(false)
    try {
      toast({
        title: 'Sincronização iniciada',
        description: `Iniciando sincronização de ${rupturasPreviewJob.total_informado} registros...`,
      })
      const finalJob = await startRupturasSync(rupturasPreviewJob.id)
      if (finalJob.status === 'success') {
        toast({
          title: 'Sincronização concluída com sucesso',
          description: `${finalJob.registros_consolidados} rupturas consolidadas na Base Atual.`,
        })
      } else if (finalJob.status === 'paused') {
        toast({
          title: 'Sincronização pausada',
          description:
            finalJob.message || 'Limite temporário atingido. Você pode retomar a qualquer momento.',
          variant: 'destructive',
        })
      } else if (finalJob.status === 'cancelled') {
        toast({
          title: 'Sincronização cancelada',
          description: 'A sincronização foi interrompida pelo usuário.',
        })
      } else {
        toast({
          title: 'Erro na sincronização',
          description: finalJob.message || 'Ocorreu um erro durante o processamento.',
          variant: 'destructive',
        })
      }
    } catch (err) {
      toast({
        title: 'Erro no processo de sincronização',
        description: err instanceof Error ? err.message : 'Falha na sincronização.',
        variant: 'destructive',
      })
    }
  }

  const handleResumeSync = async () => {
    const activeJobId = rupturasSyncJob?.id || rupturasPreviewJob?.id
    if (!activeJobId) return
    try {
      toast({
        title: 'Retomando sincronização',
        description: 'Continuando processamento das páginas pendentes...',
      })
      const finalJob = await startRupturasSync(activeJobId)
      if (finalJob.status === 'success') {
        toast({
          title: 'Sincronização concluída com sucesso',
          description: `${finalJob.registros_consolidados} rupturas consolidadas na Base Atual.`,
        })
      }
    } catch (err) {
      toast({
        title: 'Erro ao retomar sincronização',
        description: err instanceof Error ? err.message : 'Falha ao retomar.',
        variant: 'destructive',
      })
    }
  }

  const handleCancelSync = async () => {
    const activeJobId = rupturasSyncJob?.id || rupturasPreviewJob?.id
    if (!activeJobId) return
    try {
      await cancelRupturasSync(activeJobId)
      toast({
        title: 'Sincronização cancelada',
        description: 'Operação interrompida. A Base Atual anterior foi mantida intacta.',
      })
    } catch (err) {
      toast({
        title: 'Erro ao cancelar',
        description: err instanceof Error ? err.message : 'Falha ao cancelar.',
        variant: 'destructive',
      })
    }
  }

  // Validação das datas de Sincronização de Validades
  const valSyncDateIntervalValidation = useMemo(() => {
    if (!valSyncDataInicial || !valSyncDataFinal) {
      return { isValid: false, error: null }
    }
    if (valSyncDataInicial > valSyncDataFinal) {
      return { isValid: false, error: 'A data final deve ser maior ou igual à data inicial.' }
    }
    const d1 = new Date(valSyncDataInicial + 'T00:00:00Z')
    const d2 = new Date(valSyncDataFinal + 'T00:00:00Z')
    const diffDays = Math.ceil(Math.abs(d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24))
    if (diffDays > 31) {
      return { isValid: false, error: 'O intervalo máximo permitido é de 31 dias.' }
    }
    return { isValid: true, error: null }
  }, [valSyncDataInicial, valSyncDataFinal])

  const isValPreviewButtonEnabled =
    validadesPreviewStatus !== 'loading' &&
    validadesSyncStatus !== 'syncing' &&
    !!valSyncDataInicial &&
    !!valSyncDataFinal &&
    valSyncDateIntervalValidation.isValid

  const handleValRequestPreview = async () => {
    if (!isValPreviewButtonEnabled) return
    try {
      const existingRetryable = await checkForRetryableValidadesJob(
        valSyncDataInicial,
        valSyncDataFinal,
      )
      if (existingRetryable) {
        toast({
          title: 'Sincronização interrompida encontrada',
          description: `Job com ${existingRetryable.paginas_processadas} de ${existingRetryable.paginas_total} páginas concluídas pronto para retomada.`,
        })
        return
      }

      const job = await requestValidadesPreview(valSyncDataInicial, valSyncDataFinal)
      if (job.status === 'error') {
        toast({
          title: 'Erro na prévia de Validades',
          description: job.message || 'Não foi possível consultar os dados da API TradePro.',
          variant: 'destructive',
        })
      } else if (job.total_informado === 0) {
        toast({
          title: 'Nenhum registro encontrado',
          description: 'Nenhum registro de validade no intervalo selecionado.',
        })
      } else {
        toast({
          title: 'Prévia de Validades carregada',
          description: `${job.total_informado.toLocaleString('pt-BR')} registros encontrados em ${job.paginas_total} páginas.`,
        })
      }
    } catch (err) {
      toast({
        title: 'Falha ao consultar prévia',
        description: err instanceof Error ? err.message : 'Erro ao processar prévia.',
        variant: 'destructive',
      })
    }
  }

  const handleValIgnoreAndStartNew = async () => {
    resetValidadesSyncState()
    try {
      const job = await requestValidadesPreview(valSyncDataInicial, valSyncDataFinal)
      if (job.status === 'error') {
        toast({
          title: 'Erro na prévia de Validades',
          description: job.message || 'Não foi possível consultar os dados da API TradePro.',
          variant: 'destructive',
        })
      } else if (job.total_informado === 0) {
        toast({
          title: 'Nenhum registro encontrado',
          description: 'Nenhum registro de validade no intervalo selecionado.',
        })
      } else {
        toast({
          title: 'Prévia de Validades carregada',
          description: `${job.total_informado.toLocaleString('pt-BR')} registros encontrados em ${job.paginas_total} páginas.`,
        })
      }
    } catch (err) {
      toast({
        title: 'Falha ao consultar prévia',
        description: err instanceof Error ? err.message : 'Erro ao processar prévia.',
        variant: 'destructive',
      })
    }
  }

  const handleValResumeRetryableJob = async (jobId: string) => {
    try {
      toast({
        title: 'Retomando sincronização de Validades',
        description: 'Continuando processamento das páginas pendentes a partir do staging...',
      })
      const finalJob = await startValidadesSync(jobId)
      if (finalJob.status === 'success') {
        toast({
          title: 'Sincronização de Validades concluída com sucesso',
          description: `${finalJob.registros_consolidados} ocorrências consolidadas na Base Atual.`,
        })
      } else if (finalJob.status === 'paused') {
        toast({
          title: 'Sincronização pausada',
          description:
            finalJob.message || 'Limite temporário atingido. Você pode retomar a qualquer momento.',
          variant: 'destructive',
        })
      } else if (finalJob.status === 'cancelled') {
        toast({
          title: 'Sincronização cancelada',
          description: 'A sincronização foi interrompida pelo usuário.',
        })
      } else {
        toast({
          title: 'Erro na sincronização',
          description: finalJob.message || 'Ocorreu um erro durante o processamento.',
          variant: 'destructive',
        })
      }
    } catch (err) {
      toast({
        title: 'Erro ao retomar sincronização',
        description: err instanceof Error ? err.message : 'Falha ao retomar.',
        variant: 'destructive',
      })
    }
  }

  const handleValConfirmStartSync = async () => {
    if (!validadesPreviewJob) return
    setValSyncConfirmModalOpen(false)
    try {
      toast({
        title: 'Sincronização de Validades iniciada',
        description: `Iniciando sincronização de ${validadesPreviewJob.total_informado} registros...`,
      })
      const finalJob = await startValidadesSync(validadesPreviewJob.id)
      if (finalJob.status === 'success') {
        toast({
          title: 'Sincronização concluída com sucesso',
          description: `${finalJob.registros_consolidados} ocorrências consolidadas na Base Atual.`,
        })
      } else if (finalJob.status === 'paused') {
        toast({
          title: 'Sincronização pausada',
          description:
            finalJob.message || 'Limite temporário atingido. Você pode retomar a qualquer momento.',
          variant: 'destructive',
        })
      } else if (finalJob.status === 'cancelled') {
        toast({
          title: 'Sincronização cancelada',
          description: 'A sincronização foi interrompida pelo usuário.',
        })
      } else {
        toast({
          title: 'Erro na sincronização',
          description: finalJob.message || 'Ocorreu um erro durante o processamento.',
          variant: 'destructive',
        })
      }
    } catch (err) {
      toast({
        title: 'Erro no processo de sincronização',
        description: err instanceof Error ? err.message : 'Falha na sincronização.',
        variant: 'destructive',
      })
    }
  }

  const handleValResumeSync = async () => {
    const activeJobId = validadesSyncJob?.id || validadesPreviewJob?.id
    if (!activeJobId) return
    try {
      toast({
        title: 'Retomando sincronização de Validades',
        description: 'Continuando processamento das páginas pendentes...',
      })
      const finalJob = await startValidadesSync(activeJobId)
      if (finalJob.status === 'success') {
        toast({
          title: 'Sincronização concluída com sucesso',
          description: `${finalJob.registros_consolidados} ocorrências consolidadas na Base Atual.`,
        })
      }
    } catch (err) {
      toast({
        title: 'Erro ao retomar sincronização',
        description: err instanceof Error ? err.message : 'Falha ao retomar.',
        variant: 'destructive',
      })
    }
  }

  const handleValCancelSync = async () => {
    const activeJobId = validadesSyncJob?.id || validadesPreviewJob?.id
    if (!activeJobId) return
    try {
      await cancelValidadesSync(activeJobId)
      toast({
        title: 'Sincronização cancelada',
        description: 'Operação interrompida. A Base Atual anterior foi mantida intacta.',
      })
    } catch (err) {
      toast({
        title: 'Erro ao cancelar',
        description: err instanceof Error ? err.message : 'Falha ao cancelar.',
        variant: 'destructive',
      })
    }
  }

  const handleTestConnection = async () => {
    if (!isTestButtonEnabled) return
    setConnectionStatus('testing')
    setConnectionTestResult(null)

    try {
      const res = await testConnection(apiDataInicial, apiDataFinal)
      setConnectionTestResult(res)
      setLastTestTimestamp(new Date().toISOString())

      if (res.conectado) {
        if (
          res.statusHttp === 204 ||
          (!res.possuiDados && res.statusHttp === 200 && res.totalDeRegistrosInformado === 0)
        ) {
          setConnectionStatus('success_204')
        } else {
          setConnectionStatus('success_200')
        }
        toast({
          title: 'Conexão bem-sucedida',
          description: `${res.mensagem} (${res.tempoRespostaMs}ms)`,
        })
      } else {
        setConnectionStatus('error')
        const isNotConfigured = res.errorCode === 'not_configured'
        const isPreconditionFailed = res.errorCode === 'precondition_failed'
        toast({
          title: isNotConfigured
            ? 'Integração não configurada'
            : isPreconditionFailed
              ? 'Pré-condição recusada (HTTP 412)'
              : 'Falha na conexão com TradePro',
          description: isNotConfigured
            ? 'Integração não configurada. Cadastre o token protegido no Skip Cloud.'
            : res.mensagem,
          variant: 'destructive',
        })
      }
    } catch (err) {
      setConnectionStatus('error')
      setLastTestTimestamp(new Date().toISOString())
      const errMsg = err instanceof Error ? err.message : 'Falha na comunicação com o servidor.'
      setConnectionTestResult({
        conectado: false,
        statusHttp: 0,
        possuiDados: false,
        registrosRecebidos: 0,
        totalDeRegistrosInformado: 0,
        tempoRespostaMs: 0,
        mensagem: errMsg,
      })
      toast({
        title: 'Erro no teste de conexão',
        description: errMsg,
        variant: 'destructive',
      })
    }
  }

  const reset = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setStage('idle')
    setSelectedFile(null)
    setImportType('validades')
    setFileInfo(null)
    setParseError(null)
    setDetectedHeaders([])
    setRawRows([])
    setSheetName('')
    setDataArquivo(undefined)
    setMapping({})
    setRupturasRows([])
    setRupturasResult(null)
    setValidationReport(null)
    setMappedItems([])
    setImportProgress(0)
    setProgressState(null)
    setLargeFileWarning(null)
    setIsLargeFileConfirmed(false)
    setErrorsList([])
    setImportResult(null)
    setPipelineResult(null)
    setDuplicateHash(null)
    setForceReprocess(false)
    setReconciliation(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  const handleFile = useCallback(
    async (file: File) => {
      // Bloqueio rigoroso de arquivos > 50 MB (limite honesto do sistema)
      const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50 MB
      if (file.size > MAX_FILE_SIZE) {
        setParseError(
          `Arquivo excede o limite máximo permitido de 50 MB (${fmtBytes(file.size)}). Reduza o tamanho ou exporte por período menor para garantir estabilidade.`,
        )
        setStage('idle')
        return
      }

      setIsParsing(true)
      setParseError(null)
      setDuplicateHash(null)
      setForceReprocess(false)
      setLargeFileWarning(null)
      setIsLargeFileConfirmed(false)
      setErrorsList([])
      setReconciliation(null)
      setSelectedFile(file)
      try {
        // Ler file.arrayBuffer() UMA única vez antes de hash e parse
        let arrayBuffer: ArrayBuffer | null = await file.arrayBuffer()
        const hash = await calcularHashArquivo(arrayBuffer, file.name, file.size)
        const isRupByName = file.name.toLowerCase().includes('ruptura')

        let parsed: Awaited<ReturnType<typeof parseExcelFile>> | null = null
        let rupRows: ParsedRupturaRow[] | null = null
        let isRup = isRupByName

        if (isRupByName) {
          try {
            parsed = await parseExcelFile(arrayBuffer, file.name)
          } catch {
            // fallback se parse padrão falhar
          }
          rupRows = await parseRupturasExcel(arrayBuffer)
          isRup = true
        } else {
          try {
            parsed = await parseExcelFile(arrayBuffer, file.name)
            isRup =
              parsed.isRupturaSheet ||
              detectRupturaFile(file.name, parsed.sheetName, parsed.headers)
            if (isRup) {
              rupRows = await parseRupturasExcel(arrayBuffer)
            }
          } catch (err) {
            // Se falhar ao ler como Validades, tenta ler como Rupturas
            try {
              rupRows = await parseRupturasExcel(arrayBuffer)
              isRup = true
            } catch {
              throw err
            }
          }
        }

        // Liberar referência ao ArrayBuffer local para descarte imediato pelo GC
        arrayBuffer = null

        setFileInfo({
          name: file.name,
          size: file.size,
          selectedAt: new Date().toISOString(),
          hash,
          declaredPhysicalRows: parsed?.declaredPhysicalRows ?? rupRows?.length ?? 0,
          usefulRows: parsed?.usefulRows ?? rupRows?.length ?? 0,
          ignoredBlankRows: parsed?.ignoredBlankRows ?? 0,
        })

        if (isRup && rupRows) {
          // Processamento como Rupturas
          setImportType('rupturas')
          setRupturasRows(rupRows)
          const headersList = [
            'Data Visita',
            'Atividade',
            'Motivo',
            'Razão Social',
            'CNPJ',
            'Cidade',
            'Estado',
            'Cód. Cliente',
            'Cliente',
            'Categoria',
            'Observação',
            'Colaborador',
          ]
          setDetectedHeaders(parsed?.headers || headersList)
          setSheetName(parsed?.sheetName || 'Rupturas')
          setRawRows(parsed?.rows || (rupRows as unknown as Record<string, unknown>[]))

          // Verifica duplicação no PocketBase para rupturas
          try {
            const existing = await pb
              .collection('rupturas_imports')
              .getFirstListItem(`file_hash="${hash}"`)
            if (existing) {
              setDuplicateHash({
                hash,
                importId: existing.id,
                created: (existing.created as string) || (existing.created_at as string) || '',
              })
            }
          } catch {
            // sem duplicação
          }

          const { valid, invalid } = validateRupturasRows(rupRows)
          const report: DatasetValidationReport = {
            totalRows: rupRows.length,
            validRows: valid.length,
            invalidRows: invalid.length,
            warningRows: 0,
            issues: invalid.map((inv) => ({
              rowIndex: inv.row.source_row - 2,
              severity: 'error',
              message: inv.motivo,
            })),
            duplicates: [],
          }
          setValidationReport(report)
          setStage('validated')

          // Preflight de volume para Rupturas (> 20MB ou > 10.000 linhas)
          if (file.size > 20 * 1024 * 1024 || rupRows.length > 10000) {
            setLargeFileWarning(
              `Este arquivo é volumoso (${fmtBytes(file.size)}, ${rupRows.length.toLocaleString('pt-BR')} linhas). A gravação utilizará concorrência controlada e retry automático para garantir 100% de integridade. Confirme abaixo para prosseguir.`,
            )
          }

          toast({
            title: 'Arquivo de Rupturas detectado',
            description: `${rupRows.length} linhas lidas da aba "${parsed?.sheetName || 'Rupturas'}".`,
          })
        } else if (parsed) {
          // Processamento como Validades
          setImportType('validades')
          setDetectedHeaders(parsed.headers)
          setRawRows(parsed.rows)
          setSheetName(parsed.sheetName)
          setDataArquivo(parsed.dataArquivo)

          const dupCheck = await checkFileHash(hash)
          if (dupCheck.duplicate) {
            setDuplicateHash({
              hash,
              importId: dupCheck.importId,
              created: dupCheck.created,
              status: dupCheck.status || 'completed',
            })
            setForceReprocess(false)
            setReconciliation(dupCheck.previousReconciliation || null)
          } else if (dupCheck.previousFailed) {
            let recon = dupCheck.previousReconciliation || null
            if (!recon && dupCheck.previousImportId) {
              recon = await reconcileImportState(
                dupCheck.previousImportId,
                dupCheck.previousRawExpected || parsed.rows.length,
              )
            }
            setReconciliation(recon)
            setDuplicateHash({
              hash,
              importId: dupCheck.previousImportId,
              created: dupCheck.created,
              status: dupCheck.status || 'failed',
              rawPersisted: recon?.rawPersisted ?? dupCheck.previousRawPersisted,
              rawExpected: recon?.receivedExpected ?? dupCheck.previousRawExpected,
            })
            setForceReprocess(true)
          }

          const suggested = suggestMapping(parsed.headers)
          setMapping(suggested)
          setStage('parsed')
          setValidationReport(null)
          setMappedItems([])

          // Preflight de volume para Validades (> 20MB ou > 10.000 linhas)
          if (file.size > 20 * 1024 * 1024 || parsed.rows.length > 10000) {
            setLargeFileWarning(
              `Este arquivo é volumoso (${fmtBytes(file.size)}, ${parsed.rows.length.toLocaleString('pt-BR')} linhas). A gravação utilizará concorrência controlada e retry automático para garantir 100% de integridade. Confirme abaixo para prosseguir.`,
            )
          }

          toast({
            title: 'Arquivo de Validades carregado',
            description: `${parsed.rows.length} linhas detectadas em "${parsed.sheetName}"${
              parsed.dataArquivo ? ` • Data Arquivo: ${parsed.dataArquivo}` : ''
            }.`,
          })
        }
      } catch (err) {
        setParseError(err instanceof Error ? err.message : 'Falha ao ler o arquivo.')
        setStage('idle')
      } finally {
        setIsParsing(false)
      }
    },
    [toast],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      const file = e.dataTransfer.files?.[0]
      if (file) handleFile(file)
    },
    [handleFile],
  )

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) handleFile(file)
    },
    [handleFile],
  )

  const handleMappingChange = useCallback((key: string, value: string) => {
    setMapping((prev) => ({ ...prev, [key]: value === '__none__' ? undefined : value }))
    setValidationReport(null)
    setMappedItems([])
    setStage('parsed')
  }, [])

  // Estatísticas de Resolução de Loja e Auditoria para a Prévia
  const previewStats = useMemo(() => {
    if (stage === 'idle' || stage === 'importing' || rawRows.length === 0) return null

    let comCodigo = 0
    let resolvidas = 0
    let ambiguas = 0
    let naoResolvidas = 0
    let emAuditoria = 0

    // Avalia mapeamento ou campos brutos
    const mapped = mapRecords(rawRows, mapping)
    const validRowsCount = mapped.filter((m) => m.errors.length === 0).length
    const auditoriaRowsCount = mapped.filter((m) => m.errors.length > 0).length

    for (const m of mapped) {
      if (m.errors.length > 0) {
        emAuditoria++
      }
      if (m.item.codigoLoja) {
        comCodigo++
      } else {
        const rawRazao = String(m.item.loja || '').trim()
        const rawCidade = String(m.item.cidade || '').trim()

        const storeRes = resolveStoreMatch({
          razaoSocial: rawRazao,
          cidade: rawCidade,
        })

        if (storeRes.status === 'com_codigo') {
          comCodigo++
        } else if (storeRes.status === 'resolvida') {
          resolvidas++
        } else if (storeRes.status === 'LOJA_AMBIGUA') {
          ambiguas++
        } else {
          naoResolvidas++
        }
      }
    }

    return {
      declaredPhysicalRows: fileInfo?.declaredPhysicalRows ?? rawRows.length,
      usefulRows: fileInfo?.usefulRows ?? rawRows.length,
      ignoredBlankRows: fileInfo?.ignoredBlankRows ?? 0,
      comCodigo,
      resolvidas,
      ambiguas,
      naoResolvidas,
      validas: validRowsCount,
      emAuditoria: auditoriaRowsCount || emAuditoria,
    }
  }, [stage, rawRows, mapping, fileInfo])

  const runValidation = useCallback(() => {
    const mapped = mapRecords(rawRows, mapping)
    const validItems = mapped
      .filter((m) => m.errors.length === 0)
      .map((m) => m.item as ValidadeItem)
    const invalidItemsCount = mapped.filter((m) => m.errors.length > 0).length
    const report = validateDataset(validItems)
    setMappedItems(validItems)
    setValidationReport(report)
    setStage('validated')

    // Se houver tentativa anterior com falha, re-reconcilia com os números reais de válidos e auditoria
    if (duplicateHash?.importId && duplicateHash.status === 'failed') {
      reconcileImportState(
        duplicateHash.importId,
        duplicateHash.rawExpected || rawRows.length,
        report.validRows,
        invalidItemsCount,
      )
        .then((rec) => {
          setReconciliation(rec)
        })
        .catch(() => null)
    }
  }, [rawRows, mapping, duplicateHash])

  const handleImport = useCallback(async () => {
    if (!validationReport || !fileInfo) return

    // Previne imports simultâneos (stage ou lock de duplo clique)
    if (stage === 'importing' || isProcessingLockRef.current) return
    isProcessingLockRef.current = true

    const controller = new AbortController()
    abortControllerRef.current = controller

    // Reseta controle de throttle
    lastProgressUpdateRef.current = 0
    lastProgressStageRef.current = ''

    setStage('importing')
    setImportProgress(5)
    setErrorsList([])
    setProgressState({
      stage: 'validating',
      message: 'Iniciando validação e preparação do pipeline...',
      processed: 0,
      total: validationReport.validRows,
      failuresCount: 0,
      retriesCount: 0,
    })

    try {
      if (importType === 'rupturas') {
        // Pipeline de Rupturas
        if (!selectedFile) throw new Error('Arquivo não encontrado para processar rupturas.')
        setImportProgress(20)
        setProgressState({
          stage: 'saving_base',
          message: 'Processando deduplicação e persistindo Rupturas na Base Atual...',
          processed: 0,
          total: validationReport.validRows,
          failuresCount: 0,
          retriesCount: 0,
        })

        const rupRes = await processRupturasImport(selectedFile, 'tenant-default', forceReprocess, {
          signal: controller.signal,
          onProgress: (p) => {
            const waitMsg = p.isRateLimited
              ? ' • Aguardando o banco liberar novas gravações...'
              : ''
            setProgressState({
              stage: 'saving_base',
              message: `Gravando rupturas (${p.processed} de ${p.total}${p.retries > 0 ? ` • ${p.retries} retries` : ''}${waitMsg})...`,
              processed: p.processed,
              total: p.total,
              failuresCount: p.failed,
              retriesCount: p.retries,
              isRateLimited: p.isRateLimited,
              rateLimitWaitMs: p.rateLimitWaitMs,
            })
            const ratio = p.total > 0 ? p.processed / p.total : 0
            setImportProgress(20 + Math.round(ratio * 75))
          },
        })
        setImportProgress(100)
        setRupturasResult(rupRes)

        if (rupRes.status === 'Concluída' || rupRes.status === 'Concluída com rejeições') {
          const isFull = rupRes.status === 'Concluída' && rupRes.total_rows_invalid === 0
          setImportResult({
            imported: rupRes.total_occurrences_generated,
            skipped: rupRes.total_rows_read - rupRes.total_occurrences_generated,
            errors: rupRes.total_rows_invalid,
            isFullSuccess: isFull,
          })
          setStage('done')
          setProgressState({
            stage: 'done',
            message: 'Importação de Rupturas concluída com sucesso.',
            processed: rupRes.total_occurrences_generated,
            total: rupRes.total_rows_read,
            failuresCount: rupRes.total_rows_invalid,
          })
          setResultModalOpen(true)
          refetchHistory()
          import('@/lib/data/dataSourceFactory').then(({ DataSourceFactory }) => {
            DataSourceFactory.reset()
            window.dispatchEvent(new Event('diretoria:refresh'))
            setTimeout(() => {
              DataSourceFactory.reset()
              window.dispatchEvent(new Event('diretoria:refresh'))
            }, 600)
          })
        } else if (rupRes.status === 'Cancelada') {
          toast({
            title: 'Arquivo já importado',
            description: rupRes.error_message || 'Arquivo duplicado detectado.',
            variant: 'destructive',
          })
          setStage('validated')
        } else {
          toast({
            title: 'Falha no processamento de Rupturas',
            description: rupRes.error_message || 'Erro ao processar arquivo de Rupturas.',
            variant: 'destructive',
          })
          setImportResult({
            imported: rupRes.total_occurrences_generated,
            skipped: rupRes.total_rows_read - rupRes.total_occurrences_generated,
            errors: Math.max(1, rupRes.total_rows_invalid),
            errorDetails: rupRes.error_message,
            isFullSuccess: false,
          })
          setStage('validated')
        }
      } else {
        // Pipeline de Validades (TradePro)
        setProgressState({
          stage: 'validating',
          message: 'Executando pipeline de regras e deduplicação...',
          processed: 0,
          total: rawRows.length,
          failuresCount: 0,
          retriesCount: 0,
        })

        // Observabilidade: se importId seguro conhecido antecipadamente, atualiza para processing ANTES de executarPipeline
        const safeImportId =
          reconciliation?.importId ||
          (duplicateHash?.status === 'failed' ? duplicateHash.importId : undefined)
        if (safeImportId) {
          try {
            await pb.collection('import_history').update(safeImportId, {
              status: 'processing',
              data_importacao: new Date().toISOString(),
            })
          } catch {
            // prossegue mesmo se update prévio falhar
          }
        }

        const rawTradePro = rawRows.map((r, i) => toRawRecord(r, mapping, i + 2))
        const pipeline = executarPipeline({
          rawRecords: rawRows,
          mapping,
          fileName: fileInfo.name,
          dataArquivo,
          importId: safeImportId || undefined,
        })
        setPipelineResult(pipeline)
        setImportProgress(15)

        const MIN_PROGRESS_INTERVAL = 200 // ms

        const result = await submitProcessValidades({
          fileName: fileInfo.name,
          fileSize: fileInfo.size,
          fileHash: fileInfo.hash || '',
          arquivoTipo: 'validades',
          dataArquivo,
          force: forceReprocess,
          previousImportId: duplicateHash?.status === 'failed' ? duplicateHash.importId : undefined,
          reconciliation: reconciliation || undefined,
          rawRecords: rawTradePro,
          baseAtual: pipeline.baseAtual,
          signal: controller.signal,
          summary: {
            totalBrutos: pipeline.summary.totalBrutos,
            validos: pipeline.summary.validos,
            rejeitados: pipeline.summary.rejeitados,
            filtrados90Dias: pipeline.summary.filtrados90Dias,
            consolidados: pipeline.summary.consolidados,
            baseAtual: pipeline.summary.baseAtual,
            maiorDataArquivo: pipeline.summary.maiorDataArquivo,
          },
          onProgress: (pState) => {
            const now = Date.now()
            const isStageChange = lastProgressStageRef.current !== pState.stage
            const isFinalEvent =
              pState.stage === 'done' ||
              pState.stage === 'failed' ||
              pState.stage === 'finalizing' ||
              (pState.total > 0 && pState.processed >= pState.total)
            const elapsed = now - lastProgressUpdateRef.current

            if (isStageChange || isFinalEvent || elapsed >= MIN_PROGRESS_INTERVAL) {
              lastProgressUpdateRef.current = now
              lastProgressStageRef.current = pState.stage

              let newProgress = 15
              if (pState.stage === 'saving_raw') {
                const rawRatio = pState.total > 0 ? pState.processed / pState.total : 0
                newProgress = 15 + Math.round(rawRatio * 35) // 15% -> 50%
              } else if (pState.stage === 'saving_base') {
                const baseRatio = pState.total > 0 ? pState.processed / pState.total : 0
                newProgress = 50 + Math.round(baseRatio * 45) // 50% -> 95%
              } else if (pState.stage === 'finalizing' || pState.stage === 'done') {
                newProgress = 100
              }

              setProgressState(pState)
              setImportProgress(newProgress)
            }
          },
        })

        setImportProgress(100)
        if (result.errorsDetails) {
          setErrorsList(result.errorsDetails)
        }

        if (result.success) {
          setImportResult({
            imported: result.importedRows,
            skipped: result.skippedRows,
            errors: result.errorRows,
            isFullSuccess: true,
            retriesCount: result.retriesCount,
          })
          setStage('done')
          setResultModalOpen(true)
          refetchHistory()
          import('@/lib/data/dataSourceFactory').then(({ DataSourceFactory }) => {
            DataSourceFactory.reset()
            window.dispatchEvent(new Event('diretoria:refresh'))
            setTimeout(() => {
              DataSourceFactory.reset()
              window.dispatchEvent(new Event('diretoria:refresh'))
            }, 600)
          })
        } else if (result.duplicate) {
          toast({
            title: 'Arquivo já importado',
            description:
              result.message ||
              'Este arquivo já foi processado anteriormente. Marque "Reprocessar" para substituir.',
            variant: 'destructive',
          })
          setDuplicateHash({
            hash: fileInfo.hash || '',
            importId: result.previousImportId,
            created: result.previousDate,
          })
          setStage('validated')
        } else {
          const rawSuccessCount = result.rawRows ?? 0
          const rawTotalCount = rawTradePro.length
          const actionSummary = `${rawSuccessCount} de ${rawTotalCount} registros brutos persistidos.`
          toast({
            title: 'Falha na persistência',
            description: `${result.error || 'Não foi possível concluir a importação.'} (${actionSummary})`,
            variant: 'destructive',
          })
          setImportResult({
            imported: result.importedRows,
            rawRows: rawSuccessCount,
            totalExpectedRaw: rawTotalCount,
            skipped: result.skippedRows,
            errors: result.errorRows,
            errorDetails: result.error,
            isFullSuccess: false,
            retriesCount: result.retriesCount,
          })
          setStage('validated')
        }
      }
    } catch (err) {
      const errMessage =
        err instanceof Error ? err.message : 'Falha na comunicação com o banco de dados.'
      toast({
        title: 'Erro no processamento',
        description: errMessage,
        variant: 'destructive',
      })

      // Se houver importId ativo, registrar status retomável honesto no histórico
      const activeId = reconciliation?.importId || duplicateHash?.importId
      if (activeId) {
        try {
          await pb.collection('import_history').update(activeId, {
            status: 'failed',
            error_rows: 1,
            errors_json: JSON.stringify({
              _meta: {
                error: errMessage,
                isPartial: true,
              },
            }),
          })
        } catch {
          // ignora falha de registro de erro
        }
      }

      setStage('validated')
    } finally {
      abortControllerRef.current = null
      isProcessingLockRef.current = false
    }
  }, [
    validationReport,
    fileInfo,
    stage,
    importType,
    selectedFile,
    rawRows,
    mapping,
    dataArquivo,
    forceReprocess,
    reconciliation,
    toast,
    refetchHistory,
  ])

  const canValidate =
    (importType === 'validades' && structure.isStructureValid && stage === 'parsed') ||
    (importType === 'rupturas' && stage === 'validated')
  const isImporting = stage === 'importing'
  const isVolumeConfirmationRequired =
    (!!largeFileWarning && !isLargeFileConfirmed && (fileInfo?.size || 0) > 20 * 1024 * 1024) ||
    (validationReport?.totalRows || 0) > 10000
  const canImport =
    !isImporting &&
    stage === 'validated' &&
    !!validationReport &&
    validationReport.validRows > 0 &&
    !isVolumeConfirmationRequired

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      {/* Header Premium */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                Importação de Dados
              </h1>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                Excel Disponível
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Alimente a Base Atual importando as planilhas Excel (.xlsx) extraídas do TradePro para
              Validades e Rupturas.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center flex-wrap">
          <Button
            asChild
            variant="outline"
            size="sm"
            className="h-10 px-3.5 gap-2 text-xs font-semibold text-indigo-700 border-indigo-200 bg-indigo-50/50 hover:bg-indigo-100 rounded-xl"
          >
            <Link to="/rupturas?tab=confronto">
              <GitCompare className="w-3.5 h-3.5 text-indigo-600" />
              <span>Motor de Confronto</span>
            </Link>
          </Button>
          {stage !== 'idle' && (
            <Button
              variant="outline"
              size="sm"
              onClick={reset}
              className="h-10 px-3.5 gap-1.5 text-xs font-semibold rounded-xl border-slate-200 text-slate-700 hover:bg-slate-50"
            >
              <X className="w-3.5 h-3.5" />
              <span>Limpar</span>
            </Button>
          )}
        </div>
      </div>

      {/* Tabs de Seleção de Origem: Planilhas Excel vs Status da Integração */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as 'api' | 'file')}
        className="w-full"
      >
        <TabsList className="grid w-full grid-cols-2 max-w-md bg-slate-100 p-1 rounded-xl">
          <TabsTrigger
            value="file"
            className="gap-2 text-xs font-semibold py-2 rounded-lg data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-2xs"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            Importar Arquivo Excel
          </TabsTrigger>
          <TabsTrigger
            value="api"
            className="gap-2 text-xs font-semibold py-2 rounded-lg data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-2xs"
          >
            <Cloud className="w-4 h-4 text-slate-500" />
            Integração TradePro
            <Badge
              variant="outline"
              className="text-[10px] py-0 px-1 text-slate-500 border-slate-300"
            >
              Informativo
            </Badge>
          </TabsTrigger>
        </TabsList>

        {/* ========================================================================= */}
        {/* SEÇÃO — "Integração TradePro" (Teste de Conexão Seguro e Controlado)        */}
        {/* ========================================================================= */}
        <TabsContent value="api" className="space-y-6 mt-4">
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-8 space-y-6 shadow-xs">
            {/* Cabeçalho do Bloco */}
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                  <Cloud className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h4 className="text-base font-bold text-slate-900">Integração TradePro</h4>
                    {connectionStatus === 'idle' && (
                      <Badge
                        variant="outline"
                        className="bg-slate-50 text-slate-600 border-slate-200 text-[11px] font-semibold"
                      >
                        Pronta para teste
                      </Badge>
                    )}
                    {connectionStatus === 'testing' && (
                      <Badge className="bg-indigo-100 text-indigo-800 border-indigo-200 text-[11px] font-semibold animate-pulse">
                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                        Verificando conexão...
                      </Badge>
                    )}
                    {connectionStatus === 'success_200' && (
                      <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[11px] font-bold">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Conectada
                      </Badge>
                    )}
                    {connectionStatus === 'success_204' && (
                      <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-[11px] font-bold">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Conectada (Sem dados)
                      </Badge>
                    )}
                    {connectionStatus === 'error' && (
                      <Badge className="bg-red-100 text-red-800 border-red-200 text-[11px] font-bold">
                        <AlertCircle className="w-3 h-3 mr-1" />
                        Com erro
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Valide a comunicação segura com a API TradePro executando um teste controlado de
                    conexão.
                  </p>
                </div>
              </div>

              {lastTestTimestamp && (
                <div className="text-xs text-slate-500 flex items-center gap-1.5 self-center">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span>Último teste: {fmtDate(lastTestTimestamp)}</span>
                </div>
              )}
            </div>

            {/* Formulário de Teste de Conexão */}
            <div className="bg-slate-50/70 rounded-xl p-5 border border-slate-200/80 space-y-4">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-indigo-600" />
                <h5 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Parâmetros de Teste de Conexão
                </h5>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
                <div className="space-y-1.5">
                  <label
                    htmlFor="tradepro-data-inicial"
                    className="text-xs font-semibold text-slate-700"
                  >
                    Data inicial <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="tradepro-data-inicial"
                    type="date"
                    value={apiDataInicial}
                    onChange={(e) => {
                      setApiDataInicial(e.target.value)
                      if (connectionStatus !== 'testing') {
                        setConnectionStatus('idle')
                        setConnectionTestResult(null)
                      }
                    }}
                    disabled={connectionStatus === 'testing'}
                    className="w-full h-10 px-3 text-xs bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="tradepro-data-final"
                    className="text-xs font-semibold text-slate-700"
                  >
                    Data final <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="tradepro-data-final"
                    type="date"
                    value={apiDataFinal}
                    onChange={(e) => {
                      setApiDataFinal(e.target.value)
                      if (connectionStatus !== 'testing') {
                        setConnectionStatus('idle')
                        setConnectionTestResult(null)
                      }
                    }}
                    disabled={connectionStatus === 'testing'}
                    className="w-full h-10 px-3 text-xs bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                </div>

                <div className="pt-1 sm:pt-0">
                  <Button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={!isTestButtonEnabled}
                    className="w-full h-10 gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl shadow-2xs disabled:opacity-50"
                  >
                    {connectionStatus === 'testing' ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Verificando conexão...</span>
                      </>
                    ) : (
                      <>
                        <Zap className="w-4 h-4" />
                        <span>Testar conexão</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Erro de validação inline */}
              {dateIntervalValidation.error && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>{dateIntervalValidation.error}</span>
                </div>
              )}
            </div>

            {/* Resultado do Teste Compacto */}
            {connectionStatus === 'testing' && (
              <div className="p-4 rounded-xl border border-indigo-200 bg-indigo-50/50 flex items-center gap-3">
                <Loader2 className="w-5 h-5 text-indigo-600 animate-spin shrink-0" />
                <div className="text-xs text-indigo-950">
                  <p className="font-semibold">Verificando conexão com o TradePro...</p>
                  <p className="text-indigo-800 text-[11px] mt-0.5">
                    Realizando chamada segura via backend com limite de 20 segundos.
                  </p>
                </div>
              </div>
            )}

            {connectionStatus === 'success_200' && connectionTestResult && (
              <div className="p-5 rounded-xl border border-emerald-200 bg-emerald-50/50 space-y-3">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-bold text-sm text-emerald-950">
                      Conexão realizada com sucesso
                    </p>
                    <p className="text-xs text-emerald-800">{connectionTestResult.mensagem}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                  <div className="p-3 bg-white rounded-lg border border-emerald-200 text-center shadow-2xs">
                    <span className="text-[10px] font-semibold uppercase text-emerald-700 block">
                      Status HTTP
                    </span>
                    <span className="text-base font-bold text-emerald-950 tabular-nums">
                      {connectionTestResult.statusHttp}
                    </span>
                  </div>
                  <div className="p-3 bg-white rounded-lg border border-emerald-200 text-center shadow-2xs">
                    <span className="text-[10px] font-semibold uppercase text-emerald-700 block">
                      Tempo Resposta
                    </span>
                    <span className="text-base font-bold text-emerald-950 tabular-nums">
                      {connectionTestResult.tempoRespostaMs} ms
                    </span>
                  </div>
                  <div className="p-3 bg-white rounded-lg border border-emerald-200 text-center shadow-2xs">
                    <span className="text-[10px] font-semibold uppercase text-emerald-700 block">
                      Registros no Período
                    </span>
                    <span className="text-base font-bold text-emerald-950 tabular-nums">
                      {connectionTestResult.totalDeRegistrosInformado.toLocaleString('pt-BR')}
                    </span>
                  </div>
                  <div className="p-3 bg-white rounded-lg border border-emerald-200 text-center shadow-2xs">
                    <span className="text-[10px] font-semibold uppercase text-emerald-700 block">
                      Amostra Recebida
                    </span>
                    <span className="text-base font-bold text-emerald-950 tabular-nums">
                      {connectionTestResult.registrosRecebidos}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {connectionStatus === 'success_204' && connectionTestResult && (
              <div className="p-5 rounded-xl border border-blue-200 bg-blue-50/50 space-y-3">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-bold text-sm text-blue-950">
                      Conexão válida, sem ocorrências no período
                    </p>
                    <p className="text-xs text-blue-800">
                      {connectionTestResult.mensagem ||
                        'A API TradePro respondeu com sucesso, porém não há dados registrados para o intervalo selecionado.'}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5 pt-1 max-w-sm">
                  <div className="p-3 bg-white rounded-lg border border-blue-200 text-center shadow-2xs">
                    <span className="text-[10px] font-semibold uppercase text-blue-700 block">
                      Status HTTP
                    </span>
                    <span className="text-base font-bold text-blue-950 tabular-nums">
                      {connectionTestResult.statusHttp || 204}
                    </span>
                  </div>
                  <div className="p-3 bg-white rounded-lg border border-blue-200 text-center shadow-2xs">
                    <span className="text-[10px] font-semibold uppercase text-blue-700 block">
                      Tempo Resposta
                    </span>
                    <span className="text-base font-bold text-blue-950 tabular-nums">
                      {connectionTestResult.tempoRespostaMs} ms
                    </span>
                  </div>
                </div>
              </div>
            )}

            {connectionStatus === 'error' && connectionTestResult && (
              <div
                className={cn(
                  'p-5 rounded-xl border space-y-3',
                  connectionTestResult.errorCode === 'precondition_failed'
                    ? 'border-amber-300 bg-amber-50/70'
                    : 'border-red-200 bg-red-50/50',
                )}
              >
                <div className="flex items-start gap-3">
                  {connectionTestResult.errorCode === 'precondition_failed' ? (
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  )}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p
                        className={cn(
                          'font-bold text-sm',
                          connectionTestResult.errorCode === 'precondition_failed'
                            ? 'text-amber-950'
                            : 'text-red-950',
                        )}
                      >
                        {connectionTestResult.errorCode === 'precondition_failed'
                          ? 'Pré-condição recusada (HTTP 412)'
                          : 'Falha ao conectar com o TradePro'}
                      </p>
                      {connectionTestResult.errorCode === 'precondition_failed' && (
                        <Badge
                          variant="outline"
                          className="bg-amber-100 text-amber-800 border-amber-300 text-[10px] font-bold"
                        >
                          HTTP 412
                        </Badge>
                      )}
                    </div>
                    <p
                      className={cn(
                        'text-xs leading-relaxed',
                        connectionTestResult.errorCode === 'precondition_failed'
                          ? 'text-amber-900'
                          : 'text-red-900',
                      )}
                    >
                      {connectionTestResult.mensagem}
                    </p>
                  </div>
                </div>

                {connectionTestResult.statusHttp > 0 && (
                  <div
                    className={cn(
                      'flex items-center gap-3 text-xs pt-1',
                      connectionTestResult.errorCode === 'precondition_failed'
                        ? 'text-amber-800'
                        : 'text-red-800',
                    )}
                  >
                    <span className="font-semibold">
                      Código retornado: HTTP {connectionTestResult.statusHttp}
                    </span>
                    {connectionTestResult.tempoRespostaMs > 0 && (
                      <span>• Latência: {connectionTestResult.tempoRespostaMs} ms</span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Rodapé Informativo */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-100">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Server className="w-4 h-4 text-slate-400" />
                <span>Autenticação segura gerenciada no backend (Basic Token)</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setActiveTab('file')}
                className="gap-1.5 text-xs h-10 px-3.5 rounded-xl border-slate-200 font-semibold bg-white hover:bg-slate-50"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                Ir para Importação Excel
              </Button>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* BLOCO 2 — Sincronização Paginada de Rupturas (TradePro Sync)              */}
          {/* ========================================================================= */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-8 space-y-6 shadow-xs">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                  <Database className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h4 className="text-base font-bold text-slate-900">
                      Sincronização de Rupturas
                    </h4>
                    {rupturasSyncStatus === 'syncing' ? (
                      <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[11px] font-bold animate-pulse">
                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                        Sincronizando...
                      </Badge>
                    ) : rupturasSyncStatus === 'success' ? (
                      <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[11px] font-bold">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Base Atualizada
                      </Badge>
                    ) : rupturasSyncStatus === 'paused' ? (
                      <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-[11px] font-bold">
                        <Clock className="w-3 h-3 mr-1" />
                        Pausada
                      </Badge>
                    ) : rupturasSyncStatus === 'cancelled' ? (
                      <Badge className="bg-slate-100 text-slate-700 border-slate-300 text-[11px] font-semibold">
                        Cancelada
                      </Badge>
                    ) : rupturasPreviewStatus === 'success' ? (
                      <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-[11px] font-semibold">
                        Prévia Pronta
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="bg-slate-50 text-slate-600 border-slate-200 text-[11px] font-semibold"
                      >
                        Pronta para consulta
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Consulte a prévia e sincronize a Base Atual de Rupturas de forma paginada e
                    segura direto da API TradePro.
                  </p>
                </div>
              </div>

              {(rupturasPreviewJob || rupturasSyncJob || retryableJob) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={resetRupturasSyncState}
                  disabled={rupturasSyncStatus === 'syncing'}
                  className="h-9 px-3 gap-1.5 text-xs text-slate-600 rounded-xl"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
                  Nova Consulta
                </Button>
              )}
            </div>

            {/* Parâmetros da Consulta de Prévia */}
            <div className="bg-slate-50/70 rounded-xl p-5 border border-slate-200/80 space-y-4">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-amber-600" />
                <h5 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Período para Sincronização de Rupturas
                </h5>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
                <div className="space-y-1.5">
                  <label
                    htmlFor="sync-data-inicial"
                    className="text-xs font-semibold text-slate-700"
                  >
                    Data inicial <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="sync-data-inicial"
                    type="date"
                    value={syncDataInicial}
                    onChange={(e) => {
                      setSyncDataInicial(e.target.value)
                      if (rupturasPreviewStatus !== 'loading') {
                        resetRupturasSyncState()
                      }
                    }}
                    disabled={
                      rupturasPreviewStatus === 'loading' || rupturasSyncStatus === 'syncing'
                    }
                    className="w-full h-10 px-3 text-xs bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-amber-500 disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="sync-data-final" className="text-xs font-semibold text-slate-700">
                    Data final <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="sync-data-final"
                    type="date"
                    value={syncDataFinal}
                    onChange={(e) => {
                      setSyncDataFinal(e.target.value)
                      if (rupturasPreviewStatus !== 'loading') {
                        resetRupturasSyncState()
                      }
                    }}
                    disabled={
                      rupturasPreviewStatus === 'loading' || rupturasSyncStatus === 'syncing'
                    }
                    className="w-full h-10 px-3 text-xs bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-amber-500 disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                </div>

                <div className="pt-1 sm:pt-0">
                  <Button
                    type="button"
                    onClick={handleRequestPreview}
                    disabled={!isPreviewButtonEnabled}
                    className="w-full h-10 gap-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-xl shadow-2xs disabled:opacity-50"
                  >
                    {rupturasPreviewStatus === 'loading' ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Consultando API TradePro...</span>
                      </>
                    ) : (
                      <>
                        <Layers className="w-4 h-4" />
                        <span>Consultar prévia</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {syncDateIntervalValidation.error && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>{syncDateIntervalValidation.error}</span>
                </div>
              )}
            </div>

            {/* CARD DESTACADO: Sincronização interrompida encontrada (Job Retryable) */}
            {retryableJob && (
              <div
                data-testid="retryable-job-card"
                className="p-5 sm:p-6 rounded-2xl border-2 border-amber-300 bg-gradient-to-br from-amber-50/90 via-amber-50/50 to-orange-50/60 shadow-xs space-y-5 animate-fade-in"
              >
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex items-start gap-3.5">
                    <div className="w-11 h-11 rounded-xl bg-amber-100 text-amber-800 border border-amber-200 flex items-center justify-center shrink-0 mt-0.5">
                      <AlertTriangle className="w-6 h-6 text-amber-700" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <h5 className="text-base font-bold text-amber-950 tracking-tight">
                          Sincronização interrompida encontrada
                        </h5>
                        <Badge
                          variant="outline"
                          className="bg-amber-100 text-amber-900 border-amber-300 text-[11px] font-mono font-bold px-2"
                        >
                          ID: ...{retryableJob.id.slice(-8)}
                        </Badge>
                        <Badge
                          className={cn(
                            'text-[11px] font-bold',
                            retryableJob.status === 'paused'
                              ? 'bg-amber-600 text-white'
                              : 'bg-rose-600 text-white',
                          )}
                        >
                          {retryableJob.status === 'paused'
                            ? 'Interrompido / Pausado'
                            : 'Interrompido com erro'}
                        </Badge>
                      </div>
                      <p className="text-xs text-amber-900 font-medium mt-1">
                        Período:{' '}
                        <strong className="font-semibold text-amber-950">
                          {retryableJob.date_start}
                        </strong>{' '}
                        a{' '}
                        <strong className="font-semibold text-amber-950">
                          {retryableJob.date_end}
                        </strong>
                        {retryableJob.updated && (
                          <span className="text-amber-800/80 ml-2">
                            • Última tentativa: {fmtDate(retryableJob.updated)}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 flex-wrap">
                    <Button
                      type="button"
                      onClick={() => handleResumeRetryableJob(retryableJob.id)}
                      disabled={rupturasSyncStatus === 'syncing'}
                      className="h-10 px-5 gap-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-xs disabled:opacity-50"
                    >
                      <RefreshCw className="w-4 h-4" />
                      <span>Retomar da página {retryableJob.paginas_processadas + 1}</span>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleIgnoreAndStartNewPreview}
                      disabled={rupturasSyncStatus === 'syncing'}
                      className="h-10 px-3.5 text-xs font-semibold text-slate-700 border-slate-300 bg-white hover:bg-slate-50 rounded-xl"
                    >
                      Ignorar e começar novo
                    </Button>
                  </div>
                </div>

                {/* Métricas do Job Retryable */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 bg-white rounded-xl border border-amber-200/90 text-center shadow-2xs">
                    <span className="text-[10px] font-semibold uppercase text-amber-700 block">
                      Progresso de Páginas
                    </span>
                    <span className="text-base font-bold text-amber-950 tabular-nums">
                      {retryableJob.paginas_processadas} de {retryableJob.paginas_total} concluídas
                    </span>
                  </div>

                  <div className="p-3 bg-white rounded-xl border border-amber-200/90 text-center shadow-2xs">
                    <span className="text-[10px] font-semibold uppercase text-emerald-700 block">
                      Preservados em Staging
                    </span>
                    <span className="text-base font-bold text-emerald-900 tabular-nums">
                      {retryableJob.registros_validos.toLocaleString('pt-BR')} registros
                    </span>
                  </div>

                  <div className="p-3 bg-white rounded-xl border border-amber-200/90 text-center shadow-2xs">
                    <span className="text-[10px] font-semibold uppercase text-indigo-700 block">
                      Próxima Página
                    </span>
                    <span className="text-base font-bold text-indigo-900 tabular-nums">
                      Página {retryableJob.paginas_processadas + 1}
                    </span>
                  </div>

                  <div className="p-3 bg-white rounded-xl border border-amber-200/90 text-center shadow-2xs">
                    <span className="text-[10px] font-semibold uppercase text-slate-600 block">
                      Total Previsto
                    </span>
                    <span className="text-base font-bold text-slate-900 tabular-nums">
                      {retryableJob.total_informado.toLocaleString('pt-BR')} registros
                    </span>
                  </div>
                </div>

                {/* Mensagem Sanitizada da Interrupção */}
                {retryableJob.message && (
                  <div className="p-3.5 rounded-xl bg-amber-100/60 border border-amber-200 text-xs text-amber-950 space-y-1">
                    <p className="font-semibold text-amber-900">Mensagem da última execução:</p>
                    <p className="text-amber-900/90 leading-relaxed font-mono text-[11px] break-all">
                      {retryableJob.message}
                    </p>
                  </div>
                )}

                {/* Aviso Obrigatório de Base Atual Protegida */}
                <div className="flex items-center gap-2 text-xs font-semibold text-amber-950 bg-amber-100/80 p-3 rounded-xl border border-amber-300">
                  <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0" />
                  <span>
                    ⚠️ Base Atual protegida — os registros temporários não afetam os indicadores.
                  </span>
                </div>
              </div>
            )}

            {/* Mensagem quando nenhum job foi consultado e nenhum retryable detectado */}
            {rupturasPreviewStatus === 'idle' && !rupturasPreviewJob && !retryableJob && (
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex items-center gap-3 text-xs text-slate-600">
                <Info className="w-4 h-4 text-slate-400 shrink-0" />
                <span>
                  Selecione um período e clique em <strong>Consultar prévia</strong> para verificar
                  os dados disponíveis na API TradePro antes de promover a Base Atual.
                </span>
              </div>
            )}

            {/* Loading da Prévia */}
            {rupturasPreviewStatus === 'loading' && (
              <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/50 flex items-center gap-3">
                <Loader2 className="w-5 h-5 text-amber-600 animate-spin shrink-0" />
                <div className="text-xs text-amber-950">
                  <p className="font-semibold">Consultando API TradePro...</p>
                  <p className="text-amber-800 text-[11px] mt-0.5">
                    Validando quantidade total de registros e páginas para o período solicitado.
                  </p>
                </div>
              </div>
            )}

            {/* Prévia com 0 registros */}
            {rupturasPreviewStatus === 'empty' && rupturasPreviewJob && (
              <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/50 flex items-center gap-3">
                <Info className="w-5 h-5 text-blue-600 shrink-0" />
                <div className="text-xs text-blue-950">
                  <p className="font-semibold">Nenhum registro de ruptura encontrado</p>
                  <p className="text-blue-800 text-[11px] mt-0.5">
                    Nenhum registro retornado para o período de {rupturasPreviewJob.date_start} a{' '}
                    {rupturasPreviewJob.date_end}.
                  </p>
                </div>
              </div>
            )}

            {/* Prévia com Erro */}
            {rupturasPreviewStatus === 'error' && rupturasPreviewJob && (
              <div className="p-4 rounded-xl border border-red-200 bg-red-50/50 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <div className="text-xs text-red-950 space-y-1">
                  <p className="font-semibold">Falha na consulta de prévia</p>
                  <p className="text-red-900 leading-relaxed">
                    {rupturasPreviewJob.message || 'Erro ao conectar com a API TradePro.'}
                  </p>
                </div>
              </div>
            )}

            {/* Card com Resultado da Prévia & Botão de Sincronizar (Apenas se NÃO houver job retryable) */}
            {rupturasPreviewStatus === 'success' &&
              rupturasPreviewJob &&
              !retryableJob &&
              rupturasPreviewJob.total_informado > 0 &&
              rupturasSyncStatus !== 'syncing' &&
              rupturasSyncStatus !== 'success' && (
                <div className="p-5 rounded-xl border border-amber-200 bg-amber-50/40 space-y-4">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="space-y-1">
                      <p className="font-bold text-sm text-amber-950">Prévia de Rupturas Pronta</p>
                      <p className="text-xs text-amber-900">
                        Período: <strong>{rupturasPreviewJob.date_start}</strong> até{' '}
                        <strong>{rupturasPreviewJob.date_end}</strong>
                      </p>
                    </div>

                    <Button
                      type="button"
                      onClick={() => setSyncConfirmModalOpen(true)}
                      className="h-10 px-5 gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs"
                    >
                      <Database className="w-4 h-4" />
                      <span>Sincronizar Rupturas</span>
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
                    <div className="p-3 bg-white rounded-lg border border-amber-200 text-center shadow-2xs">
                      <span className="text-[10px] font-semibold uppercase text-amber-700 block">
                        Total de Ocorrências
                      </span>
                      <span className="text-lg font-bold text-amber-950 tabular-nums">
                        {rupturasPreviewJob.total_informado.toLocaleString('pt-BR')}
                      </span>
                    </div>

                    <div className="p-3 bg-white rounded-lg border border-amber-200 text-center shadow-2xs">
                      <span className="text-[10px] font-semibold uppercase text-amber-700 block">
                        Páginas Previstas
                      </span>
                      <span className="text-lg font-bold text-amber-950 tabular-nums">
                        {rupturasPreviewJob.paginas_total}
                      </span>
                    </div>

                    <div className="p-3 bg-white rounded-lg border border-amber-200 text-center shadow-2xs col-span-2 sm:col-span-1">
                      <span className="text-[10px] font-semibold uppercase text-amber-700 block">
                        Tamanho do Lote
                      </span>
                      <span className="text-lg font-bold text-amber-950 tabular-nums">
                        30 / página
                      </span>
                    </div>
                  </div>
                </div>
              )}

            {/* Durante a Sincronização: Progresso em Tempo Real */}
            {rupturasSyncStatus === 'syncing' &&
              (() => {
                const paginasProcessadas = rupturasSyncJob?.paginas_processadas || 0
                const paginasTotal =
                  rupturasSyncJob?.paginas_total || rupturasPreviewJob?.paginas_total || 1
                const rawPct = (paginasProcessadas / Math.max(1, paginasTotal)) * 100
                // Limitar a no máximo 99% enquanto syncing
                const displayPct = Math.min(99, Math.round(rawPct))
                const isPromoting = paginasProcessadas >= paginasTotal && paginasTotal > 0

                return (
                  <div className="p-5 rounded-xl border border-amber-300 bg-amber-50 space-y-4 shadow-2xs">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="flex items-center gap-3">
                        <Loader2 className="w-5 h-5 text-amber-600 animate-spin shrink-0" />
                        <div>
                          <p className="font-bold text-sm text-amber-950">
                            {isPromoting
                              ? 'Promovendo registros para a Base Atual...'
                              : paginasProcessadas === 0
                                ? 'Preparando a primeira página — nenhuma alteração foi realizada na Base Atual.'
                                : `Sincronizando página ${paginasProcessadas} de ${paginasTotal}...`}
                          </p>
                          <p className="text-xs text-amber-800 mt-0.5">
                            {rupturasSyncJob?.registros_lidos || 0} lidos •{' '}
                            {rupturasSyncJob?.registros_validos || 0} válidos •{' '}
                            {rupturasSyncJob?.registros_rejeitados || 0} rejeitados
                          </p>
                        </div>
                      </div>

                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleCancelSync}
                        className="h-9 px-3 gap-1.5 text-xs font-semibold text-red-700 border-red-200 bg-red-50/50 hover:bg-red-100 rounded-xl"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>Cancelar</span>
                      </Button>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs text-amber-900 font-semibold">
                        <span>
                          {isPromoting
                            ? 'Finalizando promoção atômica...'
                            : 'Progresso da Sincronização'}
                        </span>
                        <span>{displayPct}%</span>
                      </div>
                      <Progress value={displayPct} className="h-2.5 bg-amber-200" />
                    </div>

                    {/* Métricas extras */}
                    <div className="grid grid-cols-3 gap-2.5 pt-1">
                      <div className="p-2.5 bg-white/80 rounded-lg border border-amber-200 text-center">
                        <span className="text-[10px] font-semibold uppercase text-amber-700 block">
                          Registros Lidos
                        </span>
                        <span className="text-sm font-bold text-amber-950 tabular-nums">
                          {(rupturasSyncJob?.registros_lidos || 0).toLocaleString('pt-BR')}
                        </span>
                      </div>
                      <div className="p-2.5 bg-white/80 rounded-lg border border-amber-200 text-center">
                        <span className="text-[10px] font-semibold uppercase text-emerald-700 block">
                          Registros Válidos
                        </span>
                        <span className="text-sm font-bold text-emerald-950 tabular-nums">
                          {(rupturasSyncJob?.registros_validos || 0).toLocaleString('pt-BR')}
                        </span>
                      </div>
                      <div className="p-2.5 bg-white/80 rounded-lg border border-amber-200 text-center">
                        <span className="text-[10px] font-semibold uppercase text-rose-700 block">
                          Registros Rejeitados
                        </span>
                        <span className="text-sm font-bold text-rose-950 tabular-nums">
                          {(rupturasSyncJob?.registros_rejeitados || 0).toLocaleString('pt-BR')}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })()}

            {/* Job Pausado */}
            {rupturasSyncStatus === 'paused' && (
              <div className="p-5 rounded-xl border border-amber-300 bg-amber-50/80 space-y-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex items-start gap-3">
                    <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-sm text-amber-950">Sincronização Pausada</p>
                      <p className="text-xs text-amber-900 mt-0.5">
                        {rupturasSyncJob?.message ||
                          'O limite temporário de requisições foi atingido. Clique em Retomar para continuar.'}
                      </p>
                      {rupturasSyncJob && rupturasSyncJob.paginas_processadas > 0 && (
                        <p className="text-xs text-amber-800 font-medium mt-1">
                          {rupturasSyncJob.paginas_processadas} página(s) processada(s),{' '}
                          {rupturasSyncJob.registros_validos} registros em staging preservados.
                          Clique em Retomar para continuar da página{' '}
                          {rupturasSyncJob.paginas_processadas + 1}.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      onClick={handleResumeSync}
                      className="h-9 px-4 gap-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Retomar Sincronização</span>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleCancelSync}
                      className="h-9 px-3 text-xs text-slate-600 rounded-xl"
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Conclusão com Sucesso */}
            {rupturasSyncStatus === 'success' && rupturasSyncJob && (
              <div className="p-5 rounded-xl border border-emerald-200 bg-emerald-50/50 space-y-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-bold text-sm text-emerald-950">
                      Sincronização Concluída com Sucesso
                    </p>
                    <p className="text-xs text-emerald-800">
                      A Base Atual de Rupturas foi promovida e atualizada atomicamente.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                  <div className="p-3 bg-white rounded-lg border border-emerald-200 text-center shadow-2xs">
                    <span className="text-[10px] font-semibold uppercase text-emerald-700 block">
                      Registros Consolidados
                    </span>
                    <span className="text-base font-bold text-emerald-950 tabular-nums">
                      {rupturasSyncJob.registros_consolidados.toLocaleString('pt-BR')}
                    </span>
                  </div>
                  <div className="p-3 bg-white rounded-lg border border-emerald-200 text-center shadow-2xs">
                    <span className="text-[10px] font-semibold uppercase text-emerald-700 block">
                      Páginas Processadas
                    </span>
                    <span className="text-base font-bold text-emerald-950 tabular-nums">
                      {rupturasSyncJob.paginas_processadas} de {rupturasSyncJob.paginas_total}
                    </span>
                  </div>
                  <div className="p-3 bg-white rounded-lg border border-emerald-200 text-center shadow-2xs">
                    <span className="text-[10px] font-semibold uppercase text-emerald-700 block">
                      Total Lido
                    </span>
                    <span className="text-base font-bold text-emerald-950 tabular-nums">
                      {rupturasSyncJob.registros_lidos.toLocaleString('pt-BR')}
                    </span>
                  </div>
                  <div className="p-3 bg-white rounded-lg border border-emerald-200 text-center shadow-2xs">
                    <span className="text-[10px] font-semibold uppercase text-emerald-700 block">
                      Deduplicados / Rejeitados
                    </span>
                    <span className="text-base font-bold text-emerald-950 tabular-nums">
                      {rupturasSyncJob.registros_deduplicados} /{' '}
                      {rupturasSyncJob.registros_rejeitados}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="h-9 px-3.5 text-xs font-semibold text-emerald-800 border-emerald-300 bg-white hover:bg-emerald-50 rounded-xl"
                  >
                    <Link to="/rupturas">
                      <span>Ver Base de Rupturas</span>
                      <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                    </Link>
                  </Button>
                </div>
              </div>
            )}

            {/* Falha na Sincronização */}
            {rupturasSyncStatus === 'error' && rupturasSyncJob && (
              <div className="p-5 rounded-xl border border-red-200 bg-red-50/50 space-y-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="font-bold text-sm text-red-950">
                        Falha na Sincronização de Rupturas
                      </p>
                      <p className="text-xs text-red-900 leading-relaxed">
                        {rupturasSyncJob.message || 'Erro durante o processamento das páginas.'}
                      </p>
                      {rupturasSyncJob.paginas_processadas > 0 ? (
                        <p className="text-xs font-semibold text-red-800 mt-1">
                          {rupturasSyncJob.paginas_processadas} páginas processadas,{' '}
                          {rupturasSyncJob.registros_validos} registros em staging preservados.
                          Clique em Retomar para continuar da página{' '}
                          {rupturasSyncJob.paginas_processadas + 1}.
                        </p>
                      ) : (
                        <p className="text-[11px] text-red-800 mt-1">
                          A Base Atual anterior foi preservada integralmente sem corrupção de dados.
                        </p>
                      )}
                    </div>
                  </div>

                  {rupturasSyncJob.paginas_processadas > 0 && (
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        onClick={handleResumeSync}
                        className="h-9 px-4 gap-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-xs"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Retomar sincronização</span>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleCancelSync}
                        className="h-9 px-3 text-xs text-slate-600 rounded-xl"
                      >
                        Cancelar
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ========================================================================= */}
          {/* BLOCO 3 — Sincronização Paginada de Validades (TradePro Sync)             */}
          {/* ========================================================================= */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-8 space-y-6 shadow-xs">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                  <CalendarCheck className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h4 className="text-base font-bold text-slate-900">
                      Sincronização de Validades
                    </h4>
                    {validadesSyncStatus === 'syncing' ? (
                      <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[11px] font-bold animate-pulse">
                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                        Sincronizando...
                      </Badge>
                    ) : validadesSyncStatus === 'success' ? (
                      <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[11px] font-bold">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Base Atualizada
                      </Badge>
                    ) : validadesSyncStatus === 'paused' ? (
                      <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-[11px] font-bold">
                        <Clock className="w-3 h-3 mr-1" />
                        Pausada
                      </Badge>
                    ) : validadesSyncStatus === 'cancelled' ? (
                      <Badge className="bg-slate-100 text-slate-700 border-slate-300 text-[11px] font-semibold">
                        Cancelada
                      </Badge>
                    ) : validadesPreviewStatus === 'success' ? (
                      <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-[11px] font-semibold">
                        Prévia Pronta
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="bg-slate-50 text-slate-600 border-slate-200 text-[11px] font-semibold"
                      >
                        Pronta para consulta
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Consulte a prévia e sincronize a Base Atual de Validades de forma paginada e
                    segura direto da API TradePro (/v1/relatorio-validade).
                  </p>
                </div>
              </div>

              {(validadesPreviewJob || validadesSyncJob || retryableValidadesJob) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={resetValidadesSyncState}
                  disabled={validadesSyncStatus === 'syncing'}
                  className="h-9 px-3 gap-1.5 text-xs text-slate-600 rounded-xl"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
                  Nova Consulta
                </Button>
              )}
            </div>

            {/* Parâmetros da Consulta de Prévia */}
            <div className="bg-slate-50/70 rounded-xl p-5 border border-slate-200/80 space-y-4">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-emerald-600" />
                <h5 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Período para Sincronização de Validades
                </h5>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
                <div className="space-y-1.5">
                  <label
                    htmlFor="val-sync-data-inicial"
                    className="text-xs font-semibold text-slate-700"
                  >
                    Data inicial <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="val-sync-data-inicial"
                    type="date"
                    value={valSyncDataInicial}
                    onChange={(e) => {
                      setValSyncDataInicial(e.target.value)
                      if (validadesPreviewStatus !== 'loading') {
                        resetValidadesSyncState()
                      }
                    }}
                    disabled={
                      validadesPreviewStatus === 'loading' || validadesSyncStatus === 'syncing'
                    }
                    className="w-full h-10 px-3 text-xs bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="val-sync-data-final"
                    className="text-xs font-semibold text-slate-700"
                  >
                    Data final <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="val-sync-data-final"
                    type="date"
                    value={valSyncDataFinal}
                    onChange={(e) => {
                      setValSyncDataFinal(e.target.value)
                      if (validadesPreviewStatus !== 'loading') {
                        resetValidadesSyncState()
                      }
                    }}
                    disabled={
                      validadesPreviewStatus === 'loading' || validadesSyncStatus === 'syncing'
                    }
                    className="w-full h-10 px-3 text-xs bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                </div>

                <div className="pt-1 sm:pt-0">
                  <Button
                    type="button"
                    onClick={handleValRequestPreview}
                    disabled={!isValPreviewButtonEnabled}
                    className="w-full h-10 gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-2xs disabled:opacity-50"
                  >
                    {validadesPreviewStatus === 'loading' ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Consultando API TradePro...</span>
                      </>
                    ) : (
                      <>
                        <Layers className="w-4 h-4" />
                        <span>Consultar prévia</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {valSyncDateIntervalValidation.error && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900">
                  <AlertTriangle className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{valSyncDateIntervalValidation.error}</span>
                </div>
              )}
            </div>

            {/* CARD DESTACADO: Sincronização interrompida encontrada (Job Retryable Validades) */}
            {retryableValidadesJob && (
              <div
                data-testid="retryable-validades-job-card"
                className="p-5 sm:p-6 rounded-2xl border-2 border-emerald-300 bg-gradient-to-br from-emerald-50/90 via-emerald-50/50 to-teal-50/60 shadow-xs space-y-5 animate-fade-in"
              >
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex items-start gap-3.5">
                    <div className="w-11 h-11 rounded-xl bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center justify-center shrink-0 mt-0.5">
                      <AlertTriangle className="w-6 h-6 text-emerald-700" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <h5 className="text-base font-bold text-emerald-950 tracking-tight">
                          Sincronização interrompida encontrada
                        </h5>
                        <Badge
                          variant="outline"
                          className="bg-emerald-100 text-emerald-900 border-emerald-300 text-[11px] font-mono font-bold px-2"
                        >
                          ID: ...{retryableValidadesJob.id.slice(-8)}
                        </Badge>
                        <Badge
                          className={cn(
                            'text-[11px] font-bold',
                            retryableValidadesJob.status === 'paused'
                              ? 'bg-amber-600 text-white'
                              : 'bg-rose-600 text-white',
                          )}
                        >
                          {retryableValidadesJob.status === 'paused'
                            ? 'Interrompido / Pausado'
                            : 'Interrompido com erro'}
                        </Badge>
                      </div>
                      <p className="text-xs text-emerald-900 font-medium mt-1">
                        Período:{' '}
                        <strong className="font-semibold text-emerald-950">
                          {retryableValidadesJob.date_start}
                        </strong>{' '}
                        a{' '}
                        <strong className="font-semibold text-emerald-950">
                          {retryableValidadesJob.date_end}
                        </strong>
                        {retryableValidadesJob.updated && (
                          <span className="text-emerald-800/80 ml-2">
                            • Última tentativa: {fmtDate(retryableValidadesJob.updated)}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 flex-wrap">
                    <Button
                      type="button"
                      onClick={() => handleValResumeRetryableJob(retryableValidadesJob.id)}
                      disabled={validadesSyncStatus === 'syncing'}
                      className="h-10 px-5 gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs disabled:opacity-50"
                    >
                      <RefreshCw className="w-4 h-4" />
                      <span>Retomar da página {retryableValidadesJob.paginas_processadas + 1}</span>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleValIgnoreAndStartNew}
                      disabled={validadesSyncStatus === 'syncing'}
                      className="h-10 px-3.5 text-xs font-semibold text-slate-700 border-slate-300 bg-white hover:bg-slate-50 rounded-xl"
                    >
                      Ignorar e começar novo
                    </Button>
                  </div>
                </div>

                {/* Métricas do Job Retryable */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 bg-white rounded-xl border border-emerald-200/90 text-center shadow-2xs">
                    <span className="text-[10px] font-semibold uppercase text-emerald-700 block">
                      Progresso de Páginas
                    </span>
                    <span className="text-base font-bold text-emerald-950 tabular-nums">
                      {retryableValidadesJob.paginas_processadas} de{' '}
                      {retryableValidadesJob.paginas_total} concluídas
                    </span>
                  </div>

                  <div className="p-3 bg-white rounded-xl border border-emerald-200/90 text-center shadow-2xs">
                    <span className="text-[10px] font-semibold uppercase text-emerald-700 block">
                      Preservados em Staging
                    </span>
                    <span className="text-base font-bold text-emerald-900 tabular-nums">
                      {retryableValidadesJob.registros_validos.toLocaleString('pt-BR')} registros
                    </span>
                  </div>

                  <div className="p-3 bg-white rounded-xl border border-emerald-200/90 text-center shadow-2xs">
                    <span className="text-[10px] font-semibold uppercase text-teal-700 block">
                      Próxima Página
                    </span>
                    <span className="text-base font-bold text-teal-900 tabular-nums">
                      Página {retryableValidadesJob.paginas_processadas + 1}
                    </span>
                  </div>

                  <div className="p-3 bg-white rounded-xl border border-emerald-200/90 text-center shadow-2xs">
                    <span className="text-[10px] font-semibold uppercase text-slate-600 block">
                      Total Previsto
                    </span>
                    <span className="text-base font-bold text-slate-900 tabular-nums">
                      {retryableValidadesJob.total_informado.toLocaleString('pt-BR')} registros
                    </span>
                  </div>
                </div>

                {/* Mensagem Sanitizada da Interrupção */}
                {retryableValidadesJob.message && (
                  <div className="p-3.5 rounded-xl bg-emerald-100/60 border border-emerald-200 text-xs text-emerald-950 space-y-1">
                    <p className="font-semibold text-emerald-900">Mensagem da última execução:</p>
                    <p className="text-emerald-900/90 leading-relaxed font-mono text-[11px] break-all">
                      {retryableValidadesJob.message}
                    </p>
                  </div>
                )}

                {/* Aviso Obrigatório de Base Atual Protegida */}
                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-950 bg-emerald-100/80 p-3 rounded-xl border border-emerald-300">
                  <ShieldAlert className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span>
                    ⚠️ Base Atual protegida — os registros temporários não afetam os indicadores.
                  </span>
                </div>
              </div>
            )}

            {/* Mensagem quando nenhum job foi consultado e nenhum retryable detectado */}
            {validadesPreviewStatus === 'idle' &&
              !validadesPreviewJob &&
              !retryableValidadesJob && (
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex items-center gap-3 text-xs text-slate-600">
                  <Info className="w-4 h-4 text-slate-400 shrink-0" />
                  <span>
                    Selecione um período e clique em <strong>Consultar prévia</strong> para
                    verificar os dados disponíveis na API TradePro antes de promover a Base Atual de
                    Validades.
                  </span>
                </div>
              )}

            {/* Loading da Prévia */}
            {validadesPreviewStatus === 'loading' && (
              <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/50 flex items-center gap-3">
                <Loader2 className="w-5 h-5 text-emerald-600 animate-spin shrink-0" />
                <div className="text-xs text-emerald-950">
                  <p className="font-semibold">Consultando API TradePro (Validades)...</p>
                  <p className="text-emerald-800 text-[11px] mt-0.5">
                    Validando quantidade total de registros e páginas para o período solicitado.
                  </p>
                </div>
              </div>
            )}

            {/* Prévia com 0 registros */}
            {validadesPreviewStatus === 'empty' && validadesPreviewJob && (
              <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/50 flex items-center gap-3">
                <Info className="w-5 h-5 text-blue-600 shrink-0" />
                <div className="text-xs text-blue-950">
                  <p className="font-semibold">Nenhum registro de validade encontrado</p>
                  <p className="text-blue-800 text-[11px] mt-0.5">
                    Nenhum registro retornado para o período de {validadesPreviewJob.date_start} a{' '}
                    {validadesPreviewJob.date_end}.
                  </p>
                </div>
              </div>
            )}

            {/* Prévia com Erro */}
            {validadesPreviewStatus === 'error' && validadesPreviewJob && (
              <div className="p-4 rounded-xl border border-red-200 bg-red-50/50 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <div className="text-xs text-red-950 space-y-1">
                  <p className="font-semibold">Falha na consulta de prévia</p>
                  <p className="text-red-900 leading-relaxed">
                    {validadesPreviewJob.message || 'Erro ao conectar com a API TradePro.'}
                  </p>
                </div>
              </div>
            )}

            {/* Card com Resultado da Prévia & Botão de Sincronizar (Apenas se NÃO houver job retryable) */}
            {validadesPreviewStatus === 'success' &&
              validadesPreviewJob &&
              !retryableValidadesJob &&
              validadesPreviewJob.total_informado > 0 &&
              validadesSyncStatus !== 'syncing' &&
              validadesSyncStatus !== 'success' && (
                <div className="p-5 rounded-xl border border-emerald-200 bg-emerald-50/40 space-y-4">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="space-y-1">
                      <p className="font-bold text-sm text-emerald-950">
                        Prévia de Validades Pronta
                      </p>
                      <p className="text-xs text-emerald-900">
                        Período: <strong>{validadesPreviewJob.date_start}</strong> até{' '}
                        <strong>{validadesPreviewJob.date_end}</strong>
                      </p>
                    </div>

                    <Button
                      type="button"
                      onClick={() => setValSyncConfirmModalOpen(true)}
                      className="h-10 px-5 gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs"
                    >
                      <Database className="w-4 h-4" />
                      <span>Sincronizar Validades</span>
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
                    <div className="p-3 bg-white rounded-lg border border-emerald-200 text-center shadow-2xs">
                      <span className="text-[10px] font-semibold uppercase text-emerald-700 block">
                        Total de Produtos
                      </span>
                      <span className="text-lg font-bold text-emerald-950 tabular-nums">
                        {validadesPreviewJob.total_informado.toLocaleString('pt-BR')}
                      </span>
                    </div>

                    <div className="p-3 bg-white rounded-lg border border-emerald-200 text-center shadow-2xs">
                      <span className="text-[10px] font-semibold uppercase text-emerald-700 block">
                        Páginas Previstas
                      </span>
                      <span className="text-lg font-bold text-emerald-950 tabular-nums">
                        {validadesPreviewJob.paginas_total}
                      </span>
                    </div>

                    <div className="p-3 bg-white rounded-lg border border-emerald-200 text-center shadow-2xs col-span-2 sm:col-span-1">
                      <span className="text-[10px] font-semibold uppercase text-emerald-700 block">
                        Tamanho do Lote
                      </span>
                      <span className="text-lg font-bold text-emerald-950 tabular-nums">
                        30 / página
                      </span>
                    </div>
                  </div>
                </div>
              )}

            {/* Durante a Sincronização: Progresso em Tempo Real */}
            {validadesSyncStatus === 'syncing' &&
              (() => {
                const paginasProcessadas = validadesSyncJob?.paginas_processadas || 0
                const paginasTotal =
                  validadesSyncJob?.paginas_total || validadesPreviewJob?.paginas_total || 1
                const rawPct = (paginasProcessadas / Math.max(1, paginasTotal)) * 100
                const displayPct = Math.min(99, Math.round(rawPct))
                const isPromoting = paginasProcessadas >= paginasTotal && paginasTotal > 0

                return (
                  <div className="p-5 rounded-xl border border-emerald-300 bg-emerald-50 space-y-4 shadow-2xs">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="flex items-center gap-3">
                        <Loader2 className="w-5 h-5 text-emerald-600 animate-spin shrink-0" />
                        <div>
                          <p className="font-bold text-sm text-emerald-950">
                            {isPromoting
                              ? 'Promovendo registros para a Base Atual...'
                              : paginasProcessadas === 0
                                ? 'Preparando a primeira página — nenhuma alteração foi realizada na Base Atual.'
                                : `Sincronizando página ${paginasProcessadas} de ${paginasTotal}...`}
                          </p>
                          <p className="text-xs text-emerald-800 mt-0.5">
                            {validadesSyncJob?.registros_lidos || 0} lidos •{' '}
                            {validadesSyncJob?.registros_validos || 0} válidos •{' '}
                            {validadesSyncJob?.registros_rejeitados || 0} rejeitados
                          </p>
                        </div>
                      </div>

                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleValCancelSync}
                        className="h-9 px-3 gap-1.5 text-xs font-semibold text-red-700 border-red-200 bg-red-50/50 hover:bg-red-100 rounded-xl"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>Cancelar</span>
                      </Button>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs text-emerald-900 font-semibold">
                        <span>
                          {isPromoting
                            ? 'Finalizando promoção atômica...'
                            : 'Progresso da Sincronização'}
                        </span>
                        <span>{displayPct}%</span>
                      </div>
                      <Progress value={displayPct} className="h-2.5 bg-emerald-200" />
                    </div>

                    {/* Métricas extras */}
                    <div className="grid grid-cols-3 gap-2.5 pt-1">
                      <div className="p-2.5 bg-white/80 rounded-lg border border-emerald-200 text-center">
                        <span className="text-[10px] font-semibold uppercase text-emerald-700 block">
                          Registros Lidos
                        </span>
                        <span className="text-sm font-bold text-emerald-950 tabular-nums">
                          {(validadesSyncJob?.registros_lidos || 0).toLocaleString('pt-BR')}
                        </span>
                      </div>
                      <div className="p-2.5 bg-white/80 rounded-lg border border-emerald-200 text-center">
                        <span className="text-[10px] font-semibold uppercase text-teal-700 block">
                          Registros Válidos
                        </span>
                        <span className="text-sm font-bold text-teal-950 tabular-nums">
                          {(validadesSyncJob?.registros_validos || 0).toLocaleString('pt-BR')}
                        </span>
                      </div>
                      <div className="p-2.5 bg-white/80 rounded-lg border border-emerald-200 text-center">
                        <span className="text-[10px] font-semibold uppercase text-rose-700 block">
                          Registros Rejeitados
                        </span>
                        <span className="text-sm font-bold text-rose-950 tabular-nums">
                          {(validadesSyncJob?.registros_rejeitados || 0).toLocaleString('pt-BR')}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })()}

            {/* Job Pausado */}
            {validadesSyncStatus === 'paused' && (
              <div className="p-5 rounded-xl border border-amber-300 bg-amber-50/80 space-y-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex items-start gap-3">
                    <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-sm text-amber-950">Sincronização Pausada</p>
                      <p className="text-xs text-amber-900 mt-0.5">
                        {validadesSyncJob?.message ||
                          'O limite temporário de requisições foi atingido. Clique em Retomar para continuar.'}
                      </p>
                      {validadesSyncJob && validadesSyncJob.paginas_processadas > 0 && (
                        <p className="text-xs text-amber-800 font-medium mt-1">
                          {validadesSyncJob.paginas_processadas} página(s) processada(s),{' '}
                          {validadesSyncJob.registros_validos} registros em staging preservados.
                          Clique em Retomar para continuar da página{' '}
                          {validadesSyncJob.paginas_processadas + 1}.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      onClick={handleValResumeSync}
                      className="h-9 px-4 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Retomar Sincronização</span>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleValCancelSync}
                      className="h-9 px-3 text-xs text-slate-600 rounded-xl"
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Conclusão com Sucesso */}
            {validadesSyncStatus === 'success' && validadesSyncJob && (
              <div className="p-5 rounded-xl border border-emerald-200 bg-emerald-50/50 space-y-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-bold text-sm text-emerald-950">
                      Sincronização Concluída com Sucesso
                    </p>
                    <p className="text-xs text-emerald-800">
                      A Base Atual de Validades foi promovida e atualizada atomicamente.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                  <div className="p-3 bg-white rounded-lg border border-emerald-200 text-center shadow-2xs">
                    <span className="text-[10px] font-semibold uppercase text-emerald-700 block">
                      Registros Consolidados
                    </span>
                    <span className="text-base font-bold text-emerald-950 tabular-nums">
                      {validadesSyncJob.registros_consolidados.toLocaleString('pt-BR')}
                    </span>
                  </div>
                  <div className="p-3 bg-white rounded-lg border border-emerald-200 text-center shadow-2xs">
                    <span className="text-[10px] font-semibold uppercase text-emerald-700 block">
                      Páginas Processadas
                    </span>
                    <span className="text-base font-bold text-emerald-950 tabular-nums">
                      {validadesSyncJob.paginas_processadas} de {validadesSyncJob.paginas_total}
                    </span>
                  </div>
                  <div className="p-3 bg-white rounded-lg border border-emerald-200 text-center shadow-2xs">
                    <span className="text-[10px] font-semibold uppercase text-emerald-700 block">
                      Total Lido
                    </span>
                    <span className="text-base font-bold text-emerald-950 tabular-nums">
                      {validadesSyncJob.registros_lidos.toLocaleString('pt-BR')}
                    </span>
                  </div>
                  <div className="p-3 bg-white rounded-lg border border-emerald-200 text-center shadow-2xs">
                    <span className="text-[10px] font-semibold uppercase text-emerald-700 block">
                      Deduplicados / Rejeitados
                    </span>
                    <span className="text-base font-bold text-emerald-950 tabular-nums">
                      {validadesSyncJob.registros_deduplicados} /{' '}
                      {validadesSyncJob.registros_rejeitados}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="h-9 px-3.5 text-xs font-semibold text-emerald-800 border-emerald-300 bg-white hover:bg-emerald-50 rounded-xl"
                  >
                    <Link to="/validades">
                      <span>Ver Base de Validades</span>
                      <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                    </Link>
                  </Button>
                </div>
              </div>
            )}

            {/* Falha na Sincronização */}
            {validadesSyncStatus === 'error' && validadesSyncJob && (
              <div className="p-5 rounded-xl border border-red-200 bg-red-50/50 space-y-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="font-bold text-sm text-red-950">
                        Falha na Sincronização de Validades
                      </p>
                      <p className="text-xs text-red-900 leading-relaxed">
                        {validadesSyncJob.message || 'Erro durante o processamento das páginas.'}
                      </p>
                      {validadesSyncJob.paginas_processadas > 0 ? (
                        <p className="text-xs font-semibold text-red-800 mt-1">
                          {validadesSyncJob.paginas_processadas} páginas processadas,{' '}
                          {validadesSyncJob.registros_validos} registros em staging preservados.
                          Clique em Retomar para continuar da página{' '}
                          {validadesSyncJob.paginas_processadas + 1}.
                        </p>
                      ) : (
                        <p className="text-[11px] text-red-800 mt-1">
                          A Base Atual anterior foi preservada integralmente sem corrupção de dados.
                        </p>
                      )}
                    </div>
                  </div>

                  {validadesSyncJob.paginas_processadas > 0 && (
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        onClick={handleValResumeSync}
                        className="h-9 px-4 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Retomar sincronização</span>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleValCancelSync}
                        className="h-9 px-3 text-xs text-slate-600 rounded-xl"
                      >
                        Cancelar
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ========================================================================= */}
        {/* SEÇÃO PRINCIPAL — "Importar Arquivo Excel"                                 */}
        {/* ========================================================================= */}
        <TabsContent value="file" className="space-y-6 mt-4">
          <div className="flex items-center justify-between pb-1">
            <div>
              <h4 className="text-sm font-bold text-slate-900">
                Importação manual de arquivo Excel
              </h4>
              <p className="text-xs text-slate-500">
                Selecione ou arraste a planilha .xlsx extraída do TradePro (Validades ou Rupturas).
              </p>
            </div>
          </div>

          {/* Pipeline visual — 7 fases */}
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500 flex-wrap">
            {getPipelineFases(importType, sheetName).map((f, i, arr) => {
              const active =
                stage === 'done'
                  ? true
                  : stage === 'importing'
                    ? i <= 6
                    : stage === 'validated'
                      ? i <= 4
                      : stage === 'parsed'
                        ? i <= 2
                        : i === 0
              const Icon = f.icon
              return (
                <span key={f.id} className="inline-flex items-center gap-2">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border',
                      active
                        ? importType === 'rupturas'
                          ? 'bg-amber-50 text-amber-800 border-amber-200'
                          : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                        : 'bg-white text-slate-400 border-slate-200',
                    )}
                  >
                    <span
                      className={cn(
                        'w-4 h-4 rounded-full flex items-center justify-center',
                        active
                          ? importType === 'rupturas'
                            ? 'bg-amber-600 text-white'
                            : 'bg-indigo-600 text-white'
                          : 'bg-slate-200 text-slate-500',
                      )}
                    >
                      {active ? (
                        <Check className="w-2.5 h-2.5" />
                      ) : (
                        <Icon className="w-2.5 h-2.5" />
                      )}
                    </span>
                    {f.label}
                  </span>
                  {i < arr.length - 1 && <ArrowRight className="w-3 h-3 text-slate-300" />}
                </span>
              )
            })}
          </div>

          {/* Erro de leitura */}
          {parseError && (
            <AlertBanner
              type="error"
              title="Não foi possível ler o arquivo"
              message={parseError}
              onRetry={reset}
              retryLabel="Tentar outro arquivo"
            />
          )}

          {/* Alerta de máquina de estados / reconciliação / reenvio */}
          {duplicateHash &&
            (stage === 'parsed' || stage === 'validated') &&
            (reconciliation?.state === 'RAW_COMPLETE_CONSOLIDATION_PENDING' ? (
              <div className="flex flex-col gap-3 p-4 rounded-xl border border-blue-300 bg-blue-50 shadow-xs">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                  <div className="flex-1 text-xs text-blue-950 leading-relaxed">
                    <p className="font-bold text-blue-900 text-sm mb-0.5">
                      Dados brutos completos — {reconciliation.rawPersisted.toLocaleString('pt-BR')}{' '}
                      seguros
                    </p>
                    <p className="text-blue-800">
                      Consolidação pendente: {reconciliation.validExpected.toLocaleString('pt-BR')}{' '}
                      válidos + {reconciliation.auditExpected.toLocaleString('pt-BR')} Auditoria.
                    </p>
                  </div>
                </div>

                {/* Cards informativos: 6 cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 pt-1">
                  <div className="p-2.5 rounded-lg bg-white/90 border border-blue-200 text-center shadow-2xs">
                    <p className="text-[10px] font-semibold text-blue-700 uppercase">
                      Brutos Seguros
                    </p>
                    <p className="text-base font-bold text-blue-900 tabular-nums">
                      {reconciliation.rawPersisted.toLocaleString('pt-BR')}
                    </p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-white/90 border border-blue-200 text-center shadow-2xs">
                    <p className="text-[10px] font-semibold text-slate-500 uppercase">
                      Pendentes Brutos
                    </p>
                    <p className="text-base font-bold text-slate-700 tabular-nums">
                      {reconciliation.rawPending.toLocaleString('pt-BR')}
                    </p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-white/90 border border-blue-200 text-center shadow-2xs">
                    <p className="text-[10px] font-semibold text-emerald-700 uppercase">
                      Base Consolidada
                    </p>
                    <p className="text-base font-bold text-emerald-800 tabular-nums">
                      {reconciliation.basePersisted.toLocaleString('pt-BR')}
                    </p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-white/90 border border-blue-200 text-center shadow-2xs">
                    <p className="text-[10px] font-semibold text-indigo-700 uppercase">
                      Pend. Consolidação
                    </p>
                    <p className="text-base font-bold text-indigo-800 tabular-nums">
                      {reconciliation.consolidationPending.toLocaleString('pt-BR')}
                    </p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-white/90 border border-blue-200 text-center shadow-2xs">
                    <p className="text-[10px] font-semibold text-rose-700 uppercase">
                      Auditoria Pendente
                    </p>
                    <p className="text-base font-bold text-rose-800 tabular-nums">
                      {Math.max(
                        0,
                        reconciliation.auditExpected - reconciliation.auditPersisted,
                      ).toLocaleString('pt-BR')}
                    </p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-white/90 border border-blue-200 text-center shadow-2xs">
                    <p className="text-[10px] font-semibold text-teal-700 uppercase">
                      Duplicações Evitadas
                    </p>
                    <p className="text-base font-bold text-teal-800 tabular-nums">
                      {reconciliation.rawPersisted.toLocaleString('pt-BR')}
                    </p>
                  </div>
                </div>
              </div>
            ) : reconciliation?.state === 'CONSOLIDATION_PARTIAL' ? (
              <div className="flex flex-col gap-3 p-4 rounded-xl border border-indigo-300 bg-indigo-50 shadow-xs">
                <div className="flex items-start gap-3">
                  <RefreshCw className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                  <div className="flex-1 text-xs text-indigo-950 leading-relaxed">
                    <p className="font-bold text-indigo-900 text-sm mb-0.5">
                      Consolidação parcial em andamento —{' '}
                      {reconciliation.basePersisted.toLocaleString('pt-BR')} consolidados
                    </p>
                    <p className="text-indigo-800">
                      Restam {reconciliation.consolidationPending.toLocaleString('pt-BR')} registros
                      pendentes de consolidação. Os dados brutos já estão 100% seguros (
                      {reconciliation.rawPersisted.toLocaleString('pt-BR')}).
                    </p>
                  </div>
                </div>

                {/* Cards informativos: 6 cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 pt-1">
                  <div className="p-2.5 rounded-lg bg-white/90 border border-indigo-200 text-center shadow-2xs">
                    <p className="text-[10px] font-semibold text-indigo-700 uppercase">
                      Brutos Seguros
                    </p>
                    <p className="text-base font-bold text-indigo-900 tabular-nums">
                      {reconciliation.rawPersisted.toLocaleString('pt-BR')}
                    </p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-white/90 border border-indigo-200 text-center shadow-2xs">
                    <p className="text-[10px] font-semibold text-slate-500 uppercase">
                      Pendentes Brutos
                    </p>
                    <p className="text-base font-bold text-slate-700 tabular-nums">
                      {reconciliation.rawPending.toLocaleString('pt-BR')}
                    </p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-white/90 border border-indigo-200 text-center shadow-2xs">
                    <p className="text-[10px] font-semibold text-emerald-700 uppercase">
                      Base Consolidada
                    </p>
                    <p className="text-base font-bold text-emerald-800 tabular-nums">
                      {reconciliation.basePersisted.toLocaleString('pt-BR')}
                    </p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-white/90 border border-indigo-200 text-center shadow-2xs">
                    <p className="text-[10px] font-semibold text-amber-700 uppercase">
                      Pend. Consolidação
                    </p>
                    <p className="text-base font-bold text-amber-800 tabular-nums">
                      {reconciliation.consolidationPending.toLocaleString('pt-BR')}
                    </p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-white/90 border border-indigo-200 text-center shadow-2xs">
                    <p className="text-[10px] font-semibold text-rose-700 uppercase">
                      Auditoria Pendente
                    </p>
                    <p className="text-base font-bold text-rose-800 tabular-nums">
                      {Math.max(
                        0,
                        reconciliation.auditExpected - reconciliation.auditPersisted,
                      ).toLocaleString('pt-BR')}
                    </p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-white/90 border border-indigo-200 text-center shadow-2xs">
                    <p className="text-[10px] font-semibold text-teal-700 uppercase">
                      Duplicações Evitadas
                    </p>
                    <p className="text-base font-bold text-teal-800 tabular-nums">
                      {(reconciliation.rawPersisted + reconciliation.basePersisted).toLocaleString(
                        'pt-BR',
                      )}
                    </p>
                  </div>
                </div>
              </div>
            ) : reconciliation?.state === 'BLOCKED_UNSAFE' ? (
              <div className="flex items-start gap-3 p-4 rounded-xl border border-red-400 bg-red-50 shadow-xs">
                <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <div className="flex-1 text-xs text-red-950 leading-relaxed">
                  <p className="font-bold text-red-900 text-sm mb-0.5">
                    Operação Bloqueada por Inconsistência
                  </p>
                  <p className="text-red-800">
                    {reconciliation.blockedReason ||
                      'Identidade insuficiente ou total de registros incerto para retomar com segurança.'}
                  </p>
                </div>
              </div>
            ) : duplicateHash.status === 'failed' && (duplicateHash.rawPersisted || 0) > 0 ? (
              <div className="flex flex-col gap-3 p-4 rounded-xl border border-amber-400 bg-amber-50 shadow-xs">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="flex-1 text-xs text-slate-700 leading-relaxed">
                    <p className="font-semibold text-amber-900 mb-1">
                      Tentativa parcial encontrada
                    </p>
                    <p className="text-amber-900">
                      Tentativa parcial encontrada —{' '}
                      {(reconciliation?.rawPersisted ?? duplicateHash.rawPersisted)?.toLocaleString(
                        'pt-BR',
                      )}{' '}
                      já persistidos,{' '}
                      {(
                        reconciliation?.rawPending ??
                        Math.max(
                          0,
                          (duplicateHash.rawExpected || rawRows.length) -
                            (duplicateHash.rawPersisted || 0),
                        )
                      ).toLocaleString('pt-BR')}{' '}
                      pendentes. Reprocesse para concluir apenas os pendentes.
                    </p>
                    <label className="flex items-center gap-2 mt-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={forceReprocess}
                        onChange={(e) => setForceReprocess(e.target.checked)}
                        className="rounded border-amber-400 text-amber-600 focus:ring-amber-500 w-4 h-4"
                      />
                      <span className="font-semibold text-amber-950">
                        Reprocessar{' '}
                        {(
                          reconciliation?.rawPending ??
                          Math.max(
                            0,
                            (duplicateHash.rawExpected || rawRows.length) -
                              (duplicateHash.rawPersisted || 0),
                          )
                        ).toLocaleString('pt-BR')}{' '}
                        pendentes
                      </span>
                    </label>
                  </div>
                </div>

                {/* Cards informativos quando reconciliation disponível */}
                {reconciliation && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 pt-1">
                    <div className="p-2.5 rounded-lg bg-white/90 border border-amber-200 text-center shadow-2xs">
                      <p className="text-[10px] font-semibold text-amber-700 uppercase">
                        Brutos Seguros
                      </p>
                      <p className="text-base font-bold text-amber-900 tabular-nums">
                        {reconciliation.rawPersisted.toLocaleString('pt-BR')}
                      </p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-white/90 border border-amber-200 text-center shadow-2xs">
                      <p className="text-[10px] font-semibold text-slate-500 uppercase">
                        Pendentes Brutos
                      </p>
                      <p className="text-base font-bold text-slate-700 tabular-nums">
                        {reconciliation.rawPending.toLocaleString('pt-BR')}
                      </p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-white/90 border border-amber-200 text-center shadow-2xs">
                      <p className="text-[10px] font-semibold text-emerald-700 uppercase">
                        Base Consolidada
                      </p>
                      <p className="text-base font-bold text-emerald-800 tabular-nums">
                        {reconciliation.basePersisted.toLocaleString('pt-BR')}
                      </p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-white/90 border border-amber-200 text-center shadow-2xs">
                      <p className="text-[10px] font-semibold text-indigo-700 uppercase">
                        Pend. Consolidação
                      </p>
                      <p className="text-base font-bold text-indigo-800 tabular-nums">
                        {reconciliation.consolidationPending.toLocaleString('pt-BR')}
                      </p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-white/90 border border-amber-200 text-center shadow-2xs">
                      <p className="text-[10px] font-semibold text-rose-700 uppercase">
                        Auditoria Pendente
                      </p>
                      <p className="text-base font-bold text-rose-800 tabular-nums">
                        {Math.max(
                          0,
                          reconciliation.auditExpected - reconciliation.auditPersisted,
                        ).toLocaleString('pt-BR')}
                      </p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-white/90 border border-amber-200 text-center shadow-2xs">
                      <p className="text-[10px] font-semibold text-teal-700 uppercase">
                        Duplicações Evitadas
                      </p>
                      <p className="text-base font-bold text-teal-800 tabular-nums">
                        {reconciliation.rawPersisted.toLocaleString('pt-BR')}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-start gap-3 p-4 rounded-xl border border-amber-300 bg-amber-50">
                <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="flex-1 text-xs text-slate-700 leading-relaxed">
                  <p className="font-semibold text-amber-800 mb-1">Possível reenvio de arquivo</p>
                  <p>
                    Este arquivo (hash idêntico) já foi importado e concluído
                    {duplicateHash.created ? ` em ${fmtDate(duplicateHash.created)}` : ''}. Para
                    evitar duplicação de somas, o sistema não reprocessa automaticamente.
                  </p>
                  <label className="flex items-center gap-2 mt-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={forceReprocess}
                      onChange={(e) => setForceReprocess(e.target.checked)}
                      className="rounded border-slate-300"
                    />
                    <span className="font-medium text-amber-800">
                      Reprocessar explicitamente (substitui importação anterior)
                    </span>
                  </label>
                </div>
              </div>
            ))}

          {/* Upload area */}
          {stage === 'idle' && !parseError && (
            <div
              onDragOver={(e) => {
                if (!isImporting && !isParsing) e.preventDefault()
              }}
              onDrop={(e) => {
                if (isImporting || isParsing) return
                handleDrop(e)
              }}
              className={cn(
                'border-2 border-dashed rounded-2xl bg-white p-8 sm:p-12 text-center transition-colors',
                isImporting || isParsing
                  ? 'border-slate-200 opacity-60 cursor-not-allowed'
                  : 'border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/30 cursor-pointer',
              )}
              onClick={() => {
                if (!isImporting && !isParsing) fileInputRef.current?.click()
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                disabled={isImporting || isParsing}
                onChange={handleInputChange}
              />
              <div className="flex flex-col items-center gap-3">
                <div className="w-14 h-14 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center">
                  {isParsing ? (
                    <Loader2 className="w-7 h-7 animate-spin" />
                  ) : (
                    <FileUp className="w-7 h-7" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {isParsing
                      ? 'Lendo arquivo...'
                      : 'Arraste um arquivo Excel do TradePro (Validades ou Rupturas) aqui'}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Suporta exportações de <code className="text-indigo-600">Validades</code> (aba
                    “Pesquisa Validade”) ou <code className="text-amber-600">Rupturas</code> (aba
                    “Rupturas”).
                  </p>
                </div>
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  className="mt-2 bg-indigo-600 hover:bg-indigo-700 text-white h-9 gap-1.5"
                  disabled={isParsing || isImporting}
                >
                  <Upload className="w-4 h-4" />
                  Selecionar arquivo
                </Button>
              </div>
            </div>
          )}

          {/* Pré-visualização do arquivo + estrutura */}
          {stage !== 'idle' && fileInfo && (
            <div className="space-y-4">
              {/* FileInfo card */}
              <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                    <FileSpreadsheet className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{fileInfo.name}</p>
                    <p className="text-xs text-slate-500">
                      {fmtBytes(fileInfo.size)} • {rawRows.length} linhas úteis • selecionado em{' '}
                      {fmtDate(fileInfo.selectedAt)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  {dataArquivo && (
                    <Badge variant="outline" className="text-xs">
                      Data Arquivo: {dataArquivo}
                    </Badge>
                  )}
                  <Badge variant="outline" className="text-xs">
                    {detectedHeaders.length} colunas
                  </Badge>
                  {structure.isStructureValid ? (
                    <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">
                      <CheckCircle2 className="w-3 h-3 mr-1" /> Estrutura OK
                    </Badge>
                  ) : (
                    <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs">
                      <AlertTriangle className="w-3 h-3 mr-1" /> Estrutura incompleta
                    </Badge>
                  )}
                </div>
              </div>

              {/* Novos totais da prévia detalhada (Parser Esparso, Resolução de Loja e Auditoria) */}
              {previewStats && (
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <h5 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-indigo-600" />
                      Prévia do Arquivo & Reconhecimento de Lojas
                    </h5>
                    <span className="text-[11px] text-slate-400">
                      Parser esparso de alta performance
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-9 gap-2 text-center">
                    <div className="p-2 rounded-lg bg-slate-50 border border-slate-200">
                      <p className="text-[10px] font-semibold text-slate-500 uppercase">
                        Declaradas
                      </p>
                      <p className="text-base font-bold text-slate-900 tabular-nums">
                        {previewStats.declaredPhysicalRows.toLocaleString('pt-BR')}
                      </p>
                    </div>
                    <div className="p-2 rounded-lg bg-indigo-50 border border-indigo-200">
                      <p className="text-[10px] font-semibold text-indigo-700 uppercase">Úteis</p>
                      <p className="text-base font-bold text-indigo-800 tabular-nums">
                        {previewStats.usefulRows.toLocaleString('pt-BR')}
                      </p>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-50 border border-slate-200">
                      <p className="text-[10px] font-semibold text-slate-500 uppercase">
                        Vazias Ignoradas
                      </p>
                      <p className="text-base font-bold text-slate-600 tabular-nums">
                        {previewStats.ignoredBlankRows.toLocaleString('pt-BR')}
                      </p>
                    </div>
                    <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200">
                      <p className="text-[10px] font-semibold text-emerald-700 uppercase">
                        Com Código
                      </p>
                      <p className="text-base font-bold text-emerald-800 tabular-nums">
                        {previewStats.comCodigo.toLocaleString('pt-BR')}
                      </p>
                    </div>
                    <div className="p-2 rounded-lg bg-teal-50 border border-teal-200">
                      <p className="text-[10px] font-semibold text-teal-700 uppercase">
                        Resolvidas
                      </p>
                      <p className="text-base font-bold text-teal-800 tabular-nums">
                        {previewStats.resolvidas.toLocaleString('pt-BR')}
                      </p>
                    </div>
                    <div className="p-2 rounded-lg bg-amber-50 border border-amber-200">
                      <p className="text-[10px] font-semibold text-amber-700 uppercase">Ambíguas</p>
                      <p className="text-base font-bold text-amber-800 tabular-nums">
                        {previewStats.ambiguas.toLocaleString('pt-BR')}
                      </p>
                    </div>
                    <div className="p-2 rounded-lg bg-orange-50 border border-orange-200">
                      <p className="text-[10px] font-semibold text-orange-700 uppercase">
                        Não Resolvidas
                      </p>
                      <p className="text-base font-bold text-orange-800 tabular-nums">
                        {previewStats.naoResolvidas.toLocaleString('pt-BR')}
                      </p>
                    </div>
                    <div className="p-2 rounded-lg bg-emerald-50/70 border border-emerald-300">
                      <p className="text-[10px] font-semibold text-emerald-800 uppercase">
                        Válidas
                      </p>
                      <p className="text-base font-bold text-emerald-700 tabular-nums">
                        {previewStats.validas.toLocaleString('pt-BR')}
                      </p>
                    </div>
                    <div className="p-2 rounded-lg bg-rose-50 border border-rose-200">
                      <p className="text-[10px] font-semibold text-rose-700 uppercase">
                        Em Auditoria
                      </p>
                      <p className="text-base font-bold text-rose-800 tabular-nums">
                        {previewStats.emAuditoria.toLocaleString('pt-BR')}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Alerta preventivo de arquivo grande (>20MB ou >10.000 linhas) com confirmação explícita */}
              {largeFileWarning && (
                <div className="flex items-start gap-3 p-4 rounded-xl border border-blue-300 bg-blue-50/80 shadow-2xs">
                  <Info className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" />
                  <div className="flex-1 text-xs text-blue-950 leading-relaxed space-y-2">
                    <div>
                      <p className="font-bold text-blue-950 mb-0.5">Aviso de volume elevado</p>
                      <p className="text-blue-900">{largeFileWarning}</p>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer pt-1">
                      <input
                        type="checkbox"
                        checked={isLargeFileConfirmed}
                        onChange={(e) => setIsLargeFileConfirmed(e.target.checked)}
                        className="rounded border-blue-400 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                      />
                      <span className="font-semibold text-blue-950">
                        Compreendo e confirmo a importação deste volume com concorrência segura (2
                        workers)
                      </span>
                    </label>
                  </div>
                </div>
              )}

              {/* Alerta de colunas obrigatórias ausentes */}
              {structure.missingRequired.length > 0 && (
                <AlertBanner
                  type="warning"
                  title="Colunas obrigatórias ausentes"
                  message={`As seguintes colunas obrigatórias não foram detectadas automaticamente: ${structure.missingRequired
                    .map((c) => c.label)
                    .join(', ')}. Mapeie manualmente abaixo se existirem com outro nome.`}
                />
              )}
              {/* Mapeamento de colunas (apenas para Validades) */}
              {importType === 'validades' && (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Table2 className="w-4 h-4 text-indigo-600" />
                      <h4 className="text-sm font-bold text-slate-900">
                        Mapeamento de colunas (TradePro - Validades)
                      </h4>
                    </div>
                    <span className="text-xs text-slate-400">
                      {EXPECTED_COLUMNS.length} campos • {REQUIRED_COLUMNS.length} obrigatórios
                    </span>
                  </div>
                  <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[420px] overflow-y-auto">
                    {EXPECTED_COLUMNS.map((col) => {
                      const value = mapping[col.key as string]
                      const isRequired = col.required
                      const isMissing = isRequired && !value
                      return (
                        <div
                          key={col.key as string}
                          className={cn(
                            'flex flex-col gap-1.5 p-2.5 rounded-lg border',
                            isMissing
                              ? 'border-amber-200 bg-amber-50/40'
                              : 'border-slate-200 bg-slate-50/40',
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <label className="text-xs font-semibold text-slate-700">
                              {col.label}
                              {isRequired && <span className="text-red-500 ml-0.5">*</span>}
                            </label>
                            <span className="text-[10px] text-slate-400 uppercase tracking-wider">
                              {col.type}
                            </span>
                          </div>
                          <Select
                            value={value ?? '__none__'}
                            onValueChange={(v) => handleMappingChange(col.key as string, v)}
                          >
                            <SelectTrigger className="h-8 text-xs bg-white">
                              <SelectValue placeholder="— não mapeado —" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">— não mapeado —</SelectItem>
                              {detectedHeaders.map((h) => (
                                <SelectItem key={h} value={h}>
                                  {h}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )
                    })}
                  </div>
                  <div className="p-4 border-t border-slate-100 flex items-center justify-between gap-2 bg-slate-50/60">
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <Info className="w-3.5 h-3.5" />
                      <span>
                        Identificadores (Cód., CPF/CNPJ) são tratados como texto, preservando zeros
                        à esquerda.
                      </span>
                    </div>
                    <Button
                      size="sm"
                      onClick={runValidation}
                      disabled={!canValidate}
                      className="h-9 gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Validar dados
                    </Button>
                  </div>
                </div>
              )}

              {importType === 'rupturas' && (
                <div className="bg-amber-50/60 rounded-xl border border-amber-200 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="w-4 h-4 text-amber-600" />
                    <h4 className="text-sm font-bold text-amber-900">
                      Pipeline de Rupturas (TradePro)
                    </h4>
                  </div>
                  <p className="text-xs text-amber-800 leading-relaxed">
                    As colunas de Rupturas foram mapeadas e validadas automaticamente: Data Visita,
                    Atividade (Produto), Motivo, Razão Social, CNPJ, Cidade, Estado, Cód. Cliente,
                    Cliente, Categoria, Observação e Colaborador.
                  </p>
                </div>
              )}

              {/* Resumo da validação de dados */}
              {validationReport && (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="p-4 border-b border-slate-100 flex items-center gap-2">
                    <Database className="w-4 h-4 text-indigo-600" />
                    <h4 className="text-sm font-bold text-slate-900">Validação de dados</h4>
                  </div>
                  <div className="p-4 space-y-4">
                    {/* Contadores */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="p-3 rounded-lg border border-slate-200 bg-slate-50/50">
                        <p className="text-[11px] font-semibold text-slate-500 uppercase">Total</p>
                        <p className="text-xl font-bold text-slate-900 tabular-nums">
                          {validationReport.totalRows}
                        </p>
                      </div>
                      <div className="p-3 rounded-lg border border-emerald-200 bg-emerald-50/50">
                        <p className="text-[11px] font-semibold text-emerald-600 uppercase">
                          Válidos
                        </p>
                        <p className="text-xl font-bold text-emerald-700 tabular-nums">
                          {validationReport.validRows}
                        </p>
                      </div>
                      <div className="p-3 rounded-lg border border-red-200 bg-red-50/50">
                        <p className="text-[11px] font-semibold text-red-600 uppercase">
                          Inválidos
                        </p>
                        <p className="text-xl font-bold text-red-700 tabular-nums">
                          {validationReport.invalidRows}
                        </p>
                      </div>
                      <div className="p-3 rounded-lg border border-amber-200 bg-amber-50/50">
                        <p className="text-[11px] font-semibold text-amber-600 uppercase">
                          Alertas
                        </p>
                        <p className="text-xl font-bold text-amber-700 tabular-nums">
                          {validationReport.warningRows}
                        </p>
                      </div>
                    </div>

                    {/* Barra de progresso (importação) com aviso "Não feche esta página" e status 429 */}
                    {stage === 'importing' && (
                      <div className="space-y-2.5 p-4 bg-indigo-50/60 rounded-xl border border-indigo-200 shadow-2xs">
                        <div className="flex items-center justify-between text-xs text-slate-800">
                          <span className="font-semibold flex items-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                            {progressState?.message || 'Processando pipeline...'}
                          </span>
                          <span className="tabular-nums font-bold text-indigo-700 text-sm">
                            {Math.round(importProgress)}%
                          </span>
                        </div>
                        <Progress value={importProgress} className="h-2.5 bg-indigo-100" />

                        {/* Aviso obrigatório de não fechar a página */}
                        <div className="flex items-center justify-between text-[11px] text-slate-600 pt-1 flex-wrap gap-2">
                          <span className="inline-flex items-center gap-1.5 font-medium text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            <strong>Aviso importante:</strong> Não feche nem recarregue esta página
                            durante a gravação.
                          </span>
                          {progressState && progressState.total > 0 && (
                            <span className="tabular-nums font-medium">
                              {progressState.processed.toLocaleString('pt-BR')} de{' '}
                              {progressState.total.toLocaleString('pt-BR')} registros
                            </span>
                          )}
                        </div>

                        {/* Detalhes de Retry e Rate Limit */}
                        {progressState && (progressState.retriesCount || 0) > 0 && (
                          <div className="flex items-center gap-2 text-[11px] pt-1">
                            <Badge
                              variant="outline"
                              className="bg-blue-50 text-blue-700 border-blue-200 font-semibold text-[10px]"
                            >
                              <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                              {progressState.retriesCount} retry(s) transitório(s) recuperado(s)
                            </Badge>
                            {progressState.isRateLimited && (
                              <Badge className="bg-amber-100 text-amber-800 border-amber-200 font-semibold text-[10px]">
                                <Clock className="w-3 h-3 mr-1" />
                                Aguardando o banco liberar novas gravações (Rate Limit 429)
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Lista de issues (top 8) */}
                    {validationReport.issues.length > 0 && (
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        <p className="text-xs font-semibold text-slate-600">
                          Detalhes ({validationReport.issues.length}{' '}
                          {validationReport.issues.length === 1 ? 'aviso' : 'avisos'})
                        </p>
                        {validationReport.issues.slice(0, 8).map((issue, i) => (
                          <div
                            key={i}
                            className={cn(
                              'flex items-start gap-2 text-xs p-2 rounded-md',
                              issue.severity === 'error'
                                ? 'bg-red-50/60 text-red-800'
                                : 'bg-amber-50/60 text-amber-800',
                            )}
                          >
                            {issue.severity === 'error' ? (
                              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                            ) : (
                              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                            )}
                            <span>
                              <strong>Linha {issue.rowIndex + 2}</strong>
                              {issue.field ? ` • ${issue.field}` : ''}: {issue.message}
                            </span>
                          </div>
                        ))}
                        {validationReport.issues.length > 8 && (
                          <p className="text-[11px] text-slate-400 pl-2">
                            +{validationReport.issues.length - 8} outros...
                          </p>
                        )}
                      </div>
                    )}

                    {/* Ação de importar */}
                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                      <p className="text-xs text-slate-500">
                        {validationReport.validRows} registro(s) prontos para processar.
                        {duplicateHash && (
                          <span className="text-amber-700 font-medium">
                            {' '}
                            ⚠ Reenvio detectado{forceReprocess ? ' (reprocessar ativo)' : ''}.
                          </span>
                        )}
                      </p>
                      <Button
                        size="sm"
                        onClick={handleImport}
                        disabled={
                          isImporting ||
                          !canImport ||
                          reconciliation?.state === 'BLOCKED_UNSAFE' ||
                          (!!duplicateHash && !forceReprocess && duplicateHash.status !== 'failed')
                        }
                        className="h-9 gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white"
                      >
                        {isImporting ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Processando...
                          </>
                        ) : duplicateHash?.status === 'failed' && reconciliation ? (
                          reconciliation.state === 'RAW_PARTIAL' ? (
                            <>
                              <RefreshCw className="w-4 h-4" />
                              Reprocessar {reconciliation.rawPending.toLocaleString('pt-BR')}{' '}
                              pendentes
                            </>
                          ) : reconciliation.state === 'RAW_COMPLETE_CONSOLIDATION_PENDING' ||
                            reconciliation.state === 'CONSOLIDATION_PARTIAL' ? (
                            <>
                              <RefreshCw className="w-4 h-4" />
                              Continuar consolidação de{' '}
                              {reconciliation.consolidationPending.toLocaleString('pt-BR')}{' '}
                              registro(s)
                            </>
                          ) : reconciliation.state === 'BLOCKED_UNSAFE' ? (
                            <>
                              <AlertCircle className="w-4 h-4" />
                              Importação Bloqueada
                            </>
                          ) : (
                            <>
                              <Download className="w-4 h-4" />
                              Processar {validationReport.validRows.toLocaleString('pt-BR')}{' '}
                              registro(s)
                            </>
                          )
                        ) : duplicateHash?.status === 'failed' &&
                          (duplicateHash.rawPersisted || 0) > 0 ? (
                          <>
                            <RefreshCw className="w-4 h-4" />
                            Reprocessar{' '}
                            {Math.max(
                              0,
                              (duplicateHash.rawExpected || rawRows.length) -
                                (duplicateHash.rawPersisted || 0),
                            ).toLocaleString('pt-BR')}{' '}
                            pendentes
                          </>
                        ) : (
                          <>
                            <Download className="w-4 h-4" />
                            Processar {validationReport.validRows.toLocaleString('pt-BR')}{' '}
                            registro(s)
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Resumo pós-processamento (pipeline) */}
              {pipelineResult && stage === 'done' && (
                <div className="bg-white rounded-xl border border-indigo-200 overflow-hidden">
                  <div className="p-4 border-b border-indigo-100 flex items-center gap-2 bg-indigo-50/40">
                    <Layers className="w-4 h-4 text-indigo-600" />
                    <h4 className="text-sm font-bold text-slate-900">Resumo do processamento</h4>
                    <span className="text-[11px] text-slate-400 font-medium ml-auto hidden sm:inline">
                      Brutos → Válidos → 90 dias → Dedup → Base Atual
                    </span>
                  </div>
                  <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                    <div className="p-3 rounded-lg border border-slate-200 bg-slate-50/50">
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 uppercase">
                        <Database className="w-3 h-3" /> Brutos
                      </div>
                      <p className="text-xl font-bold text-slate-900 tabular-nums">
                        {pipelineResult.summary.totalBrutos}
                      </p>
                    </div>
                    <div className="p-3 rounded-lg border border-indigo-200 bg-indigo-50/50">
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-indigo-600 uppercase">
                        <CheckCircle2 className="w-3 h-3" /> Válidos
                      </div>
                      <p className="text-xl font-bold text-indigo-700 tabular-nums">
                        {pipelineResult.summary.validos}
                      </p>
                    </div>
                    <div className="p-3 rounded-lg border border-blue-200 bg-blue-50/50">
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-blue-600 uppercase">
                        <Filter className="w-3 h-3" /> 90 dias
                      </div>
                      <p className="text-xl font-bold text-blue-700 tabular-nums">
                        {pipelineResult.summary.filtrados90Dias}
                      </p>
                    </div>
                    <div className="p-3 rounded-lg border border-amber-200 bg-amber-50/50">
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-600 uppercase">
                        <GitMerge className="w-3 h-3" /> Dedup
                      </div>
                      <p className="text-xl font-bold text-amber-700 tabular-nums">
                        {pipelineResult.summary.consolidados}
                      </p>
                    </div>
                    <div className="p-3 rounded-lg border border-emerald-200 bg-emerald-50/50">
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600 uppercase">
                        <CheckCircle2 className="w-3 h-3" /> Base Atual
                      </div>
                      <p className="text-xl font-bold text-emerald-700 tabular-nums">
                        {pipelineResult.summary.baseAtual}
                      </p>
                    </div>
                  </div>
                  <div className="px-4 pb-4 space-y-1">
                    {pipelineResult.summary.rejeitados > 0 && (
                      <p className="text-[11px] text-red-600 font-medium">
                        {pipelineResult.summary.rejeitados} registro(s) rejeitado(s) na validação
                        (campos obrigatórios ausentes / quantidade negativa) — não processados.
                      </p>
                    )}
                    {pipelineResult.summary.quantidadeZeroRemovidos > 0 && (
                      <p className="text-[11px] text-slate-500">
                        {pipelineResult.summary.quantidadeZeroRemovidos} ocorrência(s) com
                        quantidade zero não exibida(s) na Base Atual (registro bruto preservado).
                      </p>
                    )}
                    <p className="text-[11px] text-slate-400">
                      Consolidados = registros legítimos do pipeline (filtro 90 dias, deduplicação
                      por Chave Dedup, remoção de quantidade zero). Não são “ignorados”.
                    </p>
                  </div>
                </div>
              )}

              {/* Resultado pós-importação com selo verde integral ou falha parcial vermelho/âmbar */}
              {stage === 'done' && importResult && (
                <div
                  className={cn(
                    'p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4',
                    importResult.isFullSuccess
                      ? 'bg-emerald-50/90 border-emerald-300 text-emerald-900'
                      : 'bg-amber-50/90 border-amber-300 text-amber-900',
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        'w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5',
                        importResult.isFullSuccess
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-amber-100 text-amber-800',
                      )}
                    >
                      {importResult.isFullSuccess ? (
                        <CheckCircle2 className="w-5 h-5" />
                      ) : (
                        <AlertTriangle className="w-5 h-5" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-sm">
                          {importResult.isFullSuccess
                            ? 'Importação concluída com sucesso integral (100% persistido)'
                            : 'Importação finalizada com observações'}
                        </p>
                        <Badge
                          className={cn(
                            'text-[10px] font-bold py-0.5 px-2',
                            importResult.isFullSuccess
                              ? 'bg-emerald-600 text-white'
                              : 'bg-amber-600 text-white',
                          )}
                        >
                          {importResult.isFullSuccess ? '100% Gravado' : 'Falha Parcial'}
                        </Badge>
                      </div>
                      <p className="text-xs mt-1">
                        {importResult.imported.toLocaleString('pt-BR')} registro(s) confirmados na
                        Base Atual
                        {importResult.skipped > 0
                          ? ` • ${importResult.skipped.toLocaleString('pt-BR')} filtrados/rejeitados`
                          : ''}
                        {importResult.errors > 0 ? ` • ${importResult.errors} erro(s)` : ''}
                        {importResult.retriesCount
                          ? ` • ${importResult.retriesCount} retry(s) automáticos executados com sucesso`
                          : ''}
                        .
                      </p>
                    </div>
                  </div>

                  {errorsList.length > 0 && (
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          exportErrorsXLSX(errorsList, `erros_import_${fileInfo.name}.xlsx`)
                        }
                        className="text-xs h-8 px-2.5 gap-1.5 bg-white border-amber-300 text-amber-900 hover:bg-amber-50"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Baixar Erros (XLSX)
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          exportErrorsCSV(errorsList, `erros_import_${fileInfo.name}.csv`)
                        }
                        className="text-xs h-8 px-2.5 gap-1.5 bg-white border-amber-300 text-amber-900 hover:bg-amber-50"
                      >
                        <Download className="w-3.5 h-3.5" />
                        CSV
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {stage === 'validated' && importResult && importResult.errorDetails && (
                <div className="p-4 rounded-xl border border-red-300 bg-red-50/90 text-red-900 space-y-3 shadow-xs">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl bg-red-100 text-red-700 flex items-center justify-center shrink-0 mt-0.5">
                        <AlertCircle className="w-5 h-5" />
                      </div>
                      <div className="space-y-1.5">
                        <p className="font-bold text-sm text-red-950">
                          Falha na gravação:{' '}
                          {importResult.rawRows !== undefined &&
                          importResult.totalExpectedRaw !== undefined
                            ? `${importResult.rawRows.toLocaleString('pt-BR')} de ${importResult.totalExpectedRaw.toLocaleString('pt-BR')} registros brutos foram persistidos.`
                            : `${importResult.errors} registro(s) falharam.`}
                        </p>
                        <p className="text-xs text-red-900 leading-relaxed">
                          {importResult.errors} falharam após múltiplas tentativas de retry. Motivo
                          principal:{' '}
                          <span className="font-semibold">rate limit do banco (429)</span> ou
                          instabilidade transitória.
                        </p>
                        {importResult.rawRows !== undefined && importResult.rawRows > 0 && (
                          <div className="p-2.5 rounded-lg bg-red-100/70 border border-red-200 text-xs text-red-950 space-y-1">
                            <p className="font-semibold">
                              ✓ Os {importResult.rawRows.toLocaleString('pt-BR')} registros já
                              gravados estão seguros no banco.
                            </p>
                            <p className="text-red-800">
                              Os registros brutos já persistidos <strong>NÃO</strong> serão
                              perdidos. Marque &quot;Reprocessar&quot; e envie o mesmo arquivo para
                              retomar apenas os pendentes de forma idempotente.
                            </p>
                          </div>
                        )}
                        <p className="text-[11px] text-red-700 italic">
                          {importResult.errorDetails}
                        </p>
                      </div>
                    </div>

                    {errorsList.length > 0 && (
                      <div className="flex items-center gap-2 pt-1 sm:pt-0">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            exportErrorsXLSX(errorsList, `relatorio_erros_${fileInfo.name}.xlsx`)
                          }
                          className="text-xs h-8 px-2.5 gap-1.5 bg-white border-red-300 text-red-900 hover:bg-red-50"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Baixar relatório de erros (XLSX)
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            exportErrorsCSV(errorsList, `relatorio_erros_${fileInfo.name}.csv`)
                          }
                          className="text-xs h-8 px-2.5 gap-1.5 bg-white border-red-300 text-red-900 hover:bg-red-50"
                        >
                          <Download className="w-3.5 h-3.5" />
                          CSV
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Histórico de importações */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-indigo-600" />
                <h4 className="text-sm font-bold text-slate-900">
                  Histórico de importações (Arquivos)
                </h4>
              </div>
              <div className="flex items-center gap-3">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isExportingHistory || history.length === 0}
                      className="h-8 px-2.5 gap-1.5 text-xs font-semibold border-slate-200 text-slate-700 hover:bg-slate-50"
                    >
                      <Download className="w-3.5 h-3.5 text-slate-500" />
                      <span>{isExportingHistory ? 'Exportando...' : 'Exportar Histórico'}</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem
                      onClick={() => handleExportHistory('xlsx')}
                      className="gap-2 text-xs cursor-pointer"
                    >
                      <Download className="w-4 h-4 text-emerald-600" />
                      <span>Excel (.xlsx)</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleExportHistory('csv')}
                      className="gap-2 text-xs cursor-pointer"
                    >
                      <FileSpreadsheet className="w-4 h-4 text-indigo-600" />
                      <span>CSV (.csv UTF-8)</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <span className="text-xs text-slate-400">{history.length} registro(s)</span>
              </div>
            </div>

            {historyLoading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 rounded-lg" />
                ))}
              </div>
            ) : history.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon={History}
                  title="Nenhuma importação realizada"
                  description="As importações concluídas aparecerão aqui com data, arquivo e status."
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Data</TableHead>
                      <TableHead className="text-xs">Tipo</TableHead>
                      <TableHead className="text-xs">Arquivo</TableHead>
                      <TableHead className="text-xs text-right">Importados</TableHead>
                      <TableHead className="text-xs text-right">Consolidados</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs">Observação / Erro</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((h) => {
                      const statusStr = String(h.status)
                      const isFailed = statusStr === 'failed' || statusStr === 'error'

                      // Tenta extrair informação útil do errors_json._meta
                      let errorReason = '—'
                      if (isFailed) {
                        const raw = (h as unknown as { errors_json?: unknown }).errors_json
                        if (raw) {
                          try {
                            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
                            const meta = parsed?._meta
                            if (meta) {
                              const rp = meta.rawPersisted
                              const re = meta.rawExpected
                              if (typeof rp === 'number' && typeof re === 'number') {
                                if (rp === re) {
                                  errorReason = `Brutos completos (${rp}/${re}); consolidação pendente`
                                } else if (rp > 0) {
                                  errorReason = `Brutos: ${rp}/${re} persistidos; consolidação pendente`
                                } else {
                                  errorReason = `Falha na gravação bruta: 0/${re}`
                                }
                              }
                            }
                          } catch {
                            // ignora erro de parse
                          }
                        }
                        if (
                          errorReason === '—' &&
                          (h as unknown as { error_message?: string; erro?: string }).error_message
                        ) {
                          errorReason = (h as unknown as { error_message?: string }).error_message!
                        } else if (
                          errorReason === '—' &&
                          (h as unknown as { erro?: string }).erro
                        ) {
                          errorReason = (h as unknown as { erro?: string }).erro!
                        } else if (errorReason === '—') {
                          errorReason = 'Erro desconhecido'
                        }
                      }

                      return (
                        <TableRow key={h.id}>
                          <TableCell className="text-xs text-slate-600 whitespace-nowrap tabular-nums">
                            {fmtDate(h.created)}
                          </TableCell>
                          <TableCell className="text-xs">
                            <Badge
                              variant="outline"
                              className={cn(
                                'text-[10px] font-bold uppercase',
                                h.tipo === 'rupturas'
                                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                                  : 'bg-indigo-50 text-indigo-700 border-indigo-200',
                              )}
                            >
                              {h.tipo === 'rupturas' ? 'Rupturas' : 'Validades'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs font-medium text-slate-900">
                            <div className="flex items-center gap-2 min-w-0">
                              <FileSpreadsheet className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span className="truncate max-w-[200px]">{h.file_name}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs text-right tabular-nums text-emerald-700 font-semibold">
                            {h.imported_rows}
                          </TableCell>
                          <TableCell className="text-xs text-right tabular-nums text-slate-500">
                            {h.skipped_rows}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={cn(
                                'text-[11px] font-semibold',
                                statusBadgeClass(h.status),
                              )}
                            >
                              {statusLabel(h.status)}
                            </Badge>
                          </TableCell>
                          <TableCell
                            className="text-xs text-slate-500 max-w-[180px] truncate"
                            title={errorReason !== '—' ? errorReason : undefined}
                          >
                            {isFailed ? (
                              <span className="text-red-600 font-medium">{errorReason}</span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          {/* Resumo pós-processamento de Rupturas */}
          {importType === 'rupturas' && rupturasResult && stage === 'done' && (
            <div className="bg-white rounded-xl border border-amber-200 overflow-hidden">
              <div className="p-4 border-b border-amber-100 flex items-center gap-2 bg-amber-50/40">
                <Layers className="w-4 h-4 text-amber-600" />
                <h4 className="text-sm font-bold text-slate-900">
                  Resumo do processamento de Rupturas
                </h4>
                <span className="text-[11px] text-slate-400 font-medium ml-auto hidden sm:inline">
                  Lidos → Válidos → Dedup (Data Visita) → Base Atual
                </span>
              </div>
              <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-lg border border-slate-200 bg-slate-50/50">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 uppercase">
                    <Database className="w-3 h-3" /> Lidos
                  </div>
                  <p className="text-xl font-bold text-slate-900 tabular-nums">
                    {rupturasResult.total_rows_read}
                  </p>
                </div>
                <div className="p-3 rounded-lg border border-amber-200 bg-amber-50/50">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-600 uppercase">
                    <CheckCircle2 className="w-3 h-3" /> Válidos
                  </div>
                  <p className="text-xl font-bold text-amber-700 tabular-nums">
                    {rupturasResult.total_rows_valid}
                  </p>
                </div>
                <div className="p-3 rounded-lg border border-red-200 bg-red-50/50">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-red-600 uppercase">
                    <AlertCircle className="w-3 h-3" /> Inválidos
                  </div>
                  <p className="text-xl font-bold text-red-700 tabular-nums">
                    {rupturasResult.total_rows_invalid}
                  </p>
                </div>
                <div className="p-3 rounded-lg border border-emerald-200 bg-emerald-50/50">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600 uppercase">
                    <CheckCircle2 className="w-3 h-3" /> Base Atual
                  </div>
                  <p className="text-xl font-bold text-emerald-700 tabular-nums">
                    {rupturasResult.total_occurrences_generated}
                  </p>
                </div>
              </div>
              <div className="px-4 pb-4 text-xs text-slate-500">
                {rupturasResult.total_occurrences_generated} ruptura(s) persistida(s) na coleção{' '}
                <code className="text-amber-700 font-medium">rupturas_base</code> e registradas no
                histórico.
              </div>
            </div>
          )}

          {/* Nota informativa TradePro e Rodapé */}
          <div className="flex items-start gap-3 p-4 rounded-xl border border-blue-200 bg-blue-50/50">
            <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
              <Info className="w-4 h-4" />
            </div>
            <div className="text-xs text-slate-700 leading-relaxed">
              <p className="font-semibold text-slate-900 mb-0.5">
                Pipeline TradePro (Validades &amp; Rupturas via Excel)
              </p>
              <p>
                O importador identifica automaticamente o tipo de arquivo TradePro: para{' '}
                <strong>Validades</strong> (aba “Pesquisa Validade”), processa os campos
                obrigatórios da extração TradePro (Razão Social, Realizado, Produto, Cliente,
                Quantidade e Validade), calcula os status operacionais e aplica deduplicação em 2
                etapas; para <strong>Rupturas</strong> (aba “Rupturas” ou exportação
                correspondente), padroniza os motivos, valida as informações da visita/produto e
                atualiza a Base Atual de Rupturas com histórico completo.
              </p>
              <p className="mt-2 text-slate-500 italic text-[11px]">
                Integração TradePro — aguardando credenciais e homologação.
              </p>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Modal de Confirmação para Sincronização de Rupturas */}
      <Modal
        isOpen={syncConfirmModalOpen}
        onClose={() => setSyncConfirmModalOpen(false)}
        title="Confirmar Sincronização de Rupturas"
        description="Atualização segura da Base Atual de Rupturas"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSyncConfirmModalOpen(false)}
              className="h-9 px-3 text-xs rounded-xl"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleConfirmStartSync}
              className="h-9 px-4 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-xs"
            >
              Confirmar e Sincronizar
            </Button>
          </div>
        }
      >
        <div className="space-y-4 text-xs text-slate-600">
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold text-sm text-amber-950">Substituição da Base Atual</p>
              <p className="text-amber-900 leading-relaxed">
                Esta ação processará{' '}
                <strong>{rupturasPreviewJob?.total_informado.toLocaleString('pt-BR')}</strong>{' '}
                registros de rupturas ({rupturasPreviewJob?.paginas_total} páginas) referentes ao
                período de <strong>{rupturasPreviewJob?.date_start}</strong> a{' '}
                <strong>{rupturasPreviewJob?.date_end}</strong> e atualizará a Base Atual de
                Rupturas.
              </p>
            </div>
          </div>

          <p className="leading-relaxed">
            Durante o processamento, os registros serão validados e deduplicados sequencialmente. Em
            caso de interrupção ou erro, a Base Atual anterior será mantida intacta.
          </p>
        </div>
      </Modal>

      {/* Modal de Confirmação para Sincronização de Validades */}
      <Modal
        isOpen={valSyncConfirmModalOpen}
        onClose={() => setValSyncConfirmModalOpen(false)}
        title="Confirmar Sincronização de Validades"
        description="Atualização segura da Base Atual de Validades"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setValSyncConfirmModalOpen(false)}
              className="h-9 px-3 text-xs rounded-xl"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleValConfirmStartSync}
              className="h-9 px-4 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-xs"
            >
              Confirmar e Sincronizar
            </Button>
          </div>
        }
      >
        <div className="space-y-4 text-xs text-slate-600">
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold text-sm text-emerald-950">Substituição da Base Atual</p>
              <p className="text-emerald-900 leading-relaxed">
                Esta ação processará{' '}
                <strong>{validadesPreviewJob?.total_informado.toLocaleString('pt-BR')}</strong>{' '}
                produtos de validades ({validadesPreviewJob?.paginas_total} páginas) referentes ao
                período de <strong>{validadesPreviewJob?.date_start}</strong> a{' '}
                <strong>{validadesPreviewJob?.date_end}</strong> e atualizará a Base Atual de
                Validades.
              </p>
            </div>
          </div>

          <p className="leading-relaxed">
            Durante o processamento, os registros serão validados e deduplicados sequencialmente. Em
            caso de interrupção ou erro, a Base Atual anterior será mantida intacta.
          </p>
        </div>
      </Modal>

      {/* Modal de confirmação (para importação Excel) */}
      <Modal
        isOpen={resultModalOpen}
        onClose={() => setResultModalOpen(false)}
        title="Processamento concluído"
        description="Resumo da operação"
        footer={
          <div className="flex items-center justify-between w-full gap-2">
            {errorsList.length > 0 ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  exportErrorsXLSX(errorsList, `erros_${fileInfo?.name || 'import'}.xlsx`)
                }
                className="text-xs h-9 px-3 gap-1.5 border-slate-300 text-slate-700"
              >
                <Download className="w-3.5 h-3.5" />
                Baixar erros (XLSX)
              </Button>
            ) : (
              <div />
            )}
            <Button
              onClick={() => {
                setResultModalOpen(false)
                reset()
              }}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-9 px-4"
            >
              Concluir
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'w-12 h-12 rounded-full flex items-center justify-center shrink-0',
                importResult?.isFullSuccess
                  ? 'bg-emerald-100 text-emerald-600'
                  : 'bg-amber-100 text-amber-700',
              )}
            >
              {importResult?.isFullSuccess ? (
                <CheckCircle2 className="w-6 h-6" />
              ) : (
                <AlertTriangle className="w-6 h-6" />
              )}
            </div>
            <div>
              <p className="font-bold text-slate-900 text-sm">
                {importResult?.isFullSuccess
                  ? 'Base Atual atualizada com sucesso integral'
                  : 'Processamento concluído com observações'}
              </p>
              <p className="text-xs text-slate-500">
                {importResult?.isFullSuccess
                  ? `100% das ocorrências válidas foram gravadas e alimentam o módulo de ${importType === 'rupturas' ? 'Rupturas' : 'Validades'}.`
                  : `Foram gravadas ${importResult?.imported} ocorrências na Base Atual.`}
              </p>
            </div>
          </div>
          {importResult && (
            <div className="grid grid-cols-3 gap-2 pt-1">
              <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-center">
                <p className="text-[10px] font-semibold text-emerald-600 uppercase">Base Atual</p>
                <p className="text-lg font-bold text-emerald-700 tabular-nums">
                  {importResult.imported.toLocaleString('pt-BR')}
                </p>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-center">
                <p className="text-[10px] font-semibold text-slate-500 uppercase">Rejeitados</p>
                <p className="text-lg font-bold text-slate-700 tabular-nums">
                  {importResult.skipped.toLocaleString('pt-BR')}
                </p>
              </div>
              <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-center">
                <p className="text-[10px] font-semibold text-red-500 uppercase">Erros</p>
                <p className="text-lg font-bold text-red-600 tabular-nums">{importResult.errors}</p>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
