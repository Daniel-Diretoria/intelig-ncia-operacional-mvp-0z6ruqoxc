migrate(
  (app) => {
    // 1. Atualizar campos da coleção users (_pb_users_auth_)
    const users = app.findCollectionByNameOrId('_pb_users_auth_')

    // role: select
    if (!users.fields.getByName('role')) {
      users.fields.add(
        new SelectField({
          name: 'role',
          values: ['admin', 'gestao', 'operacao', 'supervisao', 'desenvolvedor', 'industria'],
          maxSelect: 1,
        }),
      )
    }

    // status: select
    if (!users.fields.getByName('status')) {
      users.fields.add(
        new SelectField({
          name: 'status',
          values: ['ativo', 'inativo'],
          maxSelect: 1,
        }),
      )
    }

    // user_type: select (humano vs integracao)
    if (!users.fields.getByName('user_type')) {
      users.fields.add(
        new SelectField({
          name: 'user_type',
          values: ['humano', 'integracao'],
          maxSelect: 1,
        }),
      )
    }

    // allowed_industries: json (array de strings com nomes/ids de indústria autorizadas)
    if (!users.fields.getByName('allowed_industries')) {
      users.fields.add(
        new JSONField({
          name: 'allowed_industries',
        }),
      )
    }

    // custom_permissions: json (override de permissões específicas { granted: string[], revoked: string[] })
    if (!users.fields.getByName('custom_permissions')) {
      users.fields.add(
        new JSONField({
          name: 'custom_permissions',
        }),
      )
    }

    // last_access_at: text/data
    if (!users.fields.getByName('last_access_at')) {
      users.fields.add(
        new TextField({
          name: 'last_access_at',
        }),
      )
    }

    // Atualizar regras da coleção users para que usuários autenticados possam listar e ver outros usuários quando administradores ou ler seu próprio registro
    // Por padrão no PocketBase: listRule e viewRule
    users.listRule = "@request.auth.id != ''"
    users.viewRule = "@request.auth.id != ''"
    // createRule: autenticado (validado via hook de segurança)
    users.createRule = "@request.auth.id != ''"
    // updateRule: autenticado (validado via hook de segurança)
    users.updateRule = "@request.auth.id != ''"

    app.save(users)

    // 2. Criar coleção user_audit_log para rastreabilidade de acessos e permissões
    try {
      app.findCollectionByNameOrId('user_audit_log')
    } catch (_) {
      const userAuditLog = new Collection({
        name: 'user_audit_log',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
        fields: [
          { name: 'user_id', type: 'text', required: true },
          { name: 'target_user_id', type: 'text', required: true },
          { name: 'target_user_email', type: 'text' },
          {
            name: 'acao',
            type: 'select',
            values: [
              'usuario_criado',
              'usuario_ativado',
              'usuario_desativado',
              'perfil_alterado',
              'permissao_concedida',
              'permissao_removida',
              'escopo_industria_alterado',
              'login_efetuado',
              'outro',
            ],
            required: true,
          },
          { name: 'detalhes_json', type: 'json' },
          { name: 'executor_nome', type: 'text' },
          { name: 'executor_id', type: 'text' },
          { name: 'data_acao', type: 'text', required: true },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_user_audit_target ON user_audit_log (target_user_id)',
          'CREATE INDEX idx_user_audit_acao ON user_audit_log (acao)',
          'CREATE INDEX idx_user_audit_created ON user_audit_log (created DESC)',
        ],
      })
      app.save(userAuditLog)
    }

    // 3. Garantir que o usuário administrador inicial tenha role='admin' e status='ativo'
    try {
      const adminUser = app.findAuthRecordByEmail(
        '_pb_users_auth_',
        'rhuan.marx@diretoriapromocoes.com.br',
      )
      adminUser.set('role', 'admin')
      adminUser.set('status', 'ativo')
      adminUser.set('user_type', 'humano')
      adminUser.set('allowed_industries', JSON.stringify([]))
      adminUser.set('custom_permissions', JSON.stringify({ granted: [], revoked: [] }))
      app.save(adminUser)
    } catch (_) {}
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('user_audit_log'))
    } catch (_) {}
  },
)
