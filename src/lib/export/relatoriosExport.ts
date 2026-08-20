/**
 * Exportação Excel (.xlsx) da página de Relatórios.
 *
 * Gera um arquivo .xlsx real (via SheetJS / xlsx) a partir das ocorrências
 * da collection `validades_base` do PocketBase, aplicando os mesmos filtros
 * ativos na tela de Validades no momento da exportação (mesmo pipeline de
 * filtragem do `TradeProApiAdapter.listValidades`, sem mock).
 *
 * A aba única se chama "Validades" e contém as colunas:
 *   PRODUTO | LOJA | REALIZADO | VALIDADE | DIAS P/VENCER | QTD | STATUS
 *
 * Se a base estiver vazia ou os filtros não retornarem resultados, o Excel é
 * gerado com apenas os cabeçalhos (zero linhas).
 */
import * as XLSX from 'xlsx'
import pb from '@/lib/pocketbase/client'
import type { ValidadesFilter } from '@/types'
import { classificarCriticidade } from '@/lib/data/criticidade'
import { calcularDiasRestantes } from '@/lib/import/excelMapper'

/** Colunas exportadas, na ordem exata do arquivo final. */
const RELATORIO_COLUMNS = [
  'PRODUTO',
  'LOJA',
  'REALIZADO',
  'VALIDADE',
  'DIAS P/VENCER',
  'QTD',
  'STATUS',
] as const

/** Registro bruto de validades_base (apenas os campos usados pela exportação). */
interface ValidadesBaseRec {
  id: string
  produto?: string
  razao_social?: string
  codigo_loja?: string
  nome_loja?: string
  realizado?: string
  validade_efetiva?: string
  validade?: string
  quantidade?: number
  dias_vencimento_atual?: number
  status_operacional?: string
  is_base_atual?: boolean
  // Campos usados pelos filtros do pipeline
  cidade?: string
  estado?: string
  cliente?: string
  fornecedor?: string
  rede?: string
  colaborador?: string
  supervisor?: string
  cod_produto?: string
  cod_barras?: string
  numero_lote?: string
  category?: string
  validade_original?: string
}

/** Item já normalizado (espelha o `toValidadeItem` do TradeProApiAdapter). */
export interface NormItem {
  id: string
  product: string
  sku: string
  lote: string
  category: string
  validade: string
  diasRestantes: number
  status: string
  cliente?: string
  industria?: string
  rede?: string
  codigoLoja?: string
  loja?: string
  cidade?: string
  uf?: string
  promotor?: string
  supervisor?: string
  quantidade?: number
  ultimaAtualizacao?: string
}

/** Converte um registro bruto de validades_base em item normalizado. */
function toNormItem(rec: ValidadesBaseRec): NormItem {
  const validade = rec.validade_efetiva || rec.validade || ''
  const diasRestantes =
    typeof rec.dias_vencimento_atual === 'number'
      ? rec.dias_vencimento_atual
      : calcularDiasRestantes(validade)
  const status =
    rec.status_operacional ||
    (diasRestantes <= 0
      ? 'Vencido'
      : diasRestantes <= 15
        ? 'Crítico'
        : diasRestantes <= 25
          ? 'Atenção'
          : diasRestantes <= 35
            ? 'Moderado'
            : 'Normal')

  return {
    id: rec.id,
    product: rec.produto || '',
    sku: rec.cod_produto || rec.cod_barras || '',
    lote: rec.numero_lote || '',
    category: rec.category || 'Mercearia',
    validade,
    diasRestantes,
    status,
    cliente: rec.cliente || undefined,
    industria: rec.fornecedor || undefined,
    rede: rec.rede || undefined,
    codigoLoja: rec.codigo_loja || undefined,
    loja: rec.nome_loja || rec.razao_social || undefined,
    cidade: rec.cidade || undefined,
    uf: rec.estado || undefined,
    promotor: rec.colaborador || undefined,
    supervisor: rec.supervisor || undefined,
    quantidade: typeof rec.quantidade === 'number' ? rec.quantidade : undefined,
    ultimaAtualizacao: rec.realizado || undefined,
  }
}

/**
 * Aplica os mesmos filtros do `TradeProApiAdapter.listValidades` sobre a base
 * carregada. Centralizado aqui para garantir paridade com a tela de Validades.
 */
function applyFilters(items: NormItem[], filters?: ValidadesFilter): NormItem[] {
  // Regra de Isolamento de Vencidos: a tela de Validades oculta vencidos
  // (dias <= 0). A exportação de Relatórios segue a mesma regra.
  let out = items.filter((i) => i.diasRestantes > 0)

  if (filters?.search) {
    const q = filters.search.trim().toLowerCase()
    out = out.filter(
      (i) =>
        i.product.toLowerCase().includes(q) ||
        i.sku.toLowerCase().includes(q) ||
        i.lote.toLowerCase().includes(q) ||
        (i.cliente ?? '').toLowerCase().includes(q) ||
        (i.loja ?? '').toLowerCase().includes(q),
    )
  }

  if (filters?.category && filters.category !== 'Todos') {
    out = out.filter((i) => i.category === filters.category)
  }

  if (filters?.status && filters.status !== 'Todos') {
    out = out.filter((i) => i.status === filters.status)
  }

  // Filtros Camada 02
  if (filters?.cliente) out = out.filter((i) => i.cliente === filters.cliente)
  if (filters?.industria) out = out.filter((i) => i.industria === filters.industria)
  if (filters?.rede) out = out.filter((i) => i.rede === filters.rede)
  if (filters?.loja) out = out.filter((i) => i.loja === filters.loja)
  if (filters?.cidade) out = out.filter((i) => i.cidade === filters.cidade)
  if (filters?.produto) out = out.filter((i) => i.product === filters.produto)
  if (filters?.promotor) out = out.filter((i) => i.promotor === filters.promotor)
  if (filters?.supervisor) out = out.filter((i) => i.supervisor === filters.supervisor)

  if (filters?.criticidades && filters.criticidades.length > 0) {
    out = out.filter((i) => filters.criticidades!.includes(classificarCriticidade(i.diasRestantes)))
  }

  if (filters?.dataInicio) {
    const inicio = new Date(filters.dataInicio + 'T00:00:00').getTime()
    out = out.filter((i) => new Date(i.validade + 'T00:00:00').getTime() >= inicio)
  }
  if (filters?.dataFim) {
    const fim = new Date(filters.dataFim + 'T23:59:59').getTime()
    out = out.filter((i) => new Date(i.validade + 'T00:00:00').getTime() <= fim)
  }

  // Drill-down hierárquico
  if (filters?.drill) {
    const d = filters.drill
    if (d.cliente) out = out.filter((i) => i.cliente === d.cliente)
    if (d.loja) out = out.filter((i) => i.loja === d.loja)
    if (d.produto) out = out.filter((i) => i.product === d.produto)
    if (d.ocorrenciaId) out = out.filter((i) => i.id === d.ocorrenciaId)
  }

  return out
}

/** Formata uma data ISO (YYYY-MM-DD ou ISO date-time) em dd/mm/aaaa. */
function fmtDate(iso: string | undefined): string {
  if (!iso) return ''
  // PocketBase "date" vem como "2026-08-15 00:00:00.000Z"; normaliza para ISO puro
  const clean = iso.split(' ')[0]
  const d = new Date(clean + 'T00:00:00')
  if (isNaN(d.getTime())) return ''
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

/** Monta a string de loja no formato "código • nome". */
function fmtLoja(item: NormItem): string {
  const codigo = item.codigoLoja?.trim() || ''
  const nome = item.loja?.trim() || ''
  if (codigo && nome) return `${codigo} • ${nome}`
  if (nome) return nome
  if (codigo) return codigo
  return ''
}

/**
 * Carrega as ocorrências filtradas de validades_base, aplicando os mesmos
 * filtros ativos na tela de Validades. Em caso de falha (base vazia ou erro
 * de rede), retorna array vazio — a exportação ainda gera o cabeçalho.
 */
export async function fetchValidadesForExport(filters?: ValidadesFilter): Promise<NormItem[]> {
  try {
    const records = await pb.collection('validades_base').getFullList({
      sort: 'validade_efetiva',
      filter: 'is_base_atual = true',
    })

    const items: NormItem[] = records.map((r) => toNormItem(r as unknown as ValidadesBaseRec))
    return applyFilters(items, filters)
  } catch (err) {
    console.error('[relatoriosExport] Falha ao carregar validades_base:', err)
    return []
  }
}

/** Formata a data atual como DD-MM-AAAA para o nome do arquivo. */
export function relatorioFileName(): string {
  const now = new Date()
  const dd = String(now.getDate()).padStart(2, '0')
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const yyyy = now.getFullYear()
  return `Relatório_Validades_${dd}-${mm}-${yyyy}.xlsx`
}

/**
 * Gera e baixa o .xlsx com as ocorrências filtradas.
 * @param filters  mesmos filtros ativos na tela de Validades (opcional)
 * @returns número de linhas exportadas (para feedback no toast)
 */
export const RUPTURAS_COLUMNS = [
  'LOJA',
  'PRODUTO',
  'MOTIVO',
  'CLIENTE',
  'DATA VISITA',
  'DIAS EM RUPTURA',
  'STATUS',
  'COLABORADOR',
] as const

export async function exportarRelatorioRupturas(
  filters?: import('@/types').RupturasFilters,
): Promise<number> {
  let records: import('@/types').Ruptura[] = []
  try {
    const raw = await pb.collection('rupturas_base').getFullList({
      sort: '-data_visita',
      filter: 'is_base_atual = true',
    })
    const { toRuptura, applyRupturasFilters } = await import('@/lib/pipeline/rupturasPipeline')
    const mapped = raw.map((r) => toRuptura(r as unknown as Record<string, unknown>))
    records = applyRupturasFilters(mapped, filters)
  } catch (err) {
    console.error('[relatoriosExport] Falha ao carregar rupturas_base:', err)
  }

  const rows: Array<Record<string, string | number>> = records.map((it) => {
    const lojaStr =
      it.codigo_loja && it.nome_loja
        ? `${it.codigo_loja} • ${it.nome_loja}`
        : it.nome_loja || it.codigo_loja || '—'
    return {
      LOJA: lojaStr,
      PRODUTO: it.produto,
      MOTIVO: it.motivo,
      CLIENTE: it.cliente || it.nome_loja || '—',
      'DATA VISITA': fmtDate(it.data_visita),
      'DIAS EM RUPTURA': it.dias_em_ruptura,
      STATUS: it.situacao_atual,
      COLABORADOR: it.colaborador || '—',
    }
  })

  const aoa: (string | number)[][] = [RUPTURAS_COLUMNS.slice()]
  for (const row of rows) {
    aoa.push(RUPTURAS_COLUMNS.map((col) => row[col] as string | number))
  }

  const worksheet = XLSX.utils.aoa_to_sheet(aoa)
  worksheet['!cols'] = RUPTURAS_COLUMNS.map((col) => {
    const maxLen = Math.max(col.length, ...rows.map((r) => String(r[col] ?? '').length))
    return { wch: Math.min(Math.max(maxLen + 2, 10), 60) }
  })

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Rupturas')

  const now = new Date()
  const dd = String(now.getDate()).padStart(2, '0')
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const yyyy = now.getFullYear()
  XLSX.writeFile(workbook, `Relatório_Rupturas_${dd}-${mm}-${yyyy}.xlsx`)

  return rows.length
}

export async function exportarRelatorioValidades(filters?: ValidadesFilter): Promise<number> {
  const items = await fetchValidadesForExport(filters)

  const rows: Array<Record<string, string | number>> = items.map((it) => ({
    PRODUTO: it.product,
    LOJA: fmtLoja(it),
    REALIZADO: fmtDate(it.ultimaAtualizacao),
    VALIDADE: fmtDate(it.validade),
    'DIAS P/VENCER': it.diasRestantes,
    QTD: it.quantidade ?? 0,
    STATUS: it.status,
  }))

  // Linha de cabeçalho (sempre presente, mesmo com zero linhas de dados)
  const aoa: (string | number)[][] = [RELATORIO_COLUMNS.slice()]
  for (const row of rows) {
    aoa.push(RELATORIO_COLUMNS.map((col) => row[col] as string | number))
  }

  const worksheet = XLSX.utils.aoa_to_sheet(aoa)

  // Largura automática aproximada por coluna
  worksheet['!cols'] = RELATORIO_COLUMNS.map((col) => {
    const maxLen = Math.max(col.length, ...rows.map((r) => String(r[col] ?? '').length))
    return { wch: Math.min(Math.max(maxLen + 2, 10), 60) }
  })

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Validades')

  XLSX.writeFile(workbook, relatorioFileName())

  return rows.length
}
