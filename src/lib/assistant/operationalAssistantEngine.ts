import type { BaseAtualSnapshot } from '@/lib/selectors/baseAtualSelectors'
import {
  computeStoreRiskScore,
  computeProductRiskScore,
  computeBrandRiskScore,
  expandBrandTotalRuptures,
  generateRecommendedActions,
  normalizeBrandKey,
  type StoreRiskResult,
  type ProductRiskResult,
  type BrandRiskResult,
} from '@/lib/engine/strategicRankings'
import {
  formatStoreIdentity,
  extractStoreRealCode,
  extractStoreCleanName,
} from '@/lib/format/storeIdentity'
import { formatDisplayDate } from '@/lib/format/dateParser'
import type { CrossEvidence } from '@/types'

export type IntentId =
  | 'OVERVIEW'
  | 'TOP_STORES'
  | 'TOP_PRODUCTS'
  | 'TOP_BRANDS'
  | 'EXPIRING_SOON'
  | 'OLDEST_RUPTURES'
  | 'STORE_DETAIL'
  | 'BRAND_DETAIL'
  | 'RECOMMENDED_ACTIONS'
  | 'CONFRONT_EVIDENCE'
  | 'SCORE_EXPLANATION'
  | 'AVAILABLE_DATA'
  | 'BRAND_TOTAL_RUPTURES'
  | 'BLOCKED_FINANCIAL'
  | 'BLOCKED_OUT_OF_SCOPE'

export interface IntentPattern {
  id: IntentId
  patterns: RegExp[]
  description: string
  weight?: number
}

export interface ParsedIntentResult {
  intent: IntentId
  confidence: number
  params: Record<string, string>
}

export interface MetricItem {
  label: string
  value: string | number
  detail?: string
  status?: 'critical' | 'warning' | 'normal' | 'neutral'
}

export interface EvidenceItem {
  iconType?: 'store' | 'product' | 'calendar' | 'alert' | 'link' | 'info'
  title: string
  subtitle?: string
  badge?: string
  badgeVariant?: 'critical' | 'warning' | 'info' | 'neutral' | 'success'
  details?: Array<{ label: string; value: string | number }>
  navigationPath?: string
  navigationLabel?: string
}

export interface FilterInfo {
  type: string
  value: string
}

export interface AssistantResponse {
  intent: string
  title: string
  summary: string
  metrics: MetricItem[]
  evidence: EvidenceItem[]
  sources: string[]
  filtersApplied: FilterInfo[]
  limitations: string[]
  generatedAt: string
  confidence?: number
  isBlocked?: boolean
  isAmbiguous?: boolean
}

/**
 * Normaliza o texto de entrada para detecção determinística de intenções.
 * - Converte para minúsculas
 * - Remove espaços no início e final
 * - NFD para decomposição e remoção de acentuações e diacríticos
 * - Compacta múltiplos espaços em branco em um único espaço
 */
export function normalizeForIntent(text: string): string {
  if (!text) return ''
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s/–-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Sanitiza a entrada e garante limite máximo de 500 caracteres.
 */
export function sanitizeInput(input: string): string {
  if (!input) return ''
  return input.slice(0, 500).trim()
}

// ============================================================================
// CATÁLOGO EXPLÍCITO DE INTENÇÕES
// ============================================================================

export const INTENT_CATALOG: IntentPattern[] = [
  // 1. Bloqueios Financeiros e Projeções
  {
    id: 'BLOCKED_FINANCIAL',
    description: 'Bloqueio para faturamento, margem, sell-out, giro real e perdas financeiras',
    patterns: [
      /\b(faturamento|faturar|faturou|receita|margem|lucro|prejuizo)\b/i,
      /\b(sell\s*out|sellout|giro\s*real|giro|venda|vendas|vendeu|vende)\b/i,
      /\b(custo|custos|financeiro|financeira|perda\s*financeira|estoque\s*financeiro)\b/i,
      /\b(previsao|previsoes|tendencia|tendencias|projetar|projecao|prever)\b/i,
    ],
  },

  // 2. Bloqueios Fora de Escopo
  {
    id: 'BLOCKED_OUT_OF_SCOPE',
    description: 'Bloqueio para perguntas fora do escopo operacional da plataforma',
    patterns: [
      /\b(presidente|politica|governo|eleicao|eleicoes|dolar|euro|bitcoin|clima|tempo\s*hoje|futebol|jogo)\b/i,
      /\b(quem\s*(e|foi)\s*o|qual\s*a\s*cotacao|cotacao\s*do|receita\s*de\s*bolo|conte\s*uma\s*piada)\b/i,
    ],
  },

  // 3. STORE_DETAIL (alta especificidade se tiver número de loja ou palavra "loja")
  {
    id: 'STORE_DETAIL',
    description: 'Consulta da situação operacional de uma loja específica',
    patterns: [
      /\b(loja|lojas|codigo|cod)\s*(\d{1,6})\b/i,
      /\bcomo\s*esta\s*a\s*loja\b/i,
      /\bsituacao\s*(da|de)?\s*loja\b/i,
      /\bdetalhes?\s*(da|de)?\s*loja\b/i,
      /\b(fort\s*atacadista|brasil\s*atacadista|atacadao|giassi|comper|bistek|angeloni|koch|condor|muffato|passarela)\b/i,
      /\bver\s*loja\b/i,
    ],
  },

  // 4. BRAND_DETAIL (alta especificidade se tiver palavra "marca" ou "cliente" ou "industria")
  {
    id: 'BRAND_DETAIL',
    description: 'Situação de uma marca, indústria ou cliente parceiro',
    patterns: [
      /\b(marca|cliente|industria|fornecedor)\s+([a-z0-9\s]+)/i,
      /\bcomo\s*esta\s*a\s*marca\b/i,
      /\bsituacao\s*(da|do)?\s*(marca|cliente|industria|fornecedor)\b/i,
      /\b(frutap|kunzler|casa\s*kunzler|lilibel|parmissimo|diretoria|italac|cocoleve|marigold|massas)\b/i,
      /\bdetalhes?\s*(da|do)?\s*(marca|cliente|industria)\b/i,
    ],
  },

  // 5. EXPIRING_SOON
  {
    id: 'EXPIRING_SOON',
    description: 'Produtos com validades próximas por faixa de dias',
    patterns: [
      /\b(vencem|vencendo|vencer|vencimento|validade|validades)\s*(nos|nas|em|proximos?|proximas?)?\s*(\d{1,2})\s*dias?\b/i,
      /\bvalidades?\s*proximas?\b/i,
      /\bproximos?\s*(\d{1,2})\s*dias?\b/i,
      /\bprodutos?\s*(a\s*vencer|vencendo|perto\s*de\s*vencer)\b/i,
      /\bfaixa\s*de\s*validade\b/i,
      /\bquais\s*produtos\s*vencem\b/i,
    ],
  },

  // 6. OLDEST_RUPTURES
  {
    id: 'OLDEST_RUPTURES',
    description: 'Rupturas mais antigas ou ativas há mais tempo',
    patterns: [
      /\b(rupturas?|faltas?)\s*(mais\s*antigas?|criticas?|antigas?|ativas?|antiguidade)\b/i,
      /\bha\s*mais\s*tempo\s*em\s*ruptura\b/i,
      /\bdias\s*em\s*ruptura\b/i,
      /\bquais\s*(sao\s*as\s*)?rupturas\s*mais\s*antigas\b/i,
      /\bmaior\s*tempo\s*de\s*ruptura\b/i,
    ],
  },

  // 7. BRAND_TOTAL_RUPTURES
  {
    id: 'BRAND_TOTAL_RUPTURES',
    description: 'Rupturas totais de marca e expansão contra o catálogo',
    patterns: [
      /\b(ruptura|rupturas)\s*(total|totais|de\s*marca|marca\s*total|expandidas?|sem\s*catalogo)\b/i,
      /\bquantas\s*rupturas\s*(totais|de\s*marca)\b/i,
      /\bexpansao\s*de\s*rupturas?\b/i,
      /\bbrand\s*total\b/i,
      /\bportf(o|o)lio\s*total\b/i,
    ],
  },

  // 8. CONFRONT_EVIDENCE
  {
    id: 'CONFRONT_EVIDENCE',
    description: 'Confronto entre rupturas e validades posteriores (Cross-Evidence)',
    patterns: [
      /\b(confronto|confrontos|cruzamento|cross\s*evidence|evidencia|evidencias)\b/i,
      /\bevidencia\s*posterior\b/i,
      /\bvalidades?\s*apos\s*ruptura\b/i,
      /\brupturas?\s*encerradas?\s*por\s*validade\b/i,
      /\bquais\s*rupturas\s*possuem\s*evidencia\b/i,
    ],
  },

  // 9. RECOMMENDED_ACTIONS
  {
    id: 'RECOMMENDED_ACTIONS',
    description: 'Recomendações operacionais prioritárias baseadas em regras de risco',
    patterns: [
      /\b(acoes|acao|recomenda|recomendacoes|recomendadas?|prioridades?|sugestoes|plano\s*de\s*acao)\b/i,
      /\bo\s*que\s*fazer\b/i,
      /\bquais\s*acoes\b/i,
      /\bmarcas\s*exigem\s*acao\s*imediata\b/i,
      /\brecolhimento\s*urgente\b/i,
      /\bvisita\s*prioritaria\b/i,
    ],
  },

  // 10. TOP_STORES
  {
    id: 'TOP_STORES',
    description: 'Lojas mais críticas por score de risco operacional',
    patterns: [
      /\b(top|5|10|principais|mais)\s*lojas?\s*(criticas?|risco|afetadas?|prioritarias?)\b/i,
      /\blojas?\s*(mais\s*criticas?|com\s*maior\s*risco|mais\s*urgentes?)\b/i,
      /\bquais\s*(sao\s*as\s*)?(\d{1,2}\s*)?lojas\s*mais\s*criticas\b/i,
      /\branking\s*(de\s*)?lojas\b/i,
    ],
  },

  // 11. TOP_PRODUCTS
  {
    id: 'TOP_PRODUCTS',
    description: 'Produtos mais críticos por score de risco e validades',
    patterns: [
      /\b(top|5|10|principais|mais)\s*produtos?\s*(criticos?|risco|afetados?|prioritarios?)\b/i,
      /\bprodutos?\s*(mais\s*criticos?|com\s*maior\s*risco|mais\s*urgentes?)\b/i,
      /\bquais\s*(sao\s*os\s*)?(\d{1,2}\s*)?produtos\s*mais\s*criticos\b/i,
      /\branking\s*(de\s*)?produtos\b/i,
    ],
  },

  // 12. TOP_BRANDS
  {
    id: 'TOP_BRANDS',
    description: 'Marcas ou indústrias mais críticas por score de risco',
    patterns: [
      /\b(top|5|10|principais|mais)\s*(marcas?|industrias?|clientes?)\s*(criticas?|risco|afetadas?|prioritarias?)\b/i,
      /\b(marcas?|industrias?|clientes?)\s*(mais\s*criticas?|com\s*maior\s*risco)\b/i,
      /\bquais\s*(sao\s*as\s*)?(\d{1,2}\s*)?marcas\s*(mais\s*criticas|exigem\s*acao)\b/i,
      /\branking\s*(de\s*)?(marcas|industrias|clientes)\b/i,
    ],
  },

  // 13. SCORE_EXPLANATION
  {
    id: 'SCORE_EXPLANATION',
    description: 'Explicação detalhada da fórmula de cálculo do Score de Risco v1',
    patterns: [
      /\b(como\s*calcula|como\s*funciona|explicar|explicacao|formula|pesos|criterios?)\s*(o\s*)?(score|risco|pontuacao)\b/i,
      /\bmetodologia\s*(do\s*)?score\b/i,
      /\bcomo\s*o\s*score\s*e\s*calculado\b/i,
      /\bfaixas\s*de\s*score\b/i,
    ],
  },

  // 14. AVAILABLE_DATA
  {
    id: 'AVAILABLE_DATA',
    description: 'Dados disponíveis na base e exemplos de perguntas suportadas',
    patterns: [
      /\b(quais\s*dados|o\s*que\s*voce\s*sabe|o\s*que\s*posso\s*perguntar|ajuda|como\s*usar|exemplos?|dados\s*disponiveis)\b/i,
      /\bquais\s*perguntas\b/i,
      /\bfuncionalidades\b/i,
    ],
  },

  // 15. OVERVIEW (resumo geral da operação)
  {
    id: 'OVERVIEW',
    description: 'Resumo geral dos indicadores e KPIs da fotografia atual',
    patterns: [
      /\b(resumo|panorama|visao\s*geral|geral|operacao|status\s*geral|kpis?|indicadores|total|dashboard)\b/i,
      /\bcomo\s*esta\s*a\s*operacao\b/i,
      /\bsituacao\s*geral\b/i,
      /\bquantas\s*validades\b/i,
      /\bquantas\s*rupturas\b/i,
    ],
  },
]

// ============================================================================
// PARSER DETERMINÍSTICO DE INTENÇÃO E EXTRAÇÃO DE PARÂMETROS
// ============================================================================

export function parseIntent(rawInput: string): ParsedIntentResult | null {
  const sanitized = sanitizeInput(rawInput)
  if (!sanitized) return null

  const normalized = normalizeForIntent(sanitized)
  if (!normalized) return null

  // 1. Extração de parâmetros
  const params: Record<string, string> = {}

  // Extrair código de loja (ex: "loja 240", "codigo 240", "cod 240", "240")
  const storeNumMatch = normalized.match(/\b(?:loja|codigo|cod|lojas)?\s*(\d{1,6})\b/i)
  if (storeNumMatch && storeNumMatch[1]) {
    // Se for apenas número ou antecedido por loja/codigo
    params.storeCode = storeNumMatch[1]
  }

  // Extrair nome de rede se presente
  const networkMatch = normalized.match(
    /\b(fort\s*atacadista|fort|brasil\s*atacadista|atacadao|giassi|comper|bistek|angeloni|koch|condor|muffato|passarela)\b/i,
  )
  if (networkMatch) {
    params.network = networkMatch[1].toUpperCase()
  }

  // Extrair marca/indústria conhecida ou termo após marca
  const brandKeywords = [
    'frutap',
    'casa kunzler',
    'kunzler',
    'lilibel',
    'parmissimo',
    'diretoria',
    'italac',
    'cocoleve',
    'marigold',
    'massas',
  ]
  for (const b of brandKeywords) {
    if (normalized.includes(b)) {
      params.brand = b.toUpperCase()
      break
    }
  }

  const brandFollowMatch = normalized.match(
    /\b(?:marca|cliente|industria|fornecedor)\s+([a-z0-9\s]+)/i,
  )
  if (brandFollowMatch && brandFollowMatch[1] && !params.brand) {
    const rawBrand = brandFollowMatch[1].trim()
    // Limpar possíveis stop words
    const cleanBrand = rawBrand.replace(/\b(como|esta|situacao|detalhes|por|favor)\b/g, '').trim()
    if (cleanBrand.length >= 2) {
      params.brand = cleanBrand.toUpperCase()
    }
  }

  // Extrair dias de validade (ex: "7 dias", "15 dias", "proximos 3 dias")
  const daysMatch = normalized.match(/\b(\d{1,2})\s*dias?\b/i)
  if (daysMatch && daysMatch[1]) {
    params.days = daysMatch[1]
  }

  // Extrair criticidade
  if (
    normalized.includes('critico') ||
    normalized.includes('critica') ||
    normalized.includes('criticas')
  ) {
    params.criticidade = 'Crítico'
  } else if (normalized.includes('alto') || normalized.includes('alta')) {
    params.criticidade = 'Alto'
  } else if (normalized.includes('atencao')) {
    params.criticidade = 'Atenção'
  }

  // 2. Avaliação de matches com catálogo
  const candidateMatches: Array<{ id: IntentId; score: number }> = []

  for (const item of INTENT_CATALOG) {
    let matchCount = 0
    for (const pattern of item.patterns) {
      if (pattern.test(normalized)) {
        matchCount++
      }
    }

    if (matchCount > 0) {
      let score = matchCount * 10
      // Boost de prioridade para bloqueios
      if (item.id === 'BLOCKED_FINANCIAL' || item.id === 'BLOCKED_OUT_OF_SCOPE') {
        score += 50
      }
      // Boost se parâmetros específicos da intenção foram encontrados
      if (item.id === 'STORE_DETAIL' && (params.storeCode || params.network)) {
        // Se a pergunta cita "lojas mais criticas" ou "top lojas", TOP_STORES ganha
        if (!normalized.includes('mais criticas') && !normalized.includes('top')) {
          score += 30
        }
      }
      if (item.id === 'BRAND_DETAIL' && params.brand) {
        if (
          !normalized.includes('mais criticas') &&
          !normalized.includes('top') &&
          !normalized.includes('acoes')
        ) {
          score += 30
        }
      }
      if (item.id === 'EXPIRING_SOON' && params.days) {
        score += 25
      }

      candidateMatches.push({ id: item.id, score })
    }
  }

  if (candidateMatches.length === 0) {
    // Se a pessoa digitou apenas um número (ex: "240"), interpreta como STORE_DETAIL
    if (/^\d{1,6}$/.test(normalized)) {
      return {
        intent: 'STORE_DETAIL',
        confidence: 0.9,
        params: { storeCode: normalized },
      }
    }
    return null
  }

  // Ordenar matches por pontuação decrescente
  candidateMatches.sort((a, b) => b.score - a.score)
  const topMatch = candidateMatches[0]

  // Detecção de ambiguidade: dois candidatos não-bloqueados com score muito próximo
  if (
    candidateMatches.length > 1 &&
    topMatch.id !== 'BLOCKED_FINANCIAL' &&
    topMatch.id !== 'BLOCKED_OUT_OF_SCOPE'
  ) {
    const secondMatch = candidateMatches[1]
    // Se a diferença for muito pequena (< 2 pontos) e scores forem iguais
    if (topMatch.score === secondMatch.score && topMatch.id !== secondMatch.id) {
      // Retorna ambiguidade controlada (será tratada no executor com confidence baixa)
      return {
        intent: topMatch.id,
        confidence: 0.45,
        params,
      }
    }
  }

  // Cálculo de confiança normalizada (0.0 a 1.0)
  const confidence = Math.min(1.0, Math.max(0.6, topMatch.score / 50))

  return {
    intent: topMatch.id,
    confidence,
    params,
  }
}

// ============================================================================
// EXECUTOR DETERMINÍSTICO DE INTENÇÕES
// ============================================================================

export function executeIntent(
  parsed: ParsedIntentResult | null,
  snapshot: BaseAtualSnapshot,
  crossEvidences: CrossEvidence[] = [],
): AssistantResponse {
  const generatedAt = snapshot?.timestamp || new Date().toISOString()
  const formattedGenAt = formatDisplayDate(generatedAt)

  // 1. Caso entrada seja nula ou não reconhecida
  if (!parsed) {
    return {
      intent: 'unrecognized',
      title: 'Pergunta não compreendida',
      summary:
        'Não foi possível identificar uma intenção operacional clara com base na sua pergunta. Tente reformular ou clique em uma das sugestões abaixo.',
      metrics: [],
      evidence: [],
      sources: ['Base Atual'],
      filtersApplied: [],
      limitations: [
        'O assistente analítico reconhece consultas sobre validades, rupturas, lojas, marcas, scores de risco e confronto de evidências.',
      ],
      generatedAt: formattedGenAt,
      confidence: 0,
      isAmbiguous: false,
    }
  }

  // 2. Caso ambíguo (confiança insuficiente)
  if (parsed.confidence < 0.6) {
    return {
      intent: 'ambiguous',
      title: 'Pergunta ambígua',
      summary:
        'Sua solicitação abrange mais de um tema operacional simultaneamente. Para garantir precisão auditável, reformule especificando se deseja ver lojas, produtos, marcas ou validades.',
      metrics: [],
      evidence: [],
      sources: ['Base Atual'],
      filtersApplied: Object.entries(parsed.params).map(([k, v]) => ({ type: k, value: v })),
      limitations: [
        'O assistente determinístico não adivinha intenções ambíguas para não gerar dados imprecisos.',
      ],
      generatedAt: formattedGenAt,
      confidence: parsed.confidence,
      isAmbiguous: true,
    }
  }

  // 3. Bloqueio Financeiro / Comercial
  if (parsed.intent === 'BLOCKED_FINANCIAL') {
    return {
      intent: 'blocked',
      title: 'Análise indisponível',
      summary:
        'Este dado não existe na Base Atual. A plataforma opera exclusivamente com variáveis operacionais de presença e validade física (datas de vencimento, rupturas físicas e quantitativos de estoque informado).',
      metrics: [],
      evidence: [],
      sources: ['Base Atual (Controle Operacional)'],
      filtersApplied: [],
      limitations: [
        'Dados de faturamento, margem financeira, sell-out real, giro de vendas e custo/lucro exigem integração com ERP/PDV comercial, não parametrizada neste ambiente.',
        'O assistente não projeta tendências financeiras nem fabrica estimativas autônomas.',
      ],
      generatedAt: formattedGenAt,
      confidence: 1.0,
      isBlocked: true,
    }
  }

  // 4. Bloqueio Fora de Escopo
  if (parsed.intent === 'BLOCKED_OUT_OF_SCOPE') {
    return {
      intent: 'blocked',
      title: 'Análise indisponível',
      summary: 'Esta pergunta está fora do escopo da plataforma de Inteligência Operacional.',
      metrics: [],
      evidence: [],
      sources: ['Base Atual'],
      filtersApplied: [],
      limitations: [
        'A plataforma destina-se exclusivamente ao monitoramento operacional de validades, rupturas de gôndola e reconciliação de gôndolas de varejo.',
      ],
      generatedAt: formattedGenAt,
      confidence: 1.0,
      isBlocked: true,
    }
  }

  // Tratar base vazia de forma segura
  const validades = snapshot?.validadesAtivas || []
  const rupturas = snapshot?.rupturasAtivas || []
  const kpis = snapshot?.kpisReconciliados || {
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
  }

  const { expanded, unresolved } = expandBrandTotalRuptures(rupturas, validades)

  // ==========================================================================
  // DISPATCH DE INTENÇÕES
  // ==========================================================================

  switch (parsed.intent) {
    // ------------------------------------------------------------------------
    // OVERVIEW
    // ------------------------------------------------------------------------
    case 'OVERVIEW': {
      const metrics: MetricItem[] = [
        {
          label: 'Validades Críticas (1–3d)',
          value: kpis.validadesCriticas,
          status: kpis.validadesCriticas > 0 ? 'critical' : 'normal',
          detail: 'Itens em risco iminente de vencimento',
        },
        {
          label: 'Rupturas Ativas',
          value: kpis.rupturasAtivasTotal,
          status: kpis.rupturasAtivasTotal > 0 ? 'critical' : 'normal',
          detail: 'Produtos ou marcas em falta na loja',
        },
        {
          label: 'Alertas Abertos',
          value: kpis.alertasAbertosTotal,
          status: kpis.alertasAbertosTotal > 0 ? 'warning' : 'normal',
          detail: 'Validades até 15 dias não visualizadas',
        },
        {
          label: 'Produtos Distintos em Risco',
          value: kpis.produtosDistintosEmRisco,
          status: 'warning',
          detail: 'SKUs ou descrições únicas com validade crítica',
        },
        {
          label: 'Lojas Afetadas',
          value: kpis.lojasAfetadas,
          status: 'neutral',
          detail: 'Pontos de venda com ocorrências ativas',
        },
        {
          label: 'Volume em Risco',
          value: `${kpis.quantidadeTotalEmRisco.toLocaleString('pt-BR')} un`,
          status: 'warning',
          detail: 'Soma física de estoque em risco operacional',
        },
      ]

      const evidence: EvidenceItem[] = [
        {
          iconType: 'calendar',
          title: 'Validades Ativas Reconciliadas',
          subtitle: `${kpis.validadesAtivasTotal} ocorrências ativas com data futura válida e quantidade > 0.`,
          badge: `${kpis.validadesCriticas} Críticas`,
          badgeVariant: 'critical',
          navigationPath: '/validades',
          navigationLabel: 'Ir para Validades',
        },
        {
          iconType: 'alert',
          title: 'Rupturas em Aberto',
          subtitle: `${kpis.rupturasAtivasTotal} ocorrências ativas registradas em campo.`,
          badge: `${expanded.length} Expandidas`,
          badgeVariant: 'warning',
          navigationPath: '/rupturas',
          navigationLabel: 'Ir para Rupturas',
        },
        {
          iconType: 'store',
          title: 'Lojas no Radar',
          subtitle: `${kpis.lojasAfetadas} lojas com validades ativas de ${kpis.clientesAfetados} marcas parceiras.`,
          badge: `${kpis.lojasAfetadas} Lojas`,
          badgeVariant: 'info',
          navigationPath: '/lojas',
          navigationLabel: 'Ir para Lojas',
        },
      ]

      return {
        intent: 'OVERVIEW',
        title: 'Panorama Geral da Operação',
        summary: `A fotografia atual registra ${kpis.validadesCriticas} validades críticas, ${kpis.rupturasAtivasTotal} rupturas ativas e ${kpis.alertasAbertosTotal} alertas operacionais abertos, impactando ${kpis.lojasAfetadas} lojas em ${kpis.produtosDistintosEmRisco} produtos distintos.`,
        metrics,
        evidence,
        sources: ['Base Atual (validades_base, rupturas_base)', 'Seletores Reconciliados'],
        filtersApplied: [],
        limitations: ['Fotografia estática baseada na carga mais recente da Base Atual.'],
        generatedAt: formattedGenAt,
        confidence: parsed.confidence,
      }
    }

    // ------------------------------------------------------------------------
    // TOP_STORES
    // ------------------------------------------------------------------------
    case 'TOP_STORES': {
      // Extrair todas as lojas únicas da base
      const storeCodes = new Set<string>()
      validades.forEach((v) => {
        const c = extractStoreRealCode({
          codigo_loja: v.codigoLoja,
          razao_social: v.loja,
          nome_loja: v.loja,
        })
        if (c) storeCodes.add(c)
      })
      rupturas.forEach((r) => {
        const c = extractStoreRealCode({
          codigo_loja: r.codigo_loja,
          razao_social: r.nome_loja,
          nome_loja: r.nome_loja,
        })
        if (c) storeCodes.add(c)
      })

      const storeResults: StoreRiskResult[] = Array.from(storeCodes)
        .map((code) => computeStoreRiskScore(code, validades, rupturas, expanded))
        .sort((a, b) => b.score - a.score || b.rawPoints - a.rawPoints)

      const top5 = storeResults.slice(0, 5)

      const metrics: MetricItem[] = top5.map((s, idx) => ({
        label: `#${idx + 1} - Loja ${s.storeCode}`,
        value: `Score ${s.score}`,
        detail: `${s.storeName} (${s.severity}) • ${s.validadesCount} val. / ${s.rupturasSpecificCount + s.rupturasDerivedCount + s.rupturasTotalUnresolvedCount} rup.`,
        status:
          s.severity === 'Crítico' ? 'critical' : s.severity === 'Alto' ? 'warning' : 'normal',
      }))

      const evidence: EvidenceItem[] = top5.map((s) => {
        const identity = formatStoreIdentity({ codigo_loja: s.storeCode, nome_loja: s.storeName })
        return {
          iconType: 'store',
          title: identity,
          subtitle: `${s.city || 'Cidade não inf.'} ${s.state ? `• ${s.state}` : ''}`,
          badge: `${s.severity} (Score ${s.score})`,
          badgeVariant:
            s.severity === 'Crítico' ? 'critical' : s.severity === 'Alto' ? 'warning' : 'neutral',
          details: [
            { label: 'Validades em risco', value: s.validadesCount },
            { label: 'Quantidade física', value: `${s.validadesQuantityInRisk} un` },
            {
              label: 'Rupturas totais ativas',
              value:
                s.rupturasSpecificCount + s.rupturasDerivedCount + s.rupturasTotalUnresolvedCount,
            },
            { label: 'Pontos brutos', value: s.rawPoints },
          ],
          navigationPath: `/lojas/${s.storeCode}`,
          navigationLabel: 'Ver Loja',
        }
      })

      return {
        intent: 'TOP_STORES',
        title: 'Top 5 Lojas Mais Críticas',
        summary: `As 5 lojas de maior risco operacional foram classificadas pelo modelo auditável Score v1, combinando ${top5.reduce((sum, s) => sum + s.validadesCount, 0)} ocorrências de validade e ${top5.reduce((sum, s) => sum + s.rupturasSpecificCount + s.rupturasDerivedCount + s.rupturasTotalUnresolvedCount, 0)} rupturas ativas.`,
        metrics,
        evidence,
        sources: ['Base Atual', 'Modelo de Score de Risco Operacional v1'],
        filtersApplied: [{ type: 'Limite', value: 'Top 5 Lojas' }],
        limitations: [
          'Score calculado com teto de 100 pontos; desempate por pontos brutos acumulados.',
        ],
        generatedAt: formattedGenAt,
        confidence: parsed.confidence,
      }
    }

    // ------------------------------------------------------------------------
    // TOP_PRODUCTS
    // ------------------------------------------------------------------------
    case 'TOP_PRODUCTS': {
      const productNames = new Set<string>()
      validades.forEach((v) => {
        if (v.product) productNames.add(v.product)
      })
      rupturas.forEach((r) => {
        if (r.produto) productNames.add(r.produto)
      })

      const productResults: ProductRiskResult[] = Array.from(productNames)
        .map((pName) => computeProductRiskScore(pName, validades, rupturas, expanded))
        .sort((a, b) => b.score - a.score || b.rawPoints - a.rawPoints)

      const top5 = productResults.slice(0, 5)

      const metrics: MetricItem[] = top5.map((p, idx) => ({
        label: `#${idx + 1} - ${p.productName.slice(0, 24)}`,
        value: `Score ${p.score}`,
        detail: `${p.brand} • ${p.validadesQuantityInRisk} un em risco em ${p.storesWithValidadeCount} lojas`,
        status:
          p.severity === 'Crítico' ? 'critical' : p.severity === 'Alto' ? 'warning' : 'normal',
      }))

      const evidence: EvidenceItem[] = top5.map((p) => ({
        iconType: 'product',
        title: p.productName,
        subtitle: `Marca: ${p.brand} ${p.productCode ? `• SKU: ${p.productCode}` : ''}`,
        badge: `${p.severity} (${p.score} pts)`,
        badgeVariant:
          p.severity === 'Crítico' ? 'critical' : p.severity === 'Alto' ? 'warning' : 'neutral',
        details: [
          { label: 'Validades ativas', value: p.validadesCount },
          { label: 'Unidades em risco', value: `${p.validadesQuantityInRisk} un` },
          { label: 'Lojas com validade', value: p.storesWithValidadeCount },
          { label: 'Lojas com ruptura', value: p.storesWithRuptureCount },
          { label: 'Rupturas específicas', value: p.rupturasSpecificCount },
          { label: 'Rupturas derivadas', value: p.rupturasDerivedCount },
        ],
        navigationPath: '/validades',
        navigationLabel: 'Ver no Painel de Validades',
      }))

      return {
        intent: 'TOP_PRODUCTS',
        title: 'Top 5 Produtos Mais Críticos',
        summary: `Os 5 produtos com maior pontuação de risco operacional acumulam ${top5.reduce((sum, p) => sum + p.validadesQuantityInRisk, 0)} unidades em risco de vencimento somados a ocorrências de ruptura na rede.`,
        metrics,
        evidence,
        sources: ['Base Atual', 'Catálogo de Produtos e Score v1'],
        filtersApplied: [{ type: 'Limite', value: 'Top 5 Produtos' }],
        limitations: [
          'Rupturas derivadas de portfólio total foram reconciliadas pelo catálogo ativo.',
        ],
        generatedAt: formattedGenAt,
        confidence: parsed.confidence,
      }
    }

    // ------------------------------------------------------------------------
    // TOP_BRANDS
    // ------------------------------------------------------------------------
    case 'TOP_BRANDS': {
      const brandNames = new Set<string>()
      validades.forEach((v) => {
        if (v.cliente) brandNames.add(v.cliente)
      })
      rupturas.forEach((r) => {
        if (r.cliente) brandNames.add(r.cliente)
      })

      const brandResults: BrandRiskResult[] = Array.from(brandNames)
        .map((bName) => computeBrandRiskScore(bName, validades, rupturas))
        .sort((a, b) => b.score - a.score || b.rawPoints - a.rawPoints)

      const top5 = brandResults.slice(0, 5)

      const metrics: MetricItem[] = top5.map((b, idx) => ({
        label: `#${idx + 1} - ${b.brand}`,
        value: `Score ${b.score}`,
        detail: `${b.validadesQuantityInRisk} un em risco • ${b.rupturasCount} rupturas em ${b.storesWithRuptureCount} lojas`,
        status:
          b.severity === 'Crítico' ? 'critical' : b.severity === 'Alto' ? 'warning' : 'normal',
      }))

      const evidence: EvidenceItem[] = top5.map((b) => ({
        iconType: 'alert',
        title: b.brand,
        subtitle: `Presente em ${b.storesWithValidadeCount} lojas com validades e ${b.storesWithRuptureCount} com rupturas.`,
        badge: `${b.severity} (${b.score} pts)`,
        badgeVariant:
          b.severity === 'Crítico' ? 'critical' : b.severity === 'Alto' ? 'warning' : 'neutral',
        details: [
          { label: 'Ocorrências de validade', value: b.validadesCount },
          { label: 'Estoque físico em risco', value: `${b.validadesQuantityInRisk} un` },
          { label: 'Lojas c/ validade 1–7 dias', value: b.validadesCriticalStoresCount },
          { label: 'Rupturas ativas', value: b.rupturasCount },
        ],
        navigationPath: '/validades',
        navigationLabel: 'Consultar Validades da Marca',
      }))

      return {
        intent: 'TOP_BRANDS',
        title: 'Top Marcas em Risco Operacional',
        summary: `As principais indústrias parceiras com ocorrências ativas foram ranqueadas pelo Score v1, destacando concentração de vencimentos curtos e faltas em gôndola.`,
        metrics,
        evidence,
        sources: ['Base Atual', 'Score de Risco de Marcas v1'],
        filtersApplied: [{ type: 'Limite', value: 'Top 5 Marcas' }],
        limitations: ['Pontuação puramente operacional baseada na Base Atual.'],
        generatedAt: formattedGenAt,
        confidence: parsed.confidence,
      }
    }

    // ------------------------------------------------------------------------
    // EXPIRING_SOON
    // ------------------------------------------------------------------------
    case 'EXPIRING_SOON': {
      const maxDays = parsed.params.days ? parseInt(parsed.params.days, 10) : 7

      const filteredValidades = validades
        .filter((v) => v.diasRestantes >= 1 && v.diasRestantes <= maxDays)
        .sort((a, b) => a.diasRestantes - b.diasRestantes)

      // Agrupamento por faixas
      const f1a3 = filteredValidades.filter((v) => v.diasRestantes <= 3)
      const f4a7 = filteredValidades.filter((v) => v.diasRestantes >= 4 && v.diasRestantes <= 7)
      const f8a15 = filteredValidades.filter((v) => v.diasRestantes >= 8 && v.diasRestantes <= 15)

      const totalQty = filteredValidades.reduce((sum, v) => sum + (v.quantidade ?? v.estoque), 0)

      const metrics: MetricItem[] = [
        {
          label: `Total até ${maxDays} dias`,
          value: filteredValidades.length,
          status: filteredValidades.length > 0 ? 'critical' : 'normal',
          detail: `${totalQty.toLocaleString('pt-BR')} unidades no total`,
        },
        {
          label: 'Faixa 1–3 dias (Crítico)',
          value: f1a3.length,
          status: f1a3.length > 0 ? 'critical' : 'normal',
          detail: `${f1a3.reduce((sum, v) => sum + (v.quantidade ?? v.estoque), 0)} un`,
        },
        {
          label: 'Faixa 4–7 dias (Atenção)',
          value: f4a7.length,
          status: f4a7.length > 0 ? 'warning' : 'normal',
          detail: `${f4a7.reduce((sum, v) => sum + (v.quantidade ?? v.estoque), 0)} un`,
        },
      ]

      if (maxDays > 7) {
        metrics.push({
          label: 'Faixa 8–15 dias (Moderado)',
          value: f8a15.length,
          status: 'neutral',
          detail: `${f8a15.reduce((sum, v) => sum + (v.quantidade ?? v.estoque), 0)} un`,
        })
      }

      const topEvidence = filteredValidades.slice(0, 6).map((v) => {
        const storeIdent = formatStoreIdentity({ codigo_loja: v.codigoLoja, nome_loja: v.loja })
        return {
          iconType: 'calendar' as const,
          title: v.product,
          subtitle: `${storeIdent} • ${v.cliente}`,
          badge: `${v.diasRestantes} dia(s) (${formatDisplayDate(v.validade)})`,
          badgeVariant: (v.diasRestantes <= 3 ? 'critical' : 'warning') as 'critical' | 'warning',
          details: [
            { label: 'Quantidade', value: `${v.quantidade ?? v.estoque} un` },
            { label: 'Lote', value: v.lote || 'Não informado' },
            { label: 'Promotor', value: v.promotor || 'Não informado' },
          ],
          navigationPath: '/validades',
          navigationLabel: 'Ver no Painel de Validades',
        }
      })

      return {
        intent: 'EXPIRING_SOON',
        title: `Validades Próximas (Janela de até ${maxDays} dias)`,
        summary: `Foram localizados ${filteredValidades.length} registros de validade com vencimento previsto para os próximos ${maxDays} dias, totalizando ${totalQty.toLocaleString('pt-BR')} unidades físicas em gôndola/estoque.`,
        metrics,
        evidence: topEvidence,
        sources: ['Base Atual (validades_base)'],
        filtersApplied: [{ type: 'Janela de Dias', value: `1 a ${maxDays} dias` }],
        limitations: ['Apenas validades com data válida futura e quantidade > 0 são computadas.'],
        generatedAt: formattedGenAt,
        confidence: parsed.confidence,
      }
    }

    // ------------------------------------------------------------------------
    // OLDEST_RUPTURES
    // ------------------------------------------------------------------------
    case 'OLDEST_RUPTURES': {
      const sortedRuptures = [...rupturas]
        .filter((r) => r.situacao_atual === 'Ativo')
        .sort((a, b) => (b.dias_em_ruptura ?? 0) - (a.dias_em_ruptura ?? 0))

      const top5 = sortedRuptures.slice(0, 5)

      const metrics: MetricItem[] = top5.map((r, idx) => ({
        label: `#${idx + 1} - ${r.produto.slice(0, 24)}`,
        value: `${r.dias_em_ruptura ?? 0} dias`,
        detail: `${formatStoreIdentity({ codigo_loja: r.codigo_loja, nome_loja: r.nome_loja })} • ${r.cliente}`,
        status: (r.dias_em_ruptura ?? 0) >= 15 ? 'critical' : 'warning',
      }))

      const evidence: EvidenceItem[] = top5.map((r) => {
        const storeIdent = formatStoreIdentity({
          codigo_loja: r.codigo_loja,
          nome_loja: r.nome_loja,
        })
        return {
          iconType: 'alert',
          title: r.produto,
          subtitle: `${storeIdent} • Cliente: ${r.cliente}`,
          badge: `${r.dias_em_ruptura ?? 0} dias em ruptura`,
          badgeVariant: (r.dias_em_ruptura ?? 0) >= 15 ? 'critical' : 'warning',
          details: [
            { label: 'Motivo informado', value: r.motivo || 'Ruptura Total' },
            {
              label: 'Data da 1ª visita',
              value: formatDisplayDate(r.data_entrada || r.data_visita),
            },
            { label: 'Promotor responsável', value: r.colaborador || 'Não informado' },
          ],
          navigationPath: '/rupturas',
          navigationLabel: 'Ir para Rupturas',
        }
      })

      return {
        intent: 'OLDEST_RUPTURES',
        title: 'Rupturas Mais Antigas em Aberto',
        summary: `As 5 rupturas ativas com maior tempo de permanência em gôndola estão ativas há até ${top5[0]?.dias_em_ruptura ?? 0} dias consecutivos sem reposição física confirmada.`,
        metrics,
        evidence,
        sources: ['Base Atual (rupturas_base)'],
        filtersApplied: [{ type: 'Ordenação', value: 'Maior tempo em ruptura' }],
        limitations: ['Rupturas ativas com dias calculados a partir da data de entrada na base.'],
        generatedAt: formattedGenAt,
        confidence: parsed.confidence,
      }
    }

    // ------------------------------------------------------------------------
    // STORE_DETAIL
    // ------------------------------------------------------------------------
    case 'STORE_DETAIL': {
      const codeTarget = parsed.params.storeCode
      const networkTarget = parsed.params.network

      // Localizar loja agregada ou pelo código
      let targetCode = codeTarget
      let matchedValidades = validades
      let matchedRupturas = rupturas

      if (targetCode) {
        matchedValidades = validades.filter((v) => {
          const c = extractStoreRealCode({
            codigo_loja: v.codigoLoja,
            razao_social: v.loja,
            nome_loja: v.loja,
          })
          return c === targetCode || v.codigoLoja === targetCode
        })
        matchedRupturas = rupturas.filter((r) => {
          const c = extractStoreRealCode({
            codigo_loja: r.codigo_loja,
            razao_social: r.nome_loja,
            nome_loja: r.nome_loja,
          })
          return c === targetCode || r.codigo_loja === targetCode
        })
      } else if (networkTarget) {
        matchedValidades = validades.filter((v) => v.loja.toUpperCase().includes(networkTarget))
        matchedRupturas = rupturas.filter((r) => r.nome_loja.toUpperCase().includes(networkTarget))
        if (matchedValidades.length > 0) {
          targetCode = matchedValidades[0].codigoLoja || undefined
        } else if (matchedRupturas.length > 0) {
          targetCode = matchedRupturas[0].codigo_loja || undefined
        }
      }

      if (!targetCode && matchedValidades.length === 0 && matchedRupturas.length === 0) {
        return {
          intent: 'STORE_DETAIL',
          title: 'Loja não encontrada',
          summary: `Não foram encontrados registros ativos para o identificador "${codeTarget || networkTarget}" na fotografia da Base Atual.`,
          metrics: [],
          evidence: [],
          sources: ['Base Atual'],
          filtersApplied: [{ type: 'Loja pesquisada', value: codeTarget || networkTarget || '' }],
          limitations: ['Verifique o código numérico da loja (ex: 240, 085, 250).'],
          generatedAt: formattedGenAt,
          confidence: parsed.confidence,
        }
      }

      const effectiveCode = targetCode || 'N/D'
      const riskResult = computeStoreRiskScore(effectiveCode, validades, rupturas, expanded)

      const storeName =
        matchedValidades[0]?.loja ||
        matchedRupturas[0]?.nome_loja ||
        riskResult.storeName ||
        `Loja ${effectiveCode}`
      const fullIdent = formatStoreIdentity({ codigo_loja: effectiveCode, nome_loja: storeName })

      const metrics: MetricItem[] = [
        {
          label: 'Score de Risco',
          value: `${riskResult.score}/100`,
          status:
            riskResult.severity === 'Crítico'
              ? 'critical'
              : riskResult.severity === 'Alto'
                ? 'warning'
                : 'normal',
          detail: `Severidade: ${riskResult.severity} (${riskResult.rawPoints} pts brutos)`,
        },
        {
          label: 'Validades Ativas',
          value: riskResult.validadesCount,
          status: riskResult.validadesCount > 0 ? 'warning' : 'normal',
          detail: `${riskResult.validadesQuantityInRisk} un em risco`,
        },
        {
          label: 'Rupturas Específicas',
          value: riskResult.rupturasSpecificCount,
          status: riskResult.rupturasSpecificCount > 0 ? 'critical' : 'normal',
          detail: 'Produtos individuais em falta',
        },
        {
          label: 'Rupturas Derivadas/Totais',
          value: riskResult.rupturasDerivedCount + riskResult.rupturasTotalUnresolvedCount,
          status: 'neutral',
          detail: 'Expansão de catálogo de marca',
        },
      ]

      const topValidades = matchedValidades.slice(0, 4).map((v) => ({
        iconType: 'calendar' as const,
        title: v.product,
        subtitle: `Marca: ${v.cliente} • Lote: ${v.lote || 'N/D'}`,
        badge: `${v.diasRestantes} dia(s) (${v.status})`,
        badgeVariant: (v.status === 'Crítico' ? 'critical' : 'warning') as 'critical' | 'warning',
        details: [
          { label: 'Quantidade', value: `${v.quantidade ?? v.estoque} un` },
          { label: 'Vencimento', value: formatDisplayDate(v.validade) },
        ],
        navigationPath: `/lojas/${effectiveCode}`,
        navigationLabel: 'Abrir Ficha da Loja',
      }))

      const topRup = matchedRupturas.slice(0, 3).map((r) => ({
        iconType: 'alert' as const,
        title: r.produto,
        subtitle: `Cliente: ${r.cliente} • Motivo: ${r.motivo || 'Ruptura Total'}`,
        badge: `${r.dias_em_ruptura ?? 0} dias em falta`,
        badgeVariant: ((r.dias_em_ruptura ?? 0) >= 15 ? 'critical' : 'warning') as
          | 'critical'
          | 'warning',
        details: [
          { label: 'Situação', value: r.situacao_atual },
          { label: 'Data visita', value: formatDisplayDate(r.data_visita) },
        ],
        navigationPath: `/lojas/${effectiveCode}`,
        navigationLabel: 'Abrir Ficha da Loja',
      }))

      return {
        intent: 'STORE_DETAIL',
        title: `Situação Operacional: ${fullIdent}`,
        summary: `A unidade ${fullIdent} possui score ${riskResult.score} (${riskResult.severity}), acumulando ${riskResult.validadesCount} ocorrências de validade (${riskResult.validadesQuantityInRisk} un) e ${riskResult.rupturasSpecificCount + riskResult.rupturasDerivedCount + riskResult.rupturasTotalUnresolvedCount} rupturas ativas.`,
        metrics,
        evidence: [...topValidades, ...topRup],
        sources: ['Base Atual', 'Score de Risco v1', 'Ficha Cadastral da Loja'],
        filtersApplied: [{ type: 'Loja', value: fullIdent }],
        limitations: ['Cálculo em tempo real sobre a fotografia consolidada.'],
        generatedAt: formattedGenAt,
        confidence: parsed.confidence,
      }
    }

    // ------------------------------------------------------------------------
    // BRAND_DETAIL
    // ------------------------------------------------------------------------
    case 'BRAND_DETAIL': {
      const brandSearch = parsed.params.brand || ''
      const normBrandTarget = normalizeBrandKey(brandSearch)

      const matchedValidades = validades.filter(
        (v) =>
          normalizeBrandKey(v.cliente).includes(normBrandTarget) ||
          normalizeBrandKey(v.industria).includes(normBrandTarget),
      )
      const matchedRupturas = rupturas.filter((r) =>
        normalizeBrandKey(r.cliente).includes(normBrandTarget),
      )

      if (matchedValidades.length === 0 && matchedRupturas.length === 0) {
        return {
          intent: 'BRAND_DETAIL',
          title: 'Marca não encontrada',
          summary: `Não foram localizados registros para a marca/cliente "${brandSearch}" na fotografia atual.`,
          metrics: [],
          evidence: [],
          sources: ['Base Atual'],
          filtersApplied: [{ type: 'Marca pesquisada', value: brandSearch }],
          limitations: ['Consulte pelo nome da marca (ex: FRUTAP, CASA KUNZLER, LILIBEL).'],
          generatedAt: formattedGenAt,
          confidence: parsed.confidence,
        }
      }

      const brandCanonical =
        matchedValidades[0]?.cliente || matchedRupturas[0]?.cliente || brandSearch
      const brandScore = computeBrandRiskScore(brandCanonical, validades, rupturas)

      const metrics: MetricItem[] = [
        {
          label: 'Score da Marca',
          value: `${brandScore.score}/100`,
          status:
            brandScore.severity === 'Crítico'
              ? 'critical'
              : brandScore.severity === 'Alto'
                ? 'warning'
                : 'normal',
          detail: `Severidade: ${brandScore.severity} (${brandScore.rawPoints} pts brutos)`,
        },
        {
          label: 'Validades Ativas',
          value: brandScore.validadesCount,
          status: brandScore.validadesCount > 0 ? 'warning' : 'normal',
          detail: `${brandScore.validadesQuantityInRisk} unidades em risco`,
        },
        {
          label: 'Lojas c/ Validade 1–7d',
          value: brandScore.validadesCriticalStoresCount,
          status: brandScore.validadesCriticalStoresCount > 0 ? 'critical' : 'normal',
          detail: 'Lojas com vencimento iminente',
        },
        {
          label: 'Rupturas Ativas',
          value: brandScore.rupturasCount,
          status: brandScore.rupturasCount > 0 ? 'critical' : 'normal',
          detail: `Presente em ${brandScore.storesWithRuptureCount} lojas com falta`,
        },
      ]

      const evidence: EvidenceItem[] = [
        ...matchedValidades.slice(0, 3).map((v) => ({
          iconType: 'calendar' as const,
          title: v.product,
          subtitle: formatStoreIdentity({ codigo_loja: v.codigoLoja, nome_loja: v.loja }),
          badge: `${v.diasRestantes} dias (${v.status})`,
          badgeVariant: (v.status === 'Crítico' ? 'critical' : 'warning') as 'critical' | 'warning',
          details: [
            { label: 'Quantidade', value: `${v.quantidade ?? v.estoque} un` },
            { label: 'Validade', value: formatDisplayDate(v.validade) },
          ],
          navigationPath: '/validades',
          navigationLabel: 'Ver Validades',
        })),
        ...matchedRupturas.slice(0, 3).map((r) => ({
          iconType: 'alert' as const,
          title: r.produto,
          subtitle: formatStoreIdentity({ codigo_loja: r.codigo_loja, nome_loja: r.nome_loja }),
          badge: `${r.dias_em_ruptura ?? 0} dias em ruptura`,
          badgeVariant: 'warning' as const,
          details: [
            { label: 'Motivo', value: r.motivo || 'Ruptura Total' },
            { label: 'Data', value: formatDisplayDate(r.data_visita) },
          ],
          navigationPath: '/rupturas',
          navigationLabel: 'Ver Rupturas',
        })),
      ]

      return {
        intent: 'BRAND_DETAIL',
        title: `Situação da Marca: ${brandCanonical}`,
        summary: `A marca ${brandCanonical} apresenta Score ${brandScore.score} (${brandScore.severity}), com ${brandScore.validadesCount} validades ativas (${brandScore.validadesQuantityInRisk} un) e ${brandScore.rupturasCount} ocorrências de ruptura distribuídas em ${brandScore.storesWithRuptureCount} lojas.`,
        metrics,
        evidence,
        sources: ['Base Atual', 'Score de Risco de Marca v1'],
        filtersApplied: [{ type: 'Marca', value: brandCanonical }],
        limitations: ['Reconciliação entre validades_base e rupturas_base.'],
        generatedAt: formattedGenAt,
        confidence: parsed.confidence,
      }
    }

    // ------------------------------------------------------------------------
    // RECOMMENDED_ACTIONS
    // ------------------------------------------------------------------------
    case 'RECOMMENDED_ACTIONS': {
      // Computar todos os scores para alimentar o motor de recomendações
      const storeCodes = new Set<string>()
      validades.forEach((v) => {
        const c = extractStoreRealCode({
          codigo_loja: v.codigoLoja,
          razao_social: v.loja,
          nome_loja: v.loja,
        })
        if (c) storeCodes.add(c)
      })
      rupturas.forEach((r) => {
        const c = extractStoreRealCode({
          codigo_loja: r.codigo_loja,
          razao_social: r.nome_loja,
          nome_loja: r.nome_loja,
        })
        if (c) storeCodes.add(c)
      })

      const stores = Array.from(storeCodes).map((code) =>
        computeStoreRiskScore(code, validades, rupturas, expanded),
      )

      const productNames = new Set<string>()
      validades.forEach((v) => {
        if (v.product) productNames.add(v.product)
      })
      rupturas.forEach((r) => {
        if (r.produto) productNames.add(r.produto)
      })
      const products = Array.from(productNames).map((pName) =>
        computeProductRiskScore(pName, validades, rupturas, expanded),
      )

      const brandNames = new Set<string>()
      validades.forEach((v) => {
        if (v.cliente) brandNames.add(v.cliente)
      })
      rupturas.forEach((r) => {
        if (r.cliente) brandNames.add(r.cliente)
      })
      const brands = Array.from(brandNames).map((bName) =>
        computeBrandRiskScore(bName, validades, rupturas),
      )

      const actions = generateRecommendedActions(stores, products, brands, validades)

      const metrics: MetricItem[] = [
        {
          label: 'Total de Recomendações',
          value: actions.length,
          status: actions.length > 0 ? 'critical' : 'normal',
          detail: 'Regras estritas acionadas por evidências',
        },
        {
          label: 'Visitas Prioritárias',
          value: actions.filter((a) => a.rule_id === 'VISITA_PRIORITARIA').length,
          status: 'warning',
          detail: 'Lojas com >=3 validades críticas e >=2 rupturas',
        },
        {
          label: 'Recolhimentos Urgentes',
          value: actions.filter((a) => a.rule_id === 'RECOLHIMENTO_URGENTE').length,
          status: 'critical',
          detail: 'Lotes de 1–3 dias com >=50 unidades',
        },
        {
          label: 'Risco de Distribuição',
          value: actions.filter((a) => a.rule_id === 'MARCA_RISCO_DISTRIBUICAO').length,
          status: 'warning',
          detail: 'Marcas com validades críticas em >=10 lojas',
        },
      ]

      const evidence: EvidenceItem[] = actions.slice(0, 6).map((act) => ({
        iconType: 'alert',
        title: act.action,
        subtitle: `Regra acionada: ${act.rule_id}`,
        badge: act.rule_id.replace(/_/g, ' '),
        badgeVariant: act.rule_id === 'RECOLHIMENTO_URGENTE' ? 'critical' : 'warning',
        details: Object.entries(act.evidence).map(([k, v]) => ({
          label: k,
          value: String(v),
        })),
        navigationPath: act.rule_id === 'VISITA_PRIORITARIA' ? '/lojas' : '/validades',
        navigationLabel: 'Analisar Ocorrência',
      }))

      return {
        intent: 'RECOMMENDED_ACTIONS',
        title: 'Recomendações Operacionais Auditáveis',
        summary: `Foram geradas ${actions.length} ações operacionais prioritárias por meio do motor determinístico de regras baseado em evidências de campo (sem criação autônoma).`,
        metrics,
        evidence,
        sources: ['Central Estratégica', 'Regras Auditáveis v1', 'Base Atual'],
        filtersApplied: [],
        limitations: [
          'Ações disparadas unicamente quando os gatilhos matemáticos pré-definidos são atingidos.',
        ],
        generatedAt: formattedGenAt,
        confidence: parsed.confidence,
      }
    }

    // ------------------------------------------------------------------------
    // CONFRONT_EVIDENCE
    // ------------------------------------------------------------------------
    case 'CONFRONT_EVIDENCE': {
      const high = crossEvidences.filter((c) => c.confidence === 'high')
      const medium = crossEvidences.filter((c) => c.confidence === 'medium')
      const review = crossEvidences.filter(
        (c) => c.proposed_status === 'awaiting_review' || c.review_status === 'pending',
      )
      const reopened = crossEvidences.filter((c) => c.proposed_status === 'reopened')

      const metrics: MetricItem[] = [
        {
          label: 'Evidências Registradas',
          value: crossEvidences.length,
          status: 'neutral',
          detail: 'Confrontos cruzados de ruptura x validade',
        },
        {
          label: 'Alta Confiança (Código)',
          value: high.length,
          status: 'normal',
          detail: 'Resolução inferida com código idêntico',
        },
        {
          label: 'Aguardando Revisão',
          value: review.length,
          status: review.length > 0 ? 'warning' : 'normal',
          detail: 'Necessita validação humana do operador',
        },
        {
          label: 'Rupturas Reabertas',
          value: reopened.length,
          status: reopened.length > 0 ? 'critical' : 'normal',
          detail: 'Nova ruptura após evidência prévia',
        },
      ]

      const evidence: EvidenceItem[] = crossEvidences.slice(0, 6).map((c) => ({
        iconType: 'link',
        title: c.product_name,
        subtitle: `${formatStoreIdentity({ codigo_loja: c.store_code, nome_loja: c.store_name })} • ${c.client_or_brand}`,
        badge: `Confiança: ${c.confidence.toUpperCase()}`,
        badgeVariant: c.confidence === 'high' ? 'info' : 'warning',
        details: [
          { label: 'Ruptura detectada em', value: formatDisplayDate(c.rupture_detected_at) },
          { label: 'Validade encontrada em', value: formatDisplayDate(c.stock_evidence_at) },
          { label: 'Estoque auditado', value: `${c.quantity_found} un` },
          { label: 'Dias até evidência', value: `${c.resolution_days} dias` },
        ],
        navigationPath: '/rupturas',
        navigationLabel: 'Ir para Confronto de Rupturas',
      }))

      return {
        intent: 'CONFRONT_EVIDENCE',
        title: 'Confronto de Ruptura x Validade Posterior',
        summary: `O motor de Shadow Reconciliation identificou ${crossEvidences.length} casos onde um produto apontado em ruptura teve estoque físico e validade registrados posteriormente na mesma loja.`,
        metrics,
        evidence,
        sources: ['operational_cross_evidence', 'Motor de Reconciliação Cronológica'],
        filtersApplied: [],
        limitations: [
          'O encerramento oficial de rupturas depende de revisão humana ou inferência por código estrito.',
        ],
        generatedAt: formattedGenAt,
        confidence: parsed.confidence,
      }
    }

    // ------------------------------------------------------------------------
    // SCORE_EXPLANATION
    // ------------------------------------------------------------------------
    case 'SCORE_EXPLANATION': {
      const metrics: MetricItem[] = [
        {
          label: 'Faixa Crítico',
          value: '75 a 100 pts',
          status: 'critical',
          detail: 'Ação imediata necessária (visita ou recolhimento)',
        },
        {
          label: 'Faixa Alto',
          value: '50 a 74 pts',
          status: 'warning',
          detail: 'Monitoramento próximo e plano de contingência',
        },
        {
          label: 'Faixa Atenção',
          value: '25 a 49 pts',
          status: 'warning',
          detail: 'Acompanhamento regular de giro',
        },
        {
          label: 'Faixa Monitorar',
          value: '0 a 24 pts',
          status: 'normal',
          detail: 'Situação controlada sem risco iminente',
        },
      ]

      const evidence: EvidenceItem[] = [
        {
          iconType: 'info',
          title: 'Pontuação de Validades (por registro ativo)',
          subtitle: 'Dias restantes + adicional de volume em estoque',
          badge: 'Validades',
          badgeVariant: 'info',
          details: [
            { label: '1 a 3 dias', value: '10 pts base' },
            { label: '4 a 7 dias', value: '8 pts base' },
            { label: '8 a 15 dias', value: '5 pts base' },
            { label: '16 a 25 dias', value: '2 pts base' },
            { label: '26 a 35 dias', value: '1 pto base' },
            { label: '>= 100 unidades', value: '+4 pts volume' },
            { label: '50 a 99 unidades', value: '+3 pts volume' },
            { label: '10 a 49 unidades', value: '+1 pto volume' },
          ],
        },
        {
          iconType: 'info',
          title: 'Pontuação de Rupturas (por ocorrência ativa)',
          subtitle: 'Pontos progressivos pela antiguidade da ruptura',
          badge: 'Rupturas',
          badgeVariant: 'warning',
          details: [
            { label: '0 a 3 dias', value: '2 pts' },
            { label: '4 a 7 dias', value: '4 pts' },
            { label: '8 a 14 dias', value: '7 pts' },
            { label: '15+ dias', value: '10 pts' },
          ],
        },
      ]

      return {
        intent: 'SCORE_EXPLANATION',
        title: 'Metodologia do Score de Risco Operacional v1',
        summary:
          'O Score de Risco v1 é um índice determinístico de 0 a 100 pontos calculado pela soma de pontos de validades ativas (ponderadas por dias restantes e quantidade) e rupturas ativas (ponderadas por antiguidade).',
        metrics,
        evidence,
        sources: ['strategicRankings.ts (Motor Oficial v1)'],
        filtersApplied: [],
        limitations: [
          'Score limitado ao teto de 100 pontos; desempate pelo somatório bruto de pontos.',
          'Rupturas totais de marca e seus derivados nunca são pontuados em duplicidade.',
        ],
        generatedAt: formattedGenAt,
        confidence: parsed.confidence,
      }
    }

    // ------------------------------------------------------------------------
    // AVAILABLE_DATA
    // ------------------------------------------------------------------------
    case 'AVAILABLE_DATA': {
      const metrics: MetricItem[] = [
        {
          label: 'Coleção Validades',
          value: `${snapshot.validadesAtivas.length} ativas`,
          detail: 'Vencimentos futuros, quantidades, lojas e promotores',
        },
        {
          label: 'Coleção Rupturas',
          value: `${snapshot.rupturasAtivas.length} ativas`,
          detail: 'Faltas em gôndola, motivos, dias e histórico',
        },
        {
          label: 'Lojas Monitoradas',
          value: `${snapshot.lojasAgregadas.length} cadastradas`,
          detail: 'Códigos reais, redes, cidades e estados',
        },
        {
          label: 'Confrontos Cruzados',
          value: `${crossEvidences.length} evidências`,
          detail: 'Reconciliação cronológica entre rupturas e validades',
        },
      ]

      const evidence: EvidenceItem[] = [
        {
          iconType: 'info',
          title: 'Exemplos de Perguntas Suportadas',
          subtitle: 'Clique nas sugestões ou digite perguntas semelhantes:',
          badge: 'Guia de Uso',
          badgeVariant: 'info',
          details: [
            { label: 'Lojas críticas', value: '"Quais são as 5 lojas mais críticas?"' },
            { label: 'Validades curtas', value: '"Quais produtos vencem nos próximos 7 dias?"' },
            {
              label: 'Loja específica',
              value: '"Como está a loja 240?" ou "situação da loja 085"',
            },
            { label: 'Marcas', value: '"Quais marcas exigem ação imediata?"' },
            {
              label: 'Confronto',
              value: '"Quais rupturas possuem evidência posterior de validade?"',
            },
            { label: 'Rupturas totais', value: '"Quantas rupturas de marca foram expandidas?"' },
            { label: 'Metodologia', value: '"Como o score é calculado?"' },
          ],
        },
      ]

      return {
        intent: 'AVAILABLE_DATA',
        title: 'Dados Disponíveis e Capacidades do Assistente',
        summary:
          'O assistente analítico opera em modo somente leitura sobre a Base Atual consolidada. Ele interpreta intenções operacionais e calcula métricas auditáveis em tempo real.',
        metrics,
        evidence,
        sources: ['Base Atual (validades_base, rupturas_base, operational_cross_evidence)'],
        filtersApplied: [],
        limitations: [
          'Consultas determinísticas auditáveis sem estimativa financeira ou extrapolação.',
        ],
        generatedAt: formattedGenAt,
        confidence: parsed.confidence,
      }
    }

    // ------------------------------------------------------------------------
    // BRAND_TOTAL_RUPTURES
    // ------------------------------------------------------------------------
    case 'BRAND_TOTAL_RUPTURES': {
      const brandTotalRuptures = rupturas.filter(
        (r) =>
          r.situacao_atual === 'Ativo' &&
          normalizeBrandKey(r.produto) === normalizeBrandKey(r.cliente),
      )

      const metrics: MetricItem[] = [
        {
          label: 'Rupturas Totais Registradas',
          value: brandTotalRuptures.length,
          status: 'warning',
          detail: 'Ocorrências onde produto = marca/cliente',
        },
        {
          label: 'Produtos Expandidos',
          value: expanded.length,
          status: 'normal',
          detail: 'Filhos gerados via catálogo ativo de validades',
        },
        {
          label: 'Totais sem Catálogo',
          value: unresolved.length,
          status: unresolved.length > 0 ? 'critical' : 'normal',
          detail: 'Marcas sem produtos na base de validades',
        },
      ]

      const evidence: EvidenceItem[] = [
        ...unresolved.slice(0, 3).map((u) => ({
          iconType: 'alert' as const,
          title: `Ruptura de Marca não expandida: ${u.brand}`,
          subtitle: `Loja: ${u.storeCode || 'Código não id.'} (${u.nome_loja || 'Nome não informado'})`,
          badge: 'Sem catálogo',
          badgeVariant: 'warning' as const,
          details: [{ label: 'Motivo', value: u.motivo || 'Ruptura Total' }],
          navigationPath: '/rupturas',
          navigationLabel: 'Ver no Painel de Rupturas',
        })),
        ...expanded.slice(0, 3).map((e) => ({
          iconType: 'product' as const,
          title: `Derivado: ${e.productName}`,
          subtitle: `Marca: ${e.brand} • Loja: ${e.codigo_loja}`,
          badge: 'Expandido',
          badgeVariant: 'info' as const,
          details: [
            { label: 'SKU', value: e.productCode || 'N/D' },
            { label: 'Origem', value: 'Catálogo de validades ativas' },
          ],
          navigationPath: '/rupturas',
          navigationLabel: 'Ver no Painel de Rupturas',
        })),
      ]

      return {
        intent: 'BRAND_TOTAL_RUPTURES',
        title: 'Expansão de Rupturas Totais de Marca',
        summary: `Foram identificadas ${brandTotalRuptures.length} rupturas de portfólio total de marca, resultando em ${expanded.length} produtos derivados expandidos contra o catálogo e ${unresolved.length} pendentes por ausência de itens no catálogo.`,
        metrics,
        evidence,
        sources: ['strategicRankings.ts (expandBrandTotalRuptures)', 'Base Atual'],
        filtersApplied: [],
        limitations: ['A expansão não duplica registros nem pontua pai e filhos simultaneamente.'],
        generatedAt: formattedGenAt,
        confidence: parsed.confidence,
      }
    }

    default:
      return {
        intent: 'unrecognized',
        title: 'Pergunta não compreendida',
        summary:
          'Não foi possível interpretar a intenção operacional com segurança. Tente reformular usando termos como "lojas mais críticas", "produtos a vencer", "como está a loja [código]" ou "como é calculado o score".',
        metrics: [],
        evidence: [],
        sources: ['Base Atual'],
        filtersApplied: [],
        limitations: ['O assistente requer termos claros do domínio de inteligência operacional.'],
        generatedAt: formattedGenAt,
        confidence: 0,
      }
  }
}
