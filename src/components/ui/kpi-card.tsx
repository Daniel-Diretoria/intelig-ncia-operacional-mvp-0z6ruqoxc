import React from 'react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import type { LucideIcon } from 'lucide-react'

export interface KpiCardProps {
  label: string
  value: string | number
  icon: LucideIcon
  delta?: string
  trend?: 'up' | 'down' | 'neutral'
  accent?: 'danger' | 'warning' | 'info' | 'primary' | 'success' | 'neutral'
  isLoading?: boolean
  className?: string
  onClick?: () => void
}

const accentMap = {
  danger: {
    bg: 'bg-red-50 text-red-600 border-red-100',
    chip: 'bg-red-100 text-red-700',
    indicator: 'text-red-600',
  },
  warning: {
    bg: 'bg-amber-50 text-amber-600 border-amber-100',
    chip: 'bg-amber-100 text-amber-700',
    indicator: 'text-amber-600',
  },
  info: {
    bg: 'bg-blue-50 text-blue-600 border-blue-100',
    chip: 'bg-blue-100 text-blue-700',
    indicator: 'text-blue-600',
  },
  primary: {
    bg: 'bg-indigo-50 text-indigo-600 border-indigo-100',
    chip: 'bg-indigo-100 text-indigo-700',
    indicator: 'text-indigo-600',
  },
  success: {
    bg: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    chip: 'bg-emerald-100 text-emerald-700',
    indicator: 'text-emerald-600',
  },
  neutral: {
    bg: 'bg-slate-50 text-slate-600 border-slate-200',
    chip: 'bg-slate-100 text-slate-700',
    indicator: 'text-slate-600',
  },
}

export const KpiCard: React.FC<KpiCardProps> = ({
  label,
  value,
  icon: Icon,
  delta,
  accent = 'primary',
  isLoading = false,
  className,
  onClick,
}) => {
  const styles = accentMap[accent]

  if (isLoading) {
    return (
      <div className={cn('bg-white rounded-xl border border-slate-200 p-5 shadow-sm', className)}>
        <div className="flex items-center justify-between mb-3">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-10 w-10 rounded-lg" />
        </div>
        <Skeleton className="h-8 w-20 mb-2" />
        <Skeleton className="h-3 w-32" />
      </div>
    )
  }

  return (
    <div
      onClick={onClick}
      className={cn(
        'bg-white rounded-xl border border-slate-200 p-5 shadow-sm transition-all duration-200',
        onClick && 'cursor-pointer hover:shadow-md hover:-translate-y-0.5',
        className,
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[13px] font-medium text-slate-500 tracking-tight">{label}</p>
          <p className="mt-1 text-2xl lg:text-3xl font-bold text-slate-900 tracking-tight tabular-nums">
            {value}
          </p>
        </div>
        <div
          className={cn(
            'flex items-center justify-center w-10 h-10 rounded-lg shrink-0',
            styles.chip,
          )}
        >
          <Icon className="w-5 h-5" />
        </div>
      </div>
      {delta && (
        <div className="mt-3 flex items-center text-xs text-slate-500 font-medium">
          <span className={cn('font-semibold mr-1.5', styles.indicator)}>●</span>
          <span>{delta}</span>
        </div>
      )}
    </div>
  )
}
