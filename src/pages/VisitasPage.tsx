import React from 'react'
import {
  Clock,
  Calendar,
  Store,
  UserCheck,
  Search,
  CheckCircle2,
  AlertCircle,
  Info,
  CalendarCheck,
  Building2,
  ExternalLink,
  ChevronRight,
  User,
  ShieldCheck,
  AlertTriangle,
  History,
  Activity,
  FileSearch,
  PackageOpen,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  useOperacionalVisitas,
  type VisitaPorPromotorResumo,
  type VisitaPorLojaResumo,
} from '@/hooks/useOperacionalVisitas'
import { useLojas } from '@/services/useLojas'
import { navigateToStore } from '@/lib/format/storeIdentity'
import type { OperacionalVisita } from '@/types/cadastros'

export const VisitasPage: React.FC = () => {
  const navigate = useNavigate()

  // Data atual no formato YYYY-MM-DD para inicializar ou referenciar
  const hojeStr = React.useMemo(() => {
    const d = new Date()
    return d.toISOString().split('T')[0]
  }, [])

  // Hook unificado de visitas operacionais
  const {
    visitas,
    promotores,
    lojas,
    isLoading,
    isFonteSincronizada,
    totalVisitas,
    promotoresComRegistroCount,
    lojasAtendidasCount,
    promotoresResumo,
    lojasResumo,
    refetch,
  } = useOperacionalVisitas()

  // Integração com a camada de lojas para visão contextual
  const { stores: lojasCadastradas, getStoreById } = useLojas()

  // Perspectiva ativa: "hoje" | "promotores" | "lojas" | "historico"
  const [activeTab, setActiveTab] = React.useState<string>('hoje')

  // Filtros gerais
  const [searchTerm, setSearchTerm] = React.useState('')
  const [selectedPromoter, setSelectedPromoter] = React.useState<string>('todos')
  const [selectedDate, setSelectedDate] = React.useState<string>('')

  // Paginação da aba Histórico
  const [page, setPage] = React.useState(1)
  const pageSize = 20

  // Modal de Detalhe de Visita
  const [selectedVisita, setSelectedVisita] = React.useState<OperacionalVisita | null>(null)

  // Modal de Contexto de Loja (Visão Rápida)
  const [selectedLojaResumo, setSelectedLojaResumo] = React.useState<VisitaPorLojaResumo | null>(
    null,
  )

  // Visitas filtradas
  const filteredVisitas = React.useMemo(() => {
    return visitas.filter((v) => {
      const matchSearch =
        v.promoter_nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
        v.store_code.includes(searchTerm) ||
        (v.store_name && v.store_name.toLowerCase().includes(searchTerm.toLowerCase()))
      const matchProm = selectedPromoter === 'todos' || v.promoter_id === selectedPromoter
      const matchDate = !selectedDate || v.data === selectedDate
      return matchSearch && matchProm && matchDate
    })
  }, [visitas, searchTerm, selectedPromoter, selectedDate])

  // Visitas paginadas para a aba Histórico
  const paginatedVisitas = React.useMemo(() => {
    const start = (page - 1) * pageSize
    return filteredVisitas.slice(start, start + pageSize)
  }, [filteredVisitas, page, pageSize])

  const totalPages = Math.ceil(filteredVisitas.length / pageSize) || 1

  // Filtra promotores na visão POR PROMOTOR
  const filteredPromotoresResumo = React.useMemo(() => {
    return promotoresResumo.filter((p) => {
      const matchSearch =
        p.promoterNome.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.promoterCod.includes(searchTerm) ||
        p.supervisorNome.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.lojaAtualOuUltima?.storeName &&
          p.lojaAtualOuUltima.storeName.toLowerCase().includes(searchTerm.toLowerCase()))
      const matchProm = selectedPromoter === 'todos' || p.promoterId === selectedPromoter
      return matchSearch && matchProm
    })
  }, [promotoresResumo, searchTerm, selectedPromoter])

  // Filtra lojas na visão POR LOJA
  const filteredLojasResumo = React.useMemo(() => {
    return lojasResumo.filter((l) => {
      const matchSearch =
        l.storeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        l.storeCode.includes(searchTerm) ||
        l.promotoresComRegistro.some((p) =>
          p.promoterNome.toLowerCase().includes(searchTerm.toLowerCase()),
        )
      return matchSearch
    })
  }, [lojasResumo, searchTerm])

  // Visitas registradas hoje para a visão "Hoje"
  const visitasHoje = React.useMemo(() => {
    // Se o usuário selecionou uma data específica no filtro, usa ela; senão usa hoje
    const targetDate = selectedDate || hojeStr
    const diretas = visitas.filter((v) => v.data === targetDate)
    // Se hoje não houver registros, busca a data mais recente com registros para não deixar tela morta
    if (diretas.length > 0 || selectedDate) {
      return diretas
    }
    if (visitas.length > 0) {
      const datasDisponiveis = Array.from(new Set(visitas.map((v) => v.data)))
        .sort()
        .reverse()
      const dataMaisRecente = datasDisponiveis[0]
      return visitas.filter((v) => v.data === dataMaisRecente)
    }
    return []
  }, [visitas, selectedDate, hojeStr])

  const dataReferenciaHoje = React.useMemo(() => {
    if (selectedDate) return selectedDate
    if (visitasHoje.length > 0) return visitasHoje[0].data
    return hojeStr
  }, [selectedDate, visitasHoje, hojeStr])

  // Contexto da Loja Selecionada a partir de useLojas
  const lojaContextoDetalhe = React.useMemo(() => {
    if (!selectedLojaResumo) return null
    const found = lojasCadastradas.find(
      (s) =>
        s.storeCode === selectedLojaResumo.storeCode ||
        (selectedLojaResumo.storeId && s.storeId === selectedLojaResumo.storeId),
    )
    return found || null
  }, [selectedLojaResumo, lojasCadastradas])

  // Handler de navegação canônica para a ficha da loja
  const handleNavigateToStore = React.useCallback(
    (storeCode: string, storeName?: string) => {
      const matched = lojasCadastradas.find((s) => s.storeCode === storeCode)
      if (matched) {
        navigateToStore(matched, navigate)
      } else {
        navigateToStore({ codigoLoja: storeCode, nomeLoja: storeName }, navigate)
      }
    },
    [lojasCadastradas, navigate],
  )

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Cabeçalho */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Operação — Visitas de Promotores
            </h1>
            <Badge
              variant="secondary"
              className="font-semibold text-xs bg-indigo-50 text-indigo-700 border border-indigo-200"
            >
              Monitoramento Factual
            </Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Acompanhamento em tempo real de chegadas e saídas registradas pelas integrações de
            campo.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={refetch} className="text-xs h-9">
            Atualizar Linha do Tempo
          </Button>
        </div>
      </div>

      {/* Regra de Governança Estrita & Linguagem Factual */}
      <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl flex items-start gap-3 text-xs text-blue-900">
        <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <span className="font-bold">Diretriz Operacional Factual de Visitas:</span>
          <p className="text-blue-800 text-[11px] leading-relaxed">
            • <strong>Sem visita registrada não significa automaticamente: Promotor faltou.</strong>
            <br />•{' '}
            <strong>
              Sem pesquisa registrada não significa automaticamente: Promotor não fez.
            </strong>
            <br />• Pode existir atraso de sincronização ou outro contexto. O SKIP registra
            exclusivamente horários fornecidos pela fonte, sem deduzir jornadas ou conclusões sem
            comprovação. Visitas observadas <strong>não alteram o roteiro confirmado</strong> sem
            validação humana.
          </p>
        </div>
      </div>

      {/* Estado Vazio de Fonte de Visitas Não Sincronizada */}
      {!isLoading && !isFonteSincronizada && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="p-6 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mx-auto text-amber-600">
              <Clock className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-amber-900">
                Fonte de Visitas ainda não sincronizada
              </h3>
              <p className="text-xs text-amber-800 max-w-lg mx-auto leading-relaxed">
                Nenhum dado de visitas foi sincronizado até o momento via TradePro API. Isso não
                significa ausência de promotores em loja nem falta de atendimento — indica apenas
                que a coleta de visitas ainda não foi executada nesta base.
              </p>
            </div>
            <div className="pt-2 flex justify-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/importacao')}
                className="text-xs bg-white text-amber-900 border-amber-300 hover:bg-amber-100/50"
              >
                Ir para Sincronização TradePro
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cards de Métricas Reais Consolidadas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs">Registros de Visitas</CardDescription>
            <CardTitle className="text-2xl font-bold text-slate-900">{totalVisitas}</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-[11px] text-slate-500">
            Eventos operacionais capturados pela fonte de dados
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs">Promotores com Visita Registrada</CardDescription>
            <CardTitle className="text-2xl font-bold text-indigo-600">
              {promotoresComRegistroCount}
              {promotores.length > 0 && (
                <span className="text-xs text-slate-400 font-normal ml-1">
                  de {promotores.length} cadastrados
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-[11px] text-slate-500">
            Com pelo menos 1 evidência de visita gravada
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs">Lojas com Visita Registrada</CardDescription>
            <CardTitle className="text-2xl font-bold text-emerald-600">
              {lojasAtendidasCount} lojas
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-[11px] text-slate-500">
            Unidades com atendimento registrado na fonte
          </CardContent>
        </Card>
      </div>

      {/* Barra de Filtros Gerais */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            type="text"
            placeholder="Buscar por promotor, loja ou código..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value)
              setPage(1)
            }}
            className="pl-9 text-xs h-9"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Select
            value={selectedPromoter}
            onValueChange={(val) => {
              setSelectedPromoter(val)
              setPage(1)
            }}
          >
            <SelectTrigger className="w-full sm:w-56 text-xs h-9">
              <SelectValue placeholder="Promotor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os Promotores</SelectItem>
              {promotores.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            type="date"
            value={selectedDate}
            onChange={(e) => {
              setSelectedDate(e.target.value)
              setPage(1)
            }}
            className="w-full sm:w-40 text-xs h-9"
          />
        </div>
      </div>

      {/* Perspectivas de Monitoramento em Abas */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-4">
        <TabsList className="grid grid-cols-4 w-full sm:w-auto bg-slate-100 p-1 rounded-xl">
          <TabsTrigger value="hoje" className="text-xs font-semibold flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5" />
            <span>Hoje no Campo</span>
          </TabsTrigger>
          <TabsTrigger
            value="promotores"
            className="text-xs font-semibold flex items-center gap-1.5"
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>Por Promotor</span>
          </TabsTrigger>
          <TabsTrigger value="lojas" className="text-xs font-semibold flex items-center gap-1.5">
            <Store className="w-3.5 h-3.5" />
            <span>Por Loja</span>
          </TabsTrigger>
          <TabsTrigger
            value="historico"
            className="text-xs font-semibold flex items-center gap-1.5"
          >
            <History className="w-3.5 h-3.5" />
            <span>Histórico</span>
          </TabsTrigger>
        </TabsList>

        {/* ========================================================================= */}
        {/* ABA 1: HOJE NO CAMPO ("O que está acontecendo hoje no campo?")             */}
        {/* ========================================================================= */}
        <TabsContent value="hoje" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-800">
                Atividade Registrada em {dataReferenciaHoje}
              </h2>
              <p className="text-xs text-slate-500">
                Eventos e status em tempo real de promotores e lojas atendidas na data de
                referência.
              </p>
            </div>
            <Badge variant="outline" className="text-xs">
              {visitasHoje.length} evento(s) nesta data
            </Badge>
          </div>

          {isLoading ? (
            <div className="p-12 text-center text-slate-400">
              Carregando monitoramento de hoje...
            </div>
          ) : visitasHoje.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center space-y-2">
                <Clock className="w-10 h-10 text-slate-300 mx-auto" />
                <h4 className="text-base font-semibold text-slate-700">Sem visita registrada</h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Nenhum registro de visita encontrado para a data {dataReferenciaHoje}. Sem visita
                  registrada não significa que o promotor faltou — pode haver intervalo de coleta ou
                  falta de sincronização.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {visitasHoje.map((v) => (
                <Card
                  key={v.id}
                  className="hover:border-indigo-300 hover:shadow-sm transition-all flex flex-col justify-between"
                >
                  <CardHeader className="p-4 pb-2 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[11px] font-bold text-indigo-600 block">
                          {v.promoter_nome}
                        </span>
                        <h4 className="text-sm font-bold text-slate-900 leading-tight">
                          {v.store_name || `Loja ${v.store_code}`}
                        </h4>
                      </div>
                      <Badge
                        variant="outline"
                        className={
                          v.hora_inicio && v.hora_fim
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200 text-[10px]'
                            : v.hora_inicio
                              ? 'bg-blue-50 text-blue-800 border-blue-200 text-[10px]'
                              : 'bg-slate-50 text-slate-600 border-slate-200 text-[10px]'
                        }
                      >
                        {v.hora_inicio && v.hora_fim
                          ? 'Concluída'
                          : v.hora_inicio
                            ? 'Em andamento'
                            : 'Registrada'}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 pt-2 space-y-3 text-xs">
                    <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                      <div>
                        <span className="text-[10px] text-slate-500 block">
                          Primeira visita reg.:
                        </span>
                        <span className="font-mono font-semibold text-slate-800">
                          {v.hora_inicio || '—'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 block">Saída registrada:</span>
                        <span className="font-mono font-semibold text-slate-800">
                          {v.hora_fim || 'Sem saída reg.'}
                        </span>
                      </div>
                      {v.duracao_minutos !== undefined && (
                        <div className="col-span-2 pt-1 border-t border-slate-200/60 flex items-center justify-between">
                          <span className="text-[10px] text-slate-500">Permanência:</span>
                          <span className="font-semibold text-slate-700">
                            {v.duracao_minutos} min
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[10px] text-slate-400">Origem: {v.origem_fonte}</span>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs h-7 px-2"
                          onClick={() => setSelectedVisita(v)}
                        >
                          Ver Detalhes
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs h-7 px-2 text-indigo-600 hover:text-indigo-800"
                          onClick={() => handleNavigateToStore(v.store_code, v.store_name)}
                        >
                          Ficha da Loja
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ========================================================================= */}
        {/* ABA 2: VISÃO POR PROMOTOR                                                 */}
        {/* ========================================================================= */}
        <TabsContent value="promotores" className="space-y-4">
          <div>
            <h2 className="text-sm font-bold text-slate-800">
              Acompanhamento Consolidado por Promotor
            </h2>
            <p className="text-xs text-slate-500">
              Registros factuais extraídos da fonte. Ausência de visitas ou pesquisas não é inferida
              como falta do promotor.
            </p>
          </div>

          {isLoading ? (
            <div className="p-12 text-center text-slate-400">Carregando visão de promotores...</div>
          ) : filteredPromotoresResumo.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-slate-500">
                <UserCheck className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <span className="font-semibold block text-slate-700">
                  Nenhum promotor com registros de visita encontrados
                </span>
                <p className="text-xs text-slate-400 mt-1">
                  Se a base de visitas ainda não foi sincronizada ou o filtro não retornou dados,
                  nenhum promotor é apontado.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredPromotoresResumo.map((p) => (
                <Card
                  key={p.promoterCod}
                  className="hover:border-slate-300 hover:shadow-sm transition-all"
                >
                  <CardHeader className="p-4 pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-full bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-700 shrink-0">
                          <User className="w-5 h-5" />
                        </div>
                        <div>
                          <CardTitle className="text-sm font-bold text-slate-900">
                            {p.promoterNome}
                          </CardTitle>
                          <CardDescription className="text-[11px] text-slate-500">
                            Cód: {p.promoterCod} • Supervisor:{' '}
                            <span className="font-semibold text-slate-700">{p.supervisorNome}</span>
                          </CardDescription>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-[11px] font-semibold">
                        {p.visitas.length} visita(s)
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 pt-2 space-y-3 text-xs">
                    {/* Linha factual: Primeira visita e última loja */}
                    <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-[11px]">
                      <div>
                        <span className="text-slate-500 block">Primeira visita registrada:</span>
                        <span className="font-mono font-bold text-slate-800">
                          {p.primeiraVisitaRegistrada || 'Sem horário na fonte'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Última loja registrada:</span>
                        <span className="font-semibold text-slate-800 line-clamp-1">
                          {p.lojaAtualOuUltima
                            ? `${p.lojaAtualOuUltima.storeCode} - ${p.lojaAtualOuUltima.storeName}`
                            : 'Sem dado na fonte'}
                        </span>
                      </div>
                    </div>

                    {/* Indicadores Fatuais Reais */}
                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="p-2 rounded border border-slate-100 bg-white">
                        <span className="text-[10px] text-slate-500 block">Lojas Visitadas</span>
                        <span className="font-bold text-slate-900">{p.qtdLojasVisitadas}</span>
                      </div>
                      <div className="p-2 rounded border border-slate-100 bg-white">
                        <span className="text-[10px] text-slate-500 block">Concluídas</span>
                        <span className="font-bold text-emerald-600">{p.visitasConcluidas}</span>
                      </div>
                      <div className="p-2 rounded border border-slate-100 bg-white">
                        <span className="text-[10px] text-slate-500 block">Sem Saída Reg.</span>
                        <span
                          className={`font-bold ${p.visitasSemSaida > 0 ? 'text-amber-600' : 'text-slate-400'}`}
                        >
                          {p.visitasSemSaida}
                        </span>
                      </div>
                    </div>

                    {/* Pesquisas e Pendências quando existirem na fonte */}
                    <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-[11px] text-slate-500">
                      <div>
                        Pesquisas:{' '}
                        <strong className="text-slate-700">
                          {p.pesquisasRealizadas !== undefined
                            ? p.pesquisasRealizadas
                            : 'Sem dado na fonte'}
                        </strong>
                      </div>
                      <div>
                        Pendências:{' '}
                        <strong className="text-slate-700">
                          {p.pendenciasOperacionais !== undefined
                            ? p.pendenciasOperacionais
                            : 'Sem dado na fonte'}
                        </strong>
                      </div>
                    </div>

                    {/* Relação observada */}
                    <div className="p-2 bg-amber-50/60 rounded border border-amber-100 text-[10px] text-amber-800">
                      <strong>Vínculos de Campo:</strong> As visitas alimentam vínculos observados.
                      A confirmação de roteiro oficial permanece sob governança humana.
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ========================================================================= */}
        {/* ABA 3: VISÃO POR LOJA (Visão Contextual Conectada aos Módulos)             */}
        {/* ========================================================================= */}
        <TabsContent value="lojas" className="space-y-4">
          <div>
            <h2 className="text-sm font-bold text-slate-800">
              Visão Contextual de Atendimento por Loja
            </h2>
            <p className="text-xs text-slate-500">
              Conecta visitas registradas com indústrias, validades críticas, rupturas ativas e
              devoluções sem duplicar dados.
            </p>
          </div>

          {isLoading ? (
            <div className="p-12 text-center text-slate-400">Carregando visão de lojas...</div>
          ) : filteredLojasResumo.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-slate-500">
                <Store className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <span className="font-semibold block text-slate-700">
                  Nenhuma loja com visita registrada encontrada
                </span>
                <p className="text-xs text-slate-400 mt-1">
                  Sem visitas registradas para os filtros aplicados.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredLojasResumo.map((l) => {
                // Busca contexto canônico da loja via useLojas
                const contexto = lojasCadastradas.find((s) => s.storeCode === l.storeCode)
                const validadesCriticas = contexto?.validadesCriticasCount || 0
                const rupturasAtivas = contexto?.rupturasAtivasCount || 0
                const marcasAtendidas = contexto?.marcasList || []

                return (
                  <Card
                    key={l.storeCode}
                    className="hover:border-slate-300 hover:shadow-sm transition-all flex flex-col justify-between"
                  >
                    <CardHeader className="p-4 pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-xs font-bold text-slate-500">
                              {l.storeCode}
                            </span>
                            <Badge
                              variant="outline"
                              className="text-[10px] bg-slate-50 text-slate-600"
                            >
                              {l.visitasHoje.length} visita(s)
                            </Badge>
                          </div>
                          <CardTitle className="text-sm font-bold text-slate-900 mt-0.5">
                            {l.storeName}
                          </CardTitle>
                          {contexto?.networkName && (
                            <CardDescription className="text-[11px] text-slate-500">
                              Rede: {contexto.networkName}
                            </CardDescription>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="p-4 pt-2 space-y-3 text-xs">
                      {/* Promotores que registraram visita nesta loja */}
                      <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 space-y-1.5">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                          Promotores com registro:
                        </span>
                        <div className="space-y-1">
                          {l.promotoresComRegistro.map((pr, idx) => (
                            <div
                              key={idx}
                              className="flex items-center justify-between text-[11px] border-b border-slate-100 last:border-0 pb-0.5"
                            >
                              <span className="font-medium text-slate-800">{pr.promoterNome}</span>
                              <span className="font-mono text-slate-600">
                                {pr.horaInicio || '—'}
                                {pr.horaFim ? ` → ${pr.horaFim}` : ' (s/ saída)'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Conexão Contextual com Validades e Rupturas */}
                      <div className="grid grid-cols-2 gap-2 text-center text-xs">
                        <div
                          className={`p-2 rounded border ${validadesCriticas > 0 ? 'bg-red-50/70 border-red-200' : 'bg-slate-50 border-slate-100'}`}
                        >
                          <span className="text-[10px] text-slate-500 block">Validades 0–15d</span>
                          <span
                            className={`font-bold ${validadesCriticas > 0 ? 'text-red-700' : 'text-slate-500'}`}
                          >
                            {validadesCriticas}
                          </span>
                        </div>
                        <div
                          className={`p-2 rounded border ${rupturasAtivas > 0 ? 'bg-amber-50/70 border-amber-200' : 'bg-slate-50 border-slate-100'}`}
                        >
                          <span className="text-[10px] text-slate-500 block">Rupturas Ativas</span>
                          <span
                            className={`font-bold ${rupturasAtivas > 0 ? 'text-amber-700' : 'text-slate-500'}`}
                          >
                            {rupturasAtivas}
                          </span>
                        </div>
                      </div>

                      {/* Indústrias Relacionadas */}
                      {marcasAtendidas.length > 0 && (
                        <div className="text-[11px] text-slate-500">
                          <span className="text-slate-400 block text-[10px]">
                            Indústrias relacionadas:
                          </span>
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {marcasAtendidas.slice(0, 3).map((m, mIdx) => (
                              <Badge
                                key={mIdx}
                                variant="secondary"
                                className="text-[10px] px-1.5 py-0"
                              >
                                {m}
                              </Badge>
                            ))}
                            {marcasAtendidas.length > 3 && (
                              <span className="text-[10px] text-slate-400">
                                +{marcasAtendidas.length - 3}
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Botão para levar diretamente à Ficha da Loja via navigateToStore */}
                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs h-7 px-2 text-slate-600 hover:text-slate-900"
                          onClick={() => setSelectedLojaResumo(l)}
                        >
                          Resumo Rápido
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs h-7 px-2.5 text-indigo-700 border-indigo-200 hover:bg-indigo-50 flex items-center gap-1"
                          onClick={() => handleNavigateToStore(l.storeCode, l.storeName)}
                        >
                          <span>Ficha da Loja</span>
                          <ExternalLink className="w-3 h-3" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>

        {/* ========================================================================= */}
        {/* ABA 4: HISTÓRICO (Preservado e Paginado)                                   */}
        {/* ========================================================================= */}
        <TabsContent value="historico" className="space-y-4">
          <Card>
            <CardHeader className="p-4 pb-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base font-bold text-slate-900">
                    Histórico Operacional de Visitas
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Linha do tempo completa e auditável de registros de campo.
                  </CardDescription>
                </div>
                <div className="text-xs text-slate-500">
                  Mostrando{' '}
                  <span className="font-semibold text-slate-900">{filteredVisitas.length}</span>{' '}
                  registros
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-2">
              <div className="bg-white rounded-lg border border-slate-200 overflow-x-auto">
                <table className="w-full text-left text-xs min-w-[750px]">
                  <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="p-3">Data</th>
                      <th className="p-3">Promotor</th>
                      <th className="p-3">Loja Atendida</th>
                      <th className="p-3">Primeiro Registro / Check-in</th>
                      <th className="p-3">Check-out / Saída</th>
                      <th className="p-3">Duração</th>
                      <th className="p-3">Origem da Evidência</th>
                      <th className="p-3 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {isLoading ? (
                      <tr>
                        <td colSpan={8} className="p-6 text-center text-slate-400">
                          Carregando visitas operacionais...
                        </td>
                      </tr>
                    ) : filteredVisitas.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-slate-500">
                          <div className="max-w-sm mx-auto space-y-2">
                            <Clock className="w-8 h-8 text-slate-300 mx-auto" />
                            <span className="font-semibold block text-slate-700">
                              Sem visita registrada
                            </span>
                            <p className="text-xs text-slate-400">
                              Nenhum evento de visita retornado para os filtros selecionados.
                              Ausência de registro não caracteriza falta do promotor.
                            </p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      paginatedVisitas.map((v) => (
                        <tr key={v.id} className="hover:bg-slate-50/80">
                          <td className="p-3 font-medium text-slate-700 whitespace-nowrap">
                            {v.data}
                          </td>
                          <td className="p-3 font-semibold text-slate-900 whitespace-nowrap">
                            {v.promoter_nome}
                          </td>
                          <td className="p-3">
                            <button
                              type="button"
                              onClick={() => handleNavigateToStore(v.store_code, v.store_name)}
                              className="text-left font-bold text-slate-800 hover:text-indigo-600 hover:underline block"
                            >
                              {v.store_code}
                              {v.store_name && (
                                <span className="text-slate-500 ml-1 font-normal text-[11px] block">
                                  {v.store_name}
                                </span>
                              )}
                            </button>
                          </td>
                          <td className="p-3 font-mono">
                            {v.hora_inicio ? (
                              <Badge
                                variant="outline"
                                className="bg-emerald-50 text-emerald-800 border-emerald-200"
                              >
                                {v.hora_inicio}
                              </Badge>
                            ) : (
                              <span className="text-slate-400 italic">Não informado</span>
                            )}
                          </td>
                          <td className="p-3 font-mono">
                            {v.hora_fim ? (
                              <Badge
                                variant="outline"
                                className="bg-slate-50 text-slate-700 border-slate-200"
                              >
                                {v.hora_fim}
                              </Badge>
                            ) : (
                              <span className="text-slate-400 italic">Sem saída registrada</span>
                            )}
                          </td>
                          <td className="p-3 text-slate-600 whitespace-nowrap">
                            {v.duracao_minutos && v.duracao_minutos > 0
                              ? `${v.duracao_minutos} min`
                              : '—'}
                          </td>
                          <td className="p-3">
                            <Badge variant="secondary" className="text-[10px]">
                              {v.origem_fonte}
                            </Badge>
                          </td>
                          <td className="p-3 text-right whitespace-nowrap">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-xs h-7 px-2"
                              onClick={() => setSelectedVisita(v)}
                            >
                              Ver Detalhes
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Paginação */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4 text-xs text-slate-600">
                  <span>
                    Página {page} de {totalPages}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(p - 1, 1))}
                      className="text-xs h-8"
                    >
                      Anterior
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                      className="text-xs h-8"
                    >
                      Próxima
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Modal: Detalhes do Evento de Visita */}
      <Dialog
        open={Boolean(selectedVisita)}
        onOpenChange={(open) => !open && setSelectedVisita(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Clock className="w-5 h-5 text-indigo-600" />
              Evidência de Visita Operacional
            </DialogTitle>
            <DialogDescription className="text-xs">
              Registro bruto de campo capturado no sistema.
            </DialogDescription>
          </DialogHeader>

          {selectedVisita && (
            <div className="space-y-3 py-2 text-xs">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-500">Promotor:</span>
                  <span className="font-bold text-slate-900">{selectedVisita.promoter_nome}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Loja:</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedVisita(null)
                      handleNavigateToStore(selectedVisita.store_code, selectedVisita.store_name)
                    }}
                    className="font-bold text-indigo-700 hover:underline"
                  >
                    {selectedVisita.store_code} - {selectedVisita.store_name}
                  </button>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Data do Evento:</span>
                  <span className="font-medium text-slate-800">{selectedVisita.data}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Primeira visita registrada:</span>
                  <span className="font-mono text-emerald-700 font-bold">
                    {selectedVisita.hora_inicio || 'Não fornecido pela fonte'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Saída / Check-out:</span>
                  <span className="font-mono text-slate-700">
                    {selectedVisita.hora_fim || 'Sem registro de saída'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Duração / Permanência:</span>
                  <span className="font-semibold text-slate-800">
                    {selectedVisita.duracao_minutos
                      ? `${selectedVisita.duracao_minutos} min`
                      : 'Não calculável (requer entrada e saída)'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Origem da Evidência:</span>
                  <span className="text-indigo-600 font-semibold">
                    {selectedVisita.origem_fonte}
                  </span>
                </div>
              </div>

              <div className="p-2.5 bg-blue-50/80 rounded border border-blue-200 text-blue-900 text-[11px]">
                <strong>Nota Factual:</strong> Horários refletem a coleta realizada pela integração.
                Ausência de horário de saída indica apenas que a integração não capturou o check-out
                específico.
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedVisita(null)}
              className="text-xs"
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Resumo Rápido da Loja */}
      <Dialog
        open={Boolean(selectedLojaResumo)}
        onOpenChange={(open) => !open && setSelectedLojaResumo(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Store className="w-5 h-5 text-indigo-600" />
              Resumo Operacional da Loja
            </DialogTitle>
            <DialogDescription className="text-xs">
              Contexto integrado de visitas e saúde da unidade.
            </DialogDescription>
          </DialogHeader>

          {selectedLojaResumo && (
            <div className="space-y-3 py-2 text-xs">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                <span className="font-mono text-xs text-slate-500 font-bold">
                  Código: {selectedLojaResumo.storeCode}
                </span>
                <h4 className="text-sm font-bold text-slate-900">{selectedLojaResumo.storeName}</h4>
                {lojaContextoDetalhe?.networkName && (
                  <p className="text-[11px] text-slate-500">
                    Rede: {lojaContextoDetalhe.networkName}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <span className="font-semibold text-slate-700 block">
                  Visitas Registradas nesta Loja:
                </span>
                <div className="space-y-1">
                  {selectedLojaResumo.visitasHoje.map((v, i) => (
                    <div
                      key={i}
                      className="p-2 rounded bg-white border border-slate-200 flex justify-between items-center text-[11px]"
                    >
                      <span className="font-semibold text-slate-800">{v.promoter_nome}</span>
                      <span className="font-mono text-slate-600">
                        {v.hora_inicio || '—'} {v.hora_fim ? `→ ${v.hora_fim}` : '(s/ saída)'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {lojaContextoDetalhe && (
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="p-2 bg-slate-50 rounded border border-slate-200">
                    <span className="text-[10px] text-slate-500 block">Validades Críticas</span>
                    <span className="font-bold text-red-600">
                      {lojaContextoDetalhe.validadesCriticasCount}
                    </span>
                  </div>
                  <div className="p-2 bg-slate-50 rounded border border-slate-200">
                    <span className="text-[10px] text-slate-500 block">Rupturas Ativas</span>
                    <span className="font-bold text-amber-600">
                      {lojaContextoDetalhe.rupturasAtivasCount}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="flex justify-between sm:justify-between w-full">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedLojaResumo(null)}
              className="text-xs"
            >
              Fechar
            </Button>
            {selectedLojaResumo && (
              <Button
                variant="default"
                size="sm"
                className="text-xs bg-indigo-600 hover:bg-indigo-700 flex items-center gap-1.5"
                onClick={() => {
                  const sCode = selectedLojaResumo.storeCode
                  const sName = selectedLojaResumo.storeName
                  setSelectedLojaResumo(null)
                  handleNavigateToStore(sCode, sName)
                }}
              >
                <span>Abrir Ficha Completa</span>
                <ExternalLink className="w-3 h-3" />
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default VisitasPage
