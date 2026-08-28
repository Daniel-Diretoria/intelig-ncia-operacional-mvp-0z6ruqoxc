/**
 * CAMADA 7B — CENTRAL DE EXPORTAÇÕES OPERACIONAIS
 *
 * Exportações completas em XLSX e CSV para substituir a Planilha Mestre.
 * Princípios:
 * - Base Atual Snapshot como verdade canônica.
 * - SheetJS (xlsx) com formatação rica e metadados estruturados.
 * - Zero colunas fictícias (sem lote, preço unitário, exposição financeira, SKU ou categoria inventados).
 * - Datas no formato DD/MM/AAAA.
 * - Código e nome da loja separados + coluna LOJA formatada `código • nome`.
 * - Aba "Metadados" em todo workbook: tipo, gerado_em, usuário, origem, filtros, total_registros, versão.
 * - CSV com BOM UTF-8 (\uFEFF) e separador ponto-e-vírgula (;).
 * - Códigos com zero à esquerda preservados como texto.
 * - Zero `undefined`, `null` ou JSON cru nas células.
 * - Nomenclatura de arquivos: `Diretoria_[Tipo]_YYYY-MM-DD_HHmm.xlsx` ou `.csv`.
 */
import * as XLSX from 'xlsx'
import {
  formatStoreIdentity,
  extractStoreRealCode,
  extractStoreCleanName,
  deriveNetworkName,
} from '@/lib/format/storeIdentity'
import { formatDisplayDate } from '@/lib/format/dateParser'
import {
  RISK_MODEL_VERSION,
  expandBrandTotalRuptures,
  computeStoreRiskScore,
  computeProductRiskScore,
  computeBrandRiskScore,
  generateRecommendedActions,
} from '@/lib/engine/strategicRankings'
import {
  reconcileRuptureValidity,
  type RupturaRecord,
  type ValidadeRecord,
} from '@/lib/engine/ruptureValidityReconciliationEngine'
import type { BaseAtualSnapshot } from '@/lib/selectors/baseAtualSelectors'
import type { ValidadeItem, Ruptura } from '@/types'
import type { AuditoriaOcorrencia } from '@/services/useAuditoria'
import type { ImportHistoryItem } from '@/services/useImportHistory'

export interface ImportHistoryExportItem {
  id?: string
  file_name?: string
  file_hash?: string
  tipo?: 'validades' | 'rupturas'
  status?: string
  total_rows?: number
  total_rows_read?: number
  imported_rows?: number
  skipped_rows?: number
  error_rows?: number
  created?: string
  [key: string]: unknown
}
import type { CrossEvidence } from '@/types'

export const OPERATIONAL_EXPORT_VERSION = 'v0.0.47'

// ---------------------------------------------------------------------------
// Helpers de Sanitização e Formatação
// ---------------------------------------------------------------------------

function safeStr(val: unknown): string {
  if (val === undefined || val === null) return ''
  const s = String(val).trim()
  if (s === 'undefined' || s === 'null') return ''
  return s
}

function safeNum(val: unknown, defaultVal = 0): number {
  if (typeof val === 'number' && !Number.isNaN(val)) return val
  if (typeof val === 'string') {
    const parsed = Number(val.replace(',', '.'))
    if (!Number.isNaN(parsed)) return parsed
  }
  return defaultVal
}

function fmtDateBR(isoOrDateStr: unknown): string {
  if (!isoOrDateStr) return ''
  const str = String(isoOrDateStr).trim()
  if (!str) return ''
  // Se já está em formato DD/MM/AAAA
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) return str
  return formatDisplayDate(str, '')
}

function getTimestampFileString(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const y = date.getFullYear()
  const m = pad(date.getMonth() + 1)
  const d = pad(date.getDate())
  const hh = pad(date.getHours())
  const mm = pad(date.getMinutes())
  return `${y}-${m}-${d}_${hh}${mm}`
}

function triggerBrowserDownload(blob: Blob, fileName: string): void {
  if (typeof window === 'undefined' || !document) return
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function createCsvContent(headers: string[], rows: Record<string, unknown>[]): string {
  const csvLines: string[] = []
  // Header
  csvLines.push(headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(';'))

  for (const row of rows) {
    const line = headers.map((headerKey) => {
      const val = row[headerKey]
      if (val === undefined || val === null) return '""'
      if (typeof val === 'number') return String(val)
      const str = String(val).replace(/"/g, '""')
      return `"${str}"`
    })
    csvLines.push(line.join(';'))
  }

  return '\uFEFF' + csvLines.join('\r\n')
}

export interface MetadataOptions {
  tipo: string
  usuario?: string
  filtros?: Record<string, unknown> | string
  totalRegistros: number
  origem?: string
  observacoes?: string
}

function buildMetadataRows(
  opts: MetadataOptions,
): Array<{ Campo: string; Valor: string | number }> {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const dataFormatada = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`

  let filtrosStr = 'Nenhum filtro aplicado (Base completa)'
  if (opts.filtros) {
    if (typeof opts.filtros === 'string') {
      filtrosStr = opts.filtros
    } else {
      const activeKeys = Object.entries(opts.filtros).filter(
        ([, v]) => v !== undefined && v !== null && v !== '' && v !== 'all' && v !== 'todos',
      )
      if (activeKeys.length > 0) {
        filtrosStr = activeKeys.map(([k, v]) => `${k}: ${v}`).join(' | ')
      }
    }
  }

  return [
    { Campo: 'Tipo de Exportação', Valor: opts.tipo },
    { Campo: 'Gerado em', Valor: dataFormatada },
    { Campo: 'Usuário', Valor: opts.usuario || 'Sistema / Diretoria' },
    { Campo: 'Origem dos Dados', Valor: opts.origem || 'Base Atual (Oficial)' },
    { Campo: 'Filtros Aplicados', Valor: filtrosStr },
    { Campo: 'Total de Registros', Valor: opts.totalRegistros },
    { Campo: 'Versão do Exportador', Valor: OPERATIONAL_EXPORT_VERSION },
    ...(opts.observacoes ? [{ Campo: 'Observações', Valor: opts.observacoes }] : []),
  ]
}

function appendMetadataSheet(
  workbook: XLSX.WorkBook,
  metaRows: Array<{ Campo: string; Valor: string | number }>,
): void {
  const metaWs = XLSX.utils.json_to_sheet(metaRows)
  metaWs['!cols'] = [{ wch: 25 }, { wch: 65 }]
  XLSX.utils.book_append_sheet(workbook, metaWs, 'Metadados')
}

// ---------------------------------------------------------------------------
// 1. BASE TRATADA DE VALIDADES
// ---------------------------------------------------------------------------

export interface BaseTratadaValidadesRow {
  'Cliente/Marca': string
  Fornecedor: string
  'Código Loja': string
  'Nome Loja': string
  Loja: string
  Rede: string
  Cidade: string
  UF: string
  Produto: string
  Quantidade: number
  Unidade: string
  Validade: string
  'Dias p/Vencer': number
  'Status Operacional': string
  Criticidade: string
  'Realizado/Data Pesquisa': string
  'Data Entrada': string
  Promotor: string
  Supervisor: string
  'Origem/Arquivo': string
}

export function buildBaseTratadaValidades(
  snapshot: Partial<BaseAtualSnapshot> & { validades?: ValidadeItem[] },
  filtros?: Record<string, unknown>,
): {
  data: BaseTratadaValidadesRow[]
  headers: string[]
  metadata: Array<{ Campo: string; Valor: string | number }>
} {
  const headers = [
    'Cliente/Marca',
    'Fornecedor',
    'Código Loja',
    'Nome Loja',
    'Loja',
    'Rede',
    'Cidade',
    'UF',
    'Produto',
    'Quantidade',
    'Unidade',
    'Validade',
    'Dias p/Vencer',
    'Status Operacional',
    'Criticidade',
    'Realizado/Data Pesquisa',
    'Data Entrada',
    'Promotor',
    'Supervisor',
    'Origem/Arquivo',
  ]

  const items = snapshot.validades || (snapshot as any).validadesAtivas || []
  const data: BaseTratadaValidadesRow[] = items.map((item) => {
    const rawCodLoja = item.codigoLoja || (item as any).codigo_loja || ''
    const rawNomeLoja = item.loja || (item as any).nome_loja || ''
    const codLoja =
      extractStoreRealCode(rawCodLoja) || extractStoreRealCode(rawNomeLoja) || safeStr(rawCodLoja)
    const nomeLoja = extractStoreCleanName(rawNomeLoja) || safeStr(rawNomeLoja)
    const storeFormatted = formatStoreIdentity({ codigo_loja: codLoja, nome_loja: nomeLoja })
    const rede = item.rede || deriveNetworkName(nomeLoja) || ''

    const qtd = safeNum(item.quantidade ?? (item as any).estoque, 0)
    const diasRest = typeof item.diasRestantes === 'number' ? item.diasRestantes : 0
    const statusOp = safeStr(item.status || (item as any).status_operacional || 'Normal')
    const criticidade = safeStr((item as any).criticidade || statusOp)

    return {
      'Cliente/Marca': safeStr(item.cliente || (item as any).industria || ''),
      Fornecedor: 'DIRETORIA',
      'Código Loja': safeStr(codLoja),
      'Nome Loja': safeStr(nomeLoja),
      Loja: storeFormatted,
      Rede: safeStr(rede),
      Cidade: safeStr(item.cidade || (item as any).city || ''),
      UF: safeStr(item.uf || item.estado || (item as any).state || ''),
      Produto: safeStr(item.product || (item as any).produto || ''),
      Quantidade: qtd,
      Unidade: safeStr((item as any).unidade || 'UN'),
      Validade: fmtDateBR(item.validade || (item as any).validade_efetiva),
      'Dias p/Vencer': diasRest,
      'Status Operacional': statusOp,
      Criticidade: criticidade,
      'Realizado/Data Pesquisa': fmtDateBR(
        (item as any).realizado || (item as any).data_pesquisa || item.dataEntrada,
      ),
      'Data Entrada': fmtDateBR(item.dataEntrada || (item as any).data_entrada),
      Promotor: safeStr(item.promotor || (item as any).colaborador || ''),
      Supervisor: safeStr(item.supervisor || ''),
      'Origem/Arquivo': safeStr(
        item.origem || item.arquivoOrigem || (item as any).arquivo_origem || '',
      ),
    }
  })

  const metadata = buildMetadataRows({
    tipo: 'Base Tratada de Validades',
    filtros,
    totalRegistros: data.length,
    origem: 'Base Atual (snapshot)',
  })

  return { data, headers, metadata }
}

export function downloadBaseTratadaValidadesXLSX(
  snapshot: Partial<BaseAtualSnapshot> & { validades?: ValidadeItem[] },
  filtros?: Record<string, unknown>,
): void {
  const { data, metadata } = buildBaseTratadaValidades(snapshot, filtros)
  if (data.length === 0) {
    throw new Error('Nenhum registro de validade para exportar.')
  }

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(data)
  ws['!cols'] = [
    { wch: 18 }, // Cliente/Marca
    { wch: 14 }, // Fornecedor
    { wch: 12 }, // Código Loja
    { wch: 28 }, // Nome Loja
    { wch: 32 }, // Loja (formatada)
    { wch: 16 }, // Rede
    { wch: 16 }, // Cidade
    { wch: 6 }, // UF
    { wch: 35 }, // Produto
    { wch: 12 }, // Quantidade
    { wch: 10 }, // Unidade
    { wch: 12 }, // Validade
    { wch: 14 }, // Dias p/Vencer
    { wch: 18 }, // Status Operacional
    { wch: 14 }, // Criticidade
    { wch: 16 }, // Realizado/Data Pesquisa
    { wch: 14 }, // Data Entrada
    { wch: 20 }, // Promotor
    { wch: 20 }, // Supervisor
    { wch: 24 }, // Origem/Arquivo
  ]

  XLSX.utils.book_append_sheet(wb, ws, 'Validades_Tratadas')
  appendMetadataSheet(wb, metadata)

  const fileName = `Diretoria_Validades_${getTimestampFileString()}.xlsx`
  XLSX.writeFile(wb, fileName)
}

export function downloadBaseTratadaValidadesCSV(
  snapshot: Partial<BaseAtualSnapshot> & { validades?: ValidadeItem[] },
  filtros?: Record<string, unknown>,
): void {
  const { data, headers } = buildBaseTratadaValidades(snapshot, filtros)
  if (data.length === 0) {
    throw new Error('Nenhum registro de validade para exportar.')
  }

  const csvContent = createCsvContent(headers, data as unknown as Record<string, unknown>[])
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const fileName = `Diretoria_Validades_${getTimestampFileString()}.csv`
  triggerBrowserDownload(blob, fileName)
}

// ---------------------------------------------------------------------------
// 2. BASE TRATADA DE RUPTURAS
// ---------------------------------------------------------------------------

export interface BaseTratadaRupturasRow {
  'Cliente/Marca': string
  'Código Loja': string
  'Nome Loja': string
  Loja: string
  Rede: string
  Cidade: string
  UF: string
  'Produto/Atividade': string
  'Código Produto': string
  Motivo: string
  Situação: string
  'Data Visita': string
  'Dias em Ruptura': number
  'Colaborador/Promotor': string
  Origem: string
  Escopo: string
  'Derivada?': string
  'Parent ID': string
}

export function buildBaseTratadaRupturas(
  snapshot: Partial<BaseAtualSnapshot> & { rupturas?: Ruptura[] },
  filtros?: Record<string, unknown>,
): {
  data: BaseTratadaRupturasRow[]
  headers: string[]
  metadata: Array<{ Campo: string; Valor: string | number }>
} {
  const headers = [
    'Cliente/Marca',
    'Código Loja',
    'Nome Loja',
    'Loja',
    'Rede',
    'Cidade',
    'UF',
    'Produto/Atividade',
    'Código Produto',
    'Motivo',
    'Situação',
    'Data Visita',
    'Dias em Ruptura',
    'Colaborador/Promotor',
    'Origem',
    'Escopo',
    'Derivada?',
    'Parent ID',
  ]

  const items = snapshot.rupturas || (snapshot as any).rupturasAtivas || []
  const data: BaseTratadaRupturasRow[] = items.map((r) => {
    const rawCodLoja = r.codigo_loja || ''
    const rawNomeLoja = r.nome_loja || ''
    const codLoja =
      extractStoreRealCode(rawCodLoja) || extractStoreRealCode(rawNomeLoja) || safeStr(rawCodLoja)
    const nomeLoja = extractStoreCleanName(rawNomeLoja) || safeStr(rawNomeLoja)
    const storeFormatted = formatStoreIdentity({ codigo_loja: codLoja, nome_loja: nomeLoja })
    const rede = (r as any).rede || deriveNetworkName(nomeLoja) || ''

    const isDerivada = (r as any).is_derived ? 'Sim' : 'Não'
    const parentId = safeStr((r as any).parent_occurrence_id || (r as any).parent_id || '')
    const productCode = safeStr((r as any).codigo_produto || (r as any).product_code || '')
    const escopo = safeStr((r as any).scope || ((r as any).is_derived ? 'derived_sku' : 'product'))

    return {
      'Cliente/Marca': safeStr(r.cliente || (r as any).marca || ''),
      'Código Loja': safeStr(codLoja),
      'Nome Loja': safeStr(nomeLoja),
      Loja: storeFormatted,
      Rede: safeStr(rede),
      Cidade: safeStr(r.cidade || (r as any).city || ''),
      UF: safeStr(r.uf || (r as any).estado || (r as any).state || ''),
      'Produto/Atividade': safeStr(r.produto || (r as any).atividade || ''),
      'Código Produto': productCode,
      Motivo: safeStr(r.motivo || ''),
      Situação: safeStr(r.situacao_atual || 'Ativo'),
      'Data Visita': fmtDateBR(r.data_visita),
      'Dias em Ruptura': typeof r.dias_em_ruptura === 'number' ? r.dias_em_ruptura : 0,
      'Colaborador/Promotor': safeStr(r.colaborador || ''),
      Origem: safeStr((r as any).origem || (r as any).arquivo_origem || 'TradePro'),
      Escopo: escopo,
      'Derivada?': isDerivada,
      'Parent ID': parentId,
    }
  })

  const metadata = buildMetadataRows({
    tipo: 'Base Tratada de Rupturas',
    filtros,
    totalRegistros: data.length,
    origem: 'Base Atual (snapshot)',
  })

  return { data, headers, metadata }
}

export function downloadBaseTratadaRupturasXLSX(
  snapshot: Partial<BaseAtualSnapshot> & { rupturas?: Ruptura[] },
  filtros?: Record<string, unknown>,
): void {
  const { data, metadata } = buildBaseTratadaRupturas(snapshot, filtros)
  if (data.length === 0) {
    throw new Error('Nenhum registro de ruptura para exportar.')
  }

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(data)
  ws['!cols'] = [
    { wch: 18 }, // Cliente/Marca
    { wch: 12 }, // Código Loja
    { wch: 28 }, // Nome Loja
    { wch: 32 }, // Loja (formatada)
    { wch: 16 }, // Rede
    { wch: 16 }, // Cidade
    { wch: 6 }, // UF
    { wch: 35 }, // Produto/Atividade
    { wch: 14 }, // Código Produto
    { wch: 22 }, // Motivo
    { wch: 12 }, // Situação
    { wch: 14 }, // Data Visita
    { wch: 16 }, // Dias em Ruptura
    { wch: 20 }, // Colaborador/Promotor
    { wch: 14 }, // Origem
    { wch: 16 }, // Escopo
    { wch: 10 }, // Derivada?
    { wch: 20 }, // Parent ID
  ]

  XLSX.utils.book_append_sheet(wb, ws, 'Rupturas_Tratadas')
  appendMetadataSheet(wb, metadata)

  const fileName = `Diretoria_Rupturas_${getTimestampFileString()}.xlsx`
  XLSX.writeFile(wb, fileName)
}

export function downloadBaseTratadaRupturasCSV(
  snapshot: Partial<BaseAtualSnapshot> & { rupturas?: Ruptura[] },
  filtros?: Record<string, unknown>,
): void {
  const { data, headers } = buildBaseTratadaRupturas(snapshot, filtros)
  if (data.length === 0) {
    throw new Error('Nenhum registro de ruptura para exportar.')
  }

  const csvContent = createCsvContent(headers, data as unknown as Record<string, unknown>[])
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const fileName = `Diretoria_Rupturas_${getTimestampFileString()}.csv`
  triggerBrowserDownload(blob, fileName)
}

// ---------------------------------------------------------------------------
// 3. PENDÊNCIAS DE AUDITORIA
// ---------------------------------------------------------------------------

export interface PendenciasAuditoriaRow {
  'Código Loja': string
  'Nome Loja': string
  Loja: string
  Marca: string
  Produto: string
  Quantidade: number
  'Validade Original': string
  Dias: number
  'Motivo de Isolamento': string
  'Status da Auditoria': string
  'Data Sinalização': string
  Observação: string
}

export function buildPendenciasAuditoria(
  snapshot: Partial<BaseAtualSnapshot> & {
    validades?: ValidadeItem[]
    auditoria_pendencias?: AuditoriaOcorrencia[]
  },
  filtros?: Record<string, unknown>,
): {
  data: PendenciasAuditoriaRow[]
  headers: string[]
  metadata: Array<{ Campo: string; Valor: string | number }>
} {
  const headers = [
    'Código Loja',
    'Nome Loja',
    'Loja',
    'Marca',
    'Produto',
    'Quantidade',
    'Validade Original',
    'Dias',
    'Motivo de Isolamento',
    'Status da Auditoria',
    'Data Sinalização',
    'Observação',
  ]

  // Se houver auditoria_pendencias em snapshot, usa; senão deriva das validades Vencidas da Base Atual
  const validades = snapshot.validades || []
  const auditItems = (snapshot as any).auditoria_pendencias as AuditoriaOcorrencia[] | undefined

  let data: PendenciasAuditoriaRow[] = []

  if (auditItems && auditItems.length > 0) {
    data = auditItems.map((a) => {
      const codLoja = extractStoreRealCode(a.codigoLoja) || safeStr(a.codigoLoja)
      const nomeLoja = extractStoreCleanName(a.loja) || safeStr(a.loja)
      const storeFormatted = formatStoreIdentity({ codigo_loja: codLoja, nome_loja: nomeLoja })

      return {
        'Código Loja': safeStr(codLoja),
        'Nome Loja': safeStr(nomeLoja),
        Loja: storeFormatted,
        Marca: safeStr((a as any).cliente || (a as any).marca || ''),
        Produto: safeStr(a.produto || ''),
        Quantidade: safeNum(a.quantidade, 0),
        'Validade Original': fmtDateBR(a.validadeEfetiva || (a as any).validade),
        Dias: typeof a.diasVencido === 'number' ? a.diasVencido : 0,
        'Motivo de Isolamento': safeStr(a.motivoAuditoria || 'Vencido'),
        'Status da Auditoria': safeStr(
          a.statusAuditoria || (a.sinalizadoCorrecao ? 'pendente' : 'aguardando'),
        ),
        'Data Sinalização': fmtDateBR(
          (a as any).dataSinalizacao || (a as any).updated || a.dataEntrada,
        ),
        Observação: safeStr((a as any).motivo || (a as any).observacao || ''),
      }
    })
  } else {
    // Derivar de validades com status Vencido ou diasRestantes <= 0
    const vencidos = validades.filter((v) => v.status === 'Vencido' || v.diasRestantes <= 0)
    data = vencidos.map((v) => {
      const codLoja = extractStoreRealCode(v.codigoLoja) || safeStr(v.codigoLoja)
      const nomeLoja = extractStoreCleanName(v.loja) || safeStr(v.loja)
      const storeFormatted = formatStoreIdentity({ codigo_loja: codLoja, nome_loja: nomeLoja })

      return {
        'Código Loja': safeStr(codLoja),
        'Nome Loja': safeStr(nomeLoja),
        Loja: storeFormatted,
        Marca: safeStr(v.cliente || (v as any).industria || ''),
        Produto: safeStr(v.product || ''),
        Quantidade: safeNum(v.quantidade ?? (v as any).estoque, 0),
        'Validade Original': fmtDateBR(v.validade),
        Dias: typeof v.diasRestantes === 'number' ? v.diasRestantes : 0,
        'Motivo de Isolamento': 'Vencido',
        'Status da Auditoria': safeStr((v as any).status_auditoria || 'aguardando'),
        'Data Sinalização': fmtDateBR((v as any).data_sinalizacao || v.dataEntrada),
        Observação: safeStr((v as any).motivo_auditoria || ''),
      }
    })
  }

  const metadata = buildMetadataRows({
    tipo: 'Pendências de Auditoria (Vencidos)',
    filtros,
    totalRegistros: data.length,
    origem: 'Base Atual (snapshot)',
  })

  return { data, headers, metadata }
}

export function downloadPendenciasAuditoriaXLSX(
  snapshot: Partial<BaseAtualSnapshot> & {
    validades?: ValidadeItem[]
    auditoria_pendencias?: AuditoriaOcorrencia[]
  },
  filtros?: Record<string, unknown>,
): void {
  const { data, metadata } = buildPendenciasAuditoria(snapshot, filtros)
  if (data.length === 0) {
    throw new Error('Nenhuma ocorrência de auditoria/vencidos para exportar.')
  }

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(data)
  ws['!cols'] = [
    { wch: 12 }, // Código Loja
    { wch: 28 }, // Nome Loja
    { wch: 32 }, // Loja
    { wch: 18 }, // Marca
    { wch: 35 }, // Produto
    { wch: 12 }, // Quantidade
    { wch: 16 }, // Validade Original
    { wch: 10 }, // Dias
    { wch: 22 }, // Motivo de Isolamento
    { wch: 18 }, // Status da Auditoria
    { wch: 16 }, // Data Sinalização
    { wch: 35 }, // Observação
  ]

  XLSX.utils.book_append_sheet(wb, ws, 'Auditoria_Pendencias')
  appendMetadataSheet(wb, metadata)

  const fileName = `Diretoria_Auditoria_${getTimestampFileString()}.xlsx`
  XLSX.writeFile(wb, fileName)
}

export function downloadPendenciasAuditoriaCSV(
  snapshot: Partial<BaseAtualSnapshot> & {
    validades?: ValidadeItem[]
    auditoria_pendencias?: AuditoriaOcorrencia[]
  },
  filtros?: Record<string, unknown>,
): void {
  const { data, headers } = buildPendenciasAuditoria(snapshot, filtros)
  if (data.length === 0) {
    throw new Error('Nenhuma ocorrência de auditoria/vencidos para exportar.')
  }

  const csvContent = createCsvContent(headers, data as unknown as Record<string, unknown>[])
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const fileName = `Diretoria_Auditoria_${getTimestampFileString()}.csv`
  triggerBrowserDownload(blob, fileName)
}

// ---------------------------------------------------------------------------
// 4. CONFRONTO RUPTURA × VALIDADE
// ---------------------------------------------------------------------------

export interface ConfrontoRupturaValidadeRow {
  Loja: string
  Marca: string
  Produto: string
  'Data Ruptura': string
  'Data Evidência Posterior': string
  'Dias até Evidência': number
  Quantidade: number
  'Match Method': string
  Confidence: string
  'Situação Shadow': string
  'Revisão Humana': string
}

export function buildConfrontoRupturaValidade(
  snapshot: Partial<BaseAtualSnapshot> & {
    rupturas?: Ruptura[]
    validades?: ValidadeItem[]
    crossEvidence?: CrossEvidence[]
  },
  filtros?: Record<string, unknown>,
): {
  data: ConfrontoRupturaValidadeRow[]
  headers: string[]
  metadata: Array<{ Campo: string; Valor: string | number }>
} {
  const headers = [
    'Loja',
    'Marca',
    'Produto',
    'Data Ruptura',
    'Data Evidência Posterior',
    'Dias até Evidência',
    'Quantidade',
    'Match Method',
    'Confidence',
    'Situação Shadow',
    'Revisão Humana',
  ]

  // Se houver snapshot.confronto / crossEvidence pré-carregado usamos, senão executamos a reconciliação pura
  let crossEvidences: CrossEvidence[] = snapshot.crossEvidence || (snapshot as any).confronto || []

  const valList = snapshot.validades || (snapshot as any).validadesAtivas || []
  const rupList = snapshot.rupturas || (snapshot as any).rupturasAtivas || []

  if (crossEvidences.length === 0 && rupList.length > 0 && valList.length > 0) {
    // Reconciliação direta em memória
    const valRecords: ValidadeRecord[] = valList.map((v) => ({
      id: v.id,
      cliente: v.cliente,
      fornecedor: v.industria,
      loja: v.loja,
      codigo_loja: v.codigoLoja,
      razao_social: v.loja,
      cidade: v.cidade,
      estado: v.uf,
      produto: v.product,
      cod_produto: v.sku,
      quantidade: v.quantidade ?? v.estoque,
      validade_efetiva: v.validade,
      realizado: (v as any).realizado,
      status: v.status,
    }))

    for (const r of rupList) {
      if (r.situacao_atual !== 'Ativo') continue
      const rupRecord: RupturaRecord = {
        id: r.id,
        cliente: r.cliente,
        nome_loja: r.nome_loja,
        codigo_loja: r.codigo_loja,
        cidade: r.cidade,
        estado: r.estado,
        produto: r.produto,
        cod_produto: r.codigo_cliente || (r as any).cod_produto,
        data_visita: r.data_visita,
        situacao_atual: r.situacao_atual,
        motivo: r.motivo,
      }

      const evidence = reconcileRuptureValidity(rupRecord, valRecords)
      if (evidence) {
        crossEvidences.push(evidence)
      }
    }
  }

  const data: ConfrontoRupturaValidadeRow[] = crossEvidences.map((item) => {
    const codLoja = extractStoreRealCode(item.store_code) || safeStr(item.store_code)
    const nomeLoja = extractStoreCleanName(item.store_name) || safeStr(item.store_name)
    const storeFormatted = formatStoreIdentity({ codigo_loja: codLoja, nome_loja: nomeLoja })

    const methodLabel =
      item.match_method === 'high_code_product'
        ? 'Código'
        : item.match_method === 'medium_exact_name'
          ? 'Nome Exato'
          : 'Inconclusivo'

    const confidenceLabel =
      item.confidence === 'high' ? 'Alta' : item.confidence === 'medium' ? 'Média' : 'Inconclusiva'

    const proposedStatusLabel =
      item.proposed_status === 'inferred_resolved'
        ? 'Resolvido Sugerido'
        : item.proposed_status === 'awaiting_review'
          ? 'Aguardando Revisão'
          : item.proposed_status === 'reopened'
            ? 'Reaberto'
            : 'Inconclusivo'

    const reviewStatusLabel =
      item.review_status === 'confirmed'
        ? 'Confirmado'
        : item.review_status === 'rejected'
          ? 'Rejeitado'
          : 'Pendente'

    return {
      Loja: storeFormatted,
      Marca: safeStr(item.client_or_brand || ''),
      Produto: safeStr(item.product_name || ''),
      'Data Ruptura': fmtDateBR(item.rupture_detected_at),
      'Data Evidência Posterior': fmtDateBR(item.stock_evidence_at),
      'Dias até Evidência': typeof item.resolution_days === 'number' ? item.resolution_days : 0,
      Quantidade: safeNum(item.quantity_found, 0),
      'Match Method': methodLabel,
      Confidence: confidenceLabel,
      'Situação Shadow': proposedStatusLabel,
      'Revisão Humana': reviewStatusLabel,
    }
  })

  const metadata = buildMetadataRows({
    tipo: 'Confronto Ruptura × Validade (Modo Shadow)',
    filtros,
    totalRegistros: data.length,
    origem: 'Base Atual (snapshot)',
    observacoes: 'Simulação em modo shadow — não altera a Base Atual de Rupturas nem de Validades.',
  })

  return { data, headers, metadata }
}

export function downloadConfrontoXLSX(
  snapshot: Partial<BaseAtualSnapshot> & {
    rupturas?: Ruptura[]
    validades?: ValidadeItem[]
    crossEvidence?: CrossEvidence[]
  },
  filtros?: Record<string, unknown>,
): void {
  const { data, metadata } = buildConfrontoRupturaValidade(snapshot, filtros)
  if (data.length === 0) {
    throw new Error('Nenhuma evidência de confronto para exportar.')
  }

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(data)
  ws['!cols'] = [
    { wch: 32 }, // Loja
    { wch: 18 }, // Marca
    { wch: 35 }, // Produto
    { wch: 14 }, // Data Ruptura
    { wch: 22 }, // Data Evidência Posterior
    { wch: 18 }, // Dias até Evidência
    { wch: 12 }, // Quantidade
    { wch: 16 }, // Match Method
    { wch: 14 }, // Confidence
    { wch: 20 }, // Situação Shadow
    { wch: 16 }, // Revisão Humana
  ]

  XLSX.utils.book_append_sheet(wb, ws, 'Confronto_Shadow')
  appendMetadataSheet(wb, metadata)

  const fileName = `Diretoria_Confronto_${getTimestampFileString()}.xlsx`
  XLSX.writeFile(wb, fileName)
}

export function downloadConfrontoCSV(
  snapshot: Partial<BaseAtualSnapshot> & {
    rupturas?: Ruptura[]
    validades?: ValidadeItem[]
    crossEvidence?: CrossEvidence[]
  },
  filtros?: Record<string, unknown>,
): void {
  const { data, headers } = buildConfrontoRupturaValidade(snapshot, filtros)
  if (data.length === 0) {
    throw new Error('Nenhuma evidência de confronto para exportar.')
  }

  const csvContent = createCsvContent(headers, data as unknown as Record<string, unknown>[])
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const fileName = `Diretoria_Confronto_${getTimestampFileString()}.csv`
  triggerBrowserDownload(blob, fileName)
}

// ---------------------------------------------------------------------------
// 5. CENTRAL ESTRATÉGICA (4 Abas + Metadados)
// ---------------------------------------------------------------------------

export interface CentralEstrategicaData {
  lojasCriticas: Array<{
    Rank: number
    'Código Loja': string
    'Nome Loja': string
    Loja: string
    Cidade: string
    UF: string
    'Score de Risco': number
    Severidade: string
    'Carga de Risco (Pts)': number
    'Validades em Risco (Qtd Itens)': number
    'Volume Validades (Un)': number
    'Rupturas Ativas': number
    'Rupturas Específicas': number
    'Rupturas Derivadas': number
  }>
  produtosCriticos: Array<{
    Rank: number
    Produto: string
    'Código Produto': string
    Marca: string
    'Score de Risco': number
    Severidade: string
    'Carga de Risco (Pts)': number
    'Lojas com Validade em Risco': number
    'Lojas com Ruptura Ativa': number
  }>
  marcasCriticas: Array<{
    Rank: number
    Marca: string
    'Score de Risco': number
    Severidade: string
    'Carga de Risco (Pts)': number
    'Validades em Risco (Qtd Itens)': number
    'Volume Validades (Un)': number
    'Lojas com Validade Crítica (1-7d)': number
    'Rupturas Ativas': number
    'Lojas com Ruptura': number
  }>
  acoesRecomendadas: Array<{
    Regra: string
    Recomendação: string
    'Entidade Alvo': string
    'Severidade Alvo': string
    'Evidências Formatadas': string
  }>
}

export function buildCentralEstrategica(
  snapshot: Partial<BaseAtualSnapshot> & {
    validades?: ValidadeItem[]
    rupturas?: Ruptura[]
  },
): {
  data: CentralEstrategicaData
  metadata: Array<{ Campo: string; Valor: string | number }>
} {
  const validades = snapshot.validades || (snapshot as any).validadesAtivas || []
  const rupturas = snapshot.rupturas || (snapshot as any).rupturasAtivas || []

  // 1. Expansão de rupturas totais
  const { expanded } = expandBrandTotalRuptures(rupturas, validades)

  // 2. Extrair lojas únicas
  const storeCodesMap = new Map<string, string>()
  for (const v of validades) {
    const sCode = (v.codigoLoja || (v as any).codigo_loja || v.loja || '').trim()
    if (sCode) storeCodesMap.set(sCode, v.loja || v.cliente || `Loja ${sCode}`)
  }
  for (const r of rupturas) {
    const sCode = (r.codigo_loja || r.nome_loja || '').trim()
    if (sCode) storeCodesMap.set(sCode, r.nome_loja || `Loja ${sCode}`)
  }

  const lojasScores = Array.from(storeCodesMap.keys())
    .map((code) => computeStoreRiskScore(code, validades, rupturas, expanded))
    .sort((a, b) => b.score - a.score || b.rawPoints - a.rawPoints)

  // 3. Extrair produtos únicos
  const productNames = new Set<string>()
  for (const v of validades) if (v.product) productNames.add(v.product)
  for (const r of rupturas) if (r.produto) productNames.add(r.produto)
  for (const d of expanded) if (d.productName) productNames.add(d.productName)

  const produtosScores = Array.from(productNames)
    .map((prod) => computeProductRiskScore(prod, validades, rupturas, expanded))
    .sort((a, b) => b.score - a.score || b.rawPoints - a.rawPoints)

  // 4. Extrair marcas únicas
  const brandNames = new Set<string>()
  for (const v of validades) {
    const b = v.cliente || (v as any).industria
    if (b) brandNames.add(b)
  }
  for (const r of rupturas) {
    if (r.cliente) brandNames.add(r.cliente)
  }

  const marcasScores = Array.from(brandNames)
    .map((brand) => computeBrandRiskScore(brand, validades, rupturas))
    .sort((a, b) => b.score - a.score || b.rawPoints - a.rawPoints)

  // 5. Ações recomendadas
  const actions = generateRecommendedActions(lojasScores, produtosScores, marcasScores, validades)

  const lojasCriticas = lojasScores.map((l, idx) => {
    const codLoja = extractStoreRealCode(l.storeCode) || safeStr(l.storeCode)
    const nomeLoja = extractStoreCleanName(l.storeName) || safeStr(l.storeName)
    const storeFormatted = formatStoreIdentity({ codigo_loja: codLoja, nome_loja: nomeLoja })

    return {
      Rank: idx + 1,
      'Código Loja': safeStr(codLoja),
      'Nome Loja': safeStr(nomeLoja),
      Loja: storeFormatted,
      Cidade: safeStr(l.city || ''),
      UF: safeStr(l.state || ''),
      'Score de Risco': l.score,
      Severidade: l.severity,
      'Carga de Risco (Pts)': l.rawPoints,
      'Validades em Risco (Qtd Itens)': l.validadesCount,
      'Volume Validades (Un)': l.validadesQuantityInRisk,
      'Rupturas Ativas':
        l.rupturasSpecificCount + l.rupturasDerivedCount + l.rupturasTotalUnresolvedCount,
      'Rupturas Específicas': l.rupturasSpecificCount,
      'Rupturas Derivadas': l.rupturasDerivedCount,
    }
  })

  const produtosCriticos = produtosScores.map((p, idx) => ({
    Rank: idx + 1,
    Produto: safeStr(p.productName),
    'Código Produto': safeStr(p.productCode || ''),
    Marca: safeStr(p.brand || ''),
    'Score de Risco': p.score,
    Severidade: p.severity,
    'Carga de Risco (Pts)': p.rawPoints,
    'Lojas com Validade em Risco': p.storesWithValidadeCount,
    'Lojas com Ruptura Ativa': p.storesWithRuptureCount,
  }))

  const marcasCriticas = marcasScores.map((m, idx) => ({
    Rank: idx + 1,
    Marca: safeStr(m.brand),
    'Score de Risco': m.score,
    Severidade: m.severity,
    'Carga de Risco (Pts)': m.rawPoints,
    'Validades em Risco (Qtd Itens)': m.validadesCount,
    'Volume Validades (Un)': m.validadesQuantityInRisk,
    'Lojas com Validade Crítica (1-7d)': m.validadesCriticalStoresCount,
    'Rupturas Ativas': m.rupturasCount,
    'Lojas com Ruptura': m.storesWithRuptureCount,
  }))

  const acoesRecomendadas = actions.map((act) => {
    const evidenceEntries = Object.entries(act.evidence || {}).map(([k, v]) => {
      const displayKey =
        k === 'store_name'
          ? 'Loja'
          : k === 'store_code'
            ? 'Cód. Loja'
            : k === 'product_name'
              ? 'Produto'
              : k === 'brand'
                ? 'Marca'
                : k === 'quantity'
                  ? 'Qtd'
                  : k === 'days_remaining'
                    ? 'Dias rest.'
                    : k === 'days_in_rupture'
                      ? 'Dias ruptura'
                      : k === 'affected_stores_count'
                        ? 'Lojas afetadas'
                        : k
      return `${displayKey}: ${safeStr(v)}`
    })

    const targetEntity =
      (act as any).target_entity ||
      act.evidence?.store_name ||
      act.evidence?.product_name ||
      act.evidence?.brand ||
      'Geral'

    const severityAlvo = (act as any).severity || 'Crítico'

    return {
      Regra: safeStr(act.rule_id),
      Recomendação: safeStr(act.action),
      'Entidade Alvo': safeStr(targetEntity),
      'Severidade Alvo': safeStr(severityAlvo),
      'Evidências Formatadas': evidenceEntries.join(' | '),
    }
  })

  const metadata = buildMetadataRows({
    tipo: `Central Estratégica (${RISK_MODEL_VERSION})`,
    totalRegistros:
      lojasCriticas.length +
      produtosCriticos.length +
      marcasCriticas.length +
      acoesRecomendadas.length,
    origem: 'Base Atual (snapshot)',
    observacoes: `Modelo de Risco Operacional ${RISK_MODEL_VERSION} consolidando validades, rupturas ativas e ações prioritárias em 4 abas.`,
  })

  return {
    data: {
      lojasCriticas,
      produtosCriticos,
      marcasCriticas,
      acoesRecomendadas,
    },
    metadata,
  }
}

export function downloadCentralEstrategicaXLSX(
  snapshot: Partial<BaseAtualSnapshot> & {
    validades?: ValidadeItem[]
    rupturas?: Ruptura[]
  },
): void {
  const { data, metadata } = buildCentralEstrategica(snapshot)

  const total =
    data.lojasCriticas.length +
    data.produtosCriticos.length +
    data.marcasCriticas.length +
    data.acoesRecomendadas.length

  if (total === 0) {
    throw new Error('Nenhum dado estratégico disponível para exportar.')
  }

  const wb = XLSX.utils.book_new()

  // 1. Lojas Críticas
  const wsLojas = XLSX.utils.json_to_sheet(data.lojasCriticas)
  wsLojas['!cols'] = [
    { wch: 6 }, // Rank
    { wch: 12 }, // Código Loja
    { wch: 28 }, // Nome Loja
    { wch: 32 }, // Loja
    { wch: 16 }, // Cidade
    { wch: 6 }, // UF
    { wch: 14 }, // Score de Risco
    { wch: 12 }, // Severidade
    { wch: 20 }, // Carga de Risco (Pts)
    { wch: 26 }, // Validades em Risco
    { wch: 20 }, // Volume Validades
    { wch: 14 }, // Rupturas Ativas
    { wch: 20 }, // Rupturas Específicas
    { wch: 18 }, // Rupturas Derivadas
  ]
  XLSX.utils.book_append_sheet(wb, wsLojas, 'Lojas_Criticas')

  // 2. Produtos Críticos
  const wsProdutos = XLSX.utils.json_to_sheet(data.produtosCriticos)
  wsProdutos['!cols'] = [
    { wch: 6 }, // Rank
    { wch: 35 }, // Produto
    { wch: 14 }, // Código Produto
    { wch: 18 }, // Marca
    { wch: 14 }, // Score de Risco
    { wch: 12 }, // Severidade
    { wch: 20 }, // Carga de Risco (Pts)
    { wch: 26 }, // Lojas com Validade em Risco
    { wch: 24 }, // Lojas com Ruptura Ativa
  ]
  XLSX.utils.book_append_sheet(wb, wsProdutos, 'Produtos_Criticos')

  // 3. Marcas Críticas
  const wsMarcas = XLSX.utils.json_to_sheet(data.marcasCriticas)
  wsMarcas['!cols'] = [
    { wch: 6 }, // Rank
    { wch: 22 }, // Marca
    { wch: 14 }, // Score de Risco
    { wch: 12 }, // Severidade
    { wch: 20 }, // Carga de Risco (Pts)
    { wch: 26 }, // Validades em Risco
    { wch: 20 }, // Volume Validades
    { wch: 30 }, // Lojas com Validade Crítica
    { wch: 14 }, // Rupturas Ativas
    { wch: 18 }, // Lojas com Ruptura
  ]
  XLSX.utils.book_append_sheet(wb, wsMarcas, 'Marcas_Criticas')

  // 4. Ações Recomendadas
  const wsAcoes = XLSX.utils.json_to_sheet(data.acoesRecomendadas)
  wsAcoes['!cols'] = [
    { wch: 16 }, // Regra
    { wch: 45 }, // Recomendação
    { wch: 28 }, // Entidade Alvo
    { wch: 16 }, // Severidade Alvo
    { wch: 50 }, // Evidências Formatadas
  ]
  XLSX.utils.book_append_sheet(wb, wsAcoes, 'Acoes_Recomendadas')

  // 5. Metadados
  appendMetadataSheet(wb, metadata)

  const fileName = `Diretoria_Central_Estrategica_${getTimestampFileString()}.xlsx`
  XLSX.writeFile(wb, fileName)
}

// ---------------------------------------------------------------------------
// 6. HISTÓRICO DE IMPORTAÇÕES
// ---------------------------------------------------------------------------

export interface HistoricoImportacoesRow {
  Data: string
  Tipo: string
  Arquivo: string
  'Hash (abreviado)': string
  Status: string
  Recebidos: number
  Persistidos: number
  'Ignorados/Duplicados': number
  Erros: number
  Usuário: string
}

export function buildHistoricoImportacoes(
  snapshot: Partial<BaseAtualSnapshot> & {
    importHistory?: (ImportHistoryItem | ImportHistoryExportItem)[]
  },
  errorsList?: Array<{
    linha: number | string
    chave: string
    etapa: string
    motivo: string
    codigo_http: string | number
    tentativas: number
  }>,
): {
  data: HistoricoImportacoesRow[]
  headers: string[]
  metadata: Array<{ Campo: string; Valor: string | number }>
  errorsData?: Array<{
    Linha: number | string
    Chave: string
    Etapa: string
    Motivo: string
    'Código HTTP': string | number
    Tentativas: number
  }>
} {
  const headers = [
    'Data',
    'Tipo',
    'Arquivo',
    'Hash (abreviado)',
    'Status',
    'Recebidos',
    'Persistidos',
    'Ignorados/Duplicados',
    'Erros',
    'Usuário',
  ]

  const historyItems = ((snapshot as any).importHistory ||
    (snapshot as any).history ||
    []) as ImportHistoryExportItem[]

  const data: HistoricoImportacoesRow[] = historyItems.map((h) => {
    const rawHash = safeStr(h.file_hash || (h as any).hash || '')
    const hashAbbrev =
      rawHash.length > 12 ? `${rawHash.slice(0, 8)}...${rawHash.slice(-4)}` : rawHash || '—'
    const tipo = safeStr(h.tipo || (h as any).arquivo_tipo || 'validades')
    const status = safeStr(h.status || 'success')

    const recebidos = safeNum(
      h.total_rows_read ?? h.total_rows ?? h.imported_rows + h.skipped_rows,
      0,
    )
    const persistidos = safeNum(h.imported_rows, 0)
    const ignorados = safeNum(h.skipped_rows, 0)
    const erros = safeNum(
      h.error_rows ?? (h as any).total_rows_invalid ?? (status === 'failed' ? 1 : 0),
      0,
    )

    return {
      Data: fmtDateBR(h.created || (h as any).created_at),
      Tipo: tipo === 'rupturas' ? 'Rupturas' : 'Validades',
      Arquivo: safeStr(h.file_name || 'importacao.xlsx'),
      'Hash (abreviado)': hashAbbrev,
      Status: status,
      Recebidos: recebidos,
      Persistidos: persistidos,
      'Ignorados/Duplicados': ignorados,
      Erros: erros,
      Usuário: safeStr((h as any).user_email || (h as any).usuario || 'Sistema'),
    }
  })

  const metadata = buildMetadataRows({
    tipo: 'Histórico de Importações',
    totalRegistros: data.length,
    origem: 'Base Atual (snapshot)',
  })

  let errorsData:
    | Array<{
        Linha: number | string
        Chave: string
        Etapa: string
        Motivo: string
        'Código HTTP': string | number
        Tentativas: number
      }>
    | undefined

  if (errorsList && errorsList.length > 0) {
    errorsData = errorsList.map((e) => ({
      Linha: e.linha,
      Chave: safeStr(e.chave),
      Etapa: safeStr(e.etapa),
      Motivo: safeStr(e.motivo),
      'Código HTTP': e.codigo_http,
      Tentativas: e.tentativas,
    }))
  }

  return { data, headers, metadata, errorsData }
}

export function downloadHistoricoImportacoesXLSX(
  snapshot: Partial<BaseAtualSnapshot> & {
    importHistory?: (ImportHistoryItem | ImportHistoryExportItem)[]
  },
  errorsList?: Array<{
    linha: number | string
    chave: string
    etapa: string
    motivo: string
    codigo_http: string | number
    tentativas: number
  }>,
): void {
  const { data, metadata, errorsData } = buildHistoricoImportacoes(snapshot, errorsList)
  if (data.length === 0) {
    throw new Error('Nenhum registro de histórico de importações para exportar.')
  }

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(data)
  ws['!cols'] = [
    { wch: 16 }, // Data
    { wch: 12 }, // Tipo
    { wch: 32 }, // Arquivo
    { wch: 18 }, // Hash
    { wch: 14 }, // Status
    { wch: 12 }, // Recebidos
    { wch: 12 }, // Persistidos
    { wch: 20 }, // Ignorados/Duplicados
    { wch: 10 }, // Erros
    { wch: 22 }, // Usuário
  ]

  XLSX.utils.book_append_sheet(wb, ws, 'Historico_Importacoes')

  if (errorsData && errorsData.length > 0) {
    const wsErrors = XLSX.utils.json_to_sheet(errorsData)
    wsErrors['!cols'] = [
      { wch: 10 }, // Linha
      { wch: 32 }, // Chave
      { wch: 16 }, // Etapa
      { wch: 50 }, // Motivo
      { wch: 14 }, // Código HTTP
      { wch: 12 }, // Tentativas
    ]
    XLSX.utils.book_append_sheet(wb, wsErrors, 'Erros_Importacao')
  }

  appendMetadataSheet(wb, metadata)

  const fileName = `Diretoria_Historico_Importacoes_${getTimestampFileString()}.xlsx`
  XLSX.writeFile(wb, fileName)
}

export function downloadHistoricoImportacoesCSV(
  snapshot: Partial<BaseAtualSnapshot> & {
    importHistory?: (ImportHistoryItem | ImportHistoryExportItem)[]
  },
): void {
  const { data, headers } = buildHistoricoImportacoes(snapshot)
  if (data.length === 0) {
    throw new Error('Nenhum registro de histórico de importações para exportar.')
  }

  const csvContent = createCsvContent(headers, data as unknown as Record<string, unknown>[])
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const fileName = `Diretoria_Historico_Importacoes_${getTimestampFileString()}.csv`
  triggerBrowserDownload(blob, fileName)
}
