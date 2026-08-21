import React, { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import logoImg from '@/assets/image-9f672.png'
import { useAuth } from '@/services/authContext'
import { TrendingUp, Lock, Mail, Loader2, AlertCircle, RefreshCw } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export const LoginPage: React.FC = () => {
  const { isAuthenticated, signIn, isLoading: isAuthLoading } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('rhuan.marx@diretoriapromocoes.com.br')
  const [password, setPassword] = useState('Skip@Pass')

  const [emailError, setEmailError] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [serverError, setServerError] = useState<string | null>(null)
  const [isNetworkError, setIsNetworkError] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Redirect if already logged in
  if (isAuthenticated && !isAuthLoading) {
    return <Navigate to="/" replace />
  }

  const validate = (): boolean => {
    let valid = true
    setEmailError('')
    setPasswordError('')
    setServerError(null)
    setIsNetworkError(false)

    const trimmedEmail = email.trim()
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!trimmedEmail) {
      setEmailError('O e-mail é obrigatório.')
      valid = false
    } else if (!emailRegex.test(trimmedEmail)) {
      setEmailError('Digite um endereço de e-mail válido.')
      valid = false
    }

    if (!password) {
      setPasswordError('A senha é obrigatória.')
      valid = false
    } else if (password.length < 6) {
      setPasswordError('A senha deve ter pelo menos 6 caracteres.')
      valid = false
    }

    return valid
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return

    setIsSubmitting(true)
    setServerError(null)
    setIsNetworkError(false)

    try {
      const res = await signIn(email, password)
      if (res.success) {
        navigate('/', { replace: true })
      } else {
        const isNetwork = res.error?.includes('conectar') || res.error?.includes('conexão') || false
        setIsNetworkError(isNetwork)
        setServerError(res.error || 'E-mail ou senha inválidos.')
      }
    } catch {
      setIsNetworkError(true)
      setServerError('Não foi possível conectar. Tente novamente.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-gradient-to-br from-slate-100 via-slate-50 to-indigo-50/40 antialiased font-sans">
      <div className="w-full max-w-md">
        {/* Login Card */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xl p-8 sm:p-10 animate-fade-in-up">
          {/* Brand & Logo */}
          <div className="text-center mb-8 flex flex-col items-center">
            <img
              src={logoImg}
              alt="Diretoria Promoções Logo"
              className="h-20 sm:h-24 w-auto object-contain mb-3 drop-shadow-sm"
            />
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Diretoria Promoções</h1>
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-700 mt-1">
              Inteligência Operacional
            </p>
          </div>

          {/* Error Banner */}
          {serverError && (
            <div
              role="alert"
              className="mb-6 p-4 rounded-xl border border-red-200 bg-red-50 text-red-900 text-sm flex items-start gap-3 animate-fade-in"
            >
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium">{serverError}</p>
                {isNetworkError && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleSubmit}
                    className="mt-2 h-7 px-2 text-xs text-red-700 hover:text-red-900 hover:bg-red-100/80 gap-1.5"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Tentar novamente</span>
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label
                htmlFor="email-input"
                className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5"
              >
                E-mail
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  id="email-input"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    if (emailError) setEmailError('')
                  }}
                  placeholder="seu.email@diretoriapromocoes.com.br"
                  className={`pl-9 h-11 text-sm rounded-lg border ${
                    emailError
                      ? 'border-red-500 focus-visible:ring-red-500/20 focus-visible:border-red-500'
                      : 'border-slate-300 focus-visible:ring-indigo-500/20 focus-visible:border-indigo-500'
                  }`}
                />
              </div>
              {emailError && (
                <p className="mt-1.5 text-xs text-red-600 font-medium flex items-center gap-1">
                  <span>{emailError}</span>
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="password-input"
                className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5"
              >
                Senha
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  id="password-input"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    if (passwordError) setPasswordError('')
                  }}
                  placeholder="••••••••"
                  className={`pl-9 h-11 text-sm rounded-lg border ${
                    passwordError
                      ? 'border-red-500 focus-visible:ring-red-500/20 focus-visible:border-red-500'
                      : 'border-slate-300 focus-visible:ring-indigo-500/20 focus-visible:border-indigo-500'
                  }`}
                />
              </div>
              {passwordError && (
                <p className="mt-1.5 text-xs text-red-600 font-medium flex items-center gap-1">
                  <span>{passwordError}</span>
                </p>
              )}
            </div>

            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-11 mt-2 bg-[#09152B] hover:bg-[#0F2342] text-amber-300 font-semibold text-sm rounded-lg shadow-md transition-all duration-150 active:scale-[0.98] border border-amber-500/30"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  <span>Entrando...</span>
                </>
              ) : (
                <span>Entrar</span>
              )}
            </Button>
          </form>

          {/* Seed credentials hint */}
          <div className="mt-6 pt-5 border-t border-slate-100 text-center">
            <p className="text-xs text-slate-400">
              Acesso padrão pré-configurado: <br />
              <span className="font-mono text-slate-600">rhuan.marx@diretoriapromocoes.com.br</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
