import React, { useState, useEffect } from 'react'
import { useReport } from '@/services'
import type { ReportType } from '@/types'
import { Modal } from '@/components/ui/modal'
import { AlertBanner } from '@/components/ui/alert-banner'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  FileBarChart,
  CalendarCheck,
  TrendingDown,
  Clock,
  Download,
  CheckCircle2,
  BarChart3,
  Layers,
  ArrowRight,
  Info,
} from 'lucide-react'
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
    title: 'Validades por Categoria',
    description:
      'Análise detalhada da concentração de lotes críticos, próximos e regulares por departamento.',
    icon: CalendarCheck,
    badge: 'Validades',
  },
  {
    type: 'rupturas-por-periodo',
    title: 'Rupturas por Período',
    description: 'Evolução cronológica de desabastecimento, reposições e tempo médio sem estoque.',
    icon: TrendingDown,
    badge: 'Rupturas',
  },
  {
    type: 'top-rupturas-por-produto',
    title: 'Top Rupturas por Produto',
    description:
      'Ranking de itens com maior número de dias sem estoque e avaliação de impacto por fornecedor.',
    icon: Layers,
    badge: 'Rupturas',
  },
  {
    type: 'validades-proximas-vencer',
    title: 'Validades Próximas a Vencer',
    description:
      'Lista prioritária de SKUs com validade inferior a 30 dias para ações promocionais imediatas.',
    icon: Clock,
    badge: 'Validades',
  },
]

export const RelatoriosPage: React.FC = () => {
  const [selectedReportType, setSelectedReportType] =
    useState<ReportType>('validades-por-categoria')
  const [isExportModalOpen, setIsExportModalOpen] = useState(false)

  const { data: reportData, isLoading, error, refetch } = useReport(selectedReportType)

  // Listen to header refresh
  useEffect(() => {
    const handleGlobalRefresh = () => refetch()
    window.addEventListener('diretoria:refresh', handleGlobalRefresh)
    return () => window.removeEventListener('diretoria:refresh', handleGlobalRefresh)
  }, [refetch])

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
            </div>

            {/* Export Action Button */}
            <Button
              onClick={() => setIsExportModalOpen(true)}
              size="default"
              className="h-10 px-4 gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shrink-0 font-medium text-xs shadow-sm"
            >
              <Download className="w-4 h-4" />
              <span>Exportar Dados</span>
            </Button>
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
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
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

      {/* Export Info Modal */}
      <Modal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        title="Exportação de Relatórios"
        description="Recurso em homologação operacional"
        footer={
          <Button
            onClick={() => setIsExportModalOpen(false)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-9 px-4"
          >
            Entendido
          </Button>
        }
      >
        <div className="flex items-start gap-3 py-2">
          <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <Info className="w-5 h-5" />
          </div>
          <div className="space-y-2">
            <p className="font-semibold text-slate-900 text-sm">
              Exportação será disponibilizada em breve.
            </p>
            <p className="text-xs text-slate-600 leading-relaxed">
              Os módulos de exportação direta nos formatos <strong>PDF Executivo</strong>,{' '}
              <strong>Planilha Excel (.xlsx)</strong> e <strong>CSV</strong> estão integrados à
              próxima fase do cronograma de inteligência de dados.
            </p>
          </div>
        </div>
      </Modal>
    </div>
  )
}
