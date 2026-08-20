import { useState, useEffect, useCallback, useRef } from 'react'
import type { Ruptura, RupturasFilters, RupturasKpis } from '@/types'
import { DataSourceFactory } from '@/lib/data'

export interface UseRupturasResult {
  data: Ruptura[]
  kpis: RupturasKpis | null
  isLoading: boolean
  error: Error | null
  refetch: () => Promise<void>
}

export function useRupturas(filters?: RupturasFilters): UseRupturasResult {
  const [data, setData] = useState<Ruptura[]>([])
  const [kpis, setKpis] = useState<RupturasKpis | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<Error | null>(null)
  const isMounted = useRef(true)

  const filterKey = JSON.stringify(filters || {})

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const provider = DataSourceFactory.getProvider()
      const [fetchedItems, fetchedKpis] = await Promise.all([
        provider.listRupturasDomain ? provider.listRupturasDomain(filters) : [],
        provider.getRupturasKpis(),
      ])

      if (isMounted.current) {
        setData(fetchedItems)
        setKpis(fetchedKpis)
      }
    } catch (err) {
      if (isMounted.current) {
        setError(err instanceof Error ? err : new Error('Falha ao carregar rupturas'))
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

  // Ouvir evento global de atualização (pós importação)
  useEffect(() => {
    const handleRefresh = () => {
      fetchData()
    }
    window.addEventListener('diretoria:refresh', handleRefresh)
    return () => {
      window.removeEventListener('diretoria:refresh', handleRefresh)
    }
  }, [fetchData])

  return {
    data,
    kpis,
    isLoading,
    error,
    refetch: fetchData,
  }
}
