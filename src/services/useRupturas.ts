import { useState, useEffect, useCallback, useRef } from 'react'
import { getBaseAtualSnapshot, type BaseAtualSnapshot } from '@/lib/selectors'
import type { Ruptura, RupturasFilters, RupturasKpis } from '@/types'
import { computeRupturasKpis } from '@/lib/pipeline/rupturasPipeline'

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
      const snapshot: BaseAtualSnapshot = await getBaseAtualSnapshot()
      let items = [...snapshot.rupturasAtivas]

      // Aplica filtros
      if (filters?.search) {
        const q = filters.search.trim().toLowerCase()
        items = items.filter(
          (i) =>
            i.produto.toLowerCase().includes(q) ||
            i.nome_loja.toLowerCase().includes(q) ||
            (i.codigo_loja && i.codigo_loja.toLowerCase().includes(q)) ||
            (i.colaborador && i.colaborador.toLowerCase().includes(q)) ||
            (i.cliente && i.cliente.toLowerCase().includes(q)),
        )
      }

      if (filters?.loja && filters.loja !== 'all') {
        items = items.filter((i) => i.codigo_loja === filters.loja || i.nome_loja === filters.loja)
      }

      if (filters?.motivo && filters.motivo !== 'all') {
        items = items.filter((i) => i.motivo === filters.motivo)
      }

      if (filters?.cliente && filters.cliente !== 'all') {
        items = items.filter((i) => i.cliente === filters.cliente)
      }

      if (
        filters?.situacao &&
        filters.situacao !== ('all' as unknown as RupturasFilters['situacao'])
      ) {
        items = items.filter((i) => i.situacao_atual === filters.situacao)
      }

      if (filters?.dataInicio) {
        const inicio = new Date(filters.dataInicio + 'T00:00:00').getTime()
        items = items.filter((i) => {
          if (!i.data_visita) return true
          const t = new Date(
            i.data_visita.includes('T') ? i.data_visita : i.data_visita + 'T00:00:00',
          ).getTime()
          return t >= inicio
        })
      }

      if (filters?.dataFim) {
        const fim = new Date(filters.dataFim + 'T23:59:59').getTime()
        items = items.filter((i) => {
          if (!i.data_visita) return true
          const t = new Date(
            i.data_visita.includes('T') ? i.data_visita : i.data_visita + 'T00:00:00',
          ).getTime()
          return t <= fim
        })
      }

      const calculatedKpis = computeRupturasKpis(snapshot.rupturasAtivas)

      if (isMounted.current) {
        setData(items)
        setKpis(calculatedKpis)
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

  return {
    data,
    kpis,
    isLoading,
    error,
    refetch: fetchData,
  }
}
