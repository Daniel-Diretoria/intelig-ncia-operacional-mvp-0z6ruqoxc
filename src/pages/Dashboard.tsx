import React, { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { AlertBanner } from '@/components/ui/alert-banner'
import { EmptyState } from '@/components/ui/empty-state'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  CalendarClock,
  AlertTriangle,
  Bell,
  Package,
  TrendingDown,
  ArrowRight,
  ChevronRight,
  ShieldAlert,
  HelpCircle,
  Building2,
  Boxes,
  Zap,
  Info,
  RefreshCw,
  Download,
} from 'lucide-react'
import { getBaseAtualSnapshot } from '@/lib/selectors/baseAtualSelectors'
import { downloadCentralEstrategicaXLSX } from '@/lib/export/operationalExports'
import { useToast } from '@/hooks/use-toast'
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
import {
  RISK_MODEL_VERSION,
  expandBrandTotalRuptures,
  computeStoreRiskScore,
  computeProductRiskScore,
  computeBrandRiskScore,
  generateRecommendedActions,
  type SeverityLevel,
} from '@/lib/engine/strategicRankings'

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

  const validadesCriticasCount = summary?.validadesCriticas.count ?? 0
  const rupturasAtivasCount = summary?.rupturasAtivas.count ?? 0

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      {/* Hero / Header Executivo Compacto */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-2.5 h-2.5 rounded-full bg-indigo-600 animate-pulse" />
            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              Visão Estratégica
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Centro de controle e inteligência operacional sobre validades, rupturas e risco
            consolidado.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-50 text-red-700 border border-red-200 text-xs font-semibold">
            <CalendarClock className="w-3.5 h-3.5 text-red-600" />
            <span>{validadesCriticasCount} validades críticas</span>
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 text-amber-800 border border-amber-200 text-xs font-semibold">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            <span>{rupturasAtivasCount} rupturas ativas</span>
          </span>
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
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card
              key={i}
              className="border-slate-200 shadow-xs bg-white animate-pulse p-5 rounded-2xl"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="h-3 bg-slate-200 rounded w-24" />
                <div className="w-10 h-10 bg-slate-100 rounded-xl" />
              </div>
              <div className="h-8 bg-slate-200 rounded w-16 mb-2" />
              <div className="h-3 bg-slate-100 rounded w-32" />
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Validades Críticas */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs relative overflow-hidden transition-all duration-150 hover:shadow-sm">
            <div className="absolute top-0 left-0 bottom-0 w-1 bg-red-600" />
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Validades Críticas
                </p>
                <p className="mt-2 text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight tabular-nums">
                  {summary?.validadesCriticas.count ?? 0}
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center shrink-0 border border-red-100">
                <CalendarClock className="w-5 h-5" />
              </div>
            </div>
            <p className="text-xs text-red-600 font-medium mt-2 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-red-600" />1 a 15 dias para vencer
            </p>
          </div>

          {/* Rupturas Ativas */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs relative overflow-hidden transition-all duration-150 hover:shadow-sm">
            <div className="absolute top-0 left-0 bottom-0 w-1 bg-amber-500" />
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Rupturas Ativas
                </p>
                <p className="mt-2 text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight tabular-nums">
                  {summary?.rupturasAtivas.count ?? 0}
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 border border-amber-100">
                <AlertTriangle className="w-5 h-5" />
              </div>
            </div>
            <p className="text-xs text-amber-700 font-medium mt-2 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              Ocorrências na Base Atual
            </p>
          </div>

          {/* Alertas Abertos */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs relative overflow-hidden transition-all duration-150 hover:shadow-sm">
            <div className="absolute top-0 left-0 bottom-0 w-1 bg-blue-600" />
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Alertas Abertos
                </p>
                <p className="mt-2 text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight tabular-nums">
                  {summary?.alertasAbertos.count ?? 0}
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-100">
                <Bell className="w-5 h-5" />
              </div>
            </div>
            <p className="text-xs text-blue-600 font-medium mt-2 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
              Crítico, Atenção e Moderado
            </p>
          </div>

          {/* Produtos em Risco */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs relative overflow-hidden transition-all duration-150 hover:shadow-sm">
            <div className="absolute top-0 left-0 bottom-0 w-1 bg-indigo-600" />
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Produtos em Risco
                </p>
                <p className="mt-2 text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight tabular-nums">
                  {summary?.produtosEmRisco.count ?? 0}
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 border border-indigo-100">
                <Package className="w-5 h-5" />
              </div>
            </div>
            <p className="text-xs text-indigo-600 font-medium mt-2 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-600" />
              SKUs distintos em risco
            </p>
          </div>
        </div>
      )}

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
          {isLoading ? (
            <div className="w-full h-64 flex items-center justify-center bg-slate-50 rounded-lg animate-pulse">
              <span className="text-xs text-slate-400">Carregando gráfico de distribuição...</span>
            </div>
          ) : (
            <div className="w-full min-w-0 h-64 min-h-[256px]">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={256}>
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
          )}
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
            {isLoading ? (
              <div className="space-y-3 py-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-16 bg-slate-50 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : topValidadesCriticas.length === 0 ? (
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
            {isLoading ? (
              <div className="space-y-3 py-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-16 bg-slate-50 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : topRupturas.length === 0 ? (
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
          {isLoading ? (
            <div className="space-y-2 py-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-14 bg-slate-50 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : recentAlerts.length === 0 ? (
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

      {/* ========================================================================= */}
      {/* CENTRAL ESTRATÉGICA — MODELO DE RISCO OPERACIONAL V1                       */}
      {/* ========================================================================= */}
      <StrategicCentralSection
        validades={validades}
        rupturas={rupturas}
        isLoading={isLoading}
        hasError={Boolean(hasError)}
        onRetry={refetchKpis}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers visuais de severidade
// ---------------------------------------------------------------------------
function getSeverityBadge(severity: SeverityLevel) {
  switch (severity) {
    case 'Crítico':
      return {
        label: 'Crítico',
        className: 'bg-red-50 text-red-700 border-red-200 ring-1 ring-red-500/10',
        barColor: 'bg-red-600',
      }
    case 'Alto':
      return {
        label: 'Alto',
        className: 'bg-orange-50 text-orange-700 border-orange-200 ring-1 ring-orange-500/10',
        barColor: 'bg-orange-500',
      }
    case 'Atenção':
      return {
        label: 'Atenção',
        className: 'bg-amber-50 text-amber-800 border-amber-200 ring-1 ring-amber-500/10',
        barColor: 'bg-amber-500',
      }
    case 'Monitorar':
    default:
      return {
        label: 'Monitorar',
        className: 'bg-blue-50 text-blue-700 border-blue-200 ring-1 ring-blue-500/10',
        barColor: 'bg-blue-500',
      }
  }
}

function getRankBadgeStyle(idx: number) {
  if (idx === 0) {
    return 'bg-amber-500 text-white shadow-xs font-bold'
  }
  if (idx === 1) {
    return 'bg-slate-300 text-slate-800 font-bold'
  }
  if (idx === 2) {
    return 'bg-amber-700/80 text-white font-bold'
  }
  return 'bg-slate-100 text-slate-600 font-semibold'
}

// ---------------------------------------------------------------------------
// Componente da Seção Central Estratégica
// ---------------------------------------------------------------------------
interface StrategicCentralProps {
  validades: ReturnType<typeof useValidades>['data']
  rupturas: ReturnType<typeof useRupturas>['data']
  isLoading: boolean
  hasError: boolean
  onRetry: () => void
}

const StrategicCentralSection: React.FC<StrategicCentralProps> = ({
  validades,
  rupturas,
  isLoading,
  hasError,
  onRetry,
}) => {
  const [showExplanation, setShowExplanation] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const { toast } = useToast()

  const handleExportCentral = async () => {
    setIsExporting(true)
    try {
      const snapshot = getBaseAtualSnapshot()
      if (validades?.length) snapshot.validades = validades
      if (rupturas?.length) snapshot.rupturas = rupturas

      downloadCentralEstrategicaXLSX(snapshot)
      toast({
        title: 'Exportação concluída',
        description: 'Central Estratégica exportada em XLSX (4 abas + Metadados).',
      })
    } catch (err) {
      toast({
        title: 'Erro ao exportar',
        description:
          err instanceof Error ? err.message : 'Falha ao exportar a Central Estratégica.',
        variant: 'destructive',
      })
    } finally {
      setIsExporting(false)
    }
  }

  // Motor estratégico executado puramente em memória sobre os dados da Base Atual
  const strategicData = useMemo(() => {
    if (!validades || !rupturas) {
      return {
        topLojas: [],
        topProdutos: [],
        topMarcas: [],
        actions: [],
      }
    }

    // 1. Expansão de rupturas totais em memória
    const { expanded } = expandBrandTotalRuptures(rupturas, validades)

    // 2. Extrair Lojas únicas
    const storeCodesMap = new Map<string, string>() // storeCode -> display name
    for (const v of validades) {
      const sCode = (v.codigoLoja || (v as any).codigo_loja || v.loja || '').trim()
      if (sCode) {
        storeCodesMap.set(sCode, v.loja || v.cliente || `Loja ${sCode}`)
      }
    }
    for (const r of rupturas) {
      const sCode = (r.codigo_loja || r.nome_loja || '').trim()
      if (sCode) {
        storeCodesMap.set(sCode, r.nome_loja || `Loja ${sCode}`)
      }
    }

    const lojasScores = Array.from(storeCodesMap.keys()).map((code) =>
      computeStoreRiskScore(code, validades, rupturas, expanded),
    )

    // 3. Extrair Produtos únicos
    const productNames = new Set<string>()
    for (const v of validades) {
      if (v.product) productNames.add(v.product)
    }
    for (const r of rupturas) {
      if (r.produto) productNames.add(r.produto)
    }
    for (const d of expanded) {
      if (d.productName) productNames.add(d.productName)
    }

    const produtosScores = Array.from(productNames).map((prod) =>
      computeProductRiskScore(prod, validades, rupturas, expanded),
    )

    // 4. Extrair Marcas / Indústrias únicas
    const brandNames = new Set<string>()
    for (const v of validades) {
      const b = v.cliente || v.industria
      if (b) brandNames.add(b)
    }
    for (const r of rupturas) {
      if (r.cliente) brandNames.add(r.cliente)
    }

    const marcasScores = Array.from(brandNames).map((brand) =>
      computeBrandRiskScore(brand, validades, rupturas),
    )

    // 5. Ações recomendadas transparentes
    const actions = generateRecommendedActions(lojasScores, produtosScores, marcasScores, validades)

    // Ordenar e pegar Top 5
    const topLojas = [...lojasScores]
      .sort((a, b) => b.score - a.score || b.rawPoints - a.rawPoints)
      .slice(0, 5)
    const topProdutos = [...produtosScores]
      .sort((a, b) => b.score - a.score || b.rawPoints - a.rawPoints)
      .slice(0, 5)
    const topMarcas = [...marcasScores]
      .sort((a, b) => b.score - a.score || b.rawPoints - a.rawPoints)
      .slice(0, 5)

    return {
      topLojas,
      topProdutos,
      topMarcas,
      actions,
    }
  }, [validades, rupturas])

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
      {/* Header da Sala de Decisão */}
      <div className="p-5 sm:p-6 border-b border-slate-100 bg-slate-50/40">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
                <ShieldAlert className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-extrabold text-slate-900 tracking-tight">
                    Central Estratégica
                  </h3>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                    Modelo de risco operacional {RISK_MODEL_VERSION}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Sala de decisão executiva com ranqueamento auditável de lojas, produtos e marcas.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center">
            <button
              type="button"
              onClick={handleExportCentral}
              disabled={isExporting}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-purple-700 hover:text-purple-800 px-3 py-2 rounded-xl border border-purple-200 bg-purple-50 hover:bg-purple-100 transition-colors shadow-2xs disabled:opacity-60"
            >
              <Download className="w-3.5 h-3.5 text-purple-600" />
              <span>{isExporting ? 'Exportando...' : 'Exportar Central (XLSX)'}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowExplanation((prev) => !prev)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-indigo-600 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors shadow-2xs"
            >
              <HelpCircle className="w-3.5 h-3.5 text-indigo-500" />
              <span>
                {showExplanation ? 'Ocultar regras de cálculo' : 'Como o score é calculado?'}
              </span>
            </button>
          </div>
        </div>

        {/* Disclosure Explicativo Elegante */}
        {showExplanation && (
          <div className="mt-4 p-4 rounded-xl bg-indigo-50/60 border border-indigo-100 text-xs text-slate-700 space-y-3 animate-fade-in">
            <div className="flex items-start gap-2.5">
              <Info className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
              <div className="space-y-2">
                <p className="font-semibold text-slate-900 leading-snug">
                  O índice de risco consolida dias até vencimento, volume em estoque e persistência
                  de rupturas ativas (máx. 100 pontos).
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                  <div className="bg-white p-2.5 rounded-lg border border-indigo-100/80">
                    <p className="font-bold text-[11px] text-red-700 uppercase tracking-wide">
                      1. Validades Próximas
                    </p>
                    <p className="text-[11px] text-slate-600 mt-1">
                      1–3d (10pts), 4–7d (8pts), 8–15d (5pts), 16–25d (2pts), 26–35d (1pt) +
                      adicional por quantidade (≥100: +4, 50–99: +3, 10–49: +1).
                    </p>
                  </div>

                  <div className="bg-white p-2.5 rounded-lg border border-indigo-100/80">
                    <p className="font-bold text-[11px] text-amber-700 uppercase tracking-wide">
                      2. Rupturas Ativas
                    </p>
                    <p className="text-[11px] text-slate-600 mt-1">
                      0–3d (2pts), 4–7d (4pts), 8–14d (7pts), 15+d (10pts). Rupturas de portfólio
                      total expandidas sem duplicações.
                    </p>
                  </div>

                  <div className="bg-white p-2.5 rounded-lg border border-indigo-100/80">
                    <p className="font-bold text-[11px] text-indigo-700 uppercase tracking-wide">
                      3. Faixas de Severidade
                    </p>
                    <p className="text-[11px] text-slate-600 mt-1">
                      Crítico (75–100), Alto (50–74), Atenção (25–49) e Monitorar (0–24). Totalmente
                      auditável e baseado em regras estritas.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="p-4 sm:p-6">
        {hasError ? (
          <div className="text-center py-8 space-y-3">
            <AlertTriangle className="w-8 h-8 text-red-500 mx-auto" />
            <p className="text-sm font-semibold text-slate-800">
              Não foi possível processar o ranqueamento estratégico
            </p>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Ocorreu um erro ao ler os registros da Base Atual. Verifique a conexão com o banco.
            </p>
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Tentar novamente
            </button>
          </div>
        ) : isLoading ? (
          <div className="space-y-3 py-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 bg-slate-50 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : (
          <Tabs defaultValue="lojas" className="w-full">
            {/* Tabs Responsivas com scroll horizontal seguro */}
            <div className="overflow-x-auto pb-1 mb-4 scrollbar-none">
              <TabsList className="inline-flex w-full min-w-[560px] sm:min-w-0 sm:grid sm:grid-cols-4 bg-slate-100/80 p-1 rounded-xl">
                <TabsTrigger
                  value="lojas"
                  className="text-xs font-semibold py-2 rounded-lg data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-xs transition-all flex items-center justify-center gap-2"
                >
                  <Building2 className="w-3.5 h-3.5" />
                  <span>Lojas Críticas</span>
                </TabsTrigger>
                <TabsTrigger
                  value="produtos"
                  className="text-xs font-semibold py-2 rounded-lg data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-xs transition-all flex items-center justify-center gap-2"
                >
                  <Package className="w-3.5 h-3.5" />
                  <span>Produtos Críticos</span>
                </TabsTrigger>
                <TabsTrigger
                  value="marcas"
                  className="text-xs font-semibold py-2 rounded-lg data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-xs transition-all flex items-center justify-center gap-2"
                >
                  <Boxes className="w-3.5 h-3.5" />
                  <span>Indústrias / Marcas</span>
                </TabsTrigger>
                <TabsTrigger
                  value="acoes"
                  className="text-xs font-semibold py-2 rounded-lg data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-xs transition-all flex items-center justify-center gap-2"
                >
                  <Zap className="w-3.5 h-3.5 text-amber-500" />
                  <span>Ações ({strategicData.actions.length})</span>
                </TabsTrigger>
              </TabsList>
            </div>

            {/* TAB 1: LOJAS CRÍTICAS */}
            <TabsContent value="lojas" className="space-y-3 mt-0">
              {strategicData.topLojas.length === 0 ? (
                <EmptyState
                  title="Nenhuma loja com risco detectado"
                  description="Não há registros de validade crítica ou ruptura ativa vinculados a lojas."
                />
              ) : (
                strategicData.topLojas.map((loja, idx) => {
                  const badge = getSeverityBadge(loja.severity)
                  const rankBadge = getRankBadgeStyle(idx)
                  const storeDisplay = formatStoreIdentity({
                    codigo_loja: loja.storeCode,
                    nome_loja: loja.storeName,
                  })
                  const cityUf = formatCityUf(loja.city, loja.state)

                  return (
                    <div
                      key={loja.storeCode || idx}
                      className="p-4 rounded-xl border border-slate-200/70 hover:border-slate-300 bg-white hover:bg-slate-50/50 transition-all space-y-3 shadow-2xs"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          <span
                            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs shrink-0 mt-0.5 ${rankBadge}`}
                          >
                            {idx + 1}
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-bold text-slate-900 truncate">
                                {storeDisplay}
                              </p>
                              {cityUf && (
                                <span className="text-xs text-slate-500 font-medium">
                                  ({cityUf})
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-slate-500">
                              <span>
                                Validades em risco:{' '}
                                <strong className="text-slate-700">{loja.validadesCount}</strong> (
                                {loja.validadesQuantityInRisk} un)
                              </span>
                              <span className="text-slate-300">•</span>
                              <span>
                                Rupturas ativas:{' '}
                                <strong className="text-slate-700">
                                  {loja.rupturasSpecificCount +
                                    loja.rupturasDerivedCount +
                                    loja.rupturasTotalUnresolvedCount}
                                </strong>{' '}
                                ({loja.rupturasSpecificCount} específicas,{' '}
                                {loja.rupturasDerivedCount} derivadas)
                              </span>
                              {loja.rawPoints > 100 && (
                                <>
                                  <span className="text-slate-300">•</span>
                                  <span className="text-slate-400 text-[11px]">
                                    Carga de risco: {loja.rawPoints} pts
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
                          <div className="text-right">
                            <div className="text-base font-extrabold text-slate-900 tabular-nums">
                              {loja.score}{' '}
                              <span className="text-xs text-slate-400 font-normal">/ 100</span>
                            </div>
                            <span
                              className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold border ${badge.className}`}
                            >
                              {badge.label}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Barra de progresso horizontal do score */}
                      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${badge.barColor} transition-all duration-300 rounded-full`}
                          style={{ width: `${Math.min(100, loja.score)}%` }}
                        />
                      </div>
                    </div>
                  )
                })
              )}
            </TabsContent>

            {/* TAB 2: PRODUTOS CRÍTICOS */}
            <TabsContent value="produtos" className="space-y-3 mt-0">
              {strategicData.topProdutos.length === 0 ? (
                <EmptyState
                  title="Nenhum produto com risco detectado"
                  description="Não há produtos ativos pontuando no modelo de risco."
                />
              ) : (
                strategicData.topProdutos.map((prod, idx) => {
                  const badge = getSeverityBadge(prod.severity)
                  const rankBadge = getRankBadgeStyle(idx)
                  return (
                    <div
                      key={`${prod.productName}_${idx}`}
                      className="p-4 rounded-xl border border-slate-200/70 hover:border-slate-300 bg-white hover:bg-slate-50/50 transition-all space-y-3 shadow-2xs"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          <span
                            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs shrink-0 mt-0.5 ${rankBadge}`}
                          >
                            {idx + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-900 truncate">
                              {prod.productName}
                            </p>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-slate-500">
                              <span>
                                Marca: <strong className="text-slate-700">{prod.brand}</strong>
                              </span>
                              {prod.productCode && (
                                <>
                                  <span className="text-slate-300">•</span>
                                  <span>
                                    Cód: <code className="text-slate-700">{prod.productCode}</code>
                                  </span>
                                </>
                              )}
                              <span className="text-slate-300">•</span>
                              <span>
                                Presente em{' '}
                                <strong className="text-slate-700">
                                  {prod.storesWithValidadeCount}
                                </strong>{' '}
                                loja(s) com validade e{' '}
                                <strong className="text-slate-700">
                                  {prod.storesWithRuptureCount}
                                </strong>{' '}
                                com ruptura
                              </span>
                              {prod.rawPoints > 100 && (
                                <>
                                  <span className="text-slate-300">•</span>
                                  <span className="text-slate-400 text-[11px]">
                                    Carga de risco: {prod.rawPoints} pts
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
                          <div className="text-right">
                            <div className="text-base font-extrabold text-slate-900 tabular-nums">
                              {prod.score}{' '}
                              <span className="text-xs text-slate-400 font-normal">/ 100</span>
                            </div>
                            <span
                              className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold border ${badge.className}`}
                            >
                              {badge.label}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Barra de progresso */}
                      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${badge.barColor} transition-all duration-300 rounded-full`}
                          style={{ width: `${Math.min(100, prod.score)}%` }}
                        />
                      </div>
                    </div>
                  )
                })
              )}
            </TabsContent>

            {/* TAB 3: INDÚSTRIAS / MARCAS */}
            <TabsContent value="marcas" className="space-y-3 mt-0">
              {strategicData.topMarcas.length === 0 ? (
                <EmptyState
                  title="Nenhuma marca com risco detectado"
                  description="Não há marcas registradas na Base Atual."
                />
              ) : (
                strategicData.topMarcas.map((marca, idx) => {
                  const badge = getSeverityBadge(marca.severity)
                  const rankBadge = getRankBadgeStyle(idx)
                  return (
                    <div
                      key={`${marca.brand}_${idx}`}
                      className="p-4 rounded-xl border border-slate-200/70 hover:border-slate-300 bg-white hover:bg-slate-50/50 transition-all space-y-3 shadow-2xs"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          <span
                            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs shrink-0 mt-0.5 ${rankBadge}`}
                          >
                            {idx + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-900 truncate">
                              {marca.brand}
                            </p>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-slate-500">
                              <span>
                                Validades em risco:{' '}
                                <strong className="text-slate-700">{marca.validadesCount}</strong> (
                                {marca.validadesQuantityInRisk} un)
                              </span>
                              <span className="text-slate-300">•</span>
                              <span>
                                Lojas com validade crítica (1-7d):{' '}
                                <strong className="text-slate-700">
                                  {marca.validadesCriticalStoresCount}
                                </strong>
                              </span>
                              <span className="text-slate-300">•</span>
                              <span>
                                Rupturas ativas:{' '}
                                <strong className="text-slate-700">{marca.rupturasCount}</strong> em{' '}
                                {marca.storesWithRuptureCount} loja(s)
                              </span>
                              {marca.rawPoints > 100 && (
                                <>
                                  <span className="text-slate-300">•</span>
                                  <span className="text-slate-400 text-[11px]">
                                    Carga de risco: {marca.rawPoints} pts
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
                          <div className="text-right">
                            <div className="text-base font-extrabold text-slate-900 tabular-nums">
                              {marca.score}{' '}
                              <span className="text-xs text-slate-400 font-normal">/ 100</span>
                            </div>
                            <span
                              className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold border ${badge.className}`}
                            >
                              {badge.label}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Barra de progresso */}
                      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${badge.barColor} transition-all duration-300 rounded-full`}
                          style={{ width: `${Math.min(100, marca.score)}%` }}
                        />
                      </div>
                    </div>
                  )
                })
              )}
            </TabsContent>

            {/* TAB 4: AÇÕES RECOMENDADAS TRANSPARENTES */}
            <TabsContent value="acoes" className="space-y-3 mt-0">
              {strategicData.actions.length === 0 ? (
                <EmptyState
                  title="Nenhuma ação emergencial disparada"
                  description="Nenhum critério estrito de visita prioritária, recolhimento ou ruptura recorrente foi atingido nos dados atuais."
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {strategicData.actions.map((act, idx) => {
                    const evidenceEntries = Object.entries(act.evidence || {})
                    return (
                      <div
                        key={idx}
                        className="p-4 rounded-xl border border-slate-200/80 bg-white hover:border-slate-300 transition-all space-y-2.5 shadow-2xs flex flex-col justify-between"
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                              <Zap className="w-4 h-4 text-amber-500 shrink-0" />
                              <span className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                                Recomendação Operacional
                              </span>
                            </div>
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-600 border border-slate-200">
                              {act.rule_id}
                            </span>
                          </div>

                          <p className="text-xs font-semibold text-slate-800 leading-snug">
                            {act.action}
                          </p>
                        </div>

                        {/* Chips / Evidências Humanizadas */}
                        <div className="pt-2 border-t border-slate-100">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                            Evidências identificadas
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {evidenceEntries.map(([key, val]) => {
                              const displayKey =
                                key === 'store_name'
                                  ? 'Loja'
                                  : key === 'store_code'
                                    ? 'Cód. Loja'
                                    : key === 'product_name'
                                      ? 'Produto'
                                      : key === 'brand'
                                        ? 'Marca'
                                        : key === 'quantity'
                                          ? 'Qtd'
                                          : key === 'days_remaining'
                                            ? 'Dias rest.'
                                            : key === 'days_in_rupture'
                                              ? 'Dias ruptura'
                                              : key === 'affected_stores_count'
                                                ? 'Lojas afetadas'
                                                : key
                              return (
                                <span
                                  key={key}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200/70 text-[11px] text-slate-700"
                                >
                                  <span className="text-slate-400 font-medium">{displayKey}:</span>
                                  <strong className="font-semibold text-slate-800">
                                    {String(val)}
                                  </strong>
                                </span>
                              )
                            })}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  )
}
