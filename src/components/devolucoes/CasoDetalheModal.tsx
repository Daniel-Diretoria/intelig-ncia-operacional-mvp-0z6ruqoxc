import React, { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { StatusBadge, AuditoriaBadge, DECISAO_LABELS, AUDITORIA_LABELS } from './DevolucaoBadges'
import {
  DevolucaoCaso,
  DevolucaoItem,
  DevolucaoStatus,
  DecisaoHumanaItem,
  EvidenciaTipo,
} from '@/types/devolucoes'
import { formatarDataBr, extrairDataIso } from '@/lib/engine/devolucoesAuditEngine'
import { gerarMensagemSolicitacaoIndustria } from '@/services/devolucoesService'
import { toast } from '@/hooks/use-toast'
import { useAuth } from '@/services/authContext'
import {
  ShieldAlert,
  Clock,
  Package,
  FileText,
  MessageSquare,
  CheckCircle2,
  AlertTriangle,
  History,
  Camera,
  RefreshCw,
  Copy,
  ExternalLink,
  Info,
  Calendar,
  Store,
  Factory,
  User,
  HelpCircle,
  Lock,
} from 'lucide-react'

interface CasoDetalheModalProps {
  caso: DevolucaoCaso | null
  isOpen: boolean
  onClose: () => void
  onReexecutarAuditoria: (casoId: string) => Promise<void>
  onRegistrarDecisaoItem: (
    casoId: string,
    codigoCaso: string,
    itemId: string,
    produtoNome: string,
    decisao: DecisaoHumanaItem,
    observacao?: string,
    qtdAutorizada?: number,
  ) => Promise<void>
  onAtualizarStatus: (
    casoId: string,
    codigoCaso: string,
    novoStatus: DevolucaoStatus,
    proximaAcao?: string,
    justificativa?: string,
  ) => Promise<void>
  onSalvarNFDescarte: (
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
  ) => Promise<void>
  onRegistrarRespostaIndustria?: (
    casoId: string,
    codigoCaso: string,
    tipo: 'total' | 'parcial' | 'nao_autorizado',
    data: string,
    observacao: string,
    protocolo: string,
    itensAutorizados?: Array<{
      itemId: string
      autorizado: boolean
      quantidadeAutorizada: number
      motivoNaoAutorizado?: string
    }>,
  ) => Promise<void>
  onConcluirDevolucao?: (casoId: string, codigoCaso: string, obs?: string) => Promise<void>
  onAnexarEvidencia: (
    casoId: string,
    codigoCaso: string,
    evidencia: {
      tipo: EvidenciaTipo
      titulo: string
      descricao?: string
      url_arquivo?: string
      itemId?: string
    },
  ) => Promise<void>
}

export const CasoDetalheModal: React.FC<CasoDetalheModalProps> = ({
  caso,
  isOpen,
  onClose,
  onReexecutarAuditoria,
  onRegistrarDecisaoItem,
  onAtualizarStatus,
  onSalvarNFDescarte,
  onRegistrarRespostaIndustria,
  onConcluirDevolucao,
  onAnexarEvidencia,
}) => {
  const { can } = useAuth()
  const [activeTab, setActiveTab] = useState('auditoria')
  const [autorizacaoModalOpen, setAutorizacaoModalOpen] = useState(false)
  const [tipoRespIndustria, setTipoRespIndustria] = useState<
    'total' | 'parcial' | 'nao_autorizado'
  >('total')
  const [dataRespIndustria, setDataRespIndustria] = useState(() =>
    new Date().toISOString().slice(0, 10),
  )
  const [obsRespIndustria, setObsRespIndustria] = useState('')
  const [protocoloRespIndustria, setProtocoloRespIndustria] = useState('')
  const [itensParciaisState, setItensParciaisState] = useState<
    Array<{
      itemId: string
      nome: string
      solicitado: number
      autorizado: boolean
      qtdAutorizada: number
      motivo?: string
    }>
  >([])
  const [concluirModalOpen, setConcluirModalOpen] = useState(false)
  const [obsConclusao, setObsConclusao] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)

  const canViewDocuments = can('devolucoes:visualizar_documentos')
  const canViewFinancial = can('devolucoes:visualizar_financeiro')
  const canExecuteDecision = can('devolucoes:executar_decisao')
  const canRegisterAuth = can('devolucoes:registrar_autorizacao')
  const canAttachDocs = can('devolucoes:anexar_documentos')

  // Estado para decisão por item
  const [decisaoItemModalOpen, setDecisaoItemModalOpen] = useState(false)
  const [itemParaDecisao, setItemParaDecisao] = useState<DevolucaoItem | null>(null)
  const [decisaoSelecionada, setDecisaoSelecionada] =
    useState<DecisaoHumanaItem>('aprovado_para_industria')
  const [decisaoQtdAutorizada, setDecisaoQtdAutorizada] = useState<number>(0)
  const [decisaoObservacao, setDecisaoObservacao] = useState('')

  // Estado para NF / Autorização / Descarte
  const [autorizacaoProtocolo, setAutorizacaoProtocolo] = useState(
    caso?.autorizacao_protocolo || '',
  )
  const [autorizacaoData, setAutorizacaoData] = useState(caso?.autorizacao_data || '')
  const [nfNumero, setNfNumero] = useState(caso?.nf_numero || '')
  const [nfData, setNfData] = useState(caso?.nf_data || '')
  const [nfValor, setNfValor] = useState(caso?.nf_valor ? String(caso.nf_valor) : '')
  const [nfAnexoNome, setNfAnexoNome] = useState(caso?.nf_anexo_nome || '')
  const [nfAssinadaNome, setNfAssinadaNome] = useState(caso?.nf_assinada_anexo_nome || '')
  const [descarteAnexoNome, setDescarteAnexoNome] = useState(
    caso?.evidencia_descarte_anexo_nome || '',
  )

  // Atualizar formulário quando caso mudar
  React.useEffect(() => {
    if (caso) {
      setAutorizacaoProtocolo(caso.autorizacao_protocolo || '')
      setAutorizacaoData(caso.autorizacao_data || '')
      setNfNumero(caso.nf_numero || '')
      setNfData(caso.nf_data || '')
      setNfValor(caso.nf_valor ? String(caso.nf_valor) : '')
      setNfAnexoNome(caso.nf_anexo_nome || '')
      setNfAssinadaNome(caso.nf_assinada_anexo_nome || '')
      setDescarteAnexoNome(caso.evidencia_descarte_anexo_nome || '')
    }
  }, [caso])

  // Estado para nova evidência
  const [novaEvidTipo, setNovaEvidTipo] = useState<EvidenciaTipo>('foto_produto')
  const [novaEvidTitulo, setNovaEvidTitulo] = useState('')
  const [novaEvidDesc, setNovaEvidDesc] = useState('')
  const [novaEvidUrl, setNovaEvidUrl] = useState('')
  const [novaEvidItem, setNovaEvidItem] = useState<string>('')

  if (!caso) return null

  // Mensagem WhatsApp gerada
  const mensagemWhatsApp = gerarMensagemSolicitacaoIndustria(caso)

  // Status de documentação estrito (Regras 27 a 30)
  // REGRA 29: NF comum NÃO é NF assinada; foto genérica NÃO é descarte
  const temNfAssinada = Boolean(
    caso.nf_assinada_anexo_nome?.trim() || caso.evidencias?.some((e) => e.tipo === 'nf_assinada'),
  )
  const temDescarte = Boolean(
    caso.evidencia_descarte_anexo_nome?.trim() ||
    caso.evidencias?.some((e) => e.tipo === 'comprovante_descarte'),
  )
  const documentacaoCompleta = temNfAssinada && temDescarte

  const handleOpenAutorizacaoModal = () => {
    setDataRespIndustria(caso.autorizacao_data || new Date().toISOString().slice(0, 10))
    setProtocoloRespIndustria(caso.autorizacao_protocolo || '')
    setObsRespIndustria('')
    setTipoRespIndustria('total')

    if (caso.itens) {
      setItensParciaisState(
        caso.itens.map((it) => ({
          itemId: it.id,
          nome: it.produto_nome_oficial || it.produto_nome_informado,
          solicitado: it.quantidade_solicitada,
          autorizado: true,
          qtdAutorizada: it.quantidade_solicitada,
          motivo: '',
        })),
      )
    }
    setAutorizacaoModalOpen(true)
  }

  const handleSalvarRespostaIndustria = async () => {
    if (!onRegistrarRespostaIndustria) return
    try {
      setIsProcessing(true)
      await onRegistrarRespostaIndustria(
        caso.id,
        caso.codigo_caso,
        tipoRespIndustria,
        dataRespIndustria,
        obsRespIndustria,
        protocoloRespIndustria,
        tipoRespIndustria === 'parcial'
          ? itensParciaisState.map((it) => ({
              itemId: it.itemId,
              autorizado: it.autorizado,
              quantidadeAutorizada: it.autorizado ? it.qtdAutorizada : 0,
              motivoNaoAutorizado: it.motivo,
            }))
          : undefined,
      )
      setAutorizacaoModalOpen(false)
      toast({
        title: 'Resposta da Indústria Registrada!',
        description:
          tipoRespIndustria === 'nao_autorizado'
            ? 'Caso marcado como Não Autorizado com auditoria preservada.'
            : 'Caso avançado automaticamente para Aguardando NF Assinada e Descarte.',
      })
    } catch (err) {
      console.error(err)
      toast({ title: 'Erro ao registrar autorização', variant: 'destructive' })
    } finally {
      setIsProcessing(false)
    }
  }

  const handleExecutarConclusao = async () => {
    if (!onConcluirDevolucao) return
    try {
      setIsProcessing(true)
      await onConcluirDevolucao(caso.id, caso.codigo_caso, obsConclusao)
      setConcluirModalOpen(false)
      toast({
        title: 'Devolução Concluída!',
        description: 'Caso arquivado com sucesso nas Devoluções Finalizadas.',
      })
    } catch (err) {
      console.error(err)
      toast({ title: 'Erro ao concluir devolução', variant: 'destructive' })
    } finally {
      setIsProcessing(false)
    }
  }

  const handleOpenDecisaoItem = (item: DevolucaoItem) => {
    setItemParaDecisao(item)
    setDecisaoSelecionada(item.decisao_humana || 'aprovado_para_industria')
    setDecisaoQtdAutorizada(item.quantidade_autorizada ?? item.quantidade_solicitada)
    setDecisaoObservacao(item.decisao_observacao || '')
    setDecisaoItemModalOpen(true)
  }

  const handleSalvarDecisaoItem = async () => {
    if (!itemParaDecisao) return
    try {
      setIsProcessing(true)
      await onRegistrarDecisaoItem(
        caso.id,
        caso.codigo_caso,
        itemParaDecisao.id,
        itemParaDecisao.produto_nome_oficial || itemParaDecisao.produto_nome_informado,
        decisaoSelecionada,
        decisaoObservacao,
        decisaoQtdAutorizada,
      )
      toast({
        title: 'Decisão registrada',
        description: `Decisão no produto salva com sucesso.`,
      })
      setDecisaoItemModalOpen(false)
    } catch (err) {
      console.error(err)
      toast({ title: 'Erro ao salvar decisão', variant: 'destructive' })
    } finally {
      setIsProcessing(false)
    }
  }

  const handleReauditar = async () => {
    try {
      setIsProcessing(true)
      await onReexecutarAuditoria(caso.id)
      toast({
        title: 'Auditoria reprocessada',
        description: 'Os dados foram cruzados com o histórico mais recente.',
      })
    } catch (err) {
      console.error(err)
      toast({ title: 'Erro ao reauditar', variant: 'destructive' })
    } finally {
      setIsProcessing(false)
    }
  }

  const handleSalvarNF = async () => {
    try {
      setIsProcessing(true)
      await onSalvarNFDescarte(caso.id, caso.codigo_caso, {
        autorizacao_protocolo: autorizacaoProtocolo,
        autorizacao_data: autorizacaoData,
        nf_numero: nfNumero,
        nf_data: nfData,
        nf_valor: nfValor ? parseFloat(nfValor) : undefined,
        nf_anexo_nome: nfAnexoNome,
        nf_assinada_anexo_nome: nfAssinadaNome,
        evidencia_descarte_anexo_nome: descarteAnexoNome,
      })
      toast({ title: 'Dados de Autorização / NF salvos com sucesso!' })
    } catch (err) {
      console.error(err)
      toast({ title: 'Erro ao salvar NF', variant: 'destructive' })
    } finally {
      setIsProcessing(false)
    }
  }

  const handleAnexarNovaEvidencia = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!novaEvidTitulo.trim()) {
      toast({ title: 'Título obrigatório', variant: 'destructive' })
      return
    }
    try {
      setIsProcessing(true)
      await onAnexarEvidencia(caso.id, caso.codigo_caso, {
        tipo: novaEvidTipo,
        titulo: novaEvidTitulo.trim(),
        descricao: novaEvidDesc.trim(),
        url_arquivo: novaEvidUrl.trim(),
        itemId: novaEvidItem || undefined,
      })
      setNovaEvidTitulo('')
      setNovaEvidDesc('')
      setNovaEvidUrl('')
      setNovaEvidItem('')
      toast({ title: 'Evidência anexada ao caso!' })
    } catch (err) {
      console.error(err)
      toast({ title: 'Erro ao anexar evidência', variant: 'destructive' })
    } finally {
      setIsProcessing(false)
    }
  }

  const handleCopiarMensagem = () => {
    navigator.clipboard.writeText(mensagemWhatsApp)
    toast({
      title: 'Mensagem copiada!',
      description: 'Texto pronto para envio copiado para a área de transferência.',
    })
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto p-6">
        {/* Header do Caso */}
        <DialogHeader className="border-b border-slate-200 pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-base font-bold bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-md border border-indigo-200">
                  {caso.codigo_caso}
                </span>
                <StatusBadge status={caso.status} />
                <AuditoriaBadge classificacao={caso.resultado_auditoria_geral} />
              </div>
              <DialogTitle className="text-xl font-bold text-slate-900 mt-2">
                {caso.industry_name} — {caso.store_name}
              </DialogTitle>
              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 mt-1">
                <span className="flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  Promotor: <strong className="text-slate-700">{caso.promotor_nome}</strong>
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  Data da Solicitação:{' '}
                  <strong className="text-slate-700">{caso.data_solicitacao}</strong>
                </span>
                <span className="flex items-center gap-1">
                  <Package className="w-3.5 h-3.5 text-slate-400" />
                  Itens: <strong className="text-slate-700">{caso.total_itens}</strong> (
                  {caso.total_unidades_solicitadas} un. solicitadas)
                </span>
              </div>
            </div>

            {/* Ações de Status Rápido e Ações Inteligentes de Avanço de Fluxo */}
            <div className="flex flex-col sm:items-end gap-2">
              <div className="flex flex-wrap items-center gap-2">
                {/* BOTÃO OPERACIONAL: INDÚSTRIA AUTORIZOU (Regra 18 a 23) */}
                {(caso.status === 'aguardando_autorizacao_industria' ||
                  caso.status === 'pronta_para_envio') &&
                  canRegisterAuth && (
                    <Button
                      size="sm"
                      onClick={handleOpenAutorizacaoModal}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-8 shadow-xs"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                      Indústria Respondeu / Autorizou
                    </Button>
                  )}

                {/* BOTÃO OPERACIONAL: CONCLUIR DEVOLUÇÃO HUMANA (Regra 30 e 31) */}
                {caso.status === 'aguardando_nf_descarte' &&
                  documentacaoCompleta &&
                  canRegisterAuth && (
                    <Button
                      size="sm"
                      onClick={() => setConcluirModalOpen(true)}
                      className="bg-indigo-700 hover:bg-indigo-800 text-white font-bold text-xs h-8 shadow-xs animate-pulse"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                      Concluir Devolução
                    </Button>
                  )}

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReauditar}
                  disabled={isProcessing}
                  className="text-xs h-8 text-slate-700 hover:text-indigo-600"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 mr-1.5 ${isProcessing ? 'animate-spin' : ''}`}
                  />
                  Reexecutar Auditoria
                </Button>
                <Select
                  value={caso.status}
                  onValueChange={(val) =>
                    onAtualizarStatus(caso.id, caso.codigo_caso, val as DevolucaoStatus)
                  }
                >
                  <SelectTrigger className="w-[180px] h-8 text-xs font-semibold">
                    <SelectValue placeholder="Alterar status..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="em_analise">Em Análise</SelectItem>
                    <SelectItem value="aguardando_informacao">Aguardando Informação</SelectItem>
                    <SelectItem value="pronta_para_envio">Pronta para Envio</SelectItem>
                    <SelectItem value="aguardando_autorizacao_industria">
                      Aguardando Indústria
                    </SelectItem>
                    <SelectItem value="industria_autorizou">Indústria Autorizou</SelectItem>
                    <SelectItem value="aguardando_nf_descarte">Aguardando NF + Descarte</SelectItem>
                    <SelectItem value="concluido">Concluído</SelectItem>
                    <SelectItem value="divergencia_encontrada">Divergência Encontrada</SelectItem>
                    <SelectItem value="nao_autorizado">Não Autorizado</SelectItem>
                    <SelectItem value="cancelado">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {caso.proxima_acao && (
                <p className="text-[11px] text-amber-900 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200">
                  <strong>Próxima ação:</strong> {caso.proxima_acao}
                </p>
              )}
            </div>
          </div>
        </DialogHeader>

        {/* Abas do Caso de Devolução */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
          <TabsList className="grid grid-cols-5 w-full bg-slate-100 p-1">
            <TabsTrigger value="auditoria" className="text-xs flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-indigo-600" />
              Auditoria ({caso.itens?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="timeline" className="text-xs flex items-center gap-1.5">
              <History className="w-3.5 h-3.5 text-slate-600" />
              Linha do Tempo ({caso.timeline?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="evidencias" className="text-xs flex items-center gap-1.5">
              <Camera className="w-3.5 h-3.5 text-slate-600" />
              Evidências ({caso.evidencias?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="nf_descarte" className="text-xs flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-slate-600" />
              Autorização &amp; NF
            </TabsTrigger>
            <TabsTrigger value="mensagem" className="text-xs flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-slate-600" />
              Msg Indústria
            </TabsTrigger>
          </TabsList>

          {/* 1. ABA AUDITORIA E PRODUTOS (Coração da V1) */}
          <TabsContent value="auditoria" className="space-y-4 pt-3">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs text-slate-600 flex items-start gap-2.5">
              <Info className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
              <div>
                <strong className="text-slate-800">Princípio Central do SKIP:</strong> O sistema não
                aprova ou reprova automaticamente. Abaixo estão os cruzamentos com validades
                anteriores, rupturas e continuidade de registros para que a decisão humana seja
                explicável e fundamentada.
              </div>
            </div>

            {/* Lista dos Itens Auditados */}
            <div className="space-y-4">
              {caso.itens && caso.itens.length > 0 ? (
                caso.itens.map((item, idx) => {
                  const det = item.auditoria_detalhes_json
                  const decConf = item.decisao_humana
                    ? DECISAO_LABELS[item.decisao_humana]
                    : DECISAO_LABELS.pendente
                  const audConf = item.classificacao_auditoria
                    ? AUDITORIA_LABELS[item.classificacao_auditoria]
                    : AUDITORIA_LABELS.nao_auditado

                  return (
                    <div
                      key={item.id}
                      className={`border rounded-xl p-4 bg-white shadow-2xs space-y-3 ${audConf.borderClass} border-l-4`}
                    >
                      {/* Topo do Item */}
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 border-b border-slate-100 pb-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-500">#{idx + 1}</span>
                            <h4 className="text-sm font-bold text-slate-900">
                              {item.produto_nome_oficial || item.produto_nome_informado}
                            </h4>
                            {item.precisa_identificacao && (
                              <Badge
                                variant="outline"
                                className="text-[10px] bg-amber-50 text-amber-800 border-amber-300"
                              >
                                Produto precisa de identificação
                              </Badge>
                            )}
                          </div>
                          {item.produto_nome_oficial &&
                            item.produto_nome_oficial !== item.produto_nome_informado && (
                              <p className="text-[11px] text-slate-500">
                                Informado pelo promotor: <em>"{item.produto_nome_informado}"</em>
                              </p>
                            )}
                          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 mt-1">
                            <span>
                              Solicitado: <strong>{item.quantidade_solicitada} un.</strong>
                            </span>
                            <span>
                              Validade informada:{' '}
                              <strong>
                                {item.validade_ausente ? (
                                  <span className="text-amber-700 italic">
                                    Validade não informada
                                  </span>
                                ) : (
                                  formatarDataBr(item.validade_informada)
                                )}
                              </strong>
                            </span>
                            {item.motivo_item && (
                              <span>
                                Motivo: <em>{item.motivo_item}</em>
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Badges e Ação de Decisão */}
                        <div className="flex flex-col sm:items-end gap-1.5">
                          <div className="flex items-center gap-1.5">
                            <AuditoriaBadge classificacao={item.classificacao_auditoria} />
                            <Badge
                              variant="outline"
                              className={`text-[11px] ${decConf.badgeClass}`}
                            >
                              {decConf.label}
                            </Badge>
                          </div>
                          {canExecuteDecision && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleOpenDecisaoItem(item)}
                              className="h-7 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 border-indigo-200"
                            >
                              Decidir este Item
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* Explicabilidade da Auditoria (Regra 11) */}
                      <div className="bg-slate-50 rounded-lg p-3 text-xs space-y-2 border border-slate-200/70">
                        <div className="flex items-start gap-2">
                          <span className="font-bold text-slate-700 shrink-0">
                            Diagnóstico da Inteligência:
                          </span>
                          <span className="text-slate-800">
                            {item.auditoria_explicacao || 'Aguardando auditoria.'}
                          </span>
                        </div>

                        {/* Linha do Histórico Anterior Disponível */}
                        {det && det.registrosAnteriores && det.registrosAnteriores.length > 0 ? (
                          <div className="pt-2 border-t border-slate-200/60">
                            <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                              Histórico Anterior Encontrado ({det.registrosAnteriores.length}{' '}
                              registro(s) até {formatarDataBr(caso.data_solicitacao)}):
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {det.registrosAnteriores.map((reg, rIdx) => (
                                <div
                                  key={rIdx}
                                  className="bg-white border border-slate-200 rounded-md px-2.5 py-1 text-[11px] text-slate-700 shadow-2xs"
                                >
                                  <strong>{formatarDataBr(reg.data)}:</strong> {reg.quantidade} un.
                                  — Validade: {formatarDataBr(reg.validade)}
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="pt-1 text-[11px] text-slate-500 italic">
                            Nenhum registro anterior compatível localizado nesta loja antes de{' '}
                            {formatarDataBr(caso.data_solicitacao)}.
                          </div>
                        )}

                        {/* Rupturas como Contexto (Regra 9) */}
                        {det && det.rupturasRelacionadas && det.rupturasRelacionadas.length > 0 && (
                          <div className="pt-2 border-t border-slate-200/60 text-[11px] text-indigo-900 bg-indigo-50/50 p-2 rounded-md">
                            <strong>Contexto de Rupturas:</strong> Foram encontradas{' '}
                            {det.rupturasRelacionadas.length} ocorrência(s) de ruptura reportada(s)
                            para este item:{' '}
                            {det.rupturasRelacionadas
                              .map((r) => `${r.motivo} (${formatarDataBr(r.data)})`)
                              .join(', ')}
                            .
                          </div>
                        )}

                        {/* Quantidade Zero Notada */}
                        {det?.quantidadeZeroRegistrada && (
                          <p className="text-[11px] text-slate-500">
                            * Foi identificada atualização com <strong>quantidade 0</strong> no
                            histórico (atualização válida de esgotamento/venda).
                          </p>
                        )}
                      </div>

                      {/* Resumo da Decisão Humana salva */}
                      {item.decisao_humana && item.decisao_humana !== 'pendente' && (
                        <div className="bg-emerald-50/60 border border-emerald-200 rounded-lg p-2.5 text-xs text-emerald-900 flex items-center justify-between">
                          <div>
                            <strong>Decisão Humana:</strong> {decConf.label}
                            {item.quantidade_autorizada !== undefined && (
                              <span> ({item.quantidade_autorizada} un. autorizadas)</span>
                            )}
                            {item.decisao_observacao && <span> — "{item.decisao_observacao}"</span>}
                          </div>
                          {item.decisao_usuario_nome && (
                            <span className="text-[11px] text-emerald-700">
                              Por: {item.decisao_usuario_nome}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })
              ) : (
                <div className="text-center py-6 text-xs text-slate-500">
                  Nenhum produto cadastrado neste caso.
                </div>
              )}
            </div>
          </TabsContent>

          {/* 2. ABA LINHA DO TEMPO (Regra 14) */}
          <TabsContent value="timeline" className="space-y-4 pt-3">
            <div className="space-y-3">
              {caso.timeline && caso.timeline.length > 0 ? (
                caso.timeline.map((evt) => (
                  <div
                    key={evt.id}
                    className="flex items-start gap-3 p-3 bg-white border border-slate-200 rounded-xl text-xs"
                  >
                    <div className="p-2 rounded-full bg-slate-100 text-slate-600 mt-0.5">
                      <Clock className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <h5 className="font-bold text-slate-900">{evt.titulo}</h5>
                        <span className="text-[11px] text-slate-400">
                          {formatarDataBr(evt.data_evento)} {evt.data_evento.slice(11, 16)}
                        </span>
                      </div>
                      {evt.descricao && <p className="text-slate-600 mt-0.5">{evt.descricao}</p>}
                      <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-1">
                        <span>Por: {evt.usuario_nome || 'Sistema'}</span>
                        {evt.status_novo && (
                          <span className="text-indigo-600 font-semibold">
                            Status: {evt.status_novo}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-xs text-slate-500">
                  Nenhum evento registrado na timeline deste caso.
                </div>
              )}
            </div>
          </TabsContent>

          {/* 3. ABA EVIDÊNCIAS (Regra 15) */}
          <TabsContent value="evidencias" className="space-y-4 pt-3">
            {!canViewDocuments ? (
              <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <Lock className="w-8 h-8 text-slate-400 mx-auto" />
                <h4 className="font-bold text-sm text-slate-800">
                  Visualização de Evidências Restrita
                </h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Seu perfil de acesso não possui permissão para visualizar evidências internas ou
                  fotos de descarte. Solicite autorização caso necessário.
                </p>
              </div>
            ) : (
              <>
                {/* Formulário para Anexar Nova Evidência */}
                {canAttachDocs && (
                  <form
                    onSubmit={handleAnexarNovaEvidencia}
                    className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-3"
                  >
                    <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                      <Camera className="w-3.5 h-3.5 text-indigo-600" />
                      Anexar Nova Foto ou Documento de Evidência
                    </h5>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <Label className="text-xs">Tipo de Evidência</Label>
                        <Select
                          value={novaEvidTipo}
                          onValueChange={(val) => setNovaEvidTipo(val as EvidenciaTipo)}
                        >
                          <SelectTrigger className="h-8 text-xs mt-1 bg-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="foto_produto">Foto do Produto</SelectItem>
                            <SelectItem value="foto_validade">Foto da Validade</SelectItem>
                            <SelectItem value="foto_lote">Foto do Lote</SelectItem>
                            <SelectItem value="nf_documento">Documento NF</SelectItem>
                            <SelectItem value="nf_assinada">NF Assinada</SelectItem>
                            <SelectItem value="comprovante_descarte">
                              Comprovante de Descarte
                            </SelectItem>
                            <SelectItem value="outro">Outro</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label className="text-xs">Título / Identificador *</Label>
                        <Input
                          type="text"
                          placeholder="Ex: Foto do lote e vencimento"
                          value={novaEvidTitulo}
                          onChange={(e) => setNovaEvidTitulo(e.target.value)}
                          required
                          className="h-8 text-xs mt-1 bg-white"
                        />
                      </div>

                      <div>
                        <Label className="text-xs">Associar a Produto (opcional)</Label>
                        <Select value={novaEvidItem} onValueChange={setNovaEvidItem}>
                          <SelectTrigger className="h-8 text-xs mt-1 bg-white">
                            <SelectValue placeholder="Geral do caso" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="geral">Geral do Caso</SelectItem>
                            {caso.itens?.map((it) => (
                              <SelectItem key={it.id} value={it.id}>
                                {it.produto_nome_oficial || it.produto_nome_informado}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">URL da Foto / Arquivo</Label>
                        <Input
                          type="text"
                          placeholder="https://... ou caminho da foto"
                          value={novaEvidUrl}
                          onChange={(e) => setNovaEvidUrl(e.target.value)}
                          className="h-8 text-xs mt-1 bg-white"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Descrição Operacional</Label>
                        <Input
                          type="text"
                          placeholder="Detalhes visíveis na foto..."
                          value={novaEvidDesc}
                          onChange={(e) => setNovaEvidDesc(e.target.value)}
                          className="h-8 text-xs mt-1 bg-white"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end pt-1">
                      <Button
                        type="submit"
                        size="sm"
                        disabled={isProcessing}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold"
                      >
                        Salvar Evidência
                      </Button>
                    </div>
                  </form>
                )}

                {/* Lista de Evidências */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {caso.evidencias && caso.evidencias.length > 0 ? (
                    caso.evidencias.map((ev) => (
                      <div
                        key={ev.id}
                        className="p-3 bg-white border border-slate-200 rounded-xl space-y-2 text-xs shadow-2xs"
                      >
                        <div className="flex items-center justify-between">
                          <Badge
                            variant="outline"
                            className="text-[10px] bg-slate-50 text-slate-700"
                          >
                            {ev.tipo.replace('_', ' ')}
                          </Badge>
                          <span className="text-[10px] text-slate-400">
                            {formatarDataBr(ev.created)}
                          </span>
                        </div>
                        <h5 className="font-bold text-slate-900">{ev.titulo}</h5>
                        {ev.descricao && (
                          <p className="text-slate-600 text-[11px]">{ev.descricao}</p>
                        )}
                        {ev.url_arquivo && (
                          <a
                            href={ev.url_arquivo}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center text-indigo-600 hover:underline text-[11px] pt-1"
                          >
                            <ExternalLink className="w-3 h-3 mr-1" />
                            Ver Evidência
                          </a>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="col-span-full text-center py-8 text-xs text-slate-500">
                      Nenhuma foto ou evidência anexada a este caso ainda.
                    </div>
                  )}
                </div>
              </>
            )}
          </TabsContent>

          {/* 4. ABA AUTORIZAÇÃO, NF E DESCARTE (Regra 20) */}
          <TabsContent value="nf_descarte" className="space-y-4 pt-3">
            {!canViewDocuments ? (
              <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <Lock className="w-8 h-8 text-slate-400 mx-auto" />
                <h4 className="font-bold text-sm text-slate-800">
                  Visualização de Documentos e NFs Restrita
                </h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Seu perfil não possui permissão para visualizar dados de notas fiscais, evidências
                  de descarte ou documentos internos. Solicite autorização caso necessário.
                </p>
              </div>
            ) : (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4 text-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
                  <div>
                    <h4 className="font-bold text-slate-800 uppercase tracking-wider text-xs">
                      Controle de Autorização da Indústria, NF e Descarte
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Rastreabilidade documental estrita. O encerramento do caso depende da
                      conferência da NF assinada e do descarte.
                    </p>
                  </div>
                  {/* Quadro Indicador de Completude Documental (Regra 27 a 29) */}
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${
                        temNfAssinada
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                          : 'bg-amber-50 text-amber-800 border-amber-300'
                      }`}
                    >
                      NF Assinada: {temNfAssinada ? 'Recebida' : 'Pendente'}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${
                        temDescarte
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                          : 'bg-amber-50 text-amber-800 border-amber-300'
                      }`}
                    >
                      Descarte: {temDescarte ? 'Recebido' : 'Pendente'}
                    </Badge>
                    {documentacaoCompleta ? (
                      <Badge className="bg-emerald-600 text-white text-[10px]">
                        Documentação Completa
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="text-slate-500 border-slate-300 text-[10px]"
                      >
                        Documentação Incompleta
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Bloco Autorização */}
                  <div className="bg-white p-3.5 rounded-lg border border-slate-200 space-y-3">
                    <h5 className="font-bold text-indigo-700 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" />
                      1. Autorização da Indústria
                    </h5>
                    <div>
                      <Label className="text-xs">Número de Protocolo / Autorização</Label>
                      <Input
                        type="text"
                        placeholder="Ex: AUT-FRUTAP-8841"
                        value={autorizacaoProtocolo}
                        onChange={(e) => setAutorizacaoProtocolo(e.target.value)}
                        className="mt-1 h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Data da Autorização</Label>
                      <Input
                        type="date"
                        value={autorizacaoData}
                        onChange={(e) => setAutorizacaoData(e.target.value)}
                        className="mt-1 h-8 text-xs"
                      />
                    </div>
                  </div>

                  {/* Bloco Nota Fiscal */}
                  <div className="bg-white p-3.5 rounded-lg border border-slate-200 space-y-3">
                    <h5 className="font-bold text-purple-700 flex items-center gap-1.5">
                      <FileText className="w-4 h-4" />
                      2. Dados da Nota Fiscal
                    </h5>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Número da NF</Label>
                        <Input
                          type="text"
                          placeholder="Ex: 014529"
                          value={nfNumero}
                          onChange={(e) => setNfNumero(e.target.value)}
                          className="mt-1 h-8 text-xs"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Data da NF</Label>
                        <Input
                          type="date"
                          value={nfData}
                          onChange={(e) => setNfData(e.target.value)}
                          className="mt-1 h-8 text-xs"
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Valor da NF (R$)</Label>
                      {canViewFinancial ? (
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="R$ 0,00"
                          value={nfValor}
                          onChange={(e) => setNfValor(e.target.value)}
                          className="mt-1 h-8 text-xs"
                        />
                      ) : (
                        <div className="mt-1 h-8 px-2.5 rounded border border-slate-200 bg-slate-50 flex items-center text-xs text-slate-400 italic">
                          Oculto (permissão restrita)
                        </div>
                      )}{' '}
                    </div>
                  </div>
                </div>

                {/* Bloco Comprovantes e Descarte */}
                <div className="bg-white p-3.5 rounded-lg border border-slate-200 space-y-3">
                  <h5 className="font-bold text-teal-700 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" />
                    3. NF Assinada e Evidência de Descarte
                  </h5>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Referência / Arquivo NF Assinada</Label>
                      <Input
                        type="text"
                        placeholder="Ex: nf_assinada_014529.pdf"
                        value={nfAssinadaNome}
                        onChange={(e) => setNfAssinadaNome(e.target.value)}
                        className="mt-1 h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Referência / Foto do Descarte Realizado</Label>
                      <Input
                        type="text"
                        placeholder="Ex: foto_descarte_loja405.jpg"
                        value={descarteAnexoNome}
                        onChange={(e) => setDescarteAnexoNome(e.target.value)}
                        className="mt-1 h-8 text-xs"
                      />
                    </div>
                  </div>
                </div>

                {canRegisterAuth && (
                  <div className="flex justify-end pt-2">
                    <Button
                      onClick={handleSalvarNF}
                      disabled={isProcessing}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs"
                    >
                      Salvar Dados de NF &amp; Descarte
                    </Button>
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          {/* 5. ABA MENSAGEM WHATSAPP (Regra 18) */}
          <TabsContent value="mensagem" className="space-y-4 pt-3">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-800 text-xs">
                    Mensagem Formatada para Solicitação à Indústria
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Agrupada por Indústria e Loja, lista os produtos aprovados com quantidades e
                    validades.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopiarMensagem}
                  className="text-xs text-indigo-700 border-indigo-200 hover:bg-indigo-50"
                >
                  <Copy className="w-3.5 h-3.5 mr-1" />
                  Copiar Mensagem
                </Button>
              </div>

              <Textarea
                readOnly
                rows={10}
                value={mensagemWhatsApp}
                className="font-mono text-xs bg-white text-slate-800 border-slate-300 resize-none leading-relaxed"
              />
            </div>
          </TabsContent>
        </Tabs>

        {/* Modal Secundário: Decisão Humana no Item (Regra 13) */}
        {decisaoItemModalOpen && itemParaDecisao && (
          <Dialog open={decisaoItemModalOpen} onOpenChange={setDecisaoItemModalOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="text-sm font-bold text-slate-900">
                  Decisão Humana —{' '}
                  {itemParaDecisao.produto_nome_oficial || itemParaDecisao.produto_nome_informado}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4 py-2 text-xs">
                <div>
                  <Label className="text-xs font-semibold text-slate-700">
                    Decisão Operacional
                  </Label>
                  <Select
                    value={decisaoSelecionada}
                    onValueChange={(val) => setDecisaoSelecionada(val as DecisaoHumanaItem)}
                  >
                    <SelectTrigger className="mt-1 h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="aprovado_para_industria">
                        Aprovar para solicitação à indústria
                      </SelectItem>
                      <SelectItem value="solicitar_informacao_promotor">
                        Solicitar informação ao promotor
                      </SelectItem>
                      <SelectItem value="registrar_divergencia">Registrar divergência</SelectItem>
                      <SelectItem value="manter_em_analise">Manter em análise</SelectItem>
                      <SelectItem value="rejeitado">Rejeitar item</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {decisaoSelecionada === 'aprovado_para_industria' && (
                  <div>
                    <Label className="text-xs font-semibold text-slate-700">
                      Quantidade Autorizada
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      max={itemParaDecisao.quantidade_solicitada}
                      value={decisaoQtdAutorizada}
                      onChange={(e) => setDecisaoQtdAutorizada(parseInt(e.target.value, 10) || 0)}
                      className="mt-1 h-8 text-xs"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">
                      Solicitado: {itemParaDecisao.quantidade_solicitada} un.
                    </p>
                  </div>
                )}

                <div>
                  <Label className="text-xs font-semibold text-slate-700">
                    Justificativa / Observação
                  </Label>
                  <Textarea
                    placeholder="Motivo da aprovação, divergência ou informação faltante..."
                    value={decisaoObservacao}
                    onChange={(e) => setDecisaoObservacao(e.target.value)}
                    className="mt-1 text-xs"
                    rows={3}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <Button variant="outline" size="sm" onClick={() => setDecisaoItemModalOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  onClick={handleSalvarDecisaoItem}
                  disabled={isProcessing}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
                >
                  Salvar Decisão
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}

        {/* Modal "Indústria Respondeu / Autorizou" (Regra 18 a 25) */}
        {autorizacaoModalOpen && (
          <Dialog open={autorizacaoModalOpen} onOpenChange={setAutorizacaoModalOpen}>
            <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Registrar Resposta da Indústria — {caso.codigo_caso}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4 py-2 text-xs">
                {/* Tipo de Resposta */}
                <div>
                  <Label className="text-xs font-semibold text-slate-700">
                    Tipo de Resposta da Indústria
                  </Label>
                  <div className="grid grid-cols-3 gap-2 mt-1">
                    <Button
                      type="button"
                      variant={tipoRespIndustria === 'total' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setTipoRespIndustria('total')}
                      className={`text-xs ${
                        tipoRespIndustria === 'total'
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                          : 'text-slate-700 border-slate-200'
                      }`}
                    >
                      Autorização Total
                    </Button>
                    <Button
                      type="button"
                      variant={tipoRespIndustria === 'parcial' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setTipoRespIndustria('parcial')}
                      className={`text-xs ${
                        tipoRespIndustria === 'parcial'
                          ? 'bg-amber-600 hover:bg-amber-700 text-white'
                          : 'text-slate-700 border-slate-200'
                      }`}
                    >
                      Autorização Parcial
                    </Button>
                    <Button
                      type="button"
                      variant={tipoRespIndustria === 'nao_autorizado' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setTipoRespIndustria('nao_autorizado')}
                      className={`text-xs ${
                        tipoRespIndustria === 'nao_autorizado'
                          ? 'bg-red-600 hover:bg-red-700 text-white'
                          : 'text-slate-700 border-slate-200'
                      }`}
                    >
                      Não Autorizado
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-semibold text-slate-700">
                      Data da Autorização / Resposta
                    </Label>
                    <Input
                      type="date"
                      value={dataRespIndustria}
                      onChange={(e) => setDataRespIndustria(e.target.value)}
                      className="mt-1 h-8 text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-slate-700">
                      Protocolo / Nº Autorização (opcional)
                    </Label>
                    <Input
                      type="text"
                      placeholder="Ex: AUT-98421"
                      value={protocoloRespIndustria}
                      onChange={(e) => setProtocoloRespIndustria(e.target.value)}
                      className="mt-1 h-8 text-xs"
                    />
                  </div>
                </div>

                {/* Bloco de Itens para Autorização Parcial (Regra 21 e 24) */}
                {tipoRespIndustria === 'parcial' && (
                  <div className="space-y-2 border border-amber-200 rounded-lg p-3 bg-amber-50/40">
                    <h5 className="font-bold text-amber-900 text-xs">
                      Detalhamento por Item (Mesmo Caso — Situação por Item)
                    </h5>
                    <p className="text-[11px] text-amber-800">
                      Informe quais itens foram autorizados e suas quantidades autorizadas:
                    </p>
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {itensParciaisState.map((it, idx) => (
                        <div
                          key={it.itemId}
                          className="p-2 bg-white rounded border border-slate-200 space-y-1.5 text-xs shadow-2xs"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-slate-800">
                              {it.nome} ({it.solicitado} un. solicitadas)
                            </span>
                            <div className="flex items-center gap-2">
                              <label className="flex items-center gap-1 cursor-pointer text-slate-700 text-xs">
                                <input
                                  type="checkbox"
                                  checked={it.autorizado}
                                  onChange={(e) => {
                                    const checked = e.target.checked
                                    setItensParciaisState((prev) =>
                                      prev.map((p, i) =>
                                        i === idx
                                          ? {
                                              ...p,
                                              autorizado: checked,
                                              qtdAutorizada: checked ? p.solicitado : 0,
                                            }
                                          : p,
                                      ),
                                    )
                                  }}
                                  className="rounded border-slate-300"
                                />
                                Autorizado
                              </label>
                            </div>
                          </div>

                          {it.autorizado ? (
                            <div className="flex items-center gap-2 pt-1">
                              <span className="text-[11px] text-slate-500">Qtd Autorizada:</span>
                              <Input
                                type="number"
                                min={1}
                                max={it.solicitado}
                                value={it.qtdAutorizada}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value, 10) || 0
                                  setItensParciaisState((prev) =>
                                    prev.map((p, i) =>
                                      i === idx ? { ...p, qtdAutorizada: val } : p,
                                    ),
                                  )
                                }}
                                className="h-7 w-24 text-xs"
                              />
                            </div>
                          ) : (
                            <div className="pt-1">
                              <Input
                                type="text"
                                placeholder="Motivo da não autorização deste item..."
                                value={it.motivo || ''}
                                onChange={(e) => {
                                  const mot = e.target.value
                                  setItensParciaisState((prev) =>
                                    prev.map((p, i) => (i === idx ? { ...p, motivo: mot } : p)),
                                  )
                                }}
                                className="h-7 text-xs"
                              />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <Label className="text-xs font-semibold text-slate-700">
                    Observações / Motivo da Resposta
                  </Label>
                  <Textarea
                    placeholder="Detalhes adicionais da resposta da indústria..."
                    value={obsRespIndustria}
                    onChange={(e) => setObsRespIndustria(e.target.value)}
                    className="mt-1 text-xs"
                    rows={3}
                  />
                </div>

                <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-[11px] text-slate-600">
                  {tipoRespIndustria === 'total' && (
                    <p>
                      ✓ <strong>Avanço automático:</strong> o caso passará para{' '}
                      <em>"Aguardando NF assinada + descarte"</em> e registrará a autorização
                      integral na Linha do Tempo.
                    </p>
                  )}
                  {tipoRespIndustria === 'parcial' && (
                    <p>
                      ✓ <strong>Avanço automático:</strong> os itens autorizados seguirão para
                      emissão de NF e descarte no mesmo caso. Itens rejeitados permanecerão
                      sinalizados.
                    </p>
                  )}
                  {tipoRespIndustria === 'nao_autorizado' && (
                    <p>
                      ✓ <strong>Preservação integral:</strong> o caso será marcado como{' '}
                      <em>"Não Autorizado"</em>, preservando a auditoria e o histórico completo na
                      Linha do Tempo.
                    </p>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <Button variant="outline" size="sm" onClick={() => setAutorizacaoModalOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  onClick={handleSalvarRespostaIndustria}
                  disabled={isProcessing}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                >
                  Confirmar Resposta da Indústria
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}

        {/* Modal Concluir Devolução Humana (Regra 30 e 31) */}
        {concluirModalOpen && (
          <Dialog open={concluirModalOpen} onOpenChange={setConcluirModalOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-indigo-600" />
                  Conclusão Humana do Processo — {caso.codigo_caso}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-3 py-2 text-xs">
                <p className="text-slate-600">
                  A documentação exigida (NF assinada e comprovante de descarte) está presente no
                  caso. Deseja efetivar o encerramento operacional?
                </p>

                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1 text-slate-700">
                  <div>
                    <strong>NF Assinada:</strong>{' '}
                    {caso.nf_assinada_anexo_nome || 'Anexada como evidência'}
                  </div>
                  <div>
                    <strong>Evidência de Descarte:</strong>{' '}
                    {caso.evidencia_descarte_anexo_nome || 'Anexada como evidência'}
                  </div>
                </div>

                <div>
                  <Label className="text-xs font-semibold text-slate-700">
                    Observações Finais de Encerramento (opcional)
                  </Label>
                  <Textarea
                    placeholder="Ex: Documentos conferidos e arquivados no cofre digital..."
                    value={obsConclusao}
                    onChange={(e) => setObsConclusao(e.target.value)}
                    className="mt-1 text-xs"
                    rows={3}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <Button variant="outline" size="sm" onClick={() => setConcluirModalOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  onClick={handleExecutarConclusao}
                  disabled={isProcessing}
                  className="bg-indigo-700 hover:bg-indigo-800 text-white font-semibold"
                >
                  Efetivar Conclusão
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </DialogContent>
    </Dialog>
  )
}
