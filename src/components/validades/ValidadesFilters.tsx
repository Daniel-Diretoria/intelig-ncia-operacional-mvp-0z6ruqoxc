import React, { useMemo, useState } from 'react'
import { Search, RotateCcw, Filter as FilterIcon, CalendarDays } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { CriticidadeMultiSelect } from './CriticidadeMultiSelect'
import type { CriticidadeLevel, ValidadesFilter } from '@/types'

export interface ValidadesFilterState {
  search: string
  cliente: string
  industria: string
  rede: string
  loja: string
  cidade: string
  produto: string
  promotor: string
  supervisor: string
  criticidades: CriticidadeLevel[]
  dataInicio: string
  dataFim: string
  category: string
}

export const emptyValidadesFilterState: ValidadesFilterState = {
  search: '',
  cliente: 'Todos',
  industria: 'Todos',
  rede: 'Todos',
  loja: 'Todos',
  cidade: 'Todos',
  produto: 'Todos',
  promotor: 'Todos',
  supervisor: 'Todos',
  criticidades: [],
  dataInicio: '',
  dataFim: '',
  category: 'Todos',
}

interface SelectOption {
  label: string
  value: string
}

interface ValidadesFiltersProps {
  state: ValidadesFilterState
  onChange: (state: ValidadesFilterState) => void
  onApply: () => void
  onClear: () => void
  options: {
    clientes: SelectOption[]
    industrias: SelectOption[]
    redes: SelectOption[]
    lojas: SelectOption[]
    cidades: SelectOption[]
    produtos: SelectOption[]
    promotores: SelectOption[]
    supervisores: SelectOption[]
    categorias: SelectOption[]
  }
}

function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: SelectOption[]
  placeholder: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
        {label}
      </label>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-10 px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer"
      >
        <option value="Todos">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  )
}

export const ValidadesFilters: React.FC<ValidadesFiltersProps> = ({
  state,
  onChange,
  onApply,
  onClear,
  options,
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false)

  const update = <K extends keyof ValidadesFilterState>(key: K, val: ValidadesFilterState[K]) =>
    onChange({ ...state, [key]: val })

  const hasActive =
    state.search.trim() !== '' ||
    [
      state.cliente,
      state.industria,
      state.rede,
      state.loja,
      state.cidade,
      state.produto,
      state.promotor,
      state.supervisor,
      state.category,
    ].some((v) => v !== 'Todos') ||
    state.criticidades.length > 0 ||
    state.dataInicio !== '' ||
    state.dataFim !== ''

  const activeCount = useMemo(() => {
    let c = 0
    if (state.search.trim()) c++
    ;(
      [
        state.cliente,
        state.industria,
        state.rede,
        state.loja,
        state.cidade,
        state.produto,
        state.promotor,
        state.supervisor,
        state.category,
      ] as string[]
    ).forEach((v) => v !== 'Todos' && c++)
    if (state.criticidades.length > 0) c++
    if (state.dataInicio || state.dataFim) c++
    return c
  }, [state])

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-xs space-y-3.5">
      {/* Linha principal: busca + ações */}
      <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            type="text"
            value={state.search}
            onChange={(e) => update('search', e.target.value)}
            placeholder="Buscar por produto, cliente ou loja..."
            className="pl-9 h-10 text-xs sm:text-sm rounded-xl border-slate-200 bg-slate-50/50 focus:bg-white focus-visible:ring-indigo-500/20 focus-visible:border-indigo-500"
          />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="default"
            onClick={() => setShowAdvanced((s) => !s)}
            className={cn(
              'h-10 px-3.5 gap-1.5 border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl font-medium text-xs',
              showAdvanced && 'bg-indigo-50/60 border-indigo-200 text-indigo-700 font-semibold',
            )}
          >
            <FilterIcon className="w-3.5 h-3.5" />
            <span>Filtros avançados</span>
            {activeCount > 0 && (
              <span className="ml-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-indigo-600 text-white text-[10px] font-bold">
                {activeCount}
              </span>
            )}
          </Button>

          <Button
            onClick={onApply}
            size="default"
            className="h-10 px-4 gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs rounded-xl font-semibold text-xs"
          >
            <FilterIcon className="w-3.5 h-3.5" />
            <span>Aplicar</span>
          </Button>

          <Button
            onClick={onClear}
            variant="outline"
            size="default"
            disabled={!hasActive}
            className="h-10 px-3.5 gap-1.5 border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl font-medium text-xs"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
            <span>Limpar</span>
          </Button>
        </div>
      </div>

      {/* Filtros avançados */}
      {showAdvanced && (
        <div className="pt-3.5 border-t border-slate-100 space-y-3.5 animate-fade-in">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <SelectField
              label="Cliente"
              value={state.cliente}
              onChange={(v) => update('cliente', v)}
              options={options.clientes}
              placeholder="Todos os clientes"
            />
            <SelectField
              label="Indústria"
              value={state.industria}
              onChange={(v) => update('industria', v)}
              options={options.industrias}
              placeholder="Todas as indústrias"
            />
            <SelectField
              label="Rede"
              value={state.rede}
              onChange={(v) => update('rede', v)}
              options={options.redes}
              placeholder="Todas as redes"
            />
            <SelectField
              label="Loja"
              value={state.loja}
              onChange={(v) => update('loja', v)}
              options={options.lojas}
              placeholder="Todas as lojas"
            />
            <SelectField
              label="Cidade"
              value={state.cidade}
              onChange={(v) => update('cidade', v)}
              options={options.cidades}
              placeholder="Todas as cidades"
            />
            <SelectField
              label="Produto"
              value={state.produto}
              onChange={(v) => update('produto', v)}
              options={options.produtos}
              placeholder="Todos os produtos"
            />
            <SelectField
              label="Promotor"
              value={state.promotor}
              onChange={(v) => update('promotor', v)}
              options={options.promotores}
              placeholder="Todos os promotores"
            />
            <SelectField
              label="Supervisor"
              value={state.supervisor}
              onChange={(v) => update('supervisor', v)}
              options={options.supervisores}
              placeholder="Todos os supervisores"
            />
            <SelectField
              label="Categoria"
              value={state.category}
              onChange={(v) => update('category', v)}
              options={options.categorias}
              placeholder="Todas as categorias"
            />

            {/* Período (ocupa 1 coluna; o campo de criticidade ocupa a 4ª) */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Período (validade)
              </label>
              <div className="flex items-center gap-1.5">
                <div className="relative flex-1">
                  <CalendarDays className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                  <Input
                    type="date"
                    value={state.dataInicio}
                    onChange={(e) => update('dataInicio', e.target.value)}
                    className="h-10 pl-8 text-sm rounded-lg border-slate-300"
                  />
                </div>
                <span className="text-slate-400 text-xs">até</span>
                <div className="relative flex-1">
                  <CalendarDays className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                  <Input
                    type="date"
                    value={state.dataFim}
                    onChange={(e) => update('dataFim', e.target.value)}
                    className="h-10 pl-8 text-sm rounded-lg border-slate-300"
                  />
                </div>
              </div>
            </div>

            {/* Criticidade multiselect */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Criticidade
              </label>
              <CriticidadeMultiSelect
                value={state.criticidades}
                onChange={(v) => update('criticidades', v)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** Constrói o objeto ValidadesFilter enviado ao adapter a partir do estado de UI. */
export function buildValidadesFilter(state: ValidadesFilterState): ValidadesFilter {
  return {
    search: state.search.trim() || undefined,
    category: state.category !== 'Todos' ? state.category : undefined,
    cliente: state.cliente !== 'Todos' ? state.cliente : undefined,
    industria: state.industria !== 'Todos' ? state.industria : undefined,
    rede: state.rede !== 'Todos' ? state.rede : undefined,
    loja: state.loja !== 'Todos' ? state.loja : undefined,
    cidade: state.cidade !== 'Todos' ? state.cidade : undefined,
    produto: state.produto !== 'Todos' ? state.produto : undefined,
    promotor: state.promotor !== 'Todos' ? state.promotor : undefined,
    supervisor: state.supervisor !== 'Todos' ? state.supervisor : undefined,
    criticidades: state.criticidades.length > 0 ? state.criticidades : undefined,
    dataInicio: state.dataInicio || undefined,
    dataFim: state.dataFim || undefined,
  }
}
