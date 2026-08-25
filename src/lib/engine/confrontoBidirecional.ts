import { parseOperationalDate, toOperationalIsoDate } from '../format/dateParser'
import { normalizeStoreCode } from '../format/storeCode'
import { normalizeString } from './reconciliationKeys'
import type { Ruptura } from '@/types/rupturas'
import type { ValidadeRecord } from './ruptureValidityReconciliationEngine'

export type StatusHistoricoRuptura =
  | 'Encerrada por validade posterior'
  | 'Encerrada por ruptura posterior'

export type RupturaEncerrada = Ruptura & {
  statusHistorico: StatusHistoricoRuptura
  eventoReferencia: {
    id: string
    data: string
    tipo: 'validade' | 'ruptura'
  }
  diasResolucao: number
  origemInferida?: boolean
}

export type MotivoConflito =
  | 'Mesma data sem horário'
  | 'Chave incompleta'
  | 'Expansão insegura'
  | 'Match ambíguo'

export type ConflitoAuditoria = {
  chave: string
  loja: string
  marca: string
  produto: string
  dataRuptura: string
  dataValidade: string
  motivo: MotivoConflito
  origemRuptura: string
  origemValidade: string
}

export interface ConfrontoBidirecionalResult {
  ativas: Ruptura[]
  historico: RupturaEncerrada[]
  conflitos: ConflitoAuditoria[]
}

const GENERIC_PRODUCT_NAMES = new Set([
  '',
  'todos',
  'geral',
  'todos os produtos',
  'todo sortimento',
  'marca toda',
  'todos produtos',
])

/**
 * Normaliza código de produto ou código de barras para chave.
 */
function extractProductCodeOrExactName(
  codProduto: unknown,
  codBarras: unknown,
  nomeProduto: unknown,
): { keyPart: string; isExactName: boolean; isCode: boolean } {
  const cProd = String(codProduto || '').trim()
  const cBarras = String(codBarras || '').trim()
  const nome = normalizeString(nomeProduto)

  if (cProd && cProd !== 'undefined' && cProd !== 'null' && normalizeString(cProd) !== nome) {
    return { keyPart: normalizeString(cProd), isExactName: false, isCode: true }
  }

  if (
    cBarras &&
    cBarras !== 'undefined' &&
    cBarras !== 'null' &&
    normalizeString(cBarras) !== nome
  ) {
    return { keyPart: normalizeString(cBarras), isExactName: false, isCode: true }
  }

  if (nome) {
    return { keyPart: nome, isExactName: true, isCode: false }
  }

  return { keyPart: '', isExactName: false, isCode: false }
}

/**
 * Constrói a chave operacional determinística:
 * `${codigoLojaNormalizado}|${marcaNormalizada}|${codigoProdutoOuNomeExato}`
 *
 * codigoLoja: normalizado com normalizeStoreCode (preserva zeros à esquerda "00085", "085", etc.)
 * marca: campo cliente normalizado (trim, lowercase, sem acentos)
 */
export function buildOperationalConfrontoKey(
  codigoLoja: string | number | null | undefined,
  marca: unknown,
  productKeyPart: string,
): string {
  const normStore = normalizeStoreCode(codigoLoja)
  const normBrand = normalizeString(marca)
  return `${normStore}|${normBrand}|${productKeyPart}`
}

/**
 * Função pura que executa o Confronto Bidirecional in-memory entre Rupturas e Validades da Base Atual.
 *
 * Regras:
 * A) realizado_validade > data_visita_ruptura (validade posterior):
 *    - Ruptura sai da lista de ativas
 *    - Vai para histórico como "Encerrada por validade posterior"
 *    - Referência: { id, data, tipo: 'validade' }, resolutionDays
 * B) data_visita_ruptura > realizado_validade (ruptura posterior):
 *    - Ruptura PERMANECE ativa
 * C) realizado_validade === data_visita_ruptura (mesma data):
 *    - NENHUM vencedor automático
 *    - Vai para conflitos (ConflitoAuditoria)
 *
 * Ruptura Total sem produto específico:
 * - Se motivo === 'Ruptura Total' e produto é genérico/vazio:
 *   - Expande SOMENTE para produtos da marca (cliente) que já aparecem em validades ou rupturas naquela loja.
 *   - Se não houver sortimento confiável, envia para conflito "Expansão insegura" sem alteração automática.
 */
export function computeConfrontoBidirecional(
  rupturas: Ruptura[],
  validades: ValidadeRecord[],
): ConfrontoBidirecionalResult {
  const conflitos: ConflitoAuditoria[] = []
  const historico: RupturaEncerrada[] = []
  const ativas: Ruptura[] = []

  // Constrói mapa do sortimento conhecido por Loja + Marca a partir de validades e rupturas
  // Chave: `${normStore}|${normBrand}` => Set de produtos conhecidos { code, name }
  const sortimentoConhecido = new Map<
    string,
    Map<string, { codProduto?: string; codBarras?: string; produtoNome: string }>
  >()

  const registerSortimento = (
    storeCode: string | number | null | undefined,
    brand: unknown,
    item: { codProduto?: string; codBarras?: string; produtoNome: string },
  ) => {
    const sCode = normalizeStoreCode(storeCode)
    const bName = normalizeString(brand)
    if (!sCode || !bName) return
    const key = `${sCode}|${bName}`
    if (!sortimentoConhecido.has(key)) {
      sortimentoConhecido.set(key, new Map())
    }
    const pKeyInfo = extractProductCodeOrExactName(
      item.codProduto,
      item.codBarras,
      item.produtoNome,
    )
    if (pKeyInfo.keyPart && !GENERIC_PRODUCT_NAMES.has(normalizeString(item.produtoNome))) {
      sortimentoConhecido.get(key)!.set(pKeyInfo.keyPart, item)
    }
  }

  // Popula sortimento a partir de validades
  for (const val of validades) {
    const rawStore = val.codigo_loja
    const rawBrand = val.cliente || val.fornecedor || val.razao_social
    registerSortimento(rawStore, rawBrand, {
      codProduto: val.cod_produto ? String(val.cod_produto) : undefined,
      codBarras: val.cod_barras ? String(val.cod_barras) : undefined,
      produtoNome: String(val.produto || ''),
    })
  }

  // Popula sortimento a partir de rupturas com produto específico
  for (const rup of rupturas) {
    const rawStore = rup.codigo_loja
    const rawBrand = rup.cliente
    const normProd = normalizeString(rup.produto)
    if (rup.produto && !GENERIC_PRODUCT_NAMES.has(normProd)) {
      registerSortimento(rawStore, rawBrand, {
        codProduto: (rup as unknown as { cod_produto?: string }).cod_produto,
        produtoNome: rup.produto,
      })
    }
  }

  // Agrupa validades por chave operacional: Map<chave, ValidadeRecord[]>
  const validadesMap = new Map<string, ValidadeRecord[]>()
  for (const val of validades) {
    const normStore = normalizeStoreCode(val.codigo_loja)
    const normBrand = normalizeString(val.cliente || val.fornecedor || val.razao_social)
    const pInfo = extractProductCodeOrExactName(val.cod_produto, val.cod_barras, val.produto)

    if (!normStore || !normBrand || !pInfo.keyPart) {
      continue
    }

    const key = `${normStore}|${normBrand}|${pInfo.keyPart}`
    if (!validadesMap.has(key)) {
      validadesMap.set(key, [])
    }
    validadesMap.get(key)!.push(val)
  }

  // Processa cada Ruptura
  for (const rup of rupturas) {
    const normStore = normalizeStoreCode(rup.codigo_loja)
    const normBrand = normalizeString(rup.cliente)
    const normProd = normalizeString(rup.produto)
    const isGenericProduct = !rup.produto || GENERIC_PRODUCT_NAMES.has(normProd)
    const isRupturaTotal = rup.motivo === 'Ruptura Total'

    // Validação de chave básica
    if (!normStore || !normBrand) {
      conflitos.push({
        chave: `${normStore || 'SEM_LOJA'}|${normBrand || 'SEM_MARCA'}|${normProd || 'SEM_PROD'}`,
        loja: rup.nome_loja || rup.codigo_loja || 'Desconhecida',
        marca: rup.cliente || 'Desconhecida',
        produto: rup.produto || 'Não informado',
        dataRuptura: rup.data_visita || 'Não informada',
        dataValidade: '—',
        motivo: 'Chave incompleta',
        origemRuptura: rup.id || 'id_desconhecido',
        origemValidade: '—',
      })
      ativas.push(rup)
      continue
    }

    // Caso de expansão: Ruptura Total sem produto específico
    if (isGenericProduct && isRupturaTotal) {
      const sortimentoKey = `${normStore}|${normBrand}`
      const sortimentoLoja = sortimentoConhecido.get(sortimentoKey)

      if (!sortimentoLoja || sortimentoLoja.size === 0) {
        // Sem sortimento confiável na loja -> Auditoria / Conflito
        conflitos.push({
          chave: `${normStore}|${normBrand}|EXPANSAO_VAZIA`,
          loja: rup.nome_loja || rup.codigo_loja || normStore,
          marca: rup.cliente,
          produto: rup.produto || 'Ruptura Total Marca',
          dataRuptura: rup.data_visita || '',
          dataValidade: '—',
          motivo: 'Expansão insegura',
          origemRuptura: rup.id,
          origemValidade: '—',
        })
        ativas.push(rup)
        continue
      }

      // Expande para os produtos do sortimento conhecido daquela loja
      for (const [pKeyPart, sortItem] of sortimentoLoja.entries()) {
        const expandedKey = `${normStore}|${normBrand}|${pKeyPart}`
        const matchedValidades = validadesMap.get(expandedKey) || []

        const expandedRuptura: Ruptura = {
          ...rup,
          id: `${rup.id}_exp_${pKeyPart}`,
          produto: sortItem.produtoNome || rup.produto,
          observacao: rup.observacao
            ? `${rup.observacao} (Inferido por ruptura total da marca)`
            : 'Inferido por ruptura total da marca',
        }

        processSingleRupturaMatch(
          expandedRuptura,
          matchedValidades,
          expandedKey,
          normStore,
          normBrand,
          sortItem.produtoNome,
          ativas,
          historico,
          conflitos,
          true,
        )
      }
      continue
    }

    if (isGenericProduct && !isRupturaTotal) {
      // Produto genérico sem ser Ruptura Total -> Conflito
      conflitos.push({
        chave: `${normStore}|${normBrand}|PRODUTO_GENERICO`,
        loja: rup.nome_loja || rup.codigo_loja || normStore,
        marca: rup.cliente,
        produto: rup.produto || 'Produto genérico',
        dataRuptura: rup.data_visita || '',
        dataValidade: '—',
        motivo: 'Chave incompleta',
        origemRuptura: rup.id,
        origemValidade: '—',
      })
      ativas.push(rup)
      continue
    }

    // Ruptura com produto específico
    const codProdRup = (rup as unknown as { cod_produto?: string }).cod_produto
    const pInfo = extractProductCodeOrExactName(codProdRup, undefined, rup.produto)
    const opKey = `${normStore}|${normBrand}|${pInfo.keyPart}`

    const matchedValidades = validadesMap.get(opKey) || []

    processSingleRupturaMatch(
      rup,
      matchedValidades,
      opKey,
      normStore,
      normBrand,
      rup.produto,
      ativas,
      historico,
      conflitos,
      false,
    )
  }

  return {
    ativas,
    historico,
    conflitos,
  }
}

/**
 * Confronta uma ruptura específica com a lista de validades correspondentes à mesma chave operacional.
 */
function processSingleRupturaMatch(
  rup: Ruptura,
  matchedValidades: ValidadeRecord[],
  opKey: string,
  normStore: string,
  normBrand: string,
  prodName: string,
  ativas: Ruptura[],
  historico: RupturaEncerrada[],
  conflitos: ConflitoAuditoria[],
  isInferida: boolean,
) {
  const rupDate = parseOperationalDate(rup.data_visita)
  if (!rupDate) {
    // Data de visita inválida -> Conflito
    conflitos.push({
      chave: opKey,
      loja: rup.nome_loja || rup.codigo_loja || normStore,
      marca: rup.cliente || normBrand,
      produto: prodName,
      dataRuptura: rup.data_visita || 'Data inválida',
      dataValidade: '—',
      motivo: 'Chave incompleta',
      origemRuptura: rup.id,
      origemValidade: '—',
    })
    ativas.push(rup)
    return
  }

  if (matchedValidades.length === 0) {
    // Sem validade na mesma chave -> Permanece ativa
    ativas.push(rup)
    return
  }

  // Ordena validades por realizado (mais recente primeiro)
  const sortedValidades = [...matchedValidades].sort((a, b) => {
    const dA = parseOperationalDate(a.realizado)?.getTime() || 0
    const dB = parseOperationalDate(b.realizado)?.getTime() || 0
    return dB - dA
  })

  // Validade mais recente
  const topValidade = sortedValidades[0]
  const valDate = parseOperationalDate(topValidade.realizado)

  if (!valDate) {
    ativas.push(rup)
    return
  }

  const rupTime = rupDate.getTime()
  const valTime = valDate.getTime()

  // REGRA C: Mesma data (sem horário)
  if (valTime === rupTime) {
    conflitos.push({
      chave: opKey,
      loja: rup.nome_loja || rup.codigo_loja || normStore,
      marca: rup.cliente || normBrand,
      produto: prodName,
      dataRuptura: toOperationalIsoDate(rupDate) || rup.data_visita,
      dataValidade: toOperationalIsoDate(valDate) || String(topValidade.realizado || ''),
      motivo: 'Mesma data sem horário',
      origemRuptura: rup.id,
      origemValidade: topValidade.id,
    })
    // Sem alteração automática de estado
    ativas.push(rup)
    return
  }

  // REGRA A: Validade posterior (realizado > data_visita)
  if (valTime > rupTime) {
    const diffDays = Math.max(0, Math.round((valTime - rupTime) / 86400000))
    historico.push({
      ...rup,
      statusHistorico: 'Encerrada por validade posterior',
      eventoReferencia: {
        id: topValidade.id,
        data: toOperationalIsoDate(valDate) || String(topValidade.realizado || ''),
        tipo: 'validade',
      },
      diasResolucao: diffDays,
      origemInferida: isInferida,
    })
    return
  }

  // REGRA B: Ruptura posterior (data_visita > realizado)
  if (rupTime > valTime) {
    // Ruptura PERMANECE ativa
    ativas.push(rup)
    return
  }
}
