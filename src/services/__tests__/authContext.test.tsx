import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import React from 'react'
import { AuthProvider, useAuth } from '../authContext'
import pb from '@/lib/pocketbase/client'

describe('AuthContext - signIn via proxy', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    pb.authStore.clear()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    pb.authStore.clear()
  })

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <AuthProvider>{children}</AuthProvider>
  )

  it('1. Login com sucesso via proxy salva token e record no authStore', async () => {
    const mockUserRecord = {
      id: 'bumacp2xh84zjzu',
      email: 'rhuan.marx@diretoriapromocoes.com.br',
      name: 'Rhuan Marx',
      verified: true,
      collectionId: '_pb_users_auth_',
      collectionName: 'users',
    }

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        token: 'fake-jwt-token-123',
        record: mockUserRecord,
      }),
    } as unknown as Response)

    const { result } = renderHook(() => useAuth(), { wrapper })

    let res: { success: boolean; error?: string } = { success: false }
    await act(async () => {
      res = await result.current.signIn('rhuan.marx@diretoriapromocoes.com.br', 'Skip@Pass')
    })

    expect(res.success).toBe(true)
    expect(res.error).toBeUndefined()
    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.token).toBe('fake-jwt-token-123')
    expect(result.current.user?.id).toBe('bumacp2xh84zjzu')
    expect(pb.authStore.token).toBe('fake-jwt-token-123')
    expect(pb.authStore.record?.id).toBe('bumacp2xh84zjzu')

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/backend/v1/app-login'),
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'rhuan.marx@diretoriapromocoes.com.br',
          password: 'Skip@Pass',
        }),
      }),
    )
  })

  it('2. Credenciais inválidas (401) retorna erro amigável', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        success: false,
        error: 'E-mail ou senha inválidos.',
      }),
    } as unknown as Response)

    const { result } = renderHook(() => useAuth(), { wrapper })

    let res: { success: boolean; error?: string } = { success: false }
    await act(async () => {
      res = await result.current.signIn('rhuan.marx@diretoriapromocoes.com.br', 'wrongpassword')
    })

    expect(res.success).toBe(false)
    expect(res.error).toBe('E-mail ou senha inválidos.')
    expect(result.current.isAuthenticated).toBe(false)
    expect(pb.authStore.token).toBe('')
  })

  it('3. Serviço indisponível (503) retorna mensagem apropriada', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({
        success: false,
        error: 'Serviço de autenticação indisponível.',
      }),
    } as unknown as Response)

    const { result } = renderHook(() => useAuth(), { wrapper })

    let res: { success: boolean; error?: string } = { success: false }
    await act(async () => {
      res = await result.current.signIn('rhuan.marx@diretoriapromocoes.com.br', 'Skip@Pass')
    })

    expect(res.success).toBe(false)
    expect(res.error).toBe('Serviço de autenticação indisponível. Tente novamente mais tarde.')
  })

  it('4. Erro de rede (fetch reject) retorna erro de conexão', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Failed to fetch'))

    const { result } = renderHook(() => useAuth(), { wrapper })

    let res: { success: boolean; error?: string } = { success: false }
    await act(async () => {
      res = await result.current.signIn('rhuan.marx@diretoriapromocoes.com.br', 'Skip@Pass')
    })

    expect(res.success).toBe(false)
    expect(res.error).toBe('Não foi possível conectar ao servidor. Verifique sua conexão.')
  })

  it('5. Resposta HTML inesperada retorna erro de serviço indisponível', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 200,
      json: async () => {
        throw new Error('Unexpected token < in JSON')
      },
    } as unknown as Response)

    const { result } = renderHook(() => useAuth(), { wrapper })

    let res: { success: boolean; error?: string } = { success: false }
    await act(async () => {
      res = await result.current.signIn('rhuan.marx@diretoriapromocoes.com.br', 'Skip@Pass')
    })

    expect(res.success).toBe(false)
    expect(res.error).toBe('Serviço de autenticação indisponível.')
  })

  it('6. SignOut limpa o authStore e o estado do usuário', () => {
    pb.authStore.save('token123', { id: 'u1', email: 'test@example.com' } as unknown as any)

    const { result } = renderHook(() => useAuth(), { wrapper })

    act(() => {
      result.current.signOut()
    })

    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.user).toBeNull()
    expect(result.current.token).toBeNull()
    expect(pb.authStore.isValid).toBe(false)
  })
})
