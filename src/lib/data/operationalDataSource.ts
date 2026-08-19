import type {
  KpiSummary,
  ValidadeItem,
  ValidadesFilter,
  RupturaItem,
  RupturasFilter,
  AlertaItem,
  AlertasFilter,
  ReportData,
  ReportType,
  ChartCategoryData,
  ChartRupturaPeriodData,
  RupturasKpis,
} from '@/types'

export interface IOperationalDataSource {
  getKpis(): Promise<{
    summary: KpiSummary
    categoryDistribution: ChartCategoryData[]
    rupturasOverTime: ChartRupturaPeriodData[]
  }>
  listValidades(filters?: ValidadesFilter): Promise<ValidadeItem[]>
  listRupturas(filters?: RupturasFilter): Promise<RupturaItem[]>
  /** KPIs consolidados do módulo de Rupturas (total ativas, por motivo, tops). */
  getRupturasKpis(): Promise<RupturasKpis>
  listAlertas(filters?: AlertasFilter): Promise<AlertaItem[]>
  getReportData(reportType: ReportType): Promise<ReportData>
}
