/**
 * Utilitário de leitura de planilhas Excel usando SheetJS (xlsx).
 *
 * Converte um File .xlsx/.xls em:
 *  - headers: string[] (cabeçalhos detectados)
 *  - rows: Record<string, unknown>[] (linhas como objetos chave/valor)
 *
 * Mantido isolado da UI e do mapper para que a origem possa ser trocada
 * (Excel -> API TradePro) sem alterar o resto do pipeline.
 */
import * as XLSX from 'xlsx'

export interface ParsedSheet {
  headers: string[]
  rows: Record<string, unknown>[]
  sheetName: string
}

export async function parseExcelFile(file: File): Promise<ParsedSheet> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })

  const sheetName = workbook.SheetNames[0]
  if (!sheetName) {
    throw new Error('Nenhuma planilha encontrada no arquivo.')
  }

  const worksheet = workbook.Sheets[sheetName]

  // json com header:1 para extrair cabeçalho da primeira linha
  const aoa: unknown[][] = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    raw: true,
    defval: '',
    blankrows: false,
  })

  if (aoa.length === 0) {
    throw new Error('A planilha está vazia.')
  }

  const headerRow = (aoa[0] as unknown[]).map((h) => String(h ?? '').trim())
  const headers = headerRow.filter((h) => h.length > 0)

  // json com header padrão (usa a primeira linha como chaves)
  const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    raw: true,
    defval: '',
    blankrows: false,
  })

  return {
    headers,
    rows: jsonRows,
    sheetName,
  }
}
