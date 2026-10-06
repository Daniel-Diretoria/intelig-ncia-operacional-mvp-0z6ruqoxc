import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ProductAliasRegistro } from '@/types/devolucoes'
import {
  buscarAliasesConfirmados,
  salvarProductAlias,
  alterarStatusAlias,
} from '@/lib/resolve/produtoResolver'
import { toast } from '@/hooks/use-toast'
import { BookOpen, Search, Plus, Check, X, RefreshCw, Power } from 'lucide-react'

interface DicionarioProdutosModalProps {
  isOpen: boolean
  onClose: () => void
  industriasDisponiveis: Array<{ id: string; nome: string }>
}

export const DicionarioProdutosModal: React.FC<DicionarioProdutosModalProps> = ({
  isOpen,
  onClose,
  industriasDisponiveis,
}) => {
  const [aliases, setAliases] = useState<ProductAliasRegistro[]>([])
  const [busca, setBusca] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [novoModalOpen, setNovoModalOpen] = useState(false)

  // Formulário de novo alias
  const [novoAlias, setNovoAlias] = useState('')
  const [novoOficialNome, setNovoOficialNome] = useState('')
  const [novoOficialCodigo, setNovoOficialCodigo] = useState('')
  const [novaIndustria, setNovaIndustria] = useState(industriasDisponiveis[0]?.nome || 'FRUTAP')
  const [novoTipo, setNovoTipo] = useState<'sku_direto' | 'familia_generica'>('sku_direto')
  const [novaFamilia, setNovaFamilia] = useState('')

  const carregarLista = async () => {
    setIsLoading(true)
    try {
      const res = await buscarAliasesConfirmados('', '')
      setAliases(res)
    } catch (err) {
      console.warn('Erro ao carregar aliases:', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      carregarLista()
    }
  }, [isOpen])

  const handleToggleStatus = async (item: ProductAliasRegistro) => {
    if (!item.id) return
    const novo = item.status === 'ativo' ? 'inativo' : 'ativo'
    try {
      await alterarStatusAlias(item.id, novo)
      setAliases((prev) => prev.map((a) => (a.id === item.id ? { ...a, status: novo } : a)))
      toast({
        title: 'Status atualizado',
        description: `Alias "${item.alias}" marcado como ${novo}.`,
      })
    } catch (err) {
      console.error(err)
      toast({ title: 'Erro ao alterar status', variant: 'destructive' })
    }
  }

  const handleSalvarNovo = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!novoAlias.trim() || !novoOficialNome.trim()) {
      toast({ title: 'Preencha os campos obrigatórios', variant: 'destructive' })
      return
    }

    try {
      await salvarProductAlias({
        alias: novoAlias.trim(),
        produto_oficial_nome: novoOficialNome.trim(),
        produto_oficial_codigo: novoOficialCodigo.trim() || undefined,
        industria_nome: novaIndustria,
        tipo_alias: novoTipo,
        familia: novaFamilia.trim() || undefined,
        confirmado_por: 'Gestor',
        origem: 'dicionario',
      })
      toast({ title: 'Novo alias registrado com sucesso!' })
      setNovoModalOpen(false)
      setNovoAlias('')
      setNovoOficialNome('')
      setNovoOficialCodigo('')
      await carregarLista()
    } catch (err) {
      console.error(err)
      toast({ title: 'Erro ao criar alias', variant: 'destructive' })
    }
  }

  const filtrados = aliases.filter((a) => {
    const q = busca.toLowerCase()
    return (
      a.alias.toLowerCase().includes(q) ||
      a.produto_oficial_nome.toLowerCase().includes(q) ||
      a.industria_nome.toLowerCase().includes(q)
    )
  })

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto p-6">
        <DialogHeader className="border-b border-slate-200 pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-indigo-100 text-indigo-700">
                <BookOpen className="w-5 h-5" />
              </span>
              <div>
                <DialogTitle className="text-lg font-bold text-slate-900">
                  Dicionário de Produtos &amp; Aliases
                </DialogTitle>
                <p className="text-xs text-slate-500">
                  Gerencie correspondências aprendidas de apelidos, abreviações e nomes informais
                  para produtos oficiais do catálogo SKIP.
                </p>
              </div>
            </div>

            <Button
              size="sm"
              onClick={() => setNovoModalOpen(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              Novo Alias
            </Button>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-3">
          {/* Barra de Busca */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
              <Input
                type="text"
                placeholder="Pesquisar por apelido, produto oficial ou indústria..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="pl-8 text-xs h-9"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={carregarLista}
              disabled={isLoading}
              className="h-9 text-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          {/* Lista de Aliases */}
          <div className="border border-slate-200 rounded-xl overflow-hidden bg-white text-xs">
            <div className="grid grid-cols-12 bg-slate-100 p-2.5 font-bold text-slate-700 text-[11px] uppercase tracking-wider border-b border-slate-200">
              <span className="col-span-3">Apelido / Alias</span>
              <span className="col-span-4">Produto Oficial SKIP</span>
              <span className="col-span-2">Indústria</span>
              <span className="col-span-1 text-center">Usos</span>
              <span className="col-span-2 text-right">Ação</span>
            </div>

            <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
              {isLoading ? (
                <div className="py-12 text-center text-xs text-slate-500">
                  <RefreshCw className="w-5 h-5 text-indigo-600 animate-spin mx-auto mb-2" />
                  Carregando dicionário...
                </div>
              ) : filtrados.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-500">
                  Nenhum alias correspondente encontrado.
                </div>
              ) : (
                filtrados.map((item) => (
                  <div
                    key={item.id}
                    className={`grid grid-cols-12 p-2.5 items-center hover:bg-slate-50 transition-colors ${
                      item.status === 'inativo' ? 'opacity-40 bg-slate-50' : ''
                    }`}
                  >
                    <div className="col-span-3">
                      <span className="font-bold text-slate-900">{item.alias}</span>
                      {item.tipo_alias === 'familia_generica' && (
                        <Badge
                          variant="outline"
                          className="text-[9px] bg-purple-50 text-purple-700 block w-max mt-0.5"
                        >
                          Família
                        </Badge>
                      )}
                    </div>
                    <div className="col-span-4">
                      <span className="text-slate-800 font-medium">
                        {item.produto_oficial_nome}
                      </span>
                      {item.produto_oficial_codigo && (
                        <span className="text-[10px] text-slate-400 block font-mono">
                          Cód: {item.produto_oficial_codigo}
                        </span>
                      )}
                    </div>
                    <div className="col-span-2 text-slate-600">{item.industria_nome}</div>
                    <div className="col-span-1 text-center font-bold text-indigo-600">
                      {item.quantidade_utilizacoes || 0}
                    </div>
                    <div className="col-span-2 text-right">
                      <Button
                        size="sm"
                        variant={item.status === 'ativo' ? 'outline' : 'secondary'}
                        onClick={() => handleToggleStatus(item)}
                        className="h-6 text-[10px] px-2"
                      >
                        {item.status === 'ativo' ? (
                          <>
                            <Power className="w-3 h-3 mr-1 text-rose-600" />
                            Desativar
                          </>
                        ) : (
                          <>
                            <Check className="w-3 h-3 mr-1 text-emerald-600" />
                            Reativar
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Modal Novo Alias */}
        {novoModalOpen && (
          <Dialog open={novoModalOpen} onOpenChange={setNovoModalOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="text-sm font-bold text-slate-900">
                  Cadastrar Novo Alias no Dicionário
                </DialogTitle>
              </DialogHeader>

              <form onSubmit={handleSalvarNovo} className="space-y-3 py-2 text-xs">
                <div>
                  <Label className="text-xs">Apelido / Termo Informal *</Label>
                  <Input
                    type="text"
                    placeholder="Ex: barrigudinho morango"
                    value={novoAlias}
                    onChange={(e) => setNovoAlias(e.target.value)}
                    required
                    className="h-8 text-xs mt-1"
                  />
                </div>

                <div>
                  <Label className="text-xs">Produto Oficial do Catálogo *</Label>
                  <Input
                    type="text"
                    placeholder="Ex: Iogurte Frutap Morango Saquinho 850g"
                    value={novoOficialNome}
                    onChange={(e) => setNovoOficialNome(e.target.value)}
                    required
                    className="h-8 text-xs mt-1"
                  />
                </div>

                <div>
                  <Label className="text-xs">Código do Produto (opcional)</Label>
                  <Input
                    type="text"
                    placeholder="Ex: 00125"
                    value={novoOficialCodigo}
                    onChange={(e) => setNovoOficialCodigo(e.target.value)}
                    className="h-8 text-xs mt-1"
                  />
                </div>

                <div>
                  <Label className="text-xs">Indústria de Referência *</Label>
                  <Input
                    type="text"
                    value={novaIndustria}
                    onChange={(e) => setNovaIndustria(e.target.value)}
                    required
                    className="h-8 text-xs mt-1"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                  <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    onClick={() => setNovoModalOpen(false)}
                  >
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    type="submit"
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
                  >
                    Salvar no Dicionário
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </DialogContent>
    </Dialog>
  )
}
