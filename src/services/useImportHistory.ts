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
  tipo?: 'validades' | 'rupturas'
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
      const [validadesHistory, rupturasHistory] = await Promise.allSettled([
        pb.collection('import_history').getFullList({ sort: '-created' }),
        pb.collection('rupturas_imports').getFullList({ sort: '-created' }),
      ])

      const valItems: ImportHistoryItem[] =
        validadesHistory.status === 'fulfilled'
          ? validadesHistory.value.map((r) => {
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
                tipo: 'validades' as const,
                created_by:
                  typeof createdBy === 'string'
                    ? createdBy
                    : (createdBy as { id?: string })?.id || '',
                created: (rec.created as string) || '',
              }
            })
          : []

      const rupItems: ImportHistoryItem[] =
        rupturasHistory.status === 'fulfilled'
          ? rupturasHistory.value.map((r) => {
              const rec = r as unknown as Record<string, unknown>
              const statusRaw = (rec.status as string) || 'Concluída'
              let st: ImportHistoryItem['status'] = 'completed'
              if (statusRaw.includes('Falhou')) st = 'failed'
              else if (statusRaw.includes('Processando') || statusRaw.includes('Validando'))
                st = 'processing'
              else if (statusRaw.includes('Cancelada') || statusRaw.includes('Recebida'))
                st = 'pending'

              return {
                id: rec.id as string,
                file_name: (rec.file_name as string) || '',
                file_size: 0,
                total_rows: (rec.total_rows_read as number) || 0,
                imported_rows: (rec.total_occurrences_generated as number) || 0,
                skipped_rows:
                  ((rec.total_rows_read as number) || 0) -
                  ((rec.total_occurrences_generated as number) || 0),
                error_rows: (rec.total_rows_invalid as number) || 0,
                status: st,
                source: 'Rupturas TradePro',
                tipo: 'rupturas' as const,
                created_by: '',
                created: (rec.created as string) || (rec.created_at as string) || '',
              }
            })
          : []

      const all = [...valItems, ...rupItems].sort((a, b) => {
        const da = a.created || ''
        const db = b.created || ''
        return da < db ? 1 : da > db ? -1 : 0
      })

      setHistory(all)
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
