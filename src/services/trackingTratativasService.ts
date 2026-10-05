import pb from '@/lib/pocketbase/client'
import type {
  TrackingTratativa,
  TratativaResultado,
  TratativaStatus,
  TrackingLastKnownState,
} from '@/types/operationalTracking'

export interface CreateTratativaInput {
  industry_id?: string
  industry_name: string
  store_code?: string
  store_name: string
  product_name: string
  product_code?: string
  resultado: TratativaResultado
  usuario_nome: string
  observacao?: string
  resposta?: string
  motivo_identificacao?: string
  ultimo_estado_conhecido_json?: TrackingLastKnownState
  data_identificacao?: string
  status_tratativa?: TratativaStatus
  sugestao_mix_loja?: boolean
}

export async function getTrackingTratativas(params?: {
  industryName?: string
  storeName?: string
  productName?: string
}): Promise<TrackingTratativa[]> {
  try {
    const filters: string[] = []
    if (params?.industryName) {
      filters.push(`industry_name = '${params.industryName.replace(/'/g, "\\'")}'`)
    }
    if (params?.storeName) {
      filters.push(`store_name = '${params.storeName.replace(/'/g, "\\'")}'`)
    }
    if (params?.productName) {
      filters.push(`product_name = '${params.productName.replace(/'/g, "\\'")}'`)
    }

    const filterString = filters.length > 0 ? filters.join(' && ') : undefined

    return await pb.collection('industry_tracking_tratativas').getFullList<TrackingTratativa>({
      filter: filterString,
      sort: '-created',
    })
  } catch (err) {
    console.warn('[trackingTratativasService] Erro ao buscar tratativas:', err)
    return []
  }
}

export async function createTrackingTratativa(
  input: CreateTratativaInput,
): Promise<TrackingTratativa> {
  const payload: Record<string, unknown> = {
    industry_id: input.industry_id || '',
    industry_name: input.industry_name.trim(),
    store_code: input.store_code?.trim() || '',
    store_name: input.store_name.trim(),
    product_name: input.product_name.trim(),
    product_code: input.product_code?.trim() || '',
    resultado: input.resultado,
    usuario_nome: input.usuario_nome?.trim() || 'Operador',
    observacao: input.observacao?.trim() || '',
    resposta: input.resposta?.trim() || '',
    motivo_identificacao: input.motivo_identificacao?.trim() || '',
    ultimo_estado_conhecido_json: input.ultimo_estado_conhecido_json || {},
    data_identificacao: input.data_identificacao || new Date().toISOString(),
    status_tratativa:
      input.status_tratativa ||
      (input.resultado === 'situacao_regularizada' ? 'regularizado' : 'em_andamento'),
    sugestao_mix_loja: Boolean(
      input.sugestao_mix_loja ||
      input.resultado === 'produto_nao_trabalha_mais' ||
      input.resultado === 'mix_loja_precisa_atualizar',
    ),
    data_regularizacao:
      input.resultado === 'situacao_regularizada' ? new Date().toISOString() : undefined,
  }

  const record = await pb
    .collection('industry_tracking_tratativas')
    .create<TrackingTratativa>(payload)
  return record
}
