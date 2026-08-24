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
  badgeVariant: 'vencido' | 'critico' | 'alto' | 'warning' | 'proximo' | 'ok'
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
 *   - Vencido: dias <= 0
 *   - Crítico: 1 a 15 dias para vencer
 *   - Atenção: 16 a 25 dias para vencer
 *   - Moderado: 26 a 35 dias para vencer
 *   - OK / Normal: > 35 dias para vencer
 */
/**
 * Faixas oficiais GLOBAIS de criticidade de Validades:
 *   - < 0    -> Vencido / Auditoria
 *   - 0–15   -> Crítico
 *   - 16–20  -> Atenção
 *   - 21–29  -> Moderado
 *   - >= 30  -> Normal / OK
 */
export const CRITICIDADE_FAIXAS: CriticidadeFaixa[] = [
  {
    level: 'Vencido',
    label: 'Vencido',
    descricao: 'Produto vencido (dias < 0)',
    maxDias: -1,
    badgeVariant: 'vencido',
    textClass: 'text-rose-700',
    chipClass: 'bg-rose-100 text-rose-700',
    prioridade: 0,
  },
  {
    level: 'Crítico',
    label: 'Crítico',
    descricao: 'Vencendo entre 0 e 15 dias',
    maxDias: 15,
    badgeVariant: 'critico',
    textClass: 'text-red-600',
    chipClass: 'bg-red-100 text-red-700',
    prioridade: 1,
  },
  {
    level: 'Atenção',
    label: 'Atenção',
    descricao: 'Vencendo entre 16 e 20 dias',
    maxDias: 20,
    badgeVariant: 'warning',
    textClass: 'text-amber-600',
    chipClass: 'bg-amber-100 text-amber-800',
    prioridade: 2,
  },
  {
    level: 'Moderado',
    label: 'Moderado',
    descricao: 'Vencendo entre 21 e 29 dias',
    maxDias: 29,
    badgeVariant: 'proximo',
    textClass: 'text-amber-700',
    chipClass: 'bg-amber-50 text-amber-900 border border-amber-200',
    prioridade: 3,
  },
  {
    level: 'OK',
    label: 'OK',
    descricao: '30 ou mais dias para o vencimento (Normal)',
    maxDias: null,
    badgeVariant: 'ok',
    textClass: 'text-emerald-600',
    chipClass: 'bg-emerald-100 text-emerald-700',
    prioridade: 4,
  },
]

/**
 * Faixas de Status Operacional (TradePro) oficiais GLOBAIS:
 *   - < 0   -> Vencido
 *   - 0-15  -> Crítico
 *   - 16-20 -> Atenção
 *   - 21-29 -> Moderado
 *   - >= 30 -> Normal
 */
export type StatusOperacional = 'Vencido' | 'Crítico' | 'Atenção' | 'Moderado' | 'Normal'

export function classificarStatusOperacional(dias: number): StatusOperacional {
  if (dias < 0) return 'Vencido'
  if (dias <= 15) return 'Crítico'
  if (dias <= 20) return 'Atenção'
  if (dias <= 29) return 'Moderado'
  return 'Normal'
}

/**
 * Classifica um item pelo número de dias restantes até o vencimento.
 * Dias < 0 caem em "Vencido"; 0–15 -> "Crítico"; 16–20 -> "Atenção"; 21–29 -> "Moderado"; >= 30 -> "OK".
 */
export function classificarCriticidade(diasRestantes: number): CriticidadeLevel {
  if (diasRestantes < 0) return 'Vencido'
  if (diasRestantes <= 15) return 'Crítico'
  if (diasRestantes <= 20) return 'Atenção'
  if (diasRestantes <= 29) return 'Moderado'
  return 'OK'
}

/** Retorna a configuração completa de uma faixa pelo nível. */
export function getCriticidadeFaixa(level: CriticidadeLevel): CriticidadeFaixa {
  return CRITICIDADE_FAIXAS.find((f) => f.level === level) ?? CRITICIDADE_FAIXAS[0]
}

/** Lista de níveis ordenados por prioridade de atuação. */
export const CRITICIDADE_NIVEIS: CriticidadeLevel[] = CRITICIDADE_FAIXAS.map((f) => f.level)
