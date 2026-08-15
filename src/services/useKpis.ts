import { useState, useEffect, useCallback, useRef } from 'react'
import { DataSourceFactory } from '@/lib/data'
import type { KpiSummary, ChartCategoryData, ChartRupturaPeriodData } from '@/types'

export interface UseKpisResult {
  data: {
    summary: KpiSummary
    categoryDistribution: ChartCategoryData[]
    rupturasOverTime: ChartRupturaPeriodData[]
  } | null
  isLoading: boolean
  error: Error | null
  refetch: () => Promise<void>
}

export function useKpis(): UseKpisResult {
  const [data, setData] = useState<UseKpisResult['data']>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<Error | null>(null)
  const isMounted = useRef(true)

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const provider = DataSourceFactory.getProvider()
      const result = await provider.getKpis()
      if (isMounted.current) {
        setData(result)
      }
    } catch (err) {
      if (isMounted.current) {
        setError(err instanceof Error ? err : new Error('Erro ao carregar indicadores'))
      }
    } finally {
      if (isMounted.current) {
        setIsLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    isMounted.current = true
    fetchData()
    return () => {
      isMounted.current = false
    }
  }, [fetchData])

  return { data, isLoading, error, refetch: fetchData }
}
