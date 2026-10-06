/**
 * Cliente da API TradePro - Camada de transporte seguro via Coleções Nativas do PocketBase.
 *
 * REGRAS DE SEGURANÇA E ARQUITETURA:
 * - Credenciais e tokens residem ESTRITAMENTE no backend ($os.getenv)
 * - Frontend NUNCA carrega tokens ou Basic Auth em bundle, localStorage ou logs
 * - Teste de conexão é executado criando registros na coleção nativa `tradepro_connection_jobs`
 * - Prévia e Sincronização de Rupturas usam a coleção nativa `tradepro_sync_jobs`
 * - Respostas e loops paginados são processados pelos hooks nativos `onRecordAfterCreateSuccess` e `onRecordAfterUpdateSuccess`
 */
import pb from '@/lib/pocketbase/client'

export interface TradeProStatus {
  isConfigured: boolean
  mode: string
  authType: string
  lastSync?: {
    id: string
    tipo: string
    status: string
    created: string
    totalRecebidos: number
    totalPersistidos: number
  } | null
}

export interface TradeProTestConnectionResult {
  conectado: boolean
  statusHttp: number
  possuiDados: boolean
  registrosRecebidos: number
  totalDeRegistrosInformado: number
  tempoRespostaMs: number
  mensagem: string
  errorCode?: string
}

export type SyncJobStatus =
  | 'pending'
  | 'preview'
  | 'syncing'
  | 'success'
  | 'error'
  | 'paused'
  | 'cancelled'

export type SyncJobErrorCode =
  | 'not_configured'
  | 'invalid_period'
  | 'unauthorized'
  | 'forbidden'
  | 'precondition_failed'
  | 'rate_limited'
  | 'timeout'
  | 'tradepro_unavailable'
  | 'internal_error'

export interface AmostraEstruturaDiagnostic {
  capturadoEm: string
  endpoint: string
  metadadosPaginacao: {
    campoTotal: string
    totalDeRegistros: number
    paginaAtual: number
    quantidadePorPaginaApi: number
    totalDePaginasApi: number
    quantidadePorPaginaLotePrevisto: number
    totalDePaginasPrevistas: number
    nomeColecao: string
    itensRetornados: number
  }
  camposRespostaRaiz: Record<string, string>
  estruturaItemValidade: Record<string, unknown> | null
  diagnosticoCliente: {
    temCodClienteRaiz: boolean
    temClienteRaiz: boolean
    temClienteObjeto: boolean
    camposClienteDetectados: string[]
    codClienteEncontrado: string
    clienteNomeEncontrado: string
    temFornecedor: boolean
    fornecedorValor: string
  }
  amostraOperacionalSegura: {
    promotor: {
      id: string
      nome: string
    }
    loja: {
      razaoSocial: string
      fantasia: string
      cpfCnpj: string
      cidade: string
      estado: string
    }
    produto: {
      codigo: string
      descricao: string
    }
    coleta: {
      dataRealizado: string
      validade: string
      diasParaVencimento: number | null
      quantidade: number | null
    }
    fornecedor: string
  } | null
}

export interface SyncJobRecord {
  id: string
  action: 'sync_rupturas' | 'sync_validades'
  requested_by: string
  date_start: string
  date_end: string
  status: SyncJobStatus
  total_informado: number
  paginas_total: number
  paginas_processadas: number
  registros_lidos: number
  registros_validos: number
  registros_rejeitados: number
  registros_deduplicados: number
  registros_consolidados: number
  error_code?: SyncJobErrorCode | ''
  message: string
  amostra_estrutura_json?: AmostraEstruturaDiagnostic | null
  started_at?: string
  finished_at?: string
  created: string
  updated: string
}

/**
 * Consulta status de conexão ou último job do usuário autenticado.
 */
export async function fetchTradeProBackendStatus(): Promise<TradeProStatus> {
  try {
    const userId = pb.authStore.record?.id || pb.authStore.model?.id
    if (!userId) {
      return {
        isConfigured: true,
        mode: 'shadow',
        authType: 'Basic Authentication (Backend)',
        lastSync: null,
      }
    }

    const latestJobs = await pb.collection('tradepro_connection_jobs').getList(1, 1, {
      filter: `requested_by = "${userId}"`,
      sort: '-created',
    })

    const lastJob = latestJobs.items[0]
    let lastSyncInfo = null

    if (lastJob) {
      lastSyncInfo = {
        id: lastJob.id,
        tipo: (lastJob.action as string) || 'test_connection',
        status: (lastJob.status as string) || 'pending',
        created: (lastJob.created as string) || '',
        totalRecebidos: Number(lastJob.records_received) || 0,
        totalPersistidos: Number(lastJob.total_records_reported) || 0,
      }
    }

    return {
      isConfigured: true,
      mode: 'shadow',
      authType: 'Basic Authentication (Backend)',
      lastSync: lastSyncInfo,
    }
  } catch {
    return {
      isConfigured: true,
      mode: 'shadow',
      authType: 'Basic Authentication (Backend)',
      lastSync: null,
    }
  }
}

/**
 * Dispara sincronização com o backend (quando configurado no servidor).
 */
export async function triggerTradeProBackendSync(
  tipo: 'validades' | 'rupturas' | 'all' = 'all',
): Promise<{
  success: boolean
  message: string
  mode?: string
}> {
  return {
    success: false,
    message: `Sincronização do tipo ${tipo} não iniciada diretamente. Utilize a sincronização paginada ou importação de arquivos Excel.`,
    mode: 'shadow',
  }
}

/**
 * Verifica se a API TradePro está configurada (compatibilidade síncrona / estado inicial).
 */
export function isTradeProConfigured(): boolean {
  return false
}

/**
 * Realiza teste de conexão seguro com a API TradePro via criação de job na coleção PocketBase.
 * NUNCA transmite credenciais pelo frontend e sanitiza qualquer falha de rede/servidor.
 */
export async function testTradeProConnection(
  dataInicial: string,
  dataFinal: string,
): Promise<TradeProTestConnectionResult> {
  const startTime = Date.now()
  const userId = pb.authStore.record?.id || pb.authStore.model?.id

  if (!userId) {
    return {
      conectado: false,
      statusHttp: 401,
      possuiDados: false,
      registrosRecebidos: 0,
      totalDeRegistrosInformado: 0,
      tempoRespostaMs: 0,
      mensagem: 'Usuário não autenticado. Faça login para testar a conexão.',
      errorCode: 'unauthorized',
    }
  }

  try {
    // 1. Criar registro na coleção nativa tradepro_connection_jobs
    const createdJob = await pb.collection('tradepro_connection_jobs').create({
      action: 'test_connection',
      requested_by: userId,
      date_start: dataInicial,
      date_end: dataFinal,
      status: 'pending',
      connected: false,
      http_status: 0,
      has_data: false,
      records_received: 0,
      total_records_reported: 0,
      latency_ms: 0,
      message: '',
    })

    // 2. Buscar registro atualizado pelo hook (processamento no PocketBase)
    const finalJob = await pb.collection('tradepro_connection_jobs').getOne(createdJob.id)

    const isConnected = Boolean(finalJob.connected)
    const httpStatus = Number(finalJob.http_status) || 0
    const hasData = Boolean(finalJob.has_data)
    const recordsReceived = Number(finalJob.records_received) || 0
    const totalReported = Number(finalJob.total_records_reported) || 0
    const latency = Number(finalJob.latency_ms) || Date.now() - startTime
    const message =
      (finalJob.message as string) ||
      (isConnected ? 'Teste concluído com sucesso.' : 'Falha na conexão.')
    const errorCode = (finalJob.error_code as string) || undefined

    return {
      conectado: isConnected,
      statusHttp: httpStatus,
      possuiDados: hasData,
      registrosRecebidos: recordsReceived,
      totalDeRegistrosInformado: totalReported,
      tempoRespostaMs: latency,
      mensagem: message,
      errorCode,
    }
  } catch (err) {
    const latency = Date.now() - startTime
    const e = err as { status?: number; data?: Record<string, unknown>; message?: string }
    const status = e.status || 0
    const rawMsg = e.message || 'Falha de comunicação ao testar conexão com o servidor.'

    return {
      conectado: false,
      statusHttp: status,
      possuiDados: false,
      registrosRecebidos: 0,
      totalDeRegistrosInformado: 0,
      tempoRespostaMs: latency,
      mensagem: rawMsg,
      errorCode: status === 429 ? 'rate_limited' : 'internal_error',
    }
  }
}

function mapSyncJobRecord(record: Record<string, unknown>): SyncJobRecord {
  return {
    id: (record.id as string) || '',
    action: (record.action as 'sync_rupturas' | 'sync_validades') || 'sync_rupturas',
    requested_by: (record.requested_by as string) || '',
    date_start: (record.date_start as string) || '',
    date_end: (record.date_end as string) || '',
    status: (record.status as SyncJobStatus) || 'pending',
    total_informado: Number(record.total_informado) || 0,
    paginas_total: Number(record.paginas_total) || 0,
    paginas_processadas: Number(record.paginas_processadas) || 0,
    registros_lidos: Number(record.registros_lidos) || 0,
    registros_validos: Number(record.registros_validos) || 0,
    registros_rejeitados: Number(record.registros_rejeitados) || 0,
    registros_deduplicados: Number(record.registros_deduplicados) || 0,
    registros_consolidados: Number(record.registros_consolidados) || 0,
    error_code: (record.error_code as SyncJobErrorCode) || '',
    message: (record.message as string) || '',
    amostra_estrutura_json: (record.amostra_estrutura_json as AmostraEstruturaDiagnostic) || null,
    started_at: (record.started_at as string) || undefined,
    finished_at: (record.finished_at as string) || undefined,
    created: (record.created as string) || '',
    updated: (record.updated as string) || '',
  }
}

/**
 * Cria job de prévia de Rupturas e retorna o registro processado com o total de itens e páginas.
 */
export async function requestRupturasPreview(
  dataInicial: string,
  dataFinal: string,
): Promise<SyncJobRecord> {
  const userId = pb.authStore.record?.id || pb.authStore.model?.id
  if (!userId) {
    throw new Error('Usuário não autenticado. Faça login para consultar a prévia.')
  }

  const created = await pb.collection('tradepro_sync_jobs').create({
    action: 'sync_rupturas',
    requested_by: userId,
    date_start: dataInicial,
    date_end: dataFinal,
    status: 'pending',
    total_informado: 0,
    paginas_total: 0,
    paginas_processadas: 0,
    registros_lidos: 0,
    registros_validos: 0,
    registros_rejeitados: 0,
    registros_deduplicados: 0,
    registros_consolidados: 0,
    message: '',
  })

  // Hook onRecordAfterCreateSuccess processa a prévia
  const processed = await pb.collection('tradepro_sync_jobs').getOne(created.id)
  return mapSyncJobRecord(processed as unknown as Record<string, unknown>)
}

/**
 * Cria job de prévia de Validades e retorna o registro processado com o total de itens e páginas.
 */
export async function requestValidadesPreview(
  dataInicial: string,
  dataFinal: string,
): Promise<SyncJobRecord> {
  const userId = pb.authStore.record?.id || pb.authStore.model?.id
  if (!userId) {
    throw new Error('Usuário não autenticado. Faça login para consultar a prévia.')
  }

  const created = await pb.collection('tradepro_sync_jobs').create({
    action: 'sync_validades',
    requested_by: userId,
    date_start: dataInicial,
    date_end: dataFinal,
    status: 'pending',
    total_informado: 0,
    paginas_total: 0,
    paginas_processadas: 0,
    registros_lidos: 0,
    registros_validos: 0,
    registros_rejeitados: 0,
    registros_deduplicados: 0,
    registros_consolidados: 0,
    message: '',
  })

  // Hook onRecordAfterCreateSuccess processa a prévia
  const processed = await pb.collection('tradepro_sync_jobs').getOne(created.id)
  return mapSyncJobRecord(processed as unknown as Record<string, unknown>)
}

/**
 * Atualiza o job para status='syncing' e faz polling até conclusão, erro ou pausa.
 */
export async function startRupturasSync(
  jobId: string,
  onProgress?: (job: SyncJobRecord) => void,
): Promise<SyncJobRecord> {
  const POLLING_INTERVAL_MS = 1000
  const MAX_POLLS = 600 // até 10 minutos para grandes volumes

  // Dispara o update para 'syncing' assincronamente enquanto o polling pode já estar ativo
  const updatePromise = pb
    .collection('tradepro_sync_jobs')
    .update(jobId, {
      status: 'syncing',
      message: 'Sincronização iniciada...',
    })
    .catch((err) => {
      console.error('[startRupturasSync] Erro no PATCH inicial:', err)
    })

  for (let i = 0; i < MAX_POLLS; i++) {
    try {
      const current = await pb.collection('tradepro_sync_jobs').getOne(jobId)
      const mapped = mapSyncJobRecord(current as unknown as Record<string, unknown>)

      if (onProgress) {
        onProgress(mapped)
      }

      if (
        mapped.status === 'success' ||
        mapped.status === 'error' ||
        mapped.status === 'paused' ||
        mapped.status === 'cancelled'
      ) {
        await updatePromise
        return mapped
      }
    } catch (_) {
      // Ignora falhas esporádicas de consulta durante polling
    }
    await new Promise((resolve) => setTimeout(resolve, POLLING_INTERVAL_MS))
  }

  await updatePromise
  const timeoutRec = await pb.collection('tradepro_sync_jobs').getOne(jobId)
  return mapSyncJobRecord(timeoutRec as unknown as Record<string, unknown>)
}

/**
 * Atualiza o job de Validades para status='syncing' e faz polling até conclusão, erro ou pausa.
 */
export async function startValidadesSync(
  jobId: string,
  onProgress?: (job: SyncJobRecord) => void,
): Promise<SyncJobRecord> {
  const POLLING_INTERVAL_MS = 1000
  const MAX_POLLS = 600 // até 10 minutos para grandes volumes

  // Dispara o update para 'syncing' assincronamente enquanto o polling pode já estar ativo
  const updatePromise = pb
    .collection('tradepro_sync_jobs')
    .update(jobId, {
      status: 'syncing',
      message: 'Sincronização de validades iniciada...',
    })
    .catch((err) => {
      console.error('[startValidadesSync] Erro no PATCH inicial:', err)
    })

  for (let i = 0; i < MAX_POLLS; i++) {
    try {
      const current = await pb.collection('tradepro_sync_jobs').getOne(jobId)
      const mapped = mapSyncJobRecord(current as unknown as Record<string, unknown>)

      if (onProgress) {
        onProgress(mapped)
      }

      if (
        mapped.status === 'success' ||
        mapped.status === 'error' ||
        mapped.status === 'paused' ||
        mapped.status === 'cancelled'
      ) {
        await updatePromise
        return mapped
      }
    } catch (_) {
      // Ignora falhas esporádicas de consulta durante polling
    }
    await new Promise((resolve) => setTimeout(resolve, POLLING_INTERVAL_MS))
  }

  await updatePromise
  const timeoutRec = await pb.collection('tradepro_sync_jobs').getOne(jobId)
  return mapSyncJobRecord(timeoutRec as unknown as Record<string, unknown>)
}

/**
 * Cancela um job em andamento marcando status='cancelled'.
 */
export async function cancelSyncJob(jobId: string): Promise<void> {
  await pb.collection('tradepro_sync_jobs').update(jobId, {
    status: 'cancelled',
    message: 'Sincronização cancelada pelo usuário.',
    finished_at: new Date().toISOString(),
  })
}

/**
 * Consulta tradepro_sync_jobs em busca de jobs interrompidos (status 'error' ou 'paused')
 * com progresso em staging preservado (paginas_processadas > 0) para o mesmo período.
 *
 * Prioriza jobs com maior número de paginas_processadas (mais dados preservados).
 * Ignora jobs de prévia (status='preview' / paginas_processadas=0), concluídos ('success'/'completed') ou cancelados ('cancelled').
 * NUNCA cria nenhum registro novo no banco.
 */
export async function findRetryableSyncJob(
  dataInicial: string,
  dataFinal: string,
  action: 'sync_rupturas' | 'sync_validades' = 'sync_rupturas',
): Promise<SyncJobRecord | null> {
  try {
    const filter = `action = "${action}" && date_start = "${dataInicial}" && date_end = "${dataFinal}" && (status = "error" || status = "paused") && paginas_processadas > 0`
    const records = await pb.collection('tradepro_sync_jobs').getList(1, 10, {
      filter,
      sort: '-paginas_processadas,-created',
    })

    if (!records.items || records.items.length === 0) {
      return null
    }

    // Retorna o primeiro job (com maior paginas_processadas)
    return mapSyncJobRecord(records.items[0] as unknown as Record<string, unknown>)
  } catch (err) {
    console.error(`[findRetryableSyncJob] Erro ao buscar job retryable (${action}):`, err)
    return null
  }
}

export function getTradeProClient() {
  return null
}
