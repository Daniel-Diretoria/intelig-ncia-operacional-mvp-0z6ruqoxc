import { describe, it, expect } from 'vitest'

/**
 * Testes unitários da lógica de sanitização e mapeamento HTTP 412
 * espelhada de pocketbase/hooks/tradepro_connection.js
 */
function sanitizeErrorMessage(
  statusCode: number,
  rawText: string,
  jsonObj: any,
  defaultMsg: string,
): { errorCode: string; message: string; connected: boolean } {
  let extracted = ''
  let correlationId = ''

  try {
    const json = jsonObj || (rawText ? JSON.parse(rawText) : null)
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
  else if (statusCode === 412) errorCode = 'precondition_failed'
  else if (statusCode === 429) errorCode = 'rate_limited'
  else if (statusCode >= 500) errorCode = 'tradepro_unavailable'

  return {
    errorCode,
    message: clean,
    connected: false,
  }
}

describe('tradepro_connection hook error mapping & sanitization', () => {
  it('1. HTTP 412 com JSON {message: "Pré-condição X não atendida"} → error_code=precondition_failed, message sanitizada', () => {
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

  it('2. HTTP 412 com texto puro "Precondition Failed" → mesmo', () => {
    const res = sanitizeErrorMessage(
      412,
      'Precondition Failed',
      null,
      'O TradePro recusou uma pré-condição da solicitação (HTTP 412).',
    )
    expect(res.errorCode).toBe('precondition_failed')
    expect(res.message).toBe('Precondition Failed')
  })

  it('3. Corpo 412 contendo "Authorization: Basic abc123" → campo Authorization removido da mensagem', () => {
    const res = sanitizeErrorMessage(
      412,
      JSON.stringify({ message: 'Falha com Authorization: Basic abc123 para o recurso' }),
      null,
      'O TradePro recusou uma pré-condição da solicitação (HTTP 412).',
    )
    expect(res.errorCode).toBe('precondition_failed')
    expect(res.message).not.toContain('Authorization')
    expect(res.message).not.toContain('Basic')
    expect(res.message).toContain('Falha com para o recurso')
  })

  it('4. Corpo 412 enorme (>1000 chars) → truncado em 300', () => {
    const huge = 'A'.repeat(1200)
    const res = sanitizeErrorMessage(
      412,
      JSON.stringify({ message: huge }),
      null,
      'O TradePro recusou uma pré-condição da solicitação (HTTP 412).',
    )
    expect(res.errorCode).toBe('precondition_failed')
    expect(res.message.length).toBeLessThanOrEqual(300)
    expect(res.message.length).toBe(300)
  })

  it('5. Corpo 412 não-JSON e não-texto (ex: HTML) → mensagem padrão', () => {
    const res = sanitizeErrorMessage(
      412,
      '<html><body><h1>412 Precondition Failed</h1></body></html>',
      null,
      'O TradePro recusou uma pré-condição da solicitação (HTTP 412).',
    )
    expect(res.errorCode).toBe('precondition_failed')
    expect(res.message).toBe('O TradePro recusou uma pré-condição da solicitação (HTTP 412).')
  })

  it('6. Demais status (401, 403, 500) preservados', () => {
    const res401 = sanitizeErrorMessage(401, '', null, 'Token inválido ou autenticação recusada.')
    expect(res401.errorCode).toBe('unauthorized')

    const res403 = sanitizeErrorMessage(
      403,
      '',
      null,
      'Usuário sem permissão para acessar o recurso.',
    )
    expect(res403.errorCode).toBe('forbidden')

    const res500 = sanitizeErrorMessage(500, '', null, 'Serviço TradePro indisponível no momento.')
    expect(res500.errorCode).toBe('tradepro_unavailable')
  })
})
