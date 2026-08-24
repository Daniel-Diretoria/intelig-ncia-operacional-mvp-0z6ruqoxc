import { describe, it, expect } from 'vitest'
import {
  buildBaseTratadaValidades,
  buildBaseTratadaRupturas,
  buildPendenciasAuditoria,
  buildConfrontoRupturaValidade,
  buildCentralEstrategica,
  buildHistoricoImportacoes,
  downloadBaseTratadaValidadesXLSX,
  downloadBaseTratadaValidadesCSV,
  downloadBaseTratadaRupturasXLSX,
  downloadBaseTratadaRupturasCSV,
  downloadPendenciasAuditoriaXLSX,
  downloadPendenciasAuditoriaCSV,
  downloadConfrontoXLSX,
  downloadConfrontoCSV,
  downloadCentralEstrategicaXLSX,
  downloadHistoricoImportacoesXLSX,
  downloadHistoricoImportacoesCSV,
  OPERATIONAL_EXPORT_VERSION,
  type ImportHistoryExportItem,
} from '../operationalExports'
import type { ValidadeItem, Ruptura } from '@/types'

// Mock de amostra com dados reais, acentos, caracteres especiais, códigos com zero à esquerda e datas variadas
const mockValidades: ValidadeItem[] = [
  {
    id: 'val-1',
    cliente: 'M. DIAS BRANCO',
    codigoLoja: '0042',
    loja: '0042 - ASSAÍ ATACADISTA - TIJUCA & ZONA NORTE',
    cidade: 'São João de Meriti / Niterói',
    uf: 'RJ',
    product: 'BISCOITO CRACKER VITARELLA 400G — TRADIÇÃO & SABOR',
    quantidade: 150,
    estoque: 150,
    sku: '789123456001',
    category: 'Mercearia',
    lote: 'LT001',
    unidade: 'UN',
    validade: '2025-05-10',
    diasRestantes: 5,
    status: 'Crítico',
    dataEntrada: '2025-02-01',
    promotor: 'João da Silva & Cia.',
    supervisor: 'Carlos Pereira (Área Técnica)',
  },
  {
    id: 'val-2',
    cliente: 'NESTLÉ BRASIL LTDA.',
    codigoLoja: '0105',
    loja: '0105 - CARREFOUR BARRA DA TIJUCA',
    cidade: 'Rio de Janeiro',
    uf: 'RJ',
    product: 'LEITE CONDENSADO MOÇA 395G LATA',
    quantidade: 0,
    estoque: 0,
    sku: '789100010010',
    category: 'Laticínios',
    lote: 'LT002',
    unidade: 'UN',
    validade: '2025-01-15',
    diasRestantes: -20,
    status: 'Vencido',
    dataEntrada: '2025-01-10',
    promotor: 'Maria Oliveira Gonçalves',
  },
]

const mockRupturas: Ruptura[] = [
  {
    id: 'rup-1',
    operational_key: 'rup-op-1',
    dedup_key: '0042|BISCOITO CRACKER|M. DIAS BRANCO',
    source_import_id: 'imp-1',
    source_row: 1,
    cnpj_loja: '12345678000199',
    codigo_cliente: 'CLI-001',
    categoria: 'Mercearia',
    observacao: '',
    data_entrada: '2025-02-15',
    ultima_aparicao: '2025-02-15',
    cliente: 'M. DIAS BRANCO',
    codigo_loja: '0042',
    nome_loja: '0042 - ASSAÍ ATACADISTA - TIJUCA & ZONA NORTE',
    cidade: 'São João de Meriti / Niterói',
    estado: 'RJ',
    produto: 'BISCOITO CRACKER VITARELLA 400G — TRADIÇÃO & SABOR',
    motivo: 'Ruptura Total',
    situacao_atual: 'Ativo',
    data_visita: '2025-02-15',
    dias_em_ruptura: 12,
    colaborador: 'João da Silva & Cia.',
  },
  {
    id: 'rup-2',
    operational_key: 'rup-op-2',
    dedup_key: '0105|TODOS OS PRODUTOS|NESTLÉ BRASIL LTDA.',
    source_import_id: 'imp-1',
    source_row: 2,
    cnpj_loja: '98765432000188',
    codigo_cliente: 'CLI-002',
    categoria: 'Laticínios',
    observacao: '',
    data_entrada: '2025-02-20',
    ultima_aparicao: '2025-02-20',
    cliente: 'NESTLÉ BRASIL LTDA.',
    codigo_loja: '0105',
    nome_loja: '0105 - CARREFOUR BARRA DA TIJUCA',
    cidade: 'Rio de Janeiro',
    estado: 'RJ',
    produto: 'TODOS OS PRODUTOS NESTLÉ',
    motivo: 'Estoque Virtual',
    situacao_atual: 'Ativo',
    data_visita: '2025-02-20',
    dias_em_ruptura: 4,
    colaborador: 'Maria Oliveira Gonçalves',
  },
]

const mockImportHistory: ImportHistoryExportItem[] = [
  {
    id: 'job-1',
    file_name: 'Diretoria_Validades_2025-02-01.xlsx',
    file_hash: 'a1b2c3d4e5f67890123456789abcdef0',
    tipo: 'validades',
    status: 'success',
    total_rows: 150,
    imported_rows: 148,
    skipped_rows: 2,
    created: '2025-02-01T12:00:00Z',
  },
  {
    id: 'job-2',
    file_name: 'Rupturas_Fevereiro_Avançado.xlsx',
    file_hash: 'fedcba0987654321',
    tipo: 'rupturas',
    status: 'failed',
    total_rows: 200,
    imported_rows: 0,
    skipped_rows: 0,
    error_rows: 200,
    created: '2025-02-10T15:30:00Z',
  },
]

const baseSnapshot = {
  validades: mockValidades,
  rupturas: mockRupturas,
  timestamp: '2025-02-25T12:00:00Z',
}

describe('CAMADA 7B — operationalExports Builders and Rules', () => {
  // 1. BASE TRATADA VALIDADES
  describe('1. Builder Base Tratada Validades', () => {
    it('gera colunas exatas (nome e ordem), preserva zeros à esquerda, acentos e caracteres especiais', () => {
      const { data, headers, metadata } = buildBaseTratadaValidades(baseSnapshot, {
        criticidade: 'Crítico',
        loja: '0042',
      })

      // Colunas exatas em ordem
      expect(headers).toEqual([
        'Cliente/Marca',
        'Fornecedor',
        'Código Loja',
        'Nome Loja',
        'Loja',
        'Rede',
        'Cidade',
        'UF',
        'Produto',
        'Quantidade',
        'Unidade',
        'Validade',
        'Dias p/Vencer',
        'Status Operacional',
        'Criticidade',
        'Realizado/Data Pesquisa',
        'Data Entrada',
        'Promotor',
        'Supervisor',
        'Origem/Arquivo',
      ])

      expect(data.length).toBe(2)
      const first = data[0]

      // Preservação de zero à esquerda como texto
      expect(first['Código Loja']).toBe('0042')
      expect(typeof first['Código Loja']).toBe('string')

      // Preservação de acentos e caracteres especiais
      expect(first.Produto).toContain('BISCOITO CRACKER VITARELLA 400G — TRADIÇÃO & SABOR')
      expect(first.Loja).toContain('ASSAÍ ATACADISTA')
      expect(first.Cidade).toContain('São João de Meriti')

      // Fornecedor fixo
      expect(first.Fornecedor).toBe('DIRETORIA')

      // Datas no formato DD/MM/AAAA
      expect(first.Validade).toBe('10/05/2025')
      expect(first['Data Entrada']).toBe('01/02/2025')
      expect(first['Realizado/Data Pesquisa']).toBe('01/02/2025')

      // Zero undefined/null nas células
      for (const row of data) {
        for (const key of Object.keys(row)) {
          const val = (row as unknown as Record<string, unknown>)[key]
          expect(val).not.toBeUndefined()
          expect(val).not.toBeNull()
          expect(String(val)).not.toContain('undefined')
          expect(String(val)).not.toContain('null')
        }
      }

      // Zero colunas fictícias
      expect(first).not.toHaveProperty('lote')
      expect(first).not.toHaveProperty('preco_unitario')
      expect(first).not.toHaveProperty('exposicao_financeira')

      // Metadados com total, filtros, origem, versão
      expect(metadata.find((m) => m.Campo === 'Versão do Exportador')?.Valor).toBe(
        OPERATIONAL_EXPORT_VERSION,
      )
      expect(metadata.find((m) => m.Campo === 'Origem dos Dados')?.Valor).toBe(
        'Base Atual (snapshot)',
      )
      expect(metadata.find((m) => m.Campo === 'Total de Registros')?.Valor).toBe(2)
      expect(metadata.find((m) => m.Campo === 'Filtros Aplicados')?.Valor).toContain(
        'criticidade: Crítico',
      )
      expect(metadata.find((m) => m.Campo === 'Filtros Aplicados')?.Valor).toContain('loja: 0042')
    })
  })

  // 2. BASE TRATADA RUPTURAS
  describe('2. Builder Base Tratada Rupturas', () => {
    it('gera colunas exatas (nome e ordem), com escopo, dias em ruptura, parent id e sem colunas fictícias', () => {
      const { data, headers, metadata } = buildBaseTratadaRupturas(baseSnapshot, {
        motivo: 'Ruptura Total',
      })

      expect(headers).toEqual([
        'Cliente/Marca',
        'Código Loja',
        'Nome Loja',
        'Loja',
        'Rede',
        'Cidade',
        'UF',
        'Produto/Atividade',
        'Código Produto',
        'Motivo',
        'Situação',
        'Data Visita',
        'Dias em Ruptura',
        'Colaborador/Promotor',
        'Origem',
        'Escopo',
        'Derivada?',
        'Parent ID',
      ])

      expect(data.length).toBe(2)
      const first = data[0]

      expect(first['Código Loja']).toBe('0042')
      expect(first.Loja).toContain('0042 • ASSAÍ ATACADISTA')
      expect(first['Data Visita']).toBe('15/02/2025')
      expect(first['Dias em Ruptura']).toBe(12)
      expect(first['Derivada?']).toBe('Não')
      expect(first.Escopo).toBe('product')

      // Zero undefined/null
      for (const row of data) {
        for (const key of Object.keys(row)) {
          const val = (row as unknown as Record<string, unknown>)[key]
          expect(val).not.toBeUndefined()
          expect(val).not.toBeNull()
          expect(String(val)).not.toContain('undefined')
          expect(String(val)).not.toContain('null')
        }
      }

      // Zero colunas fictícias
      expect(first).not.toHaveProperty('lote')
      expect(first).not.toHaveProperty('preco_unitario')
      expect(first).not.toHaveProperty('exposicao_financeira')

      // Metadados
      expect(metadata.find((m) => m.Campo === 'Total de Registros')?.Valor).toBe(2)
      expect(metadata.find((m) => m.Campo === 'Filtros Aplicados')?.Valor).toContain(
        'motivo: Ruptura Total',
      )
    })
  })

  // 3. PENDÊNCIAS DE AUDITORIA
  describe('3. Builder Pendências de Auditoria', () => {
    it('isola vencidos, gera colunas exatas e formata datas e motivos de auditoria', () => {
      const { data, headers, metadata } = buildPendenciasAuditoria(baseSnapshot)

      expect(headers).toEqual([
        'Código Loja',
        'Nome Loja',
        'Loja',
        'Marca',
        'Produto',
        'Quantidade',
        'Validade Original',
        'Dias',
        'Motivo de Isolamento',
        'Status da Auditoria',
        'Data Sinalização',
        'Observação',
      ])

      // Isola apenas o item com status Vencido (val-2)
      expect(data.length).toBe(1)
      const item = data[0]
      expect(item['Código Loja']).toBe('0105')
      expect(item.Marca).toBe('NESTLÉ BRASIL LTDA.')
      expect(item.Produto).toBe('LEITE CONDENSADO MOÇA 395G LATA')
      expect(item['Validade Original']).toBe('15/01/2025')
      expect(item['Motivo de Isolamento']).toBe('Vencido')
      expect(item.Dias).toBe(-20)

      // Zero undefined/null
      for (const key of Object.keys(item)) {
        const val = (item as unknown as Record<string, unknown>)[key]
        expect(val).not.toBeUndefined()
        expect(val).not.toBeNull()
        expect(String(val)).not.toContain('undefined')
        expect(String(val)).not.toContain('null')
      }

      expect(metadata.find((m) => m.Campo === 'Total de Registros')?.Valor).toBe(1)
    })
  })

  // 4. CONFRONTO RUPTURA × VALIDADE
  describe('4. Builder Confronto Ruptura × Validade (Modo Shadow)', () => {
    it('executa motor shadow de reconciliação com colunas exatas, match method e confiança', () => {
      const { data, headers, metadata } = buildConfrontoRupturaValidade(baseSnapshot, {
        confianca: 'alta',
      })

      expect(headers).toEqual([
        'Loja',
        'Marca',
        'Produto',
        'Data Ruptura',
        'Data Evidência Posterior',
        'Dias até Evidência',
        'Quantidade',
        'Match Method',
        'Confidence',
        'Situação Shadow',
        'Revisão Humana',
      ])

      // Zero undefined/null
      for (const row of data) {
        for (const key of Object.keys(row)) {
          const val = (row as unknown as Record<string, unknown>)[key]
          expect(val).not.toBeUndefined()
          expect(val).not.toBeNull()
          expect(String(val)).not.toContain('undefined')
          expect(String(val)).not.toContain('null')
        }
      }

      expect(metadata.find((m) => m.Campo === 'Observações')?.Valor).toContain('Modo Shadow')
      expect(metadata.find((m) => m.Campo === 'Filtros Aplicados')?.Valor).toContain(
        'confianca: alta',
      )
    })
  })

  // 5. CENTRAL ESTRATÉGICA (4 ABAS + METADADOS)
  describe('5. Builder Central Estratégica', () => {
    it('gera estrutura com 4 abas (Lojas, Produtos, Marcas, Ações) + Metadados sem JSON cru', () => {
      const { data, metadata } = buildCentralEstrategica(baseSnapshot)

      expect(data.lojasCriticas).toBeDefined()
      expect(data.produtosCriticos).toBeDefined()
      expect(data.marcasCriticas).toBeDefined()
      expect(data.acoesRecomendadas).toBeDefined()

      expect(data.lojasCriticas.length).toBeGreaterThanOrEqual(1)
      expect(data.produtosCriticos.length).toBeGreaterThanOrEqual(1)
      expect(data.marcasCriticas.length).toBeGreaterThanOrEqual(1)

      // Validar aba Lojas
      const topLoja = data.lojasCriticas[0]
      expect(topLoja.Rank).toBe(1)
      expect(topLoja['Score de Risco']).toBeGreaterThanOrEqual(0)
      expect(topLoja['Score de Risco']).toBeLessThanOrEqual(100)
      expect(topLoja.Severidade).toBeDefined()

      // Validar aba Produtos
      const topProd = data.produtosCriticos[0]
      expect(topProd.Rank).toBe(1)
      expect(topProd.Produto).toBeDefined()
      expect(topProd['Score de Risco']).toBeGreaterThanOrEqual(0)

      // Validar aba Marcas
      const topMarca = data.marcasCriticas[0]
      expect(topMarca.Rank).toBe(1)
      expect(topMarca.Marca).toBeDefined()

      // Validar ações recomendadas humanizadas e sem JSON cru
      for (const acao of data.acoesRecomendadas) {
        expect(acao['Evidências Formatadas']).not.toContain('{"')
        expect(acao['Evidências Formatadas']).not.toContain('undefined')
        expect(acao['Evidências Formatadas']).not.toContain('null')
      }

      // Validar Metadados
      expect(metadata.find((m) => m.Campo === 'Tipo de Exportação')?.Valor).toContain(
        'Central Estratégica',
      )
      expect(metadata.find((m) => m.Campo === 'Versão do Exportador')?.Valor).toBe(
        OPERATIONAL_EXPORT_VERSION,
      )
    })
  })

  // 6. HISTÓRICO DE IMPORTAÇÕES
  describe('6. Builder Histórico de Importações', () => {
    it('gera histórico de jobs com hash abreviado e suporta aba adicional de erros', () => {
      const errorsList = [
        {
          linha: 14,
          chave: '0042_PROD_99',
          etapa: 'persistência',
          motivo: 'Data de validade no passado não permitida',
          codigo_http: 400,
          tentativas: 3,
        },
      ]

      const snapshotWithHistory = {
        ...baseSnapshot,
        importHistory: mockImportHistory,
      }

      const { data, headers, metadata, errorsData } = buildHistoricoImportacoes(
        snapshotWithHistory,
        errorsList,
      )

      expect(headers).toEqual([
        'Data',
        'Tipo',
        'Arquivo',
        'Hash (abreviado)',
        'Status',
        'Recebidos',
        'Persistidos',
        'Ignorados/Duplicados',
        'Erros',
        'Usuário',
      ])

      expect(data.length).toBe(2)
      expect(data[0].Arquivo).toBe('Diretoria_Validades_2025-02-01.xlsx')
      expect(data[0]['Hash (abreviado)']).toBe('a1b2c3d4...ef0')
      expect(data[0].Recebidos).toBe(150)
      expect(data[0].Persistidos).toBe(148)

      // Erros Data
      expect(errorsData).toBeDefined()
      expect(errorsData?.length).toBe(1)
      expect(errorsData?.[0].Linha).toBe(14)
      expect(errorsData?.[0].Chave).toBe('0042_PROD_99')
      expect(errorsData?.[0].Motivo).toContain('Data de validade')

      expect(metadata.find((m) => m.Campo === 'Total de Registros')?.Valor).toBe(2)
    })
  })

  // 7. PERFORMANCE COM 10.000 LINHAS SINTÉTICAS
  describe('7. Performance de processamento de grande volume', () => {
    it('processa 10.000 linhas sintéticas em memória em menos de 1000ms', () => {
      const syntheticValidades: ValidadeItem[] = Array.from({ length: 10000 }, (_, i) => ({
        id: `syn-${i}`,
        cliente: `MARCA_INDUSTRIAL_${i % 15}`,
        codigoLoja: String(i % 100).padStart(4, '0'),
        loja: `${String(i % 100).padStart(4, '0')} - LOJA SINTÉTICA ${i % 100}`,
        cidade: 'São Paulo',
        uf: 'SP',
        product: `PRODUTO SINTÉTICO ESPECIAL ${i % 300} COM AÇÚCAR & CANELA`,
        sku: `SKU_${i % 300}`,
        category: 'Mercearia',
        lote: `LT_${i % 50}`,
        unidade: 'UN',
        quantidade: (i % 20) + 1,
        estoque: (i % 20) + 1,
        validade: '2025-06-30',
        diasRestantes: (i % 30) + 1,
        status: 'Normal',
        dataEntrada: '2025-02-01',
        promotor: 'Promotor Teste de Desempenho',
      }))

      const largeSnapshot = {
        validades: syntheticValidades,
        rupturas: [],
        timestamp: '2025-02-25T12:00:00Z',
      }

      const tStart = performance.now()
      const { data, headers, metadata } = buildBaseTratadaValidades(largeSnapshot)
      const tEnd = performance.now()

      expect(data.length).toBe(10000)
      expect(headers.length).toBe(20)
      expect(metadata.length).toBeGreaterThan(0)
      expect(tEnd - tStart).toBeLessThan(1000)
    })
  })

  // 8. TRATAMENTO DE ZERO REGISTROS (ERRO EXPLICATIVO NO DOWNLOAD)
  describe('8. Tratamento de zero registros', () => {
    it('lança erro explicativo e não baixa arquivo vazio em todos os downloads', () => {
      const emptySnapshot = {
        validades: [],
        rupturas: [],
        timestamp: '2025-02-25T12:00:00Z',
      }

      expect(() => downloadBaseTratadaValidadesXLSX(emptySnapshot)).toThrow(
        'Nenhum registro de validade',
      )
      expect(() => downloadBaseTratadaValidadesCSV(emptySnapshot)).toThrow(
        'Nenhum registro de validade',
      )
      expect(() => downloadBaseTratadaRupturasXLSX(emptySnapshot)).toThrow(
        'Nenhum registro de ruptura',
      )
      expect(() => downloadBaseTratadaRupturasCSV(emptySnapshot)).toThrow(
        'Nenhum registro de ruptura',
      )
      expect(() => downloadPendenciasAuditoriaXLSX(emptySnapshot)).toThrow(
        'Nenhuma ocorrência de auditoria/vencidos',
      )
      expect(() => downloadPendenciasAuditoriaCSV(emptySnapshot)).toThrow(
        'Nenhuma ocorrência de auditoria/vencidos',
      )
      expect(() => downloadConfrontoXLSX(emptySnapshot)).toThrow('Nenhuma evidência de confronto')
      expect(() => downloadConfrontoCSV(emptySnapshot)).toThrow('Nenhuma evidência de confronto')
      expect(() => downloadCentralEstrategicaXLSX(emptySnapshot)).toThrow(
        'Nenhum dado estratégico disponível',
      )
      expect(() => downloadHistoricoImportacoesXLSX(emptySnapshot)).toThrow(
        'Nenhum registro de histórico',
      )
      expect(() => downloadHistoricoImportacoesCSV(emptySnapshot)).toThrow(
        'Nenhum registro de histórico',
      )
    })
  })
})
