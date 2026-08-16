import React, { useState, useMemo, useEffect } from 'react'
import { useAlertas } from '@/services'
import type { AlertaItem, AlertasFilter } from '@/types'
import { FilterBar, type FilterField } from '@/components/ui/filter-bar'
import { StatusBadge } from '@/components/ui/status-badge'
import { AlertBanner } from '@/components/ui/alert-banner'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Bell, CheckCheck, Check, AlertTriangle, Clock, Tag, Package } from 'lucide-react'

export const AlertasPage: React.FC = () => {
  const [search, setSearch] = useState('')
  const [severity, setSeverity] = useState('Todos')
  const [type, setType] = useState('Todos')

  const [appliedFilters, setAppliedFilters] = useState<AlertasFilter>({})

  const {
    data: alertas,
    isLoading,
    error,
    refetch,
    toggleRead,
    markAllAsRead,
  } = useAlertas(appliedFilters)

  // Header refresh sync
  useEffect(() => {
    const handleGlobalRefresh = () => refetch()
    window.addEventListener('diretoria:refresh', handleGlobalRefresh)
    return () => window.removeEventListener('diretoria:refresh', handleGlobalRefresh)
  }, [refetch])

  const handleApply = () => {
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
    setAppliedFilters({})
  }

  const unreadCount = useMemo(() => {
    return alertas.filter((a) => !a.isRead).length
  }, [alertas])

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
    <div className="space-y-5 animate-fade-in pb-10">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-bold text-slate-900 tracking-tight">Central de Alertas</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Feed operacional de notificações e alertas em tempo real.
          </p>
        </div>

        {/* Unread Action Bar */}
        <div className="flex items-center gap-3">
          <div className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-100 flex items-center gap-1.5">
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
              className="h-8 text-xs gap-1.5 border-slate-300 text-slate-700 hover:bg-slate-50 shadow-2xs font-medium"
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

      {/* Alert Cards Feed */}
      {!error && (
        <div className="space-y-3">
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
            alertas.map((alerta) => {
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
                  className={`bg-white rounded-xl border border-slate-200 border-l-4 ${borderAccentColor} p-4 sm:p-5 shadow-xs transition-all duration-200 ${
                    isRead ? 'opacity-65 bg-slate-50/50' : 'hover:shadow-sm'
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
            })
          )}
        </div>
      )}
    </div>
  )
}
