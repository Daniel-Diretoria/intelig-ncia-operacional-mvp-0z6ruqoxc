// Hook de segurança de usuários e permissões do SKIP
// Impede que usuários inativos realizem autenticação ou chamadas
// Valida que apenas administradores possam alterar perfis, status e escopo de outros usuários
// Valida bloqueio de alteração de indústrias para usuários com escopo restrito

onRecordAuthRequest((e) => {
  const record = e.record
  if (!record) {
    return e.next()
  }

  const status = record.getString('status')
  if (status === 'inativo') {
    throw new ForbiddenError(
      'Seu usuário está desativado. Entre em contato com o administrador do sistema.',
    )
  }

  // Atualizar last_access_at
  try {
    record.set('last_access_at', new Date().toISOString())
    $app.save(record)
  } catch (_) {}

  return e.next()
}, 'users')

onRecordUpdateRequest((e) => {
  const auth = e.auth
  const target = e.record
  if (!target) {
    return e.next()
  }

  // Se a alteração está sendo feita por um usuário autenticado comum (não superuser interno)
  if (auth && auth.collection().name === 'users') {
    const authRole = auth.getString('role')
    const authStatus = auth.getString('status')

    if (authStatus === 'inativo') {
      throw new ForbiddenError('Usuário desativado.')
    }

    // Se estiver tentando alterar 'role', 'status', 'allowed_industries' ou 'custom_permissions'
    // Apenas quem possui role='admin' pode fazer isso
    const hasRoleChange = target.getString('role') !== target.original().getString('role')
    const hasStatusChange = target.getString('status') !== target.original().getString('status')
    const hasScopeChange =
      target.getString('allowed_industries') !== target.original().getString('allowed_industries')
    const hasPermissionsChange =
      target.getString('custom_permissions') !== target.original().getString('custom_permissions')

    if (
      (hasRoleChange || hasStatusChange || hasScopeChange || hasPermissionsChange) &&
      authRole !== 'admin'
    ) {
      throw new ForbiddenError(
        'Apenas administradores podem gerenciar permissões, perfis e status de usuários.',
      )
    }
  }

  return e.next()
}, 'users')

onRecordCreateRequest((e) => {
  const auth = e.auth
  if (auth && auth.collection().name === 'users') {
    const authRole = auth.getString('role')
    const authStatus = auth.getString('status')

    if (authStatus === 'inativo') {
      throw new ForbiddenError('Usuário desativado.')
    }

    if (authRole !== 'admin') {
      throw new ForbiddenError('Apenas administradores podem cadastrar novos usuários.')
    }
  }

  return e.next()
}, 'users')
