/**
 * SKIP — Serviço de Gestão de Usuários, Perfis, Permissões e Auditoria Administrativa
 * v0.0.119
 */

import pb from '@/lib/pocketbase/client'
import {
  UserRole,
  UserStatus,
  UserType,
  PermissionKey,
  CustomPermissionsPayload,
  computeEffectivePermissions,
} from '@/types/permissions'

export interface AppUserRecord {
  id: string
  email: string
  name: string
  role: UserRole
  status: UserStatus
  user_type: UserType
  allowed_industries: string[]
  custom_permissions: CustomPermissionsPayload
  last_access_at?: string
  created: string
  updated: string
  avatar?: string
}

export interface UserAuditLogEntry {
  id: string
  user_id: string
  target_user_id: string
  target_user_email?: string
  acao:
    | 'usuario_criado'
    | 'usuario_ativado'
    | 'usuario_desativado'
    | 'perfil_alterado'
    | 'permissao_concedida'
    | 'permissao_removida'
    | 'escopo_industria_alterado'
    | 'login_efetuado'
    | 'outro'
  detalhes_json: Record<string, unknown>
  executor_nome: string
  executor_id: string
  data_acao: string
  created: string
}

export interface CreateUserInput {
  email: string
  name: string
  password?: string
  role: UserRole
  user_type?: UserType
  allowed_industries?: string[]
}

export interface UpdateUserAccessInput {
  userId: string
  role?: UserRole
  status?: UserStatus
  allowed_industries?: string[]
  custom_permissions?: CustomPermissionsPayload
}

/**
 * Normaliza campos do registro de usuário retornado pelo PocketBase
 */
function parseUserRecord(raw: any): AppUserRecord {
  let allowedIndustries: string[] = []
  if (Array.isArray(raw.allowed_industries)) {
    allowedIndustries = raw.allowed_industries
  } else if (typeof raw.allowed_industries === 'string' && raw.allowed_industries.trim() !== '') {
    try {
      allowedIndustries = JSON.parse(raw.allowed_industries)
    } catch (_) {
      allowedIndustries = []
    }
  }

  let customPermissions: CustomPermissionsPayload = { granted: [], revoked: [] }
  if (raw.custom_permissions && typeof raw.custom_permissions === 'object') {
    customPermissions = {
      granted: Array.isArray(raw.custom_permissions.granted) ? raw.custom_permissions.granted : [],
      revoked: Array.isArray(raw.custom_permissions.revoked) ? raw.custom_permissions.revoked : [],
    }
  } else if (typeof raw.custom_permissions === 'string' && raw.custom_permissions.trim() !== '') {
    try {
      const parsed = JSON.parse(raw.custom_permissions)
      customPermissions = {
        granted: Array.isArray(parsed.granted) ? parsed.granted : [],
        revoked: Array.isArray(parsed.revoked) ? parsed.revoked : [],
      }
    } catch (_) {
      customPermissions = { granted: [], revoked: [] }
    }
  }

  return {
    id: raw.id,
    email: raw.email || '',
    name: raw.name || raw.email?.split('@')[0] || 'Usuário',
    role: (raw.role as UserRole) || 'operacao',
    status: (raw.status as UserStatus) || 'ativo',
    user_type: (raw.user_type as UserType) || 'humano',
    allowed_industries: allowedIndustries,
    custom_permissions: customPermissions,
    last_access_at: raw.last_access_at,
    created: raw.created || '',
    updated: raw.updated || '',
    avatar: raw.avatar,
  }
}

/**
 * Registra ação de auditoria administrativa de usuários
 */
export async function logUserAudit(
  targetUserId: string,
  targetUserEmail: string,
  acao: UserAuditLogEntry['acao'],
  detalhes: Record<string, unknown>,
): Promise<void> {
  try {
    const currentAuth = pb.authStore.record
    const executorNome = currentAuth?.name || currentAuth?.email || 'Administrador'
    const executorId = currentAuth?.id || ''

    // Nunca gravar senhas ou tokens em logs (Regra de segurança absoluta)
    const sanitizedDetalhes = { ...detalhes }
    delete (sanitizedDetalhes as any).password
    delete (sanitizedDetalhes as any).senha
    delete (sanitizedDetalhes as any).token

    await pb.collection('user_audit_log').create({
      user_id: executorId,
      target_user_id: targetUserId,
      target_user_email: targetUserEmail,
      acao: acao,
      detalhes_json: sanitizedDetalhes,
      executor_nome: executorNome,
      executor_id: executorId,
      data_acao: new Date().toISOString(),
    })
  } catch (err) {
    console.warn('[userManagementService] Falha ao registrar log de auditoria de usuário:', err)
  }
}

/**
 * Lista todos os usuários cadastrados
 */
export async function listUsers(): Promise<AppUserRecord[]> {
  try {
    const records = await pb.collection('users').getFullList({
      sort: '-created',
    })
    return records.map(parseUserRecord)
  } catch (err) {
    console.error('[userManagementService] Erro ao listar usuários:', err)
    return []
  }
}

/**
 * Obtém detalhes de um usuário específico por ID
 */
export async function getUserById(userId: string): Promise<AppUserRecord | null> {
  try {
    const record = await pb.collection('users').getOne(userId)
    return parseUserRecord(record)
  } catch (err) {
    console.error(`[userManagementService] Erro ao buscar usuário ${userId}:`, err)
    return null
  }
}

/**
 * Cria ou convida um novo usuário no sistema
 */
export async function createUser(input: CreateUserInput): Promise<{
  success: boolean
  user?: AppUserRecord
  error?: string
}> {
  try {
    // Senha inicial segura temporária caso não informada
    const tempPassword = input.password || `Skip@${Math.random().toString(36).slice(-6)}!`

    const payload: Record<string, any> = {
      email: input.email.trim().toLowerCase(),
      name: input.name.trim(),
      password: tempPassword,
      passwordConfirm: tempPassword,
      role: input.role,
      status: 'ativo',
      user_type: input.user_type || 'humano',
      allowed_industries: input.allowed_industries || [],
      custom_permissions: { granted: [], revoked: [] },
    }

    const createdRecord = await pb.collection('users').create(payload)
    const parsed = parseUserRecord(createdRecord)

    // Auditoria
    await logUserAudit(parsed.id, parsed.email, 'usuario_criado', {
      name: parsed.name,
      role: parsed.role,
      user_type: parsed.user_type,
      allowed_industries: parsed.allowed_industries,
    })

    return { success: true, user: parsed }
  } catch (err: any) {
    let msg = 'Erro ao criar usuário.'
    if (err?.data?.data?.email?.message) {
      msg = `E-mail: ${err.data.data.email.message}`
    } else if (err?.message) {
      msg = err.message
    }
    return { success: false, error: msg }
  }
}

/**
 * Atualiza o status (ativar/desativar) de um usuário
 */
export async function toggleUserStatus(
  userId: string,
  newStatus: UserStatus,
): Promise<{ success: boolean; error?: string }> {
  try {
    const existing = await getUserById(userId)
    if (!existing) {
      return { success: false, error: 'Usuário não encontrado.' }
    }

    await pb.collection('users').update(userId, {
      status: newStatus,
    })

    const acao = newStatus === 'ativo' ? 'usuario_ativado' : 'usuario_desativado'
    await logUserAudit(userId, existing.email, acao, {
      status_anterior: existing.status,
      status_novo: newStatus,
    })

    return { success: true }
  } catch (err: any) {
    return { success: false, error: err?.message || 'Falha ao alterar status do usuário.' }
  }
}

/**
 * Atualiza perfil de acesso de um usuário
 */
export async function updateUserRole(
  userId: string,
  newRole: UserRole,
): Promise<{ success: boolean; error?: string }> {
  try {
    const existing = await getUserById(userId)
    if (!existing) {
      return { success: false, error: 'Usuário não encontrado.' }
    }

    await pb.collection('users').update(userId, {
      role: newRole,
    })

    await logUserAudit(userId, existing.email, 'perfil_alterado', {
      perfil_anterior: existing.role,
      perfil_novo: newRole,
    })

    return { success: true }
  } catch (err: any) {
    return { success: false, error: err?.message || 'Falha ao alterar perfil do usuário.' }
  }
}

/**
 * Atualiza escopo de indústrias de um usuário
 */
export async function updateUserAllowedIndustries(
  userId: string,
  allowedIndustries: string[],
): Promise<{ success: boolean; error?: string }> {
  try {
    const existing = await getUserById(userId)
    if (!existing) {
      return { success: false, error: 'Usuário não encontrado.' }
    }

    await pb.collection('users').update(userId, {
      allowed_industries: allowedIndustries,
    })

    await logUserAudit(userId, existing.email, 'escopo_industria_alterado', {
      industrias_anteriores: existing.allowed_industries,
      industrias_novas: allowedIndustries,
    })

    return { success: true }
  } catch (err: any) {
    return { success: false, error: err?.message || 'Falha ao atualizar escopo de indústrias.' }
  }
}

/**
 * Concede ou revoga permissão específica para um usuário
 */
export async function toggleSpecificPermission(
  userId: string,
  permission: PermissionKey,
  grant: boolean,
): Promise<{ success: boolean; error?: string }> {
  try {
    const existing = await getUserById(userId)
    if (!existing) {
      return { success: false, error: 'Usuário não encontrado.' }
    }

    const currentGranted = new Set(existing.custom_permissions.granted || [])
    const currentRevoked = new Set(existing.custom_permissions.revoked || [])

    let acao: UserAuditLogEntry['acao'] = 'permissao_concedida'

    if (grant) {
      currentGranted.add(permission)
      currentRevoked.delete(permission)
      acao = 'permissao_concedida'
    } else {
      currentRevoked.add(permission)
      currentGranted.delete(permission)
      acao = 'permissao_removida'
    }

    const updatedPayload: CustomPermissionsPayload = {
      granted: Array.from(currentGranted),
      revoked: Array.from(currentRevoked),
    }

    await pb.collection('users').update(userId, {
      custom_permissions: updatedPayload,
    })

    await logUserAudit(userId, existing.email, acao, {
      permissao: permission,
      modo: grant ? 'concedida' : 'revogada',
      custom_permissions: updatedPayload,
    })

    return { success: true }
  } catch (err: any) {
    return { success: false, error: err?.message || 'Falha ao alterar permissão específica.' }
  }
}

/**
 * Salva todas as alterações de acesso (perfil, escopo e permissões personalizadas)
 */
export async function saveUserAccessChanges(
  userId: string,
  data: {
    role: UserRole
    allowed_industries: string[]
    custom_permissions: CustomPermissionsPayload
    status?: UserStatus
  },
): Promise<{ success: boolean; error?: string }> {
  try {
    const existing = await getUserById(userId)
    if (!existing) {
      return { success: false, error: 'Usuário não encontrado.' }
    }

    const updatePayload: Record<string, any> = {
      role: data.role,
      allowed_industries: data.allowed_industries,
      custom_permissions: data.custom_permissions,
    }

    if (data.status) {
      updatePayload.status = data.status
    }

    await pb.collection('users').update(userId, updatePayload)

    // Auditoria das alterações
    if (existing.role !== data.role) {
      await logUserAudit(userId, existing.email, 'perfil_alterado', {
        perfil_anterior: existing.role,
        perfil_novo: data.role,
      })
    }

    if (JSON.stringify(existing.allowed_industries) !== JSON.stringify(data.allowed_industries)) {
      await logUserAudit(userId, existing.email, 'escopo_industria_alterado', {
        industrias_anteriores: existing.allowed_industries,
        industrias_novas: data.allowed_industries,
      })
    }

    if (JSON.stringify(existing.custom_permissions) !== JSON.stringify(data.custom_permissions)) {
      await logUserAudit(userId, existing.email, 'outro', {
        alteracao: 'matriz_permissoes_ajustada',
        custom_permissions_novas: data.custom_permissions,
      })
    }

    return { success: true }
  } catch (err: any) {
    return { success: false, error: err?.message || 'Falha ao salvar acessos do usuário.' }
  }
}

/**
 * Consulta o log de auditoria administrativa de usuários
 */
export async function listUserAuditLogs(targetUserId?: string): Promise<UserAuditLogEntry[]> {
  try {
    const filter = targetUserId ? `target_user_id = '${targetUserId}'` : ''
    const records = await pb.collection('user_audit_log').getList(1, 100, {
      filter,
      sort: '-created',
    })

    return records.items.map((r: any) => ({
      id: r.id,
      user_id: r.user_id,
      target_user_id: r.target_user_id,
      target_user_email: r.target_user_email,
      acao: r.acao,
      detalhes_json: r.detalhes_json || {},
      executor_nome: r.executor_nome || 'Sistema',
      executor_id: r.executor_id || '',
      data_acao: r.data_acao || r.created,
      created: r.created,
    }))
  } catch (err) {
    console.error('[userManagementService] Erro ao carregar user_audit_log:', err)
    return []
  }
}
