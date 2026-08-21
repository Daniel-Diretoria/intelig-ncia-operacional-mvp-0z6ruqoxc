/**
 * Identidade canônica e padronização de Lojas, Redes, Cidades e Produtos.
 *
 * Regras estritas:
 * - codigo_loja: string preservando zeros à esquerda
 * - se ausente no campo próprio, extrair de Razão Social / Nome (padrão "código - nome" ou "código • nome")
 * - remover do nome qualquer prefixo de código repetido antes de formatar
 * - saída: "CÓDIGO • NOME DA LOJA"
 * - NUNCA exibir código duplicado (ex: "845 • 845 • FORT...")
 * - NUNCA inventar "000"
 * - sem código real: "Código não identificado • NOME DA LOJA"
 * - Normalização de Rede canônica
 * - Cidade/UF sem separadores vazios ("Cidade/UF" ou "Cidade", nunca "Cidade/" ou "Cidade /")
 */

export interface StoreIdentityInput {
  codigoLoja?: string | number | null
  codigo_loja?: string | number | null
  nomeLoja?: string | null
  nome_loja?: string | null
  razaoSocial?: string | null
  razao_social?: string | null
  loja?: string | null
  fantasia?: string | null
}

/**
 * Limpa código removendo espaços e tratando números/strings.
 * Não inventa zeros à esquerda se não for código real numérico.
 */
function cleanCode(code: unknown): string | null {
  if (code === null || code === undefined) return null
  const str = String(code).trim()
  if (
    !str ||
    str === '000' ||
    str === '0' ||
    str.toLowerCase() === 'undefined' ||
    str.toLowerCase() === 'null'
  ) {
    return null
  }
  return str
}

/**
 * Extrai código e nome de uma string composta (ex: "845 - FORT ATACADISTA" ou "115 • COMPER")
 */
function extractFromCombined(text: string): { extractedCode: string | null; cleanName: string } {
  const trimmed = text.trim()
  if (!trimmed) return { extractedCode: null, cleanName: '' }

  // Match para "845 - NOME" ou "845 • NOME" ou "845 – NOME"
  const match = trimmed.match(/^([A-Za-z0-9_-]{1,10})\s*[-•–]\s*(.+)$/)
  if (match) {
    const candidateCode = cleanCode(match[1])
    const remainder = match[2].trim()
    return {
      extractedCode: candidateCode,
      cleanName: remainder || trimmed,
    }
  }

  return { extractedCode: null, cleanName: trimmed }
}

/**
 * Remove qualquer prefixo repetido do código no nome.
 * Exemplo: se code = "845" e name = "845 • FORT ATACADISTA" ou "845 - FORT", limpa para "FORT ATACADISTA".
 */
function removeRepeatedCodePrefix(name: string, code?: string | null): string {
  let cleaned = name.trim()
  if (!cleaned) return 'Loja não identificada'

  // Remove repetições sucessivas de qualquer código no início
  let changed = true
  while (changed) {
    changed = false
    // Se o nome começa com "123 • " ou "123 - "
    const prefixMatch = cleaned.match(/^([A-Za-z0-9_-]{1,10})\s*[-•–]\s*(.+)$/)
    if (prefixMatch) {
      cleaned = prefixMatch[2].trim()
      changed = true
      continue
    }

    // Se o nome começa com o próprio código explícito
    if (code) {
      const escaped = code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const codeStartRegex = new RegExp(`^${escaped}\\s*[-•–]?\\s*`, 'i')
      if (codeStartRegex.test(cleaned) && cleaned.length > code.length) {
        cleaned = cleaned.replace(codeStartRegex, '').trim()
        changed = true
      }
    }
  }

  return cleaned || name.trim()
}

/**
 * Formata a identidade operacional da loja.
 * Saída estrita: "CÓDIGO • NOME DA LOJA" ou "Código não identificado • NOME DA LOJA".
 * NUNCA gera códigos duplicados nem inventa "000".
 */
export function formatStoreIdentity(input: StoreIdentityInput | string | null | undefined): string {
  if (!input) {
    return 'Código não identificado • Loja não identificada'
  }

  if (typeof input === 'string') {
    const { extractedCode, cleanName } = extractFromCombined(input)
    const finalName = removeRepeatedCodePrefix(cleanName, extractedCode)
    if (extractedCode) {
      return `${extractedCode} • ${finalName}`
    }
    return `Código não identificado • ${finalName || input}`
  }

  const rawCode = input.codigoLoja ?? input.codigo_loja
  const rawName =
    input.nomeLoja ??
    input.nome_loja ??
    input.loja ??
    input.fantasia ??
    input.razaoSocial ??
    input.razao_social ??
    ''
  const rawRazao = input.razaoSocial ?? input.razao_social ?? ''

  let code = cleanCode(rawCode)
  let name = String(rawName).trim()

  // Se não tem código no campo próprio, tenta extrair de rawName ou rawRazao
  if (!code && name) {
    const extracted = extractFromCombined(name)
    if (extracted.extractedCode) {
      code = extracted.extractedCode
      name = extracted.cleanName
    }
  }

  if (!code && rawRazao) {
    const extracted = extractFromCombined(String(rawRazao))
    if (extracted.extractedCode) {
      code = extracted.extractedCode
      if (!name) name = extracted.cleanName
    }
  }

  const finalName = removeRepeatedCodePrefix(name, code)

  if (code) {
    return `${code} • ${finalName}`
  }

  return `Código não identificado • ${finalName || 'Loja não identificada'}`
}

/**
 * Obtém apenas o código real da loja (ou null se não houver).
 */
export function extractStoreRealCode(
  input: StoreIdentityInput | string | null | undefined,
): string | null {
  if (!input) return null
  if (typeof input === 'string') {
    const { extractedCode } = extractFromCombined(input)
    return cleanCode(extractedCode)
  }
  const rawCode = input.codigoLoja ?? input.codigo_loja
  const clean = cleanCode(rawCode)
  if (clean) return clean

  const rawName =
    input.nomeLoja ?? input.nome_loja ?? input.loja ?? input.razaoSocial ?? input.razao_social ?? ''
  if (rawName) {
    const extracted = extractFromCombined(String(rawName))
    if (extracted.extractedCode) return cleanCode(extracted.extractedCode)
  }
  return null
}

/**
 * Obtém apenas o nome limpo da loja sem código e sem prefixos repetidos.
 */
export function extractStoreCleanName(
  input: StoreIdentityInput | string | null | undefined,
): string {
  if (!input) return 'Loja não identificada'
  const code = extractStoreRealCode(input)
  if (typeof input === 'string') {
    const { cleanName } = extractFromCombined(input)
    return removeRepeatedCodePrefix(cleanName, code)
  }
  const rawName =
    input.nomeLoja ??
    input.nome_loja ??
    input.loja ??
    input.fantasia ??
    input.razaoSocial ??
    input.razao_social ??
    ''
  const { cleanName } = extractFromCombined(String(rawName))
  return removeRepeatedCodePrefix(cleanName, code)
}

/**
 * Mapeamento canônico de Redes para garantir rótulos unificados (ex: "GRUPO PEREIRA" → "Grupo Pereira")
 */
const CANONICAL_NETWORKS: Record<string, string> = {
  'grupo pereira': 'Grupo Pereira',
  comper: 'Comper',
  'fort atacadista': 'Fort Atacadista',
  bistek: 'Bistek Supermercados',
  angeloni: 'Rede Angeloni',
  giassi: 'Giassi Supermercados',
  koch: 'Supermercados Koch',
  komprao: 'Komprão Koch Atacadista',
  condor: 'Condor Super Center',
  muffato: 'Grupo Muffato',
  superpao: 'Superpão',
  passarela: 'Passarela Supermercados',
}

/**
 * Normaliza o nome da Rede: trim, case-insensitive mapping para rótulo canônico.
 */
export function normalizeNetworkName(name: unknown): string {
  if (!name) return 'Rede não informada'
  const str = String(name).trim()
  if (!str) return 'Rede não informada'

  const key = str.toLowerCase()
  if (CANONICAL_NETWORKS[key]) {
    return CANONICAL_NETWORKS[key]
  }

  // Capitalização padrão title case se não estiver no dicionário
  return str
    .split(' ')
    .filter(Boolean)
    .map((word) => {
      const lower = word.toLowerCase()
      if (['de', 'da', 'do', 'das', 'dos', 'e'].includes(lower)) return lower
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    })
    .join(' ')
}

/**
 * Formata Cidade/UF.
 * Regra: se tem UF: "Cidade/UF". Se não tem UF: apenas "Cidade". NUNCA "Cidade/" ou "Cidade /".
 */
export function formatCityUf(cidade: unknown, uf: unknown): string {
  const c = cidade ? String(cidade).trim() : ''
  const u = uf ? String(uf).trim().toUpperCase() : ''

  if (c && u) {
    return `${c}/${u}`
  }
  if (c) {
    return c
  }
  if (u) {
    return u
  }
  return 'Localização não informada'
}

/**
 * Formatação de Produto e SKU.
 * Mostra código só quando existir código real. NUNCA usa nome do produto como SKU.
 * Sem código: "Código não informado".
 */
export function formatProductSku(
  sku: unknown,
  productDescription?: unknown,
): { skuDisplay: string; hasRealSku: boolean } {
  if (sku === null || sku === undefined || sku === '') {
    return { skuDisplay: 'Código não informado', hasRealSku: false }
  }

  const str = String(sku).trim()
  const prodDesc = productDescription ? String(productDescription).trim() : ''

  // Se o sku for idêntico à descrição do produto, não é um sku real
  if (
    !str ||
    str.toLowerCase() === 'undefined' ||
    str.toLowerCase() === 'null' ||
    (prodDesc && str.toLowerCase() === prodDesc.toLowerCase())
  ) {
    return { skuDisplay: 'Código não informado', hasRealSku: false }
  }

  return { skuDisplay: str, hasRealSku: true }
}
