import { useCallback, useEffect, useRef, useState } from 'react'
import pb from '@/lib/pocketbase/client'

/**
 * Hook de Auditoria — lê ocorrências Vencidas da `validades_base`
 * (is_base_atual = true && status_operacional = 'Vencido') e mantém as
 * ações de sinalizar/confirmar contra a collection `auditoria_pendencias`.
 *
 * Todos os dados são reais (PocketBase) — sem mock.
 */

export type StatusAuditoria = 'pendente' | 'corrigido' | 'confirmado'

export interface AuditoriaOcorrencia {
  id: string
  chaveOperacional: string
  produto: string
  codigoLoja: string
  nomeLoja: string
  loja: string
  quantidade: number
  validadeEfetiva: string
  diasVencido: number
  dataEntrada: string
  promotor: string
  supervisor: string
  sinalizadoCorrecao: boolean
  statusAuditoria?: StatusAuditoria
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
    sinalizadoPor: string,
  ) => Promise<void>
  confirmarLegitimo: (ocorrencia: AuditoriaOcorrencia, sinalizadoPor: string) => Promise<void>
}

/** Mapa de status_auditoria (auditoria_pendencias) por validade_base_id. */
async function fetchStatusMap(): Promise<Map<string, StatusAuditoria>> {
  const map = new Map<string, StatusAuditoria>()
  try {
    // getFullList com paginação automática do SDK.
    const records = await pb.collection('auditoria_pendencias').getFullList({
      sort: '-created',
    })
    for (const r of records) {
      const rec = r as unknown as Record<string, unknown>
      const baseId = (rec.validade_base_id as string) || ''
      const status = (rec.status_auditoria as StatusAuditoria) || 'pendente'
      if (baseId) map.set(baseId, status)
    }
  } catch {
    // ignore — tratado como sem pendências
  }
  return map
}

export function useAuditoria(): UseAuditoriaResult {
  const [ocorrencias, setOcorrencias] = useState<AuditoriaOcorrencia[]>([])
  const [resumo, setResumo] = useState<AuditoriaResumo>({
    totalVencidos: 0,
    pendentes: 0,
    confirmados: 0,
    sinalizados: 0,
  })
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const isMounted = useRef(true)

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const records = await pb.collection('validades_base').getFullList({
        sort: '-dias_vencimento_atual',
        filter: 'is_base_atual = true && status_operacional = "Vencido"',
      })
      const statusMap = await fetchStatusMap()

      const items: AuditoriaOcorrencia[] = records.map((r) => {
        const rec = r as unknown as Record<string, unknown>
        const codigoLoja = (rec.codigo_loja as string) || ''
        const nomeLoja = (rec.nome_loja as string) || (rec.razao_social as string) || ''
        const loja = codigoLoja && nomeLoja ? `${codigoLoja} • ${nomeLoja}` : nomeLoja || codigoLoja
        return {
          id: rec.id as string,
          chaveOperacional: (rec.chave_operacional as string) || '',
          produto: (rec.produto as string) || '',
          codigoLoja,
          nomeLoja,
          loja,
          quantidade:
            typeof rec.quantidade === 'number' ? rec.quantidade : Number(rec.quantidade) || 0,
          validadeEfetiva: (rec.validade_efetiva as string) || '',
          diasVencido:
            typeof rec.dias_vencimento_atual === 'number'
              ? rec.dias_vencimento_atual
              : Number(rec.dias_vencimento_atual) || 0,
          dataEntrada: (rec.data_entrada as string) || '',
          promotor: (rec.colaborador as string) || '',
          supervisor: (rec.supervisor as string) || '',
          sinalizadoCorrecao: Boolean(rec.sinalizado_correcao),
          statusAuditoria: statusMap.get(rec.id as string),
        }
      })

      if (!isMounted.current) return
      setOcorrencias(items)

      const pendentes = items.filter(
        (i) => i.sinalizadoCorrecao && i.statusAuditoria === 'pendente',
      ).length
      const confirmados = items.filter((i) => i.statusAuditoria === 'confirmado').length
      const sinalizados = items.filter((i) => i.sinalizadoCorrecao).length

      setResumo({
        totalVencidos: items.length,
        pendentes,
        confirmados,
        sinalizados,
      })
    } catch (err) {
      if (isMounted.current) {
        setError(err instanceof Error ? err : new Error('Erro ao carregar auditoria'))
      }
    } finally {
      if (isMounted.current) setIsLoading(false)
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
    async (
      ocorrencia: AuditoriaOcorrencia,
      motivo: string,
      sinalizadoPor: string,
    ): Promise<void> => {
      const now = new Date().toISOString().slice(0, 10)
      // 1. Marca a ocorrência na Base Atual (flag + status auditoria).
      await pb.collection('validades_base').update(ocorrencia.id, {
        sinalizado_correcao: true,
        status_auditoria: 'pendente',
      })
      // 2. Cria (ou atualiza) a pendência em auditoria_pendencias.
      //    Busca pendência existente para a mesma ocorrência.
      let pendenciaId: string | undefined
      try {
        const found = await pb.collection('auditoria_pendencias').getList(1, 1, {
          filter: `validade_base_id = "${ocorrencia.id}"`,
        })
        if (found.items.length > 0) {
          pendenciaId = (found.items[0] as unknown as { id: string }).id
        }
      } catch {
        // ignora — cria nova
      }

      const payload = {
        validade_base_id: ocorrencia.id,
        chave_operacional: ocorrencia.chaveOperacional,
        produto: ocorrencia.produto,
        loja: ocorrencia.loja,
        codigo_loja: ocorrencia.codigoLoja,
        quantidade: ocorrencia.quantidade,
        validade_efetiva: ocorrencia.validadeEfetiva,
        dias_vencido: ocorrencia.diasVencido,
        data_entrada: ocorrencia.dataEntrada || undefined,
        promotor: ocorrencia.promotor,
        supervisor: ocorrencia.supervisor,
        motivo_sinalizacao: motivo,
        sinalizado_por: sinalizadoPor,
        sinalizado_em: now,
        status_auditoria: 'pendente' as StatusAuditoria,
      }

      if (pendenciaId) {
        await pb.collection('auditoria_pendencias').update(pendenciaId, payload)
      } else {
        await pb.collection('auditoria_pendencias').create(payload)
      }

      await fetchData()
    },
    [fetchData],
  )

  const confirmarLegitimo = useCallback(
    async (ocorrencia: AuditoriaOcorrencia, sinalizadoPor: string): Promise<void> => {
      const now = new Date().toISOString().slice(0, 10)
      // Marca a ocorrência na Base Atual como confirmada (mantém Vencido, verificado).
      await pb.collection('validades_base').update(ocorrencia.id, {
        status_auditoria: 'confirmado',
      })

      // Cria/atualiza pendência com status confirmado (registro de auditoria).
      let pendenciaId: string | undefined
      try {
        const found = await pb.collection('auditoria_pendencias').getList(1, 1, {
          filter: `validade_base_id = "${ocorrencia.id}"`,
        })
        if (found.items.length > 0) {
          pendenciaId = (found.items[0] as unknown as { id: string }).id
        }
      } catch {
        // ignora — cria nova
      }

      const payload = {
        validade_base_id: ocorrencia.id,
        chave_operacional: ocorrencia.chaveOperacional,
        produto: ocorrencia.produto,
        loja: ocorrencia.loja,
        codigo_loja: ocorrencia.codigoLoja,
        quantidade: ocorrencia.quantidade,
        validade_efetiva: ocorrencia.validadeEfetiva,
        dias_vencido: ocorrencia.diasVencido,
        data_entrada: ocorrencia.dataEntrada || undefined,
        promotor: ocorrencia.promotor,
        supervisor: ocorrencia.supervisor,
        motivo_sinalizacao: 'Confirmado como Vencido legítimo (verificado).',
        sinalizado_por: sinalizadoPor,
        sinalizado_em: now,
        status_auditoria: 'confirmado' as StatusAuditoria,
      }

      if (pendenciaId) {
        await pb.collection('auditoria_pendencias').update(pendenciaId, payload)
      } else {
        await pb.collection('auditoria_pendencias').create(payload)
      }

      await fetchData()
    },
    [fetchData],
  )

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
