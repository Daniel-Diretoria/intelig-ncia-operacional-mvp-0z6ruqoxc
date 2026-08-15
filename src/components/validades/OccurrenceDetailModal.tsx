import React from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Building2, Store, Package, User, MapPin, Calendar, Hash, Layers } from 'lucide-react'
import type { ValidadeItem } from '@/types'
import { classificarCriticidade, getCriticidadeFaixa } from '@/lib/data/criticidade'
import { CriticidadeBadge } from './CriticidadeBadge'

interface OccurrenceDetailModalProps {
  isOpen: boolean
  onClose: () => void
  item: ValidadeItem | null
  onDrill?: (item: ValidadeItem) => void
}

const fmtMoney = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtInt = (v: number) => v.toLocaleString('pt-BR')

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

export const OccurrenceDetailModal: React.FC<OccurrenceDetailModalProps> = ({
  isOpen,
  onClose,
  item,
  onDrill,
}) => {
  if (!item) return null
  const nivel = classificarCriticidade(item.diasRestantes)
  const faixa = getCriticidadeFaixa(nivel)
  const quantidade = item.quantidade ?? item.estoque
  const exposicao = quantidade * (item.precoUnitario ?? 0)

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Detalhe da ocorrência"
      description={`Ocorrência ${item.id}`}
      maxWidth="xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose} className="h-9">
            Fechar
          </Button>
          {onDrill && (
            <Button
              onClick={() => {
                onDrill(item)
                onClose()
              }}
              className="h-9 bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              Ver contexto (drill-down)
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100">
          <div className="min-w-0">
            <p className="text-base font-bold text-slate-900">{item.product}</p>
            <p className="text-xs text-slate-500 mt-0.5">
              SKU {item.sku} • Lote {item.lote} • {item.category}
            </p>
          </div>
          <CriticidadeBadge level={nivel} diasRestantes={item.diasRestantes} />
        </div>

        {/* Alerta para críticos */}
        {nivel === 'Crítico' && (
          <div className="p-2.5 rounded-lg bg-red-50 border border-red-200/70 text-xs text-red-700 font-medium">
            ⚠ {faixa.descricao}. Ação imediata recomendada.
          </div>
        )}

        {/* Grid de dados */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
          <Field icon={Building2} label="Cliente" value={item.cliente} />
          <Field icon={Layers} label="Indústria" value={item.industria} />
          <Field icon={Store} label="Loja" value={item.loja} />
          <Field
            icon={MapPin}
            label="Cidade / UF"
            value={`${item.cidade ?? '—'} / ${item.uf ?? '—'}`}
          />
          <Field
            icon={Hash}
            label="Quantidade envolvida"
            value={`${fmtInt(quantidade)} ${item.unidade}`}
          />
          <Field
            icon={Calendar}
            label="Data de validade"
            value={new Date(item.validade + 'T00:00:00').toLocaleDateString('pt-BR')}
          />
          <Field icon={User} label="Promotor" value={item.promotor} />
          <Field icon={User} label="Supervisor" value={item.supervisor} />
        </div>

        {/* Financeiro */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-lg border border-slate-200 bg-white">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Preço unitário
            </p>
            <p className="text-lg font-bold text-slate-900 tabular-nums">
              {fmtMoney(item.precoUnitario ?? 0)}
            </p>
          </div>
          <div className="p-3 rounded-lg border border-indigo-200 bg-indigo-50/50">
            <p className="text-[11px] font-semibold text-indigo-400 uppercase tracking-wider">
              Exposição financeira
            </p>
            <p className="text-lg font-bold text-indigo-700 tabular-nums">{fmtMoney(exposicao)}</p>
          </div>
        </div>

        <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-100">
          <span>
            Última atualização:{' '}
            {item.ultimaAtualizacao
              ? new Date(item.ultimaAtualizacao).toLocaleString('pt-BR')
              : '—'}
          </span>
          <span className="flex items-center gap-1">
            <Package className="w-3 h-3" /> Estoque: {fmtInt(item.estoque)} {item.unidade}
          </span>
        </div>
      </div>
    </Modal>
  )
}
