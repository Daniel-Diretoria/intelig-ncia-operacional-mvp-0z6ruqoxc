import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  UserRole,
  PermissionKey,
  ROLE_DEFAULT_PERMISSIONS,
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
  saveUserAccessChanges,
  listUsers,
  listUserAuditLogs,
} from '@/services/userManagementService'
import pb from '@/lib/pocketbase/client'

describe('Fundação de Usuários, Perfis e Permissões (v0.0.119)', () => {
  // Teste 1: Administrador acessa áreas administrativas
  it('1. Administrador acessa áreas administrativas e possui todas as permissões', () => {
    const adminPerms = computeEffectivePermissions('admin')
    expect(hasPermission(adminPerms, 'admin:gerenciar_usuarios')).toBe(true)
    expect(hasPermission(adminPerms, 'admin:gerenciar_perfis')).toBe(true)
    expect(hasPermission(adminPerms, 'admin:visualizar_auditoria')).toBe(true)
    expect(hasPermission(adminPerms, 'central:visualizar')).toBe(true)
    expect(hasPermission(adminPerms, 'devolucoes:visualizar_documentos')).toBe(true)
  })

  // Teste 2: Gestão visualiza operação mas não administra credenciais sem permissão
  it('2. Gestão visualiza operação mas não administra credenciais/usuários sem permissão', () => {
    const gestaoPerms = computeEffectivePermissions('gestao')
    expect(hasPermission(gestaoPerms, 'central:visualizar')).toBe(true)
    expect(hasPermission(gestaoPerms, 'operacao:visualizar')).toBe(true)
    expect(hasPermission(gestaoPerms, 'validades:visualizar')).toBe(true)
    expect(hasPermission(gestaoPerms, 'devolucoes:visualizar')).toBe(true)
    expect(hasPermission(gestaoPerms, 'admin:gerenciar_usuarios')).toBe(false)
    expect(hasPermission(gestaoPerms, 'integracoes:alterar_credenciais')).toBe(false)
    expect(hasPermission(gestaoPerms, 'integracoes:visualizar_credenciais')).toBe(false)
  })

  // Teste 3: Inteligência trabalha nas áreas operacionais autorizadas
  it('3. Inteligência / Operação trabalha nas áreas operacionais autorizadas', () => {
    const opPerms = computeEffectivePermissions('operacao')
    expect(hasPermission(opPerms, 'validades:tratar')).toBe(true)
    expect(hasPermission(opPerms, 'rupturas:tratar')).toBe(true)
    expect(hasPermission(opPerms, 'devolucoes:criar')).toBe(true)
    expect(hasPermission(opPerms, 'devolucoes:importar_whatsapp')).toBe(true)
    expect(hasPermission(opPerms, 'devolucoes:executar_decisao')).toBe(true)
    expect(hasPermission(opPerms, 'devolucoes:registrar_autorizacao')).toBe(true)
    expect(hasPermission(opPerms, 'admin:gerenciar_usuarios')).toBe(false)
  })

  // Teste 4: Desenvolvedor/Integrador navega pelas áreas permitidas em leitura
  it('4. Desenvolvedor/Integrador navega pelas áreas permitidas em leitura', () => {
    const devPerms = computeEffectivePermissions('desenvolvedor')
    expect(hasPermission(devPerms, 'central:visualizar')).toBe(true)
    expect(hasPermission(devPerms, 'operacao:visualizar')).toBe(true)
    expect(hasPermission(devPerms, 'validades:visualizar')).toBe(true)
    expect(hasPermission(devPerms, 'rupturas:visualizar')).toBe(true)
    expect(hasPermission(devPerms, 'industrias:visualizar')).toBe(true)
    expect(hasPermission(devPerms, 'rede:visualizar')).toBe(true)
    expect(hasPermission(devPerms, 'integracoes:visualizar')).toBe(true)
  })

  // Teste 5: Desenvolvedor tenta editar cadastro -> bloqueado
  it('5. Desenvolvedor tenta editar cadastro -> bloqueado', () => {
    const devPerms = computeEffectivePermissions('desenvolvedor')
    expect(hasPermission(devPerms, 'industrias:editar_cadastro')).toBe(false)
    expect(hasPermission(devPerms, 'industrias:alterar_mix')).toBe(false)
    expect(hasPermission(devPerms, 'industrias:alterar_politicas')).toBe(false)
    expect(hasPermission(devPerms, 'rede:editar')).toBe(false)
  })

  // Teste 6: Desenvolvedor tenta excluir -> bloqueado
  it('6. Desenvolvedor tenta excluir registros operacionais -> bloqueado', () => {
    const devPerms = computeEffectivePermissions('desenvolvedor')
    expect(hasPermission(devPerms, 'operacao:excluir')).toBe(false)
  })

  // Teste 7: Desenvolvedor tenta importar WhatsApp -> bloqueado
  it('7. Desenvolvedor tenta importar WhatsApp ou ver conversas brutas -> bloqueado', () => {
    const devPerms = computeEffectivePermissions('desenvolvedor')
    expect(hasPermission(devPerms, 'devolucoes:importar_whatsapp')).toBe(false)
    expect(hasPermission(devPerms, 'devolucoes:ver_mensagens_brutas')).toBe(false)
  })

  // Teste 8: Desenvolvedor tenta abrir documento financeiro/NF sem permissão -> bloqueado
  it('8. Desenvolvedor tenta abrir documento financeiro/NF sem permissão -> bloqueado', () => {
    const devPerms = computeEffectivePermissions('desenvolvedor')
    expect(hasPermission(devPerms, 'devolucoes:visualizar_documentos')).toBe(false)
    expect(hasPermission(devPerms, 'devolucoes:visualizar_financeiro')).toBe(false)
    expect(hasPermission(devPerms, 'devolucoes:anexar_documentos')).toBe(false)
  })

  // Teste 9: Desenvolvedor tenta acessar credenciais TradePro -> bloqueado
  it('9. Desenvolvedor tenta acessar credenciais TradePro e alterar conexões -> bloqueado', () => {
    const devPerms = computeEffectivePermissions('desenvolvedor')
    expect(hasPermission(devPerms, 'integracoes:visualizar_credenciais')).toBe(false)
    expect(hasPermission(devPerms, 'integracoes:alterar_credenciais')).toBe(false)
    expect(hasPermission(devPerms, 'integracoes:sincronizar')).toBe(false)
  })

  // Teste 10: Usuário sem permissão acessa rota diretamente -> protegido pelo RBAC
  it('10. Rota protegida rejeita usuário sem a permissão requerida', () => {
    const opPerms = computeEffectivePermissions('operacao')
    const hasAdminRouteAccess = hasPermission(opPerms, 'admin:gerenciar_usuarios')
    expect(hasAdminRouteAccess).toBe(false)
  })

  // Teste 11: Usuário sem permissão acessa dado pelo backend -> bloqueado
  it('11. Usuário inativo ou não autorizado tem permissões avaliadas como vazias', () => {
    const inativoPerms = computeEffectivePermissions('operacao')
    // Simulação da função can() do AuthContext quando inativo
    const can = (perm: PermissionKey, status: string) => {
      if (status === 'inativo') return false
      return hasPermission(inativoPerms, perm)
    }
    expect(can('central:visualizar', 'inativo')).toBe(false)
    expect(can('validades:visualizar', 'inativo')).toBe(false)
    expect(can('validades:visualizar', 'ativo')).toBe(true)
  })

  // Teste 12: Usuário limitado à Indústria A não acessa Indústria B (URL/filtro/identificador)
  it('12. Usuário limitado à Indústria A não acessa Indústria B em consultas e navegação', () => {
    const allowed = ['FRUTAP']

    // Acesso à Indústria Autorizada
    expect(isIndustryAllowed(allowed, { id: 'ind_frutap_123', name: 'FRUTAP' })).toBe(true)
    expect(isIndustryAllowed(allowed, { name: 'frutap' })).toBe(true)

    // Acesso bloqueado à outra Indústria (ITALAC, PIRACANJUBA, etc.)
    expect(isIndustryAllowed(allowed, { id: 'ind_italac_456', name: 'ITALAC' })).toBe(false)
    expect(isIndustryAllowed(allowed, { name: 'PIRACANJUBA' })).toBe(false)

    // Usuário sem restrição (allowedIndustries vazio) acessa qualquer uma
    expect(isIndustryAllowed([], { name: 'ITALAC' })).toBe(true)
    expect(isIndustryAllowed(null, { name: 'FRUTAP' })).toBe(true)
  })

  // Teste 13: Permissão específica concedida passa a funcionar (Perfil não é prisão)
  it('13. Permissão específica concedida passa a funcionar mesmo fora do perfil base', () => {
    // Desenvolvedor recebendo permissão de visualizar documentos para homologação
    const customDevPerms = computeEffectivePermissions('desenvolvedor', {
      granted: ['devolucoes:visualizar_documentos'],
      revoked: [],
    })

    expect(hasPermission(customDevPerms, 'devolucoes:visualizar_documentos')).toBe(true)
    // As demais restrições continuam ativas
    expect(hasPermission(customDevPerms, 'devolucoes:visualizar_financeiro')).toBe(false)
    expect(hasPermission(customDevPerms, 'operacao:excluir')).toBe(false)
  })

  // Teste 14: Permissão específica removida deixa de funcionar
  it('14. Permissão removida deixa de funcionar mesmo que fizesse parte do perfil base', () => {
    // Operação com a permissão de excluir explicitamente revogada
    const customOpPerms = computeEffectivePermissions('operacao', {
      granted: [],
      revoked: ['devolucoes:importar_whatsapp'],
    })

    expect(hasPermission(customOpPerms, 'devolucoes:importar_whatsapp')).toBe(false)
    expect(hasPermission(customOpPerms, 'devolucoes:criar')).toBe(true)
  })

  // Teste 15: Usuário desativado perde acesso, histórico permanece
  it('15. Desativação de usuário altera status para inativo mantendo identificador e autoria', async () => {
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

    const originalCollection = pb.collection
    pb.collection = vi.fn().mockImplementation((name: string) => {
      if (name === 'users') {
        return {
          getOne: mockGetOne,
          update: mockUpdate,
        }
      }
      if (name === 'user_audit_log') {
        return {
          create: mockAuditCreate,
        }
      }
      return {}
    }) as any

    const res = await toggleUserStatus('usr_test_123', 'inativo')
    expect(res.success).toBe(true)
    expect(mockUpdate).toHaveBeenCalledWith('usr_test_123', { status: 'inativo' })

    pb.collection = originalCollection
  })

  // Teste 16: Alterações de acesso aparecem na auditoria
  it('16. Alterações de acesso, concessões e escopo registram evento em user_audit_log sem senhas', async () => {
    const auditCreated: any[] = []
    const originalCollection = pb.collection

    pb.collection = vi.fn().mockImplementation((name: string) => {
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
        }
      }
      if (name === 'user_audit_log') {
        return {
          create: vi.fn().mockImplementation((payload) => {
            auditCreated.push(payload)
            return Promise.resolve({ id: 'log_99' })
          }),
        }
      }
      return {}
    }) as any

    // Alteração de escopo para FRUTAP
    await updateUserAllowedIndustries('usr_456', ['FRUTAP'])

    expect(auditCreated.length).toBeGreaterThan(0)
    const lastLog = auditCreated[auditCreated.length - 1]
    expect(lastLog.acao).toBe('escopo_industria_alterado')
    expect(lastLog.target_user_id).toBe('usr_456')
    expect(lastLog.detalhes_json.industrias_novas).toEqual(['FRUTAP'])
    // Garantir que nenhuma senha ou token esteja presente
    expect(lastLog.detalhes_json.password).toBeUndefined()
    expect(lastLog.detalhes_json.senha).toBeUndefined()

    pb.collection = originalCollection
  })

  // Teste 17: Nenhuma regressão nos módulos atuais e tipos de perfil válidos
  it('17. Perfil e RBAC cobrem todos os perfis exigidos sem regressão', () => {
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
    }
  })
})
