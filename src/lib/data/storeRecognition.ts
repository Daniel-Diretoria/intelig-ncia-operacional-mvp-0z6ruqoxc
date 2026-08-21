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

  // Padrão: dígitos/código curto, seguido de " - ", seguido do nome.
  // O separador é EXATAMENTE " - " (espaço, hífen, espaço) para evitar
  // falsos positivos em nomes que contenham travessões.
  const m = original.match(/^(\S{1,20})\s+-\s+(.+)$/)
  if (m) {
    const codigoLoja = m[1].trim()
    const nomeLoja = m[2].trim()
    // código externo reconhecido com segurança
    return {
      codigoLoja,
      nomeLoja,
      razaoSocialOriginal: original,
      origemReconhecimento: 'codigo_externo',
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
}

/**
 * Ordem de identificação da loja/rede:
 * 1. Loja reconhecida pelo código externo
 * 2. Loja reconhecida por alias
 * 3. CNPJ/identificador confirmado no Cadastro Mestre
 * 4. Razão Social normalizada + Cidade
 * 5. Mapeamento confirmado de Fantasia para Rede
 * 6. Revisão manual
 *
 * As etapas 2/3/4 dependem de cadastros (stores/networks/store_aliases) que
 * são populados no backend. Aqui fazemos o reconhecimento best-effort no
 * frontend; o enriquecimento definitivo pode ser feito posteriormente.
 */
export function recognizeStore(input: StoreRecognitionInput): StoreRecognition {
  const base = extractStoreFromRazaoSocial(input.razaoSocial)

  // 1. Código externo reconhecido
  if (base.origemReconhecimento === 'codigo_externo') {
    return base
  }

  // 5. Mapeamento de Fantasia -> Rede (apenas candidato)
  const net = detectNetworkFromFantasia(input.fantasia)
  if (net.redeDetectada) {
    return {
      ...base,
      rede: net.redeDetectada,
      origemReconhecimento: 'fantasia_rede',
    }
  }

  // 4. Razão Social normalizada + Cidade (fallback de reconhecimento)
  if (input.razaoSocial && input.cidade) {
    return {
      ...base,
      origemReconhecimento: 'razao_cidade',
    }
  }

  // 3. CNPJ/identificador presente (será confirmado no cadastro mestre)
  if (input.cnpj || input.cpfCnpj) {
    return {
      ...base,
      origemReconhecimento: 'cnpj',
    }
  }

  return base
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
