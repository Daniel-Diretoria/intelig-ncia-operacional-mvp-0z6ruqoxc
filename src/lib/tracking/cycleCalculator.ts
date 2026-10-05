import type {
  ResearchFrequency,
  ResearchDay,
  ResearchType,
  IndustryResearchConfig,
} from '@/types/industryOperational'
import type { ResearchCycle } from '@/types/operationalTracking'

export const DIA_SEMANA_MAP: Record<ResearchDay, number> = {
  domingo: 0,
  segunda: 1,
  terca: 2,
  quarta: 3,
  quinta: 4,
  sexta: 5,
  sabado: 6,
  qualquer: -1,
}

/**
 * Converte data para string YYYY-MM-DD
 */
export function formatIsoDateOnly(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Faz parse de YYYY-MM-DD com segurança em UTC ou local evitando offset indesejado
 */
export function parseIsoDateOnly(isoString: string): Date {
  const parts = (isoString || '').slice(0, 10).split('-')
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10)
    const m = parseInt(parts[1], 10) - 1
    const d = parseInt(parts[2], 10)
    return new Date(y, m, d, 12, 0, 0)
  }
  return new Date(isoString)
}

/**
 * Retorna o dia da semana esperado da pesquisa (0 a 6).
 * Se configurado como "qualquer" ou indefinido, assume terça-feira (2) como fallback operacional.
 */
export function getTargetDayOfWeek(diaEsperado?: ResearchDay): number {
  if (!diaEsperado || diaEsperado === 'qualquer') return 2 // terça
  return DIA_SEMANA_MAP[diaEsperado] ?? 2
}

/**
 * Encontra a data do ciclo esperado imediatamente anterior ou igual a uma data de referência.
 */
export function findMostRecentCycleDate(referenceDate: Date, diaEsperado: ResearchDay): Date {
  const targetDay = getTargetDayOfWeek(diaEsperado)
  const current = new Date(referenceDate)
  current.setHours(12, 0, 0, 0)

  const currentDay = current.getDay()
  let diff = currentDay - targetDay
  if (diff < 0) {
    diff += 7
  }
  current.setDate(current.getDate() - diff)
  return current
}

/**
 * Calcula a lista de ciclos esperados passados e o atual para uma indústria/pesquisa
 * considerando a frequência e dia esperado.
 *
 * @param config Configuração de pesquisa da indústria (frequência, dia_esperado)
 * @param referenceDate Data de referência (hoje ou data do último dado)
 * @param count Quantidade de ciclos para trás a retornar (ex: 5 ciclos)
 */
export function generateExpectedCycles(
  config: Partial<IndustryResearchConfig>,
  referenceDate: Date = new Date(),
  count = 6,
): ResearchCycle[] {
  const frequencia = config.frequencia || 'semanal'
  const diaEsperado = config.dia_esperado || 'terca'

  // Primeiro encontra a data base mais recente do dia esperado
  const baseCycleDate = findMostRecentCycleDate(referenceDate, diaEsperado)
  const cycles: ResearchCycle[] = []

  // Passo em dias por ciclo conforme frequência
  let stepDays = 7
  if (frequencia === 'diaria') stepDays = 1
  else if (frequencia === 'semanal') stepDays = 7
  else if (frequencia === 'quinzenal') stepDays = 14
  else if (frequencia === 'mensal') stepDays = 28 // 4 semanas

  for (let i = 0; i < count; i++) {
    const cycleDate = new Date(baseCycleDate)
    cycleDate.setDate(baseCycleDate.getDate() - i * stepDays)
    const isoDate = formatIsoDateOnly(cycleDate)

    cycles.push({
      cicloId: `${config.tipo_pesquisa || 'validades'}-${isoDate}`,
      dataEsperada: isoDate,
      frequencia,
      diaEsperado,
      ehCicloAtual: i === 0,
    })
  }

  return cycles
}

/**
 * Determina a qual ciclo uma data de atualização (realizado ou data_visita) pertence.
 * Uma atualização realizada dentro da tolerância do ciclo (ex: até a véspera do próximo ciclo)
 * pertence ao ciclo mais próximo.
 */
export function mapDateToCycle(
  actionDateStr: string,
  expectedCycles: ResearchCycle[],
): ResearchCycle | null {
  if (!actionDateStr || expectedCycles.length === 0) return null
  const actionDate = parseIsoDateOnly(actionDateStr).getTime()

  // Encontra o ciclo com menor distância temporal da data
  let closestCycle: ResearchCycle | null = null
  let minDiff = Infinity

  for (const cycle of expectedCycles) {
    const cycleDate = parseIsoDateOnly(cycle.dataEsperada).getTime()
    const diff = Math.abs(actionDate - cycleDate)

    // Se estiver razoavelmente próximo (janela correspondente à frequência)
    const maxDistanceDays =
      cycle.frequencia === 'quinzenal' ? 10 : cycle.frequencia === 'mensal' ? 20 : 5
    const maxDistanceMs = maxDistanceDays * 24 * 60 * 60 * 1000

    if (diff <= maxDistanceMs && diff < minDiff) {
      minDiff = diff
      closestCycle = cycle
    }
  }

  return closestCycle
}

/**
 * Calcula a quantidade de CICLOS ESPERADOS consecutivos sem atualização.
 * NÃO calcula por quantidade fixa de dias.
 *
 * @param lastUpdatedDateStr Data da última atualização conhecida do produto
 * @param expectedCycles Lista ordenada de ciclos esperados (mais recente primeiro: [ciclo_0, ciclo_1, ...])
 */
export function calculateCyclesMissed(
  lastUpdatedDateStr: string | undefined | null,
  expectedCycles: ResearchCycle[],
): {
  ciclosSemAtualizacao: number
  ultimoCicloAcompanhado?: string
} {
  if (expectedCycles.length === 0) {
    return { ciclosSemAtualizacao: 0 }
  }

  if (!lastUpdatedDateStr) {
    // Se nunca foi atualizado, considera todos os ciclos disponíveis sem atualização
    return {
      ciclosSemAtualizacao: expectedCycles.length,
      ultimoCicloAcompanhado: undefined,
    }
  }

  const lastCycle = mapDateToCycle(lastUpdatedDateStr, expectedCycles)
  if (!lastCycle) {
    // Se a data de atualização for anterior a todos os ciclos da janela analisada
    const lastDate = parseIsoDateOnly(lastUpdatedDateStr).getTime()
    const oldestCycleDate = parseIsoDateOnly(
      expectedCycles[expectedCycles.length - 1].dataEsperada,
    ).getTime()

    if (lastDate < oldestCycleDate) {
      return {
        ciclosSemAtualizacao: expectedCycles.length,
        ultimoCicloAcompanhado: formatIsoDateOnly(parseIsoDateOnly(lastUpdatedDateStr)),
      }
    }
    return {
      ciclosSemAtualizacao: 0,
      ultimoCicloAcompanhado: formatIsoDateOnly(parseIsoDateOnly(lastUpdatedDateStr)),
    }
  }

  // Índice do ciclo no array ordenado de mais recente para mais antigo
  const cycleIndex = expectedCycles.findIndex((c) => c.cicloId === lastCycle.cicloId)

  // Se foi atualizado no ciclo 0 (ciclo atual esperado) -> 0 ciclos sem atualização
  // Se foi atualizado no ciclo 1 (deixou de receber no ciclo atual 0) -> 1 ciclo sem atualização
  // Se foi atualizado no ciclo 2 (deixou de receber no ciclo 0 e 1) -> 2 ciclos sem atualização
  const missed = cycleIndex >= 0 ? cycleIndex : 0

  return {
    ciclosSemAtualizacao: missed,
    ultimoCicloAcompanhado: lastCycle.dataEsperada,
  }
}
