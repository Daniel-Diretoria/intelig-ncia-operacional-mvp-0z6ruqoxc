import type {
  TradeProValidadeItem,
  ValidadesApiResponse,
  TradeProRupturaItem,
  RupturasApiResponse,
  TradeProVisitaItem,
  TradeProVisitaCliente,
  VisitasApiResponse,
} from '@/types/tradeProApi'
import type { RupturaMotivo } from '@/types'

// ---------------------------------------------------------------------------
// Constantes de Bloqueio (Blocker Codes)
// ---------------------------------------------------------------------------
export const BLOCKER_MISSING_SUPPLIER = 'missing_supplier' as const
export const BLOCKER_MISSING_PRODUCT = 'missing_product' as const
export const BLOCKER_MISSING_INDUSTRY_CONTEXT = 'missing_industry_context' as const

export type TradeProBlockerCode =
  | typeof BLOCKER_MISSING_SUPPLIER
  | typeof BLOCKER_MISSING_PRODUCT
  | typeof BLOCKER_MISSING_INDUSTRY_CONTEXT

// ---------------------------------------------------------------------------
// Tipos de Resultado Discriminado (Parse / Candidatos)
// ---------------------------------------------------------------------------

export type ParseResult<T> = { success: true; data: T } | { success: false; error: string }

/**
 * Candidato parcial extraído do payload de Validade.
 * Bloqueado porque `fornecedor` (indústria) não existe no endpoint oficial documentado.
 */
export interface ValidadeCandidateBlocked {
  status: 'blocked'
  blockerCode: typeof BLOCKER_MISSING_SUPPLIER | typeof BLOCKER_MISSING_INDUSTRY_CONTEXT
  motivoBloqueio: string
  candidatoParcial: {
    colaborador: string
    codColaborador: string
    razaoSocial: string
    fantasia: string
    cpfCnpj: string
    cidade: string
    estado: string
    produto: string
    codProduto: string
    realizado: string
    quantidade: number
    validade: string
    diasVencimentoArquivo: number
  }
}

export interface ValidadeCandidateSuccess {
  status: 'valid'
  candidato: {
    colaborador: string
    codColaborador: string
    razaoSocial: string
    fantasia: string
    cpfCnpj: string
    cidade: string
    estado: string
    produto: string
    codProduto: string
    realizado: string
    quantidade: number
    validade: string
    diasVencimentoArquivo: number
    fornecedor: string
    cliente: string
  }
}

export type ValidadeCandidateResult = ValidadeCandidateBlocked | ValidadeCandidateSuccess

/**
 * Candidato parcial extraído do payload de Ruptura.
 * Bloqueado porque `descricaoAtividade` ("atividade" no JSON oficial) não é confirmado
 * como nome de produto, e `codigo_produto` está ausente.
 */
export interface RupturaCandidateBlocked {
  status: 'blocked'
  blockerCode: typeof BLOCKER_MISSING_PRODUCT
  motivoBloqueio: string
  candidatoParcial: {
    codigo_loja: string
    nome_loja: string
    cnpj_loja: string
    cidade: string
    estado: string
    cliente: string // indústria / fornecedor (descricaoFornecedor)
    fornecedor_cnpj: string
    categoria: string
    familia: string
    motivo: string // valor bruto original de descricaoMotivo
    data_visita: string
    colaborador: string
    codColaborador: string
    rede: string
    observacao: string
    ruptura_flag: number
    produto?: string
    scope?: 'product' | 'brand_total'
  }
}

export interface RupturaCandidateSuccess {
  status: 'valid'
  candidato: {
    codigo_loja: string
    nome_loja: string
    razao_social: string
    cnpj_loja: string
    cidade: string
    estado: string
    cliente: string // indústria / fornecedor (descricaoFornecedor)
    fornecedor_cnpj: string
    categoria: string
    familia: string
    motivo: string
    data_visita: string
    colaborador: string
    codColaborador: string
    rede: string
    fantasia: string
    observacao: string
    ruptura_flag: number
    produto: string
    scope: 'product' | 'brand_total'
  }
}

export type RupturaCandidateResult = RupturaCandidateBlocked | RupturaCandidateSuccess

// ---------------------------------------------------------------------------
// Normalizador de Paginação / Metadados
// ---------------------------------------------------------------------------

/**
 * Normaliza metadados de paginação recebidos da API (string ou number).
 * Retorna Number finito inteiro >= 0 ou lança erro descritivo com o nome do campo.
 */
export function normalizePageMeta(
  value: string | number | undefined | null,
  fieldName: string,
): number {
  if (value === undefined || value === null) {
    throw new Error(`Campo de paginação "${fieldName}" é obrigatório (recebido: ${String(value)}).`)
  }

  if (typeof value === 'string' && value.trim() === '') {
    throw new Error(`Campo de paginação "${fieldName}" não pode ser vazio.`)
  }

  const num = Number(value)
  if (!Number.isFinite(num) || isNaN(num)) {
    throw new Error(
      `Campo de paginação "${fieldName}" deve ser um número finito (recebido: ${String(value)}).`,
    )
  }

  if (num < 0) {
    throw new Error(
      `Campo de paginação "${fieldName}" deve ser maior ou igual a zero (recebido: ${num}).`,
    )
  }

  return Math.floor(num)
}

// ---------------------------------------------------------------------------
// Normalizador Puro de Motivo de Ruptura
// ---------------------------------------------------------------------------

/**
 * Normaliza descrições textuais de motivo de ruptura para os valores canônicos
 * do domínio ('Ruptura Total' | 'Sem Estoque Mínimo' | 'Estoque Virtual').
 * Função pura e determinística.
 */
export function normalizeMotivo(motivo: string): RupturaMotivo {
  const m = (motivo || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  if (m.includes('RUPTURA TOTAL')) return 'Ruptura Total'
  if (m.includes('ZERADO') || m.includes('SEM ESTOQUE MINIMO') || m.includes('SEM ESTOQUE MÍNIMO'))
    return 'Sem Estoque Mínimo'
  if (m.includes('ESTOQUE VIRTUAL')) return 'Estoque Virtual'
  return 'Ruptura Total'
}

// ---------------------------------------------------------------------------
// Helpers Internos de Validação
// ---------------------------------------------------------------------------

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val)
}

function safeString(val: unknown): string {
  if (typeof val === 'string') return val
  if (typeof val === 'number') return String(val)
  return ''
}

// ---------------------------------------------------------------------------
// Validades: Parser e Adaptador
// ---------------------------------------------------------------------------

export interface NormalizedValidadesResponse {
  validade: TradeProValidadeItem[]
  paginaAtual: number
  quantidadePorPagina: number
  totalDePaginas: number
  totalDeProdutos: number
}

/**
 * Valida defensivamente a estrutura da resposta da API de Validades do TradePro.
 * Normaliza metadados para números inteiros >= 0.
 */
export function parseValidadeResponse(raw: unknown): ParseResult<NormalizedValidadesResponse> {
  if (!isRecord(raw)) {
    return {
      success: false,
      error: 'Payload inválido: a resposta de Validades deve ser um objeto JSON.',
    }
  }

  if (!Array.isArray(raw.validade)) {
    return {
      success: false,
      error: 'Payload inválido: campo "validade" ausente ou não é um array.',
    }
  }

  try {
    const paginaAtual = normalizePageMeta(
      raw.paginaAtual as string | number | undefined,
      'paginaAtual',
    )
    const quantidadePorPagina = normalizePageMeta(
      raw.quantidadePorPagina as string | number | undefined,
      'quantidadePorPagina',
    )
    const totalDePaginas = normalizePageMeta(
      raw.totalDePaginas as string | number | undefined,
      'totalDePaginas',
    )
    // Detecção dinâmica de total de registros/produtos para compatibilidade com Validades
    let totalValorRaw: unknown = raw.totalDeProdutos
    if (totalValorRaw == null && isRecord(raw)) {
      const candidates = [
        'totalDeRegistros',
        'totalRegistros',
        'totalDeValidades',
        'totalValidades',
        'totalDeItens',
        'totalItens',
        'total',
        'quantidadeTotal',
      ]
      for (const cand of candidates) {
        if (raw[cand] != null) {
          totalValorRaw = raw[cand]
          break
        }
      }
      if (totalValorRaw == null) {
        for (const k of Object.keys(raw)) {
          const lower = k.toLowerCase()
          if (lower.includes('total') && !lower.includes('pagina') && !lower.includes('page')) {
            totalValorRaw = raw[k]
            break
          }
        }
      }
    }

    const totalDeProdutos = normalizePageMeta(
      totalValorRaw as string | number | undefined,
      'totalDeProdutos',
    )

    // Ajuste seguro da paginação: se a resposta da API traz totalDePaginas calculada para quantidadePorPagina=1
    // (ou se o total informado exige lotes de 30 para percorrer), derivamos a quantidade real de páginas
    // necessárias para o lote operacional padrão de 30 itens.
    let paginasCalculadas = totalDePaginas
    if (totalDeProdutos > 0 && (quantidadePorPagina === 1 || totalDePaginas === totalDeProdutos)) {
      paginasCalculadas = Math.ceil(totalDeProdutos / 30)
    }

    // Validação defensiva de cada item de validade
    const validadeItems: TradeProValidadeItem[] = []
    for (let i = 0; i < raw.validade.length; i++) {
      const it = raw.validade[i]
      if (!isRecord(it)) {
        return {
          success: false,
          error: `Item de validade no índice ${i} não é um objeto válido.`,
        }
      }

      const promotor = isRecord(it.promotor) ? it.promotor : {}
      const cliente = isRecord(it.cliente) ? it.cliente : {}
      const cidade = isRecord(cliente.cidade) ? cliente.cidade : {}
      const estado = isRecord(cidade.estado) ? cidade.estado : {}
      const produto = isRecord(it.produto) ? it.produto : {}

      validadeItems.push({
        promotor: {
          nome: safeString(promotor.nome),
          id: safeString(promotor.id),
        },
        cliente: {
          fantasia: safeString(cliente.fantasia),
          endereco: safeString(cliente.endereco),
          cpfCnpj: safeString(cliente.cpfCnpj),
          razaoSocial: safeString(cliente.razaoSocial),
          cidade: {
            nome: safeString(cidade.nome),
            estado: {
              sigla: safeString(estado.sigla),
            },
          },
        },
        produto: {
          codigo: safeString(produto.codigo),
          descricao: safeString(produto.descricao),
        },
        realizado: safeString(it.realizado),
        diasParaVencimento:
          typeof it.diasParaVencimento === 'number'
            ? it.diasParaVencimento
            : Number(it.diasParaVencimento) || 0,
        quantidade: typeof it.quantidade === 'number' ? it.quantidade : Number(it.quantidade) || 0,
        validade: safeString(it.validade),
      })
    }

    return {
      success: true,
      data: {
        validade: validadeItems,
        paginaAtual,
        quantidadePorPagina,
        totalDePaginas: paginasCalculadas,
        totalDeProdutos,
      },
    }
  } catch (err) {
    return {
      success: false,
      error: (err as Error).message || 'Erro ao processar metadados de paginação de Validades.',
    }
  }
}

/**
 * Produz um candidato parcial a partir do item oficial de Validade.
 *
 * ⚠️ BLOQUEIO ARQUITETURAL:
 * Retorna status 'blocked' com blockerCode 'missing_supplier' porque o campo
 * `fornecedor` (indústria dona do produto) não existe no endpoint oficial documentado
 * do TradePro.
 *
 * Regra estrita: NÃO usar `produto.codigo`, `cliente.fantasia`, `cliente.razaoSocial`
 * ou qualquer outro campo como fallback para fornecedor.
 * NÃO chamar funções operacionais do pipeline (ex: executarPipeline, isOperacional, gerarChaveOperacional).
 */
export interface ValidadeAdapterContext {
  supplierOperation?: string // Default: 'DIRETORIA'
  industryClient?: string
}

/**
 * Produz um candidato a partir do item oficial de Validade.
 *
 * Regras confirmadas:
 * - `supplierOperation` = 'DIRETORIA'
 * - `industryClient` é obrigatório para validação com sucesso (marca/indústria dona da validade).
 * - A marca NÃO existe no payload documentado da API; se `industryClient` não for informado,
 *   retorna `status='blocked'` com blockerCode `missing_industry_context`.
 * - Quando o contexto estiver presente: `candidate.fornecedor='DIRETORIA'` e `candidate.cliente=industryClient`.
 */
export function adaptValidadeItem(
  item: TradeProValidadeItem,
  context?: ValidadeAdapterContext,
): ValidadeCandidateResult {
  const industryClient = context?.industryClient?.trim()
  const supplierOperation = context?.supplierOperation?.trim() || 'DIRETORIA'

  if (!industryClient) {
    return {
      status: 'blocked',
      blockerCode: BLOCKER_MISSING_INDUSTRY_CONTEXT,
      motivoBloqueio:
        'Contexto da indústria/marca (industryClient) ausente. ' +
        'O payload de Validade da TradePro não contém a indústria; ' +
        'é obrigatório fornecer o contexto operacional explícito.',
      candidatoParcial: {
        colaborador: item.promotor.nome,
        codColaborador: item.promotor.id,
        razaoSocial: item.cliente.razaoSocial,
        fantasia: item.cliente.fantasia,
        cpfCnpj: item.cliente.cpfCnpj,
        cidade: item.cliente.cidade.nome,
        estado: item.cliente.cidade.estado.sigla,
        produto: item.produto.descricao,
        codProduto: item.produto.codigo,
        realizado: item.realizado,
        quantidade: item.quantidade,
        validade: item.validade,
        diasVencimentoArquivo: item.diasParaVencimento,
      },
    }
  }

  return {
    status: 'valid',
    candidato: {
      colaborador: item.promotor.nome,
      codColaborador: item.promotor.id,
      razaoSocial: item.cliente.razaoSocial,
      fantasia: item.cliente.fantasia,
      cpfCnpj: item.cliente.cpfCnpj,
      cidade: item.cliente.cidade.nome,
      estado: item.cliente.cidade.estado.sigla,
      produto: item.produto.descricao,
      codProduto: item.produto.codigo,
      realizado: item.realizado,
      quantidade: item.quantidade,
      validade: item.validade,
      diasVencimentoArquivo: item.diasParaVencimento,
      fornecedor: supplierOperation,
      cliente: industryClient,
    },
  }
}

// ---------------------------------------------------------------------------
// Rupturas: Parser e Adaptador
// ---------------------------------------------------------------------------

export interface NormalizedRupturasResponse {
  rupturas: TradeProRupturaItem[]
  paginaAtual: number
  quantidadePorPagina: number
  totalDePaginas: number
  totalDeRegistros: number
}

/**
 * Valida defensivamente a estrutura da resposta da API de Rupturas do TradePro.
 * Normaliza metadados para números inteiros >= 0.
 */
export function parseRupturasResponse(raw: unknown): ParseResult<NormalizedRupturasResponse> {
  if (!isRecord(raw)) {
    return {
      success: false,
      error: 'Payload inválido: a resposta de Rupturas deve ser um objeto JSON.',
    }
  }

  if (!Array.isArray(raw.rupturas)) {
    return {
      success: false,
      error: 'Payload inválido: campo "rupturas" ausente ou não é um array.',
    }
  }

  try {
    const paginaAtual = normalizePageMeta(
      raw.paginaAtual as string | number | undefined,
      'paginaAtual',
    )
    const quantidadePorPagina = normalizePageMeta(
      raw.quantidadePorPagina as string | number | undefined,
      'quantidadePorPagina',
    )
    const totalDePaginas = normalizePageMeta(
      raw.totalDePaginas as string | number | undefined,
      'totalDePaginas',
    )
    const totalDeRegistros = normalizePageMeta(
      raw.totalDeRegistros as string | number | undefined,
      'totalDeRegistros',
    )

    const rupturasItems: TradeProRupturaItem[] = []
    for (let i = 0; i < raw.rupturas.length; i++) {
      const it = raw.rupturas[i]
      if (!isRecord(it)) {
        return {
          success: false,
          error: `Item de ruptura no índice ${i} não é um objeto válido.`,
        }
      }

      rupturasItems.push({
        idSupervisor: safeString(it.idSupervisor),
        nomeSupervisor: safeString(it.nomeSupervisor),
        idPromotor: safeString(it.idPromotor),
        nomePromotor: safeString(it.nomePromotor),
        imeiPromotor: safeString(it.imeiPromotor),
        idCliente: safeString(it.idCliente),
        cpfCnpjCliente: safeString(it.cpfCnpjCliente),
        codigoCliente: safeString(it.codigoCliente),
        razaoSocialCliente: safeString(it.razaoSocialCliente),
        fantasiaCliente: safeString(it.fantasiaCliente),
        redeCliente: safeString(it.redeCliente),
        enderecoCliente: safeString(it.enderecoCliente),
        bairroCliente: safeString(it.bairroCliente),
        ramoAtividadeCliente: safeString(it.ramoAtividadeCliente),
        telefoneCliente: safeString(it.telefoneCliente),
        cidadeCliente: safeString(it.cidadeCliente),
        siglaEstadoCliente: safeString(it.siglaEstadoCliente),
        descricaoRotina: safeString(it.descricaoRotina),
        idAtividade: safeString(it.idAtividade),
        descricaoAtividade: safeString(it.descricaoAtividade),
        descricaoCategoria: safeString(it.descricaoCategoria),
        descricaoMotivo: safeString(it.descricaoMotivo),
        statusRoteiro: safeString(it.statusRoteiro),
        idRoteiroPadrao: safeString(it.idRoteiroPadrao),
        descricaoRoteiroPadrao: safeString(it.descricaoRoteiroPadrao),
        dataVisita: safeString(it.dataVisita),
        horaInicioExecucaoRoteiro: safeString(it.horaInicioExecucaoRoteiro),
        horaFinalExecucaoRoteiro: safeString(it.horaFinalExecucaoRoteiro),
        observacaoRuptura: safeString(it.observacaoRuptura),
        cnpjFornecedor: safeString(it.cnpjFornecedor),
        descricaoFornecedor: safeString(it.descricaoFornecedor),
        idAtividadeRuptura: safeString(it.idAtividadeRuptura),
        idCategoria: safeString(it.idCategoria),
        codigoFamilia: safeString(it.codigoFamilia),
        descricaoFamilia: safeString(it.descricaoFamilia),
        ruptura: typeof it.ruptura === 'number' ? it.ruptura : Number(it.ruptura) || 0,
        dataHoraExecucaoAtividade: safeString(it.dataHoraExecucaoAtividade),
      })
    }

    return {
      success: true,
      data: {
        rupturas: rupturasItems,
        paginaAtual,
        quantidadePorPagina,
        totalDePaginas,
        totalDeRegistros,
      },
    }
  } catch (err) {
    return {
      success: false,
      error: (err as Error).message || 'Erro ao processar metadados de paginação de Rupturas.',
    }
  }
}

/**
 * Produz um candidato parcial apenas com mapeamentos inequívocos do item de Ruptura.
 *
 * ⚠️ BLOQUEIO ARQUITETURAL:
 * Retorna status 'blocked' com blockerCode 'missing_product' porque `descricaoAtividade`
 * é documentado como "atividade" no JSON oficial (ex: "EXEMPLO ATIVIDADE") e não há
 * confirmação oficial de que corresponda ao nome do produto.
 * Além disso, o campo `codigo_produto` também está ausente no endpoint documentado.
 * Até haver confirmação oficial do TradePro, o item permanece bloqueado.
 */
/**
 * Normaliza chave de marca para comparação estrita e determinística.
 * Trim, toLowerCase, remove acentos (NFD), compacta espaços.
 */
function normalizeBrandKeyLocal(s: string): string {
  if (!s) return ''
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

/**
 * Produz um candidato a partir do item oficial de Ruptura da TradePro.
 *
 * Regras confirmadas pela diretoria:
 * - `descricaoAtividade` mapeia para `produto`.
 * - Se `produto` normalizado for exatamente igual a `descricaoFornecedor` (marca) normalizado,
 *   define `scope='brand_total'`; caso contrário, `scope='product'`.
 * - `codigo_produto` permanece ausente/opcional, sem inventar códigos.
 */
export interface RupturaAdapterContext {
  industryClient?: string
}

export function adaptRupturaItem(
  item: TradeProRupturaItem,
  context?: RupturaAdapterContext,
): RupturaCandidateSuccess {
  const produto = item.descricaoAtividade || ''
  // Semântica oficial Bloco B.1:
  // Cliente/Cód. Cliente -> Indústria.
  // Fornecedor -> Fornecedor operacional. Fornecedor NÃO vira Indústria.
  // Se o contexto fornecer industryClient ou houver tradepro_cliente_nome, prioriza a Indústria real.
  const clienteIndustria = context?.industryClient || item.razaoSocialCliente || ''
  const fornecedorNome = item.descricaoFornecedor || ''

  const isTotal =
    Boolean(produto) &&
    Boolean(fornecedorNome) &&
    normalizeBrandKeyLocal(produto) === normalizeBrandKeyLocal(fornecedorNome)

  return {
    status: 'valid',
    candidato: {
      codigo_loja: item.codigoCliente,
      nome_loja: item.razaoSocialCliente,
      razao_social: item.razaoSocialCliente,
      cnpj_loja: item.cpfCnpjCliente,
      cidade: item.cidadeCliente,
      estado: item.siglaEstadoCliente,
      cliente: clienteIndustria,
      fornecedor_cnpj: item.cnpjFornecedor,
      categoria: item.descricaoCategoria,
      familia: item.descricaoFamilia,
      motivo: item.descricaoMotivo,
      data_visita: item.dataVisita,
      colaborador: item.nomePromotor,
      codColaborador: item.idPromotor,
      rede: item.fantasiaCliente || item.redeCliente,
      fantasia: item.fantasiaCliente,
      observacao: item.observacaoRuptura,
      ruptura_flag: item.ruptura,
      produto,
      scope: isTotal ? 'brand_total' : 'product',
    },
  }
}

// ===== ADAPTER DE VISITAS FACTUAL =====

export interface VisitaNormalizadaOperacional {
  data: string
  promoter_cod: string
  promoter_nome: string
  store_code: string
  store_nome: string
  hora_entrada?: string
  hora_saida?: string
  duracao_minutos?: number
  status: 'realizada' | 'pendente' | 'cancelada'
  origem: 'tradepro_api'
  vinculo_relacao: 'observado'
  origem_relacao: 'observado_visita'
  raw_data: Record<string, unknown>
}

/**
 * Calcula duração em minutos estritamente quando ambos os horários estiverem presentes.
 * NUNCA inventa minutos nem arredonda se faltar um dos limites.
 */
export function computeVisitaDurationMinutes(
  horaEntrada?: string | null,
  horaSaida?: string | null,
): number | undefined {
  if (!horaEntrada || !horaSaida) return undefined
  const p1 = String(horaEntrada).trim().split(':')
  const p2 = String(horaSaida).trim().split(':')
  if (p1.length < 2 || p2.length < 2) return undefined
  const m1 = parseInt(p1[0], 10) * 60 + parseInt(p1[1], 10)
  const m2 = parseInt(p2[0], 10) * 60 + parseInt(p2[1], 10)
  if (isNaN(m1) || isNaN(m2) || m2 < m1) return undefined
  return m2 - m1
}

/**
 * Normaliza um item factual de visita vindo da TradePro.
 * Respeita regras do produto:
 * - Não inventa check-in nem check-out
 * - Duração somente se ambos os lados existirem
 * - Vínculo promotor-loja sempre como 'observado' (origem 'observado_visita')
 * - Preserva dados brutos integrais
 */
export function adaptVisitaItem(
  promotorItem: TradeProVisitaItem,
  clienteItem?: TradeProVisitaCliente,
  defaultData?: string,
): VisitaNormalizadaOperacional {
  const promoterCod = String(
    promotorItem.idPromotor != null ? promotorItem.idPromotor : promotorItem.promotor?.id || '',
  ).trim()

  const promoterNome = (promotorItem.nomePromotor || promotorItem.promotor?.nome || '').trim()

  const rawStoreCod = clienteItem?.codigo != null ? String(clienteItem.codigo).trim() : ''
  const rawStoreNome = (
    clienteItem?.razaoSocial ||
    clienteItem?.nome ||
    clienteItem?.fantasia ||
    ''
  ).trim()

  const rawData = (
    clienteItem?.data ||
    clienteItem?.dataVisita ||
    defaultData ||
    new Date().toISOString().split('T')[0]
  )
    .split('T')[0]
    .split(' ')[0]

  const rawEntrada =
    clienteItem?.horaEntrada || clienteItem?.checkIn || clienteItem?.horaInicio || clienteItem?.hora
  const rawSaida = clienteItem?.horaSaida || clienteItem?.checkOut || clienteItem?.horaFim

  const cleanEntrada = rawEntrada ? String(rawEntrada).trim() : undefined
  const cleanSaida = rawSaida ? String(rawSaida).trim() : undefined
  const duracao = computeVisitaDurationMinutes(cleanEntrada, cleanSaida)

  const isRealizada =
    clienteItem?.realizada === true ||
    clienteItem?.status === 'realizada' ||
    Number(promotorItem.visitasRealizadas || 0) > 0

  return {
    data: rawData,
    promoter_cod: promoterCod,
    promoter_nome: promoterNome,
    store_code: rawStoreCod,
    store_nome: rawStoreNome,
    hora_entrada: cleanEntrada,
    hora_saida: cleanSaida,
    duracao_minutos: duracao,
    status: isRealizada ? 'realizada' : 'pendente',
    origem: 'tradepro_api',
    vinculo_relacao: 'observado',
    origem_relacao: 'observado_visita',
    raw_data: {
      promotorItem,
      clienteItem,
    },
  }
}
