import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { parseWorksheetSparse } from '../excelReader'
import {
  classificarCriticidade,
  classificarStatusOperacional,
  CRITICIDADE_FAIXAS,
} from '../../data/criticidade'
import { isDataImplausivel, calcularDiasRestantes } from '../excelMapper'
import { extractStoreFromRazaoSocial, resolveStoreMatch } from '../../data/storeRecognition'
import { extractFromCombined, cleanCode } from '../../format/storeIdentity'
import { normalizeStoreCode } from '../../format/storeCode'

describe('P0 Enxuta - Testes Unitários de Regras e Parser', () => {
  describe('A) Parser Esparso de Excel', () => {
    it('planilha esparsa com !ref A1:M1040484 e 6662 linhas preenchidas retorna exatamente 6662 úteis e calcula ignoredBlankRows sem travar', () => {
      const ws: XLSX.WorkSheet = {}
      ws['!ref'] = 'A1:M1040484'

      const headerNames = [
        'Razão Social',
        'Realizado',
        'Produto',
        'Cliente',
        'Quantidade',
        'Validade',
        'Dias p/ Vencimento',
        'Status Operacional',
        'Data Entrada',
        'Colaborador',
        'Supervisor',
        'Cidade',
        'Fornecedor',
      ]

      // Linha 1 (cabeçalho)
      headerNames.forEach((name, colIdx) => {
        const cellRef = XLSX.utils.encode_cell({ r: 0, c: colIdx })
        ws[cellRef] = { v: name, t: 's' }
      })

      // 6.662 linhas de dados preenchidas
      const dataRowsCount = 6662
      for (let r = 1; r <= dataRowsCount; r++) {
        const c0 = XLSX.utils.encode_cell({ r, c: 0 })
        ws[c0] = { v: `00123 - Loja Teste ${r}`, t: 's' }
        const c1 = XLSX.utils.encode_cell({ r, c: 1 })
        ws[c1] = { v: '2025-01-10', t: 's' }
        const c2 = XLSX.utils.encode_cell({ r, c: 2 })
        ws[c2] = { v: `Produto ${r}`, t: 's' }
      }

      const result = parseWorksheetSparse(ws)
      expect(result.usefulRows).toBe(6662)
      expect(result.headers.length).toBe(13)
      expect(result.declaredPhysicalRows).toBe(1040484)
      expect(result.ignoredBlankRows).toBe(1040484 - (6662 + 1))
    })
  })

  describe('B) Faixas Globais de Criticidade e Datas Implausíveis', () => {
    it('classifica limites de faixas estritas de acordo com a especificação', () => {
      // < 0 -> Vencido
      expect(classificarCriticidade(-1)).toBe('Vencido')
      expect(classificarStatusOperacional(-1)).toBe('Vencido')
      expect(classificarCriticidade(-5)).toBe('Vencido')

      // 0 - 15 -> Crítico
      expect(classificarCriticidade(0)).toBe('Crítico')
      expect(classificarStatusOperacional(0)).toBe('Crítico')
      expect(classificarCriticidade(15)).toBe('Crítico')
      expect(classificarStatusOperacional(15)).toBe('Crítico')

      // 16 - 20 -> Atenção
      expect(classificarCriticidade(16)).toBe('Atenção')
      expect(classificarStatusOperacional(16)).toBe('Atenção')
      expect(classificarCriticidade(20)).toBe('Atenção')
      expect(classificarStatusOperacional(20)).toBe('Atenção')

      // 21 - 29 -> Moderado
      expect(classificarCriticidade(21)).toBe('Moderado')
      expect(classificarStatusOperacional(21)).toBe('Moderado')
      expect(classificarCriticidade(29)).toBe('Moderado')
      expect(classificarStatusOperacional(29)).toBe('Moderado')

      // >= 30 -> Normal / OK
      expect(classificarCriticidade(30)).toBe('OK')
      expect(classificarStatusOperacional(30)).toBe('Normal')
      expect(classificarCriticidade(45)).toBe('OK')
      expect(classificarStatusOperacional(45)).toBe('Normal')
    })

    it('identifica datas >5 anos a partir do processamento como DATA_IMPLAUSIVEL e permite 2027/2028', () => {
      const refToday = '2025-05-15'

      // Datas extremas: 2076, 2035 -> implausíveis
      expect(isDataImplausivel('2076-08-26', refToday)).toBe(true)
      expect(isDataImplausivel('2035-07-30', refToday)).toBe(true)

      // Datas dentro de 5 anos: 2027, 2028 -> permitidas (não implausíveis)
      expect(isDataImplausivel('2027-06-01', refToday)).toBe(false)
      expect(isDataImplausivel('2028-12-31', refToday)).toBe(false)
      expect(isDataImplausivel('2025-10-10', refToday)).toBe(false)
    })
  })

  describe('C) Resolução de Loja e Preservação de Zeros', () => {
    it('preserva zeros à esquerda como string em prefixos formatados com "-", "•" ou "·"', () => {
      const t1 = extractFromCombined('00085 - Supermercado Central')
      expect(t1.extractedCode).toBe('00085')
      expect(t1.cleanName).toBe('Supermercado Central')

      const t2 = extractFromCombined('00120 • Hipermercado Sul')
      expect(t2.extractedCode).toBe('00120')
      expect(t2.cleanName).toBe('Hipermercado Sul')

      const t3 = extractFromCombined('00004 · Mercado Bairro')
      expect(t3.extractedCode).toBe('00004')
      expect(t3.cleanName).toBe('Mercado Bairro')

      const rec = extractStoreFromRazaoSocial('00072 - Loja Norte')
      expect(rec.codigoLoja).toBe('00072')
      expect(rec.nomeLoja).toBe('Loja Norte')
      expect(rec.origemReconhecimento).toBe('codigo_externo')
    })

    it('resolve loja única, identifica LOJA_AMBIGUA e LOJA_NAO_RESOLVIDA sem inventar código', () => {
      const known = [
        { codigo: '00101', nome: 'Supermercado Central', cidade: 'Joinville' },
        { codigo: '00102', nome: 'Supermercado Central', cidade: 'Florianópolis' },
        { codigo: '00200', nome: 'Hipermercado Alfa', cidade: 'Curitiba' },
      ]

      // 1. Loja com código no campo
      const resCode = resolveStoreMatch({
        razaoSocial: '00500 - Minha Loja',
        knownStores: known,
      })
      expect(resCode.status).toBe('com_codigo')
      expect(resCode.recognition.codigoLoja).toBe('00500')

      // 2. Loja sem código com match único
      const resUnique = resolveStoreMatch({
        razaoSocial: 'Hipermercado Alfa',
        cidade: 'Curitiba',
        knownStores: known,
      })
      expect(resUnique.status).toBe('resolvida')
      expect(resUnique.recognition.codigoLoja).toBe('00200')

      // 3. Loja sem código ambígua (mesmo nome, cidade sem desambiguação)
      const resAmbiguous = resolveStoreMatch({
        razaoSocial: 'Supermercado Central',
        cidade: '',
        knownStores: known,
      })
      expect(resAmbiguous.status).toBe('LOJA_AMBIGUA')
      expect(resAmbiguous.recognition.codigoLoja).toBeUndefined()

      // 4. Loja não encontrada
      const resNotFound = resolveStoreMatch({
        razaoSocial: 'Loja Inexistente XYZ',
        cidade: 'São Paulo',
        knownStores: known,
      })
      expect(resNotFound.status).toBe('LOJA_NAO_RESOLVIDA')
      expect(resNotFound.recognition.codigoLoja).toBeUndefined()
    })
  })
})
