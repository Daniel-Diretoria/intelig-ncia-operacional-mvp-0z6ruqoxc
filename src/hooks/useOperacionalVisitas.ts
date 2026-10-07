import { useState, useEffect, useCallback, useMemo } from 'react'
import pb from '@/lib/pocketbase/client'
import {
  getOperacionalVisitas,
  getCadastrosPromotores,
  getCadastrosLojas,
  getCadastrosSupervisores,
  getPromoterAssignments,
} from '@/services/cadastrosService'
import type {
  OperacionalVisita,
  CadastroPromotor,
  CadastroLoja,
  CadastroSupervisor,
  CadastroPromotorAssignment,
} from '@/types/cadastros'

export interface VisitaPorPromotorResumo {
  promoterId?: string
  promoterCod: string
  promoterNome: string
  supervisorNome: string
  primeiraVisitaRegistrada?: string // "08:12" ou undefined
  lojaAtualOuUltima?: {
    storeCode: string
    storeName: string
    horaRegistro?: string
  }
  qtdLojasVisitadas: number
  visitasConcluidas: number
  visitasSemSaida: number
  pesquisasRealizadas?: number // undefined se a fonte não fornecer
  pendenciasOperacionais?: number // undefined se a fonte não fornecer
  visitas: OperacionalVisita[]
}

export interface VisitaPorLojaResumo {
  storeCode: string
  storeName: string
  storeId?: string
  visitasHoje: OperacionalVisita[]
  promotoresComRegistro: Array<{
    promoterNome: string
    promoterCod: string
    horaInicio?: string
    horaFim?: string
    duracaoMinutos?: number
    origemFonte: string
  }>
  primeiroRegistro?: string
  ultimoRegistro?: string
  temVisitaSemSaida: boolean
}

export interface UseOperacionalVisitasResult {
  visitas: OperacionalVisita[]
  promotores: CadastroPromotor[]
  lojas: CadastroLoja[]
  supervisores: CadastroSupervisor[]
  assignments: CadastroPromotorAssignment[]
  isLoading: boolean
  isFonteSincronizada: boolean // false se não houver registros em operacional_visitas
  totalVisitas: number
  promotoresComRegistroCount: number
  lojasAtendidasCount: number
  promotoresResumo: VisitaPorPromotorResumo[]
  lojasResumo: VisitaPorLojaResumo[]
  refetch: () => Promise<void>
}

export function useOperacionalVisitas(filtroData?: string): UseOperacionalVisitasResult {
  const [visitas, setVisitas] = useState<OperacionalVisita[]>([])
  const [promotores, setPromotores] = useState<CadastroPromotor[]>([])
  const [lojas, setLojas] = useState<CadastroLoja[]>([])
  const [supervisores, setSupervisores] = useState<CadastroSupervisor[]>([])
  const [assignments, setAssignments] = useState<CadastroPromotorAssignment[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [isFonteSincronizada, setIsFonteSincronizada] = useState<boolean>(true)

  const loadData = useCallback(async () => {
    setIsLoading(true)
    try {
      let visList: OperacionalVisita[] = []
      try {
        const rawVis = await pb.collection('operacional_visitas').getList(1, 1000, {
          sort: '-data,-hora_inicio,-created',
        })
        visList = (rawVis.items || []).map((it) => ({
          id: it.id,
          data: (it.data as string) || '',
          promoter_id: (it.promoter_id as string) || '',
          promoter_cod: (it.promoter_cod as string) || '',
          promoter_nome: (it.promoter_nome as string) || '',
          store_id: (it.store_id as string) || '',
          store_code: (it.store_code as string) || '',
          store_name: (it.store_name as string) || (it.store_nome as string) || '',
          industry_name: (it.industry_name as string) || undefined,
          hora_inicio: (it.hora_inicio as string) || (it.hora_entrada as string) || undefined,
          hora_fim: (it.hora_fim as string) || (it.hora_saida as string) || undefined,
          duracao_minutos:
            typeof it.duracao_minutos === 'number' && it.duracao_minutos > 0
              ? it.duracao_minutos
              : undefined,
          status_roteiro: (it.status_roteiro as string) || (it.status as string) || 'concluida',
          origem_fonte: (it.origem_fonte as string) || (it.origem as string) || 'tradepro_api',
          observacao: it.observacao as string,
          dados_brutos_json: it.dados_brutos_json as Record<string, unknown> | undefined,
        }))
        setIsFonteSincronizada(rawVis.totalItems > 0)
      } catch {
        visList = await getOperacionalVisitas()
        setIsFonteSincronizada(visList.length > 0)
      }

      const [promList, storeList, supList, assignList] = await Promise.all([
        getCadastrosPromotores().catch(() => []),
        getCadastrosLojas().catch(() => []),
        getCadastrosSupervisores().catch(() => []),
        getPromoterAssignments().catch(() => []),
      ])

      setVisitas(visList)
      setPromotores(promList)
      setLojas(storeList)
      setSupervisores(supList)
      setAssignments(assignList)
    } catch (err) {
      console.warn('[useOperacionalVisitas] Erro ao carregar visitas operacionais:', err)
      setVisitas([])
      setIsFonteSincronizada(false)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Filtragem básica por data caso informada
  const visitasFiltradas = useMemo(() => {
    if (!filtroData) return visitas
    return visitas.filter((v) => v.data === filtroData)
  }, [visitas, filtroData])

  // Mapas auxiliares para resolução de nomes e supervisores
  const promoterMapByCod = useMemo(() => {
    const map = new Map<string, CadastroPromotor>()
    for (const p of promotores) {
      if (p.codigo_externo) map.set(p.codigo_externo.trim(), p)
      if (p.id) map.set(p.id, p)
    }
    return map
  }, [promotores])

  const supervisorMapById = useMemo(() => {
    const map = new Map<string, CadastroSupervisor>()
    for (const s of supervisores) {
      if (s.id) map.set(s.id, s)
      if (s.codigo_externo) map.set(s.codigo_externo.trim(), s)
    }
    return map
  }, [supervisores])

  // Resumo agrupado POR PROMOTOR
  const promotoresResumo = useMemo<VisitaPorPromotorResumo[]>(() => {
    const map = new Map<string, OperacionalVisita[]>()

    for (const v of visitasFiltradas) {
      const key = v.promoter_cod || v.promoter_id || v.promoter_nome
      if (!key) continue
      const list = map.get(key) || []
      list.push(v)
      map.set(key, list)
    }

    const result: VisitaPorPromotorResumo[] = []

    for (const [key, visList] of map.entries()) {
      // Ordena por horário de início (ascendente)
      const sorted = [...visList].sort((a, b) => {
        const ha = a.hora_inicio || '99:99'
        const hb = b.hora_inicio || '99:99'
        return ha.localeCompare(hb)
      })

      const first = sorted[0]
      const last = sorted[sorted.length - 1]

      // Encontra promotor nos cadastros mestres
      const promCadastro =
        promoterMapByCod.get(first.promoter_cod || '') ||
        promoterMapByCod.get(first.promoter_id || '')

      let supNome = ''
      if (promCadastro?.supervisor_nome) {
        supNome = promCadastro.supervisor_nome
      } else if (promCadastro?.supervisor_id) {
        supNome = supervisorMapById.get(promCadastro.supervisor_id)?.nome || ''
      }

      // Se nos dados brutos do TradePro houver o supervisor, usa como fallback factual
      if (!supNome && first.dados_brutos_json) {
        const rawItem = (first.dados_brutos_json as any)?.itemPromotor
        if (rawItem?.nomeSupervisor) {
          supNome = String(rawItem.nomeSupervisor).trim()
        }
      }

      // Extração estritamente factual de pesquisas se a fonte fornecer nos dados brutos
      let pesquisasCount: number | undefined = undefined
      let pendenciasCount: number | undefined = undefined

      for (const v of visList) {
        if (v.dados_brutos_json) {
          const rawItem = (v.dados_brutos_json as any)?.itemPromotor || (v.dados_brutos_json as any)
          if (typeof rawItem?.pesquisasRealizadas === 'number') {
            pesquisasCount = (pesquisasCount || 0) + rawItem.pesquisasRealizadas
          }
          if (typeof rawItem?.pendencias === 'number') {
            pendenciasCount = (pendenciasCount || 0) + rawItem.pendencias
          }
        }
      }

      // Lojas distintas visitadas
      const lojasSet = new Set(visList.map((v) => v.store_code).filter(Boolean))

      // Visitas concluídas (com saída registrada ou status concluida/realizada)
      const concluidas = visList.filter(
        (v) =>
          Boolean(v.hora_fim) ||
          v.status_roteiro === 'realizada' ||
          v.status_roteiro === 'concluida',
      ).length

      // Visitas sem saída registrada (quando tem hora_inicio mas não tem hora_fim)
      const semSaida = visList.filter((v) => Boolean(v.hora_inicio) && !v.hora_fim).length

      // Primeira visita registrada
      const primeiraVisita = sorted.find((v) => Boolean(v.hora_inicio))?.hora_inicio

      // Última loja registrada
      const ultimaLoja = last.store_code
        ? {
            storeCode: last.store_code,
            storeName: last.store_name || `Loja ${last.store_code}`,
            horaRegistro: last.hora_fim || last.hora_inicio,
          }
        : undefined

      result.push({
        promoterId: first.promoter_id,
        promoterCod: first.promoter_cod || key,
        promoterNome: first.promoter_nome || 'Promotor não identificado',
        supervisorNome: supNome || 'Sem dado na fonte',
        primeiraVisitaRegistrada: primeiraVisita,
        lojaAtualOuUltima: ultimaLoja,
        qtdLojasVisitadas: lojasSet.size,
        visitasConcluidas: concluidas,
        visitasSemSaida: semSaida,
        pesquisasRealizadas: pesquisasCount,
        pendenciasOperacionais: pendenciasCount,
        visitas: sorted,
      })
    }

    // Ordena por nome do promotor
    result.sort((a, b) => a.promoterNome.localeCompare(b.promoterNome, 'pt-BR'))
    return result
  }, [visitasFiltradas, promoterMapByCod, supervisorMapById])

  // Resumo agrupado POR LOJA
  const lojasResumo = useMemo<VisitaPorLojaResumo[]>(() => {
    const map = new Map<string, OperacionalVisita[]>()

    for (const v of visitasFiltradas) {
      if (!v.store_code) continue
      const list = map.get(v.store_code) || []
      list.push(v)
      map.set(v.store_code, list)
    }

    const result: VisitaPorLojaResumo[] = []

    for (const [storeCode, visList] of map.entries()) {
      // Ordena por horário
      const sorted = [...visList].sort((a, b) => {
        const ha = a.hora_inicio || '99:99'
        const hb = b.hora_inicio || '99:99'
        return ha.localeCompare(hb)
      })

      const first = sorted[0]
      const storeName = first.store_name || `Loja ${storeCode}`

      const promotoresComRegistro = sorted.map((v) => ({
        promoterNome: v.promoter_nome,
        promoterCod: v.promoter_cod || '',
        horaInicio: v.hora_inicio,
        horaFim: v.hora_fim,
        duracaoMinutos: v.duracao_minutos,
        origemFonte: v.origem_fonte,
      }))

      const primeiroRegistro = sorted.find((v) => Boolean(v.hora_inicio))?.hora_inicio
      const ultimoRegistro = sorted
        .slice()
        .reverse()
        .find((v) => Boolean(v.hora_fim || v.hora_inicio))
      const ultimoHorario = ultimoRegistro?.hora_fim || ultimoRegistro?.hora_inicio

      const temVisitaSemSaida = sorted.some((v) => Boolean(v.hora_inicio) && !v.hora_fim)

      result.push({
        storeCode,
        storeName,
        storeId: first.store_id,
        visitasHoje: sorted,
        promotoresComRegistro,
        primeiroRegistro,
        ultimoRegistro: ultimoHorario,
        temVisitaSemSaida,
      })
    }

    result.sort((a, b) => a.storeName.localeCompare(b.storeName, 'pt-BR'))
    return result
  }, [visitasFiltradas])

  const totalVisitas = visitasFiltradas.length
  const promotoresComRegistroCount = new Set(
    visitasFiltradas.map((v) => v.promoter_cod || v.promoter_nome).filter(Boolean),
  ).size
  const lojasAtendidasCount = new Set(visitasFiltradas.map((v) => v.store_code).filter(Boolean))
    .size

  return {
    visitas: visitasFiltradas,
    promotores,
    lojas,
    supervisores,
    assignments,
    isLoading,
    isFonteSincronizada,
    totalVisitas,
    promotoresComRegistroCount,
    lojasAtendidasCount,
    promotoresResumo,
    lojasResumo,
    refetch: loadData,
  }
}
