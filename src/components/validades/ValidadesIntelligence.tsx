import React, { useMemo } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { ValidadeItem } from '@/types'
import { TrendingDown, AlertTriangle, Building2, Calendar, Layers } from 'lucide-react'
import { classificarCriticidade } from '@/lib/data/criticidade'
import { formatStoreIdentity } from '@/lib/format/storeIdentity'

interface ValidadesIntelligenceProps {
  items: ValidadeItem[]
  isLoading?: boolean
}

const fmtInt = (v: number) => v.toLocaleString('pt-BR')

export const ValidadesIntelligence: React.FC<ValidadesIntelligenceProps> = ({
  items,
  isLoading,
}) => {
  const blocks = useMemo(() => {
    if (!items || items.length === 0) return null

    // 1. Clientes/Indústrias com maior volume em risco
    const porIndustria: Record<string, { quantidade: number; ocorrencias: number }> = {}
    items.forEach((item) => {
      const ind = item.industria || item.cliente || 'Diretoria'
      if (!porIndustria[ind]) {
        porIndustria[ind] = { quantidade: 0, ocorrencias: 0 }
      }
      porIndustria[ind].quantidade += item.quantidade ?? item.estoque
      porIndustria[ind].ocorrencias += 1
    })
    const topIndustrias = Object.entries(porIndustria)
      .map(([industria, data]) => ({ industria, ...data }))
      .sort((a, b) => b.quantidade - a.quantidade)
      .slice(0, 5)

    // 2. Lojas com mais ocorrências
    const porLoja: Record<
      string,
      { nome: string; codigo?: string; total: number; criticos: number }
    > = {}
    items.forEach((item) => {
      const key = item.loja || 'Loja não informada'
      if (!porLoja[key]) {
        porLoja[key] = {
          nome: item.loja,
          codigo: item.codigoLoja,
          total: 0,
          criticos: 0,
        }
      }
      porLoja[key].total += 1
      if (classificarCriticidade(item.diasRestantes) === 'Crítico') {
        porLoja[key].criticos += 1
      }
    })
    const topLojas = Object.entries(porLoja)
      .map(([_, data]) => ({
        identidade: formatStoreIdentity({ codigo_loja: data.codigo, nome_loja: data.nome }),
        total: data.total,
        criticos: data.criticos,
      }))
      .sort((a, b) => b.criticos - a.criticos || b.total - a.total)
      .slice(0, 5)

    // 3. Distribuição por faixa de dias
    const faixas = {
      ate15: { label: '1 a 15 dias (Crítico)', count: 0, qtd: 0 },
      de16a25: { label: '16 a 25 dias (Atenção)', count: 0, qtd: 0 },
      de26a35: { label: '26 a 35 dias (Moderado)', count: 0, qtd: 0 },
      acima35: { label: '> 35 dias (OK)', count: 0, qtd: 0 },
    }
    items.forEach((item) => {
      const d = item.diasRestantes
      const q = item.quantidade ?? item.estoque
      if (d <= 15) {
        faixas.ate15.count++
        faixas.ate15.qtd += q
      } else if (d <= 25) {
        faixas.de16a25.count++
        faixas.de16a25.qtd += q
      } else if (d <= 35) {
        faixas.de26a35.count++
        faixas.de26a35.qtd += q
      } else {
        faixas.acima35.count++
        faixas.acima35.qtd += q
      }
    })

    // 4. Produtos mais críticos (pelo menor número de dias)
    const produtosCriticos = [...items]
      .sort((a, b) => a.diasRestantes - b.diasRestantes)
      .slice(0, 5)

    return {
      topIndustrias,
      topLojas,
      faixas: Object.values(faixas),
      produtosCriticos,
    }
  }, [items])

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="border-slate-200">
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-32" />
            </CardHeader>
            <CardContent className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (!blocks) {
    return null
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* 1. Clientes / Indústrias com Maior Volume */}
      <Card className="border-slate-200 shadow-sm bg-white">
        <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
            Volume em Risco por Indústria
          </CardTitle>
          <Building2 className="w-4 h-4 text-indigo-600" />
        </CardHeader>
        <CardContent className="space-y-2.5 pt-1">
          {blocks.topIndustrias.map((item, idx) => (
            <div key={idx} className="flex items-center justify-between text-xs">
              <div className="min-w-0 pr-2">
                <p className="font-medium text-slate-900 truncate">{item.industria}</p>
                <p className="text-[10px] text-slate-400">
                  {item.ocorrencias} {item.ocorrencias === 1 ? 'ocorrência' : 'ocorrências'}
                </p>
              </div>
              <span className="font-semibold text-slate-900 whitespace-nowrap tabular-nums text-[11px]">
                {fmtInt(item.quantidade)} un
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* 2. Lojas com Mais Ocorrências */}
      <Card className="border-slate-200 shadow-sm bg-white">
        <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
            Lojas com Mais Ocorrências
          </CardTitle>
          <AlertTriangle className="w-4 h-4 text-amber-600" />
        </CardHeader>
        <CardContent className="space-y-2.5 pt-1">
          {blocks.topLojas.map((item, idx) => (
            <div key={idx} className="flex items-center justify-between text-xs">
              <div className="min-w-0 pr-2">
                <p className="font-medium text-slate-900 truncate">{item.identidade}</p>
                <p className="text-[10px] text-slate-400">
                  {item.criticos > 0 ? `${item.criticos} crítica(s)` : 'Sob controle'}
                </p>
              </div>
              <span className="font-semibold text-slate-900 whitespace-nowrap text-[11px]">
                {item.total} {item.total === 1 ? 'item' : 'itens'}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* 3. Distribuição por Faixa de Vencimento */}
      <Card className="border-slate-200 shadow-sm bg-white">
        <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
            Distribuição por Status
          </CardTitle>
          <Calendar className="w-4 h-4 text-emerald-600" />
        </CardHeader>
        <CardContent className="space-y-2.5 pt-1">
          {blocks.faixas.map((item, idx) => (
            <div key={idx} className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-700 truncate pr-2">{item.label}</span>
              <div className="text-right whitespace-nowrap">
                <span className="font-semibold text-slate-900 tabular-nums text-[11px]">
                  {fmtInt(item.count)}
                </span>
                <span className="text-[10px] text-slate-400 ml-1">({fmtInt(item.qtd)} un)</span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* 4. Validades mais Iminentes */}
      <Card className="border-slate-200 shadow-sm bg-white">
        <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
            Validades mais Iminentes
          </CardTitle>
          <TrendingDown className="w-4 h-4 text-red-600" />
        </CardHeader>
        <CardContent className="space-y-2.5 pt-1">
          {blocks.produtosCriticos.map((item, idx) => (
            <div key={idx} className="flex items-center justify-between text-xs">
              <div className="min-w-0 pr-2">
                <p className="font-medium text-slate-900 truncate">{item.product}</p>
                <p className="text-[10px] text-slate-400 truncate">{item.loja}</p>
              </div>
              <span className="font-semibold text-red-600 whitespace-nowrap tabular-nums text-[11px]">
                {item.diasRestantes} {item.diasRestantes === 1 ? 'dia' : 'dias'}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
