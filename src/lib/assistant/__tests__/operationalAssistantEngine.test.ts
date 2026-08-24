import { describe, it, expect } from 'vitest'
import {
  normalizeForIntent,
  sanitizeInput,
  parseIntent,
  executeIntent,
  type AssistantResponse,
} from '../operationalAssistantEngine'
import type { BaseAtualSnapshot } from '@/lib/selectors/baseAtualSelectors'
import type { CrossEvidence, Ruptura, ValidadeItem } from '@/types'

// Mock de Snapshot Mínimo Consistente
function createMockSnapshot(): BaseAtualSnapshot {
  const validades: ValidadeItem[] = [
    {
      id: 'val_1',
      cliente: 'FRUTAP',
      industria: 'FRUTAP',
      rede: 'FORT ATACADISTA',
      loja: 'FORT ATACADISTA 240',
      codigoLoja: '240',
      cidade: 'FLORIANOPOLIS',
      uf: 'SC',
      product: 'IOGURTE FRUTAP MORANGO 900G',
      category: 'Não informada',
      sku: '7891234567890',
      lote: 'L123',
      quantidade: 120,
      estoque: 120,
      unidade: 'UN',
      validade: '2025-05-10',
      diasRestantes: 3,
      status: 'Crítico',
      promotor: 'Carlos Silva',
    },
    {
      id: 'val_2',
      cliente: 'CASA KUNZLER',
      industria: 'CASA KUNZLER',
      rede: 'BRASIL ATACADISTA',
      loja: 'BRASIL ATACADISTA 085',
      codigoLoja: '085',
      cidade: 'JOINVILLE',
      uf: 'SC',
      product: 'LINGUICA BLUMENAU KUNZLER 400G',
      category: 'Não informada',
      sku: '7899876543210',
      lote: 'L456',
      quantidade: 45,
      estoque: 45,
      unidade: 'UN',
      validade: '2025-05-15',
      diasRestantes: 6,
      status: 'Atenção',
      promotor: 'Ana Souza',
    },
    {
      id: 'val_3',
      cliente: 'FRUTAP',
      industria: 'FRUTAP',
      rede: 'FORT ATACADISTA',
      loja: 'FORT ATACADISTA 250',
      codigoLoja: '250',
      cidade: 'ITAJAI',
      uf: 'SC',
      product: 'BEBIDA LACTEA FRUTAP 1L',
      category: 'Não informada',
      sku: '7891112223334',
      lote: 'L789',
      quantidade: 80,
      estoque: 80,
      unidade: 'UN',
      validade: '2025-05-20',
      diasRestantes: 12,
      status: 'Moderado',
      promotor: 'Marcos Lima',
    },
  ]

  const rupturas: Ruptura[] = [
    {
      id: 'rup_1',
      operational_key: 'op_rup_1',
      codigo_loja: '240',
      nome_loja: 'FORT ATACADISTA 240',
      cnpj_loja: '',
      cidade: 'FLORIANOPOLIS',
      estado: 'SC',
      codigo_cliente: 'CLI_01',
      produto: 'IOGURTE FRUTAP MORANGO 900G',
      motivo: 'Ruptura Total',
      situacao_atual: 'Ativo',
      dias_em_ruptura: 18,
      cliente: 'FRUTAP',
      colaborador: 'Carlos Silva',
      data_visita: '2025-04-20',
      data_entrada: '2025-04-20',
      ultima_aparicao: '2025-04-20',
      categoria: 'Geral',
      observacao: '',
      dedup_key: 'dedup_1',
      source_import_id: 'imp_1',
      source_row: 1,
    },
    {
      id: 'rup_2',
      operational_key: 'op_rup_2',
      codigo_loja: '085',
      nome_loja: 'BRASIL ATACADISTA 085',
      cnpj_loja: '',
      cidade: 'JOINVILLE',
      estado: 'SC',
      codigo_cliente: 'CLI_02',
      produto: 'FRUTAP', // Portfólio total de marca
      motivo: 'Ruptura Total',
      situacao_atual: 'Ativo',
      dias_em_ruptura: 5,
      cliente: 'FRUTAP',
      colaborador: 'Ana Souza',
      data_visita: '2025-05-01',
      data_entrada: '2025-05-01',
      ultima_aparicao: '2025-05-01',
      categoria: 'Geral',
      observacao: '',
      dedup_key: 'dedup_2',
      source_import_id: 'imp_1',
      source_row: 2,
    },
  ]

  return {
    validadesAtivas: validades,
    validadesAuditoria: [],
    rupturasAtivas: rupturas,
    alertasOperacionais: [],
    lojasAgregadas: [
      {
        lojaKey: 'COD_240',
        identidade: '240 • FORT ATACADISTA 240',
        codigoLoja: '240',
        nomeLoja: 'FORT ATACADISTA 240',
        rede: 'FORT ATACADISTA',
        cidade: 'FLORIANOPOLIS',
        uf: 'SC',
        cidadeUf: 'FLORIANOPOLIS / SC',
        totalClientes: 1,
        totalOcorrenciasAtivas: 1,
        totalRupturasAtivas: 1,
        totalProdutosEmRisco: 1,
        totalQuantidade: 120,
        statusMaisCritico: 'Crítico',
        itemsAtivos: [validades[0]],
        itemsAuditoria: [],
      },
    ],
    loadedFromBackend: true,
    timestamp: '2025-05-07T12:00:00.000Z',
    kpisReconciliados: {
      validadesAtivasTotal: 3,
      validadesCriticas: 1,
      validadesAtencao: 1,
      validadesModerado: 1,
      validadesNormal: 0,
      quantidadeTotalEmRisco: 245,
      produtosDistintosEmRisco: 3,
      lojasAfetadas: 3,
      clientesAfetados: 2,
      rupturasAtivasTotal: 2,
      alertasAbertosTotal: 3,
      auditoriaVencidosTotal: 0,
    },
  }
}

const mockCrossEvidences: CrossEvidence[] = [
  {
    rupture_record_id: 'rup_1',
    validity_record_id: 'val_1',
    store_code: '240',
    store_name: 'FORT ATACADISTA 240',
    store_key: 'store_240',
    product_code: '7891234567890',
    product_name: 'IOGURTE FRUTAP MORANGO 900G',
    product_key: 'prod_iogurte',
    client_or_brand: 'FRUTAP',
    rupture_detected_at: '2025-04-20',
    stock_evidence_at: '2025-05-02',
    quantity_found: 120,
    product_expiry_date: '2025-05-10',
    resolution_days: 12,
    match_method: 'high_code_product',
    confidence: 'high',
    proposed_status: 'inferred_resolved',
    review_status: 'pending',
    engine_version: '1.0.0',
    evidence_key: 'rup_1|val_1',
  },
]

describe('operationalAssistantEngine', () => {
  // 1. Testes de Normalização
  describe('normalizeForIntent & sanitizeInput', () => {
    it('deve remover acentuação, converter para minúsculas e compactar espaços', () => {
      const input = '  QUAIS SÃO AS   LOJAS MAIS CRÍTICAS?!  '
      const normalized = normalizeForIntent(input)
      expect(normalized).toBe('quais sao as lojas mais criticas')
    })

    it('deve limitar entrada a 500 caracteres', () => {
      const longInput = 'a'.repeat(600)
      const sanitized = sanitizeInput(longInput)
      expect(sanitized.length).toBe(500)
    })

    it('deve retornar string vazia para entrada vazia ou nula', () => {
      expect(normalizeForIntent('')).toBe('')
      expect(sanitizeInput('')).toBe('')
    })
  })

  // 2. Parsing das 13+ Intenções com variações
  describe('parseIntent - Cobertura de Intenções', () => {
    it('deve identificar OVERVIEW com variações', () => {
      const p1 = parseIntent('resumo geral da operação')
      expect(p1?.intent).toBe('OVERVIEW')

      const p2 = parseIntent('como está o panorama geral dos kpis?')
      expect(p2?.intent).toBe('OVERVIEW')
    })

    it('deve identificar TOP_STORES com variações', () => {
      const p1 = parseIntent('quais são as 5 lojas mais críticas?')
      expect(p1?.intent).toBe('TOP_STORES')

      const p2 = parseIntent('top lojas com maior risco operacional')
      expect(p2?.intent).toBe('TOP_STORES')
    })

    it('deve identificar TOP_PRODUCTS com variações', () => {
      const p1 = parseIntent('quais os produtos mais críticos?')
      expect(p1?.intent).toBe('TOP_PRODUCTS')

      const p2 = parseIntent('ranking dos 5 principais produtos a vencer')
      expect(p2?.intent).toBe('TOP_PRODUCTS')
    })

    it('deve identificar TOP_BRANDS com variações', () => {
      const p1 = parseIntent('quais marcas exigem ação imediata?')
      expect(p1?.intent).toBe('TOP_BRANDS')

      const p2 = parseIntent('quais as industrias mais criticas')
      expect(p2?.intent).toBe('TOP_BRANDS')
    })

    it('deve identificar EXPIRING_SOON com extração de dias', () => {
      const p1 = parseIntent('quais produtos vencem nos próximos 7 dias?')
      expect(p1?.intent).toBe('EXPIRING_SOON')
      expect(p1?.params.days).toBe('7')

      const p2 = parseIntent('validades proximas para 15 dias')
      expect(p2?.intent).toBe('EXPIRING_SOON')
      expect(p2?.params.days).toBe('15')
    })

    it('deve identificar OLDEST_RUPTURES com variações', () => {
      const p1 = parseIntent('quais são as rupturas mais antigas?')
      expect(p1?.intent).toBe('OLDEST_RUPTURES')

      const p2 = parseIntent('rupturas ativas há mais tempo em gôndola')
      expect(p2?.intent).toBe('OLDEST_RUPTURES')
    })

    it('deve identificar STORE_DETAIL com extração do código da loja', () => {
      const p1 = parseIntent('como está a loja 240?')
      expect(p1?.intent).toBe('STORE_DETAIL')
      expect(p1?.params.storeCode).toBe('240')

      const p2 = parseIntent('situação da loja 085')
      expect(p2?.intent).toBe('STORE_DETAIL')
      expect(p2?.params.storeCode).toBe('085')

      const p3 = parseIntent('250')
      expect(p3?.intent).toBe('STORE_DETAIL')
      expect(p3?.params.storeCode).toBe('250')
    })

    it('deve identificar BRAND_DETAIL com extração de marca', () => {
      const p1 = parseIntent('como está a marca FRUTAP?')
      expect(p1?.intent).toBe('BRAND_DETAIL')
      expect(p1?.params.brand).toBe('FRUTAP')

      const p2 = parseIntent('situação da CASA KUNZLER')
      expect(p2?.intent).toBe('BRAND_DETAIL')
      expect(p2?.params.brand).toBe('CASA KUNZLER')
    })

    it('deve identificar RECOMMENDED_ACTIONS com variações', () => {
      const p1 = parseIntent('quais as ações recomendadas?')
      expect(p1?.intent).toBe('RECOMMENDED_ACTIONS')

      const p2 = parseIntent('o que fazer com as lojas prioritárias e recolhimento urgente?')
      expect(p2?.intent).toBe('RECOMMENDED_ACTIONS')
    })

    it('deve identificar CONFRONT_EVIDENCE com variações', () => {
      const p1 = parseIntent('quais rupturas possuem evidência posterior de validade?')
      expect(p1?.intent).toBe('CONFRONT_EVIDENCE')

      const p2 = parseIntent('confronto entre rupturas e validades encontradas')
      expect(p2?.intent).toBe('CONFRONT_EVIDENCE')
    })

    it('deve identificar SCORE_EXPLANATION com variações', () => {
      const p1 = parseIntent('como o score é calculado?')
      expect(p1?.intent).toBe('SCORE_EXPLANATION')

      const p2 = parseIntent('qual a metodologia e faixas do score de risco?')
      expect(p2?.intent).toBe('SCORE_EXPLANATION')
    })

    it('deve identificar AVAILABLE_DATA com variações', () => {
      const p1 = parseIntent('quais dados estão disponíveis na base?')
      expect(p1?.intent).toBe('AVAILABLE_DATA')

      const p2 = parseIntent('o que posso perguntar para o assistente?')
      expect(p2?.intent).toBe('AVAILABLE_DATA')
    })

    it('deve identificar BRAND_TOTAL_RUPTURES com variações', () => {
      const p1 = parseIntent('quantas rupturas totais de marca foram expandidas?')
      expect(p1?.intent).toBe('BRAND_TOTAL_RUPTURES')

      const p2 = parseIntent('rupturas de portfólio total sem catálogo')
      expect(p2?.intent).toBe('BRAND_TOTAL_RUPTURES')
    })
  })

  // 3. Testes de Bloqueios Honestos
  describe('Bloqueios Honestos (Financeiro & Fora de Escopo)', () => {
    it('deve bloquear perguntas de faturamento e receita', () => {
      const parsed = parseIntent('qual foi o faturamento da loja 240 no mês?')
      expect(parsed?.intent).toBe('BLOCKED_FINANCIAL')

      const snapshot = createMockSnapshot()
      const res = executeIntent(parsed, snapshot, [])
      expect(res.intent).toBe('blocked')
      expect(res.title).toBe('Análise indisponível')
      expect(res.isBlocked).toBe(true)
      expect(res.limitations.length).toBeGreaterThan(0)
    })

    it('deve bloquear perguntas de margem, sell-out e lucro', () => {
      const p1 = parseIntent('qual o sell-out e margem de lucro da Frutap?')
      expect(p1?.intent).toBe('BLOCKED_FINANCIAL')

      const p2 = parseIntent('qual a previsão de perdas financeiras para amanhã?')
      expect(p2?.intent).toBe('BLOCKED_FINANCIAL')
    })

    it('deve bloquear perguntas fora do escopo (ex: política, cotação de moedas)', () => {
      const p1 = parseIntent('quem é o presidente do brasil?')
      expect(p1?.intent).toBe('BLOCKED_OUT_OF_SCOPE')

      const snapshot = createMockSnapshot()
      const res = executeIntent(p1, snapshot, [])
      expect(res.intent).toBe('blocked')
      expect(res.isBlocked).toBe(true)
      expect(res.summary).toContain('fora do escopo')
    })
  })

  // 4. Execução de Intenções e Estrutura de Resposta
  describe('executeIntent - Estrutura e Métricas Reais', () => {
    const snapshot = createMockSnapshot()

    it('deve retornar métricas e evidências completas para OVERVIEW', () => {
      const parsed = parseIntent('visão geral da operação')
      const res = executeIntent(parsed, snapshot, mockCrossEvidences)

      expect(res.intent).toBe('OVERVIEW')
      expect(res.metrics.length).toBeGreaterThanOrEqual(4)
      expect(res.evidence.length).toBeGreaterThanOrEqual(2)
      expect(res.sources).toContain('Base Atual (validades_base, rupturas_base)')
      expect(res.summary).toContain('1 validades críticas')
    })

    it('deve calcular top 5 lojas com código e score determinístico', () => {
      const parsed = parseIntent('quais são as lojas mais críticas?')
      const res = executeIntent(parsed, snapshot, mockCrossEvidences)

      expect(res.intent).toBe('TOP_STORES')
      expect(res.metrics.length).toBeGreaterThan(0)
      expect(res.evidence[0].title).toContain('240')
      expect(res.evidence[0].navigationPath).toBe('/lojas/240')
    })

    it('deve executar STORE_DETAIL com dados específicos da loja 240', () => {
      const parsed = parseIntent('situação da loja 240')
      const res = executeIntent(parsed, snapshot, mockCrossEvidences)

      expect(res.intent).toBe('STORE_DETAIL')
      expect(res.title).toContain('240')
      expect(res.metrics.some((m) => m.label === 'Score de Risco')).toBe(true)
      expect(res.evidence.some((e) => e.navigationPath === '/lojas/240')).toBe(true)
    })

    it('deve filtrar validades na janela especificada para EXPIRING_SOON', () => {
      const parsed = parseIntent('quais produtos vencem nos próximos 3 dias?')
      const res = executeIntent(parsed, snapshot, mockCrossEvidences)

      expect(res.intent).toBe('EXPIRING_SOON')
      expect(res.filtersApplied[0].value).toContain('1 a 3 dias')
      expect(res.metrics[0].value).toBe(1) // apenas o de 3 dias no mock
    })

    it('deve retornar evidências de confronto de ruptura x validade', () => {
      const parsed = parseIntent('confronto de rupturas com validade posterior')
      const res = executeIntent(parsed, snapshot, mockCrossEvidences)

      expect(res.intent).toBe('CONFRONT_EVIDENCE')
      expect(res.metrics[0].value).toBe(1)
      expect(res.evidence[0].title).toBe('IOGURTE FRUTAP MORANGO 900G')
    })

    it('deve explicar o score de risco com faixas e pesos auditáveis', () => {
      const parsed = parseIntent('como o score é calculado?')
      const res = executeIntent(parsed, snapshot, mockCrossEvidences)

      expect(res.intent).toBe('SCORE_EXPLANATION')
      expect(res.metrics.some((m) => m.label === 'Faixa Crítico')).toBe(true)
      expect(res.evidence.some((e) => e.title.includes('Validades'))).toBe(true)
    })
  })

  // 5. Determinismo e Casos de Borda
  describe('Determinismo & Resiliência a Dados Vazios', () => {
    it('deve garantir determinismo: mesma pergunta sobre a mesma base produz exatamente a mesma resposta', () => {
      const snapshot = createMockSnapshot()
      const p1 = parseIntent('quais as lojas mais críticas?')
      const r1 = executeIntent(p1, snapshot, mockCrossEvidences)

      const p2 = parseIntent('quais as lojas mais críticas?')
      const r2 = executeIntent(p2, snapshot, mockCrossEvidences)

      expect(r1.summary).toBe(r2.summary)
      expect(r1.metrics).toEqual(r2.metrics)
      expect(r1.evidence).toEqual(r2.evidence)
    })

    it('não deve quebrar com base vazia (snapshot com listas vazias)', () => {
      const emptySnapshot: BaseAtualSnapshot = {
        validadesAtivas: [],
        validadesAuditoria: [],
        rupturasAtivas: [],
        alertasOperacionais: [],
        lojasAgregadas: [],
        loadedFromBackend: false,
        timestamp: '2025-05-07T12:00:00.000Z',
        kpisReconciliados: {
          validadesAtivasTotal: 0,
          validadesCriticas: 0,
          validadesAtencao: 0,
          validadesModerado: 0,
          validadesNormal: 0,
          quantidadeTotalEmRisco: 0,
          produtosDistintosEmRisco: 0,
          lojasAfetadas: 0,
          clientesAfetados: 0,
          rupturasAtivasTotal: 0,
          alertasAbertosTotal: 0,
          auditoriaVencidosTotal: 0,
        },
      }

      const parsed = parseIntent('resumo geral da operação')
      expect(() => executeIntent(parsed, emptySnapshot, [])).not.toThrow()
      const res = executeIntent(parsed, emptySnapshot, [])
      expect(res.intent).toBe('OVERVIEW')
      expect(res.metrics[0].value).toBe(0)
    })

    it('deve tratar entradas não reconhecidas com resposta instrutiva sem erro', () => {
      const parsed = parseIntent('abracadabra xyz 12399999')
      const snapshot = createMockSnapshot()
      const res = executeIntent(parsed, snapshot, [])
      expect(res.intent).toBe('unrecognized')
      expect(res.title).toBe('Pergunta não compreendida')
    })
  })
})
