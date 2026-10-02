import React, { useState, useMemo, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Factory,
  Search,
  RotateCcw,
  AlertOctagon,
  AlertTriangle,
  Store,
  Package,
  ChevronRight,
  ExternalLink,
} from 'lucide-react'
import { useValidades } from '@/services/useValidades'
import { useRupturas } from '@/services/useRupturas'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatStoreIdentityTable } from '@/lib/format/storeIdentity'
import { ContextPanel, type ContextPanelTarget } from '@/components/common/ContextPanel'

export interface IndustryAggregated {
  name: string
  totalValidades: number
  validadesCriticas: number // 0-15d
  validadesAtencao: number // 16-20d
  rupturasAtivas: number
  totalProdutos: number
  totalLojas: number
  lojasSet: Set<string>
  produtosSet: Set<string>
  situacao: 'Crítica' | 'Atenção' | 'Normal'
}

export const IndustriasPage: React.FC = () => {
  const [searchParams] = useSearchParams()
  const initialMarcaQuery = searchParams.get('marca') || ''

  const [search, setSearch] = useState(initialMarcaQuery)
  const [situacaoFilter, setSituacaoFilter] = useState<'Todas' | 'Crítica' | 'Atenção' | 'Normal'>(
    'Todas',
  )
  const [panelTarget, setPanelTarget] = useState<ContextPanelTarget | null>(null)

  const {
    data: validades,
    isLoading: isLoadingValidades,
    refetch: refetchValidades,
  } = useValidades()

  const {
    filteredRupturas: rupturas,
    isLoading: isLoadingRupturas,
    refetch: refetchRupturas,
  } = useRupturas()

  const isLoading = isLoadingValidades || isLoadingRupturas

  // Agregação real por Marca / Indústria diretamente dos registros canônicos
  const industrias = useMemo(() => {
    const map = new Map<
      string,
      {
        name: string
        totalValidades: number
        validadesCriticas: number
        validadesAtencao: number
        rupturasAtivas: number
        lojasSet: Set<string>
        produtosSet: Set<string>
      }
    >()

    const getOrCreate = (rawName: string) => {
      const name = rawName.trim().toUpperCase()
      let entry = map.get(name)
      if (!entry) {
        entry = {
          name,
          totalValidades: 0,
          validadesCriticas: 0,
          validadesAtencao: 0,
          rupturasAtivas: 0,
          lojasSet: new Set<string>(),
          produtosSet: new Set<string>(),
        }
        map.set(name, entry)
      }
      return entry
    }

    // Processa Validades
    for (const v of validades) {
      const brand = v.cliente || v.industria || 'Não informada'
      const entry = getOrCreate(brand)
      entry.totalValidades++
      if (v.diasRestantes <= 15) {
        entry.validadesCriticas++
      } else if (v.diasRestantes <= 20) {
        entry.validadesAtencao++
      }
      if (v.product && v.product.trim()) {
        entry.produtosSet.add(v.product.trim().toUpperCase())
      }
      const lojaLabel = formatStoreIdentityTable({
        codigoLoja: v.codigoLoja,
        nomeLoja: v.loja,
      })
      if (lojaLabel) entry.lojasSet.add(lojaLabel)
    }

    // Processa Rupturas
    for (const r of rupturas) {
      const brand = r.cliente || 'Não informada'
      const entry = getOrCreate(brand)
      entry.rupturasAtivas++
      if (r.produto && r.produto.trim()) {
        entry.produtosSet.add(r.produto.trim().toUpperCase())
      }
      const lojaLabel = formatStoreIdentityTable({
        codigoLoja: r.codigo_loja,
        nomeLoja: r.nome_loja,
      })
      if (lojaLabel) entry.lojasSet.add(lojaLabel)
    }

    const list: IndustryAggregated[] = []

    for (const entry of map.values()) {
      let situacao: 'Crítica' | 'Atenção' | 'Normal' = 'Normal'
      if (entry.validadesCriticas > 0) {
        situacao = 'Crítica'
      } else if (entry.validadesAtencao > 0 || entry.rupturasAtivas > 0) {
        situacao = 'Atenção'
      } else {
        situacao = 'Normal'
      }

      list.push({
        name: entry.name,
        totalValidades: entry.totalValidades,
        validadesCriticas: entry.validadesCriticas,
        validadesAtencao: entry.validadesAtencao,
        rupturasAtivas: entry.rupturasAtivas,
        totalProdutos: entry.produtosSet.size,
        totalLojas: entry.lojasSet.size,
        lojasSet: entry.lojasSet,
        produtosSet: entry.produtosSet,
        situacao,
      })
    }

    // Ordenação: Críticas primeiro, depois Atenção, depois por volume de casos desc
    list.sort((a, b) => {
      const pMap = { Crítica: 3, Atenção: 2, Normal: 1 }
      if (pMap[b.situacao] !== pMap[a.situacao]) {
        return pMap[b.situacao] - pMap[a.situacao]
      }
      const sumB = b.validadesCriticas + b.rupturasAtivas + b.validadesAtencao
      const sumA = a.validadesCriticas + a.rupturasAtivas + a.validadesAtencao
      if (sumB !== sumA) return sumB - sumA
      return a.name.localeCompare(b.name, 'pt-BR')
    })

    return list
  }, [validades, rupturas])

  // Filtragem
  const filteredIndustrias = useMemo(() => {
    return industrias.filter((ind) => {
      if (search.trim()) {
        const q = search.trim().toUpperCase()
        if (!ind.name.includes(q)) return false
      }
      if (situacaoFilter !== 'Todas') {
        if (ind.situacao !== situacaoFilter) return false
      }
      return true
    })
  }, [industrias, search, situacaoFilter])

  // KPIs da tela de indústrias
  const kpis = useMemo(() => {
    const total = industrias.length
    const criticas = industrias.filter((i) => i.situacao === 'Crítica').length
    const atencao = industrias.filter((i) => i.situacao === 'Atenção').length
    const normais = industrias.filter((i) => i.situacao === 'Normal').length
    return { total, criticas, atencao, normais }
  }, [industrias])

  const handleClear = useCallback(() => {
    setSearch('')
    setSituacaoFilter('Todas')
  }, [])

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
            <Factory className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                Gestão de Indústrias &amp; Fornecedores
              </h1>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
                {industrias.length} indústrias ativas
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Visão consolidada por marca/fornecedor a partir das ocorrências canônicas de validades
              e rupturas.
            </p>
          </div>
        </div>
      </div>

      {/* 4 KPIs de Indústria */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total de Indústrias
            </span>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Factory className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2">{kpis.total}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Marcas monitoradas na Base Atual</p>
        </div>

        <div
          onClick={() => setSituacaoFilter((prev) => (prev === 'Crítica' ? 'Todas' : 'Crítica'))}
          className={`bg-white p-5 rounded-2xl border shadow-xs cursor-pointer transition-all ${
            situacaoFilter === 'Crítica'
              ? 'border-red-500 ring-2 ring-red-500/20'
              : 'border-slate-200/80 hover:border-red-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Indústrias Críticas
            </span>
            <div className="w-8 h-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center">
              <AlertOctagon className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-red-600 mt-2">{kpis.criticas}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Validades críticas (0–15d)</p>
        </div>

        <div
          onClick={() => setSituacaoFilter((prev) => (prev === 'Atenção' ? 'Todas' : 'Atenção'))}
          className={`bg-white p-5 rounded-2xl border shadow-xs cursor-pointer transition-all ${
            situacaoFilter === 'Atenção'
              ? 'border-amber-500 ring-2 ring-amber-500/20'
              : 'border-slate-200/80 hover:border-amber-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Em Atenção
            </span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-amber-700 mt-2">{kpis.atencao}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Validades 16–20d</p>
        </div>

        <div
          onClick={() => setSituacaoFilter((prev) => (prev === 'Normal' ? 'Todas' : 'Normal'))}
          className={`bg-white p-5 rounded-2xl border shadow-xs cursor-pointer transition-all ${
            situacaoFilter === 'Normal'
              ? 'border-emerald-500 ring-2 ring-emerald-500/20'
              : 'border-slate-200/80 hover:border-emerald-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Em Regularidade
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Factory className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-emerald-700 mt-2">{kpis.normais}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Sem risco iminente</p>
        </div>
      </div>

      {/* Barra de Filtros */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Buscar por nome da indústria ou fornecedor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-xs sm:text-sm bg-white"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={situacaoFilter}
            onChange={(e) => setSituacaoFilter(e.target.value as any)}
            className="h-9 px-3 text-xs bg-white border border-slate-300 rounded-lg text-slate-800 cursor-pointer"
          >
            <option value="Todas">Todas as situações</option>
            <option value="Crítica">Apenas Críticas</option>
            <option value="Atenção">Apenas Atenção</option>
            <option value="Normal">Apenas Regulares</option>
          </select>

          {(search || situacaoFilter !== 'Todas') && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleClear}
              className="h-9 px-2.5 gap-1 text-xs text-slate-600"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Limpar</span>
            </Button>
          )}
        </div>
      </div>

      {/* Tabela de Indústrias */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Fornecedores &amp; Marcas Consolidadas
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Clique em qualquer linha para abrir o painel lateral de contexto da indústria sem
              trocar de página.
            </p>
          </div>
          <span className="text-xs font-semibold text-slate-400">
            {filteredIndustrias.length} resultado(s)
          </span>
        </div>

        {isLoading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-11 bg-slate-50 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : filteredIndustrias.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
              <Factory className="w-5 h-5" />
            </div>
            <p className="text-sm font-semibold text-slate-800">
              Nenhuma indústria encontrada para os filtros aplicados
            </p>
            <p className="text-xs text-slate-500">
              Tente redefinir a busca ou remover o filtro de situação.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/70 border-b border-slate-200 text-slate-600 font-semibold select-none">
                  <th className="py-3 px-4 min-w-[200px]">Indústria / Marca</th>
                  <th className="py-3 px-4 text-center min-w-[120px]">Produtos</th>
                  <th className="py-3 px-4 text-center min-w-[120px]">Lojas Presentes</th>
                  <th className="py-3 px-4 text-center min-w-[130px]">
                    Validades Críticas (0–15d)
                  </th>
                  <th className="py-3 px-4 text-center min-w-[130px]">
                    Validades Atenção (16–20d)
                  </th>
                  <th className="py-3 px-4 text-center min-w-[120px]">Rupturas Ativas</th>
                  <th className="py-3 px-4 text-center min-w-[100px]">Situação</th>
                  <th className="py-3 px-4 text-right min-w-[80px]">Contexto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredIndustrias.map((ind) => (
                  <tr
                    key={ind.name}
                    onClick={() =>
                      setPanelTarget({
                        type: 'industry',
                        id: ind.name,
                        label: ind.name,
                      })
                    }
                    className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                          <Factory className="w-3.5 h-3.5" />
                        </div>
                        <span className="font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors">
                          {ind.name}
                        </span>
                      </div>
                    </td>

                    <td className="py-3 px-4 text-center tabular-nums text-slate-700 font-medium">
                      {ind.totalProdutos}
                    </td>

                    <td className="py-3 px-4 text-center tabular-nums text-slate-700 font-medium">
                      {ind.totalLojas}
                    </td>

                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      <Badge
                        variant="outline"
                        className={
                          ind.validadesCriticas > 0
                            ? 'bg-red-50 text-red-700 border-red-200 font-bold'
                            : 'bg-slate-50 text-slate-400 border-slate-200'
                        }
                      >
                        {ind.validadesCriticas}
                      </Badge>
                    </td>

                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      <Badge
                        variant="outline"
                        className={
                          ind.validadesAtencao > 0
                            ? 'bg-amber-50 text-amber-700 border-amber-200 font-bold'
                            : 'bg-slate-50 text-slate-400 border-slate-200'
                        }
                      >
                        {ind.validadesAtencao}
                      </Badge>
                    </td>

                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      <Badge
                        variant="outline"
                        className={
                          ind.rupturasAtivas > 0
                            ? 'bg-amber-50 text-amber-800 border-amber-200 font-bold'
                            : 'bg-slate-50 text-slate-400 border-slate-200'
                        }
                      >
                        {ind.rupturasAtivas}
                      </Badge>
                    </td>

                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      <Badge
                        variant="outline"
                        className={
                          ind.situacao === 'Crítica'
                            ? 'bg-red-50 text-red-700 border-red-200 font-semibold'
                            : ind.situacao === 'Atenção'
                              ? 'bg-amber-50 text-amber-700 border-amber-200 font-semibold'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold'
                        }
                      >
                        {ind.situacao}
                      </Badge>
                    </td>

                    <td className="py-3 px-4 text-right">
                      <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-all inline-block" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Painel Lateral de Contexto */}
      <ContextPanel
        target={panelTarget}
        onClose={() => setPanelTarget(null)}
        validades={validades}
        rupturas={rupturas}
      />
    </div>
  )
}

export default IndustriasPage
