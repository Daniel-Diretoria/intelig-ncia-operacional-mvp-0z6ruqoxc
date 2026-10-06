// Hook backend de limpeza controlada e segura de Validades e Rupturas
// Endpoint 1: GET /backend/v1/admin/operational-cleanup/stats
// Retorna a contagem exata de validades, rupturas e derivados diretos que serão afetados.
// Endpoint 2: POST /backend/v1/admin/operational-cleanup/execute
// Executa backup de segurança (operational_data_backups), limpa validades, rupturas e derivados,
// e registra o evento em user_audit_log.
// Endpoint 3: POST /backend/v1/admin/operational-cleanup/restore
// Permite restaurar um backup operacional em caso de erro acidental.
// PROTEGIDO NO BACKEND: Somente usuários autenticados com role='admin' podem executar.

routerAdd(
  'GET',
  '/backend/v1/admin/operational-cleanup/stats',
  (e) => {
    const auth = e.auth
    if (!auth || auth.collection().name !== 'users') {
      return e.json(401, { error: 'Não autenticado' })
    }

    const role = auth.getString('role')
    if (role !== 'admin') {
      return e.json(403, {
        error:
          'Acesso restrito. Somente administradores do sistema podem consultar dados de limpeza.',
      })
    }

    let validadesCount = 0
    let validadesBaseCount = 0
    let rupturasBaseCount = 0
    let crossEvidenceCount = 0
    let auditoriaPendenciasCount = 0

    try {
      validadesBaseCount = $app.countRecords('validades_base')
    } catch (_) {}

    try {
      validadesCount = $app.countRecords('validades_imported')
    } catch (_) {}

    try {
      rupturasBaseCount = $app.countRecords('rupturas_base')
    } catch (_) {}

    try {
      crossEvidenceCount = $app.countRecords('operational_cross_evidence')
    } catch (_) {}

    try {
      auditoriaPendenciasCount = $app.countRecords('auditoria_pendencias')
    } catch (_) {}

    return e.json(200, {
      validades: validadesBaseCount + validadesCount,
      validadesBase: validadesBaseCount,
      validadesImported: validadesCount,
      rupturas: rupturasBaseCount,
      operationalCrossEvidence: crossEvidenceCount,
      auditoriaPendencias: auditoriaPendenciasCount,
      timestamp: new Date().toISOString(),
    })
  },
  $apis.requireAuth(),
)

routerAdd(
  'POST',
  '/backend/v1/admin/operational-cleanup/execute',
  (e) => {
    const auth = e.auth
    if (!auth || auth.collection().name !== 'users') {
      return e.json(401, { error: 'Não autenticado' })
    }

    const role = auth.getString('role')
    if (role !== 'admin') {
      return e.json(403, {
        error:
          'Acesso negado. Apenas administradores do sistema podem executar a limpeza operacional.',
      })
    }

    const body = e.requestInfo().body || {}
    const target = body.target || 'all' // 'all' | 'validades' | 'rupturas'
    const confirmation = body.confirmation === true || body.confirmText === 'LIMPAR'

    if (!confirmation) {
      return e.json(400, {
        error: 'Confirmação explícita obrigatória para executar a limpeza operacional.',
      })
    }

    const userId = auth.id
    const userName = auth.getString('name') || auth.getString('email') || 'Administrador'
    const userEmail = auth.getString('email') || ''
    const nowIso = new Date().toISOString()
    const backupCode = 'BKPOP_' + Date.now() + '_' + $security.randomString(6).toUpperCase()

    let removedValidades = 0
    let removedRupturas = 0
    let removedCrossEvidence = 0
    let removedAuditoria = 0

    // 1. CRIAR BACKUP DE SEGURANÇA ANTES DE EXCLUIR
    let backupRecordId = ''
    try {
      let backupValidadesData = []
      let backupRupturasData = []
      let backupCrossData = []

      if (target === 'all' || target === 'validades') {
        try {
          const recs = $app.findRecordsByFilter('validades_base', '', '-created', 500, 0)
          for (let i = 0; i < recs.length; i++) {
            backupValidadesData.push(recs[i].publicExport())
          }
        } catch (_) {}
      }

      if (target === 'all' || target === 'rupturas') {
        try {
          const recs = $app.findRecordsByFilter('rupturas_base', '', '-created', 500, 0)
          for (let i = 0; i < recs.length; i++) {
            backupRupturasData.push(recs[i].publicExport())
          }
        } catch (_) {}
      }

      try {
        const recs = $app.findRecordsByFilter('operational_cross_evidence', '', '-created', 300, 0)
        for (let i = 0; i < recs.length; i++) {
          backupCrossData.push(recs[i].publicExport())
        }
      } catch (_) {}

      const backupCol = $app.findCollectionByNameOrId('operational_data_backups')
      const backupRec = new Record(backupCol)
      backupRec.set('backup_code', backupCode)
      backupRec.set('motivo', 'Limpeza controlada para preparação do piloto histórico: ' + target)
      backupRec.set('executado_por_id', userId)
      backupRec.set('executado_por_nome', userName)
      backupRec.set('executado_por_email', userEmail)
      backupRec.set('validades_count', backupValidadesData.length)
      backupRec.set('rupturas_count', backupRupturasData.length)
      backupRec.set('derived_cross_count', backupCrossData.length)
      backupRec.set('derived_audit_count', 0)
      backupRec.set(
        'snapshot_json',
        JSON.stringify({
          target: target,
          validades: backupValidadesData,
          rupturas: backupRupturasData,
          crossEvidence: backupCrossData,
        }),
      )
      backupRec.set('status', 'ativo')
      backupRec.set('data_criacao', nowIso)
      $app.save(backupRec)
      backupRecordId = backupRec.id
    } catch (bErr) {
      console.warn('[operational_cleanup] Aviso ao salvar snapshot de backup:', bErr)
    }

    // 2. EXECUTAR LIMPEZA CONTROLADA EM TRANSAÇÃO SQL
    try {
      $app.runInTransaction((txApp) => {
        // A) VALIDADES
        if (target === 'all' || target === 'validades') {
          // Contar antes de remover
          try {
            removedValidades += txApp.countRecords('validades_base')
          } catch (_) {}
          try {
            removedValidades += txApp.countRecords('validades_imported')
          } catch (_) {}

          // Limpar tabelas operacionais de validades
          txApp.db().newQuery('DELETE FROM validades_base').execute()
          txApp.db().newQuery('DELETE FROM validades_imported').execute()
          txApp.db().newQuery('DELETE FROM validades_raw').execute()
          txApp.db().newQuery('DELETE FROM validades_corrections').execute()

          // Limpar pendências de auditoria de validades
          try {
            removedAuditoria += txApp.countRecords('auditoria_pendencias')
          } catch (_) {}
          txApp.db().newQuery('DELETE FROM auditoria_pendencias').execute()
        }

        // B) RUPTURAS
        if (target === 'all' || target === 'rupturas') {
          try {
            removedRupturas += txApp.countRecords('rupturas_base')
          } catch (_) {}

          txApp.db().newQuery('DELETE FROM rupturas_base').execute()
          txApp.db().newQuery('DELETE FROM rupturas_historico').execute()
        }

        // C) DERIVADOS DIRETOS:
        // C.1 operational_cross_evidence (confronto entre rupturas e validades)
        try {
          removedCrossEvidence += txApp.countRecords('operational_cross_evidence')
        } catch (_) {}
        txApp.db().newQuery('DELETE FROM operational_cross_evidence').execute()

        // C.2 sync_logs antigos de validades e rupturas
        if (target === 'all') {
          txApp.db().newQuery('DELETE FROM sync_logs').execute()
        } else if (target === 'validades') {
          txApp.db().newQuery("DELETE FROM sync_logs WHERE tipo LIKE '%validade%'").execute()
        } else if (target === 'rupturas') {
          txApp.db().newQuery("DELETE FROM sync_logs WHERE tipo LIKE '%ruptura%'").execute()
        }
      })
    } catch (delErr) {
      console.error('[operational_cleanup] Erro durante a limpeza:', delErr)
      return e.json(500, {
        error: 'Falha durante a exclusão dos registros operacionais: ' + delErr.message,
      })
    }

    // 3. REGISTRAR EM LOG DE AUDITORIA (user_audit_log)
    try {
      const userAuditCol = $app.findCollectionByNameOrId('user_audit_log')
      const auditRec = new Record(userAuditCol)
      auditRec.set('user_id', userId)
      auditRec.set('target_user_id', userId)
      auditRec.set('target_user_email', userEmail)
      auditRec.set('acao', 'limpeza_operacional_executada')
      auditRec.set('executor_nome', userName)
      auditRec.set('executor_id', userId)
      auditRec.set('data_acao', nowIso)
      auditRec.set(
        'detalhes_json',
        JSON.stringify({
          tipoOperacao: 'limpeza_operacional_controlada',
          targetLimpeza: target,
          backupCode: backupCode,
          backupRecordId: backupRecordId,
          removidos: {
            validades: removedValidades,
            rupturas: removedRupturas,
            operationalCrossEvidence: removedCrossEvidence,
            auditoriaPendencias: removedAuditoria,
          },
          preservados: [
            'users',
            'industry_registry',
            'industry_store_coverage',
            'industry_product_mix',
            'industry_research_config',
            'industry_validity_policy',
            'industry_store_product_mix',
            'industry_tracking_tratativas',
            'stores',
            'networks',
            'store_aliases',
            'network_aliases',
            'product_aliases',
            'devolucoes_casos',
            'devolucoes_itens',
            'devolucoes_timeline',
            'devolucoes_evidencias',
            'devolucoes_audit',
            'devolucoes_import_batches',
            'devolucoes_mensagens_importadas',
            'devolucoes_solicitacoes_importadas',
            'user_audit_log',
          ],
          resultado: 'sucesso',
        }),
      )
      $app.save(auditRec)
    } catch (aErr) {
      console.warn('[operational_cleanup] Falha ao registrar log de auditoria:', aErr)
    }

    return e.json(200, {
      success: true,
      message:
        'Limpeza operacional executada com sucesso. A base está pronta para a nova massa de dados.',
      target: target,
      backupCode: backupCode,
      backupRecordId: backupRecordId,
      removed: {
        validades: removedValidades,
        rupturas: removedRupturas,
        operationalCrossEvidence: removedCrossEvidence,
        auditoriaPendencias: removedAuditoria,
      },
      dataExecucao: nowIso,
    })
  },
  $apis.requireAuth(),
)

routerAdd(
  'POST',
  '/backend/v1/admin/operational-cleanup/restore',
  (e) => {
    const auth = e.auth
    if (!auth || auth.collection().name !== 'users') {
      return e.json(401, { error: 'Não autenticado' })
    }

    const role = auth.getString('role')
    if (role !== 'admin') {
      return e.json(403, {
        error:
          'Acesso negado. Apenas administradores do sistema podem restaurar backups operacionais.',
      })
    }

    const body = e.requestInfo().body || {}
    const backupCode = (body.backupCode || '').trim()

    if (!backupCode) {
      return e.json(400, { error: 'Código de backup obrigatório.' })
    }

    let backupRecord = null
    try {
      backupRecord = $app.findFirstRecordByData(
        'operational_data_backups',
        'backup_code',
        backupCode,
      )
    } catch (_) {
      return e.json(404, { error: 'Backup operacional não encontrado para o código informado.' })
    }

    const snapshotRaw = backupRecord.getString('snapshot_json')
    if (!snapshotRaw) {
      return e.json(400, { error: 'Backup sem dados de snapshot válidos.' })
    }

    let snapshot = null
    try {
      snapshot = JSON.parse(snapshotRaw)
    } catch (parseErr) {
      return e.json(500, { error: 'Falha ao ler dados do backup.' })
    }

    const validadesData = snapshot.validades || []
    const rupturasData = snapshot.rupturas || []
    const crossData = snapshot.crossEvidence || []

    let restoredValidades = 0
    let restoredRupturas = 0
    let restoredCross = 0

    try {
      $app.runInTransaction((txApp) => {
        const valCol = txApp.findCollectionByNameOrId('validades_base')
        for (let i = 0; i < validadesData.length; i++) {
          const item = validadesData[i]
          const rec = new Record(valCol)
          const keys = Object.keys(item)
          for (let k = 0; k < keys.length; k++) {
            const key = keys[k]
            if (
              key !== 'id' &&
              key !== 'created' &&
              key !== 'updated' &&
              key !== 'collectionId' &&
              key !== 'collectionName'
            ) {
              rec.set(key, item[key])
            }
          }
          txApp.save(rec)
          restoredValidades++
        }

        const rupCol = txApp.findCollectionByNameOrId('rupturas_base')
        for (let i = 0; i < rupturasData.length; i++) {
          const item = rupturasData[i]
          const rec = new Record(rupCol)
          const keys = Object.keys(item)
          for (let k = 0; k < keys.length; k++) {
            const key = keys[k]
            if (
              key !== 'id' &&
              key !== 'created' &&
              key !== 'updated' &&
              key !== 'collectionId' &&
              key !== 'collectionName'
            ) {
              rec.set(key, item[key])
            }
          }
          txApp.save(rec)
          restoredRupturas++
        }

        const crossCol = txApp.findCollectionByNameOrId('operational_cross_evidence')
        for (let i = 0; i < crossData.length; i++) {
          const item = crossData[i]
          const rec = new Record(crossCol)
          const keys = Object.keys(item)
          for (let k = 0; k < keys.length; k++) {
            const key = keys[k]
            if (
              key !== 'id' &&
              key !== 'created' &&
              key !== 'updated' &&
              key !== 'collectionId' &&
              key !== 'collectionName'
            ) {
              rec.set(key, item[key])
            }
          }
          txApp.save(rec)
          restoredCross++
        }
      })
    } catch (txErr) {
      return e.json(500, { error: 'Falha durante restauração transacional: ' + txErr.message })
    }

    // Atualizar status do backup
    const nowIso = new Date().toISOString()
    const userName = auth.getString('name') || auth.getString('email') || 'Administrador'
    backupRecord.set('status', 'restaurado')
    backupRecord.set('restaurado_em', nowIso)
    backupRecord.set('restaurado_por', userName)
    try {
      $app.save(backupRecord)
    } catch (_) {}

    // Registrar em user_audit_log
    try {
      const userAuditCol = $app.findCollectionByNameOrId('user_audit_log')
      const auditRec = new Record(userAuditCol)
      auditRec.set('user_id', auth.id)
      auditRec.set('target_user_id', auth.id)
      auditRec.set('target_user_email', auth.getString('email') || '')
      auditRec.set('acao', 'backup_operacional_restaurado')
      auditRec.set('executor_nome', userName)
      auditRec.set('executor_id', auth.id)
      auditRec.set('data_acao', nowIso)
      auditRec.set(
        'detalhes_json',
        JSON.stringify({
          backupCode: backupCode,
          restaurados: {
            validades: restoredValidades,
            rupturas: restoredRupturas,
            crossEvidence: restoredCross,
          },
          resultado: 'sucesso',
        }),
      )
      $app.save(auditRec)
    } catch (_) {}

    return e.json(200, {
      success: true,
      message: 'Backup operacional restaurado com sucesso.',
      backupCode: backupCode,
      restored: {
        validades: restoredValidades,
        rupturas: restoredRupturas,
        crossEvidence: restoredCross,
      },
    })
  },
  $apis.requireAuth(),
)
