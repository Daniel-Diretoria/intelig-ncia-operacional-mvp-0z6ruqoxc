import React, { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  Store,
  ArrowLeft,
  Building2,
  MapPin,
  Users,
  Package,
  Boxes,
  ShieldAlert,
  CalendarCheck,
  History,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Info,
  ChevronRight,
  ExternalLink,
} from 'lucide-react'
import { useLojas, type StoreEntity } from '@/services/useLojas'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { StatusBadge } from '@/components/ui/status-badge'
import { CriticidadeBadge } from '@/components/validades/CriticidadeBadge'
import { formatStoreIdentity, formatCityUf } from '@/lib/selectors'
import { EmptyState } from '@/components/ui/empty-state'
import type { ValidadeItem, Ruptura } from '@/types'
import { OccurrenceDetailModal } from '@/components/validades/OccurrenceDetailModal'
import { formatDisplayDate } from '@/lib/format/dateParser'
import { RupturaDetailModal } from '@/components/rupturas/RupturaDetailModal'
import { StoreRupturasTab } from '@/components/rupturas/StoreRupturasTab'

export const StoreDetailPage: React.FC = () => {
  const { storeId } = useParams<{ storeId: string }>()
  const navigate = useNavigate()
  const { stores, isLoading, error, getStoreById } = useLojas()

  const [selectedOccurrence, setSelectedOccurrence] = useState<ValidadeItem | null>(null)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [selectedRuptura, setSelectedRuptura] = useState<Ruptura | null>(null)
  const [isRupturaModalOpen, setIsRupturaModalOpen] = useState(false)

  const store = getStoreById(storeId || '')

  if (isLoading) {
    return (
      <div className="p-8 space-y-4">
        <div className="h-8 w-48 bg-slate-100 rounded animate-pulse" />
        <div className="h-32 bg-slate-100 rounded-xl animate-pulse" />
        <div className="h-64 bg-slate-100 rounded-xl animate-pulse" />
      </div>
    )
  }

  if (!store) {
    return (
      <div className="p-8 text-center space-y-4">
        <EmptyState
          title="Loja não encontrada"
          description="Não foi possível localizar o cadastro para a loja especificada."
        />
        <Button onClick={() => navigate('/lojas')} variant="outline">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Voltar para Lojas
        </Button>
      </div>
    )
  }

  const handleOpenDetail = (item: ValidadeItem) => {
    setSelectedOccurrence(item)
    setIsDetailModalOpen(true)
  }

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Botão Voltar e Navegação */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/lojas')}
          className="text-slate-600 hover:text-slate-900 gap-1.5 h-8 text-xs font-medium"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Voltar para Lista de Lojas</span>
        </Button>
      </div>

      {/* Header do Cartão de Identificação da Loja */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-2xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
              <Store className="w-6 h-6" />
            </div>
            <div>
              {/* Linha 1: Código • Nome */}
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                {formatStoreIdentity({
                  codigo_loja: store.storeCode,
                  nome_loja: store.storeName,
                  razao_social: store.razaoSocial,
                })}
              </h1>
              {/* Linha 2: Rede • Cidade/UF */}
              <div className="text-xs text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-slate-700 flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5 text-slate-400" />
                  {store.networkName}
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  {formatCityUf(store.city, store.state)}
                </span>
                {store.razaoSocial && (
                  <>
                    <span>•</span>
                    <span className="text-slate-400">Razão: {store.razaoSocial}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto">
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
              Status Operacional: {store.statusMaisCritico}
            </StatusBadge>
          </div>
        </div>

        {/* Mini Métricas da Loja */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-4 border-t border-slate-100 text-xs">
          <div className="bg-slate-50/80 p-3 rounded-lg border border-slate-100">
            <span className="text-slate-500 font-medium text-[11px] block">Clientes Atendidos</span>
            <span className="text-base font-bold text-slate-900 mt-0.5 block">
              {store.totalClientes}
            </span>
          </div>

          <div className="bg-slate-50/80 p-3 rounded-lg border border-slate-100">
            <span className="text-slate-500 font-medium text-[11px] block">Validades Ativas</span>
            <span className="text-base font-bold text-amber-700 mt-0.5 block">
              {store.totalOcorrenciasAtivas}
            </span>
          </div>

          <div className="bg-slate-50/80 p-3 rounded-lg border border-slate-100">
            <span className="text-slate-500 font-medium text-[11px] block">Rupturas Ativas</span>
            <span className="text-base font-bold text-red-700 mt-0.5 block">
              {store.totalRupturasAtivas}
            </span>
          </div>

          <div className="bg-slate-50/80 p-3 rounded-lg border border-slate-100">
            <span className="text-slate-500 font-medium text-[11px] block">
              Produtos Monitorados
            </span>
            <span className="text-base font-bold text-slate-900 mt-0.5 block">
              {store.totalProdutos}
            </span>
          </div>

          <div className="bg-slate-50/80 p-3 rounded-lg border border-slate-100">
            <span className="text-slate-500 font-medium text-[11px] block">Volume em Estoque</span>
            <span className="text-base font-bold text-slate-900 mt-0.5 block">
              {store.totalQuantidade.toLocaleString('pt-BR')} un
            </span>
          </div>
        </div>
      </div>

      {/* Navegação por Abas Internas da Loja */}
      <Tabs defaultValue="validades" className="w-full">
        <TabsList className="bg-white border border-slate-200 p-1 rounded-xl shadow-2xs mb-4 flex gap-1 flex-wrap">
          <TabsTrigger value="validades" className="gap-2 text-xs font-semibold py-2 px-4">
            <CalendarCheck className="w-4 h-4 text-indigo-600" />
            <span>Resumo / Validades ({store.itemsAtivos.length})</span>
          </TabsTrigger>
          <TabsTrigger value="rupturas" className="gap-2 text-xs font-semibold py-2 px-4">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <span>Rupturas</span>
          </TabsTrigger>
          <TabsTrigger value="auditoria" className="gap-2 text-xs font-semibold py-2 px-4">
            <ShieldAlert className="w-4 h-4 text-red-600" />
            <span>Auditoria de Vencidos ({store.itemsAuditoria.length})</span>
          </TabsTrigger>
          <TabsTrigger value="historico" className="gap-2 text-xs font-semibold py-2 px-4">
            <History className="w-4 h-4 text-slate-600" />
            <span>Histórico</span>
          </TabsTrigger>
        </TabsList>

        {/* ABA 1: Resumo e Produtos em Risco (Apenas Ativos com dias > 0) */}
        <TabsContent value="validades" className="space-y-4">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">
                Produtos em Risco e Validades Críticas Iminentes
              </h3>
              <span className="text-xs text-slate-500">
                Apenas ocorrências com dias para vencer {'>'} 0
              </span>
            </div>

            {store.itemsAtivos.length === 0 ? (
              <EmptyState
                title="Nenhum produto em risco ativo"
                description="Esta loja não possui ocorrências com vencimento iminente no momento."
                className="py-8"
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      <th className="py-2.5 px-3">Produto / SKU</th>
                      <th className="py-2.5 px-3">Cliente / Indústria</th>
                      <th className="py-2.5 px-3">Lote</th>
                      <th className="py-2.5 px-3">Validade</th>
                      <th className="py-2.5 px-3 text-center">Dias Restantes</th>
                      <th className="py-2.5 px-3 text-right">Qtd Estoque</th>
                      <th className="py-2.5 px-3 text-center">Promotor</th>
                      <th className="py-2.5 px-3 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {store.itemsAtivos.map((item) => (
                      <tr
                        key={item.id}
                        onClick={() => handleOpenDetail(item)}
                        className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                      >
                        <td className="py-3 px-3">
                          <div className="font-bold text-slate-900">{item.product}</div>
                          <div className="text-[11px] text-slate-400">SKU: {item.sku}</div>
                        </td>
                        <td className="py-3 px-3 text-slate-600">
                          <div>{item.cliente || '—'}</div>
                          <div className="text-[11px] text-slate-400">{item.industria}</div>
                        </td>
                        <td className="py-3 px-3 text-slate-600 font-mono text-[11px]">
                          {item.lote || '—'}
                        </td>
                        <td className="py-3 px-3 font-medium text-slate-900">
                          {formatDisplayDate(item.validade, '—')}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <CriticidadeBadge
                            level={
                              item.status === 'Vencido'
                                ? 'Vencido'
                                : item.status === 'Crítico'
                                  ? 'Crítico'
                                  : 'Atenção'
                            }
                            diasRestantes={item.diasRestantes}
                          />
                        </td>
                        <td className="py-3 px-3 text-right font-bold text-slate-900">
                          {item.estoque} UN
                        </td>
                        <td className="py-3 px-3 text-center text-slate-600 text-[11px]">
                          {item.promotor || '—'}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-indigo-600 hover:text-indigo-700 font-semibold"
                          >
                            Drill-down
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ABA 2: Rupturas da Loja */}
        <TabsContent value="rupturas" className="space-y-4">
          <StoreRupturasTab
            storeCode={store.storeCode}
            onSelectRuptura={(rup) => {
              setSelectedRuptura(rup)
              setIsRupturaModalOpen(true)
            }}
          />
        </TabsContent>

        {/* ABA 3: Auditoria de Vencidos (Isolamento completo: dias <= 0) */}
        <TabsContent value="auditoria" className="space-y-4">
          <div className="bg-red-50/40 p-4 rounded-xl border border-red-200/80 flex items-start gap-3 text-xs">
            <ShieldAlert className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-red-900">Isolamento de Ocorrências Vencidas</p>
              <p className="text-red-700 mt-0.5">
                Esta aba consolida todas as ocorrências de produtos com data de validade expirada
                (dias ≤ 0). Esses itens não contabilizam nas listagens ativas e permanecem restritos
                à auditoria para verificação/correção por promotores ou supervisores.
              </p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">
                Itens Vencidos Auditáveis ({store.itemsAuditoria.length})
              </h3>
              <Link
                to="/auditoria"
                className="text-xs text-indigo-600 hover:underline font-semibold flex items-center gap-1"
              >
                <span>Ir para Painel de Auditoria Global</span>
                <ExternalLink className="w-3 h-3" />
              </Link>
            </div>

            {store.itemsAuditoria.length === 0 ? (
              <EmptyState
                title="Nenhum item vencido na auditoria"
                description="Não há ocorrências expiradas para esta loja no momento."
                className="py-8"
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      <th className="py-2.5 px-3">Produto / SKU</th>
                      <th className="py-2.5 px-3">Cliente</th>
                      <th className="py-2.5 px-3">Validade Expirada</th>
                      <th className="py-2.5 px-3 text-center">Dias Vencido</th>
                      <th className="py-2.5 px-3 text-right">Quantidade</th>
                      <th className="py-2.5 px-3 text-center">Promotor</th>
                      <th className="py-2.5 px-3 text-right">Ação Auditoria</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {store.itemsAuditoria.map((item) => (
                      <tr
                        key={item.id}
                        onClick={() => handleOpenDetail(item)}
                        className="hover:bg-red-50/30 transition-colors cursor-pointer"
                      >
                        <td className="py-3 px-3">
                          <div className="font-bold text-slate-900">{item.product}</div>
                          <div className="text-[11px] text-slate-400">SKU: {item.sku}</div>
                        </td>
                        <td className="py-3 px-3 text-slate-600">{item.cliente || '—'}</td>
                        <td className="py-3 px-3 font-medium text-red-700">
                          {formatDisplayDate(item.validade, '—')}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <Badge
                            variant="outline"
                            className="bg-red-100 text-red-800 border-red-200 font-bold"
                          >
                            {Math.abs(item.diasRestantes)} dias atrás
                          </Badge>
                        </td>
                        <td className="py-3 px-3 text-right font-bold text-slate-900">
                          {item.estoque} UN
                        </td>
                        <td className="py-3 px-3 text-center text-slate-600 text-[11px]">
                          {item.promotor || '—'}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs text-red-700 border-red-200 hover:bg-red-50"
                          >
                            Auditar
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ABA 3: Histórico e Rastreabilidade do Arquivo de Origem */}
        <TabsContent value="historico" className="space-y-4">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <FileText className="w-4 h-4 text-indigo-600" />
              <h3 className="text-sm font-bold text-slate-900">
                Auditoria de Origem e Arquivo Processado
              </h3>
            </div>

            <div className="space-y-3 text-xs text-slate-600">
              <p>
                Drill-down completo de origem dos dados registrados para a loja{' '}
                <strong className="text-slate-900">
                  {formatStoreIdentity({
                    codigo_loja: store.storeCode,
                    nome_loja: store.storeName,
                    razao_social: store.razaoSocial,
                  })}
                </strong>
                :
              </p>

              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-2 font-mono text-[11px]">
                <div className="flex justify-between border-b border-slate-200/60 pb-1.5">
                  <span className="text-slate-500">Fonte de Ingestão:</span>
                  <span className="font-bold text-slate-800">
                    Pipeline TradePro / Importação Excel
                  </span>
                </div>
                <div className="flex justify-between border-b border-slate-200/60 pb-1.5">
                  <span className="text-slate-500">Chave de Agrupamento:</span>
                  <span className="font-bold text-slate-800">
                    {formatStoreIdentity({
                      codigo_loja: store.storeCode,
                      nome_loja: store.storeName,
                      razao_social: store.razaoSocial,
                    })}
                  </span>
                </div>
                <div className="flex justify-between border-b border-slate-200/60 pb-1.5">
                  <span className="text-slate-500">Total de Registros na Base Atual:</span>
                  <span className="font-bold text-slate-800">
                    {store.itemsAtivos.length + store.itemsAuditoria.length} linhas
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Última Sincronização:</span>
                  <span className="font-bold text-slate-800">
                    {new Date().toLocaleDateString('pt-BR')} (Processado)
                  </span>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Modal de Drill-Down Detalhado da Ocorrência */}
      {selectedOccurrence && (
        <OccurrenceDetailModal
          item={selectedOccurrence}
          isOpen={isDetailModalOpen}
          onClose={() => {
            setIsDetailModalOpen(false)
            setSelectedOccurrence(null)
          }}
        />
      )}

      {/* Modal de Detalhe da Ruptura */}
      {selectedRuptura && (
        <RupturaDetailModal
          item={selectedRuptura}
          isOpen={isRupturaModalOpen}
          onClose={() => {
            setIsRupturaModalOpen(false)
            setSelectedRuptura(null)
          }}
        />
      )}
    </div>
  )
}
