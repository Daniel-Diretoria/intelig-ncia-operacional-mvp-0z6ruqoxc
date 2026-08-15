import React from 'react'
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

export interface KpiTile {
  id: string
  label: string
  value: string | number
  hint?: string
  icon: LucideIcon
  /** classes do chip (fundo+texto) */
  chipClass: string
  /** cor de texto do ícone dentro do chip */
  active?: boolean
}

interface ValidadesKpisProps {
  tiles: KpiTile[]
  onSelect?: (id: string) => void
  isLoading?: boolean
}

/**
 * Grade de mini-KPIs clicáveis da tela de Validades.
 * Clicar em um KPI aplica o drill/filtro correspondente.
 */
export const ValidadesKpis: React.FC<ValidadesKpisProps> = ({ tiles, onSelect, isLoading }) => {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {Array.from({ length: tiles.length || 6 }).map((_, i) => (
          <div
            key={i}
            className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-xs animate-pulse h-[84px]"
          />
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {tiles.map((tile) => {
        const Icon = tile.icon
        return (
          <button
            key={tile.id}
            type="button"
            onClick={() => onSelect?.(tile.id)}
            className={cn(
              'group text-left bg-white rounded-xl border p-3.5 shadow-xs transition-all duration-200',
              'hover:shadow-md hover:-translate-y-0.5',
              tile.active
                ? 'border-indigo-300 ring-1 ring-indigo-200 bg-indigo-50/40'
                : 'border-slate-200',
            )}
          >
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider leading-tight">
                {tile.label}
              </p>
              <div
                className={cn(
                  'w-7 h-7 rounded-lg flex items-center justify-center shrink-0',
                  tile.chipClass,
                )}
              >
                <Icon className="w-3.5 h-3.5" />
              </div>
            </div>
            <p className="text-xl font-bold text-slate-900 tabular-nums leading-tight">
              {tile.value}
            </p>
            {tile.hint && <p className="text-[11px] text-slate-400 mt-0.5 truncate">{tile.hint}</p>}
          </button>
        )
      })}
    </div>
  )
}
