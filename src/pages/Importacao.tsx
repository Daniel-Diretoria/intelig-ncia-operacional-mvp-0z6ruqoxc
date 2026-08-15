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
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AlertBanner } from '@/components/ui/alert-banner'
import { EmptyState } from '@/components/ui/empty-state'
import { Modal } from '@/components/ui/modal'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
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
import { cn } from '@/lib/utils'
import {
  parseExcelFile,
  validateStructure,
  suggestMapping,
  validateDataset,
  mapRecords,
  filterValidItems,
  detectRupturaFile,
  EXPECTED_COLUMNS,
  REQUIRED_COLUMNS,
  type ColumnMapping,
  type DatasetValidationReport,
} from '@/lib/import'
import { submitImport } from '@/lib/import/importClient'
import { submitProcessValidades, checkFileHash } from '@/lib/import/importClient'
import {
  executarPipeline,
  calcularHashArquivo,
  type PipelineResult,
  toRawRecord,
} from '@/lib/data/tradeProPipeline'
import { useImportHistory } from '@/services'
import type { ValidadeItem } from '@/types'

interface FileInfo {
  name: string
  size: number
  selectedAt: string
  hash?: string
}

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
      return 'bg-emerald-100 text-emerald-700 border-emerald-200'
    case 'processing':
      return 'bg-blue-100 text-blue-700 border-blue-200'
    case 'failed':
      return 'bg-red-100 text-red-700 border-red-200'
    case 'pending':
    default:
      return 'bg-slate-100 text-slate-600 border-slate-200'
  }
}

const statusLabel = (status: string): string => {
  switch (status) {
    case 'completed':
      return 'Concluída'
    case 'processing':
      return 'Processando'
    case 'failed':
      return 'Falhou'
    case 'pending':
      return 'Pendente'
    default:
      return status
  }
}

// Etapas do pipeline visual (30 passos resumidos em 7 fases)
const PIPELINE_FASES = [
  { id: 'identificar', label: 'Identificar arquivo', icon: FileUp },
  { id: 'ler', label: 'Ler aba Pesquisa Validade', icon: Table2 },
  { id: 'validar', label: 'Validar colunas e tipos', icon: CheckCircle2 },
  { id: 'corrigir', label: 'Aplicar correções', icon: ShieldAlert },
  { id: 'deduplicar', label: 'Deduplicação 2 etapas', icon: GitMerge },
  { id: 'status', label: 'Status e datas', icon: Layers },
  { id: 'persistir', label: 'Persistir Base Atual', icon: Database },
] as const

export const ImportacaoPage: React.FC = () => {
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [stage, setStage] = useState<Stage>('idle')
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null)
  const [isParsing, setIsParsing] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const [rupturaDetected, setRupturaDetected] = useState(false)

  const [detectedHeaders, setDetectedHeaders] = useState<string[]>([])
  const [rawRows, setRawRows] = useState<Record<string, unknown>[]>([])
  const [sheetName, setSheetName] = useState<string>('')
  const [dataArquivo, setDataArquivo] = useState<string | undefined>(undefined)
  const [mapping, setMapping] = useState<ColumnMapping>({})

  const [validationReport, setValidationReport] = useState<DatasetValidationReport | null>(null)
  const [mappedItems, setMappedItems] = useState<ValidadeItem[]>([])

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
    const handleRefresh = () => refetchHistory()
    window.addEventListener('diretoria:refresh', handleRefresh)
    return () => window.removeEventListener('diretoria:refresh', handleRefresh)
  }, [refetchHistory])

  const structure = useMemo(() => validateStructure(detectedHeaders), [detectedHeaders])

  const reset = useCallback(() => {
    setStage('idle')
    setFileInfo(null)
    setParseError(null)
    setRupturaDetected(false)
    setDetectedHeaders([])
    setRawRows([])
    setSheetName('')
    setDataArquivo(undefined)
    setMapping({})
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
      setRupturaDetected(false)
      setDuplicateHash(null)
      setForceReprocess(false)
      try {
        const parsed = await parseExcelFile(file)

        // Passo 1-2: identificar tipo do arquivo e confirmar Validades
        const isRup = detectRupturaFile(file.name, parsed.sheetName, parsed.headers)
        if (isRup) {
          setRupturaDetected(true)
          setParseError(
            'Este arquivo foi identificado como uma exportação de Rupturas. Utilize o importador correspondente.',
          )
          setStage('idle')
          return
        }

        setDetectedHeaders(parsed.headers)
        setRawRows(parsed.rows)
        setSheetName(parsed.sheetName)
        setDataArquivo(parsed.dataArquivo)

        // Calcula hash para proteção contra reenvio
        const hash = await calcularHashArquivo(file)
        setFileInfo({
          name: file.name,
          size: file.size,
          selectedAt: new Date().toISOString(),
          hash,
        })

        // Verifica reenvio
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
          title: 'Arquivo carregado',
          description: `${parsed.rows.length} linhas detectadas em "${parsed.sheetName}"${
            parsed.dataArquivo ? ` • Data Arquivo: ${parsed.dataArquivo}` : ''
          }.`,
        })
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

    const { valid } = filterValidItems(mappedItems, validationReport)

    // progresso simulado em etapas para feedback visual
    setImportProgress(20)
    const tick = setInterval(() => {
      setImportProgress((p) => Math.min(p + Math.random() * 15, 85))
    }, 250)

    try {
      // Executa o pipeline TradePro completo (30 passos)
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

      // Envia para o backend persistir (validades_raw + validades_base + import_history)
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
    mappedItems,
    rawRows,
    mapping,
    dataArquivo,
    forceReprocess,
    toast,
    refetchHistory,
  ])

  const canValidate = structure.isStructureValid && stage === 'parsed' && !rupturaDetected
  const canImport =
    (stage === 'validated' || stage === 'importing') &&
    !!validationReport &&
    validationReport.validRows > 0 &&
    !rupturaDetected

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h3 className="text-xl font-bold text-slate-900 tracking-tight">Importação de Dados</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Carregue a exportação do TradePro (aba “Pesquisa Validade”) para alimentar o módulo de
            Validades.
          </p>
        </div>
        {stage !== 'idle' && (
          <Button variant="outline" size="sm" onClick={reset} className="h-9 gap-1.5 text-xs">
            <X className="w-3.5 h-3.5" />
            Limpar
          </Button>
        )}
      </div>

      {/* Pipeline visual — 7 fases */}
      <div className="flex items-center gap-2 text-xs font-medium text-slate-500 flex-wrap">
        {PIPELINE_FASES.map((f, i, arr) => {
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
            <React.Fragment key={f.id}>
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border',
                  active
                    ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                    : 'bg-white text-slate-400 border-slate-200',
                )}
              >
                <span
                  className={cn(
                    'w-4 h-4 rounded-full flex items-center justify-center',
                    active ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500',
                  )}
                >
                  {active ? <Check className="w-2.5 h-2.5" /> : <Icon className="w-2.5 h-2.5" />}
                </span>
                {f.label}
              </span>
              {i < arr.length - 1 && <ArrowRight className="w-3 h-3 text-slate-300" />}
            </React.Fragment>
          )
        })}
      </div>

      {/* Erro de leitura / Ruptura detectada */}
      {parseError && (
        <AlertBanner
          type={rupturaDetected ? 'error' : 'error'}
          title={
            rupturaDetected ? 'Arquivo de Rupturas detectado' : 'Não foi possível ler o arquivo'
          }
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
              {duplicateHash.created ? ` em ${fmtDate(duplicateHash.created)}` : ''}. Para evitar
              duplicação de somas, o sistema não reprocessa automaticamente.
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
                {isParsing ? 'Lendo arquivo...' : 'Arraste um arquivo Excel do TradePro aqui'}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Padrão: <code className="text-indigo-600">Validade_YYYY_MM_DD.xlsx</code> • aba
                “Pesquisa Validade”
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

          {/* Mapeamento de colunas */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Table2 className="w-4 h-4 text-indigo-600" />
                <h4 className="text-sm font-bold text-slate-900">
                  Mapeamento de colunas (TradePro)
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
                  Identificadores (Cód., CPF/CNPJ) são tratados como texto, preservando zeros à
                  esquerda.
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
                    <p className="text-[11px] font-semibold text-emerald-600 uppercase">Válidos</p>
                    <p className="text-xl font-bold text-emerald-700 tabular-nums">
                      {validationReport.validRows}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg border border-red-200 bg-red-50/50">
                    <p className="text-[11px] font-semibold text-red-600 uppercase">Inválidos</p>
                    <p className="text-xl font-bold text-red-700 tabular-nums">
                      {validationReport.invalidRows}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg border border-amber-200 bg-amber-50/50">
                    <p className="text-[11px] font-semibold text-amber-600 uppercase">Alertas</p>
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
              </div>
              <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-lg border border-slate-200 bg-slate-50/50">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 uppercase">
                    <Database className="w-3 h-3" /> Brutos
                  </div>
                  <p className="text-xl font-bold text-slate-900 tabular-nums">
                    {pipelineResult.summary.totalBrutos}
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
                    <GitMerge className="w-3 h-3" /> Consolidados
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
              {pipelineResult.summary.quantidadeZeroRemovidos > 0 && (
                <div className="px-4 pb-4">
                  <p className="text-[11px] text-slate-500">
                    {pipelineResult.summary.quantidadeZeroRemovidos} ocorrência(s) com quantidade
                    zero não exibida(s) na Base Atual (registro bruto preservado).
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Resultado (done) */}
          {stage === 'done' && importResult && (
            <AlertBanner
              type="success"
              title="Processamento concluído"
              message={`${importResult.imported} ocorrência(s) na Base Atual, ${importResult.skipped} não selecionada(s), ${importResult.errors} com erro.`}
            />
          )}
        </div>
      )}

      {/* Histórico de importações */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-indigo-600" />
            <h4 className="text-sm font-bold text-slate-900">Histórico de importações</h4>
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
                  <TableHead className="text-xs">Arquivo</TableHead>
                  <TableHead className="text-xs text-right">Importados</TableHead>
                  <TableHead className="text-xs text-right">Ignorados</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell className="text-xs text-slate-600 whitespace-nowrap tabular-nums">
                      {fmtDate(h.created)}
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

      {/* Nota informativa TradePro */}
      <div className="flex items-start gap-3 p-4 rounded-xl border border-blue-200 bg-blue-50/50">
        <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
          <Info className="w-4 h-4" />
        </div>
        <div className="text-xs text-slate-700 leading-relaxed">
          <p className="font-semibold text-slate-900 mb-0.5">Pipeline TradePro (30 passos)</p>
          <p>
            O sistema identifica o arquivo, confirma que é Validades (recusa Rupturas), lê a aba
            “Pesquisa Validade”, preserva os dados brutos, valida os 7 campos obrigatórios, filtra
            últimos 90 dias, aplica correções de validade, deduplica em duas etapas (somar por Chave
            Dedup → selecionar maior Realizado por Chave Operacional), remove quantidade zero,
            calcula Status Operacional e Situação Atual, reconhece loja/rede e persiste a Base
            Atual.
          </p>
        </div>
      </div>

      {/* Modal de confirmação */}
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
                As ocorrências processadas já alimentam o módulo de Validades.
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
                <p className="text-[10px] font-semibold text-slate-500 uppercase">
                  Não selecionados
                </p>
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
