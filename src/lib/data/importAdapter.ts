import type { IOperationalDataSource } from './operationalDataSource'
import { DataSourceFactory } from './dataSourceFactory'
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
import { calcularDiasRestantes, deriveStatus } from '@/lib/import/excelMapper'
import pb from '@/lib/pocketbase/client'
import { MockOperationalAdapter } from './mockAdapter'

/**
 * ImportDataSource — implementa IOperationalDataSource lendo da collection
 * `validades_imported` no PocketBase.
 *
 * Quando `VITE_DATA_SOURCE=import`, a tela de Validades passa a exibir os dados
 * importados via Excel em vez do mock. A lógica de criticidade/computação
 * (`validadesCompute.ts`) continua funcionando pois os campos são os mesmos.
 *
 * Caso a collection esteja vazia, `listValidades` retorna array vazio e a UI
 * mostra o empty state (sugerindo importar dados).
 *
 * Rupturas/Alertas/Relatórios ainda usam o mock (não escopo desta camada).
 */
export class ImportDataSource implements IOperationalDataSource {
  private mockFallback = new MockOperationalAdapter()

  /** Converte um registro do PocketBase em ValidadeItem. */
  private toValidadeItem(rec: Record<string, unknown>): ValidadeItem {
    const validade = (rec.validade as string) || ''
    // recalcula diasRestantes para manter consistência com a data atual
    const diasRestantes =
      typeof rec.diasRestantes === 'number' ? rec.diasRestantes : calcularDiasRestantes(validade)

    return {
      id: rec.id as string,
      product: (rec.product as string) || '',
      sku: (rec.sku as string) || '',
      lote: (rec.lote as string) || '',
      category: rec.category as ValidadeItem['category'],
      validade,
      diasRestantes,
      status: (rec.status as ValidadeItem['status']) || deriveStatus(diasRestantes),
      unidade: (rec.unidade as string) || 'UN',
      estoque: typeof rec.estoque === 'number' ? rec.estoque : Number(rec.estoque) || 0,
      cliente: (rec.cliente as string) || undefined,
      industria: (rec.industria as string) || undefined,
      rede: (rec.rede as string) || undefined,
      loja: (rec.loja as string) || undefined,
      cidade: (rec.cidade as string) || undefined,
      uf: (rec.uf as string) || undefined,
      promotor: (rec.promotor as string) || undefined,
      supervisor: (rec.supervisor as string) || undefined,
      quantidade: typeof rec.quantidade === 'number' ? rec.quantidade : undefined,
      precoUnitario: typeof rec.precoUnitario === 'number' ? rec.precoUnitario : undefined,
      ultimaAtualizacao: (rec.ultimaAtualizacao as string) || undefined,
    }
  }

  async listValidades(filters?: ValidadesFilter): Promise<ValidadeItem[]> {
    try {
      const records = await pb.collection('validades_imported').getFullList({
        sort: 'validade',
      })
      let items: ValidadeItem[] = records.map((r) =>
        this.toValidadeItem(r as unknown as Record<string, unknown>),
      )

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
      console.error('[ImportDataSource] Falha ao listar validades importadas:', err)
      return []
    }
  }

  async getKpis(): Promise<{
    summary: KpiSummary
    categoryDistribution: ChartCategoryData[]
    rupturasOverTime: ChartRupturaPeriodData[]
  }> {
    // KPIs do Dashboard ainda usam mock — a importação alimenta Validades.
    return this.mockFallback.getKpis()
  }

  async listRupturas(filters?: RupturasFilter): Promise<RupturaItem[]> {
    return this.mockFallback.listRupturas(filters)
  }

  async listAlertas(filters?: AlertasFilter): Promise<AlertaItem[]> {
    return DataSourceFactory.getProvider().listAlertas(filters)
  }

  async getReportData(reportType: ReportType): Promise<ReportData> {
    return this.mockFallback.getReportData(reportType)
  }
}
