import { describe, it, expect } from 'vitest'
import {
  classificarCriticidade,
  classificarStatusOperacional,
  getCriticidadeFaixa,
  CRITICIDADE_FAIXAS,
  CRITICIDADE_NIVEIS,
} from '../criticidade'
import { classifyOperationalStatus } from '../../format/dateParser'

describe('criticidade.test.ts — Faixas Globais de Criticidade', () => {
  describe('1. Teste de cada limite exato da regra P0', () => {
    // -1 -> Vencido
    it('limite -1: deve ser Vencido', () => {
      expect(classificarCriticidade(-1)).toBe('Vencido')
      expect(classificarStatusOperacional(-1)).toBe('Vencido')
      expect(classifyOperationalStatus(-1)).toBe('Vencido')
    })

    // 0 -> Crítico
    it('limite 0: deve ser Crítico', () => {
      expect(classificarCriticidade(0)).toBe('Crítico')
      expect(classificarStatusOperacional(0)).toBe('Crítico')
      expect(classifyOperationalStatus(0)).toBe('Crítico')
    })

    // 15 -> Crítico
    it('limite 15: deve ser Crítico', () => {
      expect(classificarCriticidade(15)).toBe('Crítico')
      expect(classificarStatusOperacional(15)).toBe('Crítico')
      expect(classifyOperationalStatus(15)).toBe('Crítico')
    })

    // 16 -> Atenção
    it('limite 16: deve ser Atenção', () => {
      expect(classificarCriticidade(16)).toBe('Atenção')
      expect(classificarStatusOperacional(16)).toBe('Atenção')
      expect(classifyOperationalStatus(16)).toBe('Atenção')
    })

    // 20 -> Atenção
    it('limite 20: deve ser Atenção', () => {
      expect(classificarCriticidade(20)).toBe('Atenção')
      expect(classificarStatusOperacional(20)).toBe('Atenção')
      expect(classifyOperationalStatus(20)).toBe('Atenção')
    })

    // 21 -> Moderado
    it('limite 21: deve ser Moderado', () => {
      expect(classificarCriticidade(21)).toBe('Moderado')
      expect(classificarStatusOperacional(21)).toBe('Moderado')
      expect(classifyOperationalStatus(21)).toBe('Moderado')
    })

    // 29 -> Moderado
    it('limite 29: deve ser Moderado', () => {
      expect(classificarCriticidade(29)).toBe('Moderado')
      expect(classificarStatusOperacional(29)).toBe('Moderado')
      expect(classifyOperationalStatus(29)).toBe('Moderado')
    })

    // 30 -> Normal / OK
    it('limite 30: deve ser Normal / OK', () => {
      expect(classificarCriticidade(30)).toBe('OK')
      expect(classificarStatusOperacional(30)).toBe('Normal')
      expect(classifyOperationalStatus(30)).toBe('Normal')
    })
  })

  describe('2. Teste de valores intermediários', () => {
    it('dias = 5 (Crítico)', () => {
      expect(classificarCriticidade(5)).toBe('Crítico')
      expect(classificarStatusOperacional(5)).toBe('Crítico')
      expect(classifyOperationalStatus(5)).toBe('Crítico')
    })

    it('dias = 18 (Atenção)', () => {
      expect(classificarCriticidade(18)).toBe('Atenção')
      expect(classificarStatusOperacional(18)).toBe('Atenção')
      expect(classifyOperationalStatus(18)).toBe('Atenção')
    })

    it('dias = 25 (Moderado)', () => {
      expect(classificarCriticidade(25)).toBe('Moderado')
      expect(classificarStatusOperacional(25)).toBe('Moderado')
      expect(classifyOperationalStatus(25)).toBe('Moderado')
    })

    it('dias = 90 (Normal / OK)', () => {
      expect(classificarCriticidade(90)).toBe('OK')
      expect(classificarStatusOperacional(90)).toBe('Normal')
      expect(classifyOperationalStatus(90)).toBe('Normal')
    })

    it('dias = -30 (Vencido)', () => {
      expect(classificarCriticidade(-30)).toBe('Vencido')
      expect(classificarStatusOperacional(-30)).toBe('Vencido')
      expect(classifyOperationalStatus(-30)).toBe('Vencido')
    })
  })

  describe('3. Estrutura de configuração CRITICIDADE_FAIXAS', () => {
    it('deve possuir exatamente 5 faixas ordenadas por prioridade', () => {
      expect(CRITICIDADE_FAIXAS.length).toBe(5)
      expect(CRITICIDADE_NIVEIS).toEqual(['Vencido', 'Crítico', 'Atenção', 'Moderado', 'OK'])

      const vencido = getCriticidadeFaixa('Vencido')
      expect(vencido.maxDias).toBe(-1)
      expect(vencido.prioridade).toBe(0)

      const critico = getCriticidadeFaixa('Crítico')
      expect(critico.maxDias).toBe(15)
      expect(critico.prioridade).toBe(1)

      const atencao = getCriticidadeFaixa('Atenção')
      expect(atencao.maxDias).toBe(20)
      expect(atencao.prioridade).toBe(2)

      const moderado = getCriticidadeFaixa('Moderado')
      expect(moderado.maxDias).toBe(29)
      expect(moderado.prioridade).toBe(3)

      const ok = getCriticidadeFaixa('OK')
      expect(ok.maxDias).toBeNull()
      expect(ok.prioridade).toBe(4)
    })
  })
})
