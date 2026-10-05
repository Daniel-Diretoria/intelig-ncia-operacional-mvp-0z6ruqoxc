import type {
  TrackingStatus,
  ValidityStatusHealth,
  SituacaoAcompanhamento,
  TrackingLastKnownState,
  OperationalTrackingItem,
  OperationalTrackingSummary,
  CycleQualityAssessment,
} from '@/types/operationalTracking'
import type {
  IndustryResearchConfig,
  IndustryStoreProductMix,
  IndustryStoreCoverage,
  IndustryValidityPolicy,
  ResolvedValidityPolicy,
} from '@/types/industryOperational'
import type { ValidadeItem, Ruptura } from '@/types'
import { resolveValidityPolicy } from '@/services/industryService'
import {
  generateExpectedCycles,
  calculateCyclesMissed,
  mapDateToCycle,
  parseIsoDateOnly,
  formatIsoDateOnly,
} from './cycleCalculator'
import { evaluateStoreCycleQuality } from './cycleQualityValidator'

export interface OperationalTrackingEngineInput {
  industryName: string
  industryId?: string
  validades: ValidadeItem[]
  rupturas: Ruptura[]
  researchConfig?: Partial<IndustryResearchConfig>
  storeCoverages?: IndustryStoreCoverage[]
  storeDefinedMixes?: IndustryStoreProductMix[]
  validityPolicies?: IndustryValidityPolicy[]
  referenceDate?: Date
}

/**
 * Classifica a Criticidade de Validade (Dimensão Indústria)
 * Utiliza a política de validade resolvida em cascata (Exceção Produto -> Indústria -> Padrão Sistema).
 */
export function classifyValidityHealth(
  diasRestantes: number | undefined | null,
  policy: ResolvedValidityPolicy,
): ValidityStatusHealth {
  if (diasRestantes === undefined || diasRestantes === null) {
    return 'normal'
  }
  if (diasRestantes <= policy.diasCritico) {
    return 'critico'
  }
  if (diasRestantes <= policy.diasAtencao) {
    return 'atencao'
  }
  if (diasRestantes <= policy.diasModerado) {
    return 'moderado'
  }
  return 'normal'
}

/**
 * Calcula a Prioridade Operacional de Ação.
 * Ordenação transparente e determinística, sem pontuações opacas:
 * 1. Acompanhamento Crítico + Validade Crítica (TOP MÁXIMO)
 * 2. Acompanhamento Crítico + Validade Atenção
 * 3. Acompanhamento Atenção + Validade Crítica
 * 4. Acompanhamento Crítico + Validade Normal
 * 5. Acompanhamento Atenção + Validade Atenção
 * 6. Acompanhamento Atenção + Validade Normal
 * 7. Atualizado com Validade Crítica / Atenção
 */
export function computeOperationalPriority(
  acompanhamento: TrackingStatus,
  validade: ValidityStatusHealth,
  ciclosSemAtualizacao: number,
  ultimaQuantidade: number | undefined,
  possuiRuptura: boolean,
  qualidadeCiclo: CycleQualityAssessment,
): {
  prioridadeNivel: 'maxima' | 'alta' | 'media' | 'normal'
  prioridadeScore: number
  prioridadeExplicacao: string
} {
  // Se houver dúvida grave na qualidade do ciclo (inconsistência na pesquisa)
  if (qualidadeCiclo.isInconsistent) {
    return {
      prioridadeNivel: 'alta',
      prioridadeScore: 50,
      prioridadeExplicacao:
        'Ciclo com suspeita de inconsistência de pesquisa. Validar integridade da pesquisa da loja antes de acionar produtos.',
    }
  }

  // 1. COMBINAÇÃO MAIS GRAVE: Acompanhamento Crítico (2+ ciclos) + Validade Crítica
  if (acompanhamento === 'critico' && validade === 'critico') {
    const qtdTexto =
      ultimaQuantidade !== undefined ? ` Último estoque conhecido: ${ultimaQuantidade} un.` : ''
    return {
      prioridadeNivel: 'maxima',
      prioridadeScore: 100,
      prioridadeExplicacao: `PRIORIDADE MÁXIMA: Produto está há ${ciclosSemAtualizacao} ciclos sem atualização e sua última validade conhecida encontra-se na faixa crítica.${qtdTexto}`,
    }
  }

  // 2. Acompanhamento Crítico + Validade Atenção
  if (acompanhamento === 'critico' && validade === 'atencao') {
    return {
      prioridadeNivel: 'alta',
      prioridadeScore: 85,
      prioridadeExplicacao: `ALTA PRIORIDADE: Produto há ${ciclosSemAtualizacao} ciclos sem atualização e sua última validade conhecida está em atenção.`,
    }
  }

  // 3. Acompanhamento Atenção (1 ciclo) + Validade Crítica
  if (acompanhamento === 'atencao' && validade === 'critico') {
    return {
      prioridadeNivel: 'alta',
      prioridadeScore: 80,
      prioridadeExplicacao:
        'ALTA PRIORIDADE: Produto não recebeu atualização no último ciclo esperado e a validade conhecida está na faixa crítica.',
    }
  }

  // 4. Acompanhamento Crítico + Validade Moderado/Normal
  if (acompanhamento === 'critico') {
    const explicacaoRuptura = possuiRuptura
      ? ' (Ruptura recente registrada na loja pode justificar a ausência).'
      : '.'
    return {
      prioridadeNivel: 'media',
      prioridadeScore: 65,
      prioridadeExplicacao: `Produto há ${ciclosSemAtualizacao} ciclos consecutivos sem atualização. Validade conhecida normal${explicacaoRuptura}`,
    }
  }

  // 5. Acompanhamento Atenção + Validade Atenção
  if (acompanhamento === 'atencao' && validade === 'atencao') {
    return {
      prioridadeNivel: 'media',
      prioridadeScore: 55,
      prioridadeExplicacao:
        'Produto sem atualização no último ciclo esperado com validade conhecida em atenção.',
    }
  }

  // 6. Acompanhamento Atenção + Validade Normal
  if (acompanhamento === 'atencao') {
    const explicacaoRuptura = possuiRuptura
      ? ' Ausência recente explicada por ruptura registrada.'
      : ' A validade conhecida permanece normal.'
    return {
      prioridadeNivel: 'media',
      prioridadeScore: 40,
      prioridadeExplicacao: `ATENÇÃO: Produto não recebeu atualização no último ciclo esperado.${explicacaoRuptura}`,
    }
  }

  // 7. Atualizado
  return {
    prioridadeNivel: 'normal',
    prioridadeScore: 10,
    prioridadeExplicacao:
      'Produto com atualização em dia no ciclo esperado. Monitoramento regular.',
  }
}

/**
 * MOTOR DE ACOMPANHAMENTO OPERACIONAL DO SKIP
 *
 * NOTA DE ARQUITETURA E REGRA OPERACIONAL (TAREFA 2):
 * - O acompanhamento automático atual usa a configuração de pesquisa de VALIDADES como fonte principal dos ciclos.
 * - Rupturas entram exclusivamente como evidência de cruzamento e explicação operacional de ausência.
 * - Esta lógica NÃO vale ainda para pesquisas obrigatórias de Ruptura (módulo a ser desenvolvido em etapa posterior).
 * - O volume por ciclo avaliado para qualidade da pesquisa/loja considera estritamente a contagem de PRODUTOS DISTINTOS
 *   atualizados naquele ciclo na pesquisa de Validades, eliminando duplicidades causadas por múltiplos lotes do mesmo produto.
 */
export function runOperationalTrackingEngine(input: OperationalTrackingEngineInput): {
  items: OperationalTrackingItem[]
  summary: OperationalTrackingSummary
  cycles: ReturnType<typeof generateExpectedCycles>
} {
  const {
    industryName,
    industryId,
    validades = [],
    rupturas = [],
    researchConfig = {},
    storeCoverages = [],
    storeDefinedMixes = [],
    validityPolicies = [],
    referenceDate = new Date(),
  } = input

  // 1. Filtrar registros pertencentes a esta indústria (ou todos se não especificado)
  const normIndName = (industryName || '').trim().toUpperCase()

  const industryValidades = validades.filter((v) => {
    if (!normIndName) return true
    const cl = (v.cliente || '').trim().toUpperCase()
    const ind = (v.industria || '').trim().toUpperCase()
    return (
      cl === normIndName ||
      ind === normIndName ||
      cl.includes(normIndName) ||
      ind.includes(normIndName)
    )
  })

  const industryRupturas = rupturas.filter((r) => {
    if (!normIndName) return true
    const cl = (r.cliente || '').trim().toUpperCase()
    return cl === normIndName || cl.includes(normIndName)
  })

  // 2. Determinar ciclos esperados da pesquisa
  // =========================================================================================
  // DOCUMENTAÇÃO EXPLÍCITA DA FONTE DOS CICLOS:
  // O acompanhamento automático atual utiliza a configuração da pesquisa de VALIDADES como fonte
  // principal dos ciclos operacionais (frequência, dia da semana esperado, tolerância).
  // As RUPTURAS entram exclusivamente como evidência de cruzamento operacional e explicação
  // de possíveis ausências nos ciclos (ex: ausência explicada por ruptura ativa).
  // NÃO GENERALIZAR silenciosamente essa mesma lógica para pesquisas obrigatórias de Rupturas ainda.
  // O comportamento e ciclos específicos das pesquisas obrigatórias de Ruptura serão desenvolvidos
  // e validados posteriormente.
  // =========================================================================================
  const configValidades: Partial<IndustryResearchConfig> = {
    tipo_pesquisa: 'validades',
    frequencia: researchConfig.frequencia || 'semanal',
    dia_esperado: researchConfig.dia_esperado || 'terca',
    tolerancia_dias: researchConfig.tolerancia_dias ?? 1,
  }

  // Se houver registros na base, a data de referência mais recente pode ser considerada para não quebrar
  // datasets históricos congelados
  let effectiveRefDate = referenceDate
  if (industryValidades.length > 0) {
    const validDates = industryValidades
      .map((v) => v.realizado || v.dataEntrada || v.ultimaAtualizacao)
      .filter(Boolean) as string[]
    if (validDates.length > 0) {
      validDates.sort().reverse()
      const maxDate = parseIsoDateOnly(validDates[0])
      // Se a data de referência padrão (hoje) for superior à data do dataset (ex: > 30 dias),
      // usa a data mais recente dos dados para que o ciclo mais recente alinhe com a base histórica
      if (Math.abs(referenceDate.getTime() - maxDate.getTime()) > 30 * 24 * 60 * 60 * 1000) {
        effectiveRefDate = maxDate
      }
    }
  }

  const cycles = generateExpectedCycles(configValidades, effectiveRefDate, 6)
  const currentCycle = cycles[0] // Ciclo esperado mais recente

  // 3. Mapear Lojas Elegíveis (Cobertura Operacional da Indústria)
  // Regra do usuário: "Considerar somente lojas dentro da Cobertura Operacional da indústria."
  const activeCoverageStores = new Set<string>()
  const coverageStoreMap = new Map<string, IndustryStoreCoverage>()

  for (const cov of storeCoverages) {
    if (cov.status_relacao !== 'inativa') {
      const code = (cov.store_code || '').trim().toUpperCase()
      const name = (cov.store_name || '').trim().toUpperCase()
      if (code) activeCoverageStores.add(code)
      if (name) activeCoverageStores.add(name)
      coverageStoreMap.set(code || name, cov)
    }
  }

  // 4. Agrupar dados por Loja + Produto para encontrar o histórico operacional observado
  interface RecordHistoryItem {
    lojaCodigo: string
    lojaNome: string
    cidade: string
    uf: string
    rede: string
    produtoNome: string
    produtoCodigo: string
    categoria: string
    registros: Array<{
      data: string
      quantidade: number
      validade: string
      diasRestantes: number
    }>
  }

  const storeProductHistories = new Map<string, RecordHistoryItem>()

  for (const v of industryValidades) {
    const storeCode = (v.codigoLoja || '').trim().toUpperCase()
    const storeName = (v.loja || '').trim().toUpperCase()
    const prodName = (v.product || '').trim().toUpperCase()
    if (!prodName) continue

    const key = `${storeCode || 'SEM_COD'}|${storeName}|${prodName}`
    let hist = storeProductHistories.get(key)
    if (!hist) {
      hist = {
        lojaCodigo: v.codigoLoja || '',
        lojaNome: v.loja || '',
        cidade: v.cidade || '',
        uf: v.uf || '',
        rede: v.rede || '',
        produtoNome: v.product || '',
        produtoCodigo: v.sku || '',
        categoria: v.category || 'Geral',
        registros: [],
      }
      storeProductHistories.set(key, hist)
    }

    const recDate =
      v.realizado || v.dataEntrada || v.ultimaAtualizacao || formatIsoDateOnly(new Date())
    hist.registros.push({
      data: recDate,
      quantidade: Number(v.quantidade ?? v.estoque ?? 0),
      validade: v.validade || '',
      diasRestantes: v.diasRestantes ?? 999,
    })
  }

  // 5. Mapear Mix Definido por Loja (industry_store_product_mix)
  // Regra do usuário:
  // "1. Mix Definido da Loja, quando existir — produto no Mix Definido faz parte do universo esperado.
  //  2. Quando a loja ainda não possuir Mix Definido, usar o histórico operacional observado como referência provisória.
  //  NÃO usar automaticamente todo o Mix Oficial da Indústria como obrigação para todas as lojas."
  const storeMixMap = new Map<string, IndustryStoreProductMix[]>()
  for (const sm of storeDefinedMixes) {
    if (sm.status === 'ativo') {
      const storeKey = sm.store_name.trim().toUpperCase()
      const list = storeMixMap.get(storeKey) || []
      list.push(sm)
      storeMixMap.set(storeKey, list)
    }
  }

  // 6. Mapear Rupturas ativas/recentes por Loja + Produto
  const storeProductRuptures = new Map<string, Ruptura>()
  for (const r of industryRupturas) {
    const storeCode = (r.codigo_loja || '').trim().toUpperCase()
    const storeName = (r.nome_loja || '').trim().toUpperCase()
    const prodName = (r.produto || '').trim().toUpperCase()
    if (!prodName) continue

    const rKey = `${storeCode || 'SEM_COD'}|${storeName}|${prodName}`
    // Guarda a mais recente
    const existing = storeProductRuptures.get(rKey)
    if (
      !existing ||
      (r.data_visita && (!existing.data_visita || r.data_visita > existing.data_visita))
    ) {
      storeProductRuptures.set(rKey, r)
    }
  }

  // 7. Agrupar volumes por Loja para avaliar a QUALIDADE DO CICLO
  // ATENÇÃO / REGRA DO NEGÓCIO (TAREFA 1 & TAREFA 2):
  // - O acompanhamento automático atual usa a configuração de pesquisa de VALIDADES como fonte principal dos ciclos;
  //   Rupturas entram apenas como evidência de cruzamento e explicação operacional.
  //   A lógica NÃO vale ainda para pesquisas obrigatórias de Ruptura (a serem desenvolvidas depois).
  // - Volume do ciclo = número de PRODUTOS DISTINTOS atualizados naquele ciclo para a combinação:
  //   Indústria + Loja + Pesquisa de Validades.
  //   Se o mesmo produto tem múltiplos registros/lotes no mesmo ciclo (ex: 3 lotes com validades distintas), CONTA 1.
  //   Exemplo do usuário (Fort Aventureiro 165 / Frutap / Pesquisa de Validades):
  //   ciclos 08/09→36, 15/09→34, 22/09→38, 29/09→1; histórico=[36,34,38], atual=1.
  // - Comportamento conservador: forte suspeita de pesquisa incompleta/inconsistente -> gerar pendência de
  //   qualidade da pesquisa/loja e NÃO transformar todas as ausências do ciclo em dezenas de alertas individuais.
  //
  // Estrutura:
  // storeCycleDistinctProducts: Map<storeKey, Map<cycleId, Set<productName>>>
  const storeCycleDistinctProducts = new Map<string, Map<string, Set<string>>>()

  for (const v of industryValidades) {
    const storeCode = (v.codigoLoja || '').trim().toUpperCase()
    const storeName = (v.loja || '').trim().toUpperCase()
    const prodName = (v.product || '').trim().toUpperCase()
    if (!prodName) continue

    const storeKey = `${storeCode || 'SEM_COD'}|${storeName}`.toUpperCase()
    const recDate =
      v.realizado || v.dataEntrada || v.ultimaAtualizacao || formatIsoDateOnly(new Date())

    const matchedCycle = mapDateToCycle(recDate, cycles)
    if (!matchedCycle) continue

    let cycleMap = storeCycleDistinctProducts.get(storeKey)
    if (!cycleMap) {
      cycleMap = new Map<string, Set<string>>()
      storeCycleDistinctProducts.set(storeKey, cycleMap)
    }

    let productSet = cycleMap.get(matchedCycle.cicloId)
    if (!productSet) {
      productSet = new Set<string>()
      cycleMap.set(matchedCycle.cicloId, productSet)
    }

    // Garante contagem distinta por produto naquele ciclo
    productSet.add(prodName)
  }

  // A partir do mapa de ciclos e produtos distintos por loja, extraímos:
  // - volumeCicloAtual: contagem de PRODUTOS DISTINTOS no ciclo mais recente (cycles[0])
  // - volumeCiclosAnteriores: array com o número de PRODUTOS DISTINTOS em cada ciclo anterior (cycles[1], cycles[2], ...)
  const storeVolumesCicloAtual = new Map<string, number>()
  const storeVolumesHistoricos = new Map<string, number[]>()

  const currentCycleId = cycles[0]?.cicloId

  for (const [storeKey, cycleMap] of storeCycleDistinctProducts.entries()) {
    const volAtual = currentCycleId ? cycleMap.get(currentCycleId)?.size || 0 : 0
    storeVolumesCicloAtual.set(storeKey, volAtual)

    // Ciclos anteriores ordenados do mais recente (ciclo 1) para o mais antigo (ciclo 2, 3...)
    const histList: number[] = []
    for (let c = 1; c < cycles.length; c++) {
      const cId = cycles[c].cicloId
      const pSet = cycleMap.get(cId)
      // Se a loja teve registros nesse ciclo anterior, adicionamos o volume de produtos distintos
      if (pSet && pSet.size > 0) {
        histList.push(pSet.size)
      }
    }

    storeVolumesHistoricos.set(storeKey, histList)
  }

  // 8. Construir itens de acompanhamento para todas as combinações loja+produto esperadas
  const items: OperationalTrackingItem[] = []

  // Coleta todas as lojas conhecidas (tanto do histórico quanto do mix definido e cobertura)
  const allKnownStores = new Set<string>()
  for (const hist of storeProductHistories.values()) {
    allKnownStores.add(hist.lojaNome.trim().toUpperCase())
  }
  for (const storeName of storeMixMap.keys()) {
    allKnownStores.add(storeName)
  }
  for (const cov of storeCoverages) {
    if (cov.status_relacao !== 'inativa') {
      allKnownStores.add(cov.store_name.trim().toUpperCase())
    }
  }

  // Itera por cada loja
  for (const storeName of allKnownStores) {
    // Se a indústria tiver Cobertura Operacional cadastrada com lojas,
    // verifica se a loja está dentro da cobertura da indústria
    if (activeCoverageStores.size > 0) {
      const isInCoverage =
        activeCoverageStores.has(storeName) ||
        Array.from(activeCoverageStores).some((c) => storeName.includes(c) || c.includes(storeName))
      if (!isInCoverage) {
        continue // Desconsidera loja fora da cobertura da indústria
      }
    }

    const definedMixList = storeMixMap.get(storeName) || []
    const hasDefinedMix = definedMixList.length > 0

    // Avaliação da qualidade do ciclo para esta loja
    // Localiza a chave da loja correspondente no storeVolumesCicloAtual / storeVolumesHistoricos
    const storeKeyMatch =
      Array.from(storeCycleDistinctProducts.keys()).find((k) => {
        const parts = k.split('|')
        const code = parts[0]
        const name = parts[1] || ''
        return (
          k === storeName ||
          name === storeName ||
          k.includes(storeName) ||
          (code && code !== 'SEM_COD' && storeName.includes(code))
        )
      }) ||
      Array.from(storeVolumesHistoricos.keys()).find((k) => {
        const parts = k.split('|')
        const code = parts[0]
        const name = parts[1] || ''
        return (
          k === storeName ||
          name === storeName ||
          k.includes(storeName) ||
          (code && code !== 'SEM_COD' && storeName.includes(code))
        )
      })
    const volAtual = storeKeyMatch ? storeVolumesCicloAtual.get(storeKeyMatch) || 0 : 0
    const histVolumes = storeKeyMatch ? storeVolumesHistoricos.get(storeKeyMatch) || [] : []

    const qualidadeCiclo = evaluateStoreCycleQuality({
      storeName,
      industryName,
      volumeCicloAtual: volAtual,
      volumeCiclosAnteriores: histVolumes,
      totalEsperadoMixDefinido: hasDefinedMix ? definedMixList.length : undefined,
    })

    // Universo de produtos que DEVERIAM ser acompanhados nesta loja:
    // 1. Se tem Mix Definido da Loja -> utiliza os produtos desse Mix
    // 2. Se NÃO tem Mix Definido -> utiliza o histórico operacional observado nessa loja
    const expectedProducts: Array<{
      produtoNome: string
      produtoCodigo?: string
      categoria?: string
      origemMix: 'mix_definido_loja' | 'historico_observado'
      pertenceMixDefinido: boolean
      storeMixStatus?: IndustryStoreProductMix['status']
    }> = []

    if (hasDefinedMix) {
      for (const dm of definedMixList) {
        expectedProducts.push({
          produtoNome: dm.nome_produto,
          produtoCodigo: dm.codigo_produto || dm.cod_barras,
          categoria: 'Mix Loja',
          origemMix: 'mix_definido_loja',
          pertenceMixDefinido: true,
          storeMixStatus: dm.status,
        })
      }
    } else {
      // Coleta do histórico observado desta loja específica
      for (const hist of storeProductHistories.values()) {
        if (hist.lojaNome.trim().toUpperCase() === storeName) {
          expectedProducts.push({
            produtoNome: hist.produtoNome,
            produtoCodigo: hist.produtoCodigo,
            categoria: hist.categoria,
            origemMix: 'historico_observado',
            pertenceMixDefinido: false,
          })
        }
      }
    }

    // Processa cada produto esperado na loja
    for (const exp of expectedProducts) {
      const prodNameUpper = exp.produtoNome.trim().toUpperCase()
      // Procura histórico observado desse produto nesta loja
      const histKey = Array.from(storeProductHistories.keys()).find(
        (k) => k.includes(storeName) && k.includes(prodNameUpper),
      )
      const hist = histKey ? storeProductHistories.get(histKey) : null

      // Procura Ruptura recente associada
      const rupKey = Array.from(storeProductRuptures.keys()).find(
        (k) => k.includes(storeName) && k.includes(prodNameUpper),
      )
      const ruptura = rupKey ? storeProductRuptures.get(rupKey) : null

      // Política de validade do produto resolvida
      const resolvedPolicy = resolveValidityPolicy(exp.produtoNome, validityPolicies)

      // Registros ordenados por data decrescente
      const registros = hist?.registros
        ? [...hist.registros].sort((a, b) => b.data.localeCompare(a.data))
        : []
      const newestRecord = registros[0]

      // Cálculo de ciclos sem atualização
      const { ciclosSemAtualizacao, ultimoCicloAcompanhado } = calculateCyclesMissed(
        newestRecord?.data,
        cycles,
      )

      // Último Estado Conhecido
      const lastKnownState: TrackingLastKnownState = {
        ultimaDataAtualizacao: newestRecord?.data,
        ultimaQuantidadeConhecida: newestRecord?.quantidade,
        ultimaValidadeConhecida: newestRecord?.validade,
        ultimaRupturaConhecida: ruptura
          ? {
              motivo: ruptura.motivo,
              data: ruptura.data_visita || ruptura.data_entrada || '',
              situacao: ruptura.situacao_atual,
            }
          : undefined,
        ultimoCicloAcompanhado,
        ciclosSemAtualizacao,
      }

      // Dimensão 1: ACOMPANHAMENTO (Inteligência Operacional)
      // Regra do usuário:
      // - Atualizado: recebeu atualização no ciclo esperado
      // - Atenção: deixou de receber atualização em 1 ciclo esperado
      // - Crítico: 2 ou mais ciclos esperados consecutivos sem atualização
      // - QUANTIDADE ZERO É UMA ATUALIZAÇÃO VÁLIDA (não é sem atualização)
      let acompanhamentoStatus: TrackingStatus = 'atualizado'
      let situacao: SituacaoAcompanhamento = 'atualizado_normal'
      let situacaoDescricao = 'Atualizado normalmente no ciclo esperado'

      const isQtdZero = newestRecord !== undefined && Number(newestRecord.quantidade) === 0
      const hasRecentRupture = Boolean(ruptura && ruptura.situacao_atual === 'Ativo')

      if (ciclosSemAtualizacao === 0) {
        if (isQtdZero) {
          acompanhamentoStatus = 'atualizado'
          situacao = 'atualizado_qtd_zero'
          situacaoDescricao = 'Atualizado com quantidade zero (estoque informado como zerado)'
        } else {
          acompanhamentoStatus = 'atualizado'
          situacao = 'atualizado_normal'
          situacaoDescricao = 'Atualizado normalmente no ciclo atual'
        }
      } else if (ciclosSemAtualizacao === 1) {
        if (hasRecentRupture) {
          acompanhamentoStatus = 'atencao'
          situacao = 'ausencia_explicada_ruptura'
          situacaoDescricao = `Ausência no ciclo explicada por ruptura recente (${ruptura?.motivo})`
        } else {
          acompanhamentoStatus = 'atencao'
          situacao = 'um_ciclo_sem_atualizacao'
          situacaoDescricao = '1 ciclo esperado sem atualização'
        }
      } else {
        // 2 ou mais ciclos
        if (qualidadeCiclo.isInconsistent) {
          acompanhamentoStatus = 'atencao'
          situacao = 'possivel_inconsistencia_dados'
          situacaoDescricao = 'Possível inconsistência na pesquisa da loja'
        } else if (hasRecentRupture) {
          acompanhamentoStatus = 'critico'
          situacao = 'ausencia_explicada_ruptura'
          situacaoDescricao = `${ciclosSemAtualizacao} ciclos sem atualização (com ruptura ativa: ${ruptura?.motivo})`
        } else {
          acompanhamentoStatus = 'critico'
          situacao = 'dois_mais_ciclos_sem_atualizacao'
          situacaoDescricao = `${ciclosSemAtualizacao} ciclos esperados consecutivos sem atualização`
        }
      }

      // Dimensão 2: VALIDADE (Indústria)
      // Baseada na política configurada (dias_critico / dias_atencao)
      const validadeStatus = classifyValidityHealth(newestRecord?.diasRestantes, resolvedPolicy)

      // Prioridade Operacional Explicável
      const { prioridadeNivel, prioridadeScore, prioridadeExplicacao } = computeOperationalPriority(
        acompanhamentoStatus,
        validadeStatus,
        ciclosSemAtualizacao,
        newestRecord?.quantidade,
        hasRecentRupture,
        qualidadeCiclo,
      )

      // Dados de localização e rede da loja
      const covData = coverageStoreMap.get(storeName)
      const storeCode = hist?.lojaCodigo || covData?.store_code || ''
      const city = hist?.cidade || covData?.city || ''
      const state = hist?.uf || covData?.state || ''
      const network = hist?.rede || covData?.network_name || ''

      items.push({
        id: `${storeName}|${exp.produtoNome}`.replace(/\s+/g, '_').toLowerCase(),
        industryId,
        industryName,
        storeCode,
        storeName,
        city,
        state,
        network,
        productName: exp.produtoNome,
        productCode: exp.produtoCodigo,
        category: exp.categoria,
        acompanhamentoStatus,
        validadeStatus,
        situacaoAcompanhamento: situacao,
        situacaoDescricao,
        prioridadeNivel,
        prioridadeScore,
        prioridadeExplicacao,
        origemMix: exp.origemMix,
        pertenceMixDefinido: exp.pertenceMixDefinido,
        storeMixStatus: exp.storeMixStatus,
        ultimoEstado: lastKnownState,
        possuiRupturaRecente: hasRecentRupture,
        rupturaDetalhes: ruptura
          ? {
              motivo: ruptura.motivo,
              dataVisita: ruptura.data_visita || ruptura.data_entrada || '',
              situacao: ruptura.situacao_atual,
            }
          : undefined,
        politicaValidade: resolvedPolicy,
        qualidadeCiclo,
        aguardandoRetornoTratativa: false,
      })
    }
  }

  // Ordenar itens por prioridade operacional decrescente (mais graves primeiro)
  items.sort((a, b) => b.prioridadeScore - a.prioridadeScore)

  // Resumo
  const totalMonitorados = items.length
  const totalAtualizados = items.filter((i) => i.acompanhamentoStatus === 'atualizado').length
  const totalAtencao = items.filter((i) => i.acompanhamentoStatus === 'atencao').length
  const totalCriticos = items.filter((i) => i.acompanhamentoStatus === 'critico').length
  const atualizadosComQtdZero = items.filter(
    (i) => i.situacaoAcompanhamento === 'atualizado_qtd_zero',
  ).length
  const ausenciasExplicadasRuptura = items.filter(
    (i) => i.situacaoAcompanhamento === 'ausencia_explicada_ruptura',
  ).length
  const ciclosComInconsistencia = items.filter((i) => i.qualidadeCiclo.isInconsistent).length
  const pesquisasNaoRealizadasLojas = items.filter(
    (i) => i.qualidadeCiclo.isPesquisaNaoRealizada,
  ).length
  const prioridadeMaximaCount = items.filter((i) => i.prioridadeNivel === 'maxima').length

  const summary: OperationalTrackingSummary = {
    totalMonitorados,
    totalAtualizados,
    totalAtencao,
    totalCriticos,
    atualizadosComQtdZero,
    ausenciasExplicadasRuptura,
    ciclosComInconsistencia,
    pesquisasNaoRealizadasLojas,
    prioridadeMaximaCount,
  }

  return {
    items,
    summary,
    cycles,
  }
}
