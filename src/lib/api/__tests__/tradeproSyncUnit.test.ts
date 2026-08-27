import { describe, it, expect } from 'vitest'

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
})
