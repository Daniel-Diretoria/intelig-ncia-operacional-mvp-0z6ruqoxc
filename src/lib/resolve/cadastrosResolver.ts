/**
 * Resolver de Entidades de Cadastros do SKIP
 *
 * Princípios do usuário:
 * - Cód. Cliente -> procurar Indústria (via industry_registry tradepro_client_id)
 * - Fantasia -> procurar Rede
 * - Razão Social -> procurar Loja
 * - Cód. Colaborador -> procurar Promotor
 * - Cód. Supervisor -> procurar Supervisor
 * - Cód. Produto / Produto -> procurar Produto (considerando o contexto Indústria + Cód. Produto)
 * - Quando encontrar vínculo seguro: relacionar.
 * - Quando não encontrar: NÃO inventar. Criar pendência de cadastro/vinculação.
 * - Não assumir que um Cód. Produto isolado seja único: considerar Indústria + Cód. Produto.
 * - Resolvedor de Produtos: mão dupla (informal -> resolvido -> oficial -> indústria; e indústria reduz universo).
 */

import pb from '@/lib/pocketbase/client'
import type {
  CadastroIndustria,
  CadastroProduto,
  CadastroRede,
  CadastroLoja,
  CadastroSupervisor,
  CadastroPromotor,
  CadastroPendencia,
} from '@/types/cadastros'
import { normalizarNomeProduto, extrairTokensRelevantes } from '@/lib/resolve/produtoResolver'
import { createCadastroPendencia } from '@/services/cadastrosService'

export interface EntityResolutionContext {
  origemFonte: string
  rawCodigoCliente?: string
  rawClienteNome?: string
  rawFantasia?: string
  rawRazaoSocial?: string
  rawCodigoLoja?: string
  rawProdutoNome?: string
  rawCodigoProduto?: string
  rawCodColaborador?: string
  rawColaboradorNome?: string
  rawCodSupervisor?: string
  rawSupervisorNome?: string
}

export interface EntityResolutionResult {
  // Indústria
  industryId?: string
  industryName?: string
  industryStatus: 'resolvido' | 'pendente' | 'nao_informado'

  // Rede
  networkId?: string
  networkName?: string
  networkStatus: 'resolvido' | 'pendente' | 'nao_informado'

  // Loja
  storeId?: string
  storeCode?: string
  storeName?: string
  storeStatus: 'resolvido' | 'pendente' | 'nao_informado'

  // Produto
  productId?: string
  productCode?: string
  productName?: string
  productStatus: 'resolvido' | 'pendente' | 'nao_informado'

  // Promotor
  promoterId?: string
  promoterCode?: string
  promoterName?: string
  promoterStatus: 'resolvido' | 'pendente' | 'nao_informado'

  // Supervisor
  supervisorId?: string
  supervisorCode?: string
  supervisorName?: string
  supervisorStatus: 'resolvido' | 'pendente' | 'nao_informado'

  // Pendências geradas nesta resolução
  pendenciasGeradas: string[]
}

/**
 * Normaliza strings para chave comparativa segura:
 * remove acentos, trim, uppercase, múltiplos espaços
 */
export function normalizarChaveEntidade(texto?: string | null): string {
  if (!texto) return ''
  return texto
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

/**
 * Extrai o código da loja a partir da razão social TradePro (ex: "165 - FORT ATACADISTA" -> "165")
 */
export function extrairCodigoLojaRazaoSocial(razaoSocial?: string | null): string {
  if (!razaoSocial) return ''
  const trimmed = razaoSocial.trim()
  const m = trimmed.match(/^(\d+)/)
  if (m) return m[1]
  const m2 = trimmed.match(/^([^-–]+?)[\s]*[-–]/)
  if (m2) return m2[1].trim()
  return ''
}

/**
 * Resolução Segura de Indústria
 * Cód. Cliente -> procurar Indústria (via industry_registry tradepro_client_id)
 * Se não encontrar -> cria pendência de cliente TradePro
 */
export async function resolverIndustriaSegura(
  codCliente?: string,
  nomeCliente?: string,
  origem = 'tradepro_sync',
): Promise<{ id?: string; nome?: string; pendencia?: boolean }> {
  const code = (codCliente || '').trim()
  if (!code) {
    return { pendencia: false }
  }

  try {
    const list = await pb.collection('industry_registry').getList<CadastroIndustria>(1, 1, {
      filter: `tradepro_client_id = '${code.replace(/'/g, "\\'")}'`,
    })

    if (list.items.length > 0) {
      return { id: list.items[0].id, nome: list.items[0].nome }
    }

    // Não encontrado -> registrar pendência
    await createCadastroPendencia({
      tipo_entidade: 'industria',
      valor_identificador: code,
      codigo_externo: code,
      nome_identificado: nomeCliente || `Cliente TradePro #${code}`,
      origem_fonte: origem,
      contexto_adicional: { codCliente, nomeCliente },
    })

    return { pendencia: true }
  } catch (err) {
    console.warn('[cadastroResolver] Erro ao resolver indústria:', err)
    return { pendencia: false }
  }
}

/**
 * Resolução Segura de Rede
 * Fantasia -> procurar Rede
 * Preservar: Fantasia = Rede. NUNCA derivar pelo nome da Loja se Fantasia estiver disponível.
 */
export async function resolverRedeSegura(
  fantasia?: string,
  origem = 'tradepro_sync',
): Promise<{ id?: string; nome?: string; pendencia?: boolean }> {
  const rawFantasia = (fantasia || '').trim()
  if (!rawFantasia) return { pendencia: false }

  const norm = normalizarChaveEntidade(rawFantasia)

  try {
    const list = await pb.collection('networks').getFullList<CadastroRede>()
    const match = list.find((n) => normalizarChaveEntidade(n.nome) === norm)

    if (match) {
      return { id: match.id, nome: match.nome }
    }

    // Não encontrado -> registrar pendência
    await createCadastroPendencia({
      tipo_entidade: 'rede',
      valor_identificador: rawFantasia,
      nome_identificado: rawFantasia,
      origem_fonte: origem,
    })

    return { pendencia: true }
  } catch (err) {
    console.warn('[cadastroResolver] Erro ao resolver rede:', err)
    return { pendencia: false }
  }
}

/**
 * Resolução Segura de Loja
 * Razão Social -> procurar Loja (com código ou nome)
 */
export async function resolverLojaSegura(
  razaoSocial?: string,
  codigoLoja?: string,
  origem = 'tradepro_sync',
): Promise<{ id?: string; codigo?: string; nome?: string; pendencia?: boolean }> {
  const rs = (razaoSocial || '').trim()
  const code = (codigoLoja || extrairCodigoLojaRazaoSocial(rs)).trim()

  if (!rs && !code) return { pendencia: false }

  try {
    let match: CadastroLoja | undefined

    if (code) {
      const storesByCode = await pb.collection('stores').getList<CadastroLoja>(1, 1, {
        filter: `codigo_externo = '${code.replace(/'/g, "\\'")}' || codigo_loja = '${code.replace(/'/g, "\\'")}'`,
      })
      if (storesByCode.items.length > 0) match = storesByCode.items[0]
    }

    if (!match && rs) {
      const normRs = normalizarChaveEntidade(rs)
      const allStores = await pb.collection('stores').getList<CadastroLoja>(1, 100)
      match = allStores.items.find(
        (s) =>
          normalizarChaveEntidade(s.razao_social) === normRs ||
          normalizarChaveEntidade(s.nome) === normRs,
      )
    }

    if (match) {
      return {
        id: match.id,
        codigo: match.codigo_externo || match.codigo_loja || code,
        nome: match.razao_social || match.nome,
      }
    }

    // Não encontrado -> registrar pendência
    await createCadastroPendencia({
      tipo_entidade: 'loja',
      valor_identificador: code || rs,
      codigo_externo: code,
      nome_identificado: rs,
      origem_fonte: origem,
      contexto_adicional: { razaoSocial: rs, codigoLoja: code },
    })

    return { pendencia: true }
  } catch (err) {
    console.warn('[cadastroResolver] Erro ao resolver loja:', err)
    return { pendencia: false }
  }
}

/**
 * Resolução Segura de Promotor
 * Cód. Colaborador TradePro -> procurar Promotor
 * Se não encontrar pelo código seguro, não duplica por acentuação/caixa.
 */
export async function resolverPromotorSeguro(
  codColaborador?: string,
  nomeColaborador?: string,
  origem = 'tradepro_sync',
): Promise<{ id?: string; codigo?: string; nome?: string; pendencia?: boolean }> {
  const code = (codColaborador || '').trim()
  const nome = (nomeColaborador || '').trim()
  if (!code && !nome) return { pendencia: false }

  try {
    let match: CadastroPromotor | undefined

    if (code) {
      const list = await pb.collection('promoters').getList<CadastroPromotor>(1, 1, {
        filter: `codigo_externo = '${code.replace(/'/g, "\\'")}'`,
      })
      if (list.items.length > 0) match = list.items[0]
    }

    if (!match && nome) {
      const normNome = normalizarChaveEntidade(nome)
      const allProms = await pb.collection('promoters').getList<CadastroPromotor>(1, 200)
      match = allProms.items.find((p) => normalizarChaveEntidade(p.nome) === normNome)
    }

    if (match) {
      return {
        id: match.id,
        codigo: match.codigo_externo || code,
        nome: match.nome,
      }
    }

    // Não cadastrado -> pendência para vínculo assistido
    await createCadastroPendencia({
      tipo_entidade: 'promotor',
      valor_identificador: code || nome,
      codigo_externo: code,
      nome_identificado: nome,
      origem_fonte: origem,
      contexto_adicional: { codColaborador: code, nomeColaborador: nome },
    })

    return { pendencia: true }
  } catch (err) {
    console.warn('[cadastroResolver] Erro ao resolver promotor:', err)
    return { pendencia: false }
  }
}

/**
 * Resolução Segura de Supervisor
 * Cód. Supervisor TradePro -> procurar Supervisor
 */
export async function resolverSupervisorSeguro(
  codSupervisor?: string,
  nomeSupervisor?: string,
  origem = 'tradepro_sync',
): Promise<{ id?: string; codigo?: string; nome?: string; pendencia?: boolean }> {
  const code = (codSupervisor || '').trim()
  const nome = (nomeSupervisor || '').trim()
  if (!code && !nome) return { pendencia: false }

  try {
    let match: CadastroSupervisor | undefined

    if (code) {
      const list = await pb.collection('supervisors').getList<CadastroSupervisor>(1, 1, {
        filter: `codigo_externo = '${code.replace(/'/g, "\\'")}'`,
      })
      if (list.items.length > 0) match = list.items[0]
    }

    if (!match && nome) {
      const normNome = normalizarChaveEntidade(nome)
      const allSups = await pb.collection('supervisors').getList<CadastroSupervisor>(1, 200)
      match = allSups.items.find((s) => normalizarChaveEntidade(s.nome) === normNome)
    }

    if (match) {
      return {
        id: match.id,
        codigo: match.codigo_externo || code,
        nome: match.nome,
      }
    }

    // Não cadastrado -> pendência
    await createCadastroPendencia({
      tipo_entidade: 'supervisor',
      valor_identificador: code || nome,
      codigo_externo: code,
      nome_identificado: nome,
      origem_fonte: origem,
      contexto_adicional: { codSupervisor: code, nomeSupervisor: nome },
    })

    return { pendencia: true }
  } catch (err) {
    console.warn('[cadastroResolver] Erro ao resolver supervisor:', err)
    return { pendencia: false }
  }
}

/**
 * Resolução Segura de Produto com Contexto de Indústria
 * Regra: Não assumir que um Cód. Produto isolado seja único: considerar Indústria + Cód. Produto.
 * Mão dupla:
 * 1. Se indústria for conhecida -> reduz universo de produtos
 * 2. Se produto for oficial e pertencer unicamente a uma indústria -> ajuda a identificar indústria
 */
export async function resolverProdutoSeguro(
  produtoNome?: string,
  codigoProduto?: string,
  industryId?: string,
  origem = 'tradepro_sync',
): Promise<{
  id?: string
  codigo?: string
  nome?: string
  industryId?: string
  industryName?: string
  pendencia?: boolean
}> {
  const rawNome = (produtoNome || '').trim()
  const rawCode = (codigoProduto || '').trim()
  if (!rawNome && !rawCode) return { pendencia: false }

  try {
    // 1. Busca produtos considerando o contexto da indústria se fornecido
    const filterParts: string[] = []
    if (industryId) {
      filterParts.push(`industry_id = '${industryId.replace(/'/g, "\\'")}'`)
    }
    if (rawCode) {
      filterParts.push(`codigo_produto = '${rawCode.replace(/'/g, "\\'")}'`)
    }

    let candidateList: CadastroProduto[] = []
    if (filterParts.length > 0) {
      candidateList = await pb.collection('industry_product_mix').getFullList<CadastroProduto>({
        filter: filterParts.join(' && '),
      })
    }

    // Se encontrou por código dentro da indústria
    if (candidateList.length === 1) {
      const p = candidateList[0]
      return {
        id: p.id,
        codigo: p.codigo_produto || rawCode,
        nome: p.nome_produto,
        industryId: p.industry_id,
        industryName: p.industry_name,
      }
    }

    // 2. Busca por nome normalizado
    if (rawNome) {
      const normNome = normalizarNomeProduto(rawNome)
      const allProducts = await pb.collection('industry_product_mix').getFullList<CadastroProduto>({
        filter: industryId ? `industry_id = '${industryId.replace(/'/g, "\\'")}'` : undefined,
      })

      const exactMatch = allProducts.find((p) => normalizarNomeProduto(p.nome_produto) === normNome)
      if (exactMatch) {
        return {
          id: exactMatch.id,
          codigo: exactMatch.codigo_produto || rawCode,
          nome: exactMatch.nome_produto,
          industryId: exactMatch.industry_id,
          industryName: exactMatch.industry_name,
        }
      }

      // 3. Tenta via Dicionário de Aliases (product_aliases)
      const aliases = await pb.collection('product_aliases').getFullList<{
        alias_normalizado: string
        produto_oficial_nome: string
        produto_oficial_codigo: string
        industria_id: string
        industria_nome: string
      }>({
        filter: `alias_normalizado = '${normNome.replace(/'/g, "\\'")}' && status = 'ativo'`,
      })

      if (aliases.length > 0) {
        const a = aliases[0]
        return {
          codigo: a.produto_oficial_codigo,
          nome: a.produto_oficial_nome,
          industryId: a.industria_id,
          industryName: a.industria_nome,
        }
      }
    }

    // Se não encontrou -> cria pendência
    await createCadastroPendencia({
      tipo_entidade: 'produto',
      valor_identificador: rawCode ? `${rawCode} - ${rawNome}` : rawNome,
      codigo_externo: rawCode,
      nome_identificado: rawNome,
      origem_fonte: origem,
      contexto_adicional: { produtoNome: rawNome, codigoProduto: rawCode, industryId },
    })

    return { pendencia: true }
  } catch (err) {
    console.warn('[cadastroResolver] Erro ao resolver produto:', err)
    return { pendencia: false }
  }
}
