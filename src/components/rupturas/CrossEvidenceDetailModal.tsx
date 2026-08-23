import React, { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  HelpCircle,
  Clock,
  Store,
  Package,
  Calendar,
  Layers,
  ArrowRight,
  ShieldCheck,
  Building,
} from 'lucide-react'
import type { CrossEvidence } from '@/types'
import { formatDisplayDate } from '@/lib/format/dateParser'
import { formatStoreIdentity } from '@/lib/format/storeIdentity'

interface CrossEvidenceDetailModalProps {
  isOpen: boolean
  onClose: () => void
  item: CrossEvidence | null
  onConfirm: (item: CrossEvidence) => Promise<void>
  onReject: (item: CrossEvidence, reason: string) => Promise<void>
}

export const CrossEvidenceDetailModal: React.FC<CrossEvidenceDetailModalProps> = ({
  isOpen,
  onClose,
  item,
  onConfirm,
  onReject,
}) => {
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (!item) return null

  const handleConfirmAction = async () => {
    setIsSubmitting(true)
    try {
      await onConfirm(item)
      onClose()
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRejectAction = async () => {
    if (!reason.trim()) return
    setIsSubmitting(true)
    try {
      await onReject(item, reason.trim())
      setRejecting(false)
      setReason('')
      onClose()
    } finally {
      setIsSubmitting(false)
    }
  }

  // Gera texto explicativo "Por que esta correspondência?"
  const getExplanationText = () => {
    const storeCodeText = item.store_code
      ? `código de loja (${item.store_code})`
      : 'mesmo nome de loja'
    const productInfo = item.product_code
      ? `código de produto (${item.product_code}) e descrição (${item.product_name})`
      : `mesmo produto (${item.product_name})`
    const daysText =
      item.resolution_days === 0
        ? 'na mesma data da ruptura (sem horário detalhado)'
        : `${item.resolution_days} ${item.resolution_days === 1 ? 'dia' : 'dias'} após o registro da ruptura`
    const expiryText = formatDisplayDate(item.product_expiry_date)

    if (item.confidence === 'high') {
      return `Mesmo ${storeCodeText} + mesmo ${productInfo}; pesquisa realizada ${daysText}; ${item.quantity_found} unidades encontradas com validade futura (${expiryText}).`
    } else if (item.confidence === 'medium') {
      return `Mesmo ${storeCodeText} + descrição correspondente (${item.product_name}); pesquisa realizada ${daysText}; ${item.quantity_found} unidades encontradas com validade (${expiryText}). Aguardando revisão manual.`
    } else {
      if (item.resolution_days === 0) {
        return `Mesmo ${storeCodeText} e produto coletados no mesmo dia (${formatDisplayDate(item.rupture_detected_at)}). Sem horário exato, a precedência é inconclusiva.`
      }
      return `Correspondência parcial ou similar para ${item.product_name} em ${item.store_name}. Recomendada verificação manual dos registros.`
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <Badge
              variant="outline"
              className={
                item.confidence === 'high'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : item.confidence === 'medium'
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : 'bg-slate-100 text-slate-700 border-slate-200'
              }
            >
              {item.confidence === 'high'
                ? 'Alta Confiança'
                : item.confidence === 'medium'
                  ? 'Média Confiança'
                  : 'Inconclusivo'}
            </Badge>
            <Badge
              variant="outline"
              className={
                item.review_status === 'confirmed'
                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                  : item.review_status === 'rejected'
                    ? 'bg-red-100 text-red-800 border-red-300'
                    : 'bg-slate-100 text-slate-700 border-slate-300'
              }
            >
              Revisão:{' '}
              {item.review_status === 'confirmed'
                ? 'Confirmado'
                : item.review_status === 'rejected'
                  ? 'Rejeitado'
                  : 'Pendente'}
            </Badge>
          </div>
          <DialogTitle className="text-lg font-bold text-slate-900">
            Confronto Ruptura × Validade (Modo Shadow)
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Evidência gerada pelo motor de reconciliação cronológica. ID:{' '}
            <code className="text-slate-700 font-mono">{item.evidence_key}</code>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Card: Por que esta correspondência? */}
          <div className="p-3.5 rounded-xl bg-indigo-50/70 border border-indigo-200 space-y-1">
            <p className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-indigo-600" />
              Por que esta correspondência?
            </p>
            <p className="text-xs text-indigo-900 leading-relaxed">{getExplanationText()}</p>
          </div>

          {/* Dados Lado a Lado: Ruptura vs Validade */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Lado Esquerdo: Ruptura */}
            <div className="p-3.5 rounded-xl border border-red-200 bg-red-50/30 space-y-2.5">
              <div className="flex items-center justify-between border-b border-red-100 pb-1.5">
                <span className="text-xs font-bold text-red-900 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                  Ruptura Registrada
                </span>
                <Badge
                  variant="outline"
                  className="text-[10px] bg-red-100 text-red-800 border-red-200"
                >
                  Data Visita
                </Badge>
              </div>

              <div className="space-y-1.5 text-xs">
                <div>
                  <span className="text-slate-500 block text-[11px]">Loja:</span>
                  <span className="font-semibold text-slate-800">
                    {formatStoreIdentity({
                      codigo_loja: item.store_code,
                      nome_loja: item.store_name,
                    })}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">Produto em Ruptura:</span>
                  <span className="font-semibold text-slate-800">{item.product_name}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">Cliente / Marca:</span>
                  <span className="font-medium text-slate-700">{item.client_or_brand || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">
                    Data da Ruptura (Visita):
                  </span>
                  <span className="font-bold text-red-700 font-mono">
                    {formatDisplayDate(item.rupture_detected_at)}
                  </span>
                </div>
              </div>
            </div>

            {/* Lado Direito: Evidência de Validade */}
            <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/30 space-y-2.5">
              <div className="flex items-center justify-between border-b border-emerald-100 pb-1.5">
                <span className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  Evidência de Validade
                </span>
                <Badge
                  variant="outline"
                  className="text-[10px] bg-emerald-100 text-emerald-800 border-emerald-200"
                >
                  Estoque em Gôndola
                </Badge>
              </div>

              <div className="space-y-1.5 text-xs">
                <div>
                  <span className="text-slate-500 block text-[11px]">
                    Data da Pesquisa (Realizado):
                  </span>
                  <span className="font-bold text-emerald-700 font-mono">
                    {formatDisplayDate(item.stock_evidence_at)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">Quantidade Encontrada:</span>
                  <span className="font-bold text-slate-800">{item.quantity_found} un</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">Validade do Produto:</span>
                  <span className="font-semibold text-slate-800 font-mono">
                    {formatDisplayDate(item.product_expiry_date)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">Intervalo até Evidência:</span>
                  <span className="font-bold text-indigo-700">
                    {item.resolution_days} {item.resolution_days === 1 ? 'dia' : 'dias'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Se rejeitado, mostra motivo */}
          {item.review_status === 'rejected' && item.rejection_reason && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-900 space-y-1">
              <p className="font-bold">Motivo da Rejeição:</p>
              <p>{item.rejection_reason}</p>
              {item.reviewed_by && (
                <p className="text-[10px] text-red-700">
                  Revisado por {item.reviewed_by} em {formatDisplayDate(item.reviewed_at)}
                </p>
              )}
            </div>
          )}

          {/* Form de rejeição se aberto */}
          {rejecting && (
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <label className="text-xs font-semibold text-slate-800 block">
                Motivo da rejeição da evidência:
              </label>
              <Textarea
                placeholder="Ex: Produto com sabor/versão diferente, lote avariado, etc."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="text-xs h-20 bg-white"
              />
              <div className="flex justify-end gap-2 pt-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setRejecting(false)}
                  disabled={isSubmitting}
                  className="h-8 text-xs"
                >
                  Cancelar
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleRejectAction}
                  disabled={!reason.trim() || isSubmitting}
                  className="h-8 text-xs"
                >
                  Confirmar Rejeição
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-3 border-t border-slate-100">
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            className="w-full sm:w-auto h-9 text-xs"
          >
            Fechar
          </Button>

          {!rejecting && item.review_status !== 'confirmed' && (
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRejecting(true)}
                disabled={isSubmitting}
                className="flex-1 sm:flex-initial h-9 text-xs border-red-200 text-red-700 hover:bg-red-50 gap-1.5"
              >
                <XCircle className="w-3.5 h-3.5 text-red-600" />
                Rejeitar Evidência
              </Button>
              <Button
                size="sm"
                onClick={handleConfirmAction}
                disabled={isSubmitting}
                className="flex-1 sm:flex-initial h-9 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Confirmar Evidência
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
