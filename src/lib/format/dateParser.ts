/**
 * Parser e formatador central de datas operacionais.
 * Tratamento exclusivo date-only sem deslocamentos de fuso UTC.
 * Referência de fuso: America/Sao_Paulo.
 */

/**
 * Converte qualquer formato de data recebido (Date, serial Excel, ISO, YYYY-MM-DD, DD/MM/YYYY, etc.)
 * em um objeto Date válido zerado em meia-noite local (ou UTC correspondente).
 * NUNCA utiliza new Date('DD/MM/YYYY') diretamente.
 */
export function parseOperationalDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') {
    return null
  }

  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null
    return new Date(value.getFullYear(), value.getMonth(), value.getDate())
  }

  // Serial Excel (ex: 45290)
  if (typeof value === 'number' && !isNaN(value) && value > 1000 && value < 100000) {
    // Dias desde 1899-12-30 (compatibilidade bug ano bissexto 1900 Excel)
    const excelEpoch = new Date(1899, 11, 30)
    const date = new Date(excelEpoch.getTime() + Math.round(value) * 86400000)
    if (!isNaN(date.getTime())) {
      return new Date(date.getFullYear(), date.getMonth(), date.getDate())
    }
  }

  const str = String(value).trim()
  if (!str) return null

  // Formato DD/MM/YYYY ou DD/MM/YYYY HH:mm:ss ou DD-MM-YYYY
  const brMatch = str.match(
    /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/,
  )
  if (brMatch) {
    const day = parseInt(brMatch[1], 10)
    const month = parseInt(brMatch[2], 10) - 1
    const year = parseInt(brMatch[3], 10)
    if (month >= 0 && month <= 11 && day >= 1 && day <= 31 && year >= 1900 && year <= 2200) {
      const parsed = new Date(year, month, day)
      // Valida se o dia não virou mês (ex: 31/02)
      if (
        parsed.getFullYear() === year &&
        parsed.getMonth() === month &&
        parsed.getDate() === day
      ) {
        return parsed
      }
    }
    return null
  }

  // Formato YYYY-MM-DD ou YYYY-MM-DDTHH:mm:ss ou YYYY-MM-DD HH:mm:ss
  const isoMatch = str.match(
    /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:[T\s](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/,
  )
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10)
    const month = parseInt(isoMatch[2], 10) - 1
    const day = parseInt(isoMatch[3], 10)
    if (month >= 0 && month <= 11 && day >= 1 && day <= 31 && year >= 1900 && year <= 2200) {
      const parsed = new Date(year, month, day)
      if (
        parsed.getFullYear() === year &&
        parsed.getMonth() === month &&
        parsed.getDate() === day
      ) {
        return parsed
      }
    }
    return null
  }

  // Formato YYYYMMDD (TradePro API)
  const compactMatch = str.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (compactMatch) {
    const year = parseInt(compactMatch[1], 10)
    const month = parseInt(compactMatch[2], 10) - 1
    const day = parseInt(compactMatch[3], 10)
    const parsed = new Date(year, month, day)
    if (parsed.getFullYear() === year && parsed.getMonth() === month && parsed.getDate() === day) {
      return parsed
    }
    return null
  }

  // Fallback nativo com saneamento
  try {
    const dt = new Date(str)
    if (!isNaN(dt.getTime())) {
      return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate())
    }
  } catch {
    return null
  }

  return null
}

/**
 * Retorna a data de hoje zerada para comparação de calendário (America/Sao_Paulo).
 */
export function getTodayDate(): Date {
  // Obter data atual no fuso America/Sao_Paulo
  const now = new Date()
  const formatter = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = formatter.formatToParts(now)
  const day = parseInt(parts.find((p) => p.type === 'day')?.value || '1', 10)
  const month = parseInt(parts.find((p) => p.type === 'month')?.value || '1', 10) - 1
  const year = parseInt(parts.find((p) => p.type === 'year')?.value || '2025', 10)
  return new Date(year, month, day)
}

/**
 * Calcula a diferença em dias de calendário entre a validade efetiva e hoje em America/Sao_Paulo.
 * Retorna número de dias. Se data inválida, retorna null.
 */
export function calcOperationalDays(validadeEfetiva: unknown): number | null {
  const date = parseOperationalDate(validadeEfetiva)
  if (!date) return null

  const today = getTodayDate()
  const diffTime = date.getTime() - today.getTime()
  return Math.round(diffTime / 86400000)
}

/**
 * Formata exibição da data para DD/MM/YYYY.
 * NUNCA exibe "Invalid Date". Em caso de data inválida ou nula, exibe texto amigável.
 */
export function formatDisplayDate(value: unknown, fallback = 'Data não informada'): string {
  if (value === null || value === undefined || value === '') {
    return fallback
  }

  const date = parseOperationalDate(value)
  if (!date) {
    return 'Data inválida'
  }

  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  return `${day}/${month}/${year}`
}

/**
 * Retorna a representação ISO YYYY-MM-DD da data operacional para armazenamento.
 */
export function toOperationalIsoDate(value: unknown): string | null {
  const date = parseOperationalDate(value)
  if (!date) return null
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Classificação operacional de validade segundo as faixas estritas:
 * - <= 0: Vencido
 * - 1 a 15: Crítico
 * - 16 a 25: Atenção
 * - 26 a 35: Moderado
 * - 36+: Normal
 */
export type StatusOperacionalFaixa = 'Vencido' | 'Crítico' | 'Atenção' | 'Moderado' | 'Normal'

export function classifyOperationalStatus(dias: number | null): StatusOperacionalFaixa {
  if (dias === null || isNaN(dias) || dias <= 0) return 'Vencido'
  if (dias <= 15) return 'Crítico'
  if (dias <= 25) return 'Atenção'
  if (dias <= 35) return 'Moderado'
  return 'Normal'
}
