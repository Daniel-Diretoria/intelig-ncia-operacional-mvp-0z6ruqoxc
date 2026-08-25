import React from 'react'
import { AlertTriangle, Store, AlertOctagon, Clock } from 'lucide-react'
import type { RupturasKpis } from '@/types'

export interface OperationalRupturasKpisData {
  ativas: number
  lojasCriticas: number
  rupturaTotal: number
  tempoMedioDias: number
}

export interface RupturasKpisCardsProps {
  kpis: OperationalRupturasKpisData | RupturasKpis | null
  isLoading?: boolean
  selectedKpi?: 'lojasCriticas' | 'rupturaTotal' | null
  onSelectKpi?: (kpiKey: 'lojasCriticas' | 'rupturaTotal') => void
}

export const RupturasKpisCards: React.FC<RupturasKpisCardsProps> = ({
  kpis,
  isLoading,
  selectedKpi,
  onSelectKpi,
}) => {
  // Extrai valores padronizados
  let ativas = 0
  let lojasCriticas = 0
  let rupturaTotal = 0
  let tempoMedio = 0

  if (kpis) {
    if ('ativas' in kpis) {
      const opKpis = kpis as OperationalRupturasKpisData
      ativas = opKpis.ativas
      lojasCriticas = opKpis.lojasCriticas
      rupturaTotal = opKpis.rupturaTotal
      tempoMedio = opKpis.tempoMedioDias
    } else {
      const legacyKpis = kpis as RupturasKpis
      ativas = legacyKpis.totalAtivas ?? legacyKpis.total_ativas ?? 0
      rupturaTotal =
        legacyKpis.porMotivo?.['Ruptura Total'] ?? legacyKpis.por_motivo?.['Ruptura Total'] ?? 0
      lojasCriticas = legacyKpis.topLojas?.length ?? 0
      tempoMedio = 0
    }
  }

  const fmtInt = (v: number) => (isLoading ? '...' : v.toLocaleString('pt-BR'))

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* 1. Rupturas Ativas */}
      <div className="p-5 rounded-2xl border border-slate-200/80 bg-white shadow-xs transition-all">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Rupturas ativas
          </span>
          <div className="w-9 h-9 rounded-xl bg-red-50 text-red-600 flex items-center justify-center border border-red-100">
            <AlertTriangle className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-3">
          <div className="text-2xl font-bold text-slate-900 tabular-nums">{fmtInt(ativas)}</div>
          <p className="text-[11px] text-slate-400 mt-0.5">Total na visão atual</p>
        </div>
      </div>

      {/* 2. Lojas Críticas (Clicável) */}
      <button
        type="button"
        onClick={() => onSelectKpi?.('lojasCriticas')}
        className={`text-left p-5 rounded-2xl border bg-white shadow-xs transition-all cursor-pointer ${
          selectedKpi === 'lojasCriticas'
            ? 'border-amber-400 ring-2 ring-amber-400/30 bg-amber-50/20'
            : 'border-slate-200/80 hover:border-amber-300 hover:bg-slate-50/50'
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Lojas críticas
          </span>
          <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100">
            <Store className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-3">
          <div className="text-2xl font-bold text-slate-900 tabular-nums">
            {fmtInt(lojasCriticas)}
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {selectedKpi === 'lojasCriticas'
              ? 'Filtro ativo • Clique p/ limpar'
              : 'Clique p/ filtrar lojas'}
          </p>
        </div>
      </button>

      {/* 3. Ruptura Total (Clicável) */}
      <button
        type="button"
        onClick={() => onSelectKpi?.('rupturaTotal')}
        className={`text-left p-5 rounded-2xl border bg-white shadow-xs transition-all cursor-pointer ${
          selectedKpi === 'rupturaTotal'
            ? 'border-slate-800 ring-2 ring-slate-800/20 bg-slate-50'
            : 'border-slate-200/80 hover:border-slate-400 hover:bg-slate-50/50'
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Ruptura total
          </span>
          <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center border border-slate-200">
            <AlertOctagon className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-3">
          <div className="text-2xl font-bold text-slate-900 tabular-nums">
            {fmtInt(rupturaTotal)}
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {selectedKpi === 'rupturaTotal'
              ? 'Filtro ativo • Clique p/ limpar'
              : 'Clique p/ filtrar motivo'}
          </p>
        </div>
      </button>

      {/* 4. Tempo Médio em Ruptura (Informativo) */}
      <div className="p-5 rounded-2xl border border-slate-200/80 bg-white shadow-xs">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Tempo médio em ruptura
          </span>
          <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
            <Clock className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-3">
          <div className="text-2xl font-bold text-slate-900 tabular-nums">
            {isLoading ? '...' : `${tempoMedio} ${tempoMedio === 1 ? 'dia' : 'dias'}`}
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">Média calculada da visão</p>
        </div>
      </div>
    </div>
  )
}
