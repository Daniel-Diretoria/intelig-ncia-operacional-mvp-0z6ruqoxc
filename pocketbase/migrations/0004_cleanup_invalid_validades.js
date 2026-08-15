// Limpa registros inválidos (sem dados reais) das collections
// `validades_base` e `validades_raw`, originados do bug de descasamento
// camelCase ↔ snake_case entre frontend e o hook process_validades.
//
// Critério: registros em validades_base cujo `chave_operacional` está vazio
// (todos os campos críticos chegavam como undefined e eram salvos vazios).
// Também remove os validades_raw vinculados aos import_history cujo
// validades_base correspondente ficou vazio, e marca esses import_history
// como failed para que possam ser reimportados.

migrate(
  (app) => {
    // 1. Remove validades_base sem chave_operacional (registros sem dados reais).
    let removedBase = 0
    try {
      const invalidBase = app.findRecordsByFilter(
        'validades_base',
        "chave_operacional = ''",
        '',
        0,
        0,
      )
      if (invalidBase && invalidBase.length > 0) {
        for (let i = 0; i < invalidBase.length; i++) {
          try {
            app.delete(invalidBase[i])
            removedBase++
          } catch (_) {}
        }
      }
    } catch (_) {}

    // 2. Remove validades_raw sem dados reais (sem fornecedor E sem razao_social).
    let removedRaw = 0
    try {
      const invalidRaw = app.findRecordsByFilter(
        'validades_raw',
        "fornecedor = '' && razao_social = ''",
        '',
        0,
        0,
      )
      if (invalidRaw && invalidRaw.length > 0) {
        for (let i = 0; i < invalidRaw.length; i++) {
          try {
            app.delete(invalidRaw[i])
            removedRaw++
          } catch (_) {}
        }
      }
    } catch (_) {}

    // 3. Marca import_history órfãos (sem validades_base nem validades_raw)
    //    como 'failed' para permitir reimportação sem bloqueio de duplicidade.
    let updatedHistory = 0
    try {
      const allHistory = app.findRecordsByFilter(
        'import_history',
        "status = 'completed' && source = 'tradepro'",
        '-created',
        0,
        0,
      )
      if (allHistory && allHistory.length > 0) {
        for (let i = 0; i < allHistory.length; i++) {
          const h = allHistory[i]
          const hid = h.id
          let baseCount = 0
          let rawCount = 0
          try {
            const b = app.findRecordsByFilter('validades_base', 'import_id = {:i}', '', 1, 0, {
              i: hid,
            })
            baseCount = b ? b.length : 0
          } catch (_) {}
          try {
            const rw = app.findRecordsByFilter('validades_raw', 'import_id = {:i}', '', 1, 0, {
              i: hid,
            })
            rawCount = rw ? rw.length : 0
          } catch (_) {}
          if (baseCount === 0 && rawCount === 0) {
            try {
              h.set('status', 'failed')
              app.save(h)
              updatedHistory++
            } catch (_) {}
          }
        }
      }
    } catch (_) {}

    console.log(
      '[0004_cleanup_invalid_validades] removedBase=' +
        removedBase +
        ' removedRaw=' +
        removedRaw +
        ' updatedHistory=' +
        updatedHistory,
    )
  },
  (app) => {
    // Irreversível — os registros removidos eram inválidos (sem dados reais).
  },
)
