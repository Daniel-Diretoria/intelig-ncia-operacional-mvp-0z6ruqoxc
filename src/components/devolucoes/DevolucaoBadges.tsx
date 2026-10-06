import React from 'react'
import { Badge } from '@/components/ui/badge'
import { DevolucaoStatus, AuditoriaClassificacao, DecisaoHumanaItem } from '@/types/devolucoes'
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  HelpCircle,
  XCircle,
  Send,
  FileText,
  FileCheck,
} from 'lucide-react'

export const STATUS_LABELS: Record<
  DevolucaoStatus,
  { label: string; bg: string; text: string; icon: React.ReactNode }
> = {
  solicitacao_recebida: {
    label: 'Solicitação Recebida',
    bg: 'bg-slate-100 text-slate-800 border-slate-300',
    text: 'text-slate-700',
    icon: <Clock className="w-3.5 h-3.5 mr-1 text-slate-500" />,
  },
  em_analise: {
    label: 'Em Análise',
    bg: 'bg-amber-100 text-amber-900 border-amber-300',
    text: 'text-amber-800',
    icon: <Clock className="w-3.5 h-3.5 mr-1 text-amber-600" />,
  },
  aguardando_informacao: {
    label: 'Aguardando Informação',
    bg: 'bg-orange-100 text-orange-900 border-orange-300',
    text: 'text-orange-800',
    icon: <HelpCircle className="w-3.5 h-3.5 mr-1 text-orange-600" />,
  },
  pronta_para_envio: {
    label: 'Pronta p/ Envio',
    bg: 'bg-blue-100 text-blue-900 border-blue-300',
    text: 'text-blue-800',
    icon: <Send className="w-3.5 h-3.5 mr-1 text-blue-600" />,
  },
  aguardando_autorizacao_industria: {
    label: 'Aguardando Indústria',
    bg: 'bg-indigo-100 text-indigo-900 border-indigo-300',
    text: 'text-indigo-800',
    icon: <Clock className="w-3.5 h-3.5 mr-1 text-indigo-600" />,
  },
  industria_autorizou: {
    label: 'Indústria Autorizou',
    bg: 'bg-emerald-100 text-emerald-900 border-emerald-300',
    text: 'text-emerald-800',
    icon: <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-600" />,
  },
  aguardando_nf_descarte: {
    label: 'Aguardando NF / Descarte',
    bg: 'bg-purple-100 text-purple-900 border-purple-300',
    text: 'text-purple-800',
    icon: <FileText className="w-3.5 h-3.5 mr-1 text-purple-600" />,
  },
  concluido: {
    label: 'Concluído',
    bg: 'bg-teal-100 text-teal-900 border-teal-300',
    text: 'text-teal-800',
    icon: <FileCheck className="w-3.5 h-3.5 mr-1 text-teal-600" />,
  },
  divergencia_encontrada: {
    label: 'Divergência Encontrada',
    bg: 'bg-rose-100 text-rose-900 border-rose-300',
    text: 'text-rose-800',
    icon: <AlertTriangle className="w-3.5 h-3.5 mr-1 text-rose-600" />,
  },
  nao_autorizado: {
    label: 'Não Autorizado',
    bg: 'bg-red-100 text-red-900 border-red-300',
    text: 'text-red-800',
    icon: <XCircle className="w-3.5 h-3.5 mr-1 text-red-600" />,
  },
  cancelado: {
    label: 'Cancelado',
    bg: 'bg-gray-100 text-gray-800 border-gray-300',
    text: 'text-gray-700',
    icon: <XCircle className="w-3.5 h-3.5 mr-1 text-gray-500" />,
  },
}

export const AUDITORIA_LABELS: Record<
  AuditoriaClassificacao,
  {
    label: string
    badgeClass: string
    borderClass: string
    textClass: string
    icon: React.ReactNode
  }
> = {
  acompanhamento_consistente: {
    label: 'ACOMPANHAMENTO CONSISTENTE',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-300',
    borderClass: 'border-l-emerald-500',
    textClass: 'text-emerald-700',
    icon: <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />,
  },
  atencao: {
    label: 'ATENÇÃO',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-300',
    borderClass: 'border-l-amber-500',
    textClass: 'text-amber-700',
    icon: <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />,
  },
  divergencia: {
    label: 'DIVERGÊNCIA',
    badgeClass: 'bg-rose-50 text-rose-800 border-rose-300',
    borderClass: 'border-l-rose-500',
    textClass: 'text-rose-700',
    icon: <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />,
  },
  dados_insuficientes: {
    label: 'DADOS INSUFICIENTES',
    badgeClass: 'bg-slate-100 text-slate-800 border-slate-300',
    borderClass: 'border-l-slate-400',
    textClass: 'text-slate-700',
    icon: <HelpCircle className="w-4 h-4 text-slate-500 shrink-0" />,
  },
  nao_auditado: {
    label: 'NÃO AUDITADO',
    badgeClass: 'bg-gray-50 text-gray-700 border-gray-200',
    borderClass: 'border-l-gray-300',
    textClass: 'text-gray-600',
    icon: <Clock className="w-4 h-4 text-gray-400 shrink-0" />,
  },
}

export const DECISAO_LABELS: Record<DecisaoHumanaItem, { label: string; badgeClass: string }> = {
  pendente: {
    label: 'Decisão Pendente',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-300',
  },
  aprovado_para_industria: {
    label: 'Aprovado p/ Indústria',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300 font-semibold',
  },
  solicitar_informacao_promotor: {
    label: 'Solicitar Info Promotor',
    badgeClass: 'bg-orange-100 text-orange-800 border-orange-300 font-semibold',
  },
  registrar_divergencia: {
    label: 'Divergência Registrada',
    badgeClass: 'bg-rose-100 text-rose-800 border-rose-300 font-semibold',
  },
  manter_em_analise: {
    label: 'Manter em Análise',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-300',
  },
  rejeitado: {
    label: 'Item Rejeitado',
    badgeClass: 'bg-red-100 text-red-800 border-red-300',
  },
}

export const StatusBadge: React.FC<{ status: DevolucaoStatus; className?: string }> = ({
  status,
  className,
}) => {
  const conf = STATUS_LABELS[status] || STATUS_LABELS.em_analise
  return (
    <Badge
      variant="outline"
      className={`inline-flex items-center text-xs font-medium px-2.5 py-0.5 rounded-full border shadow-2xs ${conf.bg} ${className || ''}`}
    >
      {conf.icon}
      <span>{conf.label}</span>
    </Badge>
  )
}

export const AuditoriaBadge: React.FC<{
  classificacao?: AuditoriaClassificacao
  compact?: boolean
  className?: string
}> = ({ classificacao = 'nao_auditado', compact = false, className }) => {
  const conf = AUDITORIA_LABELS[classificacao] || AUDITORIA_LABELS.nao_auditado
  return (
    <Badge
      variant="outline"
      className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-0.5 rounded-md border ${conf.badgeClass} ${className || ''}`}
    >
      {conf.icon}
      <span>{compact ? conf.label.split(' ')[0] : conf.label}</span>
    </Badge>
  )
}
