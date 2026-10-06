import React, { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { FilaOperacional } from '@/components/devolucoes/FilaOperacional'
import { DevolucoesFiltrosBar } from '@/components/devolucoes/DevolucoesFiltrosBar'
import { NovaSolicitacaoModal } from '@/components/devolucoes/NovaSolicitacaoModal'
import { CasoDetalheModal } from '@/components/devolucoes/CasoDetalheModal'
import {
  listarCasosOperacionais,
  criarCasoDevolucao,
  carregarCasoDetalhes,
  reexecutarAuditoriaCaso,
  registrarDecisaoItem,
  atualizarStatusCaso,
  atualizarDadosAutorizacaoNFDescarte,
  anexarEvidencia,
} from '@/services/devolucoesService'
import { getIndustryRegistries } from '@/services/industryService'
import pb from '@/lib/pocketbase/client'
import {
  DevolucaoCaso,
  DevolucoesFiltros,
  FilaOperacionalAgrupada,
  CriarDevolucaoCasoInput,
  DevolucaoStatus,
  DecisaoHumanaItem,
  EvidenciaTipo,
} from '@/types/devolucoes'
import {
  Plus,
  RefreshCw,
  PackageCheck,
  AlertTriangle,
  HelpCircle,
  FileCheck2,
  Clock,
  Sparkles,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'

export const DevolucoesPage: React.FC = () => {
  const [filtros, setFiltros] = useState<DevolucoesFiltros>({})
  const [fila, setFila] = useState<FilaOperacionalAgrupada>({
    precisaDeAcao: [],
    emAndamento: [],
    finalizadas: [],
    contagens: {
      total: 0,
      precisaDeAcao: 0,
      emAndamento: 0,
      finalizadas: 0,
      divergencias: 0,
      aguardandoInformacao: 0,
      aguardandoAnalise: 0,
    },
  })
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Modais
  const [isNovaSolicitacaoOpen, setIsNovaSolicitacaoOpen] = useState(false)
  const [casoSelecionado, setCasoSelecionado] = useState<DevolucaoCaso | null>(null)
  const [isDetalheOpen, setIsDetalheOpen] = useState(false)

  // Listas de apoio para autocomplete de lojas e indústrias
  const [industrias, setIndustrias] = useState<Array<{ id: string; nome: string }>>([])
  const [lojas, setLojas] = useState<Array<{ codigo: string; nome: string }>>([])

  // Carregar dados de indústrias e lojas existentes no SKIP
  useEffect(() => {
    async function carregarCadastros() {
      try {
        const indList = await getIndustryRegistries()
        setIndustrias(
          indList.map((i) => ({
            id: i.id,
            nome: i.nome,
          })),
        )

        // Buscar lojas de stores
        const storesList = await pb.collection('stores').getList(1, 200, {
          sort: 'nome_loja',
        })
        setLojas(
          storesList.items.map((s) => {
            const item = s as unknown as { codigo_loja?: string; nome_loja?: string; nome?: string }
            return {
              codigo: item.codigo_loja || '',
              nome: item.nome_loja || item.nome || '',
            }
          }),
        )
      } catch (err) {
        console.warn('[DevolucoesPage] Erro ao carregar cadastros de apoio:', err)
      }
    }
    carregarCadastros()
  }, [])

  // Carregar lista de casos
  const carregarCasos = useCallback(
    async (silencioso = false) => {
      if (!silencioso) setIsLoading(true)
      else setIsRefreshing(true)

      try {
        const res = await listarCasosOperacionais(filtros)
        setFila(res.fila)
      } catch (err) {
        console.error('[DevolucoesPage] Erro ao listar casos:', err)
        toast({
          title: 'Erro ao carregar devoluções',
          description: 'Não foi possível carregar os casos operacionais.',
          variant: 'destructive',
        })
      } finally {
        setIsLoading(false)
        setIsRefreshing(false)
      }
    },
    [filtros],
  )

  useEffect(() => {
    carregarCasos()
  }, [carregarCasos])

  // Abrir detalhes do caso
  const handleSelecionarCaso = async (caso: DevolucaoCaso) => {
    setIsLoading(true)
    try {
      const detalhe = await carregarCasoDetalhes(caso.id)
      setCasoSelecionado(detalhe || caso)
      setIsDetalheOpen(true)
    } catch (err) {
      console.error(err)
      setCasoSelecionado(caso)
      setIsDetalheOpen(true)
    } finally {
      setIsLoading(false)
    }
  }

  // Criar nova solicitação
  const handleCriarSolicitacao = async (input: CriarDevolucaoCasoInput) => {
    const novoCaso = await criarCasoDevolucao(input)
    toast({
      title: 'Solicitação Criada com Sucesso!',
      description: `Caso ${novoCaso.codigo_caso} registrado e auditado pelo motor SKIP.`,
    })
    await carregarCasos(true)
    // Abre já o detalhe do caso para o usuário conferir a auditoria
    handleSelecionarCaso(novoCaso)
  }

  // Reauditar caso
  const handleReexecutarAuditoria = async (casoId: string) => {
    const atualizado = await reexecutarAuditoriaCaso(casoId)
    setCasoSelecionado((prev) => (prev?.id === casoId ? { ...prev, ...atualizado } : prev))
    await carregarCasos(true)
  }

  // Decisão por item
  const handleRegistrarDecisaoItem = async (
    casoId: string,
    codigoCaso: string,
    itemId: string,
    produtoNome: string,
    decisao: DecisaoHumanaItem,
    observacao?: string,
    qtdAutorizada?: number,
  ) => {
    await registrarDecisaoItem(
      casoId,
      codigoCaso,
      itemId,
      produtoNome,
      decisao,
      observacao,
      qtdAutorizada,
    )
    // Recarregar caso aberto
    const recarregado = await carregarCasoDetalhes(casoId)
    if (recarregado) setCasoSelecionado(recarregado)
    await carregarCasos(true)
  }

  // Atualizar Status
  const handleAtualizarStatus = async (
    casoId: string,
    codigoCaso: string,
    novoStatus: DevolucaoStatus,
    proximaAcao?: string,
    justificativa?: string,
  ) => {
    await atualizarStatusCaso(casoId, codigoCaso, novoStatus, proximaAcao, justificativa)
    const recarregado = await carregarCasoDetalhes(casoId)
    if (recarregado) setCasoSelecionado(recarregado)
    await carregarCasos(true)
    toast({
      title: 'Status atualizado',
      description: `O caso ${codigoCaso} agora está em "${novoStatus.replace(/_/g, ' ')}".`,
    })
  }

  // Salvar NF / Autorização
  const handleSalvarNFDescarte = async (
    casoId: string,
    codigoCaso: string,
    dados: {
      autorizacao_protocolo?: string
      autorizacao_data?: string
      nf_numero?: string
      nf_data?: string
      nf_valor?: number
      nf_anexo_nome?: string
      nf_assinada_anexo_nome?: string
      evidencia_descarte_anexo_nome?: string
      novo_status?: DevolucaoStatus
    },
  ) => {
    await atualizarDadosAutorizacaoNFDescarte(casoId, codigoCaso, dados)
    const recarregado = await carregarCasoDetalhes(casoId)
    if (recarregado) setCasoSelecionado(recarregado)
    await carregarCasos(true)
  }

  // Anexar evidência
  const handleAnexarEvidencia = async (
    casoId: string,
    codigoCaso: string,
    dados: {
      tipo: EvidenciaTipo
      titulo: string
      descricao?: string
      url_arquivo?: string
      itemId?: string
    },
  ) => {
    await anexarEvidencia(casoId, codigoCaso, dados)
    const recarregado = await carregarCasoDetalhes(casoId)
    if (recarregado) setCasoSelecionado(recarregado)
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Devoluções / NF</h1>
            <Badge className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs px-2.5 py-0.5">
              Inteligência Operacional
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-slate-600 mt-1 max-w-2xl">
            Conferência estruturada e explicável de solicitações de troca/devolução enviadas por
            promotores, cruzando histórico operacional anterior de validades e rupturas.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => carregarCasos(true)}
            disabled={isRefreshing}
            className="text-xs h-9 text-slate-700 hover:text-indigo-600"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>

          <Button
            onClick={() => setIsNovaSolicitacaoOpen(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs h-9 shadow-sm"
          >
            <Plus className="w-4 h-4 mr-1.5" />+ Nova Solicitação
          </Button>
        </div>
      </div>

      {/* KPI Tiles Resumo da Fila Operacional (Regra 16) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-bold uppercase tracking-wider">Precisa de Ação</span>
            <AlertTriangle className="w-4 h-4 text-rose-500" />
          </div>
          <p className="text-2xl font-black text-rose-600 mt-1">{fila.contagens.precisaDeAcao}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">
            {fila.contagens.divergencias} com divergência | {fila.contagens.aguardandoInformacao}{' '}
            aguardando info
          </p>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-bold uppercase tracking-wider">Em Andamento</span>
            <Clock className="w-4 h-4 text-indigo-500" />
          </div>
          <p className="text-2xl font-black text-indigo-600 mt-1">{fila.contagens.emAndamento}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Tramitando com indústria ou NF</p>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-bold uppercase tracking-wider">Finalizadas</span>
            <FileCheck2 className="w-4 h-4 text-teal-500" />
          </div>
          <p className="text-2xl font-black text-slate-800 mt-1">{fila.contagens.finalizadas}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Processos concluídos com NF</p>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-bold uppercase tracking-wider">Total de Casos</span>
            <PackageCheck className="w-4 h-4 text-slate-400" />
          </div>
          <p className="text-2xl font-black text-slate-900 mt-1">{fila.contagens.total}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Volume histórico gerenciado</p>
        </div>
      </div>

      {/* Barra de Filtros */}
      <DevolucoesFiltrosBar
        filtros={filtros}
        onFiltrosChange={setFiltros}
        onLimparFiltros={() => setFiltros({})}
        industriasDisponiveis={industrias}
        lojasDisponiveis={lojas}
      />

      {/* Fila Operacional com Blocos */}
      {isLoading ? (
        <div className="py-20 text-center">
          <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin mx-auto mb-3" />
          <p className="text-xs font-semibold text-slate-600">
            Carregando fila operacional de devoluções...
          </p>
        </div>
      ) : (
        <FilaOperacional
          precisaDeAcao={fila.precisaDeAcao}
          emAndamento={fila.emAndamento}
          finalizadas={fila.finalizadas}
          onSelecionarCaso={handleSelecionarCaso}
          onNovaSolicitacao={() => setIsNovaSolicitacaoOpen(true)}
        />
      )}

      {/* Modal Nova Solicitação */}
      <NovaSolicitacaoModal
        isOpen={isNovaSolicitacaoOpen}
        onClose={() => setIsNovaSolicitacaoOpen(false)}
        onSuccess={handleCriarSolicitacao}
        industriasDisponiveis={industrias}
        lojasDisponiveis={lojas}
      />

      {/* Modal Detalhes do Caso & Auditoria Explicável */}
      <CasoDetalheModal
        caso={casoSelecionado}
        isOpen={isDetalheOpen}
        onClose={() => setIsDetalheOpen(false)}
        onReexecutarAuditoria={handleReexecutarAuditoria}
        onRegistrarDecisaoItem={handleRegistrarDecisaoItem}
        onAtualizarStatus={handleAtualizarStatus}
        onSalvarNFDescarte={handleSalvarNFDescarte}
        onAnexarEvidencia={handleAnexarEvidencia}
      />
    </div>
  )
}
