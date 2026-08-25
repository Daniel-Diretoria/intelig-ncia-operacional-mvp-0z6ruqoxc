import React, { useState, useMemo, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  AlertOctagon,
  AlertTriangle,
  Store,
  Package,
  RotateCcw,
  ExternalLink,
  ChevronRight,
  Sparkles,
  Info,
  X,
} from 'lucide-react'
import { useLojas, type StoreSummary } from '@/services/useLojas'
import { formatStoreIdentityTable, formatCityUf } from '@/lib/format/storeIdentity'
import { formatDisplayDate } from '@/lib/format/dateParser'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { ValidadeItem, Ruptura } from '@/types'

interface StrategicFilterState {
  marca: string
  rede: string
  loja: string
  cidadeUf: string
}

const initialFilterState: StrategicFilterState = {
  marca: 'Todas as marcas',
  rede: 'Todas as redes',
  loja: 'Todas as lojas',
  cidadeUf: 'Todas as cidades',
}

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate()
  const [filterState, setFilterState] = useState<StrategicFilterState>(initialFilterState)

  const {
    stores,
    validadesAtivas,
    rupturasAtivas,
    isLoading,
    error: errorLojas,
    refetch: refetchLojas,
  } = useLojas()

  // Opções para os filtros executivos
  const filterOptions = useMemo(() => {
    const marcasSet = new Set<string>()
    const redesSet = new Set<string>()
    const lojasSet = new Set<string>()
    const cidadesUfSet = new Set<string>()

    for (const s of stores) {
      s.marcasList.forEach((m) => {
        if (m && m.trim()) marcasSet.add(m.trim())
      })
      if (s.networkName && s.networkName.trim() && s.networkName !== 'Rede não identificada') {
        redesSet.add(s.networkName.trim())
      }
      const lojaLabel = formatStoreIdentityTable({
        codigoLoja: s.storeCode,
        nomeLoja: s.storeName,
      })
      if (lojaLabel) lojasSet.add(lojaLabel)

      const cUf = formatCityUf(s.city, s.uf)
      if (cUf && cUf !== '—') cidadesUfSet.add(cUf)
    }

    return {
      marcas: Array.from(marcasSet).sort((a, b) => a.localeCompare(b, 'pt-BR')),
      redes: Array.from(redesSet).sort((a, b) => a.localeCompare(b, 'pt-BR')),
      lojas: Array.from(lojasSet).sort((a, b) => a.localeCompare(b, 'pt-BR')),
      cidadesUf: Array.from(cidadesUfSet).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    }
  }, [stores])

  // Lojas Filtradas
  const filteredStores = useMemo(() => {
    return stores.filter((s) => {
      // Filtro Marca
      if (filterState.marca !== 'Todas as marcas') {
        const hasMarca = s.marcasList.some(
          (m) =>
            m.toLowerCase() === filterState.marca.toLowerCase() ||
            m.toLowerCase().includes(filterState.marca.toLowerCase()),
        )
        if (!hasMarca) return false
      }
      // Filtro Rede
      if (filterState.rede !== 'Todas as redes') {
        if (s.networkName.toLowerCase() !== filterState.rede.toLowerCase()) return false
      }
      // Filtro Loja
      if (filterState.loja !== 'Todas as lojas') {
        const label = formatStoreIdentityTable({
          codigoLoja: s.storeCode,
          nomeLoja: s.storeName,
        })
        if (label.toLowerCase() !== filterState.loja.toLowerCase()) return false
      }
      // Filtro Cidade/UF
      if (filterState.cidadeUf !== 'Todas as cidades') {
        const cUf = formatCityUf(s.city, s.uf)
        if (cUf.toLowerCase() !== filterState.cidadeUf.toLowerCase()) return false
      }
      return true
    })
  }, [stores, filterState])

  // Validades Ativas Filtradas
  const filteredValidadesAtivas = useMemo(() => {
    return validadesAtivas.filter((v) => {
      if (filterState.marca !== 'Todas as marcas') {
        if (!v.cliente || v.cliente.toLowerCase() !== filterState.marca.toLowerCase()) return false
      }
      if (filterState.rede !== 'Todas as redes') {
        if (!v.rede || v.rede.toLowerCase() !== filterState.rede.toLowerCase()) return false
      }
      if (filterState.loja !== 'Todas as lojas') {
        const label = formatStoreIdentityTable({
          codigoLoja: v.codigoLoja,
          nomeLoja: v.loja,
        })
        if (label.toLowerCase() !== filterState.loja.toLowerCase()) return false
      }
      if (filterState.cidadeUf !== 'Todas as cidades') {
        const cUf = formatCityUf(v.cidade, v.uf)
        if (cUf.toLowerCase() !== filterState.cidadeUf.toLowerCase()) return false
      }
      return true
    })
  }, [validadesAtivas, filterState])

  // Rupturas Ativas Filtradas
  const filteredRupturasAtivas = useMemo(() => {
    return rupturasAtivas
      .filter((r) => r.situacao_atual === 'Ativo')
      .filter((r) => {
        if (filterState.marca !== 'Todas as marcas') {
          if (!r.cliente || r.cliente.toLowerCase() !== filterState.marca.toLowerCase())
            return false
        }
        if (filterState.rede !== 'Todas as redes') {
          const rupRede = (r as any).rede || ''
          if (!rupRede || rupRede.toLowerCase() !== filterState.rede.toLowerCase()) return false
        }
        if (filterState.loja !== 'Todas as lojas') {
          const label = formatStoreIdentityTable({
            codigoLoja: r.codigo_loja,
            nomeLoja: r.nome_loja,
          })
          if (label.toLowerCase() !== filterState.loja.toLowerCase()) return false
        }
        if (filterState.cidadeUf !== 'Todas as cidades') {
          const cUf = formatCityUf(r.cidade, r.estado)
          if (cUf.toLowerCase() !== filterState.cidadeUf.toLowerCase()) return false
        }
        return true
      })
  }, [rupturasAtivas, filterState])

  // 4 KPIs Executivos
  const kpis = useMemo(() => {
    // 1. Casos complexos de validade: ocorrências ativas com 0 a 15 dias (status = Crítico)
    const complexosValidade = filteredValidadesAtivas.filter((v) => v.diasRestantes <= 15).length

    // 2. Rupturas ativas (após confronto situacao_atual = 'Ativo')
    const rupturasCount = filteredRupturasAtivas.length

    // 3. Lojas críticas: identidades distintas com pelo menos 1 caso 0-15d OU 1 ruptura ativa
    const lojasCriticas = filteredStores.filter((s) => s.situacao === 'Crítica').length

    // 4. Produtos em risco: produtos distintos presentes nos grupos acima (validades 0-15d + rupturas ativas), sem duplicar
    const produtosSet = new Set<string>()
    filteredValidadesAtivas.forEach((v) => {
      if (v.diasRestantes <= 15 && v.product && v.product.trim()) {
        produtosSet.add(v.product.trim().toUpperCase())
      }
    })
    filteredRupturasAtivas.forEach((r) => {
      if (r.produto && r.produto.trim()) {
        produtosSet.add(r.produto.trim().toUpperCase())
      }
    })
    const produtosEmRisco = produtosSet.size

    return {
      complexosValidade,
      rupturasCount,
      lojasCriticas,
      produtosEmRisco,
    }
  }, [filteredValidadesAtivas, filteredRupturasAtivas, filteredStores])

  // Prioridades de ação: ranking de no máximo 10 lojas
  // Ordenação transparente (NUNCA score opaco):
  // 1. Lojas com AMBOS os riscos primeiro
  // 2. Depois por validadesCríticas desc
  // 3. Depois por rupturasAtivas desc
  // 4. Depois por nome asc
  const priorityStores = useMemo(() => {
    const list = [...filteredStores].filter(
      (s) => s.validadesCriticasCount > 0 || s.rupturasAtivasCount > 0,
    )

    list.sort((a, b) => {
      const aBoth = a.validadesCriticasCount > 0 && a.rupturasAtivasCount > 0 ? 1 : 0
      const bBoth = b.validadesCriticasCount > 0 && b.rupturasAtivasCount > 0 ? 1 : 0
      if (bBoth !== aBoth) return bBoth - aBoth

      if (b.validadesCriticasCount !== a.validadesCriticasCount) {
        return b.validadesCriticasCount - a.validadesCriticasCount
      }

      if (b.rupturasAtivasCount !== a.rupturasAtivasCount) {
        return b.rupturasAtivasCount - a.rupturasAtivasCount
      }

      const nameA = formatStoreIdentityTable({ codigoLoja: a.storeCode, nomeLoja: a.storeName })
      const nameB = formatStoreIdentityTable({ codigoLoja: b.storeCode, nomeLoja: b.storeName })
      return nameA.localeCompare(nameB, 'pt-BR', { numeric: true, sensitivity: 'base' })
    })

    return list.slice(0, 10)
  }, [filteredStores])

  // Painel 1: Validades mais urgentes (máx 5 itens ordenados por diasRestantes asc)
  const validadesMaisUrgentes = useMemo(() => {
    const list = [...filteredValidadesAtivas]
    list.sort((a, b) => a.diasRestantes - b.diasRestantes)
    return list.slice(0, 5)
  }, [filteredValidadesAtivas])

  // Painel 2: Rupturas mais antigas (máx 5 itens ordenados por dias_em_ruptura desc)
  const rupturasMaisAntigas = useMemo(() => {
    const list = [...filteredRupturasAtivas]
    list.sort((a, b) => (b.dias_em_ruptura ?? 0) - (a.dias_em_ruptura ?? 0))
    return list.slice(0, 5)
  }, [filteredRupturasAtivas])

  // Query string builder para navegação com filtros preservados
  const buildPreservedQuery = useCallback(
    (extra?: Record<string, string>) => {
      const params = new URLSearchParams()
      if (filterState.marca !== 'Todas as marcas') {
        params.set('marca', filterState.marca)
      }
      if (filterState.rede !== 'Todas as redes') {
        params.set('rede', filterState.rede)
      }
      if (filterState.loja !== 'Todas as lojas') {
        params.set('loja', filterState.loja)
      }
      if (extra) {
        Object.entries(extra).forEach(([k, v]) => {
          if (v) params.set(k, v)
        })
      }
      const qs = params.toString()
      return qs ? `?${qs}` : ''
    },
    [filterState],
  )

  const hasActiveFilters =
    filterState.marca !== 'Todas as marcas' ||
    filterState.rede !== 'Todas as redes' ||
    filterState.loja !== 'Todas as lojas' ||
    filterState.cidadeUf !== 'Todas as cidades'

  const handleClearFilters = useCallback(() => {
    setFilterState(initialFilterState)
  }, [])

  // Chips ativos
  const activeChips = useMemo(() => {
    const chips: Array<{ id: string; label: string; onRemove: () => void }> = []
    if (filterState.marca !== 'Todas as marcas') {
      chips.push({
        id: 'marca',
        label: `Marca: ${filterState.marca}`,
        onRemove: () => setFilterState((s) => ({ ...s, marca: 'Todas as marcas' })),
      })
    }
    if (filterState.rede !== 'Todas as redes') {
      chips.push({
        id: 'rede',
        label: `Rede: ${filterState.rede}`,
        onRemove: () => setFilterState((s) => ({ ...s, rede: 'Todas as redes' })),
      })
    }
    if (filterState.loja !== 'Todas as lojas') {
      chips.push({
        id: 'loja',
        label: `Loja: ${filterState.loja}`,
        onRemove: () => setFilterState((s) => ({ ...s, loja: 'Todas as lojas' })),
      })
    }
    if (filterState.cidadeUf !== 'Todas as cidades') {
      chips.push({
        id: 'cidadeUf',
        label: `Cidade/UF: ${filterState.cidadeUf}`,
        onRemove: () => setFilterState((s) => ({ ...s, cidadeUf: 'Todas as cidades' })),
      })
    }
    return chips
  }, [filterState])

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Visão Estratégica</h1>
            <p className="text-xs text-slate-500 mt-1">
              Centro de controle e inteligência operacional sobre validades e rupturas.
            </p>
          </div>
        </div>
      </div>

      {/* 4 KPIs Executivos */}
      {isLoading ? (
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
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* KPI 1: Casos complexos de validade */}
          <div
            onClick={() => navigate(`/validades${buildPreservedQuery({ status: 'critico' })}`)}
            className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs cursor-pointer hover:border-red-300 hover:shadow-sm transition-all"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Casos complexos
              </span>
              <div className="w-8 h-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center">
                <AlertOctagon className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-bold text-red-600 mt-2">{kpis.complexosValidade}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">0 a 15 dias para vencer</p>
          </div>

          {/* KPI 2: Rupturas ativas */}
          <div
            onClick={() => navigate(`/rupturas${buildPreservedQuery()}`)}
            className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs cursor-pointer hover:border-amber-300 hover:shadow-sm transition-all"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Rupturas ativas
              </span>
              <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                <AlertTriangle className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-bold text-amber-700 mt-2">{kpis.rupturasCount}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Ocorrências na Base Atual</p>
          </div>

          {/* KPI 3: Lojas críticas */}
          <div
            onClick={() => navigate(`/lojas${buildPreservedQuery({ situacao: 'Críticas' })}`)}
            className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs cursor-pointer hover:border-red-300 hover:shadow-sm transition-all"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Lojas críticas
              </span>
              <div className="w-8 h-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center">
                <Store className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-bold text-red-600 mt-2">{kpis.lojasCriticas}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Lojas com risco operacional</p>
          </div>

          {/* KPI 4: Produtos em risco */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Produtos em risco
              </span>
              <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <Package className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-bold text-indigo-700 mt-2">{kpis.produtosEmRisco}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Produtos distintos em risco</p>
          </div>
        </div>
      )}

      {/* Filtros Executivos Sempre Visíveis */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-xs space-y-3.5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Marca */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Marca
            </label>
            <select
              aria-label="Marca"
              value={filterState.marca}
              onChange={(e) => setFilterState((s) => ({ ...s, marca: e.target.value }))}
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
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Rede
            </label>
            <select
              aria-label="Rede"
              value={filterState.rede}
              onChange={(e) => setFilterState((s) => ({ ...s, rede: e.target.value }))}
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

          {/* Loja */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Loja
            </label>
            <select
              aria-label="Loja"
              value={filterState.loja}
              onChange={(e) => setFilterState((s) => ({ ...s, loja: e.target.value }))}
              className="w-full h-9 px-2.5 py-1 text-xs sm:text-sm bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer truncate"
            >
              <option value="Todas as lojas">Todas as lojas</option>
              {filterOptions.lojas.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>

          {/* Cidade/UF */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Cidade / UF
            </label>
            <select
              aria-label="Cidade / UF"
              value={filterState.cidadeUf}
              onChange={(e) => setFilterState((s) => ({ ...s, cidadeUf: e.target.value }))}
              className="w-full h-9 px-2.5 py-1 text-xs sm:text-sm bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer truncate"
            >
              <option value="Todas as cidades">Todas as cidades</option>
              {filterOptions.cidadesUf.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        {hasActiveFilters && (
          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <Button
              type="button"
              onClick={handleClearFilters}
              variant="outline"
              size="sm"
              className="h-8 px-3 gap-1.5 border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg font-medium text-xs ml-auto"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
              <span>Limpar filtros</span>
            </Button>
          </div>
        )}

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

      {/* Corpo da Tela — "Prioridades de ação" */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden space-y-0">
        <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900">Prioridades de Ação</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Ranking de até 10 lojas com maior concentração de validades críticas e rupturas.
            </p>
          </div>
          <Link
            to={`/lojas${buildPreservedQuery()}`}
            className="text-xs text-indigo-600 hover:text-indigo-700 font-semibold inline-flex items-center gap-1 hover:underline self-start sm:self-auto"
          >
            <span>Ver todas as lojas</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {priorityStores.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 mx-auto flex items-center justify-center">
              <Store className="w-5 h-5" />
            </div>
            <p className="text-sm font-semibold text-slate-800">
              Nenhuma loja com prioridade crítica encontrada
            </p>
            <p className="text-xs text-slate-500">
              Todas as lojas filtradas estão com operação dentro dos parâmetros normais.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/70 border-b border-slate-200 text-slate-600 font-semibold select-none">
                  <th className="py-3 px-4 min-w-[220px]">Loja</th>
                  <th className="py-3 px-4 min-w-[130px]">Cidade / UF</th>
                  <th className="py-3 px-4 text-center min-w-[140px]">Validades até 15 dias</th>
                  <th className="py-3 px-4 text-center min-w-[120px]">Rupturas ativas</th>
                  <th className="py-3 px-4 min-w-[150px]">Principal motivo</th>
                  <th className="py-3 px-4 text-center min-w-[100px]">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {priorityStores.map((store) => {
                  const storeDisplay = formatStoreIdentityTable({
                    codigoLoja: store.storeCode,
                    nomeLoja: store.storeName,
                  })

                  const principalMotivo =
                    store.validadesCriticasCount > 0 && store.rupturasAtivasCount > 0
                      ? 'Ambos'
                      : store.validadesCriticasCount > 0
                        ? 'Validades críticas'
                        : 'Rupturas ativas'

                  return (
                    <tr
                      key={store.storeId}
                      onClick={() => navigate(`/lojas/${encodeURIComponent(store.storeId)}`)}
                      className="hover:bg-slate-50/70 transition-colors cursor-pointer group"
                    >
                      {/* 1. Loja */}
                      <td className="py-3 px-4">
                        <span className="font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors">
                          {storeDisplay}
                        </span>
                      </td>

                      {/* 2. Cidade / UF */}
                      <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                        {formatCityUf(store.city, store.uf)}
                      </td>

                      {/* 3. Validades até 15 dias */}
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

                      {/* 4. Rupturas ativas */}
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

                      {/* 5. Principal motivo */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`text-xs font-medium ${
                            principalMotivo === 'Ambos'
                              ? 'text-purple-700 font-semibold'
                              : principalMotivo === 'Validades críticas'
                                ? 'text-red-600'
                                : 'text-amber-700'
                          }`}
                        >
                          {principalMotivo}
                        </span>
                      </td>

                      {/* 6. Situação */}
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <Badge
                          variant="outline"
                          className={
                            store.situacao === 'Crítica'
                              ? 'bg-red-50 text-red-700 border-red-200 font-semibold'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold'
                          }
                        >
                          {store.situacao}
                        </Badge>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Dois Painéis Compactos (Grid 2 Colunas) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Painel 1: Validades mais urgentes (máx 5 itens) */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Validades mais urgentes</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Ocorrências ativas com menor tempo restante para vencer
              </p>
            </div>
          </div>

          {validadesMaisUrgentes.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              Nenhuma ocorrência de validade ativa no momento.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/70 border-b border-slate-200 text-slate-600 font-semibold">
                    <th className="py-2.5 px-3">Loja</th>
                    <th className="py-2.5 px-3">Marca</th>
                    <th className="py-2.5 px-3">Produto</th>
                    <th className="py-2.5 px-3 text-center">Dias</th>
                    <th className="py-2.5 px-3">Validade</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {validadesMaisUrgentes.map((item) => {
                    const lojaText = formatStoreIdentityTable({
                      codigoLoja: item.codigoLoja,
                      nomeLoja: item.loja,
                    })

                    return (
                      <tr key={item.id} className="hover:bg-slate-50/60">
                        <td
                          className="py-2.5 px-3 font-semibold text-slate-900 max-w-[150px] truncate"
                          title={lojaText}
                        >
                          {lojaText}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                          {item.cliente}
                        </td>
                        <td
                          className="py-2.5 px-3 text-slate-700 max-w-[150px] truncate"
                          title={item.product}
                        >
                          {item.product}
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold text-red-600 tabular-nums">
                          {item.diasRestantes}d
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap tabular-nums">
                          {formatDisplayDate(item.validade, '—')}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="pt-2 border-t border-slate-100 flex justify-end">
            <Link
              to={`/validades${buildPreservedQuery()}`}
              className="text-xs text-indigo-600 hover:text-indigo-700 font-semibold inline-flex items-center gap-1 hover:underline"
            >
              <span>Ver todas as validades</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* Painel 2: Rupturas mais antigas (máx 5 itens) */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Rupturas mais antigas</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Ocorrências com maior tempo acumulado em ruptura
              </p>
            </div>
          </div>

          {rupturasMaisAntigas.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              Nenhuma ruptura ativa no momento.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/70 border-b border-slate-200 text-slate-600 font-semibold">
                    <th className="py-2.5 px-3">Loja</th>
                    <th className="py-2.5 px-3">Marca</th>
                    <th className="py-2.5 px-3">Produto</th>
                    <th className="py-2.5 px-3 text-center">Dias</th>
                    <th className="py-2.5 px-3">Motivo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rupturasMaisAntigas.map((item) => {
                    const lojaText = formatStoreIdentityTable({
                      codigoLoja: item.codigo_loja,
                      nomeLoja: item.nome_loja,
                    })

                    return (
                      <tr key={item.id} className="hover:bg-slate-50/60">
                        <td
                          className="py-2.5 px-3 font-semibold text-slate-900 max-w-[150px] truncate"
                          title={lojaText}
                        >
                          {lojaText}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                          {item.cliente}
                        </td>
                        <td
                          className="py-2.5 px-3 text-slate-700 max-w-[150px] truncate"
                          title={item.produto}
                        >
                          {item.produto}
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold text-amber-700 tabular-nums">
                          {item.dias_em_ruptura ?? 0}d
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                          <Badge
                            variant="outline"
                            className="bg-amber-50 text-amber-800 border-amber-200 text-[10px]"
                          >
                            {item.motivo || '—'}
                          </Badge>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="pt-2 border-t border-slate-100 flex justify-end">
            <Link
              to={`/rupturas${buildPreservedQuery()}`}
              className="text-xs text-indigo-600 hover:text-indigo-700 font-semibold inline-flex items-center gap-1 hover:underline"
            >
              <span>Ver todas as rupturas</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
export const Dashboard = DashboardPage
export default DashboardPage
