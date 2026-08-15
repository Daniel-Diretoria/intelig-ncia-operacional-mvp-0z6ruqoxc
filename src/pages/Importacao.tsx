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
  mapRecords,
  validateDataset,
  filterValidItems,
  EXPECTED_COLUMNS,
  REQUIRED_COLUMNS,
  OPTIONAL_COLUMNS,
  type ColumnMapping,
  type DatasetValidationReport,
} from '@/lib/import'
import { submitImport } from '@/lib/import/importClient'
import { useImportHistory } from '@/services'
import type { ValidadeItem } from '@/types'

interface FileInfo {
  name: string
  size: number
  selectedAt: string
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

export const ImportacaoPage: React.FC = () => {
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [stage, setStage] = useState<Stage>('idle')
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null)
  const [isParsing, setIsParsing] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)

  const [detectedHeaders, setDetectedHeaders] = useState<string[]>([])
  const [rawRows, setRawRows] = useState<Record<string, unknown>[]>([])
  const [mapping, setMapping] = useState<ColumnMapping>({})

  const [validationReport, setValidationReport] = useState<DatasetValidationReport | null>(null)
  const [mappedItems, setMappedItems] = useState<ValidadeItem[]>([])

  const [importProgress, setImportProgress] = useState(0)
  const [importResult, setImportResult] = useState<{
    imported: number
    skipped: number
    errors: number
  } | null>(null)
  const [resultModalOpen, setResultModalOpen] = useState(false)

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
    setDetectedHeaders([])
    setRawRows([])
    setMapping({})
    setValidationReport(null)
    setMappedItems([])
    setImportProgress(0)
    setImportResult(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  const handleFile = useCallback(
    async (file: File) => {
      setIsParsing(true)
      setParseError(null)
      try {
        const parsed = await parseExcelFile(file)
        setDetectedHeaders(parsed.headers)
        setRawRows(parsed.rows)
        setFileInfo({
          name: file.name,
          size: file.size,
          selectedAt: new Date().toISOString(),
        })
        const suggested = suggestMapping(parsed.headers)
        setMapping(suggested)
        setStage('parsed')
        setValidationReport(null)
        setMappedItems([])
        toast({
          title: 'Arquivo carregado',
          description: `${parsed.rows.length} linhas detectadas em "${parsed.sheetName}".`,
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
      const result = await submitImport({
        fileName: fileInfo.name,
        fileSize: fileInfo.size,
        records: valid,
        summary: {
          totalRows: validationReport.totalRows,
          validRows: validationReport.validRows,
          invalidRows: validationReport.invalidRows,
          warningRows: validationReport.warningRows,
          errors: validationReport.issues.slice(0, 100),
        },
      })

      clearInterval(tick)
      setImportProgress(100)

      if (result.success) {
        setImportResult({
          imported: result.importedRows,
          skipped: validationReport.totalRows - result.importedRows,
          errors: result.errorRows,
        })
        setStage('done')
        setResultModalOpen(true)
        refetchHistory()
        // limpa cache do DataSourceFactory para que a próxima leitura de Validades
        // busque os dados recém-importados
        import('@/lib/data/dataSourceFactory').then(({ DataSourceFactory }) => {
          DataSourceFactory.reset()
        })
      } else {
        toast({
          title: 'Falha na importação',
          description: result.error || 'Não foi possível concluir a importação.',
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
  }, [validationReport, fileInfo, mappedItems, toast, refetchHistory])

  const canValidate = structure.isStructureValid && stage === 'parsed'
  const canImport =
    (stage === 'validated' || stage === 'importing') &&
    !!validationReport &&
    validationReport.validRows > 0

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h3 className="text-xl font-bold text-slate-900 tracking-tight">Importação de Dados</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Carregue a base operacional via Excel para alimentar o módulo de Validades.
          </p>
        </div>
        {stage !== 'idle' && (
          <Button variant="outline" size="sm" onClick={reset} className="h-9 gap-1.5 text-xs">
            <X className="w-3.5 h-3.5" />
            Limpar
          </Button>
        )}
      </div>

      {/* Pipeline de etapas */}
      <div className="flex items-center gap-2 text-xs font-medium text-slate-500 flex-wrap">
        {[
          { id: 'upload', label: 'Selecionar arquivo', active: stage !== 'idle' },
          { id: 'structure', label: 'Validar estrutura', active: stage !== 'idle' },
          { id: 'mapping', label: 'Mapear colunas', active: stage !== 'idle' },
          {
            id: 'validate',
            label: 'Validar dados',
            active: ['validated', 'importing', 'done'].includes(stage),
          },
          { id: 'import', label: 'Importar', active: stage === 'done' },
        ].map((s, i, arr) => (
          <React.Fragment key={s.id}>
            <span
              className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border',
                s.active
                  ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                  : 'bg-white text-slate-400 border-slate-200',
              )}
            >
              <span
                className={cn(
                  'w-4 h-4 rounded-full flex items-center justify-center text-[10px]',
                  s.active ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500',
                )}
              >
                {s.active ? <Check className="w-2.5 h-2.5" /> : i + 1}
              </span>
              {s.label}
            </span>
            {i < arr.length - 1 && <ArrowRight className="w-3 h-3 text-slate-300" />}
          </React.Fragment>
        ))}
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
                {isParsing ? 'Lendo arquivo...' : 'Arraste um arquivo Excel aqui'}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                ou clique para selecionar • formatos .xlsx, .xls
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
            <div className="flex items-center gap-2 shrink-0">
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
                <h4 className="text-sm font-bold text-slate-900">Mapeamento de colunas</h4>
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
                  O sistema se adapta ao arquivo: mapeie cada coluna do Excel ao campo interno.
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
                      <span className="font-medium">Importando registros...</span>
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
                    {validationReport.validRows} registro(s) prontos para importar.
                  </p>
                  <Button
                    size="sm"
                    onClick={handleImport}
                    disabled={!canImport}
                    className="h-9 gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white"
                  >
                    {stage === 'importing' ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Importando...
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4" />
                        Importar {validationReport.validRows} registro(s)
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Resultado (done) */}
          {stage === 'done' && importResult && (
            <AlertBanner
              type="success"
              title="Importação concluída"
              message={`${importResult.imported} registro(s) importado(s) com sucesso, ${importResult.skipped} ignorado(s), ${importResult.errors} com erro.`}
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
          <p className="font-semibold text-slate-900 mb-0.5">Preparado para TradePro API</p>
          <p>
            O pipeline de importação (upload → validação → mapeamento → persistência) é genérico: os
            validators e o mapper aceitam dados em formato de array de objetos. No futuro, o passo
            de upload de Excel poderá ser substituído por um fetch da API TradePro sem alterar o
            restante do fluxo.
          </p>
        </div>
      </div>

      {/* Modal de confirmação */}
      <Modal
        isOpen={resultModalOpen}
        onClose={() => setResultModalOpen(false)}
        title="Importação concluída"
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
                Importação realizada com sucesso
              </p>
              <p className="text-xs text-slate-500">
                Os dados importados já alimentam o módulo de Validades.
              </p>
            </div>
          </div>
          {importResult && (
            <div className="grid grid-cols-3 gap-2 pt-1">
              <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-center">
                <p className="text-[10px] font-semibold text-emerald-600 uppercase">Importados</p>
                <p className="text-lg font-bold text-emerald-700 tabular-nums">
                  {importResult.imported}
                </p>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-center">
                <p className="text-[10px] font-semibold text-slate-500 uppercase">Ignorados</p>
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
