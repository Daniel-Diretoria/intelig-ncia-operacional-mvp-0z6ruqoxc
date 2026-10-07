import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  Download,
  ChevronLeft,
  ChevronRight,
  Search,
  RotateCcw,
  X,
  Info,
  ExternalLink,
  ShieldAlert,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { useRupturas } from '@/services/useRupturas'
import {
  RupturasKpisCards,
  type OperationalRupturasKpisData,
} from '@/components/rupturas/RupturasKpisCards'
import { formatStoreIdentityTable } from '@/lib/export/validadeTableViewExport'
import { formatDisplayDate } from '@/lib/format/dateParser'
import { deriveNetworkName, buildStoreCompositeKey } from '@/lib/format/storeIdentity'
import { normalizeStoreCode } from '@/lib/format/storeCode'
import { exportRupturasTableViewXLSX } from '@/lib/export/rupturaTableViewExport'
import type { Ruptura, RupturaMotivo } from '@/types/rupturas'
import type { RupturaEncerrada } from '@/lib/engine/confrontoBidirecional'

type PageSizeOption = 25 | 50 | 100

interface FilterState {
  search: string
  cliente: string
  rede: string
  loja: string
  cidade: string
  produto: string
  motivo: string
  dataInicio: string
  dataFim: string
}

const initialFilterState: FilterState = {
  search: '',
  cliente: 'Todos',
  rede: 'Todos',
  loja: 'Todos',
  cidade: 'Todos',
  produto: 'Todos',
  motivo: 'Todos',
  dataInicio: '',
  dataFim: '',
}

export function RupturasPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { toast } = useToast()

  // Alternância Ativas vs Histórico
  const [viewMode, setViewMode] = useState<'ativas' | 'historico'>('ativas')

  // Filtros de barra
  const [filterState, setFilterState] = useState<FilterState>(initialFilterState)

  useEffect(() => {
    const lojaParam = searchParams.get('loja') || searchParams.get('storeId')
    if (lojaParam) {
      setFilterState((prev) => ({ ...prev, search: lojaParam }))
    }
  }, [searchParams])

  // Filtro de KPI clicável: 'lojasCriticas' | 'rupturaTotal' | null
  const [selectedKpi, setSelectedKpi] = useState<'lojasCriticas' | 'rupturaTotal' | null>(null)

  // Paginação e ordenação
  const [sortKey, setSortKey] = useState<
    'dias_em_ruptura' | 'data_visita' | 'produto' | 'nome_loja'
  >('dias_em_ruptura')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc') // Default: decrescente (maior urgência primeiro)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState<PageSizeOption>(25)

  // Constrói query para o hook
  const queryFilters = useMemo(() => {
    return {
      search: filterState.search.trim() || undefined,
      cliente: filterState.cliente !== 'Todos' ? filterState.cliente : undefined,
      rede: filterState.rede !== 'Todos' ? filterState.rede : undefined,
      loja: filterState.loja !== 'Todos' ? filterState.loja : undefined,
      cidade: filterState.cidade !== 'Todos' ? filterState.cidade : undefined,
      produto: filterState.produto !== 'Todos' ? filterState.produto : undefined,
      motivo:
        selectedKpi === 'rupturaTotal'
          ? ('Ruptura Total' as RupturaMotivo)
          : filterState.motivo !== 'Todos'
            ? (filterState.motivo as RupturaMotivo)
            : undefined,
      dataInicio: filterState.dataInicio || undefined,
      dataFim: filterState.dataFim || undefined,
    }
  }, [filterState, selectedKpi])

  const { filteredRupturas, historicoRupturas, conflitos, isLoading, error, refetch } =
    useRupturas(queryFilters)

  // Determina conjunto de dados de acordo com a alternância Ativas vs Histórico
  const baseItems: Array<Ruptura | RupturaEncerrada> = useMemo(() => {
    if (viewMode === 'historico') {
      return historicoRupturas
    }

    // Se KPI de lojas críticas estiver ativo, filtra lojas com ao menos 1 ruptura
    if (selectedKpi === 'lojasCriticas') {
      // Como já estamos em filteredRupturas, todas as lojas aqui têm rupturas ativas
      return filteredRupturas
    }

    return filteredRupturas
  }, [viewMode, historicoRupturas, filteredRupturas, selectedKpi])

  // 4 KPIs calculados estritamente sobre filteredRupturas (Fonte Única de Verdade)
  const kpisData: OperationalRupturasKpisData = useMemo(() => {
    const ativasCount = filteredRupturas.length

    // Lojas críticas distintas (pelo codigo_loja ou nome_loja)
    const lojasSet = new Set<string>()
    let rupturaTotalCount = 0
    let totalDias = 0

    for (const r of filteredRupturas) {
      const storeCode = normalizeStoreCode(r.codigo_loja) || r.nome_loja
      lojasSet.add(storeCode)

      if (r.motivo === 'Ruptura Total') {
        rupturaTotalCount++
      }

      totalDias += r.dias_em_ruptura ?? 0
    }

    const tempoMedio = ativasCount > 0 ? Math.round(totalDias / ativasCount) : 0

    return {
      ativas: ativasCount,
      lojasCriticas: lojasSet.size,
      rupturaTotal: rupturaTotalCount,
      tempoMedioDias: tempoMedio,
    }
  }, [filteredRupturas])

  const totalFilteredCount =
    viewMode === 'historico' ? historicoRupturas.length : filteredRupturas.length

  // Ordenação dos dados
  const sortedItems = useMemo(() => {
    const list = [...baseItems]
    list.sort((a, b) => {
      let valA: unknown
      let valB: unknown

      if (sortKey === 'dias_em_ruptura') {
        valA = a.dias_em_ruptura ?? 0
        valB = b.dias_em_ruptura ?? 0
      } else if (sortKey === 'data_visita') {
        valA = a.data_visita ? new Date(a.data_visita).getTime() : 0
        valB = b.data_visita ? new Date(b.data_visita).getTime() : 0
      } else if (sortKey === 'produto') {
        valA = a.produto || ''
        valB = b.produto || ''
      } else {
        valA = formatStoreIdentityTable({ codigoLoja: a.codigo_loja, loja: a.nome_loja })
        valB = formatStoreIdentityTable({ codigoLoja: b.codigo_loja, loja: b.nome_loja })
      }

      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortOrder === 'asc' ? valA - valB : valB - valA
      }

      const sA = String(valA ?? '')
      const sB = String(valB ?? '')
      const cmp = sA.localeCompare(sB, 'pt-BR', { numeric: true, sensitivity: 'base' })
      return sortOrder === 'asc' ? cmp : -cmp
    })
    return list
  }, [baseItems, sortKey, sortOrder])

  // Paginação
  const totalPages = Math.max(1, Math.ceil(sortedItems.length / pageSize))
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return sortedItems.slice(start, start + pageSize)
  }, [sortedItems, currentPage, pageSize])

  // Opções para os filtros derivadas dinamicamente da Base Atual
  const filterOptions = useMemo(() => {
    const clientesSet = new Set<string>()
    const redesSet = new Set<string>()
    const lojasMap = new Map<string, { code: string; label: string; numCode: number }>()
    const cidadesSet = new Set<string>()
    const produtosSet = new Set<string>()

    // Extrai de filteredRupturas para opções contextuais
    for (const r of filteredRupturas) {
      if (r.cliente && r.cliente.trim()) clientesSet.add(r.cliente.trim())
      const rede = deriveNetworkName(r.nome_loja)
      if (rede && rede !== 'Rede não identificada') redesSet.add(rede)
      if (r.cidade && r.cidade.trim()) cidadesSet.add(r.cidade.trim())
      if (r.produto && r.produto.trim()) produtosSet.add(r.produto.trim())

      const storeCode = normalizeStoreCode(r.codigo_loja)
      const storeLabel = formatStoreIdentityTable({ codigoLoja: r.codigo_loja, loja: r.nome_loja })
      const key = storeCode || r.nome_loja
      if (!lojasMap.has(key)) {
        const numCode = storeCode ? parseInt(storeCode, 10) : 999999
        lojasMap.set(key, { code: key, label: storeLabel, numCode })
      }
    }

    // Ordenação numérica para lojas com zeros preservados
    const sortedLojas = Array.from(lojasMap.values()).sort((a, b) => {
      if (a.numCode !== b.numCode) return a.numCode - b.numCode
      return a.label.localeCompare(b.label, 'pt-BR')
    })

    return {
      clientes: Array.from(clientesSet).sort((a, b) => a.localeCompare(b, 'pt-BR')),
      redes: Array.from(redesSet).sort((a, b) => a.localeCompare(b, 'pt-BR')),
      lojas: sortedLojas,
      cidades: Array.from(cidadesSet).sort((a, b) => a.localeCompare(b, 'pt-BR')),
      produtos: Array.from(produtosSet).sort((a, b) => a.localeCompare(b, 'pt-BR')),
      motivos: ['Ruptura Total', 'Sem Estoque Mínimo', 'Estoque Virtual'],
    }
  }, [filteredRupturas])

  const handleKpiSelect = (kpiKey: 'lojasCriticas' | 'rupturaTotal') => {
    setSelectedKpi((prev) => (prev === kpiKey ? null : kpiKey))
    setCurrentPage(1)
  }

  const handleSort = (key: typeof sortKey) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      // Se for dias_em_ruptura default é desc, senão asc
      setSortOrder(key === 'dias_em_ruptura' ? 'desc' : 'asc')
    }
  }

  const handleClearFilters = useCallback(() => {
    setFilterState(initialFilterState)
    setSelectedKpi(null)
    setCurrentPage(1)
  }, [])

  const hasActiveFilters =
    Boolean(filterState.search.trim()) ||
    filterState.cliente !== 'Todos' ||
    filterState.rede !== 'Todos' ||
    filterState.loja !== 'Todos' ||
    filterState.cidade !== 'Todos' ||
    filterState.produto !== 'Todos' ||
    filterState.motivo !== 'Todos' ||
    Boolean(filterState.dataInicio) ||
    Boolean(filterState.dataFim) ||
    selectedKpi !== null

  // Chips ativos para remoção individual
  const activeChips = useMemo(() => {
    const chips: Array<{ id: string; label: string; onRemove: () => void }> = []

    if (filterState.search.trim()) {
      chips.push({
        id: 'search',
        label: `Busca: "${filterState.search.trim()}"`,
        onRemove: () => setFilterState((s) => ({ ...s, search: '' })),
      })
    }

    if (filterState.cliente !== 'Todos') {
      chips.push({
        id: 'cliente',
        label: `Indústria / Marca: ${filterState.cliente}`,
        onRemove: () => setFilterState((s) => ({ ...s, cliente: 'Todos' })),
      })
    }

    if (filterState.rede !== 'Todos') {
      chips.push({
        id: 'rede',
        label: `Rede: ${filterState.rede}`,
        onRemove: () => setFilterState((s) => ({ ...s, rede: 'Todos' })),
      })
    }

    if (filterState.loja !== 'Todos') {
      const matchLoja = filterOptions.lojas.find((l) => l.code === filterState.loja)
      chips.push({
        id: 'loja',
        label: `Loja: ${matchLoja ? matchLoja.label : filterState.loja}`,
        onRemove: () => setFilterState((s) => ({ ...s, loja: 'Todos' })),
      })
    }

    if (filterState.cidade !== 'Todos') {
      chips.push({
        id: 'cidade',
        label: `Cidade: ${filterState.cidade}`,
        onRemove: () => setFilterState((s) => ({ ...s, cidade: 'Todos' })),
      })
    }

    if (filterState.produto !== 'Todos') {
      chips.push({
        id: 'produto',
        label: `Produto: ${filterState.produto}`,
        onRemove: () => setFilterState((s) => ({ ...s, produto: 'Todos' })),
      })
    }

    if (filterState.motivo !== 'Todos') {
      chips.push({
        id: 'motivo',
        label: `Motivo: ${filterState.motivo}`,
        onRemove: () => setFilterState((s) => ({ ...s, motivo: 'Todos' })),
      })
    }

    if (filterState.dataInicio || filterState.dataFim) {
      chips.push({
        id: 'periodo',
        label: `Período: ${filterState.dataInicio ? formatDisplayDate(filterState.dataInicio) : 'Início'} até ${
          filterState.dataFim ? formatDisplayDate(filterState.dataFim) : 'Fim'
        }`,
        onRemove: () => setFilterState((s) => ({ ...s, dataInicio: '', dataFim: '' })),
      })
    }

    if (selectedKpi === 'lojasCriticas') {
      chips.push({
        id: 'kpi-lojas',
        label: 'Filtro de KPI: Lojas críticas',
        onRemove: () => setSelectedKpi(null),
      })
    } else if (selectedKpi === 'rupturaTotal') {
      chips.push({
        id: 'kpi-motivo',
        label: 'Filtro de KPI: Ruptura Total',
        onRemove: () => setSelectedKpi(null),
      })
    }

    return chips
  }, [filterState, filterOptions.lojas, selectedKpi])

  // Exportação XLSX contextual única
  const handleExportXLSX = useCallback(() => {
    if (sortedItems.length === 0) return

    try {
      const { count, fileName } = exportRupturasTableViewXLSX(
        sortedItems,
        filterState.cliente !== 'Todos' ? filterState.cliente : null,
        viewMode,
      )

      toast({
        title: 'Exportação concluída',
        description: `Exportação concluída: ${count} rupturas exportadas em ${fileName}.`,
      })
    } catch (err) {
      toast({
        title: 'Erro ao exportar',
        description: err instanceof Error ? err.message : 'Falha na exportação de rupturas.',
        variant: 'destructive',
      })
    }
  }, [sortedItems, filterState.cliente, viewMode, toast])

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 shrink-0">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                Gestão de Rupturas
              </h1>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                Base Atual
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Monitoramento prioritário de desabastecimento em gôndola e confronto de abastecimento.
            </p>
          </div>
        </div>

        {/* CTA Único: Exportar visão atual (.xlsx) */}
        <Button
          onClick={handleExportXLSX}
          disabled={isLoading || sortedItems.length === 0}
          className="h-10 px-4 gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs self-start sm:self-center font-semibold text-xs rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Download className="w-4 h-4" />
          <span>Exportar visão atual (.xlsx)</span>
        </Button>
      </div>

      {/* 4 KPIs Obrigatórios */}
      <RupturasKpisCards
        kpis={kpisData}
        isLoading={isLoading}
        selectedKpi={selectedKpi}
        onSelectKpi={handleKpiSelect}
      />

      {/* Banner Informativo de Auditoria (se houver conflitos) */}
      {conflitos.length > 0 && (
        <div className="flex items-center justify-between p-4 bg-amber-50/80 border border-amber-200/80 rounded-xl text-xs text-amber-900 animate-fade-in">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>{conflitos.length} conflito(s) detectado(s)</strong> — ocorrências com mesma
              data ou chave ambígua disponíveis em Auditoria para revisão manual.
            </span>
          </div>
          <Link
            to="/auditoria"
            className="inline-flex items-center gap-1 font-semibold text-amber-800 hover:text-amber-950 underline shrink-0 ml-3"
          >
            <span>Ver Auditoria</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}

      {/* Alternância Ativas vs Histórico */}
      <div className="flex items-center justify-between gap-4">
        <div className="inline-flex p-1 bg-slate-100 rounded-xl border border-slate-200">
          <button
            type="button"
            onClick={() => {
              setViewMode('ativas')
              setCurrentPage(1)
            }}
            className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              viewMode === 'ativas'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Ativas ({isLoading ? '...' : filteredRupturas.length})
          </button>
          <button
            type="button"
            onClick={() => {
              setViewMode('historico')
              setCurrentPage(1)
            }}
            className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              viewMode === 'historico'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Histórico ({isLoading ? '...' : historicoRupturas.length})
          </button>
        </div>

        {viewMode === 'historico' && (
          <span className="text-xs text-slate-500 italic">
            Exibindo rupturas encerradas pelo confronto com validades posteriores
          </span>
        )}
      </div>

      {/* Barra de Filtros Compacta SEMPRE Visível */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-xs space-y-3.5">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 items-end">
          {/* Busca */}
          <div className="flex flex-col gap-1 sm:col-span-2 lg:col-span-2">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Busca
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <Input
                type="text"
                value={filterState.search}
                onChange={(e) => {
                  setFilterState((s) => ({ ...s, search: e.target.value }))
                  setCurrentPage(1)
                }}
                placeholder="Buscar por loja, produto ou marca..."
                className="pl-9 h-9 text-xs sm:text-sm rounded-lg border-slate-300 bg-slate-50/50 focus:bg-white"
              />
            </div>
          </div>

          {/* Indústria / Marca (cliente) */}
          <div className="flex flex-col gap-1 min-w-[140px] flex-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Indústria / Marca
            </label>
            <select
              aria-label="Indústria / Marca"
              value={filterState.cliente}
              onChange={(e) => {
                setFilterState((s) => ({ ...s, cliente: e.target.value }))
                setCurrentPage(1)
              }}
              className="w-full h-9 px-2.5 py-1 text-xs sm:text-sm bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer truncate"
            >
              <option value="Todos">Todas as indústrias</option>
              {filterOptions.clientes.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          {/* Rede */}
          <div className="flex flex-col gap-1 min-w-[130px] flex-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Rede
            </label>
            <select
              aria-label="Rede"
              value={filterState.rede}
              onChange={(e) => {
                setFilterState((s) => ({ ...s, rede: e.target.value }))
                setCurrentPage(1)
              }}
              className="w-full h-9 px-2.5 py-1 text-xs sm:text-sm bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer truncate"
            >
              <option value="Todos">Todas as redes</option>
              {filterOptions.redes.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          {/* Loja */}
          <div className="flex flex-col gap-1 min-w-[150px] flex-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Loja
            </label>
            <select
              aria-label="Loja"
              value={filterState.loja}
              onChange={(e) => {
                setFilterState((s) => ({ ...s, loja: e.target.value }))
                setCurrentPage(1)
              }}
              className="w-full h-9 px-2.5 py-1 text-xs sm:text-sm bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer truncate"
            >
              <option value="Todos">Todas as lojas</option>
              {filterOptions.lojas.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>

          {/* Cidade */}
          <div className="flex flex-col gap-1 min-w-[120px] flex-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Cidade
            </label>
            <select
              aria-label="Cidade"
              value={filterState.cidade}
              onChange={(e) => {
                setFilterState((s) => ({ ...s, cidade: e.target.value }))
                setCurrentPage(1)
              }}
              className="w-full h-9 px-2.5 py-1 text-xs sm:text-sm bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer truncate"
            >
              <option value="Todos">Todas as cidades</option>
              {filterOptions.cidades.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Produto */}
          <div className="flex flex-col gap-1 min-w-[150px] flex-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Produto
            </label>
            <select
              aria-label="Produto"
              value={filterState.produto}
              onChange={(e) => {
                setFilterState((s) => ({ ...s, produto: e.target.value }))
                setCurrentPage(1)
              }}
              className="w-full h-9 px-2.5 py-1 text-xs sm:text-sm bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer truncate"
            >
              <option value="Todos">Todos os produtos</option>
              {filterOptions.produtos.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Linha secundária: Motivo + Período de Visita + Limpar Filtros */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-end justify-between gap-3 pt-2 border-t border-slate-100">
          <div className="flex flex-wrap items-end gap-3">
            {/* Motivo */}
            <div className="flex flex-col gap-1 w-full sm:w-56">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Motivo
              </label>
              <select
                aria-label="Motivo"
                value={filterState.motivo}
                onChange={(e) => {
                  setFilterState((s) => ({ ...s, motivo: e.target.value }))
                  setCurrentPage(1)
                }}
                className="w-full h-9 px-2.5 py-1 text-xs sm:text-sm bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer"
              >
                <option value="Todos">Todos os motivos</option>
                {filterOptions.motivos.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            {/* Período da Data de Visita */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Período da Visita
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  aria-label="Data início"
                  value={filterState.dataInicio}
                  onChange={(e) => {
                    setFilterState((s) => ({ ...s, dataInicio: e.target.value }))
                    setCurrentPage(1)
                  }}
                  className="h-9 px-2 text-xs rounded-lg border border-slate-300 bg-white"
                />
                <span className="text-xs text-slate-400">até</span>
                <input
                  type="date"
                  aria-label="Data fim"
                  value={filterState.dataFim}
                  onChange={(e) => {
                    setFilterState((s) => ({ ...s, dataFim: e.target.value }))
                    setCurrentPage(1)
                  }}
                  className="h-9 px-2 text-xs rounded-lg border border-slate-300 bg-white"
                />
              </div>
            </div>
          </div>

          {hasActiveFilters && (
            <Button
              type="button"
              onClick={handleClearFilters}
              variant="outline"
              size="sm"
              className="h-9 px-3.5 gap-1.5 border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg font-medium text-xs self-start sm:self-end"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
              <span>Limpar filtros</span>
            </Button>
          )}
        </div>

        {/* Chips de filtros ativos */}
        {activeChips.length > 0 && (
          <div className="pt-2 flex flex-wrap items-center gap-1.5 border-t border-slate-100 animate-fade-in">
            <span className="text-[11px] font-semibold text-slate-400 mr-1">Filtros ativos:</span>
            {activeChips.map((chip) => (
              <span
                key={chip.id}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200"
              >
                <span>{chip.label}</span>
                <button
                  type="button"
                  onClick={chip.onRemove}
                  className="w-3.5 h-3.5 rounded-full inline-flex items-center justify-center hover:bg-amber-200/70 text-amber-800 transition-colors"
                  title="Remover filtro"
                  aria-label={`Remover filtro ${chip.label}`}
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Erro */}
      {error && (
        <div className="p-6 bg-red-50 border border-red-200 rounded-2xl text-center space-y-3">
          <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 mx-auto flex items-center justify-center">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <p className="text-sm font-semibold text-red-900">
            Falha ao carregar ocorrências de rupturas
          </p>
          <p className="text-xs text-red-700 max-w-sm mx-auto">
            {error.message || 'Ocorreu um erro na consulta dos dados.'}
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5 text-xs">
            <RotateCcw className="w-3.5 h-3.5" />
            Tentar novamente
          </Button>
        </div>
      )}

      {/* TABELA ENXUTA — 7 COLUNAS */}
      {!error && (
        <>
          {isLoading ? (
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-500">
                <span className="font-medium text-slate-500 animate-pulse">
                  Carregando dados...
                </span>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50/70 border-b border-slate-200 text-slate-600 font-semibold select-none">
                        <th className="py-3 px-4 min-w-[200px]">Loja</th>
                        <th className="py-3 px-4 min-w-[130px]">Marca</th>
                        <th className="py-3 px-4 min-w-[110px]">Data da Visita</th>
                        <th className="py-3 px-4 min-w-[200px]">Produto</th>
                        <th className="py-3 px-4 min-w-[140px]">Motivo</th>
                        <th className="py-3 px-4 text-center min-w-[120px]">Dias em Ruptura</th>
                        <th className="py-3 px-4 min-w-[130px]">Situação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <tr key={i} className="h-12">
                          <td className="py-3 px-4">
                            <div className="h-4 bg-slate-100 rounded w-44 animate-pulse" />
                          </td>
                          <td className="py-3 px-4">
                            <div className="h-4 bg-slate-100 rounded w-24 animate-pulse" />
                          </td>
                          <td className="py-3 px-4">
                            <div className="h-4 bg-slate-100 rounded w-20 animate-pulse" />
                          </td>
                          <td className="py-3 px-4">
                            <div className="h-4 bg-slate-100 rounded w-36 animate-pulse" />
                          </td>
                          <td className="py-3 px-4">
                            <div className="h-4 bg-slate-100 rounded w-28 animate-pulse" />
                          </td>
                          <td className="py-3 px-4 text-center">
                            <div className="h-4 bg-slate-100 rounded w-10 mx-auto animate-pulse" />
                          </td>
                          <td className="py-3 px-4">
                            <div className="h-4 bg-slate-100 rounded w-16 animate-pulse" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : sortedItems.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
              <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
                <Info className="w-6 h-6" />
              </div>
              <p className="text-sm font-semibold text-slate-800">
                {hasActiveFilters
                  ? 'Nenhuma ruptura corresponde aos filtros selecionados.'
                  : 'Nenhuma ruptura registrada na Base Atual.'}
              </p>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                {hasActiveFilters
                  ? 'Tente remover alguns filtros para expandir os resultados.'
                  : 'Importe novos dados operacionais para acompanhar rupturas.'}
              </p>
              {hasActiveFilters && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClearFilters}
                  className="text-xs mt-2"
                >
                  Limpar filtros
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {/* Barra de Contagem e Paginação */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-500">
                <span className="font-medium text-slate-700">
                  {sortedItems.length} ocorrência(s) encontrada(s)
                  {selectedKpi === 'lojasCriticas' && ' • Filtro: Lojas críticas'}
                  {selectedKpi === 'rupturaTotal' && ' • Filtro: Ruptura Total'}
                </span>

                <div className="flex items-center gap-4">
                  {/* Seletor de Page Size */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-500">Itens por página:</span>
                    <select
                      aria-label="Itens por página"
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value) as PageSizeOption)
                        setCurrentPage(1)
                      }}
                      className="h-8 px-2 py-0.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                    >
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                  </div>

                  <span>
                    Página {currentPage} de {totalPages}
                  </span>
                </div>
              </div>

              {/* Tabela de 7 colunas */}
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50/70 border-b border-slate-200 text-slate-600 font-semibold select-none">
                        <th
                          className="py-3 px-4 min-w-[200px] cursor-pointer hover:bg-slate-100/60"
                          onClick={() => handleSort('nome_loja')}
                        >
                          Loja
                        </th>
                        <th className="py-3 px-4 min-w-[130px]">Marca</th>
                        <th
                          className="py-3 px-4 min-w-[110px] tabular-nums cursor-pointer hover:bg-slate-100/60"
                          onClick={() => handleSort('data_visita')}
                        >
                          Data da Visita
                        </th>
                        <th
                          className="py-3 px-4 min-w-[200px] max-w-[280px] cursor-pointer hover:bg-slate-100/60"
                          onClick={() => handleSort('produto')}
                        >
                          Produto
                        </th>
                        <th className="py-3 px-4 min-w-[140px]">Motivo</th>
                        <th
                          className="py-3 px-4 text-center tabular-nums cursor-pointer hover:bg-slate-100/60"
                          onClick={() => handleSort('dias_em_ruptura')}
                        >
                          Dias em Ruptura{' '}
                          {sortKey === 'dias_em_ruptura' && (sortOrder === 'desc' ? '↓' : '↑')}
                        </th>
                        <th className="py-3 px-4 min-w-[130px]">Situação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {paginatedItems.map((item) => {
                        const storeIdent = formatStoreIdentityTable({
                          codigoLoja: item.codigo_loja,
                          loja: item.nome_loja,
                        })
                        const storeKey = buildStoreCompositeKey({
                          codigoLoja: item.codigo_loja,
                          nomeLoja: item.nome_loja,
                          rede: deriveNetworkName(item.nome_loja),
                          cidade: item.cidade,
                          uf: item.estado,
                        })
                        const codProd = (item as unknown as { cod_produto?: string }).cod_produto

                        // Badge de Motivo
                        const motivoBadgeClass =
                          item.motivo === 'Ruptura Total'
                            ? 'bg-rose-50 text-rose-700 border-rose-200'
                            : item.motivo === 'Sem Estoque Mínimo'
                              ? 'bg-amber-50 text-amber-800 border-amber-200'
                              : 'bg-slate-100 text-slate-700 border-slate-200'

                        // Dias em Ruptura
                        const dias = item.dias_em_ruptura ?? 0
                        const diasClass =
                          dias > 5
                            ? 'text-rose-600 font-extrabold'
                            : dias > 2
                              ? 'text-amber-600 font-bold'
                              : 'text-slate-700 font-semibold'

                        // Situação
                        const isHistorico =
                          viewMode === 'historico' ||
                          Boolean((item as RupturaEncerrada).statusHistorico)
                        const statusHistorico = (item as RupturaEncerrada).statusHistorico

                        return (
                          <tr
                            key={item.id || item.operational_key}
                            className="hover:bg-slate-50/60 transition-colors"
                          >
                            {/* 1. Loja */}
                            <td className="py-3 px-4 min-w-[200px]">
                              <div
                                className="min-w-0 cursor-pointer group"
                                onClick={() => {
                                  if (storeKey) {
                                    navigate(`/lojas/${encodeURIComponent(storeKey)}`)
                                  }
                                }}
                              >
                                <p
                                  className="font-medium text-slate-900 group-hover:text-indigo-600 transition-colors truncate"
                                  title={storeIdent}
                                >
                                  {storeIdent}
                                </p>
                              </div>
                            </td>

                            {/* 2. Marca */}
                            <td className="py-3 px-4 text-slate-700 font-medium whitespace-nowrap">
                              {item.cliente || '—'}
                            </td>

                            {/* 3. Data da Visita */}
                            <td className="py-3 px-4 tabular-nums text-slate-700 whitespace-nowrap">
                              {formatDisplayDate(item.data_visita, '—')}
                            </td>

                            {/* 4. Produto */}
                            <td className="py-3 px-4 max-w-[200px] truncate" title={item.produto}>
                              <div className="min-w-0">
                                <p className="font-medium text-slate-900 truncate">
                                  {item.produto || '—'}
                                </p>
                                {codProd && (
                                  <span className="text-[10px] text-slate-400 block font-mono">
                                    {codProd}
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* 5. Motivo */}
                            <td className="py-3 px-4 whitespace-nowrap">
                              <Badge
                                variant="outline"
                                className={`text-[10px] font-medium ${motivoBadgeClass}`}
                              >
                                {item.motivo || '—'}
                              </Badge>
                            </td>

                            {/* 6. Dias em Ruptura */}
                            <td className="py-3 px-4 text-center tabular-nums">
                              <span className={diasClass}>{dias}</span>
                            </td>

                            {/* 7. Situação */}
                            <td className="py-3 px-4 whitespace-nowrap">
                              {!isHistorico ? (
                                <Badge
                                  variant="outline"
                                  className="bg-rose-50 text-rose-700 border-rose-200 font-semibold text-[11px]"
                                >
                                  Ativa
                                </Badge>
                              ) : statusHistorico === 'Encerrada por validade posterior' ? (
                                <Badge
                                  variant="outline"
                                  className="bg-emerald-50 text-emerald-700 border-emerald-200 font-medium text-[11px]"
                                >
                                  Encerrada por validade posterior
                                </Badge>
                              ) : (
                                <Badge
                                  variant="outline"
                                  className="bg-blue-50 text-blue-700 border-blue-200 font-medium text-[11px]"
                                >
                                  {statusHistorico || 'Encerrada'}
                                </Badge>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Paginação */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 bg-white rounded-xl border border-slate-200/80 shadow-2xs text-xs text-slate-600">
                <span>
                  Mostrando{' '}
                  <strong className="text-slate-900">
                    {sortedItems.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}
                  </strong>
                  –
                  <strong className="text-slate-900">
                    {Math.min(currentPage * pageSize, sortedItems.length)}
                  </strong>{' '}
                  de <strong className="text-slate-900">{sortedItems.length}</strong> ocorrência(s)
                </span>

                <div className="flex items-center gap-2">
                  <span className="text-slate-500 mr-1">
                    Página <strong className="text-slate-900">{currentPage}</strong> de{' '}
                    <strong className="text-slate-900">{totalPages}</strong>
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage <= 1 || isLoading}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="h-8 px-2.5 text-xs gap-1 border-slate-200 rounded-lg hover:bg-slate-50"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>Anterior</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage >= totalPages || isLoading}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="h-8 px-2.5 text-xs gap-1 border-slate-200 rounded-lg hover:bg-slate-50"
                  >
                    <span>Próxima</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
