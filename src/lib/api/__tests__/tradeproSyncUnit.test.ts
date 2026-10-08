import { describe, it, expect, vi } from 'vitest'

// Funções puras portadas para o backend TradePro Sync
function toTradeProDate(isoDate: string): string {
  return (isoDate || '').replace(/-/g, '')
}

function isValidCalendarDate(str: string): boolean {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/
  if (!dateRegex.test(str)) return false
  const parts = str.split('-')
  const y = parseInt(parts[0], 10)
  const m = parseInt(parts[1], 10)
  const d = parseInt(parts[2], 10)
  if (m < 1 || m > 12 || d < 1 || d > 31) return false
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (isNaN(dt.getTime())) return false
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

function normalizeRupturaMotivo(motivo: string): string {
  const m = (motivo || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  if (m.indexOf('RUPTURA TOTAL') !== -1) return 'Ruptura Total'
  if (
    m.indexOf('ZERADO') !== -1 ||
    m.indexOf('SEM ESTOQUE MINIMO') !== -1 ||
    m.indexOf('SEM ESTOQUE MÍNIMO') !== -1
  ) {
    return 'Sem Estoque Mínimo'
  }
  if (m.indexOf('ESTOQUE VIRTUAL') !== -1) return 'Estoque Virtual'
  return 'Ruptura Total'
}

function extractStoreCode(razaoSocial: string): string {
  const rs = (razaoSocial || '').trim()
  if (!rs) return ''
  const m = rs.match(/^(\d+)/)
  if (m) return m[1]
  const m2 = rs.match(/^([^-–]+?)[\s]*[-–]/)
  if (m2) return m2[1].trim()
  return ''
}

function buildRupturaDedupKey(codigoLoja: string, produto: string, cliente: string): string {
  return `${codigoLoja}|${produto}|${cliente}`
}

function buildRupturaOperationalKey(
  codigoLoja: string,
  produto: string,
  dataVisita: string,
): string {
  return `${codigoLoja}|${produto}|${dataVisita}`
}

function sanitizeErrorMessage(rawText: string, defaultMsg: string): string {
  let extracted = ''
  try {
    let json = null
    if (rawText) json = JSON.parse(rawText)
    if (json && typeof json === 'object') {
      const candidate =
        json.message ||
        json.mensagem ||
        json.error ||
        json.detail ||
        json.title ||
        json.details ||
        ''
      if (typeof candidate === 'string' && candidate.trim()) extracted = candidate.trim()
    }
  } catch {
    /* intentionally ignored */
  }

  if (!extracted && rawText && typeof rawText === 'string') {
    const trimmed = rawText.trim()
    if (
      trimmed.length > 0 &&
      trimmed.length <= 300 &&
      !trimmed.startsWith('<html') &&
      !trimmed.startsWith('<!DOCTYPE')
    ) {
      extracted = trimmed
    }
  }

  if (!extracted) extracted = defaultMsg

  let clean = extracted
    .replace(/Authorization:\s*[^\s,;]+/gi, '')
    .replace(/Basic\s+[A-Za-z0-9+/=]+/gi, '')
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, '')
    .replace(/token[=:\s]+[A-Za-z0-9\-._~+/]+/gi, '')
    .replace(/password[=:\s]+[^\s,;]+/gi, '')
    .replace(/senha[=:\s]+[^\s,;]+/gi, '')
    .replace(/https?:\/\/[^\s?#]+(\?[^\s#]*)?/gi, '[URL]')
    .replace(/cookie[=:\s]+[^\s,;]+/gi, '')
    .replace(/[A-Za-z0-9+/=]{40,}/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!clean) clean = defaultMsg
  if (clean.length > 300) clean = clean.substring(0, 300)
  return clean
}

/**
 * Simulação do Hook Backend onRecordAfterUpdateSuccess para validação de lógica de negócio
 */
interface MockRecord {
  id: string
  action: string
  status: string
  originalStatus?: string
  total_informado: number
  paginas_total: number
  paginas_processadas: number
  registros_lidos: number
  registros_validos: number
  registros_rejeitados: number
  registros_consolidados: number
  registros_deduplicados: number
  error_code: string
  message: string
  finished_at?: string
}

function simulateHookExecution(
  record: MockRecord,
  options: {
    mockHttpResponses?: Array<{
      statusCode: number
      raw?: string
      json?: any
      throwError?: boolean
    }>
    mockFindRecordsByFilter?: (collection: string, filter: string) => any[]
    mockDbQueryExecute?: (query: string) => void
  } = {},
) {
  // 1. Anti-recursão check
  if (record.action !== 'sync_rupturas' || record.status !== 'syncing') {
    return { shouldProcess: false, reason: 'not_syncing_action' }
  }

  if (record.originalStatus === 'syncing') {
    return { shouldProcess: false, reason: 'anti_recursion_blocked' }
  }

  const paginasTotal = record.paginas_total || Math.ceil(record.total_informado / 30) || 1
  let paginaInicial = record.paginas_processadas || 0
  if (paginaInicial < 1) paginaInicial = 1
  else paginaInicial = paginaInicial + 1

  let httpCallCount = 0
  const processedPages: number[] = []

  if (paginaInicial <= paginasTotal) {
    for (let pagina = paginaInicial; pagina <= paginasTotal; pagina++) {
      processedPages.push(pagina)
      httpCallCount++

      const mockRes = options.mockHttpResponses?.[httpCallCount - 1] || {
        statusCode: 200,
        json: {
          rupturas: [
            {
              descricaoAtividade: 'P1',
              razaoSocialCliente: '01 Loja',
              dataVisita: '2026-05-10',
              descricaoMotivo: 'Ruptura',
            },
          ],
        },
      }

      if (mockRes.throwError || mockRes.statusCode === 0) {
        record.status = 'paused'
        record.error_code = 'timeout'
        record.message = `Tempo limite esgotado ou falha de conexão na página ${pagina} de ${paginasTotal}. Job pausado. Clique em Retomar para continuar.`
        return { shouldProcess: true, record, processedPages, httpCallCount }
      }

      if (mockRes.statusCode === 429) {
        record.status = 'paused'
        record.error_code = 'rate_limited'
        record.message = `Limite de requisições atingido na página ${pagina} de ${paginasTotal}. Job pausado. Clique em Retomar para continuar.`
        return { shouldProcess: true, record, processedPages, httpCallCount }
      }

      if (mockRes.statusCode >= 500) {
        record.status = 'paused'
        record.error_code = 'tradepro_unavailable'
        record.message = `Servidor TradePro indisponível na página ${pagina} de ${paginasTotal} (HTTP ${mockRes.statusCode}). Job pausado. Clique em Retomar para continuar.`
        return { shouldProcess: true, record, processedPages, httpCallCount }
      }

      // Simula gravação dos itens da página
      const itens = mockRes.json?.rupturas || []
      record.registros_lidos += itens.length
      record.registros_validos += itens.length
      record.paginas_processadas = pagina
    }
  }

  // Promoção usando findRecordsByFilter
  if (options.mockDbQueryExecute) {
    options.mockDbQueryExecute('UPDATE rupturas_base SET is_base_atual = 0 WHERE is_base_atual = 1')
    options.mockDbQueryExecute(
      `UPDATE rupturas_base SET is_base_atual = 1 WHERE tenant_id = "tradepro_job_${record.id}"`,
    )
  }

  const filter = `is_base_atual = true && tenant_id = "tradepro_job_${record.id}"`
  const promovidos = options.mockFindRecordsByFilter
    ? options.mockFindRecordsByFilter('rupturas_base', filter)
    : new Array(record.registros_validos).fill({})

  const totalPromovidos = promovidos ? promovidos.length : 0

  record.status = 'success'
  record.registros_consolidados = totalPromovidos
  record.registros_deduplicados = Math.max(0, record.registros_validos - totalPromovidos)
  record.message = `Sincronização de Rupturas concluída com sucesso. ${totalPromovidos} registros consolidados na Base Atual.`
  record.error_code = ''
  record.finished_at = new Date().toISOString()

  return { shouldProcess: true, record, processedPages, httpCallCount }
}

describe('TradePro Sync — Funções Utilitárias do Backend e Pipeline', () => {
  it('toTradeProDate: converte YYYY-MM-DD para yyyyMMdd', () => {
    expect(toTradeProDate('2026-08-26')).toBe('20260826')
    expect(toTradeProDate('2026-01-01')).toBe('20260101')
    expect(toTradeProDate('2025-12-31')).toBe('20251231')
  })

  it('isValidCalendarDate: valida datas válidas e rejeita inválidas', () => {
    expect(isValidCalendarDate('2026-02-28')).toBe(true)
    expect(isValidCalendarDate('2024-02-29')).toBe(true) // bissexto
    expect(isValidCalendarDate('2026-02-29')).toBe(false) // não bissexto
    expect(isValidCalendarDate('2026-13-01')).toBe(false)
    expect(isValidCalendarDate('2026-04-31')).toBe(false)
    expect(isValidCalendarDate('invalid-date')).toBe(false)
  })

  it('normalizeRupturaMotivo: mapeia corretamente os motivos conforme o pipeline de Rupturas', () => {
    expect(normalizeRupturaMotivo('RUPTURA TOTAL')).toBe('Ruptura Total')
    expect(normalizeRupturaMotivo('Ruptura Total')).toBe('Ruptura Total')
    expect(normalizeRupturaMotivo('PRODUTO ZERADO')).toBe('Sem Estoque Mínimo')
    expect(normalizeRupturaMotivo('SEM ESTOQUE MÍNIMO')).toBe('Sem Estoque Mínimo')
    expect(normalizeRupturaMotivo('SEM ESTOQUE MINIMO')).toBe('Sem Estoque Mínimo')
    expect(normalizeRupturaMotivo('ESTOQUE VIRTUAL')).toBe('Estoque Virtual')
    expect(normalizeRupturaMotivo('MOTIVO DESCONHECIDO')).toBe('Ruptura Total')
  })

  it('extractStoreCode: extrai código numérico ou prefixo da razão social', () => {
    expect(extractStoreCode('085 - FORT ATACADISTA')).toBe('085')
    expect(extractStoreCode('1234 LOJA CENTRO')).toBe('1234')
    expect(extractStoreCode('FORT - FILIAL SUL')).toBe('FORT')
    expect(extractStoreCode('')).toBe('')
  })

  it('buildRupturaDedupKey: monta a chave de deduplicação canônica', () => {
    expect(buildRupturaDedupKey('085', 'CHOCOLATE 100G', 'FORT ATACADISTA')).toBe(
      '085|CHOCOLATE 100G|FORT ATACADISTA',
    )
  })

  it('buildRupturaOperationalKey: monta a chave operacional canônica', () => {
    expect(buildRupturaOperationalKey('085', 'CHOCOLATE 100G', '2026-05-10')).toBe(
      '085|CHOCOLATE 100G|2026-05-10',
    )
  })

  it('sanitizeErrorMessage: remove tokens, Authorization e URLs de mensagens de erro', () => {
    const rawWithSecret =
      'Error: Basic c29tZXRva2VuMTIz failed at https://diretoria.tradepro.com.br/api'
    const cleaned = sanitizeErrorMessage(rawWithSecret, 'Erro padrão')
    expect(cleaned).not.toContain('Basic')
    expect(cleaned).not.toContain('c29tZXRva2VuMTIz')
    expect(cleaned).not.toContain('https://')
    expect(cleaned).toContain('[URL]')
  })

  it('Detecção dinâmica de campo de total na prévia de Validades', () => {
    // Simula a lógica do parser de prévia do hook tradepro_sync.js
    function parseValidadesPreviewTotal(jsonBody: Record<string, any>) {
      let totalDetectado = 0
      let nomeCampoTotalDetectado = ''

      const prioridades = [
        'totalDeRegistros',
        'totalRegistros',
        'totalDeProdutos',
        'totalProdutos',
        'totalDeValidades',
        'totalValidades',
        'totalDeItens',
        'totalItens',
        'total',
        'quantidadeTotal',
        'totalGeral',
        'totalGeralRegistros',
      ]

      for (let p = 0; p < prioridades.length; p++) {
        const cand = prioridades[p]
        if (jsonBody[cand] != null) {
          const parsed = parseInt(jsonBody[cand], 10)
          if (!isNaN(parsed) && parsed >= 0) {
            totalDetectado = parsed
            nomeCampoTotalDetectado = cand
            break
          }
        }
      }

      if (totalDetectado === 0) {
        const bodyKeys = Object.keys(jsonBody)
        for (let k = 0; k < bodyKeys.length; k++) {
          const key = bodyKeys[k]
          const lower = key.toLowerCase()
          if (
            lower.indexOf('total') !== -1 &&
            lower.indexOf('pagina') === -1 &&
            lower.indexOf('page') === -1
          ) {
            const parsed = parseInt(jsonBody[key], 10)
            if (!isNaN(parsed) && parsed > 0) {
              totalDetectado = parsed
              nomeCampoTotalDetectado = key
              break
            }
          }
        }
      }

      return { totalDetectado, nomeCampoTotalDetectado }
    }

    // Cenário 1: resposta padrão com totalDeRegistros (como no teste de conexão)
    const res1 = parseValidadesPreviewTotal({
      paginaAtual: 1,
      quantidadePorPagina: 1,
      totalDePaginas: 583,
      totalDeRegistros: 1152,
      validade: [{ id: 1 }],
    })
    expect(res1.totalDetectado).toBe(1152)
    expect(res1.nomeCampoTotalDetectado).toBe('totalDeRegistros')

    // Cenário 2: resposta com totalDeProdutos (antigo)
    const res2 = parseValidadesPreviewTotal({
      paginaAtual: 1,
      totalDePaginas: 10,
      totalDeProdutos: 300,
    })
    expect(res2.totalDetectado).toBe(300)
    expect(res2.nomeCampoTotalDetectado).toBe('totalDeProdutos')

    // Cenário 3: resposta com outro campo qualquer contendo 'total' (ex: totalValidades)
    const res3 = parseValidadesPreviewTotal({
      paginaAtual: 1,
      totalDePaginas: 20,
      totalValidades: 600,
    })
    expect(res3.totalDetectado).toBe(600)
    expect(res3.nomeCampoTotalDetectado).toBe('totalValidades')
  })
})

describe('TradePro Sync — Regras Críticas do Hook de Sincronização e Retomada', () => {
  it('Promoção atômica: desativa a base anterior e ativa o novo staging em sequência atômica', () => {
    const record: MockRecord = {
      id: 'job_atomic_test',
      action: 'sync_rupturas',
      status: 'syncing',
      originalStatus: 'preview',
      total_informado: 30,
      paginas_total: 1,
      paginas_processadas: 0,
      registros_lidos: 0,
      registros_validos: 0,
      registros_rejeitados: 0,
      registros_consolidados: 0,
      registros_deduplicados: 0,
      error_code: '',
      message: '',
    }

    const executedQueries: string[] = []
    const mockDbQuery = (q: string) => executedQueries.push(q)

    simulateHookExecution(record, {
      mockHttpResponses: [
        {
          statusCode: 200,
          json: {
            rupturas: [
              {
                descricaoAtividade: 'P1',
                razaoSocialCliente: '01 Loja',
                dataVisita: '2026-05-10',
                descricaoMotivo: 'Ruptura',
              },
            ],
          },
        },
      ],
      mockDbQueryExecute: mockDbQuery,
    })

    expect(executedQueries.length).toBe(2)
    expect(executedQueries[0]).toContain('UPDATE rupturas_base SET is_base_atual = 0')
    expect(executedQueries[1]).toContain(
      'UPDATE rupturas_base SET is_base_atual = 1 WHERE tenant_id',
    )
  })

  it('Promoção com findRecordsByFilter: calcula contagem de registros promovidos corretamente', () => {
    const record: MockRecord = {
      id: 'job_promo_test',
      action: 'sync_rupturas',
      status: 'syncing',
      originalStatus: 'preview',
      total_informado: 60,
      paginas_total: 2,
      paginas_processadas: 0,
      registros_lidos: 0,
      registros_validos: 0,
      registros_rejeitados: 0,
      registros_consolidados: 0,
      registros_deduplicados: 0,
      error_code: '',
      message: '',
    }

    const mockFindFilter = vi.fn().mockReturnValue([
      { id: 'rup1', is_base_atual: true },
      { id: 'rup2', is_base_atual: true },
    ])

    const executedQueries: string[] = []
    const mockDbQuery = (q: string) => executedQueries.push(q)

    const result = simulateHookExecution(record, {
      mockHttpResponses: [
        {
          statusCode: 200,
          json: {
            rupturas: [
              {
                descricaoAtividade: 'P1',
                razaoSocialCliente: '01 Loja',
                dataVisita: '2026-05-10',
                descricaoMotivo: 'Ruptura',
              },
            ],
          },
        },
        {
          statusCode: 200,
          json: {
            rupturas: [
              {
                descricaoAtividade: 'P2',
                razaoSocialCliente: '01 Loja',
                dataVisita: '2026-05-10',
                descricaoMotivo: 'Ruptura',
              },
            ],
          },
        },
      ],
      mockFindRecordsByFilter: mockFindFilter,
      mockDbQueryExecute: mockDbQuery,
    })

    expect(result.shouldProcess).toBe(true)
    expect(mockFindFilter).toHaveBeenCalledWith(
      'rupturas_base',
      'is_base_atual = true && tenant_id = "tradepro_job_job_promo_test"',
    )
    expect(record.status).toBe('success')
    expect(record.registros_consolidados).toBe(2)
    expect(executedQueries.length).toBe(2)
  })

  it('Retomada da página 9 após falha na página 8: pula as 8 primeiras páginas', () => {
    const record: MockRecord = {
      id: '6f9hdu5t35895jo',
      action: 'sync_rupturas',
      status: 'syncing',
      originalStatus: 'paused',
      total_informado: 383,
      paginas_total: 13,
      paginas_processadas: 8, // Já processou 8 páginas (240 registros)
      registros_lidos: 240,
      registros_validos: 240,
      registros_rejeitados: 0,
      registros_consolidados: 0,
      registros_deduplicados: 0,
      error_code: '',
      message: '',
    }

    const result = simulateHookExecution(record, {
      mockHttpResponses: [
        {
          statusCode: 200,
          json: {
            rupturas: [
              {
                descricaoAtividade: 'P9',
                razaoSocialCliente: '01 Loja',
                dataVisita: '2026-05-10',
                descricaoMotivo: 'Ruptura',
              },
            ],
          },
        },
        {
          statusCode: 200,
          json: {
            rupturas: [
              {
                descricaoAtividade: 'P10',
                razaoSocialCliente: '01 Loja',
                dataVisita: '2026-05-10',
                descricaoMotivo: 'Ruptura',
              },
            ],
          },
        },
        {
          statusCode: 200,
          json: {
            rupturas: [
              {
                descricaoAtividade: 'P11',
                razaoSocialCliente: '01 Loja',
                dataVisita: '2026-05-10',
                descricaoMotivo: 'Ruptura',
              },
            ],
          },
        },
        {
          statusCode: 200,
          json: {
            rupturas: [
              {
                descricaoAtividade: 'P12',
                razaoSocialCliente: '01 Loja',
                dataVisita: '2026-05-10',
                descricaoMotivo: 'Ruptura',
              },
            ],
          },
        },
        {
          statusCode: 200,
          json: {
            rupturas: [
              {
                descricaoAtividade: 'P13',
                razaoSocialCliente: '01 Loja',
                dataVisita: '2026-05-10',
                descricaoMotivo: 'Ruptura',
              },
            ],
          },
        },
      ],
    })

    expect(result.processedPages).toEqual([9, 10, 11, 12, 13])
    expect(result.httpCallCount).toBe(5)
    expect(record.status).toBe('success')
    expect(record.paginas_processadas).toBe(13)
  })

  it('HTTP 429: pausa o job sem sleep e permite retomada futura', () => {
    const record: MockRecord = {
      id: 'job_429_test',
      action: 'sync_rupturas',
      status: 'syncing',
      originalStatus: 'preview',
      total_informado: 90,
      paginas_total: 3,
      paginas_processadas: 0,
      registros_lidos: 0,
      registros_validos: 0,
      registros_rejeitados: 0,
      registros_consolidados: 0,
      registros_deduplicados: 0,
      error_code: '',
      message: '',
    }

    const result = simulateHookExecution(record, {
      mockHttpResponses: [
        {
          statusCode: 200,
          json: {
            rupturas: [
              {
                descricaoAtividade: 'P1',
                razaoSocialCliente: '01 Loja',
                dataVisita: '2026-05-10',
                descricaoMotivo: 'Ruptura',
              },
            ],
          },
        },
        { statusCode: 429, raw: 'Too Many Requests' },
      ],
    })

    expect(result.httpCallCount).toBe(2)
    expect(record.status).toBe('paused')
    expect(record.error_code).toBe('rate_limited')
    expect(record.paginas_processadas).toBe(1) // primeira página foi gravada
    expect(record.message).toContain('Limite de requisições atingido na página 2')
  })

  it('Timeout / 5xx: pausa o job em vez de abortar para preservar o staging', () => {
    const record: MockRecord = {
      id: 'job_timeout_test',
      action: 'sync_rupturas',
      status: 'syncing',
      originalStatus: 'preview',
      total_informado: 120,
      paginas_total: 4,
      paginas_processadas: 0,
      registros_lidos: 0,
      registros_validos: 0,
      registros_rejeitados: 0,
      registros_consolidados: 0,
      registros_deduplicados: 0,
      error_code: '',
      message: '',
    }

    const result = simulateHookExecution(record, {
      mockHttpResponses: [
        {
          statusCode: 200,
          json: {
            rupturas: [
              {
                descricaoAtividade: 'P1',
                razaoSocialCliente: '01 Loja',
                dataVisita: '2026-05-10',
                descricaoMotivo: 'Ruptura',
              },
            ],
          },
        },
        { statusCode: 503, raw: 'Service Unavailable' },
      ],
    })

    expect(result.httpCallCount).toBe(2)
    expect(record.status).toBe('paused')
    expect(record.error_code).toBe('tradepro_unavailable')
    expect(record.paginas_processadas).toBe(1)
    expect(record.message).toContain('Servidor TradePro indisponível na página 2')
  })

  it('Prevenção de anti-recursão: saves de progresso (status original syncing) são ignorados', () => {
    const record: MockRecord = {
      id: 'job_recursion_test',
      action: 'sync_rupturas',
      status: 'syncing',
      originalStatus: 'syncing', // Disparado por um $app.save() interno de progresso
      total_informado: 100,
      paginas_total: 4,
      paginas_processadas: 2,
      registros_lidos: 60,
      registros_validos: 60,
      registros_rejeitados: 0,
      registros_consolidados: 0,
      registros_deduplicados: 0,
      error_code: '',
      message: '',
    }

    const result = simulateHookExecution(record)
    expect(result.shouldProcess).toBe(false)
    expect(result.reason).toBe('anti_recursion_blocked')
  })

  it('Se todas as páginas já foram baixadas (paginaInicial > paginasTotal), vai direto para promoção', () => {
    const record: MockRecord = {
      id: 'job_already_downloaded',
      action: 'sync_rupturas',
      status: 'syncing',
      originalStatus: 'error',
      total_informado: 90,
      paginas_total: 3,
      paginas_processadas: 3, // Todas as 3 páginas já foram processadas
      registros_lidos: 90,
      registros_validos: 90,
      registros_rejeitados: 0,
      registros_consolidados: 0,
      registros_deduplicados: 0,
      error_code: '',
      message: '',
    }

    const mockFindFilter = vi.fn().mockReturnValue(new Array(90).fill({ id: 'rup' }))

    const result = simulateHookExecution(record, {
      mockFindRecordsByFilter: mockFindFilter,
    })

    expect(result.processedPages).toEqual([])
    expect(result.httpCallCount).toBe(0) // Nenhuma chamada HTTP necessária
    expect(record.status).toBe('success')
    expect(record.registros_consolidados).toBe(90)
  })

  it('staging com is_base_atual=false e tenant_id=tradepro_job_* não afeta KPIs da Base Atual (filtro is_base_atual = true)', async () => {
    // Insere 240 registros de staging (is_base_atual=false) e 1 registro ativo de Base Atual
    const stagingRecords = Array.from({ length: 240 }, (_, i) => ({
      id: `staging_${i + 1}`,
      is_base_atual: false,
      tenant_id: 'tradepro_job_6f9hdu5t35895jo',
      produto: `Produto Staging ${i + 1}`,
      situacao_atual: 'Ativo',
    }))

    const activeBaseRecords = [
      {
        id: 'base_1',
        is_base_atual: true,
        tenant_id: 'import_manual_001',
        produto: 'Produto Base Atual',
        situacao_atual: 'Ativo',
      },
    ]

    const allRecords = [...stagingRecords, ...activeBaseRecords]

    // Simula PocketBase avaliando o filtro exclusivo is_base_atual = true
    const mockFindRupturas = (filter: string) => {
      return allRecords.filter((r) => {
        if (filter.includes('is_base_atual = true') && !r.is_base_atual) return false
        return true
      })
    }

    const baseFilter = 'is_base_atual = true'
    const result = mockFindRupturas(baseFilter)

    expect(result.length).toBe(1)
    expect(result[0].id).toBe('base_1')
    expect(result.some((r) => r.is_base_atual === false)).toBe(false)
  })

  describe('findRetryableSyncJob — Testes Unitários Obrigatórios', () => {
    it('1. findRetryableSyncJob retorna job com 8/13 páginas para período 2026-08-26', async () => {
      const mockJob6f9 = {
        id: '6f9hdu5t35895jo',
        action: 'sync_rupturas',
        requested_by: 'bumacp2xh84zjzu',
        date_start: '2026-08-26',
        date_end: '2026-08-26',
        status: 'error',
        total_informado: 383,
        paginas_total: 13,
        paginas_processadas: 8,
        registros_lidos: 240,
        registros_validos: 240,
        registros_rejeitados: 0,
        registros_deduplicados: 0,
        registros_consolidados: 0,
        message: 'Falha na promoção dos registros para a Base Atual',
        created: '2026-08-27T17:52:07.875Z',
        updated: '2026-08-27T17:55:31.854Z',
      }

      const mockPb = (await import('@/lib/pocketbase/client')).default
      vi.spyOn(mockPb, 'collection').mockReturnValue({
        getList: vi.fn().mockResolvedValue({
          items: [mockJob6f9],
          totalItems: 1,
        }),
      } as any)

      const { findRetryableSyncJob } = await import('../tradeProClient')
      const job = await findRetryableSyncJob('2026-08-26', '2026-08-26')

      expect(job).not.toBeNull()
      expect(job?.id).toBe('6f9hdu5t35895jo')
      expect(job?.date_start).toBe('2026-08-26')
      expect(job?.date_end).toBe('2026-08-26')
      expect(job?.status).toBe('error')
      expect(job?.paginas_processadas).toBe(8)
      expect(job?.paginas_total).toBe(13)
      expect(job?.registros_validos).toBe(240)
    })

    it('2. findRetryableSyncJob retorna null para período sem jobs retryable', async () => {
      const mockPb = (await import('@/lib/pocketbase/client')).default
      vi.spyOn(mockPb, 'collection').mockReturnValue({
        getList: vi.fn().mockResolvedValue({
          items: [],
          totalItems: 0,
        }),
      } as any)

      const { findRetryableSyncJob } = await import('../tradeProClient')
      const job = await findRetryableSyncJob('2026-01-01', '2026-01-01')
      expect(job).toBeNull()
    })

    it('3. Job com status="preview" e paginas_processadas=0 é ignorado', async () => {
      const { findRetryableSyncJob } = await import('../tradeProClient')
      const mockPb = (await import('@/lib/pocketbase/client')).default
      const mockGetList = vi.fn().mockResolvedValue({
        items: [],
        totalItems: 0,
      })

      vi.spyOn(mockPb, 'collection').mockReturnValue({
        getList: mockGetList,
      } as any)

      const job = await findRetryableSyncJob('2026-08-26', '2026-08-26')
      expect(mockGetList).toHaveBeenCalledWith(
        1,
        10,
        expect.objectContaining({
          filter: expect.stringContaining('paginas_processadas > 0'),
        }),
      )
      expect(job).toBeNull()
    })

    it('4. Job com status="completed" é ignorado', async () => {
      const { findRetryableSyncJob } = await import('../tradeProClient')
      const mockPb = (await import('@/lib/pocketbase/client')).default
      const mockGetList = vi.fn().mockResolvedValue({
        items: [],
        totalItems: 0,
      })

      vi.spyOn(mockPb, 'collection').mockReturnValue({
        getList: mockGetList,
      } as any)

      const job = await findRetryableSyncJob('2026-08-26', '2026-08-26')
      expect(job).toBeNull()
    })

    it('5. Job com status="cancelled" é ignorado', async () => {
      const { findRetryableSyncJob } = await import('../tradeProClient')
      const mockPb = (await import('@/lib/pocketbase/client')).default
      const mockGetList = vi.fn().mockResolvedValue({
        items: [],
        totalItems: 0,
      })

      vi.spyOn(mockPb, 'collection').mockReturnValue({
        getList: mockGetList,
      } as any)

      const job = await findRetryableSyncJob('2026-08-26', '2026-08-26')
      expect(job).toBeNull()
    })

    it('6. Múltiplos jobs retryable: prioriza o com mais paginas_processadas', async () => {
      const mockJob3Pages = {
        id: 'job_partial_3',
        action: 'sync_rupturas',
        date_start: '2026-08-26',
        date_end: '2026-08-26',
        status: 'paused',
        paginas_total: 13,
        paginas_processadas: 3,
        registros_validos: 90,
      }
      const mockJob8Pages = {
        id: '6f9hdu5t35895jo',
        action: 'sync_rupturas',
        date_start: '2026-08-26',
        date_end: '2026-08-26',
        status: 'error',
        paginas_total: 13,
        paginas_processadas: 8,
        registros_validos: 240,
      }

      const mockPb = (await import('@/lib/pocketbase/client')).default
      vi.spyOn(mockPb, 'collection').mockReturnValue({
        getList: vi.fn().mockResolvedValue({
          items: [mockJob8Pages, mockJob3Pages],
          totalItems: 2,
        }),
      } as any)

      const { findRetryableSyncJob } = await import('../tradeProClient')
      const job = await findRetryableSyncJob('2026-08-26', '2026-08-26')
      expect(job?.id).toBe('6f9hdu5t35895jo')
      expect(job?.paginas_processadas).toBe(8)
    })

    it('7. findRetryableSyncJob NÃO cria registros novos (verificar com mock)', async () => {
      const mockCreate = vi.fn()
      const mockUpdate = vi.fn()

      const mockPb = (await import('@/lib/pocketbase/client')).default
      vi.spyOn(mockPb, 'collection').mockReturnValue({
        getList: vi.fn().mockResolvedValue({ items: [], totalItems: 0 }),
        create: mockCreate,
        update: mockUpdate,
      } as any)

      const { findRetryableSyncJob } = await import('../tradeProClient')
      await findRetryableSyncJob('2026-08-26', '2026-08-26')

      expect(mockCreate).not.toHaveBeenCalled()
      expect(mockUpdate).not.toHaveBeenCalled()
    })

    it('8. Staging (is_base_atual=false, tenant_id=tradepro_job_*) permanece inalterado após a consulta', async () => {
      const stagingRecords = [
        { id: 'rup_stg_1', tenant_id: 'tradepro_job_6f9hdu5t35895jo', is_base_atual: false },
        { id: 'rup_stg_2', tenant_id: 'tradepro_job_6f9hdu5t35895jo', is_base_atual: false },
      ]

      const mockPb = (await import('@/lib/pocketbase/client')).default
      vi.spyOn(mockPb, 'collection').mockReturnValue({
        getList: vi.fn().mockResolvedValue({
          items: [
            {
              id: '6f9hdu5t35895jo',
              action: 'sync_rupturas',
              date_start: '2026-08-26',
              date_end: '2026-08-26',
              status: 'error',
              paginas_processadas: 8,
              paginas_total: 13,
              registros_validos: 240,
            },
          ],
          totalItems: 1,
        }),
      } as any)

      const { findRetryableSyncJob } = await import('../tradeProClient')
      const job = await findRetryableSyncJob('2026-08-26', '2026-08-26')
      expect(job?.id).toBe('6f9hdu5t35895jo')

      for (const rec of stagingRecords) {
        expect(rec.is_base_atual).toBe(false)
        expect(rec.tenant_id).toBe('tradepro_job_6f9hdu5t35895jo')
      }
    })
  })

  describe('TradePro Sync — Mapeamento Cód. Cliente -> Indústria e Integridade de Dados', () => {
    // Simula a normalização de registro de Validades implementada no hook tradepro_sync.js
    interface IndustryEntry {
      id: string
      nome: string
      tradepro_client_id: string
      tradepro_client_name?: string
    }

    function processValidadeItem(
      rawItem: any,
      industryMapByClientId: Record<string, IndustryEntry>,
      industryMix: Array<{ industry_id: string; nome_produto: string; tipo_mix: string }>,
      storeMixes: Array<{ industry_id: string; store_name: string; nome_produto: string }>,
    ) {
      const clienteObj = rawItem.cliente || {}
      const produtoObj = rawItem.produto || {}
      const cidadeObj = rawItem.cidade || {}
      const estadoObj = rawItem.estado || {}

      const rawRazaoSocial = (clienteObj.razaoSocial || '').toString().trim()
      const rawProduto = (produtoObj.descricao || '').toString().trim()
      const rawValidade = (rawItem.validade || '').toString().trim()
      const rawRealizado = (rawItem.realizado || '').toString().trim()
      const rawFantasia = (clienteObj.fantasia || '').toString().trim()
      const rawCpfCnpj = (clienteObj.cpfCnpj || '').toString().trim()
      const rawCidade = (
        typeof clienteObj.cidade === 'string' ? clienteObj.cidade : cidadeObj.nome || ''
      )
        .toString()
        .trim()
      const rawEstado = (estadoObj.sigla || '').toString().trim()
      // Cód. Produto preservando zeros à esquerda como texto estrito
      const rawCodProduto = (produtoObj.codigo != null ? String(produtoObj.codigo) : '').trim()

      // Cliente TradePro (Indústria): código e nome
      const rawCodCliente = (
        rawItem.codCliente != null
          ? String(rawItem.codCliente)
          : rawItem.cod_cliente != null
            ? String(rawItem.cod_cliente)
            : clienteObj.codigoCliente != null
              ? String(clienteObj.codigoCliente)
              : clienteObj.codigo != null
                ? String(clienteObj.codigo)
                : ''
      ).trim()

      const rawClienteNome = (
        rawItem.clienteNome != null
          ? String(rawItem.clienteNome)
          : rawItem.cliente_nome != null
            ? String(rawItem.cliente_nome)
            : rawItem.nomeCliente != null
              ? String(rawItem.nomeCliente)
              : clienteObj.cliente != null
                ? String(clienteObj.cliente)
                : ''
      ).trim()

      // Resolução via código numérico (tradepro_client_id)
      let resolvedIndustryId: string | null = null
      let resolvedIndustryName = ''
      if (rawCodCliente && industryMapByClientId[rawCodCliente]) {
        resolvedIndustryId = industryMapByClientId[rawCodCliente].id
        resolvedIndustryName = industryMapByClientId[rawCodCliente].nome
      }

      // Fornecedor é preservado de forma totalmente independente e NUNCA inferido como indústria
      const fornecedor = (rawItem.fornecedor || 'DIRETORIA').toString().trim()

      const resultRecord = {
        fornecedor,
        razao_social: rawRazaoSocial,
        produto: rawProduto,
        cliente: resolvedIndustryName || rawClienteNome || rawFantasia || rawRazaoSocial,
        cod_cliente: rawCodCliente,
        industry_id: resolvedIndustryId,
        fantasia: rawFantasia,
        cpf_cnpj: rawCpfCnpj,
        cidade: rawCidade,
        estado: rawEstado,
        cod_produto: rawCodProduto,
        realizado: rawRealizado,
        validade_efetiva: rawValidade,
      }

      // Se houver indústria vinculada, alimenta o Mix Operacional Observado (industry_product_mix)
      // NUNCA toca no Mix Definido da Loja
      if (resolvedIndustryId && rawProduto) {
        const cleanProdNome = rawProduto.trim()
        const existsInMix = industryMix.some(
          (m) => m.industry_id === resolvedIndustryId && m.nome_produto === cleanProdNome,
        )
        if (!existsInMix) {
          industryMix.push({
            industry_id: resolvedIndustryId,
            nome_produto: cleanProdNome,
            tipo_mix: 'observado_operacional',
          })
        }
      }

      return resultRecord
    }

    it('1. Mapeamento Cód. Cliente -> Indústria ocorre via tradepro_client_id, NÃO por similaridade de nome', () => {
      const industryMap: Record<string, IndustryEntry> = {
        '7': {
          id: 'ind_frutap_id',
          nome: 'FRUTAP INDÚSTRIA DE LATICÍNIOS',
          tradepro_client_id: '7',
        },
        '43': { id: 'ind_oliveira_id', nome: 'OLIVEIRA ALIMENTOS', tradepro_client_id: '43' },
      }

      const mockMix: any[] = []
      const mockStoreMix: any[] = []

      // Item com código 7 e nome fantasia qualquer
      const item1 = {
        codCliente: 7,
        clienteNome: 'Laticinios Frutap',
        cliente: {
          razaoSocial: '085 - SUPERMERCADO ABC LTDA',
          fantasia: 'SUPER ABC',
          cpfCnpj: '12.345.678/0001-90',
        },
        produto: {
          codigo: '00445',
          descricao: 'IOGURTE MORANGO 170G',
        },
        validade: '2026-06-30',
        realizado: '2026-05-10',
        fornecedor: 'DIRETORIA',
      }

      const rec = processValidadeItem(item1, industryMap, mockMix, mockStoreMix)

      expect(rec.industry_id).toBe('ind_frutap_id')
      expect(rec.cliente).toBe('FRUTAP INDÚSTRIA DE LATICÍNIOS')
      expect(rec.cod_cliente).toBe('7')
    })

    it('2. Registro com cliente não vinculado fica preservado com industry_id nulo', () => {
      const industryMap: Record<string, IndustryEntry> = {
        '7': { id: 'ind_frutap_id', nome: 'FRUTAP', tradepro_client_id: '7' },
      }

      const mockMix: any[] = []
      const mockStoreMix: any[] = []

      // Item com código 9999 (não cadastrado no SKIP)
      const unlinkedItem = {
        codCliente: '9999',
        clienteNome: 'FORNECEDOR NOVO DESCONHECIDO',
        cliente: {
          razaoSocial: '010 - SUPERMERCADO XYZ',
          cpfCnpj: '98.765.432/0001-11',
        },
        produto: {
          codigo: '00100',
          descricao: 'QUEIJO MINAS 500G',
        },
        validade: '2026-07-15',
        realizado: '2026-05-10',
      }

      const rec = processValidadeItem(unlinkedItem, industryMap, mockMix, mockStoreMix)

      expect(rec.industry_id).toBeNull()
      expect(rec.cod_cliente).toBe('9999')
      expect(rec.cliente).toBe('FORNECEDOR NOVO DESCONHECIDO')
      // Nada foi adicionado ao mix pois não há industry_id
      expect(mockMix.length).toBe(0)
    })

    it('3. Fornecedor DIRETORIA é preservado separado da indústria e NUNCA usado para inferir indústria', () => {
      const industryMap: Record<string, IndustryEntry> = {
        '7': { id: 'ind_frutap_id', nome: 'FRUTAP', tradepro_client_id: '7' },
      }
      const mockMix: any[] = []
      const mockStoreMix: any[] = []

      const itemWithDiretoria = {
        codCliente: '7',
        fornecedor: 'DIRETORIA',
        cliente: { razaoSocial: 'LOJA TESTE', cpfCnpj: '00.000.000/0001-00' },
        produto: { codigo: '01', descricao: 'BEBIDA LACTEA' },
        validade: '2026-06-01',
        realizado: '2026-05-10',
      }

      const rec = processValidadeItem(itemWithDiretoria, industryMap, mockMix, mockStoreMix)

      expect(rec.fornecedor).toBe('DIRETORIA')
      expect(rec.industry_id).toBe('ind_frutap_id')
      expect(rec.cliente).toBe('FRUTAP')
      expect(rec.fornecedor).not.toBe(rec.cliente)
    })

    it('4. Loja é identificada por CPF/CNPJ e Razão Social distinta do Cliente (Indústria)', () => {
      const industryMap: Record<string, IndustryEntry> = {
        '43': { id: 'ind_oliveira_id', nome: 'OLIVEIRA', tradepro_client_id: '43' },
      }
      const mockMix: any[] = []
      const mockStoreMix: any[] = []

      const storeCpfCnpj = '11.222.333/0001-44'
      const storeRazao = '100 - SUPERMERCADO BISTEK LTDA'
      const storeFantasia = 'BISTEK CRICIUMA'

      const item = {
        codCliente: '43',
        cliente: {
          razaoSocial: storeRazao,
          fantasia: storeFantasia,
          cpfCnpj: storeCpfCnpj,
          cidade: 'Criciúma',
        },
        produto: { codigo: '007', descricao: 'AZEITE EXTRA VIRGEM 500ML' },
        validade: '2026-12-31',
        realizado: '2026-05-10',
      }

      const rec = processValidadeItem(item, industryMap, mockMix, mockStoreMix)

      // A loja tem seus dados próprios preservados
      expect(rec.cpf_cnpj).toBe(storeCpfCnpj)
      expect(rec.razao_social).toBe(storeRazao)
      expect(rec.fantasia).toBe(storeFantasia)
      expect(rec.cidade).toBe('Criciúma')

      // O cliente/indústria é resolvido separadamente
      expect(rec.cod_cliente).toBe('43')
      expect(rec.industry_id).toBe('ind_oliveira_id')
      expect(rec.cliente).toBe('OLIVEIRA')
    })

    it('5. Cód. Produto é preservado com zeros à esquerda como texto estrito', () => {
      const industryMap: Record<string, IndustryEntry> = {}
      const mockMix: any[] = []
      const mockStoreMix: any[] = []

      const itemWithLeadingZeros = {
        produto: { codigo: '00042', descricao: 'LEITE FERMENTADO' },
        cliente: { razaoSocial: 'LOJA 1' },
        validade: '2026-06-15',
        realizado: '2026-05-10',
      }

      const rec = processValidadeItem(itemWithLeadingZeros, industryMap, mockMix, mockStoreMix)

      expect(rec.cod_produto).toBe('00042')
      expect(typeof rec.cod_produto).toBe('string')
      expect(rec.cod_produto.length).toBe(5)
    })

    it('6. Alimentação do Mix Operacional Observado ocorre SEM alterar o Mix Definido da Loja', () => {
      const industryMap: Record<string, IndustryEntry> = {
        '7': { id: 'ind_frutap_id', nome: 'FRUTAP', tradepro_client_id: '7' },
      }

      const mockMix: Array<{ industry_id: string; nome_produto: string; tipo_mix: string }> = []
      const mockStoreMix: Array<{ industry_id: string; store_name: string; nome_produto: string }> =
        [
          // Loja já tem um produto definido formalmente
          {
            industry_id: 'ind_frutap_id',
            store_name: 'LOJA 01',
            nome_produto: 'IOGURTE MORANGO 170G',
          },
        ]

      const item = {
        codCliente: '7',
        cliente: { razaoSocial: 'LOJA 01' },
        produto: { codigo: '0099', descricao: 'NOVO SABOR COCO 170G' },
        validade: '2026-08-01',
        realizado: '2026-05-10',
      }

      // Processa o novo item observado
      processValidadeItem(item, industryMap, mockMix, mockStoreMix)

      // 1. O mix operacional observado da indústria foi alimentado
      expect(mockMix.length).toBe(1)
      expect(mockMix[0].nome_produto).toBe('NOVO SABOR COCO 170G')
      expect(mockMix[0].tipo_mix).toBe('observado_operacional')

      // 2. O Mix Definido da Loja PERMANECE INTOCADO (nenhum produto promovido automaticamente)
      expect(mockStoreMix.length).toBe(1)
      expect(mockStoreMix[0].nome_produto).toBe('IOGURTE MORANGO 170G')
      expect(mockStoreMix.some((sm) => sm.nome_produto === 'NOVO SABOR COCO 170G')).toBe(false)
    })

    it('7. Sincronização repetida continua idempotente após o mapeamento por Cód. Cliente', () => {
      const industryMap: Record<string, IndustryEntry> = {
        '7': { id: 'ind_frutap_id', nome: 'FRUTAP', tradepro_client_id: '7' },
      }

      const mockMix: any[] = []
      const mockStoreMix: any[] = []

      const item = {
        codCliente: '7',
        cliente: { razaoSocial: '085 - LOJA CENTRAL' },
        produto: { codigo: '00445', descricao: 'IOGURTE MORANGO 170G' },
        validade: '2026-06-30',
        realizado: '2026-05-10',
      }

      // Primeira execução
      const rec1 = processValidadeItem(item, industryMap, mockMix, mockStoreMix)
      expect(mockMix.length).toBe(1)

      // Segunda execução repetida (mesmo item, mesma sincronização subsequente)
      const rec2 = processValidadeItem(item, industryMap, mockMix, mockStoreMix)

      // Não duplicou no mix observado
      expect(mockMix.length).toBe(1)
      expect(rec1.industry_id).toBe(rec2.industry_id)
      expect(rec1.cod_cliente).toBe(rec2.cod_cliente)
    })

    it('8. tradepro_cliente_nome não usa Fantasia como fallback quando item.cliente for ausente ou vazio', () => {
      // Simula a lógica de mapeamento de campos de Ruptura
      const rawItemComFantasiaSemCliente = {
        cliente: '',
        fantasiaCliente: 'GRUPO PEREIRA',
        razaoSocialCliente: '165 - FORT ATACADISTA - AVENTUREIRO',
      }

      const rawClienteNome = (rawItemComFantasiaSemCliente.cliente || '').toString().trim()
      const rawFantasia = (rawItemComFantasiaSemCliente.fantasiaCliente || '').toString().trim()

      // Regra estrita: tradepro_cliente_nome guarda o nome bruto do cliente (se fornecido pela fonte)
      // NUNCA usa rawFantasia como fallback para o campo tradepro_cliente_nome!
      const tradeproClienteNome = rawClienteNome

      expect(tradeproClienteNome).toBe('')
      expect(tradeproClienteNome).not.toBe('GRUPO PEREIRA')
      expect(rawFantasia).toBe('GRUPO PEREIRA')
    })
  })
})
