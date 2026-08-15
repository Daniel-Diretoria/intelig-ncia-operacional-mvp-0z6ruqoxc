import type { CriticidadeLevel } from '@/types'

/**
 * Camada de negócio: classificação de criticidade de validades.
 *
 * Toda regra de "quantos dias = qual nível" fica centralizada aqui.
 * Para ajustar as faixas basta editar o array `CRITICIDADE_FAIXAS` —
 * nenhum componente visual precisa ser alterado.
 */

export interface CriticidadeFaixa {
  level: CriticidadeLevel
  /** Rótulo curto exibido em badges / legendas. */
  label: string
  /** Descrição da faixa de dias. */
  descricao: string
  /** Limite superior (inclusive) de diasRestantes para esta faixa. null = sem limite. */
  maxDias: number | null
  /** Variante visual compatível com StatusBadge. */
  badgeVariant: 'critico' | 'alto' | 'warning' | 'proximo' | 'ok'
  /** Cor de texto Tailwind para números/ícones. */
  textClass: string
  /** Classes de chip (fundo + texto) para uso em mini-KPIs. */
  chipClass: string
  /** Ordem de prioridade de atuação (1 = maior prioridade). */
  prioridade: number
}

/**
 * Configuração das faixas de criticidade. Ordenar do mais crítico ao menos crítico.
 * Edite este array para reconfigurar as faixas sem tocar nos componentes.
 */
export const CRITICIDADE_FAIXAS: CriticidadeFaixa[] = [
  {
    level: 'Crítico',
    label: 'Crítico',
    descricao: 'Vencido ou vencendo em até 7 dias',
    maxDias: 7,
    badgeVariant: 'critico',
    textClass: 'text-red-600',
    chipClass: 'bg-red-100 text-red-700',
    prioridade: 1,
  },
  {
    level: 'Atenção',
    label: 'Atenção',
    descricao: 'Vencendo entre 8 e 15 dias',
    maxDias: 15,
    badgeVariant: 'warning',
    textClass: 'text-orange-600',
    chipClass: 'bg-orange-100 text-orange-700',
    prioridade: 2,
  },
  {
    level: 'Moderado',
    label: 'Moderado',
    descricao: 'Vencendo entre 16 e 30 dias',
    maxDias: 30,
    badgeVariant: 'proximo',
    textClass: 'text-amber-600',
    chipClass: 'bg-amber-100 text-amber-800',
    prioridade: 3,
  },
  {
    level: 'OK',
    label: 'OK',
    descricao: 'Mais de 30 dias para o vencimento',
    maxDias: null,
    badgeVariant: 'ok',
    textClass: 'text-emerald-600',
    chipClass: 'bg-emerald-100 text-emerald-700',
    prioridade: 4,
  },
]

/**
 * Classifica um item pelo número de dias restantes até o vencimento.
 * Dias negativos (vencido) sempre caem em "Crítico".
 */
export function classificarCriticidade(diasRestantes: number): CriticidadeLevel {
  for (const faixa of CRITICIDADE_FAIXAS) {
    if (faixa.maxDias === null) return faixa.level
    if (diasRestantes <= faixa.maxDias) return faixa.level
  }
  return 'OK'
}

/** Retorna a configuração completa de uma faixa pelo nível. */
export function getCriticidadeFaixa(level: CriticidadeLevel): CriticidadeFaixa {
  return CRITICIDADE_FAIXAS.find((f) => f.level === level) ?? CRITICIDADE_FAIXAS[0]
}

/** Lista de níveis ordenados por prioridade de atuação. */
export const CRITICIDADE_NIVEIS: CriticidadeLevel[] = CRITICIDADE_FAIXAS.map((f) => f.level)
