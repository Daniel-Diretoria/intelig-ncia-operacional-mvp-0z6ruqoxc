import { useState, useEffect, useCallback, useRef } from 'react'
import { getBaseAtualSnapshot, type BaseAtualSnapshot } from '@/lib/selectors'
import type { Ruptura, RupturasFilters, RupturasKpis } from '@/types'
import { computeRupturasKpis } from '@/lib/pipeline/rupturasPipeline'
import {
  computeConfrontoBidirecional,
  type RupturaEncerrada,
  type ConflitoAuditoria,
} from '@/lib/engine/confrontoBidirecional'
import type { ValidadeRecord } from '@/lib/engine/ruptureValidityReconciliationEngine'
import { deriveNetworkName } from '@/lib/format/storeIdentity'
import { normalizeStoreCode } from '@/lib/format/storeCode'

export interface ExtendedRupturasFilters extends RupturasFilters {
  rede?: string
  cidade?: string
  produto?: string
}

export interface UseRupturasResult {
  data: Ruptura[]
  filteredRupturas: Ruptura[]
  historicoRupturas: RupturaEncerrada[]
  conflitos: ConflitoAuditoria[]
  kpis: RupturasKpis | null
  isLoading: boolean
  error: Error | null
  refetch: () => Promise<void>
}

export function useRupturas(filters?: ExtendedRupturasFilters): UseRupturasResult {
  const [data, setData] = useState<Ruptura[]>([])
  const [filteredRupturas, setFilteredRupturas] = useState<Ruptura[]>([])
  const [historicoRupturas, setHistoricoRupturas] = useState<RupturaEncerrada[]>([])
  const [conflitos, setConflitos] = useState<ConflitoAuditoria[]>([])
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
      const rawRupturas = [...snapshot.rupturasAtivas]

      // Converte validadesAtivas para ValidadeRecord para o confronto bidirecional
      const validadesRecords: ValidadeRecord[] = snapshot.validadesAtivas.map((v) => ({
        id: v.id,
        produto: v.product,
        cod_produto: v.sku !== 'Código não informado' ? v.sku : undefined,
        cliente: v.cliente,
        fornecedor: v.industria,
        razao_social: v.loja,
        nome_loja: v.loja,
        codigo_loja: v.codigoLoja,
        cidade: v.cidade,
        estado: v.uf,
        realizado: v.dataEntrada || v.ultimaAtualizacao,
        validade_efetiva: v.validade,
        quantidade: v.quantidade ?? v.estoque,
        is_base_atual: true,
      }))

      // 1. Aplica o CONFRONTO BIDIRECIONAL in-memory
      const confronto = computeConfrontoBidirecional(rawRupturas, validadesRecords)

      // 2. Aplica filtros do usuário sobre as rupturas ativas derivadas
      let items = [...confronto.ativas]

      if (filters?.search) {
        const q = filters.search.trim().toLowerCase()
        items = items.filter((i) => {
          const storeCode = normalizeStoreCode(i.codigo_loja)
          return (
            i.produto.toLowerCase().includes(q) ||
            i.nome_loja.toLowerCase().includes(q) ||
            storeCode.toLowerCase().includes(q) ||
            (i.colaborador && i.colaborador.toLowerCase().includes(q)) ||
            (i.cliente && i.cliente.toLowerCase().includes(q))
          )
        })
      }

      if (filters?.loja && filters.loja !== 'all' && filters.loja !== 'Todos') {
        const normFilterLoja = normalizeStoreCode(filters.loja)
        items = items.filter((i) => {
          const normItemLoja = normalizeStoreCode(i.codigo_loja)
          if (normFilterLoja && normItemLoja) {
            return normItemLoja === normFilterLoja
          }
          return i.codigo_loja === filters.loja || i.nome_loja === filters.loja
        })
      }

      if (filters?.motivo && filters.motivo !== 'all' && filters.motivo !== 'Todos') {
        items = items.filter((i) => i.motivo === filters.motivo)
      }

      if (filters?.cliente && filters.cliente !== 'all' && filters.cliente !== 'Todos') {
        items = items.filter(
          (i) => (i.cliente || '').trim().toLowerCase() === filters.cliente!.trim().toLowerCase(),
        )
      }

      if (filters?.rede && filters.rede !== 'all' && filters.rede !== 'Todos') {
        items = items.filter((i) => {
          const itemRede = (i.rede || i.fantasia || deriveNetworkName(i.nome_loja) || '')
            .trim()
            .toLowerCase()
          return itemRede === filters.rede!.trim().toLowerCase()
        })
      }

      if (filters?.cidade && filters.cidade !== 'all' && filters.cidade !== 'Todos') {
        items = items.filter(
          (i) => (i.cidade || '').trim().toLowerCase() === filters.cidade!.trim().toLowerCase(),
        )
      }

      if (filters?.produto && filters.produto !== 'all' && filters.produto !== 'Todos') {
        items = items.filter(
          (i) => (i.produto || '').trim().toLowerCase() === filters.produto!.trim().toLowerCase(),
        )
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

      // Aplica os mesmos filtros em historicoRupturas para visualização consistente quando alternado
      let filteredHistorico = [...confronto.historico]
      if (filters?.search) {
        const q = filters.search.trim().toLowerCase()
        filteredHistorico = filteredHistorico.filter((i) => {
          const storeCode = normalizeStoreCode(i.codigo_loja)
          return (
            i.produto.toLowerCase().includes(q) ||
            i.nome_loja.toLowerCase().includes(q) ||
            storeCode.toLowerCase().includes(q) ||
            (i.cliente && i.cliente.toLowerCase().includes(q))
          )
        })
      }
      if (filters?.cliente && filters.cliente !== 'all' && filters.cliente !== 'Todos') {
        filteredHistorico = filteredHistorico.filter(
          (i) => (i.cliente || '').trim().toLowerCase() === filters.cliente!.trim().toLowerCase(),
        )
      }
      if (filters?.loja && filters.loja !== 'all' && filters.loja !== 'Todos') {
        const normFilterLoja = normalizeStoreCode(filters.loja)
        filteredHistorico = filteredHistorico.filter((i) => {
          const normItemLoja = normalizeStoreCode(i.codigo_loja)
          if (normFilterLoja && normItemLoja) {
            return normItemLoja === normFilterLoja
          }
          return i.codigo_loja === filters.loja || i.nome_loja === filters.loja
        })
      }

      // KPIs calculados sobre os itens filtrados
      const calculatedKpis = computeRupturasKpis(items)

      if (isMounted.current) {
        setData(confronto.ativas)
        setFilteredRupturas(items)
        setHistoricoRupturas(filteredHistorico)
        setConflitos(confronto.conflitos)
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
    filteredRupturas,
    historicoRupturas,
    conflitos,
    kpis,
    isLoading,
    error,
    refetch: fetchData,
  }
}
