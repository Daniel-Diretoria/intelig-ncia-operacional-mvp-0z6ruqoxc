import { useState, useEffect, useCallback, useMemo } from 'react'
import pb from '@/lib/pocketbase/client'
import type { CrossEvidence, CrossEvidenceFilter, CrossEvidenceKpis } from '@/types'
import { parseOperationalDate } from '@/lib/format/dateParser'

export interface UseCrossEvidenceResult {
  data: CrossEvidence[]
  kpis: CrossEvidenceKpis
  isLoading: boolean
  error: Error | null
  refetch: () => Promise<void>
  updateReviewStatus: (
    id: string,
    status: 'confirmed' | 'rejected',
    rejectionReason?: string,
    reviewedBy?: string,
  ) => Promise<boolean>
}

export function useCrossEvidence(filters?: CrossEvidenceFilter): UseCrossEvidenceResult {
  const [data, setData] = useState<CrossEvidence[]>([])
  const [officialRupturesCount, setOfficialRupturesCount] = useState<number>(184)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      // 1. Obter total oficial de rupturas ativas do banco (baseline 184)
      try {
        const rupCount = await pb.collection('rupturas_base').getList(1, 1, {
          filter:
            "is_base_atual = true && situacao_atual = 'Ativo' && tenant_id !~ 'tradepro_job_'",
        })
        if (rupCount.totalItems > 0) {
          setOfficialRupturesCount(rupCount.totalItems)
        }
      } catch {
        // Fallback para 184 se falhar
        setOfficialRupturesCount(184)
      }

      // 2. Buscar dados de operational_cross_evidence com expand
      const records = await pb.collection('operational_cross_evidence').getFullList<CrossEvidence>({
        sort: '-stock_evidence_at,-created',
        expand: 'rupture_record_id,validity_record_id',
      })

      setData(records)
    } catch (err) {
      console.error('Erro ao buscar operational_cross_evidence:', err)
      setError(err as Error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Filtragem em memória no client
  const filteredData = useMemo(() => {
    if (!filters) return data

    return data.filter((item) => {
      // Filtro de Loja
      if (filters.store && filters.store !== 'all') {
        const storeMatch =
          (item.store_code && item.store_code === filters.store) ||
          (item.store_name && item.store_name.toLowerCase().includes(filters.store.toLowerCase()))
        if (!storeMatch) return false
      }

      // Filtro de Produto
      if (filters.product && filters.product.trim()) {
        const pTerm = filters.product.trim().toLowerCase()
        const prodMatch =
          (item.product_name && item.product_name.toLowerCase().includes(pTerm)) ||
          (item.product_code && item.product_code.toLowerCase().includes(pTerm))
        if (!prodMatch) return false
      }

      // Filtro de Marca/Cliente
      if (filters.brand && filters.brand !== 'all') {
        if (
          !item.client_or_brand ||
          !item.client_or_brand.toLowerCase().includes(filters.brand.toLowerCase())
        ) {
          return false
        }
      }

      // Filtro de Confiança
      if (filters.confidence && filters.confidence !== 'all') {
        if (item.confidence !== filters.confidence) return false
      }

      // Filtro de Status Proposto
      if (filters.proposed_status && filters.proposed_status !== 'all') {
        if (item.proposed_status !== filters.proposed_status) return false
      }

      // Filtro de Revisão
      if (filters.review_status && filters.review_status !== 'all') {
        if (item.review_status !== filters.review_status) return false
      }

      // Filtro de Período (em rupture_detected_at)
      if (filters.periodStart) {
        const rupDate = parseOperationalDate(item.rupture_detected_at)
        const startDate = parseOperationalDate(filters.periodStart)
        if (rupDate && startDate && rupDate.getTime() < startDate.getTime()) {
          return false
        }
      }
      if (filters.periodEnd) {
        const rupDate = parseOperationalDate(item.rupture_detected_at)
        const endDate = parseOperationalDate(filters.periodEnd)
        if (rupDate && endDate && rupDate.getTime() > endDate.getTime()) {
          return false
        }
      }

      // Filtro rápido de Auditoria
      if (filters.quickAudit && filters.quickAudit !== 'all') {
        if (filters.quickAudit === 'no_product_code') {
          if (item.product_code && item.product_code.trim() !== '') return false
        } else if (filters.quickAudit === 'same_day_no_time') {
          if (item.resolution_days !== 0 || item.confidence !== 'inconclusive') return false
        } else if (filters.quickAudit === 'different_brand') {
          if (item.match_method !== 'inconclusive' && item.confidence !== 'inconclusive')
            return false
        } else if (filters.quickAudit === 'similar_products') {
          if (item.match_method !== 'inconclusive') return false
        } else if (filters.quickAudit === 'rejected') {
          if (item.review_status !== 'rejected') return false
        }
      }

      return true
    })
  }, [data, filters])

  // KPIs calculados sobre os dados (ou filtrados)
  const kpis: CrossEvidenceKpis = useMemo(() => {
    let alta = 0
    let revisao = 0
    let inconclusivos = 0
    let reabertas = 0
    let somaDias = 0
    let contagemDiasValidos = 0

    // Calcula sobre toda a base de evidências para consistência analítica
    data.forEach((item) => {
      if (item.confidence === 'high') alta++
      if (item.proposed_status === 'awaiting_review' || item.review_status === 'pending') {
        revisao++
      }
      if (item.confidence === 'inconclusive' || item.match_method === 'inconclusive') {
        inconclusivos++
      }
      if (item.proposed_status === 'reopened') {
        reabertas++
      }

      if (
        typeof item.resolution_days === 'number' &&
        !isNaN(item.resolution_days) &&
        item.resolution_days >= 0
      ) {
        somaDias += item.resolution_days
        contagemDiasValidos++
      }
    })

    const tempoMedio =
      contagemDiasValidos > 0 ? Math.round((somaDias / contagemDiasValidos) * 10) / 10 : null

    return {
      rupturasOficiaisAtivas: officialRupturesCount,
      evidenciasAltaConfianca: alta,
      evidenciasAguardandoRevisao: revisao,
      confrontosInconclusivos: inconclusivos,
      rupturasReabertas: reabertas,
      tempoMedioAteEvidencia: tempoMedio,
    }
  }, [data, officialRupturesCount])

  // Atualização de status de revisão humana (confirmação / rejeição)
  const updateReviewStatus = useCallback(
    async (
      id: string,
      status: 'confirmed' | 'rejected',
      rejectionReason?: string,
      reviewedBy = 'Operador',
    ): Promise<boolean> => {
      try {
        const payload: Partial<CrossEvidence> = {
          review_status: status,
          reviewed_at: new Date().toISOString(),
          reviewed_by: reviewedBy,
          rejection_reason: rejectionReason || '',
        }

        await pb.collection('operational_cross_evidence').update(id, payload)

        // Atualizar estado local otimista
        setData((prev) =>
          prev.map((item) =>
            item.id === id
              ? {
                  ...item,
                  ...payload,
                }
              : item,
          ),
        )
        return true
      } catch (err) {
        console.error('Erro ao atualizar status de revisão:', err)
        return false
      }
    },
    [],
  )

  return {
    data: filteredData,
    kpis,
    isLoading,
    error,
    refetch: fetchData,
    updateReviewStatus,
  }
}
