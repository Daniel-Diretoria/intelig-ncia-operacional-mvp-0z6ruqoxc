import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react'
import type { AuthRecord } from 'pocketbase'
import pb from '@/lib/pocketbase/client'
import {
  UserRole,
  UserStatus,
  UserType,
  PermissionKey,
  CustomPermissionsPayload,
  computeEffectivePermissions,
  hasPermission,
  isIndustryAllowed,
} from '@/types/permissions'

export interface AppAuthUser {
  id: string
  email: string
  name: string
  role: UserRole
  status: UserStatus
  user_type: UserType
  allowed_industries: string[]
  custom_permissions: CustomPermissionsPayload
  last_access_at?: string
}

interface AuthContextType {
  user: (AuthRecord & Partial<AppAuthUser>) | null
  token: string | null
  isLoading: boolean
  isAuthenticated: boolean
  role: UserRole
  status: UserStatus
  userType: UserType
  allowedIndustries: string[]
  effectivePermissions: Set<PermissionKey>
  can: (permission: PermissionKey) => boolean
  canAccessIndustry: (identifier: { id?: string; name?: string }) => boolean
  signIn: (email: string, pass: string) => Promise<{ success: boolean; error?: string }>
  signOut: () => void
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

function extractUserData(record: AuthRecord | null): AppAuthUser | null {
  if (!record) return null

  const rawRole = (record as any).role
  const rawStatus = (record as any).status
  const rawType = (record as any).user_type
  const rawAllowed = (record as any).allowed_industries
  const rawCustom = (record as any).custom_permissions

  let allowedIndustries: string[] = []
  if (Array.isArray(rawAllowed)) {
    allowedIndustries = rawAllowed
  } else if (typeof rawAllowed === 'string' && rawAllowed.trim() !== '') {
    try {
      allowedIndustries = JSON.parse(rawAllowed)
    } catch (_) {
      allowedIndustries = []
    }
  }

  let customPermissions: CustomPermissionsPayload = { granted: [], revoked: [] }
  if (rawCustom && typeof rawCustom === 'object') {
    customPermissions = {
      granted: Array.isArray(rawCustom.granted) ? rawCustom.granted : [],
      revoked: Array.isArray(rawCustom.revoked) ? rawCustom.revoked : [],
    }
  } else if (typeof rawCustom === 'string' && rawCustom.trim() !== '') {
    try {
      const parsed = JSON.parse(rawCustom)
      customPermissions = {
        granted: Array.isArray(parsed.granted) ? parsed.granted : [],
        revoked: Array.isArray(parsed.revoked) ? parsed.revoked : [],
      }
    } catch (_) {
      customPermissions = { granted: [], revoked: [] }
    }
  }

  return {
    id: record.id,
    email: record.email || '',
    name: record.name || record.email?.split('@')[0] || 'Usuário',
    role: (rawRole as UserRole) || 'admin',
    status: (rawStatus as UserStatus) || 'ativo',
    user_type: (rawType as UserType) || 'humano',
    allowed_industries: allowedIndustries,
    custom_permissions: customPermissions,
    last_access_at: (record as any).last_access_at,
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthRecord | null>(pb.authStore.record)
  const [token, setToken] = useState<string | null>(pb.authStore.token)
  const [isLoading, setIsLoading] = useState<boolean>(true)

  const parsedUser = useMemo(() => extractUserData(user), [user])

  const role: UserRole = parsedUser?.role || 'admin'
  const status: UserStatus = parsedUser?.status || 'ativo'
  const userType: UserType = parsedUser?.user_type || 'humano'
  const allowedIndustries: string[] = parsedUser?.allowed_industries || []

  const effectivePermissions = useMemo(() => {
    return computeEffectivePermissions(role, parsedUser?.custom_permissions)
  }, [role, parsedUser?.custom_permissions])

  const can = useCallback(
    (permission: PermissionKey) => {
      // Usuário inativo perde qualquer permissão
      if (status === 'inativo') return false
      return hasPermission(effectivePermissions, permission)
    },
    [status, effectivePermissions],
  )

  const canAccessIndustry = useCallback(
    (identifier: { id?: string; name?: string }) => {
      if (status === 'inativo') return false
      return isIndustryAllowed(allowedIndustries, identifier)
    },
    [status, allowedIndustries],
  )

  const refreshUser = useCallback(async () => {
    try {
      if (pb.authStore.isValid && pb.authStore.token) {
        await pb.collection('users').authRefresh()
        setUser(pb.authStore.record)
        setToken(pb.authStore.token)
      }
    } catch (err) {
      console.warn('Session refresh failed:', err)
    }
  }, [])

  useEffect(() => {
    // Check initial auth state
    const checkAuth = async () => {
      try {
        if (pb.authStore.isValid && pb.authStore.token) {
          // Validate auth token with server
          await pb.collection('users').authRefresh()
          const currentRecord = pb.authStore.record
          // Se o usuário foi desativado no servidor, desconectar
          if ((currentRecord as any)?.status === 'inativo') {
            pb.authStore.clear()
            setUser(null)
            setToken(null)
          } else {
            setUser(currentRecord)
            setToken(pb.authStore.token)
          }
        } else {
          setUser(null)
          setToken(null)
        }
      } catch (err) {
        console.warn('Session refresh failed:', err)
        pb.authStore.clear()
        setUser(null)
        setToken(null)
      } finally {
        setIsLoading(false)
      }
    }

    checkAuth()

    const unsubscribe = pb.authStore.onChange((newToken, newModel) => {
      setToken(newToken)
      setUser(newModel)
    })

    return () => {
      unsubscribe()
    }
  }, [])

  const signIn = useCallback(async (email: string, pass: string) => {
    try {
      await pb.collection('users').authWithPassword(email, pass)
      const currentRecord = pb.authStore.record

      // Bloquear login caso status seja inativo
      if ((currentRecord as any)?.status === 'inativo') {
        pb.authStore.clear()
        setUser(null)
        setToken(null)
        return {
          success: false,
          error: 'Seu usuário está desativado. Entre em contato com o administrador.',
        }
      }

      setUser(currentRecord)
      setToken(pb.authStore.token)
      return { success: true }
    } catch (err: unknown) {
      // PocketBase ClientResponseError ou erro genérico
      const pbError = err as { status?: number; isAbort?: boolean; message?: string }

      if (pbError?.isAbort) {
        return {
          success: false,
          error: 'Requisição cancelada.',
        }
      }

      // Mensagens de usuário inativo vindas do backend
      if (pbError?.message?.includes('desativado')) {
        return {
          success: false,
          error: pbError.message,
        }
      }

      // Status 400 = Failed to authenticate / invalid credentials
      if (pbError?.status === 400) {
        return {
          success: false,
          error: 'E-mail ou senha inválidos.',
        }
      }

      // Erro 0 ou fetch network failure
      if (pbError?.status === 0 || (!pbError?.status && !pbError?.message?.includes('status'))) {
        return {
          success: false,
          error: 'Não foi possível conectar ao servidor. Verifique sua conexão.',
        }
      }

      if (pbError?.status === 503) {
        return {
          success: false,
          error: 'Serviço de autenticação indisponível. Tente novamente mais tarde.',
        }
      }

      return {
        success: false,
        error: pbError?.message || 'Erro ao realizar login. Tente novamente.',
      }
    }
  }, [])

  const signOut = useCallback(() => {
    pb.authStore.clear()
    setUser(null)
    setToken(null)
  }, [])

  const value: AuthContextType = {
    user,
    token,
    isLoading,
    isAuthenticated: Boolean(token && user && status !== 'inativo'),
    role,
    status,
    userType,
    allowedIndustries,
    effectivePermissions,
    can,
    canAccessIndustry,
    signIn,
    signOut,
    refreshUser,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider')
  }
  return context
}
