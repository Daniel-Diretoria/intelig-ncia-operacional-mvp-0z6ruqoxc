import React, { useState, useMemo, useEffect } from 'react'
import { useRupturas } from '@/services'
import type { RupturaItem, RupturasFilter } from '@/types'
import { DataTable, type Column } from '@/components/ui/data-table'
import { FilterBar, type FilterField } from '@/components/ui/filter-bar'
import { StatusBadge } from '@/components/ui/status-badge'
import { AlertBanner } from '@/components/ui/alert-banner'
import { EmptyState } from '@/components/ui/empty-state'
import { PackageX, AlertTriangle, Truck, Layers } from 'lucide-react'

export const RupturasPage: React.FC = () => {
  // Filter state
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('Todos')
  const [status, setStatus] = useState('Todos')

  const [appliedFilters, setAppliedFilters] = useState<RupturasFilter>({})

  // Sorting
  const [sortKey, setSortKey] = useState<string>('diasSemEstoque')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  const { data: rupturas, isLoading, error, refetch } = useRupturas(appliedFilters)

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
      setSortOrder('desc')
    }
  }

  // Derived mini KPI counts
  const miniKpis = useMemo(() => {
    const emRuptura = rupturas.filter((r) => r.status === 'Em Ruptura').length
    const critico = rupturas.filter((r) => r.status === 'Crítico').length
    const reposicaoPrevista = rupturas.filter((r) => r.status === 'Reposição Prevista').length
    return { emRuptura, critico, reposicaoPrevista, total: rupturas.length }
  }, [rupturas])

  // Sorted list
  const sortedData = useMemo(() => {
    const list = [...rupturas]
    if (!sortKey) return list

    list.sort((a, b) => {
      const valA: any = a[sortKey as keyof RupturaItem]
      const valB: any = b[sortKey as keyof RupturaItem]

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1
      return 0
    })

    return list
  }, [rupturas, sortKey, sortOrder])

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
        { label: 'Em Ruptura', value: 'Em Ruptura' },
        { label: 'Crítico (> 5 dias)', value: 'Crítico' },
        { label: 'Reposição Prevista', value: 'Reposição Prevista' },
      ],
    },
  ]

  const columns: Column<RupturaItem>[] = [
    {
      key: 'product',
      header: 'Produto',
      className: 'min-w-[220px]',
      render: (row) => (
        <div>
          <p className="font-semibold text-slate-900 leading-tight">{row.product}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Fornecedor: {row.supplier || 'Não informado'}
          </p>
        </div>
      ),
    },
    {
      key: 'sku',
      header: 'SKU',
      className: 'text-slate-600 font-mono text-xs',
    },
    {
      key: 'category',
      header: 'Categoria',
      className: 'text-slate-700',
    },
    {
      key: 'diasSemEstoque',
      header: 'Dias Sem Estoque',
      sortable: true,
      align: 'center',
      render: (row) => {
        const d = row.diasSemEstoque
        const isCrit = d >= 5
        return (
          <StatusBadge variant={isCrit ? 'critico' : 'warning'}>
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
            row.status === 'Crítico'
              ? 'critico'
              : row.status === 'Em Ruptura'
                ? 'em-ruptura'
                : 'reposicao-prevista'
          }
        >
          {row.status}
        </StatusBadge>
      ),
    },
    {
      key: 'reposicaoPrevista',
      header: 'Reposição Prevista',
      className: 'tabular-nums text-slate-700',
      render: (row) =>
        row.reposicaoPrevista ? (
          <span className="font-medium text-slate-900">
            {new Date(row.reposicaoPrevista).toLocaleDateString('pt-BR')}
          </span>
        ) : (
          <span className="text-slate-400 font-normal">—</span>
        ),
    },
  ]

  return (
    <div className="space-y-5 animate-fade-in pb-10">
      {/* Header Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h3 className="text-xl font-bold text-slate-900 tracking-tight">Gestão de Rupturas</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Controle de desabastecimento em gôndola e previsão de reposição logística.
          </p>
        </div>
      </div>

      {/* Mini KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-red-100 text-red-700 flex items-center justify-center shrink-0">
            <PackageX className="w-4 h-4" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Em Ruptura
            </p>
            <p className="text-lg font-bold text-red-600 tabular-nums">{miniKpis.emRuptura}</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Crítico (&gt; 5d)
            </p>
            <p className="text-lg font-bold text-amber-700 tabular-nums">{miniKpis.critico}</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
            <Truck className="w-4 h-4" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Reposição Prevista
            </p>
            <p className="text-lg font-bold text-blue-700 tabular-nums">
              {miniKpis.reposicaoPrevista}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Total Ativos
            </p>
            <p className="text-lg font-bold text-slate-900 tabular-nums">{miniKpis.total}</p>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <FilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar por produto, SKU ou fornecedor..."
        fields={filterFields}
        onApply={handleApplyFilters}
        onClear={handleClearFilters}
      />

      {/* Error State */}
      {error && (
        <AlertBanner
          type="error"
          title="Erro ao carregar dados de rupturas"
          message={error.message || 'Falha na comunicação com o provedor de dados.'}
          onRetry={refetch}
        />
      )}

      {/* Data Table */}
      {!error && (
        <>
          {sortedData.length === 0 && !isLoading ? (
            <EmptyState
              title="Nenhuma ruptura encontrada para os filtros aplicados."
              description="Ajuste os parâmetros de busca ou limpe os filtros para visualizar a listagem completa."
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
              emptyMessage="Nenhuma ruptura encontrada."
            />
          )}
        </>
      )}
    </div>
  )
}
