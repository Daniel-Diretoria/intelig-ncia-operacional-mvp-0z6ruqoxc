import React, { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  AlertOctagon,
  AlertTriangle,
  Clock,
  ArrowRight,
  Store,
  Package,
  Layers,
  Sparkles,
  ChevronRight,
  ShieldAlert,
  FileText,
  CalendarCheck,
  Building2,
  ExternalLink,
  Info,
} from 'lucide-react'
import { useValidades } from '@/services/useValidades'
import { useRupturas } from '@/services/useRupturas'
import { useOperationalTracking } from '@/services/useOperationalTracking'
import { useOperacionalVisitas } from '@/hooks/useOperacionalVisitas'
import { TrackingTratativaModal } from '@/components/tracking/TrackingTratativaModal'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { OperationalTrackingItem } from '@/types/operationalTracking'
import {
  formatStoreIdentityTable,
  formatCityUf,
  parseCityUf,
  deriveNetworkName,
  navigateToStore,
} from '@/lib/format/storeIdentity'
import { formatDisplayDate } from '@/lib/format/dateParser'
import { ContextPanel, type ContextPanelTarget } from '@/components/common/ContextPanel'
import { BaseEmReconstrucaoBanner } from '@/components/common/BaseEmReconstrucaoBanner'
import type { ValidadeItem, Ruptura } from '@/types'

export const CentralDeTrabalhoPage: React.FC = () => {
  const navigate = useNavigate()
  const [panelTarget, setPanelTarget] = useState<ContextPanelTarget | null>(null)
  const [trackingModalItem, setTrackingModalItem] = useState<OperationalTrackingItem | null>(null)

  const { data: validades, isLoading: isLoadingValidades } = useValidades()
  const { filteredRupturas: rupturas, isLoading: isLoadingRupturas } = useRupturas()
  const {
    items: trackingItems,
    summary: trackingSummary,
    industries,
    selectedIndustry,
    setSelectedIndustry,
    refetch: refetchTracking,
  } = useOperationalTracking()
  const {
    totalVisitas,
    promotoresComRegistroCount,
    lojasAtendidasCount,
    isFonteSincronizada: isVisitasSincronizadas,
  } = useOperacionalVisitas()

  const isLoading = isLoadingValidades || isLoadingRupturas

  // Agregações canônicas de saúde e prioridades
  const summary = useMemo(() => {
    // 1. Validades Críticas (0-15 dias) e Atenção (16-20 dias)
    const validadesCriticas = validades.filter((v) => v.diasRestantes <= 15)
    const validadesAtencao = validades.filter((v) => v.diasRestantes >= 16 && v.diasRestantes <= 20)
    const rupturasAtivas = rupturas.filter((r) => r.situacao_atual === 'Ativo')

    // 2. Mapeamento de Lojas por Dimensão de Saúde
    const storeMap = new Map<
      string,
      {
        storeCode: string
        storeName: string
        city: string
        uf: string
        network: string
        criticasCount: number
        atencaoCount: number
        rupturasCount: number
        lastDate?: string
        produtosCriticos: Set<string>
      }
    >()

    for (const v of validades) {
      const { city: vCity, uf: vUf } = parseCityUf(v.cidade, v.uf)
      const storeCode = v.codigoLoja ? String(v.codigoLoja).trim() : ''
      const storeName = v.loja ? String(v.loja).trim() : ''
      const network = v.rede ? String(v.rede).trim() : deriveNetworkName(storeName)
      const groupKey = `${(storeCode || 'SEM_COD').toUpperCase()}|${storeName.toUpperCase()}|${vCity.toUpperCase()}`

      let entry = storeMap.get(groupKey)
      if (!entry) {
        entry = {
          storeCode,
          storeName,
          city: vCity,
          uf: vUf,
          network,
          criticasCount: 0,
          atencaoCount: 0,
          rupturasCount: 0,
          produtosCriticos: new Set(),
        }
        storeMap.set(groupKey, entry)
      }

      if (v.diasRestantes <= 15) {
        entry.criticasCount++
        if (v.product) entry.produtosCriticos.add(v.product.trim().toUpperCase())
      } else if (v.diasRestantes <= 20) {
        entry.atencaoCount++
      }

      const d = v.dataEntrada || v.ultimaAtualizacao || v.realizado
      if (d && (!entry.lastDate || d > entry.lastDate)) {
        entry.lastDate = d
      }
    }

    for (const r of rupturas) {
      const { city: rCity, uf: rUf } = parseCityUf(r.cidade, r.estado)
      const storeCode = r.codigo_loja ? String(r.codigo_loja).trim() : ''
      const storeName = r.nome_loja ? String(r.nome_loja).trim() : ''
      const network = deriveNetworkName(storeName)
      const groupKey = `${(storeCode || 'SEM_COD').toUpperCase()}|${storeName.toUpperCase()}|${rCity.toUpperCase()}`

      let entry = storeMap.get(groupKey)
      if (!entry) {
        entry = {
          storeCode,
          storeName,
          city: rCity,
          uf: rUf,
          network,
          criticasCount: 0,
          atencaoCount: 0,
          rupturasCount: 0,
          produtosCriticos: new Set(),
        }
        storeMap.set(groupKey, entry)
      }

      entry.rupturasCount++
      if (r.produto) entry.produtosCriticos.add(r.produto.trim().toUpperCase())

      const d = r.data_visita || r.data_entrada
      if (d && (!entry.lastDate || d > entry.lastDate)) {
        entry.lastDate = d
      }
    }

    // Lojas que exigem atenção (ordenadas: ambos os riscos primeiro, depois críticas desc, depois rupturas desc)
    const storesList = Array.from(storeMap.values()).filter(
      (s) => s.criticasCount > 0 || s.atencaoCount > 0 || s.rupturasCount > 0,
    )

    storesList.sort((a, b) => {
      const aBoth = a.criticasCount > 0 && a.rupturasCount > 0 ? 1 : 0
      const bBoth = b.criticasCount > 0 && b.rupturasCount > 0 ? 1 : 0
      if (bBoth !== aBoth) return bBoth - aBoth
      if (b.criticasCount !== a.criticasCount) return b.criticasCount - a.criticasCount
      if (b.rupturasCount !== a.rupturasCount) return b.rupturasCount - a.rupturasCount
      return a.storeName.localeCompare(b.storeName, 'pt-BR')
    })

    // 3. Mapeamento de Produtos por Dimensão de Saúde
    const productMap = new Map<
      string,
      {
        productName: string
        brand: string
        criticasCount: number // validades <= 15
        atencaoCount: number // validades 16-20
        rupturasCount: number
        lojasSet: Set<string>
      }
    >()

    for (const v of validades) {
      if (!v.product || !v.product.trim()) continue
      const prodName = v.product.trim().toUpperCase()
      let entry = productMap.get(prodName)
      if (!entry) {
        entry = {
          productName: v.product.trim(),
          brand: v.cliente || v.industria || 'Não informada',
          criticasCount: 0,
          atencaoCount: 0,
          rupturasCount: 0,
          lojasSet: new Set(),
        }
        productMap.set(prodName, entry)
      }
      if (v.diasRestantes <= 15) entry.criticasCount++
      else if (v.diasRestantes <= 20) entry.atencaoCount++

      const lojaLabel = formatStoreIdentityTable({ codigoLoja: v.codigoLoja, nomeLoja: v.loja })
      if (lojaLabel) entry.lojasSet.add(lojaLabel)
    }

    for (const r of rupturas) {
      if (!r.produto || !r.produto.trim()) continue
      const prodName = r.produto.trim().toUpperCase()
      let entry = productMap.get(prodName)
      if (!entry) {
        entry = {
          productName: r.produto.trim(),
          brand: r.cliente || 'Não informada',
          criticasCount: 0,
          atencaoCount: 0,
          rupturasCount: 0,
          lojasSet: new Set(),
        }
        productMap.set(prodName, entry)
      }
      entry.rupturasCount++
      const lojaLabel = formatStoreIdentityTable({
        codigoLoja: r.codigo_loja,
        nomeLoja: r.nome_loja,
      })
      if (lojaLabel) entry.lojasSet.add(lojaLabel)
    }

    const productsList = Array.from(productMap.values()).filter(
      (p) => p.criticasCount > 0 || p.rupturasCount > 0 || p.atencaoCount > 0,
    )

    productsList.sort((a, b) => {
      const aBoth = a.criticasCount > 0 && a.rupturasCount > 0 ? 1 : 0
      const bBoth = b.criticasCount > 0 && b.rupturasCount > 0 ? 1 : 0
      if (bBoth !== aBoth) return bBoth - aBoth
      if (b.criticasCount !== a.criticasCount) return b.criticasCount - a.criticasCount
      if (b.rupturasCount !== a.rupturasCount) return b.rupturasCount - a.rupturasCount
      return b.lojasSet.size - a.lojasSet.size
    })

    // Lista de ações imediatas prioritárias ("O que fazer agora")
    const immediateActions: Array<{
      id: string
      tipo: 'loja' | 'produto'
      alvo: string
      motivo: string
      subtexto: string
      severidade: 'critica' | 'atencao'
      targetAction: () => void
    }> = []

    // Adiciona top 4 lojas prioritárias
    storesList.slice(0, 4).forEach((st, idx) => {
      const storeDisplay = formatStoreIdentityTable({
        codigoLoja: st.storeCode,
        nomeLoja: st.storeName,
      })

      const motivo =
        st.criticasCount > 0 && st.rupturasCount > 0
          ? `${st.criticasCount} validades críticas (0–15d) e ${st.rupturasCount} rupturas ativas na loja`
          : st.criticasCount > 0
            ? `${st.criticasCount} produto(s) vencendo em até 15 dias`
            : `${st.rupturasCount} produto(s) em desabastecimento ativo`

      immediateActions.push({
        id: `act-store-${idx}`,
        tipo: 'loja',
        alvo: storeDisplay,
        motivo,
        subtexto: `${formatCityUf(st.city, st.uf)} • ${st.network}`,
        severidade: st.criticasCount > 0 ? 'critica' : 'atencao',
        targetAction: () => navigateToStore(st, navigate),
      })
    })

    // Adiciona top 4 produtos prioritários
    productsList.slice(0, 4).forEach((pr, idx) => {
      const motivo =
        pr.criticasCount > 0 && pr.rupturasCount > 0
          ? `Crítico em validade (${pr.criticasCount} lojas) e ruptura em ${pr.rupturasCount} lojas`
          : pr.criticasCount > 0
            ? `${pr.criticasCount} ocorrência(s) de validade até 15 dias em ${pr.lojasSet.size} loja(s)`
            : `Ruptura ativa em ${pr.rupturasCount} loja(s)`

      immediateActions.push({
        id: `act-prod-${idx}`,
        tipo: 'produto',
        alvo: pr.productName,
        motivo,
        subtexto: `Marca: ${pr.brand} • ${pr.lojasSet.size} loja(s) afetada(s)`,
        severidade: pr.criticasCount > 0 ? 'critica' : 'atencao',
        targetAction: () =>
          setPanelTarget({
            type: 'product',
            id: pr.productName,
            label: pr.productName,
          }),
      })
    })

    return {
      validadesCriticas,
      validadesAtencao,
      rupturasAtivas,
      storesList,
      productsList,
      immediateActions,
    }
  }, [validades, rupturas])

  return (
    <div className="space-y-7 animate-fade-in pb-12">
      {/* Banner de Base Operacional em Reconstrução (se vazia após limpeza controlada) */}
      <BaseEmReconstrucaoBanner totalValidades={validades.length} totalRupturas={rupturas.length} />

      {/* 1. CABEÇALHO DA CENTRAL DE TRABALHO */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                Central de Trabalho
              </h1>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                Visão operacional atual
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Visão direta do estado da operação: o que está acontecendo, por que importa e o que
              fazer agora.
            </p>
          </div>
        </div>

        {/* Link para a Visão Estratégica original (KPIs e ranking executivo preservados) */}
        <Link
          to="/visao-geral"
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200/80 text-slate-700 font-semibold text-xs transition-colors self-start sm:self-auto"
        >
          <span>Abrir Visão Estratégica Completa</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* ========================================================================= */}
      {/* BLOCO A: "O QUE ESTÁ ACONTECENDO" (Situações Reais Explicadas)             */}
      {/* ========================================================================= */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">
              O que está acontecendo na operação?
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Situações reais consolidadas pela camada canônica com explicação contextual.
            </p>
          </div>
        </div>

        {/* Aviso no Motor se base estiver em reconstrução */}
        {validades.length === 0 && rupturas.length === 0 && (
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 flex items-center gap-2">
            <Info className="w-4 h-4 text-slate-400 shrink-0" />
            <span>
              A base operacional está sem registros após a limpeza controlada. Nenhuma ruptura ou
              atraso falso foi gerado no Motor. Após sincronizar o histórico, os ciclos serão
              calculados normalmente.
            </span>
          </div>
        )}

        {/* Seletor de Indústria para o Motor de Acompanhamento Operacional */}
        {industries.length > 1 && (
          <div className="flex items-center gap-2 bg-slate-100/70 p-2 rounded-xl border border-slate-200 w-fit">
            <span className="text-xs font-semibold text-slate-600 px-1">Indústria em Análise:</span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {industries.map((ind) => (
                <button
                  key={ind.id}
                  onClick={() => setSelectedIndustry(ind.nome)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                    selectedIndustry.trim().toUpperCase() === ind.nome.trim().toUpperCase()
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-white text-slate-700 hover:bg-slate-200/60'
                  }`}
                >
                  {ind.nome}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Card 1: Validades 0-15d e 16-20d */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between hover:border-red-300 transition-all">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-red-600 uppercase tracking-wider flex items-center gap-1.5">
                  <AlertOctagon className="w-4 h-4" />
                  Validades em Risco
                </span>
                <Badge
                  variant="outline"
                  className="bg-red-50 text-red-700 border-red-200 font-bold"
                >
                  {summary.validadesCriticas.length + summary.validadesAtencao.length} itens
                </Badge>
              </div>

              <div className="mt-3 space-y-1">
                <p className="text-2xl font-bold text-slate-900">
                  {summary.validadesCriticas.length}{' '}
                  <span className="text-xs font-semibold text-red-600">críticos (0–15 dias)</span>
                </p>
                <p className="text-xs text-slate-600">
                  + {summary.validadesAtencao.length} itens em atenção (16–20 dias para vencer)
                </p>
              </div>

              <div className="mt-3.5 p-2.5 rounded-lg bg-red-50/60 border border-red-100 text-[11px] text-red-800 leading-relaxed">
                <strong>Por que importa:</strong> Produtos nessa faixa exigem acompanhamento e
                avaliação da tratativa adequada para reduzir risco de perda.
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
              <Link
                to="/validades?status=critico"
                className="text-red-700 hover:text-red-800 font-semibold inline-flex items-center gap-1 hover:underline"
              >
                <span>Ver ocorrências críticas</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {/* Card 2: Rupturas Ativas */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between hover:border-amber-300 transition-all">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-700 uppercase tracking-wider flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" />
                  Desabastecimento
                </span>
                <Badge
                  variant="outline"
                  className="bg-amber-50 text-amber-800 border-amber-200 font-bold"
                >
                  {summary.rupturasAtivas.length} ativas
                </Badge>
              </div>

              <div className="mt-3 space-y-1">
                <p className="text-2xl font-bold text-slate-900">
                  {summary.rupturasAtivas.length}{' '}
                  <span className="text-xs font-semibold text-amber-700">itens em ruptura</span>
                </p>
                <p className="text-xs text-slate-600">
                  Ocorrências confirmadas pós-confronto bidirecional
                </p>
              </div>

              <div className="mt-3.5 p-2.5 rounded-lg bg-amber-50/60 border border-amber-100 text-[11px] text-amber-900 leading-relaxed">
                <strong>Por que importa:</strong> Gôndolas sem produto geram perda diária de
                faturamento e risco de deslistagem junto à rede.
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
              <Link
                to="/rupturas"
                className="text-amber-800 hover:text-amber-900 font-semibold inline-flex items-center gap-1 hover:underline"
              >
                <span>Ver plano de rupturas</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {/* Card 3: NOVA DIMENSÃO - ATUALIZAÇÕES OPERACIONAIS */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between hover:border-indigo-300 transition-all">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-indigo-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="w-4 h-4" />
                  Atualizações
                </span>
                <Badge
                  variant="outline"
                  className={
                    trackingSummary.totalCriticos > 0
                      ? 'bg-red-50 text-red-700 border-red-200 font-bold'
                      : trackingSummary.totalAtencao > 0
                        ? 'bg-amber-50 text-amber-800 border-amber-200 font-bold'
                        : 'bg-emerald-50 text-emerald-700 border-emerald-200 font-bold'
                  }
                >
                  {trackingSummary.totalCriticos} críticas, {trackingSummary.totalAtencao} atenção
                </Badge>
              </div>

              <div className="mt-3 space-y-1">
                <p className="text-2xl font-bold text-slate-900">
                  {trackingSummary.totalCriticos}{' '}
                  <span className="text-xs font-semibold text-red-600">críticas (2+ ciclos)</span>
                </p>
                <p className="text-xs text-slate-600">
                  + {trackingSummary.totalAtencao} em atenção (1 ciclo) •{' '}
                  {trackingSummary.totalAtualizados} atualizados
                </p>
              </div>

              <div className="mt-3.5 p-2.5 rounded-lg bg-indigo-50/70 border border-indigo-100 text-[11px] text-indigo-900 leading-relaxed">
                <strong>Por que importa:</strong> Perda de acompanhamento de produtos esperados por
                ciclo.
                {trackingSummary.atualizadosComQtdZero > 0 && (
                  <span className="block mt-0.5 text-indigo-700">
                    ({trackingSummary.atualizadosComQtdZero} un. atualizadas com estoque zero).
                  </span>
                )}
                {trackingSummary.ciclosComInconsistencia > 0 && (
                  <span className="block mt-0.5 text-amber-700 font-medium">
                    {trackingSummary.ciclosComInconsistencia} item(ns) em loja com suspeita de
                    inconsistência de pesquisa.
                  </span>
                )}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex flex-col gap-1 text-xs">
              <span className="text-indigo-600 font-semibold inline-flex items-center gap-1">
                <span>
                  Ciclos baseados na pesquisa de Validades ({selectedIndustry || 'Geral'})
                </span>
              </span>
              <span className="text-[10px] text-slate-400 leading-tight">
                Fonte principal: pesquisa de Validades. Rupturas atuam apenas como evidência de
                cruzamento operacional. Não se aplica a pesquisas de Ruptura obrigatórias.
              </span>
            </div>
          </div>

          {/* Card 4: Processos Operacionais & Visitas Registradas */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between hover:border-indigo-300 transition-all">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Layers className="w-4 h-4" />
                  Processos Operacionais
                </span>
                <Badge
                  variant="outline"
                  className={
                    totalVisitas > 0
                      ? 'bg-indigo-50 text-indigo-700 border-indigo-200 font-bold'
                      : 'bg-slate-50 text-slate-500 border-slate-200'
                  }
                >
                  {isVisitasSincronizadas && totalVisitas > 0
                    ? `${totalVisitas} visitas reg.`
                    : 'Visitas em monitoramento'}
                </Badge>
              </div>

              <div className="mt-3 space-y-2">
                {/* Indicador simples e factual de Visitas de Campo */}
                <div className="p-2.5 rounded-lg bg-indigo-50/60 border border-indigo-100">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-indigo-950 flex items-center gap-1">
                      <CalendarCheck className="w-3.5 h-3.5 text-indigo-600" />
                      Visitas Registradas
                    </span>
                    <span className="text-[11px] font-semibold text-indigo-700">
                      {totalVisitas} eventos
                    </span>
                  </div>
                  <p className="text-[11px] text-indigo-900/80 mt-1">
                    {isVisitasSincronizadas && totalVisitas > 0
                      ? `${promotoresComRegistroCount} promotores com registro em ${lojasAtendidasCount} lojas.`
                      : 'Fonte de Visitas ainda não sincronizada. Não indica falta de promotor.'}
                  </p>
                </div>

                {/* Processos futuros sem invenção de dados */}
                <div className="grid grid-cols-2 gap-1.5 text-[10px] text-slate-500">
                  <div className="p-1.5 rounded bg-slate-50 border border-slate-100">
                    <span className="font-semibold text-slate-700 block">Ocorrências Abertas</span>
                    <span className="text-slate-400">Em breve</span>
                  </div>
                  <div className="p-1.5 rounded bg-slate-50 border border-slate-100">
                    <span className="font-semibold text-slate-700 block">NF / Devoluções</span>
                    <span className="text-slate-400">Em breve</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
              <Link
                to="/visitas"
                className="text-indigo-700 hover:text-indigo-800 font-semibold inline-flex items-center gap-1 hover:underline"
              >
                <span>Acompanhar visitas de campo</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* BLOCO B: "CASOS QUE EXIGEM AÇÃO" (MOTOR DE ACOMPANHAMENTO OPERACIONAL)     */}
      {/* Formato exato do usuário: "Indústria / Loja / Produto - Acomp: X, Val: Y"  */}
      {/* ========================================================================= */}
      <section className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <span>Casos Prioritários que Exigem Ação</span>
              <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
                Acompanhamento Operacional
              </span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Casos que exigem tratativa imediata ordenados por gravidade de acompanhamento e
              validade, sem pontuação misteriosa.
            </p>
          </div>

          <div className="text-xs text-slate-500">
            {
              trackingItems.filter(
                (i) => i.prioridadeNivel === 'maxima' || i.prioridadeNivel === 'alta',
              ).length
            }{' '}
            caso(s) prioritário(s)
          </div>
        </div>

        {trackingItems.length === 0 ? (
          <p className="text-xs text-slate-500 py-6 text-center">
            Nenhum produto em risco de acompanhamento detectado para esta configuração.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {trackingItems
              .filter(
                (i) => i.acompanhamentoStatus !== 'atualizado' || i.validadeStatus === 'critico',
              )
              .slice(0, 6)
              .map((item) => (
                <div
                  key={item.id}
                  onClick={() => navigateToStore(item, navigate)}
                  className="p-4 rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-slate-50/70 transition-all flex flex-col justify-between group cursor-pointer"
                >
                  <div>
                    {/* Linha 1: Indústria / Loja / Produto */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="truncate">
                        <span className="text-xs font-bold text-slate-900 truncate block group-hover:text-indigo-600 transition-colors">
                          {item.industryName} / {item.storeName} / {item.productName}
                        </span>
                        <span className="text-[11px] text-slate-400 block mt-0.5">
                          Origem do monitoramento:{' '}
                          {item.origemMix === 'mix_definido_loja'
                            ? 'Mix Definido da Loja'
                            : 'Histórico Observado'}
                          {item.network ? ` • ${item.network}` : ''}
                        </span>
                      </div>

                      {/* As Duas Dimensões Separadas */}
                      <div className="flex flex-col sm:flex-row items-end sm:items-center gap-1.5 shrink-0">
                        <Badge
                          variant="outline"
                          className={
                            item.acompanhamentoStatus === 'critico'
                              ? 'bg-red-50 text-red-700 border-red-200 text-[10px] font-bold'
                              : item.acompanhamentoStatus === 'atencao'
                                ? 'bg-amber-50 text-amber-700 border-amber-200 text-[10px] font-semibold'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]'
                          }
                        >
                          Acomp:{' '}
                          {item.acompanhamentoStatus === 'critico'
                            ? 'Crítico'
                            : item.acompanhamentoStatus === 'atencao'
                              ? 'Atenção'
                              : 'Atualizado'}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={
                            item.validadeStatus === 'critico'
                              ? 'bg-red-50 text-red-700 border-red-200 text-[10px] font-bold'
                              : item.validadeStatus === 'atencao'
                                ? 'bg-amber-50 text-amber-700 border-amber-200 text-[10px] font-semibold'
                                : 'bg-slate-50 text-slate-700 border-slate-200 text-[10px]'
                          }
                        >
                          Validade:{' '}
                          {item.validadeStatus === 'critico'
                            ? 'Crítico'
                            : item.validadeStatus === 'atencao'
                              ? 'Atenção'
                              : 'Normal'}
                        </Badge>
                      </div>
                    </div>

                    {/* Explicação transparente no formato solicitado */}
                    <div className="mt-2.5 p-2.5 rounded-lg bg-slate-50 border border-slate-200/80 text-xs text-slate-700 leading-relaxed">
                      <p className="font-medium text-slate-800">"{item.prioridadeExplicacao}"</p>
                      <div className="text-[11px] text-slate-500 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                        <span>
                          Último estoque:{' '}
                          {item.ultimoEstado.ultimaQuantidadeConhecida !== undefined
                            ? `${item.ultimoEstado.ultimaQuantidadeConhecida} un.`
                            : 'Não informado'}
                        </span>
                        <span>
                          Última atualização:{' '}
                          {formatDisplayDate(item.ultimoEstado.ultimaDataAtualizacao, 'Sem data')}
                        </span>
                        {item.possuiRupturaRecente && (
                          <span className="text-amber-800 font-medium">
                            Ruptura ativa registrada: {item.rupturaDetalhes?.motivo}
                          </span>
                        )}
                        {item.qualidadeCiclo.isInconsistent && (
                          <span className="text-amber-700 font-bold">
                            Alerta: {item.qualidadeCiclo.motivoInconsistencia}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Ação: Registrar Acompanhamento */}
                  <div className="mt-3.5 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
                    <span className="text-[11px] text-slate-400">
                      Regra:{' '}
                      {item.politicaValidade.origem === 'produto_excecao'
                        ? 'Exceção do Produto'
                        : item.politicaValidade.origem === 'industria'
                          ? 'Política Indústria'
                          : 'Padrão Sistema'}
                    </span>

                    <Button
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        setTrackingModalItem(item)
                      }}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-7 px-3 gap-1 shadow-2xs"
                    >
                      <span>Registrar acompanhamento</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
          </div>
        )}
      </section>

      {/* ========================================================================= */}
      {/* BLOCO B.2: AÇÕES IMEDIATAS GERAIS DE LOJAS E PRODUTOS                     */}
      {/* ========================================================================= */}
      <section className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <span>Ações Imediatas Complementares</span>
              <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                Confronto Lojas &amp; Produtos
              </span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Prioridades consolidadas por risco de vencimento físico e desabastecimento confirmado.
            </p>
          </div>
        </div>

        {summary.immediateActions.length === 0 ? (
          <p className="text-xs text-slate-500 py-6 text-center">
            Nenhuma ação emergencial pendente no momento.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {summary.immediateActions.map((act) => (
              <div
                key={act.id}
                onClick={act.targetAction}
                className="p-4 rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-slate-50/70 transition-all cursor-pointer group flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                      {act.tipo === 'loja' ? (
                        <Store className="w-3.5 h-3.5" />
                      ) : (
                        <Package className="w-3.5 h-3.5" />
                      )}
                      <span className="truncate">{act.alvo}</span>
                    </span>
                    <Badge
                      variant="outline"
                      className={
                        act.severidade === 'critica'
                          ? 'bg-red-50 text-red-700 border-red-200 text-[10px] font-bold'
                          : 'bg-amber-50 text-amber-700 border-amber-200 text-[10px] font-semibold'
                      }
                    >
                      {act.severidade === 'critica' ? 'Crítico' : 'Atenção'}
                    </Badge>
                  </div>

                  <p className="text-xs font-medium text-slate-700 mt-2">{act.motivo}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">{act.subtexto}</p>
                </div>

                <div className="mt-3.5 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="text-indigo-600 font-semibold group-hover:underline inline-flex items-center gap-1">
                    {act.tipo === 'loja' ? 'Abrir painel da loja' : 'Ver situação do produto'}
                    <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                  </span>

                  <span className="text-[10px] text-slate-400">Clique para contexto</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ========================================================================= */}
      {/* BLOCO C & D: LOJAS E PRODUTOS QUE EXIGEM ATENÇÃO (Saúde por Dimensão)      */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bloco C: Lojas que Exigem Atenção */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Lojas que exigem atenção ({summary.storesList.length})
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Saúde operacional exibida separadamente por dimensão.
              </p>
            </div>
            <Link
              to="/lojas"
              className="text-xs text-indigo-600 hover:text-indigo-700 font-semibold inline-flex items-center gap-1 hover:underline"
            >
              <span>Ver todas</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto pr-1">
            {summary.storesList.slice(0, 8).map((st, idx) => {
              const storeDisplay = formatStoreIdentityTable({
                codigoLoja: st.storeCode,
                nomeLoja: st.storeName,
              })

              return (
                <div
                  key={idx}
                  onClick={() => navigateToStore(st, navigate)}
                  className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-slate-50/70 p-2 rounded-xl transition-colors cursor-pointer group"
                >
                  <div className="truncate pr-2">
                    <p className="font-semibold text-xs text-slate-900 group-hover:text-indigo-600 transition-colors truncate">
                      {storeDisplay}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {formatCityUf(st.city, st.uf)} • {st.network}
                    </p>
                  </div>

                  {/* Dimensões separadas de saúde */}
                  <div className="flex items-center gap-2 shrink-0">
                    {st.criticasCount > 0 ? (
                      <Badge
                        variant="outline"
                        className="bg-red-50 text-red-700 border-red-200 text-[10px] font-bold"
                      >
                        Validade: {st.criticasCount} crítica(s)
                      </Badge>
                    ) : st.atencaoCount > 0 ? (
                      <Badge
                        variant="outline"
                        className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] font-semibold"
                      >
                        Validade: {st.atencaoCount} atenção
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]"
                      >
                        Validade: Normal
                      </Badge>
                    )}

                    {st.rupturasCount > 0 ? (
                      <Badge
                        variant="outline"
                        className="bg-amber-50 text-amber-800 border-amber-200 text-[10px] font-bold"
                      >
                        Ruptura: {st.rupturasCount}
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]"
                      >
                        Ruptura: 0
                      </Badge>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Bloco D: Produtos que Exigem Atenção */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Produtos que exigem atenção ({summary.productsList.length})
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Produtos com risco de vencimento ou falta nas gôndolas.
              </p>
            </div>
            <Link
              to="/validades"
              className="text-xs text-indigo-600 hover:text-indigo-700 font-semibold inline-flex items-center gap-1 hover:underline"
            >
              <span>Ver validades</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto pr-1">
            {summary.productsList.slice(0, 8).map((pr, idx) => (
              <div
                key={idx}
                onClick={() =>
                  setPanelTarget({
                    type: 'product',
                    id: pr.productName,
                    label: pr.productName,
                  })
                }
                className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-slate-50/70 p-2 rounded-xl transition-colors cursor-pointer group"
              >
                <div className="truncate pr-2">
                  <p className="font-semibold text-xs text-slate-900 group-hover:text-indigo-600 transition-colors truncate">
                    {pr.productName}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {pr.brand} • Presente em {pr.lojasSet.size} loja(s)
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {pr.criticasCount > 0 ? (
                    <Badge
                      variant="outline"
                      className="bg-red-50 text-red-700 border-red-200 text-[10px] font-bold"
                    >
                      Validade: {pr.criticasCount} crítica(s)
                    </Badge>
                  ) : pr.atencaoCount > 0 ? (
                    <Badge
                      variant="outline"
                      className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] font-semibold"
                    >
                      Validade: {pr.atencaoCount} atenção
                    </Badge>
                  ) : null}

                  {pr.rupturasCount > 0 && (
                    <Badge
                      variant="outline"
                      className="bg-amber-50 text-amber-800 border-amber-200 text-[10px] font-bold"
                    >
                      Ruptura: {pr.rupturasCount}
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Painel Lateral de Contexto Reutilizável */}
      <ContextPanel
        target={panelTarget}
        onClose={() => setPanelTarget(null)}
        validades={validades}
        rupturas={rupturas}
      />

      {/* Modal de Tratativa do Motor de Acompanhamento Operacional */}
      <TrackingTratativaModal
        item={trackingModalItem}
        open={Boolean(trackingModalItem)}
        onClose={() => setTrackingModalItem(null)}
        onSuccess={() => refetchTracking()}
      />
    </div>
  )
}

export default CentralDeTrabalhoPage
