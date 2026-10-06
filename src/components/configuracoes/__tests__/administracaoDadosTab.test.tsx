import '@testing-library/jest-dom/vitest'
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AdministracaoDadosTab } from '@/components/configuracoes/AdministracaoDadosTab'
import * as authContext from '@/services/authContext'
import * as cleanupService from '@/services/operationalCleanupService'
import { vi } from 'vitest'

describe('AdministracaoDadosTab', () => {
  it('bloqueia visualização para usuário que não é administrador', () => {
    vi.spyOn(authContext, 'useAuth').mockReturnValue({
      user: { id: 'usr_1', role: 'operador', name: 'Operador Teste', email: 'op@test.com' },
      can: () => false,
    } as any)

    render(<AdministracaoDadosTab />)

    expect(screen.getByText(/Área Restrita a Administradores/i)).toBeInTheDocument()
    expect(screen.getByText(/operador/i)).toBeInTheDocument()
    expect(screen.queryByText(/Confirmar Limpeza Operacional/i)).not.toBeInTheDocument()
  })

  it('permite acesso a administradores, exibe estatísticas e modal com confirmação explícita "LIMPAR"', async () => {
    vi.spyOn(authContext, 'useAuth').mockReturnValue({
      user: { id: 'usr_admin', role: 'admin', name: 'Administrador', email: 'admin@test.com' },
      can: () => true,
    } as any)

    vi.spyOn(cleanupService, 'getOperationalCleanupStats').mockResolvedValue({
      validades: 250,
      validadesBase: 250,
      validadesImported: 0,
      rupturas: 80,
      operationalCrossEvidence: 15,
      auditoriaPendencias: 4,
      timestamp: new Date().toISOString(),
    })

    vi.spyOn(cleanupService, 'listOperationalBackups').mockResolvedValue([])

    const executeSpy = vi.spyOn(cleanupService, 'executeOperationalCleanup').mockResolvedValue({
      success: true,
      message: 'Limpeza operacional executada com sucesso.',
      target: 'all',
      backupCode: 'BKPOP_TEST',
      backupRecordId: 'rec_1',
      removed: {
        validades: 250,
        rupturas: 80,
        operationalCrossEvidence: 15,
        auditoriaPendencias: 4,
      },
      dataExecucao: new Date().toISOString(),
    })

    render(<AdministracaoDadosTab />)

    // Aguardar carregamento das estatísticas
    await waitFor(() => {
      expect(screen.getByText('250')).toBeInTheDocument()
      expect(screen.getByText('80')).toBeInTheDocument()
    })

    // Garantias visuais do que é preservado
    expect(screen.getByText(/O que fica 100% preservado e intacto:/i)).toBeInTheDocument()
    expect(screen.getByText(/Mix Oficial, Definido e Observado/i)).toBeInTheDocument()
    expect(screen.getByText(/Módulo Devoluções\/NF/i)).toBeInTheDocument()

    // Abrir modal de limpeza
    const btnLimpar = screen.getByRole('button', { name: /Limpar Validades e Rupturas/i })
    fireEvent.click(btnLimpar)

    expect(screen.getByText(/Confirmar Limpeza Operacional/i)).toBeInTheDocument()

    // Botão de confirmação deve começar desabilitado
    const btnConfirm = screen.getByRole('button', { name: /Confirmar Exclusão Definitiva/i })
    expect(btnConfirm).toBeDisabled()

    // Digitar palavra-chave errada
    const inputConfirm = screen.getByPlaceholderText('LIMPAR')
    fireEvent.change(inputConfirm, { target: { value: 'SIM' } })
    expect(btnConfirm).toBeDisabled()

    // Digitar palavra-chave correta LIMPAR
    fireEvent.change(inputConfirm, { target: { value: 'LIMPAR' } })
    expect(btnConfirm).not.toBeDisabled()

    // Submeter exclusão
    fireEvent.click(btnConfirm)

    await waitFor(() => {
      expect(executeSpy).toHaveBeenCalledWith({
        target: 'all',
        confirmText: 'LIMPAR',
        motivo: 'Preparação do piloto histórico',
      })
    })
  })
})
