import React from 'react'
import {
  Factory,
  Package,
  Store,
  Layers,
  UserCheck,
  Users,
  AlertCircle,
  Link2,
  ExternalLink,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  TrendingUp,
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
  CadastroPendencia,
  MixOpportunityAnalysis,
} from '@/types/cadastros'
import {
  getCadastrosIndustrias,
  saveCadastroIndustria,
  getCadastrosProdutos,
  saveCadastroProduto,
  getCadastrosRedes,
  saveCadastroRede,
  getCadastrosLojas,
  saveCadastroLoja,
  getCadastrosSupervisores,
  saveCadastroSupervisor,
  getCadastrosPromotores,
  saveCadastroPromotor,
  getCadastrosPendencias,
  resolveCadastroPendencia,
  reavaliarRupturasNaoIdentificadas,
  getMixOpportunityAnalyses,
} from '@/services/cadastrosService'

export const CadastrosPage: React.FC = () => {
  const { user, can } = useAuth()
  const { toast } = useToast()

  // Permissão de edição
  const canEdit = can('cadastros:editar') || can('rede:editar')

  // Seção ativa
  const [activeTab, setActiveTab] = React.useState<
    'industrias' | 'produtos' | 'redes' | 'lojas' | 'promotores' | 'supervisores' | 'pendencias'
  >('industrias')

  // Estados de dados
  const [loading, setLoading] = React.useState(true)
  const [searchTerm, setSearchTerm] = React.useState('')
  const [filterStatus, setFilterStatus] = React.useState<string>('todos')

  const [industrias, setIndustrias] = React.useState<CadastroIndustria[]>([])
  const [produtos, setProdutos] = React.useState<CadastroProduto[]>([])
  const [redes, setRedes] = React.useState<CadastroRede[]>([])
  const [lojas, setLojas] = React.useState<CadastroLoja[]>([])
  const [supervisores, setSupervisores] = React.useState<CadastroSupervisor[]>([])
  const [promotores, setPromotores] = React.useState<CadastroPromotor[]>([])
  const [pendencias, setPendencias] = React.useState<CadastroPendencia[]>([])

  // Modal de Detalhe / Edição
  const [modalType, setModalType] = React.useState<string | null>(null)
  const [selectedItem, setSelectedItem] = React.useState<any>(null)
  const [isEditing, setIsEditing] = React.useState(false)

  // Resolução de Pendência
  const [resolvingPendencia, setResolvingPendencia] = React.useState<CadastroPendencia | null>(null)
  const [targetEntityId, setTargetEntityId] = React.useState('')
  const [resolucaoObs, setResolucaoObs] = React.useState('')

  // Oportunidades de Mix
  const [selectedStoreForMix, setSelectedStoreForMix] = React.useState<CadastroLoja | null>(null)
  const [mixOpportunities, setMixOpportunities] = React.useState<MixOpportunityAnalysis[]>([])
  const [loadingMixOpp, setLoadingMixOpp] = React.useState(false)

  // Reavaliação de rupturas
  const [reavaliandoRupturas, setReavaliandoRupturas] = React.useState(false)

  // Carrega todos os cadastros
  const loadAll = React.useCallback(async () => {
    setLoading(true)
    try {
      const [indList, prodList, netList, storeList, supList, promList, pendList] =
        await Promise.all([
          getCadastrosIndustrias(),
          getCadastrosProdutos(),
          getCadastrosRedes(),
          getCadastrosLojas(),
          getCadastrosSupervisores(),
          getCadastrosPromotores(),
          getCadastrosPendencias(),
        ])
      setIndustrias(indList)
      setProdutos(prodList)
      setRedes(netList)
      setLojas(storeList)
      setSupervisores(supList)
      setPromotores(promList)
      setPendencias(pendList)
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

  // Limpa busca ao trocar de aba
  React.useEffect(() => {
    setSearchTerm('')
    setFilterStatus('todos')
  }, [activeTab])

  // Executa Reavaliação de Rupturas
  const handleReavaliarRupturas = async () => {
    setReavaliandoRupturas(true)
    try {
      const res = await reavaliarRupturasNaoIdentificadas(user?.name || 'Operador')
      toast({
        title: 'Reavaliação de Rupturas Concluída',
        description: `${res.recuperadas} de ${res.processadas} rupturas identificadas com sucesso a partir do Cadastro Mestre.`,
      })
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

  // Abre análise de Mix da Loja
  const handleOpenStoreMix = async (loja: CadastroLoja) => {
    setSelectedStoreForMix(loja)
    setLoadingMixOpp(true)
    try {
      const opps = await getMixOpportunityAnalyses(loja.codigo_externo || loja.codigo_loja || '')
      setMixOpportunities(opps)
    } catch (err) {
      setMixOpportunities([])
    } finally {
      setLoadingMixOpp(false)
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
        // Atualiza tradepro_client_id na indústria
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

  // Filtros em memória
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

  const filteredProdutos = React.useMemo(() => {
    return produtos.filter((p) => {
      const matchSearch =
        p.nome_produto.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.industry_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.codigo_produto && p.codigo_produto.includes(searchTerm)) ||
        (p.cod_barras && p.cod_barras.includes(searchTerm)) ||
        (p.aliases && p.aliases.some((a) => a.toLowerCase().includes(searchTerm.toLowerCase())))
      const matchStatus =
        filterStatus === 'todos' || p.status === filterStatus || p.tipo_mix === filterStatus
      return matchSearch && matchStatus
    })
  }, [produtos, searchTerm, filterStatus])

  const filteredRedes = React.useMemo(() => {
    return redes.filter((r) => {
      const matchSearch = r.nome.toLowerCase().includes(searchTerm.toLowerCase())
      const matchStatus =
        filterStatus === 'todos' || (filterStatus === 'ativo' ? r.ativo : !r.ativo)
      return matchSearch && matchStatus
    })
  }, [redes, searchTerm, filterStatus])

  const filteredLojas = React.useMemo(() => {
    return lojas.filter((l) => {
      const matchSearch =
        l.razao_social.toLowerCase().includes(searchTerm.toLowerCase()) ||
        l.codigo_externo.includes(searchTerm) ||
        (l.rede_nome && l.rede_nome.toLowerCase().includes(searchTerm.toLowerCase())) ||
        l.cidade.toLowerCase().includes(searchTerm.toLowerCase())
      const matchStatus =
        filterStatus === 'todos' || (filterStatus === 'ativo' ? l.ativo : !l.ativo)
      return matchSearch && matchStatus
    })
  }, [lojas, searchTerm, filterStatus])

  const filteredSupervisores = React.useMemo(() => {
    return supervisores.filter((s) => {
      const matchSearch =
        s.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.codigo_externo && s.codigo_externo.includes(searchTerm))
      const matchStatus = filterStatus === 'todos' || s.status === filterStatus
      return matchSearch && matchStatus
    })
  }, [supervisores, searchTerm, filterStatus])

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
      {/* Cabeçalho de Contexto Estrutural */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Cadastros Mestres</h1>
            <Badge
              variant="secondary"
              className="font-semibold text-xs bg-indigo-50 text-indigo-700 border border-indigo-200"
            >
              Fonte de Verdade Estrutural
            </Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            "Cadastro responde: Quem existe e como essas entidades se relacionam? Sem inferências
            silenciosas ou suposições."
          </p>
        </div>

        <div className="flex items-center gap-2.5">
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
              onClick={() => setActiveTab('pendencias')}
              className="text-xs gap-1.5 h-9 bg-amber-600 hover:bg-amber-700 text-white"
            >
              <AlertCircle className="w-4 h-4" />
              <span>Pendências ({pendencias.length})</span>
            </Button>
          )}
        </div>
      </div>

      {/* Navegação entre as 6 Entidades Conectadas + Fila de Pendências */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as any)}
        className="w-full space-y-6"
      >
        <TabsList className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 h-auto p-1 bg-slate-100 rounded-xl gap-1">
          <TabsTrigger
            value="industrias"
            className="flex items-center gap-2 py-2.5 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:shadow-sm"
          >
            <Factory className="w-4 h-4 text-indigo-600" />
            <span>Indústrias ({industrias.length})</span>
          </TabsTrigger>

          <TabsTrigger
            value="produtos"
            className="flex items-center gap-2 py-2.5 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:shadow-sm"
          >
            <Package className="w-4 h-4 text-emerald-600" />
            <span>Produtos ({produtos.length})</span>
          </TabsTrigger>

          <TabsTrigger
            value="redes"
            className="flex items-center gap-2 py-2.5 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:shadow-sm"
          >
            <Layers className="w-4 h-4 text-blue-600" />
            <span>Redes ({redes.length})</span>
          </TabsTrigger>

          <TabsTrigger
            value="lojas"
            className="flex items-center gap-2 py-2.5 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:shadow-sm"
          >
            <Store className="w-4 h-4 text-cyan-600" />
            <span>Lojas ({lojas.length})</span>
          </TabsTrigger>

          <TabsTrigger
            value="promotores"
            className="flex items-center gap-2 py-2.5 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:shadow-sm"
          >
            <Users className="w-4 h-4 text-violet-600" />
            <span>Promotores ({promotores.length})</span>
          </TabsTrigger>

          <TabsTrigger
            value="supervisores"
            className="flex items-center gap-2 py-2.5 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:shadow-sm"
          >
            <UserCheck className="w-4 h-4 text-teal-600" />
            <span>Supervisores ({supervisores.length})</span>
          </TabsTrigger>

          <TabsTrigger
            value="pendencias"
            className="flex items-center gap-2 py-2.5 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:shadow-sm"
          >
            <AlertCircle className="w-4 h-4 text-amber-600" />
            <span>Pendências ({pendencias.length})</span>
          </TabsTrigger>
        </TabsList>

        {/* Barra de Filtros e Busca Rápida */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              type="text"
              placeholder={`Buscar em ${activeTab}...`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 text-xs h-9"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-full sm:w-44 text-xs h-9">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Status</SelectItem>
                <SelectItem value="ativo">Ativo / Confirmado</SelectItem>
                <SelectItem value="inativo">Inativo / Descontinuado</SelectItem>
                {activeTab === 'produtos' && (
                  <SelectItem value="oficial_industria">Mix Oficial</SelectItem>
                )}
                {activeTab === 'produtos' && (
                  <SelectItem value="observado_operacional">Mix Observado</SelectItem>
                )}
              </SelectContent>
            </Select>

            {canEdit && activeTab !== 'pendencias' && (
              <Button
                size="sm"
                className="text-xs h-9 gap-1.5 shrink-0 bg-indigo-600 hover:bg-indigo-700"
                onClick={() => {
                  setSelectedItem(null)
                  setIsEditing(true)
                  setModalType(activeTab)
                }}
              >
                <Plus className="w-4 h-4" />
                <span>Novo {activeTab.slice(0, -1)}</span>
              </Button>
            )}
          </div>
        </div>

        {/* ------------------------------------------------------------- */}
        {/* ABA 1: INDÚSTRIAS */}
        {/* ------------------------------------------------------------- */}
        <TabsContent value="industrias" className="space-y-4 m-0">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredIndustrias.map((ind) => {
              const prodsCount = produtos.filter((p) => p.industry_id === ind.id).length
              return (
                <Card key={ind.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="p-4 pb-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base font-bold text-slate-900">
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
                        <span className="block text-[11px] text-slate-400">Produtos no Mix:</span>
                        <span className="font-semibold text-slate-800">{prodsCount} produtos</span>
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
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs h-7 px-2 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                        onClick={() => {
                          setSelectedItem(ind)
                          setIsEditing(false)
                          setModalType('industrias')
                        }}
                      >
                        Ver Detalhes Estruturais
                      </Button>

                      <a
                        href={`/industrias/${ind.id}`}
                        className="text-xs text-slate-500 hover:text-indigo-600 flex items-center gap-1"
                      >
                        Cockpit Operacional <ArrowRight className="w-3 h-3" />
                      </a>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </TabsContent>

        {/* ------------------------------------------------------------- */}
        {/* ABA 2: PRODUTOS */}
        {/* ------------------------------------------------------------- */}
        <TabsContent value="produtos" className="space-y-4 m-0">
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="p-3">Código TradePro</th>
                    <th className="p-3">Produto Oficial</th>
                    <th className="p-3">Indústria / Marca</th>
                    <th className="p-3">Categoria / Família</th>
                    <th className="p-3">Nível do Mix</th>
                    <th className="p-3">Aliases Confirmados</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredProdutos.map((prod) => (
                    <tr key={prod.id} className="hover:bg-slate-50/80">
                      <td className="p-3 font-mono font-medium text-slate-700">
                        {prod.codigo_produto || '—'}
                      </td>
                      <td className="p-3 font-semibold text-slate-900">
                        {prod.nome_produto}
                        {prod.gramatura && (
                          <span className="text-slate-400 font-normal ml-1">
                            ({prod.gramatura})
                          </span>
                        )}
                      </td>
                      <td className="p-3 font-medium text-indigo-600">{prod.industry_name}</td>
                      <td className="p-3 text-slate-600">
                        {prod.categoria || 'Geral'} {prod.familia ? `• ${prod.familia}` : ''}
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
                          {prod.tipo_mix === 'oficial_industria' ? 'Mix Oficial' : 'Mix Observado'}
                        </Badge>
                      </td>
                      <td className="p-3">
                        {prod.aliases && prod.aliases.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {prod.aliases.slice(0, 2).map((a, idx) => (
                              <Badge
                                key={idx}
                                variant="secondary"
                                className="text-[10px] bg-slate-100"
                              >
                                {a}
                              </Badge>
                            ))}
                            {prod.aliases.length > 2 && (
                              <span className="text-[10px] text-slate-400">
                                +{prod.aliases.length - 2}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Nenhum alias</span>
                        )}
                      </td>
                      <td className="p-3">
                        <Badge
                          variant={prod.status === 'ativo' ? 'default' : 'secondary'}
                          className="text-[10px] capitalize"
                        >
                          {prod.status}
                        </Badge>
                      </td>
                      <td className="p-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs h-7 px-2"
                          onClick={() => {
                            setSelectedItem(prod)
                            setIsEditing(false)
                            setModalType('produtos')
                          }}
                        >
                          Ficha
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* ------------------------------------------------------------- */}
        {/* ABA 3: REDES */}
        {/* ------------------------------------------------------------- */}
        <TabsContent value="redes" className="space-y-4 m-0">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredRedes.map((rede) => (
              <Card key={rede.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base font-bold text-slate-900">
                        {rede.nome}
                      </CardTitle>
                      <CardDescription className="text-xs text-slate-500">
                        Grupo Varejista (Fantasia TradePro)
                      </CardDescription>
                    </div>
                    <Badge variant={rede.ativo ? 'default' : 'secondary'} className="text-[10px]">
                      {rede.ativo ? 'Ativa' : 'Inativa'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-4 pt-2 space-y-3 text-xs">
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50">
                    <span className="text-slate-600">Lojas Vinculadas:</span>
                    <span className="font-bold text-indigo-600 text-sm">
                      {rede.total_lojas || 0} lojas
                    </span>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs h-7 px-2 text-indigo-600"
                      onClick={() => {
                        setSelectedItem(rede)
                        setIsEditing(false)
                        setModalType('redes')
                      }}
                    >
                      Ver Lojas da Rede
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ------------------------------------------------------------- */}
        {/* ABA 4: LOJAS */}
        {/* ------------------------------------------------------------- */}
        <TabsContent value="lojas" className="space-y-4 m-0">
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="p-3">Código</th>
                    <th className="p-3">Razão Social (Loja)</th>
                    <th className="p-3">Rede (Fantasia)</th>
                    <th className="p-3">Cidade / UF</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Ações Estruturais</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredLojas.map((loja) => (
                    <tr key={loja.id} className="hover:bg-slate-50/80">
                      <td className="p-3 font-mono font-bold text-slate-700">
                        {loja.codigo_externo || loja.codigo_loja}
                      </td>
                      <td className="p-3 font-semibold text-slate-900">
                        {loja.razao_social || loja.nome}
                      </td>
                      <td className="p-3 font-medium text-blue-600">{loja.rede_nome || '—'}</td>
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
                      <td className="p-3 text-right space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs h-7 px-2"
                          onClick={() => handleOpenStoreMix(loja)}
                        >
                          <TrendingUp className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                          Mix &amp; Presença
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs h-7 px-2"
                          onClick={() => {
                            setSelectedItem(loja)
                            setIsEditing(false)
                            setModalType('lojas')
                          }}
                        >
                          Ficha
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* ------------------------------------------------------------- */}
        {/* ABA 5: PROMOTORES */}
        {/* ------------------------------------------------------------- */}
        <TabsContent value="promotores" className="space-y-4 m-0">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredPromotores.map((prom) => (
              <Card key={prom.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base font-bold text-slate-900">
                        {prom.nome}
                      </CardTitle>
                      <CardDescription className="text-xs text-slate-500">
                        Cód. Colaborador TradePro: {prom.codigo_externo || '—'}
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
                      <span className="text-slate-500">Supervisor Responsável:</span>
                      <span className="font-semibold text-slate-800">
                        {prom.supervisor_nome || 'Não vinculado'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Lojas Atendidas:</span>
                      <span className="font-semibold text-indigo-600">
                        {prom.total_lojas || 0} lojas
                      </span>
                    </div>
                  </div>

                  {prom.industrias_relacionadas && prom.industrias_relacionadas.length > 0 && (
                    <div>
                      <span className="text-[11px] text-slate-400 block mb-1">
                        Indústrias com que trabalha:
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {prom.industrias_relacionadas.map((ind, i) => (
                          <Badge key={i} variant="outline" className="text-[10px] bg-slate-50">
                            {ind}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs h-7 px-2 text-indigo-600"
                      onClick={() => {
                        setSelectedItem(prom)
                        setIsEditing(false)
                        setModalType('promotores')
                      }}
                    >
                      Ficha do Promotor
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ------------------------------------------------------------- */}
        {/* ABA 6: SUPERVISORES */}
        {/* ------------------------------------------------------------- */}
        <TabsContent value="supervisores" className="space-y-4 m-0">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredSupervisores.map((sup) => (
              <Card key={sup.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base font-bold text-slate-900">
                        {sup.nome}
                      </CardTitle>
                      <CardDescription className="text-xs text-slate-500">
                        Cód. Supervisor TradePro: {sup.codigo_externo || '—'}
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
                    <span className="font-bold text-teal-600 text-sm">
                      {sup.total_promotores || 0} promotores
                    </span>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs h-7 px-2 text-indigo-600"
                      onClick={() => {
                        setSelectedItem(sup)
                        setIsEditing(false)
                        setModalType('supervisores')
                      }}
                    >
                      Ver Equipe
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ------------------------------------------------------------- */}
        {/* ABA 7: PENDÊNCIAS DE CADASTRO */}
        {/* ------------------------------------------------------------- */}
        <TabsContent value="pendencias" className="space-y-4 m-0">
          <Card className="border-amber-200 bg-amber-50/40">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-base font-bold text-amber-900 flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-amber-600" />
                Fila de Entidades Não Reconhecidas ({filteredPendencias.length})
              </CardTitle>
              <CardDescription className="text-xs text-amber-800">
                Entidades observadas nas sincronizações que não possuem cadastro seguro. A
                sincronização não é interrompida, e a associação é feita com validação humana sem
                adivinhações.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-2">
              <div className="bg-white rounded-lg border border-amber-200 overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-amber-50/70 text-amber-900 font-semibold border-b border-amber-200">
                    <tr>
                      <th className="p-3">Tipo</th>
                      <th className="p-3">Valor / Identificador</th>
                      <th className="p-3">Origem</th>
                      <th className="p-3">Ocorrências</th>
                      <th className="p-3 text-right">Ação Assistida</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-amber-100">
                    {filteredPendencias.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-6 text-center text-slate-500">
                          Nenhuma pendência aberta no momento. Todos os vínculos estão seguros.
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
        </TabsContent>
      </Tabs>

      {/* Modal: Vincular Pendência Assistida */}
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

      {/* Modal: Oportunidades Operacionais de Mix da Loja */}
      <Dialog
        open={Boolean(selectedStoreForMix)}
        onOpenChange={(open) => !open && setSelectedStoreForMix(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-600" />
              Leituras Operacionais de Mix — Loja {selectedStoreForMix?.codigo_externo}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {selectedStoreForMix?.razao_social} ({selectedStoreForMix?.rede_nome || 'Sem Rede'})
            </DialogDescription>
          </DialogHeader>

          <div className="py-2 space-y-3 text-xs">
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 text-[11px] leading-relaxed">
              <span className="font-semibold text-slate-800 block mb-0.5">
                Critério de Presença Operacional (Não de Vendas):
              </span>
              Compara produtos observados recentemente em lojas comparáveis da{' '}
              <strong>mesma rede ({selectedStoreForMix?.rede_nome})</strong>. Nunca afirma
              faturamento ou volume de venda sem dados comerciais.
            </div>

            {loadingMixOpp ? (
              <div className="p-6 text-center text-slate-400">
                Calculando leituras comparáveis...
              </div>
            ) : mixOpportunities.length === 0 ? (
              <div className="p-6 text-center text-slate-500">
                Nenhuma discrepância crítica de presença detectada entre esta unidade e suas lojas
                irmãs da rede.
              </div>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {mixOpportunities.map((opp, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-lg border border-emerald-100 bg-emerald-50/50 flex items-start justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900">{opp.produtoNome}</span>
                        <Badge variant="outline" className="text-[10px] bg-white text-indigo-700">
                          {opp.industriaNome}
                        </Badge>
                      </div>
                      <p className="text-slate-600 mt-1 text-[11px]">{opp.motivo}</p>
                    </div>

                    <Badge className="bg-emerald-600 text-white text-[10px] shrink-0">
                      Possível Oportunidade de Mix
                    </Badge>
                  </div>
                ))}
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
