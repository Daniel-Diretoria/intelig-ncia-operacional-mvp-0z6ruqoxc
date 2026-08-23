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
import { submitProcessValidades, checkFileHash } from '@/lib/import/importClient'
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
    isConfigured: isApiConfigured,
    isSyncing,
    syncProgress,
    lastSyncResult,
    syncHistory,
    isLoadingHistory: isApiHistoryLoading,
    sync: triggerApiSync,
    testConnection,
    refreshHistory: refreshApiHistory,
  } = useTradeProApi()

  const [testingConnection, setTestingConnection] = useState(false)
  const [connectionTestResult, setConnectionTestResult] = useState<{
    success: boolean
    message: string
    latencyMs: number
  } | null>(null)

  // Sub-aba ativa na visualização
  const [activeTab, setActiveTab] = useState<'api' | 'file'>(isApiConfigured ? 'api' : 'file')

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
  const [importResult, setImportResult] = useState<{
    imported: number
    skipped: number
    errors: number
  } | null>(null)
  const [pipelineResult, setPipelineResult] = useState<PipelineResult | null>(null)
  const [resultModalOpen, setResultModalOpen] = useState(false)

  // Detecção de reenvio
  const [duplicateHash, setDuplicateHash] = useState<{
    hash: string
    importId?: string
    created?: string
  } | null>(null)
  const [forceReprocess, setForceReprocess] = useState(false)

  const { history, isLoading: historyLoading, refetch: refetchHistory } = useImportHistory()

  // Escuta refresh global do header
  useEffect(() => {
    const handleRefresh = () => {
      refetchHistory()
      refreshApiHistory()
    }
    window.addEventListener('diretoria:refresh', handleRefresh)
    return () => window.removeEventListener('diretoria:refresh', handleRefresh)
  }, [refetchHistory, refreshApiHistory])

  const structure = useMemo(() => validateStructure(detectedHeaders), [detectedHeaders])

  const handleTestConnection = async () => {
    setTestingConnection(true)
    setConnectionTestResult(null)
    try {
      const res = await testConnection()
      setConnectionTestResult(res)
      if (res.success) {
        toast({
          title: 'Conexão bem-sucedida',
          description: `${res.message} (latência: ${res.latencyMs}ms)`,
        })
      } else {
        toast({
          title: 'Falha na conexão',
          description: res.message,
          variant: 'destructive',
        })
      }
    } finally {
      setTestingConnection(false)
    }
  }

  const handleApiSyncAction = async (type: 'validades' | 'rupturas' | 'all') => {
    try {
      const res = await triggerApiSync(type)
      if (res.success) {
        toast({
          title: 'Sincronização concluída com sucesso',
          description: `${res.newRows} registros adicionados/atualizados na Base Atual em ${(res.durationMs / 1000).toFixed(1)}s.`,
        })
        refetchHistory()
      } else {
        toast({
          title: 'Sincronização finalizada com avisos',
          description: res.errors.join('; ') || 'Ocorreram erros durante o processo.',
          variant: 'destructive',
        })
      }
    } catch (err) {
      toast({
        title: 'Erro na sincronização',
        description: (err as Error).message || 'Falha ao sincronizar com a API.',
        variant: 'destructive',
      })
    }
  }

  const reset = useCallback(() => {
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
    setImportResult(null)
    setPipelineResult(null)
    setDuplicateHash(null)
    setForceReprocess(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  const handleFile = useCallback(
    async (file: File) => {
      setIsParsing(true)
      setParseError(null)
      setDuplicateHash(null)
      setForceReprocess(false)
      setSelectedFile(file)
      try {
        const hash = await calcularHashArquivo(file)
        const isRupByName = file.name.toLowerCase().includes('ruptura')

        let parsed: Awaited<ReturnType<typeof parseExcelFile>> | null = null
        let rupRows: ParsedRupturaRow[] | null = null
        let isRup = isRupByName

        if (isRupByName) {
          try {
            parsed = await parseExcelFile(file)
          } catch {
            // fallback se parse padrão falhar
          }
          rupRows = await parseRupturasExcel(file)
          isRup = true
        } else {
          try {
            parsed = await parseExcelFile(file)
            isRup =
              parsed.isRupturaSheet ||
              detectRupturaFile(file.name, parsed.sheetName, parsed.headers)
            if (isRup) {
              rupRows = await parseRupturasExcel(file)
            }
          } catch (err) {
            // Se falhar ao ler como Validades, tenta ler como Rupturas
            try {
              rupRows = await parseRupturasExcel(file)
              isRup = true
            } catch {
              throw err
            }
          }
        }

        setFileInfo({
          name: file.name,
          size: file.size,
          selectedAt: new Date().toISOString(),
          hash,
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
            })
          }

          const suggested = suggestMapping(parsed.headers)
          setMapping(suggested)
          setStage('parsed')
          setValidationReport(null)
          setMappedItems([])
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

  const runValidation = useCallback(() => {
    const mapped = mapRecords(rawRows, mapping)
    const validItems = mapped
      .filter((m) => m.errors.length === 0)
      .map((m) => m.item as ValidadeItem)
    const report = validateDataset(validItems)
    setMappedItems(validItems)
    setValidationReport(report)
    setStage('validated')
  }, [rawRows, mapping])

  const handleImport = useCallback(async () => {
    if (!validationReport || !fileInfo) return
    setStage('importing')
    setImportProgress(5)

    // progresso simulado em etapas para feedback visual
    setImportProgress(20)
    const tick = setInterval(() => {
      setImportProgress((p) => Math.min(p + Math.random() * 15, 85))
    }, 250)

    try {
      if (importType === 'rupturas') {
        // Pipeline de Rupturas
        if (!selectedFile) throw new Error('Arquivo não encontrado para processar rupturas.')
        const rupRes = await processRupturasImport(selectedFile, 'tenant-default', forceReprocess)
        clearInterval(tick)
        setImportProgress(100)
        setRupturasResult(rupRes)

        if (rupRes.status === 'Concluída' || rupRes.status === 'Concluída com rejeições') {
          setImportResult({
            imported: rupRes.total_occurrences_generated,
            skipped: rupRes.total_rows_read - rupRes.total_occurrences_generated,
            errors: rupRes.total_rows_invalid,
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
          setStage('validated')
        }
      } else {
        // Pipeline de Validades (TradePro)
        const rawTradePro = rawRows.map((r, i) => toRawRecord(r, mapping, i + 2))
        const pipeline = executarPipeline({
          rawRecords: rawRows,
          mapping,
          fileName: fileInfo.name,
          dataArquivo,
          importId: undefined,
        })
        setPipelineResult(pipeline)
        setImportProgress(70)

        const result = await submitProcessValidades({
          fileName: fileInfo.name,
          fileSize: fileInfo.size,
          fileHash: fileInfo.hash || '',
          arquivoTipo: 'validades',
          dataArquivo,
          force: forceReprocess,
          rawRecords: rawTradePro,
          baseAtual: pipeline.baseAtual,
          summary: {
            totalBrutos: pipeline.summary.totalBrutos,
            validos: pipeline.summary.validos,
            rejeitados: pipeline.summary.rejeitados,
            filtrados90Dias: pipeline.summary.filtrados90Dias,
            consolidados: pipeline.summary.consolidados,
            baseAtual: pipeline.summary.baseAtual,
            maiorDataArquivo: pipeline.summary.maiorDataArquivo,
          },
        })

        clearInterval(tick)
        setImportProgress(100)

        if (result.success) {
          setImportResult({
            imported: result.importedRows,
            skipped: result.skippedRows,
            errors: result.errorRows,
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
          toast({
            title: 'Falha no processamento',
            description: result.error || 'Não foi possível concluir o processamento.',
            variant: 'destructive',
          })
          setStage('validated')
        }
      }
    } catch (err) {
      clearInterval(tick)
      toast({
        title: 'Erro inesperado',
        description: err instanceof Error ? err.message : 'Falha na comunicação com o servidor.',
        variant: 'destructive',
      })
      setStage('validated')
    }
  }, [
    validationReport,
    fileInfo,
    importType,
    selectedFile,
    rawRows,
    mapping,
    dataArquivo,
    forceReprocess,
    toast,
    refetchHistory,
  ])

  const canValidate =
    (importType === 'validades' && structure.isStructureValid && stage === 'parsed') ||
    (importType === 'rupturas' && stage === 'validated')
  const canImport =
    (stage === 'validated' || stage === 'importing') &&
    !!validationReport &&
    validationReport.validRows > 0

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h3 className="text-xl font-bold text-slate-900 tracking-tight">
            Importação &amp; Integração TradePro
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Sincronize diretamente com a API do TradePro ou importe planilhas Excel para alimentar a
            Base Atual.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            asChild
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 text-xs text-indigo-700 border-indigo-200 bg-indigo-50/50 hover:bg-indigo-100"
          >
            <Link to="/rupturas?tab=confronto">
              <GitCompare className="w-3.5 h-3.5 text-indigo-600" />
              Motor de Confronto Rupturas × Validades
            </Link>
          </Button>
          {stage !== 'idle' && (
            <Button variant="outline" size="sm" onClick={reset} className="h-9 gap-1.5 text-xs">
              <X className="w-3.5 h-3.5" />
              Limpar
            </Button>
          )}
        </div>
      </div>

      {/* Tabs de Seleção de Origem: API vs Arquivo Excel */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as 'api' | 'file')}
        className="w-full"
      >
        <TabsList className="grid w-full grid-cols-2 max-w-md bg-slate-100 p-1">
          <TabsTrigger value="api" className="gap-2 text-xs font-semibold">
            <Cloud className="w-4 h-4 text-indigo-600" />
            Sincronizar via API
            {isApiConfigured ? (
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            ) : (
              <Badge variant="outline" className="text-[10px] py-0 px-1 text-slate-500">
                Em breve
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="file" className="gap-2 text-xs font-semibold">
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            Importar Arquivo
          </TabsTrigger>
        </TabsList>

        {/* ========================================================================= */}
        {/* SEÇÃO A — "Sincronizar via API"                                          */}
        {/* ========================================================================= */}
        <TabsContent value="api" className="space-y-6 mt-4">
          {!isApiConfigured ? (
            /* Card informativo: API TradePro Segura e Desativada */
            <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 space-y-6 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                    <Cloud className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-base font-bold text-slate-900">
                        API TradePro — aguardando credencial
                      </h4>
                      <Badge className="bg-slate-100 text-slate-700 border-slate-200 text-[11px] font-semibold">
                        Desativada por padrão
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Autenticação Basic configurada exclusivamente no backend. Excel permanece como
                      fonte ativa.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3">
                <p className="text-xs font-semibold text-slate-800 flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-slate-600" />
                  Status da Conexão:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-600">
                  <div className="p-3 bg-white rounded-lg border border-slate-200">
                    <span className="font-semibold text-slate-700 block">
                      Fonte Operacional Ativa:
                    </span>
                    <span className="text-emerald-700 font-bold">
                      Importação de Planilhas Excel (.xlsx)
                    </span>
                  </div>
                  <div className="p-3 bg-white rounded-lg border border-slate-200">
                    <span className="font-semibold text-slate-700 block">Segurança e Backend:</span>
                    <span className="text-slate-600">
                      Credenciais gerenciadas de forma isolada no servidor
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <p className="text-xs text-slate-500">
                  Excel permanece como fonte ativa para processar Validades e Rupturas.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveTab('file')}
                  className="gap-1.5 text-xs h-9 bg-slate-50 hover:bg-slate-100"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  Ir para Importação Excel
                </Button>
              </div>
            </div>
          ) : (
            /* Card principal: API Configurada */
            <div className="space-y-6">
              <div className="bg-white rounded-2xl border border-indigo-200/80 p-6 sm:p-8 shadow-sm space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                      <Cloud className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-base font-bold text-slate-900">
                          API TradePro — sincronização segura
                        </h4>
                        <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[11px]">
                          <CheckCircle className="w-3 h-3 mr-1" /> Configurada no Backend
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Autenticação Basic configurada exclusivamente no backend. Excel permanece
                        como fonte ativa prioritária.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleTestConnection}
                      disabled={testingConnection || isSyncing}
                      className="h-9 gap-1.5 text-xs"
                    >
                      {testingConnection ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                      ) : (
                        <Activity className="w-3.5 h-3.5 text-indigo-600" />
                      )}
                      Testar Conexão
                    </Button>
                  </div>
                </div>

                {/* Resultado do Teste de Conexão */}
                {connectionTestResult && (
                  <AlertBanner
                    type={connectionTestResult.success ? 'success' : 'error'}
                    title={connectionTestResult.success ? 'Conexão OK' : 'Falha na conexão'}
                    message={`${connectionTestResult.message} ${connectionTestResult.latencyMs ? `(${connectionTestResult.latencyMs}ms)` : ''}`}
                  />
                )}

                {/* Ações de Sincronização */}
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                    <Button
                      size="lg"
                      onClick={() => handleApiSyncAction('all')}
                      disabled={isSyncing}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2 font-bold shadow-md hover:shadow-lg transition-all h-12 flex-1"
                    >
                      {isSyncing ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <Zap className="w-5 h-5 text-amber-300" />
                      )}
                      {isSyncing ? 'Sincronizando...' : 'Sincronizar Tudo (Validades & Rupturas)'}
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <Button
                      variant="outline"
                      onClick={() => handleApiSyncAction('validades')}
                      disabled={isSyncing}
                      className="h-10 gap-2 text-xs font-semibold border-indigo-200 text-indigo-900 bg-indigo-50/50 hover:bg-indigo-100/60"
                    >
                      <RefreshCw
                        className={cn('w-3.5 h-3.5 text-indigo-600', isSyncing && 'animate-spin')}
                      />
                      Sincronizar Apenas Validades
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => handleApiSyncAction('rupturas')}
                      disabled={isSyncing}
                      className="h-10 gap-2 text-xs font-semibold border-amber-200 text-amber-900 bg-amber-50/50 hover:bg-amber-100/60"
                    >
                      <RefreshCw
                        className={cn('w-3.5 h-3.5 text-amber-600', isSyncing && 'animate-spin')}
                      />
                      Sincronizar Apenas Rupturas
                    </Button>
                  </div>
                </div>

                {/* Barra de Progresso Real */}
                {isSyncing && (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-700 flex items-center gap-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                        {syncProgress.step || 'Sincronizando com a API...'}
                      </span>
                      <span className="font-mono font-bold text-indigo-600">
                        {syncProgress.percent}%
                      </span>
                    </div>
                    <Progress value={syncProgress.percent} className="h-2 bg-slate-200" />
                  </div>
                )}

                {/* Card de Resumo do Último Sync */}
                {lastSyncResult && !isSyncing && (
                  <div
                    className={cn(
                      'rounded-xl border p-4 space-y-3',
                      lastSyncResult.success
                        ? 'bg-emerald-50/60 border-emerald-200'
                        : 'bg-red-50/60 border-red-200',
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {lastSyncResult.success ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                        ) : (
                          <AlertCircle className="w-5 h-5 text-red-600" />
                        )}
                        <h5 className="text-sm font-bold text-slate-900">
                          {lastSyncResult.success
                            ? 'Última sincronização realizada com sucesso'
                            : 'Última sincronização falhou'}
                        </h5>
                      </div>
                      <span className="text-xs text-slate-500 font-mono">
                        {(lastSyncResult.durationMs / 1000).toFixed(2)}s de execução
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                      <div className="bg-white/80 p-2.5 rounded-lg border border-slate-200/60 text-center">
                        <p className="text-[10px] uppercase font-bold text-slate-500">Total API</p>
                        <p className="text-lg font-bold text-slate-900 tabular-nums">
                          {lastSyncResult.totalRows}
                        </p>
                      </div>
                      <div className="bg-white/80 p-2.5 rounded-lg border border-emerald-200/60 text-center">
                        <p className="text-[10px] uppercase font-bold text-emerald-700">
                          Novos / Vigentes
                        </p>
                        <p className="text-lg font-bold text-emerald-700 tabular-nums">
                          {lastSyncResult.newRows}
                        </p>
                      </div>
                      <div className="bg-white/80 p-2.5 rounded-lg border border-blue-200/60 text-center">
                        <p className="text-[10px] uppercase font-bold text-blue-700">
                          Consolidados
                        </p>
                        <p className="text-lg font-bold text-blue-700 tabular-nums">
                          {lastSyncResult.updatedRows}
                        </p>
                      </div>
                      <div className="bg-white/80 p-2.5 rounded-lg border border-slate-200/60 text-center">
                        <p className="text-[10px] uppercase font-bold text-slate-500">Módulo</p>
                        <p className="text-sm font-bold text-slate-800 capitalize mt-1">
                          {lastSyncResult.type}
                        </p>
                      </div>
                    </div>

                    {lastSyncResult.errors.length > 0 && (
                      <div className="p-2.5 rounded bg-red-100/80 border border-red-200 text-xs text-red-800 space-y-1">
                        <p className="font-semibold">Ocorrências / Avisos:</p>
                        {lastSyncResult.errors.map((err, i) => (
                          <p key={i}>• {err}</p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Tabela de Histórico de Sincronizações (sync_logs) */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <History className="w-4 h-4 text-indigo-600" />
                    <h4 className="text-sm font-bold text-slate-900">
                      Histórico de Sincronizações via API
                    </h4>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => refreshApiHistory()}
                    disabled={isApiHistoryLoading}
                    className="h-8 text-xs gap-1.5 text-slate-500 hover:text-slate-900"
                  >
                    <RefreshCw
                      className={cn('w-3.5 h-3.5', isApiHistoryLoading && 'animate-spin')}
                    />
                    Atualizar
                  </Button>
                </div>

                {isApiHistoryLoading ? (
                  <div className="p-4 space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-10 rounded-lg" />
                    ))}
                  </div>
                ) : syncHistory.length === 0 ? (
                  <div className="p-8">
                    <EmptyState
                      icon={Cloud}
                      title="Nenhuma sincronização via API registrada"
                      description="Clique em 'Sincronizar Tudo' para buscar os dados de lojas da API TradePro."
                    />
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Data/Hora</TableHead>
                          <TableHead className="text-xs">Tipo</TableHead>
                          <TableHead className="text-xs text-right">Total API</TableHead>
                          <TableHead className="text-xs text-right">Novos</TableHead>
                          <TableHead className="text-xs text-right">Atualizados</TableHead>
                          <TableHead className="text-xs text-right">Duração</TableHead>
                          <TableHead className="text-xs">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {syncHistory.map((log) => (
                          <TableRow key={log.id}>
                            <TableCell className="text-xs text-slate-600 whitespace-nowrap font-mono">
                              {fmtDate(log.created)}
                            </TableCell>
                            <TableCell className="text-xs">
                              <Badge
                                variant="outline"
                                className={cn(
                                  'text-[10px] font-bold uppercase',
                                  log.tipo === 'rupturas'
                                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                                    : log.tipo === 'all'
                                      ? 'bg-purple-50 text-purple-700 border-purple-200'
                                      : 'bg-indigo-50 text-indigo-700 border-indigo-200',
                                )}
                              >
                                {log.tipo === 'all'
                                  ? 'Completo'
                                  : log.tipo === 'rupturas'
                                    ? 'Rupturas'
                                    : 'Validades'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs text-right tabular-nums text-slate-700">
                              {log.total_rows}
                            </TableCell>
                            <TableCell className="text-xs text-right tabular-nums text-emerald-700 font-semibold">
                              {log.new_rows}
                            </TableCell>
                            <TableCell className="text-xs text-right tabular-nums text-blue-700 font-semibold">
                              {log.updated_rows}
                            </TableCell>
                            <TableCell className="text-xs text-right tabular-nums text-slate-500 font-mono">
                              {(log.duration_ms / 1000).toFixed(1)}s
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={cn(
                                  'text-[11px] font-semibold',
                                  statusBadgeClass(log.status),
                                )}
                              >
                                {statusLabel(log.status)}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </div>
          )}
        </TabsContent>

        {/* ========================================================================= */}
        {/* SEÇÃO B — "Importar Arquivo" (Upload Excel clássico / fallback)           */}
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

          {/* Alerta de reenvio */}
          {duplicateHash && stage === 'parsed' && (
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
          )}

          {/* Upload area */}
          {stage === 'idle' && !parseError && (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              className="border-2 border-dashed border-slate-300 rounded-2xl bg-white p-8 sm:p-12 text-center hover:border-indigo-400 hover:bg-indigo-50/30 transition-colors cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
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
                  disabled={isParsing}
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
                      {fmtBytes(fileInfo.size)} • {rawRows.length} linhas • selecionado em{' '}
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

                    {/* Barra de progresso (importação) */}
                    {stage === 'importing' && (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs text-slate-600">
                          <span className="font-medium">Processando pipeline (30 passos)...</span>
                          <span className="tabular-nums">{Math.round(importProgress)}%</span>
                        </div>
                        <Progress value={importProgress} className="h-2" />
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
                        disabled={!canImport || (!!duplicateHash && !forceReprocess)}
                        className="h-9 gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white"
                      >
                        {stage === 'importing' ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Processando...
                          </>
                        ) : (
                          <>
                            <Download className="w-4 h-4" />
                            Processar {validationReport.validRows} registro(s)
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

              {/* Resultado (done) */}
              {stage === 'done' && importResult && (
                <AlertBanner
                  type="success"
                  title="Processamento concluído"
                  message={`${importResult.imported} ocorrência(s) na Base Atual, ${importResult.skipped} rejeitada(s) na validação, ${importResult.errors} com erro.`}
                />
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
              <span className="text-xs text-slate-400">{history.length} registro(s)</span>
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
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((h) => (
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
                            className={cn('text-[11px] font-semibold', statusBadgeClass(h.status))}
                          >
                            {statusLabel(h.status)}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
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

          {/* Nota informativa TradePro */}
          <div className="flex items-start gap-3 p-4 rounded-xl border border-blue-200 bg-blue-50/50">
            <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
              <Info className="w-4 h-4" />
            </div>
            <div className="text-xs text-slate-700 leading-relaxed">
              <p className="font-semibold text-slate-900 mb-0.5">
                Pipeline TradePro (Validades &amp; Rupturas)
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
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Modal de confirmação (para importação Excel) */}
      <Modal
        isOpen={resultModalOpen}
        onClose={() => setResultModalOpen(false)}
        title="Processamento concluído"
        description="Resumo da operação"
        footer={
          <Button
            onClick={() => {
              setResultModalOpen(false)
              reset()
            }}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-9 px-4"
          >
            Concluir
          </Button>
        }
      >
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <p className="font-semibold text-slate-900 text-sm">
                Base Atual atualizada com sucesso
              </p>
              <p className="text-xs text-slate-500">
                As ocorrências processadas já alimentam o módulo de{' '}
                {importType === 'rupturas' ? 'Rupturas' : 'Validades'}.
              </p>
            </div>
          </div>
          {importResult && (
            <div className="grid grid-cols-3 gap-2 pt-1">
              <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-center">
                <p className="text-[10px] font-semibold text-emerald-600 uppercase">Base Atual</p>
                <p className="text-lg font-bold text-emerald-700 tabular-nums">
                  {importResult.imported}
                </p>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-center">
                <p className="text-[10px] font-semibold text-slate-500 uppercase">Rejeitados</p>
                <p className="text-lg font-bold text-slate-700 tabular-nums">
                  {importResult.skipped}
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
