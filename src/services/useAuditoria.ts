import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  getBaseAtualSnapshot,
  type BaseAtualSnapshot,
  type ValidadeItemAuditoria,
} from '@/lib/selectors'
import { useRupturas } from '@/services/useRupturas'
import type { ConflitoAuditoria } from '@/lib/engine/confrontoBidirecional'
import pb from '@/lib/pocketbase/client'

export interface AuditoriaOcorrencia {
  id: string
  produto: string
  loja: string
  codigoLoja: string
  quantidade: number
  validadeEfetiva: string
  diasVencido: number
  dataEntrada: string
  promotor: string
  supervisor: string
  sinalizadoCorrecao?: boolean
  statusAuditoria?: 'pendente' | 'corrigido' | 'confirmado'
  motivoCorrecao?: string
  motivoAuditoria?: 'Vencido' | 'Data inválida'
}

export interface AuditoriaConflitoItem {
  id: string
  chave: string
  loja: string
  marca: string
  produto: string
  dataRuptura: string
  dataValidade: string
  motivo: string
}

export interface AuditoriaResumo {
  totalVencidos: number
  pendentes: number
  confirmados: number
  sinalizados: number
  totalConflitos: number
}

export interface UseAuditoriaResult {
  ocorrencias: AuditoriaOcorrencia[]
  conflitos: AuditoriaConflitoItem[]
  resumo: AuditoriaResumo
  isLoading: boolean
  error: Error | null
  refetch: () => Promise<void>
  sinalizarCorrecao: (
    ocorrencia: AuditoriaOcorrencia,
    motivo: string,
    usuario: string,
  ) => Promise<void>
  confirmarLegitimo: (ocorrencia: AuditoriaOcorrencia, usuario: string) => Promise<void>
}

export function useAuditoria(): UseAuditoriaResult {
  const [ocorrencias, setOcorrencias] = useState<AuditoriaOcorrencia[]>([])
  const [isLoadingSnapshot, setIsLoadingSnapshot] = useState<boolean>(true)
  const [snapshotError, setSnapshotError] = useState<Error | null>(null)
  const isMounted = useRef(true)

  const {
    conflitos: rawConflitos,
    isLoading: isLoadingRupturas,
    error: errorRupturas,
    refetch: refetchRupturas,
  } = useRupturas()

  const fetchData = useCallback(async () => {
    setIsLoadingSnapshot(true)
    setSnapshotError(null)
    try {
      const snapshot: BaseAtualSnapshot = await getBaseAtualSnapshot()
      const rawAuditoria = snapshot.validadesAuditoria

      const lista: AuditoriaOcorrencia[] = rawAuditoria.map((item: ValidadeItemAuditoria) => {
        return {
          id: item.id,
          produto: item.product,
          loja: item.loja,
          codigoLoja: item.codigoLoja || '',
          quantidade: item.quantidade ?? item.estoque,
          validadeEfetiva: item.validade,
          diasVencido: item.diasVencido,
          dataEntrada: item.dataEntrada || '',
          promotor: item.promotor || '',
          supervisor: item.supervisor || '',
          motivoAuditoria: item.motivoAuditoria,
          sinalizadoCorrecao: false,
          statusAuditoria: undefined,
          motivoCorrecao: undefined,
        }
      })

      if (isMounted.current) {
        setOcorrencias(lista)
      }
    } catch (err) {
      if (isMounted.current) {
        setSnapshotError(err instanceof Error ? err : new Error('Erro ao carregar auditoria'))
      }
    } finally {
      if (isMounted.current) {
        setIsLoadingSnapshot(false)
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

  const refetch = useCallback(async () => {
    await Promise.all([fetchData(), refetchRupturas()])
  }, [fetchData, refetchRupturas])

  const sinalizarCorrecao = useCallback(
    async (ocorrencia: AuditoriaOcorrencia, motivo: string, usuario: string) => {
      try {
        await pb.collection('auditoria_pendencias').create({
          validades_base_id: ocorrencia.id,
          status: 'pendente',
          motivo,
          usuario_solicitante: usuario,
          produto: ocorrencia.produto,
          loja: ocorrencia.loja,
          codigo_loja: ocorrencia.codigoLoja,
          quantidade: ocorrencia.quantidade,
          validade_original: ocorrencia.validadeEfetiva,
          dias_vencido: ocorrencia.diasVencido,
        })
      } catch (err) {
        console.warn('[useAuditoria] Falha ao persistir em auditoria_pendencias:', err)
      }

      setOcorrencias((prev) =>
        prev.map((o) =>
          o.id === ocorrencia.id
            ? {
                ...o,
                sinalizadoCorrecao: true,
                statusAuditoria: 'pendente',
                motivoCorrecao: motivo,
              }
            : o,
        ),
      )
    },
    [],
  )

  const confirmarLegitimo = useCallback(
    async (ocorrencia: AuditoriaOcorrencia, usuario: string) => {
      try {
        await pb.collection('auditoria_pendencias').create({
          validades_base_id: ocorrencia.id,
          status: 'confirmado',
          motivo: 'Confirmado legítimo (verificado)',
          usuario_solicitante: usuario,
          produto: ocorrencia.produto,
          loja: ocorrencia.loja,
          codigo_loja: ocorrencia.codigoLoja,
          quantidade: ocorrencia.quantidade,
          validade_original: ocorrencia.validadeEfetiva,
          dias_vencido: ocorrencia.diasVencido,
        })
      } catch (err) {
        console.warn('[useAuditoria] Falha ao persistir confirmação:', err)
      }

      setOcorrencias((prev) =>
        prev.map((o) =>
          o.id === ocorrencia.id
            ? { ...o, statusAuditoria: 'confirmado', motivoCorrecao: 'Confirmado' }
            : o,
        ),
      )
    },
    [],
  )

  const conflitos: AuditoriaConflitoItem[] = useMemo(() => {
    return (rawConflitos || []).map((c: ConflitoAuditoria, idx: number) => {
      const stableId = `conf:${c.chave || ''}:${c.origemRuptura || ''}:${c.origemValidade || ''}:${idx}`
      return {
        id: stableId,
        chave: c.chave,
        loja: c.loja,
        marca: c.marca,
        produto: c.produto,
        dataRuptura: c.dataRuptura,
        dataValidade: c.dataValidade,
        motivo: c.motivo,
      }
    })
  }, [rawConflitos])

  const resumo: AuditoriaResumo = useMemo(() => {
    return {
      totalVencidos: ocorrencias.length,
      pendentes: ocorrencias.filter((o) => o.statusAuditoria === 'pendente').length,
      confirmados: ocorrencias.filter((o) => o.statusAuditoria === 'confirmado').length,
      sinalizados: ocorrencias.filter((o) => o.sinalizadoCorrecao).length,
      totalConflitos: conflitos.length,
    }
  }, [ocorrencias, conflitos])

  const isLoading = isLoadingSnapshot || isLoadingRupturas
  const error = snapshotError || errorRupturas

  return {
    ocorrencias,
    conflitos,
    resumo,
    isLoading,
    error,
    refetch,
    sinalizarCorrecao,
    confirmarLegitimo,
  }
}
