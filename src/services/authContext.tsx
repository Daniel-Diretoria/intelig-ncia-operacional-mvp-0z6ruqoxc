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
      const authData = await pb.collection('users').authWithPassword(email.trim(), pass)
      setUser(authData.record)
      setToken(authData.token)
      return { success: true }
    } catch (err: unknown) {
      const errorObj = err as { status?: number; message?: string }
      if (errorObj?.status === 0 || errorObj?.message?.includes('Failed to fetch')) {
        return {
          success: false,
          error: 'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.',
        }
      }
      return {
        success: false,
        error: 'E-mail ou senha inválidos.',
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
