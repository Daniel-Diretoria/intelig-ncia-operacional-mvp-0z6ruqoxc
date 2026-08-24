import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import {
  parseWorksheetSparse,
  normalizeSheetName,
  extractDataArquivo,
  selectBestSheet,
} from '../excelReader'

describe('excelReader.test.ts — Leitura e Parser Esparso de Planilhas', () => {
  it('1. Worksheet sintético com !ref A1:M1040484, 13 cabeçalhos e 6.662 linhas preenchidas (linhas 2 a 6663) ignora ~1.033.821 linhas vazias', () => {
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

    // Linha 1 (cabeçalhos, r = 0)
    headerNames.forEach((name, colIdx) => {
      const cellRef = XLSX.utils.encode_cell({ r: 0, c: colIdx })
      ws[cellRef] = { v: name, t: 's' }
    })

    // Linhas 2 a 6663 (r = 1 até 6662): exatamente 6.662 linhas preenchidas
    const totalDataRows = 6662
    for (let r = 1; r <= totalDataRows; r++) {
      const c0 = XLSX.utils.encode_cell({ r, c: 0 })
      ws[c0] = { v: `00042 - Loja Exemplo ${r}`, t: 's' }
      const c1 = XLSX.utils.encode_cell({ r, c: 1 })
      ws[c1] = { v: '2025-02-01', t: 's' }
      const c2 = XLSX.utils.encode_cell({ r, c: 2 })
      ws[c2] = { v: `Produto SKU ${r}`, t: 's' }
      const c3 = XLSX.utils.encode_cell({ r, c: 3 })
      ws[c3] = { v: 'Cliente Teste', t: 's' }
      const c4 = XLSX.utils.encode_cell({ r, c: 4 })
      ws[c4] = { v: 10, t: 'n' }
      const c5 = XLSX.utils.encode_cell({ r, c: 5 })
      ws[c5] = { v: '2025-08-30', t: 's' }
      const c6 = XLSX.utils.encode_cell({ r, c: 6 })
      ws[c6] = { v: 120, t: 'n' }
      const c7 = XLSX.utils.encode_cell({ r, c: 7 })
      ws[c7] = { v: 'Normal', t: 's' }
      const c8 = XLSX.utils.encode_cell({ r, c: 8 })
      ws[c8] = { v: '2025-01-15', t: 's' }
    }

    const parsed = parseWorksheetSparse(ws)

    // usefulRows deve ser exatamente 6662 (cabeçalho não conta como útil)
    expect(parsed.usefulRows).toBe(6662)
    expect(parsed.headers.length).toBe(13)
    expect(parsed.rows.length).toBe(6662)

    // declaredPhysicalRows deve ser 1040484 coerente com !ref
    expect(parsed.declaredPhysicalRows).toBe(1040484)

    // ignoredBlankRows = declaredPhysicalRows - (usefulRows + 1 cabeçalho)
    expect(parsed.ignoredBlankRows).toBe(1040484 - 6663)
    expect(parsed.ignoredBlankRows).toBe(1033821)

    // Confirma que NÃO alocou array de 1M posições — rows.length é proporcional às linhas úteis
    expect(parsed.rows.length).toBe(6662)
    expect(parsed.rows[0]['Razão Social']).toBe('00042 - Loja Exemplo 1')
    expect(parsed.rows[6661]['Razão Social']).toBe('00042 - Loja Exemplo 6662')
  })

  it('2. Planilha pequena normal (10 linhas de dados + 1 cabeçalho)', () => {
    const ws: XLSX.WorkSheet = {}
    ws['!ref'] = 'A1:C11'

    const headers = ['Razão Social', 'Produto', 'Quantidade']
    headers.forEach((h, c) => {
      ws[XLSX.utils.encode_cell({ r: 0, c })] = { v: h, t: 's' }
    })

    for (let r = 1; r <= 10; r++) {
      ws[XLSX.utils.encode_cell({ r, c: 0 })] = { v: `00${r} - Loja ${r}`, t: 's' }
      ws[XLSX.utils.encode_cell({ r, c: 1 })] = { v: `Item ${r}`, t: 's' }
      ws[XLSX.utils.encode_cell({ r, c: 2 })] = { v: r * 5, t: 'n' }
    }

    const parsed = parseWorksheetSparse(ws)
    expect(parsed.declaredPhysicalRows).toBe(11)
    expect(parsed.usefulRows).toBe(10)
    expect(parsed.ignoredBlankRows).toBe(0)
    expect(parsed.headers).toEqual(['Razão Social', 'Produto', 'Quantidade'])
    expect(parsed.rows.length).toBe(10)
  })

  it('3. Planilha totalmente vazia lança erro amigável', () => {
    const wsEmpty: XLSX.WorkSheet = {}
    expect(() => parseWorksheetSparse(wsEmpty)).toThrow('A planilha está vazia.')

    const wsOnlyRef: XLSX.WorkSheet = { '!ref': 'A1:D100' }
    expect(() => parseWorksheetSparse(wsOnlyRef)).toThrow('A planilha está vazia.')
  })

  it('4. Planilha com apenas cabeçalhos e sem linhas de dados', () => {
    const ws: XLSX.WorkSheet = {
      '!ref': 'A1:B1',
      A1: { v: 'Coluna 1', t: 's' },
      B1: { v: 'Coluna 2', t: 's' },
    }

    const parsed = parseWorksheetSparse(ws)
    expect(parsed.headers).toEqual(['Coluna 1', 'Coluna 2'])
    expect(parsed.usefulRows).toBe(0)
    expect(parsed.rows).toEqual([])
    expect(parsed.declaredPhysicalRows).toBe(1)
    expect(parsed.ignoredBlankRows).toBe(0)
  })

  it('5. Utilitários auxiliares: normalizeSheetName, extractDataArquivo e selectBestSheet', () => {
    expect(normalizeSheetName(' Pesquisa Validade ')).toBe('pesquisa validade')
    expect(normalizeSheetName('PESQUISA VALIDADE')).toBe('pesquisa validade')
    expect(normalizeSheetName('Pesquisa Validação')).toBe('pesquisa validacao')

    expect(extractDataArquivo('Validade_2025_02_15.xlsx')).toBe('2025-02-15')
    expect(extractDataArquivo('Rupturas_2025-01-30.xlsx')).toBe('2025-01-30')
    expect(extractDataArquivo('/path/to/Validade_2025.03.10.xlsx')).toBe('2025-03-10')
    expect(extractDataArquivo('relatorio_geral.xlsx')).toBeUndefined()

    const wbValidade: XLSX.WorkBook = {
      SheetNames: ['Outra', 'Pesquisa Validade'],
      Sheets: {},
    }
    expect(selectBestSheet(wbValidade)).toEqual({
      sheetName: 'Pesquisa Validade',
      isRuptura: false,
    })

    const wbRuptura: XLSX.WorkBook = {
      SheetNames: ['Capa', 'Rupturas'],
      Sheets: {},
    }
    expect(selectBestSheet(wbRuptura)).toEqual({
      sheetName: 'Rupturas',
      isRuptura: true,
    })
  })
})
