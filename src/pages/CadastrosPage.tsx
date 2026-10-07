import React from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Factory,
  Package,
  Layers,
  Users,
  AlertCircle,
  Link2,
  Plus,
  Search,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Edit2,
  TrendingUp,
  History,
  CheckCircle,
  ArrowUpDown,
  Building,
  Store,
  Eye,
  MapPin,
  Check,
  X,
  Shuffle,
  ShieldCheck,
  Filter,
  BarChart2,
  UserCheck,
  CheckCircle2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/services/authContext'
import { useToast } from '@/hooks/use-toast'
import type {
  CadastroIndustria,
  CadastroProduto,
  CadastroRede,
  CadastroLoja,
  CadastroSupervisor,
  CadastroPromotor,
  CadastroPromotorAssignment,
  CadastroPendencia,
  MixOpportunityAnalysis,
} from '@/types/cadastros'
import {
  getCadastrosIndustrias,
  saveCadastroIndustria,
  getCadastrosProdutos,
  saveCadastroProduto,
  executeMixBatchAction,
  type MixBatchActionResult,
  getCadastrosRedes,
  saveCadastroRede,
  getCadastrosLojas,
  saveCadastroLoja,
  moverLojaDeRede,
  getCadastrosSupervisores,
  saveCadastroSupervisor,
  getCadastrosPromotores,
  saveCadastroPromotor,
  getCadastrosPendencias,
  resolveCadastroPendencia,
  reavaliarRupturasNaoIdentificadas,
  getMixOpportunityAnalyses,
  getStoreFullMix,
  getPromoterAssignments,
  assignPromoterToStore,
  confirmarVinculoObservado,
  getProductOperationalStats,
} from '@/services/cadastrosService'
import { executarHomologacaoCadastralBaseAtual } from '@/services/homologacaoCadastralService'
import type { HomologacaoCadastralResultado } from '@/types/cadastros'
import {
  MixBatchActionsBar,
  type MixBatchActionType,
} from '@/components/industrias/MixBatchActionsBar'
import {
  getIndustryStoreCoverages,
  saveStoreCoverage,
  deleteStoreCoverage,
} from '@/services/industryService'
import type { IndustryStoreCoverage } from '@/types/industryOperational'
import { navigateToStore } from '@/lib/format/storeIdentity'

// 4 Grandes Famílias Consolidadas
export type CadastrosFamilia = 'industrias' | 'redes_lojas' | 'equipe_campo' | 'pendencias'

export const CadastrosPage: React.FC = () => {
  const navigate = useNavigate()
  const { user, can } = useAuth()
  const { toast } = useToast()

  // Permissões de edição e visualização
  const canEdit = can('cadastros:editar') || can('rede:editar')

  // Família Ativa (1: Indústrias/Marcas, 2: Redes & Lojas, 3: Equipe de Campo, 4: Pendências)
  const [activeFamily, setActiveFamily] = React.useState<CadastrosFamilia>('industrias')

  // Subvisões por Família
  // 1. Indústrias / Marcas: [Indústrias] | [Todos os Produtos]
  const [industriaSubView, setIndustriaSubView] = React.useState<'industrias' | 'todos_produtos'>(
    'industrias',
  )
  // 2. Equipe de Campo: [Promotores] | [Supervisores]
  const [equipeSubView, setEquipeSubView] = React.useState<'promotores' | 'supervisores'>(
    'promotores',
  )

  // Navegação de Fichas Detalhadas dentro das Famílias
  const [selectedIndustryFicha, setSelectedIndustryFicha] =
    React.useState<CadastroIndustria | null>(null)
  const [industryFichaSection, setIndustryFichaSection] = React.useState<
    'resumo' | 'produtos_mix' | 'lojas_cobertura' | 'promotores' | 'integracoes'
  >('resumo')

  const [selectedRedeFicha, setSelectedRedeFicha] = React.useState<CadastroRede | null>(null)
  const [selectedLojaFicha, setSelectedLojaFicha] = React.useState<CadastroLoja | null>(null)
  const [selectedPromoterFicha, setSelectedPromoterFicha] = React.useState<CadastroPromotor | null>(
    null,
  )
  const [selectedSupervisorFicha, setSelectedSupervisorFicha] =
    React.useState<CadastroSupervisor | null>(null)
  const [selectedProductFicha, setSelectedProductFicha] = React.useState<CadastroProduto | null>(
    null,
  )
  const [productStats, setProductStats] = React.useState<{
    lojasComMixDefinido: Array<{ store_code: string; store_name: string }>
    lojasObservadas: Array<{ store_code: string; store_name: string; ultima_data: string }>
    ultimaObservacao?: string
    totalRupturasRelacionadas: number
    totalValidadesRelacionadas: number
  } | null>(null)
  const [loadingProductStats, setLoadingProductStats] = React.useState(false)

  // Estados de dados
  const [loading, setLoading] = React.useState(true)
  const [searchTerm, setSearchTerm] = React.useState('')
  const [filterStatus, setFilterStatus] = React.useState<string>('todos')
  const [filterIndustryInCatalog, setFilterIndustryInCatalog] = React.useState<string>('todas')
  const [sortOrderAZ, setSortOrderAZ] = React.useState<'asc' | 'desc'>('asc')

  const [industrias, setIndustrias] = React.useState<CadastroIndustria[]>([])
  const [produtos, setProdutos] = React.useState<CadastroProduto[]>([])
  const [redes, setRedes] = React.useState<CadastroRede[]>([])
  const [lojas, setLojas] = React.useState<CadastroLoja[]>([])
  const [supervisores, setSupervisores] = React.useState<CadastroSupervisor[]>([])
  const [promotores, setPromotores] = React.useState<CadastroPromotor[]>([])
  const [pendencias, setPendencias] = React.useState<CadastroPendencia[]>([])
  const [assignments, setAssignments] = React.useState<CadastroPromotorAssignment[]>([])

  // Modal de Detalhe / Edição / Criação Manual
  const [modalType, setModalType] = React.useState<string | null>(null)
  const [selectedItem, setSelectedItem] = React.useState<any>(null)
  const [isEditing, setIsEditing] = React.useState(false)
  const [formData, setFormData] = React.useState<Record<string, any>>({})

  // Modal Mover Loja de Rede
  const [movingLoja, setMovingLoja] = React.useState<CadastroLoja | null>(null)
  const [targetNovaRedeId, setTargetNovaRedeId] = React.useState<string>('')

  // Resolução de Pendência
  const [resolvingPendencia, setResolvingPendencia] = React.useState<CadastroPendencia | null>(null)
  const [targetEntityId, setTargetEntityId] = React.useState('')
  const [resolucaoObs, setResolucaoObs] = React.useState('')

  // Oportunidades e Visão em 3 Níveis de Mix da Loja
  const [selectedStoreForMix, setSelectedStoreForMix] = React.useState<CadastroLoja | null>(null)
  const [storeMixData, setStoreMixData] = React.useState<{
    oficialIndustria: CadastroProduto[]
    definidoLoja: any[]
    observadoOperacional: any[]
    foraDoMixDefinido: any[]
  } | null>(null)
  const [mixOpportunities, setMixOpportunities] = React.useState<MixOpportunityAnalysis[]>([])
  const [loadingMixOpp, setLoadingMixOpp] = React.useState(false)

  // Histórico Temporal e Vínculos de Promotores
  const [selectedPromoterHistory, setSelectedPromoterHistory] =
    React.useState<CadastroPromotor | null>(null)
  const [promoterAssignments, setPromoterAssignments] = React.useState<
    CadastroPromotorAssignment[]
  >([])
  const [loadingAssignments, setLoadingAssignments] = React.useState(false)
  const [newAssignmentStoreCode, setNewAssignmentStoreCode] = React.useState('')
  const [newAssignmentIndName, setNewAssignmentIndName] = React.useState('')

  // Cobertura de Lojas por Indústria
  const [industryCoverages, setIndustryCoverages] = React.useState<IndustryStoreCoverage[]>([])
  const [loadingCoverages, setLoadingCoverages] = React.useState(false)
  const [selectedLojaToAddCoverage, setSelectedLojaToAddCoverage] = React.useState('')
  const [addingCoverage, setAddingCoverage] = React.useState(false)

  // Reavaliação de rupturas
  const [reavaliandoRupturas, setReavaliandoRupturas] = React.useState(false)

  // Homologação Cadastral TradePro (Bloco A)
  const [homologandoCadastros, setHomologandoCadastros] = React.useState(false)
  const [resultadoHomologacao, setResultadoHomologacao] =
    React.useState<HomologacaoCadastralResultado | null>(null)

  // Executar Homologação Cadastral Bloco A
  const handleExecutarHomologacao = async () => {
    if (homologandoCadastros) return
    setHomologandoCadastros(true)
    try {
      const res = await executarHomologacaoCadastralBaseAtual(
        user?.name || user?.email || 'Operador',
      )
      setResultadoHomologacao(res)
      toast({
        title: 'Homologação Cadastral Concluída (Bloco A)',
        description: `${res.industrias.vinculadas} indústrias, ${res.redes.vinculadas} redes, ${res.lojas.vinculadas} lojas e ${res.promotores.vinculados} promotores vinculados com segurança.`,
      })
      await loadAll()
    } catch (err: any) {
      toast({
        title: 'Erro na homologação',
        description: err?.message || 'Falha ao processar homologação cadastral',
        variant: 'destructive',
      })
    } finally {
      setHomologandoCadastros(false)
    }
  }

  // Seleção múltipla para Ações em Lote no Mix (Item 5 da consolidação)
  const [selectedProductIds, setSelectedProductIds] = React.useState<string[]>([])
  const [isBatchProcessing, setIsBatchProcessing] = React.useState(false)

  // Carrega todos os cadastros
  const loadAll = React.useCallback(async () => {
    setLoading(true)
    try {
      const [indList, prodList, netList, storeList, supList, promList, pendList, assList] =
        await Promise.all([
          getCadastrosIndustrias(),
          getCadastrosProdutos(),
          getCadastrosRedes(),
          getCadastrosLojas(),
          getCadastrosSupervisores(),
          getCadastrosPromotores(),
          getCadastrosPendencias(),
          getPromoterAssignments(),
        ])
      setIndustrias(indList)
      setProdutos(prodList)
      setRedes(netList)
      setLojas(storeList)
      setSupervisores(supList)
      setPromotores(promList)
      setPendencias(pendList)
      setAssignments(assList)
    } catch (err: any) {
      toast({
        title: 'Erro ao carregar cadastros',
        description: err?.message || 'Falha na comunicação.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  React.useEffect(() => {
    loadAll()
  }, [loadAll])

  // Limpa busca e seleção ao trocar de família ou subvisão
  React.useEffect(() => {
    setSearchTerm('')
    setFilterStatus('todos')
    setSelectedProductIds([])
  }, [activeFamily, industriaSubView, equipeSubView])

  // Abre ficha do produto com estatísticas enriquecidas
  const handleOpenProductFicha = async (produto: CadastroProduto) => {
    setSelectedProductFicha(produto)
    setLoadingProductStats(true)
    try {
      const stats = await getProductOperationalStats(produto.nome_produto, produto.codigo_produto)
      setProductStats(stats)
    } catch {
      setProductStats(null)
    } finally {
      setLoadingProductStats(false)
    }
  }

  // Handlers de Seleção Múltipla de Produtos
  const handleToggleSelectProduct = (productId: string) => {
    setSelectedProductIds((prev) =>
      prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId],
    )
  }

  const handleSelectAllVisibleProducts = (visibleList: CadastroProduto[]) => {
    const visibleIds = visibleList.map((p) => p.id)
    const allSelected = visibleIds.every((id) => selectedProductIds.includes(id))

    if (allSelected) {
      // Desmarca todos os visíveis
      setSelectedProductIds((prev) => prev.filter((id) => !visibleIds.includes(id)))
    } else {
      // Adiciona todos os visíveis à seleção sem duplicar
      setSelectedProductIds((prev) => Array.from(new Set([...prev, ...visibleIds])))
    }
  }

  const handleClearProductSelection = () => {
    setSelectedProductIds([])
  }

  // Executa Ação em Lote no Mix
  const handleExecuteMixBatchAction = async (
    action: MixBatchActionType,
  ): Promise<MixBatchActionResult | void> => {
    if (!canEdit || selectedProductIds.length === 0) return
    setIsBatchProcessing(true)
    try {
      const res = await executeMixBatchAction(selectedProductIds, action, produtos, {
        executorNome: user?.name || 'Administrador',
      })
      toast({
        title: 'Ação em Lote Concluída',
        description: `${res.sucessos} de ${res.totalSolicitados} produto(s) atualizado(s) com sucesso.`,
      })
      setSelectedProductIds([])
      await loadAll()
      return res
    } catch (err: any) {
      toast({
        title: 'Erro ao executar ação em lote',
        description: err?.message || 'Falha na atualização em lote.',
        variant: 'destructive',
      })
    } finally {
      setIsBatchProcessing(false)
    }
  }

  // Alterna produto no mix oficial (Sem deletar produto! Preserva histórico total)
  const handleToggleMixOficial = async (produto: CadastroProduto) => {
    if (!canEdit) return
    // Diretriz SKIP (Item 32): se for oficial, ao remover vira fora_mix_oficial, nunca falso observado_operacional
    const novoTipoMix =
      produto.tipo_mix === 'oficial_industria' ? 'fora_mix_oficial' : 'oficial_industria'
    try {
      await saveCadastroProduto({
        ...produto,
        tipo_mix: novoTipoMix,
      })
      toast({
        title:
          novoTipoMix === 'oficial_industria'
            ? 'Adicionado ao Mix Oficial'
            : 'Removido do Mix Oficial',
        description: `Produto "${produto.nome_produto}" agora está como ${
          novoTipoMix === 'oficial_industria' ? 'Mix Oficial' : 'Fora do Mix Oficial'
        }. O histórico foi preservado.`,
      })
      loadAll()
      if (selectedProductFicha && selectedProductFicha.id === produto.id) {
        setSelectedProductFicha({
          ...selectedProductFicha,
          tipo_mix: novoTipoMix,
        })
      }
    } catch (err: any) {
      toast({
        title: 'Erro ao atualizar mix oficial',
        description: err.message,
        variant: 'destructive',
      })
    }
  }

  // Alterna status do produto (ativo / descontinuado)
  const handleToggleProductStatus = async (produto: CadastroProduto) => {
    if (!canEdit) return
    const novoStatus = produto.status === 'ativo' ? 'descontinuado' : 'ativo'
    try {
      await saveCadastroProduto({
        ...produto,
        status: novoStatus,
      })
      toast({
        title: novoStatus === 'ativo' ? 'Produto Ativado' : 'Produto Desativado',
        description: `Produto "${produto.nome_produto}" agora está ${novoStatus}.`,
      })
      loadAll()
      if (selectedProductFicha && selectedProductFicha.id === produto.id) {
        setSelectedProductFicha({
          ...selectedProductFicha,
          status: novoStatus,
        })
      }
    } catch (err: any) {
      toast({
        title: 'Erro ao alterar status',
        description: err.message,
        variant: 'destructive',
      })
    }
  }

  // Abre modal de criação
  const handleOpenCreate = (type: string, defaults?: Record<string, any>) => {
    setSelectedItem(null)
    setIsEditing(true)
    const indPadrao = industrias[0]
    setFormData(
      type === 'industrias'
        ? {
            nome: '',
            razao_social: '',
            cnpj: '',
            segmento: 'Alimentos / Consumo',
            status: 'ativa',
            tradepro_client_id: '',
            app_diretoria_industry_id: '',
            ...defaults,
          }
        : type === 'produtos'
          ? {
              nome_produto: '',
              industry_id: defaults?.industry_id || indPadrao?.id || '',
              industry_name: defaults?.industry_name || indPadrao?.nome || '',
              tipo_mix: defaults?.tipo_mix || 'oficial_industria',
              status: 'ativo',
              codigo_produto: '',
              cod_barras: '',
              familia: '',
              sabor: '',
              gramatura: '',
              embalagem: '',
              shelf_life_dias: 60,
              ...defaults,
            }
          : type === 'redes'
            ? { nome: '', codigo_externo: '', cnpj: '', ativo: true, ...defaults }
            : type === 'lojas'
              ? {
                  codigo_externo: '',
                  razao_social: '',
                  network_id: defaults?.network_id || null,
                  rede_nome: defaults?.rede_nome || '',
                  cidade: '',
                  estado: 'SC',
                  ativo: true,
                  ...defaults,
                }
              : type === 'supervisores'
                ? {
                    nome: '',
                    codigo_externo: '',
                    telefone: '',
                    email: '',
                    status: 'ativo',
                    ...defaults,
                  }
                : {
                    nome: '',
                    codigo_externo: '',
                    supervisor_id: defaults?.supervisor_id || '',
                    supervisor_nome: defaults?.supervisor_nome || '',
                    status: 'ativo',
                    ...defaults,
                  },
    )
    setModalType(type)
  }

  // Abre modal de edição
  const handleOpenEdit = (type: string, item: any) => {
    setSelectedItem(item)
    setIsEditing(true)
    setFormData({ ...item })
    setModalType(type)
  }

  // Submissão do formulário CRUD
  const handleSaveForm = async () => {
    try {
      if (modalType === 'industrias') {
        if (!formData.nome?.trim()) throw new Error('Nome da Indústria é obrigatório.')
        const rec = await saveCadastroIndustria({ ...selectedItem, ...formData })
        toast({ title: 'Indústria salva com sucesso' })
        if (selectedIndustryFicha && selectedIndustryFicha.id === rec.id) {
          setSelectedIndustryFicha(rec)
        }
      } else if (modalType === 'produtos') {
        if (!formData.nome_produto?.trim()) throw new Error('Nome do Produto é obrigatório.')
        const ind = industrias.find((i) => i.id === formData.industry_id)
        const rec = await saveCadastroProduto({
          ...selectedItem,
          ...formData,
          industry_name: ind ? ind.nome : formData.industry_name,
        })
        toast({ title: 'Produto salvo com sucesso' })
        if (selectedProductFicha && selectedProductFicha.id === rec.id) {
          setSelectedProductFicha(rec)
        }
      } else if (modalType === 'redes') {
        if (!formData.nome?.trim()) throw new Error('Nome da Rede é obrigatório.')
        const rec = await saveCadastroRede({ ...selectedItem, ...formData })
        toast({ title: 'Rede salva com sucesso' })
        if (selectedRedeFicha && selectedRedeFicha.id === rec.id) {
          setSelectedRedeFicha(rec)
        }
      } else if (modalType === 'lojas') {
        if (!formData.codigo_externo?.trim()) throw new Error('Código da Loja é obrigatório.')
        const rec = await saveCadastroLoja({ ...selectedItem, ...formData })
        toast({ title: 'Loja salva com sucesso' })
        if (selectedLojaFicha && selectedLojaFicha.id === rec.id) {
          setSelectedLojaFicha(rec)
        }
      } else if (modalType === 'supervisores') {
        if (!formData.nome?.trim()) throw new Error('Nome do Supervisor é obrigatório.')
        const rec = await saveCadastroSupervisor({ ...selectedItem, ...formData })
        toast({ title: 'Supervisor salvo com sucesso' })
        if (selectedSupervisorFicha && selectedSupervisorFicha.id === rec.id) {
          setSelectedSupervisorFicha(rec)
        }
      } else if (modalType === 'promotores') {
        if (!formData.nome?.trim()) throw new Error('Nome do Promotor é obrigatório.')
        const sup = supervisores.find((s) => s.id === formData.supervisor_id)
        const rec = await saveCadastroPromotor({
          ...selectedItem,
          ...formData,
          supervisor_nome: sup ? sup.nome : formData.supervisor_nome,
        })
        toast({ title: 'Promotor salvo com sucesso' })
        if (selectedPromoterFicha && selectedPromoterFicha.id === rec.id) {
          setSelectedPromoterFicha(rec)
        }
      }

      setModalType(null)
      loadAll()
    } catch (err: any) {
      toast({
        title: 'Erro ao salvar',
        description: err.message,
        variant: 'destructive',
      })
    }
  }

  // Executa Mover Loja de Rede
  const handleConfirmMoverLojaDeRede = async () => {
    if (!movingLoja) return
    try {
      const novaRede = redes.find((r) => r.id === targetNovaRedeId)
      const novaRedeNome = novaRede ? novaRede.nome : ''
      const updated = await moverLojaDeRede(movingLoja.id, targetNovaRedeId || null, novaRedeNome, {
        executorNome: user?.name || 'Administrador',
      })
      toast({
        title: 'Loja transferida de Rede com sucesso',
        description: `Loja ${updated.codigo_externo} transferida para "${novaRedeNome || 'Sem Rede'}". Alteração auditada.`,
      })
      setMovingLoja(null)
      setTargetNovaRedeId('')
      loadAll()
      if (selectedLojaFicha && selectedLojaFicha.id === updated.id) {
        setSelectedLojaFicha(updated)
      }
    } catch (err: any) {
      toast({
        title: 'Erro ao transferir loja',
        description: err.message,
        variant: 'destructive',
      })
    }
  }

  // Executa Reavaliação de Rupturas
  const handleReavaliarRupturas = async () => {
    setReavaliandoRupturas(true)
    try {
      const res = await reavaliarRupturasNaoIdentificadas(user?.name || 'Operador')
      toast({
        title: 'Reavaliação de Rupturas Concluída',
        description: `Analisados: ${res.analisados} | Identificados automaticamente: ${res.identificados} | Precisam de revisão: ${res.precisamRevisao} | Sem identificação: ${res.semIdentificacao}`,
      })
      loadAll()
    } catch (err: any) {
      toast({
        title: 'Falha na reavaliação',
        description: err?.message,
        variant: 'destructive',
      })
    } finally {
      setReavaliandoRupturas(false)
    }
  }

  // Abre análise de Mix da Loja em 3 Níveis
  const handleOpenStoreMix = async (loja: CadastroLoja) => {
    setSelectedStoreForMix(loja)
    setLoadingMixOpp(true)
    try {
      const [opps, fullMix] = await Promise.all([
        getMixOpportunityAnalyses(loja.codigo_externo || loja.codigo_loja || ''),
        getStoreFullMix(loja.codigo_externo || loja.codigo_loja || ''),
      ])
      setMixOpportunities(opps)
      setStoreMixData(fullMix)
    } catch {
      setMixOpportunities([])
      setStoreMixData(null)
    } finally {
      setLoadingMixOpp(false)
    }
  }

  // Abre histórico temporal de Promotor
  const handleOpenPromoterHistory = async (prom: CadastroPromotor) => {
    setSelectedPromoterHistory(prom)
    setLoadingAssignments(true)
    try {
      const list = await getPromoterAssignments(prom.id)
      setPromoterAssignments(list)
    } catch {
      setPromoterAssignments([])
    } finally {
      setLoadingAssignments(false)
    }
  }

  // Aloca Promotor a uma Loja
  const handleAssignPromoter = async () => {
    if (!selectedPromoterHistory || !newAssignmentStoreCode) return
    const store = lojas.find((l) => l.codigo_externo === newAssignmentStoreCode)
    try {
      await assignPromoterToStore({
        promoter_id: selectedPromoterHistory.id,
        promoter_nome: selectedPromoterHistory.nome,
        store_id: store?.id,
        store_code: newAssignmentStoreCode,
        store_name: store?.razao_social || store?.nome || `Loja ${newAssignmentStoreCode}`,
        industry_name: newAssignmentIndName || 'Geral',
        status: 'ativo',
        tipo_vinculo: 'confirmado',
        origem_vinculo: 'Atribuição Manual pelo Administrador',
      })
      toast({ title: 'Promotor alocado com sucesso!' })
      const list = await getPromoterAssignments(selectedPromoterHistory.id)
      setPromoterAssignments(list)
      setNewAssignmentStoreCode('')
      setNewAssignmentIndName('')
      loadAll()
    } catch (err: any) {
      toast({ title: 'Erro ao alocar promotor', description: err.message, variant: 'destructive' })
    }
  }

  // Confirma Vínculo Observado
  const handleConfirmObserved = async (assignmentId: string) => {
    try {
      await confirmarVinculoObservado(assignmentId)
      toast({ title: 'Relação confirmada como cobertura oficial!' })
      if (selectedPromoterHistory) {
        const list = await getPromoterAssignments(selectedPromoterHistory.id)
        setPromoterAssignments(list)
      }
      loadAll()
    } catch (err: any) {
      toast({
        title: 'Erro ao confirmar vínculo',
        description: err.message,
        variant: 'destructive',
      })
    }
  }

  // Resolve Pendência
  const handleResolvePendenciaSubmit = async () => {
    if (!resolvingPendencia || !targetEntityId) return
    try {
      let resolvedName = ''
      if (resolvingPendencia.tipo_entidade === 'industria') {
        const ind = industrias.find((i) => i.id === targetEntityId)
        resolvedName = ind?.nome || targetEntityId
        if (ind && resolvingPendencia.codigo_externo) {
          await saveCadastroIndustria({
            id: ind.id,
            tradepro_client_id: resolvingPendencia.codigo_externo,
            tradepro_client_name: ind.tradepro_client_name || resolvingPendencia.nome_identificado,
          })
        }
      } else if (resolvingPendencia.tipo_entidade === 'rede') {
        const r = redes.find((n) => n.id === targetEntityId)
        resolvedName = r?.nome || targetEntityId
      } else if (resolvingPendencia.tipo_entidade === 'loja') {
        const l = lojas.find((s) => s.id === targetEntityId)
        resolvedName = l?.razao_social || l?.nome || targetEntityId
      } else if (resolvingPendencia.tipo_entidade === 'promotor') {
        const p = promotores.find((item) => item.id === targetEntityId)
        resolvedName = p?.nome || targetEntityId
      } else if (resolvingPendencia.tipo_entidade === 'supervisor') {
        const s = supervisores.find((item) => item.id === targetEntityId)
        resolvedName = s?.nome || targetEntityId
      }

      await resolveCadastroPendencia(resolvingPendencia.id, {
        entidade_resolvida_id: targetEntityId,
        entidade_resolvida_nome: resolvedName,
        observacao: resolucaoObs,
        userName: user?.name || 'Operador',
      })

      toast({
        title: 'Pendência Resolvida',
        description: `Entidade vinculada com sucesso a "${resolvedName}".`,
      })
      setResolvingPendencia(null)
      setTargetEntityId('')
      setResolucaoObs('')
      loadAll()
    } catch (err: any) {
      toast({
        title: 'Erro ao resolver pendência',
        description: err?.message,
        variant: 'destructive',
      })
    }
  }

  // Filtros de Indústrias
  const filteredIndustrias = React.useMemo(() => {
    return industrias.filter((i) => {
      const matchSearch =
        i.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (i.tradepro_client_id && i.tradepro_client_id.includes(searchTerm)) ||
        (i.segmento && i.segmento.toLowerCase().includes(searchTerm.toLowerCase()))
      const matchStatus = filterStatus === 'todos' || i.status === filterStatus
      return matchSearch && matchStatus
    })
  }, [industrias, searchTerm, filterStatus])

  // Filtros do Catálogo Completo de Produtos (A–Z / Z–A, Filtro por Indústria, Filtro por Status)
  const filteredTodosProdutos = React.useMemo(() => {
    const list = produtos.filter((p) => {
      const matchSearch =
        p.nome_produto.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.industry_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.codigo_produto && p.codigo_produto.includes(searchTerm)) ||
        (p.cod_barras && p.cod_barras.includes(searchTerm)) ||
        (p.aliases && p.aliases.some((a) => a.toLowerCase().includes(searchTerm.toLowerCase())))

      const matchIndustry =
        filterIndustryInCatalog === 'todas' || p.industry_id === filterIndustryInCatalog

      const matchStatus =
        filterStatus === 'todos' || p.status === filterStatus || p.tipo_mix === filterStatus

      return matchSearch && matchIndustry && matchStatus
    })

    list.sort((a, b) => {
      const comp = a.nome_produto.localeCompare(b.nome_produto, 'pt-BR')
      return sortOrderAZ === 'asc' ? comp : -comp
    })

    return list
  }, [produtos, searchTerm, filterIndustryInCatalog, filterStatus, sortOrderAZ])

  // Filtros de Redes
  const filteredRedes = React.useMemo(() => {
    return redes.filter((r) => {
      const matchSearch = r.nome.toLowerCase().includes(searchTerm.toLowerCase())
      const matchStatus =
        filterStatus === 'todos' || (filterStatus === 'ativo' ? r.ativo : !r.ativo)
      return matchSearch && matchStatus
    })
  }, [redes, searchTerm, filterStatus])

  // Lojas da Rede Selecionada (se estiver na ficha da Rede)
  const lojasDaRedeSelecionada = React.useMemo(() => {
    if (!selectedRedeFicha) return []
    return lojas.filter((l) => l.network_id === selectedRedeFicha.id)
  }, [lojas, selectedRedeFicha])

  // Filtro de Lojas
  const filteredLojas = React.useMemo(() => {
    const baseList = selectedRedeFicha ? lojasDaRedeSelecionada : lojas
    const list = baseList.filter((l) => {
      const matchSearch =
        l.razao_social.toLowerCase().includes(searchTerm.toLowerCase()) ||
        l.codigo_externo.includes(searchTerm) ||
        (l.rede_nome && l.rede_nome.toLowerCase().includes(searchTerm.toLowerCase())) ||
        l.cidade.toLowerCase().includes(searchTerm.toLowerCase()) ||
        l.estado.toLowerCase().includes(searchTerm.toLowerCase())
      const matchStatus =
        filterStatus === 'todos' || (filterStatus === 'ativo' ? l.ativo : !l.ativo)
      return matchSearch && matchStatus
    })
    list.sort((a, b) =>
      a.codigo_externo.localeCompare(b.codigo_externo, undefined, { numeric: true }),
    )
    return list
  }, [selectedRedeFicha, lojasDaRedeSelecionada, lojas, searchTerm, filterStatus])

  // Filtros de Supervisores
  const filteredSupervisores = React.useMemo(() => {
    return supervisores.filter((s) => {
      const matchSearch =
        s.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.codigo_externo && s.codigo_externo.includes(searchTerm))
      const matchStatus = filterStatus === 'todos' || s.status === filterStatus
      return matchSearch && matchStatus
    })
  }, [supervisores, searchTerm, filterStatus])

  // Filtros de Promotores
  const filteredPromotores = React.useMemo(() => {
    return promotores.filter((p) => {
      const matchSearch =
        p.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.codigo_externo && p.codigo_externo.includes(searchTerm)) ||
        (p.supervisor_nome && p.supervisor_nome.toLowerCase().includes(searchTerm.toLowerCase()))
      const matchStatus = filterStatus === 'todos' || p.status === filterStatus
      return matchSearch && matchStatus
    })
  }, [promotores, searchTerm, filterStatus])

  // Filtros de Pendências
  const filteredPendencias = React.useMemo(() => {
    return pendencias.filter((p) => {
      const matchSearch =
        p.valor_identificador.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.nome_identificado &&
          p.nome_identificado.toLowerCase().includes(searchTerm.toLowerCase())) ||
        p.tipo_entidade.toLowerCase().includes(searchTerm.toLowerCase())
      const matchStatus = filterStatus === 'todos' || p.tipo_entidade === filterStatus
      return matchSearch && matchStatus
    })
  }, [pendencias, searchTerm, filterStatus])

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Cabeçalho Consolidado */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Central de Cadastros Mestres
            </h1>
            <Badge
              variant="secondary"
              className="font-semibold text-xs bg-indigo-50 text-indigo-700 border border-indigo-200"
            >
              Área Administrativa Consolidada
            </Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            "A API alimenta e sugere. O Cadastro Mestre organiza e confirma. O operador tem
            governança absoluta."
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExecutarHomologacao}
            disabled={homologandoCadastros}
            className="text-xs gap-1.5 h-9 border-indigo-200 bg-indigo-50/50 hover:bg-indigo-100 text-indigo-700"
            title="Reconcilia os Cadastros Mestres com base nas evidências reais existentes da TradePro (Bloco A)"
          >
            <CheckCircle2 className="w-4 h-4 text-indigo-600" />
            <span>
              {homologandoCadastros ? 'Homologando Cadastros...' : 'Homologar Cadastros (TradePro)'}
            </span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleReavaliarRupturas}
            disabled={reavaliandoRupturas}
            className="text-xs gap-1.5 h-9"
          >
            <Sparkles className="w-4 h-4 text-amber-600" />
            <span>
              {reavaliandoRupturas ? 'Reavaliando...' : 'Reavaliar Rupturas Não Identificadas'}
            </span>
          </Button>

          {pendencias.length > 0 && (
            <Button
              variant="default"
              size="sm"
              onClick={() => {
                setActiveFamily('pendencias')
                setSelectedIndustryFicha(null)
                setSelectedRedeFicha(null)
                setSelectedLojaFicha(null)
                setSelectedPromoterFicha(null)
                setSelectedSupervisorFicha(null)
              }}
              className="text-xs gap-1.5 h-9 bg-amber-600 hover:bg-amber-700 text-white"
            >
              <AlertCircle className="w-4 h-4" />
              <span>Pendências ({pendencias.length})</span>
            </Button>
          )}
        </div>
      </div>

      {/* Painel do Resultado da Homologação Cadastral (Bloco A) */}
      {resultadoHomologacao && (
        <div className="p-4 bg-indigo-50/70 border border-indigo-200 rounded-2xl space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-indigo-600" />
              <h3 className="text-sm font-bold text-indigo-900">
                Resultado da Homologação Cadastral Real (Bloco A)
              </h3>
              <Badge
                variant="outline"
                className="text-[10px] bg-white border-indigo-200 text-indigo-700"
              >
                {new Date(resultadoHomologacao.dataExecucao).toLocaleTimeString()}
              </Badge>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setResultadoHomologacao(null)}
              className="text-xs h-7 text-indigo-700 hover:bg-indigo-100"
            >
              Fechar Painel
            </Button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
            <div className="bg-white p-2.5 rounded-xl border border-indigo-100 shadow-2xs">
              <span className="text-[10px] font-semibold text-slate-500 uppercase block">
                Indústrias
              </span>
              <p className="text-base font-bold text-slate-900">
                {resultadoHomologacao.industrias.vinculadas}{' '}
                <span className="text-[10px] font-normal text-slate-400">
                  / {resultadoHomologacao.industrias.descobertas} desc.
                </span>
              </p>
              <span className="text-[10px] text-amber-600">
                {resultadoHomologacao.industrias.pendentes} pendentes
              </span>
            </div>

            <div className="bg-white p-2.5 rounded-xl border border-indigo-100 shadow-2xs">
              <span className="text-[10px] font-semibold text-slate-500 uppercase block">
                Redes
              </span>
              <p className="text-base font-bold text-slate-900">
                {resultadoHomologacao.redes.vinculadas}{' '}
                <span className="text-[10px] font-normal text-slate-400">
                  / {resultadoHomologacao.redes.descobertas} desc.
                </span>
              </p>
              <span className="text-[10px] text-amber-600">
                {resultadoHomologacao.redes.pendentes} pendentes
              </span>
            </div>

            <div className="bg-white p-2.5 rounded-xl border border-indigo-100 shadow-2xs">
              <span className="text-[10px] font-semibold text-slate-500 uppercase block">
                Lojas
              </span>
              <p className="text-base font-bold text-slate-900">
                {resultadoHomologacao.lojas.vinculadas}{' '}
                <span className="text-[10px] font-normal text-slate-400">
                  / {resultadoHomologacao.lojas.descobertas} desc.
                </span>
              </p>
              <span className="text-[10px] text-amber-600">
                {resultadoHomologacao.lojas.pendentes} pendentes
              </span>
            </div>

            <div className="bg-white p-2.5 rounded-xl border border-indigo-100 shadow-2xs">
              <span className="text-[10px] font-semibold text-slate-500 uppercase block">
                Produtos
              </span>
              <p className="text-base font-bold text-slate-900">
                {resultadoHomologacao.produtos.resolvidos}{' '}
                <span className="text-[10px] font-normal text-slate-400">
                  / {resultadoHomologacao.produtos.descobertos} desc.
                </span>
              </p>
              <span className="text-[10px] text-amber-600">
                {resultadoHomologacao.produtos.pendentes + resultadoHomologacao.produtos.ambiguos}{' '}
                pend./amb.
              </span>
            </div>

            <div className="bg-white p-2.5 rounded-xl border border-indigo-100 shadow-2xs">
              <span className="text-[10px] font-semibold text-slate-500 uppercase block">
                Promotores
              </span>
              <p className="text-base font-bold text-slate-900">
                {resultadoHomologacao.promotores.vinculados}{' '}
                <span className="text-[10px] font-normal text-slate-400">
                  / {resultadoHomologacao.promotores.descobertos} desc.
                </span>
              </p>
              <span className="text-[10px] text-amber-600">
                {resultadoHomologacao.promotores.pendentes} pendentes
              </span>
            </div>

            <div className="bg-white p-2.5 rounded-xl border border-indigo-100 shadow-2xs">
              <span className="text-[10px] font-semibold text-slate-500 uppercase block">
                Supervisores
              </span>
              <p className="text-base font-bold text-slate-900">
                {resultadoHomologacao.supervisores.vinculados}{' '}
                <span className="text-[10px] font-normal text-slate-400">
                  / {resultadoHomologacao.supervisores.descobertos} desc.
                </span>
              </p>
              <span className="text-[10px] text-amber-600">
                {resultadoHomologacao.supervisores.pendentes} pendentes
              </span>
            </div>
          </div>

          {/* Universo Processado e Relações Detectadas vs Persistidas */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] text-indigo-900 bg-white/70 p-2.5 rounded-xl border border-indigo-100">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-semibold text-indigo-950">Universo Processado:</span>
              <span>
                Validades lidas:{' '}
                <strong>{resultadoHomologacao.universoProcessado?.validadesLidas ?? 0}</strong> (
                {resultadoHomologacao.universoProcessado?.totalPaginasPorFonte?.validades ?? 0}{' '}
                págs)
              </span>
              <span>•</span>
              <span>
                Rupturas lidas:{' '}
                <strong>{resultadoHomologacao.universoProcessado?.rupturasLidas ?? 0}</strong> (
                {resultadoHomologacao.universoProcessado?.totalPaginasPorFonte?.rupturas ?? 0} págs)
              </span>
              <span>•</span>
              <span>
                Visitas lidas:{' '}
                <strong>{resultadoHomologacao.universoProcessado?.visitasLidas ?? 0}</strong> (
                {resultadoHomologacao.universoProcessado?.totalPaginasPorFonte?.visitas ?? 0} págs)
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 md:justify-end">
              <span className="font-semibold text-indigo-950">Vínculos Observados:</span>
              <span>
                Detectadas:{' '}
                <strong>
                  {resultadoHomologacao.relacoes?.detectadas ??
                    resultadoHomologacao.vinculosObservados.promotorLoja +
                      resultadoHomologacao.vinculosObservados.promotorIndustria +
                      resultadoHomologacao.vinculosObservados.supervisorPromotor}
                </strong>
              </span>
              <span>•</span>
              <span className="text-emerald-700">
                Novas persistidas:{' '}
                <strong>{resultadoHomologacao.relacoes?.novasPersistidas ?? 0}</strong>
              </span>
              <span>•</span>
              <span className="text-blue-700">
                Já existentes: <strong>{resultadoHomologacao.relacoes?.jaExistentes ?? 0}</strong>
              </span>
              <span>•</span>
              <span className="text-amber-700">
                Pendentes: <strong>{resultadoHomologacao.relacoes?.pendentes ?? 0}</strong>
              </span>
            </div>
          </div>

          <div className="text-[11px] text-indigo-800 flex flex-wrap items-center gap-3 bg-white/60 p-2 rounded-lg border border-indigo-100">
            <span>
              <strong>Relações Detalhadas:</strong>
            </span>
            <span>
              Promotor ↔ Loja:{' '}
              <strong>{resultadoHomologacao.vinculosObservados.promotorLoja}</strong>
            </span>
            <span>
              Promotor ↔ Indústria:{' '}
              <strong>{resultadoHomologacao.vinculosObservados.promotorIndustria}</strong>
            </span>
            <span>
              Supervisor ↔ Promotor:{' '}
              <strong>{resultadoHomologacao.vinculosObservados.supervisorPromotor}</strong>
            </span>
            <span className="text-slate-400">
              | Vínculos observados não alteram roteiro confirmado administrativamente
            </span>
          </div>
        </div>
      )}

      {/* CONSOLIDAÇÃO NAS 4 FAMÍLIAS PRINCIPAIS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 bg-slate-100 p-1.5 rounded-2xl">
        <button
          type="button"
          onClick={() => {
            setActiveFamily('industrias')
            setSelectedRedeFicha(null)
            setSelectedLojaFicha(null)
            setSelectedPromoterFicha(null)
            setSelectedSupervisorFicha(null)
          }}
          className={`flex items-center justify-center gap-2 py-3 px-3 rounded-xl text-xs font-bold transition-all ${
            activeFamily === 'industrias'
              ? 'bg-white text-indigo-700 shadow-sm border border-slate-200/80'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
          }`}
        >
          <Factory className="w-4 h-4 text-indigo-600 shrink-0" />
          <div className="text-left">
            <span className="block leading-tight">Indústrias / Marcas</span>
            <span className="text-[10px] font-normal text-slate-400">
              {industrias.length} ind. • {produtos.length} produtos
            </span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveFamily('redes_lojas')
            setSelectedIndustryFicha(null)
            setSelectedPromoterFicha(null)
            setSelectedSupervisorFicha(null)
          }}
          className={`flex items-center justify-center gap-2 py-3 px-3 rounded-xl text-xs font-bold transition-all ${
            activeFamily === 'redes_lojas'
              ? 'bg-white text-blue-700 shadow-sm border border-slate-200/80'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
          }`}
        >
          <Layers className="w-4 h-4 text-blue-600 shrink-0" />
          <div className="text-left">
            <span className="block leading-tight">Redes &amp; Lojas</span>
            <span className="text-[10px] font-normal text-slate-400">
              {redes.length} redes • {lojas.length} lojas
            </span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveFamily('equipe_campo')
            setSelectedIndustryFicha(null)
            setSelectedRedeFicha(null)
            setSelectedLojaFicha(null)
          }}
          className={`flex items-center justify-center gap-2 py-3 px-3 rounded-xl text-xs font-bold transition-all ${
            activeFamily === 'equipe_campo'
              ? 'bg-white text-violet-700 shadow-sm border border-slate-200/80'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
          }`}
        >
          <Users className="w-4 h-4 text-violet-600 shrink-0" />
          <div className="text-left">
            <span className="block leading-tight">Equipe de Campo</span>
            <span className="text-[10px] font-normal text-slate-400">
              {promotores.length} prom. • {supervisores.length} sup.
            </span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveFamily('pendencias')
            setSelectedIndustryFicha(null)
            setSelectedRedeFicha(null)
            setSelectedLojaFicha(null)
            setSelectedPromoterFicha(null)
            setSelectedSupervisorFicha(null)
          }}
          className={`flex items-center justify-center gap-2 py-3 px-3 rounded-xl text-xs font-bold transition-all ${
            activeFamily === 'pendencias'
              ? 'bg-white text-amber-700 shadow-sm border border-slate-200/80'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
          }`}
        >
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
          <div className="text-left">
            <span className="block leading-tight">Pendências</span>
            <span className="text-[10px] font-normal text-slate-400">
              {pendencias.length} aguardando vínculo
            </span>
          </div>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* 1. FAMÍLIA: INDÚSTRIAS / MARCAS */}
      {/* ========================================================================= */}
      {activeFamily === 'industrias' && (
        <div className="space-y-5">
          {/* Alternância: [Indústrias] | [Todos os Produtos] */}
          {!selectedIndustryFicha && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-lg shrink-0">
                <Button
                  size="sm"
                  variant={industriaSubView === 'industrias' ? 'default' : 'ghost'}
                  onClick={() => setIndustriaSubView('industrias')}
                  className={`text-xs h-8 ${
                    industriaSubView === 'industrias'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600'
                  }`}
                >
                  <Factory className="w-3.5 h-3.5 mr-1.5" />
                  Indústrias ({industrias.length})
                </Button>
                <Button
                  size="sm"
                  variant={industriaSubView === 'todos_produtos' ? 'default' : 'ghost'}
                  onClick={() => setIndustriaSubView('todos_produtos')}
                  className={`text-xs h-8 ${
                    industriaSubView === 'todos_produtos'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600'
                  }`}
                >
                  <Package className="w-3.5 h-3.5 mr-1.5" />
                  Todos os Produtos ({produtos.length})
                </Button>
              </div>

              {/* Filtros da Família de Indústrias */}
              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-64">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    type="text"
                    placeholder={
                      industriaSubView === 'industrias'
                        ? 'Buscar indústrias, cód. cliente...'
                        : 'Buscar produtos, EAN, marcas...'
                    }
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 text-xs h-8"
                  />
                </div>

                {industriaSubView === 'todos_produtos' && (
                  <>
                    <Select
                      value={filterIndustryInCatalog}
                      onValueChange={setFilterIndustryInCatalog}
                    >
                      <SelectTrigger className="w-40 text-xs h-8">
                        <SelectValue placeholder="Indústria" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todas">Todas as Indústrias</SelectItem>
                        {industrias.map((ind) => (
                          <SelectItem key={ind.id} value={ind.id}>
                            {ind.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSortOrderAZ((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
                      className="text-xs h-8 px-2 gap-1"
                      title="Alternar ordenação A–Z / Z–A"
                    >
                      <ArrowUpDown className="w-3.5 h-3.5" />
                      <span>{sortOrderAZ === 'asc' ? 'A–Z' : 'Z–A'}</span>
                    </Button>
                  </>
                )}

                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-36 text-xs h-8">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos Status</SelectItem>
                    <SelectItem value="ativo">Ativo / Confirmado</SelectItem>
                    <SelectItem value="inativo">Inativo / Descontinuado</SelectItem>
                    {industriaSubView === 'todos_produtos' && (
                      <SelectItem value="oficial_industria">Mix Oficial</SelectItem>
                    )}
                    {industriaSubView === 'todos_produtos' && (
                      <SelectItem value="observado_operacional">Mix Observado</SelectItem>
                    )}
                  </SelectContent>
                </Select>

                {canEdit && (
                  <Button
                    size="sm"
                    className="text-xs h-8 gap-1.5 shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white"
                    onClick={() =>
                      handleOpenCreate(
                        industriaSubView === 'industrias' ? 'industrias' : 'produtos',
                      )
                    }
                  >
                    <Plus className="w-4 h-4" />
                    <span>Novo {industriaSubView === 'industrias' ? 'Indústria' : 'Produto'}</span>
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* FICHA DA INDÚSTRIA (quando clicada) */}
          {selectedIndustryFicha ? (
            <div className="space-y-4">
              {/* Topo da Ficha com Botão Voltar */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                  <div className="flex items-center gap-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedIndustryFicha(null)}
                      className="text-xs h-8 px-2 gap-1 text-slate-600 hover:text-slate-900"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      <span>Voltar às Indústrias</span>
                    </Button>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-xl font-bold text-slate-900">
                          {selectedIndustryFicha.nome}
                        </h2>
                        <Badge
                          variant={
                            selectedIndustryFicha.status === 'ativa' ? 'default' : 'secondary'
                          }
                          className="text-[10px] capitalize"
                        >
                          {selectedIndustryFicha.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-500">
                        {selectedIndustryFicha.razao_social || 'Razão Social não informada'} •{' '}
                        {selectedIndustryFicha.segmento || 'Alimentos / Consumo'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {canEdit && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleOpenEdit('industrias', selectedIndustryFicha)}
                        className="text-xs h-8 gap-1.5"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        <span>Editar Indústria</span>
                      </Button>
                    )}
                    <a
                      href={`/industrias/${selectedIndustryFicha.id}`}
                      className="text-xs inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium transition-colors"
                    >
                      Cockpit Operacional <ArrowRight className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>

                {/* Sub-navegação interna da Ficha */}
                <div className="flex flex-wrap gap-1.5 border-b border-slate-100 pb-2">
                  <Button
                    size="sm"
                    variant={industryFichaSection === 'resumo' ? 'default' : 'ghost'}
                    onClick={() => setIndustryFichaSection('resumo')}
                    className="text-xs h-7"
                  >
                    Resumo
                  </Button>
                  <Button
                    size="sm"
                    variant={industryFichaSection === 'produtos_mix' ? 'default' : 'ghost'}
                    onClick={() => setIndustryFichaSection('produtos_mix')}
                    className="text-xs h-7"
                  >
                    Produtos &amp; Mix (
                    {produtos.filter((p) => p.industry_id === selectedIndustryFicha.id).length})
                  </Button>
                  <Button
                    size="sm"
                    variant={industryFichaSection === 'lojas_cobertura' ? 'default' : 'ghost'}
                    onClick={async () => {
                      setIndustryFichaSection('lojas_cobertura')
                      if (selectedIndustryFicha) {
                        setLoadingCoverages(true)
                        try {
                          const data = await getIndustryStoreCoverages(selectedIndustryFicha.id)
                          setIndustryCoverages(data)
                        } finally {
                          setLoadingCoverages(false)
                        }
                      }
                    }}
                    className="text-xs h-7"
                  >
                    Lojas / Cobertura
                  </Button>
                  <Button
                    size="sm"
                    variant={industryFichaSection === 'promotores' ? 'default' : 'ghost'}
                    onClick={() => setIndustryFichaSection('promotores')}
                    className="text-xs h-7"
                  >
                    Promotores
                  </Button>
                  <Button
                    size="sm"
                    variant={industryFichaSection === 'integracoes' ? 'default' : 'ghost'}
                    onClick={() => setIndustryFichaSection('integracoes')}
                    className="text-xs h-7"
                  >
                    Integrações &amp; Vínculos
                  </Button>
                </div>

                {/* Seção 1: Resumo */}
                {industryFichaSection === 'resumo' && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                    <div className="p-4 bg-slate-50 rounded-xl space-y-2 text-xs">
                      <span className="font-semibold text-slate-700 block">
                        Identificação Cadastral
                      </span>
                      <div>
                        <span className="text-slate-400 block text-[11px]">Nome Oficial:</span>
                        <span className="font-medium text-slate-900">
                          {selectedIndustryFicha.nome}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[11px]">CNPJ:</span>
                        <span className="font-mono text-slate-800">
                          {selectedIndustryFicha.cnpj || '—'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[11px]">Segmento:</span>
                        <span className="text-slate-800">
                          {selectedIndustryFicha.segmento || 'Geral'}
                        </span>
                      </div>
                    </div>

                    <div className="p-4 bg-slate-50 rounded-xl space-y-2 text-xs">
                      <span className="font-semibold text-slate-700 block">
                        Contato &amp; Atendimento
                      </span>
                      <div>
                        <span className="text-slate-400 block text-[11px]">Responsável:</span>
                        <span className="font-medium text-slate-900">
                          {selectedIndustryFicha.contato_nome || '—'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[11px]">E-mail:</span>
                        <span className="text-slate-800">
                          {selectedIndustryFicha.contato_email || '—'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[11px]">Telefone:</span>
                        <span className="text-slate-800">
                          {selectedIndustryFicha.contato_telefone || '—'}
                        </span>
                      </div>
                    </div>

                    <div className="p-4 bg-slate-50 rounded-xl space-y-2 text-xs">
                      <span className="font-semibold text-slate-700 block">
                        Vínculos de Sistema
                      </span>
                      <div>
                        <span className="text-slate-400 block text-[11px]">
                          Cód. Cliente TradePro:
                        </span>
                        {selectedIndustryFicha.tradepro_client_id ? (
                          <Badge
                            variant="outline"
                            className="font-mono text-xs bg-white text-indigo-700 border-indigo-200"
                          >
                            Cód. {selectedIndustryFicha.tradepro_client_id}
                          </Badge>
                        ) : (
                          <span className="text-amber-600 italic">Pendente de vínculo</span>
                        )}
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[11px]">
                          ID App Diretoria (Futuro):
                        </span>
                        <span className="font-mono text-slate-800">
                          {selectedIndustryFicha.app_diretoria_industry_id || '—'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Seção 2: Produtos & Mix da Indústria */}
                {industryFichaSection === 'produtos_mix' &&
                  (() => {
                    const prodsInd = produtos.filter(
                      (p) => p.industry_id === selectedIndustryFicha.id,
                    )
                    const allIndSelected =
                      prodsInd.length > 0 &&
                      prodsInd.every((p) => selectedProductIds.includes(p.id))
                    const someIndSelected =
                      prodsInd.some((p) => selectedProductIds.includes(p.id)) && !allIndSelected

                    const selectedProdsInd = prodsInd.filter((p) =>
                      selectedProductIds.includes(p.id),
                    )

                    return (
                      <div className="space-y-3 pt-2">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div>
                            <h3 className="text-sm font-bold text-slate-900">
                              Catálogo de Produtos desta Indústria
                            </h3>
                            <p className="text-xs text-slate-500">
                              Produtos vinculados estruturalmente a {selectedIndustryFicha.nome}.
                              Use a seleção múltipla para executar ações em lote no Mix Oficial.
                            </p>
                          </div>
                          {canEdit && (
                            <Button
                              size="sm"
                              onClick={() =>
                                handleOpenCreate('produtos', {
                                  industry_id: selectedIndustryFicha.id,
                                  industry_name: selectedIndustryFicha.nome,
                                })
                              }
                              className="text-xs h-8 bg-indigo-600 hover:bg-indigo-700 text-white gap-1"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Adicionar Produto</span>
                            </Button>
                          )}
                        </div>

                        {/* Barra de Ações em Lote para a Indústria Selecionada */}
                        <MixBatchActionsBar
                          selectedCount={selectedProdsInd.length}
                          selectedProducts={selectedProdsInd}
                          contextIndustryName={selectedIndustryFicha.nome}
                          canEdit={canEdit}
                          isProcessing={isBatchProcessing}
                          onClearSelection={handleClearProductSelection}
                          onExecuteAction={handleExecuteMixBatchAction}
                        />

                        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                              <tr>
                                <th className="p-3 w-10 text-center">
                                  <input
                                    type="checkbox"
                                    aria-label="Selecionar todos os produtos desta indústria"
                                    checked={allIndSelected}
                                    ref={(input) => {
                                      if (input) input.indeterminate = someIndSelected
                                    }}
                                    onChange={() => handleSelectAllVisibleProducts(prodsInd)}
                                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                  />
                                </th>
                                <th className="p-3">Código TradePro</th>
                                <th className="p-3">Produto Oficial</th>
                                <th className="p-3">Família / Sabor / Gramatura</th>
                                <th className="p-3">Mix Oficial</th>
                                <th className="p-3">Status</th>
                                <th className="p-3 text-right">Ações</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {prodsInd.length === 0 ? (
                                <tr>
                                  <td colSpan={7} className="p-6 text-center text-slate-400">
                                    Nenhum produto cadastrado para esta indústria.
                                  </td>
                                </tr>
                              ) : (
                                prodsInd.map((prod) => {
                                  const isSelected = selectedProductIds.includes(prod.id)
                                  return (
                                    <tr
                                      key={prod.id}
                                      className={`transition-colors ${
                                        isSelected
                                          ? 'bg-indigo-50/70 hover:bg-indigo-50'
                                          : 'hover:bg-slate-50/80'
                                      }`}
                                    >
                                      <td className="p-3 text-center">
                                        <input
                                          type="checkbox"
                                          aria-label={`Selecionar produto ${prod.nome_produto}`}
                                          checked={isSelected}
                                          onChange={() => handleToggleSelectProduct(prod.id)}
                                          className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                        />
                                      </td>
                                      <td className="p-3 font-mono font-medium text-slate-700">
                                        {prod.codigo_produto || '—'}
                                      </td>
                                      <td className="p-3 font-semibold text-slate-900">
                                        <button
                                          type="button"
                                          onClick={() => handleOpenProductFicha(prod)}
                                          className="hover:underline text-left text-indigo-700"
                                        >
                                          {prod.nome_produto}
                                        </button>
                                      </td>
                                      <td className="p-3 text-slate-600">
                                        {[prod.familia, prod.sabor, prod.gramatura, prod.embalagem]
                                          .filter(Boolean)
                                          .join(' • ') || '—'}
                                      </td>
                                      <td className="p-3">
                                        <Badge
                                          variant="outline"
                                          className={
                                            prod.tipo_mix === 'oficial_industria'
                                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                              : 'bg-slate-100 text-slate-600 border-slate-200'
                                          }
                                        >
                                          {prod.tipo_mix === 'oficial_industria'
                                            ? 'Sim (Mix Oficial)'
                                            : 'Não (Observado)'}
                                        </Badge>
                                      </td>
                                      <td className="p-3">
                                        <Badge
                                          variant={
                                            prod.status === 'ativo' ? 'default' : 'secondary'
                                          }
                                          className="text-[10px] capitalize"
                                        >
                                          {prod.status}
                                        </Badge>
                                      </td>
                                      <td className="p-3 text-right space-x-1">
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="text-xs h-7 px-2"
                                          onClick={() => handleOpenProductFicha(prod)}
                                        >
                                          <Eye className="w-3 h-3 mr-1" /> Ficha
                                        </Button>
                                        {canEdit && (
                                          <>
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              className="text-xs h-7 px-2"
                                              onClick={() => handleToggleMixOficial(prod)}
                                            >
                                              {prod.tipo_mix === 'oficial_industria'
                                                ? 'Remover do Mix'
                                                : 'Adicionar ao Mix'}
                                            </Button>
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              className="text-xs h-7 px-2 text-indigo-600"
                                              onClick={() => handleOpenEdit('produtos', prod)}
                                            >
                                              Editar
                                            </Button>
                                          </>
                                        )}
                                      </td>
                                    </tr>
                                  )
                                })
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )
                  })()}

                {/* Seção 3: Lojas / Cobertura Auto-suficiente */}
                {industryFichaSection === 'lojas_cobertura' && (
                  <div className="space-y-4 pt-2 text-xs">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                      <div>
                        <span className="font-bold text-slate-800 text-sm block">
                          Cobertura Operacional de Lojas — {selectedIndustryFicha.nome}
                        </span>
                        <p className="text-slate-500 mt-0.5">
                          Lojas autorizadas/monitoradas para {selectedIndustryFicha.nome}. Adicione
                          lojas, confirme detecções e controle a relação.
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className="bg-white text-indigo-700 border-indigo-200 font-semibold self-start sm:self-auto"
                      >
                        {industryCoverages.length} lojas cobertas
                      </Badge>
                    </div>

                    {/* Adicionar Loja à Cobertura */}
                    {canEdit && (
                      <div className="p-3 bg-white border border-slate-200 rounded-xl flex flex-col sm:flex-row items-center gap-2">
                        <select
                          value={selectedLojaToAddCoverage}
                          onChange={(e) => setSelectedLojaToAddCoverage(e.target.value)}
                          className="flex-1 w-full h-8 px-2.5 bg-white border border-slate-300 rounded-md text-xs"
                        >
                          <option value="">
                            -- Selecione uma loja da base para adicionar à cobertura --
                          </option>
                          {lojas
                            .filter(
                              (l) =>
                                !industryCoverages.some(
                                  (c) =>
                                    c.store_code === l.codigo_externo ||
                                    c.store_name.toLowerCase() === l.razao_social.toLowerCase(),
                                ),
                            )
                            .map((l) => (
                              <option key={l.id} value={l.id}>
                                {l.codigo_externo ? `[${l.codigo_externo}] ` : ''}
                                {l.razao_social} ({l.rede_nome || 'Sem Rede'}
                                {l.cidade ? ` - ${l.cidade}` : ''})
                              </option>
                            ))}
                        </select>
                        <Button
                          size="sm"
                          disabled={!selectedLojaToAddCoverage || addingCoverage}
                          onClick={async () => {
                            const targetStore = lojas.find(
                              (l) => l.id === selectedLojaToAddCoverage,
                            )
                            if (!targetStore || !selectedIndustryFicha) return
                            setAddingCoverage(true)
                            try {
                              await saveStoreCoverage(
                                {
                                  industry_id: selectedIndustryFicha.id,
                                  industry_name: selectedIndustryFicha.nome,
                                  store_code: targetStore.codigo_externo,
                                  store_name: targetStore.razao_social,
                                  network_name: targetStore.rede_nome || '',
                                  city: targetStore.cidade || '',
                                  state: targetStore.estado || 'SC',
                                  status_relacao: 'ativa',
                                  observacao: 'Adicionada manualmente pela Central de Cadastros',
                                },
                                user?.name || 'Operador',
                              )
                              toast({
                                title: 'Loja adicionada à cobertura',
                                description: `${targetStore.razao_social} vinculada à ${selectedIndustryFicha.nome}.`,
                              })
                              setSelectedLojaToAddCoverage('')
                              const updated = await getIndustryStoreCoverages(
                                selectedIndustryFicha.id,
                              )
                              setIndustryCoverages(updated)
                            } catch (err: any) {
                              toast({
                                title: 'Erro ao adicionar cobertura',
                                description: err.message,
                                variant: 'destructive',
                              })
                            } finally {
                              setAddingCoverage(false)
                            }
                          }}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-8 px-3 gap-1.5 w-full sm:w-auto shrink-0"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Adicionar Loja</span>
                        </Button>
                      </div>
                    )}

                    {/* Tabela de Lojas com Cobertura */}
                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
                      {loadingCoverages ? (
                        <div className="p-8 text-center text-slate-400">
                          Carregando cobertura da indústria...
                        </div>
                      ) : industryCoverages.length === 0 ? (
                        <div className="p-8 text-center text-slate-400">
                          Nenhuma loja cadastrada na cobertura de {selectedIndustryFicha.nome}. Use
                          o seletor acima para adicionar.
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50/50 text-slate-500 font-semibold border-b border-slate-200">
                              <tr>
                                <th className="p-3">Código</th>
                                <th className="p-3">Loja</th>
                                <th className="p-3">Rede</th>
                                <th className="p-3">Cidade/UF</th>
                                <th className="p-3">Origem</th>
                                <th className="p-3">Status Relação</th>
                                {canEdit && <th className="p-3 text-right">Ações</th>}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {industryCoverages.map((cov) => (
                                <tr key={cov.id} className="hover:bg-slate-50/80">
                                  <td className="p-3 font-mono font-medium text-slate-700">
                                    {cov.store_code || '—'}
                                  </td>
                                  <td className="p-3 font-semibold text-slate-900">
                                    {cov.store_name}
                                  </td>
                                  <td className="p-3 text-slate-600">
                                    {cov.network_name || 'Sem Rede'}
                                  </td>
                                  <td className="p-3 text-slate-500">
                                    {cov.city ? `${cov.city}/${cov.state || 'SC'}` : '—'}
                                  </td>
                                  <td className="p-3">
                                    <span className="text-[11px] text-slate-500">
                                      {cov.origem_deteccao || 'Cadastro Central'}
                                    </span>
                                  </td>
                                  <td className="p-3">
                                    <Badge
                                      variant={
                                        cov.status_relacao === 'ativa' ? 'default' : 'secondary'
                                      }
                                      className="capitalize text-[10px]"
                                    >
                                      {cov.status_relacao}
                                    </Badge>
                                  </td>
                                  {canEdit && (
                                    <td className="p-3 text-right space-x-1.5">
                                      {cov.status_relacao === 'detectada' && (
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="text-[11px] h-7 px-2 text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                                          onClick={async () => {
                                            try {
                                              await saveStoreCoverage(
                                                {
                                                  ...cov,
                                                  status_relacao: 'ativa',
                                                },
                                                user?.name || 'Operador',
                                              )
                                              toast({ title: 'Cobertura confirmada como ativa' })
                                              const updated = await getIndustryStoreCoverages(
                                                selectedIndustryFicha.id,
                                              )
                                              setIndustryCoverages(updated)
                                            } catch (err: any) {
                                              toast({
                                                title: 'Erro ao confirmar',
                                                description: err.message,
                                                variant: 'destructive',
                                              })
                                            }
                                          }}
                                        >
                                          Confirmar
                                        </Button>
                                      )}
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="text-[11px] h-7 px-2 text-amber-700 border-amber-200 hover:bg-amber-50"
                                        onClick={async () => {
                                          const nextStatus =
                                            cov.status_relacao === 'ativa' ? 'inativa' : 'ativa'
                                          try {
                                            await saveStoreCoverage(
                                              {
                                                ...cov,
                                                status_relacao: nextStatus,
                                              },
                                              user?.name || 'Operador',
                                            )
                                            toast({ title: `Status alterado para ${nextStatus}` })
                                            const updated = await getIndustryStoreCoverages(
                                              selectedIndustryFicha.id,
                                            )
                                            setIndustryCoverages(updated)
                                          } catch (err: any) {
                                            toast({
                                              title: 'Erro ao alterar status',
                                              description: err.message,
                                              variant: 'destructive',
                                            })
                                          }
                                        }}
                                      >
                                        {cov.status_relacao === 'ativa' ? 'Desativar' : 'Ativar'}
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="text-[11px] h-7 px-2 text-red-600 hover:bg-red-50"
                                        onClick={async () => {
                                          if (
                                            !confirm(
                                              `Remover a loja "${cov.store_name}" da cobertura de ${selectedIndustryFicha.nome}?`,
                                            )
                                          )
                                            return
                                          try {
                                            await deleteStoreCoverage(
                                              cov.id,
                                              selectedIndustryFicha.id,
                                              user?.name || 'Operador',
                                            )
                                            toast({ title: 'Loja removida da cobertura' })
                                            const updated = await getIndustryStoreCoverages(
                                              selectedIndustryFicha.id,
                                            )
                                            setIndustryCoverages(updated)
                                          } catch (err: any) {
                                            toast({
                                              title: 'Erro ao remover',
                                              description: err.message,
                                              variant: 'destructive',
                                            })
                                          }
                                        }}
                                      >
                                        Remover
                                      </Button>
                                    </td>
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Seção 4: Promotores */}
                {industryFichaSection === 'promotores' && (
                  <div className="space-y-3 pt-2 text-xs">
                    <p className="text-slate-600">
                      Promotores com roteiros ativos ou visitas registradas para produtos da{' '}
                      {selectedIndustryFicha.nome}.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                      {promotores
                        .filter(
                          (p) =>
                            p.industrias_relacionadas &&
                            p.industrias_relacionadas.some((i) =>
                              i.toLowerCase().includes(selectedIndustryFicha.nome.toLowerCase()),
                            ),
                        )
                        .map((prom) => (
                          <div
                            key={prom.id}
                            className="p-3 bg-white border border-slate-200 rounded-xl space-y-1 hover:border-indigo-300"
                          >
                            <span className="font-bold text-slate-900 block">{prom.nome}</span>
                            <span className="text-[11px] text-slate-500 block">
                              Supervisor: {prom.supervisor_nome || 'Sem supervisor'}
                            </span>
                            <span className="text-[11px] text-indigo-600 font-medium block">
                              {prom.total_lojas || 0} lojas atendidas
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* Seção 5: Integrações & Vínculos */}
                {industryFichaSection === 'integracoes' && (
                  <div className="space-y-3 pt-2 text-xs">
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                      <span className="font-bold text-slate-900 block text-sm">
                        Vínculo com TradePro
                      </span>
                      <p className="text-slate-600">
                        O TradePro envia o "Cód. Cliente" para identificar a indústria atendida nas
                        rupturas e pesquisas.
                      </p>
                      <div className="flex items-center gap-2 pt-2">
                        <span className="text-slate-500">Cód. Cliente TradePro:</span>
                        {selectedIndustryFicha.tradepro_client_id ? (
                          <Badge
                            variant="outline"
                            className="font-mono text-xs bg-white text-indigo-700"
                          >
                            {selectedIndustryFicha.tradepro_client_id}
                          </Badge>
                        ) : (
                          <span className="text-amber-600 italic">Não vinculado</span>
                        )}
                        {canEdit && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleOpenEdit('industrias', selectedIndustryFicha)}
                            className="text-xs h-7 ml-2"
                          >
                            Ajustar Vínculo Manual
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : industriaSubView === 'industrias' ? (
            /* LISTAGEM DE INDÚSTRIAS (VISÃO INICIAL) */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredIndustrias.map((ind) => {
                const prodsCount = produtos.filter((p) => p.industry_id === ind.id).length
                const mixOficialCount = produtos.filter(
                  (p) => p.industry_id === ind.id && p.tipo_mix === 'oficial_industria',
                ).length

                return (
                  <Card key={ind.id} className="hover:shadow-md transition-shadow">
                    <CardHeader className="p-4 pb-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle
                            className="text-base font-bold text-slate-900 cursor-pointer hover:text-indigo-600 transition-colors"
                            onClick={() => {
                              setSelectedIndustryFicha(ind)
                              setIndustryFichaSection('resumo')
                            }}
                          >
                            {ind.nome}
                          </CardTitle>
                          <CardDescription className="text-xs text-slate-500">
                            {ind.segmento || 'Alimentos / Consumo'}
                          </CardDescription>
                        </div>
                        <Badge
                          variant={ind.status === 'ativa' ? 'default' : 'secondary'}
                          className="text-[10px] capitalize"
                        >
                          {ind.status}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="p-4 pt-2 space-y-3 text-xs">
                      {/* Vínculo TradePro Seguro */}
                      <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Link2 className="w-3.5 h-3.5 text-indigo-500" />
                          <span className="text-slate-600">Cliente TradePro:</span>
                        </div>
                        {ind.tradepro_client_id ? (
                          <Badge
                            variant="outline"
                            className="font-mono text-[11px] bg-white text-indigo-700 border-indigo-200"
                          >
                            Cód. {ind.tradepro_client_id}
                          </Badge>
                        ) : (
                          <span className="text-amber-600 italic">Pendente de vínculo</span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-slate-600">
                        <div>
                          <span className="block text-[11px] text-slate-400">Mix Oficial:</span>
                          <span className="font-semibold text-slate-800">
                            {mixOficialCount} de {prodsCount} produtos
                          </span>
                        </div>
                        <div>
                          <span className="block text-[11px] text-slate-400">
                            Identificador Futuro:
                          </span>
                          <span className="font-mono text-[11px] text-slate-700">
                            {ind.app_diretoria_industry_id || '—'}
                          </span>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                        <div className="space-x-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs h-7 px-2 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                            onClick={() => {
                              setSelectedIndustryFicha(ind)
                              setIndustryFichaSection('resumo')
                            }}
                          >
                            Ficha Completa
                          </Button>
                          {canEdit && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-xs h-7 px-2 text-slate-600 hover:text-indigo-600"
                              onClick={() => handleOpenEdit('industrias', ind)}
                            >
                              <Edit2 className="w-3 h-3 mr-1" /> Editar
                            </Button>
                          )}
                        </div>

                        <a
                          href={`/industrias/${ind.id}`}
                          className="text-xs text-slate-500 hover:text-indigo-600 flex items-center gap-1"
                        >
                          Cockpit <ArrowRight className="w-3 h-3" />
                        </a>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          ) : (
            /* SUBVISÃO: TODOS OS PRODUTOS (Catálogo Global em Tabela Organizada) */
            (() => {
              const allFilteredSelected =
                filteredTodosProdutos.length > 0 &&
                filteredTodosProdutos.every((p) => selectedProductIds.includes(p.id))
              const someFilteredSelected =
                filteredTodosProdutos.some((p) => selectedProductIds.includes(p.id)) &&
                !allFilteredSelected

              const selectedProdsInGlobal = produtos.filter((p) =>
                selectedProductIds.includes(p.id),
              )

              // Identificar nome da indústria filtrada, se houver filtro por indústria específica
              const filteredIndObj =
                filterIndustryInCatalog !== 'todas'
                  ? industrias.find((i) => i.id === filterIndustryInCatalog)
                  : undefined

              return (
                <div className="space-y-4">
                  {/* Barra de Ações em Lote */}
                  <MixBatchActionsBar
                    selectedCount={selectedProdsInGlobal.length}
                    selectedProducts={selectedProdsInGlobal}
                    contextIndustryName={filteredIndObj?.nome}
                    canEdit={canEdit}
                    isProcessing={isBatchProcessing}
                    onClearSelection={handleClearProductSelection}
                    onExecuteAction={handleExecuteMixBatchAction}
                  />

                  <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
                    <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900">Catálogo Mestre Completo</span>
                        <Badge variant="outline" className="text-slate-600">
                          {filteredTodosProdutos.length} de {produtos.length} produtos
                        </Badge>
                      </div>
                      <span className="text-slate-500 text-[11px]">
                        Selecione múltiplos produtos para adicionar, remover ou promover ao Mix
                        Oficial.
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50/50 text-slate-500 font-semibold border-b border-slate-200">
                          <tr>
                            <th className="p-3 w-10 text-center">
                              <input
                                type="checkbox"
                                aria-label="Selecionar todos os produtos visíveis"
                                checked={allFilteredSelected}
                                ref={(input) => {
                                  if (input) input.indeterminate = someFilteredSelected
                                }}
                                onChange={() =>
                                  handleSelectAllVisibleProducts(filteredTodosProdutos)
                                }
                                className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                              />
                            </th>
                            <th className="p-3">Código TradePro</th>
                            <th className="p-3">Produto Oficial</th>
                            <th className="p-3">Indústria / Marca</th>
                            <th className="p-3">Categoria / Família</th>
                            <th className="p-3">Nível do Mix</th>
                            <th className="p-3">Status</th>
                            <th className="p-3 text-right">Ação</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {filteredTodosProdutos.length === 0 ? (
                            <tr>
                              <td colSpan={8} className="p-6 text-center text-slate-400">
                                Nenhum produto encontrado com os filtros selecionados.
                              </td>
                            </tr>
                          ) : (
                            filteredTodosProdutos.map((prod) => {
                              const isSelected = selectedProductIds.includes(prod.id)
                              return (
                                <tr
                                  key={prod.id}
                                  className={`transition-colors ${
                                    isSelected
                                      ? 'bg-indigo-50/70 hover:bg-indigo-50'
                                      : 'hover:bg-slate-50/80'
                                  }`}
                                >
                                  <td className="p-3 text-center">
                                    <input
                                      type="checkbox"
                                      aria-label={`Selecionar produto ${prod.nome_produto}`}
                                      checked={isSelected}
                                      onChange={() => handleToggleSelectProduct(prod.id)}
                                      className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                    />
                                  </td>
                                  <td className="p-3 font-mono font-medium text-slate-700">
                                    {prod.codigo_produto || '—'}
                                  </td>
                                  <td className="p-3 font-semibold text-slate-900">
                                    <button
                                      type="button"
                                      onClick={() => handleOpenProductFicha(prod)}
                                      className="hover:underline text-left text-indigo-700"
                                    >
                                      {prod.nome_produto}
                                    </button>
                                    {prod.gramatura && (
                                      <span className="text-slate-400 font-normal ml-1">
                                        ({prod.gramatura})
                                      </span>
                                    )}
                                  </td>
                                  <td className="p-3 font-medium text-indigo-600">
                                    {prod.industry_name}
                                  </td>
                                  <td className="p-3 text-slate-600">
                                    {prod.categoria || 'Geral'}{' '}
                                    {prod.familia ? `• ${prod.familia}` : ''}
                                  </td>
                                  <td className="p-3">
                                    <Badge
                                      variant="outline"
                                      className={
                                        prod.tipo_mix === 'oficial_industria'
                                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                          : 'bg-blue-50 text-blue-700 border-blue-200'
                                      }
                                    >
                                      {prod.tipo_mix === 'oficial_industria'
                                        ? 'Mix Oficial'
                                        : 'Mix Observado'}
                                    </Badge>
                                  </td>
                                  <td className="p-3">
                                    <Badge
                                      variant={prod.status === 'ativo' ? 'default' : 'secondary'}
                                      className="text-[10px] capitalize"
                                    >
                                      {prod.status}
                                    </Badge>
                                  </td>
                                  <td className="p-3 text-right space-x-1">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="text-xs h-7 px-2"
                                      onClick={() => handleOpenProductFicha(prod)}
                                    >
                                      <Eye className="w-3.5 h-3.5 mr-1" /> Ficha
                                    </Button>
                                    {canEdit && (
                                      <>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="text-xs h-7 px-2"
                                          onClick={() => handleToggleMixOficial(prod)}
                                        >
                                          {prod.tipo_mix === 'oficial_industria'
                                            ? 'Remover Mix'
                                            : 'Adicionar Mix'}
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="text-xs h-7 px-2 text-indigo-600"
                                          onClick={() => handleOpenEdit('produtos', prod)}
                                        >
                                          Editar
                                        </Button>
                                      </>
                                    )}
                                  </td>
                                </tr>
                              )
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )
            })()
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. FAMÍLIA: REDES & LOJAS */}
      {/* ========================================================================= */}
      {activeFamily === 'redes_lojas' && (
        <div className="space-y-5">
          {/* Barra de Filtros e Busca de Redes/Lojas */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center gap-2">
              {selectedRedeFicha && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedRedeFicha(null)}
                  className="text-xs h-8 px-2.5 gap-1.5"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Voltar a Todas as Redes</span>
                </Button>
              )}
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  type="text"
                  placeholder={
                    selectedRedeFicha
                      ? `Buscar lojas da rede ${selectedRedeFicha.nome}...`
                      : 'Buscar redes, lojas, cidades...'
                  }
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 text-xs h-8"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-36 text-xs h-8">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos Status</SelectItem>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="inativo">Inativo</SelectItem>
                </SelectContent>
              </Select>

              {canEdit && (
                <div className="space-x-1.5">
                  <Button
                    size="sm"
                    className="text-xs h-8 gap-1 bg-blue-600 hover:bg-blue-700 text-white"
                    onClick={() => handleOpenCreate('redes')}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Nova Rede</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-8 gap-1"
                    onClick={() =>
                      handleOpenCreate('lojas', {
                        network_id: selectedRedeFicha?.id || null,
                        rede_nome: selectedRedeFicha?.nome || '',
                      })
                    }
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Adicionar Loja</span>
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* FICHA DA REDE SELECIONADA */}
          {selectedRedeFicha ? (
            <div className="space-y-4">
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <h2 className="text-xl font-bold text-slate-900">{selectedRedeFicha.nome}</h2>
                      <Badge
                        variant={selectedRedeFicha.ativo ? 'default' : 'secondary'}
                        className="text-[10px]"
                      >
                        {selectedRedeFicha.ativo ? 'Ativa' : 'Inativa'}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Grupo Varejista • Cód. Externo: {selectedRedeFicha.codigo_externo || '—'} •
                      Total de {lojasDaRedeSelecionada.length} lojas vinculadas
                    </p>
                  </div>

                  {canEdit && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleOpenEdit('redes', selectedRedeFicha)}
                      className="text-xs h-8 gap-1.5"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      <span>Editar Rede</span>
                    </Button>
                  )}
                </div>

                {/* Tabela de Lojas da Rede */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-900">
                      Lojas da Rede ({filteredLojas.length})
                    </h3>
                    <span className="text-xs text-slate-500">
                      Toda edição estrutural permanece protegida e auditada.
                    </span>
                  </div>

                  <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                        <tr>
                          <th className="p-3">Código</th>
                          <th className="p-3">Razão Social / Loja</th>
                          <th className="p-3">Cidade / UF</th>
                          <th className="p-3">Status</th>
                          <th className="p-3 text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredLojas.map((loja) => (
                          <tr key={loja.id} className="hover:bg-slate-50/80">
                            <td className="p-3 font-mono font-bold text-slate-700">
                              {loja.codigo_externo || loja.codigo_loja}
                            </td>
                            <td className="p-3 font-semibold text-slate-900">
                              <button
                                type="button"
                                onClick={() =>
                                  navigateToStore(
                                    {
                                      codigoLoja: loja.codigo_externo || loja.codigo_loja,
                                      nomeLoja: loja.razao_social || loja.nome,
                                      rede: loja.rede_nome,
                                      cidade: loja.cidade,
                                      uf: loja.estado,
                                    },
                                    navigate,
                                  )
                                }
                                className="hover:underline text-left text-blue-700"
                              >
                                {loja.razao_social || loja.nome}
                              </button>
                            </td>
                            <td className="p-3 text-slate-600">
                              {loja.cidade} / {loja.estado}
                            </td>
                            <td className="p-3">
                              <Badge
                                variant={loja.ativo ? 'default' : 'secondary'}
                                className="text-[10px]"
                              >
                                {loja.ativo ? 'Ativa' : 'Inativa'}
                              </Badge>
                            </td>
                            <td className="p-3 text-right space-x-1">
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-xs h-7 px-2"
                                onClick={() => handleOpenStoreMix(loja)}
                              >
                                <TrendingUp className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                                Mix
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-xs h-7 px-2"
                                onClick={() => setSelectedLojaFicha(loja)}
                              >
                                Ficha
                              </Button>
                              {canEdit && (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-xs h-7 px-2 text-indigo-600"
                                    onClick={() => handleOpenEdit('lojas', loja)}
                                  >
                                    Editar
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-xs h-7 px-2 text-amber-700"
                                    onClick={() => {
                                      setMovingLoja(loja)
                                      setTargetNovaRedeId(loja.network_id || '')
                                    }}
                                  >
                                    <Shuffle className="w-3 h-3 mr-1" /> Mover
                                  </Button>
                                </>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* VISÃO INICIAL: LISTA DE REDES COM CONTAGEM DE LOJAS */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredRedes.map((rede) => {
                const countLojas = lojas.filter((l) => l.network_id === rede.id).length
                return (
                  <Card key={rede.id} className="hover:shadow-md transition-shadow">
                    <CardHeader className="p-4 pb-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle
                            className="text-base font-bold text-slate-900 cursor-pointer hover:text-blue-600 transition-colors"
                            onClick={() => setSelectedRedeFicha(rede)}
                          >
                            {rede.nome}
                          </CardTitle>
                          <CardDescription className="text-xs text-slate-500">
                            Cód. Externo: {rede.codigo_externo || '—'}
                          </CardDescription>
                        </div>
                        <Badge
                          variant={rede.ativo ? 'default' : 'secondary'}
                          className="text-[10px]"
                        >
                          {rede.ativo ? 'Ativa' : 'Inativa'}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="p-4 pt-2 space-y-3 text-xs">
                      <div className="flex items-center justify-between p-2.5 rounded-lg bg-blue-50/60 border border-blue-100">
                        <span className="text-slate-600">Lojas Vinculadas:</span>
                        <span className="font-bold text-blue-700 text-sm">
                          {countLojas} {countLojas === 1 ? 'loja' : 'lojas'}
                        </span>
                      </div>

                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs h-7 px-2 text-blue-600 font-semibold hover:bg-blue-50"
                          onClick={() => setSelectedRedeFicha(rede)}
                        >
                          Ver Lojas da Rede ({countLojas}) &rarr;
                        </Button>
                        {canEdit && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs h-7 px-2 text-slate-600 hover:text-blue-600"
                            onClick={() => handleOpenEdit('redes', rede)}
                          >
                            <Edit2 className="w-3 h-3 mr-1" /> Editar
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. FAMÍLIA: EQUIPE DE CAMPO (Promotores | Supervisores) */}
      {/* ========================================================================= */}
      {activeFamily === 'equipe_campo' && (
        <div className="space-y-5">
          {/* Alternância: [Promotores] | [Supervisores] */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-lg shrink-0">
              <Button
                size="sm"
                variant={equipeSubView === 'promotores' ? 'default' : 'ghost'}
                onClick={() => {
                  setEquipeSubView('promotores')
                  setSelectedSupervisorFicha(null)
                }}
                className={`text-xs h-8 ${
                  equipeSubView === 'promotores'
                    ? 'bg-violet-600 text-white shadow-xs'
                    : 'text-slate-600'
                }`}
              >
                <Users className="w-3.5 h-3.5 mr-1.5" />
                Promotores ({promotores.length})
              </Button>
              <Button
                size="sm"
                variant={equipeSubView === 'supervisores' ? 'default' : 'ghost'}
                onClick={() => {
                  setEquipeSubView('supervisores')
                  setSelectedPromoterFicha(null)
                }}
                className={`text-xs h-8 ${
                  equipeSubView === 'supervisores'
                    ? 'bg-teal-600 text-white shadow-xs'
                    : 'text-slate-600'
                }`}
              >
                <UserCheck className="w-3.5 h-3.5 mr-1.5" />
                Supervisores ({supervisores.length})
              </Button>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  type="text"
                  placeholder={
                    equipeSubView === 'promotores'
                      ? 'Buscar promotores, supervisor...'
                      : 'Buscar supervisores...'
                  }
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 text-xs h-8"
                />
              </div>

              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-36 text-xs h-8">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos Status</SelectItem>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="inativo">Inativo</SelectItem>
                </SelectContent>
              </Select>

              {canEdit && (
                <Button
                  size="sm"
                  className={`text-xs h-8 gap-1 text-white shrink-0 ${
                    equipeSubView === 'promotores'
                      ? 'bg-violet-600 hover:bg-violet-700'
                      : 'bg-teal-600 hover:bg-teal-700'
                  }`}
                  onClick={() => handleOpenCreate(equipeSubView)}
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Novo {equipeSubView === 'promotores' ? 'Promotor' : 'Supervisor'}</span>
                </Button>
              )}
            </div>
          </div>

          {/* SUBVISÃO: PROMOTORES */}
          {equipeSubView === 'promotores' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredPromotores.map((prom) => (
                <Card key={prom.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="p-4 pb-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle
                          className="text-base font-bold text-slate-900 cursor-pointer hover:text-violet-600"
                          onClick={() => setSelectedPromoterFicha(prom)}
                        >
                          {prom.nome}
                        </CardTitle>
                        <CardDescription className="text-xs text-slate-500">
                          Cód. TradePro: {prom.codigo_externo || '—'}
                        </CardDescription>
                      </div>
                      <Badge
                        variant={prom.status === 'ativo' ? 'default' : 'secondary'}
                        className="text-[10px]"
                      >
                        {prom.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 pt-2 space-y-3 text-xs">
                    <div className="p-2.5 rounded-lg bg-slate-50 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Supervisor:</span>
                        <span className="font-semibold text-slate-800">
                          {prom.supervisor_nome || 'Não vinculado'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Lojas Atendidas:</span>
                        <span className="font-semibold text-violet-600">
                          {prom.total_lojas || 0} lojas
                        </span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                      <div className="space-x-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs h-7 px-2 text-violet-600 hover:bg-violet-50"
                          onClick={() => handleOpenPromoterHistory(prom)}
                        >
                          <History className="w-3.5 h-3.5 mr-1" /> Histórico / Lojas
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs h-7 px-2 text-slate-600"
                          onClick={() => setSelectedPromoterFicha(prom)}
                        >
                          Ficha
                        </Button>
                      </div>
                      {canEdit && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs h-7 px-2 text-slate-600 hover:text-violet-600"
                          onClick={() => handleOpenEdit('promotores', prom)}
                        >
                          <Edit2 className="w-3 h-3 mr-1" /> Editar
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* SUBVISÃO: SUPERVISORES */}
          {equipeSubView === 'supervisores' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredSupervisores.map((sup) => (
                <Card key={sup.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="p-4 pb-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle
                          className="text-base font-bold text-slate-900 cursor-pointer hover:text-teal-600"
                          onClick={() => setSelectedSupervisorFicha(sup)}
                        >
                          {sup.nome}
                        </CardTitle>
                        <CardDescription className="text-xs text-slate-500">
                          Cód. TradePro: {sup.codigo_externo || '—'}
                        </CardDescription>
                      </div>
                      <Badge
                        variant={sup.status === 'ativo' ? 'default' : 'secondary'}
                        className="text-[10px]"
                      >
                        {sup.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 pt-2 space-y-3 text-xs">
                    <div className="p-2.5 rounded-lg bg-slate-50 flex items-center justify-between">
                      <span className="text-slate-600">Promotores na Equipe:</span>
                      <span className="font-bold text-teal-700 text-sm">
                        {sup.total_promotores || 0} promotores
                      </span>
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs h-7 px-2 text-teal-700 font-semibold hover:bg-teal-50"
                        onClick={() => setSelectedSupervisorFicha(sup)}
                      >
                        Ver Equipe Completa &rarr;
                      </Button>
                      {canEdit && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs h-7 px-2 text-slate-600 hover:text-teal-600"
                          onClick={() => handleOpenEdit('supervisores', sup)}
                        >
                          <Edit2 className="w-3 h-3 mr-1" /> Editar
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. FAMÍLIA: PENDÊNCIAS */}
      {/* ========================================================================= */}
      {activeFamily === 'pendencias' && (
        <div className="space-y-4">
          <Card className="border-amber-200 bg-amber-50/40">
            <CardHeader className="p-4 pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-bold text-amber-900 flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-amber-600" />
                  Fila Central de Pendências de Cadastro ({filteredPendencias.length})
                </CardTitle>
                <Badge
                  variant="outline"
                  className="bg-white text-amber-800 border-amber-300 text-xs"
                >
                  Resolução Assistida
                </Badge>
              </div>
              <CardDescription className="text-xs text-amber-800">
                Concentra entidades observadas nas fontes externas sem correspondência segura no
                SKIP (Indústrias, Produtos, Lojas, Redes, Promotores ou Supervisores). A
                sincronização não quebra; vincular resolve e reprocessa com governança.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-2">
              <div className="bg-white rounded-lg border border-amber-200 overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-amber-50/70 text-amber-900 font-semibold border-b border-amber-200">
                    <tr>
                      <th className="p-3">Tipo de Entidade</th>
                      <th className="p-3">Valor / Identificador Recebido</th>
                      <th className="p-3">Origem da Fonte</th>
                      <th className="p-3">Ocorrências</th>
                      <th className="p-3 text-right">Ação Assistida</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-amber-100">
                    {filteredPendencias.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-6 text-center text-slate-500">
                          Nenhuma pendência aberta no momento. Todos os vínculos estão consistentes.
                        </td>
                      </tr>
                    ) : (
                      filteredPendencias.map((pen) => (
                        <tr key={pen.id} className="hover:bg-amber-50/30">
                          <td className="p-3">
                            <Badge variant="outline" className="capitalize text-[10px]">
                              {pen.tipo_entidade}
                            </Badge>
                          </td>
                          <td className="p-3 font-semibold text-slate-900">
                            {pen.nome_identificado || pen.valor_identificador}
                            {pen.codigo_externo && (
                              <span className="text-slate-400 font-normal ml-1">
                                (Cód. {pen.codigo_externo})
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-slate-600 font-mono text-[11px]">
                            {pen.origem_fonte}
                          </td>
                          <td className="p-3 font-bold text-amber-700">
                            {pen.volume_ocorrencias || 1}x
                          </td>
                          <td className="p-3 text-right">
                            <Button
                              size="sm"
                              className="text-xs h-7 px-2.5 bg-amber-600 hover:bg-amber-700 text-white"
                              onClick={() => {
                                setResolvingPendencia(pen)
                                setTargetEntityId('')
                                setResolucaoObs('')
                              }}
                            >
                              Vincular Entidade
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAIS AUXILIARES: FICHA DO PRODUTO (INTELIGÊNCIA DE MIX E RELACIONAMENTOS) */}
      {/* ========================================================================= */}
      <Dialog
        open={Boolean(selectedProductFicha)}
        onOpenChange={(open) => !open && setSelectedProductFicha(null)}
      >
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Package className="w-5 h-5 text-indigo-600" />
              Ficha do Produto — {selectedProductFicha?.nome_produto}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Indústria: {selectedProductFicha?.industry_name} • EAN:{' '}
              {selectedProductFicha?.cod_barras || '—'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            {/* Bloco 1: Identificação & Mix Oficial */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="p-3 bg-slate-50 rounded-lg">
                <span className="text-[10px] text-slate-400 block">Mix Oficial:</span>
                <Badge
                  variant="outline"
                  className={`mt-1 text-[10px] ${
                    selectedProductFicha?.tipo_mix === 'oficial_industria'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-slate-100 text-slate-600 border-slate-200'
                  }`}
                >
                  {selectedProductFicha?.tipo_mix === 'oficial_industria' ? 'Sim (Oficial)' : 'Não'}
                </Badge>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg">
                <span className="text-[10px] text-slate-400 block">Status SKU:</span>
                <Badge
                  variant={selectedProductFicha?.status === 'ativo' ? 'default' : 'secondary'}
                  className="mt-1 text-[10px] capitalize"
                >
                  {selectedProductFicha?.status}
                </Badge>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg">
                <span className="text-[10px] text-slate-400 block">Cód. TradePro:</span>
                <span className="font-mono font-bold text-slate-800 block mt-1">
                  {selectedProductFicha?.codigo_produto || '—'}
                </span>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg">
                <span className="text-[10px] text-slate-400 block">Shelf Life Padrão:</span>
                <span className="font-bold text-slate-800 block mt-1">
                  {selectedProductFicha?.shelf_life_dias || 60} dias
                </span>
              </div>
            </div>

            {/* Bloco 2: Inteligência e Cobertura (Lojas com Mix Definido vs Observadas) */}
            <div className="p-3.5 bg-indigo-50/60 rounded-xl border border-indigo-100 space-y-3">
              <span className="font-bold text-indigo-900 block text-xs flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-indigo-600" />
                Presença e Ocorrências Operacionais (Fundação da Inteligência de Mix)
              </span>

              {loadingProductStats ? (
                <p className="text-slate-400 text-center py-2">Carregando estatísticas...</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="p-2.5 bg-white rounded-lg border border-indigo-100">
                    <span className="text-[10px] text-slate-400 block">Lojas Mix Definido:</span>
                    <span className="text-base font-bold text-slate-900">
                      {productStats?.lojasComMixDefinido.length || 0}
                    </span>
                  </div>
                  <div className="p-2.5 bg-white rounded-lg border border-indigo-100">
                    <span className="text-[10px] text-slate-400 block">Lojas Observadas:</span>
                    <span className="text-base font-bold text-purple-700">
                      {productStats?.lojasObservadas.length || 0}
                    </span>
                  </div>
                  <div className="p-2.5 bg-white rounded-lg border border-indigo-100">
                    <span className="text-[10px] text-slate-400 block">Rupturas Relacionadas:</span>
                    <span className="text-base font-bold text-amber-700">
                      {productStats?.totalRupturasRelacionadas || 0}
                    </span>
                  </div>
                  <div className="p-2.5 bg-white rounded-lg border border-indigo-100">
                    <span className="text-[10px] text-slate-400 block">Validades Registradas:</span>
                    <span className="text-base font-bold text-blue-700">
                      {productStats?.totalValidadesRelacionadas || 0}
                    </span>
                  </div>
                </div>
              )}

              {productStats?.ultimaObservacao && (
                <p className="text-[11px] text-slate-600">
                  Última observação operacional: <strong>{productStats.ultimaObservacao}</strong>
                </p>
              )}
            </div>

            {/* Ações Rápidas de Mix */}
            {canEdit && selectedProductFicha && (
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-xs text-slate-700 font-medium">
                  Ações no Cadastro deste Produto:
                </span>
                <div className="space-x-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleToggleMixOficial(selectedProductFicha)}
                    className="text-xs h-7"
                  >
                    {selectedProductFicha.tipo_mix === 'oficial_industria'
                      ? 'Remover do Mix Oficial'
                      : 'Definir como Mix Oficial'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleToggleProductStatus(selectedProductFicha)}
                    className="text-xs h-7"
                  >
                    {selectedProductFicha.status === 'ativo' ? 'Desativar SKU' : 'Ativar SKU'}
                  </Button>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedProductFicha(null)}
              className="text-xs"
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* MODAL: FICHA DA LOJA (ADMINISTRATIVA / ESTRUTURAL) */}
      {/* ========================================================================= */}
      <Dialog
        open={Boolean(selectedLojaFicha)}
        onOpenChange={(open) => !open && setSelectedLojaFicha(null)}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Store className="w-5 h-5 text-cyan-600" />
              Ficha Administrativa da Loja {selectedLojaFicha?.codigo_externo}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {selectedLojaFicha?.razao_social || selectedLojaFicha?.nome}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <div className="p-3 bg-slate-50 rounded-lg">
                <span className="text-[10px] text-slate-400 block">Rede / Grupo:</span>
                <span className="font-semibold text-slate-900 block mt-0.5">
                  {selectedLojaFicha?.rede_nome || 'Sem Rede Vinculada'}
                </span>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg">
                <span className="text-[10px] text-slate-400 block">Localização:</span>
                <span className="font-semibold text-slate-900 block mt-0.5">
                  {selectedLojaFicha?.cidade} / {selectedLojaFicha?.estado}
                </span>
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-800">
                  Promotores com Roteiro nesta Loja:
                </span>
              </div>
              <div className="space-y-1">
                {assignments
                  .filter(
                    (a) =>
                      a.store_code === selectedLojaFicha?.codigo_externo && a.status === 'ativo',
                  )
                  .map((a) => (
                    <div
                      key={a.id}
                      className="p-1.5 bg-white rounded border border-slate-200 flex justify-between"
                    >
                      <span className="font-medium text-slate-800">{a.promoter_nome}</span>
                      <span className="text-slate-500">{a.industry_name || 'Geral'}</span>
                    </div>
                  ))}
                {assignments.filter(
                  (a) => a.store_code === selectedLojaFicha?.codigo_externo && a.status === 'ativo',
                ).length === 0 && (
                  <span className="text-slate-400 italic">
                    Nenhum promotor alocado nesta unidade.
                  </span>
                )}
              </div>
            </div>

            {canEdit && selectedLojaFicha && (
              <div className="pt-2 flex justify-between items-center border-t border-slate-100">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs h-7"
                  onClick={() => {
                    setMovingLoja(selectedLojaFicha)
                    setTargetNovaRedeId(selectedLojaFicha.network_id || '')
                  }}
                >
                  <Shuffle className="w-3.5 h-3.5 mr-1 text-amber-600" />
                  Mover para outra Rede
                </Button>

                <Button
                  size="sm"
                  className="text-xs h-7 bg-indigo-600 text-white"
                  onClick={() => handleOpenEdit('lojas', selectedLojaFicha)}
                >
                  Editar Dados Cadastrais
                </Button>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedLojaFicha(null)}
              className="text-xs"
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* MODAL: FICHA DO PROMOTOR */}
      {/* ========================================================================= */}
      <Dialog
        open={Boolean(selectedPromoterFicha)}
        onOpenChange={(open) => !open && setSelectedPromoterFicha(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Users className="w-5 h-5 text-violet-600" />
              Ficha do Promotor — {selectedPromoterFicha?.nome}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Cód. Colaborador TradePro: {selectedPromoterFicha?.codigo_externo || '—'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <div className="p-3 bg-slate-50 rounded-lg">
                <span className="text-[10px] text-slate-400 block">Supervisor Responsável:</span>
                <span className="font-semibold text-slate-900 block mt-0.5">
                  {selectedPromoterFicha?.supervisor_nome || 'Sem supervisor vinculado'}
                </span>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg">
                <span className="text-[10px] text-slate-400 block">Status Operacional:</span>
                <Badge
                  variant={selectedPromoterFicha?.status === 'ativo' ? 'default' : 'secondary'}
                  className="mt-1 text-[10px]"
                >
                  {selectedPromoterFicha?.status}
                </Badge>
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-lg space-y-1">
              <span className="text-[10px] text-slate-400 block">Indústrias Relacionadas:</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {selectedPromoterFicha?.industrias_relacionadas &&
                selectedPromoterFicha.industrias_relacionadas.length > 0 ? (
                  selectedPromoterFicha.industrias_relacionadas.map((ind, idx) => (
                    <Badge key={idx} variant="outline" className="text-[10px]">
                      {ind}
                    </Badge>
                  ))
                ) : (
                  <span className="text-slate-400 italic">Sem vínculos específicos</span>
                )}
              </div>
            </div>

            {canEdit && selectedPromoterFicha && (
              <div className="pt-2 flex justify-between items-center border-t border-slate-100">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs h-7 text-violet-700"
                  onClick={() => {
                    setSelectedPromoterFicha(null)
                    handleOpenPromoterHistory(selectedPromoterFicha)
                  }}
                >
                  <History className="w-3.5 h-3.5 mr-1" />
                  Ver Roteiro / Histórico Completo
                </Button>
                <Button
                  size="sm"
                  className="text-xs h-7 bg-violet-600 text-white"
                  onClick={() => handleOpenEdit('promotores', selectedPromoterFicha)}
                >
                  Editar Cadastro
                </Button>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedPromoterFicha(null)}
              className="text-xs"
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* MODAL: FICHA DO SUPERVISOR */}
      {/* ========================================================================= */}
      <Dialog
        open={Boolean(selectedSupervisorFicha)}
        onOpenChange={(open) => !open && setSelectedSupervisorFicha(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-teal-600" />
              Equipe do Supervisor — {selectedSupervisorFicha?.nome}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Cód. TradePro: {selectedSupervisorFicha?.codigo_externo || '—'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="p-3 bg-slate-50 rounded-lg space-y-2">
              <span className="font-semibold text-slate-800 block">
                Promotores Sob Coordenação (
                {promotores.filter((p) => p.supervisor_id === selectedSupervisorFicha?.id).length}):
              </span>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {promotores
                  .filter((p) => p.supervisor_id === selectedSupervisorFicha?.id)
                  .map((p) => (
                    <div
                      key={p.id}
                      className="p-2 bg-white rounded border border-slate-200 flex justify-between"
                    >
                      <span className="font-medium text-slate-800">{p.nome}</span>
                      <span className="text-slate-500 font-mono text-[11px]">
                        Cód. {p.codigo_externo || '—'} • {p.total_lojas || 0} lojas
                      </span>
                    </div>
                  ))}
              </div>
            </div>

            {canEdit && selectedSupervisorFicha && (
              <div className="pt-2 flex justify-end border-t border-slate-100">
                <Button
                  size="sm"
                  className="text-xs h-7 bg-teal-600 text-white"
                  onClick={() => handleOpenEdit('supervisores', selectedSupervisorFicha)}
                >
                  Editar Supervisor
                </Button>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedSupervisorFicha(null)}
              className="text-xs"
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* MODAL: MOVER LOJA DE REDE */}
      {/* ========================================================================= */}
      <Dialog open={Boolean(movingLoja)} onOpenChange={(open) => !open && setMovingLoja(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Shuffle className="w-5 h-5 text-amber-600" />
              Mover Loja para Outra Rede
            </DialogTitle>
            <DialogDescription className="text-xs">
              Transfere a loja selecionada para outra rede varejista com registro permanente na
              trilha de auditoria.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="p-2.5 bg-slate-50 rounded border border-slate-200">
              <span className="text-slate-400 block text-[11px]">Loja Selecionada:</span>
              <span className="font-bold text-slate-900 block text-sm">
                {movingLoja?.codigo_externo} - {movingLoja?.razao_social || movingLoja?.nome}
              </span>
              <span className="text-slate-500 text-[11px] block mt-0.5">
                Rede Atual: {movingLoja?.rede_nome || 'Sem Rede'}
              </span>
            </div>

            <div>
              <Label className="text-xs">Nova Rede de Destino:</Label>
              <Select value={targetNovaRedeId} onValueChange={setTargetNovaRedeId}>
                <SelectTrigger className="text-xs h-9 mt-1">
                  <SelectValue placeholder="Selecione a nova rede..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sem_rede">Sem Rede (Desvincular)</SelectItem>
                  {redes.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMovingLoja(null)}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleConfirmMoverLojaDeRede}
              className="text-xs bg-amber-600 hover:bg-amber-700 text-white"
            >
              Confirmar Transferência
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* MODAL CRUD: CRIAR / EDITAR */}
      {/* ========================================================================= */}
      <Dialog open={Boolean(modalType)} onOpenChange={(open) => !open && setModalType(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">
              {isEditing
                ? selectedItem
                  ? `Editar ${modalType?.slice(0, -1)}`
                  : `Novo ${modalType?.slice(0, -1)}`
                : `Ficha do ${modalType?.slice(0, -1)}`}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Configurações e dados cadastrais mestres mantidos diretamente no SKIP.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs max-h-[60vh] overflow-y-auto">
            {modalType === 'industrias' && (
              <>
                <div>
                  <Label className="text-xs">Nome Oficial *</Label>
                  <Input
                    disabled={!isEditing}
                    value={formData.nome || ''}
                    onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                    className="text-xs h-9 mt-1"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Cód. TradePro (Cliente)</Label>
                    <Input
                      disabled={!isEditing}
                      value={formData.tradepro_client_id || ''}
                      onChange={(e) =>
                        setFormData({ ...formData, tradepro_client_id: e.target.value })
                      }
                      className="text-xs h-9 mt-1"
                      placeholder="ex: 7"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">ID App Diretoria (Futuro)</Label>
                    <Input
                      disabled={!isEditing}
                      value={formData.app_diretoria_industry_id || ''}
                      onChange={(e) =>
                        setFormData({ ...formData, app_diretoria_industry_id: e.target.value })
                      }
                      className="text-xs h-9 mt-1"
                      placeholder="ex: DIR-IND-01"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">CNPJ</Label>
                    <Input
                      disabled={!isEditing}
                      value={formData.cnpj || ''}
                      onChange={(e) => setFormData({ ...formData, cnpj: e.target.value })}
                      className="text-xs h-9 mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Status</Label>
                    <Select
                      disabled={!isEditing}
                      value={formData.status || 'ativa'}
                      onValueChange={(val) => setFormData({ ...formData, status: val })}
                    >
                      <SelectTrigger className="text-xs h-9 mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ativa">Ativa</SelectItem>
                        <SelectItem value="inativa">Inativa</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Observações</Label>
                  <Input
                    disabled={!isEditing}
                    value={formData.observacoes || ''}
                    onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                    className="text-xs h-9 mt-1"
                  />
                </div>
              </>
            )}

            {modalType === 'produtos' && (
              <>
                <div>
                  <Label className="text-xs">Nome Oficial do Produto *</Label>
                  <Input
                    disabled={!isEditing}
                    value={formData.nome_produto || ''}
                    onChange={(e) => setFormData({ ...formData, nome_produto: e.target.value })}
                    className="text-xs h-9 mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Indústria / Marca *</Label>
                  <Select
                    disabled={!isEditing}
                    value={formData.industry_id || ''}
                    onValueChange={(val) => {
                      const ind = industrias.find((i) => i.id === val)
                      setFormData({ ...formData, industry_id: val, industry_name: ind?.nome || '' })
                    }}
                  >
                    <SelectTrigger className="text-xs h-9 mt-1">
                      <SelectValue placeholder="Selecione a indústria..." />
                    </SelectTrigger>
                    <SelectContent>
                      {industrias.map((i) => (
                        <SelectItem key={i.id} value={i.id}>
                          {i.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Cód. TradePro</Label>
                    <Input
                      disabled={!isEditing}
                      value={formData.codigo_produto || ''}
                      onChange={(e) => setFormData({ ...formData, codigo_produto: e.target.value })}
                      className="text-xs h-9 mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Cód. de Barras (EAN)</Label>
                    <Input
                      disabled={!isEditing}
                      value={formData.cod_barras || ''}
                      onChange={(e) => setFormData({ ...formData, cod_barras: e.target.value })}
                      className="text-xs h-9 mt-1"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Família / Categoria</Label>
                    <Input
                      disabled={!isEditing}
                      value={formData.familia || ''}
                      onChange={(e) => setFormData({ ...formData, familia: e.target.value })}
                      className="text-xs h-9 mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Gramatura / Volume</Label>
                    <Input
                      disabled={!isEditing}
                      value={formData.gramatura || ''}
                      onChange={(e) => setFormData({ ...formData, gramatura: e.target.value })}
                      className="text-xs h-9 mt-1"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Sabor / Variante</Label>
                    <Input
                      disabled={!isEditing}
                      value={formData.sabor || ''}
                      onChange={(e) => setFormData({ ...formData, sabor: e.target.value })}
                      className="text-xs h-9 mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Embalagem / Apresentação</Label>
                    <Input
                      disabled={!isEditing}
                      value={formData.embalagem || ''}
                      onChange={(e) => setFormData({ ...formData, embalagem: e.target.value })}
                      className="text-xs h-9 mt-1"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Está no Mix Oficial?</Label>
                    <Select
                      disabled={!isEditing}
                      value={formData.tipo_mix || 'oficial_industria'}
                      onValueChange={(val) => setFormData({ ...formData, tipo_mix: val })}
                    >
                      <SelectTrigger className="text-xs h-9 mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="oficial_industria">Sim (Mix Oficial)</SelectItem>
                        <SelectItem value="observado_operacional">
                          Não (Apenas Observado)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Status do Produto</Label>
                    <Select
                      disabled={!isEditing}
                      value={formData.status || 'ativo'}
                      onValueChange={(val) => setFormData({ ...formData, status: val })}
                    >
                      <SelectTrigger className="text-xs h-9 mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ativo">Ativo</SelectItem>
                        <SelectItem value="descontinuado">Descontinuado</SelectItem>
                        <SelectItem value="em_avaliacao">Em Avaliação</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </>
            )}

            {modalType === 'redes' && (
              <>
                <div>
                  <Label className="text-xs">Nome da Rede *</Label>
                  <Input
                    disabled={!isEditing}
                    value={formData.nome || ''}
                    onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                    className="text-xs h-9 mt-1"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Cód. Externo</Label>
                    <Input
                      disabled={!isEditing}
                      value={formData.codigo_externo || ''}
                      onChange={(e) => setFormData({ ...formData, codigo_externo: e.target.value })}
                      className="text-xs h-9 mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">CNPJ</Label>
                    <Input
                      disabled={!isEditing}
                      value={formData.cnpj || ''}
                      onChange={(e) => setFormData({ ...formData, cnpj: e.target.value })}
                      className="text-xs h-9 mt-1"
                    />
                  </div>
                </div>
              </>
            )}

            {modalType === 'lojas' && (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-1">
                    <Label className="text-xs">Código *</Label>
                    <Input
                      disabled={!isEditing}
                      value={formData.codigo_externo || ''}
                      onChange={(e) => setFormData({ ...formData, codigo_externo: e.target.value })}
                      className="text-xs h-9 mt-1"
                      placeholder="ex: 165"
                    />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">Razão Social / Nome *</Label>
                    <Input
                      disabled={!isEditing}
                      value={formData.razao_social || formData.nome || ''}
                      onChange={(e) => setFormData({ ...formData, razao_social: e.target.value })}
                      className="text-xs h-9 mt-1"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Rede</Label>
                  <Select
                    disabled={!isEditing}
                    value={formData.network_id || ''}
                    onValueChange={(val) => {
                      const net = redes.find((r) => r.id === val)
                      setFormData({ ...formData, network_id: val, rede_nome: net?.nome || '' })
                    }}
                  >
                    <SelectTrigger className="text-xs h-9 mt-1">
                      <SelectValue placeholder="Selecione a rede..." />
                    </SelectTrigger>
                    <SelectContent>
                      {redes.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Cidade</Label>
                    <Input
                      disabled={!isEditing}
                      value={formData.cidade || ''}
                      onChange={(e) => setFormData({ ...formData, cidade: e.target.value })}
                      className="text-xs h-9 mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Estado</Label>
                    <Input
                      disabled={!isEditing}
                      value={formData.estado || ''}
                      onChange={(e) => setFormData({ ...formData, estado: e.target.value })}
                      className="text-xs h-9 mt-1"
                    />
                  </div>
                </div>
              </>
            )}

            {modalType === 'promotores' && (
              <>
                <div>
                  <Label className="text-xs">Nome Completo *</Label>
                  <Input
                    disabled={!isEditing}
                    value={formData.nome || ''}
                    onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                    className="text-xs h-9 mt-1"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Cód. Colaborador TradePro</Label>
                    <Input
                      disabled={!isEditing}
                      value={formData.codigo_externo || ''}
                      onChange={(e) => setFormData({ ...formData, codigo_externo: e.target.value })}
                      className="text-xs h-9 mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Supervisor</Label>
                    <Select
                      disabled={!isEditing}
                      value={formData.supervisor_id || ''}
                      onValueChange={(val) => {
                        const sup = supervisores.find((s) => s.id === val)
                        setFormData({
                          ...formData,
                          supervisor_id: val,
                          supervisor_nome: sup?.nome || '',
                        })
                      }}
                    >
                      <SelectTrigger className="text-xs h-9 mt-1">
                        <SelectValue placeholder="Selecione o supervisor..." />
                      </SelectTrigger>
                      <SelectContent>
                        {supervisores.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </>
            )}

            {modalType === 'supervisores' && (
              <>
                <div>
                  <Label className="text-xs">Nome do Supervisor *</Label>
                  <Input
                    disabled={!isEditing}
                    value={formData.nome || ''}
                    onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                    className="text-xs h-9 mt-1"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Cód. Supervisor TradePro</Label>
                    <Input
                      disabled={!isEditing}
                      value={formData.codigo_externo || ''}
                      onChange={(e) => setFormData({ ...formData, codigo_externo: e.target.value })}
                      className="text-xs h-9 mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Telefone</Label>
                    <Input
                      disabled={!isEditing}
                      value={formData.telefone || ''}
                      onChange={(e) => setFormData({ ...formData, telefone: e.target.value })}
                      className="text-xs h-9 mt-1"
                    />
                  </div>
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setModalType(null)}
              className="text-xs"
            >
              Fechar
            </Button>
            {isEditing && (
              <Button
                size="sm"
                onClick={handleSaveForm}
                className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                Salvar Cadastro
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* MODAL: HISTÓRICO TEMPORAL DE PROMOTOR & ALOCAÇÕES DE LOJAS */}
      {/* ========================================================================= */}
      <Dialog
        open={Boolean(selectedPromoterHistory)}
        onOpenChange={(open) => !open && setSelectedPromoterHistory(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <History className="w-5 h-5 text-indigo-600" />
              Histórico Temporal &amp; Lojas do Promotor
            </DialogTitle>
            <DialogDescription className="text-xs">
              {selectedPromoterHistory?.nome} — Cód. Colaborador TradePro:{' '}
              {selectedPromoterHistory?.codigo_externo || '—'}
            </DialogDescription>
          </DialogHeader>

          <div className="py-2 space-y-4 text-xs">
            {canEdit && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                <span className="font-semibold text-slate-800 block text-xs">
                  Alocar Promotor a uma Loja
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <Select value={newAssignmentStoreCode} onValueChange={setNewAssignmentStoreCode}>
                    <SelectTrigger className="text-xs h-8">
                      <SelectValue placeholder="Selecione a loja..." />
                    </SelectTrigger>
                    <SelectContent>
                      {lojas.map((l) => (
                        <SelectItem key={l.id} value={l.codigo_externo}>
                          {l.codigo_externo} - {l.razao_social}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Input
                    placeholder="Indústria / Marca (opcional)"
                    value={newAssignmentIndName}
                    onChange={(e) => setNewAssignmentIndName(e.target.value)}
                    className="text-xs h-8"
                  />

                  <Button
                    size="sm"
                    onClick={handleAssignPromoter}
                    disabled={!newAssignmentStoreCode}
                    className="text-xs h-8 bg-indigo-600 hover:bg-indigo-700 text-white"
                  >
                    Confirmar Roteiro
                  </Button>
                </div>
              </div>
            )}

            <div>
              <span className="font-semibold text-slate-800 block mb-2">
                Histórico de Alocações (Roteiro Confirmado vs Observado)
              </span>
              {loadingAssignments ? (
                <div className="p-4 text-center text-slate-400">Carregando histórico...</div>
              ) : promoterAssignments.length === 0 ? (
                <div className="p-4 text-center text-slate-500 bg-slate-50 rounded">
                  Nenhuma alocação registrada para este promotor.
                </div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {promoterAssignments.map((a) => (
                    <div
                      key={a.id}
                      className="p-3 rounded-lg border border-slate-200 bg-white flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900">
                            {a.store_code} - {a.store_name}
                          </span>
                          <Badge
                            variant="outline"
                            className={
                              a.tipo_vinculo === 'confirmado'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-amber-50 text-amber-700 border-amber-200'
                            }
                          >
                            {a.tipo_vinculo === 'confirmado'
                              ? 'Confirmado no Roteiro'
                              : 'Observado em Visita'}
                          </Badge>
                          <Badge
                            variant={a.status === 'ativo' ? 'default' : 'secondary'}
                            className="text-[10px]"
                          >
                            {a.status}
                          </Badge>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1">
                          Vigência: {a.data_inicio || 'Início indeterminado'}{' '}
                          {a.data_fim ? `até ${a.data_fim}` : '(atual)'}
                          {a.industry_name ? ` • Indústria: ${a.industry_name}` : ''}
                        </div>
                        {a.observacao && (
                          <p className="text-[10px] text-slate-400 mt-0.5">{a.observacao}</p>
                        )}
                      </div>

                      {a.tipo_vinculo === 'observado_visita' && a.status === 'ativo' && canEdit && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleConfirmObserved(a.id)}
                          className="text-xs h-7 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                        >
                          <CheckCircle className="w-3 h-3 mr-1" /> Confirmar Roteiro
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedPromoterHistory(null)}
              className="text-xs"
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* MODAL: VINCULAR PENDÊNCIA ASSISTIDA */}
      {/* ========================================================================= */}
      <Dialog
        open={Boolean(resolvingPendencia)}
        onOpenChange={(open) => !open && setResolvingPendencia(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">
              Vincular {resolvingPendencia?.tipo_entidade} Pendente
            </DialogTitle>
            <DialogDescription className="text-xs">
              Selecione a entidade oficial correspondente para consolidar o vínculo estrutural no
              SKIP.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="p-2.5 rounded bg-slate-50 border border-slate-200">
              <span className="text-slate-400 block text-[11px]">Identificador Recebido:</span>
              <span className="font-bold text-slate-900 text-sm">
                {resolvingPendencia?.nome_identificado || resolvingPendencia?.valor_identificador}
              </span>
              {resolvingPendencia?.codigo_externo && (
                <span className="block text-slate-500 text-[11px] mt-0.5">
                  Código Externo: {resolvingPendencia.codigo_externo}
                </span>
              )}
            </div>

            <div>
              <Label className="text-xs">Vincular a:</Label>
              <Select value={targetEntityId} onValueChange={setTargetEntityId}>
                <SelectTrigger className="text-xs h-9 mt-1">
                  <SelectValue placeholder="Selecione a entidade..." />
                </SelectTrigger>
                <SelectContent>
                  {resolvingPendencia?.tipo_entidade === 'industria' &&
                    industrias.map((ind) => (
                      <SelectItem key={ind.id} value={ind.id}>
                        {ind.nome}{' '}
                        {ind.tradepro_client_id
                          ? `(já vinculada a cód. ${ind.tradepro_client_id})`
                          : ''}
                      </SelectItem>
                    ))}

                  {resolvingPendencia?.tipo_entidade === 'rede' &&
                    redes.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.nome}
                      </SelectItem>
                    ))}

                  {resolvingPendencia?.tipo_entidade === 'loja' &&
                    lojas.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.codigo_externo} - {l.razao_social}
                      </SelectItem>
                    ))}

                  {resolvingPendencia?.tipo_entidade === 'produto' &&
                    produtos.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nome_produto} ({p.industry_name})
                      </SelectItem>
                    ))}

                  {resolvingPendencia?.tipo_entidade === 'promotor' &&
                    promotores.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nome} {p.codigo_externo ? `(Cód. ${p.codigo_externo})` : ''}
                      </SelectItem>
                    ))}

                  {resolvingPendencia?.tipo_entidade === 'supervisor' &&
                    supervisores.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.nome} {s.codigo_externo ? `(Cód. ${s.codigo_externo})` : ''}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">Observação / Justificativa:</Label>
              <Input
                type="text"
                placeholder="Motivo da vinculação estrutural..."
                value={resolucaoObs}
                onChange={(e) => setResolucaoObs(e.target.value)}
                className="text-xs h-9 mt-1"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setResolvingPendencia(null)}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleResolvePendenciaSubmit}
              disabled={!targetEntityId}
              className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              Confirmar Vínculo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* MODAL: MIX EM 3 NÍVEIS DA LOJA */}
      {/* ========================================================================= */}
      <Dialog
        open={Boolean(selectedStoreForMix)}
        onOpenChange={(open) => !open && setSelectedStoreForMix(null)}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-600" />
              Mix em 3 Níveis — Loja {selectedStoreForMix?.codigo_externo}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {selectedStoreForMix?.razao_social} ({selectedStoreForMix?.rede_nome || 'Sem Rede'})
            </DialogDescription>
          </DialogHeader>

          <div className="py-2 space-y-4 text-xs">
            <div className="grid grid-cols-3 gap-2">
              <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-100">
                <span className="text-[11px] text-emerald-700 font-semibold block">
                  1. Mix Oficial Indústria
                </span>
                <span className="text-lg font-bold text-emerald-900">
                  {storeMixData?.oficialIndustria.length || 0} produtos
                </span>
                <p className="text-[10px] text-emerald-600 mt-1">Catálogo das marcas parceiras</p>
              </div>
              <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                <span className="text-[11px] text-blue-700 font-semibold block">
                  2. Mix Definido da Loja
                </span>
                <span className="text-lg font-bold text-blue-900">
                  {storeMixData?.definidoLoja.length || 0} produtos
                </span>
                <p className="text-[10px] text-blue-600 mt-1">Configurado para esta unidade</p>
              </div>
              <div className="p-3 bg-purple-50 rounded-lg border border-purple-100">
                <span className="text-[11px] text-purple-700 font-semibold block">
                  3. Mix Observado Real
                </span>
                <span className="text-lg font-bold text-purple-900">
                  {storeMixData?.observadoOperacional.length || 0} produtos
                </span>
                <p className="text-[10px] text-purple-600 mt-1">Evidências reais na loja</p>
              </div>
            </div>

            {/* Aprendizado do Mix Observado fora do Definido */}
            {storeMixData?.foraDoMixDefinido && storeMixData.foraDoMixDefinido.length > 0 && (
              <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-amber-900 text-xs flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 text-amber-600" />
                    Produtos Observados Fora do Mix Definido (
                    {storeMixData.foraDoMixDefinido.length})
                  </span>
                  <Badge
                    variant="outline"
                    className="text-[10px] bg-white text-amber-800 border-amber-300"
                  >
                    Decisão Humana Necessária
                  </Badge>
                </div>
                <p className="text-[11px] text-amber-800">
                  Estes itens foram detectados por pesquisas/rupturas/validades nesta loja, mas NÃO
                  pertencem ao Mix Definido. O SKIP nunca adiciona silenciosamente ao Mix Definido.
                </p>
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {storeMixData.foraDoMixDefinido.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-2 bg-white rounded border border-amber-200 flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-semibold text-slate-800">{item.produto}</span>
                        <span className="text-[10px] text-slate-500 block">
                          Detectado via: {item.evidencia}
                        </span>
                      </div>
                      <div className="space-x-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-[10px] h-6 px-2 text-indigo-700"
                        >
                          Adicionar ao Mix da Loja
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-[10px] h-6 px-2 text-slate-500"
                        >
                          Manter Observado
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Oportunidades de Expansão de Mix Contextuais */}
            {mixOpportunities.length > 0 && (
              <div className="space-y-2">
                <span className="font-semibold text-slate-800 block text-xs">
                  Oportunidades de Presença em Lojas Comparáveis da Mesma Rede
                </span>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {mixOpportunities.map((opp, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 bg-slate-50 rounded border border-slate-200 flex items-start justify-between"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900">{opp.produtoNome}</span>
                          <Badge variant="secondary" className="text-[9px]">
                            {opp.industriaNome}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-slate-600 mt-0.5">{opp.motivo}</p>
                      </div>
                      <Badge className="bg-emerald-600 text-white text-[10px] shrink-0">
                        Oportunidade de Mix
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedStoreForMix(null)}
              className="text-xs"
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default CadastrosPage
