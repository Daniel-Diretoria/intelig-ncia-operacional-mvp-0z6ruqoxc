import React, { useState, useMemo, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useValidades } from '@/services'
import type { ValidadeItem } from '@/types'
import { DataTable, type Column } from '@/components/ui/data-table'
import { AlertBanner } from '@/components/ui/alert-banner'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import {
  AlertOctagon,
  CalendarClock,
  Store,
  Download,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
} from 'lucide-react'
import { classificarCriticidade } from '@/lib/data/criticidade'
import { ValidadesKpis, type KpiTile } from '@/components/validades/ValidadesKpis'
import {
  ValidadesFilters,
  emptyValidadesFilterState,
  buildValidadesFilter,
  type ValidadesFilterState,
  type FaixaVencimentoKey,
} from '@/components/validades/ValidadesFilters'
import { CriticidadeBadge } from '@/components/validades/CriticidadeBadge'
import { formatDisplayDate } from '@/lib/format/dateParser'
import { formatCityUf } from '@/lib/format/storeIdentity'
import {
  formatStoreIdentityTable,
  exportValidadesTableViewXLSX,
} from '@/lib/export/validadeTableViewExport'
import { useToast } from '@/hooks/use-toast'

type PageSizeOption = 25 | 50 | 100

const fmtInt = (v: number) => v.toLocaleString('pt-BR')

export const ValidadesPage: React.FC = () => {
  const navigate = useNavigate()
  const { toast } = useToast()

  const [filterState, setFilterState] = useState<ValidadesFilterState>(emptyValidadesFilterState)
  const [appliedFilter, setAppliedFilter] =
    useState<ValidadesFilterState>(emptyValidadesFilterState)

  // KPI clicável para filtro de faixa de dias
  const [activeKpiFaixa, setActiveKpiFaixa] = useState<'casosComplexos' | 'atencao' | null>(null)

  const [sortKey, setSortKey] = useState<string>('diasRestantes')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<PageSizeOption>(25)

  // Constrói filtro efetivo combinando filtros da barra + filtro de clique do KPI
  const effectiveFilter = useMemo(() => {
    const base = buildValidadesFilter(appliedFilter)
    const merged: typeof base = { ...base }

    // Se houver clique no KPI de faixa e a barra não tiver faixa explícita sobrescrevendo
    if (activeKpiFaixa === 'casosComplexos') {
      merged.criticidades = ['Vencido', 'Crítico']
    } else if (activeKpiFaixa === 'atencao') {
      merged.criticidades = ['Atenção']
    }

    return merged
  }, [appliedFilter, activeKpiFaixa])

  const { data: validades, isLoading, error, refetch } = useValidades(effectiveFilter)

  useEffect(() => {
    const handleGlobalRefresh = () => refetch()
    window.addEventListener('diretoria:refresh', handleGlobalRefresh)
    return () => window.removeEventListener('diretoria:refresh', handleGlobalRefresh)
  }, [refetch])

  // Única Fonte de Verdade: KPIs calculados sobre validades filtrado (não sobre a página)
  const kpis = useMemo(() => {
    let complexosCount = 0
    let atencaoCount = 0
    const lojasCriticasSet = new Set<string>()

    for (const item of validades) {
      if (item.diasRestantes <= 15) {
        complexosCount++
        const lojaIdent = item.codigoLoja
          ? `${item.codigoLoja}-${item.loja}`
          : item.loja || 'SEM_LOJA'
        lojasCriticasSet.add(lojaIdent)
      } else if (item.diasRestantes > 15 && item.diasRestantes <= 30) {
        atencaoCount++
      }
    }

    return {
      ativas: validades.length,
      casosComplexos: complexosCount,
      atencao: atencaoCount,
      lojasCriticas: lojasCriticasSet.size,
    }
  }, [validades])

  // Atualização em tempo real quando o usuário digita/seleciona nos filtros
  const handleFilterChange = useCallback((newState: ValidadesFilterState) => {
    setFilterState(newState)
    setAppliedFilter(newState)
    setPage(1)
  }, [])

  const handleClearFilters = useCallback(() => {
    setFilterState(emptyValidadesFilterState)
    setAppliedFilter(emptyValidadesFilterState)
    setActiveKpiFaixa(null)
    setPage(1)
  }, [])

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortOrder('asc')
    }
  }

  // Toggle de KPI clicável (casosComplexos / atencao)
  const handleKpiSelect = (id: string) => {
    if (id === 'casosComplexos') {
      setActiveKpiFaixa((prev) => (prev === 'casosComplexos' ? null : 'casosComplexos'))
      setPage(1)
    } else if (id === 'atencao') {
      setActiveKpiFaixa((prev) => (prev === 'atencao' ? null : 'atencao'))
      setPage(1)
    }
  }

  // Ordenação de dados (Única fonte de verdade: sortedData deriva de validades)
  const sortedData = useMemo(() => {
    const list = [...validades]
    if (!sortKey) return list

    list.sort((a, b) => {
      let valA: unknown = (a as unknown as Record<string, unknown>)[sortKey]
      let valB: unknown = (b as unknown as Record<string, unknown>)[sortKey]

      if (sortKey === 'loja') {
        valA = formatStoreIdentityTable({ codigoLoja: a.codigoLoja, loja: a.loja })
        valB = formatStoreIdentityTable({ codigoLoja: b.codigoLoja, loja: b.loja })
      } else if (sortKey === 'criticidade') {
        valA = classificarCriticidade(a.diasRestantes)
        valB = classificarCriticidade(b.diasRestantes)
      } else if (
        sortKey === 'validade' ||
        sortKey === 'dataEntrada' ||
        sortKey === 'ultimaAtualizacao'
      ) {
        const timeA = valA ? new Date(valA as string).getTime() : 0
        const timeB = valB ? new Date(valB as string).getTime() : 0
        valA = isNaN(timeA) ? 0 : timeA
        valB = isNaN(timeB) ? 0 : timeB
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
  }, [validades, sortKey, sortOrder])

  // Paginação com seletor de page size (25 / 50 / 100)
  const totalPages = Math.max(1, Math.ceil(sortedData.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const paginatedData = useMemo(
    () => sortedData.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [sortedData, currentPage, pageSize],
  )

  // Opções de filtros derivadas dinamicamente da base atual
  const uniqueSorted = (vals: Array<string | undefined | null>) =>
    [...new Set(vals.filter((v): v is string => Boolean(v && v.trim())))].sort((a, b) =>
      a.localeCompare(b, 'pt-BR'),
    )

  const toOptions = (arr: string[]) => arr.map((v) => ({ label: v, value: v }))

  // Opções formatadas de Loja: "CÓDIGO • NOME"
  const storeOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const v of validades) {
      if (v.loja) {
        const ident = formatStoreIdentityTable({ codigoLoja: v.codigoLoja, loja: v.loja })
        map.set(v.loja, ident)
      }
    }
    return Array.from(map.entries())
      .map(([val, label]) => ({ label, value: val }))
      .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'))
  }, [validades])

  const filterOptions = useMemo(
    () => ({
      clientes: toOptions(uniqueSorted(validades.map((v) => v.cliente))),
      redes: toOptions(uniqueSorted(validades.map((v) => v.rede))),
      lojas: storeOptions,
      cidades: toOptions(uniqueSorted(validades.map((v) => v.cidade))),
      produtos: toOptions(uniqueSorted(validades.map((v) => v.product))),
    }),
    [validades, storeOptions],
  )

  // Exatamente 4 KPIs
  const kpiTiles: KpiTile[] = useMemo(
    () => [
      {
        id: 'ativas',
        label: 'Validades ativas',
        value: fmtInt(kpis.ativas),
        icon: ClipboardList,
        chipClass: 'bg-slate-100 text-slate-700',
        hint: 'Total filtrado',
        active: false,
      },
      {
        id: 'casosComplexos',
        label: 'Casos complexos',
        value: fmtInt(kpis.casosComplexos),
        icon: AlertOctagon,
        chipClass: 'bg-red-100 text-red-700',
        hint: '≤ 15 dias para vencer',
        active: activeKpiFaixa === 'casosComplexos',
      },
      {
        id: 'atencao',
        label: 'Atenção',
        value: fmtInt(kpis.atencao),
        icon: CalendarClock,
        chipClass: 'bg-amber-100 text-amber-800',
        hint: '16 a 30 dias para vencer',
        active: activeKpiFaixa === 'atencao',
      },
      {
        id: 'lojasCriticas',
        label: 'Lojas críticas',
        value: fmtInt(kpis.lojasCriticas),
        icon: Store,
        chipClass: 'bg-blue-100 text-blue-700',
        hint: 'Lojas com lote ≤ 15 dias',
        active: false,
      },
    ],
    [kpis, activeKpiFaixa],
  )

  // Exportação XLSX contextual única
  const handleExportXLSX = useCallback(() => {
    if (sortedData.length === 0) return

    try {
      const { count, fileName } = exportValidadesTableViewXLSX(
        sortedData,
        appliedFilter.cliente !== 'Todos' ? appliedFilter.cliente : null,
      )

      toast({
        title: 'Exportação concluída',
        description: `${count} ocorrência(s) exportada(s) com sucesso em ${fileName}.`,
      })
    } catch (err) {
      toast({
        title: 'Erro na exportação',
        description: err instanceof Error ? err.message : 'Falha ao gerar arquivo XLSX.',
        variant: 'destructive',
      })
    }
  }, [sortedData, appliedFilter.cliente, toast])

  // Exatamente 8 colunas na ordem especificada:
  // 1. Loja
  // 2. Marca (cliente)
  // 3. Realizado (dataEntrada)
  // 4. Produto (product com truncamento e hover)
  // 5. Dias pra vencer (diasRestantes)
  // 6. Validade (validade)
  // 7. Criticidade (CriticidadeBadge)
  // 8. Data de Entrada (ultimaAtualizacao)
  const columns: Column<ValidadeItem>[] = useMemo(
    () => [
      {
        key: 'loja',
        header: 'Loja',
        className: 'min-w-[200px]',
        sortable: true,
        render: (row) => {
          const storeTableIdent = formatStoreIdentityTable({
            codigoLoja: row.codigoLoja,
            loja: row.loja,
          })
          const codeKey = row.codigoLoja ? `${row.codigoLoja}-${row.loja}` : row.loja
          return (
            <div
              className="min-w-0 cursor-pointer group"
              onClick={(e) => {
                e.stopPropagation()
                if (codeKey) {
                  navigate(`/lojas/${encodeURIComponent(codeKey)}`)
                }
              }}
            >
              <p
                className="font-medium text-slate-900 group-hover:text-indigo-600 transition-colors truncate"
                title={storeTableIdent}
              >
                {storeTableIdent}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {formatCityUf(row.cidade, row.uf)}
              </p>
            </div>
          )
        },
      },
      {
        key: 'cliente',
        header: 'Marca',
        className: 'min-w-[140px] text-slate-700 font-medium',
        sortable: true,
        render: (row) => row.cliente || '—',
      },
      {
        key: 'dataEntrada',
        header: 'Realizado',
        className: 'min-w-[110px] tabular-nums text-slate-700',
        sortable: true,
        render: (row) => formatDisplayDate(row.dataEntrada, '—'),
      },
      {
        key: 'product',
        header: 'Produto',
        className: 'min-w-[200px] max-w-[320px]',
        sortable: true,
        render: (row) => (
          <div className="min-w-0" title={row.product}>
            <p className="font-medium text-slate-900 truncate">{row.product || '—'}</p>
            <p className="text-[11px] text-slate-400 mt-0.5 font-mono">
              {row.sku && row.sku !== 'Código não informado'
                ? `SKU: ${row.sku}`
                : 'Código não informado'}
            </p>
          </div>
        ),
      },
      {
        key: 'diasRestantes',
        header: 'Dias pra vencer',
        align: 'center',
        sortable: true,
        className: 'tabular-nums font-semibold text-slate-900',
        render: (row) => (
          <span
            className={
              row.diasRestantes < 0
                ? 'text-rose-600 font-bold'
                : row.diasRestantes <= 15
                  ? 'text-red-600 font-bold'
                  : row.diasRestantes <= 30
                    ? 'text-amber-600 font-semibold'
                    : 'text-slate-800'
            }
          >
            {row.diasRestantes}
          </span>
        ),
      },
      {
        key: 'validade',
        header: 'Validade',
        sortable: true,
        className: 'tabular-nums text-slate-700 min-w-[110px]',
        render: (row) => formatDisplayDate(row.validade, '—'),
      },
      {
        key: 'criticidade',
        header: 'Criticidade',
        align: 'center',
        sortable: true,
        className: 'min-w-[130px]',
        render: (row) => {
          const nivel = classificarCriticidade(row.diasRestantes)
          return <CriticidadeBadge level={nivel} diasRestantes={row.diasRestantes} />
        },
      },
      {
        key: 'ultimaAtualizacao',
        header: 'Data de Entrada',
        sortable: true,
        className: 'tabular-nums text-slate-500 text-xs min-w-[110px]',
        render: (row) => formatDisplayDate(row.ultimaAtualizacao, '—'),
      },
    ],
    [navigate],
  )

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Header Premium */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
            <CalendarClock className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                Gestão de Validades
              </h1>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
                Base Atual
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Monitoramento prioritário de lotes próximos ao vencimento e tomada de decisão
              operacional.
            </p>
          </div>
        </div>

        {/* Botão Único de Exportação XLSX da Visão Atual */}
        <Button
          onClick={handleExportXLSX}
          disabled={isLoading || sortedData.length === 0}
          className="h-10 px-4 gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs self-start sm:self-center font-semibold text-xs rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Download className="w-4 h-4" />
          <span>Exportar visão atual (.xlsx)</span>
        </Button>
      </div>

      {/* KPIs — 4 tiles */}
      <ValidadesKpis tiles={kpiTiles} onSelect={handleKpiSelect} isLoading={isLoading} />

      {/* Barra de Filtros Sempre Visível */}
      <ValidadesFilters
        state={filterState}
        onChange={handleFilterChange}
        onClear={handleClearFilters}
        options={filterOptions}
      />

      {/* Erro */}
      {error && (
        <AlertBanner
          type="error"
          title="Erro ao carregar dados de validades"
          message={error.message || 'Falha na comunicação com o provedor de dados.'}
          onRetry={refetch}
        />
      )}

      {/* Tabela de 8 Colunas */}
      {!error && (
        <>
          {sortedData.length === 0 && !isLoading ? (
            <EmptyState
              title="Nenhuma validade encontrada para os filtros aplicados."
              description="Ajuste a busca ou os filtros para visualizar ocorrências."
              actionLabel="Limpar filtros"
              onAction={handleClearFilters}
            />
          ) : (
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-500">
                <span className="font-medium text-slate-700">
                  {sortedData.length} ocorrência(s) encontrada(s)
                  {activeKpiFaixa === 'casosComplexos' && ' • Filtro de KPI: Casos complexos'}
                  {activeKpiFaixa === 'atencao' && ' • Filtro de KPI: Atenção'}
                </span>

                <div className="flex items-center gap-4">
                  {/* Seletor de Page Size: 25 / 50 / 100 */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-500">Itens por página:</span>
                    <select
                      aria-label="Itens por página"
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value) as PageSizeOption)
                        setPage(1)
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

              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
                <DataTable
                  columns={columns}
                  data={paginatedData}
                  isLoading={isLoading}
                  sortKey={sortKey}
                  sortOrder={sortOrder}
                  onSort={handleSort}
                  emptyMessage="Nenhuma validade encontrada."
                />
              </div>

              {/* Paginação */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 bg-white rounded-xl border border-slate-200/80 shadow-2xs text-xs text-slate-600">
                <span>
                  Mostrando{' '}
                  <strong className="text-slate-900">
                    {sortedData.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}
                  </strong>
                  –
                  <strong className="text-slate-900">
                    {Math.min(currentPage * pageSize, sortedData.length)}
                  </strong>{' '}
                  de <strong className="text-slate-900">{sortedData.length}</strong> ocorrência(s)
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
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="h-8 px-2.5 text-xs gap-1 border-slate-200 rounded-lg hover:bg-slate-50"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>Anterior</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage >= totalPages || isLoading}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
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
