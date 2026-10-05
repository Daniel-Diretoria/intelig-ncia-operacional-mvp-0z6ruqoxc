import type {
  ResearchFrequency,
  ResearchDay,
  ResearchType,
  ResolvedValidityPolicy,
  StoreProductMixStatus,
} from './industryOperational'

// 1. Status de Criticidade de Acompanhamento (Inteligência Operacional)
export type TrackingStatus = 'atualizado' | 'atencao' | 'critico'

// 2. Status de Criticidade de Validade (Indústria)
export type ValidityStatusHealth = 'normal' | 'moderado' | 'atencao' | 'critico'

// 3. Resultado de Tratativa Operacional
export type TratativaResultado =
  | 'atualizacao_solicitada'
  | 'aguardando_retorno'
  | 'produto_vendido_zerado'
  | 'ruptura_confirmada'
  | 'produto_nao_trabalha_mais'
  | 'mix_loja_precisa_atualizar'
  | 'pesquisa_inconsistente'
  | 'situacao_regularizada'
  | 'observacao_manual'

export type TratativaStatus = 'aberto' | 'em_andamento' | 'regularizado' | 'cancelado'

// 4. Registro de Tratativa persistido no backend (linha do tempo)
export interface TrackingTratativa {
  id: string
  industry_id?: string
  industry_name: string
  store_code?: string
  store_name: string
  product_name: string
  product_code?: string
  resultado: TratativaResultado
  usuario_nome: string
  observacao?: string
  resposta?: string
  motivo_identificacao?: string
  ultimo_estado_conhecido_json?: TrackingLastKnownState
  data_identificacao: string
  data_regularizacao?: string
  status_tratativa: TratativaStatus
  sugestao_mix_loja?: boolean
  created?: string
  updated?: string
}

// 5. Último Estado Conhecido (preservado e apresentado para qualquer produto)
export interface TrackingLastKnownState {
  ultimaDataAtualizacao?: string
  ultimaQuantidadeConhecida?: number
  ultimaValidadeConhecida?: string
  ultimaRupturaConhecida?: {
    motivo: string
    data: string
    situacao: string
  }
  ultimoCicloAcompanhado?: string // ex: "2026-09-22"
  ciclosSemAtualizacao: number
}

// 6. Situação de Acompanhamento detalhada
export type SituacaoAcompanhamento =
  | 'atualizado_normal'
  | 'atualizado_qtd_zero'
  | 'ausencia_explicada_ruptura'
  | 'um_ciclo_sem_atualizacao'
  | 'dois_mais_ciclos_sem_atualizacao'
  | 'aguardando_confirmacao'
  | 'possivel_inconsistencia_dados'

// 7. Qualidade do Ciclo da Pesquisa
export interface CycleQualityAssessment {
  isInconsistent: boolean
  isPesquisaNaoRealizada: boolean
  motivoInconsistencia?: string
  volumeAtual: number
  volumeHistoricoEsperado: number
  percentualQueda?: number
  detalhesAuditaveis: string
}

// 8. Ciclo de Pesquisa Calculado
export interface ResearchCycle {
  cicloId: string
  dataEsperada: string // YYYY-MM-DD
  frequencia: ResearchFrequency
  diaEsperado: ResearchDay
  ehCicloAtual: boolean
}

// 9. Item de Acompanhamento Operacional por Produto/Loja/Indústria
export interface OperationalTrackingItem {
  id: string // industry_name + store + product
  industryId?: string
  industryName: string
  storeCode: string
  storeName: string
  city?: string
  state?: string
  network?: string
  productName: string
  productCode?: string
  category?: string

  // As Duas Dimensões de Saúde SEPARADAS:
  acompanhamentoStatus: TrackingStatus
  validadeStatus: ValidityStatusHealth

  // Situação detalhada:
  situacaoAcompanhamento: SituacaoAcompanhamento
  situacaoDescricao: string

  // Prioridade Operacional Explicável:
  prioridadeNivel: 'maxima' | 'alta' | 'media' | 'normal'
  prioridadeScore: number
  prioridadeExplicacao: string

  // Origem do Mix esperado:
  origemMix: 'mix_definido_loja' | 'historico_observado'
  pertenceMixDefinido: boolean
  storeMixStatus?: StoreProductMixStatus

  // Último Estado Conhecido:
  ultimoEstado: TrackingLastKnownState

  // Contexto de Ruptura:
  possuiRupturaRecente: boolean
  rupturaDetalhes?: {
    motivo: string
    dataVisita: string
    situacao: string
  }

  // Política de Validade Utilizada (Rastreável):
  politicaValidade: ResolvedValidityPolicy

  // Qualidade do Ciclo na Loja:
  qualidadeCiclo: CycleQualityAssessment

  // Tratativas recentes associadas:
  tratativasRecentes?: TrackingTratativa[]
  aguardandoRetornoTratativa: boolean
}

// 10. Resumo de Acompanhamento Operacional
export interface OperationalTrackingSummary {
  totalMonitorados: number
  totalAtualizados: number
  totalAtencao: number // 1 ciclo
  totalCriticos: number // 2+ ciclos
  atualizadosComQtdZero: number
  ausenciasExplicadasRuptura: number
  ciclosComInconsistencia: number
  pesquisasNaoRealizadasLojas: number
  prioridadeMaximaCount: number
}
