import { useState, useEffect, useCallback, useRef } from 'react'
import { DataSourceFactory } from '@/lib/data'
import type { AlertaItem, AlertasFilter } from '@/types'

export interface UseAlertasResult {
  data: AlertaItem[]
  isLoading: boolean
  error: Error | null
  refetch: () => Promise<void>
  toggleRead: (id: string) => void
  markAllAsRead: () => void
}

export function useAlertas(filters?: AlertasFilter): UseAlertasResult {
  const [data, setData] = useState<AlertaItem[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<Error | null>(null)
  const isMounted = useRef(true)

  const filterKey = JSON.stringify(filters || {})

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const provider = DataSourceFactory.getProvider()
      const result = await provider.listAlertas(filters)
      if (isMounted.current) {
        setData(result)
      }
    } catch (err) {
      if (isMounted.current) {
        setError(err instanceof Error ? err : new Error('Erro ao carregar alertas'))
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

  const toggleRead = useCallback((id: string) => {
    setData((prev) =>
      prev.map((item) => (item.id === id ? { ...item, isRead: !item.isRead } : item)),
    )
  }, [])

  const markAllAsRead = useCallback(() => {
    setData((prev) => prev.map((item) => ({ ...item, isRead: true })))
  }, [])

  return { data, isLoading, error, refetch: fetchData, toggleRead, markAllAsRead }
}
