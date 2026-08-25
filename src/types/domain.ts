// =============================================================================
// TradePro — modelo bruto e processado de Validades
// =============================================================================

/**
 * Identificadores tratados como texto (preservam zeros à esquerda):
 * Cód. Colaborador, Cód. Supervisor, CPF/CNPJ, Cód. Cliente, Cód. Produto,
 * Cód. Barras, CNPJ. Não validados como CPF/CNPJ fiscal.
 */
export interface TradeProRawRecord {
  /** Código do colaborador (texto, preserva zeros à esquerda). */
  codColaborador?: string
  colaborador?: string
  codSupervisor?: string
  supervisor?: string
  /** CPF/CNPJ do cliente (texto bruto). */
  cpfCnpj?: string
  /** Razão Social original — ex.: "250 - FORT ATACADISTA FLORESTA". */
  razaoSocial?: string
  fantasia?: string
  cidade?: string
  estado?: string
  codCliente?: string
  cliente?: string
  codProduto?: string
  produto?: string
  codBarras?: string
  /** Data de fabricação (ISO YYYY-MM-DD quando disponível). */
  dataFabricacao?: string
  /** Data da coleta (ISO YYYY-MM-DD). */
  realizado?: string
  realizadoRaw?: unknown
  /** Indica se a linha foi realizada (campo "Realizado" do TradePro). */
  realizadoFlag?: string | boolean
  quantidade?: number
  quantidadeRaw?: unknown
  /** Dias para vencimento conforme arquivo (camada bruta de auditoria). */
  diasVencimentoArquivo?: number
  /** Validade original do arquivo (ISO YYYY-MM-DD). */
  validade?: string
  validadeRaw?: unknown
  numeroLote?: string
  representante?: string
  /** CNPJ do fornecedor (texto bruto). */
  cnpj?: string
  fornecedor?: string
  /** Número da linha no arquivo de origem (1-based, para desempate). */
  numeroLinha?: number
}

/** Reconhecimento de loja a partir da Razão Social. */
export interface StoreRecognition {
  /** Parte anterior ao primeiro " - " (código externo da loja). */
  codigoLoja?: string
  /** Parte posterior ao primeiro " - " (nome recebido da loja). */
  nomeLoja?: string
  /** Conteúdo completo da Razão Social. */
  razaoSocialOriginal?: string
  /** Rede identificada (quando aplicável). */
  rede?: string
  /** Fonte da identificação da loja. */
  origemReconhecimento?:
    | 'codigo_externo'
    | 'alias'
    | 'cnpj'
    | 'razao_cidade'
    | 'fantasia_rede'
    | 'manual'
    | 'nao_reconhecido'
}

/** Chave de correção de validade. */
export interface ValidadeCorrection {
  id?: string
  fornecedor: string
  razaoSocial: string
  produto: string
  /** Validade original (ISO YYYY-MM-DD). */
  validadeErrada: string
  /** Validade correta (ISO YYYY-MM-DD). */
  validadeCorreta: string
  regra?: string
  usuario?: string
  dataCorrecao?: string
}

/** Chave operacional e de deduplicação. */
export interface DedupKey {
  /** Fornecedor|Razão Social|Produto|Validade efetiva (normalizada). */
  chaveOperacional: string
  /** Chave Operacional + |Realizado (normalizada). */
  chaveDedup: string
}

/**
 * Resultado processado de uma ocorrência de validade após o pipeline TradePro.
 * Representa uma linha da Base Atual (validades_base).
 */
export interface ProcessedValidade {
  id: string
  // Identificadores operacionais
  fornecedor: string
  razaoSocial: string
  produto: string
  cliente?: string
  codCliente?: string
  codProduto?: string
  codBarras?: string
  cpfCnpj?: string
  cnpj?: string
  // Loja / Rede
  codigoLoja?: string
  nomeLoja?: string
  rede?: string
  cidade?: string
  estado?: string
  // Colaborador / Supervisor
  colaborador?: string
  codColaborador?: string
  supervisor?: string
  codSupervisor?: string
  fantasia?: string
  representante?: string
  numeroLote?: string
  // Datas
  /** Data da coleta (ISO YYYY-MM-DD). */
  realizado: string
  /** Validade original do arquivo (ISO YYYY-MM-DD). */
  validadeOriginal: string
  /** Validade após correções (ISO YYYY-MM-DD). */
  validadeEfetiva: string
  /** Data representada pelo arquivo (ISO YYYY-MM-DD). */
  dataArquivo?: string
  /** Data em que o sistema recebeu o arquivo (ISO date-time). */
  dataImportacao?: string
  /** Primeira aparição da ocorrência (menor Data Arquivo). */
  dataEntrada?: string
  /** Última aparição da ocorrência (maior Data Arquivo). */
  ultimaAparicao?: string
  // Quantidade
  quantidade: number
  /** Indica se a linha-base foi selecionada na etapa 2 (maior Realizado). */
  isBaseAtual: boolean
  // Chaves
  chaveOperacional: string
  chaveDedup: string
  // Correção aplicada
  correcaoAplicada?: boolean
  regraCorrecao?: string
  // Status
  /** Dias p/ Vencimento recalculado (Validade efetiva − data atual). */
  diasVencimentoAtual: number
  /** Dias p/ Vencimento preservado do arquivo (auditoria). */
  diasVencimentoArquivo?: number
  /** Dias p/ Vencimento na entrada (histórico, não varia). */
  diasVencimentoEntrada?: number
  /** Status Operacional atual (Vencido/Crítico/Atenção/Moderado/Normal). */
  statusOperacional: StatusOperacional
  /** Status na entrada (histórico). */
  statusNaEntrada?: StatusOperacional
  /** Situação atual: Ativo | Encerrado/Não Reportado. */
  situacaoAtual: 'Ativo' | 'Encerrado/Não Reportado'
  /** Referência à importação (import_history.id). */
  importId?: string
  created?: string
  updated?: string
}

/** Status Operacional conforme faixas de dias para vencimento. */
export type StatusOperacional = 'Vencido' | 'Crítico' | 'Atenção' | 'Moderado' | 'Normal'

// =============================================================================

export type ProductCategory = 'Mercearia' | 'Laticínios' | 'Bebidas' | 'Limpeza' | 'Higiene'

export type ValidadeStatus = StatusOperacional
export type RupturaStatus = 'Em Ruptura' | 'Crítico' | 'Reposição Prevista'
export type AlertaSeverity = 'Crítico' | 'Alerta' | 'Informativo' | 'Alto' | 'Médio'
export type AlertaType = 'Validade' | 'Ruptura'

/**
 * Níveis de criticidade de validade usados pela camada de negócio.
 * O mapeamento dias -> nível fica centralizado em `src/lib/data/criticidade.ts`.
 * Inclui 'Vencido' (dias <= 0) como nível distinto de 'Crítico'.
 */
export type CriticidadeLevel = 'Vencido' | 'Crítico' | 'Atenção' | 'Moderado' | 'OK'

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
  category: ProductCategory | 'Não informada'
  validade: string // ISO format YYYY-MM-DD
  diasRestantes: number
  status: ValidadeStatus
  unidade: string
  estoque: number
  // --- Dados de varejo (Camada 02) ---
  cliente?: string
  industria?: string
  rede?: string
  /** Código externo da loja extraído da Razão Social (ex.: "305"). */
  codigoLoja?: string
  loja?: string
  cidade?: string
  uf?: string
  promotor?: string
  supervisor?: string
  codSupervisor?: string
  quantidade?: number // quantidade de unidades envolvidas na ocorrência
  precoUnitario?: number // preço médio unitário (R$) para estimativa de exposição financeira
  ultimaAtualizacao?: string // ISO date-time string
  dataEntrada?: string
  chaveOperacional?: string
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
  atencao: number
  moderado: number
  proximo: number
  ok: number
  total: number
}

export interface ChartRupturaPeriodData {
  period: string
  eventos?: number
  criticos?: number
  resolvidos: number
  total?: number
  ativas?: number
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
  | 'resumo-validades'
  | 'rupturas-por-periodo'
  | 'top-rupturas-por-produto'
  | 'validades-proximas-vencer'
  | 'tendencia-vencimento'
  | 'rupturas-por-loja'
  | 'rupturas-por-motivo'
  | 'validades-por-loja'

export interface ReportData {
  /**
   * Tipo do relatório. Abarca os valores do union `ReportType` (usados pela UI
   * de seleção) e os tipos adicionais produzidos pelos builders em
   * `lib/data/reports` (resumo-validades, validades-por-loja, etc.).
   */
  reportType: ReportType | string
  title: string
  description: string
  generatedAt: string
  chartData: Array<Record<string, string | number>>
  tableColumns: Array<{ key: string; label: string }>
  tableRows: Array<Record<string, string | number | boolean | null>>
  summaryCards?: Array<{ label: string; value: string | number; accent?: string }>
}
