import type { CriticidadeLevel } from '@/types'
import { getCriticidadeFaixa } from '@/lib/data/criticidade'
import { StatusBadge } from '@/components/ui/status-badge'

/**
 * Badge de criticidade de validade. Usa a configuração central de
 * `src/lib/data/criticidade.ts` para mapear nível -> variante visual.
 */
export function CriticidadeBadge({
  level,
  diasRestantes,
}: {
  level: CriticidadeLevel
  diasRestantes?: number
}) {
  const faixa = getCriticidadeFaixa(level)
  const texto =
    diasRestantes !== undefined
      ? `${faixa.label} • ${diasRestantes} ${diasRestantes === 1 ? 'dia' : 'dias'}`
      : faixa.label
  return <StatusBadge variant={faixa.badgeVariant}>{texto}</StatusBadge>
}
