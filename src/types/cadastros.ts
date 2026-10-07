/**
 * Tipagens canônicas para a área de Cadastros do SKIP.
 *
 * Princípio arquitetural:
 * - "Cadastro responde: 'Quem existe e como essas entidades se relacionam?'"
 * - "Operação responde: 'O que precisa ser feito?'"
 * - "Inteligência responde: 'O que esses dados estão nos mostrando?'"
 *
 * As entidades possuem identidade própria no SKIP e suportam identificadores
 * de fontes externas presentes (TradePro) e futuras (App Diretoria).
 */

export interface CadastroExternalIds {
  tradepro_client_id?: string
  tradepro_client_name?: string
  app_diretoria_id?: string
  [key: string]: string | undefined
}

// 1. Indústria / Marca
export interface CadastroIndustria {
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
  tradepro_client_id?: string
  tradepro_client_name?: string
  app_diretoria_industry_id?: string
  edicao_manual?: boolean
  origem_fonte?: string
  ultima_observacao_fonte?: string
  created?: string
  updated?: string
}

// 2. Produto (Catálogo Mestre estruturalmente ligado à Indústria)
export interface CadastroProduto {
  id: string
  industry_id: string
  industry_name: string
  codigo_produto?: string // Cód. externo (TradePro ou fonte)
  codigo_interno?: string // Cód. interno SKU SKIP
  cod_barras?: string // EAN
  nome_produto: string
  categoria?: string
  familia?: string
  sabor?: string
  gramatura?: string
  embalagem?: string
  tipo_mix: 'oficial_industria' | 'observado_operacional' | 'fora_mix_oficial'
  status: 'ativo' | 'descontinuado' | 'em_avaliacao'
  shelf_life_dias?: number
  store_code_restrito?: string
  app_diretoria_product_id?: string
  aliases?: string[]
  created?: string
  updated?: string
}

// 3. Rede (Varejista / Grupo)
export interface CadastroRede {
  id: string
  nome: string
  codigo_externo?: string
  cnpj?: string
  ativo: boolean
  total_lojas?: number
  created?: string
  updated?: string
}

// 4. Loja (Ponto de Venda)
export interface CadastroLoja {
  id: string
  codigo_externo: string // ex: "085", "165", "250"
  codigo_loja?: string
  nome: string
  nome_loja?: string
  razao_social: string // ex: "165 - FORT ATACADISTA AVENTUREIRO"
  network_id?: string
  rede_nome?: string
  cnpj?: string
  cidade: string
  estado: string
  regiao?: string
  ativo: boolean
  app_diretoria_store_id?: string
  edicao_manual?: boolean
  origem_fonte?: string
  ultima_observacao_fonte?: string
  created?: string
  updated?: string
}

// 5. Supervisor Mestre
export interface CadastroSupervisor {
  id: string
  nome: string
  codigo_externo?: string // Cód. Supervisor TradePro (ex: "3")
  telefone?: string
  email?: string
  status: 'ativo' | 'inativa' | 'inativo'
  regiao?: string
  observacoes?: string
  app_diretoria_supervisor_id?: string
  total_promotores?: number
  edicao_manual?: boolean
  origem_fonte?: string
  ultima_observacao_fonte?: string
  created?: string
  updated?: string
}

// 6. Promotor Mestre
export interface CadastroPromotor {
  id: string
  nome: string
  codigo_externo?: string // Cód. Colaborador TradePro (ex: "234")
  telefone?: string
  cpf?: string
  supervisor_id?: string
  supervisor_nome?: string
  status: 'ativo' | 'inativo'
  regiao?: string
  observacoes?: string
  app_diretoria_promoter_id?: string
  total_lojas?: number
  industrias_relacionadas?: string[]
  edicao_manual?: boolean
  origem_fonte?: string
  ultima_observacao_fonte?: string
  created?: string
  updated?: string
}

// Relação Temporal Promotor × Loja × Indústria
export interface CadastroPromotorAssignment {
  id: string
  promoter_id: string
  promoter_nome: string
  store_id?: string
  store_code: string
  store_name: string
  industry_id?: string
  industry_name?: string
  status: 'ativo' | 'encerrado'
  tipo_vinculo?: 'confirmado' | 'observado_visita'
  origem_vinculo?: string
  data_inicio?: string
  data_fim?: string
  observacao?: string
  created?: string
  updated?: string
}

// Evento Operacional de Visita Real
export interface OperacionalVisita {
  id: string
  data: string // YYYY-MM-DD
  promoter_id?: string
  promoter_cod?: string
  promoter_nome: string
  store_id?: string
  store_code: string
  store_name?: string
  industry_name?: string
  hora_inicio?: string // Check-in ou início informado pela API
  hora_fim?: string // Check-out ou término informado
  duracao_minutos?: number
  status_roteiro?: string
  sequencia?: number
  origem_fonte: string
  observacao?: string
  dados_brutos_json?: Record<string, unknown>
  created?: string
  updated?: string
}

// Conflito Detectado: API vs Configuração Manual
export interface CadastroConflito {
  id: string
  tipo_entidade: 'industria' | 'produto' | 'rede' | 'loja' | 'promotor' | 'supervisor'
  entidade_id: string
  entidade_nome: string
  campo: string
  valor_atual: string
  valor_recebido: string
  fonte_origem: string
  data_deteccao: string
}

// Fila de Resolução Estrutural de Pendências de Cadastro
export type CadastroPendenciaTipo =
  | 'industria'
  | 'rede'
  | 'loja'
  | 'produto'
  | 'promotor'
  | 'supervisor'

export type CadastroPendenciaStatus = 'pendente' | 'vinculado' | 'ignorado'

export interface CadastroPendencia {
  id: string
  tipo_entidade: CadastroPendenciaTipo
  valor_identificador: string // ex: Cód. Cliente 99, Produto 'leite condensado novo', etc.
  codigo_externo?: string
  nome_identificado?: string
  contexto_adicional?: Record<string, unknown>
  origem_fonte: string // ex: "tradepro_rupturas", "tradepro_validades", "importacao_whatsapp"
  status: CadastroPendenciaStatus
  volume_ocorrencias?: number
  entidade_resolvida_id?: string
  entidade_resolvida_nome?: string
  resolvido_por?: string
  resolvido_em?: string
  observacao_resolucao?: string
  created?: string
  updated?: string
}

// Inteligência Básica Explicável de Mix (Oportunidades Operacionais de Presença)
// 7. Resultado Completo da Homologação Cadastral (Bloco A)
export interface HomologacaoCadastralResultado {
  dataExecucao: string
  universoProcessado: {
    validadesLidas: number
    rupturasLidas: number
    visitasLidas: number
    totalPaginasPorFonte: {
      validades: number
      rupturas: number
      visitas: number
    }
  }
  industrias: {
    descobertas: number
    vinculadas: number
    pendentes: number
    conflitos: number
    detalhes: Array<{ id: string; nome: string; codCliente?: string; status: string }>
  }
  redes: {
    descobertas: number
    vinculadas: number
    pendentes: number
    detalhes: Array<{ id: string; nome: string; status: string }>
  }
  lojas: {
    descobertas: number
    vinculadas: number
    pendentes: number
    possiveisDuplicidades: number
    detalhes: Array<{ id: string; codigo: string; nome: string; rede?: string; status: string }>
  }
  produtos: {
    descobertos: number
    resolvidos: number
    pendentes: number
    ambiguos: number
    detalhes: Array<{
      id?: string
      codigo?: string
      nome: string
      industria?: string
      status: string
    }>
  }
  promotores: {
    descobertos: number
    vinculados: number
    pendentes: number
    detalhes: Array<{ id: string; codigo?: string; nome: string; status: string }>
  }
  supervisores: {
    descobertos: number
    vinculados: number
    pendentes: number
    detalhes: Array<{ id: string; codigo?: string; nome: string; status: string }>
  }
  relacoes: {
    detectadas: number
    novasPersistidas: number
    jaExistentes: number
    pendentes: number
  }
  vinculosObservados: {
    promotorLoja: number
    promotorIndustria: number
    supervisorPromotor: number
  }
}

export interface MixOpportunityAnalysis {
  produtoNome: string
  codigoProduto?: string
  industriaNome: string
  lojaCodigo: string
  lojaNome: string
  redeNome: string
  motivo: string // Explicação cuidadosa operacional: presença, ausência, cobertura em lojas da rede
  totalLojasRede: number
  lojasComPresencaRede: number
  percentualPresencaRede: number
  statusSugerido: 'avaliacao_inclusao_mix' | 'baixa_presenca_operacional'
}
