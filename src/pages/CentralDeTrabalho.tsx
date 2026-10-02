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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  formatStoreIdentityTable,
  formatCityUf,
  parseCityUf,
  deriveNetworkName,
} from '@/lib/format/storeIdentity'
import { formatDisplayDate } from '@/lib/format/dateParser'
import { ContextPanel, type ContextPanelTarget } from '@/components/common/ContextPanel'
import type { ValidadeItem, Ruptura } from '@/types'

export const CentralDeTrabalhoPage: React.FC = () => {
  const navigate = useNavigate()
  const [panelTarget, setPanelTarget] = useState<ContextPanelTarget | null>(null)

  const { data: validades, isLoading: isLoadingValidades } = useValidades()

  const { filteredRupturas: rupturas, isLoading: isLoadingRupturas } = useRupturas()

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
        severidade: st.criticasCount > 0 || st.rupturasCount > 0 ? 'critica' : 'atencao',
        targetAction: () =>
          setPanelTarget({
            type: 'store',
            id: st.storeCode || st.storeName,
            label: storeDisplay,
          }),
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
        severidade: pr.criticasCount > 0 || pr.rupturasCount > 0 ? 'critica' : 'atencao',
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
                Operação em tempo real
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                <strong>Por que importa:</strong> Produtos com menos de 15 dias exigem liquidação,
                troca ou reposicionamento imediato em gôndola para evitar perda financeira.
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

          {/* Card 3: Processos em Preparação (Ocorrências e NF/Devoluções) */}
          <div className="bg-white p-5 rounded-2xl border border-dashed border-slate-300 shadow-2xs flex flex-col justify-between opacity-80">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Layers className="w-4 h-4" />
                  Processos Operacionais
                </span>
                <Badge
                  variant="outline"
                  className="text-[10px] text-slate-500 border-slate-300 font-medium"
                >
                  Em preparação
                </Badge>
              </div>

              <div className="mt-3 space-y-2.5">
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700">
                      Ocorrências Abertas
                    </span>
                    <Badge variant="outline" className="text-[9px] text-slate-400">
                      Em breve
                    </Badge>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Registro de divergências de campo sem dados inventados.
                  </p>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700">NF / Devoluções</span>
                    <Badge variant="outline" className="text-[9px] text-slate-400">
                      Em breve
                    </Badge>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Solicitações pendentes e rastreio de logística reversa.
                  </p>
                </div>
              </div>
            </div>

            <p className="text-[10px] text-slate-400 mt-3 italic">
              Espaços reservados para governança sem mock ou dados fictícios.
            </p>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* BLOCO B: "O QUE FAZER AGORA" (Prioridades de Ação Ordenadas)               */}
      {/* ========================================================================= */}
      <section className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <span>O que eu faço agora?</span>
              <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
                Ações imediatas
              </span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Prioridades ordenadas por criticidade e impacto na operação.
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
                  onClick={() =>
                    setPanelTarget({
                      type: 'store',
                      id: st.storeCode || st.storeName,
                      label: storeDisplay,
                    })
                  }
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
    </div>
  )
}

export default CentralDeTrabalhoPage
