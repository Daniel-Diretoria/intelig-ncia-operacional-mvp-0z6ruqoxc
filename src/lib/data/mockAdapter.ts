import type { IOperationalDataSource } from './operationalDataSource'
import type {
  ValidadeItem,
  ValidadesFilter,
  RupturaItem,
  RupturasFilter,
  AlertaItem,
  AlertasFilter,
  ReportData,
  ReportType,
  KpiSummary,
  ChartCategoryData,
  ChartRupturaPeriodData,
} from '@/types'
import { classificarCriticidade } from './criticidade'
import { MOCK_VALIDADES_VAREJO } from './mockValidades'

// Realistic sample seed data for Diretoria Promoções
const MOCK_VALIDADES: ValidadeItem[] = [
  {
    id: 'val-001',
    product: 'Molho de Tomate Tradicional 340g',
    sku: 'MER-0921',
    lote: 'LT2409-A',
    category: 'Mercearia',
    validade: '2025-05-18',
    diasRestantes: 6,
    status: 'Crítico',
    unidade: 'UN',
    estoque: 142,
  },
  {
    id: 'val-002',
    product: 'Iogurte Natural 170g',
    sku: 'LAT-3312',
    lote: 'LT2410-C',
    category: 'Laticínios',
    validade: '2025-05-22',
    diasRestantes: 10,
    status: 'Crítico',
    unidade: 'UN',
    estoque: 88,
  },
  {
    id: 'val-003',
    product: 'Leite Integral 1L',
    sku: 'LAT-1044',
    lote: 'LT2411-B',
    category: 'Laticínios',
    validade: '2025-05-25',
    diasRestantes: 13,
    status: 'Crítico',
    unidade: 'CX',
    estoque: 210,
  },
  {
    id: 'val-004',
    product: 'Manteiga com Sal 200g',
    sku: 'LAT-2201',
    lote: 'LT2412-A',
    category: 'Laticínios',
    validade: '2025-05-30',
    diasRestantes: 18,
    status: 'Próximo',
    unidade: 'UN',
    estoque: 64,
  },
  {
    id: 'val-005',
    product: 'Biscoito Cream Cracker 400g',
    sku: 'MER-4419',
    lote: 'LT2413-F',
    category: 'Mercearia',
    validade: '2025-06-05',
    diasRestantes: 24,
    status: 'Próximo',
    unidade: 'PCT',
    estoque: 180,
  },
  {
    id: 'val-006',
    product: 'Cerveja Pilsen 350ml',
    sku: 'BEB-8802',
    lote: 'LT2414-D',
    category: 'Bebidas',
    validade: '2025-06-08',
    diasRestantes: 27,
    status: 'Próximo',
    unidade: 'FD',
    estoque: 320,
  },
  {
    id: 'val-007',
    product: 'Refrigerante Cola 2L',
    sku: 'BEB-1190',
    lote: 'LT2415-X',
    category: 'Bebidas',
    validade: '2025-06-11',
    diasRestantes: 30,
    status: 'Próximo',
    unidade: 'FD',
    estoque: 155,
  },
  {
    id: 'val-008',
    product: 'Arroz Tipo 1 5kg',
    sku: 'MER-7701',
    lote: 'LT2418-K',
    category: 'Mercearia',
    validade: '2025-08-15',
    diasRestantes: 95,
    status: 'OK',
    unidade: 'FD',
    estoque: 450,
  },
  {
    id: 'val-009',
    product: 'Feijão Carioca 1kg',
    sku: 'MER-7702',
    lote: 'LT2419-M',
    category: 'Mercearia',
    validade: '2025-08-20',
    diasRestantes: 100,
    status: 'OK',
    unidade: 'FD',
    estoque: 390,
  },
  {
    id: 'val-010',
    product: 'Óleo de Soja 900ml',
    sku: 'MER-5520',
    lote: 'LT2420-R',
    category: 'Mercearia',
    validade: '2025-09-02',
    diasRestantes: 113,
    status: 'OK',
    unidade: 'CX',
    estoque: 275,
  },
  {
    id: 'val-011',
    product: 'Café Torrado 500g',
    sku: 'MER-3390',
    lote: 'LT2421-P',
    category: 'Mercearia',
    validade: '2025-09-14',
    diasRestantes: 125,
    status: 'OK',
    unidade: 'CX',
    estoque: 195,
  },
  {
    id: 'val-012',
    product: 'Sabão em Pó 1kg',
    sku: 'LIM-9912',
    lote: 'LT2422-T',
    category: 'Limpeza',
    validade: '2025-11-20',
    diasRestantes: 192,
    status: 'OK',
    unidade: 'CX',
    estoque: 310,
  },
  {
    id: 'val-013',
    product: 'Detergente Líquido 500ml',
    sku: 'LIM-8831',
    lote: 'LT2423-W',
    category: 'Limpeza',
    validade: '2025-12-05',
    diasRestantes: 207,
    status: 'OK',
    unidade: 'CX',
    estoque: 420,
  },
  {
    id: 'val-014',
    product: 'Creme Dental 90g',
    sku: 'HIG-6610',
    lote: 'LT2424-Q',
    category: 'Higiene',
    validade: '2025-12-18',
    diasRestantes: 220,
    status: 'OK',
    unidade: 'CX',
    estoque: 160,
  },
]

const MOCK_RUPTURAS: RupturaItem[] = [
  {
    id: 'rup-001',
    product: 'Macarrão Espaguete 500g',
    sku: 'MER-1002',
    category: 'Mercearia',
    diasSemEstoque: 7,
    status: 'Crítico',
    reposicaoPrevista: '2025-05-16',
    supplier: 'M. Dias Branco',
    unidade: 'CX',
  },
  {
    id: 'rup-002',
    product: 'Açúcar Refinado 1kg',
    sku: 'MER-2005',
    category: 'Mercearia',
    diasSemEstoque: 5,
    status: 'Em Ruptura',
    reposicaoPrevista: '2025-05-18',
    supplier: 'Camil Alimentos',
    unidade: 'FD',
  },
  {
    id: 'rup-003',
    product: 'Farinha de Trigo 1kg',
    sku: 'MER-3011',
    category: 'Mercearia',
    diasSemEstoque: 4,
    status: 'Em Ruptura',
    reposicaoPrevista: null,
    supplier: 'Bunge Brasil',
    unidade: 'FD',
  },
  {
    id: 'rup-004',
    product: 'Suco de Laranja Integral 900ml',
    sku: 'BEB-4120',
    category: 'Bebidas',
    diasSemEstoque: 3,
    status: 'Reposição Prevista',
    reposicaoPrevista: '2025-05-15',
    supplier: 'Natural One',
    unidade: 'CX',
  },
  {
    id: 'rup-005',
    product: 'Desinfetante Lavanda 2L',
    sku: 'LIM-5502',
    category: 'Limpeza',
    diasSemEstoque: 6,
    status: 'Crítico',
    reposicaoPrevista: null,
    supplier: 'Ypê',
    unidade: 'CX',
  },
  {
    id: 'rup-006',
    product: 'Shampoo Neutro 400ml',
    sku: 'HIG-7708',
    category: 'Higiene',
    diasSemEstoque: 2,
    status: 'Reposição Prevista',
    reposicaoPrevista: '2025-05-17',
    supplier: 'Unilever',
    unidade: 'CX',
  },
  {
    id: 'rup-007',
    product: 'Queijo Muçarela Fatiado 200g',
    sku: 'LAT-8890',
    category: 'Laticínios',
    diasSemEstoque: 4,
    status: 'Em Ruptura',
    reposicaoPrevista: '2025-05-19',
    supplier: 'Piracanjuba',
    unidade: 'PCT',
  },
]

const MOCK_ALERTAS: AlertaItem[] = [
  {
    id: 'alt-001',
    title: 'Validade Iminente',
    message: 'Molho de Tomate Tradicional 340g possui 142 unidades vencendo em menos de 7 dias.',
    type: 'Validade',
    severity: 'Crítico',
    product: 'Molho de Tomate Tradicional 340g',
    sku: 'MER-0921',
    category: 'Mercearia',
    timestamp: '2025-05-12T08:30:00Z',
    isRead: false,
  },
  {
    id: 'alt-002',
    title: 'Ruptura Prolongada',
    message:
      'Macarrão Espaguete 500g está sem estoque há 7 dias consecutivos no depósito principal.',
    type: 'Ruptura',
    severity: 'Crítico',
    product: 'Macarrão Espaguete 500g',
    sku: 'MER-1002',
    category: 'Mercearia',
    timestamp: '2025-05-11T14:15:00Z',
    isRead: false,
  },
  {
    id: 'alt-003',
    title: 'Lote Crítico de Laticínios',
    message: 'Leite Integral 1L (210 caixas) atinge janela crítica de validade em 13 dias.',
    type: 'Validade',
    severity: 'Alto',
    product: 'Leite Integral 1L',
    sku: 'LAT-1044',
    category: 'Laticínios',
    timestamp: '2025-05-10T09:45:00Z',
    isRead: false,
  },
  {
    id: 'alt-004',
    title: 'Ruptura sem Previsão',
    message:
      'Farinha de Trigo 1kg sem estoque há 4 dias e sem previsão de entrega confirmada pelo fornecedor.',
    type: 'Ruptura',
    severity: 'Alto',
    product: 'Farinha de Trigo 1kg',
    sku: 'MER-3011',
    category: 'Mercearia',
    timestamp: '2025-05-09T16:20:00Z',
    isRead: false,
  },
  {
    id: 'alt-005',
    title: 'Atenção a Vencimento Próximo',
    message:
      'Manteiga com Sal 200g entra na janela de 18 dias restantes. Programar ação promocional.',
    type: 'Validade',
    severity: 'Médio',
    product: 'Manteiga com Sal 200g',
    sku: 'LAT-2201',
    category: 'Laticínios',
    timestamp: '2025-05-08T11:00:00Z',
    isRead: true,
  },
  {
    id: 'alt-006',
    title: 'Aviso de Reposição',
    message: 'Suco de Laranja Integral 900ml com previsão de chegada para amanhã (15/05).',
    type: 'Ruptura',
    severity: 'Médio',
    product: 'Suco de Laranja Integral 900ml',
    sku: 'BEB-4120',
    category: 'Bebidas',
    timestamp: '2025-05-07T17:30:00Z',
    isRead: true,
  },
]

// Artificial small latency to simulate real network requests
const delay = (ms = 220) => new Promise((resolve) => setTimeout(resolve, ms))

export class MockOperationalAdapter implements IOperationalDataSource {
  async getKpis(): Promise<{
    summary: KpiSummary
    categoryDistribution: ChartCategoryData[]
    rupturasOverTime: ChartRupturaPeriodData[]
  }> {
    await delay()

    const criticosCount = MOCK_VALIDADES.filter((v) => v.status === 'Crítico').length
    const proximosCount = MOCK_VALIDADES.filter((v) => v.status === 'Próximo').length
    const okCount = MOCK_VALIDADES.filter((v) => v.status === 'OK').length

    const emRupturaCount = MOCK_RUPTURAS.filter((r) => r.status === 'Em Ruptura').length
    const ruptCriticosCount = MOCK_RUPTURAS.filter((r) => r.status === 'Crítico').length
    const reposicaoCount = MOCK_RUPTURAS.filter((r) => r.status === 'Reposição Prevista').length

    const unreadAlerts = MOCK_ALERTAS.filter((a) => !a.isRead).length

    // Distinct products in risk (critical validity or active rupture)
    const produtosRiscoSet = new Set<string>()
    MOCK_VALIDADES.filter((v) => v.status === 'Crítico').forEach((v) => produtosRiscoSet.add(v.sku))
    MOCK_RUPTURAS.forEach((r) => produtosRiscoSet.add(r.sku))

    const summary: KpiSummary = {
      validadesCriticas: {
        count: criticosCount,
        delta: '-12% vs. sem. passada',
        trend: 'down', // positive improvement
      },
      rupturasAtivas: {
        count: MOCK_RUPTURAS.length,
        delta: '+2 novos itens',
        trend: 'up',
      },
      alertasAbertos: {
        count: unreadAlerts,
        delta: '4 críticos/altos',
        trend: 'neutral',
      },
      produtosEmRisco: {
        count: produtosRiscoSet.size,
        delta: 'Atenção operacional',
        trend: 'neutral',
      },
      validadesStatusCounts: {
        critico: criticosCount,
        proximo: proximosCount,
        ok: okCount,
      },
      rupturasStatusCounts: {
        emRuptura: emRupturaCount,
        critico: ruptCriticosCount,
        reposicaoPrevista: reposicaoCount,
      },
    }

    const categories: Array<'Mercearia' | 'Laticínios' | 'Bebidas' | 'Limpeza' | 'Higiene'> = [
      'Mercearia',
      'Laticínios',
      'Bebidas',
      'Limpeza',
      'Higiene',
    ]

    const categoryDistribution: ChartCategoryData[] = categories.map((cat) => {
      const items = MOCK_VALIDADES.filter((v) => v.category === cat)
      const c = items.filter((v) => v.status === 'Crítico').length
      const p = items.filter((v) => v.status === 'Próximo').length
      const o = items.filter((v) => v.status === 'OK').length
      return {
        category: cat,
        critico: c,
        proximo: p,
        ok: o,
        total: items.length,
      }
    })

    const rupturasOverTime: ChartRupturaPeriodData[] = [
      { period: 'Sem 15', eventos: 12, criticos: 4, resolvidos: 10 },
      { period: 'Sem 16', eventos: 9, criticos: 3, resolvidos: 8 },
      { period: 'Sem 17', eventos: 14, criticos: 6, resolvidos: 11 },
      { period: 'Sem 18', eventos: 11, criticos: 5, resolvidos: 12 },
      { period: 'Sem 19', eventos: 8, criticos: 2, resolvidos: 9 },
      { period: 'Sem 20 (Atual)', eventos: 7, criticos: 2, resolvidos: 6 },
    ]

    return {
      summary,
      categoryDistribution,
      rupturasOverTime,
    }
  }

  async listValidades(filters?: ValidadesFilter): Promise<ValidadeItem[]> {
    await delay()
    // Camada 02: usa o dataset enriquecido de varejo (mesma forma do dataset
    // original, porém com cliente/indústria/rede/loja/cidade/promotor/supervisor).
    let items = [...MOCK_VALIDADES_VAREJO]

    if (filters?.search) {
      const q = filters.search.trim().toLowerCase()
      items = items.filter(
        (i) =>
          i.product.toLowerCase().includes(q) ||
          i.sku.toLowerCase().includes(q) ||
          i.lote.toLowerCase().includes(q) ||
          (i.cliente ?? '').toLowerCase().includes(q) ||
          (i.loja ?? '').toLowerCase().includes(q),
      )
    }

    if (filters?.category && filters.category !== 'Todos') {
      items = items.filter((i) => i.category === filters.category)
    }

    // status legado (Crítico / Próximo / OK) — mantido por compatibilidade
    if (filters?.status && filters.status !== 'Todos') {
      items = items.filter((i) => i.status === filters.status)
    }

    // --- Filtros Camada 02 ---
    if (filters?.cliente) items = items.filter((i) => i.cliente === filters.cliente)
    if (filters?.industria) items = items.filter((i) => i.industria === filters.industria)
    if (filters?.rede) items = items.filter((i) => i.rede === filters.rede)
    if (filters?.loja) items = items.filter((i) => i.loja === filters.loja)
    if (filters?.cidade) items = items.filter((i) => i.cidade === filters.cidade)
    if (filters?.produto) items = items.filter((i) => i.product === filters.produto)
    if (filters?.promotor) items = items.filter((i) => i.promotor === filters.promotor)
    if (filters?.supervisor) items = items.filter((i) => i.supervisor === filters.supervisor)

    if (filters?.criticidades && filters.criticidades.length > 0) {
      items = items.filter((i) =>
        filters.criticidades!.includes(classificarCriticidade(i.diasRestantes)),
      )
    }

    if (filters?.dataInicio) {
      const inicio = new Date(filters.dataInicio + 'T00:00:00').getTime()
      items = items.filter((i) => new Date(i.validade + 'T00:00:00').getTime() >= inicio)
    }
    if (filters?.dataFim) {
      const fim = new Date(filters.dataFim + 'T23:59:59').getTime()
      items = items.filter((i) => new Date(i.validade + 'T00:00:00').getTime() <= fim)
    }

    // --- Drill-down hierárquico ---
    if (filters?.drill) {
      const d = filters.drill
      if (d.cliente) items = items.filter((i) => i.cliente === d.cliente)
      if (d.loja) items = items.filter((i) => i.loja === d.loja)
      if (d.produto) items = items.filter((i) => i.product === d.produto)
      if (d.ocorrenciaId) items = items.filter((i) => i.id === d.ocorrenciaId)
    }

    return items
  }

  async listRupturas(filters?: RupturasFilter): Promise<RupturaItem[]> {
    await delay()
    let items = [...MOCK_RUPTURAS]

    if (filters?.search) {
      const q = filters.search.trim().toLowerCase()
      items = items.filter(
        (i) =>
          i.product.toLowerCase().includes(q) ||
          i.sku.toLowerCase().includes(q) ||
          (i.supplier && i.supplier.toLowerCase().includes(q)),
      )
    }

    if (filters?.category && filters.category !== 'Todos') {
      items = items.filter((i) => i.category === filters.category)
    }

    if (filters?.status && filters.status !== 'Todos') {
      items = items.filter((i) => i.status === filters.status)
    }

    return items
  }

  async listAlertas(filters?: AlertasFilter): Promise<AlertaItem[]> {
    await delay()
    let items = [...MOCK_ALERTAS]

    if (filters?.search) {
      const q = filters.search.trim().toLowerCase()
      items = items.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          i.message.toLowerCase().includes(q) ||
          (i.product && i.product.toLowerCase().includes(q)) ||
          (i.sku && i.sku.toLowerCase().includes(q)),
      )
    }

    if (filters?.severity && filters.severity !== 'Todos') {
      items = items.filter((i) => i.severity === filters.severity)
    }

    if (filters?.type && filters.type !== 'Todos') {
      items = items.filter((i) => i.type === filters.type)
    }

    return items
  }

  async getReportData(reportType: ReportType): Promise<ReportData> {
    await delay()

    switch (reportType) {
      case 'validades-por-categoria': {
        const categories = ['Mercearia', 'Laticínios', 'Bebidas', 'Limpeza', 'Higiene']
        const rows = categories.map((cat) => {
          const items = MOCK_VALIDADES.filter((v) => v.category === cat)
          const crit = items.filter((v) => v.status === 'Crítico').length
          const prox = items.filter((v) => v.status === 'Próximo').length
          const ok = items.filter((v) => v.status === 'OK').length
          const totalEstoque = items.reduce((acc, i) => acc + i.estoque, 0)
          return {
            categoria: cat,
            criticos: crit,
            proximos: prox,
            ok: ok,
            totalItens: items.length,
            volumeEstoque: totalEstoque,
          }
        })

        return {
          reportType,
          title: 'Relatório: Validades por Categoria',
          description:
            'Distribuição detalhada dos lotes por faixa de vencimento e categoria de produtos.',
          generatedAt: new Date().toISOString(),
          chartData: rows.map((r) => ({
            name: r.categoria,
            'Crítico (<15d)': r.criticos,
            'Próximo (15-30d)': r.proximos,
            'OK (>30d)': r.ok,
          })),
          tableColumns: [
            { key: 'categoria', label: 'Categoria' },
            { key: 'criticos', label: 'Críticos (<15d)' },
            { key: 'proximos', label: 'Próximos (15-30d)' },
            { key: 'ok', label: 'OK (>30d)' },
            { key: 'totalItens', label: 'Total de SKUs' },
            { key: 'volumeEstoque', label: 'Volume Total em Estoque' },
          ],
          tableRows: rows,
          summaryCards: [
            { label: 'Categorias Monitoradas', value: categories.length },
            {
              label: 'Lotes Críticos',
              value: MOCK_VALIDADES.filter((v) => v.status === 'Crítico').length,
              accent: 'danger',
            },
            {
              label: 'Lotes Próximos',
              value: MOCK_VALIDADES.filter((v) => v.status === 'Próximo').length,
              accent: 'warning',
            },
          ],
        }
      }

      case 'rupturas-por-periodo': {
        const chartData = [
          {
            name: 'Semana 15',
            'Total Rupturas': 12,
            Resolvidas: 10,
            'Dias Médios Sem Estoque': 4.2,
          },
          { name: 'Semana 16', 'Total Rupturas': 9, Resolvidas: 8, 'Dias Médios Sem Estoque': 3.5 },
          {
            name: 'Semana 17',
            'Total Rupturas': 14,
            Resolvidas: 11,
            'Dias Médios Sem Estoque': 5.1,
          },
          {
            name: 'Semana 18',
            'Total Rupturas': 11,
            Resolvidas: 12,
            'Dias Médios Sem Estoque': 4.0,
          },
          { name: 'Semana 19', 'Total Rupturas': 8, Resolvidas: 9, 'Dias Médios Sem Estoque': 3.1 },
          {
            name: 'Semana 20 (Atual)',
            'Total Rupturas': 7,
            Resolvidas: 6,
            'Dias Médios Sem Estoque': 3.8,
          },
        ]

        const tableRows = chartData.map((d) => ({
          periodo: d.name,
          rupturas: d['Total Rupturas'],
          resolvidas: d['Resolvidas'],
          taxaResolucao: `${Math.round(((d['Resolvidas'] as number) / (d['Total Rupturas'] as number)) * 100)}%`,
          tempoMedio: `${d['Dias Médios Sem Estoque']} dias`,
        }))

        return {
          reportType,
          title: 'Relatório: Rupturas por Período',
          description:
            'Evolução temporal das ocorrências de ruptura e taxa de resolução nas últimas semanas.',
          generatedAt: new Date().toISOString(),
          chartData,
          tableColumns: [
            { key: 'periodo', label: 'Período' },
            { key: 'rupturas', label: 'Eventos de Ruptura' },
            { key: 'resolvidas', label: 'Reposicionados' },
            { key: 'taxaResolucao', label: 'Taxa de Reposição' },
            { key: 'tempoMedio', label: 'Tempo Médio Sem Estoque' },
          ],
          tableRows,
          summaryCards: [
            { label: 'Rupturas Ativas Hoje', value: MOCK_RUPTURAS.length, accent: 'warning' },
            { label: 'Tempo Médio Atual', value: '4.1 dias' },
            {
              label: 'Com Reposição Confirmada',
              value: MOCK_RUPTURAS.filter((r) => r.reposicaoPrevista).length,
              accent: 'success',
            },
          ],
        }
      }

      case 'top-rupturas-por-produto': {
        const rows = MOCK_RUPTURAS.map((r) => ({
          produto: r.product,
          sku: r.sku,
          categoria: r.category,
          diasSemEstoque: `${r.diasSemEstoque} dias`,
          status: r.status,
          fornecedor: r.supplier || '—',
          reposicao: r.reposicaoPrevista
            ? new Date(r.reposicaoPrevista).toLocaleDateString('pt-BR')
            : 'Não informada',
        }))

        return {
          reportType,
          title: 'Relatório: Top Rupturas por Produto',
          description: 'Ranking detalhado de produtos com maior tempo de desabastecimento.',
          generatedAt: new Date().toISOString(),
          chartData: MOCK_RUPTURAS.map((r) => ({
            name: r.product.slice(0, 18) + '...',
            'Dias Sem Estoque': r.diasSemEstoque,
          })),
          tableColumns: [
            { key: 'produto', label: 'Produto' },
            { key: 'sku', label: 'SKU' },
            { key: 'categoria', label: 'Categoria' },
            { key: 'diasSemEstoque', label: 'Tempo Sem Estoque' },
            { key: 'status', label: 'Status' },
            { key: 'fornecedor', label: 'Fornecedor' },
            { key: 'reposicao', label: 'Previsão de Reposição' },
          ],
          tableRows: rows,
          summaryCards: [
            { label: 'Total de Itens em Ruptura', value: MOCK_RUPTURAS.length, accent: 'danger' },
            { label: 'Maior Ruptura', value: '7 dias (Macarrão)', accent: 'danger' },
            {
              label: 'Sem Previsão Fornecedor',
              value: MOCK_RUPTURAS.filter((r) => !r.reposicaoPrevista).length,
              accent: 'warning',
            },
          ],
        }
      }

      case 'validades-proximas-vencer': {
        const criticalAndNear = MOCK_VALIDADES.filter((v) => v.status !== 'OK').sort(
          (a, b) => a.diasRestantes - b.diasRestantes,
        )

        const rows = criticalAndNear.map((v) => ({
          produto: v.product,
          sku: v.sku,
          lote: v.lote,
          categoria: v.category,
          validade: new Date(v.validade).toLocaleDateString('pt-BR'),
          diasRestantes: `${v.diasRestantes} dias`,
          status: v.status,
          estoque: `${v.estoque} ${v.unidade}`,
        }))

        return {
          reportType,
          title: 'Relatório: Validades Próximas a Vencer',
          description: 'Lista prioritária de produtos em janela de risco (menos de 30 dias).',
          generatedAt: new Date().toISOString(),
          chartData: criticalAndNear.map((v) => ({
            name: v.product.slice(0, 16) + '...',
            'Dias Restantes': v.diasRestantes,
            'Estoque (un)': v.estoque,
          })),
          tableColumns: [
            { key: 'produto', label: 'Produto' },
            { key: 'sku', label: 'SKU' },
            { key: 'lote', label: 'Lote' },
            { key: 'categoria', label: 'Categoria' },
            { key: 'validade', label: 'Data de Vencimento' },
            { key: 'diasRestantes', label: 'Dias Restantes' },
            { key: 'status', label: 'Status' },
            { key: 'estoque', label: 'Estoque Atual' },
          ],
          tableRows: rows,
          summaryCards: [
            { label: 'SKUs em Risco Imediato', value: criticalAndNear.length, accent: 'danger' },
            { label: 'Menor Janela', value: '6 dias (Molho de Tomate)', accent: 'danger' },
            {
              label: 'Total Volume em Risco',
              value: `${criticalAndNear.reduce((a, b) => a + b.estoque, 0)} un`,
            },
          ],
        }
      }
    }
  }
}
