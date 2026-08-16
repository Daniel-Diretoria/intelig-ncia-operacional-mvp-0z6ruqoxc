/**
 * Cliente de importação — orquestra o envio dos registros validados para o
 * backend (pb_hook /api/backend/v1/import-validades) e persistência em
 * `validades_imported` + `import_history`.
 *
 * Mantido separado da UI para que a origem dos dados possa ser trocada
 * (Excel -> API TradePro) sem alterar o pipeline de persistência.
 */
import pb from '@/lib/pocketbase/client'
import type { ValidadeItem, ProcessedValidade, TradeProRawRecord } from '@/types'
import type { DatasetValidationReport } from './validators'

export interface ImportPayload {
  fileName: string
  fileSize: number
  records: ValidadeItem[]
  summary: {
    totalRows: number
    validRows: number
    invalidRows: number
    warningRows: number
    errors: unknown[]
  }
}

export interface ImportResult {
  success: boolean
  importId: string
  importedRows: number
  skippedRows: number
  errorRows: number
  error?: string
}

export async function submitImport(payload: ImportPayload): Promise<ImportResult> {
  try {
    const res = await pb.send('/api/backend/v1/import-validades', {
      method: 'POST',
      body: payload,
    })
    return res as ImportResult
  } catch (err) {
    const e = err as { message?: string; response?: { message?: string } }
    return {
      success: false,
      importId: '',
      importedRows: 0,
      skippedRows: 0,
      errorRows: 0,
      error: e?.response?.message || e?.message || 'Falha ao enviar importação.',
    }
  }
}

// =============================================================================
// TradePro — processamento completo (pipeline + persistência)
// =============================================================================

export interface ProcessValidadesPayload {
  fileName: string
  fileSize?: number
  fileHash: string
  arquivoTipo?: string
  dataArquivo?: string
  force?: boolean
  rawRecords: Partial<TradeProRawRecord>[]
  baseAtual: Partial<ProcessedValidade>[]
  summary: {
    totalBrutos: number
    filtrados90Dias: number
    consolidados: number
    baseAtual: number
    maiorDataArquivo?: string
  }
}

export interface ProcessValidadesResult {
  success: boolean
  importId: string
  importedRows: number
  rawRows: number
  skippedRows: number
  errorRows: number
  summary?: {
    totalBrutos: number
    filtrados90Dias: number
    consolidados: number
    baseAtual: number
    maiorDataArquivo?: string
  }
  duplicate?: boolean
  message?: string
  previousImportId?: string
  previousDate?: string
  error?: string
}

/**
 * Persiste os dados brutos + Base Atual processada diretamente via a API
 * nativa de collections do PocketBase (`validades_raw`, `validades_base` e
 * `import_history`), substituindo o endpoint `/api/backend/v1/process-validades`
 * (que nunca foi registrado corretamente pelo routerAdd do pb_hook e devolvia 404).
 *
 * Implementa proteção contra reenvio: se o hash já foi concluído, retorna
 * `duplicate: true` e exige `force: true` para reprocessar.
 */

type AnyRec = Record<string, unknown>

/** Lê um valor do registro tentando camelCase primeiro, depois snake_case. */
function pick(rec: AnyRec, camel: string, snake: string): unknown {
  const c = rec[camel]
  if (c !== undefined && c !== null && c !== '') return c
  const s = rec[snake]
  if (s !== undefined && s !== null && s !== '') return s
  return undefined
}

/** Constrói o payload snake_case a partir de um registro (camelCase | snake_case). */
function buildSnake(rec: AnyRec, pairs: Array<[snake: string, camel: string]>): AnyRec {
  const out: AnyRec = {}
  for (const [snake, camel] of pairs) {
    const v = pick(rec, camel, snake)
    if (v !== undefined) out[snake] = v
  }
  return out
}

/** Campos mapeados para `validades_raw` (camelCase → snake_case). */
const RAW_FIELDS: Array<[string, string]> = [
  ['cod_colaborador', 'codColaborador'],
  ['colaborador', 'colaborador'],
  ['cod_supervisor', 'codSupervisor'],
  ['supervisor', 'supervisor'],
  ['cpf_cnpj', 'cpfCnpj'],
  ['razao_social', 'razaoSocial'],
  ['fantasia', 'fantasia'],
  ['cidade', 'cidade'],
  ['estado', 'estado'],
  ['cod_cliente', 'codCliente'],
  ['cliente', 'cliente'],
  ['cod_produto', 'codProduto'],
  ['produto', 'produto'],
  ['cod_barras', 'codBarras'],
  ['data_fabricacao', 'dataFabricacao'],
  ['realizado', 'realizado'],
  ['quantidade', 'quantidade'],
  ['dias_vencimento_arquivo', 'diasVencimentoArquivo'],
  ['validade', 'validade'],
  ['numero_lote', 'numeroLote'],
  ['representante', 'representante'],
  ['cnpj', 'cnpj'],
  ['fornecedor', 'fornecedor'],
  ['numero_linha', 'numeroLinha'],
  ['data_arquivo', 'dataArquivo'],
  ['data_importacao', 'dataImportacao'],
]

/** Campos mapeados para `validades_base` (camelCase → snake_case). */
const BASE_FIELDS: Array<[string, string]> = [
  ['fornecedor', 'fornecedor'],
  ['razao_social', 'razaoSocial'],
  ['produto', 'produto'],
  ['cliente', 'cliente'],
  ['cod_cliente', 'codCliente'],
  ['cod_produto', 'codProduto'],
  ['cod_barras', 'codBarras'],
  ['cpf_cnpj', 'cpfCnpj'],
  ['cnpj', 'cnpj'],
  ['codigo_loja', 'codigoLoja'],
  ['nome_loja', 'nomeLoja'],
  ['rede', 'rede'],
  ['cidade', 'cidade'],
  ['estado', 'estado'],
  ['colaborador', 'colaborador'],
  ['cod_colaborador', 'codColaborador'],
  ['supervisor', 'supervisor'],
  ['cod_supervisor', 'codSupervisor'],
  ['fantasia', 'fantasia'],
  ['representante', 'representante'],
  ['numero_lote', 'numeroLote'],
  ['realizado', 'realizado'],
  ['validade_original', 'validadeOriginal'],
  ['validade_efetiva', 'validadeEfetiva'],
  ['data_arquivo', 'dataArquivo'],
  ['data_importacao', 'dataImportacao'],
  ['data_entrada', 'dataEntrada'],
  ['ultima_aparicao', 'ultimaAparicao'],
  ['quantidade', 'quantidade'],
  ['is_base_atual', 'isBaseAtual'],
  ['chave_operacional', 'chaveOperacional'],
  ['chave_dedup', 'chaveDedup'],
  ['correcao_aplicada', 'correcaoAplicada'],
  ['regra_correcao', 'regraCorrecao'],
  ['dias_vencimento_atual', 'diasVencimentoAtual'],
  ['dias_vencimento_arquivo', 'diasVencimentoArquivo'],
  ['dias_vencimento_entrada', 'diasVencimentoEntrada'],
  ['status_operacional', 'statusOperacional'],
  ['status_na_entrada', 'statusNaEntrada'],
  ['situacao_atual', 'situacaoAtual'],
]

function errMsg(err: unknown): string {
  const e = err as { message?: string; response?: { message?: string } }
  return e?.response?.message || e?.message || 'Erro desconhecido'
}

export async function submitProcessValidades(
  payload: ProcessValidadesPayload,
): Promise<ProcessValidadesResult> {
  const {
    fileName,
    fileSize = 0,
    fileHash,
    arquivoTipo = 'validades',
    dataArquivo,
    force = false,
    rawRecords,
    baseAtual,
    summary,
  } = payload

  const rawCount = rawRecords.length
  const baseCount = baseAtual.length
  const now = new Date().toISOString()
  const errors: Array<{ stage: string; index: number; error: string }> = []

  // --- 4. Proteção contra reenvio ------------------------------------------
  if (!force && fileHash) {
    try {
      const dup = await pb.collection('import_history').getList(1, 1, {
        filter: `file_hash = "${fileHash}" && status = "completed"`,
        sort: '-created',
      })
      if (dup.items.length > 0) {
        const prev = dup.items[0] as unknown as AnyRec
        return {
          success: false,
          importId: '',
          importedRows: 0,
          rawRows: rawCount,
          skippedRows: 0,
          errorRows: 0,
          summary,
          duplicate: true,
          message:
            'Este arquivo já foi importado e concluído. Marque "Reprocessar" para substituir.',
          previousImportId: prev.id as string,
          previousDate: prev.created as string,
        }
      }
    } catch {
      // Ignora falha na checagem — segue com a importação.
    }
  }

  // --- 1. Criar registro em import_history ----------------------------------
  let importId = ''
  try {
    const hist = await pb.collection('import_history').create({
      file_name: fileName,
      file_size: fileSize,
      file_hash: fileHash,
      arquivo_tipo: arquivoTipo,
      data_arquivo: dataArquivo || undefined,
      data_importacao: now,
      total_rows: summary.totalBrutos,
      imported_rows: 0,
      skipped_rows: 0,
      error_rows: 0,
      raw_count: rawCount,
      filtered_count: summary.filtrados90Dias,
      base_count: baseCount,
      status: 'processing',
      errors_json: '[]',
      source: 'tradepro',
    })
    importId = (hist as unknown as { id: string }).id
  } catch (err) {
    return {
      success: false,
      importId: '',
      importedRows: 0,
      rawRows: rawCount,
      skippedRows: 0,
      errorRows: 0,
      summary,
      error: `Falha ao criar histórico de importação: ${errMsg(err)}`,
    }
  }

  // --- 2. Persistir dados brutos em validades_raw ---------------------------
  let rawPersisted = 0
  for (let i = 0; i < rawRecords.length; i++) {
    try {
      const data = buildSnake(rawRecords[i] as AnyRec, RAW_FIELDS)
      data.import_id = importId
      await pb.collection('validades_raw').create(data)
      rawPersisted++
    } catch (err) {
      errors.push({ stage: 'raw', index: i, error: errMsg(err) })
    }
  }

  // --- 3. Persistir Base Atual em validades_base (upsert por chave) --------
  let basePersisted = 0
  for (let i = 0; i < baseAtual.length; i++) {
    const rec = baseAtual[i] as AnyRec
    try {
      const data = buildSnake(rec, BASE_FIELDS)
      data.import_id = importId
      const chave = pick(rec, 'chaveOperacional', 'chave_operacional') as string | undefined

      let existingId: string | undefined
      if (chave) {
        try {
          const found = await pb.collection('validades_base').getList(1, 1, {
            filter: `chave_operacional = "${chave}"`,
          })
          if (found.items.length > 0) {
            existingId = (found.items[0] as unknown as { id: string }).id
          }
        } catch {
          // Ignora falha na busca — tenta criar novo.
        }
      }

      if (existingId) {
        await pb.collection('validades_base').update(existingId, data)
      } else {
        await pb.collection('validades_base').create(data)
      }
      basePersisted++
    } catch (err) {
      errors.push({ stage: 'base', index: i, error: errMsg(err) })
    }
  }

  // --- 5. Atualizar import_history ao final ---------------------------------
  const errorRows = errors.length
  const skippedRows = Math.max(rawCount - baseCount, 0)
  const allFailed = basePersisted === 0 && rawPersisted === 0
  const status: 'completed' | 'failed' = allFailed ? 'failed' : 'completed'

  try {
    await pb.collection('import_history').update(importId, {
      imported_rows: basePersisted,
      skipped_rows: skippedRows,
      error_rows: errorRows,
      status,
      errors_json: errors.length > 0 ? JSON.stringify(errors) : '[]',
    })
  } catch {
    // Não aborta — os dados já foram persistidos nas collections.
  }

  // --- 7. Retorno -----------------------------------------------------------
  if (allFailed) {
    return {
      success: false,
      importId,
      importedRows: 0,
      rawRows: rawCount,
      skippedRows,
      errorRows,
      summary,
      error:
        errors.length > 0
          ? `Todos os registros falharam. Primeiro erro: ${errors[0].error}`
          : 'Nenhum registro foi persistido.',
    }
  }

  return {
    success: true,
    importId,
    importedRows: basePersisted,
    rawRows: rawCount,
    skippedRows,
    errorRows,
    summary,
  }
}

/**
 * Verifica se um hash de arquivo já foi importado (proteção contra reenvio).
 */
export async function checkFileHash(fileHash: string): Promise<{
  duplicate: boolean
  importId?: string
  created?: string
}> {
  if (!fileHash) return { duplicate: false }
  try {
    const records = await pb.collection('import_history').getList(1, 1, {
      filter: `file_hash = "${fileHash}" && status = "completed"`,
      sort: '-created',
    })
    if (records.items.length > 0) {
      const r = records.items[0] as unknown as Record<string, unknown>
      return {
        duplicate: true,
        importId: r.id as string,
        created: r.created as string,
      }
    }
    return { duplicate: false }
  } catch {
    return { duplicate: false }
  }
}

export type { DatasetValidationReport }
