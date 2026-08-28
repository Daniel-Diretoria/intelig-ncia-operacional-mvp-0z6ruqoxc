import { useState, useEffect, useCallback, useMemo } from 'react'
import { useValidades } from '@/services/useValidades'
import { useRupturas } from '@/services/useRupturas'
import { formatDisplayDate } from '@/lib/format/dateParser'
import { formatStoreIdentityTable } from '@/lib/format/storeIdentity'
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

  const [readIds, setReadIds] = useState<Set<string>>(() => {
    try {
      const stored =
        typeof localStorage !== 'undefined' ? localStorage.getItem('diretoria_read_alerts') : null
      if (stored) {
        return new Set(JSON.parse(stored))
      }
    } catch {
      // ignore
    }
    return new Set()
  })

  const isLoading = isLoadingValidades || isLoadingRupturas
  const error = errorValidades || errorRupturas

  const refetch = useCallback(async () => {
    await Promise.all([refetchValidades(), refetchRupturas()])
  }, [refetchValidades, refetchRupturas])

  const toggleRead = useCallback((id: string) => {
    setReadIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      try {
        localStorage.setItem('diretoria_read_alerts', JSON.stringify(Array.from(next)))
      } catch {
        // ignore
      }
      return next
    })
  }, [])

  // Coleção determinística de alertas gerada a partir dos hooks canônicos
  const allAlertas = useMemo(() => {
    const items: AlertaItem[] = []

    // 1. Validades: para cada v em validades.data com 0 <= diasRestantes <= 15
    for (const v of validadesData) {
      if (v.diasRestantes >= 0 && v.diasRestantes <= 15) {
        const id = 'val:' + v.id
        const storeLabel = formatStoreIdentityTable({
          codigoLoja: v.codigoLoja,
          nomeLoja: v.loja,
        })
        const formattedDate = formatDisplayDate(v.validade, '—')
        const qty = v.quantidade ?? v.estoque ?? 0
        const skuVal =
          v.sku && v.sku !== 'Código não informado' && v.sku.trim() ? v.sku.trim() : undefined

        const message = `${v.product} possui ${qty} un vencendo em ${v.diasRestantes} dias (${formattedDate}) na loja ${storeLabel}.`

        let timestamp: string
        if (v.dataEntrada) {
          timestamp = v.dataEntrada.includes('T') ? v.dataEntrada : `${v.dataEntrada}T00:00:00Z`
        } else if (v.validade) {
          timestamp = v.validade.includes('T') ? v.validade : `${v.validade}T00:00:00Z`
        } else {
          timestamp = new Date().toISOString()
        }

        items.push({
          id,
          title: `Validade: ${storeLabel}`,
          message,
          severity: 'Crítico',
          type: 'Validade',
          product: v.product,
          sku: skuVal,
          category: (v.category !== 'Não informada'
            ? v.category
            : undefined) as AlertaItem['category'],
          timestamp,
          isRead: readIds.has(id),
        })
      }
    }

    // 2. Rupturas: para cada r em rupturas.filteredRupturas
    for (const r of rupturasData) {
      const id = 'rup:' + r.id
      const storeLabel = formatStoreIdentityTable({
        codigoLoja: r.codigo_loja,
        nomeLoja: r.nome_loja,
      })
      const dataVisitaFmt = r.data_visita ? formatDisplayDate(r.data_visita, '—') : '—'
      const motivoFmt = r.motivo || 'Ruptura ativa'

      const message = `${r.produto} em ruptura (${motivoFmt}) identificada em ${dataVisitaFmt} na loja ${storeLabel}.`

      let timestamp: string
      if (r.data_visita) {
        timestamp = r.data_visita.includes('T') ? r.data_visita : `${r.data_visita}T00:00:00Z`
      } else if (r.data_entrada) {
        timestamp = r.data_entrada.includes('T') ? r.data_entrada : `${r.data_entrada}T00:00:00Z`
      } else {
        timestamp = new Date().toISOString()
      }

      items.push({
        id,
        title: `Ruptura: ${storeLabel}`,
        message,
        severity: 'Crítico',
        type: 'Ruptura',
        product: r.produto,
        sku: undefined,
        category: undefined,
        timestamp,
        isRead: readIds.has(id),
      })
    }

    return items
  }, [validadesData, rupturasData, readIds])

  const markAllAsRead = useCallback(() => {
    const allIds = new Set(allAlertas.map((a) => a.id))
    setReadIds(allIds)
    try {
      localStorage.setItem('diretoria_read_alerts', JSON.stringify(Array.from(allIds)))
    } catch {
      // ignore
    }
  }, [allAlertas])

  const data = useMemo(() => {
    let items = allAlertas

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

    return items
  }, [allAlertas, filters?.search, filters?.severity, filters?.type])

  return { data, isLoading, error, refetch, toggleRead, markAllAsRead }
}
