import PocketBase from 'pocketbase'

/**
 * Resolve a URL base para o cliente PocketBase.
 *
 * - Se a URL apontar para um host interno (`*.internal.goskip.dev`) no navegador,
 *   faz fallback silencioso para `window.location.origin` (o proxy backend lida com
 *   as requisições públicas e o SDK opera através da mesma origem).
 * - Se a URL estiver vazia/indefinida, faz fallback para `window.location.origin` (ou '' em SSR).
 * - Caso contrário, usa a URL fornecida / configurada.
 */
export function getPocketBaseUrl(configuredUrl?: string): string {
  const envUrl =
    configuredUrl !== undefined ? configuredUrl : import.meta.env.VITE_POCKETBASE_URL || ''
  const trimmed = envUrl.trim()

  const isBrowser = typeof window !== 'undefined' && typeof window.location !== 'undefined'
  const browserOrigin = isBrowser && window.location.origin ? window.location.origin : ''

  // Fallback silencioso quando vazia ou apontando para URL interna inacessível do navegador
  if (!trimmed || (isBrowser && trimmed.includes('.internal.goskip.dev'))) {
    return browserOrigin
  }

  return trimmed
}

/**
 * Cria uma instância do cliente PocketBase com autoCancellation desabilitado por padrão.
 */
export function createPocketBaseClient(url?: string): PocketBase {
  const resolvedUrl = getPocketBaseUrl(url)
  const client = new PocketBase(resolvedUrl)
  client.autoCancellation(false)
  return client
}

const pb = createPocketBaseClient()

export default pb
