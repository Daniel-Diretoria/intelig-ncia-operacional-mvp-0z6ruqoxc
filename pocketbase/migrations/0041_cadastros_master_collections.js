migrate(
  (app) => {
    const usersCol = app.findCollectionByNameOrId('_pb_users_auth_')
    const industryRegistry = app.findCollectionByNameOrId('industry_registry')
    const stores = app.findCollectionByNameOrId('stores')
    const networks = app.findCollectionByNameOrId('networks')

    // 1. Coleção: supervisors (Supervisores Mestres)
    let supervisorsCol
    try {
      supervisorsCol = app.findCollectionByNameOrId('supervisors')
    } catch (_) {
      supervisorsCol = new Collection({
        name: 'supervisors',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
        fields: [
          { name: 'nome', type: 'text', required: true },
          { name: 'codigo_externo', type: 'text' }, // Cód. Supervisor TradePro (ex: "3")
          { name: 'telefone', type: 'text' },
          { name: 'email', type: 'text' },
          {
            name: 'status',
            type: 'select',
            values: ['ativo', 'inativo'],
            required: true,
          },
          { name: 'regiao', type: 'text' },
          { name: 'observacoes', type: 'text' },
          { name: 'app_diretoria_supervisor_id', type: 'text' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_supervisors_cod ON supervisors (codigo_externo)',
          'CREATE INDEX idx_supervisors_nome ON supervisors (nome)',
        ],
      })
      app.save(supervisorsCol)
    }

    // 2. Coleção: promoters (Promotores Mestres)
    let promotersCol
    try {
      promotersCol = app.findCollectionByNameOrId('promoters')
    } catch (_) {
      promotersCol = new Collection({
        name: 'promoters',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
        fields: [
          { name: 'nome', type: 'text', required: true },
          { name: 'codigo_externo', type: 'text' }, // Cód. Colaborador TradePro (ex: "234", "301")
          { name: 'telefone', type: 'text' },
          { name: 'cpf', type: 'text' },
          {
            name: 'supervisor_id',
            type: 'relation',
            collectionId: supervisorsCol.id,
            maxSelect: 1,
          },
          { name: 'supervisor_nome', type: 'text' },
          {
            name: 'status',
            type: 'select',
            values: ['ativo', 'inativo'],
            required: true,
          },
          { name: 'regiao', type: 'text' },
          { name: 'observacoes', type: 'text' },
          { name: 'app_diretoria_promoter_id', type: 'text' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_promoters_cod ON promoters (codigo_externo)',
          'CREATE INDEX idx_promoters_nome ON promoters (nome)',
          'CREATE INDEX idx_promoters_sup ON promoters (supervisor_id)',
        ],
      })
      app.save(promotersCol)
    }

    // 3. Coleção: store_promoter_assignments (Histórico de Alocação Promotor × Loja × Indústria)
    try {
      app.findCollectionByNameOrId('store_promoter_assignments')
    } catch (_) {
      const assignments = new Collection({
        name: 'store_promoter_assignments',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
        fields: [
          {
            name: 'promoter_id',
            type: 'relation',
            collectionId: promotersCol.id,
            required: true,
            maxSelect: 1,
          },
          { name: 'promoter_nome', type: 'text', required: true },
          {
            name: 'store_id',
            type: 'relation',
            collectionId: stores.id,
            maxSelect: 1,
          },
          { name: 'store_code', type: 'text' },
          { name: 'store_name', type: 'text' },
          {
            name: 'industry_id',
            type: 'relation',
            collectionId: industryRegistry.id,
            maxSelect: 1,
          },
          { name: 'industry_name', type: 'text' },
          {
            name: 'status',
            type: 'select',
            values: ['ativo', 'encerrado'],
            required: true,
          },
          { name: 'data_inicio', type: 'text' },
          { name: 'data_fim', type: 'text' },
          { name: 'observacao', type: 'text' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_assignment_prom ON store_promoter_assignments (promoter_id)',
          'CREATE INDEX idx_assignment_store ON store_promoter_assignments (store_code)',
          'CREATE INDEX idx_assignment_ind ON store_promoter_assignments (industry_id)',
        ],
      })
      app.save(assignments)
    }

    // 4. Coleção: cadastros_pendencias (Fila de Resolução Estrutural de Entidades Pendentes)
    try {
      app.findCollectionByNameOrId('cadastros_pendencias')
    } catch (_) {
      const pendencias = new Collection({
        name: 'cadastros_pendencias',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
        fields: [
          {
            name: 'tipo_entidade',
            type: 'select',
            values: ['industria', 'rede', 'loja', 'produto', 'promotor', 'supervisor'],
            required: true,
          },
          { name: 'valor_identificador', type: 'text', required: true },
          { name: 'codigo_externo', type: 'text' },
          { name: 'nome_identificado', type: 'text' },
          { name: 'contexto_adicional', type: 'json' },
          {
            name: 'origem_fonte',
            type: 'text',
            required: true,
          }, // ex: "tradepro_rupturas", "tradepro_validades", "importacao_manual"
          {
            name: 'status',
            type: 'select',
            values: ['pendente', 'vinculado', 'ignorado'],
            required: true,
          },
          { name: 'volume_ocorrencias', type: 'number' },
          { name: 'entidade_resolvida_id', type: 'text' },
          { name: 'entidade_resolvida_nome', type: 'text' },
          { name: 'resolvido_por', type: 'text' },
          { name: 'resolvido_em', type: 'text' },
          { name: 'observacao_resolucao', type: 'text' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_cad_pend_tipo ON cadastros_pendencias (tipo_entidade, status)',
          'CREATE INDEX idx_cad_pend_val ON cadastros_pendencias (valor_identificador)',
        ],
      })
      app.save(pendencias)
    }

    // 5. Expandir industry_registry com campos de identidade futura e identificadores externos
    const indCol = app.findCollectionByNameOrId('industry_registry')
    if (!indCol.fields.getByName('app_diretoria_industry_id')) {
      indCol.fields.add(new TextField({ name: 'app_diretoria_industry_id' }))
      app.save(indCol)
    }

    // 6. Expandir stores com campos complementares
    const storeCol = app.findCollectionByNameOrId('stores')
    let storeColModified = false
    if (!storeCol.fields.getByName('regiao')) {
      storeCol.fields.add(new TextField({ name: 'regiao' }))
      storeColModified = true
    }
    if (!storeCol.fields.getByName('app_diretoria_store_id')) {
      storeCol.fields.add(new TextField({ name: 'app_diretoria_store_id' }))
      storeColModified = true
    }
    if (storeColModified) {
      app.save(storeCol)
    }

    // 7. Expandir industry_product_mix com campos de catálogo mestre
    const mixCol = app.findCollectionByNameOrId('industry_product_mix')
    let mixColModified = false
    if (!mixCol.fields.getByName('familia')) {
      mixCol.fields.add(new TextField({ name: 'familia' }))
      mixColModified = true
    }
    if (!mixCol.fields.getByName('sabor')) {
      mixCol.fields.add(new TextField({ name: 'sabor' }))
      mixColModified = true
    }
    if (!mixCol.fields.getByName('gramatura')) {
      mixCol.fields.add(new TextField({ name: 'gramatura' }))
      mixColModified = true
    }
    if (!mixCol.fields.getByName('embalagem')) {
      mixCol.fields.add(new TextField({ name: 'embalagem' }))
      mixColModified = true
    }
    if (!mixCol.fields.getByName('codigo_interno')) {
      mixCol.fields.add(new TextField({ name: 'codigo_interno' }))
      mixColModified = true
    }
    if (!mixCol.fields.getByName('app_diretoria_product_id')) {
      mixCol.fields.add(new TextField({ name: 'app_diretoria_product_id' }))
      mixColModified = true
    }
    if (mixColModified) {
      app.save(mixCol)
    }

    // 8. Expandir user_audit_log para cobrir ações de Cadastros
    try {
      const userAuditLog = app.findCollectionByNameOrId('user_audit_log')
      const acaoField = userAuditLog.fields.getByName('acao')
      if (acaoField && acaoField.values) {
        const existingValues = acaoField.values || []
        const newActions = [
          'cadastro_industria_alterado',
          'cadastro_produto_alterado',
          'cadastro_rede_alterado',
          'cadastro_loja_alterado',
          'cadastro_promotor_alterado',
          'cadastro_supervisor_alterado',
          'vinculo_tradepro_cliente',
          'desvinculo_tradepro_cliente',
          'mix_oficial_alterado',
          'mix_definido_loja_alterado',
          'pendencia_cadastro_resolvida',
        ]
        let modified = false
        for (let i = 0; i < newActions.length; i++) {
          if (existingValues.indexOf(newActions[i]) === -1) {
            existingValues.push(newActions[i])
            modified = true
          }
        }
        if (modified) {
          acaoField.values = existingValues
          app.save(userAuditLog)
        }
      }
    } catch (_) {}
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('cadastros_pendencias'))
    } catch (_) {}
    try {
      app.delete(app.findCollectionByNameOrId('store_promoter_assignments'))
    } catch (_) {}
    try {
      app.delete(app.findCollectionByNameOrId('promoters'))
    } catch (_) {}
    try {
      app.delete(app.findCollectionByNameOrId('supervisors'))
    } catch (_) {}
  },
)
