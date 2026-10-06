import React, { useState, useMemo, useCallback, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import {
  Factory,
  Search,
  RotateCcw,
  AlertOctagon,
  AlertTriangle,
  ChevronRight,
  Plus,
  ExternalLink,
  Loader2,
  Link2,
  Check,
} from 'lucide-react'
import { useValidades } from '@/services/useValidades'
import { useRupturas } from '@/services/useRupturas'
import { useIndustryRegistriesList } from '@/services/useIndustryOperational'
import {
  saveIndustryRegistry,
  linkTradeProClient,
  getUnlinkedTradeProClients,
  type SaveIndustryInput,
} from '@/services/industryService'
import type { UnlinkedTradeProClient } from '@/types/industryOperational'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/services/authContext'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { formatStoreIdentityTable } from '@/lib/format/storeIdentity'
import { ContextPanel, type ContextPanelTarget } from '@/components/common/ContextPanel'

export interface IndustryAggregated {
  name: string
  totalValidades: number
  validadesCriticas: number // 0-15d
  validadesAtencao: number // 16-20d
  rupturasAtivas: number
  totalProdutos: number
  totalLojas: number
  lojasSet: Set<string>
  produtosSet: Set<string>
  situacao: 'Crítica' | 'Atenção' | 'Normal'
}

export const IndustriasPage: React.FC = () => {
  const [searchParams] = useSearchParams()
  const initialMarcaQuery = searchParams.get('marca') || ''

  const navigate = useNavigate()
  const { toast } = useToast()
  const { can, allowedIndustries } = useAuth()

  const canEditIndustry = can('industrias:editar_cadastro')

  const [search, setSearch] = useState(initialMarcaQuery)
  const [situacaoFilter, setSituacaoFilter] = useState<'Todas' | 'Crítica' | 'Atenção' | 'Normal'>(
    'Todas',
  )
  const [panelTarget, setPanelTarget] = useState<ContextPanelTarget | null>(null)

  // Clientes TradePro Não Vinculados
  const [unlinkedClients, setUnlinkedClients] = useState<UnlinkedTradeProClient[]>([])
  const [isLoadingUnlinked, setIsLoadingUnlinked] = useState(false)
  const [selectedUnlinkedToLink, setSelectedUnlinkedToLink] =
    useState<UnlinkedTradeProClient | null>(null)
  const [targetIndustryIdToLink, setTargetIndustryIdToLink] = useState('')
  const [linkJustificativa, setLinkJustificativa] = useState('')
  const [isLinkingTradePro, setIsLinkingTradePro] = useState(false)

  // Estado do modal de criação de nova indústria
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [createForm, setCreateForm] = useState<SaveIndustryInput>({
    nome: '',
    razao_social: '',
    cnpj: '',
    status: 'ativa',
    segmento: '',
    contato_nome: '',
    contato_email: '',
    contato_telefone: '',
    observacoes: '',
  })

  const {
    registries,
    isLoading: isLoadingRegistries,
    refetch: refetchRegistries,
  } = useIndustryRegistriesList()

  const {
    data: validades,
    isLoading: isLoadingValidades,
    refetch: refetchValidades,
  } = useValidades()

  const {
    filteredRupturas: rupturas,
    isLoading: isLoadingRupturas,
    refetch: refetchRupturas,
  } = useRupturas()

  const fetchUnlinked = useCallback(async () => {
    setIsLoadingUnlinked(true)
    try {
      const data = await getUnlinkedTradeProClients()
      setUnlinkedClients(data)
    } finally {
      setIsLoadingUnlinked(false)
    }
  }, [])

  useEffect(() => {
    fetchUnlinked()
  }, [fetchUnlinked])

  const isLoading = isLoadingValidades || isLoadingRupturas || isLoadingRegistries

  // Mapeamento de nome canônico para o ID da indústria no registry (se houver)
  const registryByNameKey = useMemo(() => {
    const map = new Map<string, string>()
    for (const reg of registries) {
      if (reg.nome_chave) {
        map.set(reg.nome_chave, reg.id)
      }
      if (reg.nome) {
        map.set(reg.nome.trim().toUpperCase(), reg.id)
      }
    }
    return map
  }, [registries])

  // Agregação real por Marca / Indústria diretamente dos registros canônicos
  const industrias = useMemo(() => {
    const map = new Map<
      string,
      {
        name: string
        totalValidades: number
        validadesCriticas: number
        validadesAtencao: number
        rupturasAtivas: number
        lojasSet: Set<string>
        produtosSet: Set<string>
      }
    >()

    const getOrCreate = (rawName: string) => {
      const name = rawName.trim().toUpperCase()
      let entry = map.get(name)
      if (!entry) {
        entry = {
          name,
          totalValidades: 0,
          validadesCriticas: 0,
          validadesAtencao: 0,
          rupturasAtivas: 0,
          lojasSet: new Set<string>(),
          produtosSet: new Set<string>(),
        }
        map.set(name, entry)
      }
      return entry
    }

    // Processa Validades
    for (const v of validades) {
      const brand = v.cliente || v.industria || 'Não informada'
      // Escopo de indústria
      if (allowedIndustries && allowedIndustries.length > 0) {
        const allowed = allowedIndustries.map((i) => i.trim().toUpperCase())
        if (!allowed.includes(brand.trim().toUpperCase())) {
          continue
        }
      }
      const entry = getOrCreate(brand)
      entry.totalValidades++
      if (v.diasRestantes <= 15) {
        entry.validadesCriticas++
      } else if (v.diasRestantes <= 20) {
        entry.validadesAtencao++
      }
      if (v.product && v.product.trim()) {
        entry.produtosSet.add(v.product.trim().toUpperCase())
      }
      const lojaLabel = formatStoreIdentityTable({
        codigoLoja: v.codigoLoja,
        nomeLoja: v.loja,
      })
      if (lojaLabel) entry.lojasSet.add(lojaLabel)
    }

    // Processa Rupturas
    for (const r of rupturas) {
      const brand = r.cliente || 'Não informada'
      // Escopo de indústria
      if (allowedIndustries && allowedIndustries.length > 0) {
        const allowed = allowedIndustries.map((i) => i.trim().toUpperCase())
        if (!allowed.includes(brand.trim().toUpperCase())) {
          continue
        }
      }
      const entry = getOrCreate(brand)
      entry.rupturasAtivas++
      if (r.produto && r.produto.trim()) {
        entry.produtosSet.add(r.produto.trim().toUpperCase())
      }
      const lojaLabel = formatStoreIdentityTable({
        codigoLoja: r.codigo_loja,
        nomeLoja: r.nome_loja,
      })
      if (lojaLabel) entry.lojasSet.add(lojaLabel)
    }

    const list: IndustryAggregated[] = []

    for (const entry of map.values()) {
      let situacao: 'Crítica' | 'Atenção' | 'Normal' = 'Normal'
      if (entry.validadesCriticas > 0) {
        situacao = 'Crítica'
      } else if (entry.validadesAtencao > 0 || entry.rupturasAtivas > 0) {
        situacao = 'Atenção'
      } else {
        situacao = 'Normal'
      }

      list.push({
        name: entry.name,
        totalValidades: entry.totalValidades,
        validadesCriticas: entry.validadesCriticas,
        validadesAtencao: entry.validadesAtencao,
        rupturasAtivas: entry.rupturasAtivas,
        totalProdutos: entry.produtosSet.size,
        totalLojas: entry.lojasSet.size,
        lojasSet: entry.lojasSet,
        produtosSet: entry.produtosSet,
        situacao,
      })
    }

    // Ordenação: Críticas primeiro, depois Atenção, depois por volume de casos desc
    list.sort((a, b) => {
      const pMap = { Crítica: 3, Atenção: 2, Normal: 1 }
      if (pMap[b.situacao] !== pMap[a.situacao]) {
        return pMap[b.situacao] - pMap[a.situacao]
      }
      const sumB = b.validadesCriticas + b.rupturasAtivas + b.validadesAtencao
      const sumA = a.validadesCriticas + a.rupturasAtivas + a.validadesAtencao
      if (sumB !== sumA) return sumB - sumA
      return a.name.localeCompare(b.name, 'pt-BR')
    })

    return list
  }, [validades, rupturas, allowedIndustries])

  // Filtragem
  const filteredIndustrias = useMemo(() => {
    return industrias.filter((ind) => {
      if (search.trim()) {
        const q = search.trim().toUpperCase()
        if (!ind.name.includes(q)) return false
      }
      if (situacaoFilter !== 'Todas') {
        if (ind.situacao !== situacaoFilter) return false
      }
      return true
    })
  }, [industrias, search, situacaoFilter])

  // KPIs da tela de indústrias
  const kpis = useMemo(() => {
    const total = industrias.length
    const criticas = industrias.filter((i) => i.situacao === 'Crítica').length
    const atencao = industrias.filter((i) => i.situacao === 'Atenção').length
    const normais = industrias.filter((i) => i.situacao === 'Normal').length
    return { total, criticas, atencao, normais }
  }, [industrias])

  const handleClear = useCallback(() => {
    setSearch('')
    setSituacaoFilter('Todas')
  }, [])

  // Criação de nova indústria
  const handleOpenCreateModal = () => {
    setCreateForm({
      nome: '',
      razao_social: '',
      cnpj: '',
      status: 'ativa',
      segmento: '',
      contato_nome: '',
      contato_email: '',
      contato_telefone: '',
      observacoes: '',
    })
    setIsCreateModalOpen(true)
  }

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!createForm.nome.trim()) {
      toast({
        title: 'Nome obrigatório',
        description: 'Informe o nome da indústria ou fornecedor.',
        variant: 'destructive',
      })
      return
    }

    setIsSubmitting(true)
    try {
      const created = await saveIndustryRegistry(createForm)
      toast({
        title: 'Indústria cadastrada com sucesso',
        description: `Indústria "${created.nome}" adicionada ao cadastro operacional.`,
      })
      setIsCreateModalOpen(false)
      await refetchRegistries()
      // Redireciona opcionalmente para os detalhes da indústria recém criada
      navigate(`/industrias/${created.id}`)
    } catch (err) {
      console.error('Erro ao cadastrar indústria:', err)
      toast({
        title: 'Erro ao cadastrar indústria',
        description: err instanceof Error ? err.message : 'Não foi possível salvar o cadastro.',
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
            <Factory className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                Gestão de Indústrias &amp; Fornecedores
              </h1>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
                {industrias.length} indústrias ativas
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Visão consolidada por marca/fornecedor a partir das ocorrências canônicas de validades
              e rupturas.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
          {canEditIndustry && (
            <Button
              size="sm"
              onClick={handleOpenCreateModal}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs gap-1.5 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Nova Indústria</span>
            </Button>
          )}
        </div>
      </div>

      {/* SEÇÃO: Clientes TradePro Pendentes de Vinculação */}
      {unlinkedClients.length > 0 && (
        <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-5 space-y-3.5 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
              <Link2 className="w-4 h-4 text-amber-700" />
              <span>
                Clientes TradePro Pendentes de Vínculo com Indústrias ({unlinkedClients.length})
              </span>
            </div>
            <span className="text-xs text-amber-700 font-medium">
              Nenhum dado é descartado nem inferido silenciosamente por nome.
            </span>
          </div>

          <p className="text-xs text-amber-800 leading-relaxed">
            Identificamos registros operacionais com Cód. Cliente TradePro sem correspondência com
            as indústrias cadastradas no SKIP. Vincule o código à indústria correta ou crie uma nova
            indústria com um clique.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
            {unlinkedClients.map((client) => (
              <div
                key={client.cod_cliente || client.cliente_nome}
                className="bg-white p-3.5 rounded-xl border border-amber-200/80 shadow-xs flex flex-col justify-between space-y-3"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-bold text-slate-900 text-xs block">
                        {client.cliente_nome}
                      </span>
                      <span className="text-[11px] font-mono text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100 font-bold inline-block mt-0.5">
                        Cód. TradePro: {client.cod_cliente || 'N/D'}
                      </span>
                    </div>
                    <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-[10px]">
                      {client.volume_registros} registro(s)
                    </Badge>
                  </div>

                  {client.amostra_produtos.length > 0 && (
                    <div className="mt-2 text-[11px] text-slate-500 line-clamp-1">
                      <span className="font-semibold text-slate-600">Produtos: </span>
                      {client.amostra_produtos.slice(0, 2).join(', ')}
                    </div>
                  )}
                  {client.amostra_lojas.length > 0 && (
                    <div className="text-[11px] text-slate-500 line-clamp-1">
                      <span className="font-semibold text-slate-600">Lojas: </span>
                      {client.amostra_lojas.slice(0, 2).join(', ')}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1.5 pt-1 border-t border-slate-100">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setSelectedUnlinkedToLink(client)
                      setTargetIndustryIdToLink('')
                      setLinkJustificativa(
                        `Vinculação de pendência TradePro cód. ${client.cod_cliente}`,
                      )
                    }}
                    className="text-[11px] h-7 px-2.5 flex-1 border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                  >
                    <Link2 className="w-3 h-3 mr-1" />
                    <span>Vincular Existente</span>
                  </Button>

                  <Button
                    size="sm"
                    onClick={() => {
                      setCreateForm({
                        nome: client.cliente_nome,
                        razao_social: '',
                        cnpj: '',
                        status: 'ativa',
                        segmento: '',
                        contato_nome: '',
                        contato_email: '',
                        contato_telefone: '',
                        observacoes: `Criada a partir de pendência do Cliente TradePro cód. ${client.cod_cliente}`,
                        tradepro_client_id: client.cod_cliente,
                        tradepro_client_name: client.cliente_nome,
                      })
                      setIsCreateModalOpen(true)
                    }}
                    className="text-[11px] h-7 px-2.5 flex-1 bg-amber-600 hover:bg-amber-700 text-white"
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    <span>Criar Indústria</span>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4 KPIs de Indústria */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total de Indústrias
            </span>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Factory className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2">{kpis.total}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Marcas monitoradas na Base Atual</p>
        </div>

        <div
          onClick={() => setSituacaoFilter((prev) => (prev === 'Crítica' ? 'Todas' : 'Crítica'))}
          className={`bg-white p-5 rounded-2xl border shadow-xs cursor-pointer transition-all ${
            situacaoFilter === 'Crítica'
              ? 'border-red-500 ring-2 ring-red-500/20'
              : 'border-slate-200/80 hover:border-red-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Indústrias Críticas
            </span>
            <div className="w-8 h-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center">
              <AlertOctagon className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-red-600 mt-2">{kpis.criticas}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Validades críticas (0–15d)</p>
        </div>

        <div
          onClick={() => setSituacaoFilter((prev) => (prev === 'Atenção' ? 'Todas' : 'Atenção'))}
          className={`bg-white p-5 rounded-2xl border shadow-xs cursor-pointer transition-all ${
            situacaoFilter === 'Atenção'
              ? 'border-amber-500 ring-2 ring-amber-500/20'
              : 'border-slate-200/80 hover:border-amber-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Em Atenção
            </span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-amber-700 mt-2">{kpis.atencao}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Validades 16–20d</p>
        </div>

        <div
          onClick={() => setSituacaoFilter((prev) => (prev === 'Normal' ? 'Todas' : 'Normal'))}
          className={`bg-white p-5 rounded-2xl border shadow-xs cursor-pointer transition-all ${
            situacaoFilter === 'Normal'
              ? 'border-emerald-500 ring-2 ring-emerald-500/20'
              : 'border-slate-200/80 hover:border-emerald-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Em Regularidade
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Factory className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-emerald-700 mt-2">{kpis.normais}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Sem risco iminente</p>
        </div>
      </div>

      {/* Barra de Filtros */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Buscar por nome da indústria ou fornecedor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-xs sm:text-sm bg-white"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={situacaoFilter}
            onChange={(e) => setSituacaoFilter(e.target.value as any)}
            className="h-9 px-3 text-xs bg-white border border-slate-300 rounded-lg text-slate-800 cursor-pointer"
          >
            <option value="Todas">Todas as situações</option>
            <option value="Crítica">Apenas Críticas</option>
            <option value="Atenção">Apenas Atenção</option>
            <option value="Normal">Apenas Regulares</option>
          </select>

          {(search || situacaoFilter !== 'Todas') && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleClear}
              className="h-9 px-2.5 gap-1 text-xs text-slate-600"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Limpar</span>
            </Button>
          )}
        </div>
      </div>

      {/* Tabela de Indústrias */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Fornecedores &amp; Marcas Consolidadas
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Clique em qualquer linha para abrir o painel lateral de contexto da indústria sem
              trocar de página.
            </p>
          </div>
          <span className="text-xs font-semibold text-slate-400">
            {filteredIndustrias.length} resultado(s)
          </span>
        </div>

        {isLoading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-11 bg-slate-50 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : filteredIndustrias.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
              <Factory className="w-5 h-5" />
            </div>
            <p className="text-sm font-semibold text-slate-800">
              Nenhuma indústria encontrada para os filtros aplicados
            </p>
            <p className="text-xs text-slate-500">
              Tente redefinir a busca ou remover o filtro de situação.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/70 border-b border-slate-200 text-slate-600 font-semibold select-none">
                  <th className="py-3 px-4 min-w-[200px]">Indústria / Marca</th>
                  <th className="py-3 px-4 text-center min-w-[120px]">Produtos</th>
                  <th className="py-3 px-4 text-center min-w-[120px]">Lojas Presentes</th>
                  <th className="py-3 px-4 text-center min-w-[130px]">
                    Validades Críticas (0–15d)
                  </th>
                  <th className="py-3 px-4 text-center min-w-[130px]">
                    Validades Atenção (16–20d)
                  </th>
                  <th className="py-3 px-4 text-center min-w-[120px]">Rupturas Ativas</th>
                  <th className="py-3 px-4 text-center min-w-[100px]">Situação</th>
                  <th className="py-3 px-4 text-right min-w-[80px]">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredIndustrias.map((ind) => {
                  const targetId = registryByNameKey.get(ind.name) || encodeURIComponent(ind.name)
                  return (
                    <tr
                      key={ind.name}
                      onClick={() =>
                        setPanelTarget({
                          type: 'industry',
                          id: ind.name,
                          label: ind.name,
                        })
                      }
                      className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                            <Factory className="w-3.5 h-3.5" />
                          </div>
                          <span
                            role="link"
                            tabIndex={0}
                            onClick={(e) => {
                              e.stopPropagation()
                              navigate(`/industrias/${targetId}`)
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.stopPropagation()
                                navigate(`/industrias/${targetId}`)
                              }
                            }}
                            className="font-semibold text-slate-900 hover:text-indigo-600 hover:underline transition-colors"
                            title={`Ver cadastro operacional de ${ind.name}`}
                          >
                            {ind.name}
                          </span>
                        </div>
                      </td>

                      <td className="py-3 px-4 text-center tabular-nums text-slate-700 font-medium">
                        {ind.totalProdutos}
                      </td>

                      <td className="py-3 px-4 text-center tabular-nums text-slate-700 font-medium">
                        {ind.totalLojas}
                      </td>

                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <Badge
                          variant="outline"
                          className={
                            ind.validadesCriticas > 0
                              ? 'bg-red-50 text-red-700 border-red-200 font-bold'
                              : 'bg-slate-50 text-slate-400 border-slate-200'
                          }
                        >
                          {ind.validadesCriticas}
                        </Badge>
                      </td>

                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <Badge
                          variant="outline"
                          className={
                            ind.validadesAtencao > 0
                              ? 'bg-amber-50 text-amber-700 border-amber-200 font-bold'
                              : 'bg-slate-50 text-slate-400 border-slate-200'
                          }
                        >
                          {ind.validadesAtencao}
                        </Badge>
                      </td>

                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <Badge
                          variant="outline"
                          className={
                            ind.rupturasAtivas > 0
                              ? 'bg-amber-50 text-amber-800 border-amber-200 font-bold'
                              : 'bg-slate-50 text-slate-400 border-slate-200'
                          }
                        >
                          {ind.rupturasAtivas}
                        </Badge>
                      </td>

                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <Badge
                          variant="outline"
                          className={
                            ind.situacao === 'Crítica'
                              ? 'bg-red-50 text-red-700 border-red-200 font-semibold'
                              : ind.situacao === 'Atenção'
                                ? 'bg-amber-50 text-amber-700 border-amber-200 font-semibold'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold'
                          }
                        >
                          {ind.situacao}
                        </Badge>
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              navigate(`/industrias/${targetId}`)
                            }}
                            title="Abrir página completa da indústria"
                            aria-label={`Ver detalhes de ${ind.name}`}
                            className="h-7 w-7 p-0 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </Button>
                          <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-all inline-block" />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Painel Lateral de Contexto */}
      <ContextPanel
        target={panelTarget}
        onClose={() => setPanelTarget(null)}
        validades={validades}
        rupturas={rupturas}
      />

      {/* Modal: Vincular Cliente TradePro a Indústria Existente */}
      <Dialog
        open={!!selectedUnlinkedToLink}
        onOpenChange={(open) => !open && setSelectedUnlinkedToLink(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-indigo-700">
              <Link2 className="w-4 h-4" />
              <span>Vincular Cliente TradePro a Indústria Existente</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              Selecione qual indústria cadastrada no SKIP corresponde ao Cliente TradePro{' '}
              <strong>{selectedUnlinkedToLink?.cliente_nome}</strong> (cód.{' '}
              <code>{selectedUnlinkedToLink?.cod_cliente}</code>).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 text-xs">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
              <div className="text-[11px] text-slate-500">Cliente TradePro Selecionado:</div>
              <div className="font-bold text-slate-800">{selectedUnlinkedToLink?.cliente_nome}</div>
              <div className="text-[11px] font-mono text-indigo-700 font-bold">
                Código: {selectedUnlinkedToLink?.cod_cliente} · Registros:{' '}
                {selectedUnlinkedToLink?.volume_registros}
              </div>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-700">
                Selecione a Indústria do SKIP *
              </label>
              <select
                value={targetIndustryIdToLink}
                onChange={(e) => setTargetIndustryIdToLink(e.target.value)}
                className="w-full h-8 px-2 bg-white border border-slate-300 rounded-md text-xs font-medium"
              >
                <option value="">-- Selecione uma indústria --</option>
                {registries.map((ind) => (
                  <option key={ind.id} value={ind.id}>
                    {ind.nome}{' '}
                    {ind.tradepro_client_id
                      ? `(já vinculada a cód. ${ind.tradepro_client_id})`
                      : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-700">Justificativa Operacional *</label>
              <textarea
                rows={2}
                value={linkJustificativa}
                onChange={(e) => setLinkJustificativa(e.target.value)}
                placeholder="Motivo da vinculação (será registrado na auditoria)..."
                className="w-full p-2 bg-white border border-slate-300 rounded-md text-xs"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSelectedUnlinkedToLink(null)}
                className="text-xs"
              >
                Cancelar
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!targetIndustryIdToLink || isLinkingTradePro}
                onClick={async () => {
                  if (!selectedUnlinkedToLink || !targetIndustryIdToLink) return
                  setIsLinkingTradePro(true)
                  try {
                    await linkTradeProClient({
                      industry_id: targetIndustryIdToLink,
                      tradepro_client_id: selectedUnlinkedToLink.cod_cliente,
                      tradepro_client_name: selectedUnlinkedToLink.cliente_nome,
                      justificativa: linkJustificativa,
                    })
                    toast({
                      title: 'Vínculo realizado com sucesso',
                      description: `Cliente cód. ${selectedUnlinkedToLink.cod_cliente} associado à indústria.`,
                    })
                    setSelectedUnlinkedToLink(null)
                    await refetchRegistries()
                    await fetchUnlinked()
                    await refetchValidades()
                  } catch (err: any) {
                    toast({
                      title: 'Erro ao vincular',
                      description: err?.message || 'Falha ao vincular.',
                      variant: 'destructive',
                    })
                  } finally {
                    setIsLinkingTradePro(false)
                  }
                }}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{isLinkingTradePro ? 'Salvando...' : 'Confirmar Vínculo'}</span>
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal: Nova Indústria */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova Indústria / Fornecedor</DialogTitle>
            <DialogDescription className="text-xs">
              Cadastre uma nova indústria no sistema operacional de trade marketing.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateSubmit} className="space-y-3.5 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Nome da Indústria / Marca *</label>
                <Input
                  required
                  placeholder="Ex: PIRACANJUBA"
                  value={createForm.nome}
                  onChange={(e) => setCreateForm({ ...createForm, nome: e.target.value })}
                  className="h-8 text-xs"
                  autoFocus
                />
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Status Operacional</label>
                <select
                  value={createForm.status}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, status: e.target.value as 'ativa' | 'inativa' })
                  }
                  className="w-full h-8 px-2 bg-white border border-slate-300 rounded-md text-xs font-medium text-slate-800"
                >
                  <option value="ativa">Ativa</option>
                  <option value="inativa">Inativa</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Razão Social</label>
                <Input
                  placeholder="Ex: Laticínios Bela Vista S.A."
                  value={createForm.razao_social}
                  onChange={(e) => setCreateForm({ ...createForm, razao_social: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">CNPJ</label>
                <Input
                  placeholder="00.000.000/0000-00"
                  value={createForm.cnpj}
                  onChange={(e) => setCreateForm({ ...createForm, cnpj: e.target.value })}
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Segmento</label>
                <Input
                  placeholder="Ex: Laticínios / Bebidas"
                  value={createForm.segmento}
                  onChange={(e) => setCreateForm({ ...createForm, segmento: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Nome do Contato</label>
                <Input
                  placeholder="Ex: Roberto Silva"
                  value={createForm.contato_nome}
                  onChange={(e) => setCreateForm({ ...createForm, contato_nome: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Telefone</label>
                <Input
                  placeholder="(00) 00000-0000"
                  value={createForm.contato_telefone}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, contato_telefone: e.target.value })
                  }
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-700">E-mail de Contato</label>
              <Input
                type="email"
                placeholder="contato@industria.com.br"
                value={createForm.contato_email}
                onChange={(e) => setCreateForm({ ...createForm, contato_email: e.target.value })}
                className="h-8 text-xs"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-700">Observações Operacionais</label>
              <textarea
                rows={2}
                placeholder="Informações contratuais, SLAs ou peculiaridades de abastecimento..."
                value={createForm.observacoes}
                onChange={(e) => setCreateForm({ ...createForm, observacoes: e.target.value })}
                className="w-full p-2 bg-white border border-slate-300 rounded-md text-xs placeholder:text-slate-400"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsCreateModalOpen(false)}
                disabled={isSubmitting}
                className="text-xs"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isSubmitting}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs gap-1.5"
              >
                {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{isSubmitting ? 'Salvando...' : 'Cadastrar Indústria'}</span>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default IndustriasPage
