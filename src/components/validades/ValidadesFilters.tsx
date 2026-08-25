import React, { useMemo } from 'react'
import { Search, RotateCcw, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { CriticidadeLevel, ValidadesFilter } from '@/types'

export type FaixaVencimentoKey = 'todas' | 'vencidos' | 'critico' | 'atencao' | 'moderado' | 'ok'

export interface ValidadesFilterState {
  search: string
  cliente: string
  rede: string
  loja: string
  cidade: string
  produto: string
  faixaVencimento: FaixaVencimentoKey
  // Campos legados mantidos para compatibilidade com outros módulos/tipos se necessário
  industria?: string
  promotor?: string
  supervisor?: string
  criticidades?: CriticidadeLevel[]
  dataInicio?: string
  dataFim?: string
  category?: string
}

export const emptyValidadesFilterState: ValidadesFilterState = {
  search: '',
  cliente: 'Todos',
  rede: 'Todos',
  loja: 'Todos',
  cidade: 'Todos',
  produto: 'Todos',
  faixaVencimento: 'todas',
}

export interface SelectOption {
  label: string
  value: string
}

export const FAIXA_VENCIMENTO_OPTIONS: Array<{ label: string; value: FaixaVencimentoKey }> = [
  { label: 'Todas as faixas', value: 'todas' },
  { label: 'Vencidos (dias < 0)', value: 'vencidos' },
  { label: 'Crítico (0 a 15 dias)', value: 'critico' },
  { label: 'Atenção (16 a 20 dias)', value: 'atencao' },
  { label: 'Moderado (21 a 29 dias)', value: 'moderado' },
  { label: 'OK (≥ 30 dias)', value: 'ok' },
]

export interface ValidadesFiltersProps {
  state: ValidadesFilterState
  onChange: (state: ValidadesFilterState) => void
  onApply?: () => void
  onClear: () => void
  options: {
    clientes: SelectOption[]
    redes: SelectOption[]
    lojas: SelectOption[]
    cidades: SelectOption[]
    produtos: SelectOption[]
    // Campos legados para compatibilidade com outras telas
    industrias?: SelectOption[]
    promotores?: SelectOption[]
    supervisores?: SelectOption[]
    categorias?: SelectOption[]
  }
}

function CompactSelectField({
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
    <div className="flex flex-col gap-1 min-w-[140px] flex-1">
      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
        {label}
      </label>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-9 px-2.5 py-1 text-xs sm:text-sm bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer truncate"
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
  onClear,
  options,
}) => {
  const update = <K extends keyof ValidadesFilterState>(key: K, val: ValidadesFilterState[K]) =>
    onChange({ ...state, [key]: val })

  const hasActiveFilters =
    Boolean(state.search.trim()) ||
    state.cliente !== 'Todos' ||
    state.rede !== 'Todos' ||
    state.loja !== 'Todos' ||
    state.cidade !== 'Todos' ||
    state.produto !== 'Todos' ||
    state.faixaVencimento !== 'todas'

  // Monta a lista legível de chips de filtros ativos
  const activeChips = useMemo(() => {
    const chips: Array<{ id: keyof ValidadesFilterState; label: string; onRemove: () => void }> = []

    if (state.search.trim()) {
      chips.push({
        id: 'search',
        label: `Busca: "${state.search.trim()}"`,
        onRemove: () => update('search', ''),
      })
    }

    if (state.cliente && state.cliente !== 'Todos') {
      chips.push({
        id: 'cliente',
        label: `Marca: ${state.cliente}`,
        onRemove: () => update('cliente', 'Todos'),
      })
    }

    if (state.rede && state.rede !== 'Todos') {
      chips.push({
        id: 'rede',
        label: `Rede: ${state.rede}`,
        onRemove: () => update('rede', 'Todos'),
      })
    }

    if (state.loja && state.loja !== 'Todos') {
      const matchLoja = options.lojas.find((l) => l.value === state.loja)
      chips.push({
        id: 'loja',
        label: `Loja: ${matchLoja ? matchLoja.label : state.loja}`,
        onRemove: () => update('loja', 'Todos'),
      })
    }

    if (state.cidade && state.cidade !== 'Todos') {
      chips.push({
        id: 'cidade',
        label: `Cidade: ${state.cidade}`,
        onRemove: () => update('cidade', 'Todos'),
      })
    }

    if (state.produto && state.produto !== 'Todos') {
      chips.push({
        id: 'produto',
        label: `Produto: ${state.produto}`,
        onRemove: () => update('produto', 'Todos'),
      })
    }

    if (state.faixaVencimento && state.faixaVencimento !== 'todas') {
      const matchFaixa = FAIXA_VENCIMENTO_OPTIONS.find((f) => f.value === state.faixaVencimento)
      chips.push({
        id: 'faixaVencimento',
        label: `Faixa: ${matchFaixa ? matchFaixa.label : state.faixaVencimento}`,
        onRemove: () => update('faixaVencimento', 'todas'),
      })
    }

    return chips
  }, [state, options.lojas])

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-xs space-y-3.5">
      {/* Barra de Filtros Compacta SEMPRE Visível */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3 items-end">
        {/* Busca */}
        <div className="flex flex-col gap-1 sm:col-span-2 lg:col-span-2">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            Busca
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <Input
              type="text"
              value={state.search}
              onChange={(e) => update('search', e.target.value)}
              placeholder="Buscar por produto, loja, código ou marca..."
              className="pl-9 h-9 text-xs sm:text-sm rounded-lg border-slate-300 bg-slate-50/50 focus:bg-white"
            />
          </div>
        </div>

        {/* Marca (cliente) */}
        <CompactSelectField
          label="Marca"
          value={state.cliente}
          onChange={(v) => update('cliente', v)}
          options={options.clientes}
          placeholder="Todas as marcas"
        />

        {/* Rede */}
        <CompactSelectField
          label="Rede"
          value={state.rede}
          onChange={(v) => update('rede', v)}
          options={options.redes}
          placeholder="Todas as redes"
        />

        {/* Loja */}
        <CompactSelectField
          label="Loja"
          value={state.loja}
          onChange={(v) => update('loja', v)}
          options={options.lojas}
          placeholder="Todas as lojas"
        />

        {/* Cidade */}
        <CompactSelectField
          label="Cidade"
          value={state.cidade}
          onChange={(v) => update('cidade', v)}
          options={options.cidades}
          placeholder="Todas as cidades"
        />

        {/* Produto */}
        <CompactSelectField
          label="Produto"
          value={state.produto}
          onChange={(v) => update('produto', v)}
          options={options.produtos}
          placeholder="Todos os produtos"
        />
      </div>

      {/* Segunda linha: Faixa de vencimento + Botão Limpar Filtros */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-end justify-between gap-3 pt-2 border-t border-slate-100">
        <div className="flex flex-col gap-1 w-full sm:w-72">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            Faixa de vencimento
          </label>
          <select
            aria-label="Faixa de vencimento"
            value={state.faixaVencimento}
            onChange={(e) => update('faixaVencimento', e.target.value as FaixaVencimentoKey)}
            className="w-full h-9 px-2.5 py-1 text-xs sm:text-sm bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer"
          >
            {FAIXA_VENCIMENTO_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <Button
          type="button"
          onClick={onClear}
          variant="outline"
          size="sm"
          disabled={!hasActiveFilters}
          className="h-9 px-3.5 gap-1.5 border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg font-medium text-xs self-start sm:self-end disabled:opacity-50"
        >
          <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
          <span>Limpar filtros</span>
        </Button>
      </div>

      {/* Chips de filtros ativos */}
      {activeChips.length > 0 && (
        <div className="pt-2 flex flex-wrap items-center gap-1.5 border-t border-slate-100 animate-fade-in">
          <span className="text-[11px] font-semibold text-slate-400 mr-1">Filtros ativos:</span>
          {activeChips.map((chip) => (
            <span
              key={chip.id}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200"
            >
              <span>{chip.label}</span>
              <button
                type="button"
                onClick={chip.onRemove}
                className="w-3.5 h-3.5 rounded-full inline-flex items-center justify-center hover:bg-indigo-200/70 text-indigo-700 hover:text-indigo-900 transition-colors"
                title="Remover filtro"
                aria-label={`Remover filtro ${chip.label}`}
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/** Constrói o objeto ValidadesFilter enviado ao adapter a partir do estado de UI. */
export function buildValidadesFilter(state: ValidadesFilterState): ValidadesFilter {
  let criticidades: CriticidadeLevel[] | undefined = undefined

  if (state.faixaVencimento && state.faixaVencimento !== 'todas') {
    switch (state.faixaVencimento) {
      case 'vencidos':
        criticidades = ['Vencido']
        break
      case 'critico':
        criticidades = ['Crítico']
        break
      case 'atencao':
        criticidades = ['Atenção']
        break
      case 'moderado':
        criticidades = ['Moderado']
        break
      case 'ok':
        criticidades = ['OK']
        break
    }
  }

  return {
    search: state.search.trim() || undefined,
    cliente: state.cliente !== 'Todos' ? state.cliente : undefined,
    rede: state.rede !== 'Todos' ? state.rede : undefined,
    loja: state.loja !== 'Todos' ? state.loja : undefined,
    cidade: state.cidade !== 'Todos' ? state.cidade : undefined,
    produto: state.produto !== 'Todos' ? state.produto : undefined,
    criticidades,
    // Campos legados repassados se existirem
    industria: state.industria && state.industria !== 'Todos' ? state.industria : undefined,
    promotor: state.promotor && state.promotor !== 'Todos' ? state.promotor : undefined,
    supervisor: state.supervisor && state.supervisor !== 'Todos' ? state.supervisor : undefined,
    category: state.category && state.category !== 'Todos' ? state.category : undefined,
    dataInicio: state.dataInicio || undefined,
    dataFim: state.dataFim || undefined,
  }
}
