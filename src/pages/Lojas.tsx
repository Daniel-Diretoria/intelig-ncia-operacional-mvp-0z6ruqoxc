import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Store,
  AlertTriangle,
  CalendarClock,
  Package,
  Search,
  Download,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  X,
  Info,
} from 'lucide-react'
import { useLojas, type StoreSummary } from '@/services/useLojas'
import { formatStoreIdentityTable, formatCityUf } from '@/lib/format/storeIdentity'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useToast } from '@/hooks/use-toast'
import { exportLojasTableViewXLSX } from '@/lib/export/lojasTableViewExport'

type PageSizeOption = 25 | 50 | 100

interface FilterState {
  search: string
  marca: string
  rede: string
  cidade: string
  uf: string
  situacao: 'Todas' | 'Críticas' | 'Casos complexos' | 'Com rupturas'
}

const initialFilterState: FilterState = {
  search: '',
  marca: 'Todas as marcas',
  rede: 'Todas as redes',
  cidade: 'Todas as cidades',
  uf: 'Todos os estados',
  situacao: 'Todas',
}

export const LojasPage: React.FC = () => {
  const navigate = useNavigate()
  const { toast } = useToast()

  const [filterState, setFilterState] = useState<FilterState>(initialFilterState)
  // KPI selecionado via clique rápido: 'criticas' | 'complexos' | 'rupturas' | null
  const [selectedKpi, setSelectedKpi] = useState<'criticas' | 'complexos' | 'rupturas' | null>(null)

  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState<PageSizeOption>(25)

  // Sincroniza KPI selecionado com o filtro de situação
  const effectiveSituacao = useMemo(() => {
    if (selectedKpi === 'criticas') return 'Críticas'
    if (selectedKpi === 'complexos') return 'Casos complexos'
    if (selectedKpi === 'rupturas') return 'Com rupturas'
    return filterState.situacao
  }, [selectedKpi, filterState.situacao])

  const { stores, filteredStores, isLoading, error, refetch } = useLojas({
    search: filterState.search.trim() || undefined,
    marca: filterState.marca !== 'Todas as marcas' ? filterState.marca : undefined,
    networkName: filterState.rede !== 'Todas as redes' ? filterState.rede : undefined,
    cityUf: filterState.cidade !== 'Todas as cidades' ? filterState.cidade : undefined,
    uf: filterState.uf !== 'Todos os estados' ? filterState.uf : undefined,
    situacao: effectiveSituacao !== 'Todas' ? effectiveSituacao : undefined,
  })

  // 4 KPIs calculados estritamente sobre filteredStores
  const kpis = useMemo(() => {
    const total = filteredStores.length
    const criticas = filteredStores.filter((s) => s.situacao === 'Crítica').length
    // "Casos complexos" = lojas com ao menos 1 validade 0-15d
    const complexos = filteredStores.filter((s) => s.validadesCriticasCount > 0).length
    // "Lojas com rupturas" = lojas com ao menos 1 ruptura ativa
    const comRupturas = filteredStores.filter((s) => s.rupturasAtivasCount > 0).length

    return {
      total,
      criticas,
      complexos,
      comRupturas,
    }
  }, [filteredStores])

  // Ordenação padrão:
  // 1. Validades até 15 dias (desc)
  // 2. Rupturas ativas (desc)
  // 3. Loja nome/identidade (asc)
  const sortedStores = useMemo(() => {
    const list = [...filteredStores]
    list.sort((a, b) => {
      // 1. Validades até 15 dias desc
      if (b.validadesCriticasCount !== a.validadesCriticasCount) {
        return b.validadesCriticasCount - a.validadesCriticasCount
      }
      // 2. Rupturas ativas desc
      if (b.rupturasAtivasCount !== a.rupturasAtivasCount) {
        return b.rupturasAtivasCount - a.rupturasAtivasCount
      }
      // 3. Loja asc
      const nameA = formatStoreIdentityTable({ codigoLoja: a.storeCode, nomeLoja: a.storeName })
      const nameB = formatStoreIdentityTable({ codigoLoja: b.storeCode, nomeLoja: b.storeName })
      return nameA.localeCompare(nameB, 'pt-BR', { numeric: true, sensitivity: 'base' })
    })
    return list
  }, [filteredStores])

  // Opções para os selects derivadas de stores
  const filterOptions = useMemo(() => {
    const marcasSet = new Set<string>()
    const redesSet = new Set<string>()
    const cidadesSet = new Set<string>()
    const ufsSet = new Set<string>()

    for (const s of stores) {
      s.marcasList.forEach((m) => {
        if (m && m.trim()) marcasSet.add(m.trim())
      })
      if (s.networkName && s.networkName.trim() && s.networkName !== 'Rede não identificada') {
        redesSet.add(s.networkName.trim())
      }
      const { city, uf } = parseCityUf(s.city, s.uf)
      const formatted = formatCityUf(city, uf)
      if (formatted && formatted !== '—') cidadesSet.add(formatted)
      if (uf) ufsSet.add(uf.trim().toUpperCase())
    }

    return {
      marcas: Array.from(marcasSet).sort((a, b) => a.localeCompare(b, 'pt-BR')),
      redes: Array.from(redesSet).sort((a, b) => a.localeCompare(b, 'pt-BR')),
      cidades: Array.from(cidadesSet).sort((a, b) => a.localeCompare(b, 'pt-BR')),
      ufs: Array.from(ufsSet).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    }
  }, [stores])

  // Paginação
  const totalItems = sortedStores.length
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const safeCurrentPage = Math.min(currentPage, totalPages)
  const startIndex = (safeCurrentPage - 1) * pageSize
  const endIndex = Math.min(startIndex + pageSize, totalItems)
  const paginatedStores = sortedStores.slice(startIndex, endIndex)

  const handleClearFilters = useCallback(() => {
    setFilterState(initialFilterState)
    setSelectedKpi(null)
    setCurrentPage(1)
  }, [])

  const handleKpiToggle = (kpiKey: 'criticas' | 'complexos' | 'rupturas') => {
    if (selectedKpi === kpiKey) {
      setSelectedKpi(null)
      setFilterState((s) => ({ ...s, situacao: 'Todas' }))
    } else {
      setSelectedKpi(kpiKey)
      if (kpiKey === 'criticas') setFilterState((s) => ({ ...s, situacao: 'Críticas' }))
      if (kpiKey === 'complexos') setFilterState((s) => ({ ...s, situacao: 'Casos complexos' }))
      if (kpiKey === 'rupturas') setFilterState((s) => ({ ...s, situacao: 'Com rupturas' }))
    }
    setCurrentPage(1)
  }

  const hasActiveFilters =
    Boolean(filterState.search.trim()) ||
    filterState.marca !== 'Todas as marcas' ||
    filterState.rede !== 'Todas as redes' ||
    filterState.cidade !== 'Todas as cidades' ||
    filterState.uf !== 'Todos os estados' ||
    effectiveSituacao !== 'Todas'

  // Chips ativos para remoção individual
  const activeChips = useMemo(() => {
    const chips: Array<{ id: string; label: string; onRemove: () => void }> = []

    if (filterState.search.trim()) {
      chips.push({
        id: 'search',
        label: `Busca: "${filterState.search.trim()}"`,
        onRemove: () => {
          setFilterState((s) => ({ ...s, search: '' }))
          setCurrentPage(1)
        },
      })
    }

    if (filterState.marca !== 'Todas as marcas') {
      chips.push({
        id: 'marca',
        label: `Marca: ${filterState.marca}`,
        onRemove: () => {
          setFilterState((s) => ({ ...s, marca: 'Todas as marcas' }))
          setCurrentPage(1)
        },
      })
    }

    if (filterState.rede !== 'Todas as redes') {
      chips.push({
        id: 'rede',
        label: `Rede: ${filterState.rede}`,
        onRemove: () => {
          setFilterState((s) => ({ ...s, rede: 'Todas as redes' }))
          setCurrentPage(1)
        },
      })
    }

    if (filterState.cidade !== 'Todas as cidades') {
      chips.push({
        id: 'cidade',
        label: `Cidade: ${filterState.cidade}`,
        onRemove: () => {
          setFilterState((s) => ({ ...s, cidade: 'Todas as cidades' }))
          setCurrentPage(1)
        },
      })
    }

    if (filterState.uf !== 'Todos os estados') {
      chips.push({
        id: 'uf',
        label: `UF: ${filterState.uf}`,
        onRemove: () => {
          setFilterState((s) => ({ ...s, uf: 'Todos os estados' }))
          setCurrentPage(1)
        },
      })
    }

    if (effectiveSituacao !== 'Todas') {
      chips.push({
        id: 'situacao',
        label: `Situação: ${effectiveSituacao}`,
        onRemove: () => {
          setSelectedKpi(null)
          setFilterState((s) => ({ ...s, situacao: 'Todas' }))
          setCurrentPage(1)
        },
      })
    }

    return chips
  }, [filterState, effectiveSituacao])

  // Exportação XLSX
  const handleExportXLSX = useCallback(() => {
    if (sortedStores.length === 0) return

    try {
      const { count, fileName } = exportLojasTableViewXLSX(
        sortedStores,
        filterState.marca !== 'Todas as marcas' ? filterState.marca : null,
      )

      toast({
        title: 'Exportação concluída',
        description: `${count} loja(s) exportada(s) com sucesso em ${fileName}.`,
      })
    } catch (err) {
      toast({
        title: 'Erro ao exportar',
        description: err instanceof Error ? err.message : 'Falha na exportação de lojas.',
        variant: 'destructive',
      })
    }
  }, [sortedStores, filterState.marca, toast])

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-6 animate-fade-in pb-12">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
              <Store className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">Gestão de Lojas</h1>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
                  Base Atual
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Monitoramento operacional de validades e rupturas por ponto de venda.
              </p>
            </div>
          </div>

          {/* CTA Único de Exportação */}
          <Button
            onClick={handleExportXLSX}
            disabled={isLoading || sortedStores.length === 0}
            className="h-10 px-4 gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs self-start sm:self-center font-semibold text-xs rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            <span>Exportar visão atual (.xlsx)</span>
          </Button>
        </div>

        {/* 4 KPIs Obrigatórios */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs animate-pulse"
              >
                <div className="h-4 bg-slate-100 rounded w-24 mb-3" />
                <div className="h-8 bg-slate-200 rounded w-16 mb-2" />
                <div className="h-3 bg-slate-100 rounded w-32" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* KPI 1: Lojas monitoradas (informativo) */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Lojas monitoradas
                </span>
                <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center">
                  <Store className="w-4 h-4" />
                </div>
              </div>
              <p className="text-2xl font-bold text-slate-900 mt-2">{kpis.total}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Pontos de venda filtrados</p>
            </div>

            {/* KPI 2: Lojas críticas (clicável) */}
            <div
              onClick={() => handleKpiToggle('criticas')}
              className={`bg-white p-5 rounded-2xl border shadow-xs cursor-pointer transition-all hover:shadow-sm ${
                selectedKpi === 'criticas'
                  ? 'border-indigo-600 ring-2 ring-indigo-500/20 bg-indigo-50/20'
                  : 'border-slate-200/80 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Lojas críticas
                </span>
                <div className="w-8 h-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4" />
                </div>
              </div>
              <p className="text-2xl font-bold text-red-600 mt-2">{kpis.criticas}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Validade ≤ 15d ou ruptura ativa</p>
            </div>

            {/* KPI 3: Lojas com casos complexos (clicável) */}
            <div
              onClick={() => handleKpiToggle('complexos')}
              className={`bg-white p-5 rounded-2xl border shadow-xs cursor-pointer transition-all hover:shadow-sm ${
                selectedKpi === 'complexos'
                  ? 'border-indigo-600 ring-2 ring-indigo-500/20 bg-indigo-50/20'
                  : 'border-slate-200/80 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Lojas com casos complexos
                </span>
                <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                  <CalendarClock className="w-4 h-4" />
                </div>
              </div>
              <p className="text-2xl font-bold text-amber-700 mt-2">{kpis.complexos}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Ao menos 1 validade 0-15d</p>
            </div>

            {/* KPI 4: Lojas com rupturas (clicável) */}
            <div
              onClick={() => handleKpiToggle('rupturas')}
              className={`bg-white p-5 rounded-2xl border shadow-xs cursor-pointer transition-all hover:shadow-sm ${
                selectedKpi === 'rupturas'
                  ? 'border-indigo-600 ring-2 ring-indigo-500/20 bg-indigo-50/20'
                  : 'border-slate-200/80 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Lojas com rupturas
                </span>
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Package className="w-4 h-4" />
                </div>
              </div>
              <p className="text-2xl font-bold text-blue-700 mt-2">{kpis.comRupturas}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Ao menos 1 ruptura ativa</p>
            </div>
          </div>
        )}

        {/* Barra de Filtros Compacta SEMPRE Visível */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-xs space-y-3.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 items-end">
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
                  placeholder="Buscar código, nome ou cidade..."
                  className="pl-9 h-9 text-xs sm:text-sm rounded-lg border-slate-300 bg-slate-50/50 focus:bg-white"
                />
              </div>
            </div>

            {/* Marca (cliente) */}
            <div className="flex flex-col gap-1 flex-1 min-w-[130px]">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Marca
              </label>
              <select
                aria-label="Marca"
                value={filterState.marca}
                onChange={(e) => {
                  setFilterState((s) => ({ ...s, marca: e.target.value }))
                  setCurrentPage(1)
                }}
                className="w-full h-9 px-2.5 py-1 text-xs sm:text-sm bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer truncate"
              >
                <option value="Todas as marcas">Todas as marcas</option>
                {filterOptions.marcas.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            {/* Rede */}
            <div className="flex flex-col gap-1 flex-1 min-w-[130px]">
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
                <option value="Todas as redes">Todas as redes</option>
                {filterOptions.redes.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            {/* Cidade */}
            <div className="flex flex-col gap-1 flex-1 min-w-[120px]">
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
                <option value="Todas as cidades">Todas as cidades</option>
                {filterOptions.cidades.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {/* UF */}
            <div className="flex flex-col gap-1 flex-1 min-w-[90px]">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                UF
              </label>
              <select
                aria-label="UF"
                value={filterState.uf}
                onChange={(e) => {
                  setFilterState((s) => ({ ...s, uf: e.target.value }))
                  setCurrentPage(1)
                }}
                className="w-full h-9 px-2.5 py-1 text-xs sm:text-sm bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer truncate"
              >
                <option value="Todos os estados">Todos os estados</option>
                {filterOptions.ufs.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Linha secundária: Situação + Limpar Filtros */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 border-t border-slate-100">
            <div className="flex items-center gap-3">
              <div className="flex flex-col gap-1 w-full sm:w-56">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  Situação
                </label>
                <select
                  aria-label="Situação"
                  value={effectiveSituacao}
                  onChange={(e) => {
                    const val = e.target.value as FilterState['situacao']
                    setFilterState((s) => ({ ...s, situacao: val }))
                    if (val === 'Críticas') setSelectedKpi('criticas')
                    else if (val === 'Casos complexos') setSelectedKpi('complexos')
                    else if (val === 'Com rupturas') setSelectedKpi('rupturas')
                    else setSelectedKpi(null)
                    setCurrentPage(1)
                  }}
                  className="w-full h-9 px-2.5 py-1 text-xs sm:text-sm bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer"
                >
                  <option value="Todas">Todas as situações</option>
                  <option value="Críticas">Críticas</option>
                  <option value="Casos complexos">Casos complexos</option>
                  <option value="Com rupturas">Com rupturas</option>
                </select>
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
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200"
                >
                  <span>{chip.label}</span>
                  <button
                    type="button"
                    onClick={chip.onRemove}
                    className="w-3.5 h-3.5 rounded-full inline-flex items-center justify-center hover:bg-indigo-200/70 text-indigo-800 transition-colors"
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
            <p className="text-sm font-semibold text-red-900">Falha ao carregar lojas</p>
            <p className="text-xs text-red-700 max-w-sm mx-auto">{error.message}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="gap-1.5 text-xs"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Tentar novamente
            </Button>
          </div>
        )}

        {/* Tabela de 7 Colunas Exatas */}
        {!error && (
          <>
            {sortedStores.length === 0 && !isLoading ? (
              <div className="p-12 text-center bg-white rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
                <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
                  <Info className="w-6 h-6" />
                </div>
                <p className="text-sm font-semibold text-slate-800">
                  {hasActiveFilters
                    ? 'Nenhuma loja corresponde aos filtros selecionados.'
                    : 'Nenhuma loja registrada na Base Atual.'}
                </p>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  {hasActiveFilters
                    ? 'Tente ajustar ou limpar os filtros de busca para visualizar os pontos de venda.'
                    : 'Importe novos dados operacionais para acompanhar lojas.'}
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
                    {totalItems} loja(s) encontrada(s)
                    {selectedKpi === 'criticas' && ' • Filtro: Lojas críticas'}
                    {selectedKpi === 'complexos' && ' • Filtro: Casos complexos'}
                    {selectedKpi === 'rupturas' && ' • Filtro: Com rupturas'}
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
                      Página {safeCurrentPage} de {totalPages}
                    </span>
                  </div>
                </div>

                {/* Tabela de 7 Colunas */}
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
                  {isLoading ? (
                    <div className="p-8 space-y-3">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="h-10 bg-slate-50 rounded-lg animate-pulse" />
                      ))}
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-50/70 border-b border-slate-200 text-slate-600 font-semibold select-none">
                            <th className="py-3 px-4 min-w-[220px]">Loja</th>
                            <th className="py-3 px-4 min-w-[140px]">Cidade / UF</th>
                            <th className="py-3 px-4 min-w-[130px]">Rede</th>
                            <th className="py-3 px-4 text-center min-w-[130px]">
                              Marcas atendidas
                            </th>
                            <th className="py-3 px-4 text-center min-w-[140px]">
                              Validades até 15 dias
                            </th>
                            <th className="py-3 px-4 text-center min-w-[120px]">Rupturas ativas</th>
                            <th className="py-3 px-4 text-center min-w-[100px]">Situação</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {paginatedStores.map((store) => {
                            const storeDisplay = formatStoreIdentityTable({
                              codigoLoja: store.storeCode,
                              nomeLoja: store.storeName,
                            })

                            const tooltipMarcas =
                              store.marcasList.length > 5
                                ? `${store.marcasList.slice(0, 5).join(', ')} (+${store.marcasList.length - 5})`
                                : store.marcasList.join(', ') || 'Nenhuma marca'

                            return (
                              <tr
                                key={store.storeId}
                                onClick={() =>
                                  navigate(`/lojas/${encodeURIComponent(store.storeId)}`)
                                }
                                className="hover:bg-slate-50/70 transition-colors cursor-pointer group"
                              >
                                {/* 1. Loja */}
                                <td className="py-3 px-4 min-w-[220px]">
                                  <div className="font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors">
                                    {storeDisplay}
                                  </div>
                                </td>

                                {/* 2. Cidade / UF */}
                                <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                                  {formatCityUf(store.city, store.uf)}
                                </td>

                                {/* 3. Rede */}
                                <td className="py-3 px-4 text-slate-700 font-medium whitespace-nowrap">
                                  {store.networkName}
                                </td>

                                {/* 4. Marcas atendidas */}
                                <td className="py-3 px-4 text-center whitespace-nowrap">
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="inline-flex">
                                        <Badge
                                          variant="outline"
                                          className="bg-slate-50 text-slate-700 border-slate-200 font-semibold cursor-help"
                                        >
                                          {store.marcasCount}
                                        </Badge>
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-xs text-xs">
                                      <p className="font-semibold mb-1">Marcas atendidas:</p>
                                      <p>{tooltipMarcas}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </td>

                                {/* 5. Validades até 15 dias */}
                                <td className="py-3 px-4 text-center whitespace-nowrap">
                                  <Badge
                                    variant="outline"
                                    className={
                                      store.validadesCriticasCount > 0
                                        ? 'bg-red-50 text-red-700 border-red-200 font-bold'
                                        : 'bg-slate-50 text-slate-500 border-slate-200 font-medium'
                                    }
                                  >
                                    {store.validadesCriticasCount}
                                  </Badge>
                                </td>

                                {/* 6. Rupturas ativas */}
                                <td className="py-3 px-4 text-center whitespace-nowrap">
                                  <Badge
                                    variant="outline"
                                    className={
                                      store.rupturasAtivasCount > 0
                                        ? 'bg-amber-50 text-amber-800 border-amber-200 font-bold'
                                        : 'bg-slate-50 text-slate-500 border-slate-200 font-medium'
                                    }
                                  >
                                    {store.rupturasAtivasCount}
                                  </Badge>
                                </td>

                                {/* 7. Situação */}
                                <td className="py-3 px-4 text-center whitespace-nowrap">
                                  {store.situacao === 'Crítica' ? (
                                    <Badge
                                      variant="outline"
                                      className="bg-red-50 text-red-700 border-red-200 font-semibold"
                                    >
                                      Crítica
                                    </Badge>
                                  ) : (
                                    <Badge
                                      variant="outline"
                                      className="bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold"
                                    >
                                      Normal
                                    </Badge>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Paginação */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 bg-white rounded-xl border border-slate-200/80 shadow-2xs text-xs text-slate-600">
                  <span>
                    Mostrando{' '}
                    <strong className="text-slate-900">
                      {totalItems === 0 ? 0 : startIndex + 1}
                    </strong>
                    –<strong className="text-slate-900">{endIndex}</strong> de{' '}
                    <strong className="text-slate-900">{totalItems}</strong> lojas
                  </span>

                  <div className="flex items-center gap-2">
                    <span className="text-slate-500 mr-1">
                      Página <strong className="text-slate-900">{safeCurrentPage}</strong> de{' '}
                      <strong className="text-slate-900">{totalPages}</strong>
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={safeCurrentPage <= 1 || isLoading}
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      className="h-8 px-2.5 text-xs gap-1 border-slate-200 rounded-lg hover:bg-slate-50"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      <span>Anterior</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={safeCurrentPage >= totalPages || isLoading}
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
    </TooltipProvider>
  )
}
