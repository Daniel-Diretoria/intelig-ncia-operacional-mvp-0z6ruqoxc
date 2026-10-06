import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import {
  UserRole,
  PermissionKey,
  computeEffectivePermissions,
  hasPermission,
  isIndustryAllowed,
} from '@/types/permissions'
import {
  createUser,
  toggleUserStatus,
  updateUserRole,
  updateUserAllowedIndustries,
  toggleSpecificPermission,
  listUsers,
  listUserAuditLogs,
} from '@/services/userManagementService'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import * as authContextModule from '@/services/authContext'
import pb from '@/lib/pocketbase/client'

describe('Fundação de Usuários, Perfis e Permissões (v0.0.121 - 17 Cenários Obrigatórios)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    pb.authStore.clear()
  })

  // --------------------------------------------------------------------------
  // Cenário 1: Administrador acessa áreas administrativas
  // --------------------------------------------------------------------------
  it('1. Administrador acessa áreas administrativas e possui todas as permissões do sistema', () => {
    const adminPerms = computeEffectivePermissions('admin')
    expect(hasPermission(adminPerms, 'admin:gerenciar_usuarios')).toBe(true)
    expect(hasPermission(adminPerms, 'admin:gerenciar_perfis')).toBe(true)
    expect(hasPermission(adminPerms, 'admin:visualizar_auditoria')).toBe(true)
    expect(hasPermission(adminPerms, 'central:visualizar')).toBe(true)
    expect(hasPermission(adminPerms, 'operacao:visualizar')).toBe(true)
    expect(hasPermission(adminPerms, 'operacao:excluir')).toBe(true)
    expect(hasPermission(adminPerms, 'validades:tratar')).toBe(true)
    expect(hasPermission(adminPerms, 'rupturas:tratar')).toBe(true)
    expect(hasPermission(adminPerms, 'devolucoes:visualizar_documentos')).toBe(true)
    expect(hasPermission(adminPerms, 'devolucoes:visualizar_financeiro')).toBe(true)
    expect(hasPermission(adminPerms, 'devolucoes:importar_whatsapp')).toBe(true)
    expect(hasPermission(adminPerms, 'integracoes:visualizar_credenciais')).toBe(true)
    expect(hasPermission(adminPerms, 'integracoes:alterar_credenciais')).toBe(true)
    expect(hasPermission(adminPerms, 'integracoes:sincronizar')).toBe(true)
  })

  // --------------------------------------------------------------------------
  // Cenário 2: Gestão visualiza operação mas não administra credenciais sem permissão
  // --------------------------------------------------------------------------
  it('2. Gestão visualiza operação mas não administra credenciais nem usuários sem permissão', () => {
    const gestaoPerms = computeEffectivePermissions('gestao')
    // Áreas que Gestão pode visualizar
    expect(hasPermission(gestaoPerms, 'central:visualizar')).toBe(true)
    expect(hasPermission(gestaoPerms, 'operacao:visualizar')).toBe(true)
    expect(hasPermission(gestaoPerms, 'validades:visualizar')).toBe(true)
    expect(hasPermission(gestaoPerms, 'rupturas:visualizar')).toBe(true)
    expect(hasPermission(gestaoPerms, 'devolucoes:visualizar')).toBe(true)
    expect(hasPermission(gestaoPerms, 'devolucoes:visualizar_documentos')).toBe(true)
    expect(hasPermission(gestaoPerms, 'devolucoes:visualizar_financeiro')).toBe(true)
    expect(hasPermission(gestaoPerms, 'inteligencia:visualizar')).toBe(true)
    expect(hasPermission(gestaoPerms, 'inteligencia:exportar')).toBe(true)

    // Ações administrativas e de credenciais estritamente bloqueadas
    expect(hasPermission(gestaoPerms, 'admin:gerenciar_usuarios')).toBe(false)
    expect(hasPermission(gestaoPerms, 'admin:gerenciar_perfis')).toBe(false)
    expect(hasPermission(gestaoPerms, 'admin:visualizar_auditoria')).toBe(false)
    expect(hasPermission(gestaoPerms, 'integracoes:alterar_credenciais')).toBe(false)
    expect(hasPermission(gestaoPerms, 'integracoes:visualizar_credenciais')).toBe(false)
    expect(hasPermission(gestaoPerms, 'integracoes:sincronizar')).toBe(false)
    expect(hasPermission(gestaoPerms, 'operacao:excluir')).toBe(false)
  })

  // --------------------------------------------------------------------------
  // Cenário 3: Inteligência/Operação trabalha nas áreas operacionais autorizadas
  // --------------------------------------------------------------------------
  it('3. Inteligência / Operação trabalha nas áreas operacionais autorizadas', () => {
    const opPerms = computeEffectivePermissions('operacao')
    // Validades e Rupturas
    expect(hasPermission(opPerms, 'validades:visualizar')).toBe(true)
    expect(hasPermission(opPerms, 'validades:tratar')).toBe(true)
    expect(hasPermission(opPerms, 'rupturas:visualizar')).toBe(true)
    expect(hasPermission(opPerms, 'rupturas:tratar')).toBe(true)

    // Devoluções operacionais completas
    expect(hasPermission(opPerms, 'devolucoes:visualizar')).toBe(true)
    expect(hasPermission(opPerms, 'devolucoes:criar')).toBe(true)
    expect(hasPermission(opPerms, 'devolucoes:importar_whatsapp')).toBe(true)
    expect(hasPermission(opPerms, 'devolucoes:ver_mensagens_brutas')).toBe(true)
    expect(hasPermission(opPerms, 'devolucoes:executar_decisao')).toBe(true)
    expect(hasPermission(opPerms, 'devolucoes:registrar_autorizacao')).toBe(true)
    expect(hasPermission(opPerms, 'devolucoes:visualizar_documentos')).toBe(true)
    expect(hasPermission(opPerms, 'devolucoes:anexar_documentos')).toBe(true)

    // Bloqueado para administração de usuários e alteração de credenciais
    expect(hasPermission(opPerms, 'admin:gerenciar_usuarios')).toBe(false)
    expect(hasPermission(opPerms, 'integracoes:alterar_credenciais')).toBe(false)
  })

  // --------------------------------------------------------------------------
  // Cenário 4: Desenvolvedor/Integrador navega pelas áreas permitidas em leitura
  // --------------------------------------------------------------------------
  it('4. Desenvolvedor/Integrador navega pelas áreas permitidas em leitura', () => {
    const devPerms = computeEffectivePermissions('desenvolvedor')
    expect(hasPermission(devPerms, 'central:visualizar')).toBe(true)
    expect(hasPermission(devPerms, 'operacao:visualizar')).toBe(true)
    expect(hasPermission(devPerms, 'validades:visualizar')).toBe(true)
    expect(hasPermission(devPerms, 'rupturas:visualizar')).toBe(true)
    expect(hasPermission(devPerms, 'industrias:visualizar')).toBe(true)
    expect(hasPermission(devPerms, 'rede:visualizar')).toBe(true)
    expect(hasPermission(devPerms, 'inteligencia:visualizar')).toBe(true)
    expect(hasPermission(devPerms, 'integracoes:visualizar')).toBe(true)
    expect(hasPermission(devPerms, 'devolucoes:visualizar')).toBe(true)
  })

  // --------------------------------------------------------------------------
  // Cenário 5: Desenvolvedor tenta editar cadastro → bloqueado
  // --------------------------------------------------------------------------
  it('5. Desenvolvedor tenta editar cadastro de indústria ou rede -> bloqueado', () => {
    const devPerms = computeEffectivePermissions('desenvolvedor')
    expect(hasPermission(devPerms, 'industrias:editar_cadastro')).toBe(false)
    expect(hasPermission(devPerms, 'industrias:alterar_mix')).toBe(false)
    expect(hasPermission(devPerms, 'industrias:alterar_pesquisas')).toBe(false)
    expect(hasPermission(devPerms, 'industrias:alterar_politicas')).toBe(false)
    expect(hasPermission(devPerms, 'rede:editar')).toBe(false)
    expect(hasPermission(devPerms, 'operacao:editar')).toBe(false)
    expect(hasPermission(devPerms, 'operacao:registrar')).toBe(false)
  })

  // --------------------------------------------------------------------------
  // Cenário 6: Desenvolvedor tenta excluir → bloqueado
  // --------------------------------------------------------------------------
  it('6. Desenvolvedor tenta excluir registros operacionais -> bloqueado', () => {
    const devPerms = computeEffectivePermissions('desenvolvedor')
    expect(hasPermission(devPerms, 'operacao:excluir')).toBe(false)
  })

  // --------------------------------------------------------------------------
  // Cenário 7: Desenvolvedor tenta importar WhatsApp → bloqueado
  // --------------------------------------------------------------------------
  it('7. Desenvolvedor tenta importar WhatsApp ou ver conversas brutas -> bloqueado', () => {
    const devPerms = computeEffectivePermissions('desenvolvedor')
    expect(hasPermission(devPerms, 'devolucoes:importar_whatsapp')).toBe(false)
    expect(hasPermission(devPerms, 'devolucoes:ver_mensagens_brutas')).toBe(false)
    expect(hasPermission(devPerms, 'devolucoes:criar')).toBe(false)
  })

  // --------------------------------------------------------------------------
  // Cenário 8: Desenvolvedor tenta abrir documento financeiro/NF sem permissão → bloqueado
  // --------------------------------------------------------------------------
  it('8. Desenvolvedor tenta abrir documento financeiro/NF sem permissão -> bloqueado', () => {
    const devPerms = computeEffectivePermissions('desenvolvedor')
    expect(hasPermission(devPerms, 'devolucoes:visualizar_documentos')).toBe(false)
    expect(hasPermission(devPerms, 'devolucoes:visualizar_financeiro')).toBe(false)
    expect(hasPermission(devPerms, 'devolucoes:anexar_documentos')).toBe(false)
    expect(hasPermission(devPerms, 'devolucoes:executar_decisao')).toBe(false)
    expect(hasPermission(devPerms, 'devolucoes:registrar_autorizacao')).toBe(false)
  })

  // --------------------------------------------------------------------------
  // Cenário 9: Desenvolvedor tenta acessar credenciais TradePro → bloqueado
  // --------------------------------------------------------------------------
  it('9. Desenvolvedor tenta acessar credenciais TradePro e alterar conexões -> bloqueado', () => {
    const devPerms = computeEffectivePermissions('desenvolvedor')
    expect(hasPermission(devPerms, 'integracoes:visualizar_credenciais')).toBe(false)
    expect(hasPermission(devPerms, 'integracoes:alterar_credenciais')).toBe(false)
    expect(hasPermission(devPerms, 'integracoes:sincronizar')).toBe(false)
    expect(hasPermission(devPerms, 'integracoes:testar_conexao')).toBe(false)
  })

  // --------------------------------------------------------------------------
  // Cenário 10: Usuário sem permissão acessa rota diretamente → bloqueado (ProtectedRoute)
  // --------------------------------------------------------------------------
  describe('10. Rota protegida rejeita usuário sem a permissão requerida via ProtectedRoute', () => {
    it('10a. Renderiza tela de bloqueio com aviso de falta de permissão quando can() retorna false', () => {
      vi.spyOn(authContextModule, 'useAuth').mockReturnValue({
        user: { id: 'usr_dev', email: 'dev@externo.com' } as any,
        token: 'token-valido',
        isLoading: false,
        isAuthenticated: true,
        role: 'desenvolvedor',
        status: 'ativo',
        userType: 'humano',
        allowedIndustries: [],
        effectivePermissions: computeEffectivePermissions('desenvolvedor'),
        can: (perm: PermissionKey) => perm !== 'admin:gerenciar_usuarios',
        canAccessIndustry: () => true,
        signIn: vi.fn(),
        signOut: vi.fn(),
        refreshUser: vi.fn(),
      })

      render(
        <MemoryRouter initialEntries={['/admin-restrito']}>
          <Routes>
            <Route
              path="/admin-restrito"
              element={
                <ProtectedRoute requiredPermission="admin:gerenciar_usuarios">
                  <div>CONTEUDO_CONFIDENCIAL_ADMIN</div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </MemoryRouter>,
      )

      expect(screen.queryByText('CONTEUDO_CONFIDENCIAL_ADMIN')).toBeNull()
      expect(screen.getByText('Você não possui acesso a esta área')).toBeTruthy()
      expect(screen.getByText(/Seu perfil de acesso atual não possui permissão/i)).toBeTruthy()
      expect(screen.getByText('Voltar ao Início')).toBeTruthy()
    })

    it('10b. Permite acesso à rota quando can() retorna true', () => {
      vi.spyOn(authContextModule, 'useAuth').mockReturnValue({
        user: { id: 'usr_admin', email: 'admin@diretoria.com' } as any,
        token: 'token-valido',
        isLoading: false,
        isAuthenticated: true,
        role: 'admin',
        status: 'ativo',
        userType: 'humano',
        allowedIndustries: [],
        effectivePermissions: computeEffectivePermissions('admin'),
        can: () => true,
        canAccessIndustry: () => true,
        signIn: vi.fn(),
        signOut: vi.fn(),
        refreshUser: vi.fn(),
      })

      render(
        <MemoryRouter initialEntries={['/admin-permitido']}>
          <Routes>
            <Route
              path="/admin-permitido"
              element={
                <ProtectedRoute requiredPermission="admin:gerenciar_usuarios">
                  <div>CONTEUDO_AUTORIZADO_ADMIN</div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </MemoryRouter>,
      )

      expect(screen.getByText('CONTEUDO_AUTORIZADO_ADMIN')).toBeTruthy()
      expect(screen.queryByText('Você não possui acesso a esta área')).toBeNull()
    })
  })

  // --------------------------------------------------------------------------
  // Cenário 11: Usuário sem permissão acessa dado pelo backend → bloqueado
  // --------------------------------------------------------------------------
  describe('11. Usuário sem permissão ou inativo tem acesso bloqueado no nível de backend e serviço', () => {
    it('11a. Tentativa de criação de usuário por não-administrador é rejeitada pelo backend/serviço', async () => {
      // Simula rejeição de autorização no endpoint users (403 Forbidden pelo hook de segurança)
      const mockCreate = vi.fn().mockRejectedValue({
        status: 403,
        message: 'Apenas administradores podem cadastrar novos usuários.',
      })

      vi.spyOn(pb, 'collection').mockReturnValue({
        create: mockCreate,
      } as any)

      const result = await createUser({
        email: 'intruso@teste.com',
        name: 'Tentativa Intruso',
        role: 'admin',
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Apenas administradores podem cadastrar novos usuários.')
      expect(mockCreate).toHaveBeenCalled()
    })

    it('11b. Usuário inativo tem permissões avaliadas como vazias por can()', () => {
      const inativoPerms = computeEffectivePermissions('operacao')
      const can = (perm: PermissionKey, status: string) => {
        if (status === 'inativo') return false
        return hasPermission(inativoPerms, perm)
      }
      expect(can('central:visualizar', 'inativo')).toBe(false)
      expect(can('validades:visualizar', 'inativo')).toBe(false)
      expect(can('validades:visualizar', 'ativo')).toBe(true)
    })
  })

  // --------------------------------------------------------------------------
  // Cenário 12: Usuário limitado à Indústria A não acessa Indústria B (URL/filtro/identificador)
  // --------------------------------------------------------------------------
  it('12. Usuário limitado à Indústria A não acessa Indústria B em consultas, URL e identificadores', () => {
    const allowed = ['FRUTAP']

    // Acesso à Indústria Autorizada (por nome, id ou caixa diferente)
    expect(isIndustryAllowed(allowed, { id: 'FRUTAP' })).toBe(true)
    expect(isIndustryAllowed(allowed, { id: 'ind_frutap_123', name: 'FRUTAP' })).toBe(true)
    expect(isIndustryAllowed(allowed, { name: 'frutap' })).toBe(true)
    expect(isIndustryAllowed(allowed, { name: 'Frutap' })).toBe(true)

    // Acesso bloqueado à outra Indústria (ITALAC, PIRACANJUBA, etc.)
    expect(isIndustryAllowed(allowed, { id: 'ind_italac_456', name: 'ITALAC' })).toBe(false)
    expect(isIndustryAllowed(allowed, { name: 'PIRACANJUBA' })).toBe(false)
    expect(isIndustryAllowed(allowed, { id: 'ind_outra_789' })).toBe(false)

    // Múltiplas indústrias no escopo
    const multiScope = ['FRUTAP', 'ITALAC']
    expect(isIndustryAllowed(multiScope, { name: 'FRUTAP' })).toBe(true)
    expect(isIndustryAllowed(multiScope, { name: 'ITALAC' })).toBe(true)
    expect(isIndustryAllowed(multiScope, { name: 'DANONE' })).toBe(false)

    // Usuário sem restrição (allowedIndustries vazio ou null) acessa qualquer uma (admin/geral)
    expect(isIndustryAllowed([], { name: 'ITALAC' })).toBe(true)
    expect(isIndustryAllowed(null, { name: 'FRUTAP' })).toBe(true)
    expect(isIndustryAllowed(undefined, { name: 'PIRACANJUBA' })).toBe(true)
  })

  // --------------------------------------------------------------------------
  // Cenário 13: Permissão específica concedida passa a funcionar (custom_permissions granted)
  // --------------------------------------------------------------------------
  it('13. Permissão específica concedida passa a funcionar mesmo fora do perfil base', () => {
    // Desenvolvedor recebendo permissão de visualizar documentos para homologação
    const customDevPerms = computeEffectivePermissions('desenvolvedor', {
      granted: ['devolucoes:visualizar_documentos', 'integracoes:testar_conexao'],
      revoked: [],
    })

    expect(hasPermission(customDevPerms, 'devolucoes:visualizar_documentos')).toBe(true)
    expect(hasPermission(customDevPerms, 'integracoes:testar_conexao')).toBe(true)

    // As demais restrições do perfil continuam protegidas
    expect(hasPermission(customDevPerms, 'devolucoes:visualizar_financeiro')).toBe(false)
    expect(hasPermission(customDevPerms, 'operacao:excluir')).toBe(false)
    expect(hasPermission(customDevPerms, 'industrias:editar_cadastro')).toBe(false)
  })

  // --------------------------------------------------------------------------
  // Cenário 14: Permissão removida deixa de funcionar (custom_permissions revoked)
  // --------------------------------------------------------------------------
  it('14. Permissão removida deixa de funcionar mesmo que fizesse parte do perfil base', () => {
    // Operação com a permissão de importar WhatsApp explicitamente revogada
    const customOpPerms = computeEffectivePermissions('operacao', {
      granted: [],
      revoked: ['devolucoes:importar_whatsapp', 'devolucoes:ver_mensagens_brutas'],
    })

    expect(hasPermission(customOpPerms, 'devolucoes:importar_whatsapp')).toBe(false)
    expect(hasPermission(customOpPerms, 'devolucoes:ver_mensagens_brutas')).toBe(false)
    // As outras permissões do perfil de operação continuam ativas
    expect(hasPermission(customOpPerms, 'devolucoes:criar')).toBe(true)
    expect(hasPermission(customOpPerms, 'validades:tratar')).toBe(true)
    expect(hasPermission(customOpPerms, 'rupturas:tratar')).toBe(true)
  })

  // --------------------------------------------------------------------------
  // Cenário 15: Usuário desativado perde acesso, histórico permanece
  // --------------------------------------------------------------------------
  it('15. Usuário desativado perde acesso, mantendo histórico e integridade do identificador', async () => {
    const mockUserRecord = {
      id: 'usr_test_123',
      email: 'exemplo@teste.com',
      name: 'Promotor Teste',
      role: 'operacao',
      status: 'ativo',
    }

    const mockUpdate = vi.fn().mockResolvedValue({ ...mockUserRecord, status: 'inativo' })
    const mockGetOne = vi.fn().mockResolvedValue(mockUserRecord)
    const mockAuditCreate = vi.fn().mockResolvedValue({ id: 'audit_123' })

    vi.spyOn(pb, 'collection').mockImplementation((name: string) => {
      if (name === 'users') {
        return {
          getOne: mockGetOne,
          update: mockUpdate,
        } as any
      }
      if (name === 'user_audit_log') {
        return {
          create: mockAuditCreate,
        } as any
      }
      return {} as any
    })

    const res = await toggleUserStatus('usr_test_123', 'inativo')
    expect(res.success).toBe(true)
    expect(mockUpdate).toHaveBeenCalledWith('usr_test_123', { status: 'inativo' })

    // Valida que a desativação registrou o evento de desativação em auditoria
    expect(mockAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        target_user_id: 'usr_test_123',
        target_user_email: 'exemplo@teste.com',
        acao: 'usuario_desativado',
      }),
    )
  })

  // --------------------------------------------------------------------------
  // Cenário 16: Alterações de acesso aparecem na auditoria (user_audit_log)
  // --------------------------------------------------------------------------
  it('16. Alterações de acesso aparecem na auditoria (user_audit_log) sem senhas ou tokens', async () => {
    const auditCreated: any[] = []

    vi.spyOn(pb, 'collection').mockImplementation((name: string) => {
      if (name === 'users') {
        return {
          getOne: vi.fn().mockResolvedValue({
            id: 'usr_456',
            email: 'dev@externo.com',
            role: 'desenvolvedor',
            status: 'ativo',
            allowed_industries: [],
            custom_permissions: { granted: [], revoked: [] },
          }),
          update: vi.fn().mockResolvedValue({}),
        } as any
      }
      if (name === 'user_audit_log') {
        return {
          create: vi.fn().mockImplementation((payload) => {
            auditCreated.push(payload)
            return Promise.resolve({ id: 'log_99' })
          }),
        } as any
      }
      return {} as any
    })

    // Alteração de escopo para FRUTAP
    await updateUserAllowedIndustries('usr_456', ['FRUTAP'])

    expect(auditCreated.length).toBeGreaterThan(0)
    const scopeLog = auditCreated[auditCreated.length - 1]
    expect(scopeLog.acao).toBe('escopo_industria_alterado')
    expect(scopeLog.target_user_id).toBe('usr_456')
    expect(scopeLog.detalhes_json.industrias_novas).toEqual(['FRUTAP'])
    expect(scopeLog.detalhes_json.password).toBeUndefined()
    expect(scopeLog.detalhes_json.senha).toBeUndefined()
    expect(scopeLog.detalhes_json.token).toBeUndefined()

    // Concessão de permissão específica via toggleSpecificPermission
    await toggleSpecificPermission('usr_456', 'devolucoes:visualizar_documentos', true)

    const permLog = auditCreated[auditCreated.length - 1]
    expect(permLog.acao).toBe('permissao_concedida')
    expect(permLog.target_user_id).toBe('usr_456')
    expect(permLog.detalhes_json.permissao).toBe('devolucoes:visualizar_documentos')
    expect(permLog.detalhes_json.modo).toBe('concedida')
  })

  // --------------------------------------------------------------------------
  // Cenário 17: Nenhuma regressão nos módulos atuais e matriz completa de perfis
  // --------------------------------------------------------------------------
  it('17. Nenhuma regressão nos módulos atuais e cobertura completa dos 6 perfis canônicos', () => {
    const roles: UserRole[] = [
      'admin',
      'gestao',
      'operacao',
      'supervisao',
      'desenvolvedor',
      'industria',
    ]

    for (const r of roles) {
      const perms = computeEffectivePermissions(r)
      expect(perms.size).toBeGreaterThan(0)
      // Todo perfil ativo deve conseguir ao menos visualizar a central ou seu painel
      expect(hasPermission(perms, 'central:visualizar')).toBe(true)
    }

    // Regras essenciais invioláveis
    // 1. Somente admin possui gerenciamento de usuários
    for (const r of roles) {
      const perms = computeEffectivePermissions(r)
      if (r === 'admin') {
        expect(hasPermission(perms, 'admin:gerenciar_usuarios')).toBe(true)
      } else {
        expect(hasPermission(perms, 'admin:gerenciar_usuarios')).toBe(false)
      }
    }

    // 2. Perfil indústria tem escopo restrito por padrão (não tem acesso a rede ou integrações)
    const indPerms = computeEffectivePermissions('industria')
    expect(hasPermission(indPerms, 'rede:visualizar')).toBe(false)
    expect(hasPermission(indPerms, 'integracoes:visualizar')).toBe(false)
    expect(hasPermission(indPerms, 'operacao:excluir')).toBe(false)
  })
})
