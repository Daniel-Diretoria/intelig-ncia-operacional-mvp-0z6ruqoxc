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
 *
 * REGRAS MANDATÓRIAS:
 * - TradePro-only: processa SOMENTE registros com source_type = 'tradepro_api' (NUNCA Excel).
 * - Semântica de Rupturas: codigoCliente de Ruptura é Loja, NUNCA Indústria!
 *   codigoCliente de Ruptura NUNCA resolve Indústria nem busca industry_registry.
 *   Indústria em Rupturas só é resolvida via Produto Mestre (industry_product_mix).
 * - Persistência das relações mestres: grava product_id, promoter_id, supervisor_id no registro.
 * - status_normalizacao = 'completo' SOMENTE quando relações obrigatórias estão gravadas no registro.
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
    const stores = await pb.collection('stores').getFullList({ sort: 'nome' })
    const promoters = await pb.collection('promoters').getFullList({ sort: 'nome' })
    const supervisors = await pb.collection('supervisors').getFullList({ sort: 'nome' })

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

    const supervisorMapByCod = new Map<string, string>()
    supervisors.forEach((s) => {
      const rec = s as Record<string, unknown>
      const cod = String(rec.codigo_externo || '').trim()
      if (cod) supervisorMapByCod.set(cod, s.id)
    })

    // 2. Busca rupturas estritamente com source_type='tradepro_api' (NUNCA Excel)
    const records = await pb.collection('rupturas_base').getList(1, limit, {
      filter: 'is_base_atual = true && source_type = "tradepro_api"',
      sort: '-created',
    })

    result.totalAvaliados = records.items.length

    for (const item of records.items) {
      try {
        const rawJson = (item as Record<string, unknown>).dados_brutos_json as Record<
          string,
          unknown
        > | null

        // Semântica confirmada:
        // Em Rupturas TradePro, codigoCliente é o código da LOJA (ex: "165").
        // NUNCA usar codigoCliente para resolver Indústria!
        const rawRazaoSocial = String(
          (rawJson && (rawJson.razaoSocialCliente || rawJson.nome_loja)) ||
            (item as Record<string, unknown>).razao_social ||
            (item as Record<string, unknown>).nome_loja ||
            '',
        ).trim()

        const rawCodigoLoja = String(
          (rawJson && (rawJson.codigoCliente || rawJson.codigo_cliente)) ||
            (item as Record<string, unknown>).codigo_loja ||
            '',
        ).trim()

        // Helper para extrair código numérico ou de prefixo da Razão Social se necessário
        let codLoja = rawCodigoLoja
        if (!codLoja && rawRazaoSocial) {
          const m = rawRazaoSocial.match(/^(\d+)/)
          if (m) codLoja = m[1]
        }

        const idPromotor = String(
          (rawJson && rawJson.idPromotor) || (item as Record<string, unknown>).id_promotor || '',
        ).trim()
        const idSupervisor = String(
          (rawJson && rawJson.idSupervisor) ||
            (item as Record<string, unknown>).id_supervisor ||
            '',
        ).trim()
        const produtoNome = String(
          (rawJson && (rawJson.descricaoAtividade || rawJson.produto)) ||
            (item as Record<string, unknown>).produto ||
            '',
        ).trim()

        // Resolução de Loja mestre
        let storeId = ''
        if (codLoja && storeMapByCode.has(codLoja)) {
          storeId = storeMapByCode.get(codLoja)!
          result.lojasResolvidas++
        }

        // Resolução de Promotor mestre
        let promoterId = ''
        if (idPromotor && promoterMapByCod.has(idPromotor)) {
          promoterId = promoterMapByCod.get(idPromotor)!
          result.promotoresResolvidos++
        }

        // Resolução de Supervisor mestre
        let supervisorId = ''
        if (idSupervisor && supervisorMapByCod.has(idSupervisor)) {
          supervisorId = supervisorMapByCod.get(idSupervisor)!
          result.supervisoresResolvidos++
        }

        // Resolução de Produto mestre e Indústria:
        // Em Rupturas da API TradePro:
        // 1. Loja é SEMPRE Loja (codigoCliente = Loja, Razao Social = Loja).
        // 2. Indústria NUNCA vem de Fornecedor, Razão Social ou Fantasia.
        // 3. Indústria SÓ pode ser resolvida pelo Produto Mestre (industry_product_mix)
        //    se o Produto pertencer EXCLUSIVAMENTE a uma única Indústria.
        //    Se houver mais de uma indústria no mix com este produto, NÃO escolher automaticamente.
        let productId = ''
        let resolvedIndId = ''
        let resolvedIndNome = ''

        if (produtoNome) {
          try {
            const filterMix = `nome_produto = "${produtoNome.replace(/"/g, '\\"')}"`
            const mixItems = await pb.collection('industry_product_mix').getList(1, 50, {
              filter: filterMix,
            })

            if (mixItems.items.length > 0) {
              productId = mixItems.items[0].id
              result.produtosResolvidos++

              // Agrupa indústrias únicas associadas ao produto
              const distinctIndMap = new Map<string, string>()
              for (const mixItem of mixItems.items) {
                const pIndId = String((mixItem as Record<string, unknown>).industry_id || '').trim()
                const pIndName = String(
                  (mixItem as Record<string, unknown>).industry_name || '',
                ).trim()
                if (pIndId) {
                  distinctIndMap.set(pIndId, pIndName)
                }
              }

              if (distinctIndMap.size === 1) {
                const [onlyIndId, onlyIndName] = Array.from(distinctIndMap.entries())[0]
                resolvedIndId = onlyIndId
                resolvedIndNome = onlyIndName
                result.industriasResolvidas++
              } else {
                // Mais de uma indústria ou nenhuma: NÃO escolher automaticamente
                resolvedIndId = ''
                resolvedIndNome = ''
              }
            }
          } catch {
            /* intentionally ignored */
          }
        }

        // status_normalizacao='completo' SOMENTE quando as relações obrigatórias estão realmente resolvidas
        // para persistência: product_id E store_id (e se houver promotor/supervisor externo, estes também resolvidos)
        const hasPromoterRequirement = Boolean(idPromotor)
        const hasSupervisorRequirement = Boolean(idSupervisor)

        const isComplete = Boolean(
          storeId &&
          productId &&
          resolvedIndId &&
          (!hasPromoterRequirement || promoterId) &&
          (!hasSupervisorRequirement || supervisorId),
        )

        const statusNorm = isComplete ? 'completo' : 'parcial'

        const patch: Record<string, unknown> = {
          status_normalizacao: statusNorm,
        }

        if (storeId) {
          patch.store_id = storeId
        }
        if (productId) {
          patch.product_id = productId
        }
        if (promoterId) {
          patch.promoter_id = promoterId
        }
        if (supervisorId) {
          patch.supervisor_id = supervisorId
        }
        if (resolvedIndId) {
          patch.industry_id = resolvedIndId
          patch.cliente = resolvedIndNome
        } else {
          // Se não há vínculo estrutural seguro e exclusivo de indústria, não adivinhar:
          // Indústria fica como "Não identificada"
          patch.industry_id = ''
          patch.cliente = 'Não identificada'
        }

        await pb.collection('rupturas_base').update(item.id, patch)
        result.reprocessadosComSucesso++
      } catch {
        result.erros++
      }
    }
  } catch {
    result.erros++
  }

  return result
}

/**
 * Reprocessa localmente registros de Validades a partir de seus payloads brutos (dados_brutos_json),
 * sem fazer nenhuma nova chamada à API TradePro.
 *
 * REGRAS MANDATÓRIAS:
 * - TradePro-only: processa SOMENTE registros com source_type = 'tradepro_api' (NUNCA Excel).
 * - Semântica de Validades: codCliente no payload/registro representa a Indústria (tradepro_client_id);
 *   cliente.codigo ou codigo_loja representa a LOJA.
 * - Persistência das relações mestres: grava product_id, promoter_id, supervisor_id no registro.
 * - status_normalizacao = 'completo' SOMENTE quando relações obrigatórias estão gravadas no registro.
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
    const supervisors = await pb.collection('supervisors').getFullList({ sort: 'nome' })

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

    const supervisorMapByCod = new Map<string, string>()
    supervisors.forEach((s) => {
      const rec = s as Record<string, unknown>
      const cod = String(rec.codigo_externo || '').trim()
      if (cod) supervisorMapByCod.set(cod, s.id)
    })

    // Busca validades estritamente com source_type='tradepro_api' (NUNCA Excel)
    const records = await pb.collection('validades_base').getList(1, limit, {
      filter: 'is_base_atual = true && source_type = "tradepro_api"',
      sort: '-created',
    })

    result.totalAvaliados = records.items.length

    for (const item of records.items) {
      try {
        const rawJson = (item as Record<string, unknown>).dados_brutos_json as Record<
          string,
          unknown
        > | null

        // Em Validades, codCliente raiz do item representa a Indústria (se presente)
        const codCliente = String(
          (rawJson && (rawJson.codCliente || rawJson.cod_cliente || rawJson.codigoCliente)) ||
            (item as Record<string, unknown>).cod_cliente ||
            '',
        ).trim()

        // Código da Loja vem de cliente.codigo ou de codigo_loja
        const rawClienteObj = (rawJson && (rawJson.cliente as Record<string, unknown>)) || null
        const codLojaUnidade = String(
          (rawClienteObj && (rawClienteObj.codigo || rawClienteObj.codigoCliente)) ||
            (item as Record<string, unknown>).codigo_loja ||
            '',
        ).trim()

        const rawPromotorObj = (rawJson && (rawJson.promotor as Record<string, unknown>)) || null
        const codColab = String(
          (rawPromotorObj && rawPromotorObj.id) ||
            (rawJson && (rawJson.idPromotor || rawJson.cod_colaborador)) ||
            (item as Record<string, unknown>).cod_colaborador ||
            '',
        ).trim()

        const rawProdutoObj = (rawJson && (rawJson.produto as Record<string, unknown>)) || null
        const codProd = String(
          (rawProdutoObj && rawProdutoObj.codigo) ||
            (rawJson && rawJson.codigoProduto) ||
            (item as Record<string, unknown>).cod_produto ||
            '',
        ).trim()
        const produtoNome = String(
          (rawProdutoObj && rawProdutoObj.descricao) ||
            (rawJson && (rawJson.descricao || rawJson.produto)) ||
            (item as Record<string, unknown>).produto ||
            '',
        ).trim()

        const idSupervisor = String(
          (rawJson && (rawJson.idSupervisor || rawJson.cod_supervisor)) ||
            (rawPromotorObj && rawPromotorObj.idSupervisor) ||
            (item as Record<string, unknown>).id_supervisor ||
            (item as Record<string, unknown>).cod_supervisor ||
            '',
        ).trim()

        let resolvedIndId = String((item as Record<string, unknown>).industry_id || '').trim()
        let resolvedIndNome = String((item as Record<string, unknown>).cliente || '').trim()

        if (codCliente && indMapByClient.has(codCliente)) {
          const found = indMapByClient.get(codCliente)!
          resolvedIndId = found.id
          resolvedIndNome = found.nome
          result.industriasResolvidas++
        }

        let storeId = ''
        if (codLojaUnidade && storeMapByCode.has(codLojaUnidade)) {
          storeId = storeMapByCode.get(codLojaUnidade)!
          result.lojasResolvidas++
        }

        let promoterId = ''
        if (codColab && promoterMapByCod.has(codColab)) {
          promoterId = promoterMapByCod.get(codColab)!
          result.promotoresResolvidos++
        }

        let supervisorId = ''
        if (idSupervisor && supervisorMapByCod.has(idSupervisor)) {
          supervisorId = supervisorMapByCod.get(idSupervisor)!
          result.supervisoresResolvidos++
        }

        let productId = ''
        if (resolvedIndId) {
          try {
            if (codProd) {
              const pByCode = await pb.collection('industry_product_mix').getList(1, 1, {
                filter: `industry_id = "${resolvedIndId}" && codigo_produto = "${codProd.replace(/"/g, '\\"')}"`,
              })
              if (pByCode.items.length > 0) {
                productId = pByCode.items[0].id
                result.produtosResolvidos++
              }
            }
            if (!productId && produtoNome) {
              const pByName = await pb.collection('industry_product_mix').getList(1, 1, {
                filter: `industry_id = "${resolvedIndId}" && nome_produto = "${produtoNome.replace(/"/g, '\\"')}"`,
              })
              if (pByName.items.length > 0) {
                productId = pByName.items[0].id
                result.produtosResolvidos++
              }
            }
          } catch {
            /* intentionally ignored */
          }
        }

        const hasPromoterRequirement = Boolean(codColab)
        const hasSupervisorRequirement = Boolean(idSupervisor)

        const isComplete = Boolean(
          storeId &&
          productId &&
          resolvedIndId &&
          (!hasPromoterRequirement || promoterId) &&
          (!hasSupervisorRequirement || supervisorId),
        )

        const statusNorm = isComplete ? 'completo' : 'parcial'

        const patch: Record<string, unknown> = {
          status_normalizacao: statusNorm,
        }

        if (storeId) {
          patch.store_id = storeId
        }
        if (productId) {
          patch.product_id = productId
        }
        if (promoterId) {
          patch.promoter_id = promoterId
        }
        if (supervisorId) {
          patch.supervisor_id = supervisorId
        }
        if (resolvedIndId) {
          patch.industry_id = resolvedIndId
          patch.cliente = resolvedIndNome
        } else {
          patch.industry_id = ''
          patch.cliente = 'Não identificada'
        }

        await pb.collection('validades_base').update(item.id, patch)
        result.reprocessadosComSucesso++
      } catch {
        result.erros++
      }
    }
  } catch {
    result.erros++
  }

  return result
}
