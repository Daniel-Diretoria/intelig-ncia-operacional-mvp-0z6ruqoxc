import type { ValidadeItem } from '@/types'
import { classificarCriticidade } from '@/lib/data/criticidade'

/**
 * Exportação da visão filtrada atual de validades.
 *
 * - CSV: implementação nativa, sem dependências extras (com BOM UTF-8).
 * - XLSX: escrita real de um arquivo .xlsx (OOXML) usando um ZIP minimal
 *   implementado à mão (método STORE), sem adicionar dependências ao projeto.
 */

export interface ExportColumn {
  key: keyof ValidadeItem | 'criticidade' | 'exposicaoFinanceira'
  label: string
}

export const EXPORT_COLUMNS: ExportColumn[] = [
  { key: 'cliente', label: 'Cliente' },
  { key: 'industria', label: 'Indústria' },
  { key: 'loja', label: 'Loja' },
  { key: 'product', label: 'Produto' },
  { key: 'sku', label: 'SKU' },
  { key: 'lote', label: 'Lote' },
  { key: 'category', label: 'Categoria' },
  { key: 'quantidade', label: 'Quantidade' },
  { key: 'unidade', label: 'Unidade' },
  { key: 'validade', label: 'Data de Validade' },
  { key: 'diasRestantes', label: 'Dias Restantes' },
  { key: 'criticidade', label: 'Criticidade' },
  { key: 'precoUnitario', label: 'Preço Unitário (R$)' },
  { key: 'exposicaoFinanceira', label: 'Exposição Financeira (R$)' },
  { key: 'promotor', label: 'Promotor' },
  { key: 'supervisor', label: 'Supervisor' },
  { key: 'ultimaAtualizacao', label: 'Última Atualização' },
]

function cellValue(item: ValidadeItem, key: ExportColumn['key']): string {
  switch (key) {
    case 'criticidade':
      return classificarCriticidade(item.diasRestantes)
    case 'exposicaoFinanceira': {
      const q = item.quantidade ?? item.estoque
      const v = q * (item.precoUnitario ?? 0)
      return v.toFixed(2)
    }
    case 'validade':
      return new Date(item.validade + 'T00:00:00').toLocaleDateString('pt-BR')
    case 'ultimaAtualizacao':
      return item.ultimaAtualizacao ? new Date(item.ultimaAtualizacao).toLocaleString('pt-BR') : ''
    case 'precoUnitario':
      return (item.precoUnitario ?? 0).toFixed(2)
    case 'quantidade':
      return String(item.quantidade ?? item.estoque)
    case 'diasRestantes':
    case 'estoque':
      return String(item[key] ?? '')
    default:
      return String((item as unknown as Record<string, unknown>)[key as string] ?? '')
  }
}

function isNumericColumn(key: ExportColumn['key']): boolean {
  return key === 'quantidade' || key === 'diasRestantes' || key === 'estoque'
}

function isMoneyColumn(key: ExportColumn['key']): boolean {
  return key === 'precoUnitario' || key === 'exposicaoFinanceira'
}

function triggerDownload(content: BlobPart, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/* -------------------------------- CSV -------------------------------- */

export function exportarCSV(items: ValidadeItem[], filename = 'validades.csv') {
  const sep = ';'
  const linhas: string[] = []
  linhas.push(EXPORT_COLUMNS.map((c) => escapeCsv(c.label, sep)).join(sep))
  for (const it of items) {
    linhas.push(EXPORT_COLUMNS.map((c) => escapeCsv(cellValue(it, c.key), sep)).join(sep))
  }
  // BOM para Excel reconhecer UTF-8
  triggerDownload('\ufeff' + linhas.join('\r\n'), filename, 'text/csv;charset=utf-8;')
}

function escapeCsv(value: string, sep: string): string {
  if (value.includes(sep) || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

/* -------------------------------- XLSX ------------------------------- */

/** Escapa texto para XML. */
function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function colLetter(index: number): string {
  // 1-based -> A, B, ... Z, AA, AB...
  let s = ''
  let n = index
  while (n > 0) {
    const rem = (n - 1) % 26
    s = String.fromCharCode(65 + rem) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

function buildSheetXml(items: ValidadeItem[]): string {
  const rows: string[] = []

  // Header row
  const headCells = EXPORT_COLUMNS.map(
    (c, i) =>
      `<c r="${colLetter(i + 1)}1" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(
        c.label,
      )}</t></is></c>`,
  ).join('')
  rows.push(`<row r="1">${headCells}</row>`)

  items.forEach((it, rIdx) => {
    const r = rIdx + 2
    const cells = EXPORT_COLUMNS.map((c, i) => {
      const ref = `${colLetter(i + 1)}${r}`
      if (isNumericColumn(c.key)) {
        const raw = cellValue(it, c.key)
        if (raw === '') return `<c r="${ref}"/>`
        return `<c r="${ref}"><v>${xmlEscape(raw)}</v></c>`
      }
      if (isMoneyColumn(c.key)) {
        const raw = cellValue(it, c.key)
        if (raw === '') return `<c r="${ref}"/>`
        // número com 2 casas; estilo de moeda seria ideal, mas mantemos número simples
        return `<c r="${ref}"><v>${xmlEscape(raw)}</v></c>`
      }
      const raw = cellValue(it, c.key)
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(
        raw,
      )}</t></is></c>`
    }).join('')
    rows.push(`<row r="${r}">${cells}</row>`)
  })

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetData>
${rows.join('\n')}
</sheetData>
</worksheet>`
}

/* --- minimal ZIP writer (STORE, no compression) --- */

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i]
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

interface ZipEntry {
  name: string
  data: Uint8Array
}

function strToBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}

function u16(n: number): number[] {
  return [n & 0xff, (n >>> 8) & 0xff]
}
function u32(n: number): number[] {
  return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]
}

function buildZip(entries: ZipEntry[]): Uint8Array {
  const chunks: number[] = []
  const central: number[] = []
  let offset = 0

  for (const entry of entries) {
    const nameBytes = strToBytes(entry.name)
    const crc = crc32(entry.data)
    const size = entry.data.length

    // Local file header
    chunks.push(...u32(0x04034b50)) // signature
    chunks.push(...u16(20)) // version needed
    chunks.push(...u16(0)) // flags
    chunks.push(...u16(0)) // compression: store
    chunks.push(...u16(0)) // mod time
    chunks.push(...u16(0)) // mod date
    chunks.push(...u32(crc))
    chunks.push(...u32(size)) // compressed size
    chunks.push(...u32(size)) // uncompressed size
    chunks.push(...u16(nameBytes.length))
    chunks.push(...u16(0)) // extra length
    chunks.push(...nameBytes)
    // Data
    for (let i = 0; i < entry.data.length; i++) chunks.push(entry.data[i])

    // Central directory record
    central.push(...u32(0x02014b50))
    central.push(...u16(20)) // version made by
    central.push(...u16(20)) // version needed
    central.push(...u16(0)) // flags
    central.push(...u16(0)) // compression
    central.push(...u16(0)) // mod time
    central.push(...u16(0)) // mod date
    central.push(...u32(crc))
    central.push(...u32(size))
    central.push(...u32(size))
    central.push(...u16(nameBytes.length))
    central.push(...u16(0)) // extra
    central.push(...u16(0)) // comment
    central.push(...u16(0)) // disk number
    central.push(...u16(0)) // internal attrs
    central.push(...u32(0)) // external attrs
    central.push(...u32(offset))
    central.push(...nameBytes)

    offset += 30 + nameBytes.length + size
  }

  const centralOffset = offset
  const centralSize = central.length

  // EOCD
  const eocd: number[] = []
  eocd.push(...u32(0x06054b50))
  eocd.push(...u16(0)) // disk
  eocd.push(...u16(0)) // disk with cd
  eocd.push(...u16(entries.length))
  eocd.push(...u16(entries.length))
  eocd.push(...u32(centralSize))
  eocd.push(...u32(centralOffset))
  eocd.push(...u16(0)) // comment length

  return new Uint8Array([...chunks, ...central, ...eocd])
}

export function exportarXLSX(items: ValidadeItem[], filename = 'validades.xlsx') {
  const sheetXml = buildSheetXml(items)

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>
<sheet name="Validades" sheetId="1" r:id="rId1"/>
</sheets>
</workbook>`

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`

  const entries: ZipEntry[] = [
    { name: '[Content_Types].xml', data: strToBytes(contentTypes) },
    { name: '_rels/.rels', data: strToBytes(rootRels) },
    { name: 'xl/workbook.xml', data: strToBytes(workbookXml) },
    { name: 'xl/_rels/workbook.xml.rels', data: strToBytes(workbookRels) },
    { name: 'xl/worksheets/sheet1.xml', data: strToBytes(sheetXml) },
  ]

  const zipBytes = buildZip(entries)
  triggerDownload(
    zipBytes as unknown as BlobPart,
    filename,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
}
