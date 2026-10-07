import React, { useMemo } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Store,
  Package,
  Factory,
  AlertOctagon,
  AlertTriangle,
  Clock,
  ExternalLink,
  ChevronRight,
  ShieldAlert,
  FileText,
  Calendar,
  Layers,
  MapPin,
} from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { formatStoreIdentityTable, formatCityUf, navigateToStore } from '@/lib/format/storeIdentity'
import { formatDisplayDate } from '@/lib/format/dateParser'
import type { ValidadeItem, Ruptura } from '@/types'

export type ContextPanelType = 'store' | 'product' | 'industry' | null

export interface ContextPanelTarget {
  type: ContextPanelType
  id: string // storeId / productKey / industryName
  label?: string
  sublabel?: string
}

interface ContextPanelProps {
  target: ContextPanelTarget | null
  onClose: () => void
  validades: ValidadeItem[]
  rupturas: Ruptura[]
}

export const ContextPanel: React.FC<ContextPanelProps> = ({
  target,
  onClose,
  validades,
  rupturas,
}) => {
  const navigate = useNavigate()
  const isOpen = target !== null && target.type !== null

  // 1. Painel de Loja
  const storeContext = useMemo(() => {
    if (!target || target.type !== 'store') return null

    const targetId = target.id.toLowerCase()

    // Filtra ocorrências da loja
    const storeValidades = validades.filter((v) => {
      const code = (v.codigoLoja || '').toLowerCase()
      const name = (v.loja || '').toLowerCase()
      const comp = `${code}|${name}`
      return (
        v.id === target.id ||
        code === targetId ||
        name === targetId ||
        comp === targetId ||
        target.id.includes(code && code !== 'sem_codigo' ? code : '___') ||
        (name && targetId.includes(name))
      )
    })

    const storeRupturas = rupturas.filter((r) => {
      const code = (r.codigo_loja || '').toLowerCase()
      const name = (r.nome_loja || '').toLowerCase()
      const comp = `${code}|${name}`
      return (
        r.id === target.id ||
        code === targetId ||
        name === targetId ||
        comp === targetId ||
        target.id.includes(code && code !== 'sem_codigo' ? code : '___') ||
        (name && targetId.includes(name))
      )
    })

    // Metadados da loja
    const firstV = storeValidades[0]
    const firstR = storeRupturas[0]
    const storeCode = firstV?.codigoLoja || firstR?.codigo_loja || ''
    const storeName = firstV?.loja || firstR?.nome_loja || target.label || 'Loja'
    const network = firstV?.rede || 'Rede não informada'
    const city = firstV?.cidade || firstR?.cidade || ''
    const uf = firstV?.uf || firstR?.estado || ''

    // Dimensões de saúde operacional
    const criticasValidades = storeValidades.filter((v) => v.diasRestantes <= 15)
    const atencaoValidades = storeValidades.filter(
      (v) => v.diasRestantes >= 16 && v.diasRestantes <= 20,
    )
    const ativasRupturas = storeRupturas.filter((r) => r.situacao_atual === 'Ativo')

    // Dimensão Atualização (baseado na data mais recente de entrada/arquivo)
    const dates = [
      ...storeValidades.map((v) => v.dataEntrada || v.ultimaAtualizacao || v.realizado),
      ...storeRupturas.map((r) => r.data_visita || r.data_entrada),
    ].filter(Boolean) as string[]

    const lastDate = dates.sort().reverse()[0]

    return {
      storeCode,
      storeName,
      network,
      city,
      uf,
      storeValidades,
      criticasValidades,
      atencaoValidades,
      ativasRupturas,
      lastDate,
    }
  }, [target, validades, rupturas])

  // 2. Painel de Produto
  const productContext = useMemo(() => {
    if (!target || target.type !== 'product') return null

    const prodQuery = target.id.trim().toUpperCase()

    const prodValidades = validades.filter(
      (v) => (v.product || '').trim().toUpperCase() === prodQuery,
    )
    const prodRupturas = rupturas.filter(
      (r) => (r.produto || '').trim().toUpperCase() === prodQuery,
    )

    const criticasValidades = prodValidades.filter((v) => v.diasRestantes <= 15)
    const atencaoValidades = prodValidades.filter(
      (v) => v.diasRestantes >= 16 && v.diasRestantes <= 20,
    )
    const ativasRupturas = prodRupturas.filter((r) => r.situacao_atual === 'Ativo')

    // Lojas afetadas
    const storeMap = new Map<
      string,
      {
        storeCode: string
        storeName: string
        city: string
        uf: string
        validades: ValidadeItem[]
        rupturas: Ruptura[]
      }
    >()

    for (const v of prodValidades) {
      const code = v.codigoLoja || 'SEM_CODIGO'
      const key = `${code}|${(v.loja || '').toUpperCase()}`
      let entry = storeMap.get(key)
      if (!entry) {
        entry = {
          storeCode: v.codigoLoja || '',
          storeName: v.loja || '',
          city: v.cidade || '',
          uf: v.uf || '',
          validades: [],
          rupturas: [],
        }
        storeMap.set(key, entry)
      }
      entry.validades.push(v)
    }

    for (const r of prodRupturas) {
      const code = r.codigo_loja || 'SEM_CODIGO'
      const key = `${code}|${(r.nome_loja || '').toUpperCase()}`
      let entry = storeMap.get(key)
      if (!entry) {
        entry = {
          storeCode: r.codigo_loja || '',
          storeName: r.nome_loja || '',
          city: r.cidade || '',
          uf: r.estado || '',
          validades: [],
          rupturas: [],
        }
        storeMap.set(key, entry)
      }
      entry.rupturas.push(r)
    }

    const storesList = Array.from(storeMap.values()).sort(
      (a, b) => b.validades.length + b.rupturas.length - (a.validades.length + a.rupturas.length),
    )

    const cliente = prodValidades[0]?.cliente || prodRupturas[0]?.cliente || 'Marca não informada'
    const categoria = prodValidades[0]?.category || prodRupturas[0]?.categoria || 'Geral'

    return {
      productName: target.label || prodQuery,
      cliente,
      categoria,
      totalLojas: storeMap.size,
      criticasValidades,
      atencaoValidades,
      ativasRupturas,
      storesList,
    }
  }, [target, validades, rupturas])

  // 3. Painel de Indústria / Marca
  const industryContext = useMemo(() => {
    if (!target || target.type !== 'industry') return null

    const indQuery = target.id.trim().toUpperCase()

    const indValidades = validades.filter(
      (v) =>
        (v.cliente || '').trim().toUpperCase() === indQuery ||
        (v.industria || '').trim().toUpperCase() === indQuery,
    )

    const indRupturas = rupturas.filter((r) => (r.cliente || '').trim().toUpperCase() === indQuery)

    const criticasValidades = indValidades.filter((v) => v.diasRestantes <= 15)
    const atencaoValidades = indValidades.filter(
      (v) => v.diasRestantes >= 16 && v.diasRestantes <= 20,
    )
    const ativasRupturas = indRupturas.filter((r) => r.situacao_atual === 'Ativo')

    // Produtos distintos
    const produtosSet = new Set<string>()
    indValidades.forEach((v) => v.product && produtosSet.add(v.product.trim()))
    indRupturas.forEach((r) => r.produto && produtosSet.add(r.produto.trim()))

    // Lojas distintas
    const lojasSet = new Set<string>()
    indValidades.forEach((v) => {
      const label = formatStoreIdentityTable({ codigoLoja: v.codigoLoja, nomeLoja: v.loja })
      if (label) lojasSet.add(label)
    })
    indRupturas.forEach((r) => {
      const label = formatStoreIdentityTable({ codigoLoja: r.codigo_loja, nomeLoja: r.nome_loja })
      if (label) lojasSet.add(label)
    })

    return {
      industryName: target.label || indQuery,
      totalValidades: indValidades.length,
      totalRupturas: indRupturas.length,
      criticasValidades,
      atencaoValidades,
      ativasRupturas,
      totalProdutos: produtosSet.size,
      totalLojas: lojasSet.size,
    }
  }, [target, validades, rupturas])

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl md:max-w-2xl overflow-y-auto p-0 flex flex-col bg-slate-50 text-slate-900 border-l border-slate-200"
      >
        {/* Header do Painel */}
        <div className="p-6 bg-white border-b border-slate-200 sticky top-0 z-10">
          <SheetHeader className="text-left space-y-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                {target?.type === 'store' && <Store className="w-3.5 h-3.5" />}
                {target?.type === 'product' && <Package className="w-3.5 h-3.5" />}
                {target?.type === 'industry' && <Factory className="w-3.5 h-3.5" />}
                {target?.type === 'store' && 'Contexto de Loja'}
                {target?.type === 'product' && 'Contexto de Produto'}
                {target?.type === 'industry' && 'Contexto de Indústria'}
              </span>
            </div>
            <SheetTitle className="text-lg font-bold text-slate-900 leading-tight">
              {target?.type === 'store' &&
                formatStoreIdentityTable({
                  codigoLoja: storeContext?.storeCode,
                  nomeLoja: storeContext?.storeName,
                })}
              {target?.type === 'product' && productContext?.productName}
              {target?.type === 'industry' && industryContext?.industryName}
            </SheetTitle>
            <SheetDescription className="text-xs text-slate-500">
              {target?.type === 'store' &&
                `${storeContext?.network || 'Rede'} • ${formatCityUf(storeContext?.city || '', storeContext?.uf || '')}`}
              {target?.type === 'product' &&
                `${productContext?.cliente} • ${productContext?.categoria} • Presente em ${productContext?.totalLojas} loja(s)`}
              {target?.type === 'industry' &&
                `${industryContext?.totalProdutos} produtos ativos monitorados em ${industryContext?.totalLojas} lojas`}
            </SheetDescription>
          </SheetHeader>
        </div>

        {/* Corpo do Painel */}
        <div className="flex-1 p-6 space-y-6">
          {/* ========================================================================= */}
          {/* CASO 1: CONTEXTO DE LOJA                                                  */}
          {/* ========================================================================= */}
          {target?.type === 'store' && storeContext && (
            <div className="space-y-6">
              {/* Saúde Operacional por Dimensão */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                  Saúde Operacional por Dimensão
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Dimensão 1: Validade */}
                  <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Validade
                    </span>
                    <div className="mt-1.5 flex items-center justify-between">
                      <span className="text-xl font-bold text-slate-900">
                        {storeContext.criticasValidades.length +
                          storeContext.atencaoValidades.length}
                      </span>
                      {storeContext.criticasValidades.length > 0 ? (
                        <Badge className="bg-red-50 text-red-700 border-red-200 text-[10px] font-semibold">
                          Crítico
                        </Badge>
                      ) : storeContext.atencaoValidades.length > 0 ? (
                        <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] font-semibold">
                          Atenção
                        </Badge>
                      ) : (
                        <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-semibold">
                          Normal
                        </Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      {storeContext.criticasValidades.length} críticas (0–15d) •{' '}
                      {storeContext.atencaoValidades.length} atenção (16–20d)
                    </p>
                  </div>

                  {/* Dimensão 2: Ruptura */}
                  <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Ruptura
                    </span>
                    <div className="mt-1.5 flex items-center justify-between">
                      <span className="text-xl font-bold text-slate-900">
                        {storeContext.ativasRupturas.length}
                      </span>
                      {storeContext.ativasRupturas.length > 0 ? (
                        <Badge className="bg-amber-50 text-amber-800 border-amber-200 text-[10px] font-semibold">
                          Ativa
                        </Badge>
                      ) : (
                        <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-semibold">
                          Zero
                        </Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      {storeContext.ativasRupturas.length > 0
                        ? `${storeContext.ativasRupturas.length} item(ns) em falta`
                        : 'Sem ocorrências ativas'}
                    </p>
                  </div>

                  {/* Dimensão 3: Atualização */}
                  <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Atualizações
                    </span>
                    <div className="mt-1.5 flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-800 truncate">
                        {formatDisplayDate(storeContext.lastDate, 'Sem dados')}
                      </span>
                      {storeContext.lastDate ? (
                        <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-semibold">
                          Normal
                        </Badge>
                      ) : (
                        <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] font-semibold">
                          Atenção
                        </Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      {storeContext.lastDate
                        ? 'Pesquisas em acompanhamento'
                        : 'Aguardando atualização'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Lista de Validades Críticas / Atenção na Loja */}
              <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                  <div className="flex items-center gap-2">
                    <AlertOctagon className="w-4 h-4 text-red-600" />
                    <h5 className="text-xs font-bold text-slate-900">
                      Validades Críticas &amp; Atenção (
                      {storeContext.criticasValidades.length + storeContext.atencaoValidades.length}
                      )
                    </h5>
                  </div>
                </div>

                {storeContext.criticasValidades.length === 0 &&
                storeContext.atencaoValidades.length === 0 ? (
                  <p className="text-xs text-slate-500 py-3 text-center">
                    Nenhum produto vencendo nos próximos 20 dias nesta loja.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 max-h-56 overflow-y-auto pr-1">
                    {[...storeContext.criticasValidades, ...storeContext.atencaoValidades].map(
                      (item) => (
                        <div
                          key={item.id}
                          className="py-2 flex items-center justify-between text-xs"
                        >
                          <div className="truncate pr-2">
                            <p className="font-semibold text-slate-900 truncate">{item.product}</p>
                            <p className="text-[11px] text-slate-500">
                              {item.cliente || 'Marca'} • Vence em{' '}
                              {formatDisplayDate(item.validade, '—')}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Badge
                              variant="outline"
                              className={
                                item.diasRestantes <= 15
                                  ? 'bg-red-50 text-red-700 border-red-200 font-bold'
                                  : 'bg-amber-50 text-amber-700 border-amber-200 font-semibold'
                              }
                            >
                              {item.diasRestantes}d
                            </Badge>
                          </div>
                        </div>
                      ),
                    )}
                  </div>
                )}
              </div>

              {/* Lista de Rupturas Ativas na Loja */}
              <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <h5 className="text-xs font-bold text-slate-900">
                      Rupturas Ativas ({storeContext.ativasRupturas.length})
                    </h5>
                  </div>
                </div>

                {storeContext.ativasRupturas.length === 0 ? (
                  <p className="text-xs text-slate-500 py-3 text-center">
                    Nenhuma ruptura ativa registrada para esta loja.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 max-h-56 overflow-y-auto pr-1">
                    {storeContext.ativasRupturas.map((item) => (
                      <div key={item.id} className="py-2 flex items-center justify-between text-xs">
                        <div className="truncate pr-2">
                          <p className="font-semibold text-slate-900 truncate">{item.produto}</p>
                          <p className="text-[11px] text-slate-500">
                            {item.cliente || 'Marca'} • {item.motivo || 'Ruptura'}
                          </p>
                        </div>
                        <Badge
                          variant="outline"
                          className="bg-amber-50 text-amber-800 border-amber-200 font-bold shrink-0"
                        >
                          {item.dias_em_ruptura ?? 0}d
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Espaços preparados e desativados (Ocorrências, NF/Devolução, Histórico) */}
              <div className="space-y-3 pt-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Processos Futuros &amp; Governança
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 opacity-60">
                  <div className="bg-white p-3 rounded-xl border border-dashed border-slate-300">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-slate-600">
                        <ShieldAlert className="w-4 h-4 text-slate-400" />
                        <span className="text-xs font-semibold">Ocorrências Operacionais</span>
                      </div>
                      <Badge
                        variant="outline"
                        className="text-[10px] text-slate-500 border-slate-300"
                      >
                        Em breve
                      </Badge>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Registro de ocorrências em loja sem inventar dados.
                    </p>
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-dashed border-slate-300">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-slate-600">
                        <FileText className="w-4 h-4 text-slate-400" />
                        <span className="text-xs font-semibold">
                          Solicitações de NF / Devolução
                        </span>
                      </div>
                      <Badge
                        variant="outline"
                        className="text-[10px] text-slate-500 border-slate-300"
                      >
                        Em breve
                      </Badge>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Controle de notas fiscais e trocas pendentes.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* CASO 2: CONTEXTO DE PRODUTO                                               */}
          {/* ========================================================================= */}
          {target?.type === 'product' && productContext && (
            <div className="space-y-6">
              {/* Saúde do Produto por Dimensão */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                  Situação do Produto na Rede
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Lojas Afetadas
                    </span>
                    <p className="text-2xl font-bold text-slate-900 mt-1">
                      {productContext.totalLojas}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Pontos de venda com registro
                    </p>
                  </div>

                  <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Validades Críticas
                    </span>
                    <p className="text-2xl font-bold text-red-600 mt-1">
                      {productContext.criticasValidades.length}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">0 a 15 dias para vencer</p>
                  </div>

                  <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Rupturas Ativas
                    </span>
                    <p className="text-2xl font-bold text-amber-700 mt-1">
                      {productContext.ativasRupturas.length}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">Lojas em desabastecimento</p>
                  </div>
                </div>
              </div>

              {/* Lista de Situação por Loja */}
              <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                  <h5 className="text-xs font-bold text-slate-900">
                    Situação nas Lojas ({productContext.storesList.length})
                  </h5>
                </div>

                <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto pr-1">
                  {productContext.storesList.map((st, idx) => {
                    const storeDisplay = formatStoreIdentityTable({
                      codigoLoja: st.storeCode,
                      nomeLoja: st.storeName,
                    })

                    const minDias = st.validades.length
                      ? Math.min(...st.validades.map((v) => v.diasRestantes))
                      : null

                    return (
                      <div
                        key={idx}
                        onClick={() =>
                          navigateToStore(
                            {
                              codigoLoja: st.storeCode,
                              nomeLoja: st.storeName,
                              cidade: st.city,
                              uf: st.uf,
                            },
                            navigate,
                          )
                        }
                        className="py-2.5 flex items-center justify-between text-xs hover:bg-slate-50/70 p-1.5 rounded-lg transition-colors cursor-pointer group"
                      >
                        <div className="truncate pr-2">
                          <p className="font-semibold text-slate-900 truncate">{storeDisplay}</p>
                          <p className="text-[11px] text-slate-500">
                            {formatCityUf(st.city, st.uf)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {minDias !== null && (
                            <Badge
                              variant="outline"
                              className={
                                minDias <= 15
                                  ? 'bg-red-50 text-red-700 border-red-200 font-bold'
                                  : 'bg-amber-50 text-amber-700 border-amber-200 font-semibold'
                              }
                            >
                              Validade: {minDias}d
                            </Badge>
                          )}
                          {st.rupturas.length > 0 && (
                            <Badge
                              variant="outline"
                              className="bg-amber-50 text-amber-800 border-amber-200 font-bold"
                            >
                              Ruptura ({st.rupturas.length})
                            </Badge>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Espaço desativado */}
              <div className="p-3 bg-white rounded-xl border border-dashed border-slate-300 opacity-60">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-600">
                    Histórico de Pedidos &amp; Devoluções
                  </span>
                  <Badge variant="outline" className="text-[10px] text-slate-500 border-slate-300">
                    Em breve
                  </Badge>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Módulo de rastreamento de notas fiscais e logística reversa por SKU.
                </p>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* CASO 3: CONTEXTO DE INDÚSTRIA                                             */}
          {/* ========================================================================= */}
          {target?.type === 'industry' && industryContext && (
            <div className="space-y-6">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                  Resumo da Marca / Indústria
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Validades em Risco
                    </span>
                    <p className="text-2xl font-bold text-red-600 mt-1">
                      {industryContext.criticasValidades.length +
                        industryContext.atencaoValidades.length}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {industryContext.criticasValidades.length} críticas /{' '}
                      {industryContext.atencaoValidades.length} em atenção
                    </p>
                  </div>

                  <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Rupturas Ativas
                    </span>
                    <p className="text-2xl font-bold text-amber-700 mt-1">
                      {industryContext.ativasRupturas.length}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Desabastecimentos em monitoramento
                    </p>
                  </div>
                </div>
              </div>

              {/* Informações consolidadas */}
              <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
                <h5 className="text-xs font-bold text-slate-900 border-b border-slate-100 pb-2">
                  Abrangência na Operação
                </h5>
                <div className="grid grid-cols-2 gap-3 pt-1 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[11px]">Produtos distintos</span>
                    <strong className="text-slate-800 text-sm">
                      {industryContext.totalProdutos}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Lojas com presença</span>
                    <strong className="text-slate-800 text-sm">{industryContext.totalLojas}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">
                      Total ocorrências validade
                    </span>
                    <strong className="text-slate-800 text-sm">
                      {industryContext.totalValidades}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">
                      Total ocorrências ruptura
                    </span>
                    <strong className="text-slate-800 text-sm">
                      {industryContext.totalRupturas}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Link direto para a página de Indústrias */}
              <div className="pt-2">
                <Link
                  to={`/industrias?marca=${encodeURIComponent(industryContext.industryName)}`}
                  onClick={onClose}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs transition-colors shadow-2xs"
                >
                  <span>Ver visão completa desta indústria</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
