import React, { useState, useEffect } from 'react'
import {
  AppUserRecord,
  listUsers,
  createUser,
  saveUserAccessChanges,
  toggleUserStatus,
  listUserAuditLogs,
  UserAuditLogEntry,
} from '@/services/userManagementService'
import {
  UserRole,
  UserStatus,
  UserType,
  PermissionKey,
  PERMISSION_DEFINITIONS,
  ROLE_LABELS,
  ROLE_DESCRIPTIONS,
  ROLE_DEFAULT_PERMISSIONS,
  computeEffectivePermissions,
  CustomPermissionsPayload,
} from '@/types/permissions'
import { useAuth } from '@/services/authContext'
import { useToast } from '@/hooks/use-toast'
import {
  Users,
  UserPlus,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Edit3,
  CheckCircle2,
  XCircle,
  Clock,
  History,
  Building2,
  Lock,
  Search,
  Filter,
  Check,
  Ban,
  ArrowRight,
  HelpCircle,
  Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export const UsuariosAcessosTab: React.FC = () => {
  const { can, role: currentUserRole } = useAuth()
  const { toast } = useToast()

  const [users, setUsers] = useState<AppUserRecord[]>([])
  const [auditLogs, setAuditLogs] = useState<UserAuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('todos')
  const [statusFilter, setStatusFilter] = useState<string>('todos')

  // Modal Novo Usuário
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState<UserRole>('operacao')
  const [newType, setNewType] = useState<UserType>('humano')
  const [newIndustriesText, setNewIndustriesText] = useState('')
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false)

  // Modal Editar Acesso / Matriz de Permissões
  const [selectedUser, setSelectedUser] = useState<AppUserRecord | null>(null)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [editRole, setEditRole] = useState<UserRole>('operacao')
  const [editStatus, setEditStatus] = useState<UserStatus>('ativo')
  const [editIndustriesText, setEditIndustriesText] = useState('')
  const [editCustomPermissions, setEditCustomPermissions] = useState<CustomPermissionsPayload>({
    granted: [],
    revoked: [],
  })
  const [isSavingEdit, setIsSavingEdit] = useState(false)

  // Modal Histórico de Auditoria do Usuário
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false)
  const [userAuditHistory, setUserAuditHistory] = useState<UserAuditLogEntry[]>([])

  const canManageUsers = can('admin:gerenciar_usuarios') || currentUserRole === 'admin'

  const carregarDados = async () => {
    setLoading(true)
    try {
      const [userList, logs] = await Promise.all([listUsers(), listUserAuditLogs()])
      setUsers(userList)
      setAuditLogs(logs)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregarDados()
  }, [])

  // Filtro de usuários
  const filteredUsers = users.filter((u) => {
    const matchSearch =
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
    const matchRole = roleFilter === 'todos' || u.role === roleFilter
    const matchStatus = statusFilter === 'todos' || u.status === statusFilter
    return matchSearch && matchRole && matchStatus
  })

  // Abertura de modal de edição
  const handleOpenEdit = (user: AppUserRecord) => {
    setSelectedUser(user)
    setEditRole(user.role)
    setEditStatus(user.status)
    setEditIndustriesText(user.allowed_industries.join(', '))
    setEditCustomPermissions({
      granted: [...user.custom_permissions.granted],
      revoked: [...user.custom_permissions.revoked],
    })
    setIsEditOpen(true)
  }

  // Toggle de permissão na matriz do modal de edição
  const handleTogglePermission = (key: PermissionKey) => {
    const baseHasIt = ROLE_DEFAULT_PERMISSIONS[editRole]?.includes(key)
    const isGranted = editCustomPermissions.granted.includes(key)
    const isRevoked = editCustomPermissions.revoked.includes(key)

    const nextGranted = new Set(editCustomPermissions.granted)
    const nextRevoked = new Set(editCustomPermissions.revoked)

    if (baseHasIt) {
      // Se era do perfil base e clica para alternar, vira revogada
      if (isRevoked) {
        nextRevoked.delete(key) // volta ao padrão (ativa)
      } else {
        nextRevoked.add(key) // desativa
      }
    } else {
      // Se não era do perfil base e clica para alternar, vira concedida
      if (isGranted) {
        nextGranted.delete(key) // volta ao padrão (inativa)
      } else {
        nextGranted.add(key) // ativa
      }
    }

    setEditCustomPermissions({
      granted: Array.from(nextGranted),
      revoked: Array.from(nextRevoked),
    })
  }

  // Salvar alterações de edição
  const handleSaveEdit = async () => {
    if (!selectedUser) return
    setIsSavingEdit(true)
    try {
      const allowedArr = editIndustriesText
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)

      const res = await saveUserAccessChanges(selectedUser.id, {
        role: editRole,
        status: editStatus,
        allowed_industries: allowedArr,
        custom_permissions: editCustomPermissions,
      })

      if (res.success) {
        toast({
          title: 'Acessos atualizados',
          description: `As permissões e escopo de ${selectedUser.name} foram atualizados com sucesso.`,
        })
        setIsEditOpen(false)
        await carregarDados()
      } else {
        toast({
          title: 'Erro ao atualizar',
          description: res.error,
          variant: 'destructive',
        })
      }
    } finally {
      setIsSavingEdit(false)
    }
  }

  // Criar Usuário
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newEmail || !newName) {
      toast({
        title: 'Dados incompletos',
        description: 'Informe o nome e o e-mail do usuário.',
        variant: 'destructive',
      })
      return
    }

    setIsSubmittingCreate(true)
    try {
      const allowedArr = newIndustriesText
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)

      const res = await createUser({
        email: newEmail,
        name: newName,
        password: newPassword || undefined,
        role: newRole,
        user_type: newType,
        allowed_industries: allowedArr,
      })

      if (res.success) {
        toast({
          title: 'Usuário cadastrado com sucesso',
          description: `${newName} foi registrado com o perfil ${ROLE_LABELS[newRole]}.`,
        })
        setIsCreateOpen(false)
        setNewName('')
        setNewEmail('')
        setNewPassword('')
        setNewRole('operacao')
        setNewType('humano')
        setNewIndustriesText('')
        await carregarDados()
      } else {
        toast({
          title: 'Falha ao criar usuário',
          description: res.error,
          variant: 'destructive',
        })
      }
    } finally {
      setIsSubmittingCreate(false)
    }
  }

  // Ativar / Desativar rápido
  const handleToggleStatus = async (user: AppUserRecord) => {
    const nextStatus: UserStatus = user.status === 'ativo' ? 'inativo' : 'ativo'
    const res = await toggleUserStatus(user.id, nextStatus)
    if (res.success) {
      toast({
        title: nextStatus === 'ativo' ? 'Usuário ativado' : 'Acesso desativado',
        description: `O status de ${user.name} foi alterado para ${nextStatus}. O histórico permanece intacto.`,
      })
      await carregarDados()
    } else {
      toast({
        title: 'Erro ao alterar status',
        description: res.error,
        variant: 'destructive',
      })
    }
  }

  // Ver histórico de auditoria
  const handleViewAuditHistory = async (user: AppUserRecord) => {
    setSelectedUser(user)
    const logs = await listUserAuditLogs(user.id)
    setUserAuditHistory(logs)
    setIsAuditModalOpen(true)
  }

  return (
    <div className="space-y-6">
      {/* Barra de Ações e Filtros */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs">
        <div className="flex items-center gap-2 flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Buscar por nome ou e-mail..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-xs"
            />
          </div>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-[170px] h-9 text-xs">
              <SelectValue placeholder="Filtrar por Perfil" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os Perfis</SelectItem>
              <SelectItem value="admin">Administrador</SelectItem>
              <SelectItem value="gestao">Gestão</SelectItem>
              <SelectItem value="operacao">Inteligência / Operação</SelectItem>
              <SelectItem value="supervisao">Supervisão</SelectItem>
              <SelectItem value="desenvolvedor">Desenvolvedor / Integrador</SelectItem>
              <SelectItem value="industria">Indústria / Cliente</SelectItem>
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[130px] h-9 text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos Status</SelectItem>
              <SelectItem value="ativo">Ativos</SelectItem>
              <SelectItem value="inativo">Inativos</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {canManageUsers && (
          <Button
            onClick={() => setIsCreateOpen(true)}
            className="h-9 px-3 gap-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shrink-0"
          >
            <UserPlus className="w-4 h-4" />
            <span>Novo Usuário</span>
          </Button>
        )}
      </div>

      {/* Cards explicativos rápidos dos Perfis */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="p-3.5 rounded-xl bg-indigo-50/50 border border-indigo-100 flex items-start gap-3">
          <Shield className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
          <div className="text-xs">
            <p className="font-bold text-slate-900">Perfis &amp; Matriz de Permissão</p>
            <p className="text-slate-600 mt-0.5">
              Cada perfil possui um padrão de segurança. Administradores podem conceder ou revogar
              permissões específicas sem mudar o perfil.
            </p>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-teal-50/50 border border-teal-100 flex items-start gap-3">
          <Building2 className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
          <div className="text-xs">
            <p className="font-bold text-slate-900">Escopo por Indústria</p>
            <p className="text-slate-600 mt-0.5">
              Usuários limitados visualizam e tratam exclusivamente os dados autorizados de suas
              indústrias, com bloqueio no backend.
            </p>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-amber-50/50 border border-amber-100 flex items-start gap-3">
          <History className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs">
            <p className="font-bold text-slate-900">Desativação Segura</p>
            <p className="text-slate-600 mt-0.5">
              Ao desativar um usuário, seu login é bloqueado de imediato, mas todo o histórico,
              timeline e autoria de ações permanecem intactos.
            </p>
          </div>
        </div>
      </div>

      {/* Tabela de Usuários */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-2xs overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-slate-500" />
            <h3 className="font-bold text-sm text-slate-800">
              Usuários Cadastrados ({filteredUsers.length})
            </h3>
          </div>
          <span className="text-[11px] text-slate-400">Total: {users.length} usuários</span>
        </div>

        {loading ? (
          <div className="py-12 text-center text-xs text-slate-500">Carregando usuários...</div>
        ) : filteredUsers.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-500">
            Nenhum usuário encontrado para os filtros selecionados.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredUsers.map((user) => {
              const effective = computeEffectivePermissions(user.role, user.custom_permissions)
              const hasCustom =
                (user.custom_permissions.granted?.length || 0) > 0 ||
                (user.custom_permissions.revoked?.length || 0) > 0
              const hasScope = user.allowed_industries && user.allowed_industries.length > 0

              return (
                <div
                  key={user.id}
                  className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50/60 transition-colors"
                >
                  <div className="flex items-start gap-3.5">
                    <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 font-bold text-xs shrink-0">
                      {user.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-slate-900">{user.name}</span>
                        <Badge
                          variant="outline"
                          className={
                            user.status === 'ativo'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]'
                              : 'bg-red-50 text-red-700 border-red-200 text-[10px]'
                          }
                        >
                          {user.status === 'ativo' ? 'Ativo' : 'Desativado'}
                        </Badge>
                        <Badge
                          variant="secondary"
                          className="bg-slate-100 text-slate-700 font-semibold text-[10px]"
                        >
                          {ROLE_LABELS[user.role] || user.role}
                        </Badge>
                        {user.user_type === 'integracao' && (
                          <Badge className="bg-purple-50 text-purple-700 border-purple-200 text-[9px]">
                            Integração / App
                          </Badge>
                        )}
                        {hasCustom && (
                          <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-[9px]">
                            Permissões Customizadas
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-slate-500">{user.email}</p>

                      {/* Escopo de Indústrias */}
                      <div className="pt-1 flex items-center gap-2 text-xs">
                        <span className="text-[11px] font-semibold text-slate-400">Escopo:</span>
                        {hasScope ? (
                          <span className="text-[11px] font-medium text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                            {user.allowed_industries.join(', ')}
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">
                            Todas as Indústrias (Geral)
                          </span>
                        )}
                      </div>

                      {/* Resumo rápido do que o usuário consegue fazer */}
                      <div className="pt-1.5 flex flex-wrap gap-1.5 text-[10px] text-slate-500">
                        <span className="inline-flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded">
                          Central: {effective.has('central:visualizar') ? '✓' : '—'}
                        </span>
                        <span className="inline-flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded">
                          Devoluções: {effective.has('devolucoes:visualizar') ? '✓' : '—'}
                        </span>
                        <span className="inline-flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded">
                          Documentos NF:{' '}
                          {effective.has('devolucoes:visualizar_documentos') ? '✓' : '—'}
                        </span>
                        <span className="inline-flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded">
                          Financeiro:{' '}
                          {effective.has('devolucoes:visualizar_financeiro') ? '✓' : '—'}
                        </span>
                        <span className="inline-flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded">
                          Edição Cadastros:{' '}
                          {effective.has('industrias:editar_cadastro') ? '✓' : '—'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Ações Administrativas */}
                  <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleViewAuditHistory(user)}
                      className="h-8 px-2.5 text-xs text-slate-600 gap-1.5"
                    >
                      <History className="w-3.5 h-3.5" />
                      <span>Auditoria</span>
                    </Button>

                    {canManageUsers && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenEdit(user)}
                          className="h-8 px-2.5 text-xs font-semibold text-indigo-700 border-indigo-200 hover:bg-indigo-50 gap-1.5"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Editar Acesso</span>
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleStatus(user)}
                          className={`h-8 px-2 text-xs font-semibold ${
                            user.status === 'ativo'
                              ? 'text-red-600 hover:bg-red-50 hover:text-red-700'
                              : 'text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700'
                          }`}
                        >
                          {user.status === 'ativo' ? (
                            <span className="flex items-center gap-1">
                              <Ban className="w-3.5 h-3.5" /> Desativar
                            </span>
                          ) : (
                            <span className="flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Ativar
                            </span>
                          )}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* MODAL: CRIAR NOVO USUÁRIO */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-indigo-600" />
              Novo Usuário / Acesso
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleCreateSubmit} className="space-y-4 pt-2 text-xs">
            <div>
              <Label className="text-xs font-semibold text-slate-700">Nome Completo</Label>
              <Input
                placeholder="Ex: Carlos Oliveira"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="mt-1 h-9 text-xs"
                required
              />
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-700">E-mail Corporativo</Label>
              <Input
                type="email"
                placeholder="exemplo@diretoriapromocoes.com.br"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="mt-1 h-9 text-xs"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold text-slate-700">Perfil de Acesso</Label>
                <Select value={newRole} onValueChange={(val) => setNewRole(val as UserRole)}>
                  <SelectTrigger className="mt-1 h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Administrador</SelectItem>
                    <SelectItem value="gestao">Gestão</SelectItem>
                    <SelectItem value="operacao">Inteligência / Operação</SelectItem>
                    <SelectItem value="supervisao">Supervisão</SelectItem>
                    <SelectItem value="desenvolvedor">Desenvolvedor / Integrador</SelectItem>
                    <SelectItem value="industria">Indústria / Cliente</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-700">Tipo de Conta</Label>
                <Select value={newType} onValueChange={(val) => setNewType(val as UserType)}>
                  <SelectTrigger className="mt-1 h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="humano">Usuário Humano</SelectItem>
                    <SelectItem value="integracao">Acesso de Integração</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-700">
                Senha Inicial (Opcional)
              </Label>
              <Input
                type="password"
                placeholder="Gerada automaticamente se vazio (mín. 8 caracteres)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="mt-1 h-9 text-xs"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                O usuário receberá ou definirá sua credencial segura sem exposição de senhas em
                logs.
              </p>
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-700">
                Escopo por Indústria (Opcional)
              </Label>
              <Input
                placeholder="Ex: FRUTAP, ITALAC (deixe vazio para acesso a todas)"
                value={newIndustriesText}
                onChange={(e) => setNewIndustriesText(e.target.value)}
                className="mt-1 h-9 text-xs"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                Separe por vírgula. Se preenchido, o usuário só acessará dados dessas indústrias.
              </p>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsCreateOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={isSubmittingCreate}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs"
              >
                {isSubmittingCreate ? 'Criando...' : 'Cadastrar Usuário'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL: EDITAR ACESSO & MATRIZ DE PERMISSÕES */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-indigo-600" />
                Editar Acesso: {selectedUser?.name}
              </span>
              <Badge variant="outline" className="text-xs font-normal">
                {selectedUser?.email}
              </Badge>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 pt-2 text-xs">
            {/* Bloco 1: Perfil e Status */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              <div>
                <Label className="text-xs font-semibold text-slate-700">Perfil Base</Label>
                <Select value={editRole} onValueChange={(val) => setEditRole(val as UserRole)}>
                  <SelectTrigger className="mt-1 h-9 text-xs bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Administrador (Total)</SelectItem>
                    <SelectItem value="gestao">Gestão (Visão Ampla)</SelectItem>
                    <SelectItem value="operacao">Inteligência / Operação</SelectItem>
                    <SelectItem value="supervisao">Supervisão</SelectItem>
                    <SelectItem value="desenvolvedor">Desenvolvedor / Integrador</SelectItem>
                    <SelectItem value="industria">Indústria / Cliente</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-slate-500 mt-1">{ROLE_DESCRIPTIONS[editRole]}</p>
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-700">Status da Conta</Label>
                <Select
                  value={editStatus}
                  onValueChange={(val) => setEditStatus(val as UserStatus)}
                >
                  <SelectTrigger className="mt-1 h-9 text-xs bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ativo">Ativo (Pode acessar)</SelectItem>
                    <SelectItem value="inativo">Desativado (Bloqueado)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-slate-500 mt-1">
                  Desativar impede login imediatamente sem apagar histórico prévio.
                </p>
              </div>
            </div>

            {/* Bloco 2: Escopo de Dados por Indústria */}
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-indigo-600" />
                Escopo de Dados por Indústria
              </Label>
              <Input
                placeholder="Ex: FRUTAP, ITALAC (vazio = todas as indústrias)"
                value={editIndustriesText}
                onChange={(e) => setEditIndustriesText(e.target.value)}
                className="bg-white h-9 text-xs"
              />
              <p className="text-[10px] text-slate-500">
                Se definido, este usuário nunca conseguirá acessar dados ou trocar filtros para ver
                outras indústrias.
              </p>
            </div>

            {/* Bloco 3: Matriz de Permissões Ajustáveis */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-900 text-xs">
                    Matriz de Permissões Detalhada
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    O perfil define o conjunto padrão. Você pode conceder ou revogar permissões
                    pontuais.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditCustomPermissions({ granted: [], revoked: [] })}
                  className="text-[10px] text-indigo-600 hover:text-indigo-700 h-7"
                >
                  Restaurar Padrão do Perfil
                </Button>
              </div>

              {/* Agrupamento por Áreas */}
              <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-72 overflow-y-auto">
                {[
                  'Início',
                  'Operação',
                  'Validades',
                  'Rupturas',
                  'Devoluções / NF',
                  'Indústrias',
                  'Rede',
                  'Inteligência',
                  'Integrações',
                  'Administração',
                ].map((area) => {
                  const permissionsInArea = PERMISSION_DEFINITIONS.filter((p) => p.area === area)
                  if (permissionsInArea.length === 0) return null

                  return (
                    <div key={area} className="p-3 bg-white">
                      <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-2">
                        {area}
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {permissionsInArea.map((p) => {
                          const baseHasIt = ROLE_DEFAULT_PERMISSIONS[editRole]?.includes(p.key)
                          const isGranted = editCustomPermissions.granted.includes(p.key)
                          const isRevoked = editCustomPermissions.revoked.includes(p.key)

                          const isEffectivelyActive = (baseHasIt || isGranted) && !isRevoked

                          let badgeLabel = 'Padrão'
                          let badgeStyle = 'bg-slate-100 text-slate-600'
                          if (isGranted) {
                            badgeLabel = 'Concedida extra'
                            badgeStyle = 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          } else if (isRevoked) {
                            badgeLabel = 'Revogada'
                            badgeStyle = 'bg-red-50 text-red-700 border-red-200'
                          }

                          return (
                            <button
                              type="button"
                              key={p.key}
                              onClick={() => handleTogglePermission(p.key)}
                              className={`text-left p-2 rounded-lg border transition-all flex items-start justify-between gap-2 ${
                                isEffectivelyActive
                                  ? 'border-indigo-200 bg-indigo-50/40 hover:bg-indigo-50'
                                  : 'border-slate-200 bg-slate-50/40 hover:bg-slate-100/60 opacity-70'
                              }`}
                            >
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span
                                    className={`w-3.5 h-3.5 rounded flex items-center justify-center text-[9px] font-bold ${
                                      isEffectivelyActive
                                        ? 'bg-indigo-600 text-white'
                                        : 'border border-slate-300 text-transparent'
                                    }`}
                                  >
                                    ✓
                                  </span>
                                  <span className="font-semibold text-slate-800 text-[11px]">
                                    {p.label}
                                  </span>
                                </div>
                                <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">
                                  {p.description}
                                </p>
                              </div>
                              <span
                                className={`text-[9px] px-1.5 py-0.5 rounded font-medium border ${badgeStyle} shrink-0`}
                              >
                                {badgeLabel}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          <DialogFooter className="pt-3">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsEditOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleSaveEdit}
              disabled={isSavingEdit}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs"
            >
              {isSavingEdit ? 'Salvando...' : 'Salvar Alterações de Acesso'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL: HISTÓRICO DE AUDITORIA DO USUÁRIO */}
      <Dialog open={isAuditModalOpen} onOpenChange={setIsAuditModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <History className="w-5 h-5 text-indigo-600" />
              Auditoria de Acesso: {selectedUser?.name}
            </DialogTitle>
          </DialogHeader>

          <div className="py-2 text-xs space-y-3 max-h-96 overflow-y-auto">
            {userAuditHistory.length === 0 ? (
              <p className="text-center py-6 text-slate-400">
                Nenhum evento registrado para este usuário ainda.
              </p>
            ) : (
              <div className="space-y-2">
                {userAuditHistory.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 rounded-lg border border-slate-200 bg-slate-50/60 space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800 uppercase tracking-wider text-[10px]">
                        {item.acao.replace(/_/g, ' ')}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {new Date(item.data_acao).toLocaleString('pt-BR')}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600">
                      Executado por: <span className="font-semibold">{item.executor_nome}</span>
                    </p>
                    <div className="text-[10px] font-mono bg-white p-2 rounded border border-slate-200 text-slate-700 max-h-24 overflow-y-auto">
                      {JSON.stringify(item.detalhes_json, null, 2)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsAuditModalOpen(false)}
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
