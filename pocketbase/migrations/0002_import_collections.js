migrate(
  (app) => {
    // Collection: import_history — histórico de importações de Excel.
    const importHistory = new Collection({
      name: 'import_history',
      type: 'base',
      listRule: '@request.auth.id != ""',
      viewRule: '@request.auth.id != ""',
      createRule: '@request.auth.id != ""',
      updateRule: '@request.auth.id != ""',
      deleteRule: '@request.auth.id != ""',
      fields: [
        { name: 'file_name', type: 'text', required: true },
        { name: 'file_size', type: 'number', onlyInt: true },
        { name: 'total_rows', type: 'number', onlyInt: true },
        { name: 'imported_rows', type: 'number', onlyInt: true },
        { name: 'skipped_rows', type: 'number', onlyInt: true },
        { name: 'error_rows', type: 'number', onlyInt: true },
        {
          name: 'status',
          type: 'select',
          required: true,
          values: ['pending', 'processing', 'completed', 'failed'],
          maxSelect: 1,
        },
        { name: 'errors_json', type: 'json' },
        { name: 'source', type: 'text' },
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
      indexes: ['CREATE INDEX idx_import_history_created ON import_history (created DESC)'],
    })
    app.save(importHistory)

    // Collection: validades_imported — registros importados que alimentam o módulo de Validades.
    // O schema espelha ValidadeItem (ver src/types/domain.ts). Não alteramos a tela de Validades;
    // ela consome os mesmos campos através do ImportDataSource.
    const usersColId = '_pb_users_auth_'

    const validadesImported = new Collection({
      name: 'validades_imported',
      type: 'base',
      listRule: '@request.auth.id != ""',
      viewRule: '@request.auth.id != ""',
      createRule: '@request.auth.id != ""',
      updateRule: '@request.auth.id != ""',
      deleteRule: '@request.auth.id != ""',
      fields: [
        { name: 'product', type: 'text', required: true },
        { name: 'sku', type: 'text', required: true },
        { name: 'lote', type: 'text', required: true },
        {
          name: 'category',
          type: 'select',
          required: true,
          values: ['Mercearia', 'Laticínios', 'Bebidas', 'Limpeza', 'Higiene'],
          maxSelect: 1,
        },
        { name: 'validade', type: 'date', required: true },
        { name: 'diasRestantes', type: 'number', onlyInt: true },
        {
          name: 'status',
          type: 'select',
          required: false,
          values: ['Crítico', 'Próximo', 'OK'],
          maxSelect: 1,
        },
        { name: 'unidade', type: 'text', required: true },
        { name: 'estoque', type: 'number', onlyInt: true },
        { name: 'cliente', type: 'text' },
        { name: 'industria', type: 'text' },
        { name: 'rede', type: 'text' },
        { name: 'loja', type: 'text' },
        { name: 'cidade', type: 'text' },
        { name: 'uf', type: 'text' },
        { name: 'promotor', type: 'text' },
        { name: 'supervisor', type: 'text' },
        { name: 'quantidade', type: 'number', onlyInt: true },
        { name: 'precoUnitario', type: 'number' },
        { name: 'ultimaAtualizacao', type: 'date' },
        {
          name: 'import_id',
          type: 'relation',
          required: false,
          collectionId: app.findCollectionByNameOrId('import_history').id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'created_by',
          type: 'relation',
          required: false,
          collectionId: usersColId,
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_validades_imported_sku ON validades_imported (sku)',
        'CREATE INDEX idx_validades_imported_validade ON validades_imported (validade)',
        'CREATE INDEX idx_validades_imported_import ON validades_imported (import_id)',
        'CREATE INDEX idx_validades_imported_loja ON validades_imported (loja)',
      ],
    })
    app.save(validadesImported)
  },
  (app) => {
    try {
      const vi = app.findCollectionByNameOrId('validades_imported')
      app.delete(vi)
    } catch (_) {}
    try {
      const ih = app.findCollectionByNameOrId('import_history')
      app.delete(ih)
    } catch (_) {}
  },
)
