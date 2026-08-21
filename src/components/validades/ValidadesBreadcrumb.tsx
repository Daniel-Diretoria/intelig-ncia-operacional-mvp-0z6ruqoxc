import React from 'react'
import { ChevronRight, Home } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ValidadeDrill } from '@/types'

export interface BreadcrumbItem {
  label: string
  level: ValidadeDrill['level']
}

interface ValidadesBreadcrumbProps {
  items: BreadcrumbItem[]
  onNavigate: (level: ValidadeDrill['level']) => void
}

/**
 * Breadcrumb de drill-down da hierarquia:
 * Visão Geral › Cliente › Loja › Produto › Ocorrência
 */
export const ValidadesBreadcrumb: React.FC<ValidadesBreadcrumbProps> = ({ items, onNavigate }) => {
  if (items.length === 0) return null
  return (
    <nav
      aria-label="Drill-down de validades"
      className="flex items-center flex-wrap gap-1 text-sm bg-white rounded-xl border border-slate-200 px-3.5 py-2.5 shadow-xs"
    >
      {items.map((item, idx) => {
        const isLast = idx === items.length - 1
        const isFirst = idx === 0
        return (
          <span key={`${item.level}-${idx}`} className="inline-flex items-center gap-1">
            <button
              type="button"
              onClick={() => !isLast && onNavigate(item.level)}
              disabled={isLast}
              className={cn(
                'inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded-md text-[13px] font-medium transition-colors',
                isLast
                  ? 'text-slate-900 font-semibold cursor-default'
                  : 'text-slate-500 hover:text-indigo-700 hover:bg-indigo-50',
              )}
            >
              {isFirst && <Home className="w-3.5 h-3.5" />}
              <span className="max-w-[280px] truncate">{item.label}</span>
            </button>
            {!isLast && <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />}
          </span>
        )
      })}
    </nav>
  )
}
