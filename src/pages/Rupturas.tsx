import React, { useState, useMemo } from 'react'
import {
  Search,
  Filter,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Store,
  ChevronLeft,
  ChevronRight,
  UploadCloud,
  FileSpreadsheet,
  GitCompare,
} from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useRupturas } from '@/services'
import { RupturasKpisCards } from '@/components/rupturas/RupturasKpisCards'
import { RupturaDetailModal } from '@/components/rupturas/RupturaDetailModal'
import { CrossEvidenceTab } from '@/components/rupturas/CrossEvidenceTab'
import { formatStoreIdentity } from '@/lib/selectors'
import type { Ruptura, RupturaMotivo, RupturaStatus } from '@/types'

const PAGE_SIZE = 15

export function RupturasPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialTab = searchParams.get('tab') === 'confronto' ? 'confronto' : 'rupturas'
  const [activeTab, setActiveTab] = useState<'rupturas' | 'confronto'>(initialTab)
  const [search, setSearch] = useState('')
  const [selectedLoja, setSelectedLoja] = useState<string>('all')
  const [selectedMotivo, setSelectedMotivo] = useState<string>('all')
  const [selectedCliente, setSelectedCliente] = useState<string>('all')
  const [selectedStatus, setSelectedStatus] = useState<string>('all')
  const [dataInicio, setDataInicio] = useState<string>('')
  const [dataFim, setDataFim] = useState<string>('')
  const [currentPage, setCurrentPage] = useState(1)

  const [selectedRuptura, setSelectedRuptura] = useState<Ruptura | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  // Filtros aplicados para a query
  const filters = useMemo(() => {
    return {
      search: search.trim() || undefined,
      codigo_loja: selectedLoja !== 'all' ? selectedLoja : undefined,
      motivo: selectedMotivo !== 'all' ? (selectedMotivo as RupturaMotivo) : undefined,
      cliente: selectedCliente !== 'all' ? selectedCliente : undefined,
      situacao_atual: selectedStatus !== 'all' ? (selectedStatus as RupturaStatus) : undefined,
      data_inicio: dataInicio || undefined,
      data_fim: dataFim || undefined,
    }
  }, [search, selectedLoja, selectedMotivo, selectedCliente, selectedStatus, dataInicio, dataFim])

  const { data: rupturas, kpis, isLoading, error, refetch } = useRupturas(filters)

  // Opções para os selects com base em todos os dados sem filtro de texto
  const { lojasOptions, motivosOptions, clientesOptions } = useMemo(() => {
    const lojasMap = new Map<string, string>()
    const motivosSet = new Set<string>()
    const clientesSet = new Set<string>()

    rupturas.forEach((r) => {
      if (r.codigo_loja || r.nome_loja) {
        lojasMap.set(
          r.codigo_loja || r.nome_loja,
          formatStoreIdentity({ codigo_loja: r.codigo_loja, nome_loja: r.nome_loja }),
        )
      }
      if (r.motivo) motivosSet.add(r.motivo)
      if (r.cliente) clientesSet.add(r.cliente)
    })

    return {
      lojasOptions: Array.from(lojasMap.entries()).map(([code, label]) => ({ code, label })),
      motivosOptions: Array.from(motivosSet),
      clientesOptions: Array.from(clientesSet),
    }
  }, [rupturas])

  // Paginação
  const totalPages = Math.max(1, Math.ceil(rupturas.length / PAGE_SIZE))
  const paginatedRupturas = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE
    return rupturas.slice(start, start + PAGE_SIZE)
  }, [rupturas, currentPage])

  const handleRowClick = (item: Ruptura) => {
    setSelectedRuptura(item)
    setDetailOpen(true)
  }

  const clearFilters = () => {
    setSearch('')
    setSelectedLoja('all')
    setSelectedMotivo('all')
    setSelectedCliente('all')
    setSelectedStatus('all')
    setDataInicio('')
    setDataFim('')
    setCurrentPage(1)
  }

  const hasActiveFilters =
    Boolean(search) ||
    selectedLoja !== 'all' ||
    selectedMotivo !== 'all' ||
    selectedCliente !== 'all' ||
    selectedStatus !== 'all' ||
    Boolean(dataInicio) ||
    Boolean(dataFim)

  const handleTabChange = (val: string) => {
    const tab = val as 'rupturas' | 'confronto'
    setActiveTab(tab)
    if (tab === 'confronto') {
      setSearchParams({ tab: 'confronto' })
    } else {
      setSearchParams({})
    }
  }

  return (
    <div className="space-y-6">
      {/* Topo / Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Painel de Rupturas</h1>
          <p className="text-sm text-slate-500 mt-1">
            Monitoramento de falta de produtos, desabastecimento em gôndola e confronto analítico
            com validades.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'rupturas' && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isLoading}
                className="h-9 gap-2 text-slate-700"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                Atualizar
              </Button>

              <Button
                asChild
                size="sm"
                className="h-9 gap-2 bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                <Link to="/importacao">
                  <UploadCloud className="w-4 h-4" />
                  Importar Rupturas
                </Link>
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Sistema de Abas */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md bg-slate-100 p-1">
          <TabsTrigger value="rupturas" className="gap-2 text-xs font-semibold">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            Rupturas (Oficial)
          </TabsTrigger>
          <TabsTrigger value="confronto" className="gap-2 text-xs font-semibold">
            <GitCompare className="w-4 h-4 text-indigo-600" />
            Confronto Validades
            <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[10px] py-0 px-1 font-bold ml-1">
              Shadow
            </Badge>
          </TabsTrigger>
        </TabsList>

        {/* ABA 1: Rupturas Oficiais (intocada) */}
        <TabsContent value="rupturas" className="space-y-6 mt-4">
          {/* Cards de KPIs */}
          <RupturasKpisCards kpis={kpis} isLoading={isLoading} />

          {/* Barra de Filtros */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3 shadow-xs">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Busca textual */}
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Buscar por produto, loja, colaborador..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value)
                    setCurrentPage(1)
                  }}
                  className="pl-9 h-9 text-xs"
                />
              </div>

              {/* Filtro de Loja */}
              <Select
                value={selectedLoja}
                onValueChange={(val) => {
                  setSelectedLoja(val)
                  setCurrentPage(1)
                }}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Todas as Lojas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as Lojas</SelectItem>
                  {lojasOptions.map((opt) => (
                    <SelectItem key={opt.code} value={opt.code}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Filtro de Motivo */}
              <Select
                value={selectedMotivo}
                onValueChange={(val) => {
                  setSelectedMotivo(val)
                  setCurrentPage(1)
                }}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Todos os Motivos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Motivos</SelectItem>
                  <SelectItem value="Ruptura Total">Ruptura Total</SelectItem>
                  <SelectItem value="Sem Estoque Mínimo">Sem Estoque Mínimo</SelectItem>
                  <SelectItem value="Estoque Virtual">Estoque Virtual</SelectItem>
                </SelectContent>
              </Select>

              {/* Filtro de Status */}
              <Select
                value={selectedStatus}
                onValueChange={(val) => {
                  setSelectedStatus(val)
                  setCurrentPage(1)
                }}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Situação Atual (Todos)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Situação (Todas)</SelectItem>
                  <SelectItem value="Ativo">Ativo</SelectItem>
                  <SelectItem value="Resolvido">Resolvido</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Linha secundária de filtros: Período e Reset */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-slate-500 font-medium flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" /> Período da visita:
                </span>
                <input
                  type="date"
                  value={dataInicio}
                  onChange={(e) => {
                    setDataInicio(e.target.value)
                    setCurrentPage(1)
                  }}
                  className="h-8 px-2 text-xs rounded-md border border-slate-200 bg-white"
                />
                <span className="text-slate-400">até</span>
                <input
                  type="date"
                  value={dataFim}
                  onChange={(e) => {
                    setDataFim(e.target.value)
                    setCurrentPage(1)
                  }}
                  className="h-8 px-2 text-xs rounded-md border border-slate-200 bg-white"
                />
              </div>

              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="h-8 text-xs text-slate-500 hover:text-slate-900"
                >
                  Limpar filtros
                </Button>
              )}
            </div>
          </div>

          {/* Tabela de Rupturas */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <h2 className="text-sm font-bold text-slate-900">
                  Ocorrências de Ruptura ({rupturas.length})
                </h2>
              </div>
              <span className="text-xs text-slate-500">
                Página {currentPage} de {totalPages}
              </span>
            </div>

            {isLoading ? (
              <div className="p-12 text-center text-sm text-slate-500">
                Carregando ocorrências de rupturas...
              </div>
            ) : error ? (
              <div className="p-12 text-center text-sm text-red-500">
                Ocorreu um erro ao carregar os dados. Tente novamente.
              </div>
            ) : rupturas.length === 0 ? (
              <div className="p-12 text-center">
                <FileSpreadsheet className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-sm font-medium text-slate-900">Nenhuma ruptura registrada</p>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  {hasActiveFilters
                    ? 'Nenhum registro corresponde aos filtros selecionados. Tente ajustar seus termos de busca.'
                    : 'Importe um arquivo de exportação do TradePro para começar a monitorar as rupturas.'}
                </p>
                {!hasActiveFilters && (
                  <Button
                    asChild
                    size="sm"
                    className="mt-4 bg-indigo-600 hover:bg-indigo-700 text-white"
                  >
                    <Link to="/importacao">Importar Rupturas Agora</Link>
                  </Button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/70 hover:bg-slate-50/70">
                      <TableHead className="text-xs font-semibold text-slate-600">Loja</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-600">
                        Produto
                      </TableHead>
                      <TableHead className="text-xs font-semibold text-slate-600">Motivo</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-600">
                        Cliente
                      </TableHead>
                      <TableHead className="text-xs font-semibold text-slate-600">
                        Data Visita
                      </TableHead>
                      <TableHead className="text-xs font-semibold text-slate-600 text-center">
                        Dias em Ruptura
                      </TableHead>
                      <TableHead className="text-xs font-semibold text-slate-600">Status</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-600">
                        Colaborador
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedRupturas.map((item) => {
                      const isAtivo = item.situacao_atual === 'Ativo'
                      const storeDisplay = formatStoreIdentity({
                        codigo_loja: item.codigo_loja,
                        nome_loja: item.nome_loja,
                      })

                      return (
                        <TableRow
                          key={item.id || item.operational_key}
                          onClick={() => handleRowClick(item)}
                          className="cursor-pointer hover:bg-slate-50 transition-colors"
                        >
                          {/* Loja */}
                          <TableCell className="text-xs font-semibold text-slate-900 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <Store className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span>{storeDisplay}</span>
                            </div>
                          </TableCell>

                          {/* Produto */}
                          <TableCell className="text-xs font-medium text-slate-900 max-w-[240px] truncate">
                            {item.produto}
                          </TableCell>

                          {/* Motivo */}
                          <TableCell className="text-xs text-slate-700 whitespace-nowrap">
                            <Badge
                              variant="secondary"
                              className="text-[10px] font-medium bg-slate-100 text-slate-700"
                            >
                              {item.motivo}
                            </Badge>
                          </TableCell>

                          {/* Cliente */}
                          <TableCell className="text-xs text-slate-600 whitespace-nowrap">
                            {item.cliente || item.nome_loja}
                          </TableCell>

                          {/* Data Visita */}
                          <TableCell className="text-xs text-slate-600 whitespace-nowrap tabular-nums">
                            {item.data_visita
                              ? new Date(
                                  item.data_visita.includes('T')
                                    ? item.data_visita
                                    : item.data_visita + 'T00:00:00',
                                ).toLocaleDateString('pt-BR')
                              : '—'}
                          </TableCell>

                          {/* Dias em Ruptura */}
                          <TableCell className="text-xs text-center font-bold tabular-nums">
                            <span
                              className={
                                item.dias_em_ruptura > 5
                                  ? 'text-red-600 font-extrabold'
                                  : item.dias_em_ruptura > 2
                                    ? 'text-amber-600'
                                    : 'text-slate-700'
                              }
                            >
                              {item.dias_em_ruptura} {item.dias_em_ruptura === 1 ? 'dia' : 'dias'}
                            </span>
                          </TableCell>

                          {/* Status */}
                          <TableCell className="text-xs whitespace-nowrap">
                            <Badge
                              variant="outline"
                              className={
                                isAtivo
                                  ? 'bg-red-50 text-red-700 border-red-200 font-semibold text-[11px]'
                                  : 'bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold text-[11px]'
                              }
                            >
                              {isAtivo ? (
                                <span className="flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3 text-red-600" />
                                  Ativo
                                </span>
                              ) : (
                                <span className="flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                  Resolvido
                                </span>
                              )}
                            </Badge>
                          </TableCell>

                          {/* Colaborador */}
                          <TableCell className="text-xs text-slate-600 whitespace-nowrap">
                            {item.colaborador || '—'}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Barra de Paginação */}
            {totalPages > 1 && (
              <div className="p-3 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="text-xs text-slate-500">
                  Mostrando {Math.min(rupturas.length, (currentPage - 1) * PAGE_SIZE + 1)} a{' '}
                  {Math.min(rupturas.length, currentPage * PAGE_SIZE)} de {rupturas.length}{' '}
                  ocorrências
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="h-8 px-2"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-xs font-semibold px-2 text-slate-700">
                    {currentPage} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="h-8 px-2"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Modal de Detalhes da Ruptura (Drill-Down) */}
          <RupturaDetailModal
            isOpen={detailOpen}
            onClose={() => {
              setDetailOpen(false)
              setSelectedRuptura(null)
            }}
            item={selectedRuptura}
          />
        </TabsContent>

        {/* ABA 2: Confronto Validades (NOVA - Modo Shadow) */}
        <TabsContent value="confronto" className="space-y-6 mt-4">
          <CrossEvidenceTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
