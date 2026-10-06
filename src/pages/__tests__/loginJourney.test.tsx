import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { MemoryRouter } from 'react-router-dom'
import { LoginPage } from '../Login'
import * as authContextModule from '@/services/authContext'

describe('LoginPage Journey', () => {
  const mockSignIn = vi.fn()
  const mockSignOut = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(authContextModule, 'useAuth').mockReturnValue({
      user: null,
      token: null,
      isLoading: false,
      isAuthenticated: false,
      role: 'admin',
      status: 'ativo',
      userType: 'humano',
      allowedIndustries: [],
      effectivePermissions: new Set(),
      can: vi.fn().mockReturnValue(false),
      canAccessIndustry: vi.fn().mockReturnValue(true),
      signIn: mockSignIn,
      signOut: mockSignOut,
      refreshUser: vi.fn(),
    })
  })

  it('1. Campo de senha inicia vazio e email pré-preenchido', () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )

    const emailInput = screen.getByLabelText(/e-mail/i) as HTMLInputElement
    const passwordInput = screen.getByLabelText(/senha/i) as HTMLInputElement

    expect(emailInput.value).toBe('rhuan.marx@diretoriapromocoes.com.br')
    expect(passwordInput.value).toBe('')
    expect(passwordInput.type).toBe('password')
  })

  it('2. Toggle mostrar/ocultar senha alterna entre password e text', () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )

    const passwordInput = screen.getByLabelText(/senha/i) as HTMLInputElement
    const toggleButton = screen.getByRole('button', { name: /exibir senha/i })

    expect(passwordInput.type).toBe('password')

    fireEvent.click(toggleButton)
    expect(passwordInput.type).toBe('text')

    const hideButton = screen.getByRole('button', { name: /ocultar senha/i })
    fireEvent.click(hideButton)
    expect(passwordInput.type).toBe('password')
  })

  it('3. Aviso de Caps Lock é exibido quando CapsLock é pressionado', () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )

    const passwordInput = screen.getByLabelText(/senha/i) as HTMLInputElement

    fireEvent.keyUp(passwordInput, {
      getModifierState: (key: string) => key === 'CapsLock',
    })

    expect(screen.getByText(/caps lock ativado/i)).toBeTruthy()

    fireEvent.keyUp(passwordInput, {
      getModifierState: (key: string) => (key === 'CapsLock' ? false : false),
    })

    expect(screen.queryByText(/caps lock ativado/i)).toBeNull()
  })

  it('4. Normalização de email (trim e lowercase) antes de enviar ao signIn', async () => {
    mockSignIn.mockResolvedValue({ success: true })

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )

    const emailInput = screen.getByLabelText(/e-mail/i)
    const passwordInput = screen.getByLabelText(/senha/i)
    const submitButton = screen.getByRole('button', { name: /entrar/i })

    fireEvent.change(emailInput, {
      target: { value: '  RHUAN.MARX@DiretoriaPromocoes.com.br  ' },
    })
    fireEvent.change(passwordInput, {
      target: { value: 'Skip@Pass' },
    })

    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith('rhuan.marx@diretoriapromocoes.com.br', 'Skip@Pass')
    })
  })

  it('5. Bloqueio de duplo envio durante requisição em andamento', async () => {
    let resolveSignIn: (val: any) => void = () => {}
    const slowPromise = new Promise((resolve) => {
      resolveSignIn = resolve
    })
    mockSignIn.mockReturnValue(slowPromise)

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )

    const passwordInput = screen.getByLabelText(/senha/i)
    fireEvent.change(passwordInput, { target: { value: 'Skip@Pass' } })

    const submitButton = screen.getByRole('button', { name: /entrar/i })
    fireEvent.click(submitButton)

    // O botão deve ficar disabled com spinner "Entrando..."
    const buttonElement = screen.getByRole('button', { name: /entrando/i }) as HTMLButtonElement
    expect(buttonElement.disabled).toBe(true)

    // Clicar novamente não deve chamar signIn uma segunda vez
    fireEvent.click(buttonElement)
    expect(mockSignIn).toHaveBeenCalledTimes(1)

    // Finaliza a promessa
    resolveSignIn({ success: true })
  })

  it('6. Validação local de email e senha vazios/curtos', async () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )

    const emailInput = screen.getByLabelText(/e-mail/i)
    const passwordInput = screen.getByLabelText(/senha/i)
    const submitButton = screen.getByRole('button', { name: /entrar/i })

    // Limpar email e senha
    fireEvent.change(emailInput, { target: { value: '' } })
    fireEvent.click(submitButton)

    expect(screen.getByText('O e-mail é obrigatório.')).toBeTruthy()
    expect(screen.getByText('A senha é obrigatória.')).toBeTruthy()
    expect(mockSignIn).not.toHaveBeenCalled()

    // Senha menor que 6 caracteres
    fireEvent.change(emailInput, { target: { value: 'user@test.com' } })
    fireEvent.change(passwordInput, { target: { value: '123' } })
    fireEvent.click(submitButton)

    expect(screen.getByText('A senha deve ter pelo menos 6 caracteres.')).toBeTruthy()
    expect(mockSignIn).not.toHaveBeenCalled()
  })
})
