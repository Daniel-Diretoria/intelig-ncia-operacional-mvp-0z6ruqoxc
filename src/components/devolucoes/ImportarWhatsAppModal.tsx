import React, { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  SolicitacaoIdentificadaWhatsApp,
  CriarDevolucaoCasoInput,
  CandidatoProdutoSugerido,
} from '@/types/devolucoes'
import { extrairMensagensArquivoWhatsApp, parseConversaWhatsApp } from '@/lib/import/whatsappParser'
import { calcularHashArquivo } from '@/lib/data/tradeProPipeline'
import { verificarHashesConhecidos, persistirLoteWhatsApp } from '@/services/devolucoesDedupService'
import {
  salvarProductAlias,
  carregarCatalogoContextual,
  CatalogoProdutoContexto,
} from '@/lib/resolve/produtoResolver'
import pb from '@/lib/pocketbase/client'
import { toast } from '@/hooks/use-toast'
import {
  Upload,
  FileText,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Link as LinkIcon,
  Search,
  BookOpen,
  Eye,
  Layers,
  Sparkles,
  RefreshCw,
  FolderOpen,
} from 'lucide-react'

interface ImportarWhatsAppModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirmarCriacaoCasos: (casosParaCriar: CriarDevolucaoCasoInput[]) => Promise<void>
  industriasDisponiveis: Array<{ id: string; nome: string }>
  lojasDisponiveis: Array<{ codigo: string; nome: string }>
}

export const ImportarWhatsAppModal: React.FC<ImportarWhatsAppModalProps> = ({
  isOpen,
  onClose,
  onConfirmarCriacaoCasos,
  industriasDisponiveis,
  lojasDisponiveis,
}) => {
  const [etapa, setEtapa] = useState<'upload' | 'revisao' | 'concluido'>('upload')
  const [arquivoTxt, setArquivoTxt] = useState<File | null>(null)
  const [arquivosMidia, setArquivosMidia] = useState<File[]>([])
  const [isProcessando, setIsProcessando] = useState(false)

  // Resultados da importação
  const [solicitacoes, setSolicitacoes] = useState<SolicitacaoIdentificadaWhatsApp[]>([])
  const [resumoImportacao, setResumoImportacao] = useState<{
    totalEncontradas: number
    jaConhecidas: number
    novas: number
    possiveisSolicitacoes: number
    precisamRevisao: number
    incompletas: number
  } | null>(null)

  // Estado para modal secundário de edição de solicitação incompleta ou escolha de produto
  const [solicitacaoEmEdicao, setSolicitacaoEmEdicao] =
    useState<SolicitacaoIdentificadaWhatsApp | null>(null)
  const [modalEdicaoOpen, setModalEdicaoOpen] = useState(false)

  // Catálogo completo carregado para busca manual
  const [catalogoCompleto, setCatalogoCompleto] = useState<CatalogoProdutoContexto[]>([])
  const [buscaCatalogoTexto, setBuscaCatalogoTexto] = useState('')
  const [salvarNoDicionario, setSalvarNoDicionario] = useState(false)

  // Resetar ao fechar
  const handleClose = () => {
    setEtapa('upload')
    setArquivoTxt(null)
    setArquivosMidia([])
    setSolicitacoes([])
    setResumoImportacao(null)
    onClose()
  }

  // Upload e leitura do arquivo
  const handleLerArquivo = async () => {
    if (!arquivoTxt) {
      toast({
        title: 'Selecione um arquivo',
        description: 'Faça upload do arquivo .txt exportado pelo WhatsApp.',
        variant: 'destructive',
      })
      return
    }

    try {
      setIsProcessando(true)

      const texto = await arquivoTxt.text()

      // 1. Extrair mensagens para obter previamente seus hashes determinísticos
      const mensagensBrutas = extrairMensagensArquivoWhatsApp(texto)
      const hashesDoArquivo = mensagensBrutas.map((m) => m.hashDeterminista)

      // 2. Buscar hashes já conhecidos de forma persistente e escalável (sem janela de 50 lotes)
      const hashesJaConhecidos = await verificarHashesConhecidos(hashesDoArquivo)

      // Preparar mídias disponíveis
      const midiasObj = arquivosMidia.map((f) => ({
        nome: f.name,
        arquivo: f,
      }))

      // 3. Executar parser determinístico com tolerância a variações
      const parseResult = await parseConversaWhatsApp(texto, hashesJaConhecidos, midiasObj)

      setSolicitacoes(parseResult.solicitacoes)
      setResumoImportacao(parseResult.resumo)
      setEtapa('revisao')

      // 4. Calcular file_hash determinístico baseado no CONTEÚDO do arquivo (SHA-256)
      const fileHash = await calcularHashArquivo(arquivoTxt, arquivoTxt.name, arquivoTxt.size)

      // 5. Registrar lote e persistir mensagens individuais com unicidade estrita
      try {
        const user = pb.authStore.model
        await persistirLoteWhatsApp({
          fileName: arquivoTxt.name,
          fileHash,
          totalMensagens: parseResult.totalMensagens,
          mensagensConhecidas: parseResult.mensagensConhecidas,
          mensagensNovas: parseResult.mensagensNovas,
          solicitacoes: parseResult.solicitacoes,
          resumoProcessamento: parseResult.resumo,
          usuarioNome: user?.name || user?.email || 'Operador',
          hashesReaisMensagens: parseResult.todosHashesMensagens,
        })
      } catch (err) {
        console.warn('Erro ao registrar devolucoes_import_batches:', err)
      }

      toast({
        title: 'Conversa processada!',
        description: `${parseResult.solicitacoes.length} solicitação(ões) identificada(s) para revisão humana.`,
      })
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao processar conversa',
        description: 'Não foi possível ler o arquivo de exportação.',
        variant: 'destructive',
      })
    } finally {
      setIsProcessando(false)
    }
  }

  // Ações na Caixa de Importação
  const handleIgnorarSolicitacao = (id: string) => {
    setSolicitacoes((prev) =>
      prev.map((s) => (s.id === id ? { ...s, statusRevisao: 'ignorada' } : s)),
    )
  }

  const handleConfirmarIndividual = (id: string) => {
    setSolicitacoes((prev) =>
      prev.map((s) => (s.id === id ? { ...s, statusRevisao: 'confirmada' } : s)),
    )
  }

  // Agrupar itens com outro caso ("Vincular ao mesmo caso")
  const handleVincularAoMesmoCaso = (origemId: string, destinoId: string) => {
    setSolicitacoes((prev) =>
      prev.map((s) => (s.id === origemId ? { ...s, grupoCasoSugeridoId: destinoId } : s)),
    )
    toast({
      title: 'Itens Vinculados',
      description: 'As mensagens foram agrupadas e comporão o mesmo Caso de Devolução.',
    })
  }

  // Abrir modal de edição/completar informações
  const handleAbrirEdicao = async (sol: SolicitacaoIdentificadaWhatsApp) => {
    setSolicitacaoEmEdicao(JSON.parse(JSON.stringify(sol)))
    setSalvarNoDicionario(false)
    setBuscaCatalogoTexto('')

    // Carregar catálogo da indústria se houver
    try {
      const cat = await carregarCatalogoContextual(
        sol.industriaInformada || sol.industriaResolvida?.nome,
        sol.industriaResolvida?.id,
        sol.lojaResolvida?.codigo,
      )
      setCatalogoCompleto(cat)
    } catch (err) {
      console.warn('Erro ao carregar catálogo para busca:', err)
    }

    setModalEdicaoOpen(true)
  }

  // Salvar edições de uma solicitação incompleta ou produto escolhido
  const handleSalvarEdicao = async () => {
    if (!solicitacaoEmEdicao) return

    // Se marcou para salvar no dicionário
    if (salvarNoDicionario && solicitacaoEmEdicao.produtos[0]?.produtoConfirmado) {
      const prod = solicitacaoEmEdicao.produtos[0]
      try {
        await salvarProductAlias({
          alias: prod.textoProdutoInformado,
          produto_oficial_nome: prod.produtoConfirmado.nome,
          produto_oficial_codigo: prod.produtoConfirmado.codigo,
          industria_nome:
            solicitacaoEmEdicao.industriaResolvida?.nome ||
            solicitacaoEmEdicao.industriaInformada ||
            'Indústria',
          origem: 'importacao_whatsapp',
          confirmado_por: pb.authStore.model?.name || 'Operador',
        })
        toast({
          title: 'Correspondência salva no Dicionário!',
          description: `O termo "${prod.textoProdutoInformado}" agora será reconhecido automaticamente.`,
        })
      } catch (err) {
        console.warn('Erro ao salvar alias:', err)
      }
    }

    // Recalcular faltantes
    const faltantes: string[] = []
    if (!solicitacaoEmEdicao.lojaResolvida?.nome && !solicitacaoEmEdicao.lojaInformada)
      faltantes.push('Loja')
    if (!solicitacaoEmEdicao.industriaResolvida?.nome && !solicitacaoEmEdicao.industriaInformada)
      faltantes.push('Indústria')
    const p0 = solicitacaoEmEdicao.produtos[0]
    if (!p0?.produtoConfirmado && !p0?.textoProdutoInformado) faltantes.push('Produto')
    if (p0?.quantidadeInformada === undefined || p0?.quantidadeInformada <= 0)
      faltantes.push('Quantidade')
    if (!p0?.validadeInformada && !p0?.validadeAusente) faltantes.push('Validade')

    const incompleta = faltantes.length > 0

    setSolicitacoes((prev) =>
      prev.map((s) =>
        s.id === solicitacaoEmEdicao.id
          ? {
              ...solicitacaoEmEdicao,
              incompleta,
              camposFaltantes: faltantes,
              statusRevisao: 'confirmada',
            }
          : s,
      ),
    )

    setModalEdicaoOpen(false)
  }

  // Finalizar importação: agrupar por grupoCasoSugeridoId e enviar para criação
  const handleCriarCasosConfirmados = async () => {
    const confirmadas = solicitacoes.filter((s) => s.statusRevisao === 'confirmada')
    if (confirmadas.length === 0) {
      toast({
        title: 'Nenhuma solicitação confirmada',
        description: 'Confirme ou complete ao menos uma solicitação para criar o Caso.',
        variant: 'destructive',
      })
      return
    }

    // Agrupar por grupoCasoSugeridoId
    const grupos = new Map<string, SolicitacaoIdentificadaWhatsApp[]>()
    for (const sol of confirmadas) {
      const gid = sol.grupoCasoSugeridoId || sol.id
      const lista = grupos.get(gid) || []
      lista.push(sol)
      grupos.set(gid, lista)
    }

    const casosParaCriar: CriarDevolucaoCasoInput[] = []

    for (const [, solsDoGrupo] of grupos.entries()) {
      const ref = solsDoGrupo[0]
      const lojaNome = ref.lojaResolvida?.nome || ref.lojaInformada || 'Loja a identificar'
      const lojaCod = ref.lojaResolvida?.codigo || ''
      const indNome =
        ref.industriaResolvida?.nome || ref.industriaInformada || 'Indústria a identificar'

      // Unificar todos os produtos das mensagens do grupo
      const itensCaso = solsDoGrupo.flatMap((s) =>
        s.produtos.map((p) => ({
          produto_nome_informado: p.textoProdutoInformado,
          produto_codigo: p.produtoConfirmado?.codigo,
          produto_nome_oficial: p.produtoConfirmado?.nome,
          precisa_identificacao: !p.produtoConfirmado,
          quantidade_solicitada: p.quantidadeInformada,
          validade_informada: p.validadeInformada,
          validade_ausente: p.validadeAusente,
          motivo_item: p.motivoInformado,
          evidencia_foto_url: p.evidenciaNome,
        })),
      )

      // Evidências
      const evidenciasCaso = solsDoGrupo.flatMap((s) =>
        s.evidenciasDisponiveis.map((ev) => ({
          tipo: ev.tipo,
          titulo: ev.nome,
          url_arquivo: ev.url,
          arquivo: ev.arquivo instanceof File ? ev.arquivo : undefined,
        })),
      )

      casosParaCriar.push({
        data_solicitacao: new Date().toISOString().slice(0, 10),
        industry_name: indNome,
        store_code: lojaCod,
        store_name: lojaNome,
        promotor_nome: ref.autor || 'Promotor WhatsApp',
        motivo_geral: ref.produtos[0]?.motivoInformado || 'Troca operacional via WhatsApp',
        observacoes: `Importado de exportação WhatsApp. Total de mensagens agrupadas: ${solsDoGrupo.length}.`,
        itens: itensCaso,
        evidencias: evidenciasCaso,
      })
    }

    try {
      setIsProcessando(true)
      await onConfirmarCriacaoCasos(casosParaCriar)
      setEtapa('concluido')
      toast({
        title: 'Casos Criados!',
        description: `${casosParaCriar.length} Caso(s) de Devolução criado(s) e submetido(s) ao Motor de Auditoria.`,
      })
      setTimeout(() => {
        handleClose()
      }, 1500)
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao criar casos',
        description: 'Falha na gravação do Caso de Devolução.',
        variant: 'destructive',
      })
    } finally {
      setIsProcessando(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-6">
        <DialogHeader className="border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-emerald-100 text-emerald-800">
              <Upload className="w-5 h-5" />
            </span>
            <div>
              <DialogTitle className="text-lg font-bold text-slate-900">
                Importar Conversa do WhatsApp — Devoluções / NF
              </DialogTitle>
              <p className="text-xs text-slate-500">
                Lê a exportação nativa em .txt do WhatsApp, identifica solicitações, resolve
                produtos pelo catálogo oficial e permite revisão humana antes de criar o Caso.
              </p>
            </div>
          </div>
        </DialogHeader>

        {/* ETAPA 1: UPLOAD DO ARQUIVO */}
        {etapa === 'upload' && (
          <div className="space-y-5 py-4">
            <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center bg-slate-50 hover:bg-slate-100/70 transition-colors">
              <FileText className="w-10 h-10 text-slate-400 mx-auto mb-3" />
              <h4 className="text-sm font-bold text-slate-800">
                Selecione o arquivo de texto exportado pelo WhatsApp
              </h4>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                No WhatsApp, use a opção <em>"Exportar conversa"</em>. O SKIP processará mensagens
                com o formato "TROCA / SOLICITAÇÃO" e possíveis solicitações operacionais.
              </p>

              <div className="mt-4 flex flex-col items-center gap-2">
                <input
                  type="file"
                  accept=".txt"
                  id="arquivo-txt-whatsapp"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setArquivoTxt(e.target.files[0])
                    }
                  }}
                />
                <label
                  htmlFor="arquivo-txt-whatsapp"
                  className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-xs"
                >
                  <FolderOpen className="w-4 h-4" />
                  {arquivoTxt ? arquivoTxt.name : 'Escolher arquivo .txt'}
                </label>
                {arquivoTxt && (
                  <span className="text-xs text-emerald-600 font-semibold">
                    ✓ Arquivo selecionado ({Math.round(arquivoTxt.size / 1024)} KB)
                  </span>
                )}
              </div>
            </div>

            {/* Upload opcional de mídias anexas */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <h5 className="font-bold text-slate-800">
                    Fotos e Mídias Anexas da Conversa (opcional)
                  </h5>
                  <p className="text-[11px] text-slate-500">
                    Se você exportou a conversa com mídia, selecione as imagens para associação
                    segura automática com as mensagens correspondentes.
                  </p>
                </div>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  id="arquivos-midia-whatsapp"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) {
                      setArquivosMidia(Array.from(e.target.files))
                    }
                  }}
                />
                <label
                  htmlFor="arquivos-midia-whatsapp"
                  className="cursor-pointer px-3 py-1.5 border border-slate-300 rounded-md text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  {arquivosMidia.length > 0 ? `${arquivosMidia.length} foto(s)` : 'Adicionar fotos'}
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={handleClose}>
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={handleLerArquivo}
                disabled={!arquivoTxt || isProcessando}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs"
              >
                {isProcessando ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    Processando conversa...
                  </>
                ) : (
                  'Identificar Solicitações'
                )}
              </Button>
            </div>
          </div>
        )}

        {/* ETAPA 2: CAIXA DE IMPORTAÇÃO (REVISÃO HUMANA ANTES DA CRIAÇÃO) */}
        {etapa === 'revisao' && (
          <div className="space-y-4 py-3">
            {/* Resumo da Importação e Deduplicação */}
            {resumoImportacao && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs text-slate-700">
                <div className="flex items-center justify-between font-bold text-slate-800 pb-2 border-b border-slate-200">
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-indigo-600" />
                    Resumo do Processamento da Conversa
                  </span>
                  <Badge variant="outline" className="bg-white">
                    {resumoImportacao.novas} mensagens novas
                  </Badge>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 text-[11px]">
                  <div>
                    <span className="text-slate-400">Total de Mensagens:</span>{' '}
                    <strong>{resumoImportacao.totalEncontradas}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400">Já Conhecidas (Dedup):</span>{' '}
                    <strong>{resumoImportacao.jaConhecidas}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400">Possíveis Solicitações:</span>{' '}
                    <strong className="text-indigo-600">
                      {resumoImportacao.possiveisSolicitacoes}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400">Incompletas / Revisão:</span>{' '}
                    <strong className="text-amber-600">{resumoImportacao.incompletas}</strong>
                  </div>
                </div>
              </div>
            )}

            {/* Lista de Cards da Caixa de Importação */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
                <span>
                  Solicitações Identificadas para Revisão (
                  {solicitacoes.filter((s) => s.statusRevisao !== 'ignorada').length})
                </span>
                <span className="text-[11px] text-slate-400 normal-case font-normal">
                  A importação NÃO cria Caso automaticamente sem sua confirmação.
                </span>
              </h4>

              {solicitacoes.length === 0 ? (
                <div className="text-center py-10 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-500">
                  Nenhuma solicitação ou padrão de troca foi identificado neste trecho da conversa.
                </div>
              ) : (
                solicitacoes.map((sol) => {
                  const isIgnorada = sol.statusRevisao === 'ignorada'
                  const isConfirmada = sol.statusRevisao === 'confirmada'
                  const p0 = sol.produtos[0]
                  const resProd = p0?.resolucaoProduto

                  return (
                    <div
                      key={sol.id}
                      className={`border rounded-xl p-3.5 transition-colors ${
                        isIgnorada
                          ? 'opacity-40 bg-slate-50 border-slate-200'
                          : isConfirmada
                            ? 'bg-emerald-50/40 border-emerald-300'
                            : sol.incompleta
                              ? 'bg-amber-50/30 border-amber-300'
                              : 'bg-white border-slate-200 shadow-2xs'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 border-b border-slate-100 pb-2.5">
                        <div>
                          <div className="flex items-center gap-2">
                            <Badge
                              className={`text-[10px] font-bold ${
                                sol.incompleta
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-indigo-100 text-indigo-800'
                              }`}
                            >
                              {sol.incompleta ? 'POSSÍVEL SOLICITAÇÃO' : 'SOLICITAÇÃO IDENTIFICADA'}
                            </Badge>
                            <span className="text-xs font-bold text-slate-800">
                              {sol.lojaInformada || 'Loja não identificada'}
                            </span>
                            <span className="text-[11px] text-slate-400">
                              • {sol.dataHoraMsg} • {sol.autor}
                            </span>
                          </div>

                          {/* Campos Faltantes em Incompletas */}
                          {sol.incompleta && sol.camposFaltantes.length > 0 && (
                            <p className="text-[11px] text-amber-800 mt-1 font-medium">
                              ⚠ Campos faltantes: <strong>{sol.camposFaltantes.join(', ')}</strong>
                            </p>
                          )}
                        </div>

                        {/* Ações por solicitação */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          {isIgnorada ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-xs h-7 text-slate-600"
                              onClick={() =>
                                setSolicitacoes((prev) =>
                                  prev.map((s) =>
                                    s.id === sol.id ? { ...s, statusRevisao: 'pendente' } : s,
                                  ),
                                )
                              }
                            >
                              Restaurar
                            </Button>
                          ) : (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleAbrirEdicao(sol)}
                                className="text-xs h-7 border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                              >
                                {sol.incompleta ? 'Completar' : 'Revisar'}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleIgnorarSolicitacao(sol.id)}
                                className="text-xs h-7 text-slate-500 hover:text-rose-600"
                              >
                                Ignorar
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => handleConfirmarIndividual(sol.id)}
                                className={`text-xs h-7 font-semibold ${
                                  isConfirmada
                                    ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                    : 'bg-slate-800 text-white hover:bg-slate-900'
                                }`}
                              >
                                {isConfirmada ? '✓ Confirmado' : 'Confirmar'}
                              </Button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Informações dos Produtos */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-xs">
                        <div className="space-y-1">
                          <p className="text-slate-500">
                            <strong>Indústria:</strong>{' '}
                            {sol.industriaInformada || (
                              <span className="text-amber-700 italic">Não identificada</span>
                            )}
                          </p>
                          <p className="text-slate-500">
                            <strong>Produto Informado:</strong>{' '}
                            <em className="text-slate-800">
                              "{p0?.textoProdutoInformado || 'Não informado'}"
                            </em>
                          </p>
                          <p className="text-slate-500">
                            <strong>Quantidade:</strong>{' '}
                            {p0?.quantidadeInformada > 0 ? (
                              <span>{p0.quantidadeInformada} un.</span>
                            ) : (
                              <span className="text-amber-700 italic">Não informada</span>
                            )}
                            {' | '}
                            <strong>Validade:</strong>{' '}
                            {p0?.validadeAusente ? (
                              <span className="text-amber-700 italic">Não informada</span>
                            ) : (
                              p0?.validadeInformada || '-'
                            )}
                          </p>
                        </div>

                        {/* Resolvedor de Produtos Oficial Sugerido */}
                        <div className="bg-slate-50 p-2 rounded-lg border border-slate-200/80 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-indigo-700 flex items-center gap-1">
                              <Sparkles className="w-3 h-3" />
                              Resolvedor de Produtos SKIP
                            </span>
                            {resProd && (
                              <Badge
                                variant="outline"
                                className={`text-[9px] ${
                                  resProd.nivel === 'correspondencia_segura'
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                    : resProd.nivel === 'muito_provavel'
                                      ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                                      : 'bg-amber-50 text-amber-800 border-amber-200'
                                }`}
                              >
                                {resProd.nivel.replace('_', ' ')}
                              </Badge>
                            )}
                          </div>

                          {p0?.produtoConfirmado ? (
                            <p className="text-xs font-bold text-emerald-800">
                              ✓ {p0.produtoConfirmado.nome}
                            </p>
                          ) : resProd?.produtoOficial ? (
                            <p className="text-xs font-semibold text-slate-800">
                              Sugerido: <strong>{resProd.produtoOficial.nome}</strong>
                            </p>
                          ) : (
                            <p className="text-[11px] text-amber-700 italic">
                              Produto não associado automaticamente. Clique em "Revisar" para
                              selecionar no catálogo.
                            </p>
                          )}

                          {resProd?.explicacao && (
                            <p className="text-[10px] text-slate-500 line-clamp-2">
                              {resProd.explicacao}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Associação de Mídias e Agrupamento */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 mt-2 border-t border-slate-100 text-[11px] text-slate-500">
                        <div className="flex items-center gap-2">
                          <span>
                            Evidência:{' '}
                            {sol.evidenciasDisponiveis.length > 0 ? (
                              <strong className="text-emerald-700">
                                Disponível ({sol.evidenciasDisponiveis[0].nome})
                              </strong>
                            ) : (
                              <span className="text-slate-400">Não anexada</span>
                            )}
                          </span>
                        </div>

                        {/* Ação de Vincular ao mesmo caso */}
                        <div className="flex items-center gap-1">
                          <LinkIcon className="w-3 h-3 text-slate-400" />
                          <span className="text-slate-400">Agrupamento:</span>
                          <Select
                            value={sol.grupoCasoSugeridoId || sol.id}
                            onValueChange={(val) => handleVincularAoMesmoCaso(sol.id, val)}
                          >
                            <SelectTrigger className="h-6 text-[10px] py-0 px-2 bg-white">
                              <SelectValue placeholder="Caso próprio" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={sol.id}>Novo Caso Exclusivo</SelectItem>
                              {solicitacoes
                                .filter((other) => other.id !== sol.id)
                                .map((other, oIdx) => (
                                  <SelectItem key={other.id} value={other.id}>
                                    Vincular ao Caso #{oIdx + 1} ({other.lojaInformada || 'Loja'})
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            <DialogFooter className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-3 border-t border-slate-200">
              <Button variant="outline" size="sm" onClick={() => setEtapa('upload')}>
                ← Voltar para Upload
              </Button>

              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleClose}>
                  Fechar
                </Button>
                <Button
                  size="sm"
                  onClick={handleCriarCasosConfirmados}
                  disabled={
                    isProcessando ||
                    solicitacoes.filter((s) => s.statusRevisao === 'confirmada').length === 0
                  }
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs"
                >
                  {isProcessando ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      Criando Casos...
                    </>
                  ) : (
                    `Confirmar e Criar ${
                      solicitacoes.filter((s) => s.statusRevisao === 'confirmada').length
                    } Caso(s)`
                  )}
                </Button>
              </div>
            </DialogFooter>
          </div>
        )}

        {/* ETAPA 3: CONCLUÍDO */}
        {etapa === 'concluido' && (
          <div className="py-12 text-center space-y-3">
            <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
            <h3 className="text-base font-bold text-slate-900">
              Importação Concluída com Sucesso!
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Os Casos de Devolução foram criados e o Motor de Auditoria SKIP foi executado
              automaticamente para cada produto.
            </p>
          </div>
        )}

        {/* MODAL SECUNDÁRIO: COMPLETAR INFORMAÇÕES OU ESCOLHER CANDIDATO */}
        {modalEdicaoOpen && solicitacaoEmEdicao && (
          <Dialog open={modalEdicaoOpen} onOpenChange={setModalEdicaoOpen}>
            <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-sm font-bold text-slate-900">
                  Revisar Solicitação &amp; Associar Produto
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4 py-2 text-xs">
                {/* Loja & Indústria */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Loja *</Label>
                    <Input
                      type="text"
                      placeholder="Nome ou código da loja..."
                      value={
                        solicitacaoEmEdicao.lojaResolvida?.nome ||
                        solicitacaoEmEdicao.lojaInformada ||
                        ''
                      }
                      onChange={(e) =>
                        setSolicitacaoEmEdicao((prev) =>
                          prev
                            ? {
                                ...prev,
                                lojaInformada: e.target.value,
                                lojaResolvida: {
                                  codigo: e.target.value.match(/\d+/)?.[0] || '',
                                  nome: e.target.value,
                                },
                              }
                            : null,
                        )
                      }
                      className="h-8 text-xs mt-1"
                    />
                  </div>

                  <div>
                    <Label className="text-xs">Indústria *</Label>
                    <Input
                      type="text"
                      placeholder="Nome da indústria..."
                      value={
                        solicitacaoEmEdicao.industriaResolvida?.nome ||
                        solicitacaoEmEdicao.industriaInformada ||
                        ''
                      }
                      onChange={(e) =>
                        setSolicitacaoEmEdicao((prev) =>
                          prev
                            ? {
                                ...prev,
                                industriaInformada: e.target.value,
                                industriaResolvida: { nome: e.target.value },
                              }
                            : null,
                        )
                      }
                      className="h-8 text-xs mt-1"
                    />
                  </div>
                </div>

                {/* Dados do Produto */}
                {solicitacaoEmEdicao.produtos[0] && (
                  <div className="space-y-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
                    <h5 className="font-bold text-slate-800">Dados do Produto Solicitado</h5>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Quantidade Solicitada *</Label>
                        <Input
                          type="number"
                          min={1}
                          value={solicitacaoEmEdicao.produtos[0].quantidadeInformada || ''}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10) || 0
                            setSolicitacaoEmEdicao((prev) => {
                              if (!prev) return null
                              const p = [...prev.produtos]
                              p[0].quantidadeInformada = val
                              return { ...prev, produtos: p }
                            })
                          }}
                          className="h-8 text-xs mt-1"
                        />
                      </div>

                      <div>
                        <Label className="text-xs">Validade (YYYY-MM-DD)</Label>
                        <Input
                          type="date"
                          value={solicitacaoEmEdicao.produtos[0].validadeInformada || ''}
                          onChange={(e) => {
                            const val = e.target.value
                            setSolicitacaoEmEdicao((prev) => {
                              if (!prev) return null
                              const p = [...prev.produtos]
                              p[0].validadeInformada = val
                              p[0].validadeAusente = !val
                              return { ...prev, produtos: p }
                            })
                          }}
                          className="h-8 text-xs mt-1"
                        />
                      </div>
                    </div>

                    {/* Candidatos Próximos Sugeridos pelo Resolvedor */}
                    <div className="pt-2">
                      <Label className="text-xs font-bold text-indigo-900">
                        Candidatos do Catálogo Sugeridos:
                      </Label>
                      <div className="space-y-1.5 mt-1">
                        {solicitacaoEmEdicao.produtos[0].resolucaoProduto?.candidatos &&
                        solicitacaoEmEdicao.produtos[0].resolucaoProduto.candidatos.length > 0 ? (
                          solicitacaoEmEdicao.produtos[0].resolucaoProduto.candidatos.map(
                            (cand, cIdx) => (
                              <div
                                key={cIdx}
                                className="flex items-center justify-between p-2 rounded-md bg-white border border-slate-200 hover:border-indigo-300 text-xs"
                              >
                                <div>
                                  <span className="font-bold text-slate-900">{cand.nome}</span>
                                  <div className="flex flex-wrap gap-1 text-[10px] text-slate-500 mt-0.5">
                                    {cand.sinais
                                      .filter((s) => s.presente)
                                      .map((s, sIdx) => (
                                        <Badge
                                          key={sIdx}
                                          variant="outline"
                                          className="text-[9px] bg-slate-50 text-slate-600"
                                        >
                                          {s.rotulo} ✓
                                        </Badge>
                                      ))}
                                  </div>
                                </div>
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    setSolicitacaoEmEdicao((prev) => {
                                      if (!prev) return null
                                      const p = [...prev.produtos]
                                      p[0].produtoConfirmado = {
                                        codigo: cand.codigo,
                                        nome: cand.nome,
                                      }
                                      return { ...prev, produtos: p }
                                    })
                                  }}
                                  className="h-6 text-[10px] px-2 bg-indigo-600 hover:bg-indigo-700 text-white"
                                >
                                  Selecionar
                                </Button>
                              </div>
                            ),
                          )
                        ) : (
                          <p className="text-slate-400 italic text-[11px]">
                            Nenhum candidato sugerido com alta confiança.
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Busca Manual como Fallback */}
                    <div className="pt-2 border-t border-slate-200">
                      <Label className="text-xs font-bold text-slate-700">
                        Busca Manual no Catálogo Completo:
                      </Label>
                      <div className="flex items-center gap-2 mt-1">
                        <Input
                          type="text"
                          placeholder="Digite para pesquisar no catálogo da indústria..."
                          value={buscaCatalogoTexto}
                          onChange={(e) => setBuscaCatalogoTexto(e.target.value)}
                          className="h-8 text-xs"
                        />
                      </div>

                      {/* Lista de Resultados da Busca Manual */}
                      {buscaCatalogoTexto.trim().length > 1 && (
                        <div className="max-h-36 overflow-y-auto mt-1 border border-slate-200 rounded-md bg-white p-1 space-y-1">
                          {catalogoCompleto
                            .filter((c) =>
                              c.nome.toLowerCase().includes(buscaCatalogoTexto.toLowerCase()),
                            )
                            .slice(0, 10)
                            .map((c, idx) => (
                              <div
                                key={idx}
                                className="flex items-center justify-between p-1.5 hover:bg-slate-50 rounded text-[11px]"
                              >
                                <span>{c.nome}</span>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setSolicitacaoEmEdicao((prev) => {
                                      if (!prev) return null
                                      const p = [...prev.produtos]
                                      p[0].produtoConfirmado = {
                                        codigo: c.codigo,
                                        nome: c.nome,
                                      }
                                      return { ...prev, produtos: p }
                                    })
                                  }}
                                  className="h-6 text-[10px] text-indigo-700"
                                >
                                  Escolher
                                </Button>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>

                    {/* Produto Selecionado Atualmente */}
                    {solicitacaoEmEdicao.produtos[0].produtoConfirmado && (
                      <div className="bg-emerald-50 border border-emerald-300 p-2 rounded-md text-xs text-emerald-900 flex items-center justify-between">
                        <div>
                          <strong>Produto Oficial Selecionado:</strong>{' '}
                          {solicitacaoEmEdicao.produtos[0].produtoConfirmado.nome}
                        </div>
                      </div>
                    )}

                    {/* Aprendizado por Confirmação: Salvar no Dicionário de Produtos */}
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="checkbox"
                        id="salvar-dicionario-check"
                        checked={salvarNoDicionario}
                        onChange={(e) => setSalvarNoDicionario(e.target.checked)}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <label
                        htmlFor="salvar-dicionario-check"
                        className="text-xs text-slate-700 cursor-pointer"
                      >
                        Salvar correspondência para próximas solicitações (Dicionário de Produtos)
                      </label>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <Button variant="outline" size="sm" onClick={() => setModalEdicaoOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  onClick={handleSalvarEdicao}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs"
                >
                  Confirmar Revisão
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </DialogContent>
    </Dialog>
  )
}
