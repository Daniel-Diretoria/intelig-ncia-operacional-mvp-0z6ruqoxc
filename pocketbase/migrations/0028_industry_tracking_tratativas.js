migrate(
  (app) => {
    // industry_tracking_tratativas: Registro e Linha do Tempo de Tratativas de Acompanhamento Operacional
    // Permite registrar resultados de acompanhamento sem sobrescrever histórico:
    // quando o problema foi identificado, por quê, último estado conhecido, quem realizou, resposta, regularização.
    const tratativasCol = new Collection({
      name: 'industry_tracking_tratativas',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'industry_id', type: 'text' },
        { name: 'industry_name', type: 'text', required: true },
        { name: 'store_code', type: 'text' },
        { name: 'store_name', type: 'text', required: true },
        { name: 'product_name', type: 'text', required: true },
        { name: 'product_code', type: 'text' },
        {
          name: 'resultado',
          type: 'select',
          values: [
            'atualizacao_solicitada',
            'aguardando_retorno',
            'produto_vendido_zerado',
            'ruptura_confirmada',
            'produto_nao_trabalha_mais',
            'mix_loja_precisa_atualizar',
            'pesquisa_inconsistente',
            'situacao_regularizada',
            'observacao_manual',
          ],
          required: true,
        },
        { name: 'usuario_nome', type: 'text', required: true },
        { name: 'observacao', type: 'text' },
        { name: 'resposta', type: 'text' },
        { name: 'motivo_identificacao', type: 'text' },
        { name: 'ultimo_estado_conhecido_json', type: 'json' },
        { name: 'data_identificacao', type: 'text' },
        { name: 'data_regularizacao', type: 'text' },
        {
          name: 'status_tratativa',
          type: 'select',
          values: ['aberto', 'em_andamento', 'regularizado', 'cancelado'],
          required: true,
        },
        { name: 'sugestao_mix_loja', type: 'bool' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_track_trat_ind_store ON industry_tracking_tratativas (industry_name, store_name)',
        'CREATE INDEX idx_track_trat_prod ON industry_tracking_tratativas (product_name)',
        'CREATE INDEX idx_track_trat_status ON industry_tracking_tratativas (status_tratativa)',
      ],
    })
    app.save(tratativasCol)
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('industry_tracking_tratativas'))
    } catch (_) {}
  },
)
