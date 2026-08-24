/**
 * Normalização e formatação central de Código de Loja.
 *
 * Regras estritas:
 * - normalizeStoreCode: retorna string com 3 dígitos (7 -> "007", 10 -> "010", 19 -> "019", 85 -> "085", 115 -> "115", 420 -> "420", 960 -> "960").
 *   Se não houver código real (nulo, vazio, "0", "000", inválido), retorna "".
 * - formatStoreCode: mesmo que normalizeStoreCode, mas se vazio retorna "Código não informado".
 * - normalizeStoreCodeForMatching: retorna o código sem zeros à esquerda para comparação ("7", "10", "19", "85", "115", "420", "960").
 * - NUNCA usar Number() ou parseInt no código da loja de forma destrutiva — tratar sempre como string.
 */

const FORBIDDEN_CODES = new Set([
  '000',
  '0',
  'undefined',
  'null',
  'nan',
  'none',
  'frutap',
  'lilibel',
  'parmissimo',
  'parmíssimo',
  'diretoria',
  'italac',
  'massas',
  'cocoleve',
  'marigold',
  'gelo',
])

/**
 * Normaliza um código bruto para string formatada com no mínimo 3 dígitos (ex: 7 -> "007", 85 -> "085", 115 -> "115").
 * Se inválido, vazio ou não-numérico, retorna string vazia ("").
 */
export function normalizeStoreCode(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined) return ''
  const str = String(raw).trim()
  if (!str) return ''
  if (FORBIDDEN_CODES.has(str.toLowerCase())) return ''

  // Aceita apenas strings compostas puramente por dígitos (1 a 10 dígitos)
  if (!/^\d{1,10}$/.test(str)) return ''

  // Se for apenas repetição de zeros (ex: "0", "00", "000"), não é código real
  if (/^0+$/.test(str)) return ''

  // Remove zeros à esquerda para descobrir a base e re-aplica padStart(3, '0')
  const stripped = str.replace(/^0+/, '')
  if (!stripped) return ''

  return stripped.padStart(3, '0')
}

/**
 * Formata o código da loja para exibição.
 * Se houver código real, retorna 3 dígitos ("007", "085", "115").
 * Se não houver código real, retorna "Código não informado".
 */
export function formatStoreCode(raw: string | number | null | undefined): string {
  const normalized = normalizeStoreCode(raw)
  if (!normalized) return 'Código não informado'
  return normalized
}

/**
 * Normaliza para comparação/matching.
 * "7" e "007" devem ser considerados a mesma loja.
 * Retorna o código sem zeros à esquerda: "7", "10", "19", "85", "115", etc.
 * Se não for numérico real, retorna a string limpa em lowercase.
 */
export function normalizeStoreCodeForMatching(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined) return ''
  const str = String(raw).trim()
  if (!str) return ''

  if (/^\d{1,10}$/.test(str)) {
    const stripped = str.replace(/^0+/, '')
    return stripped || '0'
  }

  return str.toLowerCase()
}
