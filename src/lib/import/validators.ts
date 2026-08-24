import type { ValidadeItem } from '@/types'
import { parseDate } from './excelMapper'
import { isRupturaFile } from './columnMapping'

/**
 * Camada de validação de dados de importação.
 *
 * Funções puras que operam sobre arrays de `ValidadeItem` (já mapeados) ou
 * registros genéricos, produzindo relatórios estruturados de erros/warnings.
 *
 * Independem da origem (Excel, API TradePro, etc.) — operam sobre o modelo
 * interno da aplicação.
 */

export type IssueSeverity = 'error' | 'warning'

export interface ValidationIssue {
  /** Índice da linha no dataset original (0-based). */
  rowIndex: number
  severity: IssueSeverity
  /** Campo relacionado (ex.: 'validade', 'estoque'). */
  field?: string
  message: string
}

export interface RowValidationResult {
  valid: boolean
  errors: ValidationIssue[]
  warnings: ValidationIssue[]
}

export interface DatasetValidationReport {
  totalRows: number
  validRows: number
  invalidRows: number
  warningRows: number
  issues: ValidationIssue[]
  duplicates: DuplicateGroup[]
  /** Indica se o arquivo foi detectado como Rupturas. */
  isRupturaFile?: boolean
}

export interface DuplicateGroup {
  key: string
  indices: number[]
  product: string
  loja?: string
  validade: string
}

/** Limite para "passado distante" — datas com mais de 5 anos no passado são suspeitas. */
const MAX_PAST_DAYS = 365 * 5
/** Limite para "futuro distante" — mais de 10 anos é suspeito. */
const MAX_FUTURE_DAYS = 365 * 10

/**
 * Valida campos obrigatórios de um item mapeado (modelo TradePro).
 *
 * Campos obrigatórios presentes na extração TradePro:
 *   Razão Social, Realizado, Cliente, Produto, Quantidade, Validade.
 * Campos calculados pelo sistema: Dias p/ Vencer, Status Operacional, Data Entrada.
 *
 * O mapper (excelMapper.mapRecord) já valida esses 7 no momento do mapeamento e
 * descarta linhas inválidas. Esta função reconfirma os 7 já mapeados para o
 * ValidadeItem, para garantir consistência sem reintroduzir campos opcionais
 * (lote, sku, categoria, unidade, etc.) como obrigatórios.
 *
 * Mapeamento 7 obrigatórios -> ValidadeItem:
 *   Razão Social -> loja
 *   Realizado    -> ultimaAtualizacao
 *   Cliente      -> cliente
 *   Produto      -> product
 *   Quantidade   -> quantidade / estoque
 *   Validade     -> validade
 *   Fornecedor   -> industria
 */
export function validateRequiredFields(
  item: Partial<ValidadeItem>,
  rowIndex: number,
): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  const required: Array<{ field: keyof ValidadeItem; label: string }> = [
    { field: 'product', label: 'Produto' },
    { field: 'validade', label: 'Validade' },
    { field: 'cliente', label: 'Cliente' },
    { field: 'loja', label: 'Razão Social' },
    { field: 'ultimaAtualizacao', label: 'Realizado' },
  ]

  for (const { field, label } of required) {
    const val = item[field]
    if (val == null || val === '' || (typeof val === 'number' && isNaN(val))) {
      issues.push({
        rowIndex,
        severity: 'error',
        field: String(field),
        message: `Campo obrigatório "${label}" ausente ou vazio.`,
      })
    }
  }

  // Quantidade: 0 é válido; null/undefined é ausente (erro). Negativo é tratado
  // em validateQuantidade.
  const qtd = item.quantidade ?? item.estoque
  if (qtd == null || (typeof qtd === 'number' && isNaN(qtd))) {
    issues.push({
      rowIndex,
      severity: 'error',
      field: 'quantidade',
      message: 'Campo obrigatório "Quantidade" ausente ou vazio.',
    })
  }

  return issues
}

/**
 * Valida consistência de datas: formato, passado distante, futuro distante.
 */
export function validateDates(item: Partial<ValidadeItem>, rowIndex: number): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const raw = item.validade
  if (!raw) return issues

  const iso = parseDate(raw)
  if (!iso) {
    issues.push({
      rowIndex,
      severity: 'error',
      field: 'validade',
      message: `Data de validade inválida: "${raw}".`,
    })
    return issues
  }

  const today = new Date()
  const todayUTC = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  const v = new Date(iso + 'T00:00:00Z').getTime()
  const diffDays = Math.floor((v - todayUTC) / 86400000)

  if (diffDays < -MAX_PAST_DAYS) {
    issues.push({
      rowIndex,
      severity: 'warning',
      field: 'validade',
      message: `Data de validade no passado distante (${iso}). Verifique se está correta.`,
    })
  }
  // Validação de data implausível (> 5 anos no futuro): Auditoria DATA_IMPLAUSIVEL
  const MAX_PLAUSIBLE_FUTURE_DAYS = 365 * 5 + 30 // ~5 anos
  if (diffDays > MAX_PLAUSIBLE_FUTURE_DAYS) {
    issues.push({
      rowIndex,
      severity: 'error',
      field: 'validade',
      message: `DATA_IMPLAUSIVEL: Data de validade (${iso}) excede o limite de 5 anos a partir de hoje.`,
    })
  } else if (diffDays > MAX_FUTURE_DAYS) {
    issues.push({
      rowIndex,
      severity: 'warning',
      field: 'validade',
      message: `Data de validade muito futura (${iso}). Verifique se está correta.`,
    })
  }

  return issues
}

/**
 * Valida Quantidade: 0 é válido, negativo deve ser rejeitado.
 */
export function validateQuantidade(
  item: Partial<ValidadeItem>,
  rowIndex: number,
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const q = item.quantidade ?? item.estoque
  if (q != null && q < 0) {
    issues.push({
      rowIndex,
      severity: 'error',
      field: 'quantidade',
      message: `Quantidade negativa (${q}) é rejeitada.`,
    })
  }
  return issues
}

/**
 * Detecta duplicidades evidentes: mesmo produto + loja + validade.
 * Se loja for ausente, usa sku + validade como fallback.
 */
export function detectDuplicates(items: ValidadeItem[]): DuplicateGroup[] {
  const groups = new Map<string, DuplicateGroup>()

  items.forEach((item, idx) => {
    const loja = item.loja?.trim() || ''
    const key = loja
      ? `${item.sku?.toLowerCase()}|${loja.toLowerCase()}|${item.validade}`
      : `${item.sku?.toLowerCase()}||${item.validade}`

    const existing = groups.get(key)
    if (existing) {
      existing.indices.push(idx)
    } else {
      groups.set(key, {
        key,
        indices: [idx],
        product: item.product,
        loja: loja || undefined,
        validade: item.validade,
      })
    }
  })

  return [...groups.values()].filter((g) => g.indices.length > 1)
}

/**
 * Valida completude: campos opcionais ausentes viram warnings (não bloqueiam).
 *
 * Nota: 'rede' e 'precoUnitario' NÃO devem gerar avisos/warnings, pois não são
 * obrigatórios e sua ausência não impacta a operação ("rede, preço não tem nada haver").
 */
export function validateCompleteness(
  _item: Partial<ValidadeItem>,
  _rowIndex: number,
): ValidationIssue[] {
  // Rede e precoUnitario removidos explicitamente a pedido do usuário.
  // Nenhum warning por ausência de rede ou precoUnitario é gerado.
  return []
}

/**
 * Detecta se um arquivo é de Rupturas com base no nome, aba e cabeçalhos.
 */
export function detectRupturaFile(
  fileName: string,
  sheetName: string,
  detectedHeaders: string[],
): boolean {
  const lowerName = (fileName || '').toLowerCase()
  if (lowerName.includes('ruptura') || lowerName.includes('rupturas')) return true
  return isRupturaFile(detectedHeaders, sheetName)
}

/**
 * Executa a validação completa de um dataset de itens mapeados.
 */
export function validateDataset(items: ValidadeItem[]): DatasetValidationReport {
  const issues: ValidationIssue[] = []
  const invalidRows = new Set<number>()
  const warningRows = new Set<number>()

  items.forEach((item, idx) => {
    const errs = [
      ...validateRequiredFields(item, idx),
      ...validateDates(item, idx),
      ...validateQuantidade(item, idx),
    ]
    const warns = validateCompleteness(item, idx)

    errs.forEach((e) => {
      issues.push(e)
      invalidRows.add(idx)
    })
    warns.forEach((w) => {
      issues.push(w)
      warningRows.add(idx)
    })
  })

  // Duplicidades -> warnings
  const duplicates = detectDuplicates(items)
  for (const dup of duplicates) {
    dup.indices.forEach((idx) => {
      warningRows.add(idx)
      issues.push({
        rowIndex: idx,
        severity: 'warning',
        field: 'duplicidade',
        message: `Possível duplicidade: ${dup.product}${dup.loja ? ` • ${dup.loja}` : ''} • val. ${dup.validade}.`,
      })
    })
  }

  const validRows = items.length - invalidRows.size

  return {
    totalRows: items.length,
    validRows,
    invalidRows: invalidRows.size,
    warningRows: warningRows.size,
    issues,
    duplicates,
  }
}

/**
 * Filtra apenas registros válidos (sem erros bloqueantes).
 */
export function filterValidItems(
  items: ValidadeItem[],
  report: DatasetValidationReport,
): { valid: ValidadeItem[]; invalidIndices: Set<number> } {
  const errorIndices = new Set(
    report.issues.filter((i) => i.severity === 'error').map((i) => i.rowIndex),
  )
  const valid = items.filter((_, idx) => !errorIndices.has(idx))
  return { valid, invalidIndices: errorIndices }
}
