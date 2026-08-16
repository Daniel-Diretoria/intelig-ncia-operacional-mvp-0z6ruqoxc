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
 * Centralizado e atualizado conforme especificação:
 *   - Crítico: 0 a 15 dias para vencer
 *   - Atenção: 16 a 25 dias para vencer
 *   - Moderado: 26 a 35 dias para vencer
 *   - Normal / OK: > 35 dias para vencer
 */
export const CRITICIDADE_FAIXAS: CriticidadeFaixa[] = [
  {
    level: 'Crítico',
    label: 'Crítico',
    descricao: 'Vencido (dias <= 0) ou vencendo entre 0 e 15 dias',
    maxDias: 15,
    badgeVariant: 'critico',
    textClass: 'text-red-600',
    chipClass: 'bg-red-100 text-red-700',
    prioridade: 1,
  },
  {
    level: 'Atenção',
    label: 'Atenção',
    descricao: 'Vencendo entre 16 e 25 dias',
    maxDias: 25,
    badgeVariant: 'warning',
    textClass: 'text-amber-600',
    chipClass: 'bg-amber-100 text-amber-800',
    prioridade: 2,
  },
  {
    level: 'Moderado',
    label: 'Moderado',
    descricao: 'Vencendo entre 26 e 35 dias',
    maxDias: 35,
    badgeVariant: 'proximo',
    textClass: 'text-amber-700',
    chipClass: 'bg-amber-50 text-amber-900 border border-amber-200',
    prioridade: 3,
  },
  {
    level: 'OK',
    label: 'OK',
    descricao: 'Mais de 35 dias para o vencimento',
    maxDias: null,
    badgeVariant: 'ok',
    textClass: 'text-emerald-600',
    chipClass: 'bg-emerald-100 text-emerald-700',
    prioridade: 4,
  },
]

/**
 * Faixas de Status Operacional (TradePro), distintas do CriticidadeLevel legado.
 * Usado pelo pipeline de processamento (validades_base).
 * Regras centralizadas:
 *   - Dias <= 0   -> Vencido
 *   - Dias 1-15   -> Crítico
 *   - Dias 16-25  -> Atenção
 *   - Dias 26-35  -> Moderado
 *   - Dias > 35   -> Normal
 */
export type StatusOperacional = 'Vencido' | 'Crítico' | 'Atenção' | 'Moderado' | 'Normal'

export function classificarStatusOperacional(dias: number): StatusOperacional {
  if (dias <= 0) return 'Vencido'
  if (dias <= 15) return 'Crítico'
  if (dias <= 25) return 'Atenção'
  if (dias <= 35) return 'Moderado'
  return 'Normal'
}

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
