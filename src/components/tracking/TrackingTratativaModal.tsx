import React, { useState, useEffect } from 'react'
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
import {
  AlertTriangle,
  Clock,
  CheckCircle2,
  Send,
  HelpCircle,
  FileEdit,
  History,
  Info,
  ShieldAlert,
} from 'lucide-react'
import type {
  OperationalTrackingItem,
  TratativaResultado,
  TrackingTratativa,
} from '@/types/operationalTracking'
import {
  createTrackingTratativa,
  getTrackingTratativas,
} from '@/services/trackingTratativasService'
import { formatDisplayDate } from '@/lib/format/dateParser'

interface TrackingTratativaModalProps {
  item: OperationalTrackingItem | null
  open: boolean
  onClose: () => void
  onSuccess?: () => void
}

const RESULTADOS_OPCOES: Array<{
  value: TratativaResultado
  label: string
  descricao: string
  impactoMix?: boolean
}> = [
  {
    value: 'atualizacao_solicitada',
    label: 'Atualização solicitada ao promotor',
    descricao: 'Enviada mensagem/aviso ao promotor responsável solicitando atualização em campo.',
  },
  {
    value: 'aguardando_retorno',
    label: 'Aguardando retorno',
    descricao: 'Demanda aberta, aguardando manifestação ou visita do promotor na loja.',
  },
  {
    value: 'produto_vendido_zerado',
    label: 'Produto vendido / Estoque zerado',
    descricao: 'Confirmado que o produto teve giro completo e estoque encontra-se zerado.',
  },
  {
    value: 'ruptura_confirmada',
    label: 'Ruptura confirmada',
    descricao: 'Confirmado desabastecimento na gôndola/estoque na loja.',
  },
  {
    value: 'produto_nao_trabalha_mais',
    label: 'Produto não trabalha mais na loja',
    descricao:
      'A loja deixou de comercializar o item (sugere revisão do Mix Definido sem exclusão automática).',
    impactoMix: true,
  },
  {
    value: 'mix_loja_precisa_atualizar',
    label: 'Mix da loja precisa ser atualizado',
    descricao: 'Divergência entre o cadastro esperado e o sortimento acordado para a loja.',
    impactoMix: true,
  },
  {
    value: 'pesquisa_inconsistente',
    label: 'Pesquisa / Importação inconsistente',
    descricao: 'Problema técnico, coleta incompleta ou falha de importação no ciclo.',
  },
  {
    value: 'situacao_regularizada',
    label: 'Situação regularizada',
    descricao: 'Acompanhamento normalizado após confirmação ou nova coleta.',
  },
  {
    value: 'observacao_manual',
    label: 'Observação manual',
    descricao: 'Anotação livre para fins operacionais.',
  },
]

export const TrackingTratativaModal: React.FC<TrackingTratativaModalProps> = ({
  item,
  open,
  onClose,
  onSuccess,
}) => {
  const [resultado, setResultado] = useState<TratativaResultado>('atualizacao_solicitada')
  const [observacao, setObservacao] = useState('')
  const [resposta, setResposta] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [historico, setHistorico] = useState<TrackingTratativa[]>([])
  const [isLoadingHistorico, setIsLoadingHistorico] = useState(false)

  // Carrega histórico cronológico de tratativas deste produto/loja
  useEffect(() => {
    if (open && item) {
      setIsLoadingHistorico(true)
      getTrackingTratativas({
        industryName: item.industryName,
        storeName: item.storeName,
        productName: item.productName,
      })
        .then((records) => setHistorico(records))
        .finally(() => setIsLoadingHistorico(false))
    }
  }, [open, item])

  if (!item) return null

  const handleSalvar = async () => {
    setIsSubmitting(true)
    try {
      await createTrackingTratativa({
        industry_name: item.industryName,
        store_code: item.storeCode,
        store_name: item.storeName,
        product_name: item.productName,
        product_code: item.productCode,
        resultado,
        usuario_nome: 'Operador Inteligência',
        observacao,
        resposta,
        motivo_identificacao: item.prioridadeExplicacao,
        ultimo_estado_conhecido_json: item.ultimoEstado,
        sugestao_mix_loja:
          resultado === 'produto_nao_trabalha_mais' || resultado === 'mix_loja_precisa_atualizar',
      })
      setObservacao('')
      setResposta('')
      if (onSuccess) onSuccess()
      onClose()
    } catch (err) {
      console.error('Erro ao registrar tratativa:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const selectedOpcao = RESULTADOS_OPCOES.find((o) => o.value === resultado)

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="text-xs bg-indigo-50 text-indigo-700 border-indigo-200"
            >
              {item.industryName}
            </Badge>
            <span className="text-xs text-slate-400">•</span>
            <span className="text-xs font-semibold text-slate-700">{item.storeName}</span>
          </div>
          <DialogTitle className="text-lg font-bold text-slate-900 mt-1">
            Registrar Acompanhamento: {item.productName}
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Trate ausências de pesquisa, coletas pendentes e alinhe a inteligência operacional sem
            perder o histórico.
          </DialogDescription>
        </DialogHeader>

        {/* ÚLTIMO ESTADO CONHECIDO (PRESERVADO) */}
        <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-bold text-slate-700 flex items-center gap-1.5">
              <History className="w-3.5 h-3.5 text-indigo-600" />
              Último Estado Conhecido
            </span>
            <div className="flex items-center gap-1.5">
              <Badge
                variant="outline"
                className={
                  item.acompanhamentoStatus === 'critico'
                    ? 'bg-red-50 text-red-700 border-red-200 text-[10px]'
                    : item.acompanhamentoStatus === 'atencao'
                      ? 'bg-amber-50 text-amber-700 border-amber-200 text-[10px]'
                      : 'bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]'
                }
              >
                Acomp.: {item.acompanhamentoStatus.toUpperCase()}
              </Badge>
              <Badge
                variant="outline"
                className={
                  item.validadeStatus === 'critico'
                    ? 'bg-red-50 text-red-700 border-red-200 text-[10px]'
                    : item.validadeStatus === 'atencao'
                      ? 'bg-amber-50 text-amber-700 border-amber-200 text-[10px]'
                      : 'bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]'
                }
              >
                Validade: {item.validadeStatus.toUpperCase()}
              </Badge>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-slate-200 text-[11px] text-slate-600">
            <div>
              <span className="text-slate-400 block">Última atualização:</span>
              <strong className="text-slate-800">
                {formatDisplayDate(item.ultimoEstado.ultimaDataAtualizacao, 'Sem registro')}
              </strong>
            </div>
            <div>
              <span className="text-slate-400 block">Último estoque:</span>
              <strong className="text-slate-800">
                {item.ultimoEstado.ultimaQuantidadeConhecida !== undefined
                  ? `${item.ultimoEstado.ultimaQuantidadeConhecida} un.`
                  : 'Desconhecido'}
              </strong>
            </div>
            <div>
              <span className="text-slate-400 block">Última validade:</span>
              <strong className="text-slate-800">
                {formatDisplayDate(item.ultimoEstado.ultimaValidadeConhecida, 'Sem registro')}
              </strong>
            </div>
            <div>
              <span className="text-slate-400 block">Ciclos ausente:</span>
              <strong className="text-red-700 font-bold">
                {item.ultimoEstado.ciclosSemAtualizacao} ciclo(s)
              </strong>
            </div>
          </div>

          {item.possuiRupturaRecente && item.rupturaDetalhes && (
            <div className="mt-1 p-2 rounded bg-amber-50 border border-amber-200 text-[11px] text-amber-900">
              <strong>Ruptura associada:</strong> {item.rupturaDetalhes.motivo} (registrada em{' '}
              {formatDisplayDate(item.rupturaDetalhes.dataVisita)})
            </div>
          )}
        </div>

        {/* FORMULÁRIO DE TRATATIVA */}
        <div className="space-y-4 py-2">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Resultado da Tratativa
            </label>
            <select
              value={resultado}
              onChange={(e) => setResultado(e.target.value as TratativaResultado)}
              className="w-full text-xs rounded-lg border border-slate-300 p-2.5 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {RESULTADOS_OPCOES.map((op) => (
                <option key={op.value} value={op.value}>
                  {op.label}
                </option>
              ))}
            </select>
            {selectedOpcao && (
              <p className="text-[11px] text-slate-500 mt-1">{selectedOpcao.descricao}</p>
            )}
          </div>

          {selectedOpcao?.impactoMix && (
            <div className="p-2.5 rounded-lg bg-indigo-50 border border-indigo-200 text-[11px] text-indigo-900 flex items-start gap-2">
              <Info className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
              <div>
                <strong>Atenção operacional ao Mix:</strong> Esta tratativa sinaliza uma sugestão
                para revisão do Mix Definido da loja no Cadastro Operacional da Indústria. O produto
                <strong> NUNCA será removido automaticamente</strong> sem confirmação manual.
              </div>
            </div>
          )}

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Observação / Ação Realizada
            </label>
            <textarea
              rows={2}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Ex: Promotor avisado pelo WhatsApp, confirmou que vai verificar na terça..."
              className="w-full text-xs rounded-lg border border-slate-300 p-2.5 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Resposta do Campo (opcional)
            </label>
            <input
              type="text"
              value={resposta}
              onChange={(e) => setResposta(e.target.value)}
              placeholder="Ex: Promotor informou estoque zerado no depósito..."
              className="w-full text-xs rounded-lg border border-slate-300 p-2.5 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* HISTÓRICO / LINHA DO TEMPO */}
        <div className="pt-3 border-t border-slate-200">
          <h4 className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1.5">
            <History className="w-3.5 h-3.5 text-slate-500" />
            Linha do Tempo de Tratativas ({historico.length})
          </h4>

          {isLoadingHistorico ? (
            <p className="text-xs text-slate-400 py-2">Carregando histórico...</p>
          ) : historico.length === 0 ? (
            <p className="text-xs text-slate-400 py-2 italic">
              Nenhuma tratativa anterior registrada para esta combinação.
            </p>
          ) : (
            <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
              {historico.map((h) => (
                <div
                  key={h.id}
                  className="p-2 rounded bg-slate-50 border border-slate-200 text-[11px] text-slate-700 space-y-0.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-indigo-700">
                      {RESULTADOS_OPCOES.find((r) => r.value === h.resultado)?.label || h.resultado}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {formatDisplayDate(h.data_identificacao || h.created)} por {h.usuario_nome}
                    </span>
                  </div>
                  {h.observacao && <p className="text-slate-600">{h.observacao}</p>}
                  {h.resposta && <p className="text-emerald-700">Resposta: {h.resposta}</p>}
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="mt-4 flex items-center justify-between sm:justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={handleSalvar}
            disabled={isSubmitting}
            className="bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5"
          >
            <CheckCircle2 className="w-4 h-4" />
            {isSubmitting ? 'Salvando...' : 'Salvar Tratativa'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
