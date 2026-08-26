import PocketBase from 'pocketbase'

export function getPocketBaseUrl(envUrl?: string): string {
  const url = envUrl !== undefined ? envUrl : import.meta.env.VITE_POCKETBASE_URL || ''

  if (typeof window !== 'undefined' && window.location?.origin) {
    if (!url || url.includes('.internal.goskip.dev')) {
      return window.location.origin
    }
  }

  return (
    url || (typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '')
  )
}

export function createPocketBaseClient(url?: string): PocketBase {
  const client = new PocketBase(getPocketBaseUrl(url))
  client.autoCancellation(false)
  return client
}

const pb = createPocketBaseClient()

export default pb
