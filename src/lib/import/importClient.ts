/**
 * Cliente de importação — orquestra o envio dos registros validados para o
 * backend (pb_hook /api/backend/v1/import-validades) e persistência em
 * `validades_imported` + `import_history`.
 *
 * Mantido separado da UI para que a origem dos dados possa ser trocada
 * (Excel -> API TradePro) sem alterar o pipeline de persistência.
 */
import pb from '@/lib/pocketbase/client'
import type { ValidadeItem } from '@/types'
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

export type { DatasetValidationReport }
