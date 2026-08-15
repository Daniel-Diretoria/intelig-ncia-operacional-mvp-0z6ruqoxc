import { useState, useEffect, useCallback, useRef } from 'react'
import { DataSourceFactory } from '@/lib/data'
import type { ReportData, ReportType } from '@/types'

export interface UseReportResult {
  data: ReportData | null
  isLoading: boolean
  error: Error | null
  refetch: () => Promise<void>
}

export function useReport(reportType: ReportType): UseReportResult {
  const [data, setData] = useState<ReportData | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<Error | null>(null)
  const isMounted = useRef(true)

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const provider = DataSourceFactory.getProvider()
      const result = await provider.getReportData(reportType)
      if (isMounted.current) {
        setData(result)
      }
    } catch (err) {
      if (isMounted.current) {
        setError(err instanceof Error ? err : new Error('Erro ao gerar relatório'))
      }
    } finally {
      if (isMounted.current) {
        setIsLoading(false)
      }
    }
  }, [reportType])

  useEffect(() => {
    isMounted.current = true
    fetchData()
    return () => {
      isMounted.current = false
    }
  }, [fetchData])

  return { data, isLoading, error, refetch: fetchData }
}
