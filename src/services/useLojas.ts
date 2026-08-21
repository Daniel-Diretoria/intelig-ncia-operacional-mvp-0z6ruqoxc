import { useState, useEffect, useCallback, useMemo } from 'react'
import { getBaseAtualSnapshot, type BaseAtualSnapshot, type LojaAgregada } from '@/lib/selectors'
import type { ValidadeItem, Ruptura } from '@/types'

export interface StoreEntity {
  storeId: string
  storeCode: string
  storeName: string
  razaoSocial?: string
  networkName: string
  city: string
  state: string
  totalClientes: number
  totalOcorrenciasAtivas: number
  totalRupturasAtivas: number
  totalProdutos: number
  totalQuantidade: number
  statusMaisCritico: 'Crítico' | 'Atenção' | 'Moderado' | 'Normal'
  itemsAtivos: ValidadeItem[]
  itemsAuditoria: ValidadeItem[]
}

export interface LojasFilter {
  search?: string
  networkName?: string
  city?: string
  state?: string
  statusMaisCritico?: string
}

export interface UseLojasResult {
  stores: StoreEntity[]
  filteredStores: StoreEntity[]
  isLoading: boolean
  error: Error | null
  refetch: () => Promise<void>
  getStoreById: (storeId: string) => StoreEntity | undefined
}

export function useLojas(filters?: LojasFilter): UseLojasResult {
  const [stores, setStores] = useState<StoreEntity[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchStores = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const snapshot: BaseAtualSnapshot = await getBaseAtualSnapshot()
      const agregadas = snapshot.lojasAgregadas

      const entities: StoreEntity[] = agregadas.map((l: LojaAgregada) => ({
        storeId: l.codigoLoja ? `${l.codigoLoja}-${l.nomeLoja}` : l.lojaKey,
        storeCode: l.codigoLoja || 'Não identificado',
        storeName: l.nomeLoja,
        networkName: l.rede,
        city: l.cidade,
        state: l.uf,
        totalClientes: l.totalClientes,
        totalOcorrenciasAtivas: l.totalOcorrenciasAtivas,
        totalRupturasAtivas: l.totalRupturasAtivas,
        totalProdutos: l.totalProdutosEmRisco,
        totalQuantidade: l.totalQuantidade,
        statusMaisCritico: l.statusMaisCritico as StoreEntity['statusMaisCritico'],
        itemsAtivos: l.itemsAtivos,
        itemsAuditoria: l.itemsAuditoria,
      }))

      setStores(entities)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Falha ao processar base de lojas'))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStores()
  }, [fetchStores])

  // Header refresh listener
  useEffect(() => {
    const handleGlobalRefresh = () => fetchStores()
    window.addEventListener('diretoria:refresh', handleGlobalRefresh)
    return () => window.removeEventListener('diretoria:refresh', handleGlobalRefresh)
  }, [fetchStores])

  const filteredStores = useMemo(() => {
    return stores.filter((store) => {
      if (filters?.search) {
        const q = filters.search.toLowerCase().trim()
        const matchCode = store.storeCode.toLowerCase().includes(q)
        const matchName = store.storeName.toLowerCase().includes(q)
        const matchCity = store.city.toLowerCase().includes(q)
        const matchNetwork = store.networkName.toLowerCase().includes(q)
        if (!matchCode && !matchName && !matchCity && !matchNetwork) return false
      }
      if (filters?.networkName && filters.networkName !== 'Todos') {
        if (store.networkName !== filters.networkName) return false
      }
      if (filters?.city && filters.city !== 'Todos') {
        if (store.city !== filters.city) return false
      }
      if (filters?.state && filters.state !== 'Todos') {
        if (store.state !== filters.state) return false
      }
      if (filters?.statusMaisCritico && filters.statusMaisCritico !== 'Todos') {
        if (store.statusMaisCritico !== filters.statusMaisCritico) return false
      }
      return true
    })
  }, [stores, filters])

  const getStoreById = useCallback(
    (storeId: string) => {
      const decoded = decodeURIComponent(storeId)
      return stores.find(
        (s) => s.storeId === decoded || s.storeCode === decoded || s.storeName === decoded,
      )
    },
    [stores],
  )

  return {
    stores,
    filteredStores,
    isLoading,
    error,
    refetch: fetchStores,
    getStoreById,
  }
}
