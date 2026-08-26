import PocketBase from 'pocketbase'

export function getPocketBaseUrl(envUrl?: string): string {
  const rawUrl =
    (envUrl ?? (typeof import.meta !== 'undefined' ? import.meta.env?.VITE_POCKETBASE_URL : '')) ||
    ''
  const trimmedUrl = rawUrl.trim()
  const isBrowser = typeof window !== 'undefined'

  if (trimmedUrl.includes('.internal.goskip.dev')) {
    if (isBrowser) {
      throw new Error(
        'Configuração inválida: VITE_POCKETBASE_URL aponta para URL interna (*.internal.goskip.dev) que não é acessível do navegador. Altere para a URL pública da instância PocketBase.',
      )
    }
    return trimmedUrl
  }

  if (trimmedUrl) {
    return trimmedUrl
  }

  if (isBrowser && window.location?.origin) {
    return window.location.origin
  }

  return ''
}

export function createPocketBaseClient(url?: string): PocketBase {
  const resolvedUrl = getPocketBaseUrl(url)
  const client = new PocketBase(resolvedUrl)
  client.autoCancellation(false)
  return client
}

const pb = createPocketBaseClient()

export default pb
