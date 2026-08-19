export * from './operationalDataSource'
export * from './dataSourceFactory'

// Pipeline de Rupturas — funções e tipos auxiliares usados pelos adapters e UI.
export {
  parseRupturasExcel,
  validateRupturasRows,
  normalizeRupturaMotivo,
  extractStoreCode,
  buildRupturaOperationalKey,
  buildRupturaDedupKey,
  filterLast90Days,
  dedupRupturas,
  toRuptura,
  applyRupturasFilters,
  computeRupturasKpis,
  computeRupturasTendencia,
  computeRupturasOverTime,
  calcularHashArquivo,
  processRupturasImport,
  type ParsedRupturaRow,
  type InvalidRow,
  type RupturaPeriodPoint,
} from '@/lib/pipeline/rupturasPipeline'
