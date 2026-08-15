import type { ValidadeItem, ValidadeStatus, ProductCategory } from '@/types'
import {
  EXPECTED_COLUMNS,
  type ExpectedColumn,
  normalizeHeader,
  isValidCategory,
  normalizeCategory,
} from './columnMapping'

/**
 * Camada de mapeamento — transforma registros genéricos (objetos chave/valor)
 * vindos de qualquer origem (Excel, API TradePro, Mock) em `ValidadeItem`.
 *
 * A entrada é sempre um array de objetos simples (`Record<string, unknown>`),
 * nunca algo acoplado ao formato Excel. Isso permite trocar a origem
 * (Excel -> API TradePro) sem alterar o mapper.
 *
 * O mapeamento de "chave do objeto -> campo interno" é configurável via
 * `ColumnMapping` (record de campoInterno -> nomeDaChaveNoObjeto). Quando
 * omitido, usa os aliases definidos em `columnMapping.ts`.
 */

export type ColumnMapping = Record<string, string | undefined>

/** Resultado do mapeamento de um único registro. */
export interface MappedRecord {
  /** Item mapeado (parcial — pode faltar campos se a linha for inválida). */
  item: Partial<ValidadeItem>
  /** Erros que impediram o mapeamento completo do registro. */
  errors: string[]
}

/** Tenta interpretar uma data em vários formatos pt-BR/ISO. Retorna ISO YYYY-MM-DD ou null. */
export function parseDate(raw: unknown): string | null {
  if (raw == null || raw === '') return null

  // Excel serial date number
  if (typeof raw === 'number' && raw > 0 && raw < 100000) {
    // SheetJS converte datas reais para objetos Date quando cellDates:true,
    // mas fallback para serial numérico: 1 = 1900-01-01 (com correção de leap bug)
    const epoch = new Date(Date.UTC(1899, 11, 30))
    const d = new Date(epoch.getTime() + raw * 86400000)
    if (!isNaN(d.getTime())) {
      return toISODate(d)
    }
  }

  if (raw instanceof Date && !isNaN(raw.getTime())) {
    return toISODate(raw)
  }

  const str = String(raw).trim()
  if (!str) return null

  // ISO aaaa-mm-dd
  let m = str.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) {
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
    if (!isNaN(d.getTime())) return toISODate(d)
  }

  // dd/mm/aaaa ou dd-mm-aaaa
  m = str.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/)
  if (m) {
    let [, d, mo, y] = m
    let year = +y
    if (year < 100) year += year < 30 ? 2000 : 1900
    const date = new Date(Date.UTC(year, +mo - 1, +d))
    if (!isNaN(date.getTime())) return toISODate(date)
  }

  // Fallback: tentar Date.parse
  const parsed = new Date(str)
  if (!isNaN(parsed.getTime())) return toISODate(parsed)

  return null
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Converte um valor genérico em number ou null. */
export function parseNumber(raw: unknown): number | null {
  if (raw == null || raw === '') return null
  if (typeof raw === 'number') return isFinite(raw) ? raw : null
  const str = String(raw)
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^0-9.-]/g, '')
  if (!str) return null
  const n = Number(str)
  return isFinite(n) ? n : null
}

/** Converte valor genérico em string limpa. */
export function parseString(raw: unknown): string {
  if (raw == null) return ''
  return String(raw).trim()
}

/** Calcula dias restantes até a validade a partir de uma data ISO. */
export function calcularDiasRestantes(validadeISO: string, refDate: Date = new Date()): number {
  const v = new Date(validadeISO + 'T00:00:00Z')
  if (isNaN(v.getTime())) return 0
  const today = new Date(
    Date.UTC(refDate.getUTCFullYear(), refDate.getUTCMonth(), refDate.getUTCDate()),
  )
  return Math.floor((v.getTime() - today.getTime()) / 86400000)
}

/** Deriva status legado a partir dos dias restantes. */
export function deriveStatus(diasRestantes: number): ValidadeStatus {
  if (diasRestantes <= 7) return 'Crítico'
  if (diasRestantes <= 30) return 'Próximo'
  return 'OK'
}

/** Resolve o valor de um campo em um registro genérico usando o mapeamento. */
function resolveValue(
  record: Record<string, unknown>,
  internalKey: string,
  mapping: ColumnMapping,
): unknown {
  const sourceKey = mapping[internalKey]
  if (sourceKey) {
    // corresponde direto
    if (Object.prototype.hasOwnProperty.call(record, sourceKey)) return record[sourceKey]
  }
  // fallback: procura por chave normalizada
  const aliasNorm = normalizeHeader(sourceKey ?? internalKey)
  for (const k of Object.keys(record)) {
    if (normalizeHeader(k) === aliasNorm) return record[k]
  }
  return undefined
}

/** Mapeia um único registro genérico para ValidadeItem parcial. */
export function mapRecord(
  record: Record<string, unknown>,
  mapping: ColumnMapping,
  index: number,
): MappedRecord {
  const errors: string[] = []
  const item: Partial<ValidadeItem> = {}

  const get = (key: string): unknown => resolveValue(record, key, mapping)

  // Strings
  const product = parseString(get('product'))
  const sku = parseString(get('sku'))
  const lote = parseString(get('lote'))
  const unidade = parseString(get('unidade')) || 'UN'
  const cliente = parseString(get('cliente')) || undefined
  const industria = parseString(get('industria')) || undefined
  const rede = parseString(get('rede')) || undefined
  const loja = parseString(get('loja')) || undefined
  const cidade = parseString(get('cidade')) || undefined
  const uf = parseString(get('uf')) || undefined
  const promotor = parseString(get('promotor')) || undefined
  const supervisor = parseString(get('supervisor')) || undefined

  // Números
  const estoque = parseNumber(get('estoque'))
  const quantidade = parseNumber(get('quantidade'))
  const precoUnitario = parseNumber(get('precoUnitario'))

  // Data
  const validade = parseDate(get('validade'))

  // Categoria (enum)
  const catRaw = parseString(get('category'))
  let category: ProductCategory | null = null
  if (catRaw) {
    if (isValidCategory(catRaw)) {
      category = catRaw
    } else {
      const norm = normalizeCategory(catRaw)
      if (norm) category = norm
    }
  }

  // Coleta erros de campos obrigatórios ausentes
  if (!product) errors.push('Produto ausente')
  if (!sku) errors.push('SKU ausente')
  if (!lote) errors.push('Lote ausente')
  if (!category) errors.push(`Categoria ausente ou inválida ("${catRaw}")`)
  if (!validade) errors.push('Data de validade ausente ou inválida')
  if (estoque == null) errors.push('Estoque ausente ou inválido')
  if (!unidade) errors.push('Unidade ausente')

  if (errors.length > 0) {
    return { item: { ...item }, errors }
  }

  const diasRestantes = calcularDiasRestantes(validade!)
  const status = deriveStatus(diasRestantes)

  item.id = `imp-${Date.now()}-${index}`
  item.product = product
  item.sku = sku
  item.lote = lote
  item.category = category!
  item.validade = validade!
  item.diasRestantes = diasRestantes
  item.status = status
  item.unidade = unidade
  item.estoque = estoque!
  if (cliente) item.cliente = cliente
  if (industria) item.industria = industria
  if (rede) item.rede = rede
  if (loja) item.loja = loja
  if (cidade) item.cidade = cidade
  if (uf) item.uf = uf
  if (promotor) item.promotor = promotor
  if (supervisor) item.supervisor = supervisor
  if (quantidade != null) item.quantidade = quantidade
  if (precoUnitario != null) item.precoUnitario = precoUnitario

  return { item: item as ValidadeItem, errors }
}

/** Mapeia um array de registros genéricos. */
export function mapRecords(
  records: Record<string, unknown>[],
  mapping: ColumnMapping,
): MappedRecord[] {
  return records.map((r, i) => mapRecord(r, mapping, i))
}

/** Lista de colunas esperadas (atalho para a UI). */
export const MAPPABLE_COLUMNS: ExpectedColumn[] = EXPECTED_COLUMNS
