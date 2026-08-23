migrate(
  (app) => {
    try {
      const rupturasCol = app.findCollectionByNameOrId('rupturas_base')
      const validadesCol = app.findCollectionByNameOrId('validades_base')
      const crossEvidenceCol = app.findCollectionByNameOrId('operational_cross_evidence')

      // Buscar rupturas ativas
      const rupturas = app.findRecordsByFilter(
        'rupturas_base',
        "is_base_atual = true && situacao_atual = 'Ativo'",
        '-data_visita',
        500,
        0,
      )

      // Buscar validades ativas com quantidade > 0
      const validades = app.findRecordsByFilter(
        'validades_base',
        'is_base_atual = true && quantidade > 0',
        '-realizado',
        2000,
        0,
      )

      // Helpers simples no goja
      function norm(s) {
        if (!s) return ''
        return String(s).toLowerCase().trim().replace(/\s+/g, ' ')
      }

      function parseIso(s) {
        if (!s) return null
        var str = String(s).trim()
        var m = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
        if (m) {
          return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10))
        }
        return null
      }

      function extractStoreCode(cod, razao, nome) {
        if (cod && /^\d{1,10}$/.test(String(cod).trim())) return String(cod).trim()
        var r = String(razao || nome || '').trim()
        var m = r.match(/^(\d{1,10})\s*[-•–]/)
        if (m) return m[1].trim()
        return ''
      }

      var validadesByCode = {}
      for (var i = 0; i < validades.length; i++) {
        var val = validades[i]
        var sCode = extractStoreCode(
          val.getString('codigo_loja'),
          val.getString('razao_social'),
          val.getString('nome_loja'),
        )
        if (!sCode) continue
        if (!validadesByCode[sCode]) {
          validadesByCode[sCode] = []
        }
        validadesByCode[sCode].push(val)
      }

      var nowStr = new Date().toISOString()
      var createdCount = 0

      for (var j = 0; j < rupturas.length; j++) {
        var rup = rupturas[j]
        var rupDate = parseIso(rup.getString('data_visita'))
        if (!rupDate) continue

        var rStoreCode = extractStoreCode(
          rup.getString('codigo_loja'),
          rup.getString('nome_loja'),
          '',
        )
        if (!rStoreCode) continue

        var storeVals = validadesByCode[rStoreCode] || []
        var rProdName = norm(rup.getString('produto'))
        var rBrand = norm(rup.getString('cliente'))

        for (var k = 0; k < storeVals.length; k++) {
          var v = storeVals[k]
          var vDate = parseIso(v.getString('realizado'))
          var vExpiry = parseIso(v.getString('validade_efetiva'))
          if (!vDate || !vExpiry) continue

          var qty = v.getInt('quantidade')
          if (qty <= 0) continue

          // Vencido na data da pesquisa
          if (vExpiry.getTime() < vDate.getTime()) continue

          // Validade anterior à ruptura
          if (vDate.getTime() < rupDate.getTime()) continue

          var isSameDay = vDate.getTime() === rupDate.getTime()
          var vProdName = norm(v.getString('produto'))
          var vBrand = norm(v.getString('cliente'))

          var isExact = rProdName && vProdName && rProdName === vProdName
          var isSimilar =
            !isExact &&
            rProdName &&
            vProdName &&
            (rProdName.indexOf(vProdName) !== -1 || vProdName.indexOf(rProdName) !== -1)

          if (!isExact && !isSimilar) continue

          var matchMethod = isExact ? 'medium_exact_name' : 'inconclusive'
          var confidence = isExact ? 'medium' : 'inconclusive'
          var proposedStatus = isExact ? 'awaiting_review' : 'inconclusive'

          if (isSameDay) {
            matchMethod = 'inconclusive'
            confidence = 'inconclusive'
            proposedStatus = 'inconclusive'
          }

          var diffDays = Math.floor((vDate.getTime() - rupDate.getTime()) / 86400000)
          var evidenceKey = rup.id + '|' + v.id

          try {
            var rec = new Record(crossEvidenceCol)
            rec.set('rupture_record_id', rup.id)
            rec.set('validity_record_id', v.id)
            rec.set('store_code', rStoreCode)
            rec.set('store_name', rup.getString('nome_loja'))
            rec.set('store_key', 'store_code:' + rStoreCode)
            rec.set('product_code', v.getString('cod_produto'))
            rec.set('product_name', rup.getString('produto'))
            rec.set('product_key', 'prod_name:' + rProdName)
            rec.set('client_or_brand', rup.getString('cliente') || v.getString('cliente'))
            rec.set('rupture_detected_at', rup.getString('data_visita'))
            rec.set('stock_evidence_at', v.getString('realizado').split('T')[0].split(' ')[0])
            rec.set('quantity_found', qty)
            rec.set(
              'product_expiry_date',
              v.getString('validade_efetiva').split('T')[0].split(' ')[0],
            )
            rec.set('resolution_days', diffDays)
            rec.set('match_method', matchMethod)
            rec.set('confidence', confidence)
            rec.set('proposed_status', proposedStatus)
            rec.set('review_status', 'pending')
            rec.set('engine_version', '1.0.0')
            rec.set('evidence_key', evidenceKey)
            rec.set('created_at', nowStr)
            rec.set('updated_at', nowStr)

            app.save(rec)
            createdCount++
            // Apenas a melhor evidência por ruptura no seed inicial
            break
          } catch (saveErr) {
            // Idempotente se falhar por chave duplicada
          }
        }
      }
    } catch (err) {
      console.log('Erro na população inicial de operational_cross_evidence:', err)
    }
  },
  (app) => {
    try {
      app.db().newQuery('DELETE FROM operational_cross_evidence').execute()
    } catch (_) {}
  },
)
