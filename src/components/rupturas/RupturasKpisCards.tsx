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
      <Card className="p-4 border-slate-200 bg-white shadow-xs">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Rupturas Ativas
          </span>
          <div className="w-8 h-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center">
            <AlertCircle className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-3">
          <div className="text-2xl font-bold text-slate-900 tabular-nums">
            {isLoading ? '...' : totalAtivas}
          </div>
          <p className="text-xs text-slate-500 mt-1">Base Atual</p>
        </div>
      </Card>

      {/* Novas no Período */}
      <Card className="p-4 border-slate-200 bg-white shadow-xs">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Novas Ocorrências
          </span>
          <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
            <AlertTriangle className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-3">
          <div className="text-2xl font-bold text-slate-900 tabular-nums">
            {isLoading ? '...' : novas}
          </div>
          <p className="text-xs text-slate-500 mt-1">Entradas recentes na base</p>
        </div>
      </Card>

      {/* Distribuição por Motivo */}
      <Card className="p-4 border-slate-200 bg-white shadow-xs">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Top Motivos
          </span>
          <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <ShieldAlert className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-2 space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-slate-600">Ruptura Total:</span>
            <span className="font-semibold text-slate-900 tabular-nums">
              {porMotivo['Ruptura Total']}
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-600">Sem Estoque Mín.:</span>
            <span className="font-semibold text-slate-900 tabular-nums">
              {porMotivo['Sem Estoque Mínimo']}
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-600">Estoque Virtual:</span>
            <span className="font-semibold text-slate-900 tabular-nums">
              {porMotivo['Estoque Virtual']}
            </span>
          </div>
        </div>
      </Card>
    </div>
  )
}
