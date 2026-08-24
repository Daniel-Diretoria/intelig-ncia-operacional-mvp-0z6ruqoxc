import type {
  TradeProValidadeItem,
  ValidadesApiResponse,
  TradeProRupturaItem,
  RupturasApiResponse,
} from '@/types/tradeProApi'
import type { RupturaMotivo } from '@/types'

// ---------------------------------------------------------------------------
// Constantes de Bloqueio (Blocker Codes)
// ---------------------------------------------------------------------------
export const BLOCKER_MISSING_SUPPLIER = 'missing_supplier' as const
export const BLOCKER_MISSING_PRODUCT = 'missing_product' as const

export type TradeProBlockerCode = typeof BLOCKER_MISSING_SUPPLIER | typeof BLOCKER_MISSING_PRODUCT

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
  blockerCode: typeof BLOCKER_MISSING_SUPPLIER
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
  }
}

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
    const totalDeProdutos = normalizePageMeta(
      raw.totalDeProdutos as string | number | undefined,
      'totalDeProdutos',
    )

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
        totalDePaginas,
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
export function adaptValidadeItem(item: TradeProValidadeItem): ValidadeCandidateBlocked {
  return {
    status: 'blocked',
    blockerCode: BLOCKER_MISSING_SUPPLIER,
    motivoBloqueio:
      'Campo "fornecedor" (indústria) ausente no endpoint documentado da API TradePro de Validades. ' +
      'Nenhum fallback arbitrário é permitido sem confirmação oficial da fonte.',
    candidatoParcial: {
      colaborador: item.promotor.nome,
      codColaborador: item.promotor.id, // preserva texto e zeros à esquerda
      razaoSocial: item.cliente.razaoSocial,
      fantasia: item.cliente.fantasia,
      cpfCnpj: item.cliente.cpfCnpj,
      cidade: item.cliente.cidade.nome,
      estado: item.cliente.cidade.estado.sigla,
      produto: item.produto.descricao,
      codProduto: item.produto.codigo, // preserva texto e zeros à esquerda
      realizado: item.realizado,
      quantidade: item.quantidade,
      validade: item.validade,
      diasVencimentoArquivo: item.diasParaVencimento,
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
export function adaptRupturaItem(item: TradeProRupturaItem): RupturaCandidateBlocked {
  return {
    status: 'blocked',
    blockerCode: BLOCKER_MISSING_PRODUCT,
    motivoBloqueio:
      'Campo de produto ausente/não-confirmado na API TradePro de Rupturas. ' +
      'O campo "descricaoAtividade" não possui confirmação oficial de ser o nome do produto, ' +
      'e "codigo_produto" está ausente no endpoint documentado.',
    candidatoParcial: {
      codigo_loja: item.codigoCliente, // preserva zeros à esquerda (ex: "0007")
      nome_loja: item.razaoSocialCliente,
      cnpj_loja: item.cpfCnpjCliente,
      cidade: item.cidadeCliente,
      estado: item.siglaEstadoCliente,
      cliente: item.descricaoFornecedor, // indústria / fornecedor
      fornecedor_cnpj: item.cnpjFornecedor,
      categoria: item.descricaoCategoria,
      familia: item.descricaoFamilia,
      motivo: item.descricaoMotivo, // valor bruto original; normalizeMotivo() disponível se necessário
      data_visita: item.dataVisita,
      colaborador: item.nomePromotor,
      codColaborador: item.idPromotor,
      rede: item.redeCliente,
      observacao: item.observacaoRuptura,
      ruptura_flag: item.ruptura,
    },
  }
}
