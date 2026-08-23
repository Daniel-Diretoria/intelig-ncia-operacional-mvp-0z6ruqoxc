migrate(
  (app) => {
    const rupturasCol = app.findCollectionByNameOrId('rupturas_base')
    const validadesCol = app.findCollectionByNameOrId('validades_base')

    const collection = new Collection({
      name: 'operational_cross_evidence',
      type: 'base',
      listRule: '',
      viewRule: '',
      createRule: '',
      updateRule: '',
      deleteRule: '',
      fields: [
        {
          name: 'rupture_record_id',
          type: 'relation',
          required: false,
          collectionId: rupturasCol.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        {
          name: 'validity_record_id',
          type: 'relation',
          required: false,
          collectionId: validadesCol.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'store_code', type: 'text' },
        { name: 'store_name', type: 'text' },
        { name: 'store_key', type: 'text' },
        { name: 'product_code', type: 'text' },
        { name: 'product_name', type: 'text' },
        { name: 'product_key', type: 'text' },
        { name: 'client_or_brand', type: 'text' },
        { name: 'rupture_detected_at', type: 'text' },
        { name: 'stock_evidence_at', type: 'text' },
        { name: 'quantity_found', type: 'number' },
        { name: 'product_expiry_date', type: 'text' },
        { name: 'resolution_days', type: 'number' },
        {
          name: 'match_method',
          type: 'select',
          values: ['high_code_product', 'medium_exact_name', 'inconclusive'],
          maxSelect: 1,
        },
        {
          name: 'confidence',
          type: 'select',
          values: ['high', 'medium', 'inconclusive'],
          maxSelect: 1,
        },
        {
          name: 'proposed_status',
          type: 'select',
          values: ['inferred_resolved', 'awaiting_review', 'inconclusive', 'reopened'],
          maxSelect: 1,
        },
        {
          name: 'review_status',
          type: 'select',
          values: ['pending', 'confirmed', 'rejected'],
          maxSelect: 1,
        },
        { name: 'reviewed_at', type: 'text' },
        { name: 'reviewed_by', type: 'text' },
        { name: 'rejection_reason', type: 'text' },
        { name: 'engine_version', type: 'text' },
        { name: 'evidence_key', type: 'text' },
        { name: 'created_at', type: 'text' },
        { name: 'updated_at', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_cross_evidence_key ON operational_cross_evidence (evidence_key)',
        'CREATE INDEX idx_cross_evidence_review_status ON operational_cross_evidence (review_status)',
        'CREATE INDEX idx_cross_evidence_store_code ON operational_cross_evidence (store_code)',
        'CREATE INDEX idx_cross_evidence_confidence ON operational_cross_evidence (confidence)',
        'CREATE INDEX idx_cross_evidence_proposed_status ON operational_cross_evidence (proposed_status)',
      ],
    })

    app.save(collection)
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId('operational_cross_evidence')
      app.delete(collection)
    } catch (_) {}
  },
)
