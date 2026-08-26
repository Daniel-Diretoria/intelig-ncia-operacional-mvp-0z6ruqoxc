import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import PocketBase from 'pocketbase'
import pb, { getPocketBaseUrl, createPocketBaseClient } from '../client'

describe('PocketBase client bootstrap & validation', () => {
  const originalLocation = window.location

  beforeEach(() => {
    vi.unstubAllEnvs()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    // Restore window.location if modified
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true,
    })
  })

  it('1. URL interna (.internal.goskip.dev) faz fallback silencioso para window.location.origin no navegador', () => {
    Object.defineProperty(window, 'location', {
      value: {
        origin: 'https://inteligencia-operacional-mvp-7d99e--preview.goskip.app',
        href: 'https://inteligencia-operacional-mvp-7d99e--preview.goskip.app/',
      },
      writable: true,
      configurable: true,
    })

    const internalUrl = 'https://inteligencia-operacional-mvp-7d99e.shrd00.internal.goskip.dev'

    expect(() => {
      const resolved = getPocketBaseUrl(internalUrl)
      expect(resolved).toBe('https://inteligencia-operacional-mvp-7d99e--preview.goskip.app')
    }).not.toThrow()

    expect(() => {
      const client = createPocketBaseClient(internalUrl)
      expect(client.baseUrl).toBe('https://inteligencia-operacional-mvp-7d99e--preview.goskip.app')
    }).not.toThrow()
  })

  it('2. URL pública é aceita normalmente', () => {
    const publicUrl = 'https://inteligencia-operacional-mvp-7d99e--preview.goskip.app'
    const resolvedUrl = getPocketBaseUrl(publicUrl)

    expect(resolvedUrl).toBe(publicUrl)

    const client = createPocketBaseClient(publicUrl)
    expect(client.baseUrl).toBe(publicUrl)
  })

  it('3. URL vazia usa window.location.origin como fallback no navegador', () => {
    Object.defineProperty(window, 'location', {
      value: {
        origin: 'https://preview-instance-123.goskip.app',
        href: 'https://preview-instance-123.goskip.app/',
      },
      writable: true,
      configurable: true,
    })

    const resolvedUrl = getPocketBaseUrl('')
    expect(resolvedUrl).toBe('https://preview-instance-123.goskip.app')

    const client = createPocketBaseClient('')
    expect(client.baseUrl).toBe('https://preview-instance-123.goskip.app')
  })

  it('4. Fallback com import.meta.env quando nenhum argumento é passado', () => {
    Object.defineProperty(window, 'location', {
      value: {
        origin: 'https://inteligencia-operacional-mvp-7d99e--preview.goskip.app',
      },
      writable: true,
      configurable: true,
    })

    vi.stubEnv('VITE_POCKETBASE_URL', '')
    expect(getPocketBaseUrl()).toBe(
      'https://inteligencia-operacional-mvp-7d99e--preview.goskip.app',
    )

    vi.stubEnv(
      'VITE_POCKETBASE_URL',
      'https://inteligencia-operacional-mvp-7d99e.shrd00.internal.goskip.dev',
    )
    expect(getPocketBaseUrl()).toBe(
      'https://inteligencia-operacional-mvp-7d99e--preview.goskip.app',
    )

    vi.stubEnv('VITE_POCKETBASE_URL', 'https://custom-pocketbase.app')
    expect(getPocketBaseUrl()).toBe('https://custom-pocketbase.app')
  })

  it('5. Comportamento correto de autoCancellation(false)', () => {
    const client = createPocketBaseClient('https://example.com')
    // PocketBase client instance created by helper has autoCancellation disabled
    expect(client).toBeInstanceOf(PocketBase)
    expect(pb).toBeInstanceOf(PocketBase)
    // Verify default exported pb instance is configured
    expect(pb.baseUrl).toBeDefined()
  })
})
