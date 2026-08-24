/**
 * Utilitário de Exportação de Relatório de Erros de Importação em XLSX e CSV.
 *
 * Colunas padronizadas:
 * - Linha (Número da linha no arquivo original)
 * - Chave (Chave operacional / dedup ou identificador)
 * - Etapa (raw, base, validacao, lookups)
 * - Motivo (Descrição sanitizada do erro)
 * - Código HTTP (Código de status HTTP caso exista, ex: 429, 400, 500)
 * - Tentativas (Número de tentativas realizadas antes de registrar a falha)
 */
import * as XLSX from 'xlsx'
import type { PersistenceTaskError } from '@/lib/import/persistenceQueue'

export interface ErrorReportRow {
  linha: number | string
  chave: string
  etapa: string
  motivo: string
  codigo_http: string | number
  tentativas: number
}

/**
 * Converte erros de persistência em linhas estruturadas para relatório.
 */
export function formatErrorRows(
  errors: Array<
    | PersistenceTaskError
    | {
        stage?: string
        row?: number
        index?: number
        key?: string
        message?: string
        error?: string
        statusCode?: number
        attempts?: number
      }
  >,
): ErrorReportRow[] {
  return errors.map((err, idx) => {
    const errObj = err as {
      row?: number
      index?: number
      key?: string
      stage?: string
      message?: string
      error?: string
      statusCode?: number
      attempts?: number
    }
    const linha =
      errObj.row !== undefined
        ? errObj.row
        : errObj.index !== undefined
          ? errObj.index + 1
          : idx + 1
    const chave = errObj.key || '—'
    const etapa = errObj.stage || 'geral'
    const motivo =
      ('message' in errObj && errObj.message ? errObj.message : '') ||
      ('error' in errObj && errObj.error ? errObj.error : 'Erro não especificado')
    const codigo_http = errObj.statusCode !== undefined ? errObj.statusCode : '—'
    const tentativas = errObj.attempts !== undefined ? errObj.attempts : 1

    return {
      linha,
      chave,
      etapa,
      motivo,
      codigo_http,
      tentativas,
    }
  })
}

/**
 * Exporta o relatório de erros em formato CSV (UTF-8 com BOM para Excel no Windows).
 */
export function exportErrorsCSV(
  errors: Array<
    | PersistenceTaskError
    | {
        stage?: string
        row?: number
        index?: number
        key?: string
        message?: string
        error?: string
        statusCode?: number
        attempts?: number
      }
  >,
  fileName = 'relatorio_erros_importacao.csv',
): void {
  const rows = formatErrorRows(errors)
  const headers = ['Linha', 'Chave', 'Etapa', 'Motivo', 'Código HTTP', 'Tentativas']

  const csvLines = [
    headers.join(';'),
    ...rows.map((r) =>
      [
        r.linha,
        `"${String(r.chave).replace(/"/g, '""')}"`,
        `"${String(r.etapa).replace(/"/g, '""')}"`,
        `"${String(r.motivo).replace(/"/g, '""')}"`,
        r.codigo_http,
        r.tentativas,
      ].join(';'),
    ),
  ]

  const csvContent = '\uFEFF' + csvLines.join('\r\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName.endsWith('.csv') ? fileName : `${fileName}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * Exporta o relatório de erros em formato XLSX (SheetJS).
 */
export function exportErrorsXLSX(
  errors: Array<
    | PersistenceTaskError
    | {
        stage?: string
        row?: number
        index?: number
        key?: string
        message?: string
        error?: string
        statusCode?: number
        attempts?: number
      }
  >,
  fileName = 'relatorio_erros_importacao.xlsx',
): void {
  const rows = formatErrorRows(errors)
  const data = rows.map((r) => ({
    Linha: r.linha,
    Chave: r.chave,
    Etapa: r.etapa,
    Motivo: r.motivo,
    'Código HTTP': r.codigo_http,
    Tentativas: r.tentativas,
  }))

  const worksheet = XLSX.utils.json_to_sheet(data)
  // Ajuste de largura de colunas
  worksheet['!cols'] = [
    { wch: 10 }, // Linha
    { wch: 35 }, // Chave
    { wch: 15 }, // Etapa
    { wch: 55 }, // Motivo
    { wch: 14 }, // Código HTTP
    { wch: 12 }, // Tentativas
  ]

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Erros de Importação')
  XLSX.writeFile(workbook, fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`)
}
