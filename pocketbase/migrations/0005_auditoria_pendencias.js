/**
 * Cria a collection `auditoria_pendencias` — pendências de auditoria de
 * ocorrências Vencidas (sinalizadas para correção manual pelo promotor/supervisor
 * antes que contaminem relatórios).
 *
 * Cada pendência espelha uma ocorrência da `validades_base` (status_operacional
 * = 'Vencido') e mantém o status de auditoria ('pendente' | 'corrigido' |
 * 'confirmado'). A ocorrência original é marcada com `sinalizado_correcao = true`
 * (campo adicionado a validades_base) em vez de removida da Base Atual, para
 * preservar o histórico.
 */
migrate(
  (app) => {
    const authRule = '@request.auth.id != ""'

    // ---------------------------------------------------------------------------
    // Adiciona flag `sinalizado_correcao` à `validades_base` (bool, opcional).
    // Permite que a tela de Auditoria marque ocorrências sem removê-las da Base.
    // ---------------------------------------------------------------------------
    const validadesBase = app.findCollectionByNameOrId('validades_base')
    if (!validadesBase.fields.getByName('sinalizado_correcao')) {
      validadesBase.fields.add(new BoolField({ name: 'sinalizado_correcao' }))
    }
    if (!validadesBase.fields.getByName('status_auditoria')) {
      validadesBase.fields.add(
        new SelectField({
          name: 'status_auditoria',
          required: false,
          values: ['pendente', 'corrigido', 'confirmado'],
          maxSelect: 1,
        }),
      )
    }
    // Índice para filtrar Vencidos sinalizados / confirmados rapidamente.
    validadesBase.addIndex('idx_validades_base_auditoria', false, 'sinalizado_correcao', '')
    app.save(validadesBase)

    // ---------------------------------------------------------------------------
    // Collection: auditoria_pendencias
    // ---------------------------------------------------------------------------
    const auditoria = new Collection({
      name: 'auditoria_pendencias',
      type: 'base',
      listRule: authRule,
      viewRule: authRule,
      createRule: authRule,
      updateRule: authRule,
      deleteRule: authRule,
      fields: [
        // Referência à ocorrência original (validades_base.id).
        {
          name: 'validade_base_id',
          type: 'relation',
          required: false,
          collectionId: app.findCollectionByNameOrId('validades_base').id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'chave_operacional', type: 'text' },
        { name: 'produto', type: 'text' },
        { name: 'loja', type: 'text' },
        { name: 'codigo_loja', type: 'text' },
        { name: 'quantidade', type: 'number', onlyInt: true },
        { name: 'validade_efetiva', type: 'date' },
        { name: 'dias_vencido', type: 'number', onlyInt: true },
        { name: 'data_entrada', type: 'date' },
        { name: 'promotor', type: 'text' },
        { name: 'supervisor', type: 'text' },
        { name: 'motivo_sinalizacao', type: 'text' },
        { name: 'sinalizado_por', type: 'text' },
        { name: 'sinalizado_em', type: 'date' },
        {
          name: 'status_auditoria',
          type: 'select',
          required: true,
          values: ['pendente', 'corrigido', 'confirmado'],
          maxSelect: 1,
        },
        // Referência à importação de origem (opcional).
        {
          name: 'import_id',
          type: 'relation',
          required: false,
          collectionId: app.findCollectionByNameOrId('import_history').id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        {
          name: 'created_by',
          type: 'relation',
          required: false,
          collectionId: '_pb_users_auth_',
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_auditoria_status ON auditoria_pendencias (status_auditoria)',
        'CREATE INDEX idx_auditoria_validade_base ON auditoria_pendencias (validade_base_id)',
        'CREATE INDEX idx_auditoria_chave ON auditoria_pendencias (chave_operacional)',
      ],
    })
    app.save(auditoria)
  },
  (app) => {
    // Remove a collection de pendências.
    try {
      const c = app.findCollectionByNameOrId('auditoria_pendencias')
      app.delete(c)
    } catch (_) {}

    // Remove os campos adicionados a validades_base.
    try {
      const vb = app.findCollectionByNameOrId('validades_base')
      try {
        vb.fields.removeByName('sinalizado_correcao')
      } catch (_) {}
      try {
        vb.fields.removeByName('status_auditoria')
      } catch (_) {}
      try {
        vb.removeIndex('idx_validades_base_auditoria')
      } catch (_) {}
      app.save(vb)
    } catch (_) {}
  },
)
