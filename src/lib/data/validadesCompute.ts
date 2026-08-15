import type { ValidadeItem, CriticidadeLevel, ValidadeDrill } from '@/types'
import { classificarCriticidade, CRITICIDADE_FAIXAS, getCriticidadeFaixa } from './criticidade'

/**
 * Camada de negócio para Validades (Camada 02).
 *
 * Funções puras que operam sobre um subconjunto já filtrado de ValidadeItem[],
 * produzindo KPIs, rankings e sugestões para os blocos de inteligência.
 * Mantida separada dos componentes para ser testável e reutilizável.
 */

export interface ValidadeKpis {
  total: number
  criticos: number // vencido ou <= 7 dias
  atencao: number // 8 a 15 dias
  moderado: number // 16 a 30 dias
  ok: number // > 30 dias
  quantidadeTotal: number // soma de unidades envolvidas
  lojasAfetadas: number // contagem distinta de lojas
  clientesAfetados: number // contagem distinta de clientes/indústrias
  exposicaoFinanceira: number // soma (quantidade * precoUnitario) estimada
}

export function calcularKpis(items: ValidadeItem[]): ValidadeKpis {
  let criticos = 0
  let atencao = 0
  let moderado = 0
  let ok = 0
  let quantidadeTotal = 0
  let exposicao = 0
  const lojas = new Set<string>()
  const clientes = new Set<string>()

  for (const it of items) {
    const nivel = classificarCriticidade(it.diasRestantes)
    if (nivel === 'Crítico') criticos++
    else if (nivel === 'Atenção') atencao++
    else if (nivel === 'Moderado') moderado++
    else ok++

    quantidadeTotal += it.quantidade ?? it.estoque
    exposicao += (it.quantidade ?? it.estoque) * (it.precoUnitario ?? 0)
    if (it.loja) lojas.add(it.loja)
    if (it.cliente) clientes.add(it.cliente)
  }

  return {
    total: items.length,
    criticos,
    atencao,
    moderado,
    ok,
    quantidadeTotal,
    lojasAfetadas: lojas.size,
    clientesAfetados: clientes.size,
    exposicaoFinanceira: exposicao,
  }
}

export interface RankingItem {
  chave: string
  ocorrencias: number
  criticos: number
  quantidade: number
  exposicao: number
}

/** Ranking por loja (ou cidade) por número de ocorrências críticas. */
export function rankingPorLoja(items: ValidadeItem[], limite = 8): RankingItem[] {
  return agruparRanking(items, (it) => it.loja ?? '—', limite)
}

export function rankingPorCidade(items: ValidadeItem[], limite = 8): RankingItem[] {
  return agruparRanking(items, (it) => it.cidade ?? '—', limite)
}

export function rankingPorCliente(items: ValidadeItem[], limite = 8): RankingItem[] {
  return agruparRanking(items, (it) => it.cliente ?? '—', limite)
}

function agruparRanking(
  items: ValidadeItem[],
  chaveFn: (it: ValidadeItem) => string,
  limite: number,
): RankingItem[] {
  const map = new Map<string, RankingItem>()
  for (const it of items) {
    const chave = chaveFn(it)
    const cur = map.get(chave) ?? {
      chave,
      ocorrencias: 0,
      criticos: 0,
      quantidade: 0,
      exposicao: 0,
    }
    cur.ocorrencias++
    if (classificarCriticidade(it.diasRestantes) === 'Crítico') cur.criticos++
    cur.quantidade += it.quantidade ?? it.estoque
    cur.exposicao += (it.quantidade ?? it.estoque) * (it.precoUnitario ?? 0)
    map.set(chave, cur)
  }
  return [...map.values()]
    .sort((a, b) => b.criticos - a.criticos || b.ocorrencias - a.ocorrencias)
    .slice(0, limite)
}

/** Produtos que vencerão primeiro (data de vencimento mais próxima). */
export function produtosVencendoPrimeiro(
  items: ValidadeItem[],
  limite = 10,
): Array<{ item: ValidadeItem; nivel: CriticidadeLevel }> {
  return [...items]
    .sort((a, b) => a.diasRestantes - b.diasRestantes)
    .slice(0, limite)
    .map((item) => ({ item, nivel: classificarCriticidade(item.diasRestantes) }))
}

export interface PrioridadeAtuacao {
  item: ValidadeItem
  nivel: CriticidadeLevel
  score: number // maior = mais prioritário
}

/**
 * Sugestão de prioridade de atuação ordenada por:
 * criticidade (peso) × quantidade (volume em risco) × proximidade da data.
 */
export function prioridadeAtuacao(items: ValidadeItem[], limite = 10): PrioridadeAtuacao[] {
  const scored = items.map((item) => {
    const nivel = classificarCriticidade(item.diasRestantes)
    const faixa = getCriticidadeFaixa(nivel)
    const pesoNivel = 5 - faixa.prioridade // Crítico=4, OK=1
    const quantidade = item.quantidade ?? item.estoque
    // proximidade: quanto menos dias, maior o peso (1 a ~10). Vencidos contam como 10.
    const proximidade = item.diasRestantes <= 0 ? 10 : 10 / (1 + item.diasRestantes / 7)
    const volumeNorm = Math.log10(1 + quantidade) // suaviza grandes volumes
    const score = pesoNivel * 3 + volumeNorm * 1.5 + proximidade
    return { item, nivel, score }
  })
  return scored.sort((a, b) => b.score - a.score).slice(0, limite)
}

/** Rótulo legível para o nível de drill-down atual. */
export function drillLabel(drill: ValidadeDrill | undefined): string {
  if (!drill || drill.level === 'overview') return 'Visão Geral'
  const partes = ['Visão Geral']
  if (drill.cliente) partes.push(drill.cliente)
  if (drill.loja) partes.push(drill.loja)
  if (drill.produto) partes.push(drill.produto)
  return partes.join(' › ')
}

/** Lista de faixas para legenda/comparativo. */
export const FAIXAS_CRITICIDADE = CRITICIDADE_FAIXAS
