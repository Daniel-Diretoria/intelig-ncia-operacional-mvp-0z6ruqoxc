import { describe, it, expect } from 'vitest'
import {
  RISK_MODEL_VERSION,
  normalizeBrandKey,
  isBrandTotalRupture,
  buildBrandProductCatalog,
  expandBrandTotalRuptures,
  getValidadeDaysPoints,
  getValidadeQuantityAdditionalPoints,
  computeSingleValidadePoints,
  getRupturaDaysPoints,
  getSeverityLevel,
  computeStoreRiskScore,
  computeProductRiskScore,
  computeBrandRiskScore,
  generateRecommendedActions,
  type ValidadeRecord,
  type RupturaRecord,
} from '../strategicRankings'

import {
  adaptValidadeItem,
  adaptRupturaItem,
  BLOCKER_MISSING_INDUSTRY_CONTEXT,
} from '../../api/tradeProAdapter'
import type { TradeProValidadeItem, TradeProRupturaItem } from '@/types/tradeProApi'

describe('Camada 4 — Central Estratégica e Regras Confirmadas', () => {
  // 1. normalizeBrandKey: "CHULETÃO" === "CHULETÃO" (ou sua forma limpa normalizada)
  it('1. normalizeBrandKey: "CHULETÃO" === "CHULETÃO" (normalizado: "chuletao")', () => {
    expect(normalizeBrandKey('CHULETÃO')).toBe('chuletao')
  })

  // 2. normalizeBrandKey: "Chuletão " com espaços e acentos === "chuletao"
  it('2. normalizeBrandKey: "Chuletão " com espaços e acentos === "chuletao"', () => {
    expect(normalizeBrandKey('  Chuletão   ')).toBe('chuletao')
    expect(normalizeBrandKey('CHULETÃO')).toBe(normalizeBrandKey('  Chuletão   '))
  })

  // 3. isBrandTotalRupture: "CHULETÃO" produto === "CHULETÃO" cliente → true
  it('3. isBrandTotalRupture: "CHULETÃO" produto === "CHULETÃO" cliente → true', () => {
    expect(isBrandTotalRupture('CHULETÃO', 'CHULETÃO')).toBe(true)
    expect(isBrandTotalRupture('Chuletão', 'CHULETÃO')).toBe(true)
  })

  // 4. isBrandTotalRupture: "QUEIJO RALADO 400G KUNZLER" produto !== "CASA KUNZLER" cliente → false
  it('4. isBrandTotalRupture: "QUEIJO RALADO 400G KUNZLER" produto !== "CASA KUNZLER" cliente → false', () => {
    expect(isBrandTotalRupture('QUEIJO RALADO 400G KUNZLER', 'CASA KUNZLER')).toBe(false)
  })

  // 5. isBrandTotalRupture: "BRQ Industria de Alimentos S.A" !== "CASA KUNZLER" → false
  it('5. isBrandTotalRupture: "BRQ Industria de Alimentos S.A" !== "CASA KUNZLER" → false', () => {
    expect(isBrandTotalRupture('BRQ Industria de Alimentos S.A', 'CASA KUNZLER')).toBe(false)
  })

  // 6. buildBrandProductCatalog: catálogo isolado por marca — produtos de CASA KUNZLER não contêm produtos de CHULETÃO
  it('6. buildBrandProductCatalog: catálogo isolado por marca — produtos de CASA KUNZLER não contêm produtos de CHULETÃO', () => {
    const mockValidades: ValidadeRecord[] = [
      {
        id: 'v1',
        cliente: 'CASA KUNZLER',
        fornecedor: 'DIRETORIA',
        razaoSocial: '085 - FORT ATACADISTA',
        codigoLoja: '085',
        produto: 'QUEIJO RALADO 400G KUNZLER',
        codProduto: 'KZ-001',
        quantidade: 20,
        realizado: '2026-08-10',
        validadeOriginal: '2026-08-20',
        validadeEfetiva: '2026-08-20',
        diasVencimentoAtual: 10,
        statusOperacional: 'Crítico',
        situacaoAtual: 'Ativo',
        isBaseAtual: true,
        chaveOperacional: 'k1',
        chaveDedup: 'd1',
      },
      {
        id: 'v2',
        cliente: 'CHULETÃO',
        fornecedor: 'DIRETORIA',
        razaoSocial: '085 - FORT ATACADISTA',
        codigoLoja: '085',
        produto: 'LINGUICA CHULETÃO 500G',
        codProduto: 'CH-002',
        quantidade: 15,
        realizado: '2026-08-10',
        validadeOriginal: '2026-08-25',
        validadeEfetiva: '2026-08-25',
        diasVencimentoAtual: 15,
        statusOperacional: 'Crítico',
        situacaoAtual: 'Ativo',
        isBaseAtual: true,
        chaveOperacional: 'k2',
        chaveDedup: 'd2',
      },
    ]

    const catalog = buildBrandProductCatalog(mockValidades)
    const kunzlerProducts = catalog.get(normalizeBrandKey('CASA KUNZLER')) || []
    const chuletaoProducts = catalog.get(normalizeBrandKey('CHULETÃO')) || []

    expect(kunzlerProducts).toHaveLength(1)
    expect(kunzlerProducts[0].productName).toBe('QUEIJO RALADO 400G KUNZLER')
    expect(chuletaoProducts).toHaveLength(1)
    expect(chuletaoProducts[0].productName).toBe('LINGUICA CHULETÃO 500G')

    // Isolamento total
    expect(kunzlerProducts.some((p) => p.productName.includes('CHULETÃO'))).toBe(false)
    expect(chuletaoProducts.some((p) => p.productName.includes('KUNZLER'))).toBe(false)
  })

  // 7. expandBrandTotalRuptures: expansão com rastreabilidade (parentRuptureId, derived, reason, catalogSource)
  it('7. expandBrandTotalRuptures: expansão com rastreabilidade completa', () => {
    const validades: ValidadeRecord[] = [
      {
        id: 'v1',
        cliente: 'MARIGOLD',
        fornecedor: 'DIRETORIA',
        razaoSocial: '220 - FORT ATACADISTA TUBARÃO',
        codigoLoja: '220',
        produto: 'PIPOCA DOCE MARIGOLD 50G',
        codProduto: 'MAR-01',
        quantidade: 30,
        realizado: '2026-08-10',
        validadeOriginal: '2026-08-30',
        validadeEfetiva: '2026-08-30',
        diasVencimentoAtual: 20,
        statusOperacional: 'Atenção',
        situacaoAtual: 'Ativo',
        isBaseAtual: true,
        chaveOperacional: 'k1',
        chaveDedup: 'd1',
      },
    ]

    const rupturas: RupturaRecord[] = [
      {
        id: 'rup-total-1',
        produto: 'MARIGOLD', // Ruptura total
        cliente: 'MARIGOLD',
        codigo_loja: '220',
        nome_loja: '220 - FORT ATACADISTA TUBARÃO',
        cnpj_loja: '013',
        cidade: 'Tubarão',
        estado: 'SC',
        codigo_cliente: '48',
        colaborador: 'ADRIELE',
        categoria: 'SNACKS',
        observacao: 'Sem estoque',
        data_visita: '2026-08-11',
        data_entrada: '2026-08-11',
        ultima_aparicao: '2026-08-11',
        situacao_atual: 'Ativo',
        operational_key: 'op1',
        dedup_key: 'ded1',
        source_import_id: 'imp1',
        source_row: 4,
        motivo: 'Ruptura Total',
        dias_em_ruptura: 5,
      },
    ]

    const { expanded, unresolved } = expandBrandTotalRuptures(rupturas, validades)

    expect(unresolved).toHaveLength(0)
    expect(expanded).toHaveLength(1)
    const child = expanded[0]
    expect(child.parentRuptureId).toBe('rup-total-1')
    expect(child.derived).toBe(true)
    expect(child.reason).toBe('brand_total')
    expect(child.catalogSource).toBe('validades_base_current')
    expect(child.confidence).toBe('derived_from_current_catalog')
    expect(child.productName).toBe('PIPOCA DOCE MARIGOLD 50G')
    expect(child.productCode).toBe('MAR-01')
    expect(child.brand).toBe('MARIGOLD')
    expect(child.codigo_loja).toBe('220')
  })

  // 8. expandBrandTotalRuptures: ruptura específica oficial prevalece sobre derivada (dedup)
  it('8. expandBrandTotalRuptures: ruptura específica oficial prevalece sobre derivada (dedup)', () => {
    const validades: ValidadeRecord[] = [
      {
        id: 'v1',
        cliente: 'MARIGOLD',
        fornecedor: 'DIRETORIA',
        razaoSocial: '220 - FORT ATACADISTA TUBARÃO',
        codigoLoja: '220',
        produto: 'PIPOCA DOCE MARIGOLD 50G',
        codProduto: 'MAR-01',
        quantidade: 30,
        realizado: '2026-08-10',
        validadeOriginal: '2026-08-30',
        validadeEfetiva: '2026-08-30',
        diasVencimentoAtual: 20,
        statusOperacional: 'Atenção',
        situacaoAtual: 'Ativo',
        isBaseAtual: true,
        chaveOperacional: 'k1',
        chaveDedup: 'd1',
      },
    ]

    const rupturas: RupturaRecord[] = [
      {
        id: 'rup-total-1',
        produto: 'MARIGOLD', // Ruptura total
        cliente: 'MARIGOLD',
        codigo_loja: '220',
        nome_loja: '220 - FORT ATACADISTA TUBARÃO',
        cnpj_loja: '013',
        cidade: 'Tubarão',
        estado: 'SC',
        codigo_cliente: '48',
        colaborador: 'ADRIELE',
        categoria: 'SNACKS',
        observacao: 'Sem estoque',
        data_visita: '2026-08-11',
        data_entrada: '2026-08-11',
        ultima_aparicao: '2026-08-11',
        situacao_atual: 'Ativo',
        operational_key: 'op1',
        dedup_key: 'ded1',
        source_import_id: 'imp1',
        source_row: 4,
        motivo: 'Ruptura Total',
        dias_em_ruptura: 5,
      },
      {
        id: 'rup-spec-1',
        produto: 'PIPOCA DOCE MARIGOLD 50G', // Ruptura específica oficial pré-existente
        cliente: 'MARIGOLD',
        codigo_loja: '220',
        nome_loja: '220 - FORT ATACADISTA TUBARÃO',
        cnpj_loja: '013',
        cidade: 'Tubarão',
        estado: 'SC',
        codigo_cliente: '48',
        colaborador: 'ADRIELE',
        categoria: 'SNACKS',
        observacao: 'Específico sem estoque',
        data_visita: '2026-08-11',
        data_entrada: '2026-08-11',
        ultima_aparicao: '2026-08-11',
        situacao_atual: 'Ativo',
        operational_key: 'op2',
        dedup_key: 'ded2',
        source_import_id: 'imp1',
        source_row: 5,
        motivo: 'Sem Estoque Mínimo',
        dias_em_ruptura: 8,
      },
    ]

    const { expanded } = expandBrandTotalRuptures(rupturas, validades)
    // Como já existe uma específica oficial para 'PIPOCA DOCE MARIGOLD 50G' na loja 220, não duplica filho
    expect(expanded).toHaveLength(0)
  })

  // 9. expandBrandTotalRuptures: catálogo vazio → unresolvedBrandTotal, sem filhos inventados
  it('9. expandBrandTotalRuptures: catálogo vazio → unresolvedBrandTotal, sem filhos inventados', () => {
    const validadesVazias: ValidadeRecord[] = []
    const rupturas: RupturaRecord[] = [
      {
        id: 'rup-total-sem-cat',
        produto: 'MARCA DESCONHECIDA',
        cliente: 'MARCA DESCONHECIDA',
        codigo_loja: '100',
        nome_loja: '100 - LOJA TESTE',
        cnpj_loja: '111',
        cidade: 'Curitiba',
        estado: 'PR',
        codigo_cliente: '99',
        colaborador: 'FULANO',
        categoria: 'GERAL',
        observacao: 'Total',
        data_visita: '2026-08-11',
        data_entrada: '2026-08-11',
        ultima_aparicao: '2026-08-11',
        situacao_atual: 'Ativo',
        operational_key: 'op1',
        dedup_key: 'ded1',
        source_import_id: 'imp1',
        source_row: 1,
        motivo: 'Ruptura Total',
        dias_em_ruptura: 2,
      },
    ]

    const { expanded, unresolved } = expandBrandTotalRuptures(rupturas, validadesVazias)
    expect(expanded).toHaveLength(0)
    expect(unresolved).toHaveLength(1)
    expect(unresolved[0].brand).toBe('MARCA DESCONHECIDA')
    expect(unresolved[0].parentRuptureId).toBe('rup-total-sem-cat')
  })

  // 10. expandBrandTotalRuptures: pai excluído da contagem de produto quando há filhos
  it('10. expandBrandTotalRuptures: pai excluído da contagem de produto quando há filhos', () => {
    const validades: ValidadeRecord[] = [
      {
        id: 'v1',
        cliente: 'FRUTAP',
        fornecedor: 'DIRETORIA',
        razaoSocial: '240 - FORT ATACADISTA CHAPECÓ',
        codigoLoja: '240',
        produto: 'IOGURTE MORANGO 170G',
        codProduto: 'FRU-10',
        quantidade: 10,
        realizado: '2026-08-10',
        validadeOriginal: '2026-08-20',
        validadeEfetiva: '2026-08-20',
        diasVencimentoAtual: 10,
        statusOperacional: 'Crítico',
        situacaoAtual: 'Ativo',
        isBaseAtual: true,
        chaveOperacional: 'k1',
        chaveDedup: 'd1',
      },
    ]

    const rupturas: RupturaRecord[] = [
      {
        id: 'rup-pai',
        produto: 'FRUTAP', // pai
        cliente: 'FRUTAP',
        codigo_loja: '240',
        nome_loja: '240 - FORT ATACADISTA CHAPECÓ',
        cnpj_loja: '016',
        cidade: 'Chapecó',
        estado: 'SC',
        codigo_cliente: '7',
        colaborador: 'ANA',
        categoria: 'PERECIVEIS',
        observacao: 'Total',
        data_visita: '2026-08-11',
        data_entrada: '2026-08-11',
        ultima_aparicao: '2026-08-11',
        situacao_atual: 'Ativo',
        operational_key: 'op1',
        dedup_key: 'ded1',
        source_import_id: 'imp1',
        source_row: 1,
        motivo: 'Ruptura Total',
        dias_em_ruptura: 4,
      },
    ]

    const { expanded } = expandBrandTotalRuptures(rupturas, validades)
    // O produto "IOGURTE MORANGO 170G" deve herdar a ruptura derivada
    const prodScore = computeProductRiskScore('IOGURTE MORANGO 170G', validades, rupturas, expanded)
    expect(prodScore.rupturasDerivedCount).toBe(1)
    expect(prodScore.rupturasSpecificCount).toBe(0)

    // O produto pai "FRUTAP" não deve contabilizar ocorrências de produto
    const paiScore = computeProductRiskScore('FRUTAP', validades, rupturas, expanded)
    expect(paiScore.rupturasSpecificCount).toBe(0)
  })

  // 11. Score: faixas de dias (1-3 → 10pts, 4-7 → 8pts, 8-15 → 5pts, 16-25 → 2pts, 26-35 → 1pt, 36+ → 0pts)
  it('11. Score: faixas de dias de validade corretas', () => {
    expect(getValidadeDaysPoints(1)).toBe(10)
    expect(getValidadeDaysPoints(2)).toBe(10)
    expect(getValidadeDaysPoints(3)).toBe(10)

    expect(getValidadeDaysPoints(4)).toBe(8)
    expect(getValidadeDaysPoints(7)).toBe(8)

    expect(getValidadeDaysPoints(8)).toBe(5)
    expect(getValidadeDaysPoints(15)).toBe(5)

    expect(getValidadeDaysPoints(16)).toBe(2)
    expect(getValidadeDaysPoints(25)).toBe(2)

    expect(getValidadeDaysPoints(26)).toBe(1)
    expect(getValidadeDaysPoints(35)).toBe(1)

    expect(getValidadeDaysPoints(36)).toBe(0)
    expect(getValidadeDaysPoints(100)).toBe(0)
    expect(getValidadeDaysPoints(0)).toBe(0)
    expect(getValidadeDaysPoints(-5)).toBe(0)
  })

  // 12. Score: adicional de quantidade (>=100 → +4, 50-99 → +3, 10-49 → +1, <10 → +0)
  it('12. Score: adicional de quantidade correto', () => {
    expect(getValidadeQuantityAdditionalPoints(150)).toBe(4)
    expect(getValidadeQuantityAdditionalPoints(100)).toBe(4)
    expect(getValidadeQuantityAdditionalPoints(99)).toBe(3)
    expect(getValidadeQuantityAdditionalPoints(50)).toBe(3)
    expect(getValidadeQuantityAdditionalPoints(49)).toBe(1)
    expect(getValidadeQuantityAdditionalPoints(10)).toBe(1)
    expect(getValidadeQuantityAdditionalPoints(9)).toBe(0)
    expect(getValidadeQuantityAdditionalPoints(0)).toBe(0)
  })

  // 13. Score: ruptura por dias (0-3 → 2pts, 4-7 → 4pts, 8-14 → 7pts, 15+ → 10pts)
  it('13. Score: ruptura por dias correto', () => {
    expect(getRupturaDaysPoints(0)).toBe(2)
    expect(getRupturaDaysPoints(3)).toBe(2)
    expect(getRupturaDaysPoints(4)).toBe(4)
    expect(getRupturaDaysPoints(7)).toBe(4)
    expect(getRupturaDaysPoints(8)).toBe(7)
    expect(getRupturaDaysPoints(14)).toBe(7)
    expect(getRupturaDaysPoints(15)).toBe(10)
    expect(getRupturaDaysPoints(30)).toBe(10)
  })

  // 14. Score: cap em 100 (soma 120 → score 100, rawPoints 120)
  it('14. Score: cap em 100 (soma 120 → score 100, rawPoints 120)', () => {
    // 12 validades de 10pts cada = 120pts
    const validades: ValidadeRecord[] = Array.from({ length: 12 }).map((_, i) => ({
      id: `v_${i}`,
      cliente: 'MARCA TESTE',
      fornecedor: 'DIRETORIA',
      razaoSocial: '001 - LOJA CAP',
      codigoLoja: '001',
      produto: `PROD_${i}`,
      quantidade: 5,
      realizado: '2026-08-10',
      validadeOriginal: '2026-08-12',
      validadeEfetiva: '2026-08-12',
      diasVencimentoAtual: 2, // 10 pts
      statusOperacional: 'Crítico',
      situacaoAtual: 'Ativo',
      isBaseAtual: true,
      chaveOperacional: `k_${i}`,
      chaveDedup: `d_${i}`,
    }))

    const result = computeStoreRiskScore('001', validades, [], [])
    expect(result.rawPoints).toBe(120)
    expect(result.score).toBe(100)
    expect(result.severity).toBe('Crítico')
  })

  // 15. Score: estabilidade independente da amostra (mesma loja com mesmos dados → mesmo score sempre)
  it('15. Score: estabilidade determinística independente de outros dados da amostra', () => {
    const validadesLoja1: ValidadeRecord[] = [
      {
        id: 'v1',
        cliente: 'MARCA 1',
        fornecedor: 'DIRETORIA',
        razaoSocial: '001 - LOJA FIXA',
        codigoLoja: '001',
        produto: 'PROD 1',
        quantidade: 10, // 5pts + 1pt = 6pts
        realizado: '2026-08-10',
        validadeOriginal: '2026-08-20',
        validadeEfetiva: '2026-08-20',
        diasVencimentoAtual: 10,
        statusOperacional: 'Crítico',
        situacaoAtual: 'Ativo',
        isBaseAtual: true,
        chaveOperacional: 'k1',
        chaveDedup: 'd1',
      },
    ]

    const scoreSozinha = computeStoreRiskScore('001', validadesLoja1, [], [])

    // Adicionar 500 outras lojas ao redor
    const outrasValidades: ValidadeRecord[] = Array.from({ length: 50 }).map((_, i) => ({
      id: `v_outra_${i}`,
      cliente: 'OUTRA MARCA',
      fornecedor: 'DIRETORIA',
      razaoSocial: `002 - LOJA OUTRA`,
      codigoLoja: '002',
      produto: `OUTRO PROD ${i}`,
      quantidade: 100,
      realizado: '2026-08-10',
      validadeOriginal: '2026-08-11',
      validadeEfetiva: '2026-08-11',
      diasVencimentoAtual: 1,
      statusOperacional: 'Crítico',
      situacaoAtual: 'Ativo',
      isBaseAtual: true,
      chaveOperacional: `k2_${i}`,
      chaveDedup: `d2_${i}`,
    }))

    const scoreComAmostraMaior = computeStoreRiskScore(
      '001',
      [...validadesLoja1, ...outrasValidades],
      [],
      [],
    )

    expect(scoreSozinha.score).toBe(scoreComAmostraMaior.score)
    expect(scoreSozinha.rawPoints).toBe(scoreComAmostraMaior.rawPoints)
  })

  // 16. Faixas de severidade: 80 → Crítico, 60 → Alto, 35 → Atenção, 10 → Monitorar
  it('16. Faixas de severidade conforme faixas estritas', () => {
    expect(getSeverityLevel(80)).toBe('Crítico')
    expect(getSeverityLevel(75)).toBe('Crítico')
    expect(getSeverityLevel(60)).toBe('Alto')
    expect(getSeverityLevel(50)).toBe('Alto')
    expect(getSeverityLevel(35)).toBe('Atenção')
    expect(getSeverityLevel(25)).toBe('Atenção')
    expect(getSeverityLevel(10)).toBe('Monitorar')
    expect(getSeverityLevel(0)).toBe('Monitorar')
  })

  // 17. Ações: VISITA_PRIORITARIA dispara com 3 validades 1-7 dias + 2 rupturas
  it('17. Ações: VISITA_PRIORITARIA dispara com 3 validades 1-7 dias + 2 rupturas', () => {
    const validades: ValidadeRecord[] = [1, 2, 3].map((idx) => ({
      id: `v_${idx}`,
      cliente: 'MARCA 1',
      fornecedor: 'DIRETORIA',
      razaoSocial: '099 - HIPER TESTE',
      codigoLoja: '099',
      produto: `PROD_${idx}`,
      quantidade: 10,
      realizado: '2026-08-10',
      validadeOriginal: '2026-08-15',
      validadeEfetiva: '2026-08-15',
      diasVencimentoAtual: 5, // 1-7 dias
      statusOperacional: 'Crítico',
      situacaoAtual: 'Ativo',
      isBaseAtual: true,
      chaveOperacional: `k_${idx}`,
      chaveDedup: `d_${idx}`,
    }))

    const rupturas: RupturaRecord[] = [1, 2].map((idx) => ({
      id: `r_${idx}`,
      produto: `RUP_${idx}`,
      cliente: 'MARCA 1',
      codigo_loja: '099',
      nome_loja: '099 - HIPER TESTE',
      cnpj_loja: '999',
      cidade: 'Joinville',
      estado: 'SC',
      codigo_cliente: '1',
      colaborador: 'JOSE',
      categoria: 'SECOS',
      observacao: 'Zerado',
      data_visita: '2026-08-11',
      data_entrada: '2026-08-11',
      ultima_aparicao: '2026-08-11',
      situacao_atual: 'Ativo',
      operational_key: `op_${idx}`,
      dedup_key: `ded_${idx}`,
      source_import_id: 'imp1',
      source_row: idx,
      motivo: 'Sem Estoque Mínimo',
      dias_em_ruptura: 4,
    }))

    const lojaScore = computeStoreRiskScore('099', validades, rupturas, [])
    const actions = generateRecommendedActions([lojaScore], [], [], validades)

    const visitaActions = actions.filter((a) => a.rule_id === 'VISITA_PRIORITARIA')
    expect(visitaActions).toHaveLength(1)
    expect(visitaActions[0].evidence.storeCode).toBe('099')
  })

  // 18. Ações: VISITA_PRIORITARIA NÃO dispara com 2 validades + 2 rupturas
  it('18. Ações: VISITA_PRIORITARIA NÃO dispara com 2 validades + 2 rupturas (precisa >= 3)', () => {
    const validades: ValidadeRecord[] = [1, 2].map((idx) => ({
      id: `v_${idx}`,
      cliente: 'MARCA 1',
      fornecedor: 'DIRETORIA',
      razaoSocial: '099 - HIPER TESTE',
      codigoLoja: '099',
      produto: `PROD_${idx}`,
      quantidade: 10,
      realizado: '2026-08-10',
      validadeOriginal: '2026-08-15',
      validadeEfetiva: '2026-08-15',
      diasVencimentoAtual: 5,
      statusOperacional: 'Crítico',
      situacaoAtual: 'Ativo',
      isBaseAtual: true,
      chaveOperacional: `k_${idx}`,
      chaveDedup: `d_${idx}`,
    }))

    const rupturas: RupturaRecord[] = [1, 2].map((idx) => ({
      id: `r_${idx}`,
      produto: `RUP_${idx}`,
      cliente: 'MARCA 1',
      codigo_loja: '099',
      nome_loja: '099 - HIPER TESTE',
      cnpj_loja: '999',
      cidade: 'Joinville',
      estado: 'SC',
      codigo_cliente: '1',
      colaborador: 'JOSE',
      categoria: 'SECOS',
      observacao: 'Zerado',
      data_visita: '2026-08-11',
      data_entrada: '2026-08-11',
      ultima_aparicao: '2026-08-11',
      situacao_atual: 'Ativo',
      operational_key: `op_${idx}`,
      dedup_key: `ded_${idx}`,
      source_import_id: 'imp1',
      source_row: idx,
      motivo: 'Sem Estoque Mínimo',
      dias_em_ruptura: 4,
    }))

    const lojaScore = computeStoreRiskScore('099', validades, rupturas, [])
    const actions = generateRecommendedActions([lojaScore], [], [], validades)
    const visitaActions = actions.filter((a) => a.rule_id === 'VISITA_PRIORITARIA')
    expect(visitaActions).toHaveLength(0)
  })

  // 19. Ações: PRODUTO_RUPTURA_RECORRENTE dispara com 5 lojas
  it('19. Ações: PRODUTO_RUPTURA_RECORRENTE dispara com produto em 5 lojas com ruptura ativa', () => {
    const rupturas: RupturaRecord[] = [1, 2, 3, 4, 5].map((idx) => ({
      id: `r_recorrente_${idx}`,
      produto: 'BISCOITO CHOCOLATE 100G',
      cliente: 'MARCA DOCE',
      codigo_loja: `00${idx}`,
      nome_loja: `LOJA 00${idx}`,
      cnpj_loja: `11${idx}`,
      cidade: 'Curitiba',
      estado: 'PR',
      codigo_cliente: '1',
      colaborador: 'MARIA',
      categoria: 'BISCOITOS',
      observacao: 'Sem estoque',
      data_visita: '2026-08-11',
      data_entrada: '2026-08-11',
      ultima_aparicao: '2026-08-11',
      situacao_atual: 'Ativo',
      operational_key: `op_${idx}`,
      dedup_key: `ded_${idx}`,
      source_import_id: 'imp1',
      source_row: idx,
      motivo: 'Sem Estoque Mínimo',
      dias_em_ruptura: 3,
    }))

    const prodScore = computeProductRiskScore('BISCOITO CHOCOLATE 100G', [], rupturas, [])
    expect(prodScore.storesWithRuptureCount).toBe(5)

    const actions = generateRecommendedActions([], [prodScore], [], [])
    const recurrentActions = actions.filter((a) => a.rule_id === 'PRODUTO_RUPTURA_RECORRENTE')
    expect(recurrentActions).toHaveLength(1)
    expect(recurrentActions[0].evidence.productName).toBe('BISCOITO CHOCOLATE 100G')
  })

  // 20. Ações: MARCA_RISCO_DISTRIBUICAO dispara com 10 lojas
  it('20. Ações: MARCA_RISCO_DISTRIBUICAO dispara com marca em 10 lojas com validade crítica (1-7 dias)', () => {
    const validades: ValidadeRecord[] = Array.from({ length: 10 }).map((_, idx) => ({
      id: `v_marca_${idx}`,
      cliente: 'LATICINIOS VALE',
      fornecedor: 'DIRETORIA',
      razaoSocial: `LOJA 0${idx + 10}`,
      codigoLoja: `0${idx + 10}`,
      produto: 'LEITE INTEGRAL 1L',
      quantidade: 15,
      realizado: '2026-08-10',
      validadeOriginal: '2026-08-15',
      validadeEfetiva: '2026-08-15',
      diasVencimentoAtual: 5, // 1-7 dias
      statusOperacional: 'Crítico',
      situacaoAtual: 'Ativo',
      isBaseAtual: true,
      chaveOperacional: `k_${idx}`,
      chaveDedup: `d_${idx}`,
    }))

    const brandScore = computeBrandRiskScore('LATICINIOS VALE', validades, [])
    expect(brandScore.validadesCriticalStoresCount).toBe(10)

    const actions = generateRecommendedActions([], [], [brandScore], validades)
    const brandActions = actions.filter((a) => a.rule_id === 'MARCA_RISCO_DISTRIBUICAO')
    expect(brandActions).toHaveLength(1)
    expect(brandActions[0].evidence.brand).toBe('LATICINIOS VALE')
  })

  // 21. Adaptadores: Validade com industryContext → fornecedor='DIRETORIA', cliente=industryClient
  it('21. Adaptadores: Validade com industryContext → fornecedor="DIRETORIA", cliente=industryClient', () => {
    const rawValidade: TradeProValidadeItem = {
      promotor: { nome: 'PROMOTOR 1', id: '0001' },
      cliente: {
        fantasia: 'FANTASIA LOJA',
        endereco: 'RUA A',
        cpfCnpj: '12.345.678/0001-90',
        razaoSocial: '085 - FORT ATACADISTA',
        cidade: {
          nome: 'JOINVILLE',
          estado: { sigla: 'SC' },
        },
      },
      produto: { codigo: '001', descricao: 'PRODUTO TESTE' },
      realizado: '2026-08-10',
      diasParaVencimento: 10,
      quantidade: 5,
      validade: '2026-08-20',
    }

    const adapted = adaptValidadeItem(rawValidade, { industryClient: 'CASA KUNZLER' })
    expect(adapted.status).toBe('valid')
    if (adapted.status === 'valid') {
      expect(adapted.candidato.fornecedor).toBe('DIRETORIA')
      expect(adapted.candidato.cliente).toBe('CASA KUNZLER')
      expect(adapted.candidato.produto).toBe('PRODUTO TESTE')
    }
  })

  // 22. Adaptadores: Validade sem industryClient → missing_industry_context
  it('22. Adaptadores: Validade sem industryClient → missing_industry_context', () => {
    const rawValidade: TradeProValidadeItem = {
      promotor: { nome: 'PROMOTOR 1', id: '0001' },
      cliente: {
        fantasia: 'FANTASIA LOJA',
        endereco: 'RUA A',
        cpfCnpj: '12.345.678/0001-90',
        razaoSocial: '085 - FORT ATACADISTA',
        cidade: {
          nome: 'JOINVILLE',
          estado: { sigla: 'SC' },
        },
      },
      produto: { codigo: '001', descricao: 'PRODUTO TESTE' },
      realizado: '2026-08-10',
      diasParaVencimento: 10,
      quantidade: 5,
      validade: '2026-08-20',
    }

    const adapted = adaptValidadeItem(rawValidade)
    expect(adapted.status).toBe('blocked')
    if (adapted.status === 'blocked') {
      expect(adapted.blockerCode).toBe(BLOCKER_MISSING_INDUSTRY_CONTEXT)
      expect(adapted.blockerCode).toBe('missing_industry_context')
    }
  })

  // 23. Adaptadores: Ruptura com descricaoAtividade=produto, scope='product'
  it('23. Adaptadores: Ruptura com descricaoAtividade=produto, scope="product"', () => {
    const rawRuptura: TradeProRupturaItem = {
      idSupervisor: 'S1',
      nomeSupervisor: 'SUP 1',
      idPromotor: '010',
      nomePromotor: 'PROM 1',
      imeiPromotor: '123',
      idCliente: 'C1',
      cpfCnpjCliente: '111',
      codigoCliente: '085',
      razaoSocialCliente: '085 - FORT ATACADISTA',
      fantasiaCliente: 'FORT ATACADISTA',
      redeCliente: 'FORT',
      enderecoCliente: 'RUA 1',
      bairroCliente: 'CENTRO',
      ramoAtividadeCliente: 'ATACADO',
      telefoneCliente: '123',
      cidadeCliente: 'JOINVILLE',
      siglaEstadoCliente: 'SC',
      descricaoRotina: 'ROT',
      idAtividade: 'A1',
      descricaoAtividade: 'BEBIDA LÁCTEA 800ML',
      descricaoCategoria: 'LATICINIOS',
      descricaoMotivo: 'SEM ESTOQUE MINIMO',
      statusRoteiro: 'OK',
      idRoteiroPadrao: 'R1',
      descricaoRoteiroPadrao: 'R1',
      dataVisita: '2026-08-11',
      horaInicioExecucaoRoteiro: '08:00',
      horaFinalExecucaoRoteiro: '09:00',
      observacaoRuptura: 'OBS',
      cnpjFornecedor: '222',
      descricaoFornecedor: 'FRUTAP',
      idAtividadeRuptura: 'AR1',
      idCategoria: 'CAT1',
      codigoFamilia: 'FAM1',
      descricaoFamilia: 'FAM1',
      ruptura: 1,
      dataHoraExecucaoAtividade: '2026-08-11 08:30:00',
    }

    const adapted = adaptRupturaItem(rawRuptura)
    expect(adapted.status).toBe('valid')
    expect(adapted.candidato.produto).toBe('BEBIDA LÁCTEA 800ML')
    expect(adapted.candidato.cliente).toBe('FRUTAP')
    expect(adapted.candidato.scope).toBe('product')
  })

  // 24. Adaptadores: Ruptura com descricaoAtividade===marca → scope='brand_total'
  it('24. Adaptadores: Ruptura com descricaoAtividade===marca → scope="brand_total"', () => {
    const rawRupturaTotal: TradeProRupturaItem = {
      idSupervisor: 'S1',
      nomeSupervisor: 'SUP 1',
      idPromotor: '010',
      nomePromotor: 'PROM 1',
      imeiPromotor: '123',
      idCliente: 'C1',
      cpfCnpjCliente: '111',
      codigoCliente: '085',
      razaoSocialCliente: '085 - FORT ATACADISTA',
      fantasiaCliente: 'FORT ATACADISTA',
      redeCliente: 'FORT',
      enderecoCliente: 'RUA 1',
      bairroCliente: 'CENTRO',
      ramoAtividadeCliente: 'ATACADO',
      telefoneCliente: '123',
      cidadeCliente: 'JOINVILLE',
      siglaEstadoCliente: 'SC',
      descricaoRotina: 'ROT',
      idAtividade: 'A1',
      descricaoAtividade: 'MARIGOLD',
      descricaoCategoria: 'SNACKS',
      descricaoMotivo: 'RUPTURA TOTAL',
      statusRoteiro: 'OK',
      idRoteiroPadrao: 'R1',
      descricaoRoteiroPadrao: 'R1',
      dataVisita: '2026-08-11',
      horaInicioExecucaoRoteiro: '08:00',
      horaFinalExecucaoRoteiro: '09:00',
      observacaoRuptura: 'OBS',
      cnpjFornecedor: '222',
      descricaoFornecedor: 'MARIGOLD',
      idAtividadeRuptura: 'AR1',
      idCategoria: 'CAT1',
      codigoFamilia: 'FAM1',
      descricaoFamilia: 'FAM1',
      ruptura: 1,
      dataHoraExecucaoAtividade: '2026-08-11 08:30:00',
    }

    const adapted = adaptRupturaItem(rawRupturaTotal)
    expect(adapted.status).toBe('valid')
    expect(adapted.candidato.produto).toBe('MARIGOLD')
    expect(adapted.candidato.cliente).toBe('MARIGOLD')
    expect(adapted.candidato.scope).toBe('brand_total')
  })
})
