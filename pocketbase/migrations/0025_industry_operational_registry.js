migrate(
  (app) => {
    // 1. industry_registry: Cadastro Operacional da Indústria / Fornecedor
    const industryRegistry = new Collection({
      name: 'industry_registry',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'nome', type: 'text', required: true },
        { name: 'nome_chave', type: 'text', required: true }, // normalizado uppercase para join canônico
        { name: 'razao_social', type: 'text' },
        { name: 'cnpj', type: 'text' },
        { name: 'status', type: 'select', values: ['ativa', 'inativa'], required: true },
        { name: 'segmento', type: 'text' },
        { name: 'contato_nome', type: 'text' },
        { name: 'contato_email', type: 'text' },
        { name: 'contato_telefone', type: 'text' },
        { name: 'observacoes', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_industry_reg_nome_chave ON industry_registry (nome_chave)',
      ],
    })
    app.save(industryRegistry)

    // 2. industry_store_coverage: Cobertura Operacional (Loja x Indústria)
    const industryStoreCoverage = new Collection({
      name: 'industry_store_coverage',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        {
          name: 'industry_id',
          type: 'relation',
          required: true,
          collectionId: industryRegistry.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'industry_name', type: 'text', required: true },
        { name: 'store_code', type: 'text' },
        { name: 'store_name', type: 'text', required: true },
        { name: 'network_name', type: 'text' },
        { name: 'city', type: 'text' },
        { name: 'state', type: 'text' },
        {
          name: 'status_relacao',
          type: 'select',
          values: ['detectada', 'confirmada', 'ativa', 'inativa'],
          required: true,
        },
        { name: 'observacao', type: 'text' },
        { name: 'origem_deteccao', type: 'text' }, // "historico_validades", "historico_rupturas", "manual"
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_cov_ind_store ON industry_store_coverage (industry_id, store_code)',
      ],
    })
    app.save(industryStoreCoverage)

    // 3. industry_product_mix: Mix Oficial da Indústria (Catálogo Oficial vs Observado)
    const industryProductMix = new Collection({
      name: 'industry_product_mix',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        {
          name: 'industry_id',
          type: 'relation',
          required: true,
          collectionId: industryRegistry.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'industry_name', type: 'text', required: true },
        { name: 'codigo_produto', type: 'text' },
        { name: 'cod_barras', type: 'text' },
        { name: 'nome_produto', type: 'text', required: true },
        { name: 'categoria', type: 'text' },
        {
          name: 'tipo_mix',
          type: 'select',
          values: ['oficial_industria', 'observado_operacional'],
          required: true,
        },
        {
          name: 'status',
          type: 'select',
          values: ['ativo', 'descontinuado', 'em_avaliacao'],
          required: true,
        },
        { name: 'shelf_life_dias', type: 'number' }, // Shelf life esperado quando conhecido
        { name: 'store_code_restrito', type: 'text' }, // Opcional: para eventual restrição por loja futura
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_mix_ind_prod ON industry_product_mix (industry_id, nome_produto)',
      ],
    })
    app.save(industryProductMix)

    // 4. industry_research_config: Pesquisas Obrigatórias por Indústria
    const industryResearchConfig = new Collection({
      name: 'industry_research_config',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        {
          name: 'industry_id',
          type: 'relation',
          required: true,
          collectionId: industryRegistry.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'tipo_pesquisa',
          type: 'select',
          values: ['validades', 'rupturas'],
          required: true,
        },
        { name: 'ativo', type: 'bool' },
        {
          name: 'frequencia',
          type: 'select',
          values: ['diaria', 'semanal', 'quinzenal', 'mensal'],
          required: true,
        },
        {
          name: 'dia_esperado',
          type: 'select',
          values: [
            'segunda',
            'terca',
            'quarta',
            'quinta',
            'sexta',
            'sabado',
            'domingo',
            'qualquer',
          ],
          required: true,
        },
        { name: 'horario_limite', type: 'text' }, // ex: "18:00"
        { name: 'tolerancia_dias', type: 'number' }, // tolerância de dias antes de considerar ciclo atrasado
        { name: 'instrucoes', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_research_ind_tipo ON industry_research_config (industry_id, tipo_pesquisa)',
      ],
    })
    app.save(industryResearchConfig)

    // 5. industry_validity_policy: Política de Validade (Nível Sistema, Indústria ou Exceção de Produto)
    const industryValidityPolicy = new Collection({
      name: 'industry_validity_policy',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        {
          name: 'industry_id',
          type: 'relation',
          collectionId: industryRegistry.id,
          cascadeDelete: true,
          maxSelect: 1,
        }, // null se for regra padrão de sistema
        {
          name: 'nivel_regra',
          type: 'select',
          values: ['sistema', 'industria', 'produto_excecao'],
          required: true,
        },
        { name: 'produto_nome', type: 'text' }, // Preenchido se nivel_regra === 'produto_excecao'
        { name: 'codigo_produto', type: 'text' },
        { name: 'dias_critico', type: 'number', required: true }, // ex: 15
        { name: 'dias_atencao', type: 'number', required: true }, // ex: 20
        { name: 'dias_moderado', type: 'number' }, // ex: 30
        { name: 'shelf_life_padrao_dias', type: 'number' }, // shelf life esperado quando conhecido
        { name: 'justificativa', type: 'text' },
        { name: 'ativo', type: 'bool' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_pol_ind_nivel ON industry_validity_policy (industry_id, nivel_regra)',
      ],
    })
    app.save(industryValidityPolicy)

    // 6. industry_config_audit: Histórico / Auditoria de Alterações de Configuração
    const industryConfigAudit = new Collection({
      name: 'industry_config_audit',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        {
          name: 'industry_id',
          type: 'relation',
          collectionId: industryRegistry.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'modulo',
          type: 'select',
          values: ['identificacao', 'cobertura', 'mix', 'pesquisas', 'politica_validade'],
          required: true,
        },
        { name: 'acao', type: 'text', required: true }, // ex: "alteracao_frequencia", "adicao_excecao", etc.
        { name: 'usuario_nome', type: 'text' },
        { name: 'detalhes_json', type: 'json' },
        { name: 'data_alteracao', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_audit_ind_created ON industry_config_audit (industry_id, created DESC)',
      ],
    })
    app.save(industryConfigAudit)
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('industry_config_audit'))
    } catch (_) {}
    try {
      app.delete(app.findCollectionByNameOrId('industry_validity_policy'))
    } catch (_) {}
    try {
      app.delete(app.findCollectionByNameOrId('industry_research_config'))
    } catch (_) {}
    try {
      app.delete(app.findCollectionByNameOrId('industry_product_mix'))
    } catch (_) {}
    try {
      app.delete(app.findCollectionByNameOrId('industry_store_coverage'))
    } catch (_) {}
    try {
      app.delete(app.findCollectionByNameOrId('industry_registry'))
    } catch (_) {}
  },
)
