/**
 * Modelo de domínio do módulo de Rupturas.
 *
 * Espelha as collections `rupturas_base`, `rupturas_imports` e
 * `rupturas_historico` no PocketBase, criadas pela migration 0007.
 *
 * Um `Ruptura` representa um registro vigente (is_base_atual = true) da
 * Base Atual de Rupturas — já deduplicado por `dedup_key`
 * (codigo_loja|produto|cliente) e com a maior `data_visita` de cada grupo.
 */

/** Motivo de ruptura padronizado a partir do campo "Motivo" do TradePro. */
export type RupturaMotivo = 'Ruptura Total' | 'Sem Estoque Mínimo' | 'Estoque Virtual'

/** Situação atual da ruptura na Base Atual. */
export type RupturaSituacao = 'Ativo' | 'Resolvido'

export interface Ruptura {
  id: string
  /** Coluna "Atividade" do TradePro — nome do produto em ruptura. */
  produto: string
  motivo: RupturaMotivo
  /** Código numérico extraído da Razão Social (ex.: "085"), com zeros à esquerda. */
  codigo_loja: string
  /** Razão Social completa (ex.: "085 - FORT ATACADISTA JARAGUÁ DO SUL"). */
  nome_loja: string
  cnpj_loja: string
  cidade: string
  estado: string
  codigo_cliente: string
  /** Nome do cliente/fornecedor (ex.: FRUTAP, ITALAC). */
  cliente: string
  colaborador: string
  categoria: string
  observacao: string
  /** ISO YYYY-MM-DD — data da visita registrada no TradePro. */
  data_visita: string
  /** ISO YYYY-MM-DD — data da primeira aparição da ocorrência. */
  data_entrada: string
  /** ISO YYYY-MM-DD — data da última aparição da ocorrência. */
  ultima_aparicao: string
  /** ISO YYYY-MM-DD — data da resolução/encerramento da ruptura (se resolvido). */
  data_resolucao?: string
  /** Dias calculados desde data_entrada/data_visita até hoje. */
  dias_em_ruptura?: number
  situacao_atual: RupturaSituacao
  /** Chave: codigo_loja|produto|data_visita. */
  operational_key: string
  /** Chave: codigo_loja|produto|cliente. */
  dedup_key: string
  /** FK para rupturas_imports. */
  source_import_id: string
  /** Número da linha no arquivo de origem (1-based). */
  source_row: number
}

export interface RupturasFilters {
  /** Busca textual em produto e nome_loja. */
  search?: string
  /** Código externo da loja (codigo_loja). */
  loja?: string
  /** Motivo padronizado (Ruptura Total / Sem Estoque Mínimo / Estoque Virtual). */
  motivo?: string
  /** Nome do cliente/fornecedor. */
  cliente?: string
  /** Situação atual: Ativo | Resolvido. */
  situacao?: RupturaSituacao
  /** ISO YYYY-MM-DD — início do período de data_visita. */
  dataInicio?: string
  /** ISO YYYY-MM-DD — fim do período de data_visita. */
  dataFim?: string
}

export interface RupturasTendencia {
  /** Direção da variação semana-a-semana. */
  direcao: 'up' | 'down' | 'stable'
  /** Variação percentual entre a semana atual e a anterior (-100 a +inf). */
  variacao: number
  /** Total de eventos (data_visita) na semana atual (últimos 7 dias). */
  atual: number
  /** Total de eventos (data_visita) na semana anterior (7-14 dias atrás). */
  anterior: number
}

export interface RupturasKpis {
  /** Total de rupturas ativas (is_base_atual = true, situacao_atual = 'Ativo'). */
  totalAtivas: number
  /** Registros com data_entrada ou data_visita nos últimos 7 dias. */
  novasNoPeriodo: number
  /** Total de registros com situacao_atual = 'Resolvido'. */
  resolvidas: number
  /** Total de todos os registros analisados. */
  totalGeral: number
  /** Contagem por motivo padronizado. */
  porMotivo: {
    'Ruptura Total': number
    'Sem Estoque Mínimo': number
    'Estoque Virtual': number
  }
  /** Aliases legados para compatibilidade */
  total_ativas?: number
  novas_no_periodo?: number
  total_geral?: number
  por_motivo?: {
    'Ruptura Total': number
    'Sem Estoque Mínimo': number
    'Estoque Virtual': number
  }
  /** Top 5 lojas com mais rupturas ativas (codigo_loja + nome_loja). */
  topLojas: Array<{ codigo_loja: string; nome_loja: string; total: number }>
  /** Top 5 produtos mais em ruptura. */
  topProdutos: Array<{ produto: string; total: number }>
  /** Top 5 clientes/fornecedores com mais rupturas ativas. */
  topClientes: Array<{ cliente: string; total: number }>
  /** Tendência semana-a-semana (eventos por data_visita). */
  tendencia: RupturasTendencia
}

/**
 * Resultado completo do pipeline de importação de Rupturas.
 * Espelha os contadores persistidos na collection `rupturas_imports`.
 */
export interface RupturasImportResult {
  importId: string
  file_name: string
  file_hash: string
  total_rows_read: number
  total_rows_valid: number
  total_rows_invalid: number
  total_raw_rows_saved: number
  total_rows_processed: number
  total_occurrences_generated: number
  total_audit_records: number
  total_historical_records: number
  status:
    | 'Recebida'
    | 'Validando'
    | 'Processando'
    | 'Consolidando'
    | 'Concluída'
    | 'Concluída com rejeições'
    | 'Falhou'
    | 'Cancelada'
  error_message?: string
}

/**
 * Tipos para o Motor de Confronto Rupturas × Validades (operational_cross_evidence)
 */
export type MatchMethod = 'high_code_product' | 'medium_exact_name' | 'inconclusive'
export type CrossEvidenceConfidence = 'high' | 'medium' | 'inconclusive'
export type ProposedStatus = 'inferred_resolved' | 'awaiting_review' | 'inconclusive' | 'reopened'
export type ReviewStatus = 'pending' | 'confirmed' | 'rejected'

export interface CrossEvidence {
  id?: string
  rupture_record_id: string
  validity_record_id: string
  store_code: string
  store_name: string
  store_key: string
  product_code: string
  product_name: string
  product_key: string
  client_or_brand: string
  rupture_detected_at: string
  stock_evidence_at: string
  quantity_found: number
  product_expiry_date: string
  resolution_days: number
  match_method: MatchMethod
  confidence: CrossEvidenceConfidence
  proposed_status: ProposedStatus
  review_status: ReviewStatus
  reviewed_at?: string
  reviewed_by?: string
  rejection_reason?: string
  engine_version: string
  evidence_key: string
  created_at?: string
  updated_at?: string
  created?: string
  updated?: string
  // Dados expandidos opcionais para visualização / drilldown
  expand?: {
    rupture_record_id?: Ruptura
    validity_record_id?: Record<string, unknown>
  }
}

export interface CrossEvidenceFilter {
  store?: string
  product?: string
  brand?: string
  confidence?: CrossEvidenceConfidence | 'all'
  proposed_status?: ProposedStatus | 'all'
  review_status?: ReviewStatus | 'all'
  periodStart?: string
  periodEnd?: string
  quickAudit?:
    | 'no_product_code'
    | 'same_day_no_time'
    | 'different_brand'
    | 'similar_products'
    | 'rejected'
    | 'all'
}

export interface CrossEvidenceKpis {
  rupturasOficiaisAtivas: number // sempre 184 (hardcoded ou lido de rupturas_base)
  evidenciasAltaConfianca: number
  evidenciasAguardandoRevisao: number
  confrontosInconclusivos: number
  rupturasReabertas: number
  tempoMedioAteEvidencia: number | null // dias, só para datas válidas
}

export interface ReconciliationResult {
  rupturasAnalisadas: number
  validadesAnalisadas: number
  evidenciasGeradas: number
  high: number
  medium: number
  inconclusive: number
  reopened: number
  semCorrespondencia: number
  erros: number
  detalhes?: string[]
}
