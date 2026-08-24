import React, { useState, useMemo } from 'react'
import {
  Search,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Calendar,
  Store,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Filter,
  Layers,
  HelpCircle,
  ArrowRight,
  Info,
  RotateCcw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useCrossEvidence } from '@/services/useCrossEvidence'
import { CrossEvidenceKpis } from './CrossEvidenceKpis'
import { CrossEvidenceDetailModal } from './CrossEvidenceDetailModal'
import { runShadowReconciliation } from '@/lib/engine/ruptureValidityReconciliationEngine'
import { formatStoreIdentity } from '@/lib/format/storeIdentity'
import { formatDisplayDate } from '@/lib/format/dateParser'
import { useToast } from '@/hooks/use-toast'
import pb from '@/lib/pocketbase/client'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Download, FileSpreadsheet } from 'lucide-react'
import { getBaseAtualSnapshot } from '@/lib/selectors/baseAtualSelectors'
import { downloadConfrontoXLSX, downloadConfrontoCSV } from '@/lib/export/operationalExports'
import type {
  CrossEvidence,
  CrossEvidenceFilter,
  CrossEvidenceConfidence,
  ProposedStatus,
  ReviewStatus,
} from '@/types'

const PAGE_SIZE = 25

export const CrossEvidenceTab: React.FC = () => {
  const { toast } = useToast()

  // Filtros
  const [searchProduct, setSearchProduct] = useState('')
  const [selectedLoja, setSelectedLoja] = useState<string>('all')
  const [selectedBrand, setSelectedBrand] = useState<string>('all')
  const [selectedConfidence, setSelectedConfidence] = useState<string>('all')
  const [selectedProposedStatus, setSelectedProposedStatus] = useState<string>('all')
  const [selectedReviewStatus, setSelectedReviewStatus] = useState<string>('all')
  const [periodStart, setPeriodStart] = useState<string>('')
  const [periodEnd, setPeriodEnd] = useState<string>('')
  const [quickAuditFilter, setQuickAuditFilter] = useState<
    | 'all'
    | 'no_product_code'
    | 'same_day_no_time'
    | 'different_brand'
    | 'similar_products'
    | 'rejected'
  >('all')
  const [currentPage, setCurrentPage] = useState(1)

  // Modais e Diálogos
  const [selectedItem, setSelectedItem] = useState<CrossEvidence | null>(null)
  const [detailModalOpen, setDetailModalOpen] = useState(false)
  const [recalculateConfirmOpen, setRecalculateConfirmOpen] = useState(false)
  const [isRecalculating, setIsRecalculating] = useState(false)
  const [recalcProgressText, setRecalcProgressText] = useState('')
  const [isExporting, setIsExporting] = useState(false)

  const handleExportConfronto = async (format: 'xlsx' | 'csv') => {
    setIsExporting(true)
    try {
      const snapshot = getBaseAtualSnapshot()
      const customSnapshot = {
        ...snapshot,
        crossEvidence: data,
      }
      if (format === 'xlsx') {
        downloadConfrontoXLSX(
          customSnapshot,
          hasActiveFilters ? (filters as unknown as Record<string, unknown>) : undefined,
        )
      } else {
        downloadConfrontoCSV(
          customSnapshot,
          hasActiveFilters ? (filters as unknown as Record<string, unknown>) : undefined,
        )
      }
      toast({
        title: 'Exportação concluída',
        description: `Confronto Ruptura × Validade exportado em formato ${format.toUpperCase()}.`,
      })
    } catch (err) {
      toast({
        title: 'Erro ao exportar confronto',
        description: err instanceof Error ? err.message : 'Falha na exportação de confronto.',
        variant: 'destructive',
      })
    } finally {
      setIsExporting(false)
    }
  }

  // Montar objeto de filtros
  const filters: CrossEvidenceFilter = useMemo(() => {
    return {
      store: selectedLoja !== 'all' ? selectedLoja : undefined,
      product: searchProduct.trim() || undefined,
      brand: selectedBrand !== 'all' ? selectedBrand : undefined,
      confidence:
        selectedConfidence !== 'all' ? (selectedConfidence as CrossEvidenceConfidence) : undefined,
      proposed_status:
        selectedProposedStatus !== 'all' ? (selectedProposedStatus as ProposedStatus) : undefined,
      review_status:
        selectedReviewStatus !== 'all' ? (selectedReviewStatus as ReviewStatus) : undefined,
      periodStart: periodStart || undefined,
      periodEnd: periodEnd || undefined,
      quickAudit: quickAuditFilter !== 'all' ? quickAuditFilter : undefined,
    }
  }, [
    selectedLoja,
    searchProduct,
    selectedBrand,
    selectedConfidence,
    selectedProposedStatus,
    selectedReviewStatus,
    periodStart,
    periodEnd,
    quickAuditFilter,
  ])

  const { data, kpis, isLoading, error, refetch, updateReviewStatus } = useCrossEvidence(filters)

  // Opções para os selects com base em todas as evidências
  const { lojasOptions, marcasOptions } = useMemo(() => {
    const lojasMap = new Map<string, string>()
    const marcasSet = new Set<string>()

    data.forEach((item) => {
      if (item.store_code || item.store_name) {
        const key = item.store_code || item.store_name
        lojasMap.set(
          key,
          formatStoreIdentity({ codigo_loja: item.store_code, nome_loja: item.store_name }),
        )
      }
      if (item.client_or_brand) marcasSet.add(item.client_or_brand)
    })

    return {
      lojasOptions: Array.from(lojasMap.entries()).map(([code, label]) => ({ code, label })),
      marcasOptions: Array.from(marcasSet),
    }
  }, [data])

  // Paginação
  const totalPages = Math.max(1, Math.ceil(data.length / PAGE_SIZE))
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE
    return data.slice(start, start + PAGE_SIZE)
  }, [data, currentPage])

  const handleRowClick = (item: CrossEvidence) => {
    setSelectedItem(item)
    setDetailModalOpen(true)
  }

  const handleConfirmEvidence = async (item: CrossEvidence) => {
    if (!item.id) return
    const success = await updateReviewStatus(item.id, 'confirmed')
    if (success) {
      toast({
        title: 'Evidência confirmada',
        description: `Confronto para ${item.product_name} confirmado com sucesso.`,
      })
    }
  }

  const handleRejectEvidence = async (item: CrossEvidence, reason: string) => {
    if (!item.id) return
    const success = await updateReviewStatus(item.id, 'rejected', reason)
    if (success) {
      toast({
        title: 'Evidência rejeitada',
        description: `Confronto rejeitado com o motivo informado.`,
      })
    }
  }

  const handleExecuteRecalculate = async () => {
    setRecalculateConfirmOpen(false)
    setIsRecalculating(true)
    setRecalcProgressText('Analisando rupturas ativas e validades...')

    try {
      const res = await runShadowReconciliation(pb, { force: true })
      await refetch()
      toast({
        title: 'Reconciliação concluída (Modo Shadow)',
        description: `${res.evidenciasGeradas} evidências geradas (Alta: ${res.high}, Média: ${res.medium}, Inconclusivo: ${res.inconclusive}). Nenhum dado oficial foi alterado.`,
      })
    } catch (err) {
      toast({
        title: 'Erro ao recalcular confronto',
        description: (err as Error).message || 'Falha na execução do motor.',
        variant: 'destructive',
      })
    } finally {
      setIsRecalculating(false)
      setRecalcProgressText('')
    }
  }

  const clearFilters = () => {
    setSearchProduct('')
    setSelectedLoja('all')
    setSelectedBrand('all')
    setSelectedConfidence('all')
    setSelectedProposedStatus('all')
    setSelectedReviewStatus('all')
    setPeriodStart('')
    setPeriodEnd('')
    setQuickAuditFilter('all')
    setCurrentPage(1)
  }

  const hasActiveFilters =
    Boolean(searchProduct) ||
    selectedLoja !== 'all' ||
    selectedBrand !== 'all' ||
    selectedConfidence !== 'all' ||
    selectedProposedStatus !== 'all' ||
    selectedReviewStatus !== 'all' ||
    Boolean(periodStart) ||
    Boolean(periodEnd) ||
    quickAuditFilter !== 'all'

  return (
    <div className="space-y-6">
      {/* Selo de Simulação no topo */}
      <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-2.5">
          <Badge className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-2.5 py-0.5 shadow-2xs rounded-md">
            Modo Shadow
          </Badge>
          <span className="text-xs font-semibold text-amber-950">
            Simulação analítica — não altera a Base Atual de Rupturas nem de Validades
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={isExporting || data.length === 0}
                className="h-9 px-3.5 gap-2 text-xs font-bold border-amber-300 bg-white hover:bg-amber-50 text-slate-800 rounded-xl shadow-2xs"
              >
                <Download className="w-3.5 h-3.5 text-amber-700" />
                <span>{isExporting ? 'Exportando...' : 'Exportar Confronto'}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem
                onClick={() => handleExportConfronto('xlsx')}
                className="gap-2 text-xs cursor-pointer"
              >
                <Download className="w-4 h-4 text-emerald-600" />
                <span>Excel (.xlsx)</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleExportConfronto('csv')}
                className="gap-2 text-xs cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4 text-indigo-600" />
                <span>CSV (.csv UTF-8)</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="default"
            size="sm"
            onClick={() => setRecalculateConfirmOpen(true)}
            disabled={isRecalculating || isLoading}
            className="h-9 px-3.5 gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs rounded-xl"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRecalculating ? 'animate-spin' : ''}`} />
            {isRecalculating ? recalcProgressText || 'Processando...' : 'Recalcular confronto'}
          </Button>
        </div>
      </div>

      {/* Cards de KPIs do Confronto */}
      <CrossEvidenceKpis kpis={kpis} isLoading={isLoading} />

      {/* Seção de Auditoria Rápida (Chips de visualização rápida) */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 flex flex-wrap items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mr-1">
            <Filter className="w-3.5 h-3.5 text-indigo-600" />
            Auditoria Rápida:
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              variant={quickAuditFilter === 'all' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => {
                setQuickAuditFilter('all')
                setCurrentPage(1)
              }}
              className="h-7 text-[11px] px-2.5 rounded-lg font-medium"
            >
              Todos ({data.length})
            </Button>
            <Button
              variant={quickAuditFilter === 'no_product_code' ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => {
                setQuickAuditFilter(
                  quickAuditFilter === 'no_product_code' ? 'all' : 'no_product_code',
                )
                setCurrentPage(1)
              }}
              className="h-7 text-[11px] px-2.5 rounded-lg border-slate-200 font-medium"
            >
              Sem código de produto
            </Button>
            <Button
              variant={quickAuditFilter === 'same_day_no_time' ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => {
                setQuickAuditFilter(
                  quickAuditFilter === 'same_day_no_time' ? 'all' : 'same_day_no_time',
                )
                setCurrentPage(1)
              }}
              className="h-7 text-[11px] px-2.5 rounded-lg border-slate-200 font-medium"
            >
              Mesmo dia sem horário
            </Button>
            <Button
              variant={quickAuditFilter === 'different_brand' ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => {
                setQuickAuditFilter(
                  quickAuditFilter === 'different_brand' ? 'all' : 'different_brand',
                )
                setCurrentPage(1)
              }}
              className="h-7 text-[11px] px-2.5 rounded-lg border-slate-200 font-medium"
            >
              Marca diferente
            </Button>
            <Button
              variant={quickAuditFilter === 'similar_products' ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => {
                setQuickAuditFilter(
                  quickAuditFilter === 'similar_products' ? 'all' : 'similar_products',
                )
                setCurrentPage(1)
              }}
              className="h-7 text-[11px] px-2.5 rounded-lg border-slate-200 font-medium"
            >
              Produtos similares
            </Button>
            <Button
              variant={quickAuditFilter === 'rejected' ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => {
                setQuickAuditFilter(quickAuditFilter === 'rejected' ? 'all' : 'rejected')
                setCurrentPage(1)
              }}
              className="h-7 text-[11px] px-2.5 rounded-lg border-red-200 text-red-700 bg-red-50/40 font-medium"
            >
              Rejeitados
            </Button>
          </div>
        </div>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="h-7 text-[11px] text-slate-500 hover:text-slate-900 rounded-lg"
          >
            Limpar filtros
          </Button>
        )}
      </div>

      {/* Barra de Filtros Primários */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 space-y-3 shadow-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {/* Loja */}
          <Select
            value={selectedLoja}
            onValueChange={(val) => {
              setSelectedLoja(val)
              setCurrentPage(1)
            }}
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder="Todas as Lojas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as Lojas</SelectItem>
              {lojasOptions.map((opt) => (
                <SelectItem key={opt.code} value={opt.code}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Produto */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Buscar produto..."
              value={searchProduct}
              onChange={(e) => {
                setSearchProduct(e.target.value)
                setCurrentPage(1)
              }}
              className="pl-8 h-9 text-xs"
            />
          </div>

          {/* Cliente/Marca */}
          <Select
            value={selectedBrand}
            onValueChange={(val) => {
              setSelectedBrand(val)
              setCurrentPage(1)
            }}
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder="Cliente / Marca" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as Marcas</SelectItem>
              {marcasOptions.map((brand) => (
                <SelectItem key={brand} value={brand}>
                  {brand}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Confiança */}
          <Select
            value={selectedConfidence}
            onValueChange={(val) => {
              setSelectedConfidence(val)
              setCurrentPage(1)
            }}
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder="Confiança" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as Confianças</SelectItem>
              <SelectItem value="high">Alta Confiança</SelectItem>
              <SelectItem value="medium">Média Confiança</SelectItem>
              <SelectItem value="inconclusive">Inconclusiva</SelectItem>
            </SelectContent>
          </Select>

          {/* Status Proposto */}
          <Select
            value={selectedProposedStatus}
            onValueChange={(val) => {
              setSelectedProposedStatus(val)
              setCurrentPage(1)
            }}
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder="Status Proposto" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Status Proposto (Todos)</SelectItem>
              <SelectItem value="inferred_resolved">Inferred Resolved</SelectItem>
              <SelectItem value="awaiting_review">Aguardando Revisão</SelectItem>
              <SelectItem value="inconclusive">Inconclusivo</SelectItem>
              <SelectItem value="reopened">Reaberto</SelectItem>
            </SelectContent>
          </Select>

          {/* Revisão */}
          <Select
            value={selectedReviewStatus}
            onValueChange={(val) => {
              setSelectedReviewStatus(val)
              setCurrentPage(1)
            }}
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder="Revisão Humana" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Revisão (Todas)</SelectItem>
              <SelectItem value="pending">Pendente</SelectItem>
              <SelectItem value="confirmed">Confirmado</SelectItem>
              <SelectItem value="rejected">Rejeitado</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Linha secundária de período */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-slate-500 font-medium flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" /> Período da ruptura detectada:
            </span>
            <input
              type="date"
              value={periodStart}
              onChange={(e) => {
                setPeriodStart(e.target.value)
                setCurrentPage(1)
              }}
              className="h-8 px-2 text-xs rounded-md border border-slate-200 bg-white"
            />
            <span className="text-slate-400">até</span>
            <input
              type="date"
              value={periodEnd}
              onChange={(e) => {
                setPeriodEnd(e.target.value)
                setCurrentPage(1)
              }}
              className="h-8 px-2 text-xs rounded-md border border-slate-200 bg-white"
            />
          </div>
        </div>
      </div>

      {/* Tabela de Confrontos Paginada */}
      <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-600" />
            <h2 className="text-sm font-bold text-slate-900">
              Evidências de Confronto ({data.length})
            </h2>
          </div>
          <span className="text-xs text-slate-500">
            Página {currentPage} de {totalPages}
          </span>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-sm text-slate-500">
            Carregando confrontos do modo shadow...
          </div>
        ) : error ? (
          <div className="p-12 text-center text-sm text-red-500">
            Erro ao carregar dados do confronto: {error.message}
          </div>
        ) : data.length === 0 ? (
          <div className="p-12 text-center">
            <Layers className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-900">Nenhuma evidência encontrada</p>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              {hasActiveFilters
                ? 'Nenhum confronto corresponde aos filtros ativos. Tente redefinir os filtros.'
                : 'Clique em "Recalcular confronto" para cruzar as 184 rupturas ativas com as validades coletadas.'}
            </p>
            {!hasActiveFilters && (
              <Button
                size="sm"
                onClick={() => setRecalculateConfirmOpen(true)}
                disabled={isRecalculating}
                className="mt-4 bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                Executar Confronto Agora
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/70 hover:bg-slate-50/70">
                  <TableHead className="text-xs font-semibold text-slate-600">
                    Código • Loja
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-slate-600">Produto</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-600">
                    Cliente/Marca
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-slate-600">
                    Data Ruptura
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-slate-600">
                    Data Evidência
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-slate-600 text-center">
                    Qtd.
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-slate-600">
                    Validade Produto
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-slate-600 text-center">
                    Dias até Evidência
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-slate-600">Método</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-600">Confiança</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-600">
                    Status Proposto
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-slate-600">Revisão</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-600 text-right">
                    Ações
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedData.map((item) => {
                  const storeDisplay = formatStoreIdentity({
                    codigo_loja: item.store_code,
                    nome_loja: item.store_name,
                  })

                  return (
                    <TableRow
                      key={item.id || item.evidence_key}
                      onClick={() => handleRowClick(item)}
                      className="cursor-pointer hover:bg-slate-50 transition-colors"
                    >
                      {/* Loja */}
                      <TableCell className="text-xs font-semibold text-slate-900 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Store className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{storeDisplay}</span>
                        </div>
                      </TableCell>

                      {/* Produto */}
                      <TableCell className="text-xs font-medium text-slate-900 max-w-[200px] truncate">
                        {item.product_name}
                      </TableCell>

                      {/* Cliente/Marca */}
                      <TableCell className="text-xs text-slate-600 whitespace-nowrap">
                        {item.client_or_brand || '—'}
                      </TableCell>

                      {/* Data Ruptura */}
                      <TableCell className="text-xs text-red-700 font-semibold whitespace-nowrap tabular-nums">
                        {formatDisplayDate(item.rupture_detected_at)}
                      </TableCell>

                      {/* Data Evidência */}
                      <TableCell className="text-xs text-emerald-700 font-semibold whitespace-nowrap tabular-nums">
                        {formatDisplayDate(item.stock_evidence_at)}
                      </TableCell>

                      {/* Qtd */}
                      <TableCell className="text-xs text-center font-bold tabular-nums">
                        {item.quantity_found}
                      </TableCell>

                      {/* Validade do Produto */}
                      <TableCell className="text-xs text-slate-700 whitespace-nowrap tabular-nums">
                        {formatDisplayDate(item.product_expiry_date)}
                      </TableCell>

                      {/* Dias até Evidência */}
                      <TableCell className="text-xs text-center font-bold tabular-nums">
                        <span
                          className={
                            item.resolution_days <= 2
                              ? 'text-emerald-600 font-bold'
                              : item.resolution_days <= 5
                                ? 'text-blue-600'
                                : 'text-slate-600'
                          }
                        >
                          {item.resolution_days} {item.resolution_days === 1 ? 'dia' : 'dias'}
                        </span>
                      </TableCell>

                      {/* Método */}
                      <TableCell className="text-xs whitespace-nowrap">
                        <Badge
                          variant="outline"
                          className={
                            item.match_method === 'high_code_product'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]'
                              : item.match_method === 'medium_exact_name'
                                ? 'bg-blue-50 text-blue-700 border-blue-200 text-[10px]'
                                : 'bg-slate-100 text-slate-600 border-slate-200 text-[10px]'
                          }
                        >
                          {item.match_method === 'high_code_product'
                            ? 'Código'
                            : item.match_method === 'medium_exact_name'
                              ? 'Nome Exato'
                              : 'Inconclusivo'}
                        </Badge>
                      </TableCell>

                      {/* Confiança */}
                      <TableCell className="text-xs whitespace-nowrap">
                        <Badge
                          variant="outline"
                          className={
                            item.confidence === 'high'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]'
                              : item.confidence === 'medium'
                                ? 'bg-amber-50 text-amber-700 border-amber-200 text-[10px]'
                                : 'bg-slate-100 text-slate-600 border-slate-200 text-[10px]'
                          }
                        >
                          {item.confidence === 'high'
                            ? 'Alta'
                            : item.confidence === 'medium'
                              ? 'Média'
                              : 'Inconclusiva'}
                        </Badge>
                      </TableCell>

                      {/* Status Proposto */}
                      <TableCell className="text-xs whitespace-nowrap">
                        <Badge
                          variant="secondary"
                          className={
                            item.proposed_status === 'inferred_resolved'
                              ? 'bg-emerald-100 text-emerald-800 text-[10px]'
                              : item.proposed_status === 'reopened'
                                ? 'bg-purple-100 text-purple-800 text-[10px]'
                                : 'bg-slate-100 text-slate-700 text-[10px]'
                          }
                        >
                          {item.proposed_status === 'inferred_resolved'
                            ? 'Resolvido Sugerido'
                            : item.proposed_status === 'awaiting_review'
                              ? 'Aguardando Revisão'
                              : item.proposed_status === 'reopened'
                                ? 'Reaberto'
                                : 'Inconclusivo'}
                        </Badge>
                      </TableCell>

                      {/* Revisão */}
                      <TableCell className="text-xs whitespace-nowrap">
                        <Badge
                          variant="outline"
                          className={
                            item.review_status === 'confirmed'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-300 font-semibold text-[10px]'
                              : item.review_status === 'rejected'
                                ? 'bg-red-50 text-red-700 border-red-300 font-semibold text-[10px]'
                                : 'bg-slate-100 text-slate-600 border-slate-300 text-[10px]'
                          }
                        >
                          {item.review_status === 'confirmed'
                            ? 'Confirmado'
                            : item.review_status === 'rejected'
                              ? 'Rejeitado'
                              : 'Pendente'}
                        </Badge>
                      </TableCell>

                      {/* Ações */}
                      <TableCell
                        className="text-xs text-right whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Confirmar evidência"
                            onClick={() => handleConfirmEvidence(item)}
                            className="h-7 w-7 p-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Rejeitar evidência"
                            onClick={() => {
                              setSelectedItem(item)
                              setDetailModalOpen(true)
                            }}
                            className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                          >
                            <XCircle className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Paginação */}
        {totalPages > 1 && (
          <div className="p-3 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div className="text-xs text-slate-500">
              Mostrando {Math.min(data.length, (currentPage - 1) * PAGE_SIZE + 1)} a{' '}
              {Math.min(data.length, currentPage * PAGE_SIZE)} de {data.length} evidências
            </div>

            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="h-8 px-2"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-xs font-semibold px-2 text-slate-700">
                {currentPage} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="h-8 px-2"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Modal de Detalhes da Evidência */}
      <CrossEvidenceDetailModal
        isOpen={detailModalOpen}
        onClose={() => {
          setDetailModalOpen(false)
          setSelectedItem(null)
        }}
        item={selectedItem}
        onConfirm={handleConfirmEvidence}
        onReject={handleRejectEvidence}
      />

      {/* Confirmação de Recálculo */}
      <AlertDialog open={recalculateConfirmOpen} onOpenChange={setRecalculateConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Recalcular confronto em Modo Shadow?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-slate-600">
              Isso irá recalcular todas as evidências de confronto entre as rupturas ativas e as
              validades pesquisadas. Nenhum dado oficial ou registro de base será alterado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs h-9">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleExecuteRecalculate}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-9"
            >
              Continuar e Recalcular
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
