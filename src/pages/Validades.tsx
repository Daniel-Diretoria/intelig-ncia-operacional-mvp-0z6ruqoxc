import React, { useState, useMemo, useEffect } from 'react'
import { useValidades } from '@/services'
import type { ValidadeItem, ValidadesFilter } from '@/types'
import { DataTable, type Column } from '@/components/ui/data-table'
import { FilterBar, type FilterField } from '@/components/ui/filter-bar'
import { StatusBadge } from '@/components/ui/status-badge'
import { AlertBanner } from '@/components/ui/alert-banner'
import { EmptyState } from '@/components/ui/empty-state'
import { CalendarClock, AlertOctagon, CheckCircle2 } from 'lucide-react'

export const ValidadesPage: React.FC = () => {
  // Filters state
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('Todos')
  const [status, setStatus] = useState('Todos')

  // Applied filters state passed to hook
  const [appliedFilters, setAppliedFilters] = useState<ValidadesFilter>({})

  // Sorting
  const [sortKey, setSortKey] = useState<string>('diasRestantes')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

  const { data: validades, isLoading, error, refetch } = useValidades(appliedFilters)

  // Listen to global header refresh
  useEffect(() => {
    const handleGlobalRefresh = () => refetch()
    window.addEventListener('diretoria:refresh', handleGlobalRefresh)
    return () => window.removeEventListener('diretoria:refresh', handleGlobalRefresh)
  }, [refetch])

  const handleApplyFilters = () => {
    setAppliedFilters({
      search: search.trim() || undefined,
      category: category !== 'Todos' ? category : undefined,
      status: status !== 'Todos' ? status : undefined,
    })
  }

  const handleClearFilters = () => {
    setSearch('')
    setCategory('Todos')
    setStatus('Todos')
    setAppliedFilters({})
  }

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortOrder('asc')
    }
  }

  // Derived mini KPI counts from current data
  const miniKpis = useMemo(() => {
    const critico = validades.filter((v) => v.status === 'Crítico').length
    const proximo = validades.filter((v) => v.status === 'Próximo').length
    const ok = validades.filter((v) => v.status === 'OK').length
    return { critico, proximo, ok, total: validades.length }
  }, [validades])

  // Sorted data
  const sortedData = useMemo(() => {
    const list = [...validades]
    if (!sortKey) return list

    list.sort((a, b) => {
      let valA: any = a[sortKey as keyof ValidadeItem]
      let valB: any = b[sortKey as keyof ValidadeItem]

      if (sortKey === 'validade') {
        valA = new Date(valA).getTime()
        valB = new Date(valB).getTime()
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1
      return 0
    })

    return list
  }, [validades, sortKey, sortOrder])

  const filterFields: FilterField[] = [
    {
      id: 'category',
      type: 'select',
      placeholder: 'Todas as Categorias',
      value: category,
      onChange: setCategory,
      options: [
        { label: 'Mercearia', value: 'Mercearia' },
        { label: 'Laticínios', value: 'Laticínios' },
        { label: 'Bebidas', value: 'Bebidas' },
        { label: 'Limpeza', value: 'Limpeza' },
        { label: 'Higiene', value: 'Higiene' },
      ],
    },
    {
      id: 'status',
      type: 'select',
      placeholder: 'Todos os Status',
      value: status,
      onChange: setStatus,
      options: [
        { label: 'Crítico (< 15 dias)', value: 'Crítico' },
        { label: 'Próximo (15 a 30 dias)', value: 'Próximo' },
        { label: 'OK (> 30 dias)', value: 'OK' },
      ],
    },
  ]

  const columns: Column<ValidadeItem>[] = [
    {
      key: 'product',
      header: 'Produto',
      className: 'min-w-[200px]',
      render: (row) => (
        <div>
          <p className="font-semibold text-slate-900 leading-tight">{row.product}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">{row.category}</p>
        </div>
      ),
    },
    {
      key: 'sku',
      header: 'SKU',
      className: 'text-slate-600 font-mono text-xs',
    },
    {
      key: 'lote',
      header: 'Lote',
      className: 'font-mono text-xs text-slate-600',
    },
    {
      key: 'validade',
      header: 'Validade',
      sortable: true,
      className: 'tabular-nums text-slate-800',
      render: (row) => new Date(row.validade).toLocaleDateString('pt-BR'),
    },
    {
      key: 'diasRestantes',
      header: 'Dias Restantes',
      sortable: true,
      align: 'center',
      render: (row) => {
        const d = row.diasRestantes
        let badgeVariant: 'critico' | 'proximo' | 'ok' = 'ok'
        if (d < 15) badgeVariant = 'critico'
        else if (d <= 30) badgeVariant = 'proximo'

        return (
          <StatusBadge variant={badgeVariant}>
            {d} {d === 1 ? 'dia' : 'dias'}
          </StatusBadge>
        )
      },
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      render: (row) => (
        <StatusBadge
          variant={
            row.status === 'Crítico' ? 'critico' : row.status === 'Próximo' ? 'proximo' : 'ok'
          }
        >
          {row.status}
        </StatusBadge>
      ),
    },
    {
      key: 'estoque',
      header: 'Estoque',
      align: 'right',
      render: (row) => (
        <span className="font-semibold text-slate-900">
          {row.estoque} <span className="text-xs text-slate-400 font-normal">{row.unidade}</span>
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-5 animate-fade-in pb-10">
      {/* Page Header Intro */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h3 className="text-xl font-bold text-slate-900 tracking-tight">Gestão de Validades</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Monitoramento de lotes e prevenção de perdas por expiração de produtos.
          </p>
        </div>
      </div>

      {/* Mini KPIs Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-red-100 text-red-700 flex items-center justify-center shrink-0">
            <AlertOctagon className="w-4 h-4" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Crítico
            </p>
            <p className="text-lg font-bold text-red-600 tabular-nums">{miniKpis.critico}</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
            <CalendarClock className="w-4 h-4" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Próximo
            </p>
            <p className="text-lg font-bold text-amber-700 tabular-nums">{miniKpis.proximo}</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">OK</p>
            <p className="text-lg font-bold text-emerald-700 tabular-nums">{miniKpis.ok}</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center shrink-0 font-bold text-xs">
            SKU
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Total Lotes
            </p>
            <p className="text-lg font-bold text-slate-900 tabular-nums">{miniKpis.total}</p>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <FilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar por produto, SKU ou lote..."
        fields={filterFields}
        onApply={handleApplyFilters}
        onClear={handleClearFilters}
      />

      {/* Error state */}
      {error && (
        <AlertBanner
          type="error"
          title="Erro ao carregar dados de validades"
          message={error.message || 'Falha na comunicação com o provedor de dados.'}
          onRetry={refetch}
        />
      )}

      {/* Data Table */}
      {!error && (
        <>
          {sortedData.length === 0 && !isLoading ? (
            <EmptyState
              title="Nenhuma validade encontrada para os filtros aplicados."
              description="Tente ajustar a busca por nome, SKU ou limpar os filtros de categoria e status."
              actionLabel="Limpar filtros"
              onAction={handleClearFilters}
            />
          ) : (
            <DataTable
              columns={columns}
              data={sortedData}
              isLoading={isLoading}
              sortKey={sortKey}
              sortOrder={sortOrder}
              onSort={handleSort}
              emptyMessage="Nenhuma validade encontrada."
            />
          )}
        </>
      )}
    </div>
  )
}
