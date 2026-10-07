migrate(
  (app) => {
    // 1. rupturas_base: adicionar campos operacionais, timestamps de execução e rastreabilidade da fonte
    const rupCol = app.findCollectionByNameOrId('rupturas_base')

    if (!rupCol.fields.getByName('source_type')) {
      rupCol.fields.add(new TextField({ name: 'source_type' }))
    }
    if (!rupCol.fields.getByName('source_job_id')) {
      rupCol.fields.add(new TextField({ name: 'source_job_id' }))
    }
    if (!rupCol.fields.getByName('source_endpoint')) {
      rupCol.fields.add(new TextField({ name: 'source_endpoint' }))
    }
    if (!rupCol.fields.getByName('source_synced_at')) {
      rupCol.fields.add(new TextField({ name: 'source_synced_at' }))
    }
    if (!rupCol.fields.getByName('dados_brutos_json')) {
      rupCol.fields.add(new JSONField({ name: 'dados_brutos_json' }))
    }
    if (!rupCol.fields.getByName('id_promotor')) {
      rupCol.fields.add(new TextField({ name: 'id_promotor' }))
    }
    if (!rupCol.fields.getByName('id_supervisor')) {
      rupCol.fields.add(new TextField({ name: 'id_supervisor' }))
    }
    if (!rupCol.fields.getByName('nome_supervisor')) {
      rupCol.fields.add(new TextField({ name: 'nome_supervisor' }))
    }
    if (!rupCol.fields.getByName('id_cliente')) {
      rupCol.fields.add(new TextField({ name: 'id_cliente' }))
    }
    if (!rupCol.fields.getByName('id_atividade')) {
      rupCol.fields.add(new TextField({ name: 'id_atividade' }))
    }
    if (!rupCol.fields.getByName('id_atividade_ruptura')) {
      rupCol.fields.add(new TextField({ name: 'id_atividade_ruptura' }))
    }
    if (!rupCol.fields.getByName('status_roteiro')) {
      rupCol.fields.add(new TextField({ name: 'status_roteiro' }))
    }
    if (!rupCol.fields.getByName('id_roteiro_padrao')) {
      rupCol.fields.add(new TextField({ name: 'id_roteiro_padrao' }))
    }
    if (!rupCol.fields.getByName('descricao_roteiro_padrao')) {
      rupCol.fields.add(new TextField({ name: 'descricao_roteiro_padrao' }))
    }
    if (!rupCol.fields.getByName('hora_inicio_execucao_roteiro')) {
      rupCol.fields.add(new TextField({ name: 'hora_inicio_execucao_roteiro' }))
    }
    if (!rupCol.fields.getByName('hora_final_execucao_roteiro')) {
      rupCol.fields.add(new TextField({ name: 'hora_final_execucao_roteiro' }))
    }
    if (!rupCol.fields.getByName('data_hora_execucao_atividade')) {
      rupCol.fields.add(new TextField({ name: 'data_hora_execucao_atividade' }))
    }
    if (!rupCol.fields.getByName('cnpj_fornecedor')) {
      rupCol.fields.add(new TextField({ name: 'cnpj_fornecedor' }))
    }
    if (!rupCol.fields.getByName('descricao_fornecedor')) {
      rupCol.fields.add(new TextField({ name: 'descricao_fornecedor' }))
    }
    if (!rupCol.fields.getByName('codigo_familia')) {
      rupCol.fields.add(new TextField({ name: 'codigo_familia' }))
    }
    if (!rupCol.fields.getByName('descricao_familia')) {
      rupCol.fields.add(new TextField({ name: 'descricao_familia' }))
    }
    if (!rupCol.fields.getByName('status_normalizacao')) {
      rupCol.fields.add(
        new SelectField({
          name: 'status_normalizacao',
          values: ['completo', 'parcial', 'pendente', 'conflito'],
          maxSelect: 1,
        }),
      )
    }
    if (!rupCol.fields.getByName('industry_id')) {
      const indCol = app.findCollectionByNameOrId('industry_registry')
      rupCol.fields.add(
        new RelationField({
          name: 'industry_id',
          collectionId: indCol.id,
          maxSelect: 1,
        }),
      )
    }
    if (!rupCol.fields.getByName('store_id')) {
      const storeCol = app.findCollectionByNameOrId('stores')
      rupCol.fields.add(
        new RelationField({
          name: 'store_id',
          collectionId: storeCol.id,
          maxSelect: 1,
        }),
      )
    }

    rupCol.addIndex('idx_rup_source_job', false, 'source_job_id', '')
    rupCol.addIndex('idx_rup_status_norm', false, 'status_normalizacao', '')
    app.save(rupCol)

    // 2. validades_base: adicionar campos operacionais e rastreabilidade da fonte
    const valCol = app.findCollectionByNameOrId('validades_base')

    if (!valCol.fields.getByName('source_type')) {
      valCol.fields.add(new TextField({ name: 'source_type' }))
    }
    if (!valCol.fields.getByName('source_job_id')) {
      valCol.fields.add(new TextField({ name: 'source_job_id' }))
    }
    if (!valCol.fields.getByName('source_endpoint')) {
      valCol.fields.add(new TextField({ name: 'source_endpoint' }))
    }
    if (!valCol.fields.getByName('source_synced_at')) {
      valCol.fields.add(new TextField({ name: 'source_synced_at' }))
    }
    if (!valCol.fields.getByName('dados_brutos_json')) {
      valCol.fields.add(new JSONField({ name: 'dados_brutos_json' }))
    }
    if (!valCol.fields.getByName('data_fabricacao')) {
      valCol.fields.add(new DateField({ name: 'data_fabricacao' }))
    }
    if (!valCol.fields.getByName('status_normalizacao')) {
      valCol.fields.add(
        new SelectField({
          name: 'status_normalizacao',
          values: ['completo', 'parcial', 'pendente', 'conflito'],
          maxSelect: 1,
        }),
      )
    }

    valCol.addIndex('idx_val_source_job', false, 'source_job_id', '')
    valCol.addIndex('idx_val_status_norm', false, 'status_normalizacao', '')
    app.save(valCol)

    // 3. Backfill retroativo seguro em rupturas_base:
    // Preencher source_type='tradepro_api', source_endpoint='relatorio-rupturas', source_job_id
    // extraído de tenant_id ('tradepro_job_<id>') onde aplicável
    try {
      app
        .db()
        .newQuery(`
      UPDATE rupturas_base
      SET source_type = 'tradepro_api',
          source_endpoint = 'relatorio-rupturas',
          source_job_id = SUBSTR(tenant_id, 14)
      WHERE tenant_id LIKE 'tradepro_job_%' AND (source_type IS NULL OR source_type = '')
    `)
        .execute()

      app
        .db()
        .newQuery(`
      UPDATE rupturas_base
      SET source_type = 'excel',
          source_endpoint = 'rupturas_imports'
      WHERE source_import_id IS NOT NULL AND source_import_id != '' AND (source_type IS NULL OR source_type = '')
    `)
        .execute()
    } catch (err) {
      console.log('[Migration 0047] Aviso no backfill de rupturas_base:', err)
    }

    // 4. Backfill retroativo seguro em validades_base:
    try {
      app
        .db()
        .newQuery(`
      UPDATE validades_base
      SET source_type = 'tradepro_api',
          source_endpoint = 'relatorio-validade',
          source_job_id = SUBSTR(data_importacao, 14)
      WHERE data_importacao LIKE 'tradepro_job_%' AND (source_type IS NULL OR source_type = '')
    `)
        .execute()

      app
        .db()
        .newQuery(`
      UPDATE validades_base
      SET source_type = 'excel',
          source_endpoint = 'import_history'
      WHERE import_id IS NOT NULL AND import_id != '' AND (source_type IS NULL OR source_type = '')
    `)
        .execute()
    } catch (err) {
      console.log('[Migration 0047] Aviso no backfill de validades_base:', err)
    }
  },
  (app) => {
    const rupCol = app.findCollectionByNameOrId('rupturas_base')
    rupCol.removeIndex('idx_rup_source_job')
    rupCol.removeIndex('idx_rup_status_norm')
    app.save(rupCol)

    const valCol = app.findCollectionByNameOrId('validades_base')
    valCol.removeIndex('idx_val_source_job')
    valCol.removeIndex('idx_val_status_norm')
    app.save(valCol)
  },
)
