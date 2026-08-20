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
