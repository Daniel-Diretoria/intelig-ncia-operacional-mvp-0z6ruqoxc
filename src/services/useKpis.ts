import { useState, useEffect, useCallback, useRef } from 'react'
import { getBaseAtualSnapshot, type BaseAtualSnapshot } from '@/lib/selectors'
import type { KpiSummary, ChartCategoryData, ChartRupturaPeriodData } from '@/types'

export interface UseKpisResult {
  data: {
    summary: KpiSummary
    categoryDistribution: ChartCategoryData[]
    rupturasOverTime: ChartRupturaPeriodData[]
  } | null
  isLoading: boolean
  error: Error | null
  refetch: () => Promise<void>
}

export function useKpis(): UseKpisResult {
  const [data, setData] = useState<UseKpisResult['data']>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<Error | null>(null)
  const isMounted = useRef(true)

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const snapshot: BaseAtualSnapshot = await getBaseAtualSnapshot()
      const kpis = snapshot.kpisReconciliados

      // Distribuição por status operacional (em vez de categoria inventada)
      const distributionMap: Record<
        string,
        { critico: number; proximo: number; ok: number; total: number }
      > = {
        '0 a 15 dias (Crítico)': {
          critico: kpis.validadesCriticas,
          proximo: 0,
          ok: 0,
          total: kpis.validadesCriticas,
        },
        '16 a 25 dias (Atenção)': {
          critico: 0,
          proximo: kpis.validadesAtencao,
          ok: 0,
          total: kpis.validadesAtencao,
        },
        '26 a 35 dias (Moderado)': {
          critico: 0,
          proximo: kpis.validadesModerado,
          ok: 0,
          total: kpis.validadesModerado,
        },
        '36+ dias (Normal)': {
          critico: 0,
          proximo: 0,
          ok: kpis.validadesNormal,
          total: kpis.validadesNormal,
        },
      }

      const categoryDistribution: ChartCategoryData[] = Object.entries(distributionMap).map(
        ([statusName, counts]) => ({
          category: statusName as unknown as import('@/types').ValidadeItem['category'],
          critico: counts.critico,
          proximo: counts.proximo,
          ok: counts.ok,
          total: counts.total,
        }),
      )

      // Rupturas por motivo na Base Atual
      const rupturasTotal = snapshot.rupturasAtivas.filter((r) => r.situacao_atual === 'Ativo')
      const ruptTotalCount = rupturasTotal.filter((r) => r.motivo === 'Ruptura Total').length
      const semEstoqueCount = rupturasTotal.filter((r) => r.motivo === 'Sem Estoque Mínimo').length
      const virtualCount = rupturasTotal.filter((r) => r.motivo === 'Estoque Virtual').length

      const summary: KpiSummary = {
        validadesCriticas: {
          count: kpis.validadesCriticas,
          delta: `${kpis.validadesCriticas} ocorrência(s) crítica(s)`,
          trend: 'neutral',
        },
        rupturasAtivas: {
          count: kpis.rupturasAtivasTotal,
          delta: `${kpis.rupturasAtivasTotal} ocorrência(s) na Base Atual`,
          trend: 'neutral',
        },
        alertasAbertos: {
          count: kpis.alertasAbertosTotal,
          delta: `${kpis.alertasAbertosTotal} alerta(s) aberto(s)`,
          trend: 'neutral',
        },
        produtosEmRisco: {
          count: kpis.produtosDistintosEmRisco,
          delta: `${kpis.produtosDistintosEmRisco} produto(s) distinto(s)`,
          trend: 'neutral',
        },
        validadesStatusCounts: {
          critico: kpis.validadesCriticas,
          proximo: kpis.validadesAtencao + kpis.validadesModerado,
          ok: kpis.validadesNormal,
        },
        rupturasStatusCounts: {
          emRuptura: ruptTotalCount,
          critico: semEstoqueCount,
          reposicaoPrevista: virtualCount,
        },
      }

      const rupturasOverTime: ChartRupturaPeriodData[] = [
        {
          period: 'Base Atual',
          total: kpis.rupturasAtivasTotal,
          ativas: kpis.rupturasAtivasTotal,
          resolvidos: 0,
        },
      ]

      if (isMounted.current) {
        setData({
          summary,
          categoryDistribution,
          rupturasOverTime,
        })
      }
    } catch (err) {
      if (isMounted.current) {
        setError(err instanceof Error ? err : new Error('Erro ao carregar indicadores'))
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

  return { data, isLoading, error, refetch: fetchData }
}
