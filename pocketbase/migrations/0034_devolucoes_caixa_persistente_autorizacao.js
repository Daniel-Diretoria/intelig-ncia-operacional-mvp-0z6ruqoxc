migrate(
  (app) => {
    // Coleção para persistência da Caixa de Importação WhatsApp:
    // Separação clara entre deduplicação de mensagens (hash wmsg_xxx) e
    // estado operacional da solicitação identificada (pendente_revisao, processada, ignorada).
    // Permite que uma solicitação pendente continue disponível mesmo se o usuário fechar a tela,
    // reimportar a conversa ou reabrir depois.
    const solicitacoesCollection = new Collection({
      name: 'devolucoes_solicitacoes_importadas',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'solicitacao_id', type: 'text', required: true }, // sol_wmsg_xxx
        { name: 'raw_mensagem_id', type: 'text', required: true }, // wmsg_xxx
        { name: 'batch_id', type: 'text' },
        { name: 'data_hora_msg', type: 'text' },
        { name: 'autor', type: 'text' },
        { name: 'loja_informada', type: 'text' },
        { name: 'loja_codigo', type: 'text' },
        { name: 'industria_informada', type: 'text' },
        { name: 'industria_id', type: 'text' },
        {
          name: 'estado_operacional',
          type: 'select',
          values: ['nova', 'pendente_revisao', 'processada', 'ignorada'],
          required: true,
        },
        { name: 'caso_criado_id', type: 'text' }, // id do Caso de Devolução quando processada
        { name: 'caso_criado_codigo', type: 'text' }, // DEV-2026-0001
        { name: 'ignorado_por', type: 'text' },
        { name: 'ignorado_em', type: 'text' },
        { name: 'ignorado_motivo', type: 'text' },
        { name: 'processado_por', type: 'text' },
        { name: 'processado_em', type: 'text' },
        { name: 'trecho_original', type: 'text' },
        { name: 'produtos_json', type: 'json' }, // lista de produtos com quantidades e ajustes
        { name: 'evidencias_json', type: 'json' },
        { name: 'reconciliacao_json', type: 'json' },
        { name: 'ajustes_operador_json', type: 'json' }, // preserva edições feitas pelo operador
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_dev_sol_id ON devolucoes_solicitacoes_importadas (solicitacao_id)',
        'CREATE INDEX idx_dev_sol_estado ON devolucoes_solicitacoes_importadas (estado_operacional)',
        'CREATE INDEX idx_dev_sol_raw_msg ON devolucoes_solicitacoes_importadas (raw_mensagem_id)',
        'CREATE INDEX idx_dev_sol_caso ON devolucoes_solicitacoes_importadas (caso_criado_id)',
      ],
    })
    app.save(solicitacoesCollection)

    // Adiciona campos de suporte a autorização e descarte na coleção de casos de devolução
    try {
      const casosColl = app.findCollectionByNameOrId('devolucoes_casos')
      let mudou = false
      if (!casosColl.fields.getByName('tipo_autorizacao_industria')) {
        casosColl.fields.add(
          new SelectField({
            name: 'tipo_autorizacao_industria',
            values: ['total', 'parcial', 'nao_autorizado'],
          }),
        )
        mudou = true
      }
      if (!casosColl.fields.getByName('autorizacao_observacao')) {
        casosColl.fields.add(new TextField({ name: 'autorizacao_observacao' }))
        mudou = true
      }
      if (!casosColl.fields.getByName('autorizacao_registrada_por')) {
        casosColl.fields.add(new TextField({ name: 'autorizacao_registrada_por' }))
        mudou = true
      }
      if (!casosColl.fields.getByName('descarte_registrado_por')) {
        casosColl.fields.add(new TextField({ name: 'descarte_registrado_por' }))
        mudou = true
      }
      if (!casosColl.fields.getByName('descarte_data')) {
        casosColl.fields.add(new TextField({ name: 'descarte_data' }))
        mudou = true
      }
      if (!casosColl.fields.getByName('conclusao_data')) {
        casosColl.fields.add(new TextField({ name: 'conclusao_data' }))
        mudou = true
      }
      if (!casosColl.fields.getByName('conclusao_usuario_nome')) {
        casosColl.fields.add(new TextField({ name: 'conclusao_usuario_nome' }))
        mudou = true
      }
      if (mudou) {
        app.save(casosColl)
      }
    } catch (e) {
      console.log('Aviso ao ajustar devolucoes_casos na migracao 0034:', e)
    }

    // Adiciona campo situacao_autorizacao no item para autorizações parciais
    try {
      const itensColl = app.findCollectionByNameOrId('devolucoes_itens')
      let mudouItem = false
      if (!itensColl.fields.getByName('situacao_autorizacao')) {
        itensColl.fields.add(
          new SelectField({
            name: 'situacao_autorizacao',
            values: ['pendente', 'autorizado', 'nao_autorizado'],
          }),
        )
        mudouItem = true
      }
      if (!itensColl.fields.getByName('motivo_nao_autorizado')) {
        itensColl.fields.add(new TextField({ name: 'motivo_nao_autorizado' }))
        mudouItem = true
      }
      if (mudouItem) {
        app.save(itensColl)
      }
    } catch (e) {
      console.log('Aviso ao ajustar devolucoes_itens na migracao 0034:', e)
    }
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('devolucoes_solicitacoes_importadas'))
    } catch (_) {}
  },
)
