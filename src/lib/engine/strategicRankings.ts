import type { ProcessedValidade, ValidadeItem } from '@/types/domain'
import type { Ruptura } from '@/types/rupturas'
import { extractStoreRealCode } from '../format/storeIdentity'

// ============================================================================
// CONSTANTES E TIPOS
// ============================================================================

export const RISK_MODEL_VERSION = 'v1' as const

export type SeverityLevel = 'Crítico' | 'Alto' | 'Atenção' | 'Monitorar'

export interface RupturaExpandida {
  id: string
  parentRuptureId: string
  derived: true
  reason: 'brand_total'
  catalogSource: 'validades_base_current'
  confidence: 'derived_from_current_catalog'
  productCode: string
  productName: string
  brand: string
  codigo_loja: string
  nome_loja: string
  cnpj_loja?: string
  cidade?: string
  estado?: string
  data_visita?: string
  data_entrada?: string
  dias_em_ruptura?: number
  motivo?: string
}

export interface UnresolvedBrandTotal {
  storeCode: string
  brand: string
  parentRuptureId: string
  nome_loja?: string
  motivo?: string
}

export interface StoreRiskResult {
  storeCode: string
  storeName: string
  city?: string
  state?: string
  score: number // min(100, rawPoints)
  rawPoints: number
  severity: SeverityLevel
  validadesCount: number
  validadesQuantityInRisk: number
  rupturasSpecificCount: number
  rupturasDerivedCount: number
  rupturasTotalUnresolvedCount: number
  validadesPoints: number
  rupturasPoints: number
}

export interface ProductRiskResult {
  productCode?: string
  productName: string
  brand: string
  score: number // min(100, rawPoints)
  rawPoints: number
  severity: SeverityLevel
  validadesCount: number
  validadesQuantityInRisk: number
  storesWithValidadeCount: number
  storesWithRuptureCount: number
  rupturasSpecificCount: number
  rupturasDerivedCount: number
  validadesPoints: number
  rupturasPoints: number
}

export interface BrandRiskResult {
  brand: string
  score: number // min(100, rawPoints)
  rawPoints: number
  severity: SeverityLevel
  validadesCount: number
  validadesQuantityInRisk: number
  validadesCriticalStoresCount: number // Lojas com validade 1-7 dias
  storesWithValidadeCount: number
  storesWithRuptureCount: number
  rupturasCount: number
  validadesPoints: number
  rupturasPoints: number
}

export interface RecommendedAction {
  rule_id:
    | 'VISITA_PRIORITARIA'
    | 'PRODUTO_RUPTURA_RECORRENTE'
    | 'MARCA_RISCO_DISTRIBUICAO'
    | 'RECOLHIMENTO_URGENTE'
  evidence: Record<string, unknown>
  action: string
}

// Tipo unificado aceito pelas funções do motor (ProcessedValidade ou ValidadeItem)
export type ValidadeRecord = ProcessedValidade | ValidadeItem
export type RupturaRecord = Ruptura

// ============================================================================
// PARTE 2: NORMALIZAÇÃO, CATÁLOGO E EXPANSÃO
// ============================================================================

/**
 * Normaliza chave de marca/texto de forma segura.
 * - trim
 * - toLowerCase
 * - NFD remove diacríticos/acentos
 * - compacta múltiplos espaços em um único
 * - remove pontuação societária (LTDA, S.A, S/A, EIRELI, ME) apenas se fizer parte
 */
export function normalizeBrandKey(s: string | null | undefined): string {
  if (!s) return ''
  let norm = String(s)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')

  // Remover sufixos societários comuns preservando o nome principal
  norm = norm
    .replace(/\b(s\/a|s\.a|s\.a\.|sa)\b/g, '')
    .replace(/\b(ltda|ltda\.|limitada)\b/g, '')
    .replace(/\b(eireli|me|epp)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  return norm
}

/**
 * Verifica se a ruptura é de portfólio total da marca na loja.
 * Regra: igualdade exata de string via normalizeBrandKey(produto) === normalizeBrandKey(cliente).
 * NÃO usar contains/includes.
 */
export function isBrandTotalRupture(
  produto: string | null | undefined,
  cliente: string | null | undefined,
): boolean {
  if (!produto || !cliente) return false
  const pNorm = normalizeBrandKey(produto)
  const cNorm = normalizeBrandKey(cliente)
  if (!pNorm || !cNorm) return false
  return pNorm === cNorm
}

/**
 * Constrói catálogo de produtos por marca a partir da Base Atual de Validades com quantidade > 0.
 * Retorna Map onde a chave é `normalizeBrandKey(cliente)` e o valor é uma lista de produtos únicos.
 * Deduplica por código de produto (quando não idêntico ao nome) ou por nome normalizado.
 */
export function buildBrandProductCatalog(
  validadesBase: ValidadeRecord[],
): Map<string, { productCode: string; productName: string }[]> {
  const catalog = new Map<string, { productCode: string; productName: string }[]>()
  const seenPerBrand = new Map<string, Set<string>>()

  for (const v of validadesBase) {
    const qtd =
      'quantidade' in v && typeof v.quantidade === 'number'
        ? v.quantidade
        : ('estoque' in v ? v.estoque : 0) || 0
    if (qtd <= 0) continue

    const brand =
      'cliente' in v && v.cliente ? v.cliente : 'industria' in v && v.industria ? v.industria : ''
    if (!brand) continue

    const brandKey = normalizeBrandKey(brand)
    if (!brandKey) continue

    const prodName =
      'produto' in v && v.produto ? v.produto : 'product' in v && v.product ? v.product : ''
    if (!prodName) continue

    const prodCode =
      'codProduto' in v && v.codProduto
        ? v.codProduto
        : 'cod_produto' in v && (v as any).cod_produto
          ? (v as any).cod_produto
          : 'sku' in v && v.sku
            ? v.sku
            : ''

    const rawCode = prodCode ? String(prodCode).trim() : ''
    const normProd = normalizeBrandKey(prodName)
    const normCode = normalizeBrandKey(rawCode)

    // Deduplicação: se tem código válido diferente do nome usa o código, senão o nome
    const dedupToken =
      rawCode && normCode !== normProd && normCode !== 'undefined' && normCode !== 'null'
        ? `code:${rawCode}`
        : `name:${normProd}`

    if (!seenPerBrand.has(brandKey)) {
      seenPerBrand.set(brandKey, new Set())
      catalog.set(brandKey, [])
    }

    const seenSet = seenPerBrand.get(brandKey)!
    if (!seenSet.has(dedupToken)) {
      seenSet.add(dedupToken)
      catalog.get(brandKey)!.push({
        productCode: rawCode,
        productName: prodName,
      })
    }
  }

  return catalog
}

/**
 * Expande rupturas de portfólio total (brand_total) em memória contra o catálogo de validades ativas.
 * - Cada filho expandido: parentRuptureId, derived=true, reason='brand_total', catalogSource='validades_base_current', confidence='derived_from_current_catalog'
 * - Ruptura específica oficial na mesma loja+marca+produto prevalece e impede filho duplicado.
 * - Se catálogo vazio para a marca, marca a ocorrência pai como unresolved.
 * - Totalmente puro e em memória (sem persistência).
 */
export function expandBrandTotalRuptures(
  rupturas: RupturaRecord[],
  validadesBase: ValidadeRecord[],
): {
  expanded: RupturaExpandida[]
  unresolved: UnresolvedBrandTotal[]
} {
  const catalog = buildBrandProductCatalog(validadesBase)

  // Mapear rupturas específicas oficiais para deduplicação: storeKey|brandKey|productDedupToken
  const officialSpecifics = new Set<string>()

  for (const r of rupturas) {
    if (r.situacao_atual !== 'Ativo') continue
    const isTotal = isBrandTotalRupture(r.produto, r.cliente)
    if (!isTotal) {
      const storeCode =
        extractStoreRealCode({
          codigo_loja: r.codigo_loja,
          razao_social: r.nome_loja,
          nome_loja: r.nome_loja,
        }) ||
        r.codigo_loja ||
        normalizeBrandKey(r.nome_loja)

      const brandKey = normalizeBrandKey(r.cliente)
      const prodNorm = normalizeBrandKey(r.produto)
      officialSpecifics.add(`${storeCode}|${brandKey}|name:${prodNorm}`)
    }
  }

  const expanded: RupturaExpandida[] = []
  const unresolved: UnresolvedBrandTotal[] = []

  for (const r of rupturas) {
    if (r.situacao_atual !== 'Ativo') continue
    const isTotal = isBrandTotalRupture(r.produto, r.cliente)
    if (!isTotal) continue

    const brandKey = normalizeBrandKey(r.cliente)
    const storeCode =
      extractStoreRealCode({
        codigo_loja: r.codigo_loja,
        razao_social: r.nome_loja,
        nome_loja: r.nome_loja,
      }) ||
      r.codigo_loja ||
      ''

    const products = catalog.get(brandKey)

    if (!products || products.length === 0) {
      unresolved.push({
        storeCode,
        brand: r.cliente,
        parentRuptureId: r.id,
        nome_loja: r.nome_loja,
        motivo: r.motivo,
      })
      continue
    }

    for (const p of products) {
      const prodNorm = normalizeBrandKey(p.productName)
      const specificKey = `${storeCode}|${brandKey}|name:${prodNorm}`

      // Se já existe uma ruptura específica oficial para este produto na mesma loja, ignora a derivada
      if (officialSpecifics.has(specificKey)) {
        continue
      }

      expanded.push({
        id: `derived_${r.id}_${normalizeBrandKey(p.productName)}`,
        parentRuptureId: r.id,
        derived: true,
        reason: 'brand_total',
        catalogSource: 'validades_base_current',
        confidence: 'derived_from_current_catalog',
        productCode: p.productCode,
        productName: p.productName,
        brand: r.cliente,
        codigo_loja: r.codigo_loja,
        nome_loja: r.nome_loja,
        cnpj_loja: r.cnpj_loja,
        cidade: r.cidade,
        estado: r.estado,
        data_visita: r.data_visita,
        data_entrada: r.data_entrada,
        dias_em_ruptura: r.dias_em_ruptura,
        motivo: r.motivo,
      })
    }
  }

  return { expanded, unresolved }
}

// ============================================================================
// PARTE 3: SCORE FIXO, EXPLICÁVEL E COMPARÁVEL
// ============================================================================

/**
 * Pontos de validade conforme dias restantes:
 * - 1–3 dias restantes: 10 pontos
 * - 4–7 dias: 8 pontos
 * - 8–15 dias: 5 pontos
 * - 16–25 dias: 2 pontos
 * - 26–35 dias: 1 ponto
 * - Fora dessas faixas: 0 pontos
 */
export function getValidadeDaysPoints(diasRestantes: number): number {
  if (diasRestantes >= 1 && diasRestantes <= 3) return 10
  if (diasRestantes >= 4 && diasRestantes <= 7) return 8
  if (diasRestantes >= 8 && diasRestantes <= 15) return 5
  if (diasRestantes >= 16 && diasRestantes <= 25) return 2
  if (diasRestantes >= 26 && diasRestantes <= 35) return 1
  return 0
}

/**
 * Adicional por quantidade em risco de validade:
 * - >=100 unidades: +4
 * - 50–99: +3
 * - 10–49: +1
 * - abaixo de 10: +0
 */
export function getValidadeQuantityAdditionalPoints(quantidade: number): number {
  if (quantidade >= 100) return 4
  if (quantidade >= 50) return 3
  if (quantidade >= 10) return 1
  return 0
}

/**
 * Pontos por registro de validade ativo: dias restantes + adicional por quantidade.
 */
export function computeSingleValidadePoints(diasRestantes: number, quantidade: number): number {
  const base = getValidadeDaysPoints(diasRestantes)
  if (base === 0) return 0 // Apenas validades dentro da janela ativa (1-35d) pontuam
  return base + getValidadeQuantityAdditionalPoints(quantidade)
}

/**
 * Pontos por ruptura única ativa, conforme dias em ruptura:
 * - 0–3 dias: 2 pontos
 * - 4–7 dias: 4 pontos
 * - 8–14 dias: 7 pontos
 * - 15+ dias: 10 pontos
 */
export function getRupturaDaysPoints(diasEmRuptura: number | undefined | null): number {
  const d = Math.max(0, diasEmRuptura ?? 0)
  if (d <= 3) return 2
  if (d <= 7) return 4
  if (d <= 14) return 7
  return 10
}

/**
 * Mapeia score (0-100) para Severidade operacional:
 * - 75–100: Crítico
 * - 50–74: Alto
 * - 25–49: Atenção
 * - 0–24: Monitorar
 */
export function getSeverityLevel(score: number): SeverityLevel {
  if (score >= 75) return 'Crítico'
  if (score >= 50) return 'Alto'
  if (score >= 25) return 'Atenção'
  return 'Monitorar'
}

// Helpers para extrair dias e quantidade de ValidadeRecord
function getValidadeDays(v: ValidadeRecord): number {
  if ('diasVencimentoAtual' in v && typeof v.diasVencimentoAtual === 'number') {
    return v.diasVencimentoAtual
  }
  if ('diasRestantes' in v && typeof v.diasRestantes === 'number') {
    return v.diasRestantes
  }
  return 0
}

function getValidadeQuantity(v: ValidadeRecord): number {
  if ('quantidade' in v && typeof v.quantidade === 'number') {
    return v.quantidade
  }
  if ('estoque' in v && typeof v.estoque === 'number') {
    return v.estoque
  }
  return 0
}

function isValidadeActiveRisk(v: ValidadeRecord): boolean {
  // Status Crítico/Atenção/Moderado ou 1-35 dias
  const days = getValidadeDays(v)
  return days >= 1 && days <= 35
}

function getStoreCodeFromValidade(v: ValidadeRecord): string {
  const code =
    'codigoLoja' in v && v.codigoLoja
      ? v.codigoLoja
      : 'codigo_loja' in v && (v as any).codigo_loja
        ? (v as any).codigo_loja
        : ''
  const name =
    'razaoSocial' in v && v.razaoSocial ? v.razaoSocial : 'loja' in v && v.loja ? v.loja : ''
  return (
    extractStoreRealCode({ codigo_loja: code, razao_social: name, nome_loja: name }) ||
    code ||
    normalizeBrandKey(name)
  )
}

function getStoreCodeFromRuptura(r: RupturaRecord | RupturaExpandida): string {
  const code = r.codigo_loja || ''
  const name = r.nome_loja || ''
  return (
    extractStoreRealCode({ codigo_loja: code, razao_social: name, nome_loja: name }) ||
    code ||
    normalizeBrandKey(name)
  )
}

/**
 * Calcula o score de risco operacional de uma Loja.
 */
export function computeStoreRiskScore(
  lojaCode: string,
  validades: ValidadeRecord[],
  rupturas: RupturaRecord[],
  expandedRuptures: RupturaExpandida[],
): StoreRiskResult {
  const normLojaTarget = lojaCode.trim().toLowerCase()

  // 1. Filtrar validades da loja
  const storeValidades = validades.filter((v) => {
    const sCode = getStoreCodeFromValidade(v).toLowerCase()
    return sCode === normLojaTarget
  })

  let validadesPoints = 0
  let validadesCount = 0
  let validadesQuantityInRisk = 0
  let storeName = ''
  let city = ''
  let state = ''

  for (const v of storeValidades) {
    if (!storeName) {
      storeName =
        'nomeLoja' in v && v.nomeLoja
          ? v.nomeLoja
          : 'razaoSocial' in v && v.razaoSocial
            ? v.razaoSocial
            : 'loja' in v && v.loja
              ? v.loja
              : ''
    }
    if (!city && 'cidade' in v && v.cidade) city = v.cidade
    if (!state && 'estado' in v && v.estado) state = v.estado
    if (!state && 'uf' in v && (v as any).uf) state = (v as any).uf

    const days = getValidadeDays(v)
    const qty = getValidadeQuantity(v)

    if (isValidadeActiveRisk(v)) {
      validadesCount++
      validadesQuantityInRisk += qty
      validadesPoints += computeSingleValidadePoints(days, qty)
    }
  }

  // 2. Filtrar rupturas da loja
  const storeRupturas = rupturas.filter((r) => {
    if (r.situacao_atual !== 'Ativo') return false
    const sCode = getStoreCodeFromRuptura(r).toLowerCase()
    return sCode === normLojaTarget
  })

  // Identificar rupturas totais vs específicas
  const storeSpecificRupturas = storeRupturas.filter(
    (r) => !isBrandTotalRupture(r.produto, r.cliente),
  )
  const storeTotalRupturas = storeRupturas.filter((r) => isBrandTotalRupture(r.produto, r.cliente))

  // Derivadas pertencentes a esta loja
  const storeDerivedRupturas = expandedRuptures.filter((d) => {
    const sCode = getStoreCodeFromRuptura(d).toLowerCase()
    return sCode === normLojaTarget
  })

  // Rupturas totais não expandidas (sem filhos derivados)
  const expandedParentIds = new Set(storeDerivedRupturas.map((d) => d.parentRuptureId))
  const unresolvedTotals = storeTotalRupturas.filter((r) => !expandedParentIds.has(r.id))

  // Pontuação de rupturas:
  // - Específicas oficiais
  // - Derivadas (filhos)
  // - Totais não expandidas (como 1 ocorrência para a loja)
  // NUNCA pontuar pai + filho juntos
  let rupturasPoints = 0
  for (const r of storeSpecificRupturas) {
    rupturasPoints += getRupturaDaysPoints(r.dias_em_ruptura)
    if (!storeName && r.nome_loja) storeName = r.nome_loja
    if (!city && r.cidade) city = r.cidade
    if (!state && r.estado) state = r.estado
  }

  for (const d of storeDerivedRupturas) {
    rupturasPoints += getRupturaDaysPoints(d.dias_em_ruptura)
  }

  for (const u of unresolvedTotals) {
    rupturasPoints += getRupturaDaysPoints(u.dias_em_ruptura)
  }

  const rawPoints = validadesPoints + rupturasPoints
  const score = Math.min(100, rawPoints)
  const severity = getSeverityLevel(score)

  return {
    storeCode: lojaCode,
    storeName: storeName || `Loja ${lojaCode}`,
    city,
    state,
    score,
    rawPoints,
    severity,
    validadesCount,
    validadesQuantityInRisk,
    rupturasSpecificCount: storeSpecificRupturas.length,
    rupturasDerivedCount: storeDerivedRupturas.length,
    rupturasTotalUnresolvedCount: unresolvedTotals.length,
    validadesPoints,
    rupturasPoints,
  }
}

/**
 * Calcula o score de risco operacional de um Produto.
 */
export function computeProductRiskScore(
  produtoName: string,
  validades: ValidadeRecord[],
  rupturas: RupturaRecord[],
  expandedRuptures: RupturaExpandida[],
): ProductRiskResult {
  const normProdTarget = normalizeBrandKey(produtoName)

  // 1. Validades do produto
  const prodValidades = validades.filter((v) => {
    const pName =
      'produto' in v && v.produto ? v.produto : 'product' in v && v.product ? v.product : ''
    return normalizeBrandKey(pName) === normProdTarget
  })

  let validadesPoints = 0
  let validadesCount = 0
  let validadesQuantityInRisk = 0
  let productCode = ''
  let brand = ''
  const validadeStoreCodes = new Set<string>()

  for (const v of prodValidades) {
    if (!brand) {
      brand =
        'cliente' in v && v.cliente ? v.cliente : 'industria' in v && v.industria ? v.industria : ''
    }
    if (!productCode) {
      productCode =
        'codProduto' in v && v.codProduto
          ? v.codProduto
          : 'cod_produto' in v && (v as any).cod_produto
            ? (v as any).cod_produto
            : 'sku' in v && v.sku
              ? v.sku
              : ''
    }

    const sCode = getStoreCodeFromValidade(v)
    if (sCode) validadeStoreCodes.add(sCode)

    const days = getValidadeDays(v)
    const qty = getValidadeQuantity(v)

    if (isValidadeActiveRisk(v)) {
      validadesCount++
      validadesQuantityInRisk += qty
      validadesPoints += computeSingleValidadePoints(days, qty)
    }
  }

  // 2. Rupturas específicas oficiais para o produto (exclui pai de brand_total)
  const prodSpecificRupturas = rupturas.filter((r) => {
    if (r.situacao_atual !== 'Ativo') return false
    if (isBrandTotalRupture(r.produto, r.cliente)) return false
    return normalizeBrandKey(r.produto) === normProdTarget
  })

  // 3. Rupturas derivadas que apontam para este produto
  const prodDerivedRupturas = expandedRuptures.filter((d) => {
    return normalizeBrandKey(d.productName) === normProdTarget
  })

  let rupturasPoints = 0
  const ruptureStoreCodes = new Set<string>()

  for (const r of prodSpecificRupturas) {
    rupturasPoints += getRupturaDaysPoints(r.dias_em_ruptura)
    const sCode = getStoreCodeFromRuptura(r)
    if (sCode) ruptureStoreCodes.add(sCode)
    if (!brand && r.cliente) brand = r.cliente
  }

  for (const d of prodDerivedRupturas) {
    rupturasPoints += getRupturaDaysPoints(d.dias_em_ruptura)
    const sCode = getStoreCodeFromRuptura(d)
    if (sCode) ruptureStoreCodes.add(sCode)
    if (!brand && d.brand) brand = d.brand
    if (!productCode && d.productCode) productCode = d.productCode
  }

  const rawPoints = validadesPoints + rupturasPoints
  const score = Math.min(100, rawPoints)
  const severity = getSeverityLevel(score)

  return {
    productCode: productCode || undefined,
    productName: produtoName,
    brand: brand || 'Não informada',
    score,
    rawPoints,
    severity,
    validadesCount,
    validadesQuantityInRisk,
    storesWithValidadeCount: validadeStoreCodes.size,
    storesWithRuptureCount: ruptureStoreCodes.size,
    rupturasSpecificCount: prodSpecificRupturas.length,
    rupturasDerivedCount: prodDerivedRupturas.length,
    validadesPoints,
    rupturasPoints,
  }
}

/**
 * Calcula o score de risco operacional de uma Marca / Indústria.
 */
export function computeBrandRiskScore(
  marcaName: string,
  validades: ValidadeRecord[],
  rupturas: RupturaRecord[],
): BrandRiskResult {
  const normBrandTarget = normalizeBrandKey(marcaName)

  // 1. Validades da marca
  const brandValidades = validades.filter((v) => {
    const b =
      'cliente' in v && v.cliente ? v.cliente : 'industria' in v && v.industria ? v.industria : ''
    return normalizeBrandKey(b) === normBrandTarget
  })

  let validadesPoints = 0
  let validadesCount = 0
  let validadesQuantityInRisk = 0
  const validadeStores = new Set<string>()
  const criticalValidadeStores = new Set<string>() // Lojas com validade 1-7 dias

  for (const v of brandValidades) {
    const sCode = getStoreCodeFromValidade(v)
    if (sCode) validadeStores.add(sCode)

    const days = getValidadeDays(v)
    const qty = getValidadeQuantity(v)

    if (days >= 1 && days <= 7 && sCode) {
      criticalValidadeStores.add(sCode)
    }

    if (isValidadeActiveRisk(v)) {
      validadesCount++
      validadesQuantityInRisk += qty
      validadesPoints += computeSingleValidadePoints(days, qty)
    }
  }

  // 2. Rupturas da marca (contabiliza cada ocorrência oficial única de ruptura para a marca)
  const brandRupturas = rupturas.filter((r) => {
    if (r.situacao_atual !== 'Ativo') return false
    return normalizeBrandKey(r.cliente) === normBrandTarget
  })

  let rupturasPoints = 0
  const ruptureStores = new Set<string>()

  for (const r of brandRupturas) {
    rupturasPoints += getRupturaDaysPoints(r.dias_em_ruptura)
    const sCode = getStoreCodeFromRuptura(r)
    if (sCode) ruptureStores.add(sCode)
  }

  const rawPoints = validadesPoints + rupturasPoints
  const score = Math.min(100, rawPoints)
  const severity = getSeverityLevel(score)

  return {
    brand: marcaName,
    score,
    rawPoints,
    severity,
    validadesCount,
    validadesQuantityInRisk,
    validadesCriticalStoresCount: criticalValidadeStores.size,
    storesWithValidadeCount: validadeStores.size,
    storesWithRuptureCount: ruptureStores.size,
    rupturasCount: brandRupturas.length,
    validadesPoints,
    rupturasPoints,
  }
}

// ============================================================================
// PARTE 4: AÇÕES RECOMENDADAS TRANSPARENTES
// ============================================================================

/**
 * Gera recomendações operacionais transparentes baseadas em evidências estritas:
 * 1. VISITA_PRIORITARIA: loja com >=3 validades de 1–7 dias E >=2 rupturas únicas ativas.
 * 2. PRODUTO_RUPTURA_RECORRENTE: produto em >=5 lojas com ruptura ativa.
 * 3. MARCA_RISCO_DISTRIBUICAO: marca em >=10 lojas com validade crítica (1–7 dias).
 * 4. RECOLHIMENTO_URGENTE: validade de 1–3 dias com quantidade >=50.
 */
export function generateRecommendedActions(
  lojas: StoreRiskResult[],
  produtos: ProductRiskResult[],
  marcas: BrandRiskResult[],
  validades: ValidadeRecord[],
): RecommendedAction[] {
  const actions: RecommendedAction[] = []

  // Regra 1: VISITA_PRIORITARIA por Loja
  for (const loja of lojas) {
    // Buscar validades de 1-7 dias na loja
    const storeValidades1to7 = validades.filter((v) => {
      const sCode = getStoreCodeFromValidade(v).toLowerCase()
      if (sCode !== loja.storeCode.toLowerCase()) return false
      const days = getValidadeDays(v)
      return days >= 1 && days <= 7
    })

    const rupturasUnicas =
      loja.rupturasSpecificCount + loja.rupturasDerivedCount + loja.rupturasTotalUnresolvedCount

    if (storeValidades1to7.length >= 3 && rupturasUnicas >= 2) {
      actions.push({
        rule_id: 'VISITA_PRIORITARIA',
        evidence: {
          storeCode: loja.storeCode,
          storeName: loja.storeName,
          validadesCriticas1a7Dias: storeValidades1to7.length,
          rupturasUnicasAtivas: rupturasUnicas,
          score: loja.score,
        },
        action: `Agendar visita técnica prioritária para a loja ${loja.storeName} (${loja.storeCode}): detectados ${storeValidades1to7.length} produtos em validade crítica (1–7 dias) e ${rupturasUnicas} rupturas ativas simultâneas.`,
      })
    }
  }

  // Regra 2: PRODUTO_RUPTURA_RECORRENTE por Produto
  for (const prod of produtos) {
    if (prod.storesWithRuptureCount >= 5) {
      actions.push({
        rule_id: 'PRODUTO_RUPTURA_RECORRENTE',
        evidence: {
          productName: prod.productName,
          productCode: prod.productCode,
          brand: prod.brand,
          storesWithRuptureCount: prod.storesWithRuptureCount,
        },
        action: `Avaliar cadeia de suprimentos e reabastecimento do produto "${prod.productName}" (${prod.brand}): ausente em ${prod.storesWithRuptureCount} lojas distintas com ruptura ativa.`,
      })
    }
  }

  // Regra 3: MARCA_RISCO_DISTRIBUICAO por Marca
  for (const marca of marcas) {
    if (marca.validadesCriticalStoresCount >= 10) {
      actions.push({
        rule_id: 'MARCA_RISCO_DISTRIBUICAO',
        evidence: {
          brand: marca.brand,
          criticalStoresCount: marca.validadesCriticalStoresCount,
          totalValidadesQuantityInRisk: marca.validadesQuantityInRisk,
        },
        action: `Alinhar plano emergencial de sell-through com a indústria ${marca.brand}: presença de validades críticas (1–7 dias) detectada em ${marca.validadesCriticalStoresCount} lojas simultaneamente.`,
      })
    }
  }

  // Regra 4: RECOLHIMENTO_URGENTE por Validade individual
  for (const v of validades) {
    const days = getValidadeDays(v)
    const qty = getValidadeQuantity(v)

    if (days >= 1 && days <= 3 && qty >= 50) {
      const prodName =
        'produto' in v && v.produto ? v.produto : 'product' in v && v.product ? v.product : ''
      const sCode = getStoreCodeFromValidade(v)
      const sName =
        'razaoSocial' in v && v.razaoSocial ? v.razaoSocial : 'loja' in v && v.loja ? v.loja : sCode

      actions.push({
        rule_id: 'RECOLHIMENTO_URGENTE',
        evidence: {
          validadeId: v.id,
          productName: prodName,
          storeCode: sCode,
          storeName: sName,
          diasRestantes: days,
          quantidade: qty,
        },
        action: `Solicitar recolhimento ou ação promocional urgente para o lote de "${prodName}" na loja ${sName}: restam apenas ${days} dia(s) com volume elevado de ${qty} unidades.`,
      })
    }
  }

  return actions
}
