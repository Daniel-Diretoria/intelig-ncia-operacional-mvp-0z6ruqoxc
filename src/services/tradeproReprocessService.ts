import pb from '@/lib/pocketbase/client'

export interface ReprocessResult {
  totalAvaliados: number
  reprocessadosComSucesso: number
  industriasResolvidas: number
  lojasResolvidas: number
  promotoresResolvidos: number
  supervisoresResolvidos: number
  produtosResolvidos: number
  pendentes: number
  erros: number
}

/**
 * Reprocessa localmente registros de Rupturas a partir de seus payloads brutos (dados_brutos_json),
 * sem fazer nenhuma nova chamada à API TradePro.
 * Permite que cadastros recentemente homologados resolvam eventos que antes estavam parciais ou pendentes.
 */
export async function reprocessarRupturasLocal(limit = 100): Promise<ReprocessResult> {
  const result: ReprocessResult = {
    totalAvaliados: 0,
    reprocessadosComSucesso: 0,
    industriasResolvidas: 0,
    lojasResolvidas: 0,
    promotoresResolvidos: 0,
    supervisoresResolvidos: 0,
    produtosResolvidos: 0,
    pendentes: 0,
    erros: 0,
  }

  try {
    // 1. Carrega cadastros mestres
    const industries = await pb.collection('industry_registry').getFullList({ sort: 'nome' })
    const stores = await pb.collection('stores').getFullList({ sort: 'nome' })
    const promoters = await pb.collection('promoters').getFullList({ sort: 'nome' })

    const indMapByClient = new Map<string, { id: string; nome: string }>()
    industries.forEach((ind) => {
      const tId = String((ind as Record<string, unknown>).tradepro_client_id || '').trim()
      if (tId)
        indMapByClient.set(tId, { id: ind.id, nome: String((ind as Record<string, unknown>).nome) })
    })

    const storeMapByCode = new Map<string, string>()
    stores.forEach((st) => {
      const rec = st as Record<string, unknown>
      const c1 = String(rec.codigo_loja || '').trim()
      const c2 = String(rec.codigo_externo || '').trim()
      if (c1) storeMapByCode.set(c1, st.id)
      if (c2) storeMapByCode.set(c2, st.id)
    })

    const promoterMapByCod = new Map<string, string>()
    promoters.forEach((p) => {
      const rec = p as Record<string, unknown>
      const cod = String(rec.codigo_externo || '').trim()
      if (cod) promoterMapByCod.set(cod, p.id)
    })

    // 2. Busca rupturas que possuam dados_brutos_json ou tenant_id de job
    const records = await pb.collection('rupturas_base').getList(1, limit, {
      filter: 'is_base_atual = true',
      sort: '-created',
    })

    result.totalAvaliados = records.items.length

    for (const item of records.items) {
      try {
        const rawJson = (item as Record<string, unknown>).dados_brutos_json as Record<
          string,
          unknown
        > | null
        const codCliente = String(
          (rawJson && rawJson.codigoCliente) ||
            (item as Record<string, unknown>).codigo_cliente ||
            '',
        ).trim()
        const codLoja = String((item as Record<string, unknown>).codigo_loja || '').trim()
        const idPromotor = String(
          (rawJson && rawJson.idPromotor) || (item as Record<string, unknown>).id_promotor || '',
        ).trim()
        const idSupervisor = String(
          (rawJson && rawJson.idSupervisor) ||
            (item as Record<string, unknown>).id_supervisor ||
            '',
        ).trim()
        const produtoNome = String((item as Record<string, unknown>).produto || '').trim()

        let resolvedIndId = ''
        let resolvedIndNome = ''
        if (codCliente && indMapByClient.has(codCliente)) {
          const found = indMapByClient.get(codCliente)!
          resolvedIndId = found.id
          resolvedIndNome = found.nome
          result.industriasResolvidas++
        }

        let storeId = ''
        if (codLoja && storeMapByCode.has(codLoja)) {
          storeId = storeMapByCode.get(codLoja)!
          result.lojasResolvidas++
        }

        let promoterId = ''
        if (idPromotor && promoterMapByCod.has(idPromotor)) {
          promoterId = promoterMapByCod.get(idPromotor)!
          result.promotoresResolvidos++
        }

        if (idSupervisor) {
          result.supervisoresResolvidos++
        }

        let productResolved = false
        if (resolvedIndId && produtoNome) {
          try {
            const mixItems = await pb.collection('industry_product_mix').getList(1, 1, {
              filter: `industry_id = "${resolvedIndId}" && nome_produto = "${produtoNome.replace(/"/g, '\\"')}"`,
            })
            if (mixItems.items.length > 0) {
              productResolved = true
              result.produtosResolvidos++
            }
          } catch {
            /* intentionally ignored */
          }
        }

        const isComplete = Boolean(
          resolvedIndId && storeId && (idPromotor ? promoterId : true) && productResolved,
        )
        const statusNorm = isComplete ? 'completo' : 'parcial'

        const patch: Record<string, unknown> = {
          status_normalizacao: statusNorm,
        }
        if (resolvedIndId) {
          patch.industry_id = resolvedIndId
          patch.cliente = resolvedIndNome
        }
        if (storeId) {
          patch.store_id = storeId
        }

        await pb.collection('rupturas_base').update(item.id, patch)
        result.reprocessadosComSucesso++
      } catch (err) {
        result.erros++
      }
    }
  } catch (err) {
    result.erros++
  }

  return result
}

/**
 * Reprocessa localmente registros de Validades a partir de seus payloads brutos (dados_brutos_json),
 * sem fazer nenhuma nova chamada à API TradePro.
 */
export async function reprocessarValidadesLocal(limit = 100): Promise<ReprocessResult> {
  const result: ReprocessResult = {
    totalAvaliados: 0,
    reprocessadosComSucesso: 0,
    industriasResolvidas: 0,
    lojasResolvidas: 0,
    promotoresResolvidos: 0,
    supervisoresResolvidos: 0,
    produtosResolvidos: 0,
    pendentes: 0,
    erros: 0,
  }

  try {
    const industries = await pb.collection('industry_registry').getFullList({ sort: 'nome' })
    const stores = await pb.collection('stores').getFullList({ sort: 'nome' })
    const promoters = await pb.collection('promoters').getFullList({ sort: 'nome' })

    const indMapByClient = new Map<string, { id: string; nome: string }>()
    industries.forEach((ind) => {
      const tId = String((ind as Record<string, unknown>).tradepro_client_id || '').trim()
      if (tId)
        indMapByClient.set(tId, { id: ind.id, nome: String((ind as Record<string, unknown>).nome) })
    })

    const storeMapByCode = new Map<string, string>()
    stores.forEach((st) => {
      const rec = st as Record<string, unknown>
      const c1 = String(rec.codigo_loja || '').trim()
      const c2 = String(rec.codigo_externo || '').trim()
      if (c1) storeMapByCode.set(c1, st.id)
      if (c2) storeMapByCode.set(c2, st.id)
    })

    const promoterMapByCod = new Map<string, string>()
    promoters.forEach((p) => {
      const rec = p as Record<string, unknown>
      const cod = String(rec.codigo_externo || '').trim()
      if (cod) promoterMapByCod.set(cod, p.id)
    })

    const records = await pb.collection('validades_base').getList(1, limit, {
      filter: 'is_base_atual = true',
      sort: '-created',
    })

    result.totalAvaliados = records.items.length

    for (const item of records.items) {
      try {
        const rawJson = (item as Record<string, unknown>).dados_brutos_json as Record<
          string,
          unknown
        > | null
        const codCliente = String(
          (rawJson && rawJson.codCliente) || (item as Record<string, unknown>).cod_cliente || '',
        ).trim()
        const codLoja = String((item as Record<string, unknown>).codigo_loja || '').trim()
        const codColab = String((item as Record<string, unknown>).cod_colaborador || '').trim()
        const codProd = String((item as Record<string, unknown>).cod_produto || '').trim()
        const produtoNome = String((item as Record<string, unknown>).produto || '').trim()
        const idSupervisor = String(
          (rawJson && rawJson.idSupervisor) ||
            (item as Record<string, unknown>).id_supervisor ||
            '',
        ).trim()

        let resolvedIndId = ''
        let resolvedIndNome = ''
        if (codCliente && indMapByClient.has(codCliente)) {
          const found = indMapByClient.get(codCliente)!
          resolvedIndId = found.id
          resolvedIndNome = found.nome
          result.industriasResolvidas++
        }

        let storeId = ''
        if (codLoja && storeMapByCode.has(codLoja)) {
          storeId = storeMapByCode.get(codLoja)!
          result.lojasResolvidas++
        }

        let promoterId = ''
        if (codColab && promoterMapByCod.has(codColab)) {
          promoterId = promoterMapByCod.get(codColab)!
          result.promotoresResolvidos++
        }

        if (idSupervisor) {
          result.supervisoresResolvidos++
        }

        let productResolved = false
        if (resolvedIndId) {
          try {
            if (codProd) {
              const pByCode = await pb.collection('industry_product_mix').getList(1, 1, {
                filter: `industry_id = "${resolvedIndId}" && codigo_produto = "${codProd.replace(/"/g, '\\"')}"`,
              })
              if (pByCode.items.length > 0) productResolved = true
            }
            if (!productResolved && produtoNome) {
              const pByName = await pb.collection('industry_product_mix').getList(1, 1, {
                filter: `industry_id = "${resolvedIndId}" && nome_produto = "${produtoNome.replace(/"/g, '\\"')}"`,
              })
              if (pByName.items.length > 0) productResolved = true
            }
            if (productResolved) result.produtosResolvidos++
          } catch {
            /* intentionally ignored */
          }
        }

        const isComplete = Boolean(
          resolvedIndId && storeId && (codColab ? promoterId : true) && productResolved,
        )
        const statusNorm = isComplete ? 'completo' : 'parcial'

        const patch: Record<string, unknown> = {
          status_normalizacao: statusNorm,
        }
        if (resolvedIndId) {
          patch.industry_id = resolvedIndId
          patch.cliente = resolvedIndNome
        }
        if (storeId) {
          patch.store_id = storeId
        }

        await pb.collection('validades_base').update(item.id, patch)
        result.reprocessadosComSucesso++
      } catch (err) {
        result.erros++
      }
    }
  } catch (err) {
    result.erros++
  }

  return result
}
