import React, { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Plus, Trash2, Calendar, Store, Factory, User, Package, AlertCircle } from 'lucide-react'
import { CriarDevolucaoCasoInput, CriarDevolucaoItemInput } from '@/types/devolucoes'
import { toast } from '@/hooks/use-toast'

interface NovaSolicitacaoModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (novoCaso: CriarDevolucaoCasoInput) => Promise<void>
  industriasDisponiveis: Array<{ id: string; nome: string }>
  lojasDisponiveis: Array<{ codigo: string; nome: string }>
}

interface ItemFormState extends CriarDevolucaoItemInput {
  tempId: string
}

export const NovaSolicitacaoModal: React.FC<NovaSolicitacaoModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  industriasDisponiveis,
  lojasDisponiveis,
}) => {
  const [dataSolicitacao, setDataSolicitacao] = useState<string>(
    new Date().toISOString().slice(0, 10),
  )
  const [industriaNome, setIndustriaNome] = useState('')
  const [lojaSelecionada, setLojaSelecionada] = useState('')
  const [promotorNome, setPromotorNome] = useState('')
  const [motivoGeral, setMotivoGeral] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Itens da solicitação (múltiplos produtos na mesma solicitação - Regra 4 e 5)
  const [itens, setItens] = useState<ItemFormState[]>([
    {
      tempId: 'item-1',
      produto_nome_informado: '',
      quantidade_solicitada: 1,
      validade_informada: '',
      validade_ausente: false,
      motivo_item: '',
    },
  ])

  const handleAddItem = () => {
    setItens((prev) => [
      ...prev,
      {
        tempId: `item-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        produto_nome_informado: '',
        quantidade_solicitada: 1,
        validade_informada: '',
        validade_ausente: false,
        motivo_item: '',
      },
    ])
  }

  const handleRemoveItem = (tempId: string) => {
    if (itens.length === 1) {
      toast({
        title: 'Mínimo de 1 produto',
        description: 'A solicitação precisa ter pelo menos um produto cadastrado.',
        variant: 'destructive',
      })
      return
    }
    setItens((prev) => prev.filter((i) => i.tempId !== tempId))
  }

  const handleUpdateItem = (tempId: string, updates: Partial<ItemFormState>) => {
    setItens((prev) =>
      prev.map((it) => {
        if (it.tempId === tempId) {
          const updated = { ...it, ...updates }
          // Regra 5: Se marcar validade ausente, limpa data
          if (updates.validade_ausente) {
            updated.validade_informada = ''
          }
          return updated
        }
        return it
      }),
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!industriaNome.trim()) {
      toast({
        title: 'Indústria obrigatória',
        description: 'Selecione ou informe a indústria solicitada.',
        variant: 'destructive',
      })
      return
    }
    if (!lojaSelecionada.trim()) {
      toast({
        title: 'Loja obrigatória',
        description: 'Selecione ou informe a loja da solicitação.',
        variant: 'destructive',
      })
      return
    }
    if (!promotorNome.trim()) {
      toast({
        title: 'Promotor obrigatório',
        description: 'Informe o promotor/repositor que identificou os produtos.',
        variant: 'destructive',
      })
      return
    }

    // Validar itens
    for (let idx = 0; idx < itens.length; idx++) {
      const it = itens[idx]
      if (!it.produto_nome_informado.trim()) {
        toast({
          title: `Produto ${idx + 1} em branco`,
          description: 'Preencha a descrição ou nome do produto.',
          variant: 'destructive',
        })
        return
      }
      if (!it.quantidade_solicitada || it.quantidade_solicitada <= 0) {
        toast({
          title: `Quantidade inválida no item ${idx + 1}`,
          description: 'A quantidade solicitada deve ser maior que zero.',
          variant: 'destructive',
        })
        return
      }
    }

    // Resolver loja
    const lojaObj = lojasDisponiveis.find(
      (l) => l.codigo === lojaSelecionada || l.nome === lojaSelecionada,
    )
    const storeCode = lojaObj ? lojaObj.codigo : ''
    const storeName = lojaObj ? lojaObj.nome : lojaSelecionada

    const indObj = industriasDisponiveis.find((i) => i.nome === industriaNome)

    const payload: CriarDevolucaoCasoInput = {
      data_solicitacao: dataSolicitacao,
      industry_id: indObj?.id || '',
      industry_name: industriaNome,
      store_code: storeCode,
      store_name: storeName,
      promotor_nome: promotorNome.trim(),
      motivo_geral: motivoGeral.trim(),
      observacoes: observacoes.trim(),
      itens: itens.map((it) => ({
        produto_nome_informado: it.produto_nome_informado.trim(),
        quantidade_solicitada: Number(it.quantidade_solicitada),
        validade_informada: it.validade_ausente ? '' : it.validade_informada,
        validade_ausente: it.validade_ausente || false,
        motivo_item: it.motivo_item?.trim() || motivoGeral.trim(),
      })),
    }

    try {
      setIsSubmitting(true)
      await onSuccess(payload)
      onClose()
    } catch (err) {
      console.error('[NovaSolicitacaoModal] Erro ao cadastrar solicitação:', err)
      toast({
        title: 'Erro ao cadastrar caso',
        description: 'Não foi possível salvar o caso de devolução. Tente novamente.',
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Package className="w-5 h-5 text-indigo-600" />+ Nova Solicitação de Devolução / Troca
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-500">
            Cadastre a solicitação enviada pelo promotor. O SKIP cruzará o histórico operacional de
            validades e rupturas para apoiar a conferência.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 pt-2">
          {/* Dados Gerais da Solicitação */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5" />
              1. Dados Gerais da Solicitação
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <Label className="text-xs font-semibold text-slate-700">
                  Data da Solicitação *
                </Label>
                <Input
                  type="date"
                  value={dataSolicitacao}
                  onChange={(e) => setDataSolicitacao(e.target.value)}
                  required
                  className="mt-1 bg-white text-xs h-9"
                />
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-700">
                  Indústria / Fornecedor *
                </Label>
                <input
                  list="industrias-list"
                  type="text"
                  placeholder="Selecione ou digite..."
                  value={industriaNome}
                  onChange={(e) => setIndustriaNome(e.target.value)}
                  required
                  className="mt-1 w-full flex h-9 rounded-md border border-input bg-white px-3 py-1 text-xs shadow-2xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                />
                <datalist id="industrias-list">
                  {industriasDisponiveis.map((ind) => (
                    <option key={ind.id} value={ind.nome} />
                  ))}
                </datalist>
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-700">Loja *</Label>
                <input
                  list="lojas-list"
                  type="text"
                  placeholder="Cód ou Nome da loja..."
                  value={lojaSelecionada}
                  onChange={(e) => setLojaSelecionada(e.target.value)}
                  required
                  className="mt-1 w-full flex h-9 rounded-md border border-input bg-white px-3 py-1 text-xs shadow-2xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                />
                <datalist id="lojas-list">
                  {lojasDisponiveis.map((lj) => (
                    <option key={lj.codigo || lj.nome} value={lj.nome}>
                      {lj.codigo ? `[${lj.codigo}] ` : ''}
                      {lj.nome}
                    </option>
                  ))}
                </datalist>
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-700">
                  Promotor / Repositor *
                </Label>
                <Input
                  type="text"
                  placeholder="Nome do promotor..."
                  value={promotorNome}
                  onChange={(e) => setPromotorNome(e.target.value)}
                  required
                  className="mt-1 bg-white text-xs h-9"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-medium text-slate-600">
                  Motivo Geral da Devolução
                </Label>
                <Input
                  type="text"
                  placeholder="Ex: Vencido em gôndola, Troca por quebra, Avaria..."
                  value={motivoGeral}
                  onChange={(e) => setMotivoGeral(e.target.value)}
                  className="mt-1 bg-white text-xs h-9"
                />
              </div>

              <div>
                <Label className="text-xs font-medium text-slate-600">
                  Observações Operacionais
                </Label>
                <Input
                  type="text"
                  placeholder="Observação da mensagem do promotor ou alinhamento..."
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  className="mt-1 bg-white text-xs h-9"
                />
              </div>
            </div>
          </div>

          {/* Produtos Solicitados (Itens) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-2">
                  <Package className="w-3.5 h-3.5" />
                  2. Produtos Solicitados ({itens.length})
                </h4>
                <p className="text-[11px] text-slate-500">
                  Adicione todos os produtos da mensagem do promotor. Uma solicitação pode ter
                  vários produtos.
                </p>
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddItem}
                className="h-8 text-xs font-semibold text-indigo-700 border-indigo-200 hover:bg-indigo-50"
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                Adicionar Produto
              </Button>
            </div>

            <div className="space-y-3">
              {itens.map((it, idx) => (
                <div
                  key={it.tempId}
                  className="p-3.5 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-3 relative group"
                >
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-sm">
                      Produto #{idx + 1}
                    </span>
                    {itens.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveItem(it.tempId)}
                        className="h-7 w-7 text-slate-400 hover:text-red-600"
                        title="Remover produto"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-start">
                    <div className="sm:col-span-5">
                      <Label className="text-[11px] font-semibold text-slate-700">
                        Nome / Descrição do Produto *
                      </Label>
                      <Input
                        type="text"
                        placeholder="Ex: Iogurte Morango 1,25L"
                        value={it.produto_nome_informado}
                        onChange={(e) =>
                          handleUpdateItem(it.tempId, {
                            produto_nome_informado: e.target.value,
                          })
                        }
                        required
                        className="mt-1 text-xs h-8"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <Label className="text-[11px] font-semibold text-slate-700">
                        Qtd Solicitada *
                      </Label>
                      <Input
                        type="number"
                        min={1}
                        value={it.quantidade_solicitada}
                        onChange={(e) =>
                          handleUpdateItem(it.tempId, {
                            quantidade_solicitada: parseInt(e.target.value, 10) || 1,
                          })
                        }
                        required
                        className="mt-1 text-xs h-8"
                      />
                    </div>

                    <div className="sm:col-span-3">
                      <Label className="text-[11px] font-semibold text-slate-700">Validade</Label>
                      <Input
                        type="date"
                        disabled={it.validade_ausente}
                        value={it.validade_informada || ''}
                        onChange={(e) =>
                          handleUpdateItem(it.tempId, {
                            validade_informada: e.target.value,
                          })
                        }
                        className="mt-1 text-xs h-8 disabled:opacity-40"
                      />
                    </div>

                    <div className="sm:col-span-2 pt-5">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id={`val-ausente-${it.tempId}`}
                          checked={it.validade_ausente}
                          onCheckedChange={(checked) =>
                            handleUpdateItem(it.tempId, {
                              validade_ausente: Boolean(checked),
                            })
                          }
                        />
                        <label
                          htmlFor={`val-ausente-${it.tempId}`}
                          className="text-[11px] font-medium leading-none text-slate-600 cursor-pointer"
                        >
                          Validade não informada
                        </label>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-slate-50">
                    <div>
                      <Input
                        type="text"
                        placeholder="Motivo específico do item (opcional)..."
                        value={it.motivo_item || ''}
                        onChange={(e) =>
                          handleUpdateItem(it.tempId, { motivo_item: e.target.value })
                        }
                        className="text-[11px] h-7 bg-slate-50/50"
                      />
                    </div>
                    <div>
                      <Input
                        type="text"
                        placeholder="Observação do produto (ex: lote, avaria específica)..."
                        value={it.observacao || ''}
                        onChange={(e) =>
                          handleUpdateItem(it.tempId, { observacao: e.target.value })
                        }
                        className="text-[11px] h-7 bg-slate-50/50"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter className="border-t border-slate-200 pt-4 flex items-center justify-between">
            <p className="text-xs text-slate-500">
              * Ao salvar, o caso receberá um código oficial (ex: DEV-2026-XXXX) e a auditoria
              analisará o histórico operacional disponível.
            </p>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
              >
                {isSubmitting ? 'Salvando e Auditando...' : 'Salvar Solicitação'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
