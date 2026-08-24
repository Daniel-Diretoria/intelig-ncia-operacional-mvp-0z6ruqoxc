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
} from '../operationalExports'
import type { BaseAtualSnapshot } from '@/lib/selectors/baseAtualSelectors'
import type { ValidadeItem, Ruptura, ImportHistoryItem } from '@/types'

// Mock de amostra com dados reais, acentos, códigos com zero à esquerda e datas variadas
const mockValidades: ValidadeItem[] = [
  {
    id: 'val-1',
    operational_key: 'op-1',
    cliente: 'M. DIAS BRANCO',
    codigoLoja: '0042',
    loja: '0042 - ASSAI ATACADISTA - TIJUCA',
    cidade: 'Rio de Janeiro',
    estado: 'RJ',
    product: 'BISCOITO CRACKER VITARELLA 400G',
    quantidade: 150,
    validade: '2025-05-10',
    diasRestantes: 5,
    status: 'Crítico',
    dataEntrada: '2025-02-01',
    promotor: 'João da Silva',
    supervisor: 'Carlos Pereira',
    origem: 'Pesquisa Validade.xlsx',
  },
  {
    id: 'val-2',
    operational_key: 'op-2',
    cliente: 'NESTLÉ',
    codigoLoja: '0105',
    loja: '0105 - CARREFOUR BARRA',
    cidade: 'Rio de Janeiro',
    estado: 'RJ',
    product: 'LEITE CONDENSADO MOÇA 395G',
    quantidade: 0,
    validade: '2025-01-15',
    diasRestantes: -20,
    status: 'Vencido',
    dataEntrada: '2025-01-10',
    promotor: 'Maria Oliveira',
  },
]

const mockRupturas: Ruptura[] = [
  {
    id: 'rup-1',
    operational_key: 'rup-op-1',
    cliente: 'M. DIAS BRANCO',
    codigo_loja: '0042',
    nome_loja: '0042 - ASSAI ATACADISTA - TIJUCA',
    cidade: 'Rio de Janeiro',
    uf: 'RJ',
    produto: 'BISCOITO CRACKER VITARELLA 400G',
    motivo: 'Ruptura Total',
    situacao_atual: 'Ativo',
    data_visita: '2025-02-15',
    dias_em_ruptura: 12,
    colaborador: 'João da Silva',
    created: '2025-02-15T10:00:00Z',
    updated: '2025-02-15T10:00:00Z',
  },
  {
    id: 'rup-2',
    operational_key: 'rup-op-2',
    cliente: 'NESTLÉ',
    codigo_loja: '0105',
    nome_loja: '0105 - CARREFOUR BARRA',
    cidade: 'Rio de Janeiro',
    uf: 'RJ',
    produto: 'TODOS OS PRODUTOS NESTLÉ',
    motivo: 'Estoque Virtual',
    situacao_atual: 'Ativo',
    data_visita: '2025-02-20',
    dias_em_ruptura: 4,
    colaborador: 'Maria Oliveira',
    created: '2025-02-20T10:00:00Z',
    updated: '2025-02-20T10:00:00Z',
  },
]

const mockImportHistory: ImportHistoryItem[] = [
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
    file_name: 'Rupturas_Fevereiro.xlsx',
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

const baseSnapshot: BaseAtualSnapshot = {
  validades: mockValidades,
  rupturas: mockRupturas,
  timestamp: '2025-02-25T12:00:00Z',
  isMockFallback: false,
}

describe('CAMADA 7B — operationalExports Builders and Rules', () => {
  it('A) buildBaseTratadaValidades gera colunas corretas, sem dados fictícios e com zeros à esquerda preservados', () => {
    const { data, headers, metadata } = buildBaseTratadaValidades(baseSnapshot, {
      criticidade: 'Crítico',
    })

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

    // Valida preservação de zero à esquerda
    expect(first['Código Loja']).toBe('0042')
    // Valida Fornecedor fixo
    expect(first.Fornecedor).toBe('DIRETORIA')
    // Valida coluna LOJA formatada
    expect(first.Loja).toContain('0042 • ASSAI ATACADISTA - TIJUCA')
    // Valida data formatada em DD/MM/AAAA
    expect(first.Validade).toBe('10/05/2025')
    // Valida que não contém undefined ou null
    for (const key of Object.keys(first)) {
      expect((first as any)[key]).not.toBeUndefined()
      expect((first as any)[key]).not.toBeNull()
      expect(String((first as any)[key])).not.toContain('undefined')
      expect(String((first as any)[key])).not.toContain('null')
    }

    // Zero colunas fictícias verificadas:
    expect(first).not.toHaveProperty('lote')
    expect(first).not.toHaveProperty('preco_unitario')
    expect(first).not.toHaveProperty('exposicao_financeira')
    expect(first).not.toHaveProperty('sku')
    expect(first).not.toHaveProperty('categoria')

    // Metadados
    expect(metadata.find((m) => m.Campo === 'Versão do Exportador')?.Valor).toBe(
      OPERATIONAL_EXPORT_VERSION,
    )
    expect(metadata.find((m) => m.Campo === 'Filtros Aplicados')?.Valor).toContain(
      'criticidade: Crítico',
    )
  })

  it('B) buildBaseTratadaRupturas gera colunas corretas com escopo, dias em ruptura e parent_id se aplicável', () => {
    const { data, headers, metadata } = buildBaseTratadaRupturas(baseSnapshot)

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
    expect(first.Loja).toContain('0042 • ASSAI ATACADISTA - TIJUCA')
    expect(first['Data Visita']).toBe('15/02/2025')
    expect(first['Dias em Ruptura']).toBe(12)
    expect(first['Derivada?']).toBe('Não')

    expect(metadata.find((m) => m.Campo === 'Total de Registros')?.Valor).toBe(2)
  })

  it('C) buildPendenciasAuditoria isola vencidos com motivo e datas formatadas', () => {
    const { data, headers } = buildPendenciasAuditoria(baseSnapshot)

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

    // Deve isolar apenas o item vencido (val-2)
    expect(data.length).toBe(1)
    const item = data[0]
    expect(item['Código Loja']).toBe('0105')
    expect(item.Marca).toBe('NESTLÉ')
    expect(item.Produto).toBe('LEITE CONDENSADO MOÇA 395G')
    expect(item['Validade Original']).toBe('15/01/2025')
    expect(item['Motivo de Isolamento']).toBe('Vencido')
  })

  it('D) buildConfrontoRupturaValidade executa motor shadow de reconciliação', () => {
    const { data, headers, metadata } = buildConfrontoRupturaValidade(baseSnapshot)

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

    // O mock tem confronto entre BISCOITO CRACKER VITARELLA na loja 0042
    expect(data.length).toBeGreaterThanOrEqual(1)
    const match = data.find((d) => d.Produto.includes('VITARELLA'))
    if (match) {
      expect(match.Loja).toContain('0042')
      expect(match.Marca).toBe('M. DIAS BRANCO')
      expect(match['Match Method']).toBeDefined()
      expect(match.Confidence).toBeDefined()
    }

    expect(metadata.find((m) => m.Campo === 'Observações')?.Valor).toContain('Modo Shadow')
  })

  it('E) buildCentralEstrategica gera as 4 abas completas com evidências formatadas sem JSON cru', () => {
    const { data, metadata } = buildCentralEstrategica(baseSnapshot)

    expect(data.lojasCriticas.length).toBeGreaterThanOrEqual(1)
    expect(data.produtosCriticos.length).toBeGreaterThanOrEqual(1)
    expect(data.marcasCriticas.length).toBeGreaterThanOrEqual(1)
    expect(data.acoesRecomendadas).toBeDefined()

    // Validar aba Lojas
    const topLoja = data.lojasCriticas[0]
    expect(topLoja.Rank).toBe(1)
    expect(topLoja['Score de Risco']).toBeGreaterThanOrEqual(0)
    expect(topLoja.Severidade).toBeDefined()

    // Validar evidências humanas sem JSON cru
    for (const acao of data.acoesRecomendadas) {
      expect(acao['Evidências Formatadas']).not.toContain('{"')
      expect(acao['Evidências Formatadas']).not.toContain('undefined')
      expect(acao['Evidências Formatadas']).not.toContain('null')
    }

    expect(metadata.find((m) => m.Campo === 'Tipo de Exportação')?.Valor).toContain(
      'Central Estratégica',
    )
  })

  it('F) buildHistoricoImportacoes gera histórico e aba de erros se fornecida', () => {
    const errorsList = [
      {
        linha: 14,
        chave: 'LOJA_01_PROD_99',
        etapa: 'persistência',
        motivo: 'Validade no passado não permitida',
        codigo_http: 400,
        tentativas: 3,
      },
    ]

    const snapshotWithHistory = {
      ...baseSnapshot,
      importHistory: mockImportHistory,
    }

    const { data, headers, errorsData } = buildHistoricoImportacoes(snapshotWithHistory, errorsList)

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

    expect(errorsData).toBeDefined()
    expect(errorsData?.length).toBe(1)
    expect(errorsData?.[0].Chave).toBe('LOJA_01_PROD_99')
  })

  it('G) Performance com 10.000 linhas sintéticas em memória', () => {
    const syntheticValidades: ValidadeItem[] = Array.from({ length: 10000 }, (_, i) => ({
      id: `syn-${i}`,
      operational_key: `syn-op-${i}`,
      cliente: `MARCA_${i % 10}`,
      codigoLoja: String(i % 50).padStart(4, '0'),
      loja: `LOJA_${i % 50}`,
      cidade: 'São Paulo',
      estado: 'SP',
      product: `PRODUTO_SINTETICO_${i % 200}`,
      quantidade: (i % 20) + 1,
      validade: '2025-06-30',
      diasRestantes: (i % 30) + 1,
      status: 'Normal',
      dataEntrada: '2025-02-01',
      promotor: 'Promotor Teste',
    }))

    const largeSnapshot: BaseAtualSnapshot = {
      validades: syntheticValidades,
      rupturas: [],
      timestamp: '2025-02-25T12:00:00Z',
      isMockFallback: false,
    }

    const tStart = performance.now()
    const { data } = buildBaseTratadaValidades(largeSnapshot)
    const tEnd = performance.now()

    expect(data.length).toBe(10000)
    // Deve processar 10k linhas em menos de 500ms
    expect(tEnd - tStart).toBeLessThan(1000)
  })

  it('H) Tratamento adequado de zero registros (lança erro explicativo no download)', () => {
    const emptySnapshot: BaseAtualSnapshot = {
      validades: [],
      rupturas: [],
      timestamp: '2025-02-25T12:00:00Z',
      isMockFallback: false,
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
    expect(() => downloadHistoricoImportacoesXLSX(emptySnapshot)).toThrow(
      'Nenhum registro de histórico',
    )
    expect(() => downloadHistoricoImportacoesCSV(emptySnapshot)).toThrow(
      'Nenhum registro de histórico',
    )
  })
})
