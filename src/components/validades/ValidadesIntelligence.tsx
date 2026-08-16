import React from 'react'
import { cn } from '@/lib/utils'
import { TrendingUp, AlertTriangle, Clock, Users, MapPin, ListOrdered } from 'lucide-react'
import type { ValidadeItem } from '@/types'
import {
  rankingPorLoja,
  rankingPorCidade,
  rankingPorCliente,
  produtosVencendoPrimeiro,
  prioridadeAtuacao,
  type RankingItem,
} from '@/lib/data/validadesCompute'
import { getCriticidadeFaixa, classificarCriticidade } from '@/lib/data/criticidade'
import { CriticidadeBadge } from './CriticidadeBadge'

const fmtMoney = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const fmtInt = (v: number) => v.toLocaleString('pt-BR')

function IntelligenceCard({
  title,
  question,
  icon: Icon,
  iconClass,
  children,
}: {
  title: string
  question: string
  icon: React.ElementType
  iconClass: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-5 flex flex-col">
      <div className="flex items-start gap-3 mb-3">
        <div
          className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', iconClass)}
        >
          <Icon className="w-4 h-4" />
        </div>
        <div>
          <h4 className="text-sm font-bold text-slate-900 leading-tight">{title}</h4>
          <p className="text-[11px] text-slate-500 mt-0.5">{question}</p>
        </div>
      </div>
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  )
}

function RankingRow({
  rank,
  label,
  metrica,
  direita,
  isLast,
}: {
  rank: number
  label: string
  metrica: string
  direita: string
  isLast?: boolean
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between py-2 text-xs gap-2',
        !isLast && 'border-b border-slate-100',
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span
          className={cn(
            'w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0',
            rank === 1
              ? 'bg-red-100 text-red-700'
              : rank === 2
                ? 'bg-orange-100 text-orange-700'
                : rank === 3
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-slate-100 text-slate-600',
          )}
        >
          {rank}
        </span>
        <span className="font-medium text-slate-800 truncate">{label}</span>
      </div>
      <div className="text-right shrink-0">
        <p className="font-semibold text-slate-900 tabular-nums">{metrica}</p>
        <p className="text-[10px] text-slate-400">{direita}</p>
      </div>
    </div>
  )
}

function renderRanking(
  rows: RankingItem[],
  metricaLabel: string,
  direitaFn: (r: RankingItem) => string,
) {
  if (rows.length === 0) {
    return <p className="text-xs text-slate-400 py-4 text-center">Sem dados para o filtro atual.</p>
  }
  return (
    <div>
      {rows.map((r, i) => (
        <RankingRow
          key={r.chave}
          rank={i + 1}
          label={r.chave}
          metrica={`${fmtInt(r.criticos)} crít.`}
          direita={direitaFn(r)}
        />
      ))}
      <p className="text-[10px] text-slate-400 mt-1">{metricaLabel}</p>
    </div>
  )
}

export const ValidadesIntelligence: React.FC<{ items: ValidadeItem[]; isLoading?: boolean }> = ({
  items,
  isLoading,
}) => {
  const topLojas = React.useMemo(() => rankingPorLoja(items, 6), [items])
  const topCidades = React.useMemo(() => rankingPorCidade(items, 6), [items])
  const topClientes = React.useMemo(() => rankingPorCliente(items, 6), [items])
  const vencendoPrimeiro = React.useMemo(() => produtosVencendoPrimeiro(items, 6), [items])
  const prioridade = React.useMemo(() => prioridadeAtuacao(items, 6), [items])

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="bg-white rounded-xl border border-slate-200 p-5 h-48 animate-pulse"
          />
        ))}
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
        Ajuste os filtros para visualizar os blocos de inteligência.
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <IntelligenceCard
        title="Maiores concentrações de risco"
        question="Onde estão as maiores concentrações de risco? (top cidades com itens críticos)"
        icon={MapPin}
        iconClass="bg-red-100 text-red-700"
      >
        {renderRanking(
          topCidades,
          'Cidades com maior número de ocorrências críticas.',
          (r) => `${fmtInt(r.ocorrencias)} ocorr.`,
        )}
      </IntelligenceCard>

      <IntelligenceCard
        title="Lojas que exigem atenção"
        question="Quais lojas exigem atenção? (ranking por itens vencendo)"
        icon={AlertTriangle}
        iconClass="bg-orange-100 text-orange-700"
      >
        {renderRanking(
          topLojas,
          'Lojas com maior concentração de ocorrências críticas.',
          (r) => `${fmtInt(r.quantidade)} un.`,
        )}
      </IntelligenceCard>

      <IntelligenceCard
        title="Produtos que vencerão primeiro"
        question="Quais produtos vencerão primeiro? (ordenados por data mais próxima)"
        icon={Clock}
        iconClass="bg-amber-100 text-amber-700"
      >
        {vencendoPrimeiro.length === 0 ? (
          <p className="text-xs text-slate-400 py-4 text-center">Sem dados.</p>
        ) : (
          <div>
            {vencendoPrimeiro.map(({ item, nivel }, i) => (
              <div
                key={item.id}
                className={cn(
                  'flex items-center justify-between py-2 text-xs gap-2',
                  i < vencendoPrimeiro.length - 1 && 'border-b border-slate-100',
                )}
              >
                <div className="min-w-0">
                  <p className="font-medium text-slate-800 truncate">{item.product}</p>
                  <p className="text-[10px] text-slate-400">
                    {item.loja} •{' '}
                    {new Date(item.validade + 'T00:00:00').toLocaleDateString('pt-BR')}
                  </p>
                </div>
                <div className="shrink-0">
                  <CriticidadeBadge level={nivel} diasRestantes={item.diasRestantes} />
                </div>
              </div>
            ))}
          </div>
        )}
      </IntelligenceCard>

      <IntelligenceCard
        title="Clientes com maior exposição"
        question="Quais clientes possuem maior exposição? (volume financeiro em risco)"
        icon={Users}
        iconClass="bg-indigo-100 text-indigo-700"
      >
        {topClientes.length === 0 ? (
          <p className="text-xs text-slate-400 py-4 text-center">Sem dados.</p>
        ) : (
          <div>
            {topClientes.map((r, i) => (
              <div
                key={r.chave}
                className={cn(
                  'flex items-center justify-between py-2 text-xs gap-2',
                  i < topClientes.length - 1 && 'border-b border-slate-100',
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={cn(
                      'w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0',
                      i === 0 ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600',
                    )}
                  >
                    {i + 1}
                  </span>
                  <span className="font-medium text-slate-800 truncate">{r.chave}</span>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-semibold text-slate-900 tabular-nums">
                    {fmtMoney(r.exposicao)}
                  </p>
                  <p className="text-[10px] text-slate-400">{fmtInt(r.ocorrencias)} ocorr.</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </IntelligenceCard>

      <IntelligenceCard
        title="Prioridade de atuação recomendada"
        question="Qual prioridade de atuação recomendamos? (criticidade × quantidade × proximidade)"
        icon={ListOrdered}
        iconClass="bg-emerald-100 text-emerald-700"
      >
        {prioridade.length === 0 ? (
          <p className="text-xs text-slate-400 py-4 text-center">Sem dados.</p>
        ) : (
          <div>
            {prioridade.map((p, i) => {
              const faixa = getCriticidadeFaixa(p.nivel)
              return (
                <div
                  key={p.item.id}
                  className={cn(
                    'flex items-center justify-between py-2 text-xs gap-2',
                    i < prioridade.length - 1 && 'border-b border-slate-100',
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={cn(
                        'w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0',
                        i === 0 ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600',
                      )}
                    >
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium text-slate-800 truncate">{p.item.product}</p>
                      <p className="text-[10px] text-slate-400 truncate">
                        {p.item.loja} • {fmtInt(p.item.quantidade ?? p.item.estoque)} un.
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <CriticidadeBadge level={p.nivel} />
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      score {p.score.toFixed(1)} • {faixa.label}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </IntelligenceCard>

      <IntelligenceCard
        title="Resumo quantitativo"
        question="Distribuição das ocorrências por faixa de criticidade (dados filtrados)"
        icon={TrendingUp}
        iconClass="bg-slate-100 text-slate-700"
      >
        <ResumoQuantitativo items={items} />
      </IntelligenceCard>
    </div>
  )
}

function ResumoQuantitativo({ items }: { items: ValidadeItem[] }) {
  const counts = React.useMemo(() => {
    let v = 0 // Vencido
    let c = 0 // Crítico
    let a = 0 // Atenção
    let m = 0 // Moderado
    let o = 0 // OK
    let qtd = 0
    let exp = 0
    for (const it of items) {
      const nivel = classificarCriticidade(it.diasRestantes)
      if (nivel === 'Vencido') v++
      else if (nivel === 'Crítico') c++
      else if (nivel === 'Atenção') a++
      else if (nivel === 'Moderado') m++
      else o++
      qtd += it.quantidade ?? it.estoque
      exp += (it.quantidade ?? it.estoque) * (it.precoUnitario ?? 0)
    }
    return { v, c, a, m, o, qtd, exp, total: items.length }
  }, [items])

  const rows: Array<{ label: string; value: string; chip: string }> = [
    { label: 'Vencido (≤ 0 dias)', value: fmtInt(counts.v), chip: 'bg-rose-100 text-rose-700' },
    { label: 'Crítico (1–15 dias)', value: fmtInt(counts.c), chip: 'bg-red-100 text-red-700' },
    {
      label: 'Atenção (16–25 dias)',
      value: fmtInt(counts.a),
      chip: 'bg-orange-100 text-orange-700',
    },
    {
      label: 'Moderado (26–35 dias)',
      value: fmtInt(counts.m),
      chip: 'bg-amber-100 text-amber-800',
    },
    { label: 'OK (> 35 dias)', value: fmtInt(counts.o), chip: 'bg-emerald-100 text-emerald-700' },
    {
      label: 'Quantidade total envolvida',
      value: `${fmtInt(counts.qtd)} un.`,
      chip: 'bg-slate-100 text-slate-700',
    },
    {
      label: 'Exposição financeira estimada',
      value: fmtMoney(counts.exp),
      chip: 'bg-indigo-100 text-indigo-700',
    },
  ]

  return (
    <div>
      {rows.map((r, i) => (
        <div
          key={r.label}
          className={cn(
            'flex items-center justify-between py-2 text-xs gap-2',
            i < rows.length - 1 && 'border-b border-slate-100',
          )}
        >
          <div className="flex items-center gap-2">
            <span className={cn('w-2.5 h-2.5 rounded-full', r.chip.split(' ')[0])} />
            <span className="text-slate-600">{r.label}</span>
          </div>
          <span className="font-semibold text-slate-900 tabular-nums">{r.value}</span>
        </div>
      ))}
      <p className="text-[10px] text-slate-400 mt-1">
        Total de ocorrências no filtro: {fmtInt(counts.total)}
      </p>
    </div>
  )
}
