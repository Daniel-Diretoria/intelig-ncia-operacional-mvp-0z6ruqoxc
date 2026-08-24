import { describe, it, expect } from 'vitest'
import {
  mapRecord,
  mapRecords,
  parseDate,
  parseNumber,
  parseTextId,
  isDataImplausivel,
  calcularDiasRestantes,
  getTodaySaoPaulo,
  deriveStatus,
} from '../excelMapper'
import {
  EXPECTED_COLUMNS,
  REQUIRED_COLUMNS,
  OPTIONAL_COLUMNS,
  suggestMapping,
  validateStructure,
  normalizeHeader,
} from '../columnMapping'
import {
  validateDataset,
  validateRequiredFields,
  validateDates,
  validateQuantidade,
  detectDuplicates,
} from '../validators'
import {
  parseOperationalDate,
  calcOperationalDays,
  formatDisplayDate,
  toOperationalIsoDate,
} from '../../format/dateParser'

describe('excelMapper / validators / dateParser.test.ts — Mapeamento, Validação e Datas', () => {
  describe('1. Aliases das 9 colunas obrigatórias e 4 opcionais', () => {
    it('reconhece variações de acentuação e caixa para "Razão Social" ("razao social", "RAZÃO SOCIAL", "Razao Social")', () => {
      const headers1 = ['razao social']
      const headers2 = ['RAZÃO SOCIAL']
      const headers3 = ['Razao Social']

      expect(suggestMapping(headers1).razaoSocial).toBe('razao social')
      expect(suggestMapping(headers2).razaoSocial).toBe('RAZÃO SOCIAL')
      expect(suggestMapping(headers3).razaoSocial).toBe('Razao Social')
    })

    it('reconhece "Dias p/Vencimento" e "Dias p/ Vencimento" sem falha', () => {
      const h1 = ['Dias p/Vencimento']
      const h2 = ['Dias p/ Vencimento']
      const h3 = ['DIAS P/VENCIMENTO']

      expect(suggestMapping(h1).diasVencimentoArquivo).toBe('Dias p/Vencimento')
      expect(suggestMapping(h2).diasVencimentoArquivo).toBe('Dias p/ Vencimento')
      expect(suggestMapping(h3).diasVencimentoArquivo).toBe('DIAS P/VENCIMENTO')
    })

    it('reconhece todas as 9 colunas obrigatórias via suggestMapping', () => {
      const headers9 = [
        'Razão Social',
        'Realizado',
        'Produto',
        'Cliente',
        'Quantidade',
        'Validade',
        'Dias p/ Vencimento',
        'Status Operacional',
        'Data Entrada',
      ]

      const mapping = suggestMapping(headers9)
      expect(mapping.razaoSocial).toBe('Razão Social')
      expect(mapping.realizado).toBe('Realizado')
      expect(mapping.produto).toBe('Produto')
      expect(mapping.cliente).toBe('Cliente')
      expect(mapping.quantidade).toBe('Quantidade')
      expect(mapping.validade).toBe('Validade')
      expect(mapping.diasVencimentoArquivo).toBe('Dias p/ Vencimento')
      expect(mapping.statusOperacionalArquivo).toBe('Status Operacional')
      expect(mapping.dataEntradaArquivo).toBe('Data Entrada')

      const validation = validateStructure(headers9)
      expect(validation.isStructureValid).toBe(true)
      expect(validation.missingRequired.length).toBe(0)
      expect(validation.presentRequired.length).toBe(9)
    })

    it('reconhece as 4 colunas opcionais (Colaborador, Supervisor, Cidade, Fornecedor)', () => {
      const headersOpcionais = ['Colaborador', 'Supervisor', 'Cidade', 'Fornecedor']
      const mapping = suggestMapping(headersOpcionais)
      expect(mapping.colaborador).toBe('Colaborador')
      expect(mapping.supervisor).toBe('Supervisor')
      expect(mapping.cidade).toBe('Cidade')
      expect(mapping.fornecedor).toBe('Fornecedor')

      const validation = validateStructure(headersOpcionais)
      expect(validation.presentOptional.length).toBe(4)
    })
  })

  describe('2. Validação DATA_IMPLAUSIVEL (> 5 anos futuros) e datas aceitas (2027/2028)', () => {
    const refDataHoje = '2025-05-15'

    it('data 26/08/2076 → rejeitada (>5 anos futuros, DATA_IMPLAUSIVEL)', () => {
      expect(isDataImplausivel('2076-08-26', refDataHoje)).toBe(true)
    })

    it('data 30/07/2035 → rejeitada (>5 anos futuros, DATA_IMPLAUSIVEL)', () => {
      expect(isDataImplausivel('2035-07-30', refDataHoje)).toBe(true)
    })

    it('datas em 2027 e 2028 → ACEITAS (dentro de 5 anos a partir de hoje)', () => {
      expect(isDataImplausivel('2027-03-10', refDataHoje)).toBe(false)
      expect(isDataImplausivel('2028-11-20', refDataHoje)).toBe(false)
      expect(isDataImplausivel('2026-06-15', refDataHoje)).toBe(false)
    })

    it('mapRecord rejeita item com DATA_IMPLAUSIVEL', () => {
      const row = {
        razaoSocial: '00100 - Loja Alpha',
        realizado: '2025-05-10',
        produto: 'Iogurte Grego 100g',
        cliente: 'Cliente Teste',
        quantidade: 15,
        validade: '2076-08-26',
        diasVencimentoArquivo: 18000,
        statusOperacionalArquivo: 'Normal',
        dataEntradaArquivo: '2025-05-01',
      }
      const mapping = {
        razaoSocial: 'razaoSocial',
        realizado: 'realizado',
        produto: 'produto',
        cliente: 'cliente',
        quantidade: 'quantidade',
        validade: 'validade',
        diasVencimentoArquivo: 'diasVencimentoArquivo',
        statusOperacionalArquivo: 'statusOperacionalArquivo',
        dataEntradaArquivo: 'dataEntradaArquivo',
      }

      const result = mapRecord(row, mapping, 0)
      expect(result.errors).toContain('DATA_IMPLAUSIVEL')
    })
  })

  describe('3. Recálculo de dias restantes em America/Sao_Paulo', () => {
    it('getTodaySaoPaulo retorna data válida no formato YYYY-MM-DD', () => {
      const today = getTodaySaoPaulo()
      expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })

    it('calcularDiasRestantes calcula diferença exata em dias UTC/Sao_Paulo', () => {
      const refHoje = '2025-06-01'
      expect(calcularDiasRestantes('2025-06-01', refHoje)).toBe(0)
      expect(calcularDiasRestantes('2025-06-16', refHoje)).toBe(15)
      expect(calcularDiasRestantes('2025-06-21', refHoje)).toBe(20)
      expect(calcularDiasRestantes('2025-05-31', refHoje)).toBe(-1)
    })

    it('parseOperationalDate e calcOperationalDays tratam date-only sem salto UTC', () => {
      const d1 = parseOperationalDate('15/05/2025')
      expect(d1).not.toBeNull()
      expect(d1?.getFullYear()).toBe(2025)
      expect(d1?.getMonth()).toBe(4) // Maio (0-indexed)
      expect(d1?.getDate()).toBe(15)

      const d2 = parseOperationalDate('2025-05-15')
      expect(d2).not.toBeNull()
      expect(d2?.getFullYear()).toBe(2025)
      expect(d2?.getMonth()).toBe(4)
      expect(d2?.getDate()).toBe(15)

      expect(toOperationalIsoDate('15/05/2025')).toBe('2025-05-15')
      expect(formatDisplayDate('2025-05-15')).toBe('15/05/2025')
    })
  })

  describe('4. Validação de obrigatoriedade e quantidades', () => {
    it('rejeita quantidade negativa e aceita zero', () => {
      const rowNeg = {
        razaoSocial: '00100 - Loja Alpha',
        realizado: '2025-05-10',
        produto: 'Produto A',
        cliente: 'Cliente B',
        quantidade: -5,
        validade: '2025-08-20',
        diasVencimentoArquivo: 100,
        statusOperacionalArquivo: 'Normal',
        dataEntradaArquivo: '2025-05-01',
      }
      const mapping = {
        razaoSocial: 'razaoSocial',
        realizado: 'realizado',
        produto: 'produto',
        cliente: 'cliente',
        quantidade: 'quantidade',
        validade: 'validade',
        diasVencimentoArquivo: 'diasVencimentoArquivo',
        statusOperacionalArquivo: 'statusOperacionalArquivo',
        dataEntradaArquivo: 'dataEntradaArquivo',
      }
      const resNeg = mapRecord(rowNeg, mapping, 0)
      expect(resNeg.errors).toContain('Quantidade negativa é rejeitada')

      const rowZero = { ...rowNeg, quantidade: 0 }
      const resZero = mapRecord(rowZero, mapping, 1)
      expect(resZero.errors.length).toBe(0)
      expect(resZero.item.quantidade).toBe(0)
    })

    it('detecta duplicidades legítimas por produto + loja + validade', () => {
      const items: any[] = [
        {
          product: 'Leite Integral 1L',
          loja: 'Fort Atacadista',
          validade: '2025-07-10',
          sku: 'SKU-01',
        },
        {
          product: 'Leite Integral 1L',
          loja: 'Fort Atacadista',
          validade: '2025-07-10',
          sku: 'SKU-01',
        },
        {
          product: 'Queijo Prato',
          loja: 'Fort Atacadista',
          validade: '2025-07-10',
          sku: 'SKU-02',
        },
      ]
      const duplicates = detectDuplicates(items)
      expect(duplicates.length).toBe(1)
      expect(duplicates[0].indices).toEqual([0, 1])
    })
  })
})
