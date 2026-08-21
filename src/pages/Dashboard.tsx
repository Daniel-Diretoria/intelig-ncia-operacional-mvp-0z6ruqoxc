import React, { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { AlertBanner } from '@/components/ui/alert-banner'
import { EmptyState } from '@/components/ui/empty-state'
import {
  CalendarClock,
  AlertTriangle,
  Bell,
  Package,
  TrendingDown,
  ArrowRight,
  ChevronRight,
  ShieldAlert,
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
import { useKpis, useValidades, useRupturas, useAlertas } from '@/services'
import { CriticidadeBadge } from '@/components/validades/CriticidadeBadge'
import { formatDisplayDate } from '@/lib/format/dateParser'
import { formatStoreIdentity, formatCityUf } from '@/lib/format/storeIdentity'

export const DashboardPage: React.FC = () => {
  const {
    data: kpisData,
    isLoading: kpisLoading,
    error: kpisError,
    refetch: refetchKpis,
  } = useKpis()
  const { data: validades, isLoading: validadesLoading, error: validadesError } = useValidades()
  const { data: rupturas, isLoading: rupturasLoading, error: rupturasError } = useRupturas()
  const { data: alertas, isLoading: alertasLoading, error: alertasError } = useAlertas()

  const summary = kpisData?.summary
  const categoryDistribution = kpisData?.categoryDistribution || []

  // Top validades críticas (1 a 15 dias)
  const topValidadesCriticas = useMemo(() => {
    return [...validades]
      .filter((v) => v.status === 'Crítico' && v.diasRestantes > 0)
      .sort((a, b) => a.diasRestantes - b.diasRestantes)
      .slice(0, 5)
  }, [validades])

  // Top rupturas ativas ordenadas por dias em ruptura
  const topRupturas = useMemo(() => {
    return [...rupturas]
      .filter((r) => r.situacao_atual === 'Ativo')
      .sort((a, b) => (b.dias_em_ruptura || 0) - (a.dias_em_ruptura || 0))
      .slice(0, 5)
  }, [rupturas])

  // Alertas recentes não lidos
  const recentAlerts = useMemo(() => {
    return alertas.filter((a) => !a.isRead).slice(0, 5)
  }, [alertas])

  const isLoading = kpisLoading || validadesLoading || rupturasLoading || alertasLoading
  const hasError = kpisError || validadesError || rupturasError || alertasError

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h3 className="text-xl font-bold text-slate-900 tracking-tight">Painel Operacional</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Visão consolidada da Base Atual de validades, rupturas e alertas em tempo real.
          </p>
        </div>
      </div>

      {hasError && (
        <AlertBanner
          type="error"
          title="Erro ao carregar dados do painel"
          message="Algumas informações não puderam ser recuperadas da Base Atual."
          onRetry={refetchKpis}
        />
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Validades Críticas */}
        <Card className="border-slate-200 shadow-sm bg-white hover:border-slate-300 transition-colors">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Validades Críticas
            </span>
            <div className="w-8 h-8 rounded-lg bg-red-100 text-red-600 flex items-center justify-center">
              <CalendarClock className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="text-2xl font-extrabold text-slate-900 tabular-nums">
              {summary?.validadesCriticas.count ?? 0}
            </div>
            <p className="text-xs text-red-600 font-medium">1 a 15 dias para vencer</p>
          </CardContent>
        </Card>

        {/* Rupturas Ativas */}
        <Card className="border-slate-200 shadow-sm bg-white hover:border-slate-300 transition-colors">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Rupturas Ativas
            </span>
            <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="text-2xl font-extrabold text-slate-900 tabular-nums">
              {summary?.rupturasAtivas.count ?? 0}
            </div>
            <p className="text-xs text-amber-600 font-medium">Ocorrências na Base Atual</p>
          </CardContent>
        </Card>

        {/* Alertas Abertos */}
        <Card className="border-slate-200 shadow-sm bg-white hover:border-slate-300 transition-colors">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Alertas Abertos
            </span>
            <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
              <Bell className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="text-2xl font-extrabold text-slate-900 tabular-nums">
              {summary?.alertasAbertos.count ?? 0}
            </div>
            <p className="text-xs text-blue-600 font-medium">
              Crítico, Atenção e Moderado não lidos
            </p>
          </CardContent>
        </Card>

        {/* Produtos em Risco */}
        <Card className="border-slate-200 shadow-sm bg-white hover:border-slate-300 transition-colors">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Produtos em Risco
            </span>
            <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center">
              <Package className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="text-2xl font-extrabold text-slate-900 tabular-nums">
              {summary?.produtosEmRisco.count ?? 0}
            </div>
            <p className="text-xs text-purple-600 font-medium">SKUs distintos em risco</p>
          </CardContent>
        </Card>
      </div>

      {/* Gráfico: Distribuição de Validades por Faixa Operacional */}
      <Card className="border-slate-200 shadow-sm bg-white">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-bold text-slate-900 flex items-center justify-between">
            <span>Distribuição de Validades por Status Operacional</span>
            <Link
              to="/validades"
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-1"
            >
              Ver detalhes <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </CardTitle>
          <p className="text-xs text-slate-500">
            Volume de ocorrências ativas agrupadas pelas faixas estritas de dias restantes.
          </p>
        </CardHeader>
        <CardContent className="pt-2">
          <div className="w-full h-64 min-h-[256px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={categoryDistribution}
                margin={{ top: 10, right: 10, left: -20, bottom: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis
                  dataKey="category"
                  tick={{ fontSize: 11, fill: '#64748B' }}
                  interval={0}
                  tickLine={false}
                />
                <YAxis tick={{ fontSize: 11, fill: '#64748B' }} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1E293B',
                    color: '#FFF',
                    borderRadius: '8px',
                    fontSize: '12px',
                    border: 'none',
                  }}
                  formatter={(value: number) => [`${value} ocorrência(s)`, 'Total']}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                <Bar
                  dataKey="critico"
                  name="Crítico (1-15d)"
                  fill="#EF4444"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="proximo"
                  name="Atenção/Moderado (16-35d)"
                  fill="#F59E0B"
                  radius={[4, 4, 0, 0]}
                />
                <Bar dataKey="ok" name="Normal (36+d)" fill="#10B981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Grid: 2 Colunas (Validades Críticas & Rupturas de Maior Impacto) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Validades Críticas Iminentes */}
        <Card className="border-slate-200 shadow-sm bg-white">
          <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-sm font-bold text-slate-900">
                Validades Críticas Recentes
              </CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                Menor tempo para vencimento na Base Atual
              </p>
            </div>
            <Link
              to="/validades"
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-0.5"
            >
              Ver todas <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {topValidadesCriticas.length === 0 ? (
              <EmptyState
                title="Nenhuma validade crítica no momento"
                description="Todas as ocorrências ativas estão acima da faixa de 15 dias."
              />
            ) : (
              topValidadesCriticas.map((item) => {
                const storeId = formatStoreIdentity({
                  codigo_loja: item.codigoLoja,
                  nome_loja: item.loja,
                })
                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-slate-100 hover:border-slate-200 hover:bg-slate-50/50 transition-colors"
                  >
                    <div className="min-w-0 pr-3">
                      <p className="text-xs font-bold text-slate-900 truncate">{item.product}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5 truncate">{storeId}</p>
                      <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-400">
                        <span>Validade: {formatDisplayDate(item.validade)}</span>
                        <span>•</span>
                        <span>{item.quantidade ?? item.estoque} un</span>
                      </div>
                    </div>
                    <div className="text-right whitespace-nowrap">
                      <CriticidadeBadge
                        level={item.status === 'Normal' ? 'OK' : item.status}
                        diasRestantes={item.diasRestantes}
                      />
                    </div>
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>

        {/* Rupturas de Maior Impacto */}
        <Card className="border-slate-200 shadow-sm bg-white">
          <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-sm font-bold text-slate-900">
                Rupturas Ativas com Mais Tempo
              </CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">Maior período em desabastecimento</p>
            </div>
            <Link
              to="/rupturas"
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-0.5"
            >
              Ver todas <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {topRupturas.length === 0 ? (
              <EmptyState
                title="Nenhuma ruptura ativa no momento"
                description="Não há registros de ruptura pendentes na Base Atual."
              />
            ) : (
              topRupturas.map((item) => {
                const storeId = formatStoreIdentity({
                  codigo_loja: item.codigo_loja,
                  nome_loja: item.nome_loja,
                })
                const diasLabel =
                  item.dias_em_ruptura !== undefined && item.dias_em_ruptura !== null
                    ? `${item.dias_em_ruptura} dia(s) em ruptura`
                    : 'Não calculado'

                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-slate-100 hover:border-slate-200 hover:bg-slate-50/50 transition-colors"
                  >
                    <div className="min-w-0 pr-3">
                      <p className="text-xs font-bold text-slate-900 truncate">{item.produto}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5 truncate">{storeId}</p>
                      <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-400">
                        <span>Motivo: {item.motivo}</span>
                        <span>•</span>
                        <span>Visita: {formatDisplayDate(item.data_visita, '—')}</span>
                      </div>
                    </div>
                    <div className="text-right whitespace-nowrap">
                      <span className="inline-flex items-center px-2 py-1 rounded text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                        {diasLabel}
                      </span>
                    </div>
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>
      </div>

      {/* Alertas Recentes */}
      <Card className="border-slate-200 shadow-sm bg-white">
        <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-sm font-bold text-slate-900">
              Alertas Operacionais Recentes
            </CardTitle>
            <p className="text-xs text-slate-500 mt-0.5">
              Notificações da Base Atual pendentes de leitura
            </p>
          </div>
          <Link
            to="/alertas"
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-0.5"
          >
            Ir para Alertas <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </CardHeader>
        <CardContent className="space-y-2 pt-0">
          {recentAlerts.length === 0 ? (
            <div className="text-center py-6 text-xs text-slate-500">
              Nenhum alerta pendente de leitura no momento.
            </div>
          ) : (
            recentAlerts.map((alerta) => (
              <div
                key={alerta.id}
                className="flex items-start justify-between p-3 rounded-lg bg-slate-50 border border-slate-100"
              >
                <div className="min-w-0 pr-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block w-2 h-2 rounded-full ${
                        alerta.severity === 'Crítico'
                          ? 'bg-red-500'
                          : alerta.severity === 'Alto'
                            ? 'bg-amber-500'
                            : 'bg-blue-500'
                      }`}
                    />
                    <p className="text-xs font-bold text-slate-900 truncate">{alerta.title}</p>
                  </div>
                  <p className="text-[11px] text-slate-600 mt-1 leading-snug">{alerta.message}</p>
                </div>
                <span className="text-[10px] text-slate-400 whitespace-nowrap">
                  {formatDisplayDate(alerta.timestamp)}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
