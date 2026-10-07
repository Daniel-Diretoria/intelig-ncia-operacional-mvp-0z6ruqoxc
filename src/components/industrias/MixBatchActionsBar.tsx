import React, { useState } from 'react'
import {
  CheckSquare,
  Sparkles,
  PlusCircle,
  MinusCircle,
  X,
  AlertTriangle,
  Loader2,
  CheckCircle2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { CadastroProduto } from '@/types/cadastros'
import { MixBatchActionResult } from '@/services/cadastrosService'

export type MixBatchActionType =
  | 'adicionar_mix_oficial'
  | 'remover_mix_oficial'
  | 'promover_observado_oficial'

interface MixBatchActionsBarProps {
  selectedCount: number
  selectedProducts: CadastroProduto[]
  contextIndustryName?: string
  canEdit: boolean
  isProcessing: boolean
  onClearSelection: () => void
  onExecuteAction: (action: MixBatchActionType) => Promise<MixBatchActionResult | void>
}

export const MixBatchActionsBar: React.FC<MixBatchActionsBarProps> = ({
  selectedCount,
  selectedProducts,
  contextIndustryName,
  canEdit,
  isProcessing,
  onClearSelection,
  onExecuteAction,
}) => {
  const [confirmDialogAction, setConfirmDialogAction] = useState<MixBatchActionType | null>(null)
  const [lastResult, setLastResult] = useState<MixBatchActionResult | null>(null)

  if (selectedCount === 0) return null

  // Quantidade de selecionados que são observados
  const observedCount = selectedProducts.filter(
    (p) => p.tipo_mix === 'observado_operacional',
  ).length

  // Quantidade de selecionados que são oficiais
  const officialCount = selectedProducts.filter((p) => p.tipo_mix === 'oficial_industria').length

  const handleOpenConfirm = (action: MixBatchActionType) => {
    if (!canEdit) return
    setConfirmDialogAction(action)
  }

  const handleConfirmSubmit = async () => {
    if (!confirmDialogAction) return
    const actionToRun = confirmDialogAction
    setConfirmDialogAction(null)
    const res = await onExecuteAction(actionToRun)
    if (res) {
      setLastResult(res)
    }
  }

  // Textos para o diálogo de confirmação
  const getDialogDetails = () => {
    const indText = contextIndustryName ? ` da indústria "${contextIndustryName}"` : ''
    switch (confirmDialogAction) {
      case 'adicionar_mix_oficial':
        return {
          title: 'Adicionar ao Mix Oficial?',
          desc: `Esta ação adicionará ${selectedCount} produto(s) selecionado(s) ao Mix Oficial${indText}. O histórico cadastral permanece preservado.`,
          warning:
            'Ação explícita do administrador. Nenhum produto do catálogo é promovido automaticamente.',
          btnText: 'Confirmar e Adicionar',
          btnClass: 'bg-emerald-600 hover:bg-emerald-700 text-white',
        }
      case 'remover_mix_oficial':
        return {
          title: 'Remover do Mix Oficial?',
          desc: `Esta ação definirá ${selectedCount} produto(s) selecionado(s) como Mix Observado${indText}. Os produtos continuam na base e nenhuma evidência histórica será apagada.`,
          warning:
            'Produtos removidos do Mix Oficial deixam de compor a lista mestra exigida da indústria.',
          btnText: 'Confirmar e Remover',
          btnClass: 'bg-amber-600 hover:bg-amber-700 text-white',
        }
      case 'promover_observado_oficial':
        return {
          title: 'Promover Observado → Mix Oficial?',
          desc: `Esta ação promoverá ${observedCount} produto(s) de origem observada para o Mix Oficial${indText}. Produtos que já são oficiais não sofrerão alteração.`,
          warning:
            'Conforme diretriz SKIP (Item 35): produtos observados originados na operação são preservados como descoberta, e a promoção para Mix Oficial é SEMPRE explícita pelo administrador.',
          btnText: `Confirmar Promoção de ${observedCount} Produto(s)`,
          btnClass: 'bg-indigo-600 hover:bg-indigo-700 text-white',
        }
      default:
        return {
          title: '',
          desc: '',
          warning: '',
          btnText: 'Confirmar',
          btnClass: 'bg-indigo-600 text-white',
        }
    }
  }

  const dialogDetails = getDialogDetails()

  return (
    <>
      <div
        data-testid="mix-batch-actions-bar"
        className="sticky top-4 z-20 flex flex-col sm:flex-row items-center justify-between gap-3 p-3.5 bg-slate-900 text-white rounded-xl shadow-xl border border-slate-800 animate-in fade-in slide-in-from-top-2 duration-200"
      >
        {/* Lado Esquerdo: Contadores */}
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="flex items-center gap-2">
            <CheckSquare className="w-5 h-5 text-indigo-400 shrink-0" />
            <span className="font-semibold text-sm">
              {selectedCount}{' '}
              {selectedCount === 1 ? 'produto selecionado' : 'produtos selecionados'}
            </span>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {observedCount > 0 && (
              <Badge
                variant="outline"
                className="text-[10px] bg-blue-950/80 text-blue-300 border-blue-800"
              >
                {observedCount} Observado(s)
              </Badge>
            )}
            {officialCount > 0 && (
              <Badge
                variant="outline"
                className="text-[10px] bg-emerald-950/80 text-emerald-300 border-emerald-800"
              >
                {officialCount} Oficial(is)
              </Badge>
            )}
            {contextIndustryName && (
              <Badge
                variant="outline"
                className="text-[10px] bg-slate-800 text-slate-300 border-slate-700 font-mono"
              >
                {contextIndustryName}
              </Badge>
            )}
          </div>
        </div>

        {/* Lado Direito: Ações em Lote */}
        <div className="flex items-center gap-2 flex-wrap justify-end w-full sm:w-auto">
          {canEdit ? (
            <>
              {/* Botão: Adicionar ao Mix Oficial */}
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={isProcessing}
                onClick={() => handleOpenConfirm('adicionar_mix_oficial')}
                className="text-xs h-8 gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white border-0 font-medium"
              >
                {isProcessing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <PlusCircle className="w-3.5 h-3.5" />
                )}
                <span>Adicionar ao Mix Oficial</span>
              </Button>

              {/* Botão: Remover do Mix Oficial */}
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isProcessing}
                onClick={() => handleOpenConfirm('remover_mix_oficial')}
                className="text-xs h-8 gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700 font-medium"
              >
                {isProcessing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <MinusCircle className="w-3.5 h-3.5 text-amber-400" />
                )}
                <span>Remover do Mix Oficial</span>
              </Button>

              {/* Botão: Promover Observado → Oficial (habilitado apenas se houver produtos observados) */}
              <Button
                type="button"
                size="sm"
                disabled={isProcessing || observedCount === 0}
                onClick={() => handleOpenConfirm('promover_observado_oficial')}
                className={`text-xs h-8 gap-1.5 font-medium transition-all ${
                  observedCount > 0
                    ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-xs'
                    : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                }`}
                title={
                  observedCount > 0
                    ? `Promover ${observedCount} produto(s) de origem Observado para Oficial`
                    : 'Nenhum produto observado selecionado para promoção'
                }
              >
                {isProcessing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                )}
                <span>Promover Observado → Oficial ({observedCount})</span>
              </Button>
            </>
          ) : (
            <span className="text-xs text-slate-400 italic">
              Modo somente leitura (permissão necessária para alterar mix)
            </span>
          )}

          {/* Desmarcar seleção */}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={isProcessing}
            onClick={onClearSelection}
            className="text-xs h-8 px-2 text-slate-400 hover:text-white hover:bg-slate-800"
            title="Limpar seleção"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* DIÁLOGO OBRIGATÓRIO DE CONFIRMAÇÃO DA AÇÃO EM LOTE */}
      <Dialog
        open={confirmDialogAction !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDialogAction(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2 text-indigo-600 mb-1">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              <DialogTitle className="text-base font-bold text-slate-900">
                {dialogDetails.title}
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-slate-600 leading-relaxed pt-1">
              {dialogDetails.desc}
            </DialogDescription>
          </DialogHeader>

          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-900 leading-relaxed space-y-1">
            <span className="font-semibold block">Regra de Governança SKIP:</span>
            <p>{dialogDetails.warning}</p>
          </div>

          {/* Resumo da lista a ser afetada */}
          <div className="space-y-1.5 max-h-44 overflow-y-auto border border-slate-200 rounded-lg p-2.5 bg-slate-50 text-xs">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Itens selecionados ({selectedProducts.length}):
            </div>
            {selectedProducts.slice(0, 10).map((prod) => (
              <div
                key={prod.id}
                className="flex items-center justify-between text-[11px] py-0.5 border-b border-slate-100 last:border-0"
              >
                <span className="font-medium text-slate-800 truncate mr-2">
                  {prod.nome_produto}
                </span>
                <Badge
                  variant="outline"
                  className={
                    prod.tipo_mix === 'oficial_industria'
                      ? 'text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200 shrink-0'
                      : 'text-[10px] bg-blue-50 text-blue-700 border-blue-200 shrink-0'
                  }
                >
                  {prod.tipo_mix === 'oficial_industria' ? 'Oficial' : 'Observado'}
                </Badge>
              </div>
            ))}
            {selectedProducts.length > 10 && (
              <div className="text-[11px] text-slate-500 italic pt-1 text-center">
                ... e mais {selectedProducts.length - 10} produto(s)
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setConfirmDialogAction(null)}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleConfirmSubmit}
              className={`text-xs ${dialogDetails.btnClass}`}
            >
              {dialogDetails.btnText}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIÁLOGO DE RESULTADO APÓS APLICAÇÃO */}
      <Dialog
        open={lastResult !== null}
        onOpenChange={(open) => {
          if (!open) setLastResult(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2 text-emerald-600 mb-1">
              <CheckCircle2 className="w-5 h-5" />
              <DialogTitle className="text-base font-bold text-slate-900">
                Ação em Lote Concluída
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-slate-600">
              O processamento foi finalizado com sucesso e a listagem foi atualizada.
            </DialogDescription>
          </DialogHeader>

          {lastResult && (
            <div className="space-y-3 py-2 text-xs">
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <span className="block text-2xl font-bold text-emerald-700">
                    {lastResult.sucessos}
                  </span>
                  <span className="text-[11px] text-emerald-800 font-medium">
                    Produtos Atualizados
                  </span>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <span className="block text-2xl font-bold text-slate-700">
                    {lastResult.totalSolicitados}
                  </span>
                  <span className="text-[11px] text-slate-600 font-medium">Total Selecionado</span>
                </div>
              </div>

              {lastResult.falhas > 0 && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-900 text-[11px] space-y-1">
                  <span className="font-semibold block">Houve {lastResult.falhas} falha(s):</span>
                  <ul className="list-disc list-inside">
                    {lastResult.erros.map((e) => (
                      <li key={e.id}>
                        {e.nome}: {e.erro}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              size="sm"
              onClick={() => setLastResult(null)}
              className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white w-full sm:w-auto"
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
