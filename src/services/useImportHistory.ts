import { useCallback, useEffect, useState } from 'react'
import pb from '@/lib/pocketbase/client'

/**
 * Hook de histórico de importações — lê a collection `import_history`
 * do PocketBase e expõe a lista para a tela de Importação.
 */

export interface ImportHistoryItem {
  id: string
  file_name: string
  file_size: number
  total_rows: number
  imported_rows: number
  skipped_rows: number
  error_rows: number
  status: 'pending' | 'processing' | 'completed' | 'failed'
  source: string
  created_by: string
  created: string
}

export interface UseImportHistoryResult {
  history: ImportHistoryItem[]
  isLoading: boolean
  error: Error | null
  refetch: () => Promise<void>
}

export function useImportHistory(): UseImportHistoryResult {
  const [history, setHistory] = useState<ImportHistoryItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const records = await pb.collection('import_history').getFullList({
        sort: '-created',
      })
      const items: ImportHistoryItem[] = records.map((r) => {
        const rec = r as unknown as Record<string, unknown>
        const createdBy = rec.created_by
        return {
          id: rec.id as string,
          file_name: (rec.file_name as string) || '',
          file_size: (rec.file_size as number) || 0,
          total_rows: (rec.total_rows as number) || 0,
          imported_rows: (rec.imported_rows as number) || 0,
          skipped_rows: (rec.skipped_rows as number) || 0,
          error_rows: (rec.error_rows as number) || 0,
          status: (rec.status as ImportHistoryItem['status']) || 'pending',
          source: (rec.source as string) || '',
          created_by:
            typeof createdBy === 'string' ? createdBy : (createdBy as { id?: string })?.id || '',
          created: (rec.created as string) || '',
        }
      })
      setHistory(items)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Erro ao carregar histórico'))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return { history, isLoading, error, refetch: fetchData }
}
