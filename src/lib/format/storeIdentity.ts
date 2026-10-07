/**
 * Identidade canônica e padronização central de Lojas, Redes, Cidades e Produtos.
 * Helper central único reutilizado em Dashboard, Validades, Lojas, Rupturas, Alertas, Auditoria e Relatórios.
 *
 * Regras estritas:
 * - Só é código de loja um token numérico real obtido do campo próprio (codigo_loja) ou prefixo numérico da Razão Social (ex: "250 - FORT...").
 * - Preservar zeros à esquerda: 085, 010, 007.
 * - FRUTAP, LILIBEL, PARMISSIMO, nome de indústria, cliente ou produto NUNCA podem virar código de loja.
 * - Se não existir código numérico real, mostrar exatamente: "Código não identificado • NOME DA LOJA".
 * - Nunca inventar "000".
 * - Não repetir código no nome (nunca "845 • 845 • FORT...").
 * - Rede: FORT / FORT ATACADISTA -> FORT ATACADISTA, BRASIL ATACADISTA -> BRASIL ATACADISTA, ATACADÃO -> ATACADÃO, GIASSI -> GIASSI, COMPER -> COMPER, GRUPO PEREIRA -> GRUPO PEREIRA. Se sem correspondência segura: "Rede não identificada".
 * - Localização: "Cidade / UF" quando ambos existirem, só "Cidade" sem UF, só "UF" sem cidade. NUNCA "Cidade /" ou "/ UF".
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
  cliente?: string | null
  fornecedor?: string | null
  industria?: string | null
  cnpj?: string | null
  cidade?: string | null
}

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
 * Valida se um token é puramente um código numérico real (podendo ter zeros à esquerda).
 */
export function isRealNumericStoreCode(code: unknown): boolean {
  if (code === null || code === undefined) return false
  const str = String(code).trim()
  if (!str) return false
  if (FORBIDDEN_CODES.has(str.toLowerCase())) return false

  // Deve ser puramente dígitos (1 a 10 dígitos)
  return /^\d{1,10}$/.test(str)
}

/**
 * Limpa código removendo espaços e tratando números/strings.
 * Retorna o código preservando zeros à esquerda se for numérico real, ou null.
 */
export function cleanCode(code: unknown): string | null {
  if (code === null || code === undefined) return null
  const str = String(code).trim()
  if (!str) return null
  if (FORBIDDEN_CODES.has(str.toLowerCase())) return null

  // Se for puramente numérico, preserva zeros à esquerda como string
  if (/^\d{1,10}$/.test(str)) {
    // Se for apenas zeros como "000" ou "0", rejeita
    if (/^0+$/.test(str)) return null
    return str
  }

  return null
}

/**
 * Extrai código numérico e nome de uma string composta (ex: "00250 - FORT ATACADISTA FLORESTA", "085 • FORT" ou "00012 · LOJA")
 */
export function extractFromCombined(text: string): {
  extractedCode: string | null
  cleanName: string
} {
  const trimmed = text.trim()
  if (!trimmed) return { extractedCode: null, cleanName: '' }

  // Match para "00000 - NOME" ou "00000 • NOME" ou "00000 · NOME" ou "00000 – NOME"
  const match = trimmed.match(/^(\d{1,10})\s*[-•·–]\s*(.+)$/)
  if (match) {
    const candidateCode = cleanCode(match[1])
    const remainder = match[2].trim()
    if (candidateCode) {
      return {
        extractedCode: candidateCode,
        cleanName: remainder || trimmed,
      }
    }
  }

  return { extractedCode: null, cleanName: trimmed }
}

/**
 * Remove qualquer prefixo repetido do código no nome.
 * Exemplo: se code = "845" e name = "845 • FORT ATACADISTA" ou "845 - FORT", limpa para "FORT ATACADISTA".
 */
export function removeRepeatedCodePrefix(name: string, code?: string | null): string {
  let cleaned = name.trim()
  if (!cleaned) return 'Loja não identificada'

  let changed = true
  while (changed) {
    changed = false

    // Se o nome começa com "123 • " ou "123 - "
    const prefixMatch = cleaned.match(/^(\d{1,10})\s*[-•–]\s*(.+)$/)
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
/**
 * Constrói a chave composta segura e única de identificação da loja.
 * Prioridade: se existir ID persistido único do backend (id ou storeId), usar esse.
 * Fallback composto: `codigoLoja (preservado como texto com zeros) | nome normalizado | rede | cidade/UF`.
 * Duas lojas com mesmo código mas nome/rede/cidade distintos DEVEM permanecer separadas.
 */
/**
 * Extrai cidade e UF de forma robusta.
 * - Se rawUf não-vazio: usa rawCity e rawUf como estão (limpos de espaços)
 * - Se rawUf vazio: tenta extrair UF do final de rawCity via regex
 * - Retorna { city: parteLimpa, uf: ufExtraida }
 */
export function parseCityUf(rawCity: unknown, rawUf: unknown): { city: string; uf: string } {
  const c = typeof rawCity === 'string' ? rawCity.trim() : rawCity ? String(rawCity).trim() : ''
  const u =
    typeof rawUf === 'string'
      ? rawUf.trim().toUpperCase()
      : rawUf
        ? String(rawUf).trim().toUpperCase()
        : ''

  if (u) {
    // Se rawUf já existe e não é vazio, usa a cidade e o uf fornecidos
    return { city: c, uf: u }
  }

  if (!c) {
    return { city: '', uf: '' }
  }

  // Se rawUf está vazio, tenta extrair UF do final de rawCity
  // Padrões como "Cidade / UF", "Cidade/UF", "Cidade - UF", "Cidade – UF", "Cidade — UF"
  const ufRegex =
    /\s*[/\-–—]\s*(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/i
  const match = c.match(ufRegex)
  if (match) {
    const extractedUf = match[1].toUpperCase()
    const cleanCity = c.slice(0, match.index).trim()
    return { city: cleanCity, uf: extractedUf }
  }

  return { city: c, uf: '' }
}

export function buildStoreCompositeKey(input: {
  id?: string | null
  storeId?: string | null
  codigoLoja?: string | number | null
  codigo_loja?: string | number | null
  storeCode?: string | number | null
  nomeLoja?: string | null
  nome_loja?: string | null
  storeName?: string | null
  loja?: string | null
  razaoSocial?: string | null
  razao_social?: string | null
  rede?: string | null
  networkName?: string | null
  cidade?: string | null
  city?: string | null
  uf?: string | null
  estado?: string | null
  state?: string | null
}): string {
  // Se existir ID persistido único explícito com formato de ID de banco
  // (ex: PB id de 15 caracteres alfanuméricos sem separadores de composição), preservamos se fornecido
  // Mas para identificação operacional de loja composta entre validades e rupturas:
  const rawCode = input.codigoLoja ?? input.codigo_loja ?? input.storeCode ?? ''
  const code =
    extractStoreRealCode({
      codigoLoja: rawCode,
      nomeLoja: input.nomeLoja ?? input.nome_loja ?? input.storeName ?? input.loja,
      razaoSocial: input.razaoSocial ?? input.razao_social,
    }) || ''

  const rawName =
    input.nomeLoja ??
    input.nome_loja ??
    input.storeName ??
    input.loja ??
    input.razaoSocial ??
    input.razao_social ??
    ''
  const cleanName = extractStoreCleanName({
    codigoLoja: rawCode,
    nomeLoja: rawName,
  })

  const rawRede = input.rede ?? input.networkName ?? deriveNetworkName(rawName)
  const network = rawRede ? normalizeNetworkName(rawRede) : deriveNetworkName(rawName)

  const rawCity = (input.cidade ?? input.city ?? '').trim()
  const rawUf = (input.uf ?? input.estado ?? input.state ?? '').trim().toUpperCase()
  const { city, uf } = parseCityUf(rawCity, rawUf)
  const location = formatCityUf(city, uf)
  const normCode = code ? String(code).trim() : 'SEM_CODIGO'
  const normName = cleanName.trim().toUpperCase()
  const normNetwork = network.trim().toUpperCase()
  const normLocation = location.trim().toUpperCase()

  return `${normCode}|${normName}|${normNetwork}|${normLocation}`
}

/**
 * Formata o nome da loja especificamente para exibição na tabela e exportação:
 * "CÓDIGO — NOME" (usando em-dash '—' no lugar de '•').
 * Se sem código numérico confiável: "SEM CÓDIGO — NOME".
 * Preserva zeros à esquerda e evita inventar valores.
 */
export function formatStoreIdentityTable(
  input:
    | {
        codigoLoja?: string | number | null
        codigo_loja?: string | number | null
        storeCode?: string | number | null
        nomeLoja?: string | null
        nome_loja?: string | null
        storeName?: string | null
        loja?: string | null
        razaoSocial?: string | null
        razao_social?: string | null
      }
    | string
    | null
    | undefined,
): string {
  if (!input) {
    return 'SEM CÓDIGO — Loja não identificada'
  }

  let code: string | null = null
  let cleanName = ''

  if (typeof input === 'string') {
    const { extractedCode, cleanName: cName } = extractFromCombined(input)
    code = extractedCode
    cleanName = removeRepeatedCodePrefix(cName, code)
    if (!cleanName) cleanName = input.trim()
  } else {
    code = extractStoreRealCode({
      codigoLoja: input.codigoLoja ?? input.codigo_loja ?? input.storeCode,
      nomeLoja: input.nomeLoja ?? input.nome_loja ?? input.storeName ?? input.loja,
      razaoSocial: input.razaoSocial ?? input.razao_social,
    })
    cleanName = extractStoreCleanName({
      codigoLoja: input.codigoLoja ?? input.codigo_loja ?? input.storeCode,
      nomeLoja: input.nomeLoja ?? input.nome_loja ?? input.storeName ?? input.loja,
      razaoSocial: input.razaoSocial ?? input.razao_social,
    })
  }

  if (code) {
    return `${code} — ${cleanName || 'Loja não identificada'}`
  }

  return `SEM CÓDIGO — ${cleanName || 'Loja não identificada'}`
}

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

  // Se não tem código numérico no campo próprio, tenta extrair de rawRazao ou rawName
  if (!code && rawRazao) {
    const extracted = extractFromCombined(String(rawRazao))
    if (extracted.extractedCode) {
      code = extracted.extractedCode
      if (!name || name === rawRazao) name = extracted.cleanName
    }
  }

  if (!code && name) {
    const extracted = extractFromCombined(name)
    if (extracted.extractedCode) {
      code = extracted.extractedCode
      name = extracted.cleanName
    }
  }

  const finalName = removeRepeatedCodePrefix(name, code)

  if (code) {
    return `${code} • ${finalName}`
  }

  return `Código não identificado • ${finalName || 'Loja não identificada'}`
}

/**
 * Obtém apenas o código real da loja (ou null se não houver código numérico real).
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

  const rawRazao = input.razaoSocial ?? input.razao_social ?? ''
  if (rawRazao) {
    const extracted = extractFromCombined(String(rawRazao))
    if (extracted.extractedCode) return cleanCode(extracted.extractedCode)
  }

  const rawName = input.nomeLoja ?? input.nome_loja ?? input.loja ?? input.fantasia ?? ''
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
 * Normalização de string para matching (sem acentos, lowercase, trim)
 */
function normStr(s: unknown): string {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

/**
 * Deriva a Rede canônica a partir da Razão Social / Nome da loja.
 * NUNCA deriva do cliente ou da indústria.
 * Padrões canônicos:
 *  FORT / FORT ATACADISTA → FORT ATACADISTA
 *  BRASIL ATACADISTA → BRASIL ATACADISTA
 *  ATACADÃO → ATACADÃO
 *  GIASSI → GIASSI
 *  COMPER → COMPER
 *  GRUPO PEREIRA → GRUPO PEREIRA
 * Se não houver correspondência segura: "Rede não identificada".
 */
export function deriveNetworkName(storeNameOrRazao: unknown): string {
  if (!storeNameOrRazao) return 'Rede não identificada'
  const n = normStr(storeNameOrRazao)
  if (!n) return 'Rede não identificada'

  // Importante: verificar bandeiras específicas ANTES de nomes genéricos de grupos.
  // FORT e COMPER são bandeiras operacionais (mesmo quando pertencentes ao Grupo Pereira).
  if (n.includes('fort atacadista') || n.includes('fort')) {
    return 'FORT ATACADISTA'
  }
  if (n.includes('brasil atacadista') || n.includes('brasil atacado')) {
    return 'BRASIL ATACADISTA'
  }
  if (n.includes('atacadao')) {
    return 'ATACADÃO'
  }
  if (n.includes('giassi')) {
    return 'GIASSI'
  }
  if (n.includes('comper')) {
    return 'COMPER'
  }
  if (n.includes('bistek')) {
    return 'BISTEK'
  }
  if (n.includes('angeloni')) {
    return 'ANGELONI'
  }
  if (n.includes('koch') || n.includes('komprao') || n.includes('komprão')) {
    return 'KOCH'
  }
  if (n.includes('condor')) {
    return 'CONDOR'
  }
  if (n.includes('muffato')) {
    return 'MUFFATO'
  }
  if (n.includes('passarela')) {
    return 'PASSARELA'
  }
  if (n.includes('grupo pereira') || n.includes('pereira')) {
    return 'GRUPO PEREIRA'
  }

  return 'Rede não identificada'
}

/**
 * Alias de compatibilidade para normalizar nome de rede
 */
export function normalizeNetworkName(name: unknown): string {
  if (!name) return 'Rede não identificada'
  const derived = deriveNetworkName(name)
  if (derived !== 'Rede não identificada') return derived

  const str = String(name).trim()
  if (
    !str ||
    str.toLowerCase() === 'rede não informada' ||
    str.toLowerCase() === 'rede não identificada'
  ) {
    return 'Rede não identificada'
  }
  return str.toUpperCase()
}

/**
 * Formata Cidade/UF.
 * Regra: se tem Cidade e UF: "Cidade / UF".
 * Se não tem UF: apenas "Cidade".
 * Se não tem Cidade: apenas "UF".
 * NUNCA "Joinville /" ou "/ SC" (sem separador vazio).
 */
export function formatCityUf(cidade: unknown, uf: unknown): string {
  const c = cidade
    ? String(cidade)
        .trim()
        .replace(/[/\s]+$/, '')
    : ''
  const u = uf
    ? String(uf)
        .trim()
        .toUpperCase()
        .replace(/^[/\s]+/, '')
    : ''

  if (c && u) {
    return `${c} / ${u}`
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
/**
 * Normaliza nome de cidade para matching robusto (sem acentos, uppercase, trim)
 */
function normalizeCityName(cityName: unknown): string {
  return String(cityName || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

/**
 * Constrói função de canonicalização de Cidade/UF para filtros e exibição.
 * Se uma cidade tiver lojas com UF preenchida (exatamente UMA UF única conhecida em todo o conjunto),
 * infere essa UF para lojas na mesma cidade que estiverem com uf="".
 * Se a cidade tiver zero ou múltiplas UFs conhecidas, ou se uf já estiver preenchida, mantém sem alteração.
 */
export function buildCityUfCanonicalizer(
  stores: Array<{ city: string; uf: string }>,
): (city: string, uf: string) => { city: string; uf: string } {
  // Mapa de normalizedCity -> Set<UF não-vazia>
  const cityToUfs = new Map<string, Set<string>>()

  for (const s of stores) {
    const { city, uf } = parseCityUf(s.city, s.uf)
    const norm = normalizeCityName(city)
    if (!norm) continue

    if (uf && uf.trim()) {
      let ufSet = cityToUfs.get(norm)
      if (!ufSet) {
        ufSet = new Set<string>()
        cityToUfs.set(norm, ufSet)
      }
      ufSet.add(uf.trim().toUpperCase())
    }
  }

  return (city: string, uf: string): { city: string; uf: string } => {
    const parsed = parseCityUf(city, uf)
    // Se uf já veio preenchida (ou extraída de rawCity pelo parseCityUf), retorna como está
    if (parsed.uf && parsed.uf.trim()) {
      return { city: parsed.city, uf: parsed.uf.trim().toUpperCase() }
    }

    // Se uf vazia, tenta inferir a partir do mapa
    const norm = normalizeCityName(parsed.city)
    const knownUfs = cityToUfs.get(norm)

    if (knownUfs && knownUfs.size === 1) {
      const singleUf = Array.from(knownUfs)[0]
      return { city: parsed.city, uf: singleUf }
    }

    return { city: parsed.city, uf: '' }
  }
}

/**
 * Helper canônico para navegar para a ficha da loja (/lojas/:storeId)
 * Garante identificador canônico composto gerado via buildStoreCompositeKey e codificado com encodeURIComponent.
 * Suporta caracteres especiais em nomes como "/", "—", "&", acentos.
 */
export function navigateToStore(
  store: {
    storeId?: string | null
    codigoLoja?: string | number | null
    codigo_loja?: string | number | null
    storeCode?: string | number | null
    nomeLoja?: string | null
    nome_loja?: string | null
    storeName?: string | null
    loja?: string | null
    razaoSocial?: string | null
    razao_social?: string | null
    rede?: string | null
    networkName?: string | null
    cidade?: string | null
    city?: string | null
    uf?: string | null
    estado?: string | null
    state?: string | null
  },
  navigate: (path: string) => void,
): void {
  const compositeKey =
    store.storeId && store.storeId.includes('|') ? store.storeId : buildStoreCompositeKey(store)

  navigate(`/lojas/${encodeURIComponent(compositeKey)}`)
}

export function formatProductSku(
  sku: unknown,
  productDescription?: unknown,
): { skuDisplay: string; hasRealSku: boolean } {
  if (sku === null || sku === undefined || sku === '') {
    return { skuDisplay: 'Código não informado', hasRealSku: false }
  }

  const str = String(sku).trim()
  const prodDesc = productDescription ? String(productDescription).trim() : ''

  // Se o sku for idêntico à descrição do produto ou nomes genéricos
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
