import React, { useState, useEffect } from 'react'
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
  CriarDevolucaoItemInput,
} from '@/types/devolucoes'
import {
  extrairMensagensArquivoWhatsApp,
  parseConversaWhatsApp,
  InformacoesReconciliacaoCabecalho,
} from '@/lib/import/whatsappParser'
import { processarZipWhatsApp } from '@/lib/import/zipReader'
import { calcularHashArquivo } from '@/lib/data/tradeProPipeline'
import {
  verificarHashesConhecidos,
  persistirLoteWhatsApp,
  carregarSolicitacoesPersistidas,
  carregarVinculosCasosExistentes,
  marcarSolicitacaoComoIgnorada,
  reabrirSolicitacaoIgnorada,
  salvarOuAtualizarSolicitacoesPersistidas,
} from '@/services/devolucoesDedupService'
import { EstadoOperacionalImportacao } from '@/types/devolucoes'
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
  FileArchive,
  Image as ImageIcon,
  Plus,
  Trash2,
  Info,
} from 'lucide-react'

interface ImportarWhatsAppModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirmarCriacaoCasos: (casosParaCriar: CriarDevolucaoCasoInput[]) => Promise<void>
  industriasDisponiveis: Array<{ id: string; nome: string }>
  lojasDisponiveis: Array<{ codigo: string; nome: string }>
}

interface SolicitacaoEnriquecidaUI extends SolicitacaoIdentificadaWhatsApp {
  reconciliacaoCabecalho?: InformacoesReconciliacaoCabecalho
  temMidiaOcultada?: boolean
  midiaOcultadaDescricao?: string
  ambiguidadePosicional?: boolean
  trechoOriginalWhatsapp?: string
}

export const ImportarWhatsAppModal: React.FC<ImportarWhatsAppModalProps> = ({
  isOpen,
  onClose,
  onConfirmarCriacaoCasos,
  industriasDisponiveis,
  lojasDisponiveis,
}) => {
  const [etapa, setEtapa] = useState<'upload' | 'revisao' | 'concluido'>('upload')
  const [arquivoSelecionado, setArquivoSelecionado] = useState<File | null>(null)
  const [arquivosMidiaManuais, setArquivosMidiaManuais] = useState<File[]>([])
  const [isProcessando, setIsProcessando] = useState(false)

  // Metadados do arquivo processado
  const [arquivoConversaOrigem, setArquivoConversaOrigem] = useState<string>('')
  const [formatoFonte, setFormatoFonte] = useState<string>('txt')
  const [totalMidiasExtraidas, setTotalMidiasExtraidas] = useState<number>(0)

  // Resultados da importação
  const [solicitacoes, setSolicitacoes] = useState<SolicitacaoEnriquecidaUI[]>([])
  const [resumoImportacao, setResumoImportacao] = useState<{
    totalEncontradas: number
    jaConhecidas: number
    novas: number
    possiveisSolicitacoes: number
    precisamRevisao: number
    incompletas: number
    comMidiaOcultada: number
    comMidiaRealAnexa: number
    solicitacoesNovas?: number
    solicitacoesPendentes?: number
    solicitacoesProcessadas?: number
    solicitacoesIgnoradas?: number
  } | null>(null)

  // Estado para modal secundário de revisão humana
  const [solicitacaoEmEdicao, setSolicitacaoEmEdicao] = useState<SolicitacaoEnriquecidaUI | null>(
    null,
  )
  const [modalEdicaoOpen, setModalEdicaoOpen] = useState(false)

  // Item ativo em edição dentro da solicitação (para gerenciar múltiplos produtos)
  const [itemIndexEdicao, setItemIndexEdicao] = useState<number>(0)

  // Catálogo completo carregado para busca manual
  const [catalogoCompleto, setCatalogoCompleto] = useState<CatalogoProdutoContexto[]>([])
  const [buscaCatalogoTexto, setBuscaCatalogoTexto] = useState('')
  const [salvarNoDicionario, setSalvarNoDicionario] = useState(false)

  // Carregar solicitações pendentes de revisão previamente persistidas na Caixa
  useEffect(() => {
    if (!isOpen) return
    let isMounted = true

    async function carregarFilaPersistente() {
      try {
        const solicitacoesDb = await carregarSolicitacoesPersistidas()
        if (isMounted && solicitacoesDb.size > 0 && etapa === 'upload' && !arquivoSelecionado) {
          const pendentesArray: SolicitacaoEnriquecidaUI[] = []
          for (const reg of solicitacoesDb.values()) {
            if (pendentesArray.some((p) => p.id === reg.solicitacao_id)) continue

            const prods = (reg.produtos_json as SolicitacaoIdentificadaWhatsApp['produtos']) || []
            const faltantes: string[] = []
            if (!reg.loja_informada && !reg.loja_codigo) faltantes.push('Loja')
            if (!reg.industria_informada && !reg.industria_id) faltantes.push('Indústria')
            if (prods.length === 0) faltantes.push('Produto')

            pendentesArray.push({
              id: reg.solicitacao_id,
              rawMensagemId: reg.raw_mensagem_id,
              timestamp: reg.created || new Date().toISOString(),
              dataHoraMsg: reg.data_hora_msg || '',
              autor: reg.autor || 'Promotor',
              lojaInformada: reg.loja_informada || '',
              lojaResolvida: reg.loja_informada
                ? { codigo: reg.loja_codigo || '', nome: reg.loja_informada }
                : undefined,
              industriaInformada: reg.industria_informada || '',
              industriaResolvida: reg.industria_informada
                ? { id: reg.industria_id, nome: reg.industria_informada }
                : undefined,
              produtos: prods,
              incompleta: faltantes.length > 0,
              camposFaltantes: faltantes,
              evidenciasDisponiveis:
                (reg.evidencias_json as SolicitacaoIdentificadaWhatsApp['evidenciasDisponiveis']) ||
                [],
              statusRevisao:
                reg.estado_operacional === 'ignorada'
                  ? 'ignorada'
                  : reg.estado_operacional === 'processada'
                    ? 'confirmada'
                    : 'pendente',
              estadoOperacional: reg.estado_operacional,
              casoCriadoId: reg.caso_criado_id,
              casoCriadoCodigo: reg.caso_criado_codigo,
              trechoOriginalWhatsapp: reg.trecho_original,
              batchId: reg.batch_id,
              foiRecuperada: reg.foi_recuperada,
            })
          }

          if (pendentesArray.length > 0) {
            setSolicitacoes(pendentesArray)
            const pendentesReais = pendentesArray.filter(
              (s) => s.estadoOperacional === 'pendente_revisao' || s.estadoOperacional === 'nova',
            )
            if (pendentesReais.length > 0) {
              setEtapa('revisao')
              setResumoImportacao({
                totalEncontradas: pendentesArray.length,
                jaConhecidas: pendentesArray.length,
                novas: 0,
                possiveisSolicitacoes: pendentesArray.length,
                precisamRevisao: pendentesReais.length,
                incompletas: pendentesArray.filter((s) => s.incompleta).length,
                comMidiaOcultada: 0,
                comMidiaRealAnexa: 0,
                solicitacoesNovas: 0,
                solicitacoesPendentes: pendentesReais.length,
                solicitacoesProcessadas: pendentesArray.filter(
                  (s) => s.estadoOperacional === 'processada',
                ).length,
                solicitacoesIgnoradas: pendentesArray.filter(
                  (s) => s.estadoOperacional === 'ignorada',
                ).length,
              })
            }
          }
        }
      } catch (err) {
        console.warn('Erro ao carregar fila persistente do WhatsApp:', err)
      }
    }

    carregarFilaPersistente()
    return () => {
      isMounted = false
    }
  }, [isOpen, etapa, arquivoSelecionado])

  // Resetar ao fechar
  const handleClose = () => {
    setEtapa('upload')
    setArquivoSelecionado(null)
    setArquivosMidiaManuais([])
    setSolicitacoes([])
    setResumoImportacao(null)
    setArquivoConversaOrigem('')
    setTotalMidiasExtraidas(0)
    onClose()
  }

  // Upload e leitura do arquivo (aceita .zip ou .txt)
  const handleLerArquivo = async () => {
    if (!arquivoSelecionado) {
      toast({
        title: 'Selecione um arquivo',
        description: 'Faça upload do arquivo .zip ou .txt exportado pelo WhatsApp.',
        variant: 'destructive',
      })
      return
    }

    try {
      setIsProcessando(true)

      let textoConversa = ''
      let midiasDisponiveis: Array<{ nome: string; arquivo?: File | Blob }> = []
      let nomeArquivoOrigem = arquivoSelecionado.name
      let formatoDetectado = 'txt'

      const isZip =
        arquivoSelecionado.name.toLowerCase().endsWith('.zip') ||
        arquivoSelecionado.type === 'application/zip' ||
        arquivoSelecionado.type === 'application/x-zip-compressed'

      if (isZip) {
        // Extrair pacote ZIP determinístico
        const arrayBuffer = await arquivoSelecionado.arrayBuffer()
        const pacote = await processarZipWhatsApp(arrayBuffer)
        textoConversa = pacote.arquivoConversaConteudo
        nomeArquivoOrigem = pacote.arquivoConversaNome
        formatoDetectado = pacote.formatoConversa

        // Mídias contidas no ZIP
        midiasDisponiveis = pacote.midias.map((m) => ({
          nome: m.nome,
          arquivo: m.blob,
        }))
        setTotalMidiasExtraidas(pacote.midias.length)
      } else {
        // Arquivo TXT direto
        textoConversa = await arquivoSelecionado.text()
        midiasDisponiveis = arquivosMidiaManuais.map((f) => ({
          nome: f.name,
          arquivo: f,
        }))
        setTotalMidiasExtraidas(arquivosMidiaManuais.length)
      }

      setArquivoConversaOrigem(nomeArquivoOrigem)
      setFormatoFonte(formatoDetectado)

      // 1. Extrair mensagens para obter previamente seus hashes determinísticos
      const mensagensBrutas = extrairMensagensArquivoWhatsApp(textoConversa)
      const hashesDoArquivo = mensagensBrutas.map((m) => m.hashDeterminista)

      // 2. Buscar hashes já conhecidos de forma persistente e escalável (deduplicação v0.0.117)
      const hashesJaConhecidos = await verificarHashesConhecidos(hashesDoArquivo)

      // 2.1 Carregar estado operacional prévio persistido para as mensagens deste arquivo
      // REGRA CENTRAL: "mensagem conhecida ≠ solicitação concluída"
      const solicitacoesPersistidasMap = await carregarSolicitacoesPersistidas(hashesDoArquivo)
      const vinculosCasosMap = await carregarVinculosCasosExistentes(hashesDoArquivo)
      const mapaParser = new Map<
        string,
        {
          solicitacaoId: string
          rawMensagemId: string
          estadoOperacional: EstadoOperacionalImportacao
          casoCriadoId?: string
          casoCriadoCodigo?: string
          ignoradoPor?: string
          ignoradoEm?: string
          produtosAjustados?: SolicitacaoIdentificadaWhatsApp['produtos']
          foiRecuperada?: boolean
        }
      >()

      for (const [key, val] of solicitacoesPersistidasMap.entries()) {
        mapaParser.set(key, {
          solicitacaoId: val.solicitacao_id,
          rawMensagemId: val.raw_mensagem_id,
          estadoOperacional: val.estado_operacional,
          casoCriadoId: val.caso_criado_id,
          casoCriadoCodigo: val.caso_criado_codigo,
          ignoradoPor: val.ignorado_por,
          ignoradoEm: val.ignorado_em,
          produtosAjustados: val.produtos_json as SolicitacaoIdentificadaWhatsApp['produtos'],
          foiRecuperada: val.foi_recuperada,
        })
      }

      // 3. Executar parser separando "mensagem conhecida" de "estado operacional"
      const parseResult = await parseConversaWhatsApp(
        textoConversa,
        hashesJaConhecidos,
        midiasDisponiveis,
        industriasDisponiveis,
        mapaParser,
        vinculosCasosMap,
      )

      setSolicitacoes(parseResult.solicitacoes as SolicitacaoEnriquecidaUI[])
      setResumoImportacao(parseResult.resumo)
      setEtapa('revisao')

      // 4. Calcular file_hash determinístico baseado no CONTEÚDO normalizado da conversa
      // Regra 7: O hash do arquivo opera sobre a conversa normalizada, garantindo que
      // o mesmo chat em TXT ou ZIP reconheça o mesmo hash de conteúdo
      const arquivoParaHash = new File([textoConversa], nomeArquivoOrigem, {
        type: 'text/plain',
      })
      const fileHash = await calcularHashArquivo(
        arquivoParaHash,
        nomeArquivoOrigem,
        arquivoParaHash.size,
      )

      // 5. Registrar lote e persistir mensagens individuais com unicidade estrita
      try {
        const user = pb.authStore.model
        await persistirLoteWhatsApp({
          fileName: arquivoSelecionado.name,
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
        title: 'Conversa WhatsApp processada com sucesso!',
        description: `${parseResult.solicitacoes.length} solicitação(ões) identificada(s) para conferência.`,
      })
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao processar conversa',
        description:
          err instanceof Error
            ? err.message
            : 'Não foi possível ler o arquivo de exportação do WhatsApp.',
        variant: 'destructive',
      })
    } finally {
      setIsProcessando(false)
    }
  }

  // Ações na Caixa de Importação com persistência de estado (Regra 3, 7, 10 e 13)
  const handleIgnorarSolicitacao = async (id: string) => {
    setSolicitacoes((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, statusRevisao: 'ignorada', estadoOperacional: 'ignorada' } : s,
      ),
    )
    try {
      await marcarSolicitacaoComoIgnorada(
        id,
        'Decisão registrada pelo operador na Caixa de Importação',
      )
    } catch (e) {
      console.warn('Aviso ao registrar ignorado:', e)
    }
  }

  const handleReabrirSolicitacao = async (id: string) => {
    setSolicitacoes((prev) =>
      prev.map((s) =>
        s.id === id
          ? { ...s, statusRevisao: 'pendente', estadoOperacional: 'pendente_revisao' }
          : s,
      ),
    )
    try {
      await reabrirSolicitacaoIgnorada(id)
    } catch (e) {
      console.warn('Aviso ao reabrir ignorado:', e)
    }
  }

  const handleConfirmarIndividual = async (id: string) => {
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
  const handleAbrirEdicao = async (sol: SolicitacaoEnriquecidaUI) => {
    setSolicitacaoEmEdicao(JSON.parse(JSON.stringify(sol)))
    setItemIndexEdicao(0)
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

  // Adicionar novo produto manualmente na solicitação em edição
  const handleAdicionarItem = () => {
    if (!solicitacaoEmEdicao) return
    const novoIdx = solicitacaoEmEdicao.produtos.length
    const novoItem = {
      id: `prod_manual_${Date.now()}_${novoIdx}`,
      textoProdutoInformado: '',
      quantidadeInformada: 1,
      validadeAusente: true,
      motivoInformado: 'Troca operacional',
    }
    setSolicitacaoEmEdicao({
      ...solicitacaoEmEdicao,
      produtos: [...solicitacaoEmEdicao.produtos, novoItem],
    })
    setItemIndexEdicao(novoIdx)
  }

  // Remover item indevido da solicitação em edição
  const handleRemoverItem = (idxRemover: number) => {
    if (!solicitacaoEmEdicao || solicitacaoEmEdicao.produtos.length <= 1) {
      toast({
        title: 'Não é possível remover',
        description: 'A solicitação deve conter ao menos um item de produto.',
        variant: 'destructive',
      })
      return
    }

    const novosProds = solicitacaoEmEdicao.produtos.filter((_, idx) => idx !== idxRemover)
    setSolicitacaoEmEdicao({
      ...solicitacaoEmEdicao,
      produtos: novosProds,
    })
    setItemIndexEdicao(0)
  }

  // Salvar edições de uma solicitação incompleta ou produtos ajustados
  const handleSalvarEdicao = async () => {
    if (!solicitacaoEmEdicao) return

    // Se marcou para salvar no dicionário o item ativo
    const prodAtivo = solicitacaoEmEdicao.produtos[itemIndexEdicao]
    if (salvarNoDicionario && prodAtivo?.produtoConfirmado && prodAtivo.textoProdutoInformado) {
      try {
        await salvarProductAlias({
          alias: prodAtivo.textoProdutoInformado,
          produto_oficial_nome: prodAtivo.produtoConfirmado.nome,
          produto_oficial_codigo: prodAtivo.produtoConfirmado.codigo,
          industria_nome:
            solicitacaoEmEdicao.industriaResolvida?.nome ||
            solicitacaoEmEdicao.industriaInformada ||
            'Indústria',
          origem: 'importacao_whatsapp',
          confirmado_por: pb.authStore.model?.name || 'Operador',
        })
        toast({
          title: 'Correspondência salva no Dicionário!',
          description: `O termo "${prodAtivo.textoProdutoInformado}" agora será reconhecido automaticamente.`,
        })
      } catch (err) {
        console.warn('Erro ao salvar alias:', err)
      }
    }

    // Recalcular faltantes da solicitação inteira
    const faltantes: string[] = []
    if (!solicitacaoEmEdicao.lojaResolvida?.nome && !solicitacaoEmEdicao.lojaInformada)
      faltantes.push('Loja')
    if (!solicitacaoEmEdicao.industriaResolvida?.nome && !solicitacaoEmEdicao.industriaInformada)
      faltantes.push('Indústria')

    const prodsInvalidos = solicitacaoEmEdicao.produtos.some(
      (p) => !p.produtoConfirmado && !p.textoProdutoInformado,
    )
    if (prodsInvalidos) faltantes.push('Produto')

    const qtdsInvalidas = solicitacaoEmEdicao.produtos.some(
      (p) => p.quantidadeInformada === undefined || p.quantidadeInformada <= 0,
    )
    if (qtdsInvalidas) faltantes.push('Quantidade')

    const validadesAusentes = solicitacaoEmEdicao.produtos.some(
      (p) => !p.validadeInformada && !p.validadeAusente,
    )
    if (validadesAusentes) faltantes.push('Validade')

    const incompleta = faltantes.length > 0

    const solicitacaoAtualizada: SolicitacaoEnriquecidaUI = {
      ...solicitacaoEmEdicao,
      incompleta,
      camposFaltantes: faltantes,
      statusRevisao: 'confirmada',
      estadoOperacional: 'pendente_revisao',
    }

    setSolicitacoes((prev) =>
      prev.map((s) => (s.id === solicitacaoEmEdicao.id ? solicitacaoAtualizada : s)),
    )

    // Persistir os ajustes no backend imediatamente para nunca perder o trabalho em andamento (Regra 14)
    try {
      await salvarOuAtualizarSolicitacoesPersistidas([solicitacaoAtualizada])
    } catch (e) {
      console.warn('Aviso ao persistir ajustes do operador:', e)
    }

    setModalEdicaoOpen(false)
  }

  // Finalizar importação: agrupar por grupoCasoSugeridoId e enviar para criação
  // REGRA 4: Múltiplos produtos da mesma solicitação compõem UM ÚNICO Caso de Devolução
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
    const grupos = new Map<string, SolicitacaoEnriquecidaUI[]>()
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
      const solOrigemId = ref.id // Guarda id da solicitação para vínculo estrito e marcação de processada

      // Unificar todos os produtos das mensagens do grupo (Regra 4: UM caso com N produtos)
      const itensCaso: CriarDevolucaoItemInput[] = solsDoGrupo.flatMap((s) =>
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

      // Evidências reais anexas (Regra 2: nunca criar arquivo falso)
      const evidenciasCaso = solsDoGrupo.flatMap((s) =>
        s.evidenciasDisponiveis
          .filter((ev) => ev.arquivo) // SOMENTE arquivos reais recebidos
          .map((ev) => ({
            tipo: ev.tipo,
            titulo: ev.nome,
            url_arquivo: ev.url,
            arquivo: ev.arquivo instanceof File ? ev.arquivo : undefined,
          })),
      )

      // Se houver menção a mídia mas o arquivo não veio, registrar nas observações
      const teveMidiaOcultada = solsDoGrupo.some((s) => s.temMidiaOcultada)
      let observacoesGerais = `Importado de exportação WhatsApp (${arquivoConversaOrigem || 'Arquivo'}). Total de mensagens agrupadas: ${solsDoGrupo.length}.`
      if (teveMidiaOcultada && evidenciasCaso.length === 0) {
        observacoesGerais +=
          ' NOTA: Esta solicitação possuía evidência no WhatsApp, mas o arquivo de imagem não foi incluído nesta exportação.'
      }

      casosParaCriar.push({
        data_solicitacao: new Date().toISOString().slice(0, 10),
        industry_name: indNome,
        store_code: lojaCod,
        store_name: lojaNome,
        promotor_nome: ref.autor || 'Promotor WhatsApp',
        motivo_geral: ref.produtos[0]?.motivoInformado || 'Troca operacional via WhatsApp',
        observacoes: observacoesGerais,
        itens: itensCaso,
        evidencias: evidenciasCaso,
        solicitacaoOrigemId: solOrigemId,
      } as CriarDevolucaoCasoInput)
    }

    try {
      setIsProcessando(true)
      // REGRA 11 e 12: se falhar aqui, não marca como processada e não perde nada
      await onConfirmarCriacaoCasos(casosParaCriar)

      // Atualiza estado local das confirmadas para processada
      setSolicitacoes((prev) =>
        prev.map((s) =>
          s.statusRevisao === 'confirmada' ? { ...s, estadoOperacional: 'processada' } : s,
        ),
      )

      setEtapa('concluido')
      toast({
        title: 'Casos Criados com Sucesso!',
        description: `${casosParaCriar.length} Caso(s) de Devolução criado(s). As solicitações foram vinculadas e marcadas como processadas.`,
      })
      setTimeout(() => {
        handleClose()
      }, 1500)
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao criar casos de devolução',
        description:
          'Falha na gravação do Caso. Nenhuma solicitação foi perdida ou marcada indevidamente como processada.',
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
                Importar WhatsApp — Devoluções / NF
              </DialogTitle>
              <p className="text-xs text-slate-500">
                Aceita arquivo <strong>.zip</strong> direto (com ou sem mídia) ou{' '}
                <strong>.txt</strong>. Interpreta o bloco inteiro da solicitação, múltiplos produtos
                e reconcilia cabeçalho × corpo.
              </p>
            </div>
          </div>
        </DialogHeader>

        {/* ETAPA 1: UPLOAD DO ARQUIVO (.ZIP OU .TXT) */}
        {etapa === 'upload' && (
          <div className="space-y-5 py-4">
            <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center bg-slate-50 hover:bg-slate-100/70 transition-colors">
              <FileArchive className="w-10 h-10 text-indigo-500 mx-auto mb-3" />
              <h4 className="text-sm font-bold text-slate-800">
                Selecione o arquivo ZIP ou TXT exportado pelo WhatsApp
              </h4>
              <p className="text-xs text-slate-500 mt-1 max-w-lg mx-auto">
                Você pode anexar diretamente o arquivo compactado <strong>.zip</strong> (ex: "GRUPO
                02 — TROCAS E SOLICITAÇÕES.zip") ou o arquivo <strong>.txt</strong> descompactado. O
                SKIP abre o pacote, localiza a conversa e relaciona as mídias anexas.
              </p>

              <div className="mt-4 flex flex-col items-center gap-2">
                <input
                  type="file"
                  accept=".zip,.txt"
                  id="arquivo-whatsapp-upload"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setArquivoSelecionado(e.target.files[0])
                    }
                  }}
                />
                <label
                  htmlFor="arquivo-whatsapp-upload"
                  className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-xs"
                >
                  <FolderOpen className="w-4 h-4" />
                  {arquivoSelecionado ? arquivoSelecionado.name : 'Selecionar arquivo ZIP ou TXT'}
                </label>
                {arquivoSelecionado && (
                  <span className="text-xs text-emerald-600 font-semibold">
                    ✓ {arquivoSelecionado.name} ({Math.round(arquivoSelecionado.size / 1024)} KB)
                  </span>
                )}
              </div>
            </div>

            {/* Upload opcional de fotos se o usuário estiver usando TXT avulso */}
            {arquivoSelecionado && !arquivoSelecionado.name.toLowerCase().endsWith('.zip') && (
              <div className="bg-white border border-slate-200 rounded-xl p-4 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <h5 className="font-bold text-slate-800">
                      Fotos e Mídias Anexas Avulsas (opcional para .txt)
                    </h5>
                    <p className="text-[11px] text-slate-500">
                      Como você selecionou um arquivo .txt avulso, você pode anexar as fotos
                      correspondentes aqui.
                    </p>
                  </div>
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    id="arquivos-midia-manual"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files) {
                        setArquivosMidiaManuais(Array.from(e.target.files))
                      }
                    }}
                  />
                  <label
                    htmlFor="arquivos-midia-manual"
                    className="cursor-pointer px-3 py-1.5 border border-slate-300 rounded-md text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    {arquivosMidiaManuais.length > 0
                      ? `${arquivosMidiaManuais.length} foto(s)`
                      : 'Adicionar fotos'}
                  </label>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={handleClose}>
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={handleLerArquivo}
                disabled={!arquivoSelecionado || isProcessando}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs"
              >
                {isProcessando ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    Processando conversa e mídias...
                  </>
                ) : (
                  'Processar Arquivo'
                )}
              </Button>
            </div>
          </div>
        )}

        {/* ETAPA 2: CAIXA DE IMPORTAÇÃO DIDÁTICA (ORIGINAL × INTERPRETAÇÃO × ITENS × EVIDÊNCIAS × PENDÊNCIAS) */}
        {etapa === 'revisao' && (
          <div className="space-y-4 py-3">
            {/* Banner Informativo Positivo de Solicitações Recuperadas */}
            {resumoImportacao && (resumoImportacao.solicitacoesRecuperadas ?? 0) > 0 && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-xs text-emerald-900 flex items-start gap-3 shadow-xs">
                <Sparkles className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="font-bold text-emerald-950 text-sm">
                    Mensagens Anteriores Recuperadas com Sucesso
                  </h4>
                  <p className="text-emerald-800 leading-relaxed">
                    Encontramos{' '}
                    <strong>{resumoImportacao.solicitacoesRecuperadas}</strong>{' '}
                    mensagem(ns) já conhecida(s) que ainda não possuía(m) acompanhamento registrado. Elas foram recuperadas para revisão.
                  </p>
                </div>
              </div>
            )}

            {/* Resumo da Importação e Deduplicação */}
            {resumoImportacao && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs text-slate-700">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 font-bold text-slate-800 pb-2 border-b border-slate-200">
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-indigo-600" />
                    Resumo da Leitura ({arquivoConversaOrigem || 'Arquivo'} • Formato{' '}
                    {formatoFonte.toUpperCase()})
                  </span>
                  <div className="flex items-center gap-2">
                    {totalMidiasExtraidas > 0 && (
                      <Badge
                        variant="outline"
                        className="bg-white text-emerald-700 border-emerald-300 text-[10px]"
                      >
                        {totalMidiasExtraidas} mídia(s) no pacote
                      </Badge>
                    )}
                    <Badge variant="outline" className="bg-white text-[10px]">
                      {resumoImportacao.novas} msgs novas / {resumoImportacao.jaConhecidas}{' '}
                      conhecidas
                    </Badge>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 text-[11px]">
                  <div>
                    <span className="text-slate-400">Mensagens:</span>{' '}
                    <strong>{resumoImportacao.totalEncontradas}</strong>{' '}
                    <span className="text-[10px] text-slate-400">
                      ({resumoImportacao.novas} novas / {resumoImportacao.jaConhecidas} conhecidas)
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400">Solicitações na Fila:</span>{' '}
                    <strong className="text-indigo-600">{solicitacoes.length}</strong>
                    {Boolean(resumoImportacao.solicitacoesRecuperadas) && (
                      <span className="text-[10px] text-emerald-600 ml-1 font-semibold">
                        ({resumoImportacao.solicitacoesRecuperadas} recup.)
                      </span>
                    )}
                  </div>
                  <div>
                    <span className="text-slate-400">Pendentes de Ação:</span>{' '}
                    <strong className="text-amber-600">
                      {
                        solicitacoes.filter(
                          (s) =>
                            s.statusRevisao === 'pendente' && s.estadoOperacional !== 'processada',
                        ).length
                      }
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400">Processadas / Ignoradas:</span>{' '}
                    <strong className="text-slate-600">
                      {
                        solicitacoes.filter(
                          (s) =>
                            s.estadoOperacional === 'processada' ||
                            s.statusRevisao === 'confirmada',
                        ).length
                      }{' '}
                      proc. / {solicitacoes.filter((s) => s.statusRevisao === 'ignorada').length}{' '}
                      ign.
                    </strong>
                  </div>
                </div>
              </div>
            )}

            {/* Lista Didática de Solicitações */}
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
                <span>
                  Solicitações Identificadas para Revisão (
                  {solicitacoes.filter((s) => s.statusRevisao !== 'ignorada').length})
                </span>
                <span className="text-[11px] text-slate-400 normal-case font-normal">
                  Confira: ORIGINAL WhatsApp × INTERPRETAÇÃO SKIP antes de aprovar
                </span>
              </h4>

              {solicitacoes.length === 0 ? (
                <div className="text-center py-10 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-500">
                  Nenhuma solicitação ou padrão de troca foi identificado neste arquivo.
                </div>
              ) : (
                solicitacoes.map((sol, solIdx) => {
                  const isIgnorada = sol.statusRevisao === 'ignorada'
                  const isConfirmada = sol.statusRevisao === 'confirmada'
                  const recon = sol.reconciliacaoCabecalho

                  // Pendências didáticas
                  const pendencias: string[] = []
                  if (sol.incompleta) {
                    pendencias.push(`${sol.camposFaltantes.join(', ')} não informado(s)`)
                  }
                  if (recon?.divergenciaLoja) {
                    pendencias.push('Divergência entre loja do cabeçalho e corpo')
                  }
                  if (sol.ambiguidadePosicional) {
                    pendencias.push('Associação ambígua entre produtos e quantidades')
                  }
                  const prodsPrecisamConfirmacao = sol.produtos.filter(
                    (p) => !p.produtoConfirmado && p.resolucaoProduto?.precisaConfirmacaoHumana,
                  ).length
                  if (prodsPrecisamConfirmacao > 0) {
                    pendencias.push(
                      `${prodsPrecisamConfirmacao} produto(s) precisam de confirmação humana`,
                    )
                  }
                  const prodsValidadeAusente = sol.produtos.filter((p) => p.validadeAusente).length
                  if (prodsValidadeAusente > 0) {
                    pendencias.push(`${prodsValidadeAusente} validade(s) não informada(s)`)
                  }
                  if (
                    sol.temMidiaOcultada &&
                    sol.evidenciasDisponiveis.filter((e) => e.arquivo).length === 0
                  ) {
                    pendencias.push(
                      'Mídia mencionada no WhatsApp, mas não incluída nesta exportação',
                    )
                  }

                  return (
                    <div
                      key={sol.id}
                      className={`border rounded-xl p-4 transition-colors space-y-3 ${
                        isIgnorada
                          ? 'opacity-40 bg-slate-50 border-slate-200'
                          : isConfirmada
                            ? 'bg-emerald-50/30 border-emerald-300'
                            : pendencias.length > 0
                              ? 'bg-amber-50/20 border-amber-300'
                              : 'bg-white border-slate-200 shadow-2xs'
                      }`}
                    >
                      {/* Top Bar da Solicitação */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge
                            className={`text-[10px] font-bold ${
                              pendencias.length > 0
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-indigo-100 text-indigo-800'
                            }`}
                          >
                            SOLICITAÇÃO #{solIdx + 1}
                          </Badge>
                          <span className="text-xs font-bold text-slate-800">
                            {sol.lojaInformada || 'Loja não identificada'}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            • {sol.dataHoraMsg} • {sol.autor}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {isIgnorada ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs h-7 border-slate-300 text-indigo-700 hover:bg-indigo-50 font-medium"
                              onClick={() => handleReabrirSolicitacao(sol.id)}
                            >
                              Reabrir para revisão
                            </Button>
                          ) : (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleAbrirEdicao(sol)}
                                className="text-xs h-7 border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                              >
                                {pendencias.length > 0 ? 'Revisar / Ajustar' : 'Editar'}
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

                      {/* SEÇÃO 1: ORIGINAL WHATSAPP (O que o promotor escreveu) */}
                      <div className="bg-slate-50/80 rounded-lg p-2.5 border border-slate-200/70 text-xs">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                          1. Original (Mensagem no WhatsApp)
                        </span>
                        <pre className="text-[11px] text-slate-700 whitespace-pre-wrap font-sans bg-white p-2 rounded border border-slate-200">
                          {sol.trechoOriginalWhatsapp || 'Trecho não preservado'}
                        </pre>
                      </div>

                      {/* SEÇÃO 2: INTERPRETAÇÃO DO SKIP (Indústria, Loja, Promotor, Reconciliação) */}
                      <div className="bg-indigo-50/30 rounded-lg p-2.5 border border-indigo-100 text-xs space-y-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-900 block">
                          2. Interpretação do SKIP
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
                          <div>
                            <span className="text-slate-500">Indústria:</span>{' '}
                            <strong>{sol.industriaInformada || 'Não informada'}</strong>
                          </div>
                          <div>
                            <span className="text-slate-500">Loja Identificada:</span>{' '}
                            <strong>{sol.lojaInformada || 'Não informada'}</strong>
                          </div>
                          <div>
                            <span className="text-slate-500">Promotor / Repositor:</span>{' '}
                            <strong>{sol.autor}</strong>
                          </div>
                        </div>

                        {/* Alerta de Divergência Cabeçalho × Corpo (Cenário G) */}
                        {recon?.divergenciaLoja && (
                          <div className="bg-amber-100 border border-amber-300 text-amber-900 p-2 rounded text-[11px] flex items-start gap-1.5 mt-1">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" />
                            <div>
                              <strong>Atenção (Divergência Cabeçalho × Corpo):</strong>{' '}
                              {recon.divergenciaLojaMensagem}
                            </div>
                          </div>
                        )}

                        {recon?.consistenciaLoja && recon.codigoLojaCabecalho && (
                          <div className="text-[10px] text-emerald-700 font-medium">
                            ✓ Cabeçalho e corpo consistentes na Loja {recon.codigoLojaCabecalho}.
                          </div>
                        )}
                      </div>

                      {/* SEÇÃO 3: ITENS IDENTIFICADOS (Produtos múltiplos mapeados individualmente) */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                            3. Itens Identificados ({sol.produtos.length} produto(s) no mesmo caso)
                          </span>
                        </div>

                        <div className="space-y-1.5">
                          {sol.produtos.map((p, pIdx) => {
                            const res = p.resolucaoProduto
                            return (
                              <div
                                key={p.id || pIdx}
                                className="bg-white border border-slate-200 rounded-lg p-2.5 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                              >
                                <div className="space-y-0.5 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-bold text-slate-800">
                                      #{pIdx + 1} "
                                      {p.textoProdutoInformado || 'Produto não informado'}"
                                    </span>
                                    <Badge variant="outline" className="text-[10px] bg-slate-50">
                                      {p.quantidadeInformada > 0
                                        ? `${p.quantidadeInformada} un.`
                                        : 'Qtd não informada'}
                                    </Badge>
                                    <Badge
                                      variant="outline"
                                      className={`text-[10px] ${
                                        p.validadeAusente
                                          ? 'bg-amber-50 text-amber-800 border-amber-200'
                                          : 'bg-slate-50 text-slate-700'
                                      }`}
                                    >
                                      {p.validadeAusente
                                        ? 'Validade não informada'
                                        : `Val: ${p.validadeInformada}`}
                                    </Badge>
                                  </div>

                                  {/* Resolução do SKU Oficial */}
                                  <div className="text-[11px] pt-1">
                                    {p.produtoConfirmado ? (
                                      <span className="text-emerald-700 font-bold">
                                        ✓ Oficial Confirmado: {p.produtoConfirmado.nome}
                                      </span>
                                    ) : res?.produtoOficial ? (
                                      <span className="text-indigo-700">
                                        Sugerido: <strong>{res.produtoOficial.nome}</strong>{' '}
                                        <em className="text-slate-400">
                                          ({res.nivel.replace('_', ' ')})
                                        </em>
                                      </span>
                                    ) : (
                                      <span className="text-amber-700 italic">
                                        Nenhum SKU associado com alta confiança.
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      {/* SEÇÃO 4: EVIDÊNCIAS (Cenário H: Mídia Ocultada vs Cenário I: Mídia Real) */}
                      <div className="text-xs pt-1 border-t border-slate-100">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                          4. Evidências da Mensagem
                        </span>
                        {sol.evidenciasDisponiveis.filter((e) => e.arquivo).length > 0 ? (
                          <div className="flex items-center gap-2 text-emerald-800 bg-emerald-50 p-2 rounded-lg border border-emerald-200 text-[11px]">
                            <ImageIcon className="w-4 h-4 text-emerald-600" />
                            <span>
                              <strong>Foto recebida na exportação:</strong>{' '}
                              {sol.evidenciasDisponiveis.map((e) => e.nome).join(', ')} (Salva com o
                              caso)
                            </span>
                          </div>
                        ) : sol.temMidiaOcultada ? (
                          <div className="flex items-start gap-2 text-slate-700 bg-slate-100 p-2 rounded-lg border border-slate-200 text-[11px]">
                            <Info className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                            <div>
                              <strong>Mídia mencionada, mas não incluída na exportação.</strong>
                              <p className="text-[10px] text-slate-500">
                                O WhatsApp indicou (
                                {sol.midiaOcultadaDescricao || '<imagem ocultada>'}), mas a
                                exportação foi gerada sem mídia. Nenhuma evidência falsa foi criada;
                                você poderá anexar o arquivo posteriormente.
                              </p>
                            </div>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">
                            Nenhuma foto mencionada nesta mensagem.
                          </span>
                        )}
                      </div>

                      {/* SEÇÃO 5: PENDÊNCIAS CLARAS */}
                      {pendencias.length > 0 && (
                        <div className="bg-amber-50/80 border border-amber-200 rounded-lg p-2.5 text-xs text-amber-900 space-y-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3 text-amber-600" />
                            5. Pendências para Atenção do Operador
                          </span>
                          <ul className="list-disc list-inside text-[11px] space-y-0.5 pl-1">
                            {pendencias.map((pend, pIdx) => (
                              <li key={pIdx}>{pend}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Agrupamento com outro caso */}
                      <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-100">
                        <div className="flex items-center gap-1">
                          <LinkIcon className="w-3 h-3 text-slate-400" />
                          <span>Agrupar no Caso:</span>
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

        {/* MODAL SECUNDÁRIO: REVISÃO DE ITENS, SEPARAÇÃO DE PRODUTOS E ESCOLHA DE CANDIDATO */}
        {modalEdicaoOpen && solicitacaoEmEdicao && (
          <Dialog open={modalEdicaoOpen} onOpenChange={setModalEdicaoOpen}>
            <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-sm font-bold text-slate-900">
                  Revisar Itens &amp; Resolver Produtos — Solicitação WhatsApp
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

                {/* Seleção do Item da Solicitação para Edição */}
                <div className="border-t border-b border-slate-200 py-2">
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-xs font-bold text-slate-800">
                      Produtos desta Solicitação ({solicitacaoEmEdicao.produtos.length})
                    </Label>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleAdicionarItem}
                      className="h-6 text-[10px] text-indigo-700 border-indigo-200"
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Adicionar Produto
                    </Button>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {solicitacaoEmEdicao.produtos.map((p, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setItemIndexEdicao(idx)}
                        className={`px-2.5 py-1 rounded text-xs font-medium border flex items-center gap-1 ${
                          itemIndexEdicao === idx
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <span>
                          Item {idx + 1}: {p.textoProdutoInformado || 'Novo'}
                        </span>
                        {solicitacaoEmEdicao.produtos.length > 1 && (
                          <span
                            onClick={(e) => {
                              e.stopPropagation()
                              handleRemoverItem(idx)
                            }}
                            className="ml-1 text-slate-300 hover:text-rose-500 cursor-pointer"
                            title="Remover este item"
                          >
                            ×
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Dados do Item Ativo Selecionado */}
                {solicitacaoEmEdicao.produtos[itemIndexEdicao] && (
                  <div className="space-y-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
                    <div className="flex items-center justify-between">
                      <h5 className="font-bold text-slate-800">
                        Editando Item #{itemIndexEdicao + 1}
                      </h5>
                    </div>

                    <div>
                      <Label className="text-xs">Texto Informado pelo Promotor</Label>
                      <Input
                        type="text"
                        value={
                          solicitacaoEmEdicao.produtos[itemIndexEdicao].textoProdutoInformado || ''
                        }
                        onChange={(e) => {
                          const val = e.target.value
                          setSolicitacaoEmEdicao((prev) => {
                            if (!prev) return null
                            const p = [...prev.produtos]
                            p[itemIndexEdicao].textoProdutoInformado = val
                            return { ...prev, produtos: p }
                          })
                        }}
                        className="h-8 text-xs mt-1"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Quantidade *</Label>
                        <Input
                          type="number"
                          min={1}
                          value={
                            solicitacaoEmEdicao.produtos[itemIndexEdicao].quantidadeInformada || ''
                          }
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10) || 0
                            setSolicitacaoEmEdicao((prev) => {
                              if (!prev) return null
                              const p = [...prev.produtos]
                              p[itemIndexEdicao].quantidadeInformada = val
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
                          value={
                            solicitacaoEmEdicao.produtos[itemIndexEdicao].validadeInformada || ''
                          }
                          onChange={(e) => {
                            const val = e.target.value
                            setSolicitacaoEmEdicao((prev) => {
                              if (!prev) return null
                              const p = [...prev.produtos]
                              p[itemIndexEdicao].validadeInformada = val
                              p[itemIndexEdicao].validadeAusente = !val
                              return { ...prev, produtos: p }
                            })
                          }}
                          className="h-8 text-xs mt-1"
                        />
                      </div>
                    </div>

                    {/* Candidatos do Catálogo Sugeridos pelo Resolvedor */}
                    <div className="pt-2">
                      <Label className="text-xs font-bold text-indigo-900">
                        Candidatos do Catálogo Sugeridos:
                      </Label>
                      <div className="space-y-1.5 mt-1">
                        {solicitacaoEmEdicao.produtos[itemIndexEdicao].resolucaoProduto
                          ?.candidatos &&
                        solicitacaoEmEdicao.produtos[itemIndexEdicao].resolucaoProduto!.candidatos
                          .length > 0 ? (
                          solicitacaoEmEdicao.produtos[
                            itemIndexEdicao
                          ].resolucaoProduto!.candidatos.map((cand, cIdx) => (
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
                                    p[itemIndexEdicao].produtoConfirmado = {
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
                          ))
                        ) : (
                          <p className="text-slate-400 italic text-[11px]">
                            Nenhum candidato sugerido automaticamente com alta confiança.
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Busca Manual no Catálogo Completo */}
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
                                      p[itemIndexEdicao].produtoConfirmado = {
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
                    {solicitacaoEmEdicao.produtos[itemIndexEdicao].produtoConfirmado && (
                      <div className="bg-emerald-50 border border-emerald-300 p-2 rounded-md text-xs text-emerald-900 flex items-center justify-between">
                        <div>
                          <strong>Produto Oficial Selecionado:</strong>{' '}
                          {solicitacaoEmEdicao.produtos[itemIndexEdicao].produtoConfirmado!.nome}
                        </div>
                      </div>
                    )}

                    {/* Salvar no Dicionário */}
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
                  Confirmar Revisão da Solicitação
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </DialogContent>
    </Dialog>
  )
}
