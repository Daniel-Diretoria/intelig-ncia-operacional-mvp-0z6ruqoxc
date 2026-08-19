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
      let items: ValidadeItem[] = records
        .map((r) => this.toValidadeItem(r as unknown as Record<string, unknown>))
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
    const emptyReport: ReportData = {
      reportType,
      title: '',
      description: '',
      generatedAt: new Date().toISOString(),
      chartData: [],
      tableColumns: [],
      tableRows: [],
    }

    try {
      const records = await pb.collection('validades_base').getFullList({
        filter: 'is_base_atual=true',
      })

      if (records.length === 0) {
        return emptyReport
      }

      const rows = records.map((r) => r as unknown as Record<string, unknown>)
      const str = (v: unknown) => (typeof v === 'string' ? v : '')
      const num = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0)
      const nowISO = new Date().toISOString()

      switch (reportType) {
        case 'validades-por-categoria': {
          // validades_base não possui campo "categoria"; agrupa por status_operacional.
          const groups = new Map<string, { total: number; criticos: number; quantidade: number }>()
          for (const r of rows) {
            const key = str(r.status_operacional) || 'Normal'
            const cur = groups.get(key) ?? { total: 0, criticos: 0, quantidade: 0 }
            cur.total++
            if (key === 'Crítico' || key === 'Vencido') cur.criticos++
            cur.quantidade += num(r.quantidade)
            groups.set(key, cur)
          }
          const data = [...groups.entries()].map(([status, v]) => ({
            categoria: status,
            criticos: v.criticos,
            totalItens: v.total,
            volumeEstoque: v.quantidade,
          }))
          return {
            reportType,
            title: 'Validades por Categoria',
            description:
              'Distribuição das ocorrências da Base Atual agrupadas por status operacional.',
            generatedAt: nowISO,
            chartData: data.map((d) => ({
              name: d.categoria,
              Ocorrências: d.totalItens,
              Críticos: d.criticos,
            })),
            tableColumns: [
              { key: 'categoria', label: 'Status' },
              { key: 'criticos', label: 'Críticos' },
              { key: 'totalItens', label: 'Total de Ocorrências' },
              { key: 'volumeEstoque', label: 'Volume em Estoque' },
            ],
            tableRows: data,
            summaryCards: [
              { label: 'Status distintos', value: data.length },
              {
                label: 'Ocorrências críticas',
                value: data
                  .filter((d) => d.categoria === 'Crítico' || d.categoria === 'Vencido')
                  .reduce((s, d) => s + d.criticos, 0),
                accent: 'danger',
              },
              {
                label: 'Ocorrências totais',
                value: data.reduce((s, d) => s + d.totalItens, 0),
              },
            ],
          }
        }

        case 'rupturas-por-periodo': {
          // validades_base não possui dados de ruptura; agrupa por data de realização.
          const groups = new Map<string, { total: number; criticos: number }>()
          for (const r of rows) {
            const raw = str(r.realizado)
            const key = raw ? raw.slice(0, 10) : 'Sem data'
            const cur = groups.get(key) ?? { total: 0, criticos: 0 }
            cur.total++
            if (str(r.status_operacional) === 'Crítico') cur.criticos++
            groups.set(key, cur)
          }
          const data = [...groups.entries()]
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([periodo, v]) => ({
              periodo,
              rupturas: v.total,
              criticos: v.criticos,
            }))
          return {
            reportType,
            title: 'Ocorrências por Período',
            description: 'Ocorrências da Base Atual agrupadas pela data de realização (período).',
            generatedAt: nowISO,
            chartData: data.map((d) => ({
              name: d.periodo,
              'Total Ocorrências': d.rupturas,
              Críticos: d.criticos,
            })),
            tableColumns: [
              { key: 'periodo', label: 'Período' },
              { key: 'rupturas', label: 'Ocorrências' },
              { key: 'criticos', label: 'Críticos' },
            ],
            tableRows: data,
            summaryCards: [
              { label: 'Períodos', value: data.length },
              {
                label: 'Ocorrências totais',
                value: data.reduce((s, d) => s + d.rupturas, 0),
              },
              {
                label: 'Críticos',
                value: data.reduce((s, d) => s + d.criticos, 0),
                accent: 'danger',
              },
            ],
          }
        }

        case 'top-rupturas-por-produto': {
          // Ranking por dias_vencimento_atual ascendente (mais próximo do vencimento).
          const data = rows
            .map((r) => ({
              produto: str(r.produto),
              sku: str(r.cod_produto) || str(r.cod_barras),
              fornecedor: str(r.fornecedor),
              dias: num(r.dias_vencimento_atual),
              status: str(r.status_operacional) || 'Normal',
            }))
            .filter((d) => d.produto)
            .sort((a, b) => a.dias - b.dias)
            .slice(0, 15)
          return {
            reportType,
            title: 'Top Ocorrências por Produto',
            description: 'Ranking dos produtos com menor prazo de vencimento (Base Atual).',
            generatedAt: nowISO,
            chartData: data.map((d) => ({
              name: d.produto.slice(0, 18),
              'Dias Restantes': d.dias,
            })),
            tableColumns: [
              { key: 'produto', label: 'Produto' },
              { key: 'sku', label: 'SKU' },
              { key: 'fornecedor', label: 'Fornecedor' },
              { key: 'dias', label: 'Dias Restantes' },
              { key: 'status', label: 'Status' },
            ],
            tableRows: data.map((d) => ({ ...d, dias: `${d.dias} dias` })),
            summaryCards: [
              { label: 'Produtos no ranking', value: data.length },
              {
                label: 'Menor prazo',
                value: data[0] ? `${data[0].dias} dias` : '—',
                accent: 'danger',
              },
              {
                label: 'Críticos',
                value: data.filter((d) => d.status === 'Crítico').length,
                accent: 'warning',
              },
            ],
          }
        }

        case 'validades-proximas-vencer': {
          const data = rows
            .map((r) => ({
              produto: str(r.produto),
              sku: str(r.cod_produto) || str(r.cod_barras),
              lote: str(r.numero_lote),
              validade: str(r.validade_efetiva),
              dias: num(r.dias_vencimento_atual),
              status: str(r.status_operacional) || 'Normal',
              estoque: num(r.quantidade),
              loja: str(r.nome_loja),
            }))
            .filter((d) => d.dias > 0 && d.dias <= 30)
            .sort((a, b) => a.dias - b.dias)
          return {
            reportType,
            title: 'Validades Próximas a Vencer',
            description: 'Ocorrências ativas com vencimento em até 30 dias (Base Atual).',
            generatedAt: nowISO,
            chartData: data.map((d) => ({
              name: d.produto.slice(0, 16),
              'Dias Restantes': d.dias,
              Estoque: d.estoque,
            })),
            tableColumns: [
              { key: 'produto', label: 'Produto' },
              { key: 'sku', label: 'SKU' },
              { key: 'lote', label: 'Lote' },
              { key: 'validade', label: 'Vencimento' },
              { key: 'dias', label: 'Dias Restantes' },
              { key: 'status', label: 'Status' },
              { key: 'estoque', label: 'Quantidade' },
              { key: 'loja', label: 'Loja' },
            ],
            tableRows: data.map((d) => ({
              ...d,
              validade: d.validade
                ? new Date(d.validade + 'T00:00:00').toLocaleDateString('pt-BR')
                : '—',
              dias: `${d.dias} dias`,
            })),
            summaryCards: [
              { label: 'SKUs em risco', value: data.length, accent: 'danger' },
              {
                label: 'Menor prazo',
                value: data[0] ? `${data[0].dias} dias` : '—',
                accent: 'danger',
              },
              {
                label: 'Volume em risco',
                value: data.reduce((s, d) => s + d.estoque, 0),
              },
            ],
          }
        }

        default:
          return emptyReport
      }
    } catch (err) {
      console.error('[ImportDataSource] Falha ao gerar relatório:', err)
      return emptyReport
    }
  }
}
