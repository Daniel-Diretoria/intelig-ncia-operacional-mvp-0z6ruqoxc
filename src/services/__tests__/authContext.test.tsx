import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import React from 'react'
import { AuthProvider, useAuth } from '../authContext'
import pb from '@/lib/pocketbase/client'

describe('AuthContext - signIn via PocketBase SDK nativo', () => {
  beforeEach(() => {
    pb.authStore.clear()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    pb.authStore.clear()
  })

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <AuthProvider>{children}</AuthProvider>
  )

  it('1. Login com sucesso via SDK nativo atualiza authStore e estado do usuário', async () => {
    const mockUserRecord = {
      id: 'bumacp2xh84zjzu',
      email: 'rhuan.marx@diretoriapromocoes.com.br',
      name: 'Rhuan Marx',
      verified: true,
      collectionId: '_pb_users_auth_',
      collectionName: 'users',
    }

    vi.spyOn(pb.collection('users'), 'authWithPassword').mockImplementation(async () => {
      pb.authStore.save('fake-jwt-token-123', mockUserRecord as any)
      return {
        token: 'fake-jwt-token-123',
        record: mockUserRecord as any,
      }
    })

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
    expect(pb.collection('users').authWithPassword).toHaveBeenCalledWith(
      'rhuan.marx@diretoriapromocoes.com.br',
      'Skip@Pass',
    )
  })

  it('2. Credenciais inválidas (status 400 do PocketBase) retorna erro amigável', async () => {
    vi.spyOn(pb.collection('users'), 'authWithPassword').mockRejectedValue({
      status: 400,
      message: 'Failed to authenticate.',
      data: {},
    })

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
    vi.spyOn(pb.collection('users'), 'authWithPassword').mockRejectedValue({
      status: 503,
      message: 'Service Unavailable',
    })

    const { result } = renderHook(() => useAuth(), { wrapper })

    let res: { success: boolean; error?: string } = { success: false }
    await act(async () => {
      res = await result.current.signIn('rhuan.marx@diretoriapromocoes.com.br', 'Skip@Pass')
    })

    expect(res.success).toBe(false)
    expect(res.error).toBe('Serviço de autenticação indisponível. Tente novamente mais tarde.')
  })

  it('4. Erro de rede (status 0 / network failure) retorna erro de conexão', async () => {
    vi.spyOn(pb.collection('users'), 'authWithPassword').mockRejectedValue({
      status: 0,
      message: 'Failed to connect to PocketBase server.',
    })

    const { result } = renderHook(() => useAuth(), { wrapper })

    let res: { success: boolean; error?: string } = { success: false }
    await act(async () => {
      res = await result.current.signIn('rhuan.marx@diretoriapromocoes.com.br', 'Skip@Pass')
    })

    expect(res.success).toBe(false)
    expect(res.error).toBe('Não foi possível conectar ao servidor. Verifique sua conexão.')
  })

  it('5. Requisição cancelada / abortada retorna mensagem apropriada', async () => {
    vi.spyOn(pb.collection('users'), 'authWithPassword').mockRejectedValue({
      isAbort: true,
      message: 'The request was autocancelled.',
    })

    const { result } = renderHook(() => useAuth(), { wrapper })

    let res: { success: boolean; error?: string } = { success: false }
    await act(async () => {
      res = await result.current.signIn('rhuan.marx@diretoriapromocoes.com.br', 'Skip@Pass')
    })

    expect(res.success).toBe(false)
    expect(res.error).toBe('Requisição cancelada.')
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
