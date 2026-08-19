import React, { useMemo, useState } from 'react'
import { ChevronDown, Check, Filter as FilterIcon, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import type { CriticidadeLevel } from '@/types'
import { CRITICIDADE_FAIXAS } from '@/lib/data/criticidade'

interface CriticidadeMultiSelectProps {
  value: CriticidadeLevel[]
  onChange: (value: CriticidadeLevel[]) => void
  placeholder?: string
}

/**
 * Dropdown multiselect para filtrar por níveis de criticidade.
 * Apresenta checkboxes com a descrição de cada faixa.
 */
export const CriticidadeMultiSelect: React.FC<CriticidadeMultiSelectProps> = ({
  value,
  onChange,
  placeholder = 'Todas as criticidades',
}) => {
  const [open, setOpen] = useState(false)

  const toggle = (level: CriticidadeLevel) => {
    if (value.includes(level)) onChange(value.filter((v) => v !== level))
    else onChange([...value, level])
  }

  const label = useMemo(() => {
    if (value.length === 0) return placeholder
    if (value.length === CRITICIDADE_FAIXAS.length) return 'Todas as criticidades'
    if (value.length === 1) return value[0]
    return `${value.length} níveis selecionados`
  }, [value, placeholder])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full h-10 justify-between font-normal text-sm border-slate-300 text-slate-700 bg-white hover:bg-slate-50"
        >
          <span className="flex items-center gap-2 truncate">
            <FilterIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="truncate">{label}</span>
          </span>
          <span className="flex items-center gap-1 shrink-0">
            {value.length > 0 && (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation()
                  onChange([])
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.stopPropagation()
                    onChange([])
                  }
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </span>
            )}
            <ChevronDown className="w-4 h-4 text-slate-400" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-1" align="start">
        <div className="max-h-64 overflow-y-auto">
          {CRITICIDADE_FAIXAS.map((faixa) => {
            const checked = value.includes(faixa.level)
            return (
              <button
                key={faixa.level}
                type="button"
                onClick={() => toggle(faixa.level)}
                className={cn(
                  'w-full flex items-start gap-2.5 px-3 py-2 rounded-md text-left text-sm hover:bg-slate-50 transition-colors',
                  checked && 'bg-slate-50',
                )}
              >
                <Checkbox checked={checked} className="mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={cn('w-2 h-2 rounded-full', faixa.chipClass.split(' ')[0])} />
                    <span className="font-semibold text-slate-800">{faixa.label}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">{faixa.descricao}</p>
                </div>
                {checked && <Check className="w-3.5 h-3.5 text-indigo-600 mt-0.5" />}
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
