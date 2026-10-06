import pb from '@/lib/pocketbase/client'
import type {
  IndustryRegistry,
  IndustryStoreCoverage,
  IndustryProductMix,
  IndustryStoreProductMix,
  IndustryResearchConfig,
  IndustryValidityPolicy,
  IndustryConfigAudit,
  ResolvedValidityPolicy,
} from '@/types/industryOperational'

export interface SaveIndustryInput {
  id?: string
  nome: string
  razao_social?: string
  cnpj?: string
  status: 'ativa' | 'inativa'
  segmento?: string
  contato_nome?: string
  contato_email?: string
  contato_telefone?: string
  observacoes?: string
  tradepro_client_id?: string
  tradepro_client_name?: string
}

export interface SaveStoreCoverageInput {
  id?: string
  industry_id: string
  industry_name: string
  store_code?: string
  store_name: string
  network_name?: string
  city?: string
  state?: string
  status_relacao: 'detectada' | 'confirmada' | 'ativa' | 'inativa'
  observacao?: string
}

export interface SaveProductMixInput {
  id?: string
  industry_id: string
  industry_name: string
  codigo_produto?: string
  cod_barras?: string
  nome_produto: string
  categoria?: string
  tipo_mix: 'oficial_industria' | 'observado_operacional'
  status: 'ativo' | 'descontinuado' | 'em_avaliacao'
  shelf_life_dias?: number
}

export interface SaveStoreProductMixInput {
  id?: string
  industry_id: string
  store_code?: string
  store_name: string
  codigo_produto?: string
  cod_barras?: string
  nome_produto: string
  status: 'ativo' | 'inativo' | 'em_avaliacao'
  origem_inclusao?: string
  observacao?: string
}

export interface SaveResearchConfigInput {
  id?: string
  industry_id: string
  tipo_pesquisa: 'validades' | 'rupturas'
  ativo: boolean
  frequencia: 'diaria' | 'semanal' | 'quinzenal' | 'mensal'
  dia_esperado:
    | 'segunda'
    | 'terca'
    | 'quarta'
    | 'quinta'
    | 'sexta'
    | 'sabado'
    | 'domingo'
    | 'qualquer'
  horario_limite?: string
  tolerancia_dias?: number
  instrucoes?: string
}

export interface SaveValidityPolicyInput {
  id?: string
  industry_id?: string
  nivel_regra: 'sistema' | 'industria' | 'produto_excecao'
  produto_nome?: string
  codigo_produto?: string
  dias_critico: number
  dias_atencao: number
  dias_moderado?: number
  shelf_life_padrao_dias?: number
  justificativa?: string
  ativo: boolean
}

/** 1. INDÚSTRIAS (REGISTRY) */
export async function getIndustryRegistries(): Promise<IndustryRegistry[]> {
  try {
    const records = await pb.collection('industry_registry').getFullList<IndustryRegistry>({
      sort: 'nome',
    })
    return records
  } catch (err) {
    console.warn('[industryService] Erro ao buscar indústrias cadastradas:', err)
    return []
  }
}

export async function getIndustryRegistryByIdOrKey(
  idOrKey: string,
): Promise<IndustryRegistry | null> {
  try {
    if (!idOrKey) return null
    // Tenta primeiro por id
    try {
      const byId = await pb.collection('industry_registry').getOne<IndustryRegistry>(idOrKey)
      if (byId) return byId
    } catch (_) {
      // Se não é um id de 15 caracteres válido, busca por nome_chave
    }
    const cleanKey = decodeURIComponent(idOrKey).trim().toUpperCase()
    const byKey = await pb
      .collection('industry_registry')
      .getFirstListItem<IndustryRegistry>(`nome_chave = '${cleanKey.replace(/'/g, "\\'")}'`)
    return byKey
  } catch (err) {
    console.warn(`[industryService] Indústria não encontrada para "${idOrKey}":`, err)
    return null
  }
}

export async function saveIndustryRegistry(
  input: SaveIndustryInput,
  userName = 'Operador',
): Promise<IndustryRegistry> {
  const nomeChave = input.nome.trim().toUpperCase()
  const payload: Record<string, unknown> = {
    nome: input.nome.trim(),
    nome_chave: nomeChave,
    razao_social: input.razao_social?.trim() || '',
    cnpj: input.cnpj?.trim() || '',
    status: input.status,
    segmento: input.segmento?.trim() || '',
    contato_nome: input.contato_nome?.trim() || '',
    contato_email: input.contato_email?.trim() || '',
    contato_telefone: input.contato_telefone?.trim() || '',
    observacoes: input.observacoes?.trim() || '',
    tradepro_client_id:
      input.tradepro_client_id !== undefined ? input.tradepro_client_id.trim() : undefined,
    tradepro_client_name:
      input.tradepro_client_name !== undefined ? input.tradepro_client_name.trim() : undefined,
  }
  // Remove campos undefined para não sobrescrever caso não enviados
  if (payload.tradepro_client_id === undefined) delete payload.tradepro_client_id
  if (payload.tradepro_client_name === undefined) delete payload.tradepro_client_name

  let result: IndustryRegistry
  if (input.id) {
    result = await pb.collection('industry_registry').update<IndustryRegistry>(input.id, payload)
    await recordConfigAudit({
      industry_id: result.id,
      modulo: 'identificacao',
      acao: 'atualizacao_dados_cadastrais',
      usuario_nome: userName,
      detalhes_json: payload,
    })
  } else {
    result = await pb.collection('industry_registry').create<IndustryRegistry>(payload)
    await recordConfigAudit({
      industry_id: result.id,
      modulo: 'identificacao',
      acao: 'criacao_industria',
      usuario_nome: userName,
      detalhes_json: payload,
    })

    // Ao criar uma indústria, inicializa configurações padrão de pesquisa e política de validade
    await initDefaultIndustryConfig(result.id, result.nome, userName)
  }

  return result
}

/** Inicializa pesquisas padrão e política para nova indústria */
async function initDefaultIndustryConfig(
  industryId: string,
  industryName: string,
  userName: string,
) {
  try {
    // 1. Pesquisa de Validades (padrão semanal)
    await pb.collection('industry_research_config').create({
      industry_id: industryId,
      tipo_pesquisa: 'validades',
      ativo: true,
      frequencia: 'semanal',
      dia_esperado: 'terca',
      tolerancia_dias: 1,
      instrucoes: 'Aferição semanal de validades em gôndola e estoque.',
    })

    // 2. Pesquisa de Rupturas (padrão semanal)
    await pb.collection('industry_research_config').create({
      industry_id: industryId,
      tipo_pesquisa: 'rupturas',
      ativo: true,
      frequencia: 'semanal',
      dia_esperado: 'terca',
      tolerancia_dias: 1,
      instrucoes: 'Aferição de rupturas em gôndola.',
    })

    // 3. Política de Validade específica da indústria
    await pb.collection('industry_validity_policy').create({
      industry_id: industryId,
      nivel_regra: 'industria',
      dias_critico: 15,
      dias_atencao: 20,
      dias_moderado: 30,
      shelf_life_padrao_dias: 60,
      justificativa: 'Política inicial herdada das regras padrão do sistema.',
      ativo: true,
    })
  } catch (err) {
    console.warn('[industryService] Falha ao inicializar configurações padrão:', err)
  }
}

/** 2. COBERTURA OPERACIONAL (LOJAS) */
export async function getIndustryStoreCoverages(
  industryId: string,
): Promise<IndustryStoreCoverage[]> {
  try {
    return await pb.collection('industry_store_coverage').getFullList<IndustryStoreCoverage>({
      filter: `industry_id = '${industryId}'`,
      sort: 'store_name',
    })
  } catch (err) {
    console.warn('[industryService] Erro ao carregar coberturas:', err)
    return []
  }
}

export async function saveStoreCoverage(
  input: SaveStoreCoverageInput,
  userName = 'Operador',
): Promise<IndustryStoreCoverage> {
  const payload: Record<string, unknown> = {
    industry_id: input.industry_id,
    industry_name: input.industry_name,
    store_code: input.store_code?.trim() || '',
    store_name: input.store_name.trim(),
    network_name: input.network_name?.trim() || '',
    city: input.city?.trim() || '',
    state: input.state?.trim() || '',
    status_relacao: input.status_relacao,
    observacao: input.observacao?.trim() || '',
  }

  let result: IndustryStoreCoverage
  if (input.id) {
    result = await pb
      .collection('industry_store_coverage')
      .update<IndustryStoreCoverage>(input.id, payload)
    await recordConfigAudit({
      industry_id: input.industry_id,
      modulo: 'cobertura',
      acao: 'atualizacao_status_cobertura',
      usuario_nome: userName,
      detalhes_json: { ...payload, coverage_id: input.id },
    })
  } else {
    result = await pb.collection('industry_store_coverage').create<IndustryStoreCoverage>(payload)
    await recordConfigAudit({
      industry_id: input.industry_id,
      modulo: 'cobertura',
      acao: 'inclusao_loja_cobertura',
      usuario_nome: userName,
      detalhes_json: payload,
    })
  }
  return result
}

export async function deleteStoreCoverage(
  id: string,
  industryId: string,
  userName = 'Operador',
): Promise<boolean> {
  try {
    await pb.collection('industry_store_coverage').delete(id)
    await recordConfigAudit({
      industry_id: industryId,
      modulo: 'cobertura',
      acao: 'remocao_loja_cobertura',
      usuario_nome: userName,
      detalhes_json: { coverage_id: id },
    })
    return true
  } catch (err) {
    console.warn('[industryService] Erro ao deletar cobertura:', err)
    return false
  }
}

/** 3. MIX DE PRODUTOS */
export async function getIndustryProductMix(industryId: string): Promise<IndustryProductMix[]> {
  try {
    return await pb.collection('industry_product_mix').getFullList<IndustryProductMix>({
      filter: `industry_id = '${industryId}'`,
      sort: 'nome_produto',
    })
  } catch (err) {
    console.warn('[industryService] Erro ao carregar mix de produtos:', err)
    return []
  }
}

export async function saveProductMixItem(
  input: SaveProductMixInput,
  userName = 'Operador',
): Promise<IndustryProductMix> {
  const payload: Record<string, unknown> = {
    industry_id: input.industry_id,
    industry_name: input.industry_name,
    codigo_produto: input.codigo_produto?.trim() || '',
    cod_barras: input.cod_barras?.trim() || '',
    nome_produto: input.nome_produto.trim(),
    categoria: input.categoria?.trim() || 'Geral',
    tipo_mix: input.tipo_mix,
    status: input.status,
    shelf_life_dias: input.shelf_life_dias ?? null,
  }

  let result: IndustryProductMix
  if (input.id) {
    result = await pb
      .collection('industry_product_mix')
      .update<IndustryProductMix>(input.id, payload)
    await recordConfigAudit({
      industry_id: input.industry_id,
      modulo: 'mix',
      acao: 'atualizacao_produto_mix',
      usuario_nome: userName,
      detalhes_json: { ...payload, mix_id: input.id },
    })
  } else {
    result = await pb.collection('industry_product_mix').create<IndustryProductMix>(payload)
    await recordConfigAudit({
      industry_id: input.industry_id,
      modulo: 'mix',
      acao: 'cadastro_produto_mix',
      usuario_nome: userName,
      detalhes_json: payload,
    })
  }
  return result
}

export async function deleteProductMixItem(
  id: string,
  industryId: string,
  userName = 'Operador',
): Promise<boolean> {
  try {
    await pb.collection('industry_product_mix').delete(id)
    await recordConfigAudit({
      industry_id: industryId,
      modulo: 'mix',
      acao: 'remocao_produto_mix',
      usuario_nome: userName,
      detalhes_json: { mix_id: id },
    })
    return true
  } catch (err) {
    console.warn('[industryService] Erro ao deletar produto do mix:', err)
    return false
  }
}

/** 3.1 MIX DEFINIDO DA LOJA (industry_store_product_mix) */
export async function getIndustryStoreProductMixes(
  industryId: string,
  storeName?: string,
): Promise<IndustryStoreProductMix[]> {
  try {
    let filter = `industry_id = '${industryId}'`
    if (storeName) {
      filter += ` && store_name = '${storeName.replace(/'/g, "\\'")}'`
    }
    return await pb.collection('industry_store_product_mix').getFullList<IndustryStoreProductMix>({
      filter,
      sort: 'nome_produto',
    })
  } catch (err) {
    console.warn('[industryService] Erro ao carregar mix definido da loja:', err)
    return []
  }
}

export async function saveStoreProductMixItem(
  input: SaveStoreProductMixInput,
  userName = 'Operador',
): Promise<IndustryStoreProductMix> {
  const payload: Record<string, unknown> = {
    industry_id: input.industry_id,
    store_code: input.store_code?.trim() || '',
    store_name: input.store_name.trim(),
    codigo_produto: input.codigo_produto?.trim() || '',
    cod_barras: input.cod_barras?.trim() || '',
    nome_produto: input.nome_produto.trim(),
    status: input.status,
    origem_inclusao: input.origem_inclusao || 'manual',
    observacao: input.observacao?.trim() || '',
  }

  let result: IndustryStoreProductMix
  if (input.id) {
    result = await pb
      .collection('industry_store_product_mix')
      .update<IndustryStoreProductMix>(input.id, payload)
    await recordConfigAudit({
      industry_id: input.industry_id,
      modulo: 'mix',
      acao: 'atualizacao_mix_definido_loja',
      usuario_nome: userName,
      detalhes_json: { ...payload, store_mix_id: input.id },
    })
  } else {
    result = await pb
      .collection('industry_store_product_mix')
      .create<IndustryStoreProductMix>(payload)
    await recordConfigAudit({
      industry_id: input.industry_id,
      modulo: 'mix',
      acao: 'inclusao_mix_definido_loja',
      usuario_nome: userName,
      detalhes_json: payload,
    })
  }
  return result
}

export async function deleteStoreProductMixItem(
  id: string,
  industryId: string,
  userName = 'Operador',
): Promise<boolean> {
  try {
    await pb.collection('industry_store_product_mix').delete(id)
    await recordConfigAudit({
      industry_id: industryId,
      modulo: 'mix',
      acao: 'remocao_mix_definido_loja',
      usuario_nome: userName,
      detalhes_json: { store_mix_id: id },
    })
    return true
  } catch (err) {
    console.warn('[industryService] Erro ao deletar produto do mix da loja:', err)
    return false
  }
}

/** 4. PESQUISAS OBRIGATÓRIAS */
export async function getIndustryResearchConfigs(
  industryId: string,
): Promise<IndustryResearchConfig[]> {
  try {
    return await pb.collection('industry_research_config').getFullList<IndustryResearchConfig>({
      filter: `industry_id = '${industryId}'`,
      sort: 'tipo_pesquisa',
    })
  } catch (err) {
    console.warn('[industryService] Erro ao carregar pesquisas:', err)
    return []
  }
}

export async function saveResearchConfig(
  input: SaveResearchConfigInput,
  userName = 'Operador',
): Promise<IndustryResearchConfig> {
  const payload: Record<string, unknown> = {
    industry_id: input.industry_id,
    tipo_pesquisa: input.tipo_pesquisa,
    ativo: input.ativo,
    frequencia: input.frequencia,
    dia_esperado: input.dia_esperado,
    horario_limite: input.horario_limite || '',
    tolerancia_dias: input.tolerancia_dias ?? 1,
    instrucoes: input.instrucoes || '',
  }

  let result: IndustryResearchConfig
  if (input.id) {
    result = await pb
      .collection('industry_research_config')
      .update<IndustryResearchConfig>(input.id, payload)
  } else {
    // Busca se já existe registro desse tipo para essa indústria
    try {
      const existing = await pb
        .collection('industry_research_config')
        .getFirstListItem<IndustryResearchConfig>(
          `industry_id = '${input.industry_id}' && tipo_pesquisa = '${input.tipo_pesquisa}'`,
        )
      result = await pb
        .collection('industry_research_config')
        .update<IndustryResearchConfig>(existing.id, payload)
    } catch (_) {
      result = await pb
        .collection('industry_research_config')
        .create<IndustryResearchConfig>(payload)
    }
  }

  await recordConfigAudit({
    industry_id: input.industry_id,
    modulo: 'pesquisas',
    acao: `configuracao_pesquisa_${input.tipo_pesquisa}`,
    usuario_nome: userName,
    detalhes_json: payload,
  })

  return result
}

/** 5. POLÍTICA DE VALIDADE & EXCEÇÕES DE PRODUTO */
export async function getIndustryValidityPolicies(
  industryId: string,
): Promise<IndustryValidityPolicy[]> {
  try {
    return await pb.collection('industry_validity_policy').getFullList<IndustryValidityPolicy>({
      filter: `industry_id = '${industryId}' || nivel_regra = 'sistema'`,
      sort: 'nivel_regra',
    })
  } catch (err) {
    console.warn('[industryService] Erro ao carregar políticas de validade:', err)
    return []
  }
}

export async function saveValidityPolicy(
  input: SaveValidityPolicyInput,
  userName = 'Operador',
): Promise<IndustryValidityPolicy> {
  const payload: Record<string, unknown> = {
    industry_id: input.industry_id || null,
    nivel_regra: input.nivel_regra,
    produto_nome: input.produto_nome?.trim() || '',
    codigo_produto: input.codigo_produto?.trim() || '',
    dias_critico: Number(input.dias_critico),
    dias_atencao: Number(input.dias_atencao),
    dias_moderado: input.dias_moderado ? Number(input.dias_moderado) : 30,
    shelf_life_padrao_dias: input.shelf_life_padrao_dias
      ? Number(input.shelf_life_padrao_dias)
      : null,
    justificativa: input.justificativa?.trim() || '',
    ativo: input.ativo,
  }

  let result: IndustryValidityPolicy
  if (input.id) {
    result = await pb
      .collection('industry_validity_policy')
      .update<IndustryValidityPolicy>(input.id, payload)
  } else {
    result = await pb.collection('industry_validity_policy').create<IndustryValidityPolicy>(payload)
  }

  await recordConfigAudit({
    industry_id: input.industry_id,
    modulo: 'politica_validade',
    acao: `salvar_politica_${input.nivel_regra}`,
    usuario_nome: userName,
    detalhes_json: payload,
  })

  return result
}

export async function deleteValidityPolicy(
  id: string,
  industryId?: string,
  userName = 'Operador',
): Promise<boolean> {
  try {
    await pb.collection('industry_validity_policy').delete(id)
    await recordConfigAudit({
      industry_id: industryId,
      modulo: 'politica_validade',
      acao: 'remocao_politica_excecao',
      usuario_nome: userName,
      detalhes_json: { policy_id: id },
    })
    return true
  } catch (err) {
    console.warn('[industryService] Erro ao deletar política:', err)
    return false
  }
}

/**
 * Resolve a política efetiva de validade para um produto aplicando a hierarquia em cascata:
 * 1. Exceção do produto
 * 2. Regra da indústria
 * 3. Regra padrão do sistema (Crítico <= 15d, Atenção <= 20d)
 */
export function resolveValidityPolicy(
  productName: string,
  policies: IndustryValidityPolicy[],
): ResolvedValidityPolicy {
  const normProduct = (productName || '').trim().toUpperCase()

  // 1. Procura exceção ativa para o produto específico
  if (normProduct) {
    const prodException = policies.find(
      (p) =>
        p.ativo &&
        p.nivel_regra === 'produto_excecao' &&
        p.produto_nome?.trim().toUpperCase() === normProduct,
    )
    if (prodException) {
      return {
        diasCritico: prodException.dias_critico,
        diasAtencao: prodException.dias_atencao,
        diasModerado: prodException.dias_moderado ?? 30,
        shelfLifeEsperado: prodException.shelf_life_padrao_dias,
        origem: 'produto_excecao',
        detalhesOrigem: `Exceção cadastrada para "${prodException.produto_nome}" (${prodException.justificativa || 'sem justificativa'})`,
      }
    }
  }

  // 2. Procura regra da indústria
  const industryRule = policies.find((p) => p.ativo && p.nivel_regra === 'industria')
  if (industryRule) {
    return {
      diasCritico: industryRule.dias_critico,
      diasAtencao: industryRule.dias_atencao,
      diasModerado: industryRule.dias_moderado ?? 30,
      shelfLifeEsperado: industryRule.shelf_life_padrao_dias,
      origem: 'industria',
      detalhesOrigem: 'Política específica configurada para esta indústria',
    }
  }

  // 3. Procura regra de sistema
  const systemRule = policies.find((p) => p.ativo && p.nivel_regra === 'sistema')
  if (systemRule) {
    return {
      diasCritico: systemRule.dias_critico,
      diasAtencao: systemRule.dias_atencao,
      diasModerado: systemRule.dias_moderado ?? 30,
      shelfLifeEsperado: systemRule.shelf_life_padrao_dias,
      origem: 'sistema',
      detalhesOrigem: 'Regra padrão do sistema (padrão global)',
    }
  }

  // Fallback padrão se nada cadastrado
  return {
    diasCritico: 15,
    diasAtencao: 20,
    diasModerado: 30,
    shelfLifeEsperado: 90,
    origem: 'sistema',
    detalhesOrigem: 'Regra padrão fixa (15d crítico / 20d atenção)',
  }
}

/** 6. AUDITORIA / HISTÓRICO DE CONFIGURAÇÕES */
export async function getIndustryConfigAudits(industryId: string): Promise<IndustryConfigAudit[]> {
  try {
    return await pb.collection('industry_config_audit').getFullList<IndustryConfigAudit>({
      filter: `industry_id = '${industryId}'`,
      sort: '-created',
    })
  } catch (err) {
    console.warn('[industryService] Erro ao carregar histórico de auditoria:', err)
    return []
  }
}

export async function recordConfigAudit(data: {
  industry_id?: string
  modulo: IndustryConfigAudit['modulo']
  acao: string
  usuario_nome?: string
  detalhes_json?: Record<string, unknown>
}): Promise<void> {
  try {
    await pb.collection('industry_config_audit').create({
      industry_id: data.industry_id || null,
      modulo: data.modulo,
      acao: data.acao,
      usuario_nome: data.usuario_nome || 'Operador',
      detalhes_json: data.detalhes_json || {},
      data_alteracao: new Date().toISOString(),
    })
  } catch (err) {
    console.warn('[industryService] Erro ao salvar auditoria de config:', err)
  }
}

/**
 * 7. INTEGRAÇÃO TRADEPRO — VINCULAÇÃO E CLIENTES NÃO VINCULADOS
 */

export interface LinkTradeProClientInput {
  industry_id: string
  tradepro_client_id: string
  tradepro_client_name: string
  justificativa?: string
  userName?: string
}

export interface UnlinkTradeProClientInput {
  industry_id: string
  justificativa?: string
  userName?: string
}

/**
 * Vincula uma indústria do SKIP a um Cliente TradePro (via código tradepro_client_id).
 * Atualiza o registro em industry_registry, gera auditoria em industry_config_audit (modulo: 'integracao_tradepro')
 * e retroalimenta validades_base que possuam esse cod_cliente pendente.
 */
export async function linkTradeProClient(
  input: LinkTradeProClientInput,
): Promise<IndustryRegistry> {
  const userName = input.userName || 'Operador'
  const targetIndustry = await pb
    .collection('industry_registry')
    .getOne<IndustryRegistry>(input.industry_id)

  const anteriorClientId = targetIndustry.tradepro_client_id || ''
  const anteriorClientName = targetIndustry.tradepro_client_name || ''

  // Atualiza na coleção industry_registry
  const updated = await pb
    .collection('industry_registry')
    .update<IndustryRegistry>(input.industry_id, {
      tradepro_client_id: input.tradepro_client_id.trim(),
      tradepro_client_name: input.tradepro_client_name.trim(),
    })

  // Registra auditoria rastreável
  await recordConfigAudit({
    industry_id: input.industry_id,
    modulo: 'integracao_tradepro',
    acao: anteriorClientId ? 'revinculacao_cliente_tradepro' : 'vinculacao_cliente_tradepro',
    usuario_nome: userName,
    detalhes_json: {
      tradepro_client_id: input.tradepro_client_id.trim(),
      tradepro_client_name: input.tradepro_client_name.trim(),
      anterior_client_id: anteriorClientId,
      anterior_client_name: anteriorClientName,
      justificativa: input.justificativa?.trim() || 'Vinculação manual via Cadastro Operacional',
    },
  })

  // Retroalimenta validades_base que tiverem esse cod_cliente e industry_id vazio
  try {
    const unlinkedRows = await pb.collection('validades_base').getFullList<{ id: string }>({
      filter: `cod_cliente = '${input.tradepro_client_id.trim().replace(/'/g, "\\'")}' && (industry_id = '' || industry_id = null)`,
      fields: 'id',
    })
    for (const row of unlinkedRows) {
      try {
        await pb.collection('validades_base').update(row.id, {
          industry_id: input.industry_id,
          cliente: updated.nome,
        })
      } catch {
        /* intentionally ignored */
      }
    }
  } catch (syncErr) {
    console.warn('[industryService] Aviso ao retroalimentar validades_base:', syncErr)
  }

  return updated
}

/**
 * Desvincula uma indústria do SKIP de qualquer Cliente TradePro.
 * Remove tradepro_client_id e tradepro_client_name e registra auditoria.
 */
export async function unlinkTradeProClient(
  input: UnlinkTradeProClientInput,
): Promise<IndustryRegistry> {
  const userName = input.userName || 'Operador'
  const targetIndustry = await pb
    .collection('industry_registry')
    .getOne<IndustryRegistry>(input.industry_id)

  const anteriorClientId = targetIndustry.tradepro_client_id || ''
  const anteriorClientName = targetIndustry.tradepro_client_name || ''

  const updated = await pb
    .collection('industry_registry')
    .update<IndustryRegistry>(input.industry_id, {
      tradepro_client_id: '',
      tradepro_client_name: '',
    })

  await recordConfigAudit({
    industry_id: input.industry_id,
    modulo: 'integracao_tradepro',
    acao: 'desvinculacao_cliente_tradepro',
    usuario_nome: userName,
    detalhes_json: {
      anterior_client_id: anteriorClientId,
      anterior_client_name: anteriorClientName,
      justificativa: input.justificativa?.trim() || 'Desvinculação manual via Cadastro Operacional',
    },
  })

  return updated
}

/**
 * Retorna os clientes TradePro presentes em validades_base que ainda NÃO possuem industry_id associado,
 * com volume de registros e amostra de lojas/produtos.
 * Nada é descartado nem inferido silenciosamente.
 */
export async function getUnlinkedTradeProClients(): Promise<
  import('@/types/industryOperational').UnlinkedTradeProClient[]
> {
  try {
    // 1. Busca indústrias cadastradas para ter mapa de client_ids vinculados
    const industries = await getIndustryRegistries()
    const linkedClientIds = new Set<string>()
    for (const ind of industries) {
      if (ind.tradepro_client_id) {
        linkedClientIds.add(ind.tradepro_client_id.trim())
      }
    }

    // 2. Busca registros de validades_base (base atual)
    // Coleta cod_cliente e cliente onde industry_id é vazio ou null
    const records = await pb.collection('validades_base').getFullList<{
      cod_cliente?: string
      cliente?: string
      razao_social?: string
      nome_loja?: string
      produto?: string
      industry_id?: string
      realizado?: string
    }>({
      fields: 'cod_cliente,cliente,razao_social,nome_loja,produto,industry_id,realizado',
      sort: '-realizado',
    })

    const clientMap = new Map<
      string,
      {
        cod_cliente: string
        cliente_nome: string
        volume_registros: number
        lojas: Set<string>
        produtos: Set<string>
        ultima_aparicao?: string
      }
    >()

    for (const r of records) {
      const code = (r.cod_cliente || '').trim()
      const indId = (r.industry_id || '').trim()

      // Se já está vinculado por relation industry_id ou por tradepro_client_id cadastrado, ignora
      if (indId || (code && linkedClientIds.has(code))) {
        continue
      }

      // Se nem tiver código nem cliente informado, pula
      if (!code && !r.cliente) continue

      const clientKey = code || (r.cliente || '').trim()
      const existing = clientMap.get(clientKey) || {
        cod_cliente: code,
        cliente_nome: (r.cliente || '').trim() || `Cliente #${code}`,
        volume_registros: 0,
        lojas: new Set<string>(),
        produtos: new Set<string>(),
        ultima_aparicao: undefined,
      }

      existing.volume_registros += 1
      const lojaNome = (r.nome_loja || r.razao_social || '').trim()
      if (lojaNome && existing.lojas.size < 5) {
        existing.lojas.add(lojaNome)
      }
      const prodNome = (r.produto || '').trim()
      if (prodNome && existing.produtos.size < 5) {
        existing.produtos.add(prodNome)
      }
      if (r.realizado && (!existing.ultima_aparicao || r.realizado > existing.ultima_aparicao)) {
        existing.ultima_aparicao = r.realizado
      }

      clientMap.set(clientKey, existing)
    }

    const results: import('@/types/industryOperational').UnlinkedTradeProClient[] = []
    for (const c of clientMap.values()) {
      results.push({
        cod_cliente: c.cod_cliente,
        cliente_nome: c.cliente_nome,
        volume_registros: c.volume_registros,
        amostra_lojas: Array.from(c.lojas),
        amostra_produtos: Array.from(c.produtos),
        ultima_aparicao: c.ultima_aparicao,
      })
    }

    // Ordena por volume de registros decrescente
    results.sort((a, b) => b.volume_registros - a.volume_registros)
    return results
  } catch (err) {
    console.warn('[industryService] Erro ao buscar clientes não vinculados:', err)
    return []
  }
}
