import React from 'react'
import { cn } from '@/lib/utils'

export type StatusBadgeVariant =
  | 'vencido'
  | 'critico'
  | 'proximo'
  | 'ok'
  | 'em-ruptura'
  | 'reposicao-prevista'
  | 'alto'
  | 'medio'
  | 'danger'
  | 'warning'
  | 'success'
  | 'info'
  | 'neutral'

interface StatusBadgeProps {
  status?: string
  variant?: StatusBadgeVariant
  className?: string
  children?: React.ReactNode
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  variant,
  className,
  children,
}) => {
  const text = children || status || ''

  // Determine variant from text if not passed
  let resolvedVariant = variant
  if (!resolvedVariant && typeof text === 'string') {
    const s = text.toLowerCase().trim()
    if (s === 'vencido') resolvedVariant = 'vencido'
    else if (s === 'crítico' || s === 'critico') resolvedVariant = 'critico'
    else if (
      s === 'próximo' ||
      s === 'proximo' ||
      s === 'atenção' ||
      s === 'atencao' ||
      s === 'moderado'
    )
      resolvedVariant = 'proximo'
    else if (s === 'normal' || s === 'ok' || s === 'regular') resolvedVariant = 'ok'
    else if (s === 'em ruptura' || s === 'ruptura') resolvedVariant = 'em-ruptura'
    else if (s.includes('reposição') || s.includes('reposicao'))
      resolvedVariant = 'reposicao-prevista'
    else if (s === 'alto') resolvedVariant = 'alto'
    else if (s === 'médio' || s === 'medio') resolvedVariant = 'medio'
    else resolvedVariant = 'neutral'
  }

  const stylesByVariant: Record<StatusBadgeVariant, string> = {
    vencido: 'bg-rose-50 text-rose-800 border-rose-200/60 ring-rose-500/10',
    critico: 'bg-red-50 text-red-700 border-red-200/60 ring-red-500/10',
    danger: 'bg-red-50 text-red-700 border-red-200/60 ring-red-500/10',
    proximo: 'bg-amber-50 text-amber-800 border-amber-200/60 ring-amber-500/10',
    warning: 'bg-amber-50 text-amber-800 border-amber-200/60 ring-amber-500/10',
    ok: 'bg-emerald-50 text-emerald-700 border-emerald-200/60 ring-emerald-500/10',
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200/60 ring-emerald-500/10',
    'em-ruptura': 'bg-red-50 text-red-700 border-red-200/60 ring-red-500/10',
    'reposicao-prevista': 'bg-blue-50 text-blue-700 border-blue-200/60 ring-blue-500/10',
    alto: 'bg-orange-50 text-orange-700 border-orange-200/60 ring-orange-500/10',
    medio: 'bg-amber-50 text-amber-800 border-amber-200/60 ring-amber-500/10',
    info: 'bg-blue-50 text-blue-700 border-blue-200/60 ring-blue-500/10',
    neutral: 'bg-slate-100 text-slate-700 border-slate-200 ring-slate-500/10',
  }

  const currentStyle = stylesByVariant[resolvedVariant || 'neutral']

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border tracking-wide',
        currentStyle,
        className,
      )}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-75" />
      {text}
    </span>
  )
}
