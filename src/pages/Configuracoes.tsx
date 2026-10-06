import React, { useState } from 'react'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/services/authContext'
import { useToast } from '@/hooks/use-toast'
import {
  Settings,
  Lock,
  Eye,
  EyeOff,
  User,
  Mail,
  Shield,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Users,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { UsuariosAcessosTab } from '@/components/configuracoes/UsuariosAcessosTab'

export const ConfiguracoesPage: React.FC = () => {
  const { user, can } = useAuth()
  const { toast } = useToast()

  // Password fields
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  // Toggle show/hide password states
  const [showOldPassword, setShowOldPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  // Feedback states
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [formSuccess, setFormSuccess] = useState<string | null>(null)

  // Real-time validations
  const isMinLength = newPassword.length >= 8
  const isMatching = newPassword.length > 0 && newPassword === confirmPassword
  const hasMismatch = confirmPassword.length > 0 && newPassword !== confirmPassword
  const isFilled =
    oldPassword.trim().length > 0 && newPassword.length > 0 && confirmPassword.length > 0

  // Derive user info
  const userId = user?.id || '—'
  const userEmail = user?.email || '—'
  const userName = user?.name || user?.email?.split('@')[0] || 'Usuário'
  const userRole = (user as any)?.role || 'Administrador'

  const canViewUsersTab = can('admin:gerenciar_usuarios') || (user as any)?.role === 'admin'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (isSubmitting) return

    setFormError(null)
    setFormSuccess(null)

    // Validations
    if (!oldPassword) {
      setFormError('Por favor, informe sua senha atual.')
      return
    }

    if (!newPassword) {
      setFormError('Por favor, informe a nova senha.')
      return
    }

    if (newPassword.length < 8) {
      setFormError('A nova senha deve ter no mínimo 8 caracteres.')
      return
    }

    if (newPassword !== confirmPassword) {
      setFormError('A nova senha e a confirmação não coincidem.')
      return
    }

    if (!user?.id) {
      setFormError('Usuário não identificado. Faça login novamente.')
      return
    }

    setIsSubmitting(true)

    try {
      // Native PocketBase update password API
      await pb.collection('users').update(user.id, {
        oldPassword: oldPassword,
        password: newPassword,
        passwordConfirm: confirmPassword,
      })

      // Clear form
      setOldPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setFormSuccess('Senha alterada com sucesso!')

      toast({
        title: 'Senha alterada com sucesso',
        description: 'Sua credencial de acesso foi atualizada com segurança.',
      })
    } catch (err: any) {
      let message = 'Não foi possível alterar a senha. Verifique os dados informados.'

      if (err?.data?.data?.oldPassword?.message) {
        message = 'A senha atual informada está incorreta.'
      } else if (err?.data?.data?.password?.message) {
        message = err.data.data.password.message
      } else if (err?.data?.data?.passwordConfirm?.message) {
        message = err.data.data.passwordConfirm.message
      } else if (
        err?.message?.toLowerCase().includes('old password') ||
        err?.message?.toLowerCase().includes('senha atual')
      ) {
        message = 'A senha atual informada está incorreta.'
      } else if (err?.status === 400) {
        message = 'Senha atual incorreta ou nova senha inválida.'
      }

      setFormError(message)

      toast({
        title: 'Falha ao alterar senha',
        description: message,
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in pb-12 max-w-5xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
            <Settings className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                Configurações &amp; Acessos
              </h1>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
                v0.0.121
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Gerencie suas credenciais, visualize permissões e controle usuários do sistema.
            </p>
          </div>
        </div>
      </div>

      <Tabs defaultValue={canViewUsersTab ? 'usuarios' : 'seguranca'} className="space-y-6">
        <TabsList className="bg-slate-100 p-1 rounded-xl">
          {canViewUsersTab && (
            <TabsTrigger value="usuarios" className="gap-2 text-xs font-semibold">
              <Users className="w-4 h-4" />
              Usuários e Acessos
            </TabsTrigger>
          )}
          <TabsTrigger value="seguranca" className="gap-2 text-xs font-semibold">
            <Lock className="w-4 h-4" />
            Minha Conta &amp; Segurança
          </TabsTrigger>
        </TabsList>

        {canViewUsersTab && (
          <TabsContent value="usuarios" className="space-y-6">
            <UsuariosAcessosTab />
          </TabsContent>
        )}

        <TabsContent value="seguranca">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Seção 1: Alterar Senha (2 colunas) */}
            <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-6">
              <div className="flex items-center gap-2.5 pb-4 border-b border-slate-100">
                <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 shrink-0">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900 tracking-tight">
                    Alterar Senha
                  </h2>
                  <p className="text-xs text-slate-500">
                    Atualize sua senha de acesso periodicamente para manter a segurança.
                  </p>
                </div>
              </div>

              {/* Feedback messages */}
              {formError && (
                <div
                  role="alert"
                  className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-900 text-sm flex items-start gap-3 animate-fade-in"
                >
                  <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  <p className="font-medium text-xs sm:text-sm">{formError}</p>
                </div>
              )}

              {formSuccess && (
                <div
                  role="status"
                  className="p-4 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-900 text-sm flex items-start gap-3 animate-fade-in"
                >
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <p className="font-medium text-xs sm:text-sm">{formSuccess}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                {/* Campo 1: Senha Atual */}
                <div>
                  <label
                    htmlFor="old-password-input"
                    className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5"
                  >
                    Senha Atual
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      id="old-password-input"
                      type={showOldPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={oldPassword}
                      onChange={(e) => {
                        setOldPassword(e.target.value)
                        if (formError) setFormError(null)
                        if (formSuccess) setFormSuccess(null)
                      }}
                      placeholder="Digite sua senha atual"
                      className="pl-9 pr-10 h-11 text-sm rounded-lg border-slate-300 focus-visible:ring-indigo-500/20 focus-visible:border-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowOldPassword((prev) => !prev)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                      aria-label={showOldPassword ? 'Ocultar senha atual' : 'Exibir senha atual'}
                    >
                      {showOldPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Campo 2: Nova Senha */}
                <div>
                  <label
                    htmlFor="new-password-input"
                    className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5"
                  >
                    Nova Senha
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      id="new-password-input"
                      type={showNewPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(e) => {
                        setNewPassword(e.target.value)
                        if (formError) setFormError(null)
                        if (formSuccess) setFormSuccess(null)
                      }}
                      placeholder="Mínimo de 8 caracteres"
                      className="pl-9 pr-10 h-11 text-sm rounded-lg border-slate-300 focus-visible:ring-indigo-500/20 focus-visible:border-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword((prev) => !prev)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                      aria-label={showNewPassword ? 'Ocultar nova senha' : 'Exibir nova senha'}
                    >
                      {showNewPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  {/* Validação em tempo real: tamanho mínimo */}
                  {newPassword.length > 0 && (
                    <div className="mt-1.5 flex items-center gap-1.5 text-xs">
                      {isMinLength ? (
                        <span className="text-emerald-600 flex items-center gap-1 font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Mínimo de 8 caracteres atingido
                        </span>
                      ) : (
                        <span className="text-amber-600 flex items-center gap-1 font-medium">
                          <AlertCircle className="w-3.5 h-3.5" /> Faltam {8 - newPassword.length}{' '}
                          caractere(s)
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Campo 3: Confirmar Nova Senha */}
                <div>
                  <label
                    htmlFor="confirm-password-input"
                    className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5"
                  >
                    Confirmar Nova Senha
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      id="confirm-password-input"
                      type={showConfirmPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value)
                        if (formError) setFormError(null)
                        if (formSuccess) setFormSuccess(null)
                      }}
                      placeholder="Repita a nova senha"
                      className={`pl-9 pr-10 h-11 text-sm rounded-lg border ${
                        hasMismatch
                          ? 'border-red-400 focus-visible:ring-red-500/20 focus-visible:border-red-500'
                          : 'border-slate-300 focus-visible:ring-indigo-500/20 focus-visible:border-indigo-500'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((prev) => !prev)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                      aria-label={
                        showConfirmPassword
                          ? 'Ocultar confirmação da senha'
                          : 'Exibir confirmação da senha'
                      }
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  {/* Validação em tempo real: confirmação de senha */}
                  {confirmPassword.length > 0 && (
                    <div className="mt-1.5 flex items-center gap-1.5 text-xs">
                      {isMatching ? (
                        <span className="text-emerald-600 flex items-center gap-1 font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" /> As senhas conferem
                        </span>
                      ) : (
                        <span className="text-red-600 flex items-center gap-1 font-medium">
                          <AlertCircle className="w-3.5 h-3.5" /> As senhas não conferem
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Botão de Envio com bloqueio duplo */}
                <div className="pt-2">
                  <Button
                    type="submit"
                    disabled={isSubmitting || !isFilled || !isMinLength || !isMatching}
                    className="w-full sm:w-auto min-w-[160px] h-11 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm rounded-lg shadow-sm transition-all duration-150 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        <span>Alterando senha...</span>
                      </>
                    ) : (
                      <span>Alterar senha</span>
                    )}
                  </Button>
                </div>
              </form>
            </div>

            {/* Seção 2: Informações da Conta (1 coluna, somente leitura) */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-6">
              <div className="flex items-center gap-2.5 pb-4 border-b border-slate-100">
                <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                  <User className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900 tracking-tight">
                    Informações da Conta
                  </h2>
                  <p className="text-xs text-slate-500">Dados cadastrais vinculados à sua sessão</p>
                </div>
              </div>

              <div className="space-y-4">
                {/* Nome */}
                <div className="p-3.5 rounded-xl bg-slate-50/80 border border-slate-200/60">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                    Nome do Usuário
                  </span>
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-slate-400" />
                    <span className="text-sm font-semibold text-slate-900">{userName}</span>
                  </div>
                </div>

                {/* Email */}
                <div className="p-3.5 rounded-xl bg-slate-50/80 border border-slate-200/60">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                    E-mail Cadastrado
                  </span>
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-slate-400" />
                    <span className="text-sm font-medium text-slate-800 break-all">
                      {userEmail}
                    </span>
                  </div>
                </div>

                {/* Perfil / Role */}
                <div className="p-3.5 rounded-xl bg-slate-50/80 border border-slate-200/60">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
                    Perfil de Acesso
                  </span>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-indigo-500" />
                      <span className="text-sm font-semibold text-slate-900">{userRole}</span>
                    </div>
                    <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200 font-semibold text-[10px]">
                      Ativo
                    </Badge>
                  </div>
                </div>

                {/* ID do Registro */}
                <div className="p-3.5 rounded-xl bg-slate-50/80 border border-slate-200/60">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                    ID do Usuário
                  </span>
                  <span className="text-xs font-mono text-slate-600 select-all">{userId}</span>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default ConfiguracoesPage
