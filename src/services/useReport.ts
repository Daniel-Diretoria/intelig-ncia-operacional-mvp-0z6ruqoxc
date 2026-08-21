import { useState, useEffect, useCallback, useRef } from 'react'
import type { ReportData, ReportType } from '@/types'
import { getBaseAtualSnapshot, type BaseAtualSnapshot } from '@/lib/selectors'
import {
  buildResumoValidadesReport,
  buildValidadesPorLojaReport,
  buildTendenciaVencimentoReport,
  buildRupturasPorLojaReport,
  buildRupturasPorMotivoReport,
} from '@/lib/data/reports'

export interface UseReportResult {
  data: ReportData | null
  isLoading: boolean
  error: Error | null
  refetch: () => Promise<void>
}

export function useReport(reportType: ReportType): UseReportResult {
  const [data, setData] = useState<ReportData | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<Error | null>(null)
  const isMounted = useRef(true)

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const snapshot: BaseAtualSnapshot = await getBaseAtualSnapshot()
      const validades = snapshot.validadesAtivas
      const rupturas = snapshot.rupturasAtivas

      let result: ReportData

      switch (reportType) {
        case 'validades-por-categoria':
        case 'resumo-validades':
          result = buildResumoValidadesReport(validades)
          break
        case 'validades-proximas-vencer':
        case 'tendencia-vencimento':
          result = buildTendenciaVencimentoReport(validades)
          break
        case 'rupturas-por-loja':
        case 'top-rupturas-por-produto':
          result = buildRupturasPorLojaReport(rupturas)
          break
        case 'rupturas-por-motivo':
        case 'rupturas-por-periodo':
          result = buildRupturasPorMotivoReport(rupturas)
          break
        case 'validades-por-loja':
        default:
          result = buildValidadesPorLojaReport(validades)
          break
      }

      if (isMounted.current) {
        setData(result)
      }
    } catch (err) {
      if (isMounted.current) {
        setError(err instanceof Error ? err : new Error('Falha ao gerar relatório'))
      }
    } finally {
      if (isMounted.current) {
        setIsLoading(false)
      }
    }
  }, [reportType])

  useEffect(() => {
    isMounted.current = true
    fetchData()
    return () => {
      isMounted.current = false
    }
  }, [fetchData])

  return { data, isLoading, error, refetch: fetchData }
}
