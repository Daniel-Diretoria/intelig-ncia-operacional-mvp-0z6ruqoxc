import { useState, useEffect, useCallback, useRef } from 'react'
import { getBaseAtualSnapshot, type BaseAtualSnapshot } from '@/lib/selectors'
import type { ValidadeItem, ValidadesFilter } from '@/types'
import { classificarCriticidade } from '@/lib/data/criticidade'

export interface UseValidadesResult {
  data: ValidadeItem[]
  isLoading: boolean
  error: Error | null
  refetch: () => Promise<void>
}

export function useValidades(filters?: ValidadesFilter): UseValidadesResult {
  const [data, setData] = useState<ValidadeItem[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<Error | null>(null)
  const isMounted = useRef(true)

  const filterKey = JSON.stringify(filters || {})

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const snapshot: BaseAtualSnapshot = await getBaseAtualSnapshot()
      let items = [...snapshot.validadesAtivas]

      // Filtros de busca
      if (filters?.search) {
        const q = filters.search.trim().toLowerCase()
        items = items.filter(
          (i) =>
            i.product.toLowerCase().includes(q) ||
            i.sku.toLowerCase().includes(q) ||
            i.lote.toLowerCase().includes(q) ||
            (i.cliente ?? '').toLowerCase().includes(q) ||
            (i.loja ?? '').toLowerCase().includes(q) ||
            (i.codigoLoja ?? '').toLowerCase().includes(q),
        )
      }

      if (filters?.status && filters.status !== 'Todos') {
        items = items.filter((i) => i.status === filters.status)
      }

      if (filters?.cliente && filters.cliente !== 'Todos') {
        items = items.filter((i) => i.cliente === filters.cliente)
      }
      if (filters?.industria && filters.industria !== 'Todos') {
        items = items.filter((i) => i.industria === filters.industria)
      }
      if (filters?.rede && filters.rede !== 'Todos') {
        items = items.filter((i) => i.rede === filters.rede)
      }
      if (filters?.loja && filters.loja !== 'Todos') {
        items = items.filter((i) => i.loja === filters.loja)
      }
      if (filters?.cidade && filters.cidade !== 'Todos') {
        items = items.filter((i) => i.cidade === filters.cidade)
      }
      if (filters?.produto && filters.produto !== 'Todos') {
        items = items.filter((i) => i.product === filters.produto)
      }
      if (filters?.promotor && filters.promotor !== 'Todos') {
        items = items.filter((i) => i.promotor === filters.promotor)
      }
      if (filters?.supervisor && filters.supervisor !== 'Todos') {
        items = items.filter((i) => i.supervisor === filters.supervisor)
      }

      if (filters?.criticidades && filters.criticidades.length > 0) {
        items = items.filter((i) =>
          filters.criticidades!.includes(classificarCriticidade(i.diasRestantes)),
        )
      }

      if (filters?.dataInicio) {
        const inicio = new Date(filters.dataInicio + 'T00:00:00').getTime()
        items = items.filter((i) => new Date(i.validade + 'T00:00:00').getTime() >= inicio)
      }
      if (filters?.dataFim) {
        const fim = new Date(filters.dataFim + 'T23:59:59').getTime()
        items = items.filter((i) => new Date(i.validade + 'T00:00:00').getTime() <= fim)
      }

      // Drill-down hierárquico
      if (filters?.drill) {
        const d = filters.drill
        if (d.cliente) items = items.filter((i) => i.cliente === d.cliente)
        if (d.loja) items = items.filter((i) => i.loja === d.loja)
        if (d.produto) items = items.filter((i) => i.product === d.produto)
        if (d.ocorrenciaId) items = items.filter((i) => i.id === d.ocorrenciaId)
      }

      if (isMounted.current) {
        setData(items)
      }
    } catch (err) {
      if (isMounted.current) {
        setError(err instanceof Error ? err : new Error('Erro ao carregar validades'))
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
