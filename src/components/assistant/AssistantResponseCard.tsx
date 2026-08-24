import React from 'react'
import { Link } from 'react-router-dom'
import {
  ShieldAlert,
  Calendar,
  Store,
  Package,
  AlertTriangle,
  Info,
  ExternalLink,
  Lock,
  HelpCircle,
  Database,
  Layers,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import type {
  AssistantResponse,
  EvidenceItem,
  MetricItem,
} from '@/lib/assistant/operationalAssistantEngine'
import { cn } from '@/lib/utils'

interface AssistantResponseCardProps {
  query: string
  response: AssistantResponse
  timestamp: string
}

function renderEvidenceIcon(iconType?: EvidenceItem['iconType']) {
  switch (iconType) {
    case 'store':
      return <Store className="w-4 h-4 text-indigo-600 shrink-0" />
    case 'product':
      return <Package className="w-4 h-4 text-sky-600 shrink-0" />
    case 'calendar':
      return <Calendar className="w-4 h-4 text-amber-600 shrink-0" />
    case 'alert':
      return <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
    case 'link':
      return <Layers className="w-4 h-4 text-purple-600 shrink-0" />
    case 'info':
    default:
      return <Info className="w-4 h-4 text-slate-500 shrink-0" />
  }
}

function getBadgeClasses(variant?: EvidenceItem['badgeVariant']) {
  switch (variant) {
    case 'critical':
      return 'bg-rose-50 text-rose-700 border-rose-200 font-semibold'
    case 'warning':
      return 'bg-amber-50 text-amber-700 border-amber-200 font-semibold'
    case 'info':
      return 'bg-indigo-50 text-indigo-700 border-indigo-200 font-semibold'
    case 'success':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold'
    case 'neutral':
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200'
  }
}

function getMetricStatusBorder(status?: MetricItem['status']) {
  switch (status) {
    case 'critical':
      return 'border-l-4 border-l-rose-500 bg-rose-50/30'
    case 'warning':
      return 'border-l-4 border-l-amber-500 bg-amber-50/30'
    case 'normal':
      return 'border-l-4 border-l-emerald-500 bg-emerald-50/30'
    case 'neutral':
    default:
      return 'border-l-4 border-l-indigo-500 bg-slate-50/60'
  }
}

export const AssistantResponseCard: React.FC<AssistantResponseCardProps> = ({
  query,
  response,
  timestamp,
}) => {
  const isBlocked = response.isBlocked
  const isAmbiguous = response.isAmbiguous
  const isUnrecognized = response.intent === 'unrecognized'

  return (
    <Card className="border border-slate-200 bg-white shadow-xs rounded-2xl overflow-hidden transition-all">
      {/* Header com a Pergunta feita */}
      <CardHeader className="bg-slate-50/80 border-b border-slate-200/80 px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-start sm:items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs shrink-0">
            Q
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Pergunta
            </p>
            <p className="text-sm font-bold text-slate-900 tracking-tight">{query}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-slate-400 font-medium self-end sm:self-center">
          <span>{timestamp}</span>
        </div>
      </CardHeader>

      <CardContent className="p-5 sm:p-6 space-y-5">
        {/* Título & Resumo da Resposta */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            {isBlocked ? (
              <Badge
                variant="outline"
                className="bg-rose-50 text-rose-700 border-rose-200 gap-1 text-xs"
              >
                <Lock className="w-3 h-3" />
                Bloqueio Auditável
              </Badge>
            ) : isAmbiguous || isUnrecognized ? (
              <Badge
                variant="outline"
                className="bg-amber-50 text-amber-700 border-amber-200 gap-1 text-xs"
              >
                <HelpCircle className="w-3 h-3" />
                Orientação
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="bg-indigo-50 text-indigo-700 border-indigo-200 gap-1 text-xs"
              >
                <Database className="w-3 h-3" />
                Base Atual Reconciliada
              </Badge>
            )}

            <CardTitle className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
              {response.title}
            </CardTitle>
          </div>

          <p className="text-sm text-slate-700 leading-relaxed font-normal bg-slate-50/50 p-3.5 rounded-xl border border-slate-100">
            {response.summary}
          </p>
        </div>

        {/* Indicadores / Métricas Principais */}
        {response.metrics && response.metrics.length > 0 && (
          <div className="space-y-2.5">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Indicadores Extraídos da Base
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {response.metrics.map((metric, idx) => (
                <div
                  key={idx}
                  className={cn(
                    'p-3.5 rounded-xl border border-slate-200/80 shadow-2xs space-y-1',
                    getMetricStatusBorder(metric.status),
                  )}
                >
                  <p className="text-xs font-medium text-slate-500 truncate">{metric.label}</p>
                  <p className="text-lg font-bold text-slate-900 tracking-tight">{metric.value}</p>
                  {metric.detail && (
                    <p className="text-[11px] text-slate-500 leading-tight">{metric.detail}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Evidências Detalhadas */}
        {response.evidence && response.evidence.length > 0 && (
          <div className="space-y-2.5">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Evidências & Detalhes Operacionais
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {response.evidence.map((ev, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-xl border border-slate-200 bg-white hover:border-indigo-200 transition-colors shadow-2xs space-y-2 flex flex-col justify-between"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {renderEvidenceIcon(ev.iconType)}
                        <span className="text-xs font-bold text-slate-900 line-clamp-1">
                          {ev.title}
                        </span>
                      </div>
                      {ev.badge && (
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-[10px] px-2 py-0.5 rounded-md shrink-0',
                            getBadgeClasses(ev.badgeVariant),
                          )}
                        >
                          {ev.badge}
                        </Badge>
                      )}
                    </div>

                    {ev.subtitle && (
                      <p className="text-xs text-slate-600 line-clamp-1 pl-6">{ev.subtitle}</p>
                    )}

                    {ev.details && ev.details.length > 0 && (
                      <div className="pt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] text-slate-500 border-t border-slate-100">
                        {ev.details.map((d, dIdx) => (
                          <div key={dIdx} className="truncate">
                            <span className="font-medium text-slate-700">{d.label}: </span>
                            <span className="text-slate-600">{d.value}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {ev.navigationPath && (
                    <div className="pt-2 flex justify-end">
                      <Link
                        to={ev.navigationPath}
                        className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 group py-1 px-2 rounded-lg hover:bg-indigo-50 transition-colors"
                      >
                        <span>{ev.navigationLabel || 'Visualizar detalhes'}</span>
                        <ExternalLink className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                      </Link>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Rodapé do Card: Fontes, Limitações e Filtros */}
        <div className="pt-3 border-t border-slate-200/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 text-xs text-slate-500">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-slate-600">Fontes:</span>
            {response.sources.map((src, idx) => (
              <Badge
                key={idx}
                variant="secondary"
                className="text-[10px] font-medium bg-slate-100 text-slate-700 hover:bg-slate-200"
              >
                {src}
              </Badge>
            ))}
          </div>

          {response.limitations && response.limitations.length > 0 && (
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 italic">
              <ShieldAlert className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>{response.limitations[0]}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
