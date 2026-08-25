/**
 * Utilitário de leitura de planilhas Excel usando SheetJS (xlsx).
 *
 * Converte um File .xlsx/.xls em:
 *  - headers: string[] (cabeçalhos detectados)
 *  - rows: Record<string, unknown>[] (linhas como objetos chave/valor)
 *  - sheetName: string (aba utilizada)
 *
 * Reconhece a aba "Pesquisa Validade" (formato TradePro) e extrai a
 * Data Arquivo do nome do arquivo (padrão `Validade_YYYY_MM_DD.xlsx`).
 *
 * Identificadores (Cód. Colaborador, Cód. Supervisor, CPF/CNPJ, Cód. Cliente,
 * Cód. Produto, Cód. Barras, CNPJ) são tratados como texto, preservando zeros
 * à esquerda.
 */
import * as XLSX from 'xlsx'

export interface ParsedSheet {
  headers: string[]
  rows: Record<string, unknown>[]
  sheetName: string
  /** Data representada pelo arquivo (ISO YYYY-MM-DD), extraída do nome. */
  dataArquivo?: string
  /** Linhas declaradas na dimensão da planilha (!ref). */
  declaredPhysicalRows: number
  /** Linhas preenchidas úteis (excluindo cabeçalho). */
  usefulRows: number
  /** Linhas vazias ignoradas entre as declaradas e as úteis. */
  ignoredBlankRows: number
}

/** Abas consideradas de Validades no formato TradePro. */
const VALIDADE_SHEET_HINTS = ['pesquisa validade', 'validade', 'validades']

/** Abas consideradas de Rupturas. */
const RUPTURA_SHEET_HINTS = ['ruptura', 'rupturas']

/** Normaliza um nome de aba para comparação tolerante. */
export function normalizeSheetName(name: string): string {
  return name
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

/**
 * Extrai a Data Arquivo (ISO YYYY-MM-DD) do nome do arquivo.
 * Padrão esperado: `Validade_YYYY_MM_DD.xlsx` ou `Rupturas_YYYY_MM_DD.xlsx` -> `YYYY-MM-DD`.
 */
export function extractDataArquivo(fileName: string): string | undefined {
  const base = fileName.split(/[\\/]/).pop() || fileName
  const m = base.match(/(\d{4})[_\-.](\d{2})[_\-.](\d{2})/)
  if (m) {
    const [, y, mo, d] = m
    return `${y}-${mo}-${d}`
  }
  return undefined
}

/**
 * Seleciona a melhor aba do workbook conforme o tipo ou formato detectado.
 * Prioridades:
 * 1. "Pesquisa Validade"
 * 2. Qualquer aba contendo "validade"
 * 3. Qualquer aba contendo "ruptura"
 * 4. Primeira aba do arquivo
 */
export function selectBestSheet(workbook: XLSX.WorkBook): {
  sheetName: string
  isRuptura: boolean
} {
  const names = workbook.SheetNames.map((n) => ({ raw: n, norm: normalizeSheetName(n) }))

  // 1. aba "Pesquisa Validade" exata
  const exactValidade = names.find((n) => n.norm === 'pesquisa validade')
  if (exactValidade) return { sheetName: exactValidade.raw, isRuptura: false }

  // 2. qualquer aba com "validade"
  const anyValidade = names.find((n) => VALIDADE_SHEET_HINTS.some((h) => n.norm.includes(h)))
  if (anyValidade) return { sheetName: anyValidade.raw, isRuptura: false }

  // 3. qualquer aba com "ruptura"
  const anyRuptura = names.find((n) => RUPTURA_SHEET_HINTS.some((h) => n.norm.includes(h)))
  if (anyRuptura) return { sheetName: anyRuptura.raw, isRuptura: true }

  // 4. fallback: primeira aba
  const first = names[0]
  return { sheetName: first?.raw ?? '', isRuptura: false }
}

/** Colunas que devem ser tratadas como texto (identificadores). */
const TEXT_ID_HEADERS = [
  'cod. colaborador',
  'codigo colaborador',
  'cod colaborador',
  'cod.colaborador',
  'cod. supervisor',
  'codigo supervisor',
  'cod supervisor',
  'cod.supervisor',
  'cpf/cnpj',
  'cpf cnpj',
  'cpfcnpj',
  'cpf / cnpj',
  'cod. cliente',
  'codigo cliente',
  'cod cliente',
  'cod.cliente',
  'cod. produto',
  'codigo produto',
  'cod produto',
  'cod.produto',
  'cod. barras',
  'codigo barras',
  'cod barras',
  'cod.barras',
  'ean',
  'gtin',
  'cnpj',
]

/** Normaliza um cabeçalho para verificar se é identificador textual. */
function normalizeHeaderKey(h: string): string {
  return h
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

/**
 * Garante que colunas identificadoras sejam lidas como texto, preservando
 * zeros à esquerda. Reinterpreta células numéricas como string.
 */
function coerceTextIds(
  rows: Record<string, unknown>[],
  headers: string[],
): Record<string, unknown>[] {
  const idCols = headers.filter((h) => TEXT_ID_HEADERS.includes(normalizeHeaderKey(h)))
  if (idCols.length === 0) return rows

  return rows.map((row) => {
    const out: Record<string, unknown> = { ...row }
    for (const col of idCols) {
      const v = row[col]
      if (v == null || v === '') continue
      if (typeof v === 'number') {
        // número -> string sem notação científica, preservando dígitos
        out[col] = Number.isInteger(v) ? String(v) : v.toString()
      } else if (v instanceof Date) {
        out[col] = v.toISOString().slice(0, 10)
      } else {
        out[col] = String(v).trim()
      }
    }
    return out
  })
}

/**
 * Extrai dados de uma worksheet SheetJS de maneira esparsa, sem iterar
 * pela dimensão declarada (!ref / max_row), operando apenas sobre chaves reais de células.
 */
export function parseWorksheetSparse(worksheet: XLSX.WorkSheet): {
  headers: string[]
  rows: Record<string, unknown>[]
  declaredPhysicalRows: number
  usefulRows: number
  ignoredBlankRows: number
} {
  // 1. Calcula declaredPhysicalRows a partir de worksheet['!ref']
  let declaredPhysicalRows = 0
  const ref = worksheet['!ref']
  if (ref) {
    const range = XLSX.utils.decode_range(ref)
    declaredPhysicalRows = Math.max(0, range.e.r - range.s.r + 1)
  }

  // 2. Agrupa células reais por linha (0-indexed)
  // Ignora chaves internas que começam com "!"
  const rowsMap = new Map<number, Map<number, unknown>>()
  for (const cellKey of Object.keys(worksheet)) {
    if (cellKey.startsWith('!')) continue
    const cell = worksheet[cellKey]
    if (!cell) continue

    // Extrai valor da célula (preferindo v ou w ou Date)
    let val: unknown = cell.v
    if (val === undefined || val === null) {
      val = cell.w
    }
    if (val === undefined || val === null) continue
    if (typeof val === 'string' && val.trim() === '') continue

    const coord = XLSX.utils.decode_cell(cellKey)
    let rowCells = rowsMap.get(coord.r)
    if (!rowCells) {
      rowCells = new Map<number, unknown>()
      rowsMap.set(coord.r, rowCells)
    }
    rowCells.set(coord.c, val)
  }

  if (rowsMap.size === 0) {
    throw new Error('A planilha está vazia.')
  }

  // 3. Ordena os números de linha preenchidos
  const sortedRowIndices = Array.from(rowsMap.keys()).sort((a, b) => a - b)
  if (sortedRowIndices.length === 0) {
    throw new Error('A planilha está vazia.')
  }

  // 4. Primeira linha preenchida como cabeçalho
  const headerRowIndex = sortedRowIndices[0]
  const headerCells = rowsMap.get(headerRowIndex)!

  const maxColIndex = Math.max(...Array.from(headerCells.keys()))
  const headerColMap = new Map<number, string>()
  const headers: string[] = []

  for (let c = 0; c <= maxColIndex; c++) {
    const rawVal = headerCells.get(c)
    if (rawVal != null) {
      const hStr = String(rawVal).trim()
      if (hStr) {
        headerColMap.set(c, hStr)
        headers.push(hStr)
      }
    }
  }

  if (headers.length === 0) {
    throw new Error('A planilha está vazia ou sem cabeçalhos válidos.')
  }

  // 5. Linhas de dados (linhas posteriores preenchidas)
  const rawRows: Record<string, unknown>[] = []
  for (let i = 1; i < sortedRowIndices.length; i++) {
    const rIdx = sortedRowIndices[i]
    const rowCells = rowsMap.get(rIdx)!
    const rowObj: Record<string, unknown> = {}
    let hasAnyData = false

    for (const [cIdx, headerName] of headerColMap.entries()) {
      const cellVal = rowCells.get(cIdx)
      if (cellVal !== undefined && cellVal !== null && cellVal !== '') {
        rowObj[headerName] = cellVal
        hasAnyData = true
      } else {
        rowObj[headerName] = ''
      }
    }

    if (hasAnyData) {
      rawRows.push(rowObj)
    }
  }

  const rows = coerceTextIds(rawRows, headers)
  const usefulRows = rows.length
  // Linhas físicas declaradas menos (cabeçalho + linhas úteis)
  const totalOccupied = usefulRows > 0 ? usefulRows + 1 : 0
  const ignoredBlankRows = Math.max(0, declaredPhysicalRows - totalOccupied)

  return {
    headers,
    rows,
    declaredPhysicalRows,
    usefulRows,
    ignoredBlankRows,
  }
}

export async function parseExcelFile(
  fileOrBuffer: File | ArrayBuffer,
  fileName?: string,
): Promise<ParsedSheet & { isRupturaSheet?: boolean }> {
  const isFile = fileOrBuffer instanceof File
  const name = fileName || (isFile ? fileOrBuffer.name : '')
  const buffer = isFile ? await fileOrBuffer.arrayBuffer() : fileOrBuffer
  // cellDates: true para interpretar datas reais como objetos Date, cellStyles: false conforme especificação
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true, cellStyles: false })

  const { sheetName, isRuptura } = selectBestSheet(workbook)
  if (!sheetName) {
    throw new Error('Nenhuma planilha encontrada no arquivo.')
  }

  const worksheet = workbook.Sheets[sheetName]
  const parsedSparse = parseWorksheetSparse(worksheet)
  const dataArquivo = extractDataArquivo(name)

  return {
    ...parsedSparse,
    sheetName,
    dataArquivo,
    isRupturaSheet: isRuptura,
  }
}
