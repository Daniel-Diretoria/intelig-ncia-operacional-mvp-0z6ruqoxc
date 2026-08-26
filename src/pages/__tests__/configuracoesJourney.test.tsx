import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { MemoryRouter } from 'react-router-dom'
import { ConfiguracoesPage } from '../Configuracoes'
import * as authContextModule from '@/services/authContext'
import pb from '@/lib/pocketbase/client'

describe('ConfiguracoesPage Journey', () => {
  const mockUser = {
    id: 'bumacp2xh84zjzu',
    email: 'rhuan.marx@diretoriapromocoes.com.br',
    name: 'Rhuan Marx',
    role: 'Administrador',
    verified: true,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(authContextModule, 'useAuth').mockReturnValue({
      user: mockUser as any,
      token: 'fake-jwt-token',
      isLoading: false,
      isAuthenticated: true,
      signIn: vi.fn(),
      signOut: vi.fn(),
    })
  })

  it('1. Renderiza seções de Alterar Senha e Informações da Conta com dados do usuário', () => {
    render(
      <MemoryRouter>
        <ConfiguracoesPage />
      </MemoryRouter>,
    )

    expect(screen.getByText('Configurações da Conta')).toBeTruthy()
    expect(screen.getByText('Alterar Senha')).toBeTruthy()
    expect(screen.getByText('Informações da Conta')).toBeTruthy()

    // Dados somente leitura do usuário
    expect(screen.getByText('Rhuan Marx')).toBeTruthy()
    expect(screen.getByText('rhuan.marx@diretoriapromocoes.com.br')).toBeTruthy()
    expect(screen.getByText('Administrador')).toBeTruthy()
    expect(screen.getByText('bumacp2xh84zjzu')).toBeTruthy()
  })

  it('2. Toggle mostrar/ocultar senha para os três campos', () => {
    render(
      <MemoryRouter>
        <ConfiguracoesPage />
      </MemoryRouter>,
    )

    const oldPassInput = screen.getByLabelText(/senha atual/i) as HTMLInputElement
    const newPassInput = screen.getByLabelText(/^nova senha/i) as HTMLInputElement
    const confirmPassInput = screen.getByLabelText(/confirmar nova senha/i) as HTMLInputElement

    expect(oldPassInput.type).toBe('password')
    expect(newPassInput.type).toBe('password')
    expect(confirmPassInput.type).toBe('password')

    // Toggle Senha Atual
    const toggleOld = screen.getByRole('button', { name: /exibir senha atual/i })
    fireEvent.click(toggleOld)
    expect(oldPassInput.type).toBe('text')

    // Toggle Nova Senha
    const toggleNew = screen.getByRole('button', { name: /exibir nova senha/i })
    fireEvent.click(toggleNew)
    expect(newPassInput.type).toBe('text')

    // Toggle Confirmar Nova Senha
    const toggleConfirm = screen.getByRole('button', { name: /exibir confirmação da senha/i })
    fireEvent.click(toggleConfirm)
    expect(confirmPassInput.type).toBe('text')
  })

  it('3. Validações em tempo real: tamanho mínimo (8 chars) e igualdade de confirmação', () => {
    render(
      <MemoryRouter>
        <ConfiguracoesPage />
      </MemoryRouter>,
    )

    const newPassInput = screen.getByLabelText(/^nova senha/i) as HTMLInputElement
    const confirmPassInput = screen.getByLabelText(/confirmar nova senha/i) as HTMLInputElement
    const submitBtn = screen.getByRole('button', { name: /alterar senha/i }) as HTMLButtonElement

    // Inicialmente desabilitado
    expect(submitBtn.disabled).toBe(true)

    // Digita senha com 6 caracteres -> alerta de faltam 2 caracteres
    fireEvent.change(newPassInput, { target: { value: '123456' } })
    expect(screen.getByText(/faltam 2 caractere\(s\)/i)).toBeTruthy()

    // Completa 8 caracteres
    fireEvent.change(newPassInput, { target: { value: '12345678' } })
    expect(screen.getByText(/mínimo de 8 caracteres atingido/i)).toBeTruthy()

    // Confirmação diferente
    fireEvent.change(confirmPassInput, { target: { value: '12345679' } })
    expect(screen.getByText(/as senhas não conferem/i)).toBeTruthy()
    expect(submitBtn.disabled).toBe(true)

    // Confirmação igual
    fireEvent.change(confirmPassInput, { target: { value: '12345678' } })
    expect(screen.getByText(/as senhas conferem/i)).toBeTruthy()
  })

  it('4. Envio com sucesso chama pb.collection("users").update com oldPassword, password e passwordConfirm', async () => {
    const mockUpdate = vi.fn().mockResolvedValue({ id: 'bumacp2xh84zjzu' })
    vi.spyOn(pb, 'collection').mockReturnValue({
      update: mockUpdate,
    } as any)

    render(
      <MemoryRouter>
        <ConfiguracoesPage />
      </MemoryRouter>,
    )

    const oldPassInput = screen.getByLabelText(/senha atual/i) as HTMLInputElement
    const newPassInput = screen.getByLabelText(/^nova senha/i) as HTMLInputElement
    const confirmPassInput = screen.getByLabelText(/confirmar nova senha/i) as HTMLInputElement
    const submitBtn = screen.getByRole('button', { name: /alterar senha/i }) as HTMLButtonElement

    fireEvent.change(oldPassInput, { target: { value: '123456789' } })
    fireEvent.change(newPassInput, { target: { value: 'NovaSenha@2026' } })
    fireEvent.change(confirmPassInput, { target: { value: 'NovaSenha@2026' } })

    expect(submitBtn.disabled).toBe(false)
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith('bumacp2xh84zjzu', {
        oldPassword: '123456789',
        password: 'NovaSenha@2026',
        passwordConfirm: 'NovaSenha@2026',
      })
    })

    expect(await screen.findByText('Senha alterada com sucesso!')).toBeTruthy()
    // Limpeza dos campos após sucesso
    expect(oldPassInput.value).toBe('')
    expect(newPassInput.value).toBe('')
    expect(confirmPassInput.value).toBe('')
  })

  it('5. Tratamento de erro quando a senha atual está incorreta', async () => {
    const mockUpdate = vi.fn().mockRejectedValue({
      status: 400,
      data: {
        data: {
          oldPassword: { message: 'A senha atual informada está incorreta.' },
        },
      },
    })
    vi.spyOn(pb, 'collection').mockReturnValue({
      update: mockUpdate,
    } as any)

    render(
      <MemoryRouter>
        <ConfiguracoesPage />
      </MemoryRouter>,
    )

    const oldPassInput = screen.getByLabelText(/senha atual/i) as HTMLInputElement
    const newPassInput = screen.getByLabelText(/^nova senha/i) as HTMLInputElement
    const confirmPassInput = screen.getByLabelText(/confirmar nova senha/i) as HTMLInputElement
    const submitBtn = screen.getByRole('button', { name: /alterar senha/i }) as HTMLButtonElement

    fireEvent.change(oldPassInput, { target: { value: 'senhaErrada' } })
    fireEvent.change(newPassInput, { target: { value: 'NovaSenha@2026' } })
    fireEvent.change(confirmPassInput, { target: { value: 'NovaSenha@2026' } })

    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(screen.getByText('A senha atual informada está incorreta.')).toBeTruthy()
    })
  })
})
