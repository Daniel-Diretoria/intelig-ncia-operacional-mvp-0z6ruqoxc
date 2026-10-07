// ===== TIPOS AUXILIARES =====

/** promotor é objeto { nome, id }, NÃO string */
export interface TradeProPromotor {
  nome: string
  id: string // preservar como texto, zeros à esquerda
}

/** cliente.cidade é objeto aninhado { nome, estado: { sigla } } */
export interface TradeProClienteCidade {
  nome: string
  estado: {
    sigla: string
  }
}

export interface TradeProCliente {
  cidade: TradeProClienteCidade // aninhado, extrair .nome e .estado.sigla
  fantasia: string
  endereco: string
  cpfCnpj: string
  razaoSocial: string
}

export interface TradeProProduto {
  codigo: string // preservar zeros à esquerda
  descricao: string
}

// ===== VALIDADES =====

export interface TradeProValidadeItem {
  promotor: TradeProPromotor
  cliente: TradeProCliente
  produto: TradeProProduto
  realizado: string
  diasParaVencimento: number
  quantidade: number
  validade: string
}

/** Metadados aceitam string | number na borda externa (API retorna strings no JSON real) */
export interface ValidadesApiResponse {
  validade: TradeProValidadeItem[]
  paginaAtual: string | number
  quantidadePorPagina: string | number
  totalDePaginas: string | number
  totalDeProdutos: string | number
}

// ===== RUPTURAS =====

/** APENAS os campos documentados no JSON oficial. NÃO inventar produto.codigo nem produto.descricao. */
export interface TradeProRupturaItem {
  idSupervisor: string
  nomeSupervisor: string
  idPromotor: string
  nomePromotor: string
  imeiPromotor: string
  idCliente: string
  cpfCnpjCliente: string
  codigoCliente: string
  razaoSocialCliente: string
  fantasiaCliente: string
  redeCliente: string
  enderecoCliente: string
  bairroCliente: string
  ramoAtividadeCliente: string
  telefoneCliente: string
  cidadeCliente: string
  siglaEstadoCliente: string
  descricaoRotina: string
  idAtividade: string
  descricaoAtividade: string
  descricaoCategoria: string
  descricaoMotivo: string
  statusRoteiro: string
  idRoteiroPadrao: string
  descricaoRoteiroPadrao: string
  dataVisita: string
  horaInicioExecucaoRoteiro: string
  horaFinalExecucaoRoteiro: string
  observacaoRuptura: string
  cnpjFornecedor: string
  descricaoFornecedor: string
  idAtividadeRuptura: string
  idCategoria: string
  codigoFamilia: string
  descricaoFamilia: string
  ruptura: number
  dataHoraExecucaoAtividade: string
}

export interface RupturasApiResponse {
  rupturas: TradeProRupturaItem[]
  paginaAtual: string | number
  quantidadePorPagina: string | number
  totalDePaginas: string | number
  totalDeRegistros: string | number
}

// ===== VISITAS =====

export interface TradeProVisitaCliente {
  codigo?: string | number
  razaoSocial?: string
  nome?: string
  fantasia?: string
  data?: string
  dataVisita?: string
  horaEntrada?: string
  checkIn?: string
  horaInicio?: string
  hora?: string
  horaSaida?: string
  checkOut?: string
  horaFim?: string
  realizada?: boolean
  status?: string
}

export interface TradeProVisitaItem {
  idPromotor: string | number
  nomePromotor: string
  idSupervisor?: string | number
  nomeSupervisor?: string
  visitasPrevistas?: number | string
  visitasRealizadas?: number | string
  percentualVisitas?: string | number
  promotor?: {
    id?: string | number
    nome?: string
    carteiraClientes?: TradeProVisitaCliente[]
  }
}

export interface VisitasApiResponse {
  visitas: TradeProVisitaItem[]
  paginaAtual: string | number
  quantidadePorPagina: string | number
  totalDePaginas: string | number
  totalDeRegistros: string | number
}
