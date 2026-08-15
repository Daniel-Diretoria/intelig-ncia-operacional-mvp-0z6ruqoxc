import { useState, useEffect, useCallback, useRef } from 'react'
import { DataSourceFactory } from '@/lib/data'
import type { RupturaItem, RupturasFilter } from '@/types'

export interface UseRupturasResult {
  data: RupturaItem[]
  isLoading: boolean
  error: Error | null
  refetch: () => Promise<void>
}

export function useRupturas(filters?: RupturasFilter): UseRupturasResult {
  const [data, setData] = useState<RupturaItem[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<Error | null>(null)
  const isMounted = useRef(true)

  const filterKey = JSON.stringify(filters || {})

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const provider = DataSourceFactory.getProvider()
      const result = await provider.listRupturas(filters)
      if (isMounted.current) {
        setData(result)
      }
    } catch (err) {
      if (isMounted.current) {
        setError(err instanceof Error ? err : new Error('Erro ao carregar rupturas'))
      }
    } finally {
      if (isMounted.current) {
        setIsLoading(false)
      }
    }
  }, [filterKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    isMounted.current = true
    fetchData()
    return () => {
      isMounted.current = false
    }
  }, [fetchData])

  return { data, isLoading, error, refetch: fetchData }
}
