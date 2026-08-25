import React, { useState, useMemo, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft,
  Download,
  AlertOctagon,
  CalendarClock,
  Package,
  Building2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  ShieldAlert,
  CalendarCheck,
  RotateCcw,
} from 'lucide-react'
import { useLojas } from '@/services/useLojas'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyState } from '@/components/ui/empty-state'
import { CriticidadeBadge } from '@/components/validades/CriticidadeBadge'
import { formatStoreIdentityTable, formatCityUf } from '@/lib/format/storeIdentity'
import { formatDisplayDate } from '@/lib/format/dateParser'
import { classificarCriticidade } from '@/lib/data/criticidade'
import { exportStoreDetailXLSX } from '@/lib/export/lojasTableViewExport'
import { useToast } from '@/hooks/use-toast'
import type { ValidadeItem, Ruptura } from '@/types'

type PageSizeOption = 25 | 50 | 100

export const StoreDetailPage: React.FC = () => {
  const { storeId } = useParams<{ storeId: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()

  const { stores, isLoading, error, getStoreById, refetch } = useLojas()

  const store = getStoreById(storeId || '')

  // Estados de paginação para as abas
  const [validadesPage, setValidadesPage] = useState(1)
  const [validadesPageSize, setValidadesPageSize] = useState<PageSizeOption>(25)

  const [rupturasPage, setRupturasPage] = useState(1)
  const [rupturasPageSize, setRupturasPageSize] = useState<PageSizeOption>(25)

  // 4 KPIs no cabeçalho sobre esta loja
  const kpis = useMemo(() => {
    if (!store) {
      return {
        casosComplexos: 0,
        atencao: 0,
        rupturasAtivas: 0,
        marcasMonitoradas: 0,
      }
    }
    return {
      casosComplexos: store.validadesCriticasCount,
      atencao: store.validadesAtencaoCount,
      rupturasAtivas: store.rupturasAtivasCount,
      marcasMonitoradas: store.marcasCount,
    }
  }, [store])

  // Aba Visão Atual: listas compactas
  // A) Validades prioritárias (até 30 dias) ordenadas por diasRestantes crescente (máx 10)
  const prioridadeValidades = useMemo(() => {
    if (!store) return []
    return [...store.itemsAtivos]
      .filter((v) => v.diasRestantes <= 30)
      .sort((a, b) => a.diasRestantes - b.diasRestantes)
      .slice(0, 10)
  }, [store])

  // B) Rupturas ativas ordenadas por dias em ruptura decrescente (máx 10)
  const prioridadeRupturas = useMemo(() => {
    if (!store) return []
    return [...store.rupturasList]
      .sort((a, b) => (b.dias_em_ruptura ?? 0) - (a.dias_em_ruptura ?? 0))
      .slice(0, 10)
  }, [store])

  // Aba Validades: ordenadas por diasRestantes crescente
  const sortedValidades = useMemo(() => {
    if (!store) return []
    return [...store.itemsAtivos].sort((a, b) => a.diasRestantes - b.diasRestantes)
  }, [store])

  // Aba Rupturas: ordenadas por dias_em_ruptura decrescente
  const sortedRupturas = useMemo(() => {
    if (!store) return []
    return [...store.rupturasList].sort(
      (a, b) => (b.dias_em_ruptura ?? 0) - (a.dias_em_ruptura ?? 0),
    )
  }, [store])

  // Paginação Validades
  const totalValidades = sortedValidades.length
  const totalValidadesPages = Math.max(1, Math.ceil(totalValidades / validadesPageSize))
  const paginatedValidades = useMemo(() => {
    const start = (validadesPage - 1) * validadesPageSize
    return sortedValidades.slice(start, start + validadesPageSize)
  }, [sortedValidades, validadesPage, validadesPageSize])

  // Paginação Rupturas
  const totalRupturas = sortedRupturas.length
  const totalRupturasPages = Math.max(1, Math.ceil(totalRupturas / rupturasPageSize))
  const paginatedRupturas = useMemo(() => {
    const start = (rupturasPage - 1) * rupturasPageSize
    return sortedRupturas.slice(start, start + rupturasPageSize)
  }, [sortedRupturas, rupturasPage, rupturasPageSize])

  // Exportação da Loja em XLSX (2 abas)
  const handleExportLoja = useCallback(() => {
    if (!store) return
    if (store.itemsAtivos.length === 0 && store.rupturasList.length === 0) return

    try {
      const { fileName } = exportStoreDetailXLSX(
        { storeCode: store.storeCode, storeName: store.storeName },
        store.itemsAtivos,
        store.rupturasList,
      )

      toast({
        title: 'Exportação concluída',
        description: `Dados da loja exportados com sucesso em ${fileName}.`,
      })
    } catch (err) {
      toast({
        title: 'Erro ao exportar',
        description: err instanceof Error ? err.message : 'Falha ao exportar dados da loja.',
        variant: 'destructive',
      })
    }
  }, [store, toast])

  if (isLoading) {
    return (
      <div className="p-8 space-y-4 animate-fade-in">
        <div className="h-8 w-48 bg-slate-100 rounded animate-pulse" />
        <div className="h-32 bg-slate-100 rounded-2xl animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 bg-slate-100 rounded-2xl animate-pulse" />
          ))}
        </div>
        <div className="h-64 bg-slate-100 rounded-2xl animate-pulse" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8 text-center space-y-4 max-w-md mx-auto">
        <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 mx-auto flex items-center justify-center">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h3 className="text-sm font-bold text-slate-900">Erro ao carregar detalhes da loja</h3>
        <p className="text-xs text-slate-500">{error.message}</p>
        <div className="flex items-center justify-center gap-2">
          <Button onClick={() => refetch()} variant="outline" size="sm">
            <RotateCcw className="w-4 h-4 mr-1.5" />
            Tentar novamente
          </Button>
          <Button onClick={() => navigate('/lojas')} variant="outline" size="sm">
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            Voltar para Lojas
          </Button>
        </div>
      </div>
    )
  }

  if (!store) {
    return (
      <div className="p-12 text-center bg-white rounded-2xl border border-slate-200/80 shadow-xs space-y-4 max-w-lg mx-auto mt-8">
        <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
          <Building2 className="w-6 h-6" />
        </div>
        <EmptyState
          title="Loja não encontrada"
          description="Não foi possível localizar o cadastro operacional correspondente ao identificador informado."
        />
        <Button onClick={() => navigate('/lojas')} variant="outline" size="sm" className="gap-2">
          <ArrowLeft className="w-4 h-4" />
          <span>Voltar para Lojas</span>
        </Button>
      </div>
    )
  }

  const storeTitle = formatStoreIdentityTable({
    codigoLoja: store.storeCode,
    nomeLoja: store.storeName,
  })

  const hasExportData = store.itemsAtivos.length > 0 || store.rupturasList.length > 0

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in pb-12">
        {/* Botão Voltar */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/lojas')}
            className="gap-1 text-xs text-slate-600 hover:text-slate-900 -ml-2"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Voltar para lojas</span>
          </Button>
        </div>

        {/* Header Skeleton */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs animate-pulse">
          <div className="h-4 bg-slate-100 rounded w-24 mb-2" />
          <div className="h-7 bg-slate-200 rounded w-72 mb-2" />
          <div className="h-4 bg-slate-100 rounded w-48" />
        </div>

        {/* 4 KPIs Skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs animate-pulse"
            >
              <div className="h-4 bg-slate-100 rounded w-28 mb-3" />
              <div className="h-8 bg-slate-200 rounded w-16 mb-2" />
              <div className="h-3 bg-slate-100 rounded w-36" />
            </div>
          ))}
        </div>

        {/* Tabs Skeleton */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-4">
          <div className="h-6 bg-slate-100 rounded w-48 animate-pulse" />
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 bg-slate-50 rounded-lg animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Botão Voltar */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/lojas')}
          className="gap-1 text-xs text-slate-600 hover:text-slate-900 -ml-2"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Voltar para lojas</span>
        </Button>
      </div>
      {/* Header do Detalhe da Loja */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">{storeTitle}</h1>
              {store.situacao === 'Crítica' ? (
                <Badge
                  variant="outline"
                  className="bg-red-50 text-red-700 border-red-200 font-semibold text-xs"
                >
                  Crítica
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold text-xs"
                >
                  Normal
                </Badge>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              <span className="font-semibold text-slate-700">{store.networkName}</span>
              <span className="mx-1.5">•</span>
              <span>{formatCityUf(store.city, store.uf)}</span>
            </p>
          </div>
        </div>

        {/* CTA Único "Exportar loja (.xlsx)" */}
        <Button
          onClick={handleExportLoja}
          disabled={!hasExportData}
          className="h-10 px-4 gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs self-start sm:self-center font-semibold text-xs rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Download className="w-4 h-4" />
          <span>Exportar loja (.xlsx)</span>
        </Button>
      </div>

      {/* 4 KPIs do Cabeçalho da Loja */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Casos complexos (validades 0-15d) */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Casos complexos
            </span>
            <div className="w-8 h-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center">
              <AlertOctagon className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-red-600 mt-2">{kpis.casosComplexos}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Validades 0 a 15 dias</p>
        </div>

        {/* KPI 2: Atenção (validades 16-30d) */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Atenção
            </span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <CalendarClock className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-amber-700 mt-2">{kpis.atencao}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Validades 16 a 30 dias</p>
        </div>

        {/* KPI 3: Rupturas ativas */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Rupturas ativas
            </span>
            <div className="w-8 h-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-red-600 mt-2">{kpis.rupturasAtivas}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Ocorrências ativas na loja</p>
        </div>

        {/* KPI 4: Marcas monitoradas */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Marcas monitoradas
            </span>
            <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center">
              <Building2 className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2">{kpis.marcasMonitoradas}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Marcas com presença na loja</p>
        </div>
      </div>

      {/* Abas */}
      <Tabs defaultValue="visao-atual" className="w-full">
        <TabsList className="bg-slate-100 p-1 rounded-xl shadow-2xs mb-4 flex gap-1 flex-wrap">
          <TabsTrigger
            value="visao-atual"
            className="gap-2 text-xs font-semibold py-2 px-4 rounded-lg data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-2xs"
          >
            <CalendarCheck className="w-4 h-4 text-indigo-600" />
            <span>Visão Atual</span>
          </TabsTrigger>
          <TabsTrigger
            value="validades"
            className="gap-2 text-xs font-semibold py-2 px-4 rounded-lg data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-2xs"
          >
            <CalendarClock className="w-4 h-4 text-amber-600" />
            <span>Validades ({store.itemsAtivos.length})</span>
          </TabsTrigger>
          <TabsTrigger
            value="rupturas"
            className="gap-2 text-xs font-semibold py-2 px-4 rounded-lg data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-2xs"
          >
            <Package className="w-4 h-4 text-blue-600" />
            <span>Rupturas ({store.rupturasList.length})</span>
          </TabsTrigger>
          <TabsTrigger
            value="auditoria"
            className="gap-2 text-xs font-semibold py-2 px-4 rounded-lg data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-2xs"
          >
            <ShieldAlert className="w-4 h-4 text-red-600" />
            <span>Auditoria ({store.itemsAuditoria.length})</span>
          </TabsTrigger>
        </TabsList>

        {/* ABA 1: Visão Atual (Default) */}
        <TabsContent value="visao-atual" className="space-y-6 mt-0">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* A) Validades prioritárias (até 30 dias) */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Validades prioritárias (até 30 dias)
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">Lotes com vencimento mais próximo</p>
                </div>
                <Badge variant="outline" className="text-xs bg-slate-50 text-slate-700">
                  {prioridadeValidades.length} item(s)
                </Badge>
              </div>

              {prioridadeValidades.length === 0 ? (
                <EmptyState
                  title="Nenhuma validade crítica iminente"
                  description="Todos os lotes monitorados estão com vencimento superior a 30 dias."
                  className="py-8"
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50/70 border-b border-slate-200 text-slate-600 font-semibold">
                        <th className="py-2.5 px-3">Produto</th>
                        <th className="py-2.5 px-3">Marca</th>
                        <th className="py-2.5 px-3 text-center">Dias</th>
                        <th className="py-2.5 px-3">Validade</th>
                        <th className="py-2.5 px-3 text-center">Criticidade</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {prioridadeValidades.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50/60">
                          <td
                            className="py-2.5 px-3 font-medium text-slate-900 max-w-[200px] truncate"
                            title={item.product}
                          >
                            {item.product}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                            {item.cliente}
                          </td>
                          <td className="py-2.5 px-3 text-center font-bold text-slate-900 tabular-nums">
                            {item.diasRestantes}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap tabular-nums">
                            {formatDisplayDate(item.validade, '—')}
                          </td>
                          <td className="py-2.5 px-3 text-center whitespace-nowrap">
                            <CriticidadeBadge
                              level={classificarCriticidade(item.diasRestantes)}
                              diasRestantes={item.diasRestantes}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="pt-2 border-t border-slate-100 flex justify-end">
                <Link
                  to={`/validades?loja=${encodeURIComponent(store.storeId || store.storeName)}`}
                  className="text-xs text-indigo-600 hover:text-indigo-700 font-semibold inline-flex items-center gap-1 hover:underline"
                >
                  <span>Ver todas as validades</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>

            {/* B) Rupturas ativas */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Rupturas ativas</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Ocorrências ordenadas por tempo em desabastecimento
                  </p>
                </div>
                <Badge variant="outline" className="text-xs bg-slate-50 text-slate-700">
                  {prioridadeRupturas.length} item(s)
                </Badge>
              </div>

              {prioridadeRupturas.length === 0 ? (
                <EmptyState
                  title="Nenhuma ruptura ativa"
                  description="Não há ocorrências de ruptura pendentes nesta loja."
                  className="py-8"
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50/70 border-b border-slate-200 text-slate-600 font-semibold">
                        <th className="py-2.5 px-3">Produto</th>
                        <th className="py-2.5 px-3">Marca</th>
                        <th className="py-2.5 px-3">Motivo</th>
                        <th className="py-2.5 px-3 text-center">Dias Ruptura</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {prioridadeRupturas.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50/60">
                          <td
                            className="py-2.5 px-3 font-medium text-slate-900 max-w-[200px] truncate"
                            title={item.produto}
                          >
                            {item.produto}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                            {item.cliente}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                            <Badge
                              variant="outline"
                              className={
                                item.motivo === 'Ruptura Total'
                                  ? 'bg-rose-50 text-rose-700 border-rose-200 text-[10px]'
                                  : 'bg-amber-50 text-amber-800 border-amber-200 text-[10px]'
                              }
                            >
                              {item.motivo}
                            </Badge>
                          </td>
                          <td className="py-2.5 px-3 text-center font-bold text-slate-900 tabular-nums">
                            {item.dias_em_ruptura ?? 0}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="pt-2 border-t border-slate-100 flex justify-end">
                <Link
                  to={`/rupturas?loja=${encodeURIComponent(store.storeId || store.storeCode || store.storeName)}`}
                  className="text-xs text-indigo-600 hover:text-indigo-700 font-semibold inline-flex items-center gap-1 hover:underline"
                >
                  <span>Ver todas as rupturas</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ABA 2: Validades (7 colunas SEM Loja) */}
        <TabsContent value="validades" className="space-y-4 mt-0">
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            {sortedValidades.length === 0 ? (
              <EmptyState
                title="Nenhuma validade ativa"
                description="Não há ocorrências de validade ativa registradas nesta loja."
                className="py-12"
              />
            ) : (
              <>
                <div className="p-4 bg-slate-50/50 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-500">
                  <span className="font-medium text-slate-700">
                    {totalValidades} validade(s) ativa(s)
                  </span>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-500">Itens por página:</span>
                      <select
                        aria-label="Itens por página"
                        value={validadesPageSize}
                        onChange={(e) => {
                          setValidadesPageSize(Number(e.target.value) as PageSizeOption)
                          setValidadesPage(1)
                        }}
                        className="h-8 px-2 py-0.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                      >
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                      </select>
                    </div>
                    <span>
                      Página {validadesPage} de {totalValidadesPages}
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50/70 border-b border-slate-200 text-slate-600 font-semibold select-none">
                        <th className="py-3 px-4 min-w-[140px]">Marca</th>
                        <th className="py-3 px-4 min-w-[110px] tabular-nums">Realizado</th>
                        <th className="py-3 px-4 min-w-[220px]">Produto</th>
                        <th className="py-3 px-4 text-center tabular-nums min-w-[120px]">
                          Dias pra vencer
                        </th>
                        <th className="py-3 px-4 min-w-[110px] tabular-nums">Validade</th>
                        <th className="py-3 px-4 text-center min-w-[130px]">Criticidade</th>
                        <th className="py-3 px-4 min-w-[110px] tabular-nums">Data de Entrada</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {paginatedValidades.map((row) => {
                        const criticidadeNivel = classificarCriticidade(row.diasRestantes)
                        return (
                          <tr key={row.id} className="hover:bg-slate-50/60">
                            {/* 1. Marca */}
                            <td className="py-3 px-4 font-medium text-slate-700 whitespace-nowrap">
                              {row.cliente || '—'}
                            </td>
                            {/* 2. Realizado */}
                            <td className="py-3 px-4 text-slate-600 whitespace-nowrap tabular-nums">
                              {formatDisplayDate(row.dataEntrada, '—')}
                            </td>
                            {/* 3. Produto */}
                            <td className="py-3 px-4 max-w-[280px]">
                              <div className="min-w-0" title={row.product}>
                                <p className="font-medium text-slate-900 truncate">
                                  {row.product || '—'}
                                </p>
                                <p className="text-[11px] text-slate-400 mt-0.5 font-mono">
                                  {row.sku && row.sku !== 'Código não informado'
                                    ? `SKU: ${row.sku}`
                                    : 'Código não informado'}
                                </p>
                              </div>
                            </td>
                            {/* 4. Dias pra vencer */}
                            <td className="py-3 px-4 text-center tabular-nums">
                              <span
                                className={
                                  row.diasRestantes <= 15
                                    ? 'text-red-600 font-bold'
                                    : row.diasRestantes <= 30
                                      ? 'text-amber-600 font-semibold'
                                      : 'text-slate-800 font-semibold'
                                }
                              >
                                {row.diasRestantes}
                              </span>
                            </td>
                            {/* 5. Validade */}
                            <td className="py-3 px-4 text-slate-700 whitespace-nowrap tabular-nums font-medium">
                              {formatDisplayDate(row.validade, '—')}
                            </td>
                            {/* 6. Criticidade (Classificação Oficial) */}
                            <td className="py-3 px-4 text-center whitespace-nowrap">
                              <CriticidadeBadge
                                level={criticidadeNivel}
                                diasRestantes={row.diasRestantes}
                              />
                            </td>
                            {/* 7. Data de Entrada */}
                            <td className="py-3 px-4 text-slate-500 whitespace-nowrap tabular-nums text-xs">
                              {formatDisplayDate(row.ultimaAtualizacao || row.dataEntrada, '—')}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Paginação */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 bg-white border-t border-slate-100 text-xs text-slate-600">
                  <span>
                    Mostrando{' '}
                    <strong className="text-slate-900">
                      {(validadesPage - 1) * validadesPageSize + 1}
                    </strong>
                    –
                    <strong className="text-slate-900">
                      {Math.min(validadesPage * validadesPageSize, totalValidades)}
                    </strong>{' '}
                    de <strong className="text-slate-900">{totalValidades}</strong> ocorrência(s)
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={validadesPage <= 1}
                      onClick={() => setValidadesPage((p) => Math.max(1, p - 1))}
                      className="h-8 px-2.5 text-xs gap-1 border-slate-200 rounded-lg hover:bg-slate-50"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      <span>Anterior</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={validadesPage >= totalValidadesPages}
                      onClick={() => setValidadesPage((p) => Math.min(totalValidadesPages, p + 1))}
                      className="h-8 px-2.5 text-xs gap-1 border-slate-200 rounded-lg hover:bg-slate-50"
                    >
                      <span>Próxima</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </TabsContent>

        {/* ABA 3: Rupturas (6 colunas SEM Loja) */}
        <TabsContent value="rupturas" className="space-y-4 mt-0">
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            {sortedRupturas.length === 0 ? (
              <EmptyState
                title="Nenhuma ruptura registrada"
                description="Não há registros de ruptura para esta loja na Base Atual."
                className="py-12"
              />
            ) : (
              <>
                <div className="p-4 bg-slate-50/50 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-500">
                  <span className="font-medium text-slate-700">
                    {totalRupturas} ruptura(s) ativa(s)
                  </span>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-500">Itens por página:</span>
                      <select
                        aria-label="Itens por página"
                        value={rupturasPageSize}
                        onChange={(e) => {
                          setRupturasPageSize(Number(e.target.value) as PageSizeOption)
                          setRupturasPage(1)
                        }}
                        className="h-8 px-2 py-0.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                      >
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                      </select>
                    </div>
                    <span>
                      Página {rupturasPage} de {totalRupturasPages}
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50/70 border-b border-slate-200 text-slate-600 font-semibold select-none">
                        <th className="py-3 px-4 min-w-[140px]">Marca</th>
                        <th className="py-3 px-4 min-w-[110px] tabular-nums">Data da Visita</th>
                        <th className="py-3 px-4 min-w-[220px]">Produto</th>
                        <th className="py-3 px-4 min-w-[140px]">Motivo</th>
                        <th className="py-3 px-4 text-center tabular-nums min-w-[120px]">
                          Dias em Ruptura
                        </th>
                        <th className="py-3 px-4 min-w-[110px]">Situação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {paginatedRupturas.map((row) => (
                        <tr key={row.id} className="hover:bg-slate-50/60">
                          {/* 1. Marca */}
                          <td className="py-3 px-4 font-medium text-slate-700 whitespace-nowrap">
                            {row.cliente || '—'}
                          </td>
                          {/* 2. Data da Visita */}
                          <td className="py-3 px-4 text-slate-600 whitespace-nowrap tabular-nums">
                            {formatDisplayDate(row.data_visita, '—')}
                          </td>
                          {/* 3. Produto */}
                          <td className="py-3 px-4 max-w-[280px]">
                            <p className="font-medium text-slate-900 truncate" title={row.produto}>
                              {row.produto || '—'}
                            </p>
                          </td>
                          {/* 4. Motivo */}
                          <td className="py-3 px-4 whitespace-nowrap">
                            <Badge
                              variant="outline"
                              className={
                                row.motivo === 'Ruptura Total'
                                  ? 'bg-rose-50 text-rose-700 border-rose-200 text-[10px]'
                                  : 'bg-amber-50 text-amber-800 border-amber-200 text-[10px]'
                              }
                            >
                              {row.motivo || '—'}
                            </Badge>
                          </td>
                          {/* 5. Dias em Ruptura */}
                          <td className="py-3 px-4 text-center tabular-nums">
                            <span
                              className={
                                (row.dias_em_ruptura ?? 0) > 5
                                  ? 'text-rose-600 font-extrabold'
                                  : (row.dias_em_ruptura ?? 0) > 2
                                    ? 'text-amber-600 font-bold'
                                    : 'text-slate-700 font-semibold'
                              }
                            >
                              {row.dias_em_ruptura ?? 0}
                            </span>
                          </td>
                          {/* 6. Situação */}
                          <td className="py-3 px-4 whitespace-nowrap">
                            <Badge
                              variant="outline"
                              className="bg-rose-50 text-rose-700 border-rose-200 font-semibold text-[11px]"
                            >
                              {row.situacao_atual === 'Ativo'
                                ? 'Ativa'
                                : row.situacao_atual || 'Ativa'}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Paginação */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 bg-white border-t border-slate-100 text-xs text-slate-600">
                  <span>
                    Mostrando{' '}
                    <strong className="text-slate-900">
                      {(rupturasPage - 1) * rupturasPageSize + 1}
                    </strong>
                    –
                    <strong className="text-slate-900">
                      {Math.min(rupturasPage * rupturasPageSize, totalRupturas)}
                    </strong>{' '}
                    de <strong className="text-slate-900">{totalRupturas}</strong> ocorrência(s)
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={rupturasPage <= 1}
                      onClick={() => setRupturasPage((p) => Math.max(1, p - 1))}
                      className="h-8 px-2.5 text-xs gap-1 border-slate-200 rounded-lg hover:bg-slate-50"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      <span>Anterior</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={rupturasPage >= totalRupturasPages}
                      onClick={() => setRupturasPage((p) => Math.min(totalRupturasPages, p + 1))}
                      className="h-8 px-2.5 text-xs gap-1 border-slate-200 rounded-lg hover:bg-slate-50"
                    >
                      <span>Próxima</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </TabsContent>

        {/* ABA 4: Auditoria (simplificada: Produto, Marca, Validade Expirada, Dias Vencido, Quantidade) */}
        <TabsContent value="auditoria" className="space-y-4 mt-0">
          <div className="bg-red-50/40 p-4 rounded-xl border border-red-200/80 flex items-start gap-3 text-xs">
            <ShieldAlert className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-red-900">Isolamento de Ocorrências Vencidas</p>
              <p className="text-red-700 mt-0.5">
                Esta aba consolida ocorrências com validade expirada (dias &lt; 0) ou dados em
                auditoria para esta loja.
              </p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="p-4 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">
                Itens em Auditoria ({store.itemsAuditoria.length})
              </h3>
              <Link
                to="/auditoria"
                className="text-xs text-indigo-600 hover:underline font-semibold flex items-center gap-1"
              >
                <span>Painel Global de Auditoria</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>
            </div>

            {store.itemsAuditoria.length === 0 ? (
              <EmptyState
                title="Nenhum item em auditoria para esta loja"
                description="Não há registros expirados ou com divergência para auditoria."
                className="py-10"
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50/70 border-b border-slate-200 text-slate-600 font-semibold select-none">
                      <th className="py-3 px-4 min-w-[200px]">Produto</th>
                      <th className="py-3 px-4 min-w-[130px]">Marca</th>
                      <th className="py-3 px-4 min-w-[120px] tabular-nums">Validade Expirada</th>
                      <th className="py-3 px-4 text-center min-w-[120px]">Dias Vencido</th>
                      <th className="py-3 px-4 text-right min-w-[100px]">Quantidade</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {store.itemsAuditoria.map((item) => (
                      <tr key={item.id} className="hover:bg-red-50/30">
                        {/* 1. Produto */}
                        <td className="py-3 px-4 max-w-[260px]">
                          <div className="min-w-0" title={item.product}>
                            <p className="font-medium text-slate-900 truncate">{item.product}</p>
                            <p className="text-[11px] text-slate-400 font-mono">
                              {item.sku && item.sku !== 'Código não informado'
                                ? `SKU: ${item.sku}`
                                : 'Código não informado'}
                            </p>
                          </div>
                        </td>
                        {/* 2. Marca */}
                        <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                          {item.cliente || '—'}
                        </td>
                        {/* 3. Validade Expirada */}
                        <td className="py-3 px-4 font-medium text-red-700 whitespace-nowrap tabular-nums">
                          {formatDisplayDate(item.validade, '—')}
                        </td>
                        {/* 4. Dias Vencido */}
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <Badge
                            variant="outline"
                            className="bg-red-100 text-red-800 border-red-200 font-bold"
                          >
                            {Math.abs(item.diasRestantes)} dias atrás
                          </Badge>
                        </td>
                        {/* 5. Quantidade */}
                        <td className="py-3 px-4 text-right font-bold text-slate-900 tabular-nums whitespace-nowrap">
                          {item.quantidade ?? item.estoque} un
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
