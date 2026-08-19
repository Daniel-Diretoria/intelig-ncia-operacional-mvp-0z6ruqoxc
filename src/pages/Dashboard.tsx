import React, { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  CalendarClock,
  PackageX,
  Bell,
  AlertTriangle,
  ArrowRight,
  ShieldAlert,
  Clock,
} from 'lucide-react'
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { useKpis, useAlertas, useValidades, useRupturas } from '@/services'
import { KpiCard } from '@/components/ui/kpi-card'
import { StatusBadge } from '@/components/ui/status-badge'
import { AlertBanner } from '@/components/ui/alert-banner'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import {
  Tooltip as UiTooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Info } from 'lucide-react'

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate()
  const { data: kpiData, isLoading: kpiLoading, error: kpiError, refetch: refetchKpis } = useKpis()
  const { data: alertas, isLoading: alertasLoading, refetch: refetchAlertas } = useAlertas()
  const { data: validades, isLoading: validadesLoading, refetch: refetchValidades } = useValidades()
  const { data: rupturas, isLoading: rupturasLoading, refetch: refetchRupturas } = useRupturas()

  // Listen to custom header refresh event
  useEffect(() => {
    const handleGlobalRefresh = () => {
      refetchKpis()
      refetchAlertas()
      refetchValidades()
      refetchRupturas()
    }
    window.addEventListener('diretoria:refresh', handleGlobalRefresh)
    return () => window.removeEventListener('diretoria:refresh', handleGlobalRefresh)
  }, [refetchKpis, refetchAlertas, refetchValidades, refetchRupturas])

  const handleRetry = () => {
    refetchKpis()
    refetchAlertas()
    refetchValidades()
    refetchRupturas()
  }

  // Filter preview items (isolando vencidos, apenas críticas iminentes com diasRestantes > 0)
  const criticalValidades = validades
    .filter((v) => v.diasRestantes > 0 && v.status === 'Crítico')
    .slice(0, 4)
  const activeRupturas = rupturas.slice(0, 4)
  const recentAlerts = alertas.slice(0, 4)

  return (
    <div className="space-y-6 lg:space-y-8 animate-fade-in pb-10">
      {/* Top Banner / Error */}
      {kpiError && (
        <AlertBanner
          type="error"
          title="Erro ao carregar indicadores"
          message={kpiError.message || 'Falha ao buscar dados operacionais consolidados.'}
          onRetry={handleRetry}
        />
      )}

      {/* Row 1: KPI Cards (4 Cards) */}
      <section aria-label="Indicadores Chave">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-5">
          <KpiCard
            label="Validades Críticas"
            value={kpiData?.summary.validadesCriticas.count ?? 0}
            icon={CalendarClock}
            accent="danger"
            delta={kpiData?.summary.validadesCriticas.delta}
            trend={kpiData?.summary.validadesCriticas.trend}
            isLoading={kpiLoading}
            onClick={() => navigate('/validades')}
          />

          <KpiCard
            label="Rupturas Ativas"
            value={kpiData?.summary.rupturasAtivas.count ?? 0}
            icon={PackageX}
            accent="warning"
            delta={kpiData?.summary.rupturasAtivas.delta}
            trend={kpiData?.summary.rupturasAtivas.trend}
            isLoading={kpiLoading}
            onClick={() => navigate('/rupturas')}
          />

          <KpiCard
            label="Alertas Abertos"
            value={kpiData?.summary.alertasAbertos.count ?? 0}
            icon={Bell}
            accent="info"
            delta={kpiData?.summary.alertasAbertos.delta}
            trend={kpiData?.summary.alertasAbertos.trend}
            isLoading={kpiLoading}
            onClick={() => navigate('/alertas')}
          />

          <KpiCard
            label="Produtos em Risco"
            value={kpiData?.summary.produtosEmRisco.count ?? 0}
            icon={ShieldAlert}
            accent="primary"
            delta={kpiData?.summary.produtosEmRisco.delta}
            trend={kpiData?.summary.produtosEmRisco.trend}
            isLoading={kpiLoading}
            onClick={() => navigate('/validades')}
          />
        </div>
      </section>

      {/* Row 2: Charts (2 Responsive Visual Blocks) */}
      <section
        aria-label="Gráficos de Distribuição"
        className="grid grid-cols-1 lg:grid-cols-2 gap-6"
      >
        {/* Chart 1: Validades por Categoria */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 tracking-tight">
                Validades por Categoria
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Distribuição de lotes por status e categoria de produto
              </p>
            </div>
            <Link
              to="/validades"
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 hover:underline"
            >
              <span>Detalhes</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="h-72 w-full pt-2">
            {kpiLoading ? (
              <div className="h-full w-full flex items-center justify-center bg-slate-50 rounded-lg animate-pulse text-xs text-slate-400">
                Carregando gráfico...
              </div>
            ) : kpiData?.categoryDistribution && kpiData.categoryDistribution.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={kpiData.categoryDistribution}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis
                    dataKey="category"
                    tick={{ fontSize: 12, fill: '#64748B' }}
                    axisLine={{ stroke: '#CBD5E1' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 12, fill: '#64748B' }}
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
                  <Legend
                    wrapperStyle={{ fontSize: '12px', paddingTop: '12px' }}
                    iconType="circle"
                  />
                  <Bar
                    dataKey="critico"
                    name="Crítico (<15d)"
                    fill="#EF4444"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="proximo"
                    name="Próximo (15-30d)"
                    fill="#F59E0B"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar dataKey="ok" name="OK (>30d)" fill="#10B981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState title="Sem dados de distribuição" className="h-full" />
            )}
          </div>
        </div>

        {/* Chart 2: Rupturas por Período */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 tracking-tight">
                Rupturas por Período
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Histórico de desabastecimento e reposição nas últimas semanas
              </p>
            </div>
            <Link
              to="/rupturas"
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 hover:underline"
            >
              <span>Detalhes</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="h-72 w-full pt-2">
            {kpiLoading ? (
              <div className="h-full w-full flex items-center justify-center bg-slate-50 rounded-lg animate-pulse text-xs text-slate-400">
                Carregando gráfico...
              </div>
            ) : kpiData?.rupturasOverTime && kpiData.rupturasOverTime.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={kpiData.rupturasOverTime}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="colorEventos" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366F1" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorCriticos" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#EF4444" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis
                    dataKey="period"
                    tick={{ fontSize: 12, fill: '#64748B' }}
                    axisLine={{ stroke: '#CBD5E1' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 12, fill: '#64748B' }}
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
                  <Legend
                    wrapperStyle={{ fontSize: '12px', paddingTop: '12px' }}
                    iconType="circle"
                  />
                  <Area
                    type="monotone"
                    dataKey="eventos"
                    name="Total Ocorrências"
                    stroke="#6366F1"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#colorEventos)"
                  />
                  <Area
                    type="monotone"
                    dataKey="criticos"
                    name="Rupturas Críticas"
                    stroke="#EF4444"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorCriticos)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState title="Sem histórico recente" className="h-full" />
            )}
          </div>
        </div>
      </section>

      {/* Row 3: Recent Alerts Feed */}
      <section
        aria-label="Alertas Recentes"
        className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6 shadow-sm"
      >
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 tracking-tight">
                Alertas Operacionais Recentes
              </h3>
              <p className="text-xs text-slate-500">Notificações automáticas de divergências</p>
            </div>
          </div>
          <Link
            to="/alertas"
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 hover:underline"
          >
            <span>Ver todos</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {alertasLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-16 bg-slate-50 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : recentAlerts.length === 0 ? (
          <EmptyState
            title="Nenhum alerta recente"
            description="Todas as operações estão normalizadas no momento."
          />
        ) : (
          <div className="space-y-2.5">
            {recentAlerts.map((alerta) => {
              const isCrit = alerta.severity === 'Crítico'
              const isHigh = alerta.severity === 'Alto'
              return (
                <div
                  key={alerta.id}
                  className={`flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-lg border text-xs gap-2 transition-colors ${
                    isCrit
                      ? 'bg-red-50/40 border-red-200/80 hover:bg-red-50/70'
                      : isHigh
                        ? 'bg-amber-50/40 border-amber-200/80 hover:bg-amber-50/70'
                        : 'bg-slate-50/60 border-slate-200 hover:bg-slate-100/60'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${
                        isCrit
                          ? 'bg-red-100 text-red-700'
                          : isHigh
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-blue-100 text-blue-700'
                      }`}
                    >
                      <AlertTriangle className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className="font-bold text-slate-900 text-[13px]">{alerta.title}</span>
                        <StatusBadge
                          variant={
                            alerta.severity === 'Crítico'
                              ? 'critico'
                              : alerta.severity === 'Alto'
                                ? 'alto'
                                : 'medio'
                          }
                        >
                          {alerta.severity}
                        </StatusBadge>
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-medium text-[11px]">
                          {alerta.type}
                        </span>
                      </div>
                      <p className="text-slate-600">{alerta.message}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-slate-400 shrink-0 text-[11px] self-end sm:self-center">
                    <Clock className="w-3.5 h-3.5" />
                    <span>
                      {new Date(alerta.timestamp).toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                      })}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Row 4: Mini Previews (Validades Críticas & Rupturas Ativas) */}
      <section aria-label="Resumos Operacionais" className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Preview 1: Validades Críticas */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-red-600" />
                <h4 className="text-sm font-bold text-slate-900">Validades Críticas Iminentes</h4>
              </div>
              <Link
                to="/validades"
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 hover:underline"
              >
                <span>Ver mais</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            {validadesLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-10 bg-slate-50 rounded animate-pulse" />
                ))}
              </div>
            ) : criticalValidades.length === 0 ? (
              <EmptyState title="Nenhuma validade crítica" className="py-6" />
            ) : (
              <div className="divide-y divide-slate-100">
                {criticalValidades.map((v) => (
                  <div
                    key={v.id}
                    onClick={() => {
                      if (v.codigoLoja || v.loja) {
                        const codeKey = v.codigoLoja
                          ? `${v.codigoLoja.padStart(3, '0')}-${v.loja}`
                          : v.loja
                        navigate(`/lojas/${encodeURIComponent(codeKey || '')}`)
                      } else {
                        navigate('/validades')
                      }
                    }}
                    className="py-2.5 flex items-center justify-between text-xs cursor-pointer hover:bg-slate-50/80 px-2 rounded-lg transition-colors"
                  >
                    <div>
                      <p className="font-semibold text-slate-900 hover:text-indigo-600 transition-colors">
                        {v.product}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        SKU: {v.sku} • {v.loja ? `Loja: ${v.loja}` : `Lote: ${v.lote}`}
                      </p>
                    </div>
                    <div className="text-right">
                      <StatusBadge variant="critico">{v.diasRestantes} dias rest.</StatusBadge>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {v.estoque} {v.unidade} em estoque
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/validades')}
              className="w-full text-xs font-medium text-slate-700 border-slate-200"
            >
              Acessar Painel de Validades
            </Button>
          </div>
        </div>

        {/* Preview 2: Rupturas Ativas */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <PackageX className="w-4 h-4 text-amber-600" />
                <h4 className="text-sm font-bold text-slate-900">Rupturas com Maior Impacto</h4>
              </div>
              <Link
                to="/rupturas"
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 hover:underline"
              >
                <span>Ver mais</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            {rupturasLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-10 bg-slate-50 rounded animate-pulse" />
                ))}
              </div>
            ) : activeRupturas.length === 0 ? (
              <EmptyState title="Nenhuma ruptura ativa" className="py-6" />
            ) : (
              <div className="divide-y divide-slate-100">
                {activeRupturas.map((r) => (
                  <div key={r.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <p className="font-semibold text-slate-900">{r.product}</p>
                      <p className="text-[11px] text-slate-400">
                        {r.category} • Fornec: {r.supplier || '—'}
                      </p>
                    </div>
                    <div className="text-right">
                      <StatusBadge
                        variant={
                          r.status === 'Crítico'
                            ? 'critico'
                            : r.status === 'Em Ruptura'
                              ? 'em-ruptura'
                              : 'reposicao-prevista'
                        }
                      >
                        {r.status}
                      </StatusBadge>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Sem estoque: {r.diasSemEstoque}d
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/rupturas')}
              className="w-full text-xs font-medium text-slate-700 border-slate-200"
            >
              Acessar Painel de Rupturas
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}
