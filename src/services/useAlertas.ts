import { useState, useEffect, useCallback, useRef } from 'react'
import {
  getBaseAtualSnapshot,
  type BaseAtualSnapshot,
  type AlertaOperacionalItem,
} from '@/lib/selectors'
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
      const snapshot: BaseAtualSnapshot = await getBaseAtualSnapshot()
      const rawAlertas = snapshot.alertasOperacionais

      // Converte para AlertaItem compatível com a UI
      let items: AlertaItem[] = rawAlertas.map((a: AlertaOperacionalItem) => {
        const severityLabel =
          a.severidade === 'Crítico' ? 'Crítico' : a.severidade === 'Atenção' ? 'Alto' : 'Médio'
        const desc = `${a.produto} possui ${a.quantidade} un vencendo em ${a.diasRestantes} dias (${a.validadeFormatada}) na loja ${a.lojaIdentidade}.`
        return {
          id: a.id,
          title: `Validade: ${a.lojaIdentidade}`,
          message: desc,
          severity: severityLabel,
          type: 'Validade',
          timestamp: a.validadeRaw ? `${a.validadeRaw}T00:00:00Z` : new Date().toISOString(),
          isRead: a.lido,
          product: a.produto,
          sku: a.codigoProduto || undefined,
          category: undefined,
        }
      })

      if (filters?.search) {
        const q = filters.search.trim().toLowerCase()
        items = items.filter(
          (i) =>
            i.title.toLowerCase().includes(q) ||
            i.message.toLowerCase().includes(q) ||
            (i.product && i.product.toLowerCase().includes(q)) ||
            (i.sku && i.sku.toLowerCase().includes(q)),
        )
      }

      if (filters?.severity && filters.severity !== 'Todos') {
        items = items.filter((i) => i.severity === filters.severity)
      }

      if (filters?.type && filters.type !== 'Todos') {
        items = items.filter((i) => i.type === filters.type)
      }

      if (isMounted.current) {
        setData(items)
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
    setData((prev) => {
      const updated = prev.map((item) =>
        item.id === id ? { ...item, isRead: !item.isRead } : item,
      )
      try {
        const readIds = updated.filter((i) => i.isRead).map((i) => i.id)
        localStorage.setItem('diretoria_read_alerts', JSON.stringify(readIds))
      } catch {
        // ignore
      }
      return updated
    })
  }, [])

  const markAllAsRead = useCallback(() => {
    setData((prev) => {
      const updated = prev.map((item) => ({ ...item, isRead: true }))
      try {
        const readIds = updated.map((i) => i.id)
        localStorage.setItem('diretoria_read_alerts', JSON.stringify(readIds))
      } catch {
        // ignore
      }
      return updated
    })
  }, [])

  return { data, isLoading, error, refetch: fetchData, toggleRead, markAllAsRead }
}
