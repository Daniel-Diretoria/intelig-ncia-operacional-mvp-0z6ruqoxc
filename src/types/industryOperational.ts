export interface IndustryRegistry {
  id: string
  nome: string
  nome_chave: string
  razao_social?: string
  cnpj?: string
  status: 'ativa' | 'inativa'
  segmento?: string
  contato_nome?: string
  contato_email?: string
  contato_telefone?: string
  observacoes?: string
  created?: string
  updated?: string
}

export type StoreCoverageRelationStatus = 'detectada' | 'confirmada' | 'ativa' | 'inativa'

export interface IndustryStoreCoverage {
  id: string
  industry_id: string
  industry_name: string
  store_code?: string
  store_name: string
  network_name?: string
  city?: string
  state?: string
  status_relacao: StoreCoverageRelationStatus
  observacao?: string
  origem_deteccao?: string
  created?: string
  updated?: string
}

export type ProductMixType = 'oficial_industria' | 'observado_operacional'
export type ProductMixStatus = 'ativo' | 'descontinuado' | 'em_avaliacao'

export interface IndustryProductMix {
  id: string
  industry_id: string
  industry_name: string
  codigo_produto?: string
  cod_barras?: string
  nome_produto: string
  categoria?: string
  tipo_mix: ProductMixType
  status: ProductMixStatus
  shelf_life_dias?: number
  store_code_restrito?: string
  created?: string
  updated?: string
}

export type ResearchType = 'validades' | 'rupturas'
export type ResearchFrequency = 'diaria' | 'semanal' | 'quinzenal' | 'mensal'
export type ResearchDay =
  | 'segunda'
  | 'terca'
  | 'quarta'
  | 'quinta'
  | 'sexta'
  | 'sabado'
  | 'domingo'
  | 'qualquer'

export interface IndustryResearchConfig {
  id: string
  industry_id: string
  tipo_pesquisa: ResearchType
  ativo: boolean
  frequencia: ResearchFrequency
  dia_esperado: ResearchDay
  horario_limite?: string
  tolerancia_dias?: number
  instrucoes?: string
  created?: string
  updated?: string
}

export type PolicyLevel = 'sistema' | 'industria' | 'produto_excecao'

export interface IndustryValidityPolicy {
  id: string
  industry_id?: string
  nivel_regra: PolicyLevel
  produto_nome?: string
  codigo_produto?: string
  dias_critico: number
  dias_atencao: number
  dias_moderado?: number
  shelf_life_padrao_dias?: number
  justificativa?: string
  ativo: boolean
  created?: string
  updated?: string
}

export type AuditModule = 'identificacao' | 'cobertura' | 'mix' | 'pesquisas' | 'politica_validade'

export interface IndustryConfigAudit {
  id: string
  industry_id?: string
  modulo: AuditModule
  acao: string
  usuario_nome?: string
  detalhes_json?: Record<string, unknown>
  data_alteracao: string
  created?: string
  updated?: string
}

export interface ResolvedValidityPolicy {
  diasCritico: number
  diasAtencao: number
  diasModerado: number
  shelfLifeEsperado?: number
  origem: 'produto_excecao' | 'industria' | 'sistema'
  detalhesOrigem: string
}
