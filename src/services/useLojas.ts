import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  buildStoreCompositeKey,
  parseCityUf,
  deriveNetworkName,
  formatCityUf,
} from '@/lib/format/storeIdentity'
import { resolveStoreSupervisors } from '@/lib/resolve/supervisorResolver'
import { useValidades } from '@/services/useValidades'
import { useRupturas } from '@/services/useRupturas'
import type { ValidadeItem, Ruptura } from '@/types'

export interface StoreDimensoes {
  validades: {
    criticasCount: number
    atencaoCount: number
    totalAtivas: number
  }
  rupturas: {
    ativasCount: number
  }
  acompanhamento: {
    produtosCriticosCount: number
  }
  devolucoes: {
    emAndamentoCount: number
  }
  ocorrencias: {
    abertasCount: number
  }
}

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
  situacao: 'Crítica' | 'Normal' // Mantido para compatibilidade: Crítica APENAS quando validades 0-15d > 0. Ruptura isolada NÃO gera situação Crítica.
  requerAtencao: boolean
  motivosAtencao: string[]
  dimensoes: StoreDimensoes
  // Campos complementares para o detalhe da loja
  itemsAtivos: ValidadeItem[]
  itemsAuditoria: ValidadeItem[]
  rupturasList: Ruptura[]
  // Atribuição de supervisor
  supervisorKey: string // "CAROLINE OLIVEIRA" ou "sem-supervisor"
  supervisorName: string // "CAROLINE OLIVEIRA" ou "Sem supervisor definido"
  supervisoresList: Array<{ nome: string; marcas: string[] }>
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
  const {
    data: validadesData,
    isLoading: isLoadingValidades,
    error: errorValidades,
    refetch: refetchValidades,
  } = useValidades()

  const {
    filteredRupturas: rupturasData,
    isLoading: isLoadingRupturas,
    error: errorRupturas,
    refetch: refetchRupturas,
  } = useRupturas()

  const isLoading = isLoadingValidades || isLoadingRupturas
  const error = errorValidades || errorRupturas

  const refetch = useCallback(async () => {
    await Promise.all([refetchValidades(), refetchRupturas()])
  }, [refetchValidades, refetchRupturas])

  // Header refresh listener
  useEffect(() => {
    const handleGlobalRefresh = () => {
      refetch()
    }
    window.addEventListener('diretoria:refresh', handleGlobalRefresh)
    return () => window.removeEventListener('diretoria:refresh', handleGlobalRefresh)
  }, [refetch])

  const stores = useMemo(() => {
    const isRedeGeneric = (r: string) =>
      !r ||
      !r.trim() ||
      r.trim().toUpperCase() === 'REDE NÃO IDENTIFICADA' ||
      r.trim().toUpperCase() === 'REDE NÃO INFORMADA'

    // Mapa por groupKey normalizada: CODIGO|NOME|CIDADE
    const storeMap = new Map<
      string,
      {
        storeCode: string
        storeName: string
        networkName: string
        city: string
        uf: string
        marcasSet: Set<string>
        validadesCriticasCount: number
        validadesAtencaoCount: number
        rupturasAtivasCount: number
        itemsAtivos: ValidadeItem[]
        itemsAuditoria: ValidadeItem[]
        rupturasList: Ruptura[]
      }
    >()

    // 1. Processa Validades Canônicas
    for (const v of validadesData) {
      const { city: vCity, uf: vUf } = parseCityUf(v.cidade, v.uf)
      const storeCode = v.codigoLoja ? String(v.codigoLoja).trim() : ''
      const storeName = v.loja ? String(v.loja).trim() : ''
      const networkName = v.rede ? String(v.rede).trim() : deriveNetworkName(storeName)

      const normCode = storeCode ? storeCode.toUpperCase() : 'SEM_CODIGO'
      const normName = storeName.toUpperCase()
      const normCity = vCity.toUpperCase()
      const groupKey = `${normCode}|${normName}|${normCity}`

      let entry = storeMap.get(groupKey)
      if (!entry) {
        entry = {
          storeCode,
          storeName,
          networkName,
          city: vCity,
          uf: vUf,
          marcasSet: new Set<string>(),
          validadesCriticasCount: 0,
          validadesAtencaoCount: 0,
          rupturasAtivasCount: 0,
          itemsAtivos: [],
          itemsAuditoria: [],
          rupturasList: [],
        }
        storeMap.set(groupKey, entry)
      } else {
        if (isRedeGeneric(entry.networkName) && !isRedeGeneric(networkName)) {
          entry.networkName = networkName
        }
        if (!entry.uf && vUf) {
          entry.uf = vUf
        }
      }

      entry.itemsAtivos.push(v)

      if (v.cliente && v.cliente.trim()) {
        entry.marcasSet.add(v.cliente.trim())
      }
      if (v.diasRestantes <= 15) {
        entry.validadesCriticasCount++
      } else if (v.diasRestantes > 15 && v.diasRestantes <= 30) {
        entry.validadesAtencaoCount++
      }
    }

    // 2. Processa Rupturas Canônicas (já pós-confronto)
    for (const r of rupturasData) {
      const { city: rCity, uf: rUf } = parseCityUf(r.cidade, r.estado)
      const storeCode = r.codigo_loja ? String(r.codigo_loja).trim() : ''
      const storeName = r.nome_loja ? String(r.nome_loja).trim() : ''
      const networkName = deriveNetworkName(storeName)

      const normCode = storeCode ? storeCode.toUpperCase() : 'SEM_CODIGO'
      const normName = storeName.toUpperCase()
      const normCity = rCity.toUpperCase()
      const groupKey = `${normCode}|${normName}|${normCity}`

      let entry = storeMap.get(groupKey)
      if (!entry) {
        entry = {
          storeCode,
          storeName,
          networkName,
          city: rCity,
          uf: rUf,
          marcasSet: new Set<string>(),
          validadesCriticasCount: 0,
          validadesAtencaoCount: 0,
          rupturasAtivasCount: 0,
          itemsAtivos: [],
          itemsAuditoria: [],
          rupturasList: [],
        }
        storeMap.set(groupKey, entry)
      } else {
        if (isRedeGeneric(entry.networkName) && !isRedeGeneric(networkName)) {
          entry.networkName = networkName
        }
        if (!entry.uf && rUf) {
          entry.uf = rUf
        }
      }

      entry.rupturasList.push(r)

      if (r.cliente && r.cliente.trim()) {
        entry.marcasSet.add(r.cliente.trim())
      }
      entry.rupturasAtivasCount++
    }

    // 3. Converte para StoreSummary[] e calcula supervisores
    const list: StoreSummary[] = []
    const seenStoreIds = new Set<string>()

    for (const entry of storeMap.values()) {
      const marcasList = Array.from(entry.marcasSet).sort((a, b) => a.localeCompare(b, 'pt-BR'))

      const storeId = buildStoreCompositeKey({
        codigoLoja: entry.storeCode,
        nomeLoja: entry.storeName,
        rede: entry.networkName,
        cidade: entry.city,
        uf: entry.uf,
      })

      if (!seenStoreIds.has(storeId)) {
        seenStoreIds.add(storeId)

        // Item 2: Desacoplamento dimensional — Loja só com ruptura NÃO recebe "Crítica"
        // Criticidade severa é restrita a validades críticas (0-15 dias).
        // Rupturas e outras dimensões são medidas independentemente.
        const situacao: 'Crítica' | 'Normal' =
          entry.validadesCriticasCount > 0 ? 'Crítica' : 'Normal'

        const motivosAtencao: string[] = []
        if (entry.validadesCriticasCount > 0) {
          motivosAtencao.push(`${entry.validadesCriticasCount} validade(s) crítica(s)`)
        }
        if (entry.validadesAtencaoCount > 0) {
          motivosAtencao.push(`${entry.validadesAtencaoCount} lote(s) em atenção`)
        }
        if (entry.rupturasAtivasCount > 0) {
          motivosAtencao.push(`${entry.rupturasAtivasCount} ruptura(s) ativa(s)`)
        }

        const requerAtencao = motivosAtencao.length > 0

        const dimensoes: StoreDimensoes = {
          validades: {
            criticasCount: entry.validadesCriticasCount,
            atencaoCount: entry.validadesAtencaoCount,
            totalAtivas: entry.itemsAtivos.length,
          },
          rupturas: {
            ativasCount: entry.rupturasAtivasCount,
          },
          acompanhamento: {
            produtosCriticosCount: 0,
          },
          devolucoes: {
            emAndamentoCount: 0,
          },
          ocorrencias: {
            abertasCount: 0,
          },
        }

        const supResolution = resolveStoreSupervisors(
          entry.itemsAtivos,
          entry.rupturasList,
          storeId,
        )

        list.push({
          storeId,
          storeCode: entry.storeCode,
          storeName: entry.storeName,
          networkName: entry.networkName,
          city: entry.city,
          uf: entry.uf,
          marcasCount: marcasList.length,
          marcasList,
          validadesCriticasCount: entry.validadesCriticasCount,
          validadesAtencaoCount: entry.validadesAtencaoCount,
          rupturasAtivasCount: entry.rupturasAtivasCount,
          situacao,
          requerAtencao,
          motivosAtencao,
          dimensoes,
          itemsAtivos: entry.itemsAtivos,
          itemsAuditoria: entry.itemsAuditoria,
          rupturasList: entry.rupturasList,
          supervisorKey: supResolution.supervisorKey,
          supervisorName: supResolution.supervisorName,
          supervisoresList: supResolution.supervisoresList,
        })
      }
    }

    return list
  }, [validadesData, rupturasData])

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
    validadesAtivas: validadesData,
    rupturasAtivas: rupturasData,
    isLoading,
    error,
    refetch,
    getStoreById,
  }
}
