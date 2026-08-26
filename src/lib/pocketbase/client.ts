import PocketBase from 'pocketbase'

export function getPocketBaseUrl(customUrl?: string): string {
  const url = customUrl !== undefined ? customUrl : import.meta.env.VITE_POCKETBASE_URL

  if (url) {
    if (url.includes('.internal.goskip.dev')) {
      throw new Error(
        'Configuração inválida: VITE_POCKETBASE_URL aponta para URL interna (*.internal.goskip.dev) que não é acessível do navegador. Altere para a URL pública da instância PocketBase.',
      )
    }
    return url
  }

  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin
  }

  return ''
}

export function createPocketBaseClient(url?: string): PocketBase {
  const targetUrl = getPocketBaseUrl(url)
  const client = new PocketBase(targetUrl)
  client.autoCancellation(false)
  return client
}

const pb = createPocketBaseClient()

export default pb
