import type { IOperationalDataSource } from './operationalDataSource'
import { MockOperationalAdapter } from './mockAdapter'
import { ImportDataSource } from './importAdapter'
import pb from '@/lib/pocketbase/client'
import type {
  ValidadeItem,
  ValidadesFilter,
  KpiSummary,
  ChartCategoryData,
  ChartRupturaPeriodData,
} from '@/types'
import { classificarCriticidade } from './criticidade'
import { calcularDiasRestantes, deriveStatus } from '@/lib/import/excelMapper'
import { calcularKpis } from './validadesCompute'

// Future adapter stubs - ready for toggle via VITE_DATA_SOURCE without touching any UI component

export class ExcelOperationalAdapter extends MockOperationalAdapter {
  // Stub for future Excel spreadsheet ingestion
  override async getKpis() {
    console.warn(
      '[ExcelOperationalAdapter] Carregamento via Excel ainda em desenvolvimento. Usando fallback.',
    )
    return super.getKpis()
  }
}

/**
 * TradeProApiAdapter — lê a Base Atual processada da collection
 * `validades_base` (resultado do pipeline TradePro).
 *
 * Quando `VITE_DATA_SOURCE=tradePro`, a tela de Validades exibe as ocorrências
 * processadas (deduplicadas, com correções de validade, status operacional, etc.).
 * Caso a collection esteja vazia, faz fallback para o mock.
 */
export class TradeProApiAdapter implements IOperationalDataSource {
  private mockFallback = new MockOperationalAdapter()

  /** Converte um registro de validades_base em ValidadeItem (compatível com a UI). */
  private toValidadeItem(rec: Record<string, unknown>): ValidadeItem {
    const validade = (rec.validade_efetiva as string) || (rec.validade as string) || ''
    const diasRestantes =
      typeof rec.dias_vencimento_atual === 'number'
        ? rec.dias_vencimento_atual
        : calcularDiasRestantes(validade)

    return {
      id: rec.id as string,
      product: (rec.produto as string) || '',
      sku: (rec.cod_produto as string) || (rec.cod_barras as string) || '',
      lote: (rec.numero_lote as string) || '',
      // categoria não existe no TradePro; usa Mercearia como padrão
      category: (rec.category as ValidadeItem['category']) || 'Mercearia',
      validade,
      diasRestantes,
      // status_operacional já vem no formato Vencido/Crítico/Atenção/Moderado/Normal
      status: (rec.status_operacional as ValidadeItem['status']) || deriveStatus(diasRestantes),
      unidade: 'UN',
      estoque: typeof rec.quantidade === 'number' ? rec.quantidade : Number(rec.quantidade) || 0,
      cliente: (rec.cliente as string) || undefined,
      industria: (rec.fornecedor as string) || undefined,
      rede: (rec.rede as string) || undefined,
      codigoLoja: (rec.codigo_loja as string) || undefined,
      loja: (rec.nome_loja as string) || (rec.razao_social as string) || undefined,
      cidade: (rec.cidade as string) || undefined,
      uf: (rec.estado as string) || undefined,
      promotor: (rec.colaborador as string) || undefined,
      supervisor: (rec.supervisor as string) || undefined,
      quantidade: typeof rec.quantidade === 'number' ? rec.quantidade : undefined,
      precoUnitario: undefined,
      ultimaAtualizacao: (rec.realizado as string) || undefined,
    }
  }

  async listValidades(filters?: ValidadesFilter): Promise<ValidadeItem[]> {
    try {
      const records = await pb.collection('validades_base').getFullList({
        sort: 'validade_efetiva',
        filter: 'is_base_atual = true',
      })
      if (records.length === 0) {
        // Fallback para mock quando a Base Atual está vazia
        return this.mockFallback.listValidades(filters)
      }

      let items: ValidadeItem[] = records
        .map((r) => this.toValidadeItem(r as unknown as Record<string, unknown>))
        // Regra de Isolamento de Vencidos:
        // Todas as ocorrências que estão com produtos vencidos (dias <= 0)
        // deverão ser visualizadas APENAS na aba auditoria e NÃO em Validades Críticas / Listagens Ativas.
        .filter((i) => i.diasRestantes > 0)

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

      if (filters?.status && filters.status !== 'Todos') {
        items = items.filter((i) => i.status === filters.status)
      }

      // Filtros Camada 02
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

      // Drill-down hierárquico
      if (filters?.drill) {
        const d = filters.drill
        if (d.cliente) items = items.filter((i) => i.cliente === d.cliente)
        if (d.loja) items = items.filter((i) => i.loja === d.loja)
        if (d.produto) items = items.filter((i) => i.product === d.produto)
        if (d.ocorrenciaId) items = items.filter((i) => i.id === d.ocorrenciaId)
      }

      return items
    } catch (err) {
      console.error('[TradeProApiAdapter] Falha ao listar validades_base:', err)
      return this.mockFallback.listValidades(filters)
    }
  }

  async getKpis(): Promise<{
    summary: KpiSummary
    categoryDistribution: ChartCategoryData[]
    rupturasOverTime: ChartRupturaPeriodData[]
  }> {
    try {
      const records = await pb.collection('validades_base').getFullList({
        sort: 'validade_efetiva',
        filter: 'is_base_atual = true',
      })
      if (records.length === 0) {
        // Base Atual vazia → fallback mock
        return this.mockFallback.getKpis()
      }

      const items: ValidadeItem[] = records
        .map((r) => this.toValidadeItem(r as unknown as Record<string, unknown>))
        .filter((i) => i.diasRestantes > 0) // Isola vencidos
      const kpis = calcularKpis(items)

      // Distribuição por categoria (usa categoria padrão Mercearia quando ausente)
      const categories: Array<ValidadeItem['category']> = [
        'Mercearia',
        'Laticínios',
        'Bebidas',
        'Limpeza',
        'Higiene',
      ]
      const categoryDistribution: ChartCategoryData[] = categories.map((cat) => {
        const catItems = items.filter((i) => i.category === cat)
        const c = catItems.filter((i) => i.status === 'Vencido' || i.status === 'Crítico').length
        const p = catItems.filter((i) => i.status === 'Atenção' || i.status === 'Moderado').length
        const o = catItems.filter((i) => i.status === 'Normal').length
        return { category: cat, critico: c, proximo: p, ok: o, total: catItems.length }
      })

      // Contagem real de alertas: mesmos critérios de `listAlertas` — validades
      // ativas (dias > 0) com status_operacional em {Crítico, Atenção, Moderado}.
      // Garante paridade entre o KPI "Alertas Abertos" e a Central de Alertas.
      const STATUS_ALERTAVEIS_KPI = new Set(['Crítico', 'Atenção', 'Moderado'])
      const alertasCount = items.filter(
        (i) => i.diasRestantes > 0 && STATUS_ALERTAVEIS_KPI.has(i.status),
      ).length

      // TradePro não exporta rupturas. O KPI e o gráfico de rupturas ficam
      // indisponíveis até existir uma fonte de dados de rupturas.
      const RUPTURAS_MENSAGEM = 'Módulo em desenvolvimento — aguardando fonte de dados de rupturas'

      const summary: KpiSummary = {
        validadesCriticas: {
          count: kpis.criticos,
          delta: `${kpis.criticos} críticos`,
          trend: 'neutral',
        },
        rupturasAtivas: {
          count: 0,
          delta: RUPTURAS_MENSAGEM,
          trend: 'neutral',
        },
        alertasAbertos: {
          count: alertasCount,
          delta: `${alertasCount} alertas`,
          trend: 'neutral',
        },
        produtosEmRisco: {
          count: new Set(items.filter((i) => i.status !== 'Normal').map((i) => i.sku)).size,
          delta: 'Atenção operacional',
          trend: 'neutral',
        },
        validadesStatusCounts: {
          critico: kpis.criticos,
          proximo: kpis.atencao + kpis.moderado,
          ok: kpis.ok,
        },
        rupturasStatusCounts: { emRuptura: 0, critico: 0, reposicaoPrevista: 0 },
      }

      return {
        summary,
        categoryDistribution,
        // Sem histórico de rupturas no TradePro; retorna vazio
        rupturasOverTime: [],
      }
    } catch (err) {
      console.error('[TradeProApiAdapter] Falha ao calcular KPIs:', err)
      return this.mockFallback.getKpis()
    }
  }

  async listRupturas(
    filters?: import('@/types').RupturasFilter,
  ): Promise<import('@/types').RupturaItem[]> {
    return this.mockFallback.listRupturas(filters)
  }

  async listAlertas(
    filters?: import('@/types').AlertasFilter,
  ): Promise<import('@/types').AlertaItem[]> {
    try {
      const records = await pb.collection('validades_base').getFullList({
        filter: 'is_base_atual = true',
        sort: '-updated',
      })

      const alertas: import('@/types').AlertaItem[] = []

      // Status operacionais que geram alertas de validade iminente.
      // Conforme faixas centralizadas em criticidade.ts:
      //   - Crítico  (1-15 dias)
      //   - Atenção  (16-25 dias)
      //   - Moderado (26-35 dias)
      // Vencidos (dias <= 0) e Normais (dias > 35) NÃO geram alertas aqui
      // (vencidos ficam isolados na Auditoria; normais estão fora de risco).
      const STATUS_ALERTAVEIS = new Set(['Crítico', 'Atenção', 'Moderado'])

      for (const rec of records) {
        const r = rec as unknown as Record<string, unknown>
        const status = (r.status_operacional as string) || ''
        const dias = typeof r.dias_vencimento_atual === 'number' ? r.dias_vencimento_atual : 0

        // Regra de Isolamento de Vencidos: apenas alertas de validades ativas
        // iminentes (dias > 0). Gera alerta para os três status alertáveis.
        if (dias <= 0 || !STATUS_ALERTAVEIS.has(status)) {
          continue
        }

        const produto = (r.produto as string) || 'Produto'
        const quantidade =
          typeof r.quantidade === 'number' ? r.quantidade : Number(r.quantidade) || 0
        const sku = (r.cod_produto as string) || (r.cod_barras as string) || ''
        const realizado = (r.realizado as string) || ''
        const updatedAt = (r.updated as string) || ''
        const timestamp = updatedAt || realizado || new Date().toISOString()

        // Severidade mapeia a faixa de criticidade:
        //   Crítico  -> 'Crítico'
        //   Atenção  -> 'Alto'
        //   Moderado -> 'Médio'
        const severity: 'Crítico' | 'Alto' | 'Médio' =
          status === 'Crítico' ? 'Crítico' : status === 'Atenção' ? 'Alto' : 'Médio'

        // Título varia conforme a faixa para diferenciar os alertas.
        const title =
          status === 'Crítico'
            ? 'Validade Iminente'
            : status === 'Atenção'
              ? 'Validade Próxima'
              : 'Validade Moderada'

        const diasTexto = `${dias} dias`
        const description = `${produto} possui ${quantidade} unidades vencendo em ${diasTexto}.`

        alertas.push({
          id: `alerta-${r.id}`,
          title,
          message: description,
          severity,
          type: 'Validade',
          timestamp,
          isRead: false,
          product: produto,
          sku,
          category: 'Mercearia',
        })
      }

      let items = alertas

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
    } catch (err) {
      console.error('[TradeProApiAdapter] Falha ao listar alertas:', err)
      return []
    }
  }

  async getReportData(
    reportType: import('@/types').ReportType,
  ): Promise<import('@/types').ReportData> {
    return this.mockFallback.getReportData(reportType)
  }
}

export class SkipCloudOperationalAdapter extends MockOperationalAdapter {
  // Stub for future Skip Cloud operational collections
  override async getKpis() {
    console.warn(
      '[SkipCloudOperationalAdapter] Coleções operacionais no Skip Cloud em desenvolvimento. Usando fallback.',
    )
    return super.getKpis()
  }
}

let activeInstance: IOperationalDataSource | null = null

export class DataSourceFactory {
  static getProvider(): IOperationalDataSource {
    if (activeInstance) {
      return activeInstance
    }

    const dataSourceType = (import.meta.env.VITE_DATA_SOURCE || 'mock').toLowerCase()

    switch (dataSourceType) {
      case 'excel':
        activeInstance = new ExcelOperationalAdapter()
        break
      case 'tradepro':
      case 'api':
        activeInstance = new TradeProApiAdapter()
        break
      case 'import':
        activeInstance = new ImportDataSource()
        break
      case 'skipcloud':
      case 'pocketbase':
        activeInstance = new SkipCloudOperationalAdapter()
        break
      case 'mock':
      default:
        activeInstance = new MockOperationalAdapter()
        break
    }

    return activeInstance
  }

  // Utility to override provider in testing/dev
  static setProvider(provider: IOperationalDataSource) {
    activeInstance = provider
  }

  static reset() {
    activeInstance = null
  }
}
