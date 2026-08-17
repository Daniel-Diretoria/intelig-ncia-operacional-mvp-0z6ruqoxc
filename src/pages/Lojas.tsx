import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Store,
  Search,
  Building2,
  MapPin,
  Users,
  AlertTriangle,
  Package,
  Boxes,
  ChevronRight,
  Filter,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react'
import { useLojas } from '@/services/useLojas'
import type { StatusOperacional } from '@/types'
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

export const LojasPage: React.FC = () => {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [networkFilter, setNetworkFilter] = useState('Todos')
  const [cityFilter, setCityFilter] = useState('Todos')
  const [stateFilter, setStateFilter] = useState('Todos')
  const [statusFilter, setStatusFilter] = useState('Todos')

  const { stores, filteredStores, isLoading, error, refetch } = useLojas({
    search,
    networkName: networkFilter,
    city: cityFilter,
    state: stateFilter,
    statusMaisCritico: statusFilter,
  })

  // Opções para os Selects
  const networks = Array.from(new Set(stores.map((s) => s.networkName))).sort()
  const cities = Array.from(new Set(stores.map((s) => s.city)))
    .filter(Boolean)
    .sort()
  const states = Array.from(new Set(stores.map((s) => s.state)))
    .filter(Boolean)
    .sort()

  const formatStoreCode = (code: string) => {
    if (!code) return '000'
    if (!isNaN(Number(code))) return code.padStart(3, '0')
    return code
  }

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
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 bg-slate-50 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="p-8 text-center text-red-600 text-sm">
            Erro ao carregar lojas: {error.message}
          </div>
        ) : filteredStores.length === 0 ? (
          <EmptyState
            title="Nenhuma loja encontrada"
            description="Tente ajustar os termos de busca ou limpar os filtros selecionados."
            className="py-12"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4">Loja e Identificação</th>
                  <th className="py-3 px-4">Rede / Grupo</th>
                  <th className="py-3 px-4">Cidade / UF</th>
                  <th className="py-3 px-4 text-center">Clientes</th>
                  <th className="py-3 px-4 text-center">Ocorrências Ativas</th>
                  <th className="py-3 px-4 text-center">Produtos</th>
                  <th className="py-3 px-4 text-right">Qtd Total</th>
                  <th className="py-3 px-4 text-center">Status Crítico</th>
                  <th className="py-3 px-4 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredStores.map((store) => {
                  const formattedCode = formatStoreCode(store.storeCode)
                  return (
                    <tr
                      key={store.storeId}
                      onClick={() => navigate(`/lojas/${encodeURIComponent(store.storeId)}`)}
                      className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                    >
                      {/* Apresentação global de 2 linhas */}
                      <td className="py-3 px-4 font-medium text-slate-900">
                        <div className="font-bold text-slate-900 text-sm group-hover:text-indigo-600 transition-colors">
                          {formattedCode} • {store.storeName}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1">
                          <Building2 className="w-3 h-3 text-slate-400" />
                          <span>{store.networkName}</span>
                          <span>•</span>
                          <MapPin className="w-3 h-3 text-slate-400" />
                          <span>
                            {store.city}/{store.state}
                          </span>
                        </div>
                      </td>

                      <td className="py-3 px-4 text-slate-600 font-medium">{store.networkName}</td>

                      <td className="py-3 px-4 text-slate-600">
                        {store.city} / {store.state}
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
        )}
      </div>
    </div>
  )
}
