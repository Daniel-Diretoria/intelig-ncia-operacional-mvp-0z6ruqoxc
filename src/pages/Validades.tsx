import React, { useState, useMemo, useEffect, useCallback } from 'react'
import { useValidades } from '@/services'
import type { ValidadeItem, ValidadeDrill, ValidadeDrillLevel, CriticidadeLevel } from '@/types'
import { DataTable, type Column } from '@/components/ui/data-table'
import { AlertBanner } from '@/components/ui/alert-banner'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import {
  AlertOctagon,
  CalendarClock,
  CheckCircle2,
  Package,
  Store,
  Users,
  Download,
  ChevronLeft,
  ChevronRight,
  Brain,
  ClipboardList,
} from 'lucide-react'
import { classificarCriticidade, getCriticidadeFaixa } from '@/lib/data/criticidade'
import { calcularKpis } from '@/lib/data/validadesCompute'
import { ValidadesKpis, type KpiTile } from '@/components/validades/ValidadesKpis'
import {
  ValidadesBreadcrumb,
  type BreadcrumbItem,
} from '@/components/validades/ValidadesBreadcrumb'
import {
  ValidadesFilters,
  emptyValidadesFilterState,
  buildValidadesFilter,
  type ValidadesFilterState,
} from '@/components/validades/ValidadesFilters'
import { CriticidadeBadge } from '@/components/validades/CriticidadeBadge'
import { ValidadesIntelligence } from '@/components/validades/ValidadesIntelligence'
import { ExportModal } from '@/components/validades/ExportModal'
import { OccurrenceDetailModal } from '@/components/validades/OccurrenceDetailModal'
import { cn } from '@/lib/utils'

type KpiId =
  | 'total'
  | 'criticos'
  | 'atencao'
  | 'moderado'
  | 'ok'
  | 'quantidade'
  | 'lojas'
  | 'clientes'
  | 'exposicao'

const PAGE_SIZE = 10

const fmtMoney = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const fmtInt = (v: number) => v.toLocaleString('pt-BR')

export const ValidadesPage: React.FC = () => {
  // Estado de filtros (UI)
  const [filterState, setFilterState] = useState<ValidadesFilterState>(emptyValidadesFilterState)
  const [appliedFilter, setAppliedFilter] =
    useState<ValidadesFilterState>(emptyValidadesFilterState)

  // Drill-down
  const [drill, setDrill] = useState<ValidadeDrill | undefined>(undefined)
  // KPI selecionado (aplica criticidade como filtro rápido)
  const [selectedKpi, setSelectedKpi] = useState<KpiId | null>(null)

  // Modais
  const [exportOpen, setExportOpen] = useState(false)
  const [detailItem, setDetailItem] = useState<ValidadeItem | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  // Ordenação / paginação
  const [sortKey, setSortKey] = useState<string>('diasRestantes')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [page, setPage] = useState(1)

  // Filtro efetivo enviado ao hook = filtros aplicados + drill + atalho KPI
  const effectiveFilter = useMemo(() => {
    const base = buildValidadesFilter(appliedFilter)
    const merged: typeof base = { ...base }
    if (drill) merged.drill = drill
    // Atalho de KPI: adiciona criticidade correspondente
    if (selectedKpi) {
      const map: Partial<Record<KpiId, CriticidadeLevel>> = {
        criticos: 'Crítico',
        atencao: 'Atenção',
        moderado: 'Moderado',
        ok: 'OK',
      }
      const nivel = map[selectedKpi]
      if (nivel) {
        // sobrescreve criticidades do filtro manual
        merged.criticidades = [nivel]
      }
    }
    return merged
  }, [appliedFilter, drill, selectedKpi])

  const { data: validades, isLoading, error, refetch } = useValidades(effectiveFilter)

  // Escuta refresh global do header
  useEffect(() => {
    const handleGlobalRefresh = () => refetch()
    window.addEventListener('diretoria:refresh', handleGlobalRefresh)
    return () => window.removeEventListener('diretoria:refresh', handleGlobalRefresh)
  }, [refetch])

  // KPIs calculados sobre os dados filtrados (sem o atalho de KPI, para o total "geral")
  const kpis = useMemo(() => calcularKpis(validades), [validades])

  const handleApplyFilters = useCallback(() => {
    setAppliedFilter(filterState)
    setPage(1)
  }, [filterState])

  const handleClearFilters = useCallback(() => {
    setFilterState(emptyValidadesFilterState)
    setAppliedFilter(emptyValidadesFilterState)
    setDrill(undefined)
    setSelectedKpi(null)
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

  const handleKpiSelect = (id: string) => {
    const kpiId = id as KpiId
    if (selectedKpi === kpiId) {
      setSelectedKpi(null)
    } else {
      setSelectedKpi(kpiId)
      setDrill(undefined)
    }
    setPage(1)
  }

  // Drill-down: clica num registro -> desce um nível conforme contexto atual
  const handleRowClick = (row: ValidadeItem) => {
    setDetailItem(row)
    setDetailOpen(true)
  }

  const drillInto = (item: ValidadeItem) => {
    // Hierarquia: overview -> cliente -> loja -> produto -> ocorrencia
    if (!drill || drill.level === 'overview') {
      setDrill({ level: 'cliente', cliente: item.cliente })
    } else if (drill.level === 'cliente') {
      setDrill({ level: 'loja', cliente: drill.cliente, loja: item.loja })
    } else if (drill.level === 'loja') {
      setDrill({
        level: 'produto',
        cliente: drill.cliente,
        loja: drill.loja,
        produto: item.product,
      })
    } else if (drill.level === 'produto') {
      setDrill({
        level: 'ocorrencia',
        cliente: drill.cliente,
        loja: drill.loja,
        produto: drill.produto,
        ocorrenciaId: item.id,
      })
    }
    setSelectedKpi(null)
    setPage(1)
  }

  const handleBreadcrumbNavigate = (level: ValidadeDrillLevel) => {
    if (level === 'overview') {
      setDrill(undefined)
    } else if (level === 'cliente') {
      setDrill({ level: 'cliente', cliente: drill?.cliente })
    } else if (level === 'loja') {
      setDrill({ level: 'loja', cliente: drill?.cliente, loja: drill?.loja })
    } else if (level === 'produto') {
      setDrill({
        level: 'produto',
        cliente: drill?.cliente,
        loja: drill?.loja,
        produto: drill?.produto,
      })
    }
    setPage(1)
  }

  // Breadcrumb items
  const breadcrumbItems: BreadcrumbItem[] = useMemo(() => {
    const items: BreadcrumbItem[] = [{ label: 'Visão Geral', level: 'overview' }]
    if (selectedKpi) {
      const labels: Record<KpiId, string> = {
        total: 'Todas as ocorrências',
        criticos: 'Produtos Críticos (0–15 dias)',
        atencao: 'Atenção (16–25 dias)',
        moderado: 'Moderado (26–35 dias)',
        ok: 'OK (> 35 dias)',
        quantidade: 'Quantidade total',
        lojas: 'Lojas afetadas',
        clientes: 'Clientes afetados',
        exposicao: 'Exposição financeira',
      }
      items.push({ label: labels[selectedKpi], level: 'overview' })
    }
    if (drill) {
      if (drill.cliente) items.push({ label: drill.cliente, level: 'cliente' })
      if (drill.loja) items.push({ label: drill.loja, level: 'loja' })
      if (drill.produto) items.push({ label: drill.produto, level: 'produto' })
      if (drill.ocorrenciaId)
        items.push({ label: `Ocorrência ${drill.ocorrenciaId}`, level: 'ocorrencia' })
    }
    return items
  }, [drill, selectedKpi])

  // Dados ordenados
  const sortedData = useMemo(() => {
    const list = [...validades]
    if (!sortKey) return list
    list.sort((a, b) => {
      let valA: unknown = (a as unknown as Record<string, unknown>)[sortKey]
      let valB: unknown = (b as unknown as Record<string, unknown>)[sortKey]
      if (sortKey === 'validade' || sortKey === 'ultimaAtualizacao') {
        valA = new Date(valA as string).getTime()
        valB = new Date(valB as string).getTime()
      }
      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortOrder === 'asc' ? valA - valB : valB - valA
      }
      const sA = String(valA ?? '')
      const sB = String(valB ?? '')
      if (sA < sB) return sortOrder === 'asc' ? -1 : 1
      if (sA > sB) return sortOrder === 'asc' ? 1 : -1
      return 0
    })
    return list
  }, [validades, sortKey, sortOrder])

  // Paginação
  const totalPages = Math.max(1, Math.ceil(sortedData.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const paginatedData = useMemo(
    () => sortedData.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [sortedData, currentPage],
  )

  // Opções de filtro derivadas dos dados reais (não mais do mock)
  const uniqueSorted = (vals: Array<string | undefined | null>) =>
    [...new Set(vals.filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  const toOptions = (arr: string[]) => arr.map((v) => ({ label: v, value: v }))
  const filterOptions = useMemo(
    () => ({
      clientes: toOptions(uniqueSorted(validades.map((v) => v.cliente))),
      industrias: toOptions(uniqueSorted(validades.map((v) => v.industria))),
      redes: toOptions(uniqueSorted(validades.map((v) => v.rede))),
      lojas: toOptions(uniqueSorted(validades.map((v) => v.loja))),
      cidades: toOptions(uniqueSorted(validades.map((v) => v.cidade))),
      produtos: toOptions(uniqueSorted(validades.map((v) => v.product))),
      promotores: toOptions(uniqueSorted(validades.map((v) => v.promotor))),
      supervisores: toOptions(uniqueSorted(validades.map((v) => v.supervisor))),
      categorias: [
        { label: 'Mercearia', value: 'Mercearia' },
        { label: 'Laticínios', value: 'Laticínios' },
        { label: 'Bebidas', value: 'Bebidas' },
        { label: 'Limpeza', value: 'Limpeza' },
        { label: 'Higiene', value: 'Higiene' },
      ],
    }),
    [validades],
  )

  // KPI tiles
  const kpiTiles: KpiTile[] = useMemo(
    () => [
      {
        id: 'total',
        label: 'Ocorrências',
        value: fmtInt(kpis.total),
        icon: ClipboardList,
        chipClass: 'bg-slate-100 text-slate-700',
        hint: 'Total no filtro',
        active: selectedKpi === 'total',
      },
      {
        id: 'criticos',
        label: 'Críticos',
        value: fmtInt(kpis.criticos),
        icon: AlertOctagon,
        chipClass: 'bg-red-100 text-red-700',
        hint: '0 a 15 dias',
        active: selectedKpi === 'criticos',
      },
      {
        id: 'atencao',
        label: 'Atenção',
        value: fmtInt(kpis.atencao),
        icon: CalendarClock,
        chipClass: 'bg-amber-100 text-amber-800',
        hint: '16 a 25 dias',
        active: selectedKpi === 'atencao',
      },
      {
        id: 'moderado',
        label: 'Moderado',
        value: fmtInt(kpis.moderado),
        icon: CalendarClock,
        chipClass: 'bg-amber-50 text-amber-900 border border-amber-200',
        hint: '26 a 35 dias',
        active: selectedKpi === 'moderado',
      },
      {
        id: 'ok',
        label: 'OK',
        value: fmtInt(kpis.ok),
        icon: CheckCircle2,
        chipClass: 'bg-emerald-100 text-emerald-700',
        hint: '> 35 dias',
        active: selectedKpi === 'ok',
      },
      {
        id: 'quantidade',
        label: 'Qtd. total',
        value: fmtInt(kpis.quantidadeTotal),
        icon: Package,
        chipClass: 'bg-indigo-100 text-indigo-700',
        hint: 'Unidades envolvidas',
        active: selectedKpi === 'quantidade',
      },
      {
        id: 'lojas',
        label: 'Lojas afetadas',
        value: fmtInt(kpis.lojasAfetadas),
        icon: Store,
        chipClass: 'bg-blue-100 text-blue-700',
        hint: 'Lojas distintas',
        active: selectedKpi === 'lojas',
      },
      {
        id: 'clientes',
        label: 'Clientes afetados',
        value: fmtInt(kpis.clientesAfetados),
        icon: Users,
        chipClass: 'bg-purple-100 text-purple-700',
        hint: 'Clientes distintos',
        active: selectedKpi === 'clientes',
      },
      {
        id: 'exposicao',
        label: 'Exposição financeira',
        value: fmtMoney(kpis.exposicaoFinanceira),
        icon: Brain,
        chipClass: 'bg-rose-100 text-rose-700',
        hint: 'Estimativa em risco',
        active: selectedKpi === 'exposicao',
      },
    ],
    [kpis, selectedKpi],
  )

  const columns: Column<ValidadeItem>[] = useMemo(
    () => [
      {
        key: 'cliente',
        header: 'Cliente',
        className: 'min-w-[160px]',
        sortable: true,
        render: (row) => (
          <div className="min-w-0">
            <p className="font-semibold text-slate-900 leading-tight truncate">{row.cliente}</p>
            <p className="text-[11px] text-slate-400 mt-0.5 truncate">{row.rede}</p>
          </div>
        ),
      },
      {
        key: 'industria',
        header: 'Fornecedor',
        className: 'min-w-[120px] text-slate-600',
        sortable: true,
      },
      {
        key: 'loja',
        header: 'Loja',
        className: 'min-w-[160px] text-slate-600',
        sortable: true,
        render: (row) => (
          <div className="min-w-0">
            <p className="truncate">
              {row.codigoLoja ? (
                <>
                  <span className="font-mono font-bold text-indigo-700">{row.codigoLoja}</span>
                  <span className="text-slate-400"> • </span>
                </>
              ) : null}
              {row.loja}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {row.cidade}/{row.uf}
            </p>
          </div>
        ),
      },
      {
        key: 'product',
        header: 'Produto',
        className: 'min-w-[180px]',
        sortable: true,
        render: (row) => (
          <div className="min-w-0">
            <p className="font-medium text-slate-900 truncate">{row.product}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {row.category} • {row.sku}
            </p>
          </div>
        ),
      },
      {
        key: 'quantidade',
        header: 'Qtd.',
        align: 'right',
        sortable: true,
        render: (row) => (
          <span className="font-semibold text-slate-900 tabular-nums">
            {fmtInt(row.quantidade ?? row.estoque)}{' '}
            <span className="text-[10px] text-slate-400 font-normal">{row.unidade}</span>
          </span>
        ),
      },
      {
        key: 'validade',
        header: 'Validade',
        sortable: true,
        className: 'tabular-nums text-slate-700',
        render: (row) => new Date(row.validade + 'T00:00:00').toLocaleDateString('pt-BR'),
      },
      {
        key: 'diasRestantes',
        header: 'Dias rest.',
        align: 'center',
        sortable: true,
        render: (row) => {
          const nivel = classificarCriticidade(row.diasRestantes)
          return <CriticidadeBadge level={nivel} diasRestantes={row.diasRestantes} />
        },
      },
      {
        key: 'criticidade',
        header: 'Criticidade',
        align: 'center',
        sortable: true,
        render: (row) => {
          const nivel = classificarCriticidade(row.diasRestantes)
          const faixa = getCriticidadeFaixa(nivel)
          return (
            <span
              className={cn(
                'inline-flex items-center gap-1.5 text-xs font-semibold',
                faixa.textClass,
              )}
            >
              <span className={cn('w-2 h-2 rounded-full', faixa.chipClass.split(' ')[0])} />
              {faixa.label}
            </span>
          )
        },
      },
      {
        key: 'promotor',
        header: 'Promotor',
        className: 'min-w-[110px] text-slate-600',
        sortable: true,
      },
      {
        key: 'supervisor',
        header: 'Supervisor',
        className: 'min-w-[120px] text-slate-600',
        sortable: true,
      },
      {
        key: 'ultimaAtualizacao',
        header: 'Últ. atualização',
        sortable: true,
        className: 'tabular-nums text-slate-500 text-xs',
        render: (row) =>
          row.ultimaAtualizacao ? new Date(row.ultimaAtualizacao).toLocaleDateString('pt-BR') : '—',
      },
    ],
    [],
  )

  return (
    <div className="space-y-5 animate-fade-in pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h3 className="text-xl font-bold text-slate-900 tracking-tight">Gestão de Validades</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Análise e tomada de decisão sobre ocorrências de validade em todas as lojas.
          </p>
        </div>
        <Button
          onClick={() => setExportOpen(true)}
          className="h-9 gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm self-start"
        >
          <Download className="w-4 h-4" />
          <span>Exportar</span>
        </Button>
      </div>

      {/* KPIs */}
      <ValidadesKpis tiles={kpiTiles} onSelect={handleKpiSelect} isLoading={isLoading} />

      {/* Filtros */}
      <ValidadesFilters
        state={filterState}
        onChange={setFilterState}
        onApply={handleApplyFilters}
        onClear={handleClearFilters}
        options={filterOptions}
      />

      {/* Breadcrumb de drill-down */}
      {(drill || selectedKpi) && (
        <ValidadesBreadcrumb items={breadcrumbItems} onNavigate={handleBreadcrumbNavigate} />
      )}

      {/* Erro */}
      {error && (
        <AlertBanner
          type="error"
          title="Erro ao carregar dados de validades"
          message={error.message || 'Falha na comunicação com o provedor de dados.'}
          onRetry={refetch}
        />
      )}

      {/* Tabela */}
      {!error && (
        <>
          {sortedData.length === 0 && !isLoading ? (
            <EmptyState
              title="Nenhuma validade encontrada para os filtros aplicados."
              description="Ajuste a busca, os filtros ou o drill-down para visualizar ocorrências."
              actionLabel="Limpar filtros"
              onAction={handleClearFilters}
            />
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>
                  {sortedData.length} ocorrência(ões){drill ? ` no nível ${drill.level}` : ''}
                  {selectedKpi && ' • KPI selecionado'}
                </span>
                <span>
                  Página {currentPage} de {totalPages}
                </span>
              </div>
              <DataTable
                columns={columns}
                data={paginatedData}
                isLoading={isLoading}
                sortKey={sortKey}
                sortOrder={sortOrder}
                onSort={handleSort}
                onRowClick={handleRowClick}
                emptyMessage="Nenhuma validade encontrada."
              />
              {/* Paginação custom */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between gap-2 pt-1">
                  <span className="text-xs text-slate-500">
                    Mostrando {(currentPage - 1) * PAGE_SIZE + 1}–
                    {Math.min(currentPage * PAGE_SIZE, sortedData.length)} de {sortedData.length}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={currentPage <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className="h-8 gap-1"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      Anterior
                    </Button>
                    <span className="text-xs font-medium text-slate-600 px-2">
                      {currentPage} / {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={currentPage >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      className="h-8 gap-1"
                    >
                      Próxima
                      <ChevronRight className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Inteligência */}
      <section className="space-y-3 pt-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center">
            <Brain className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 tracking-tight">Inteligência</h3>
            <p className="text-xs text-slate-500">
              Blocos analíticos que reagem aos filtros aplicados.
            </p>
          </div>
        </div>
        <ValidadesIntelligence items={sortedData} isLoading={isLoading} />
      </section>

      {/* Modais */}
      <ExportModal isOpen={exportOpen} onClose={() => setExportOpen(false)} items={sortedData} />
      <OccurrenceDetailModal
        isOpen={detailOpen}
        onClose={() => setDetailOpen(false)}
        item={detailItem}
        onDrill={drillInto}
      />
    </div>
  )
}
