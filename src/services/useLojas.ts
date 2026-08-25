import { useState, useEffect, useCallback, useMemo } from 'react'
import { getBaseAtualSnapshot, type BaseAtualSnapshot, type LojaAgregada } from '@/lib/selectors'
import { buildStoreCompositeKey, parseCityUf, deriveNetworkName } from '@/lib/format/storeIdentity'
import type { ValidadeItem, Ruptura } from '@/types'

export interface StoreSummary {
  storeId: string // chave composta segura (NUNCA só código)
  storeCode: string // "085", "007", "" se não houver
  storeName: string // nome limpo
  networkName: string // rede canônica
  city: string
  uf: string
  marcasCount: number // marcas distintas atendidas
  marcasList: string[] // lista para tooltip
  validadesCriticasCount: number // 0-15 dias
  validadesAtencaoCount: number // 16-30 dias (para KPI "Casos complexos" = críticas + atenção ou contagem)
  rupturasAtivasCount: number
  situacao: 'Crítica' | 'Normal' // Crítica = validades 0-15 OU ruptura ativa
  // Campos complementares para o detalhe da loja
  itemsAtivos: ValidadeItem[]
  itemsAuditoria: ValidadeItem[]
  rupturasList: Ruptura[]
}

// Alias para compatibilidade se algum código legado referenciar StoreEntity
export type StoreEntity = StoreSummary

export interface LojasFilter {
  search?: string
  marca?: string
  cliente?: string
  networkName?: string
  rede?: string
  city?: string
  cidade?: string
  cityUf?: string
  uf?: string
  state?: string
  situacao?:
    | 'Todas'
    | 'Críticas'
    | 'Casos complexos'
    | 'Com rupturas'
    | 'Crítica'
    | 'Normal'
    | string
}

export interface UseLojasResult {
  stores: StoreSummary[]
  filteredStores: StoreSummary[]
  validadesAtivas: ValidadeItem[]
  rupturasAtivas: Ruptura[]
  isLoading: boolean
  error: Error | null
  refetch: () => Promise<void>
  getStoreById: (storeId: string) => StoreSummary | undefined
}

export function useLojas(filters?: LojasFilter): UseLojasResult {
  const [stores, setStores] = useState<StoreSummary[]>([])
  const [validadesAtivas, setValidadesAtivas] = useState<ValidadeItem[]>([])
  const [rupturasAtivas, setRupturasAtivas] = useState<Ruptura[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchStores = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const snapshot: BaseAtualSnapshot = await getBaseAtualSnapshot()
      setValidadesAtivas(snapshot.validadesAtivas)
      setRupturasAtivas(snapshot.rupturasAtivas)

      const agregadas = snapshot.lojasAgregadas
      const activeRupturas = snapshot.rupturasAtivas.filter((r) => r.situacao_atual === 'Ativo')

      // Mapeia rupturas ativas por storeId usando parseCityUf e deriveNetworkName
      const rupturasByStoreId = new Map<string, Ruptura[]>()
      for (const rup of activeRupturas) {
        const { city: rupCity, uf: rupState } = parseCityUf(rup.cidade, rup.estado)
        const rupRede = deriveNetworkName(rup.nome_loja)
        const key = buildStoreCompositeKey({
          codigoLoja: rup.codigo_loja,
          nomeLoja: rup.nome_loja,
          rede: rupRede,
          cidade: rupCity,
          uf: rupState,
        })
        const list = rupturasByStoreId.get(key) || []
        list.push(rup)
        rupturasByStoreId.set(key, list)
      }

      const summaries: StoreSummary[] = agregadas.map((l: LojaAgregada) => {
        const { city: lCity, uf: lUf } = parseCityUf(l.cidade, l.uf)
        const storeId =
          l.lojaKey ||
          buildStoreCompositeKey({
            codigoLoja: l.codigoLoja,
            nomeLoja: l.nomeLoja,
            rede: l.rede,
            cidade: lCity,
            uf: lUf,
          })

        const marcasSet = new Set<string>()
        let validadesCriticasCount = 0
        let validadesAtencaoCount = 0

        // Processa validades ativas da loja
        for (const it of l.itemsAtivos) {
          if (it.cliente && it.cliente.trim()) {
            marcasSet.add(it.cliente.trim())
          }
          if (it.diasRestantes <= 15) {
            validadesCriticasCount++
          } else if (it.diasRestantes > 15 && it.diasRestantes <= 30) {
            validadesAtencaoCount++
          }
        }

        // Processa rupturas da loja
        const storeRupturas = rupturasByStoreId.get(storeId) || []
        for (const rup of storeRupturas) {
          if (rup.cliente && rup.cliente.trim()) {
            marcasSet.add(rup.cliente.trim())
          }
        }

        const rupturasAtivasCount = l.totalRupturasAtivas || storeRupturas.length
        const situacao: 'Crítica' | 'Normal' =
          validadesCriticasCount > 0 || rupturasAtivasCount > 0 ? 'Crítica' : 'Normal'

        const marcasList = Array.from(marcasSet).sort((a, b) => a.localeCompare(b, 'pt-BR'))

        return {
          storeId,
          storeCode: l.codigoLoja || '',
          storeName: l.nomeLoja,
          networkName: l.rede,
          city: l.cidade,
          uf: l.uf,
          marcasCount: marcasList.length,
          marcasList,
          validadesCriticasCount,
          validadesAtencaoCount,
          rupturasAtivasCount,
          situacao,
          itemsAtivos: l.itemsAtivos,
          itemsAuditoria: l.itemsAuditoria,
          rupturasList: storeRupturas,
        }
      })

      setStores(summaries)
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
      // Filtro de busca (código, nome da loja, cidade, rede)
      if (filters?.search && filters.search.trim()) {
        const q = filters.search.toLowerCase().trim()
        const matchCode = store.storeCode.toLowerCase().includes(q)
        const matchName = store.storeName.toLowerCase().includes(q)
        const matchCity = store.city.toLowerCase().includes(q)
        const matchNetwork = store.networkName.toLowerCase().includes(q)
        if (!matchCode && !matchName && !matchCity && !matchNetwork) return false
      }

      // Filtro Marca (cliente)
      const marca = filters?.marca ?? filters?.cliente
      if (marca && marca !== 'Todos' && marca !== 'Todas as marcas') {
        const hasMarca = store.marcasList.some(
          (m) =>
            m.toLowerCase() === marca.toLowerCase() ||
            m.toLowerCase().includes(marca.toLowerCase()),
        )
        if (!hasMarca) return false
      }

      // Filtro Rede
      const rede = filters?.networkName ?? filters?.rede
      if (rede && rede !== 'Todos' && rede !== 'Todas as redes') {
        if (store.networkName.toLowerCase() !== rede.toLowerCase()) return false
      }

      // Filtro Cidade / CidadeUf
      const city = filters?.city ?? filters?.cidade
      if (city && city !== 'Todos' && city !== 'Todas as cidades') {
        if (store.city.toLowerCase() !== city.toLowerCase()) return false
      }

      if (filters?.cityUf && filters.cityUf !== 'Todas as cidades' && filters.cityUf !== 'Todos') {
        const { city: sCity, uf: sUf } = parseCityUf(store.city, store.uf)
        const formattedStoreCityUf = formatCityUf(sCity, sUf).toLowerCase()
        if (
          formattedStoreCityUf !== filters.cityUf.toLowerCase() &&
          !store.city.toLowerCase().includes(filters.cityUf.toLowerCase())
        ) {
          return false
        }
      }

      // Filtro UF / Estado
      const uf = filters?.uf ?? filters?.state
      if (uf && uf !== 'Todos' && uf !== 'Todos os estados') {
        const { uf: sUf } = parseCityUf(store.city, store.uf)
        if (sUf.toUpperCase() !== uf.toUpperCase() && store.uf.toUpperCase() !== uf.toUpperCase()) {
          return false
        }
      }

      // Filtro Situação: 'Todas' | 'Críticas' | 'Casos complexos' | 'Com rupturas' | 'Crítica' | 'Normal'
      if (filters?.situacao && filters.situacao !== 'Todas' && filters.situacao !== 'Todos') {
        if (filters.situacao === 'Críticas' || filters.situacao === 'Crítica') {
          if (store.situacao !== 'Crítica') return false
        } else if (filters.situacao === 'Casos complexos') {
          if (store.validadesCriticasCount <= 0) return false
        } else if (filters.situacao === 'Com rupturas') {
          if (store.rupturasAtivasCount <= 0) return false
        } else if (filters.situacao === 'Normal') {
          if (store.situacao !== 'Normal') return false
        }
      }

      return true
    })
  }, [stores, filters])

  // getStoreById: resolve por storeId composto exato via decodeURIComponent.
  // NUNCA fazer fallback para match por código parcial. Se o storeId não bater exatamente, retorna undefined.
  const getStoreById = useCallback(
    (storeId: string) => {
      if (!storeId) return undefined
      const decoded = decodeURIComponent(storeId)
      return stores.find((s) => s.storeId === decoded)
    },
    [stores],
  )

  return {
    stores,
    filteredStores,
    validadesAtivas,
    rupturasAtivas,
    isLoading,
    error,
    refetch: fetchStores,
    getStoreById,
  }
}
