import React from 'react'
import { cn } from '@/lib/utils'
import { Search, RotateCcw, Filter } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export interface FilterOption {
  label: string
  value: string
}

export interface FilterField {
  id: string
  label?: string
  placeholder?: string
  type: 'text' | 'select'
  options?: FilterOption[]
  value: string
  onChange: (value: string) => void
}

interface FilterBarProps {
  fields: FilterField[]
  onApply?: () => void
  onClear?: () => void
  className?: string
  searchPlaceholder?: string
  searchValue?: string
  onSearchChange?: (val: string) => void
}

export const FilterBar: React.FC<FilterBarProps> = ({
  fields,
  onApply,
  onClear,
  className,
  searchPlaceholder = 'Buscar por produto ou SKU...',
  searchValue,
  onSearchChange,
}) => {
  return (
    <div
      className={cn(
        'bg-white rounded-xl border border-slate-200 p-3.5 sm:p-4 shadow-sm mb-6',
        className,
      )}
    >
      <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center">
        {onSearchChange !== undefined && (
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              type="text"
              value={searchValue || ''}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              className="pl-9 h-10 text-sm rounded-lg border-slate-300 focus-visible:ring-indigo-500/20 focus-visible:border-indigo-500"
            />
          </div>
        )}

        {fields.map((f) => (
          <div key={f.id} className="min-w-[160px] flex-shrink-0">
            {f.type === 'select' ? (
              <select
                aria-label={f.placeholder || f.id}
                value={f.value}
                onChange={(e) => f.onChange(e.target.value)}
                className="w-full h-10 px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer"
              >
                {f.placeholder && <option value="Todos">{f.placeholder}</option>}
                {f.options?.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                type="text"
                placeholder={f.placeholder}
                value={f.value}
                onChange={(e) => f.onChange(e.target.value)}
                className="h-10 text-sm rounded-lg border-slate-300 focus-visible:ring-indigo-500/20 focus-visible:border-indigo-500"
              />
            )}
          </div>
        ))}

        <div className="flex items-center gap-2 shrink-0">
          {onApply && (
            <Button
              onClick={onApply}
              size="default"
              className="h-10 px-4 gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
            >
              <Filter className="w-4 h-4" />
              <span>Aplicar</span>
            </Button>
          )}

          {onClear && (
            <Button
              onClick={onClear}
              variant="outline"
              size="default"
              className="h-10 px-3 gap-1.5 border-slate-300 text-slate-600 hover:bg-slate-50"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
              <span>Limpar</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
