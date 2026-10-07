import React from 'react'
import {
  Clock,
  Calendar,
  Store,
  UserCheck,
  Search,
  Filter,
  CheckCircle2,
  Info,
  CalendarCheck,
  Building2,
} from 'lucide-react'
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
import {
  getOperacionalVisitas,
  getCadastrosPromotores,
  getCadastrosLojas,
} from '@/services/cadastrosService'
import type { OperacionalVisita, CadastroPromotor, CadastroLoja } from '@/types/cadastros'

export const VisitasPage: React.FC = () => {
  const [visitas, setVisitas] = React.useState<OperacionalVisita[]>([])
  const [promotores, setPromotores] = React.useState<CadastroPromotor[]>([])
  const [lojas, setLojas] = React.useState<CadastroLoja[]>([])
  const [loading, setLoading] = React.useState(true)

  // Filtros
  const [searchTerm, setSearchTerm] = React.useState('')
  const [selectedPromoter, setSelectedPromoter] = React.useState<string>('todos')
  const [selectedDate, setSelectedDate] = React.useState<string>('')

  // Modal de Detalhe de Visita
  const [selectedVisita, setSelectedVisita] = React.useState<OperacionalVisita | null>(null)

  // Carrega Visitas e Entidades de Apoio
  const loadData = React.useCallback(async () => {
    setLoading(true)
    try {
      const [visList, promList, storeList] = await Promise.all([
        getOperacionalVisitas(),
        getCadastrosPromotores(),
        getCadastrosLojas(),
      ])
      setVisitas(visList)
      setPromotores(promList)
      setLojas(storeList)
    } catch (err) {
      console.warn('[VisitasPage] Erro ao carregar visitas operacionais:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    loadData()
  }, [loadData])

  // Métricas Consolidadas baseadas estritamente em fatos reais (sem inventar presenças ou faltas)
  const metrics = React.useMemo(() => {
    const totalVisitas = visitas.length
    const promotoresUnicos = new Set(visitas.map((v) => v.promoter_nome)).size
    const lojasVisitadas = new Set(visitas.map((v) => v.store_code)).size

    return {
      totalVisitas,
      promotoresComRegistro: promotoresUnicos,
      lojasAtendidasHoje: lojasVisitadas,
    }
  }, [visitas])

  // Filtragem
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
              Eventos Operacionais
            </Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Linha do tempo de visitas e evidências em campo. Ausência de registro indica "Sem visita
            registrada", nunca falta de promotor sem comprovação.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadData} className="text-xs h-9">
            Atualizar Linha do Tempo
          </Button>
        </div>
      </div>

      {/* Regra de Governança Estrita */}
      <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl flex items-start gap-3 text-xs text-blue-900">
        <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <span className="font-bold">Diretriz Operacional de Visitas e Horários:</span>
          <p className="text-blue-800 text-[11px] leading-relaxed">
            Se a API disponibilizar apenas o horário do primeiro registro, o SKIP exibe
            exclusivamente "Primeira visita registrada", sem deduzir início de jornada. Visitas em
            campo alimentam relações observadas, mas{' '}
            <strong>não alteram o roteiro confirmado</strong> sem validação humana.
          </p>
        </div>
      </div>

      {/* Cards de Métricas Reais */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs">Registros de Visitas</CardDescription>
            <CardTitle className="text-2xl font-bold text-slate-900">
              {metrics.totalVisitas}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-[11px] text-slate-500">
            Eventos operacionais capturados via API / Coleta
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs">Promotores com Visita Registrada</CardDescription>
            <CardTitle className="text-2xl font-bold text-indigo-600">
              {metrics.promotoresComRegistro} de {promotores.length}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-[11px] text-slate-500">
            Promotores com pelo menos 1 evidência no período
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs">Lojas Atendidas no Período</CardDescription>
            <CardTitle className="text-2xl font-bold text-emerald-600">
              {metrics.lojasAtendidasHoje} lojas
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-[11px] text-slate-500">
            Unidades visitadas conforme dados da fonte
          </CardContent>
        </Card>
      </div>

      {/* Barra de Filtros */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            type="text"
            placeholder="Buscar por promotor, loja ou código..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 text-xs h-9"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Select value={selectedPromoter} onValueChange={setSelectedPromoter}>
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
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-full sm:w-40 text-xs h-9"
          />
        </div>
      </div>

      {/* Tabela de Eventos de Visita */}
      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-base font-bold text-slate-900">
            Histórico Operacional de Visitas
          </CardTitle>
          <CardDescription className="text-xs">
            Acompanhamento factual das chegadas e saídas registradas pelas integrações.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-2">
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            <table className="w-full text-left text-xs">
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
                {loading ? (
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
                          Nenhum evento de visita retornado para os filtros selecionados. Ausência
                          de registro não caracteriza falta do promotor.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredVisitas.map((v) => (
                    <tr key={v.id} className="hover:bg-slate-50/80">
                      <td className="p-3 font-medium text-slate-700">{v.data}</td>
                      <td className="p-3 font-semibold text-slate-900">{v.promoter_nome}</td>
                      <td className="p-3">
                        <span className="font-bold text-slate-800">{v.store_code}</span>
                        {v.store_name && (
                          <span className="text-slate-500 ml-1 block text-[11px]">
                            {v.store_name}
                          </span>
                        )}
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
                          <span className="text-slate-400 italic">Sem check-out registrado</span>
                        )}
                      </td>
                      <td className="p-3 text-slate-600">
                        {v.duracao_minutos && v.duracao_minutos > 0
                          ? `${v.duracao_minutos} min`
                          : '—'}
                      </td>
                      <td className="p-3">
                        <Badge variant="secondary" className="text-[10px]">
                          {v.origem_fonte}
                        </Badge>
                      </td>
                      <td className="p-3 text-right">
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
        </CardContent>
      </Card>

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
                  <span className="font-bold text-slate-900">
                    {selectedVisita.store_code} - {selectedVisita.store_name}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Data do Evento:</span>
                  <span className="font-medium text-slate-800">{selectedVisita.data}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Primeiro Horário Registrado:</span>
                  <span className="font-mono text-emerald-700 font-bold">
                    {selectedVisita.hora_inicio || 'Não fornecido pela fonte'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Horário de Saída / Check-out:</span>
                  <span className="font-mono text-slate-700">
                    {selectedVisita.hora_fim || 'Sem registro de saída'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Origem da Evidência:</span>
                  <span className="text-indigo-600 font-semibold">
                    {selectedVisita.origem_fonte}
                  </span>
                </div>
              </div>

              {selectedVisita.observacao && (
                <div className="p-2.5 bg-amber-50 rounded border border-amber-200 text-amber-900 text-[11px]">
                  <strong>Observação da Coleta:</strong> {selectedVisita.observacao}
                </div>
              )}
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
    </div>
  )
}
export default VisitasPage
