import { useState, useEffect, useCallback, useRef } from 'react'
import {
  getBaseAtualSnapshot,
  type BaseAtualSnapshot,
  type ValidadeItemAuditoria,
} from '@/lib/selectors'
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

export interface AuditoriaResumo {
  totalVencidos: number
  pendentes: number
  confirmados: number
  sinalizados: number
}

export interface UseAuditoriaResult {
  ocorrencias: AuditoriaOcorrencia[]
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
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<Error | null>(null)
  const isMounted = useRef(true)

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const snapshot: BaseAtualSnapshot = await getBaseAtualSnapshot()
      const rawAuditoria = snapshot.validadesAuditoria

      // Busca pendências de auditoria registradas em auditoria_pendencias
      let pendenciasMap = new Map<string, Record<string, unknown>>()
      try {
        const pendencias = await pb.collection('auditoria_pendencias').getFullList()
        pendencias.forEach((p) => {
          const r = p as unknown as Record<string, unknown>
          if (r.validades_base_id) {
            pendenciasMap.set(String(r.validades_base_id), r)
          }
        })
      } catch {
        // ignore
      }

      const lista: AuditoriaOcorrencia[] = rawAuditoria.map((item: ValidadeItemAuditoria) => {
        const pend = pendenciasMap.get(item.id)
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
          sinalizadoCorrecao: pend ? true : false,
          statusAuditoria: pend
            ? (pend.status as AuditoriaOcorrencia['statusAuditoria'])
            : undefined,
          motivoCorrecao: pend ? (pend.motivo as string) : undefined,
        }
      })

      if (isMounted.current) {
        setOcorrencias(lista)
      }
    } catch (err) {
      if (isMounted.current) {
        setError(err instanceof Error ? err : new Error('Erro ao carregar auditoria'))
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

  const resumo: AuditoriaResumo = {
    totalVencidos: ocorrencias.length,
    pendentes: ocorrencias.filter((o) => o.statusAuditoria === 'pendente').length,
    confirmados: ocorrencias.filter((o) => o.statusAuditoria === 'confirmado').length,
    sinalizados: ocorrencias.filter((o) => o.sinalizadoCorrecao).length,
  }

  return {
    ocorrencias,
    resumo,
    isLoading,
    error,
    refetch: fetchData,
    sinalizarCorrecao,
    confirmarLegitimo,
  }
}
