import type { StoreRecognition } from '@/types'
import { formatStoreIdentity } from '@/lib/selectors'

/**
 * Reconhecimento de Loja e Rede a partir dos dados do TradePro.
 *
 * A Razão Social do TradePro vem no formato:
 *   "250 - FORT ATACADISTA FLORESTA"
 * onde a parte anterior ao primeiro " - " é o código externo da loja e a
 * parte posterior é o nome recebido da loja.
 *
 * Regras:
 *  - Separar somente quando o padrão for reconhecido com segurança.
 *  - Preservar sempre a Razão Social original.
 *  - A Fantasia pode conter indicação de grupo/rede (ex.: "GRUPO PEREIRA"),
 *    mas NÃO é transformada automaticamente em Rede sem regra cadastrada.
 *  - O enriquecimento da Rede não altera a deduplicação nem a Chave Operacional.
 */

/** Normaliza uma string para comparação (sem acentos, caixa baixa, espaços únicos). */
function norm(s: string | undefined | null): string {
  return (s ?? '')
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

/**
 * Extrai código externo e nome da loja a partir da Razão Social.
 * Padrão esperado: "CODIGO - NOME DA LOJA" (separador " - ").
 *
 * Retorna codigoLoja/nomeLoja apenas quando o padrão é reconhecido com
 * segurança; caso contrário, preserva apenas a razão social original.
 */
export function extractStoreFromRazaoSocial(razaoSocial: string | undefined): StoreRecognition {
  const original = (razaoSocial ?? '').trim()
  if (!original) {
    return { razaoSocialOriginal: original, origemReconhecimento: 'nao_reconhecido' }
  }

  // Padrão: 00000 - Nome Loja ou 00000 • Nome Loja ou 00000 · Nome Loja
  // Preserva zeros à esquerda como string. NUNCA inventa código.
  const m = original.match(/^(\d{1,10})\s*[-•·–]\s*(.+)$/)
  if (m) {
    const rawDigits = m[1].trim()
    // Se não for só zeros (ex: "000", "0")
    if (!/^0+$/.test(rawDigits)) {
      const codigoLoja = rawDigits // preserva zeros à esquerda como string original
      const nomeLoja = m[2].trim()
      return {
        codigoLoja,
        nomeLoja,
        razaoSocialOriginal: original,
        origemReconhecimento: 'codigo_externo',
      }
    }
  }

  return {
    razaoSocialOriginal: original,
    origemReconhecimento: 'nao_reconhecido',
  }
}

/**
 * Tenta identificar uma Rede a partir da Fantasia.
 *
 * A Fantasia pode conter indicação de grupo/rede como "GRUPO PEREIRA".
 * Conforme especificação, NÃO transformamos automaticamente em Rede sem regra
 * cadastrada — esta função apenas detecta o padrão "GRUPO ..." e o retorna
 * como candidato, deixando o mapeamento confirmado para etapa posterior.
 */
export function detectNetworkFromFantasia(fantasia: string | undefined): {
  redeDetectada: string | undefined
  origem: 'fantasia_rede' | 'nao_reconhecido'
} {
  const f = norm(fantasia)
  if (!f) return { redeDetectada: undefined, origem: 'nao_reconhecido' }

  // Padrão explícito "GRUPO XXX" / "REDE XXX"
  const m = f.match(/^(?:grupo|rede)\s+(.+)$/)
  if (m) {
    return { redeDetectada: m[1].trim().toUpperCase(), origem: 'fantasia_rede' }
  }
  return { redeDetectada: undefined, origem: 'nao_reconhecido' }
}

export interface StoreRecognitionInput {
  razaoSocial?: string
  fantasia?: string
  cidade?: string
  cpfCnpj?: string
  cnpj?: string
  knownStores?: Array<{ codigo: string; nome: string; cidade?: string; cnpj?: string }>
}

/**
 * Ordem de identificação da loja/rede:
 * 1. Código no campo / prefixo "00000 - " / "00000 • " / "00000 · " (preservando zeros à esquerda como string)
 * 2. Sem código: match normalizado por nome + cidade usando cadastro mestre se fornecido
 *    - Match único -> resolve
 *    - Ambíguo -> Auditoria LOJA_AMBIGUA
 *    - Não encontrado -> Auditoria LOJA_NAO_RESOLVIDA
 * 3. Nunca inventar código.
 */
export function resolveStoreMatch(input: StoreRecognitionInput): {
  status: 'com_codigo' | 'resolvida' | 'LOJA_AMBIGUA' | 'LOJA_NAO_RESOLVIDA'
  recognition: StoreRecognition
} {
  // 1. Código explícito no prefixo
  const base = extractStoreFromRazaoSocial(input.razaoSocial)
  if (base.origemReconhecimento === 'codigo_externo') {
    return {
      status: 'com_codigo',
      recognition: base,
    }
  }

  const cleanRazao = (input.razaoSocial ?? '').trim()
  const cleanCity = (input.cidade ?? '').trim()

  if (!cleanRazao) {
    return {
      status: 'LOJA_NAO_RESOLVIDA',
      recognition: { ...base, origemReconhecimento: 'nao_reconhecido' },
    }
  }

  const known = input.knownStores
  if (known && known.length > 0) {
    const normName = norm(cleanRazao)
    const normCity = norm(cleanCity)

    // Filtra correspondências
    const matches = known.filter((s) => {
      const sNorm = norm(s.nome)
      const cNorm = norm(s.cidade)
      const nameMatch = sNorm === normName || sNorm.includes(normName) || normName.includes(sNorm)
      if (!nameMatch) return false
      if (normCity && cNorm) {
        return cNorm === normCity
      }
      return true
    })

    if (matches.length === 1) {
      const m = matches[0]
      return {
        status: 'resolvida',
        recognition: {
          codigoLoja: m.codigo,
          nomeLoja: m.nome,
          razaoSocialOriginal: cleanRazao,
          origemReconhecimento: 'razao_cidade',
        },
      }
    } else if (matches.length > 1) {
      return {
        status: 'LOJA_AMBIGUA',
        recognition: {
          nomeLoja: cleanRazao,
          razaoSocialOriginal: cleanRazao,
          origemReconhecimento: 'nao_reconhecido',
        },
      }
    } else {
      return {
        status: 'LOJA_NAO_RESOLVIDA',
        recognition: {
          nomeLoja: cleanRazao,
          razaoSocialOriginal: cleanRazao,
          origemReconhecimento: 'nao_reconhecido',
        },
      }
    }
  }

  // Sem lista mestre fornecida: se tem razão social + cidade, trata como tentativa
  if (cleanRazao && cleanCity) {
    return {
      status: 'LOJA_NAO_RESOLVIDA',
      recognition: {
        ...base,
        nomeLoja: cleanRazao,
        origemReconhecimento: 'razao_cidade',
      },
    }
  }

  return {
    status: 'LOJA_NAO_RESOLVIDA',
    recognition: {
      ...base,
      nomeLoja: cleanRazao || undefined,
      origemReconhecimento: 'nao_reconhecido',
    },
  }
}

/**
 * Wrapper de compatibilidade que chama extractStoreFromRazaoSocial / resolveStoreMatch.
 */
export function recognizeStore(input: StoreRecognitionInput): StoreRecognition {
  const res = resolveStoreMatch(input)
  const net = detectNetworkFromFantasia(input.fantasia)
  if (net.redeDetectada) {
    return {
      ...res.recognition,
      rede: net.redeDetectada,
    }
  }
  return res.recognition
}

/** Normaliza um identificador textual (preserva zeros à esquerda). */
export function normalizeIdentifier(value: unknown): string {
  if (value == null) return ''
  // Remove espaços das pontas, mas preserva zeros à esquerda e conteúdo.
  return String(value).trim()
}

/** Formata loja usando o helper central único formatStoreIdentity */
export function formatStoreDisplay(codigo?: string, nome?: string): string {
  return formatStoreIdentity({ codigo_loja: codigo, nome_loja: nome })
}
