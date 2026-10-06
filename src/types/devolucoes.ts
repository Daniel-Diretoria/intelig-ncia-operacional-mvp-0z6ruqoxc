/**
 * Módulo Devoluções / NF — Tipos e interfaces de domínio
 * Inteligência Operacional SKIP (Diretoria Promoções)
 */

export type DevolucaoStatus =
  | 'solicitacao_recebida'
  | 'em_analise'
  | 'aguardando_informacao'
  | 'pronta_para_envio'
  | 'aguardando_autorizacao_industria'
  | 'industria_autorizou'
  | 'aguardando_nf_descarte'
  | 'concluido'
  | 'divergencia_encontrada'
  | 'nao_autorizado'
  | 'cancelado'

export type AuditoriaClassificacao =
  | 'acompanhamento_consistente'
  | 'atencao'
  | 'divergencia'
  | 'dados_insuficientes'
  | 'nao_auditado'

export type DecisaoHumanaItem =
  | 'pendente'
  | 'aprovado_para_industria'
  | 'solicitar_informacao_promotor'
  | 'registrar_divergencia'
  | 'manter_em_analise'
  | 'rejeitado'

export type TimelineEventoTipo =
  | 'criacao_solicitacao'
  | 'edicao_dados'
  | 'inclusao_item'
  | 'remocao_item'
  | 'edicao_item'
  | 'auditoria_executada'
  | 'decisao_humana'
  | 'mudanca_status'
  | 'informacao_solicitada'
  | 'resposta_recebida'
  | 'evidencia_anexada'
  | 'autorizacao_industria'
  | 'nf_registrada'
  | 'descarte_registrado'
  | 'caso_concluido'
  | 'outro'

export type EvidenciaTipo =
  | 'foto_produto'
  | 'foto_validade'
  | 'foto_lote'
  | 'nf_documento'
  | 'nf_assinada'
  | 'comprovante_descarte'
  | 'outro'

/** Registro histórico anterior de validade encontrado na auditoria */
export interface AuditoriaHistoricoRegistro {
  data: string // YYYY-MM-DD
  quantidade: number
  validade: string // YYYY-MM-DD ou 'Não informada'
  colaborador?: string
  status_operacional?: string
}

/** Ruptura relacionada encontrada na auditoria */
export interface AuditoriaRupturaContexto {
  data: string
  motivo: string
  situacao: string
  observacao?: string
}

/** Detalhe explicável da auditoria para um item */
export interface AuditoriaItemDetalhes {
  produtoLocalizado: boolean
  correspondenciaSegura: boolean
  termoBuscado: string
  produtoIdentificadoNome?: string
  produtoIdentificadoCodigo?: string
  registrosAnteriores: AuditoriaHistoricoRegistro[]
  totalRegistrosAnteriores: number
  ultimaAtualizacaoAnterior?: AuditoriaHistoricoRegistro
  mesmaValidadeEncontrada: boolean
  quantidadeZeroRegistrada: boolean
  periodosSemAtualizacao: boolean
  diasSemAtualizacao?: number
  ciclosSemAtualizacao?: number
  cicloEsperadoDescricao?: string
  continuidadeNaoDeterminavel?: boolean
  rupturasRelacionadas: AuditoriaRupturaContexto[]
  dadosHistoricoInsuficientes: boolean
  motivoInsuficiencia?: string
  dataInicioBaseHistorica?: string
  dataSolicitacaoAuditorada: string
  registrosPosterioresIgnorados: number // Regra 8: garantir transparência
  resumoExplicativo: string
}

export interface DevolucaoItem {
  id: string
  caso_id: string
  codigo_caso?: string
  produto_nome_informado: string
  produto_id?: string
  produto_codigo?: string
  produto_nome_oficial?: string
  precisa_identificacao?: boolean
  quantidade_solicitada: number
  quantidade_autorizada?: number
  quantidade_devolvida?: number
  valor_unitario?: number
  validade_informada?: string
  validade_ausente?: boolean
  motivo_item?: string
  observacao?: string
  evidencia_foto_url?: string
  classificacao_auditoria?: AuditoriaClassificacao
  auditoria_explicacao?: string
  auditoria_detalhes_json?: AuditoriaItemDetalhes
  decisao_humana?: DecisaoHumanaItem
  decisao_observacao?: string
  decisao_usuario_nome?: string
  decisao_data?: string
  created?: string
  updated?: string
}

export interface DevolucaoCaso {
  id: string
  codigo_caso: string // ex: "DEV-2026-0001"
  data_solicitacao: string // YYYY-MM-DD
  industry_id?: string
  industry_name: string
  store_id?: string
  store_code?: string
  store_name: string
  promotor_nome: string
  promotor_cod?: string
  motivo_geral?: string
  observacoes?: string
  status: DevolucaoStatus
  responsavel_nome?: string
  proxima_acao?: string
  total_itens: number
  total_unidades_solicitadas: number
  total_unidades_autorizadas?: number
  total_unidades_devolvidas?: number
  // Preparação financeira futura (Regra 19)
  valor_solicitado?: number
  valor_autorizado?: number
  valor_devolvido?: number
  // Preparação para NF e Descarte (Regra 20)
  nf_numero?: string
  nf_data?: string
  nf_valor?: number
  nf_anexo_nome?: string
  nf_assinada_anexo_nome?: string
  evidencia_descarte_anexo_nome?: string
  autorizacao_protocolo?: string
  autorizacao_data?: string
  resultado_auditoria_geral?: AuditoriaClassificacao
  resumo_auditoria_json?: {
    itens_consistentes: number
    itens_atencao: number
    itens_divergencia: number
    itens_insuficientes: number
    data_auditoria: string
  }
  created_by?: string
  created?: string
  updated?: string
  // Itens agregados quando carregados em detalhe
  itens?: DevolucaoItem[]
  evidencias?: DevolucaoEvidencia[]
  timeline?: DevolucaoTimelineEvento[]
}

export interface DevolucaoTimelineEvento {
  id: string
  caso_id: string
  codigo_caso?: string
  tipo_evento: TimelineEventoTipo
  titulo: string
  descricao?: string
  usuario_nome?: string
  usuario_id?: string
  item_id?: string
  item_nome?: string
  status_anterior?: string
  status_novo?: string
  dados_extras_json?: Record<string, unknown>
  data_evento: string
  created?: string
  updated?: string
}

export interface DevolucaoEvidencia {
  id: string
  caso_id: string
  item_id?: string
  timeline_id?: string
  tipo: EvidenciaTipo
  titulo: string
  descricao?: string
  url_arquivo?: string
  arquivo?: string
  usuario_nome?: string
  created?: string
  updated?: string
}

export interface DevolucaoAuditLog {
  id: string
  caso_id: string
  acao: string
  usuario_nome?: string
  usuario_id?: string
  detalhes_json?: Record<string, unknown>
  data_acao: string
  created?: string
  updated?: string
}

export interface CriarDevolucaoItemInput {
  produto_nome_informado: string
  produto_codigo?: string
  produto_nome_oficial?: string
  precisa_identificacao?: boolean
  quantidade_solicitada: number
  validade_informada?: string // 'YYYY-MM-DD' ou vazio
  validade_ausente?: boolean
  motivo_item?: string
  observacao?: string
  evidencia_foto_url?: string
}

export interface CriarDevolucaoCasoInput {
  data_solicitacao: string // YYYY-MM-DD
  industry_id?: string
  industry_name: string
  store_id?: string
  store_code?: string
  store_name: string
  promotor_nome: string
  promotor_cod?: string
  motivo_geral?: string
  observacoes?: string
  responsavel_nome?: string
  itens: CriarDevolucaoItemInput[]
  evidencias?: Array<{
    tipo: EvidenciaTipo
    titulo: string
    descricao?: string
    url_arquivo?: string
    arquivo?: File
  }>
}

export interface DevolucoesFiltros {
  busca?: string
  periodoInicio?: string
  periodoFim?: string
  industria?: string
  loja?: string
  promotor?: string
  status?: DevolucaoStatus | 'todos'
  classificacaoAuditoria?: AuditoriaClassificacao | 'todos'
}

/** Níveis de correspondência explicáveis do Resolvedor de Produtos (sem falsa precisão) */
export type NivelCorrespondenciaProduto =
  | 'correspondencia_segura'
  | 'muito_provavel'
  | 'possivel'
  | 'ambigua'
  | 'nao_identificado'

/** Sinal explicável de contexto para cada candidato */
export interface SinalExplicavelCandidato {
  rotulo: string
  presente: boolean
}

/** Candidato sugerido pelo Resolvedor de Produtos */
export interface CandidatoProdutoSugerido {
  codigo?: string
  nome: string
  industria_nome: string
  nivel: NivelCorrespondenciaProduto
  sinais: SinalExplicavelCandidato[]
  scoreOrdenacao: number
  motivoPrincipal: string
  aliasCorrespondente?: string
}

/** Entrada para o Resolvedor de Produtos */
export interface ResolverProdutoInput {
  textoInformado: string
  industriaNome?: string
  industriaId?: string
  storeCode?: string
  storeName?: string
  permitirOutrasIndustrias?: boolean
}

/** Resultado retornado pelo Resolvedor de Produtos */
export interface ResolverProdutoResultado {
  termoNormalizado: string
  nivel: NivelCorrespondenciaProduto
  produtoOficial?: {
    codigo?: string
    nome: string
    industria_nome: string
  }
  candidatos: CandidatoProdutoSugerido[]
  aliasUtilizado?: string
  precisaConfirmacaoHumana: boolean
  explicacao: string
}

/** Alias / Dicionário de produtos persistido */
export interface ProductAliasRegistro {
  id?: string
  alias: string
  alias_normalizado: string
  produto_oficial_nome: string
  produto_oficial_codigo?: string
  industria_id?: string
  industria_nome: string
  familia?: string
  sabor?: string
  gramatura?: string
  tipo_alias?: 'sku_direto' | 'familia_generica'
  confirmado_por?: string
  origem?: string
  status: 'ativo' | 'inativo'
  quantidade_utilizacoes?: number
  ultima_utilizacao?: string
  observacao?: string
  created?: string
  updated?: string
}

/** Item de solicitação identificado em importação WhatsApp */
export interface SolicitacaoIdentificadaWhatsApp {
  id: string
  rawMensagemId?: string
  timestamp?: string
  dataHoraMsg?: string
  autor?: string
  lojaInformada?: string
  lojaResolvida?: {
    codigo: string
    nome: string
  }
  industriaInformada?: string
  industriaResolvida?: {
    id?: string
    nome: string
  }
  produtos: Array<{
    id: string
    textoProdutoInformado: string
    quantidadeInformada: number
    validadeInformada?: string
    validadeAusente?: boolean
    motivoInformado?: string
    oQueEstaSendoSolicitado?: string
    evidenciaDisponivel?: boolean
    evidenciaNome?: string
    evidenciaArquivo?: File | Blob
    resolucaoProduto?: ResolverProdutoResultado
    produtoConfirmado?: {
      codigo?: string
      nome: string
    }
  }>
  incompleta: boolean
  camposFaltantes: string[]
  evidenciasDisponiveis: Array<{
    nome: string
    tipo: EvidenciaTipo
    url?: string
    arquivo?: File | Blob
    segura: boolean
  }>
  grupoCasoSugeridoId?: string
  statusRevisao: 'pendente' | 'confirmada' | 'ignorada'
}

/** Registro de histórico de importação WhatsApp */
export interface DevolucoesImportBatchRegistro {
  id?: string
  file_name: string
  file_hash: string
  origem_canal: string
  total_mensagens: number
  mensagens_conhecidas: number
  mensagens_novas: number
  solicitacoes_identificadas: number
  solicitacoes_revisadas: number
  solicitacoes_importadas: number
  solicitacoes_ignoradas: number
  solicitacoes_incompletas: number
  usuario_nome?: string
  resumo_processamento_json?: Record<string, unknown>
  hashes_mensagens_json?: string[]
  created?: string
}

/** Documento do Arquivo de Devoluções / NF */
export interface DocumentoArquivoDevolucao {
  id: string
  caso_id: string
  codigo_caso: string
  data_solicitacao: string
  ano: number
  mes: number // 1 a 12
  mesNome: string // Ex: "Outubro"
  loja_codigo: string
  loja_nome: string
  industria_nome: string
  promotor_nome?: string
  tipo: EvidenciaTipo
  tipoRotulo: string
  nomeOriginal: string
  url?: string
  usuarioQueAnexou?: string
  dataEnvio?: string
  itemIdRelacionado?: string
  itemNomeRelacionado?: string
  observacao?: string
  nf_numero?: string
  nf_assinada: boolean
  descarte_realizado: boolean
  casoStatus: DevolucaoStatus
}

/** Estrutura em Árvore Ano → Mês → Loja → Casos para o Arquivo Documental */
export interface ArvoreArquivoNo {
  chave: string // identificador único do nó
  titulo: string
  subtitulo?: string
  tipo: 'ano' | 'mes' | 'loja' | 'caso'
  contagemDocumentos: number
  documentos: DocumentoArquivoDevolucao[]
  filhos?: ArvoreArquivoNo[]
  metadadosCaso?: {
    codigo_caso: string
    industry_name: string
    status: DevolucaoStatus
    nf_recebida: boolean
    nf_assinada: boolean
    descarte_recebido: boolean
    completo: boolean
  }
}

/** Agrupamento da Fila Operacional (Regra 16) */
export interface FilaOperacionalAgrupada {
  precisaDeAcao: DevolucaoCaso[] // Aguardando análise, Com divergência, Aguardando informação
  emAndamento: DevolucaoCaso[] // Prontas para envio, Aguardando indústria, Aguardando NF + descarte
  finalizadas: DevolucaoCaso[] // Concluídas, Não autorizado, Cancelado
  contagens: {
    total: number
    precisaDeAcao: number
    emAndamento: number
    finalizadas: number
    divergencias: number
    aguardandoInformacao: number
    aguardandoAnalise: number
  }
}
