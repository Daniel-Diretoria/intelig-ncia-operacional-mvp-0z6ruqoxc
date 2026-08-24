import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Store,
  Search,
  Building2,
  MapPin,
  AlertTriangle,
  Package,
  Boxes,
  ChevronRight,
  ChevronLeft,
  Filter,
  RefreshCw,
} from 'lucide-react'
import { useLojas } from '@/services/useLojas'
import { formatStoreIdentity, formatCityUf, formatStoreCode } from '@/lib/selectors'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { StatusBadge } from '@/components/ui/status-badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const ITEMS_PER_PAGE = 25

export const LojasPage: React.FC = () => {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [networkFilter, setNetworkFilter] = useState('Todos')
  const [cityFilter, setCityFilter] = useState('Todos')
  const [stateFilter, setStateFilter] = useState('Todos')
  const [statusFilter, setStatusFilter] = useState('Todos')
  const [currentPage, setCurrentPage] = useState(1)

  const { stores, filteredStores, isLoading, error, refetch } = useLojas({
    search,
    networkName: networkFilter,
    city: cityFilter,
    state: stateFilter,
    statusMaisCritico: statusFilter,
  })

  // Reset de página ao alterar qualquer filtro
  useEffect(() => {
    setCurrentPage(1)
  }, [search, networkFilter, cityFilter, stateFilter, statusFilter])

  // Opções para os Selects
  const networks = Array.from(new Set(stores.map((s) => s.networkName))).sort()
  const cities = Array.from(new Set(stores.map((s) => s.city)))
    .filter(Boolean)
    .sort()
  const states = Array.from(new Set(stores.map((s) => s.state)))
    .filter(Boolean)
    .sort()

  // Paginação client-side
  const totalItems = filteredStores.length
  const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE))
  const safeCurrentPage = Math.min(currentPage, totalPages)
  const startIndex = (safeCurrentPage - 1) * ITEMS_PER_PAGE
  const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, totalItems)
  const paginatedStores = filteredStores.slice(startIndex, endIndex)

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Header e Estatísticas Globais */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
            <Store className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              Visão Operacional por Loja
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Acompanhamento de clientes, produtos em risco e status de validades ativas por ponto
              de venda.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading}
            className="h-9 px-3 text-xs gap-1.5 border-slate-200 text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-indigo-600' : ''}`}
            />
            <span>Atualizar</span>
          </Button>
        </div>
      </div>

      {/* Cards KPI de Lojas */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs animate-pulse"
            >
              <div className="h-4 bg-slate-100 rounded w-24 mb-3" />
              <div className="h-8 bg-slate-200 rounded w-16 mb-2" />
              <div className="h-3 bg-slate-100 rounded w-32" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Total de Lojas
              </span>
              <Store className="w-4 h-4 text-indigo-600" />
            </div>
            <p className="text-2xl font-bold text-slate-900 mt-2">{stores.length}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Pontos de venda monitorados</p>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Lojas Críticas
              </span>
              <AlertTriangle className="w-4 h-4 text-red-600" />
            </div>
            <p className="text-2xl font-bold text-red-600 mt-2">
              {stores.filter((s) => s.statusMaisCritico === 'Crítico').length}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">Lojas com itens em janela crítica</p>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Ocorrências Ativas
              </span>
              <Package className="w-4 h-4 text-amber-600" />
            </div>
            <p className="text-2xl font-bold text-slate-900 mt-2">
              {stores.reduce((acc, s) => acc + s.totalOcorrenciasAtivas, 0)}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">Ocorrências ativas (dias {'>'} 0)</p>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Volume em Risco
              </span>
              <Boxes className="w-4 h-4 text-blue-600" />
            </div>
            <p className="text-2xl font-bold text-slate-900 mt-2">
              {stores.reduce((acc, s) => acc + s.totalQuantidade, 0).toLocaleString('pt-BR')} un
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">Unidades em estoque nas lojas</p>
          </div>
        </div>
      )}

      {/* Filtros e Busca */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
        <div className="flex items-center gap-2 pb-2 border-b border-slate-100 text-xs font-bold text-slate-700">
          <Filter className="w-4 h-4 text-slate-500" />
          <span>Filtros de Pesquisa e Consulta</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Busca Textual */}
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              type="text"
              placeholder="Buscar código, nome, cidade..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-xs bg-slate-50 border-slate-200 focus:bg-white"
            />
          </div>

          {/* Filtro Rede */}
          <Select value={networkFilter} onValueChange={setNetworkFilter}>
            <SelectTrigger className="h-9 text-xs bg-slate-50 border-slate-200">
              <SelectValue placeholder="Todas as redes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Todos">Todas as redes</SelectItem>
              {networks.map((net) => (
                <SelectItem key={net} value={net}>
                  {net}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Filtro Cidade */}
          <Select value={cityFilter} onValueChange={setCityFilter}>
            <SelectTrigger className="h-9 text-xs bg-slate-50 border-slate-200">
              <SelectValue placeholder="Todas as cidades" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Todos">Todas as cidades</SelectItem>
              {cities.map((city) => (
                <SelectItem key={city} value={city}>
                  {city}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Filtro Estado */}
          <Select value={stateFilter} onValueChange={setStateFilter}>
            <SelectTrigger className="h-9 text-xs bg-slate-50 border-slate-200">
              <SelectValue placeholder="Todos os estados" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Todos">Todos os estados</SelectItem>
              {states.map((st) => (
                <SelectItem key={st} value={st}>
                  {st}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Filtro Status Crítico */}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 text-xs bg-slate-50 border-slate-200">
              <SelectValue placeholder="Todos os status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Todos">Todos os status</SelectItem>
              <SelectItem value="Crítico">Crítico</SelectItem>
              <SelectItem value="Atenção">Atenção</SelectItem>
              <SelectItem value="Moderado">Moderado</SelectItem>
              <SelectItem value="Normal">Normal</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Lista de Lojas (Tabela Operacional) */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        {isLoading ? (
          <div className="p-8 space-y-4">
            <div className="flex items-center justify-center gap-2 text-sm text-slate-500 py-4">
              <RefreshCw className="w-4 h-4 animate-spin text-indigo-600" />
              <span>Carregando dados das lojas...</span>
            </div>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-12 bg-slate-50 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="p-10 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 mx-auto flex items-center justify-center">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-slate-900">Falha ao carregar lojas</p>
            <p className="text-xs text-slate-500 max-w-md mx-auto">{error.message}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="gap-1.5 text-xs h-8"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Tentar novamente
            </Button>
          </div>
        ) : filteredStores.length === 0 ? (
          <EmptyState
            title="Nenhuma loja encontrada"
            description="Tente ajustar os termos de busca ou limpar os filtros selecionados."
            className="py-12"
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-4">Loja e Identificação</th>
                    <th className="py-3 px-4">REDE / BANDEIRA</th>
                    <th className="py-3 px-4">Cidade / UF</th>
                    <th className="py-3 px-4 text-center">Clientes</th>
                    <th className="py-3 px-4 text-center">Validades Ativas</th>
                    <th className="py-3 px-4 text-center">Rupturas Ativas</th>
                    <th className="py-3 px-4 text-center">Produtos</th>
                    <th className="py-3 px-4 text-right">Qtd Total</th>
                    <th className="py-3 px-4 text-center">Status Crítico</th>
                    <th className="py-3 px-4 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {paginatedStores.map((store) => {
                    return (
                      <tr
                        key={store.storeId}
                        onClick={() => navigate(`/lojas/${encodeURIComponent(store.storeId)}`)}
                        className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                      >
                        {/* Apresentação global de 2 linhas */}
                        <td className="py-3 px-4 font-medium text-slate-900">
                          <div className="font-bold text-slate-900 text-sm group-hover:text-indigo-600 transition-colors">
                            {formatStoreIdentity({
                              codigo_loja: store.storeCode,
                              nome_loja: store.storeName,
                            })}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1">
                            <Building2 className="w-3 h-3 text-slate-400" />
                            <span>{store.networkName}</span>
                            <span>•</span>
                            <MapPin className="w-3 h-3 text-slate-400" />
                            <span>{formatCityUf(store.city, store.state)}</span>
                          </div>
                        </td>

                        <td className="py-3 px-4 text-slate-700 font-semibold">
                          {store.networkName}
                        </td>

                        <td className="py-3 px-4 text-slate-600">
                          {formatCityUf(store.city, store.state)}
                        </td>

                        <td className="py-3 px-4 text-center">
                          <Badge
                            variant="outline"
                            className="bg-slate-50 text-slate-700 font-semibold border-slate-200"
                          >
                            {store.totalClientes}
                          </Badge>
                        </td>

                        <td className="py-3 px-4 text-center">
                          <Badge
                            variant="outline"
                            className={
                              store.totalOcorrenciasAtivas > 0
                                ? 'bg-amber-50 text-amber-800 border-amber-200 font-bold'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold'
                            }
                          >
                            {store.totalOcorrenciasAtivas}
                          </Badge>
                        </td>

                        <td className="py-3 px-4 text-center">
                          <Badge
                            variant="outline"
                            className={
                              store.totalRupturasAtivas > 0
                                ? 'bg-red-50 text-red-700 border-red-200 font-bold'
                                : 'bg-slate-50 text-slate-500 border-slate-200 font-medium'
                            }
                          >
                            {store.totalRupturasAtivas}
                          </Badge>
                        </td>

                        <td className="py-3 px-4 text-center text-slate-700 font-medium">
                          {store.totalProdutos}
                        </td>

                        <td className="py-3 px-4 text-right font-bold text-slate-900">
                          {store.totalQuantidade.toLocaleString('pt-BR')} un
                        </td>

                        <td className="py-3 px-4 text-center">
                          <StatusBadge
                            variant={
                              store.statusMaisCritico === 'Crítico'
                                ? 'critico'
                                : store.statusMaisCritico === 'Atenção'
                                  ? 'alto'
                                  : store.statusMaisCritico === 'Moderado'
                                    ? 'medio'
                                    : 'ok'
                            }
                          >
                            {store.statusMaisCritico}
                          </StatusBadge>
                        </td>

                        <td className="py-3 px-4 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`Ver detalhes da loja ${store.storeName}`}
                            className="h-7 w-7 p-0 rounded-lg text-slate-400 group-hover:text-indigo-600 group-hover:bg-indigo-50"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Rodapé de Paginação */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 bg-slate-50/70 border-t border-slate-200 text-xs text-slate-600">
              <div>
                Mostrando{' '}
                <span className="font-semibold text-slate-900">
                  {totalItems === 0 ? 0 : startIndex + 1}
                </span>
                –<span className="font-semibold text-slate-900">{endIndex}</span> de{' '}
                <span className="font-semibold text-slate-900">{totalItems}</span> lojas
              </div>

              <div className="flex items-center gap-2">
                <span className="text-slate-500 mr-2">
                  Página <span className="font-semibold text-slate-900">{safeCurrentPage}</span> de{' '}
                  <span className="font-semibold text-slate-900">{totalPages}</span>
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={safeCurrentPage <= 1}
                  aria-label="Página anterior"
                  className="h-8 px-2.5 text-xs gap-1 border-slate-200"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Anterior</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safeCurrentPage >= totalPages}
                  aria-label="Próxima página"
                  className="h-8 px-2.5 text-xs gap-1 border-slate-200"
                >
                  <span>Próxima</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
