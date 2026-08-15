export type ProductCategory = 'Mercearia' | 'Laticínios' | 'Bebidas' | 'Limpeza' | 'Higiene'

export type ValidadeStatus = 'Crítico' | 'Próximo' | 'OK'
export type RupturaStatus = 'Em Ruptura' | 'Crítico' | 'Reposição Prevista'
export type AlertaSeverity = 'Crítico' | 'Alto' | 'Médio'
export type AlertaType = 'Validade' | 'Ruptura'

/**
 * Níveis de criticidade de validade usados pela camada de negócio.
 * O mapeamento dias -> nível fica centralizado em `src/lib/data/criticidade.ts`.
 */
export type CriticidadeLevel = 'Crítico' | 'Atenção' | 'Moderado' | 'OK'

export interface Product {
  id: string
  name: string
  sku: string
  category: ProductCategory
  supplier?: string
  unit: string
}

export interface ValidadeItem {
  id: string
  product: string
  sku: string
  lote: string
  category: ProductCategory
  validade: string // ISO format YYYY-MM-DD
  diasRestantes: number
  status: ValidadeStatus
  unidade: string
  estoque: number
  // --- Dados de varejo (Camada 02) ---
  cliente?: string
  industria?: string
  rede?: string
  loja?: string
  cidade?: string
  uf?: string
  promotor?: string
  supervisor?: string
  quantidade?: number // quantidade de unidades envolvidas na ocorrência
  precoUnitario?: number // preço médio unitário (R$) para estimativa de exposição financeira
  ultimaAtualizacao?: string // ISO date-time string
}

export interface RupturaItem {
  id: string
  product: string
  sku: string
  category: ProductCategory
  diasSemEstoque: number
  status: RupturaStatus
  reposicaoPrevista: string | null // ISO format or null
  supplier?: string
  unidade: string
}

export interface AlertaItem {
  id: string
  title: string
  message: string
  type: AlertaType
  severity: AlertaSeverity
  product?: string
  sku?: string
  category?: ProductCategory
  timestamp: string // ISO date-time string
  isRead?: boolean
}

export interface KpiSummary {
  validadesCriticas: {
    count: number
    delta: string
    trend: 'up' | 'down' | 'neutral'
  }
  rupturasAtivas: {
    count: number
    delta: string
    trend: 'up' | 'down' | 'neutral'
  }
  alertasAbertos: {
    count: number
    delta: string
    trend: 'up' | 'down' | 'neutral'
  }
  produtosEmRisco: {
    count: number
    delta: string
    trend: 'up' | 'down' | 'neutral'
  }
  // Mini summaries
  validadesStatusCounts: {
    critico: number
    proximo: number
    ok: number
  }
  rupturasStatusCounts: {
    emRuptura: number
    critico: number
    reposicaoPrevista: number
  }
}

export interface ChartCategoryData {
  category: string
  critico: number
  proximo: number
  ok: number
  total: number
}

export interface ChartRupturaPeriodData {
  period: string
  eventos: number
  criticos: number
  resolvidos: number
}

export interface ValidadesFilter {
  search?: string
  category?: string
  status?: string
  // --- Filtros Camada 02 ---
  cliente?: string
  industria?: string
  rede?: string
  loja?: string
  cidade?: string
  produto?: string
  promotor?: string
  supervisor?: string
  criticidades?: CriticidadeLevel[]
  dataInicio?: string // ISO YYYY-MM-DD (início do período)
  dataFim?: string // ISO YYYY-MM-DD (fim do período)
  // Drill-down ativo
  drill?: ValidadeDrill
}

/** Nível atual de drill-down na hierarquia Visão Geral > Cliente > Loja > Produto > Ocorrência. */
export type ValidadeDrillLevel = 'overview' | 'cliente' | 'loja' | 'produto' | 'ocorrencia'

export interface ValidadeDrill {
  level: ValidadeDrillLevel
  cliente?: string
  loja?: string
  produto?: string
  ocorrenciaId?: string
}

export interface RupturasFilter {
  search?: string
  category?: string
  status?: string
}

export interface AlertasFilter {
  search?: string
  severity?: string
  type?: string
}

export type ReportType =
  | 'validades-por-categoria'
  | 'rupturas-por-periodo'
  | 'top-rupturas-por-produto'
  | 'validades-proximas-vencer'

export interface ReportData {
  reportType: ReportType
  title: string
  description: string
  generatedAt: string
  chartData: Array<Record<string, string | number>>
  tableColumns: Array<{ key: string; label: string }>
  tableRows: Array<Record<string, string | number | boolean | null>>
  summaryCards?: Array<{ label: string; value: string | number; accent?: string }>
}
