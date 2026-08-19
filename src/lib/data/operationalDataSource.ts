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
} from '@/types'

export interface IOperationalDataSource {
  getKpis(): Promise<{
    summary: KpiSummary
    categoryDistribution: ChartCategoryData[]
    rupturasOverTime: ChartRupturaPeriodData[]
  }>
  listValidades(filters?: ValidadesFilter): Promise<ValidadeItem[]>
  listRupturas(filters?: RupturasFilter): Promise<RupturaItem[]>
  listAlertas(filters?: AlertasFilter): Promise<AlertaItem[]>
  getReportData(reportType: ReportType): Promise<ReportData>
}
