import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useReport, useValidades, useRupturas } from '@/services'
import type { ReportType } from '@/types'
import { AlertBanner } from '@/components/ui/alert-banner'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'
import {
  FileBarChart,
  CalendarCheck,
  TrendingDown,
  Clock,
  Download,
  FileText,
  BarChart3,
  Layers,
  Store,
  ArrowRight,
} from 'lucide-react'
import { exportarRelatorioValidades } from '@/lib/export/relatoriosExport'
import { exportarRelatorioPdf } from '@/lib/export/relatoriosPdfExport'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import {
  ValidadesFilters,
  emptyValidadesFilterState,
  buildValidadesFilter,
  type ValidadesFilterState,
} from '@/components/validades/ValidadesFilters'

interface ReportCardItem {
  type: ReportType
  title: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  badge: string
}

const REPORT_CARDS: ReportCardItem[] = [
  {
    type: 'validades-por-categoria',
    title: 'Resumo de Validades por Status',
    description: 'distribuição de ocorrências ativas por status operacional',
    icon: CalendarCheck,
    badge: 'Validades',
  },
  {
    type: 'validades-proximas-vencer',
    title: 'Validades Próximas a Vencer',
    description:
      'Lista prioritária de produtos com validade em risco na Base Atual para ações preventivas imediatas.',
    icon: Clock,
    badge: 'Validades',
  },
  {
    type: 'rupturas-por-loja',
    title: 'Rupturas por Loja',
    description:
      'Consolidação das ocorrências de desabastecimento ativas na Base Atual por ponto de venda.',
    icon: Store,
    badge: 'Rupturas',
  },
  {
    type: 'rupturas-por-motivo',
    title: 'Rupturas por Motivo',
    description:
      'Distribuição dos desabastecimentos entre Ruptura Total, Sem Estoque Mínimo e Estoque Virtual.',
    icon: Layers,
    badge: 'Rupturas',
  },
]

export const RelatoriosPage: React.FC = () => {
  const [selectedReportType, setSelectedReportType] =
    useState<ReportType>('validades-por-categoria')
  const [isExporting, setIsExporting] = useState(false)
  const [isExportingPdf, setIsExportingPdf] = useState(false)

  // Estado de filtros compartilhados (mesma estrutura da tela de Validades).
  // Os filtros aplicados aqui são repassados às exportações PDF/XLSX para que
  // os dados exportados respeitem exatamente o que o usuário visualizou.
  const [filterState, setFilterState] = useState<ValidadesFilterState>(emptyValidadesFilterState)
  const [appliedFilter, setAppliedFilter] =
    useState<ValidadesFilterState>(emptyValidadesFilterState)

  const effectiveFilter = useMemo(() => buildValidadesFilter(appliedFilter), [appliedFilter])

  const { data: reportData, isLoading, error, refetch } = useReport(selectedReportType)
  // Carrega as validades com o filtro efetivo para:
  //  1. popular as opções dos selects de filtro (lojas, clientes, etc.)
  //  2. exibir a contagem de ocorrências que serão exportadas com os filtros ativos
  const { data: validades } = useValidades(effectiveFilter)
  const { data: rupturas } = useRupturas()
  const { toast } = useToast()

  // Listen to header refresh
  useEffect(() => {
    const handleGlobalRefresh = () => refetch()
    window.addEventListener('diretoria:refresh', handleGlobalRefresh)
    return () => window.removeEventListener('diretoria:refresh', handleGlobalRefresh)
  }, [refetch])

  const handleApplyFilters = useCallback(() => {
    setAppliedFilter(filterState)
  }, [filterState])

  const handleClearFilters = useCallback(() => {
    setFilterState(emptyValidadesFilterState)
    setAppliedFilter(emptyValidadesFilterState)
  }, [])

  // Opções de filtro derivadas dos dados reais (mesmo padrão da tela de Validades)
  const uniqueSorted = (vals: Array<string | undefined | null>) =>
    [...new Set(vals.filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  const toOptions = (arr: string[]) => arr.map((v) => ({ label: v, value: v }))
  const filterOptions = useMemo(
    () => ({
      clientes: toOptions(uniqueSorted(validades.map((v) => v.cliente))),
      industrias: toOptions(uniqueSorted(validades.map((v) => v.industria))),
      redes: toOptions(uniqueSorted(validades.map((v) => v.rede))),
      lojas: toOptions(uniqueSorted(validades.map((v) => v.loja))),
      cidades: toOptions(uniqueSorted(validades.map((v) => v.cidade))),
      produtos: toOptions(uniqueSorted(validades.map((v) => v.product))),
      promotores: toOptions(uniqueSorted(validades.map((v) => v.promotor))),
      supervisores: toOptions(uniqueSorted(validades.map((v) => v.supervisor))),
      categorias: [
        { label: 'Mercearia', value: 'Mercearia' },
        { label: 'Laticínios', value: 'Laticínios' },
        { label: 'Bebidas', value: 'Bebidas' },
        { label: 'Limpeza', value: 'Limpeza' },
        { label: 'Higiene', value: 'Higiene' },
      ],
    }),
    [validades],
  )

  // Exportação real: carrega validades_base com os mesmos filtros ativos na tela
  // e gera/baixa um .xlsx no clique. Os filtros aplicados são repassados para
  // garantir que apenas as ocorrências filtradas sejam exportadas.
  const isRupturasReport =
    selectedReportType === 'rupturas-por-loja' || selectedReportType === 'rupturas-por-motivo'

  const handleExport = useCallback(async () => {
    setIsExporting(true)
    try {
      if (isRupturasReport) {
        const { exportarRelatorioRupturas } = await import('@/lib/export/relatoriosExport')
        const count = await exportarRelatorioRupturas()
        toast({
          title: 'Exportação de Rupturas concluída',
          description: `${count} registro(s) de ruptura exportado(s) para Excel.`,
        })
      } else {
        const count = await exportarRelatorioValidades(effectiveFilter)
        toast({
          title: 'Exportação concluída',
          description:
            count > 0
              ? `${count} ocorrência(s) exportada(s) para Excel.`
              : 'Arquivo gerado com cabeçalhos (sem ocorrências para os filtros ativos).',
        })
      }
    } catch (err) {
      toast({
        title: 'Falha ao exportar',
        description: err instanceof Error ? err.message : 'Erro inesperado na exportação.',
        variant: 'destructive',
      })
    } finally {
      setIsExporting(false)
    }
  }, [isRupturasReport, effectiveFilter, toast])

  const handleExportPdf = useCallback(async () => {
    setIsExportingPdf(true)
    try {
      if (isRupturasReport) {
        const { exportarRelatorioRupturasPdf } = await import('@/lib/export/relatoriosPdfExport')
        const count = await exportarRelatorioRupturasPdf()
        toast({
          title: 'PDF de Rupturas gerado',
          description: `${count} registro(s) de ruptura exportado(s) para PDF.`,
        })
      } else {
        const count = await exportarRelatorioPdf(effectiveFilter)
        toast({
          title: 'PDF gerado',
          description:
            count > 0
              ? `${count} ocorrência(s) exportada(s) para PDF.`
              : 'PDF gerado com estrutura (sem ocorrências para os filtros ativos).',
        })
      }
    } catch (err) {
      toast({
        title: 'Falha ao gerar PDF',
        description: err instanceof Error ? err.message : 'Erro inesperado na geração do PDF.',
        variant: 'destructive',
      })
    } finally {
      setIsExportingPdf(false)
    }
  }, [isRupturasReport, effectiveFilter, toast])

  return (
    <div className="space-y-6 lg:space-y-8 animate-fade-in pb-12">
      {/* Page Header */}
      <div>
        <h3 className="text-xl font-bold text-slate-900 tracking-tight">Relatórios Operacionais</h3>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">
          Selecione um relatório para visualizar os dados operacionais consolidados.
        </p>
      </div>

      {/* Grid of Report Cards (4 Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {REPORT_CARDS.map((card) => {
          const Icon = card.icon
          const isSelected = selectedReportType === card.type

          return (
            <div
              key={card.type}
              onClick={() => setSelectedReportType(card.type)}
              className={`bg-white rounded-xl border p-5 shadow-xs cursor-pointer transition-all duration-200 flex flex-col justify-between hover:shadow-md hover:-translate-y-0.5 ${
                isSelected
                  ? 'border-indigo-600 ring-2 ring-indigo-500/20 bg-indigo-50/20'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      isSelected
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'bg-indigo-50 text-indigo-600'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                    {card.badge}
                  </span>
                </div>
                <h4 className="text-sm font-bold text-slate-900 leading-tight mb-1.5">
                  {card.title}
                </h4>
                <p className="text-xs text-slate-500 leading-relaxed line-clamp-3">
                  {card.description}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold">
                <span className={isSelected ? 'text-indigo-600 font-bold' : 'text-slate-600'}>
                  {isSelected ? 'Selecionado' : 'Visualizar'}
                </span>
                <ArrowRight
                  className={`w-3.5 h-3.5 transition-transform ${
                    isSelected ? 'text-indigo-600 translate-x-0.5' : 'text-slate-400'
                  }`}
                />
              </div>
            </div>
          )
        })}
      </div>

      {/* Filtros compartilhados (busca, loja, criticidade, período) — os mesmos
          da tela de Validades. Os filtros aplicados são repassados às exportações
          PDF/XLSX para que os dados exportados respeitem a visão filtrada. */}
      <ValidadesFilters
        state={filterState}
        onChange={setFilterState}
        onApply={handleApplyFilters}
        onClear={handleClearFilters}
        options={filterOptions}
      />

      {/* Error state */}
      {error && (
        <AlertBanner
          type="error"
          title="Erro ao carregar dados do relatório"
          message={error.message || 'Falha ao processar a visão selecionada.'}
          onRetry={refetch}
        />
      )}

      {/* Selected Report Preview Panel */}
      {!error && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden animate-fade-in-up">
          {/* Preview Header */}
          <div className="p-5 sm:p-6 border-b border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <FileBarChart className="w-5 h-5 text-indigo-600" />
                <h4 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                  {reportData?.title || 'Relatório Operacional'}
                </h4>
              </div>
              <p className="text-xs sm:text-sm text-slate-500">
                {reportData?.description || 'Carregando parâmetros do relatório...'}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                {isRupturasReport
                  ? `${rupturas.length} ocorrência(s) de ruptura disponíveis para exportação.`
                  : `${validades.length} ocorrência(s) de validade para os filtros ativos serão consideradas nas exportações.`}
              </p>
            </div>

            {/* Export Action Buttons */}
            <div className="flex items-center gap-2 shrink-0">
              <Button
                onClick={handleExportPdf}
                disabled={isExportingPdf || isExporting}
                size="default"
                variant="outline"
                className="h-10 px-4 gap-2 border-indigo-200 text-indigo-700 hover:bg-indigo-50 hover:text-indigo-700 font-medium text-xs shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <FileText className="w-4 h-4" />
                <span>{isExportingPdf ? 'Gerando PDF...' : 'Exportar PDF'}</span>
              </Button>
              <Button
                onClick={handleExport}
                disabled={isExporting || isExportingPdf}
                size="default"
                className="h-10 px-4 gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shrink-0 font-medium text-xs shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <Download className="w-4 h-4" />
                <span>{isExporting ? 'Exportando...' : 'Exportar XLSX'}</span>
              </Button>
            </div>
          </div>

          {/* Loading Skeleton */}
          {isLoading ? (
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 rounded-xl" />
                ))}
              </div>
              <Skeleton className="h-64 rounded-xl" />
              <Skeleton className="h-48 rounded-xl" />
            </div>
          ) : !reportData ? (
            <div className="p-8">
              <EmptyState
                title="Nenhum dado disponível"
                description="Selecione outro relatório para visualizar."
              />
            </div>
          ) : (
            <div className="p-5 sm:p-6 space-y-6">
              {/* Summary Cards */}
              {reportData.summaryCards && reportData.summaryCards.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {reportData.summaryCards.map((card, idx) => (
                    <div
                      key={idx}
                      className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 flex items-center justify-between"
                    >
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                          {card.label}
                        </p>
                        <p className="text-xl font-bold text-slate-900 mt-1 tabular-nums">
                          {card.value}
                        </p>
                      </div>
                      <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center">
                        <BarChart3 className="w-4 h-4" />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Chart Preview Section */}
              {reportData.chartData && reportData.chartData.length > 0 && (
                <div className="p-5 rounded-xl border border-slate-200 bg-white">
                  <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-4">
                    Visualização Gráfica
                  </h5>
                  <div className="h-72 w-full min-w-0 min-h-[288px]">
                    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={288}>
                      <BarChart
                        data={reportData.chartData}
                        margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                        <XAxis
                          dataKey="name"
                          tick={{ fontSize: 11, fill: '#64748B' }}
                          axisLine={{ stroke: '#CBD5E1' }}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fontSize: 11, fill: '#64748B' }}
                          axisLine={{ stroke: '#CBD5E1' }}
                          tickLine={false}
                          allowDecimals={false}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#FFFFFF',
                            borderRadius: '8px',
                            border: '1px solid #E2E8F0',
                            boxShadow: '0 4px 12px rgba(15,23,42,0.08)',
                            fontSize: '12px',
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                        {Object.keys(reportData.chartData[0] || {})
                          .filter((k) => k !== 'name')
                          .map((key, i) => {
                            const colors = [
                              '#4F46E5',
                              '#F59E0B',
                              '#10B981',
                              '#EF4444',
                              '#3B82F6',
                              '#8B5CF6',
                            ]
                            return (
                              <Bar
                                key={key}
                                dataKey={key}
                                fill={colors[i % colors.length]}
                                radius={[4, 4, 0, 0]}
                              />
                            )
                          })}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Data Table Preview Section */}
              {reportData.tableRows && reportData.tableRows.length > 0 && (
                <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
                  <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between">
                    <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Detalhamento dos Dados
                    </h5>
                    <span className="text-xs text-slate-400 font-medium">
                      {reportData.tableRows.length} linhas consolidadas
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50/40">
                          {reportData.tableColumns.map((col) => (
                            <th
                              key={col.key}
                              className="py-3 px-4 text-xs font-semibold text-slate-600 uppercase tracking-wider whitespace-nowrap"
                            >
                              {col.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {reportData.tableRows.map((row, rIdx) => (
                          <tr
                            key={rIdx}
                            className="hover:bg-slate-50/70 transition-colors h-11 text-[13px]"
                          >
                            {reportData.tableColumns.map((col) => (
                              <td
                                key={col.key}
                                className="py-2.5 px-4 text-slate-700 whitespace-nowrap font-medium"
                              >
                                {String(row[col.key] ?? '—')}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Caption & Metadata */}
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-400 gap-2 border-t border-slate-100">
                <p>Fonte de dados: Camada Operacional Desacoplada (Diretoria Promoções)</p>
                <p>Gerado em: {new Date(reportData.generatedAt).toLocaleString('pt-BR')}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
