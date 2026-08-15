/**
 * Cliente de importação — orquestra o envio dos registros validados para o
 * backend (pb_hook /api/backend/v1/import-validades) e persistência em
 * `validades_imported` + `import_history`.
 *
 * Mantido separado da UI para que a origem dos dados possa ser trocada
 * (Excel -> API TradePro) sem alterar o pipeline de persistência.
 */
import pb from '@/lib/pocketbase/client'
import type { ValidadeItem, ProcessedValidade, TradeProRawRecord } from '@/types'
import type { DatasetValidationReport } from './validators'

export interface ImportPayload {
  fileName: string
  fileSize: number
  records: ValidadeItem[]
  summary: {
    totalRows: number
    validRows: number
    invalidRows: number
    warningRows: number
    errors: unknown[]
  }
}

export interface ImportResult {
  success: boolean
  importId: string
  importedRows: number
  skippedRows: number
  errorRows: number
  error?: string
}

export async function submitImport(payload: ImportPayload): Promise<ImportResult> {
  try {
    const res = await pb.send('/api/backend/v1/import-validades', {
      method: 'POST',
      body: payload,
    })
    return res as ImportResult
  } catch (err) {
    const e = err as { message?: string; response?: { message?: string } }
    return {
      success: false,
      importId: '',
      importedRows: 0,
      skippedRows: 0,
      errorRows: 0,
      error: e?.response?.message || e?.message || 'Falha ao enviar importação.',
    }
  }
}

// =============================================================================
// TradePro — processamento completo (pipeline + persistência)
// =============================================================================

export interface ProcessValidadesPayload {
  fileName: string
  fileSize?: number
  fileHash: string
  arquivoTipo?: string
  dataArquivo?: string
  force?: boolean
  rawRecords: Partial<TradeProRawRecord>[]
  baseAtual: Partial<ProcessedValidade>[]
  summary: {
    totalBrutos: number
    filtrados90Dias: number
    consolidados: number
    baseAtual: number
    maiorDataArquivo?: string
  }
}

export interface ProcessValidadesResult {
  success: boolean
  importId: string
  importedRows: number
  rawRows: number
  skippedRows: number
  errorRows: number
  summary?: {
    totalBrutos: number
    filtrados90Dias: number
    consolidados: number
    baseAtual: number
    maiorDataArquivo?: string
  }
  duplicate?: boolean
  message?: string
  previousImportId?: string
  previousDate?: string
  error?: string
}

/**
 * Envia os dados brutos + Base Atual processada para o endpoint
 * `/api/backend/v1/process-validades`, que persiste em `validades_raw`,
 * `validades_base` e `import_history`.
 *
 * Implementa proteção contra reenvio: se o hash já foi concluído, retorna
 * `duplicate: true` e exige `force: true` para reprocessar.
 */
export async function submitProcessValidades(
  payload: ProcessValidadesPayload,
): Promise<ProcessValidadesResult> {
  try {
    const res = await pb.send('/api/backend/v1/process-validades', {
      method: 'POST',
      body: payload,
    })
    return res as ProcessValidadesResult
  } catch (err) {
    const e = err as { message?: string; response?: { message?: string } }
    return {
      success: false,
      importId: '',
      importedRows: 0,
      rawRows: 0,
      skippedRows: 0,
      errorRows: 0,
      error: e?.response?.message || e?.message || 'Falha ao processar validades.',
    }
  }
}

/**
 * Verifica se um hash de arquivo já foi importado (proteção contra reenvio).
 */
export async function checkFileHash(fileHash: string): Promise<{
  duplicate: boolean
  importId?: string
  created?: string
}> {
  if (!fileHash) return { duplicate: false }
  try {
    const records = await pb.collection('import_history').getList(1, 1, {
      filter: `file_hash = "${fileHash}" && status = "completed"`,
      sort: '-created',
    })
    if (records.items.length > 0) {
      const r = records.items[0] as unknown as Record<string, unknown>
      return {
        duplicate: true,
        importId: r.id as string,
        created: r.created as string,
      }
    }
    return { duplicate: false }
  } catch {
    return { duplicate: false }
  }
}

export type { DatasetValidationReport }
