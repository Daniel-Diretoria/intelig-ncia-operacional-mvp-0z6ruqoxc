import React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ShieldAlert,
  CheckCircle2,
  Clock,
  HelpCircle,
  RotateCcw,
  CalendarCheck,
} from 'lucide-react'
import type { CrossEvidenceKpis as CrossEvidenceKpisType } from '@/types'

interface CrossEvidenceKpisProps {
  kpis: CrossEvidenceKpisType
  isLoading?: boolean
}

export const CrossEvidenceKpis: React.FC<CrossEvidenceKpisProps> = ({
  kpis,
  isLoading = false,
}) => {
  const cards = [
    {
      title: 'Rupturas Oficiais Ativas',
      value: kpis.rupturasOficiaisAtivas,
      formattedValue: String(kpis.rupturasOficiaisAtivas),
      subtext: 'Base oficial de rupturas intocada',
      icon: ShieldAlert,
      iconBg: 'bg-red-50 text-red-600 border border-red-100',
      valueColor: 'text-red-700',
    },
    {
      title: 'Evidências Alta Confiança',
      value: kpis.evidenciasAltaConfianca,
      formattedValue: String(kpis.evidenciasAltaConfianca),
      subtext: 'Mesma loja e código de produto',
      icon: CheckCircle2,
      iconBg: 'bg-emerald-50 text-emerald-600 border border-emerald-100',
      valueColor: 'text-emerald-700',
    },
    {
      title: 'Aguardando Revisão',
      value: kpis.evidenciasAguardandoRevisao,
      formattedValue: String(kpis.evidenciasAguardandoRevisao),
      subtext: 'Nome exato ou pendentes de validação',
      icon: Clock,
      iconBg: 'bg-amber-50 text-amber-600 border border-amber-100',
      valueColor: 'text-amber-700',
    },
    {
      title: 'Inconclusivos',
      value: kpis.confrontosInconclusivos,
      formattedValue: String(kpis.confrontosInconclusivos),
      subtext: 'Mesmo dia, marca ou produto similar',
      icon: HelpCircle,
      iconBg: 'bg-slate-100 text-slate-600 border border-slate-200',
      valueColor: 'text-slate-700',
    },
    {
      title: 'Reabertas',
      value: kpis.rupturasReabertas,
      formattedValue: String(kpis.rupturasReabertas),
      subtext: 'Novas ocorrências após evidência',
      icon: RotateCcw,
      iconBg: 'bg-purple-50 text-purple-600 border border-purple-100',
      valueColor: 'text-purple-700',
    },
    {
      title: 'Tempo Médio até Evidência',
      value: kpis.tempoMedioAteEvidencia,
      formattedValue:
        kpis.tempoMedioAteEvidencia !== null
          ? `${kpis.tempoMedioAteEvidencia} ${kpis.tempoMedioAteEvidencia === 1 ? 'dia' : 'dias'}`
          : '—',
      subtext: 'Intervalo ruptura → pesquisa validade',
      icon: CalendarCheck,
      iconBg: 'bg-blue-50 text-blue-600 border border-blue-100',
      valueColor: 'text-blue-700',
    },
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
      {cards.map((card, index) => {
        const Icon = card.icon
        return (
          <Card
            key={index}
            className="border-slate-200/80 shadow-xs hover:shadow-sm transition-all bg-white relative overflow-hidden"
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-semibold text-slate-600 truncate">{card.title}</span>
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${card.iconBg}`}
                >
                  <Icon className="w-4 h-4" />
                </div>
              </div>

              {isLoading ? (
                <div className="space-y-1.5 mt-1">
                  <Skeleton className="h-7 w-16" />
                  <Skeleton className="h-3 w-28" />
                </div>
              ) : (
                <>
                  <div
                    className={`text-2xl font-bold tracking-tight tabular-nums ${card.valueColor}`}
                  >
                    {card.formattedValue}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 truncate">{card.subtext}</p>
                </>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
