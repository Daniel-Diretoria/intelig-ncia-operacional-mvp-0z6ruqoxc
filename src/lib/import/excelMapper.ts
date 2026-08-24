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
 * vindos de qualquer origem (Excel TradePro, API, Mock) em `ValidadeItem` ou
 * em `TradeProRawRecord`.
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

/**
 * Converte valor genérico em identificador textual, preservando zeros à
 * esquerda. NÃO valida como CPF/CNPJ fiscal. NÃO completa dígitos.
 */
export function parseTextId(raw: unknown): string {
  if (raw == null) return ''
  if (typeof raw === 'number') return Number.isInteger(raw) ? String(raw) : raw.toString()
  return String(raw).trim()
}

/** Calcula dias restantes até a validade a partir de uma data ISO. */
/**
 * Retorna a data atual no fuso America/Sao_Paulo (ISO YYYY-MM-DD).
 */
export function getTodaySaoPaulo(): string {
  const now = new Date()
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/**
 * Verifica se uma data de validade é implausível (> 5 anos a partir da data de processamento em America/Sao_Paulo).
 * Retorna true se a data for inválida ou superior a 5 anos no futuro (ex: 2076, 2035).
 * Datas dentro de 5 anos (como 2027, 2028) retornam false (são plausíveis).
 */
export function isDataImplausivel(validadeISO: string, refDateISO?: string): boolean {
  if (!validadeISO) return true
  const v = new Date(validadeISO + 'T00:00:00Z')
  if (isNaN(v.getTime())) return true

  const hojeStr = refDateISO || getTodaySaoPaulo()
  const hoje = new Date(hojeStr + 'T00:00:00Z')
  if (isNaN(hoje.getTime())) return true

  const limite5Anos = new Date(hoje.getTime())
  limite5Anos.setUTCFullYear(limite5Anos.getUTCFullYear() + 5)

  return v.getTime() > limite5Anos.getTime()
}

/**
 * Calcula dias restantes até a validade a partir de uma data ISO no fuso America/Sao_Paulo.
 * Dias restantes = Validade - hoje em America/Sao_Paulo.
 */
export function calcularDiasRestantes(validadeISO: string, refDateISO?: string): number {
  const v = new Date(validadeISO + 'T00:00:00Z')
  if (isNaN(v.getTime())) return 0
  const hojeStr = refDateISO || getTodaySaoPaulo()
  const today = new Date(hojeStr + 'T00:00:00Z')
  return Math.floor((v.getTime() - today.getTime()) / 86400000)
}

/** Deriva status operacional a partir dos dias restantes (faixas TradePro). */
export function deriveStatus(diasRestantes: number): ValidadeStatus {
  if (diasRestantes < 0) return 'Vencido'
  if (diasRestantes <= 15) return 'Crítico'
  if (diasRestantes <= 20) return 'Atenção'
  if (diasRestantes <= 29) return 'Moderado'
  return 'Normal'
}

/** Resolve o valor de um campo em um registro genérico usando o mapeamento. */
function resolveValue(
  record: Record<string, unknown>,
  internalKey: string,
  mapping: ColumnMapping,
): unknown {
  const sourceKey = mapping[internalKey]
  if (sourceKey) {
    if (Object.prototype.hasOwnProperty.call(record, sourceKey)) return record[sourceKey]
  }
  const aliasNorm = normalizeHeader(sourceKey ?? internalKey)
  for (const k of Object.keys(record)) {
    if (normalizeHeader(k) === aliasNorm) return record[k]
  }
  return undefined
}

/**
 * Mapeia um registro genérico (linha do Excel TradePro) para o modelo interno
 * `ValidadeItem`, compatível com a UI existente.
 *
 * Mapeia as 23 colunas TradePro para os campos de ValidadeItem:
 *  - razaoSocial -> cliente / loja (extraído)
 *  - fornecedor -> industria
 *  - produto -> product
 *  - codProduto -> sku
 *  - quantidade -> estoque (e quantidade)
 *  - validade -> validade
 *  - cidade/estado -> cidade/uf
 *  - colaborador/supervisor -> promotor/supervisor
 */
export function mapRecord(
  record: Record<string, unknown>,
  mapping: ColumnMapping,
  index: number,
): MappedRecord {
  const errors: string[] = []
  const item: Partial<ValidadeItem> = {}

  const get = (key: string): unknown => resolveValue(record, key, mapping)

  // Identificadores textuais (preservam zeros à esquerda)
  const codColaborador = parseTextId(get('codColaborador'))
  const codSupervisor = parseTextId(get('codSupervisor'))
  const cpfCnpj = parseTextId(get('cpfCnpj'))
  const codCliente = parseTextId(get('codCliente'))
  const codProduto = parseTextId(get('codProduto'))
  const codBarras = parseTextId(get('codBarras'))
  const cnpj = parseTextId(get('cnpj'))

  // Strings
  const colaborador = parseString(get('colaborador'))
  const supervisor = parseString(get('supervisor'))
  const razaoSocial = parseString(get('razaoSocial'))
  const fantasia = parseString(get('fantasia'))
  const cidade = parseString(get('cidade'))
  const estado = parseString(get('estado')) || parseString(get('uf'))
  const cliente = parseString(get('cliente'))
  const produto = parseString(get('produto'))
  const numeroLote = parseString(get('numeroLote')) || parseString(get('lote'))
  const representante = parseString(get('representante'))
  const fornecedor = parseString(get('fornecedor'))

  // Números
  const quantidade = parseNumber(get('quantidade'))
  const diasVencimentoArquivo = parseNumber(get('diasVencimentoArquivo'))

  // Datas
  const realizado = parseDate(get('realizado'))
  const validade = parseDate(get('validade'))
  const dataFabricacao = parseDate(get('dataFabricacao'))

  // Categoria — não existe no TradePro; deriva best-effort ou usa Mercearia
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
  if (!category) category = 'Mercearia'

  const statusOperacionalArquivo =
    parseString(get('statusOperacionalArquivo')) || parseString(get('statusOperacional'))
  const dataEntradaArquivo = parseDate(get('dataEntradaArquivo')) || parseDate(get('dataEntrada'))

  // --- Campos obrigatórios do modelo de Validades (9):
  // Razão Social, Realizado, Produto, Cliente, Quantidade, Validade, Dias p/ Vencimento, Status Operacional, Data Entrada
  if (!razaoSocial) errors.push('Razão Social ausente')
  if (!realizado) errors.push('Realizado (data da coleta) ausente ou inválido')
  if (!produto) errors.push('Produto ausente')
  if (!cliente) errors.push('Cliente ausente')
  if (quantidade == null) errors.push('Quantidade ausente')
  else if (quantidade < 0) errors.push('Quantidade negativa é rejeitada')
  if (!validade) errors.push('Validade ausente ou inválida')
  if (diasVencimentoArquivo == null) errors.push('Dias p/ Vencimento ausente')
  if (!statusOperacionalArquivo) errors.push('Status Operacional ausente')
  if (!dataEntradaArquivo) errors.push('Data Entrada ausente ou inválida')

  if (errors.length > 0) {
    return { item: { ...item }, errors }
  }

  // Validação de data implausível (> 5 anos)
  if (isDataImplausivel(validade!)) {
    errors.push('DATA_IMPLAUSIVEL')
  }

  const diasRestantes = calcularDiasRestantes(validade!)
  const status = deriveStatus(diasRestantes)

  // Extrai loja da Razão Social quando possível (código - nome)
  let loja: string | undefined
  let codigoLoja: string | undefined
  const m = razaoSocial.match(/^(\d{1,10})\s*[-•·–]\s*(.+)$/)
  if (m) {
    codigoLoja = m[1].trim()
    loja = m[2].trim()
  } else {
    loja = razaoSocial
  }

  item.id = `imp-${Date.now()}-${index}`
  item.product = produto
  item.sku = codProduto || codBarras || `TP-${index}`
  item.lote = numeroLote || ''
  item.category = category
  item.validade = validade!
  item.diasRestantes = diasRestantes
  item.status = status
  item.unidade = 'UN'
  item.estoque = quantidade ?? 0
  // cliente = campo "Cliente" do TradePro; loja extraída da Razão Social
  item.cliente = cliente || undefined
  item.industria = fornecedor || undefined
  item.rede = undefined
  item.codigoLoja = codigoLoja || undefined
  item.loja = loja || razaoSocial || undefined
  item.cidade = cidade || undefined
  item.uf = estado || undefined
  item.promotor = colaborador || undefined
  item.supervisor = supervisor || undefined
  item.quantidade = quantidade ?? 0
  item.precoUnitario = undefined
  item.ultimaAtualizacao = realizado || undefined

  // Campos extras do TradePro são preservados via attachment em runtime
  // (não fazem parte de ValidadeItem, mas o pipeline os utiliza).
  ;(item as ValidadeItem & Record<string, unknown>)._tradePro = {
    codColaborador,
    codSupervisor,
    cpfCnpj,
    codCliente,
    codProduto,
    codBarras,
    cnpj,
    fantasia,
    numeroLote,
    representante,
    fornecedor,
    razaoSocial,
    realizado,
    dataFabricacao,
    diasVencimentoArquivo,
    codigoLoja,
  }

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
