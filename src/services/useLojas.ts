import { useCallback, useEffect, useRef, useState } from 'react'
import pb from '@/lib/pocketbase/client'
import type { StatusOperacional, ValidadeItem, Ruptura } from '@/types'
import { classificarCriticidade } from '@/lib/data/criticidade'
import { toRuptura } from '@/lib/pipeline/rupturasPipeline'

export interface StoreEntity {
  storeId: string
  tenantId?: string
  storeCode: string // ex: "085" - preserva zeros à esquerda
  storeName: string // ex: "FORT ATACADISTA JARAGUÁ DO SUL"
  networkName: string // ex: "Grupo Pereira"
  razaoSocial?: string
  city: string // ex: "Jaraguá do Sul"
  state: string // ex: "SC"
  cnpj?: string
  active?: boolean
  // Métricas conciliadas
  totalClientes: number
  totalOcorrenciasAtivas: number // Apenas itens ativos (dias > 0)
  totalProdutos: number
  totalQuantidade: number
  statusMaisCritico: StatusOperacional | 'Normal'
  // Rupturas da loja
  totalRupturasAtivas: number
  rupturas: Ruptura[]
  // Itens em risco da loja (dias > 0)
  itemsAtivos: ValidadeItem[]
  // Itens em auditoria da loja (dias <= 0)
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
  const isMounted = useRef(true)

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      // Busca todas as ocorrências de validades_base e rupturas_base (Base Atual)
      const [records, rupturasRecords] = await Promise.all([
        pb.collection('validades_base').getFullList({
          filter: 'is_base_atual = true',
          sort: 'validade_efetiva',
        }),
        pb
          .collection('rupturas_base')
          .getFullList({
            filter: 'is_base_atual = true',
            sort: '-data_visita',
          })
          .catch(() => []),
      ])

      // Agrupa por Loja (usando codigo_loja e/ou nome_loja)
      const storeMap = new Map<
        string,
        {
          storeCode: string
          storeName: string
          networkName: string
          razaoSocial: string
          city: string
          state: string
          cnpj: string
          clientes: Set<string>
          produtosAtivos: Set<string>
          totalQtd: number
          itemsAtivos: ValidadeItem[]
          itemsAuditoria: ValidadeItem[]
          rupturas: Ruptura[]
        }
      >()

      // Helper para indexar/buscar grupo por código da loja numérico padronizado ou nome
      const getOrCreateGroup = (
        storeCode: string,
        storeName: string,
        networkName: string,
        razaoSocial: string,
        city: string,
        state: string,
        cnpj: string,
      ) => {
        let normalizedCode = storeCode.trim()
        if (normalizedCode && !isNaN(Number(normalizedCode))) {
          normalizedCode = String(Number(normalizedCode)).padStart(3, '0')
        }

        // Tentar encontrar grupo existente por código numérico se disponível
        if (normalizedCode) {
          for (const [existingKey, existingGroup] of storeMap.entries()) {
            let existingNormCode = existingGroup.storeCode.trim()
            if (existingNormCode && !isNaN(Number(existingNormCode))) {
              existingNormCode = String(Number(existingNormCode)).padStart(3, '0')
            }
            if (existingNormCode && existingNormCode === normalizedCode) {
              return existingGroup
            }
          }
        }

        const key = normalizedCode ? `${normalizedCode}-${storeName}` : storeName
        if (!storeMap.has(key)) {
          storeMap.set(key, {
            storeCode: normalizedCode || '000',
            storeName: storeName || 'LOJA DESCONHECIDA',
            networkName: networkName || 'Grupo Pereira',
            razaoSocial: razaoSocial || storeName,
            city,
            state,
            cnpj,
            clientes: new Set(),
            produtosAtivos: new Set(),
            totalQtd: 0,
            itemsAtivos: [],
            itemsAuditoria: [],
            rupturas: [],
          })
        }
        return storeMap.get(key)!
      }

      for (const rec of records) {
        const r = rec as unknown as Record<string, unknown>

        let storeCode = ((r.codigo_loja as string) || '').trim()
        let storeName = ((r.nome_loja as string) || (r.razao_social as string) || '').trim()
        const razaoSocial = ((r.razao_social as string) || '').trim()
        const city = ((r.cidade as string) || '').trim()
        const state = ((r.estado as string) || '').trim()
        const cnpj = ((r.cnpj as string) || (r.cpf_cnpj as string) || '').trim()
        const networkName = ((r.fantasia as string) || (r.rede as string) || 'Grupo Pereira').trim()
        const cliente = ((r.cliente as string) || (r.razao_social as string) || '').trim()
        const produto = ((r.produto as string) || '').trim()
        const sku = ((r.cod_produto as string) || (r.cod_barras as string) || '').trim()
        const validade = ((r.validade_efetiva as string) || (r.validade as string) || '').trim()
        const diasVencimentoAtual =
          typeof r.dias_vencimento_atual === 'number' ? r.dias_vencimento_atual : 0
        const quantidade =
          typeof r.quantidade === 'number' ? r.quantidade : Number(r.quantidade) || 0

        const group = getOrCreateGroup(
          storeCode,
          storeName,
          networkName,
          razaoSocial,
          city,
          state,
          cnpj,
        )
        if (cliente) group.clientes.add(cliente)

        const item: ValidadeItem = {
          id: r.id as string,
          product: produto,
          sku,
          lote: (r.numero_lote as string) || '',
          category: (r.category as ValidadeItem['category']) || 'Mercearia',
          validade,
          diasRestantes: diasVencimentoAtual,
          status:
            (r.status_operacional as ValidadeItem['status']) ||
            (diasVencimentoAtual <= 0 ? 'Vencido' : 'Normal'),
          unidade: 'UN',
          estoque: quantidade,
          cliente,
          industria: (r.fornecedor as string) || undefined,
          rede: networkName,
          codigoLoja: storeCode,
          loja: storeName,
          cidade: city,
          uf: state,
          promotor: (r.colaborador as string) || undefined,
          supervisor: (r.supervisor as string) || undefined,
          quantidade,
          ultimaAtualizacao: (r.realizado as string) || (r.updated as string) || undefined,
        }

        // Regra de Isolamento de Vencidos:
        // diasVencimentoAtual <= 0 -> Apenas na Auditoria
        // diasVencimentoAtual > 0 -> Na visão ativa / Validades Críticas
        if (diasVencimentoAtual <= 0) {
          group.itemsAuditoria.push(item)
        } else {
          group.itemsAtivos.push(item)
          if (produto || sku) group.produtosAtivos.add(sku || produto)
          group.totalQtd += quantidade
        }
      }

      // Adiciona rupturas às lojas
      for (const rec of rupturasRecords) {
        const r = rec as unknown as Record<string, unknown>
        const storeCode = ((r.codigo_loja as string) || '').trim()
        const storeName = ((r.nome_loja as string) || '').trim()
        const city = ((r.cidade as string) || '').trim()
        const state = ((r.estado as string) || '').trim()
        const cnpj = ((r.cnpj_loja as string) || '').trim()

        const group = getOrCreateGroup(
          storeCode,
          storeName,
          'Grupo Pereira',
          storeName,
          city,
          state,
          cnpj,
        )
        const rup = toRuptura(r)
        group.rupturas.push(rup)
      }

      // Converte mapa para StoreEntity[]
      const list: StoreEntity[] = Array.from(storeMap.entries()).map(([key, g]) => {
        // Calcula status mais crítico dos itens ATIVOS (Vencidos não contam no status operacional da loja)
        let statusMaisCritico: StatusOperacional | 'Normal' = 'Normal'
        const statusHierarchy: Record<string, number> = {
          Crítico: 4,
          Atenção: 3,
          Moderado: 2,
          Normal: 1,
        }

        let maxScore = 0
        for (const item of g.itemsAtivos) {
          const st = item.status
          if (st !== 'Vencido' && statusHierarchy[st]) {
            if (statusHierarchy[st] > maxScore) {
              maxScore = statusHierarchy[st]
              statusMaisCritico = st as StatusOperacional
            }
          }
        }

        return {
          storeId: key,
          storeCode: g.storeCode,
          storeName: g.storeName,
          networkName: g.networkName,
          razaoSocial: g.razaoSocial,
          city: g.city,
          state: g.state,
          cnpj: g.cnpj,
          active: true,
          totalClientes: g.clientes.size,
          totalOcorrenciasAtivas: g.itemsAtivos.length,
          totalProdutos: g.produtosAtivos.size,
          totalQuantidade: g.totalQtd,
          statusMaisCritico,
          totalRupturasAtivas: g.rupturas.filter((r) => r.situacao_atual === 'Ativo').length,
          rupturas: g.rupturas,
          itemsAtivos: g.itemsAtivos.sort((a, b) => a.diasRestantes - b.diasRestantes),
          itemsAuditoria: g.itemsAuditoria.sort((a, b) => a.diasRestantes - b.diasRestantes),
        }
      })

      // Ordena por código/nome
      list.sort((a, b) => a.storeCode.localeCompare(b.storeCode))

      if (isMounted.current) {
        setStores(list)
      }
    } catch (err) {
      if (isMounted.current) {
        setError(err instanceof Error ? err : new Error('Erro ao carregar lojas'))
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

  // Aplica filtros se houver
  const filteredStores = stores.filter((s) => {
    if (filters?.search) {
      const q = filters.search.trim().toLowerCase()
      const match =
        s.storeCode.toLowerCase().includes(q) ||
        s.storeName.toLowerCase().includes(q) ||
        (s.razaoSocial ?? '').toLowerCase().includes(q) ||
        s.networkName.toLowerCase().includes(q) ||
        s.city.toLowerCase().includes(q) ||
        s.state.toLowerCase().includes(q)
      if (!match) return false
    }

    if (filters?.networkName && filters.networkName !== 'Todos') {
      if (s.networkName !== filters.networkName) return false
    }

    if (filters?.city && filters.city !== 'Todos') {
      if (s.city !== filters.city) return false
    }

    if (filters?.state && filters.state !== 'Todos') {
      if (s.state !== filters.state) return false
    }

    if (filters?.statusMaisCritico && filters.statusMaisCritico !== 'Todos') {
      if (s.statusMaisCritico !== filters.statusMaisCritico) return false
    }

    return true
  })

  const getStoreById = (storeId: string) => {
    const decoded = decodeURIComponent(storeId)
    return stores.find((s) => {
      if (s.storeId === storeId || s.storeId === decoded) return true
      if (encodeURIComponent(s.storeId) === storeId) return true
      if (s.storeCode && (s.storeCode === storeId || s.storeCode === decoded)) return true
      // Comparação numérica (ex: "85" == "085")
      if (
        !isNaN(Number(s.storeCode)) &&
        !isNaN(Number(storeId)) &&
        Number(s.storeCode) === Number(storeId)
      ) {
        return true
      }
      return false
    })
  }

  return {
    stores,
    filteredStores,
    isLoading,
    error,
    refetch: fetchData,
    getStoreById,
  }
}
