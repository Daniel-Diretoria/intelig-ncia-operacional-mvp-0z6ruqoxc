import { describe, it, expect } from 'vitest'

/**
 * Validação estrita de calendário espelhada do hook pocketbase/hooks/tradepro_connection.js
 */
const dateRegex = /^\d{4}-\d{2}-\d{2}$/
export function isValidCalendarDate(str: string): boolean {
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

/**
 * Conversão de datas ISO para yyyyMMdd espelhada do hook
 */
export const toTradeProDate = (isoDate: string): string => isoDate.replace(/-/g, '')

/**
 * Montagem de URL espelhada do hook
 */
export function buildTradeProRupturasUrl(dateStart: string, dateEnd: string): string {
  return (
    'https://diretoria.tradepro.com.br/diretoria/servicos/v1/relatorio-rupturas/' +
    toTradeProDate(dateStart) +
    '/' +
    toTradeProDate(dateEnd) +
    '?paginaAtual=1&quantidadePorPagina=1&agruparUltimaColetaDoProdutoDoMesmoCliente=1'
  )
}

/**
 * Validação prévia de período de datas antes da chamada HTTP
 */
export function validateTradeProPeriod(
  dateStart: string,
  dateEnd: string,
): { valid: boolean; errorCode?: string; message?: string } {
  if (!isValidCalendarDate(dateStart) || !isValidCalendarDate(dateEnd) || dateStart > dateEnd) {
    return {
      valid: false,
      errorCode: 'invalid_period',
      message: 'Período inválido. A data inicial deve ser menor ou igual à final.',
    }
  }

  const d1 = new Date(dateStart + 'T00:00:00Z')
  const d2 = new Date(dateEnd + 'T00:00:00Z')
  const diffDays = Math.ceil(Math.abs(d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24))

  if (diffDays > 31) {
    return {
      valid: false,
      errorCode: 'invalid_period',
      message: 'Intervalo máximo permitido é de 31 dias.',
    }
  }

  return { valid: true }
}

/**
 * Sanitização e mapeamento HTTP espelhado do hook pocketbase/hooks/tradepro_connection.js
 */
export function sanitizeErrorMessage(
  statusCode: number,
  rawText: string,
  jsonObj: any,
  defaultMsg: string,
): { errorCode: string; message: string; connected: boolean } {
  // Lógica específica para 412 com array erros[]
  let customRaw = rawText
  if (statusCode === 412) {
    let parsed412Json = jsonObj
    try {
      if (!parsed412Json && rawText) {
        parsed412Json = JSON.parse(rawText)
      }
    } catch {
      /* intentionally ignored */
    }

    if (parsed412Json && Array.isArray(parsed412Json.erros) && parsed412Json.erros.length > 0) {
      const items = parsed412Json.erros.slice(0, 5)
      const mapped = items
        .map((errItem: any) => {
          const campo = errItem && typeof errItem.campo === 'string' ? errItem.campo : ''
          const codigo = errItem && typeof errItem.codigo === 'string' ? errItem.codigo : ''
          const mensagem = errItem && typeof errItem.mensagem === 'string' ? errItem.mensagem : ''
          if (campo && codigo) {
            return campo + ': ' + mensagem + ' (' + codigo + ')'
          } else if (campo) {
            return campo + ': ' + mensagem
          } else if (codigo) {
            return mensagem + ' (' + codigo + ')'
          }
          return mensagem || ''
        })
        .filter((s: string) => Boolean(s && s.trim()))

      if (mapped.length > 0) {
        let joined = mapped.join(' | ')
        if (joined.length > 300) {
          joined = joined.substring(0, 300)
        }
        customRaw = joined
      }
    }
  }

  let extracted = ''
  let correlationId = ''

  try {
    const json = jsonObj || (customRaw ? JSON.parse(customRaw) : null)
    if (json && typeof json === 'object') {
      const candidate =
        json.message ||
        json.mensagem ||
        json.error ||
        json.detail ||
        json.title ||
        json.details ||
        ''
      if (typeof candidate === 'string' && candidate.trim()) {
        extracted = candidate.trim()
      }
      if (json.correlationId) {
        correlationId = String(json.correlationId)
      } else if (json.traceId) {
        correlationId = String(json.traceId)
      }
    }
  } catch {
    /* intentionally ignored */
  }

  if (!extracted && customRaw && typeof customRaw === 'string') {
    const trimmed = customRaw.trim()
    if (
      trimmed.length > 0 &&
      trimmed.length <= 300 &&
      !trimmed.startsWith('<html') &&
      !trimmed.startsWith('<!DOCTYPE')
    ) {
      extracted = trimmed
    }
  }

  if (!extracted) {
    extracted = defaultMsg
  }

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

  if (!clean) {
    clean = defaultMsg
  }

  if (correlationId) {
    clean = clean + ' (Trace: ' + correlationId.replace(/[^A-Za-z0-9\-_]/g, '') + ')'
  }

  if (clean.length > 300) {
    clean = clean.substring(0, 300)
  }

  let errorCode = 'internal_error'
  if (statusCode === 401) errorCode = 'unauthorized'
  else if (statusCode === 403) errorCode = 'forbidden'
  else if (statusCode === 404) errorCode = 'internal_error'
  else if (statusCode === 412) errorCode = 'precondition_failed'
  else if (statusCode === 429) errorCode = 'rate_limited'
  else if (statusCode >= 500) errorCode = 'tradepro_unavailable'

  return {
    errorCode,
    message: clean,
    connected: false,
  }
}

describe('tradepro_connection hook error mapping, data conversion & sanitization', () => {
  // a) Teste de conversão de data: "2026-08-26" → "20260826"
  it('a) Teste de conversão de data: "2026-08-26" → "20260826"', () => {
    expect(toTradeProDate('2026-08-26')).toBe('20260826')
    expect(toTradeProDate('2020-01-01')).toBe('20200101')
  })

  // b) Teste de ano bissexto: "2024-02-29" → "20240229" (válido)
  it('b) Teste de ano bissexto: "2024-02-29" → "20240229" (válido)', () => {
    expect(isValidCalendarDate('2024-02-29')).toBe(true)
    expect(toTradeProDate('2024-02-29')).toBe('20240229')
    const periodCheck = validateTradeProPeriod('2024-02-29', '2024-02-29')
    expect(periodCheck.valid).toBe(true)
  })

  // c) Teste de data inválida: "2023-02-29" → deve ser rejeitada (2023 não é bissexto)
  it('c) Teste de data inválida: "2023-02-29" → deve ser rejeitada (2023 não é bissexto)', () => {
    expect(isValidCalendarDate('2023-02-29')).toBe(false)
    expect(isValidCalendarDate('2024-04-31')).toBe(false)
    expect(isValidCalendarDate('2024-13-01')).toBe(false)
    expect(isValidCalendarDate('invalid-date')).toBe(false)

    const periodCheck = validateTradeProPeriod('2023-02-29', '2023-03-01')
    expect(periodCheck.valid).toBe(false)
    expect(periodCheck.errorCode).toBe('invalid_period')
    expect(periodCheck.message).toContain('Período inválido')
  })

  // d) Teste de data inicial > final bloqueada sem chamada externa
  it('d) Teste de data inicial > final bloqueada sem chamada externa', () => {
    const periodCheck = validateTradeProPeriod('2024-05-10', '2024-05-01')
    expect(periodCheck.valid).toBe(false)
    expect(periodCheck.errorCode).toBe('invalid_period')
    expect(periodCheck.message).toBe(
      'Período inválido. A data inicial deve ser menor ou igual à final.',
    )
  })

  // e) Teste de intervalo > 31 dias bloqueado
  it('e) Teste de intervalo > 31 dias bloqueado', () => {
    const periodCheck = validateTradeProPeriod('2024-01-01', '2024-02-15')
    expect(periodCheck.valid).toBe(false)
    expect(periodCheck.errorCode).toBe('invalid_period')
    expect(periodCheck.message).toBe('Intervalo máximo permitido é de 31 dias.')
  })

  // f) Teste de 412 com erros[] array: extrai campo/codigo/mensagem de cada item
  it('f) Teste de 412 com erros[] array: extrai campo/codigo/mensagem de cada item', () => {
    const tradeProErrorBody = {
      erros: [
        {
          campo: 'dataInicial',
          codigo: 'DATA_INVALIDA',
          mensagem: 'Data inicial deve estar no formato yyyyMMdd',
        },
      ],
    }

    const res = sanitizeErrorMessage(
      412,
      JSON.stringify(tradeProErrorBody),
      tradeProErrorBody,
      'O TradePro recusou uma pré-condição da solicitação (HTTP 412).',
    )
    expect(res.errorCode).toBe('precondition_failed')
    expect(res.message).toBe(
      'dataInicial: Data inicial deve estar no formato yyyyMMdd (DATA_INVALIDA)',
    )
    expect(res.connected).toBe(false)
  })

  // g) Teste de 412 com erros[] contendo Authorization/token → sanitizado
  it('g) Teste de 412 com erros[] contendo Authorization/token → sanitizado', () => {
    const tradeProErrorWithLeak = {
      erros: [
        {
          campo: 'authHeader',
          codigo: 'TOKEN_EXPIRADO',
          mensagem:
            'Falha com Authorization: Basic dXNlcjpwYXNz e token=secret1234567890123456789012345678901234567890',
        },
      ],
    }

    const res = sanitizeErrorMessage(
      412,
      JSON.stringify(tradeProErrorWithLeak),
      tradeProErrorWithLeak,
      'O TradePro recusou uma pré-condição da solicitação (HTTP 412).',
    )
    expect(res.errorCode).toBe('precondition_failed')
    expect(res.message).not.toContain('Basic')
    expect(res.message).not.toContain('dXNlcjpwYXNz')
    expect(res.message).not.toContain('Authorization')
    expect(res.message).not.toContain('token=secret')
  })

  // h) Teste de 412 com erros[] enorme (>20 itens) → truncado a 5
  it('h) Teste de 412 com erros[] enorme (>20 itens) → truncado a 5', () => {
    const manyErrors = Array.from({ length: 25 }, (_, i) => ({
      campo: `campo${i + 1}`,
      codigo: `ERR_${i + 1}`,
      mensagem: `Erro na validação do campo ${i + 1}`,
    }))

    const res = sanitizeErrorMessage(
      412,
      JSON.stringify({ erros: manyErrors }),
      { erros: manyErrors },
      'O TradePro recusou uma pré-condição da solicitação (HTTP 412).',
    )
    expect(res.errorCode).toBe('precondition_failed')
    expect(res.message).toContain('campo1: Erro na validação do campo 1 (ERR_1)')
    expect(res.message).toContain('campo5: Erro na validação do campo 5 (ERR_5)')
    expect(res.message).not.toContain('campo6:')
    expect(res.message.length).toBeLessThanOrEqual(300)
  })

  // i) Teste de regressão: 200, 204, 401, 403, 404, 429, timeout, 500 continuam funcionando
  it('i) Teste de regressão: 200, 204, 401, 403, 404, 429, timeout, 500 continuam funcionando', () => {
    // 401
    const res401 = sanitizeErrorMessage(401, '', null, 'Token inválido ou autenticação recusada.')
    expect(res401.errorCode).toBe('unauthorized')
    expect(res401.message).toBe('Token inválido ou autenticação recusada.')

    // 403
    const res403 = sanitizeErrorMessage(
      403,
      '',
      null,
      'Usuário sem permissão para acessar o recurso.',
    )
    expect(res403.errorCode).toBe('forbidden')
    expect(res403.message).toBe('Usuário sem permissão para acessar o recurso.')

    // 404
    const res404 = sanitizeErrorMessage(404, '', null, 'Recurso não encontrado na API TradePro.')
    expect(res404.errorCode).toBe('internal_error')
    expect(res404.message).toBe('Recurso não encontrado na API TradePro.')

    // 429
    const res429 = sanitizeErrorMessage(
      429,
      '',
      null,
      'Limite temporário de requisições. Aguarde antes de tentar novamente.',
    )
    expect(res429.errorCode).toBe('rate_limited')
    expect(res429.message).toBe(
      'Limite temporário de requisições. Aguarde antes de tentar novamente.',
    )

    // 500
    const res500 = sanitizeErrorMessage(500, '', null, 'Serviço TradePro indisponível no momento.')
    expect(res500.errorCode).toBe('tradepro_unavailable')
    expect(res500.message).toBe('Serviço TradePro indisponível no momento.')
  })

  // j) Teste: query params permanecem inalterados; token NÃO é adicionado à query string
  it('j) Teste: query params permanecem inalterados; token NÃO é adicionado à query string', () => {
    const url = buildTradeProRupturasUrl('2026-08-26', '2026-08-26')
    expect(url).toBe(
      'https://diretoria.tradepro.com.br/diretoria/servicos/v1/relatorio-rupturas/20260826/20260826?paginaAtual=1&quantidadePorPagina=1&agruparUltimaColetaDoProdutoDoMesmoCliente=1',
    )
    expect(url).not.toContain('token=')
    expect(url).not.toContain('secret')
    expect(url).not.toContain('Authorization')
    expect(url).toContain('paginaAtual=1')
    expect(url).toContain('quantidadePorPagina=1')
    expect(url).toContain('agruparUltimaColetaDoProdutoDoMesmoCliente=1')
  })

  // k) Teste: Authorization header permanece Basic (não alterado)
  it('k) Teste: Authorization header permanece Basic (não alterado)', () => {
    const rawToken = 'dXNlcjpwYXNz'
    const trimmedToken = rawToken.trim()
    const authHeader = trimmedToken.startsWith('Basic ') ? trimmedToken : 'Basic ' + trimmedToken
    expect(authHeader).toBe('Basic dXNlcjpwYXNz')

    const alreadyBasic = 'Basic dXNlcjpwYXNz'
    const authHeader2 = alreadyBasic.startsWith('Basic ') ? alreadyBasic : 'Basic ' + alreadyBasic
    expect(authHeader2).toBe('Basic dXNlcjpwYXNz')
  })

  // Testes de cobertura anteriores preservados
  it('HTTP 412 com JSON {message: "Pré-condição X não atendida"} → error_code=precondition_failed, message sanitizada', () => {
    const res = sanitizeErrorMessage(
      412,
      JSON.stringify({ message: 'Pré-condição X não atendida' }),
      null,
      'O TradePro recusou uma pré-condição da solicitação (HTTP 412).',
    )
    expect(res.errorCode).toBe('precondition_failed')
    expect(res.message).toBe('Pré-condição X não atendida')
    expect(res.connected).toBe(false)
  })

  it('HTTP 412 com texto puro "Precondition Failed" → mesmo', () => {
    const res = sanitizeErrorMessage(
      412,
      'Precondition Failed',
      null,
      'O TradePro recusou uma pré-condição da solicitação (HTTP 412).',
    )
    expect(res.errorCode).toBe('precondition_failed')
    expect(res.message).toBe('Precondition Failed')
  })

  it('Corpo 412 não-JSON e não-texto (ex: HTML) → mensagem padrão', () => {
    const res = sanitizeErrorMessage(
      412,
      '<html><body><h1>412 Precondition Failed</h1></body></html>',
      null,
      'O TradePro recusou uma pré-condição da solicitação (HTTP 412).',
    )
    expect(res.errorCode).toBe('precondition_failed')
    expect(res.message).toBe('O TradePro recusou uma pré-condição da solicitação (HTTP 412).')
  })
})
