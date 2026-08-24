import { describe, it, expect } from 'vitest'
import { mapRecords } from '../excelMapper'
import { validateDataset } from '../validators'
import { resolveStoreMatch } from '../../data/storeRecognition'
import { checkFileHash } from '../importClient'
import { executarPipeline } from '../../data/tradeProPipeline'

describe('accountingAndIdempotency.test.ts — Contabilidade da Prévia e Idempotência', () => {
  describe('1. Contabilidade da Prévia: usefulRows e distribuição', () => {
    it('verifica relação contábil da prévia: úteis distribuídos em válidas vs auditoria (erros de obrigatoriedade/implausíveis)', () => {
      const rawRows = [
        // 1. Linha válida com código
        {
          razaoSocial: '00100 - Supermercado Central',
          realizado: '2025-05-10',
          produto: 'Iogurte Morango 150g',
          cliente: 'Rede Central',
          quantidade: 20,
          validade: '2025-08-15',
          diasVencimentoArquivo: 97,
          statusOperacionalArquivo: 'Normal',
          dataEntradaArquivo: '2025-05-01',
          cidade: 'Joinville',
        },
        // 2. Linha válida sem código
        {
          razaoSocial: 'Mercado Bom Preço',
          realizado: '2025-05-10',
          produto: 'Leite Desnatado 1L',
          cliente: 'Mercado Bom Preço',
          quantidade: 50,
          validade: '2025-07-20',
          diasVencimentoArquivo: 71,
          statusOperacionalArquivo: 'Normal',
          dataEntradaArquivo: '2025-05-01',
          cidade: 'Blumenau',
        },
        // 3. Linha com erro obrigatório (Quantidade negativa -> Auditoria/Rejeição)
        {
          razaoSocial: '00105 - Hiper Sul',
          realizado: '2025-05-10',
          produto: 'Requeijão Cremoso',
          cliente: 'Hiper Sul',
          quantidade: -5,
          validade: '2025-06-30',
          diasVencimentoArquivo: 50,
          statusOperacionalArquivo: 'Normal',
          dataEntradaArquivo: '2025-05-01',
          cidade: 'Florianópolis',
        },
        // 4. Linha com DATA_IMPLAUSIVEL (> 5 anos futuros -> Auditoria/Rejeição)
        {
          razaoSocial: '00108 - Mini Mercado',
          realizado: '2025-05-10',
          produto: 'Manteiga com Sal',
          cliente: 'Mini Mercado',
          quantidade: 10,
          validade: '2076-08-26',
          diasVencimentoArquivo: 18000,
          statusOperacionalArquivo: 'Normal',
          dataEntradaArquivo: '2025-05-01',
          cidade: 'São José',
        },
      ]

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
        cidade: 'cidade',
      }

      const usefulRows = rawRows.length
      expect(usefulRows).toBe(4)

      const mapped = mapRecords(rawRows, mapping)
      const validRows = mapped.filter((m) => m.errors.length === 0)
      const auditoriaRows = mapped.filter((m) => m.errors.length > 0)

      expect(validRows.length).toBe(2)
      expect(auditoriaRows.length).toBe(2)
      expect(usefulRows).toBe(validRows.length + auditoriaRows.length)

      // Validação do dataset dos válidos
      const validItems = validRows.map((m) => m.item as any)
      const report = validateDataset(validItems)
      expect(report.totalRows).toBe(2)
      expect(report.validRows).toBe(2)
      expect(report.invalidRows).toBe(0)
    })
  })

  describe('2. Idempotência e proteção contra duplicação de hash', () => {
    it('executarPipeline com os mesmos dados produz a mesma Base Atual determinística', () => {
      const rawRecords = [
        {
          razaoSocial: '00100 - FORT ATACADISTA',
          realizado: '2025-05-10',
          produto: 'Leite Condensado 395g',
          cliente: 'FORT ATACADISTA',
          quantidade: 100,
          validade: '2025-10-15',
          diasVencimentoArquivo: 158,
          statusOperacionalArquivo: 'Normal',
          dataEntradaArquivo: '2025-05-01',
          fornecedor: 'Italac',
        },
      ]
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
        fornecedor: 'fornecedor',
      }

      const run1 = executarPipeline({
        rawRecords,
        mapping,
        fileName: 'Validade_2025_05_10.xlsx',
        dataArquivo: '2025-05-10',
      })

      const run2 = executarPipeline({
        rawRecords,
        mapping,
        fileName: 'Validade_2025_05_10.xlsx',
        dataArquivo: '2025-05-10',
      })

      expect(run1.baseAtual.length).toBe(1)
      expect(run2.baseAtual.length).toBe(1)
      expect(run1.baseAtual[0].chaveOperacional).toBe(run2.baseAtual[0].chaveOperacional)
      expect(run1.baseAtual[0].quantidade).toBe(run2.baseAtual[0].quantidade)
      expect(run1.summary.baseAtual).toBe(run2.summary.baseAtual)
    })

    it('checkFileHash retorna duplicate: false para hash não cadastrado', async () => {
      const res = await checkFileHash('hash_inexistente_1234567890abcdef')
      expect(res.duplicate).toBe(false)
    })
  })
})
