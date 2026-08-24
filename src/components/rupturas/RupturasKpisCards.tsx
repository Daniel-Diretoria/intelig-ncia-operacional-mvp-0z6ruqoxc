import React from 'react'
import { Card } from '@/components/ui/card'
import { AlertCircle, AlertTriangle, CheckCircle, ShieldAlert, TrendingDown } from 'lucide-react'
import type { RupturasKpis } from '@/types'

interface RupturasKpisProps {
  kpis: RupturasKpis | null
  isLoading?: boolean
}

export const RupturasKpisCards: React.FC<RupturasKpisProps> = ({ kpis, isLoading }) => {
  const totalAtivas = kpis?.totalAtivas ?? kpis?.total_ativas ?? 0
  const novas = kpis?.novasNoPeriodo ?? kpis?.novas_no_periodo ?? 0
  const resolvidas = kpis?.resolvidas ?? 0
  const totalGeral = kpis?.totalGeral ?? kpis?.total_geral ?? 0
  const porMotivo = kpis?.porMotivo ??
    kpis?.por_motivo ?? {
      'Ruptura Total': 0,
      'Sem Estoque Mínimo': 0,
      'Estoque Virtual': 0,
    }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {/* Total de Rupturas Ativas */}
      <div className="p-5 rounded-2xl border border-slate-200/80 bg-white shadow-xs">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Rupturas Ativas
          </span>
          <div className="w-9 h-9 rounded-xl bg-red-50 text-red-600 flex items-center justify-center border border-red-100">
            <AlertCircle className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-3">
          <div className="text-2xl font-bold text-slate-900 tabular-nums">
            {isLoading ? '...' : totalAtivas}
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">Base Atual de ocorrências</p>
        </div>
      </div>

      {/* Novas no Período */}
      <div className="p-5 rounded-2xl border border-slate-200/80 bg-white shadow-xs">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Novas Ocorrências
          </span>
          <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100">
            <AlertTriangle className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-3">
          <div className="text-2xl font-bold text-slate-900 tabular-nums">
            {isLoading ? '...' : novas}
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">Entradas recentes na base</p>
        </div>
      </div>

      {/* Distribuição por Motivo */}
      <div className="p-5 rounded-2xl border border-slate-200/80 bg-white shadow-xs">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Top Motivos
          </span>
          <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100">
            <ShieldAlert className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-2.5 space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-slate-600">Ruptura Total:</span>
            <span className="font-bold text-slate-900 tabular-nums">
              {porMotivo['Ruptura Total']}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600">Sem Estoque Mín.:</span>
            <span className="font-bold text-slate-900 tabular-nums">
              {porMotivo['Sem Estoque Mínimo']}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600">Estoque Virtual:</span>
            <span className="font-bold text-slate-900 tabular-nums">
              {porMotivo['Estoque Virtual']}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
