/**
 * Pipeline de Rupturas — módulo paralelo ao `tradeProPipeline.ts` de Validades.
 *
 * Lê exportações Excel do TradePro (aba de Rupturas), mapeia as 12 colunas
 * aproveitadas, valida, padroniza o motivo, extrai o código da loja, filtra
 * últimos 90 dias, deduplica por `dedup_key` (codigo_loja|produto|cliente)
 * selecionando a maior `data_visita`, e persiste em lotes nas collections
 * `rupturas_base` + `rupturas_historico`, controlando a importação em
 * `rupturas_imports`.
 *
 * Funções puras (parse/validate/normalize/keys/dedup/filter) + orquestração
 * `processRupturasImport` que persiste via cliente PocketBase.
 */
import * as XLSX from 'xlsx'
import pb from '@/lib/pocketbase/client'
import { parseDate, parseString, parseTextId } from '@/lib/import/excelMapper'
import { dataAtualSaoPaulo } from '@/lib/data/tradeProPipeline'
import type {
  Ruptura,
  RupturaMotivo,
  RupturaSituacao,
  RupturasFilters,
  RupturasKpis,
  RupturasImportResult,
} from '@/types'

// ---------------------------------------------------------------------------
// Tipos auxiliares
// ---------------------------------------------------------------------------

/** Linha parsed do Excel de Rupturas (12 colunas aproveitadas). */
export interface ParsedRupturaRow {
  data_visita: string | null
  produto: string
  motivo: string
  nome_loja: string
  cnpj_loja: string
  cidade: string
  estado: string
  codigo_cliente: string
  cliente: string
  categoria: string
  observacao: string
  colaborador: string
  /** Número da linha no arquivo (1-based, exclui cabeçalho). */
  source_row: number
}

export interface InvalidRow {
  row: ParsedRupturaRow
  motivo: string
}

// ---------------------------------------------------------------------------
// Normalização de cabeçalhos
// ---------------------------------------------------------------------------

function normalizeHeader(h: string): string {
  return h
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

/** Aliases de cabeçalho por campo interno (colunas aproveitadas do TradePro). */
const RUPTURA_COLUMN_ALIASES: Record<keyof Omit<ParsedRupturaRow, 'source_row'>, string[]> = {
  data_visita: ['data visita', 'data da visita', 'data', 'dt visita'],
  produto: ['atividade', 'produto', 'atividade/produto'],
  motivo: ['motivo', 'tipo ruptura'],
  nome_loja: ['razao social', 'razão social', 'razao_social', 'loja'],
  cnpj_loja: ['cnpj', 'cnpj loja', 'cnpj_loja'],
  cidade: ['cidade'],
  estado: ['estado', 'uf'],
  codigo_cliente: [
    'cod. cliente',
    'codigo cliente',
    'cod cliente',
    'cod.cliente',
    'cód. cliente',
    'código cliente',
    'cód cliente',
    'cod_cliente',
  ],
  cliente: ['cliente', 'fornecedor'],
  categoria: ['categoria'],
  observacao: ['observacao', 'observação', 'obs', 'observ'],
  colaborador: ['colaborador', 'promotor'],
}

/** Resolve o valor de um campo interno a partir de uma linha, usando aliases. */
function resolveField(
  row: Record<string, unknown>,
  field: keyof Omit<ParsedRupturaRow, 'source_row'>,
): unknown {
  const aliases = RUPTURA_COLUMN_ALIASES[field]
  const keys = Object.keys(row)
  for (const alias of aliases) {
    const normAlias = normalizeHeader(alias)
    for (const k of keys) {
      if (normalizeHeader(k) === normAlias) return row[k]
    }
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Seleção de aba
// ---------------------------------------------------------------------------

const RUPTURA_SHEET_HINTS = ['ruptura', 'rupturas']

function selectRupturaSheet(workbook: XLSX.WorkBook): string {
  const names = workbook.SheetNames.map((n) => normalizeHeader(n))
  // 1. aba com "ruptura"
  const idx = names.findIndex((n) => RUPTURA_SHEET_HINTS.some((h) => n.includes(h)))
  if (idx >= 0) return workbook.SheetNames[idx]
  // 2. primeira aba
  return workbook.SheetNames[0] ?? ''
}

// ---------------------------------------------------------------------------
// parseRupturasExcel
// ---------------------------------------------------------------------------

export async function parseRupturasExcel(file: File): Promise<ParsedRupturaRow[]> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
  const sheetName = selectRupturaSheet(workbook)
  if (!sheetName) throw new Error('Nenhuma aba encontrada no arquivo de Rupturas.')

  const worksheet = workbook.Sheets[sheetName]
  const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    raw: true,
    defval: '',
    blankrows: false,
  })

  return jsonRows.map((row, i) => ({
    data_visita: parseDate(resolveField(row, 'data_visita')),
    produto: parseString(resolveField(row, 'produto')),
    motivo: parseString(resolveField(row, 'motivo')),
    nome_loja: parseString(resolveField(row, 'nome_loja')),
    cnpj_loja: parseTextId(resolveField(row, 'cnpj_loja')),
    cidade: parseString(resolveField(row, 'cidade')),
    estado: parseString(resolveField(row, 'estado')),
    codigo_cliente: parseTextId(resolveField(row, 'codigo_cliente')),
    cliente: parseString(resolveField(row, 'cliente')),
    categoria: parseString(resolveField(row, 'categoria')),
    observacao: parseString(resolveField(row, 'observacao')),
    colaborador: parseString(resolveField(row, 'colaborador')),
    source_row: i + 2, // +2: linha 1 é cabeçalho
  }))
}

// ---------------------------------------------------------------------------
// validateRupturasRows
// ---------------------------------------------------------------------------

export function validateRupturasRows(rows: ParsedRupturaRow[]): {
  valid: ParsedRupturaRow[]
  invalid: InvalidRow[]
} {
  const valid: ParsedRupturaRow[] = []
  const invalid: InvalidRow[] = []

  for (const row of rows) {
    const motivos: string[] = []
    if (!row.data_visita) motivos.push('Data Visita ausente ou inválida')
    if (!row.produto) motivos.push('Produto (Atividade) ausente')
    if (!row.nome_loja) motivos.push('Razão Social (nome_loja) ausente')
    if (!row.motivo) motivos.push('Motivo ausente')

    if (motivos.length > 0) {
      invalid.push({ row, motivo: motivos.join('; ') })
    } else {
      valid.push(row)
    }
  }

  return { valid, invalid }
}

// ---------------------------------------------------------------------------
// normalizeRupturaMotivo
// ---------------------------------------------------------------------------

export function normalizeRupturaMotivo(motivo: string): RupturaMotivo {
  const m = (motivo || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  if (m.includes('RUPTURA TOTAL')) return 'Ruptura Total'
  if (m.includes('ZERADO') || m.includes('SEM ESTOQUE MINIMO') || m.includes('SEM ESTOQUE MÍNIMO'))
    return 'Sem Estoque Mínimo'
  if (m.includes('ESTOQUE VIRTUAL')) return 'Estoque Virtual'
  // fallback seguro
  return 'Ruptura Total'
}

// ---------------------------------------------------------------------------
// extractStoreCode
// ---------------------------------------------------------------------------

/**
 * Extrai o código numérico do início da Razão Social.
 * Ex.: "085 - FORT ATACADISTA JARAGUÁ DO SUL" → "085".
 * Preserva zeros à esquerda.
 */
export function extractStoreCode(razaoSocial: string): string {
  const rs = (razaoSocial || '').trim()
  if (!rs) return ''
  // Código numérico no início (preserva zeros à esquerda)
  const m = rs.match(/^(\d+)/)
  if (m) return m[1]
  // Fallback: token antes do primeiro separador " - " / " – "
  const m2 = rs.match(/^([^-–]+?)[\s]*[-–]/)
  if (m2) return m2[1].trim()
  return ''
}

// ---------------------------------------------------------------------------
// Chaves
// ---------------------------------------------------------------------------

export function buildRupturaOperationalKey(
  codigo_loja: string,
  produto: string,
  data_visita: string,
): string {
  return `${codigo_loja}|${produto}|${data_visita}`
}

export function buildRupturaDedupKey(
  codigo_loja: string,
  produto: string,
  cliente: string,
): string {
  return `${codigo_loja}|${produto}|${cliente}`
}

// ---------------------------------------------------------------------------
// filterLast90Days
// ---------------------------------------------------------------------------

const JANELA_RUPTURAS_DIAS = 90

export function filterLast90Days<T extends { data_visita: string | null }>(rows: T[]): T[] {
  const hoje = dataAtualSaoPaulo()
  const limite = new Date(hoje + 'T00:00:00Z')
  limite.setUTCDate(limite.getUTCDate() - JANELA_RUPTURAS_DIAS)
  const limiteISO = limite.toISOString().slice(0, 10)

  return rows.filter((r) => !!r.data_visita && r.data_visita >= limiteISO)
}

// ---------------------------------------------------------------------------
// dedupRupturas
// ---------------------------------------------------------------------------

/**
 * Agrupa por `dedup_key` (codigo_loja|produto|cliente) e seleciona, em cada
 * grupo, a linha com a MAIOR `data_visita`. As demais são descartadas.
 */
export function dedupRupturas<T extends { nome_loja: string; produto: string; cliente: string; data_visita: string | null }>(rows: T[]): T[] {
  const grupos = new Map<string, T[]>()

  for (const row of rows) {
    const codigo_loja = extractStoreCode(row.nome_loja)
    const dedup_key = buildRupturaDedupKey(codigo_loja, row.produto, row.cliente)
    const arr = grupos.get(dedup_key)
    if (arr) arr.push(row)
    else grupos.set(dedup_key, [row])
  }

  const selecionados: T[] = []
  for (const regs of grupos.values()) {
    const ordenados = [...regs].sort((a, b) => {
      const da = a.data_visita ?? ''
      const db = b.data_visita ?? ''
      if (da === db) return 0
      return da < db ? 1 : -1 // desc — maior data_visita primeiro
    })
    selecionados.push(ordenados[0])
  }

  return selecionados
}

// ---------------------------------------------------------------------------
// Conversão Ruptura (registro persistido → modelo de domínio)
// ---------------------------------------------------------------------------

/** Converte um registro do PocketBase (snake_case) em `Ruptura`. */
export function toRuptura(rec: Record<string, unknown>): Ruptura {
  const situacao = (rec.situacao_atual as RupturaSituacao) || 'Ativo'
  return {
    id: (rec.id as string) || '',
    produto: (rec.produto as string) || '',
    motivo: (rec.motivo as RupturaMotivo) || 'Ruptura Total',
    codigo_loja: (rec.codigo_loja as string) || '',
    nome_loja: (rec.nome_loja as string) || '',
    cnpj_loja: (rec.cnpj_loja as string) || '',
    cidade: (rec.cidade as string) || '',
    estado: (rec.estado as string) || '',
    codigo_cliente: (rec.codigo_cliente as string) || '',
    cliente: (rec.cliente as string) || '',
    colaborador: (rec.colaborador as string) || '',
    categoria: (rec.categoria as string) || '',
    observacao: (rec.observacao as string) || '',
    data_visita: (rec.data_visita as string) || '',
    data_entrada: (rec.data_entrada as string) || (rec.data_visita as string) || '',
    ultima_aparicao: (rec.ultima_aparicao as string) || (rec.data_visita as string) || '',
    situacao_atual: situacao,
    operational_key: (rec.operational_key as string) || '',
    dedup_key: (rec.dedup_key as string) || '',
    source_import_id: (rec.source_import_id as string) || '',
    source_row: typeof rec.source_row === 'number' ? rec.source_row : Number(rec.source_row) || 0,
  }
}

/** Aplica `RupturasFilters` sobre uma lista de `Ruptura` já carregada. */
export function applyRupturasFilters(rows: Ruptura[], filters?: RupturasFilters): Ruptura[] {
  if (!filters) return rows
  let items = [...rows]

  if (filters.search) {
    const q = filters.search.trim().toLowerCase()
    items = items.filter(
      (r) =>
        r.produto.toLowerCase().includes(q) ||
        r.nome_loja.toLowerCase().includes(q) ||
        r.cliente.toLowerCase().includes(q),
    )
  }
  if (filters.loja) items = items.filter((r) => r.codigo_loja === filters.loja)
  if (filters.motivo) items = items.filter((r) => r.motivo === filters.motivo)
  if (filters.cliente) items = items.filter((r) => r.cliente === filters.cliente)
  if (filters.situacao) items = items.filter((r) => r.situacao_atual === filters.situacao)
  if (filters.dataInicio) {
    items = items.filter((r) => r.data_visita && r.data_visita >= filters.dataInicio!)
  }
  if (filters.dataFim) {
    items = items.filter((r) => r.data_visita && r.data_visita <= filters.dataFim!)
  }

  return items
}

// ---------------------------------------------------------------------------
// Cálculo de KPIs (puro) — usado pelo adapter
// ---------------------------------------------------------------------------

/**
 * Calcula a tendência semana-a-semana contando eventos por data_visita:
 *   - atual: eventos nos últimos 7 dias (hoje-6 .. hoje)
 *   - anterior: eventos nos 7 dias anteriores (hoje-13 .. hoje-7)
 *   - variacao: percentual (atual-anterior)/anterior, com convenção de sinais
 *     (-100 quando anterior=0 e atual>0 → up; ambos 0 → stable).
 *
 * Usa a janela America/Sao_Paulo para consistência com o resto do pipeline.
 */
export function computeRupturasTendencia(records: Ruptura[]): RupturasKpis['tendencia'] {
  const hoje = dataAtualSaoPaulo()
  const hojeTs = new Date(hoje + 'T00:00:00Z').getTime()
  const DIA = 86400000

  let atual = 0
  let anterior = 0
  for (const r of records) {
    if (!r.data_visita) continue
    const t = new Date(r.data_visita + 'T00:00:00Z').getTime()
    if (isNaN(t)) continue
    const diff = hojeTs - t
    if (diff < 0) continue // futuro — ignora
    const dias = Math.floor(diff / DIA)
    if (dias <= 6) atual++
    else if (dias <= 13) anterior++
  }

  let variacao = 0
  let direcao: 'up' | 'down' | 'stable' = 'stable'
  if (anterior === 0) {
    if (atual > 0) {
      variacao = 100
      direcao = 'up'
    } else {
      variacao = 0
      direcao = 'stable'
    }
  } else {
    variacao = Math.round(((atual - anterior) / anterior) * 100)
    if (variacao > 0) direcao = 'up'
    else if (variacao < 0) direcao = 'down'
    else direcao = 'stable'
  }

  return { direcao, variacao, atual, anterior }
}

export function computeRupturasKpis(records: Ruptura[]): RupturasKpis {
  const ativas = records.filter((r) => r.situacao_atual === 'Ativo')

  const porMotivo = {
    'Ruptura Total': 0,
    'Sem Estoque Mínimo': 0,
    'Estoque Virtual': 0,
  } as RupturasKpis['porMotivo']
  for (const r of ativas) {
    if (r.motivo === 'Ruptura Total') porMotivo['Ruptura Total']++
    else if (r.motivo === 'Sem Estoque Mínimo') porMotivo['Sem Estoque Mínimo']++
    else if (r.motivo === 'Estoque Virtual') porMotivo['Estoque Virtual']++
  }

  // Top 5 lojas
  const lojasMap = new Map<string, { codigo_loja: string; nome_loja: string; total: number }>()
  for (const r of ativas) {
    const key = r.codigo_loja || r.nome_loja || '—'
    const cur = lojasMap.get(key) ?? {
      codigo_loja: r.codigo_loja,
      nome_loja: r.nome_loja,
      total: 0,
    }
    cur.total++
    lojasMap.set(key, cur)
  }
  const topLojas = [...lojasMap.values()].sort((a, b) => b.total - a.total).slice(0, 5)

  // Top 5 produtos
  const prodMap = new Map<string, number>()
  for (const r of ativas) {
    const key = r.produto || '—'
    prodMap.set(key, (prodMap.get(key) ?? 0) + 1)
  }
  const topProdutos = [...prodMap.entries()]
    .map(([produto, total]) => ({ produto, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5)

  // Top 5 clientes/fornecedores
  const cliMap = new Map<string, number>()
  for (const r of ativas) {
    const key = r.cliente || '—'
    cliMap.set(key, (cliMap.get(key) ?? 0) + 1)
  }
  const topClientes = [...cliMap.entries()]
    .map(([cliente, total]) => ({ cliente, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5)

  // Tendência semana-a-semana (eventos por data_visita)
  const tendencia = computeRupturasTendencia(records)

  return {
    totalAtivas: ativas.length,
    porMotivo,
    topLojas,
    topProdutos,
    topClientes,
    tendencia,
  }
}

// ---------------------------------------------------------------------------
// Cálculo do gráfico "Rupturas por Período" (puro)
// ---------------------------------------------------------------------------

export interface RupturaPeriodPoint {
  period: string
  eventos: number
  criticos: number
  resolvidos: number
}

/** Agrupa rupturas por semana ISO (AAAA-Www) da data_visita. */
export function computeRupturasOverTime(records: Ruptura[]): RupturaPeriodPoint[] {
  const groups = new Map<string, { eventos: number; criticos: number; resolvidos: number }>()

  for (const r of records) {
    if (!r.data_visita) continue
    const period = isoWeekLabel(r.data_visita)
    const cur = groups.get(period) ?? { eventos: 0, criticos: 0, resolvidos: 0 }
    cur.eventos++
    if (r.motivo === 'Ruptura Total') cur.criticos++
    if (r.situacao_atual === 'Resolvido') cur.resolvidos++
    groups.set(period, cur)
  }

  return [...groups.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([period, v]) => ({ period, ...v }))
}

/** Converte uma data ISO YYYY-MM-DD em rótulo de semana ISO "AAAA-WNN". */
function isoWeekLabel(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z')
  if (isNaN(d.getTime())) return 'Sem data'
  // ISO week calc (UTC)
  const tmp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const dayNum = tmp.getUTCDay() || 7
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${tmp.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

// ---------------------------------------------------------------------------
// Hash do arquivo (mesma estratégia do tradeProPipeline)
// ---------------------------------------------------------------------------

export async function calcularHashArquivo(file: File): Promise<string> {
  try {
    const buffer = await file.arrayBuffer()
    const digest = await crypto.subtle.digest('SHA-256', buffer)
    const bytes = Array.from(new Uint8Array(digest))
    return bytes.map((b) => b.toString(16).padStart(2, '0')).join('')
  } catch {
    return `size-${file.size}-${file.name}`
  }
}

// ---------------------------------------------------------------------------
// processRupturasImport — orquestração + persistência
// ---------------------------------------------------------------------------

const BATCH_SIZE = 25

/**
 * Orquestra o pipeline completo de importação de Rupturas e persiste nas
 * collections `rupturas_imports`, `rupturas_base` e `rupturas_historico`.
 */
export async function processRupturasImport(
  file: File,
  tenantId: string,
): Promise<RupturasImportResult> {
  const file_hash = await calcularHashArquivo(file)
  const file_name = file.name

  // Result base (em caso de falha)
  const fail = (
    status: RupturasImportResult['status'],
    error_message: string,
  ): RupturasImportResult => ({
    importId: '',
    file_name,
    file_hash,
    total_rows_read: 0,
    total_rows_valid: 0,
    total_rows_invalid: 0,
    total_raw_rows_saved: 0,
    total_rows_processed: 0,
    total_occurrences_generated: 0,
    total_audit_records: 0,
    total_historical_records: 0,
    status,
    error_message,
  })

  // 1. Hash + 2. Verificar duplicação
  try {
    const existing = await pb
      .collection('rupturas_imports')
      .getFirstListItem(`file_hash="${file_hash}"`)
    if (existing) {
      return fail('Cancelada', 'Arquivo já importado anteriormente (hash duplicado).')
    }
  } catch {
    // não encontrado → prossegue
  }

  // 3. Registrar importação — status "Recebida"
  const nowISO = () => new Date().toISOString()
  let importRec
  try {
    importRec = await pb.collection('rupturas_imports').create({
      tenant_id: tenantId,
      file_name,
      file_hash,
      total_rows_read: 0,
      total_rows_valid: 0,
      total_rows_invalid: 0,
      total_raw_rows_saved: 0,
      total_rows_processed: 0,
      total_occurrences_generated: 0,
      total_audit_records: 0,
      total_historical_records: 0,
      status: 'Recebida',
      error_message: '',
      batch_config: { batch_size: BATCH_SIZE },
      created_at: nowISO(),
      completed_at: '',
    })
  } catch (err) {
    return fail('Falhou', `Falha ao registrar importação: ${(err as Error).message}`)
  }

  const importId = importRec.id
  const setImport = async (patch: Record<string, unknown>) => {
    try {
      await pb.collection('rupturas_imports').update(importId, patch)
    } catch (err) {
      console.error('[rupturasPipeline] erro ao atualizar importação:', err)
    }
  }

  try {
    // 4. Parse → status "Validando"
    await setImport({ status: 'Validando' })
    const parsed = await parseRupturasExcel(file)
    const total_rows_read = parsed.length

    // 5. Validação
    const { valid, invalid } = validateRupturasRows(parsed)
    const total_rows_valid = valid.length
    const total_rows_invalid = invalid.length

    // 6. Padronizar motivo + 7. Extrair código da loja
    const enriquecidas = valid.map((row) => ({
      ...row,
      motivo: normalizeRupturaMotivo(row.motivo),
      codigo_loja: extractStoreCode(row.nome_loja),
    }))

    // 8. Filtrar 90 dias
    const filtradas = filterLast90Days(enriquecidas)

    // 9. Construir chaves + 10. Dedup (maior data_visita por grupo)
    const comChaves = filtradas.map((row) => ({
      ...row,
      operational_key: buildRupturaOperationalKey(
        row.codigo_loja,
        row.produto,
        row.data_visita || '',
      ),
      dedup_key: buildRupturaDedupKey(row.codigo_loja, row.produto, row.cliente),
    }))
    const dedup = dedupRupturas(comChaves)
    const total_rows_processed = dedup.length

    // 11. Status → "Processando"
    await setImport({ status: 'Processando' })

    // Reconciliação: buscar registros is_base_atual existentes para os mesmos
    // dedup_keys (em lotes), para marcar os antigos como is_base_atual=false e
    // preservar data_entrada (primeira aparição).
    const dedupKeys = [...new Set(dedup.map((r) => r.dedup_key))]
    const existingByDedup = await fetchExistingBaseByDedup(dedupKeys)

    let occurrences = 0
    let auditRecords = 0
    let historicalRecords = 0
    const hoje = dataAtualSaoPaulo()

    // 12-14. Persistir em lotes (25) + is_base_atual=true + histórico
    for (let i = 0; i < dedup.length; i += BATCH_SIZE) {
      const batch = dedup.slice(i, i + BATCH_SIZE)
      for (const row of batch) {
        const existing = existingByDedup.get(row.dedup_key)
        const data_entrada = existing?.data_entrada || row.data_visita || hoje

        // Marca registros antigos como não-vigentes (encerramento) — audit
        if (existing) {
          for (const old of existing.records) {
            try {
              await pb.collection('rupturas_base').update(old.id, { is_base_atual: false })
              auditRecords++
              await pb.collection('rupturas_historico').create({
                ruptura_base_id: old.id,
                tenant_id: tenantId,
                evento: 'encerramento',
                dados_anteriores: old.dados,
                dados_novos: { is_base_atual: false },
                data_evento: nowISO(),
                source_import_id: importId,
              })
              historicalRecords++
            } catch (err) {
              console.error('[rupturasPipeline] erro ao encerrar registro antigo:', err)
            }
          }
        }

        // Cria novo registro vigente
        const novoRec = {
          tenant_id: tenantId,
          produto: row.produto,
          motivo: row.motivo,
          codigo_loja: row.codigo_loja,
          nome_loja: row.nome_loja,
          cnpj_loja: row.cnpj_loja,
          cidade: row.cidade,
          estado: row.estado,
          codigo_cliente: row.codigo_cliente,
          cliente: row.cliente,
          colaborador: row.colaborador,
          categoria: row.categoria,
          observacao: row.observacao,
          data_visita: row.data_visita || '',
          data_entrada,
          ultima_aparicao: row.data_visita || hoje,
          situacao_atual: 'Ativo' as RupturaSituacao,
          operational_key: row.operational_key,
          dedup_key: row.dedup_key,
          source_import_id: importId,
          source_row: row.source_row,
          is_base_atual: true,
        }
        let createdId = ''
        try {
          const created = await pb.collection('rupturas_base').create(novoRec)
          createdId = created.id
          occurrences++
        } catch (err) {
          console.error('[rupturasPipeline] erro ao criar ruptura_base:', err)
          continue
        }

        // Histórico do novo registro
        const evento = existing ? 'atualizacao' : 'criacao'
        try {
          await pb.collection('rupturas_historico').create({
            ruptura_base_id: createdId,
            tenant_id: tenantId,
            evento,
            dados_anteriores: existing ? existing.records[0]?.dados : null,
            dados_novos: novoRec,
            data_evento: nowISO(),
            source_import_id: importId,
          })
          historicalRecords++
        } catch (err) {
          console.error('[rupturasPipeline] erro ao criar histórico:', err)
        }
      }
    }

    // 15. Reconciliação de totais
    // 16. Status → "Concluída" ou "Concluída com rejeições"
    const finalStatus: RupturasImportResult['status'] =
      total_rows_invalid > 0 ? 'Concluída com rejeições' : 'Concluída'

    await setImport({
      status: finalStatus,
      total_rows_read,
      total_rows_valid,
      total_rows_invalid,
      total_raw_rows_saved: 0,
      total_rows_processed,
      total_occurrences_generated: occurrences,
      total_audit_records: auditRecords,
      total_historical_records: historicalRecords,
      completed_at: nowISO(),
      error_message: '',
    })

    // 17. Retornar resultado
    return {
      importId,
      file_name,
      file_hash,
      total_rows_read,
      total_rows_valid,
      total_rows_invalid,
      total_raw_rows_saved: 0,
      total_rows_processed,
      total_occurrences_generated: occurrences,
      total_audit_records: auditRecords,
      total_historical_records: historicalRecords,
      status: finalStatus,
    }
  } catch (err) {
    const msg = (err as Error).message || 'Erro desconhecido no processamento.'
    await setImport({ status: 'Falhou', error_message: msg, completed_at: nowISO() })
    return fail('Falhou', msg)
  }
}

// ---------------------------------------------------------------------------
// Helpers de persistência
// ---------------------------------------------------------------------------

interface ExistingBase {
  id: string
  data_entrada: string
  dados: Record<string, unknown>
}

/** Busca registros is_base_atual existentes agrupados por dedup_key. */
async function fetchExistingBaseByDedup(
  dedupKeys: string[],
): Promise<Map<string, { data_entrada: string; records: ExistingBase[] }>> {
  const map = new Map<string, { data_entrada: string; records: ExistingBase[] }>()
  if (dedupKeys.length === 0) return map

  const CHUNK = 50
  for (let i = 0; i < dedupKeys.length; i += CHUNK) {
    const chunk = dedupKeys.slice(i, i + CHUNK)
    const filter = chunk.map((k) => `dedup_key="${k.replace(/"/g, '')}"`).join(' || ')
    try {
      const records = await pb
        .collection('rupturas_base')
        .getFullList({ filter: `is_base_atual=true && (${filter})` })
      for (const rec of records) {
        const r = rec as unknown as Record<string, unknown>
        const dk = (r.dedup_key as string) || ''
        if (!dk) continue
        const entry = map.get(dk) ?? { data_entrada: '', records: [] }
        const de = (r.data_entrada as string) || (r.data_visita as string) || ''
        if (de && (!entry.data_entrada || de < entry.data_entrada)) entry.data_entrada = de
        entry.records.push({ id: (r.id as string) || '', data_entrada: de, dados: r })
        map.set(dk, entry)
      }
    } catch (err) {
      console.error('[rupturasPipeline] erro ao buscar base existente:', err)
    }
  }
  return map
}
