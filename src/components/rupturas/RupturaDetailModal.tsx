import React from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Building2,
  Store,
  Package,
  User,
  MapPin,
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle2,
  FileText,
} from 'lucide-react'
import type { Ruptura } from '@/types'
import { formatStoreDisplay } from '@/lib/data/storeRecognition'

interface RupturaDetailModalProps {
  isOpen: boolean
  onClose: () => void
  item: Ruptura | null
}

function Field({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-2.5 py-2">
      <div className="w-7 h-7 rounded-md bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">
        <Icon className="w-3.5 h-3.5" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
        <p className="text-sm text-slate-800 font-medium break-words">{value || '—'}</p>
      </div>
    </div>
  )
}

function formatBrDate(d?: string) {
  if (!d) return '—'
  const dateObj = new Date(d.includes('T') ? d : d + 'T00:00:00')
  return isNaN(dateObj.getTime()) ? d : dateObj.toLocaleDateString('pt-BR')
}

export const RupturaDetailModal: React.FC<RupturaDetailModalProps> = ({
  isOpen,
  onClose,
  item,
}) => {
  if (!item) return null

  const isAtivo = item.situacao_atual === 'Ativo'
  const storeLabel = formatStoreDisplay(item.codigo_loja, item.nome_loja)

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Detalhe da Ruptura"
      description={`ID: ${item.id || item.operational_key}`}
      maxWidth="xl"
      footer={
        <Button variant="outline" onClick={onClose} className="h-9">
          Fechar
        </Button>
      }
    >
      <div className="space-y-4">
        {/* Header com Status */}
        <div className="flex items-start justify-between gap-3 p-3.5 rounded-lg bg-slate-50 border border-slate-100">
          <div className="min-w-0">
            <p className="text-base font-bold text-slate-900">{item.produto}</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Categoria: {item.categoria || 'Não informada'}
            </p>
          </div>
          <Badge
            variant="outline"
            className={
              isAtivo
                ? 'bg-red-50 text-red-700 border-red-200 font-semibold px-2.5 py-1'
                : 'bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold px-2.5 py-1'
            }
          >
            {isAtivo ? (
              <span className="flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                Ativo ({item.dias_em_ruptura} {item.dias_em_ruptura === 1 ? 'dia' : 'dias'})
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                Resolvido
              </span>
            )}
          </Badge>
        </div>

        {/* Informações da Loja e Cliente */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
          <Field icon={Store} label="Loja" value={storeLabel} />
          <Field
            icon={Building2}
            label="Cliente / Razão Social"
            value={item.cliente || item.nome_loja}
          />
          <Field
            icon={MapPin}
            label="Cidade / Estado"
            value={`${item.cidade || '—'} / ${item.estado || '—'}`}
          />
          <Field icon={FileText} label="CNPJ da Loja" value={item.cnpj_loja || '—'} />
          <Field icon={AlertTriangle} label="Motivo da Ruptura" value={item.motivo} />
          <Field icon={User} label="Colaborador / Auditor" value={item.colaborador || '—'} />
          <Field icon={Calendar} label="Data da Visita" value={formatBrDate(item.data_visita)} />
          <Field
            icon={Clock}
            label="Data de Entrada na Base"
            value={formatBrDate(item.data_entrada)}
          />
          <Field
            icon={Calendar}
            label="Última Aparição"
            value={formatBrDate(item.ultima_aparicao)}
          />
          {item.data_resolucao && (
            <Field
              icon={CheckCircle2}
              label="Data de Resolução"
              value={formatBrDate(item.data_resolucao)}
            />
          )}
        </div>

        {/* Observação */}
        {item.observacao && (
          <div className="p-3 rounded-lg border border-slate-200 bg-white">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Observação registrada
            </p>
            <p className="text-xs text-slate-700 whitespace-pre-wrap">{item.observacao}</p>
          </div>
        )}

        <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-100">
          <span>Chave operacional: {item.operational_key}</span>
          <span>Linha fonte: #{item.source_row}</span>
        </div>
      </div>
    </Modal>
  )
}
