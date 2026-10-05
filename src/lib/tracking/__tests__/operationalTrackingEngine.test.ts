import { describe, it, expect } from 'vitest'
import {
  generateExpectedCycles,
  mapDateToCycle,
  calculateCyclesMissed,
  formatIsoDateOnly,
  parseIsoDateOnly,
} from '@/lib/tracking/cycleCalculator'
import { evaluateStoreCycleQuality } from '@/lib/tracking/cycleQualityValidator'
import {
  runOperationalTrackingEngine,
  classifyValidityHealth,
  computeOperationalPriority,
} from '@/lib/tracking/operationalTrackingEngine'
import { resolveValidityPolicy } from '@/services/industryService'
import type { ValidadeItem, Ruptura } from '@/types'
import type {
  IndustryResearchConfig,
  IndustryStoreProductMix,
  IndustryStoreCoverage,
  IndustryValidityPolicy,
} from '@/types/industryOperational'

describe('Motor de Acompanhamento Operacional do SKIP', () => {
  // 1. Pesquisa semanal e ciclos esperados
  it('identifica ciclos para pesquisa semanal com dia esperado fixado na configuração (ex: terça)', () => {
    // Terça-feira hipotética 2026-10-06
    const refDate = new Date(2026, 9, 6, 12, 0, 0)
    const cycles = generateExpectedCycles(
      {
        tipo_pesquisa: 'validades',
        frequencia: 'semanal',
        dia_esperado: 'terca',
      },
      refDate,
      4,
    )

    expect(cycles.length).toBe(4)
    expect(cycles[0].dataEsperada).toBe('2026-10-06')
    expect(cycles[1].dataEsperada).toBe('2026-09-29')
    expect(cycles[2].dataEsperada).toBe('2026-09-22')
    expect(cycles[3].dataEsperada).toBe('2026-09-15')
    expect(cycles[0].ehCicloAtual).toBe(true)
    expect(cycles[1].ehCicloAtual).toBe(false)
  })

  // 2. Pesquisa quinzenal respeita o intervalo configurado
  it('respeita frequência quinzenal (14 dias) sem presumir atraso em 7 dias', () => {
    const refDate = new Date(2026, 9, 6, 12, 0, 0)
    const cycles = generateExpectedCycles(
      {
        tipo_pesquisa: 'validades',
        frequencia: 'quinzenal',
        dia_esperado: 'terca',
      },
      refDate,
      3,
    )

    expect(cycles[0].dataEsperada).toBe('2026-10-06')
    expect(cycles[1].dataEsperada).toBe('2026-09-22')
    expect(cycles[2].dataEsperada).toBe('2026-09-08')

    // Se uma atualização foi feita em 2026-09-22, ela pertence ao ciclo 1, portanto 1 ciclo sem atualização
    const missed = calculateCyclesMissed('2026-09-22', cycles)
    expect(missed.ciclosSemAtualizacao).toBe(1)
  })

  // 3. Produto atualizado normalmente
  it('classifica produto como atualizado normalmente quando recebeu dados no ciclo esperado', () => {
    const cycles = generateExpectedCycles(
      { frequencia: 'semanal', dia_esperado: 'terca' },
      new Date(2026, 9, 6, 12, 0, 0),
      4,
    )
    const missed = calculateCyclesMissed('2026-10-06', cycles)
    expect(missed.ciclosSemAtualizacao).toBe(0)
  })

  // 4. Quantidade ZERO é atualização válida
  it('trata quantidade zero como atualização válida e não como sem atualização', () => {
    const validades: ValidadeItem[] = [
      {
        id: 'val-1',
        sku: 'SKU-1',
        lote: 'L-1',
        category: 'Laticínios',
        status: 'Normal',
        unidade: 'un',
        cliente: 'FRUTAP',
        loja: 'Fort Itajaí 310',
        codigoLoja: '310',
        product: 'IOGURTE MORANGO',
        quantidade: 0, // QUANTIDADE ZERO
        estoque: 0,
        realizado: '2026-10-06',
        validade: '2026-11-06',
        diasRestantes: 31,
      },
    ]

    const result = runOperationalTrackingEngine({
      industryName: 'FRUTAP',
      validades,
      rupturas: [],
      researchConfig: { frequencia: 'semanal', dia_esperado: 'terca' },
      referenceDate: new Date(2026, 9, 6, 12, 0, 0),
    })

    expect(result.items.length).toBe(1)
    const item = result.items[0]
    expect(item.acompanhamentoStatus).toBe('atualizado')
    expect(item.situacaoAcompanhamento).toBe('atualizado_qtd_zero')
    expect(item.ultimoEstado.ultimaQuantidadeConhecida).toBe(0)
    expect(result.summary.atualizadosComQtdZero).toBe(1)
  })

  // 5. Produto ausente em 1 ciclo
  it('classifica produto ausente em 1 ciclo esperado como Atenção', () => {
    const validades: ValidadeItem[] = [
      {
        id: 'val-2',
        sku: 'SKU-2',
        lote: 'L-2',
        category: 'Laticínios',
        status: 'Normal',
        unidade: 'un',
        cliente: 'FRUTAP',
        loja: 'Fort Itajaí 310',
        codigoLoja: '310',
        product: 'LEITE FERMENTADO 850G',
        quantidade: 20,
        estoque: 20,
        realizado: '2026-09-29', // 1 ciclo anterior (29/09 vs atual 06/10)
        validade: '2026-11-20',
        diasRestantes: 45,
      },
    ]

    const result = runOperationalTrackingEngine({
      industryName: 'FRUTAP',
      validades,
      rupturas: [],
      researchConfig: { frequencia: 'semanal', dia_esperado: 'terca' },
      referenceDate: new Date(2026, 9, 6, 12, 0, 0),
    })

    const item = result.items[0]
    expect(item.acompanhamentoStatus).toBe('atencao')
    expect(item.situacaoAcompanhamento).toBe('um_ciclo_sem_atualizacao')
    expect(item.ultimoEstado.ciclosSemAtualizacao).toBe(1)
  })

  // 6. Produto ausente em 2 ciclos
  it('classifica produto ausente em 2 ciclos consecutivos como Crítico', () => {
    const validades: ValidadeItem[] = [
      {
        id: 'val-3',
        sku: 'SKU-3',
        lote: 'L-3',
        category: 'Laticínios',
        status: 'Crítico',
        unidade: 'un',
        cliente: 'FRUTAP',
        loja: 'Fort Itajaí 310',
        codigoLoja: '310',
        product: 'LEITE FERMENTADO 850G',
        quantidade: 42,
        estoque: 42,
        realizado: '2026-09-22', // 2 ciclos atrás (22/09 vs 06/10)
        validade: '2026-10-10',
        diasRestantes: 4, // validade crítica
      },
    ]

    const result = runOperationalTrackingEngine({
      industryName: 'FRUTAP',
      validades,
      rupturas: [],
      researchConfig: { frequencia: 'semanal', dia_esperado: 'terca' },
      referenceDate: new Date(2026, 9, 6, 12, 0, 0),
    })

    const item = result.items[0]
    expect(item.acompanhamentoStatus).toBe('critico')
    expect(item.ultimoEstado.ciclosSemAtualizacao).toBe(2)
    expect(item.validadeStatus).toBe('critico')
    expect(item.prioridadeNivel).toBe('maxima')
    expect(item.prioridadeExplicacao).toContain('PRIORIDADE MÁXIMA')
    expect(item.prioridadeExplicacao).toContain('Último estoque conhecido: 42 un.')
  })

  // 7. Validade Crítica + Acompanhamento Crítico (topo da prioridade)
  it('ordena Acompanhamento Crítico + Validade Crítica como prioridade máxima operacional', () => {
    const { prioridadeNivel, prioridadeScore } = computeOperationalPriority(
      'critico',
      'critico',
      2,
      50,
      false,
      {
        isInconsistent: false,
        isPesquisaNaoRealizada: false,
        volumeAtual: 10,
        volumeHistoricoEsperado: 10,
        detalhesAuditaveis: '',
      },
    )

    expect(prioridadeNivel).toBe('maxima')
    expect(prioridadeScore).toBe(100)
  })

  // 8. Produto fora do Mix Definido da Loja
  it('respeita o Mix Definido da Loja e não exige produtos que não pertencem ao mix daquela loja', () => {
    const storeDefinedMixes: IndustryStoreProductMix[] = [
      {
        id: 'sm-1',
        industry_id: 'ind-1',
        store_name: 'FORT 310',
        nome_produto: 'PRODUTO EXCLUSIVO DA LOJA',
        status: 'ativo',
      },
    ]

    // Validades de outros produtos na base histórica
    const validades: ValidadeItem[] = [
      {
        id: 'v-1',
        sku: 'SKU-V1',
        lote: 'L-V1',
        category: 'Laticínios',
        status: 'Normal',
        unidade: 'un',
        validade: '2026-11-06',
        diasRestantes: 31,
        cliente: 'FRUTAP',
        loja: 'FORT 310',
        product: 'OUTRO PRODUTO QUALQUER',
        quantidade: 10,
        estoque: 10,
        realizado: '2026-10-06',
      },
    ]

    const result = runOperationalTrackingEngine({
      industryName: 'FRUTAP',
      validades,
      rupturas: [],
      storeDefinedMixes,
      researchConfig: { frequencia: 'semanal', dia_esperado: 'terca' },
      referenceDate: new Date(2026, 9, 6, 12, 0, 0),
    })

    // Deve monitorar o produto do mix definido da loja
    const mixDefItem = result.items.find((i) => i.productName === 'PRODUTO EXCLUSIVO DA LOJA')
    expect(mixDefItem).toBeDefined()
    expect(mixDefItem?.origemMix).toBe('mix_definido_loja')
    expect(mixDefItem?.pertenceMixDefinido).toBe(true)

    // O produto fora do mix definido não é imposto como esperado se a loja possui mix definido
    const outroItem = result.items.find((i) => i.productName === 'OUTRO PRODUTO QUALQUER')
    expect(outroItem).toBeUndefined()
  })

  // 9. Loja sem Mix Definido utilizando histórico observado como referência provisória
  it('utiliza histórico operacional observado provisoriamente quando loja não possui Mix Definido', () => {
    const validades: ValidadeItem[] = [
      {
        id: 'v-2',
        sku: 'SKU-V2',
        lote: 'L-V2',
        category: 'Laticínios',
        status: 'Normal',
        unidade: 'un',
        validade: '2026-11-06',
        diasRestantes: 31,
        cliente: 'FRUTAP',
        loja: 'FORT JOINVILLE',
        product: 'PETIT SUISSE MORANGO',
        quantidade: 15,
        estoque: 15,
        realizado: '2026-10-06',
      },
    ]

    const result = runOperationalTrackingEngine({
      industryName: 'FRUTAP',
      validades,
      rupturas: [],
      storeDefinedMixes: [], // Sem mix definido para a loja
      researchConfig: { frequencia: 'semanal', dia_esperado: 'terca' },
      referenceDate: new Date(2026, 9, 6, 12, 0, 0),
    })

    expect(result.items.length).toBe(1)
    expect(result.items[0].productName).toBe('PETIT SUISSE MORANGO')
    expect(result.items[0].origemMix).toBe('historico_observado')
    expect(result.items[0].pertenceMixDefinido).toBe(false)
  })

  // 10. Ruptura explicando ausência
  it('identifica ruptura recente explicando ausência de produto no ciclo sem apagar histórico', () => {
    const validades: ValidadeItem[] = [
      {
        id: 'v-3',
        sku: 'SKU-V3',
        lote: 'L-V3',
        category: 'Laticínios',
        status: 'Normal',
        unidade: 'un',
        validade: '2026-11-06',
        diasRestantes: 31,
        cliente: 'FRUTAP',
        loja: 'FORT 310',
        product: 'BEBIDA SALADA DE FRUTAS',
        quantidade: 10,
        estoque: 10,
        realizado: '2026-09-29', // 1 ciclo atrás
      },
    ]

    const rupturas = [
      {
        id: 'rup-1',
        cliente: 'FRUTAP',
        nome_loja: 'FORT 310',
        produto: 'BEBIDA SALADA DE FRUTAS',
        motivo: 'Ruptura Total',
        situacao_atual: 'Ativo',
        data_visita: '2026-10-06', // Registrada no ciclo atual
      },
    ] as unknown as Ruptura[]

    const result = runOperationalTrackingEngine({
      industryName: 'FRUTAP',
      validades,
      rupturas,
      researchConfig: { frequencia: 'semanal', dia_esperado: 'terca' },
      referenceDate: new Date(2026, 9, 6, 12, 0, 0),
    })

    const item = result.items[0]
    expect(item.possuiRupturaRecente).toBe(true)
    expect(item.situacaoAcompanhamento).toBe('ausencia_explicada_ruptura')
    expect(item.situacaoDescricao).toContain('Ruptura Total')
    expect(result.summary.ausenciasExplicadasRuptura).toBe(1)
  })

  // 11. Herança de Política de Validade: Exceção do Produto -> Indústria -> Padrão
  it('aplica hierarquia de Política de Validade: Exceção de Produto sobrescreve Indústria e Sistema', () => {
    const policies: IndustryValidityPolicy[] = [
      {
        id: 'pol-sys',
        nivel_regra: 'sistema',
        dias_critico: 15,
        dias_atencao: 20,
        dias_moderado: 30,
        ativo: true,
      },
      {
        id: 'pol-ind',
        industry_id: 'ind-1',
        nivel_regra: 'industria',
        dias_critico: 12,
        dias_atencao: 18,
        dias_moderado: 25,
        ativo: true,
      },
      {
        id: 'pol-prod',
        industry_id: 'ind-1',
        nivel_regra: 'produto_excecao',
        produto_nome: 'REQUEIJAO CREMOSO',
        dias_critico: 5,
        dias_atencao: 10,
        dias_moderado: 15,
        ativo: true,
        justificativa: 'Produto de altíssimo giro e validade curta',
      },
    ]

    // 1. Para o produto com exceção cadastrada
    const resolvedProd = resolveValidityPolicy('REQUEIJAO CREMOSO', policies)
    expect(resolvedProd.origem).toBe('produto_excecao')
    expect(resolvedProd.diasCritico).toBe(5)
    expect(resolvedProd.diasAtencao).toBe(10)

    // 2. Para produto sem exceção, mas com regra de indústria
    const resolvedInd = resolveValidityPolicy('OUTRO PRODUTO', policies)
    expect(resolvedInd.origem).toBe('industria')
    expect(resolvedInd.diasCritico).toBe(12)
    expect(resolvedInd.diasAtencao).toBe(18)

    // 3. Se não houver regra de indústria, usa o padrão do sistema
    const resolvedSys = resolveValidityPolicy('QUALQUER', [policies[0]])
    expect(resolvedSys.origem).toBe('sistema')
    expect(resolvedSys.diasCritico).toBe(15)
  })

  // 12. Validação de Qualidade do Ciclo (Volume Anormalmente Baixo)
  it('detecta queda abrupta e anormal de volume e sinaliza suspeita de inconsistência na pesquisa', () => {
    const quality = evaluateStoreCycleQuality({
      storeName: 'FORT 310',
      industryName: 'FRUTAP',
      volumeCicloAtual: 1, // apenas 1 produto no ciclo atual
      volumeCiclosAnteriores: [35, 38, 36], // média ~36 produtos
    })

    expect(quality.isInconsistent).toBe(true)
    expect(quality.isPesquisaNaoRealizada).toBe(false)
    expect(quality.motivoInconsistencia).toContain('inconsistência na pesquisa')
    expect(quality.percentualQueda).toBeGreaterThanOrEqual(90)
  })

  // 13. Pesquisa inteira aparentemente não realizada
  it('distingue pesquisa inteira aparentemente não realizada vs ausência isolada de produtos', () => {
    const quality = evaluateStoreCycleQuality({
      storeName: 'FORT 310',
      industryName: 'FRUTAP',
      volumeCicloAtual: 0,
      volumeCiclosAnteriores: [30, 32, 28],
    })

    expect(quality.isInconsistent).toBe(true)
    expect(quality.isPesquisaNaoRealizada).toBe(true)
    expect(quality.motivoInconsistencia).toContain('aparentemente não realizada')
  })

  // 14. Regularização após ciclo sem atualização
  it('normaliza o status para Atualizado quando nova atualização for recebida no ciclo atual', () => {
    const cycles = generateExpectedCycles(
      { frequencia: 'semanal', dia_esperado: 'terca' },
      new Date(2026, 9, 6, 12, 0, 0),
      4,
    )

    // Antes: data antiga (ciclos sem atualização > 0)
    const antes = calculateCyclesMissed('2026-09-22', cycles)
    expect(antes.ciclosSemAtualizacao).toBe(2)

    // Depois: nova coleta realizada em 2026-10-06
    const depois = calculateCyclesMissed('2026-10-06', cycles)
    expect(depois.ciclosSemAtualizacao).toBe(0)
  })
})
