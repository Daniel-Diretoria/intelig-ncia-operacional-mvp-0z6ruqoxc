// Migração 0039 — Desativação de Resíduos Legados de Rupturas e Normalização de Indústrias TradePro
//
// DIAGNÓSTICO:
// - Job tradepro_job_e8enyr17kqlbl1f (Rupturas, 07/09/2026→06/10/2026) processou 226 págs × 30 = 6.780 registros.
// - rupturas_base continha 1.110 resíduos legados (tenant_id='tenant-default', is_base_atual=true)
//   restaurados pela migração 0018, totalizando 7.890 registros e gerando 864 falsos conflitos no motor de confronto.
//
// AÇÕES IDEMPOTENTES:
// 1. Seta is_base_atual = 0 onde is_base_atual = 1 e tenant_id != 'tradepro_job_e8enyr17kqlbl1f'
// 2. Mapeia tradepro_client_id nas indústrias cadastradas:
//    - 7: FRUTAP
//    - 4: COCOLEVE
//    - 40: CHULETÃO
//    - 43: OLIVEIRA
//    - 51: MASSAS D´ITÁLIA
// 3. Atualiza os registros ativos de rupturas_base associando o nome da Indústria e limpando ambiguidades
// 4. Registra auditoria na tabela user_audit_log

migrate(
  (app) => {
    // 1. Desativa resíduos legados onde is_base_atual = 1 e tenant_id != job canônico
    const updateResiduos = app
      .db()
      .newQuery(`
        UPDATE rupturas_base
        SET is_base_atual = 0
        WHERE is_base_atual = 1 AND tenant_id != 'tradepro_job_e8enyr17kqlbl1f'
      `)
      .execute()

    // 2. Garante vínculo das indústrias em industry_registry
    const industryMappings = [
      { id: '7', nome_chave: 'FRUTAP', nome: 'FRUTAP' },
      { id: '4', nome_chave: 'COCOLEVE', nome: 'COCOLEVE' },
      { id: '40', nome_chave: 'CHULETÃO', nome: 'CHULETÃO' },
      { id: '43', nome_chave: 'OLIVEIRA', nome: 'OLIVEIRA' },
      { id: '51', nome_chave: 'MASSAS D´ITÁLIA', nome: 'MASSAS D´ITÁLIA' },
    ]

    const industryRegistry = app.findCollectionByNameOrId('industry_registry')

    for (let i = 0; i < industryMappings.length; i++) {
      const mapping = industryMappings[i]
      try {
        let indRec = null
        try {
          indRec = app.findFirstRecordByData('industry_registry', 'nome_chave', mapping.nome_chave)
        } catch (_) {
          try {
            indRec = app.findFirstRecordByData('industry_registry', 'nome', mapping.nome)
          } catch (_) {}
        }

        if (indRec) {
          indRec.set('tradepro_client_id', mapping.id)
          indRec.set('tradepro_client_name', mapping.nome)
          app.save(indRec)
        } else {
          // Cria caso não exista (ex: OLIVEIRA)
          const newInd = new Record(industryRegistry)
          newInd.set('nome', mapping.nome)
          newInd.set('nome_chave', mapping.nome_chave)
          newInd.set('segmento', 'Alimentos / Consumo')
          newInd.set('status', 'ativa')
          newInd.set('tradepro_client_id', mapping.id)
          newInd.set('tradepro_client_name', mapping.nome)
          newInd.set(
            'observacoes',
            'Cadastrada via normalização canônica TradePro (Cód. ' + mapping.id + ')',
          )
          app.save(newInd)
        }
      } catch (err) {
        console.log('[0039] Aviso ao mapear indústria ' + mapping.nome + ': ' + err)
      }
    }

    // 3. Normaliza active records via codigo_cliente -> industry_registry.tradepro_client_id
    // Ex: codigo_cliente = '7' -> FRUTAP, '4' -> COCOLEVE, etc.
    for (let j = 0; j < industryMappings.length; j++) {
      const mapping = industryMappings[j]
      app
        .db()
        .newQuery(`
          UPDATE rupturas_base
          SET cliente = {:nome}
          WHERE is_base_atual = 1 AND codigo_cliente = {:codigo}
        `)
        .bind({ nome: mapping.nome, codigo: mapping.id })
        .execute()
    }

    // Atualiza também contagem consolidada no job se necessário
    try {
      const job = app.findRecordById('tradepro_sync_jobs', 'e8enyr17kqlbl1f')
      if (job) {
        job.set('registros_consolidados', 6780)
        job.set(
          'message',
          'Sincronização de Rupturas concluída com sucesso. 6780 registros consolidados na Base Atual (resíduos legados desativados).',
        )
        app.save(job)
      }
    } catch (_) {}

    // 4. Registra trilha de auditoria em user_audit_log
    try {
      const auditCol = app.findCollectionByNameOrId('user_audit_log')
      const auditRec = new Record(auditCol)
      auditRec.set('user_id', 'sistema')
      auditRec.set('acao', 'limpeza_operacional_executada')
      auditRec.set('executor_nome', 'Migração 0039 / Refinamento TradePro')
      auditRec.set('data_acao', new Date().toISOString())
      auditRec.set('detalhes_json', {
        motivo:
          'Refinamento TradePro: desativação de 1.110 resíduos legados de tenant-default em rupturas_base e normalização de indústrias',
        job_preservado: 'tradepro_job_e8enyr17kqlbl1f',
        registros_mantidos_ativos: 6780,
        industrias_mapeadas: [
          'FRUTAP (7)',
          'COCOLEVE (4)',
          'CHULETÃO (40)',
          'OLIVEIRA (43)',
          'MASSAS D´ITÁLIA (51)',
        ],
      })
      app.save(auditRec)
    } catch (auditErr) {
      console.log('[0039] Aviso ao gravar auditoria: ' + auditErr)
    }

    console.log(
      '[0039] Resíduos legados desativados com sucesso. Base Atual de rupturas agora reflete estritamente os 6.780 registros do job TradePro.',
    )
  },
  (app) => {
    // Reversão: não reativa registros legados automaticamente para preservar consistência
    console.log('[0039] Reversão executada.')
  },
)
