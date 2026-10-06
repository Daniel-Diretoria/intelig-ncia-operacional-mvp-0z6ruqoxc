migrate(
  (app) => {
    // 1. devolucoes_casos
    const devolucoesCasos = new Collection({
      name: 'devolucoes_casos',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'codigo_caso', type: 'text', required: true }, // ex: "DEV-2026-0001"
        { name: 'data_solicitacao', type: 'text', required: true }, // YYYY-MM-DD
        { name: 'industry_id', type: 'text' },
        { name: 'industry_name', type: 'text', required: true },
        { name: 'store_id', type: 'text' },
        { name: 'store_code', type: 'text' },
        { name: 'store_name', type: 'text', required: true },
        { name: 'promotor_nome', type: 'text', required: true },
        { name: 'promotor_cod', type: 'text' },
        { name: 'motivo_geral', type: 'text' },
        { name: 'observacoes', type: 'text' },
        {
          name: 'status',
          type: 'select',
          values: [
            'solicitacao_recebida',
            'em_analise',
            'aguardando_informacao',
            'pronta_para_envio',
            'aguardando_autorizacao_industria',
            'industria_autorizou',
            'aguardando_nf_descarte',
            'concluido',
            'divergencia_encontrada',
            'nao_autorizado',
            'cancelado',
          ],
          required: true,
        },
        { name: 'responsavel_nome', type: 'text' },
        { name: 'proxima_acao', type: 'text' },
        { name: 'total_itens', type: 'number' },
        { name: 'total_unidades_solicitadas', type: 'number' },
        { name: 'total_unidades_autorizadas', type: 'number' },
        { name: 'total_unidades_devolvidas', type: 'number' },
        // Preparação financeira futura (vazio por padrão conforme regra 19)
        { name: 'valor_solicitado', type: 'number' },
        { name: 'valor_autorizado', type: 'number' },
        { name: 'valor_devolvido', type: 'number' },
        // Preparação para NF e Descarte (regra 20)
        { name: 'nf_numero', type: 'text' },
        { name: 'nf_data', type: 'text' },
        { name: 'nf_valor', type: 'number' },
        { name: 'nf_anexo_nome', type: 'text' },
        { name: 'nf_assinada_anexo_nome', type: 'text' },
        { name: 'evidencia_descarte_anexo_nome', type: 'text' },
        { name: 'autorizacao_protocolo', type: 'text' },
        { name: 'autorizacao_data', type: 'text' },
        { name: 'resultado_auditoria_geral', type: 'text' }, // acompanhamento_consistente | atencao | divergencia | dados_insuficientes
        { name: 'resumo_auditoria_json', type: 'json' },
        { name: 'created_by', type: 'relation', collectionId: '_pb_users_auth_', maxSelect: 1 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_dev_casos_codigo ON devolucoes_casos (codigo_caso)',
        'CREATE INDEX idx_dev_casos_status ON devolucoes_casos (status)',
        'CREATE INDEX idx_dev_casos_ind ON devolucoes_casos (industry_name)',
        'CREATE INDEX idx_dev_casos_store ON devolucoes_casos (store_code)',
        'CREATE INDEX idx_dev_casos_promotor ON devolucoes_casos (promotor_nome)',
        'CREATE INDEX idx_dev_casos_data ON devolucoes_casos (data_solicitacao DESC)',
      ],
    })
    app.save(devolucoesCasos)

    // 2. devolucoes_itens
    const devolucoesItens = new Collection({
      name: 'devolucoes_itens',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        {
          name: 'caso_id',
          type: 'relation',
          collectionId: devolucoesCasos.id,
          cascadeDelete: true,
          required: true,
          maxSelect: 1,
        },
        { name: 'codigo_caso', type: 'text' },
        { name: 'produto_nome_informado', type: 'text', required: true },
        { name: 'produto_id', type: 'text' },
        { name: 'produto_codigo', type: 'text' },
        { name: 'produto_nome_oficial', type: 'text' },
        { name: 'precisa_identificacao', type: 'bool' }, // Regra 6: se sem correspondência segura
        { name: 'quantidade_solicitada', type: 'number', required: true },
        { name: 'quantidade_autorizada', type: 'number' },
        { name: 'quantidade_devolvida', type: 'number' },
        { name: 'valor_unitario', type: 'number' }, // Vazio se não disponível
        { name: 'validade_informada', type: 'text' }, // YYYY-MM-DD ou vazio
        { name: 'validade_ausente', type: 'bool' }, // Regra 5: true quando não informada ("Validade não informada")
        { name: 'motivo_item', type: 'text' },
        { name: 'observacao', type: 'text' },
        { name: 'evidencia_foto_url', type: 'text' },
        {
          name: 'classificacao_auditoria',
          type: 'select',
          values: [
            'acompanhamento_consistente',
            'atencao',
            'divergencia',
            'dados_insuficientes',
            'nao_auditado',
          ],
        },
        { name: 'auditoria_explicacao', type: 'text' },
        { name: 'auditoria_detalhes_json', type: 'json' },
        {
          name: 'decisao_humana',
          type: 'select',
          values: [
            'pendente',
            'aprovado_para_industria',
            'solicitar_informacao_promotor',
            'registrar_divergencia',
            'manter_em_analise',
            'rejeitado',
          ],
        },
        { name: 'decisao_observacao', type: 'text' },
        { name: 'decisao_usuario_nome', type: 'text' },
        { name: 'decisao_data', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_dev_itens_caso ON devolucoes_itens (caso_id)',
        'CREATE INDEX idx_dev_itens_classificacao ON devolucoes_itens (classificacao_auditoria)',
        'CREATE INDEX idx_dev_itens_decisao ON devolucoes_itens (decisao_humana)',
      ],
    })
    app.save(devolucoesItens)

    // 3. devolucoes_timeline
    const devolucoesTimeline = new Collection({
      name: 'devolucoes_timeline',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        {
          name: 'caso_id',
          type: 'relation',
          collectionId: devolucoesCasos.id,
          cascadeDelete: true,
          required: true,
          maxSelect: 1,
        },
        { name: 'codigo_caso', type: 'text' },
        {
          name: 'tipo_evento',
          type: 'select',
          values: [
            'criacao_solicitacao',
            'edicao_dados',
            'inclusao_item',
            'remocao_item',
            'edicao_item',
            'auditoria_executada',
            'decisao_humana',
            'mudanca_status',
            'informacao_solicitada',
            'resposta_recebida',
            'evidencia_anexada',
            'autorizacao_industria',
            'nf_registrada',
            'descarte_registrado',
            'caso_concluido',
            'outro',
          ],
          required: true,
        },
        { name: 'titulo', type: 'text', required: true },
        { name: 'descricao', type: 'text' },
        { name: 'usuario_nome', type: 'text' },
        { name: 'usuario_id', type: 'text' },
        { name: 'item_id', type: 'text' },
        { name: 'item_nome', type: 'text' },
        { name: 'status_anterior', type: 'text' },
        { name: 'status_novo', type: 'text' },
        { name: 'dados_extras_json', type: 'json' },
        { name: 'data_evento', type: 'text', required: true },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_dev_timeline_caso ON devolucoes_timeline (caso_id, created DESC)',
        'CREATE INDEX idx_dev_timeline_tipo ON devolucoes_timeline (tipo_evento)',
      ],
    })
    app.save(devolucoesTimeline)

    // 4. devolucoes_evidencias
    const devolucoesEvidencias = new Collection({
      name: 'devolucoes_evidencias',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        {
          name: 'caso_id',
          type: 'relation',
          collectionId: devolucoesCasos.id,
          cascadeDelete: true,
          required: true,
          maxSelect: 1,
        },
        { name: 'item_id', type: 'text' }, // Opcional: associado a produto específico (regra 15)
        { name: 'timeline_id', type: 'text' }, // Opcional: associado a etapa da timeline (regra 15)
        {
          name: 'tipo',
          type: 'select',
          values: [
            'foto_produto',
            'foto_validade',
            'foto_lote',
            'nf_documento',
            'nf_assinada',
            'comprovante_descarte',
            'outro',
          ],
          required: true,
        },
        { name: 'titulo', type: 'text', required: true },
        { name: 'descricao', type: 'text' },
        { name: 'url_arquivo', type: 'text' },
        { name: 'arquivo', type: 'file', maxSize: 10485760 }, // até 10MB
        { name: 'usuario_nome', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_dev_evid_caso ON devolucoes_evidencias (caso_id)',
        'CREATE INDEX idx_dev_evid_item ON devolucoes_evidencias (item_id)',
      ],
    })
    app.save(devolucoesEvidencias)

    // 5. devolucoes_audit (Auditoria de Sistema - Regra 22: preserva rastreabilidade completa)
    const devolucoesAudit = new Collection({
      name: 'devolucoes_audit',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        {
          name: 'caso_id',
          type: 'relation',
          collectionId: devolucoesCasos.id,
          cascadeDelete: true,
          required: true,
          maxSelect: 1,
        },
        { name: 'acao', type: 'text', required: true }, // criacao, edicao, inclusao_item, remocao_item, execucao_auditoria, decisao_humana, alteracao_status, anexo_evidencia
        { name: 'usuario_nome', type: 'text' },
        { name: 'usuario_id', type: 'text' },
        { name: 'detalhes_json', type: 'json' },
        { name: 'data_acao', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_dev_audit_caso ON devolucoes_audit (caso_id, created DESC)',
        'CREATE INDEX idx_dev_audit_acao ON devolucoes_audit (acao)',
      ],
    })
    app.save(devolucoesAudit)
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('devolucoes_audit'))
    } catch (_) {}
    try {
      app.delete(app.findCollectionByNameOrId('devolucoes_evidencias'))
    } catch (_) {}
    try {
      app.delete(app.findCollectionByNameOrId('devolucoes_timeline'))
    } catch (_) {}
    try {
      app.delete(app.findCollectionByNameOrId('devolucoes_itens'))
    } catch (_) {}
    try {
      app.delete(app.findCollectionByNameOrId('devolucoes_casos'))
    } catch (_) {}
  },
)
