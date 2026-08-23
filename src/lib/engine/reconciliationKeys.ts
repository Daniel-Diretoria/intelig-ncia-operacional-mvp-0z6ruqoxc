import { cleanCode, extractStoreRealCode } from '../format/storeIdentity'

/**
 * Normaliza string removendo acentos, colocando em lowercase, trim e colapsando espaços múltiplos.
 */
export function normalizeString(str: unknown): string {
  if (str === null || str === undefined) return ''
  return String(str)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

export interface StoreKeyRecordInput {
  codigo_loja?: string | number | null
  codigoLoja?: string | number | null
  cnpj?: string | null
  cnpj_loja?: string | null
  cpf_cnpj?: string | null
  razao_social?: string | null
  razaoSocial?: string | null
  nome_loja?: string | null
  nomeLoja?: string | null
  cidade?: string | null
  loja?: string | null
  fantasia?: string | null
}

/**
 * Constrói a chave canônica da loja.
 * Prioridade:
 * 1. codigo_loja se for numérico real (usa cleanCode / extractStoreRealCode)
 * 2. cnpj / cnpj_loja / cpf_cnpj se disponível e não vazio (comprimento >= 4 para evitar '1' ou '013' de branch se cnpj real existir, mas aceita token não vazio)
 * 3. Fallback: razao_social ou nome_loja normalizado + cidade normalizada
 *
 * NUNCA usar cliente como código de loja. NUNCA inventar "000".
 */
export function buildStoreCanonicalKey(record: StoreKeyRecordInput | null | undefined): string {
  if (!record) return 'loja_desconhecida'

  // 1. Código real da loja
  const realCode = extractStoreRealCode({
    codigo_loja: record.codigo_loja ?? record.codigoLoja,
    razao_social: record.razao_social ?? record.razaoSocial,
    nome_loja: record.nome_loja ?? record.nomeLoja ?? record.loja ?? record.fantasia,
  })

  if (realCode) {
    return `store_code:${realCode}`
  }

  // 2. CNPJ se disponível e válido
  const rawCnpj = record.cnpj || record.cnpj_loja || record.cpf_cnpj
  if (rawCnpj) {
    const cleanedCnpj = String(rawCnpj).replace(/\D/g, '')
    if (cleanedCnpj.length >= 8) {
      return `store_cnpj:${cleanedCnpj}`
    }
  }

  // 3. Fallback: Razão social / Nome normalizado + Cidade normalizada
  const rawName =
    record.razao_social ??
    record.razaoSocial ??
    record.nome_loja ??
    record.nomeLoja ??
    record.loja ??
    record.fantasia ??
    ''
  const normName = normalizeString(rawName)
  const normCity = normalizeString(record.cidade)

  if (normName || normCity) {
    return `store_name:${normName}|${normCity}`
  }

  return 'loja_desconhecida'
}

export interface ProductKeyRecordInput {
  cod_produto?: string | number | null
  codigo_produto?: string | number | null
  sku?: string | number | null
  produto?: string | null
  product?: string | null
  descricao?: string | null
  atividade?: string | null
}

/**
 * Constrói a chave canônica do produto.
 * 1. cod_produto se disponível e não vazio, não idêntico ao nome do produto
 * 2. Fallback: produto normalizado (trim, lowercase, sem acentos, espaços colapsados)
 */
export function buildProductCanonicalKey(record: ProductKeyRecordInput | null | undefined): string {
  if (!record) return 'produto_desconhecido'

  const rawProdName = record.produto ?? record.product ?? record.descricao ?? record.atividade ?? ''
  const normProdName = normalizeString(rawProdName)

  const rawCode = record.cod_produto ?? record.codigo_produto ?? record.sku
  if (rawCode !== null && rawCode !== undefined) {
    const codeStr = String(rawCode).trim()
    const normCode = normalizeString(codeStr)
    // Se não vazio e não idêntico ao nome do produto
    if (codeStr && normCode !== normProdName && normCode !== 'undefined' && normCode !== 'null') {
      return `prod_code:${normCode}`
    }
  }

  if (normProdName) {
    return `prod_name:${normProdName}`
  }

  return 'produto_desconhecido'
}

export interface ClientBrandRecordInput {
  cliente?: string | null
  client?: string | null
  fornecedor?: string | null
  industria?: string | null
}

/**
 * Constrói a chave canônica de cliente/marca.
 * cliente normalizado (trim, lowercase, sem acentos).
 */
export function buildClientBrandKey(record: ClientBrandRecordInput | null | undefined): string {
  if (!record) return ''
  const rawBrand = record.cliente ?? record.client ?? record.fornecedor ?? record.industria ?? ''
  return normalizeString(rawBrand)
}

/**
 * Extrai gramatura / medida de um texto de produto (ex: "850g", "1,25kg", "1.2 l", "400g", "170g", "360g", "1l").
 * Retorna uma lista normalizada de tokens de medida ou null se nenhuma for encontrada.
 */
export function extractProductPackagingMeasures(productName: string): string[] {
  const norm = normalizeString(productName).replace(',', '.')
  // Regex para capturar números seguidos de unidades comuns: g, kg, l, ml, lt, lts, gr, grs
  const matches = norm.match(/\b\d+(?:\.\d+)?\s*(?:kg|g|gr|grs|l|ml|lt|lts)\b/g)
  if (!matches) return []
  return matches.map((m) => m.replace(/\s+/g, ''))
}

/**
 * Compara se duas descrições de produtos possuem embalagens/medidas conflitantes (ex: 850g vs 1.25kg).
 * Se ambas têm medidas identificadas e nenhuma coincide, retorna true (conflito detectado).
 */
export function hasPackagingConflict(name1: string, name2: string): boolean {
  const m1 = extractProductPackagingMeasures(name1)
  const m2 = extractProductPackagingMeasures(name2)

  // Se ambos especificam medidas/pesos
  if (m1.length > 0 && m2.length > 0) {
    // Normaliza para comparar (ex: 1l == 1000ml, 1kg == 1000g, etc.)
    const toGramsOrMl = (m: string): number | null => {
      const match = m.match(/^(\d+(?:\.\d+)?)(kg|g|gr|grs|l|ml|lt|lts)$/)
      if (!match) return null
      const val = parseFloat(match[1])
      const unit = match[2]
      if (unit === 'kg' || unit === 'l' || unit === 'lt' || unit === 'lts') return val * 1000
      return val
    }

    const set1 = new Set(m1.map(toGramsOrMl).filter((v): v is number => v !== null))
    const set2 = new Set(m2.map(toGramsOrMl).filter((v): v is number => v !== null))

    if (set1.size > 0 && set2.size > 0) {
      // Verifica se há intersecção
      let hasOverlap = false
      for (const val of set1) {
        if (set2.has(val)) {
          hasOverlap = true
          break
        }
      }
      if (!hasOverlap) {
        return true // Conflito de peso/embalagem!
      }
    }
  }

  return false
}
