/**
 * Serviço de sincronização que orquestra a integração com a API do TradePro
 * e executa os pipelines existentes de Validades e Rupturas, persistindo
 * na base do PocketBase e salvando logs na collection `sync_logs`.
 */

import pb from '@/lib/pocketbase/client'
import { getTradeProClient, isTradeProConfigured } from './tradeProClient'
import { suggestMapping } from '@/lib/import/columnMapping'
import { executarPipeline, toRawRecord, dataAtualSaoPaulo } from '@/lib/data/tradeProPipeline'
import { submitProcessValidades } from '@/lib/import/importClient'
import {
  validateRupturasRows,
  normalizeRupturaMotivo,
  extractStoreCode,
  filterLast90Days,
  buildRupturaOperationalKey,
  buildRupturaDedupKey,
  dedupRupturas,
  type ParsedRupturaRow,
} from '@/lib/pipeline/rupturasPipeline'
import { parseDate, parseString, parseTextId } from '@/lib/import/excelMapper'
import type { RupturaSituacao } from '@/types'

export interface SyncResult {
  success: boolean
  totalRows: number
  newRows: number
  updatedRows: number
  errors: string[]
  durationMs: number
  type: 'validades' | 'rupturas' | 'all'
  timestamp: string
}

export interface SyncLogRecord {
  id: string
  tipo: string
  status: 'success' | 'partial' | 'error'
  total_rows: number
  new_rows: number
  updated_rows: number
  errors: string[]
  duration_ms: number
  created: string
}

export type SyncProgressCallback = (step: string, percent: number) => void

/**
 * Salva o log da execução na collection `sync_logs`.
 */
async function recordSyncLog(tipo: string, result: SyncResult): Promise<void> {
  try {
    const status: 'success' | 'partial' | 'error' = !result.success
      ? 'error'
      : result.errors.length > 0
        ? 'partial'
        : 'success'

    await pb.collection('sync_logs').create({
      tipo,
      status,
      total_rows: result.totalRows,
      new_rows: result.newRows,
      updated_rows: result.updatedRows,
      errors: result.errors,
      duration_ms: result.durationMs,
    })
  } catch (err) {
    console.error('[syncService] Falha ao registrar log de sincronização em sync_logs:', err)
  }
}

/**
 * Sincroniza dados de Validades via API TradePro.
 */
export async function syncValidades(
  onProgress?: SyncProgressCallback,
  from?: Date,
  to?: Date,
): Promise<SyncResult> {
  const startTime = Date.now()
  const errors: string[] = []

  if (!isTradeProConfigured()) {
    const durationMs = Date.now() - startTime
    const err =
      'API TradePro não está configurada (variáveis VITE_TRADEPRO_API_URL e VITE_TRADEPRO_API_TOKEN não definidas).'
    errors.push(err)
    const res: SyncResult = {
      success: false,
      totalRows: 0,
      newRows: 0,
      updatedRows: 0,
      errors,
      durationMs,
      type: 'validades',
      timestamp: new Date().toISOString(),
    }
    await recordSyncLog('validades', res)
    return res
  }

  const client = getTradeProClient()!

  try {
    onProgress?.('Conectando à API TradePro...', 10)
    const rawApiRecords = await client.fetchValidades(from, to)

    if (rawApiRecords.length === 0) {
      onProgress?.('Nenhum registro de Validades retornado pela API.', 100)
      const durationMs = Date.now() - startTime
      const res: SyncResult = {
        success: true,
        totalRows: 0,
        newRows: 0,
        updatedRows: 0,
        errors: [],
        durationMs,
        type: 'validades',
        timestamp: new Date().toISOString(),
      }
      await recordSyncLog('validades', res)
      return res
    }

    onProgress?.(`Detectando mapeamento de campos (${rawApiRecords.length} registros)...`, 25)
    // Extrai as chaves encontradas no primeiro registro
    const sampleHeaders = Object.keys(rawApiRecords[0])
    const mapping = suggestMapping(sampleHeaders)

    onProgress?.('Executando pipeline de Validades (30 passos)...', 45)
    const dataAtual = dataAtualSaoPaulo()
    const fileName = `API-TradePro-Validades-${dataAtual}.api`
    const fileHash = `api-validades-${dataAtual}-${rawApiRecords.length}-${Date.now()}`

    const pipeline = executarPipeline({
      rawRecords: rawApiRecords,
      mapping,
      fileName,
      dataArquivo: dataAtual,
    })

    const rawTradePro = rawApiRecords.map((r, i) => toRawRecord(r, mapping, i + 2))

    onProgress?.('Persistindo ocorrências na Base Atual (validades_base)...', 70)
    const result = await submitProcessValidades({
      fileName,
      fileSize: 0,
      fileHash,
      arquivoTipo: 'validades',
      dataArquivo: dataAtual,
      force: true, // Sincronização via API sempre atualiza/sobrescreve
      rawRecords: rawTradePro,
      baseAtual: pipeline.baseAtual,
      summary: {
        totalBrutos: pipeline.summary.totalBrutos,
        validos: pipeline.summary.validos,
        rejeitados: pipeline.summary.rejeitados,
        filtrados90Dias: pipeline.summary.filtrados90Dias,
        consolidados: pipeline.summary.consolidados,
        baseAtual: pipeline.summary.baseAtual,
        maiorDataArquivo: pipeline.summary.maiorDataArquivo,
      },
    })

    onProgress?.('Concluindo sincronização de Validades...', 95)

    if (!result.success) {
      if (result.error) errors.push(result.error)
    }

    const durationMs = Date.now() - startTime
    const syncRes: SyncResult = {
      success: result.success,
      totalRows: rawApiRecords.length,
      newRows: result.importedRows,
      updatedRows: pipeline.summary.consolidados,
      errors,
      durationMs,
      type: 'validades',
      timestamp: new Date().toISOString(),
    }

    await recordSyncLog('validades', syncRes)
    onProgress?.('Sincronização de Validades concluída com sucesso!', 100)
    return syncRes
  } catch (err) {
    const durationMs = Date.now() - startTime
    const errorMsg = (err as Error).message || 'Erro desconhecido na sincronização de Validades.'
    errors.push(errorMsg)

    const syncRes: SyncResult = {
      success: false,
      totalRows: 0,
      newRows: 0,
      updatedRows: 0,
      errors,
      durationMs,
      type: 'validades',
      timestamp: new Date().toISOString(),
    }

    await recordSyncLog('validades', syncRes)
    onProgress?.(`Falha: ${errorMsg}`, 100)
    return syncRes
  }
}

/**
 * Normaliza um registro de Rupturas retornado pela API para o formato esperado pelo pipeline.
 */
function normalizeApiRupturaRecord(rec: Record<string, unknown>, index: number): ParsedRupturaRow {
  const getField = (...keys: string[]): unknown => {
    for (const k of keys) {
      if (rec[k] !== undefined && rec[k] !== null && rec[k] !== '') {
        return rec[k]
      }
      // busca case-insensitive
      const lk = k.toLowerCase().replace(/[\s_.-]/g, '')
      for (const objKey of Object.keys(rec)) {
        if (objKey.toLowerCase().replace(/[\s_.-]/g, '') === lk) {
          return rec[objKey]
        }
      }
    }
    return undefined
  }

  const rawVisita = getField('data_visita', 'datavisita', 'data', 'dtvisita', 'coleta')
  const data_visita =
    parseDate(rawVisita) || (typeof rawVisita === 'string' ? rawVisita.slice(0, 10) : null)

  return {
    data_visita,
    produto: parseString(getField('produto', 'atividade', 'descricaoproduto', 'item')) || '',
    motivo: parseString(getField('motivo', 'tiporuptura', 'motivo_ruptura')) || '',
    nome_loja:
      parseString(getField('nome_loja', 'razaosocial', 'loja', 'razao_social', 'fantasia')) || '',
    cnpj_loja: parseTextId(getField('cnpj_loja', 'cnpj', 'cpf_cnpj', 'cnpjloja')) || '',
    cidade: parseString(getField('cidade', 'municipio')) || '',
    estado: parseString(getField('estado', 'uf')) || '',
    codigo_cliente: parseTextId(getField('codigo_cliente', 'codcliente', 'cod_cliente')) || '',
    cliente: parseString(getField('cliente', 'fornecedor', 'nomecliente')) || '',
    categoria: parseString(getField('categoria', 'grupo')) || '',
    observacao: parseString(getField('observacao', 'obs')) || '',
    colaborador: parseString(getField('colaborador', 'promotor')) || '',
    source_row: index + 2,
  }
}

/**
 * Sincroniza dados de Rupturas via API TradePro.
 */
export async function syncRupturas(
  onProgress?: SyncProgressCallback,
  from?: Date,
  to?: Date,
): Promise<SyncResult> {
  const startTime = Date.now()
  const errors: string[] = []

  if (!isTradeProConfigured()) {
    const durationMs = Date.now() - startTime
    const err =
      'API TradePro não configurada (variáveis VITE_TRADEPRO_API_URL e VITE_TRADEPRO_API_TOKEN não definidas).'
    errors.push(err)
    const res: SyncResult = {
      success: false,
      totalRows: 0,
      newRows: 0,
      updatedRows: 0,
      errors,
      durationMs,
      type: 'rupturas',
      timestamp: new Date().toISOString(),
    }
    await recordSyncLog('rupturas', res)
    return res
  }

  const client = getTradeProClient()!

  try {
    onProgress?.('Conectando à API TradePro (Rupturas)...', 10)
    const rawApiRecords = await client.fetchRupturas(from, to)

    if (rawApiRecords.length === 0) {
      onProgress?.('Nenhum registro de Rupturas retornado pela API.', 100)
      const durationMs = Date.now() - startTime
      const res: SyncResult = {
        success: true,
        totalRows: 0,
        newRows: 0,
        updatedRows: 0,
        errors: [],
        durationMs,
        type: 'rupturas',
        timestamp: new Date().toISOString(),
      }
      await recordSyncLog('rupturas', res)
      return res
    }

    onProgress?.(`Validando ${rawApiRecords.length} registros de Rupturas...`, 30)
    const parsedRows = rawApiRecords.map((r, idx) => normalizeApiRupturaRecord(r, idx))
    const { valid, invalid } = validateRupturasRows(parsedRows)

    if (invalid.length > 0) {
      errors.push(
        `${invalid.length} linha(s) com campos obrigatórios inválidos ou ausentes na resposta da API.`,
      )
    }

    onProgress?.('Processando deduplicação e janela de 90 dias...', 50)
    const enriquecidas = valid.map((row) => ({
      ...row,
      motivo: normalizeRupturaMotivo(row.motivo),
      codigo_loja: extractStoreCode(row.nome_loja),
    }))

    const filtradas = filterLast90Days(enriquecidas)
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

    onProgress?.('Persistindo na collection rupturas_base...', 75)
    const nowISO = () => new Date().toISOString()
    const hoje = dataAtualSaoPaulo()
    const tenantId = 'tenant-default'
    let occurrences = 0
    let updatedCount = 0

    const BATCH_SIZE = 25
    for (let i = 0; i < dedup.length; i += BATCH_SIZE) {
      const batch = dedup.slice(i, i + BATCH_SIZE)
      for (const row of batch) {
        // Verifica se já existe vigente com a mesma chave dedup
        let existingId: string | null = null
        let data_entrada = row.data_visita || hoje

        try {
          const found = await pb.collection('rupturas_base').getList(1, 1, {
            filter: `dedup_key = "${row.dedup_key}" && is_base_atual = true`,
          })
          if (found.items.length > 0) {
            existingId = found.items[0].id
            const existingEntrada = (found.items[0] as unknown as Record<string, unknown>)
              .data_entrada as string
            if (existingEntrada) data_entrada = existingEntrada
          }
        } catch {
          // Ignora falha na consulta
        }

        const recordPayload = {
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
          source_row: row.source_row,
          is_base_atual: true,
        }

        try {
          if (existingId) {
            await pb.collection('rupturas_base').update(existingId, recordPayload)
            updatedCount++
          } else {
            const created = await pb.collection('rupturas_base').create(recordPayload)
            occurrences++

            // Histórico de criação
            try {
              await pb.collection('rupturas_historico').create({
                ruptura_base_id: created.id,
                tenant_id: tenantId,
                evento: 'criacao',
                dados_anteriores: null,
                dados_novos: recordPayload,
                data_evento: nowISO(),
              })
            } catch {
              // ignora falha de histórico
            }
          }
        } catch (err) {
          console.error('[syncService] Falha ao persistir registro de ruptura:', err)
        }
      }
    }

    onProgress?.('Concluindo sincronização de Rupturas...', 95)
    const durationMs = Date.now() - startTime
    const syncRes: SyncResult = {
      success: true,
      totalRows: rawApiRecords.length,
      newRows: occurrences,
      updatedRows: updatedCount,
      errors,
      durationMs,
      type: 'rupturas',
      timestamp: new Date().toISOString(),
    }

    await recordSyncLog('rupturas', syncRes)
    onProgress?.('Sincronização de Rupturas concluída!', 100)
    return syncRes
  } catch (err) {
    const durationMs = Date.now() - startTime
    const errorMsg = (err as Error).message || 'Erro desconhecido na sincronização de Rupturas.'
    errors.push(errorMsg)

    const syncRes: SyncResult = {
      success: false,
      totalRows: 0,
      newRows: 0,
      updatedRows: 0,
      errors,
      durationMs,
      type: 'rupturas',
      timestamp: new Date().toISOString(),
    }

    await recordSyncLog('rupturas', syncRes)
    onProgress?.(`Falha: ${errorMsg}`, 100)
    return syncRes
  }
}

/**
 * Sincroniza Validades e Rupturas em sequência.
 */
export async function syncAll(
  onProgress?: SyncProgressCallback,
  from?: Date,
  to?: Date,
): Promise<SyncResult> {
  const startTime = Date.now()
  const errors: string[] = []

  onProgress?.('Iniciando sincronização completa (Validades + Rupturas)...', 5)

  // 1. Sincroniza Validades
  const valResult = await syncValidades(
    (step, pct) => {
      onProgress?.(`[Validades] ${step}`, Math.round(pct * 0.5))
    },
    from,
    to,
  )

  if (!valResult.success) {
    errors.push(...valResult.errors)
  }

  // 2. Sincroniza Rupturas
  const rupResult = await syncRupturas(
    (step, pct) => {
      onProgress?.(`[Rupturas] ${step}`, 50 + Math.round(pct * 0.5))
    },
    from,
    to,
  )

  if (!rupResult.success) {
    errors.push(...rupResult.errors)
  }

  const durationMs = Date.now() - startTime
  const success = valResult.success && rupResult.success

  const combinedResult: SyncResult = {
    success,
    totalRows: valResult.totalRows + rupResult.totalRows,
    newRows: valResult.newRows + rupResult.newRows,
    updatedRows: valResult.updatedRows + rupResult.updatedRows,
    errors,
    durationMs,
    type: 'all',
    timestamp: new Date().toISOString(),
  }

  await recordSyncLog('all', combinedResult)
  onProgress?.(
    success
      ? 'Sincronização completa de Validades e Rupturas finalizada!'
      : 'Sincronização concluída com avisos/erros.',
    100,
  )

  return combinedResult
}

/**
 * Carrega o histórico recente de sincronizações via API a partir da collection `sync_logs`.
 */
export async function getSyncHistory(limit: number = 20): Promise<SyncLogRecord[]> {
  try {
    const records = await pb.collection('sync_logs').getList(1, limit, {
      sort: '-created',
    })

    return records.items.map((r) => {
      const rec = r as unknown as Record<string, unknown>
      return {
        id: rec.id as string,
        tipo: (rec.tipo as string) || 'validades',
        status: (rec.status as SyncLogRecord['status']) || 'success',
        total_rows: (rec.total_rows as number) || 0,
        new_rows: (rec.new_rows as number) || 0,
        updated_rows: (rec.updated_rows as number) || 0,
        errors: Array.isArray(rec.errors) ? (rec.errors as string[]) : [],
        duration_ms: (rec.duration_ms as number) || 0,
        created: (rec.created as string) || '',
      }
    })
  } catch (err) {
    console.error('[syncService] Erro ao buscar histórico de sincronizações:', err)
    return []
  }
}
