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

export interface SyncJobRecord {
  id: string
  action: 'sync_rupturas'
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
    action: (record.action as 'sync_rupturas') || 'sync_rupturas',
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
 * Atualiza o job para status='syncing' e faz polling até conclusão, erro ou pausa.
 */
export async function startRupturasSync(
  jobId: string,
  onProgress?: (job: SyncJobRecord) => void,
): Promise<SyncJobRecord> {
  // 1. Atualizar job para 'syncing' para disparar onRecordAfterUpdateSuccess
  await pb.collection('tradepro_sync_jobs').update(jobId, {
    status: 'syncing',
    message: 'Sincronização iniciada...',
  })

  // 2. Polling ativo até estado terminal (success | error | paused | cancelled)
  const POLLING_INTERVAL_MS = 1000
  const MAX_POLLS = 600 // até 10 minutos para grandes volumes

  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise((resolve) => setTimeout(resolve, POLLING_INTERVAL_MS))
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
      return mapped
    }
  }

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

export function getTradeProClient() {
  return null
}
