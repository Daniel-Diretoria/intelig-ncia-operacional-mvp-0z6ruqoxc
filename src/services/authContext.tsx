import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import type { AuthRecord } from 'pocketbase'
import pb from '@/lib/pocketbase/client'

interface AuthContextType {
  user: AuthRecord | null
  token: string | null
  isLoading: boolean
  isAuthenticated: boolean
  signIn: (email: string, pass: string) => Promise<{ success: boolean; error?: string }>
  signOut: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthRecord | null>(pb.authStore.record)
  const [token, setToken] = useState<string | null>(pb.authStore.token)
  const [isLoading, setIsLoading] = useState<boolean>(true)

  useEffect(() => {
    // Check initial auth state
    const checkAuth = async () => {
      try {
        if (pb.authStore.isValid && pb.authStore.token) {
          // Validate auth token with server
          await pb.collection('users').authRefresh()
          setUser(pb.authStore.record)
          setToken(pb.authStore.token)
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
      const origin =
        typeof window !== 'undefined' && window.location?.origin ? window.location.origin : ''
      const endpoint = `${origin}/api/backend/v1/app-login`

      let response: Response
      try {
        response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email,
            password: pass,
          }),
        })
      } catch {
        return {
          success: false,
          error: 'Não foi possível conectar ao servidor. Verifique sua conexão.',
        }
      }

      // Tratamento específico de status HTTP
      if (response.status === 401) {
        return {
          success: false,
          error: 'E-mail ou senha inválidos.',
        }
      }

      if (response.status === 503) {
        return {
          success: false,
          error: 'Serviço de autenticação indisponível. Tente novamente mais tarde.',
        }
      }

      // Tentativa de parse de JSON
      let data: {
        success?: boolean
        token?: string
        record?: AuthRecord
        error?: string
      } | null = null

      try {
        data = await response.json()
      } catch {
        // Resposta não-JSON (como redirect HTML ou texto de erro de proxy)
        return {
          success: false,
          error: 'Serviço de autenticação indisponível.',
        }
      }

      if (response.ok && data?.success && data?.token && data?.record) {
        pb.authStore.save(data.token, data.record)
        setUser(data.record)
        setToken(data.token)
        return { success: true }
      }

      if (data?.error) {
        return {
          success: false,
          error: data.error,
        }
      }

      return {
        success: false,
        error: 'Serviço de autenticação indisponível.',
      }
    } catch {
      return {
        success: false,
        error: 'Não foi possível conectar ao servidor. Verifique sua conexão.',
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
    isAuthenticated: Boolean(token && user),
    signIn,
    signOut,
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
