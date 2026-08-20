import type { ReportData, ValidadeItem, Ruptura } from '@/types'
import { formatStoreDisplay } from './storeRecognition'

/**
 * Construtores puros de relatórios operacionais.
 *
 Cada builder recebe um subconjunto já filtrado de `ValidadeItem[]` (ou contagens
 * para o relatório de auditoria) e devolve um `ReportData` pronto para a UI.
 * São usados tanto pelo `TradeProApiAdapter` (dados reais de `validades_base`)
 * quanto pelo `MockOperationalAdapter` e `ImportDataSource`, garantindo que
 * todos os provedores produzam relatórios com o mesmo formato — sem mock residual.
 */

const STATUS_ORDER = ['Vencido', 'Crítico', 'Atenção', 'Moderado', 'Normal'] as const

const nowISO = () => new Date().toISOString()
const pct = (n: number, total: number) => (total > 0 ? Math.round((n / total) * 100) : 0)

const qtyOf = (i: ValidadeItem): number => i.quantidade ?? i.estoque

export interface AuditoriaCounts {
  pendente: number
  corrigido: number
  confirmado: number
  total: number
}

/** Relatório: resumo de validades agrupado por status operacional. */
export function buildResumoValidadesReport(items: ValidadeItem[]): ReportData {
  const total = items.length
  const rows = STATUS_ORDER.map((st) => {
    const group = items.filter((i) => i.status === st)
    const ocorrencias = group.length
    const quantidade = group.reduce((s, i) => s + qtyOf(i), 0)
    return {
      status: st,
      ocorrencias,
      quantidade,
      percentual: `${pct(ocorrencias, total)}%`,
    }
  })
  const quantidadeTotal = items.reduce((s, i) => s + qtyOf(i), 0)
  const emRisco = rows[1].ocorrencias + rows[2].ocorrencias + rows[3].ocorrencias

  return {
    reportType: 'resumo-validades',
    title: 'Resumo de Validades',
    description:
      'Distribuição das ocorrências ativas por status operacional (mesma base de /validades).',
    generatedAt: nowISO(),
    chartData: rows.map((r) => ({
      name: r.status,
      Ocorrências: r.ocorrencias,
      Quantidade: r.quantidade,
    })),
    tableColumns: [
      { key: 'status', label: 'Status' },
      { key: 'ocorrencias', label: 'Ocorrências' },
      { key: 'quantidade', label: 'Quantidade' },
      { key: 'percentual', label: '% do total' },
    ],
    tableRows: rows,
    summaryCards: [
      { label: 'Total de ocorrências', value: total },
      { label: 'Em risco (Crítico+Atenção+Moderado)', value: emRisco, accent: 'warning' },
      { label: 'Quantidade total', value: quantidadeTotal },
    ],
  }
}

/** Relatório: validades agrupadas por loja. */
export function buildValidadesPorLojaReport(items: ValidadeItem[]): ReportData {
  const hierarchy: Record<string, number> = {
    Vencido: 0,
    Crítico: 1,
    Atenção: 2,
    Moderado: 3,
    Normal: 4,
  }

  const map = new Map<
    string,
    {
      loja: string
      codigo: string
      ocorrencias: number
      menorPrazo: number
      statusCritico: string
      quantidade: number
    }
  >()

  let minPrazoGeral = Infinity

  for (const it of items) {
    const codigo = it.codigoLoja || ''
    const nome = it.loja || '—'
    const key = codigo ? `${codigo}-${nome}` : nome
    const cur = map.get(key) ?? {
      loja: nome,
      codigo,
      ocorrencias: 0,
      menorPrazo: Infinity,
      statusCritico: 'Normal',
      quantidade: 0,
    }
    cur.ocorrencias++
    cur.menorPrazo = Math.min(cur.menorPrazo, it.diasRestantes)
    if (it.diasRestantes < minPrazoGeral) minPrazoGeral = it.diasRestantes
    const hs = hierarchy[it.status] ?? 4
    const hc = hierarchy[cur.statusCritico] ?? 4
    if (hs < hc) cur.statusCritico = it.status
    cur.quantidade += qtyOf(it)
    map.set(key, cur)
  }

  const rows = [...map.values()]
    .sort((a, b) => b.ocorrencias - a.ocorrencias)
    .map((r) => ({
      loja: r.loja,
      codigo: r.codigo || '—',
      ocorrencias: r.ocorrencias,
      menorPrazo: `${r.menorPrazo === Infinity ? 0 : r.menorPrazo} dias`,
      statusCritico: r.statusCritico,
      quantidade: r.quantidade,
    }))

  const top = rows.slice(0, 12)

  return {
    reportType: 'validades-por-loja',
    title: 'Validades por Loja',
    description: 'Ocorrências ativas agrupadas por loja, com menor prazo e status mais crítico.',
    generatedAt: nowISO(),
    chartData: top.map((r) => ({
      name: (r.codigo !== '—' ? r.codigo : r.loja).slice(0, 22),
      Ocorrências: r.ocorrencias,
    })),
    tableColumns: [
      { key: 'loja', label: 'Loja' },
      { key: 'codigo', label: 'Código' },
      { key: 'ocorrencias', label: 'Ocorrências' },
      { key: 'menorPrazo', label: 'Menor prazo' },
      { key: 'statusCritico', label: 'Status mais crítico' },
      { key: 'quantidade', label: 'Quantidade' },
    ],
    tableRows: rows,
    summaryCards: [
      { label: 'Lojas com ocorrências', value: rows.length },
      {
        label: 'Loja com mais ocorrências',
        value: rows[0]?.loja.slice(0, 26) ?? '—',
        accent: 'warning',
      },
      {
        label: 'Menor prazo geral',
        value: `${minPrazoGeral === Infinity ? 0 : minPrazoGeral} dias`,
        accent: 'danger',
      },
    ],
  }
}

/** Relatório: tendência de vencimento por faixa de dias. */
export function buildTendenciaVencimentoReport(items: ValidadeItem[]): ReportData {
  const faixas = [
    { key: '0-7 dias', min: 1, max: 7 },
    { key: '8-15 dias', min: 8, max: 15 },
    { key: '16-30 dias', min: 16, max: 30 },
    { key: '31-60 dias', min: 31, max: 60 },
    { key: '60+ dias', min: 61, max: Infinity },
  ]

  const total = items.length
  const rows = faixas.map((f) => {
    const group = items.filter((i) => i.diasRestantes >= f.min && i.diasRestantes <= f.max)
    const ocorrencias = group.length
    const quantidade = group.reduce((s, i) => s + qtyOf(i), 0)
    return {
      faixa: f.key,
      ocorrencias,
      quantidade,
      percentual: `${pct(ocorrencias, total)}%`,
    }
  })

  const proximos7 = rows[0].ocorrencias
  const longe = rows[4].ocorrencias

  return {
    reportType: 'tendencia-vencimento',
    title: 'Tendência de Vencimento',
    description: 'Ocorrências ativas distribuídas por faixa de dias até o vencimento.',
    generatedAt: nowISO(),
    chartData: rows.map((r) => ({
      name: r.faixa,
      Ocorrências: r.ocorrencias,
      Quantidade: r.quantidade,
    })),
    tableColumns: [
      { key: 'faixa', label: 'Faixa de dias' },
      { key: 'ocorrencias', label: 'Ocorrências' },
      { key: 'quantidade', label: 'Quantidade' },
      { key: 'percentual', label: '% do total' },
    ],
    tableRows: rows,
    summaryCards: [
      { label: 'Total de ocorrências', value: total },
      { label: 'Próximas 7 dias', value: proximos7, accent: 'danger' },
      { label: 'Acima de 60 dias', value: longe, accent: 'success' },
    ],
  }
}

/** Relatório: resumo de auditoria por status_auditoria. */
export function buildAuditoriaResumoReport(counts: AuditoriaCounts): ReportData {
  const rows = [
    {
      status: 'Pendente',
      quantidade: counts.pendente,
      percentual: `${pct(counts.pendente, counts.total)}%`,
    },
    {
      status: 'Corrigido',
      quantidade: counts.corrigido,
      percentual: `${pct(counts.corrigido, counts.total)}%`,
    },
    {
      status: 'Confirmado',
      quantidade: counts.confirmado,
      percentual: `${pct(counts.confirmado, counts.total)}%`,
    },
  ]

  return {
    reportType: 'auditoria-resumo',
    title: 'Auditoria — Resumo',
    description:
      'Distribuição das pendências de auditoria por status (collection auditoria_pendencias).',
    generatedAt: nowISO(),
    chartData: rows.map((r) => ({ name: r.status, Quantidade: r.quantidade })),
    tableColumns: [
      { key: 'status', label: 'Status' },
      { key: 'quantidade', label: 'Quantidade' },
      { key: 'percentual', label: '% do total' },
    ],
    tableRows: rows,
    summaryCards: [
      { label: 'Total de pendências', value: counts.total },
      { label: 'Pendentes', value: counts.pendente, accent: 'warning' },
      { label: 'Confirmados', value: counts.confirmado, accent: 'success' },
    ],
  }
}

/** Relatório: Rupturas por Loja */
export function buildRupturasPorLojaReport(rupturas: Ruptura[]): ReportData {
  const map = new Map<
    string,
    {
      loja: string
      codigo: string
      total: number
      ativas: number
      resolvidas: number
      totalDias: number
    }
  >()

  for (const r of rupturas) {
    const codigo = r.codigo_loja || ''
    const nome = r.nome_loja || '—'
    const key = codigo ? `${codigo}-${nome}` : nome
    const cur = map.get(key) ?? {
      loja: nome,
      codigo,
      total: 0,
      ativas: 0,
      resolvidas: 0,
      totalDias: 0,
    }
    cur.total++
    if (r.situacao_atual === 'Ativo') {
      cur.ativas++
      cur.totalDias += r.dias_em_ruptura
    } else {
      cur.resolvidas++
    }
    map.set(key, cur)
  }

  const rows = [...map.values()]
    .sort((a, b) => b.ativas - a.ativas || b.total - a.total)
    .map((r) => ({
      loja: formatStoreDisplay(r.codigo, r.loja),
      codigo: r.codigo || '—',
      total: r.total,
      ativas: r.ativas,
      resolvidas: r.resolvidas,
      mediaDias: r.ativas > 0 ? `${(r.totalDias / r.ativas).toFixed(1)} dias` : '0 dias',
    }))

  const top = rows.slice(0, 10)
  const totalAtivas = rows.reduce((s, r) => s + r.ativas, 0)

  return {
    reportType: 'rupturas-por-loja',
    title: 'Relatório: Rupturas por Loja',
    description: 'Consolidação de desabastecimento e rupturas ativas por ponto de venda.',
    generatedAt: nowISO(),
    chartData: top.map((r) => ({
      name: r.loja.slice(0, 20),
      'Rupturas Ativas': r.ativas,
      Resolvidas: r.resolvidas,
    })),
    tableColumns: [
      { key: 'loja', label: 'Loja' },
      { key: 'codigo', label: 'Código' },
      { key: 'ativas', label: 'Rupturas Ativas' },
      { key: 'resolvidas', label: 'Resolvidas' },
      { key: 'total', label: 'Total Histórico' },
      { key: 'mediaDias', label: 'Média de Dias em Ruptura' },
    ],
    tableRows: rows,
    summaryCards: [
      { label: 'Lojas Monitoradas', value: rows.length },
      { label: 'Rupturas Ativas Totais', value: totalAtivas, accent: 'danger' },
      {
        label: 'Loja Mais Crítica',
        value: rows[0]?.loja.slice(0, 24) ?? '—',
        accent: 'warning',
      },
    ],
  }
}

/** Relatório: Rupturas por Motivo */
export function buildRupturasPorMotivoReport(rupturas: Ruptura[]): ReportData {
  const motivos = ['Ruptura Total', 'Sem Estoque Mínimo', 'Estoque Virtual']
  const total = rupturas.length

  const rows = motivos.map((motivo) => {
    const group = rupturas.filter((r) => r.motivo === motivo)
    const ativas = group.filter((r) => r.situacao_atual === 'Ativo').length
    const resolvidas = group.filter((r) => r.situacao_atual === 'Resolvido').length
    return {
      motivo,
      total: group.length,
      ativas,
      resolvidas,
      percentual: `${pct(group.length, total)}%`,
    }
  })

  return {
    reportType: 'rupturas-por-motivo',
    title: 'Relatório: Rupturas por Motivo',
    description:
      'Distribuição dos desabastecimentos entre Ruptura Total, Sem Estoque Mínimo e Estoque Virtual.',
    generatedAt: nowISO(),
    chartData: rows.map((r) => ({
      name: r.motivo,
      Ativas: r.ativas,
      Resolvidas: r.resolvidas,
    })),
    tableColumns: [
      { key: 'motivo', label: 'Motivo da Ruptura' },
      { key: 'ativas', label: 'Ocorrências Ativas' },
      { key: 'resolvidas', label: 'Resolvidas' },
      { key: 'total', label: 'Total de Ocorrências' },
      { key: 'percentual', label: '% do Total' },
    ],
    tableRows: rows,
    summaryCards: [
      { label: 'Total de Ocorrências', value: total },
      {
        label: 'Ruptura Total (Gôndola Vazia)',
        value: rows.find((r) => r.motivo === 'Ruptura Total')?.ativas ?? 0,
        accent: 'danger',
      },
      {
        label: 'Estoque Virtual (Divergência)',
        value: rows.find((r) => r.motivo === 'Estoque Virtual')?.ativas ?? 0,
        accent: 'warning',
      },
    ],
  }
}
