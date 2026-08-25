import { describe, it, expect } from 'vitest'
import { getAcaoRecomendada } from '../acaoRecomendada'

describe('acaoRecomendada.ts — Regras puras de recomendação de ação', () => {
  it('1. Validade com diasRestantes de 0 a 7 dias -> Ação imediata', () => {
    expect(getAcaoRecomendada('validade', 0)).toBe(
      'Ação imediata: negociar giro, remanejamento ou retirada do lote.',
    )
    expect(getAcaoRecomendada('validade', 3)).toBe(
      'Ação imediata: negociar giro, remanejamento ou retirada do lote.',
    )
    expect(getAcaoRecomendada('validade', 7)).toBe(
      'Ação imediata: negociar giro, remanejamento ou retirada do lote.',
    )
  })

  it('2. Validade com diasRestantes de 8 a 15 dias -> Plano preventivo', () => {
    expect(getAcaoRecomendada('validade', 8)).toBe(
      'Plano preventivo: acompanhar giro e programar ação antes do vencimento.',
    )
    expect(getAcaoRecomendada('validade', 12)).toBe(
      'Plano preventivo: acompanhar giro e programar ação antes do vencimento.',
    )
    expect(getAcaoRecomendada('validade', 15)).toBe(
      'Plano preventivo: acompanhar giro e programar ação antes do vencimento.',
    )
  })

  it('3. Validade com diasRestantes > 15 dias ou indefinido -> Acompanhar evolução', () => {
    expect(getAcaoRecomendada('validade', 16)).toBe('Acompanhar evolução do indicador.')
    expect(getAcaoRecomendada('validade', 30)).toBe('Acompanhar evolução do indicador.')
    expect(getAcaoRecomendada('validade', undefined)).toBe('Acompanhar evolução do indicador.')
  })

  it('4. Ruptura ativa -> Verificar estoque, pedido e reposição', () => {
    expect(getAcaoRecomendada('ruptura', undefined, 5)).toBe(
      'Verificar estoque, pedido e reposição com o fornecedor.',
    )
    expect(getAcaoRecomendada('ruptura', undefined, 0)).toBe(
      'Verificar estoque, pedido e reposição com o fornecedor.',
    )
  })

  it('5. Ambos (validade crítica + ruptura ativa) -> Priorizar reposição sem ampliar estoque do lote crítico (sem falar em vencido)', () => {
    const res1 = getAcaoRecomendada('ambos', 5, 2)
    expect(res1).toBe('Priorizar reposição sem ampliar estoque do lote crítico.')
    expect(res1).not.toContain('vencido')

    const res2 = getAcaoRecomendada('ambos', 12, 1)
    expect(res2).toBe('Priorizar reposição sem ampliar estoque do lote crítico.')
    expect(res2).not.toContain('vencido')

    const res3 = getAcaoRecomendada('ambos')
    expect(res3).toBe('Priorizar reposição sem ampliar estoque do lote crítico.')
    expect(res3).not.toContain('vencido')
  })
})
