/**
 * Cliente da API TradePro - Camada de transporte seguro via Coleções Nativas do PocketBase.
 *
 * REGRAS DE SEGURANÇA E ARQUITETURA:
 * - Credenciais e tokens residem ESTRITAMENTE no backend ($os.getenv)
 * - Frontend NUNCA carrega tokens ou Basic Auth em bundle, localStorage ou logs
 * - Teste de conexão é executado criando registros na coleção nativa `tradepro_connection_jobs`
 * - Resposta é processada pelo hook nativo `onRecordAfterCreateSuccess` e lida pelo client
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
    message: `Sincronização do tipo ${tipo} não iniciada diretamente. Utilize a importação de arquivos Excel para atualizar a Base Atual.`,
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

    // 2. Buscar registro atualizado pelo hook (processamento síncrono no PocketBase)
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

export function getTradeProClient() {
  return null
}
