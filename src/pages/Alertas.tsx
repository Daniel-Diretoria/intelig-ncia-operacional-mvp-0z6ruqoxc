import React, { useState, useMemo, useEffect } from 'react'
import { useAlertas, useValidades, useRupturas } from '@/services'
import type { AlertasFilter } from '@/types'
import { Info } from 'lucide-react'
import { FilterBar, type FilterField } from '@/components/ui/filter-bar'
import { StatusBadge } from '@/components/ui/status-badge'
import { AlertBanner } from '@/components/ui/alert-banner'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Bell,
  CheckCheck,
  Check,
  AlertTriangle,
  Clock,
  Tag,
  Package,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'

const PAGE_SIZE = 25

export const AlertasPage: React.FC = () => {
  const [search, setSearch] = useState('')
  const [severity, setSeverity] = useState('Todos')
  const [type, setType] = useState('Todos')
  const [currentPage, setCurrentPage] = useState(1)

  const [appliedFilters, setAppliedFilters] = useState<AlertasFilter>({})

  const {
    data: alertas,
    isLoading,
    error,
    refetch,
    toggleRead,
    markAllAsRead,
  } = useAlertas(appliedFilters)

  const { data: validades } = useValidades()
  const { filteredRupturas: rupturas } = useRupturas()

  // Header refresh sync
  useEffect(() => {
    const handleGlobalRefresh = () => refetch()
    window.addEventListener('diretoria:refresh', handleGlobalRefresh)
    return () => window.removeEventListener('diretoria:refresh', handleGlobalRefresh)
  }, [refetch])

  const handleApply = () => {
    setCurrentPage(1)
    setAppliedFilters({
      search: search.trim() || undefined,
      severity: severity !== 'Todos' ? severity : undefined,
      type: type !== 'Todos' ? type : undefined,
    })
  }

  const handleClear = () => {
    setSearch('')
    setSeverity('Todos')
    setType('Todos')
    setCurrentPage(1)
    setAppliedFilters({})
  }

  const unreadCount = useMemo(() => {
    return alertas.filter((a) => !a.isRead).length
  }, [alertas])

  const totalItems = alertas.length
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE))

  // Ajusta página atual se ultrapassar totalPages
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  const paginatedAlertas = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE
    return alertas.slice(start, start + PAGE_SIZE)
  }, [alertas, currentPage])

  const startRange = totalItems === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1
  const endRange = Math.min(currentPage * PAGE_SIZE, totalItems)

  const filterFields: FilterField[] = [
    {
      id: 'severity',
      type: 'select',
      placeholder: 'Todas as Severidades',
      value: severity,
      onChange: setSeverity,
      options: [
        { label: 'Crítico', value: 'Crítico' },
        { label: 'Alto', value: 'Alto' },
        { label: 'Médio', value: 'Médio' },
      ],
    },
    {
      id: 'type',
      type: 'select',
      placeholder: 'Todos os Tipos',
      value: type,
      onChange: setType,
      options: [
        { label: 'Validade', value: 'Validade' },
        { label: 'Ruptura', value: 'Ruptura' },
      ],
    },
  ]

  const getRelativeTime = (timestamp: string) => {
    if (!timestamp) return 'hoje'
    const date = new Date(timestamp)
    if (isNaN(date.getTime())) return 'hoje'
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    if (diffMs < 0) return 'hoje'

    const diffMinutes = Math.floor(diffMs / (1000 * 60))
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffMinutes < 1) return 'agora mesmo'
    if (diffMinutes < 60) return `há ${diffMinutes} min`
    if (diffHours < 24) return `há ${diffHours} ${diffHours === 1 ? 'hora' : 'horas'}`
    if (diffDays === 1) return 'há 1 dia'
    return `há ${diffDays} dias`
  }

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Header Premium */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 shrink-0">
            <Bell className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                Central de Alertas
              </h1>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                Notificações Inteligentes
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Feed operacional de notificações e alertas prioritários gerados em tempo real na base.
            </p>
          </div>
        </div>

        {/* Unread Action Bar */}
        <div className="flex items-center gap-2.5 self-start sm:self-center">
          <div className="text-xs font-semibold px-3 py-2 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-100 flex items-center gap-1.5">
            <Bell className="w-3.5 h-3.5 text-indigo-600" />
            <span>
              {unreadCount} {unreadCount === 1 ? 'alerta não lido' : 'alertas não lidos'}
            </span>
          </div>

          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={markAllAsRead}
              className="h-10 text-xs px-3.5 gap-1.5 border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl font-medium"
            >
              <CheckCheck className="w-3.5 h-3.5 text-slate-600" />
              <span>Marcar todos como lidos</span>
            </Button>
          )}
        </div>
      </div>

      {/* Filter Bar */}
      <FilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar por título, produto ou SKU..."
        fields={filterFields}
        onApply={handleApply}
        onClear={handleClear}
      />

      {/* Error state */}
      {error && (
        <AlertBanner
          type="error"
          title="Erro ao carregar alertas"
          message={error.message || 'Falha ao buscar notificações operacionais.'}
          onRetry={refetch}
        />
      )}

      {/* Banner Informativo de Reconstrução da Base */}
      {validades.length === 0 && rupturas.length === 0 && !isLoading && (
        <div className="p-4 bg-amber-50/80 border border-amber-300 rounded-2xl flex items-start gap-3 text-amber-900">
          <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs">
            <span className="font-bold text-amber-950 block">
              Base operacional em reconstrução — nenhum falso alerta gerado
            </span>
            <p className="text-amber-800 leading-relaxed">
              A base operacional de Validades e Rupturas está vazia para preparação do piloto
              histórico. O sistema não gerará alertas críticos indevidos até que uma nova
              importação/sincronização de período seja concluída.
            </p>
          </div>
        </div>
      )}

      {/* Alert Cards Feed */}
      {!error && (
        <div className="space-y-4">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="p-4 bg-white rounded-xl border border-slate-200">
                  <div className="flex items-start gap-3">
                    <Skeleton className="w-8 h-8 rounded-lg" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-48" />
                      <Skeleton className="h-3 w-full" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : alertas.length === 0 ? (
            <EmptyState
              title="Nenhum alerta encontrado"
              description="Não foram encontradas notificações para os filtros selecionados."
              actionLabel="Limpar filtros"
              onAction={handleClear}
            />
          ) : (
            <>
              {/* Info e Paginação Top/Bottom */}
              <div className="flex items-center justify-between text-xs text-slate-500 px-1">
                <div>
                  Mostrando{' '}
                  <strong className="text-slate-700">
                    {startRange}–{endRange}
                  </strong>{' '}
                  de <strong className="text-slate-700">{totalItems}</strong> alertas
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="h-7 px-2 text-xs gap-1"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    Anterior
                  </Button>
                  <span className="font-medium text-slate-700">
                    Página {currentPage} de {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="h-7 px-2 text-xs gap-1"
                  >
                    Próxima
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                {paginatedAlertas.map((alerta) => {
                  const isCrit = alerta.severity === 'Crítico'
                  const isHigh = alerta.severity === 'Alto'
                  const isRead = alerta.isRead

                  const borderAccentColor = isCrit
                    ? 'border-l-red-500'
                    : isHigh
                      ? 'border-l-orange-500'
                      : 'border-l-amber-500'

                  return (
                    <div
                      key={alerta.id}
                      className={`bg-white rounded-2xl border border-slate-200/80 border-l-4 ${borderAccentColor} p-4 sm:p-5 shadow-xs transition-all duration-200 ${
                        isRead
                          ? 'opacity-65 bg-slate-50/40'
                          : 'hover:shadow-sm hover:border-slate-300'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                        <div className="flex items-start gap-3.5 flex-1">
                          {/* Icon */}
                          <div
                            className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                              isCrit
                                ? 'bg-red-100 text-red-700'
                                : isHigh
                                  ? 'bg-orange-100 text-orange-700'
                                  : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            <AlertTriangle className="w-4 h-4" />
                          </div>

                          <div className="flex-1 space-y-1">
                            {/* Title & Badges */}
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4
                                className={`text-sm font-bold tracking-tight ${
                                  isRead ? 'text-slate-600 line-through-none' : 'text-slate-900'
                                }`}
                              >
                                {alerta.title}
                              </h4>
                              <StatusBadge
                                variant={
                                  alerta.severity === 'Crítico'
                                    ? 'critico'
                                    : alerta.severity === 'Alto'
                                      ? 'alto'
                                      : 'medio'
                                }
                              >
                                {alerta.severity}
                              </StatusBadge>
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium text-[11px]">
                                <Tag className="w-3 h-3 text-slate-400" />
                                {alerta.type}
                              </span>
                            </div>

                            {/* Description */}
                            <p className="text-[13px] text-slate-600 leading-relaxed">
                              {alerta.message}
                            </p>

                            {/* Context info (Product / SKU / Category) */}
                            {alerta.product && (
                              <div className="flex items-center gap-3 pt-1 text-xs text-slate-500">
                                <span className="inline-flex items-center gap-1 font-medium text-slate-700">
                                  <Package className="w-3.5 h-3.5 text-slate-400" />
                                  {alerta.product}
                                </span>
                                {alerta.sku && (
                                  <span className="font-mono text-[11px] text-slate-400">
                                    SKU: {alerta.sku}
                                  </span>
                                )}
                                {alerta.category && (
                                  <span className="text-slate-400">• {alerta.category}</span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Actions & Relative timestamp */}
                        <div className="flex items-center sm:flex-col sm:items-end justify-between sm:justify-start gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                          <div className="flex items-center gap-1 text-[11px] text-slate-400 font-medium">
                            <Clock className="w-3 h-3" />
                            <span>{getRelativeTime(alerta.timestamp)}</span>
                          </div>

                          <Button
                            variant={isRead ? 'ghost' : 'outline'}
                            size="sm"
                            onClick={() => toggleRead(alerta.id)}
                            className={`h-7 px-2.5 text-xs font-medium gap-1.5 transition-all ${
                              isRead
                                ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                                : 'border-slate-300 text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200'
                            }`}
                          >
                            <Check className="w-3 h-3" />
                            <span>{isRead ? 'Lido' : 'Marcar como lido'}</span>
                          </Button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Paginação Bottom */}
              {totalPages > 1 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 bg-white rounded-xl border border-slate-200/80 shadow-2xs text-xs text-slate-600">
                  <div>
                    Página <strong className="text-slate-900">{currentPage}</strong> de{' '}
                    <strong className="text-slate-900">{totalPages}</strong> ({totalItems} alertas
                    no total)
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={currentPage <= 1}
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      className="h-8 px-2.5 text-xs gap-1 border-slate-200 rounded-lg hover:bg-slate-50"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      <span>Anterior</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={currentPage >= totalPages}
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      className="h-8 px-2.5 text-xs gap-1 border-slate-200 rounded-lg hover:bg-slate-50"
                    >
                      <span>Próxima</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
