/**
 * Cliente HTTP para comunicação com a API do TradePro (sistema de registros em loja).
 *
 * Configuração via variáveis de ambiente:
 *   - VITE_TRADEPRO_API_URL: URL base da API
 *   - VITE_TRADEPRO_API_TOKEN: Token de autenticação Bearer
 *
 * Se as variáveis não estiverem configuradas, o cliente retorna null através de getTradeProClient(),
 * permitindo fallback transparente para importação via Excel ou dados mock.
 */

export interface TradeProClientConfig {
  baseUrl: string
  apiToken: string
  timeoutMs?: number
  maxRetries?: number
}

/** 23 campos / colunas esperadas para o modelo de Validades do TradePro */
export const VALIDATION_EXPECTED_FIELDS = [
  'razaoSocial',
  'realizado',
  'cliente',
  'produto',
  'quantidade',
  'validade',
  'fornecedor',
] as const

/** 12 campos / colunas esperadas para o modelo de Rupturas do TradePro */
export const RUPTURAS_EXPECTED_FIELDS = ['data_visita', 'produto', 'motivo', 'nome_loja'] as const

export class TradeProApiClient {
  private baseUrl: string
  private apiToken: string
  private timeoutMs: number
  private maxRetries: number

  constructor(config: TradeProClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '')
    this.apiToken = config.apiToken
    this.timeoutMs = config.timeoutMs ?? 30000
    this.maxRetries = config.maxRetries ?? 3
  }

  /**
   * Executa requisição HTTP com timeout e retry com backoff exponencial.
   */
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), this.timeoutMs)

      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(this.apiToken ? { Authorization: `Bearer ${this.apiToken}` } : {}),
          ...((options.headers as Record<string, string>) || {}),
        }

        const response = await fetch(url, {
          ...options,
          headers,
          signal: controller.signal,
        })

        clearTimeout(timer)

        if (!response.ok) {
          let errorDetails = ''
          try {
            const errJson = await response.json()
            errorDetails = errJson.message || errJson.error || JSON.stringify(errJson)
          } catch {
            errorDetails = response.statusText
          }

          if (response.status === 401 || response.status === 403) {
            throw new Error(
              `Erro de autenticação com a API TradePro (${response.status}): Token inválido ou expirado. Verifique VITE_TRADEPRO_API_TOKEN.`,
            )
          }

          if (response.status === 404) {
            throw new Error(
              `Endpoint não encontrado na API TradePro (${response.status}): ${url}. Verifique a URL base.`,
            )
          }

          if (response.status >= 500) {
            throw new Error(
              `Servidor TradePro indisponível (${response.status}): ${errorDetails || 'Erro interno no servidor remoto'}.`,
            )
          }

          throw new Error(
            `Falha na requisição à API TradePro (${response.status}): ${errorDetails || response.statusText}`,
          )
        }

        const data = await response.json()
        return data as T
      } catch (err: unknown) {
        clearTimeout(timer)
        const error = err as Error

        if (error.name === 'AbortError') {
          lastError = new Error(
            `Tempo limite de comunicação esgotado (${this.timeoutMs / 1000}s) ao conectar à API TradePro.`,
          )
        } else {
          lastError = error
        }

        // Não tenta retry para erros 4xx de cliente/auth
        if (
          error.message?.includes('autenticação') ||
          error.message?.includes('Endpoint não encontrado')
        ) {
          throw lastError
        }

        // Se ainda houver tentativas restantes, aguarda backoff exponencial (1s, 2s, 4s...)
        if (attempt < this.maxRetries) {
          const delayMs = Math.pow(2, attempt - 1) * 1000
          await new Promise((resolve) => setTimeout(resolve, delayMs))
        }
      }
    }

    throw (
      lastError ||
      new Error(
        'Não foi possível estabelecer conexão com a API TradePro após múltiplas tentativas.',
      )
    )
  }

  /**
   * Testa conectividade com a API TradePro.
   */
  async testConnection(): Promise<{ success: boolean; message: string; latencyMs: number }> {
    const start = Date.now()
    try {
      // Tenta endpoint de health/status ou endpoint básico
      try {
        await this.request<unknown>('/health', { method: 'GET' })
      } catch (healthErr) {
        // Se endpoint /health não existir (404), tenta buscar 1 registro de validades com limite 1
        const msg = (healthErr as Error).message || ''
        if (msg.includes('404') || msg.includes('não encontrado')) {
          await this.request<unknown>('/validades?limit=1', { method: 'GET' })
        } else {
          throw healthErr
        }
      }

      const latencyMs = Date.now() - start
      return {
        success: true,
        message: 'Conexão com a API TradePro estabelecida com sucesso.',
        latencyMs,
      }
    } catch (err) {
      const latencyMs = Date.now() - start
      return {
        success: false,
        message: `Falha ao testar conexão: ${(err as Error).message}`,
        latencyMs,
      }
    }
  }

  /**
   * Busca registros de Validades na API TradePro e valida o formato retornado.
   * Suporta filtros opcionais de data inicial e final.
   */
  async fetchValidades(from?: Date, to?: Date): Promise<Record<string, unknown>[]> {
    const params = new URLSearchParams()
    if (from) {
      params.append('from', from.toISOString().slice(0, 10))
    }
    if (to) {
      params.append('to', to.toISOString().slice(0, 10))
    }

    const qs = params.toString() ? `?${params.toString()}` : ''
    const response = await this.request<unknown>(`/validades${qs}`, { method: 'GET' })

    // Normaliza resposta (pode ser array direto ou envelopado em { data: [...] } / { items: [...] } / { records: [...] })
    let records: unknown[] = []
    if (Array.isArray(response)) {
      records = response
    } else if (response && typeof response === 'object') {
      const obj = response as Record<string, unknown>
      if (Array.isArray(obj.data)) records = obj.data
      else if (Array.isArray(obj.items)) records = obj.items
      else if (Array.isArray(obj.records)) records = obj.records
      else if (Array.isArray(obj.validades)) records = obj.validades
    }

    if (!Array.isArray(records)) {
      throw new Error(
        'Formato de resposta inválido da API TradePro: era esperado um array de registros de validades.',
      )
    }

    if (records.length === 0) {
      return []
    }

    // Validação de formato do primeiro registro para garantir compatibilidade com o pipeline
    const sample = records[0] as Record<string, unknown>
    if (!sample || typeof sample !== 'object') {
      throw new Error(
        'Os registros retornados pela API TradePro não possuem estrutura de objeto válida.',
      )
    }

    // Verifica campos essenciais ou seus aliases
    const missingFields: string[] = []
    const sampleKeys = Object.keys(sample).map((k) => k.toLowerCase().replace(/[\s_.-]/g, ''))

    const requiredAliases: Record<string, string[]> = {
      razaoSocial: ['razaosocial', 'loja', 'nomefantasia', 'fantasia', 'razao_social'],
      realizado: ['realizado', 'datarealizado', 'data', 'coleta', 'datacoleta', 'data_realizado'],
      cliente: ['cliente', 'fornecedor', 'codcliente', 'cliente_nome'],
      produto: ['produto', 'descricao', 'nomeproduto', 'item', 'produto_nome'],
      quantidade: ['quantidade', 'qtd', 'volume', 'qtde', 'quantidade_unidades'],
      validade: ['validade', 'datavalidade', 'vencimento', 'datavencimento', 'validade_original'],
      fornecedor: ['fornecedor', 'industria', 'fabricante', 'marca'],
    }

    for (const [field, aliases] of Object.entries(requiredAliases)) {
      const hasField = aliases.some((a) =>
        sampleKeys.some((sk) => sk === a || sk.includes(a) || a.includes(sk)),
      )
      if (!hasField) {
        missingFields.push(field)
      }
    }

    if (missingFields.length > 0) {
      throw new Error(
        `A resposta da API de Validades não contém os campos obrigatórios esperados pelo pipeline: ${missingFields.join(
          ', ',
        )}. Verifique o contrato da API TradePro.`,
      )
    }

    return records as Record<string, unknown>[]
  }

  /**
   * Busca registros de Rupturas na API TradePro e valida o formato retornado.
   */
  async fetchRupturas(from?: Date, to?: Date): Promise<Record<string, unknown>[]> {
    const params = new URLSearchParams()
    if (from) {
      params.append('from', from.toISOString().slice(0, 10))
    }
    if (to) {
      params.append('to', to.toISOString().slice(0, 10))
    }

    const qs = params.toString() ? `?${params.toString()}` : ''
    const response = await this.request<unknown>(`/rupturas${qs}`, { method: 'GET' })

    let records: unknown[] = []
    if (Array.isArray(response)) {
      records = response
    } else if (response && typeof response === 'object') {
      const obj = response as Record<string, unknown>
      if (Array.isArray(obj.data)) records = obj.data
      else if (Array.isArray(obj.items)) records = obj.items
      else if (Array.isArray(obj.records)) records = obj.records
      else if (Array.isArray(obj.rupturas)) records = obj.rupturas
    }

    if (!Array.isArray(records)) {
      throw new Error(
        'Formato de resposta inválido da API TradePro: era esperado um array de registros de rupturas.',
      )
    }

    if (records.length === 0) {
      return []
    }

    const sample = records[0] as Record<string, unknown>
    if (!sample || typeof sample !== 'object') {
      throw new Error('Os registros de rupturas retornados pela API não possuem estrutura válida.')
    }

    const sampleKeys = Object.keys(sample).map((k) => k.toLowerCase().replace(/[\s_.-]/g, ''))

    const requiredAliases: Record<string, string[]> = {
      data_visita: ['datavisita', 'data', 'dtvisita', 'datacoleta', 'data_visita'],
      produto: ['produto', 'atividade', 'descricaoproduto', 'item', 'atividadeproduto'],
      motivo: ['motivo', 'tiporuptura', 'motivo_ruptura', 'tipo_ruptura'],
      nome_loja: ['nomeloja', 'razaosocial', 'loja', 'razao_social', 'nome_loja'],
    }

    const missingFields: string[] = []
    for (const [field, aliases] of Object.entries(requiredAliases)) {
      const hasField = aliases.some((a) =>
        sampleKeys.some((sk) => sk === a || sk.includes(a) || a.includes(sk)),
      )
      if (!hasField) {
        missingFields.push(field)
      }
    }

    if (missingFields.length > 0) {
      throw new Error(
        `A resposta da API de Rupturas não contém os campos obrigatórios esperados: ${missingFields.join(
          ', ',
        )}. Verifique o contrato da API TradePro.`,
      )
    }

    return records as Record<string, unknown>[]
  }
}

/**
 * Cria ou obtém a instância singleton do cliente TradePro com base nas variáveis de ambiente.
 * Retorna `null` se `VITE_TRADEPRO_API_URL` ou `VITE_TRADEPRO_API_TOKEN` não estiverem configuradas.
 */
export function getTradeProClient(): TradeProApiClient | null {
  const apiUrl = (import.meta.env.VITE_TRADEPRO_API_URL || '').trim()
  const apiToken = (import.meta.env.VITE_TRADEPRO_API_TOKEN || '').trim()

  if (!apiUrl || !apiToken) {
    return null
  }

  return new TradeProApiClient({
    baseUrl: apiUrl,
    apiToken: apiToken,
  })
}

/**
 * Retorna se as variáveis de ambiente da API TradePro estão configuradas no ambiente atual.
 */
export function isTradeProConfigured(): boolean {
  const apiUrl = (import.meta.env.VITE_TRADEPRO_API_URL || '').trim()
  const apiToken = (import.meta.env.VITE_TRADEPRO_API_TOKEN || '').trim()
  return Boolean(apiUrl && apiToken)
}
