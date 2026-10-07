/**
 * Cadastros Service
 * Consolidação e fonte de verdade estrutural do SKIP.
 *
 * Reutiliza:
 * - industry_registry (Indústrias e vínculos TradePro)
 * - industry_product_mix (Catálogo mestre de produtos e mix da indústria)
 * - networks (Redes)
 * - stores (Lojas)
 * - supervisors (Supervisores)
 * - promoters (Promotores)
 * - store_promoter_assignments (Histórico de alocações)
 * - cadastros_pendencias (Fila de entidades não reconhecidas para tratamento assistido)
 * - product_aliases (Dicionário de aliases integrado)
 * - user_audit_log (Trilha de auditoria das alterações cadastrais)
 */

import pb from '@/lib/pocketbase/client'
import type {
  CadastroIndustria,
  CadastroProduto,
  CadastroRede,
  CadastroLoja,
  CadastroSupervisor,
  CadastroPromotor,
  CadastroPromotorAssignment,
  CadastroPendencia,
  MixOpportunityAnalysis,
} from '@/types/cadastros'
import { IndustryStoreCoverage, IndustryStoreProductMix } from '@/types/industryOperational'
import { normalizarNomeProduto } from '@/lib/resolve/produtoResolver'

export interface AuditLogOptions {
  executorNome?: string
  executorId?: string
  detalhes?: Record<string, unknown>
}

// ---------------------------------------------------------------------------------
// 1. AUDITORIA CENTRALIZADA DE CADASTRO
// ---------------------------------------------------------------------------------
export async function logCadastroAudit(
  acao: string,
  targetName: string,
  targetId: string,
  options?: AuditLogOptions,
): Promise<void> {
  try {
    const authModel = pb.authStore.model
    const executorNome = options?.executorNome || authModel?.name || authModel?.email || 'Sistema'
    const executorId = options?.executorId || authModel?.id || ''

    await pb.collection('user_audit_log').create({
      user_id: executorId,
      target_user_id: targetId,
      target_user_email: targetName,
      acao: acao,
      detalhes_json: options?.detalhes || {},
      executor_nome: executorNome,
      executor_id: executorId,
      data_acao: new Date().toISOString(),
    })
  } catch (err) {
    console.warn('[cadastrosService] Falha ao registrar log de auditoria:', err)
  }
}

// ---------------------------------------------------------------------------------
// 2. INDÚSTRIAS
// ---------------------------------------------------------------------------------
export async function getCadastrosIndustrias(): Promise<CadastroIndustria[]> {
  try {
    return await pb.collection('industry_registry').getFullList<CadastroIndustria>({
      sort: 'nome',
    })
  } catch (err) {
    console.warn('[cadastrosService] Erro ao carregar indústrias:', err)
    return []
  }
}

export async function saveCadastroIndustria(
  data: Partial<CadastroIndustria>,
  options?: AuditLogOptions,
): Promise<CadastroIndustria> {
  const isUpdate = Boolean(data.id)
  let record: CadastroIndustria

  const payload = {
    nome: data.nome?.trim(),
    nome_chave: data.nome?.trim().toUpperCase(),
    razao_social: data.razao_social?.trim() || '',
    cnpj: data.cnpj?.trim() || '',
    status: data.status || 'ativa',
    segmento: data.segmento?.trim() || 'Alimentos / Consumo',
    contato_nome: data.contato_nome?.trim() || '',
    contato_email: data.contato_email?.trim() || '',
    contato_telefone: data.contato_telefone?.trim() || '',
    observacoes: data.observacoes?.trim() || '',
    tradepro_client_id: data.tradepro_client_id?.trim() || '',
    tradepro_client_name: data.tradepro_client_name?.trim() || '',
    app_diretoria_industry_id: data.app_diretoria_industry_id?.trim() || '',
  }

  if (isUpdate && data.id) {
    record = await pb.collection('industry_registry').update<CadastroIndustria>(data.id, payload)
  } else {
    record = await pb.collection('industry_registry').create<CadastroIndustria>(payload)
  }

  await logCadastroAudit('cadastro_industria_alterado', record.nome, record.id, {
    ...options,
    detalhes: {
      ...options?.detalhes,
      acao: isUpdate ? 'atualizacao' : 'criacao',
      tradepro_client_id: record.tradepro_client_id,
    },
  })

  return record
}

// ---------------------------------------------------------------------------------
// 3. PRODUTOS & RELACIONAMENTO COM INDÚSTRIA
// ---------------------------------------------------------------------------------
export async function getCadastrosProdutos(industryId?: string): Promise<CadastroProduto[]> {
  try {
    const filter = industryId ? `industry_id = '${industryId.replace(/'/g, "\\'")}'` : ''
    const list = await pb.collection('industry_product_mix').getFullList<CadastroProduto>({
      filter: filter || undefined,
      sort: 'nome_produto',
    })

    // Carrega aliases mapeados para enriquecer
    try {
      const aliases = await pb.collection('product_aliases').getFullList<{
        produto_oficial_nome: string
        alias: string
      }>({ filter: "status = 'ativo'" })
      const aliasMap = new Map<string, string[]>()
      for (const a of aliases) {
        const k = (a.produto_oficial_nome || '').trim().toUpperCase()
        if (!aliasMap.has(k)) aliasMap.set(k, [])
        aliasMap.get(k)!.push(a.alias)
      }

      return list.map((p) => ({
        ...p,
        aliases: aliasMap.get(p.nome_produto.trim().toUpperCase()) || [],
      }))
    } catch {
      return list
    }
  } catch (err) {
    console.warn('[cadastrosService] Erro ao carregar produtos:', err)
    return []
  }
}

export async function saveCadastroProduto(
  data: Partial<CadastroProduto>,
  options?: AuditLogOptions,
): Promise<CadastroProduto> {
  const isUpdate = Boolean(data.id)
  let record: CadastroProduto

  const payload = {
    industry_id: data.industry_id,
    industry_name: data.industry_name?.trim() || '',
    codigo_produto: data.codigo_produto?.trim() || '',
    codigo_interno: data.codigo_interno?.trim() || '',
    cod_barras: data.cod_barras?.trim() || '',
    nome_produto: data.nome_produto?.trim(),
    categoria: data.categoria?.trim() || 'Geral',
    familia: data.familia?.trim() || '',
    sabor: data.sabor?.trim() || '',
    gramatura: data.gramatura?.trim() || '',
    embalagem: data.embalagem?.trim() || '',
    tipo_mix: data.tipo_mix || 'oficial_industria',
    status: data.status || 'ativo',
    shelf_life_dias: data.shelf_life_dias ? Number(data.shelf_life_dias) : 60,
    store_code_restrito: data.store_code_restrito?.trim() || '',
    app_diretoria_product_id: data.app_diretoria_product_id?.trim() || '',
  }

  if (isUpdate && data.id) {
    record = await pb.collection('industry_product_mix').update<CadastroProduto>(data.id, payload)
  } else {
    record = await pb.collection('industry_product_mix').create<CadastroProduto>(payload)
  }

  await logCadastroAudit('cadastro_produto_alterado', record.nome_produto, record.id, {
    ...options,
    detalhes: {
      ...options?.detalhes,
      acao: isUpdate ? 'atualizacao' : 'criacao',
      industry_name: record.industry_name,
      codigo_produto: record.codigo_produto,
      tipo_mix: record.tipo_mix,
    },
  })

  return record
}

// ---------------------------------------------------------------------------------
// 4. REDES
// ---------------------------------------------------------------------------------
export async function getCadastrosRedes(): Promise<CadastroRede[]> {
  try {
    const redes = await pb.collection('networks').getFullList<CadastroRede>({
      sort: 'nome',
    })

    // Contar lojas por rede
    const stores = await pb.collection('stores').getFullList<{ network_id: string }>({
      fields: 'network_id',
    })
    const countMap: Record<string, number> = {}
    for (const s of stores) {
      if (s.network_id) {
        countMap[s.network_id] = (countMap[s.network_id] || 0) + 1
      }
    }

    return redes.map((r) => ({
      ...r,
      total_lojas: countMap[r.id] || 0,
    }))
  } catch (err) {
    console.warn('[cadastrosService] Erro ao carregar redes:', err)
    return []
  }
}

export async function saveCadastroRede(
  data: Partial<CadastroRede>,
  options?: AuditLogOptions,
): Promise<CadastroRede> {
  const isUpdate = Boolean(data.id)
  let record: CadastroRede

  const payload = {
    nome: data.nome?.trim(),
    codigo_externo: data.codigo_externo?.trim() || '',
    cnpj: data.cnpj?.trim() || '',
    ativo: data.ativo !== false,
  }

  if (isUpdate && data.id) {
    record = await pb.collection('networks').update<CadastroRede>(data.id, payload)
  } else {
    record = await pb.collection('networks').create<CadastroRede>(payload)
  }

  await logCadastroAudit('cadastro_rede_alterado', record.nome, record.id, {
    ...options,
    detalhes: {
      ...options?.detalhes,
      acao: isUpdate ? 'atualizacao' : 'criacao',
    },
  })

  return record
}

// ---------------------------------------------------------------------------------
// 5. LOJAS
// ---------------------------------------------------------------------------------
export async function getCadastrosLojas(networkId?: string): Promise<CadastroLoja[]> {
  try {
    const filter = networkId ? `network_id = '${networkId.replace(/'/g, "\\'")}'` : ''
    return await pb.collection('stores').getFullList<CadastroLoja>({
      filter: filter || undefined,
      sort: 'codigo_externo',
    })
  } catch (err) {
    console.warn('[cadastrosService] Erro ao carregar lojas:', err)
    return []
  }
}

export async function saveCadastroLoja(
  data: Partial<CadastroLoja>,
  options?: AuditLogOptions,
): Promise<CadastroLoja> {
  const isUpdate = Boolean(data.id)
  let record: CadastroLoja

  const payload = {
    codigo_externo: data.codigo_externo?.trim() || data.codigo_loja?.trim() || '',
    codigo_loja: data.codigo_externo?.trim() || data.codigo_loja?.trim() || '',
    nome: data.nome?.trim() || data.nome_loja?.trim() || '',
    nome_loja: data.nome?.trim() || data.nome_loja?.trim() || '',
    razao_social: data.razao_social?.trim() || data.nome?.trim() || '',
    network_id: data.network_id || null,
    rede_nome: data.rede_nome?.trim() || '',
    cnpj: data.cnpj?.trim() || '',
    cidade: data.cidade?.trim() || '',
    estado: data.estado?.trim() || '',
    regiao: data.regiao?.trim() || '',
    ativo: data.ativo !== false,
    app_diretoria_store_id: data.app_diretoria_store_id?.trim() || '',
  }

  if (isUpdate && data.id) {
    record = await pb.collection('stores').update<CadastroLoja>(data.id, payload)
  } else {
    record = await pb.collection('stores').create<CadastroLoja>(payload)
  }

  await logCadastroAudit('cadastro_loja_alterado', record.razao_social || record.nome, record.id, {
    ...options,
    detalhes: {
      ...options?.detalhes,
      acao: isUpdate ? 'atualizacao' : 'criacao',
      codigo_externo: record.codigo_externo,
      network_id: record.network_id,
      rede_nome: record.rede_nome,
    },
  })

  return record
}

// ---------------------------------------------------------------------------------
// 6. SUPERVISORES
// ---------------------------------------------------------------------------------
export async function getCadastrosSupervisores(): Promise<CadastroSupervisor[]> {
  try {
    const sups = await pb.collection('supervisors').getFullList<CadastroSupervisor>({
      sort: 'nome',
    })

    // Contar promotores por supervisor
    const proms = await pb.collection('promoters').getFullList<{ supervisor_id: string }>({
      fields: 'supervisor_id',
    })
    const countMap: Record<string, number> = {}
    for (const p of proms) {
      if (p.supervisor_id) {
        countMap[p.supervisor_id] = (countMap[p.supervisor_id] || 0) + 1
      }
    }

    return sups.map((s) => ({
      ...s,
      total_promotores: countMap[s.id] || 0,
    }))
  } catch (err) {
    console.warn('[cadastrosService] Erro ao carregar supervisores:', err)
    return []
  }
}

export async function saveCadastroSupervisor(
  data: Partial<CadastroSupervisor>,
  options?: AuditLogOptions,
): Promise<CadastroSupervisor> {
  const isUpdate = Boolean(data.id)
  let record: CadastroSupervisor

  const payload = {
    nome: data.nome?.trim(),
    codigo_externo: data.codigo_externo?.trim() || '',
    telefone: data.telefone?.trim() || '',
    email: data.email?.trim() || '',
    status: data.status || 'ativo',
    regiao: data.regiao?.trim() || '',
    observacoes: data.observacoes?.trim() || '',
    app_diretoria_supervisor_id: data.app_diretoria_supervisor_id?.trim() || '',
  }

  if (isUpdate && data.id) {
    record = await pb.collection('supervisors').update<CadastroSupervisor>(data.id, payload)
  } else {
    record = await pb.collection('supervisors').create<CadastroSupervisor>(payload)
  }

  await logCadastroAudit('cadastro_supervisor_alterado', record.nome, record.id, {
    ...options,
    detalhes: {
      ...options?.detalhes,
      acao: isUpdate ? 'atualizacao' : 'criacao',
      codigo_externo: record.codigo_externo,
    },
  })

  return record
}

// ---------------------------------------------------------------------------------
// 7. PROMOTORES
// ---------------------------------------------------------------------------------
export async function getCadastrosPromotores(): Promise<CadastroPromotor[]> {
  try {
    const proms = await pb.collection('promoters').getFullList<CadastroPromotor>({
      sort: 'nome',
    })

    // Carrega assignments ativos para calcular lojas e indústrias
    const assignments = await pb
      .collection('store_promoter_assignments')
      .getFullList<CadastroPromotorAssignment>({
        filter: "status = 'ativo'",
      })
    const storeCountMap = new Map<string, Set<string>>()
    const indMap = new Map<string, Set<string>>()

    for (const a of assignments) {
      if (!storeCountMap.has(a.promoter_id)) storeCountMap.set(a.promoter_id, new Set())
      if (a.store_code) storeCountMap.get(a.promoter_id)!.add(a.store_code)

      if (!indMap.has(a.promoter_id)) indMap.set(a.promoter_id, new Set())
      if (a.industry_name) indMap.get(a.promoter_id)!.add(a.industry_name)
    }

    return proms.map((p) => ({
      ...p,
      total_lojas: storeCountMap.get(p.id)?.size || 0,
      industrias_relacionadas: Array.from(indMap.get(p.id) || []),
    }))
  } catch (err) {
    console.warn('[cadastrosService] Erro ao carregar promotores:', err)
    return []
  }
}

export async function saveCadastroPromotor(
  data: Partial<CadastroPromotor>,
  options?: AuditLogOptions,
): Promise<CadastroPromotor> {
  const isUpdate = Boolean(data.id)
  let record: CadastroPromotor

  const payload = {
    nome: data.nome?.trim(),
    codigo_externo: data.codigo_externo?.trim() || '',
    telefone: data.telefone?.trim() || '',
    cpf: data.cpf?.trim() || '',
    supervisor_id: data.supervisor_id || null,
    supervisor_nome: data.supervisor_nome?.trim() || '',
    status: data.status || 'ativo',
    regiao: data.regiao?.trim() || '',
    observacoes: data.observacoes?.trim() || '',
    app_diretoria_promoter_id: data.app_diretoria_promoter_id?.trim() || '',
  }

  if (isUpdate && data.id) {
    record = await pb.collection('promoters').update<CadastroPromotor>(data.id, payload)
  } else {
    record = await pb.collection('promoters').create<CadastroPromotor>(payload)
  }

  await logCadastroAudit('cadastro_promotor_alterado', record.nome, record.id, {
    ...options,
    detalhes: {
      ...options?.detalhes,
      acao: isUpdate ? 'atualizacao' : 'criacao',
      codigo_externo: record.codigo_externo,
      supervisor_id: record.supervisor_id,
    },
  })

  return record
}

// ---------------------------------------------------------------------------------
// 8. RELAÇÕES PROMOTOR × LOJA (Assignments)
// ---------------------------------------------------------------------------------
export async function getPromoterAssignments(
  promoterId?: string,
  storeCode?: string,
): Promise<CadastroPromotorAssignment[]> {
  try {
    const filters: string[] = []
    if (promoterId) filters.push(`promoter_id = '${promoterId.replace(/'/g, "\\'")}'`)
    if (storeCode) filters.push(`store_code = '${storeCode.replace(/'/g, "\\'")}'`)

    return await pb
      .collection('store_promoter_assignments')
      .getFullList<CadastroPromotorAssignment>({
        filter: filters.length ? filters.join(' && ') : undefined,
        sort: '-created',
      })
  } catch (err) {
    console.warn('[cadastrosService] Erro ao carregar alocações de promotor:', err)
    return []
  }
}

export async function assignPromoterToStore(
  data: Partial<CadastroPromotorAssignment>,
  options?: AuditLogOptions,
): Promise<CadastroPromotorAssignment> {
  const payload = {
    promoter_id: data.promoter_id,
    promoter_nome: data.promoter_nome?.trim() || '',
    store_id: data.store_id || null,
    store_code: data.store_code?.trim() || '',
    store_name: data.store_name?.trim() || '',
    industry_id: data.industry_id || null,
    industry_name: data.industry_name?.trim() || '',
    status: data.status || 'ativo',
    data_inicio: data.data_inicio || new Date().toISOString().split('T')[0],
    data_fim: data.data_fim || '',
    observacao: data.observacao?.trim() || '',
  }

  const record = await pb
    .collection('store_promoter_assignments')
    .create<CadastroPromotorAssignment>(payload)

  await logCadastroAudit(
    'promotor_alocado_loja',
    `${record.promoter_nome} -> ${record.store_name}`,
    record.id,
    {
      ...options,
      detalhes: {
        ...options?.detalhes,
        promoter_id: record.promoter_id,
        store_code: record.store_code,
        industry_name: record.industry_name,
      },
    },
  )

  return record
}

// ---------------------------------------------------------------------------------
// 9. PENDÊNCIAS DE CADASTRO (Fila de Resolução Estrutural)
// ---------------------------------------------------------------------------------
export async function getCadastrosPendencias(tipo?: string): Promise<CadastroPendencia[]> {
  try {
    const filter = tipo ? `tipo_entidade = '${tipo}' && status = 'pendente'` : "status = 'pendente'"
    return await pb.collection('cadastros_pendencias').getFullList<CadastroPendencia>({
      filter,
      sort: '-volume_ocorrencias,-created',
    })
  } catch (err) {
    console.warn('[cadastrosService] Erro ao carregar pendências:', err)
    return []
  }
}

export async function createCadastroPendencia(data: {
  tipo_entidade: CadastroPendencia['tipo_entidade']
  valor_identificador: string
  codigo_externo?: string
  nome_identificado?: string
  origem_fonte: string
  contexto_adicional?: Record<string, unknown>
}): Promise<CadastroPendencia> {
  try {
    // Evita duplicidade se já existir pendência aberta com mesmo valor e tipo
    const valEscaped = data.valor_identificador.trim().replace(/'/g, "\\'")
    const existing = await pb.collection('cadastros_pendencias').getList<CadastroPendencia>(1, 1, {
      filter: `tipo_entidade = '${data.tipo_entidade}' && valor_identificador = '${valEscaped}' && status = 'pendente'`,
    })

    if (existing.items.length > 0) {
      const p = existing.items[0]
      return await pb.collection('cadastros_pendencias').update<CadastroPendencia>(p.id, {
        volume_ocorrencias: (p.volume_ocorrencias || 1) + 1,
      })
    }

    return await pb.collection('cadastros_pendencias').create<CadastroPendencia>({
      tipo_entidade: data.tipo_entidade,
      valor_identificador: data.valor_identificador.trim(),
      codigo_externo: data.codigo_externo?.trim() || '',
      nome_identificado: data.nome_identificado?.trim() || '',
      contexto_adicional: data.contexto_adicional || {},
      origem_fonte: data.origem_fonte,
      status: 'pendente',
      volume_ocorrencias: 1,
    })
  } catch (err) {
    console.warn('[cadastrosService] Erro ao criar pendência:', err)
    throw err
  }
}

export async function resolveCadastroPendencia(
  pendenciaId: string,
  resolucao: {
    entidade_resolvida_id: string
    entidade_resolvida_nome: string
    observacao?: string
    userName?: string
  },
): Promise<CadastroPendencia> {
  const record = await pb
    .collection('cadastros_pendencias')
    .update<CadastroPendencia>(pendenciaId, {
      status: 'vinculado',
      entidade_resolvida_id: resolucao.entidade_resolvida_id,
      entidade_resolvida_nome: resolucao.entidade_resolvida_nome,
      resolvido_por: resolucao.userName || 'Operador',
      resolvido_em: new Date().toISOString(),
      observacao_resolucao: resolucao.observacao || '',
    })

  await logCadastroAudit(
    'pendencia_cadastro_resolvida',
    record.nome_identificado || record.valor_identificador,
    record.id,
    {
      executorNome: resolucao.userName,
      detalhes: {
        tipo_entidade: record.tipo_entidade,
        entidade_resolvida_id: resolucao.entidade_resolvida_id,
        entidade_resolvida_nome: resolucao.entidade_resolvida_nome,
      },
    },
  )

  return record
}

// ---------------------------------------------------------------------------------
// 10. REAVALIAÇÃO DE RUPTURAS "NÃO IDENTIFICADA" (Preserva Semântica Estrita)
// ---------------------------------------------------------------------------------
/**
 * Reavalia registros com Indústria "Não identificada" em rupturas_base:
 * 1. Primeiro verifica Cliente TradePro cadastrado em industry_registry
 * 2. Em seguida, busca Produto no Mix Oficial (se pertencer a exatamente uma indústria)
 * 3. NUNCA deriva por Fantasia ou Razão Social
 */
export async function reavaliarRupturasNaoIdentificadas(
  userName = 'Operador',
): Promise<{ processadas: number; recuperadas: number }> {
  let processadas = 0
  let recuperadas = 0

  try {
    // 1. Carrega todas indústrias cadastradas com tradepro_client_id
    const industrias = await getCadastrosIndustrias()
    const clientMap = new Map<string, CadastroIndustria>()
    for (const ind of industrias) {
      if (ind.tradepro_client_id) {
        clientMap.set(ind.tradepro_client_id.trim(), ind)
      }
    }

    // 2. Carrega catálogo mestre de produtos
    const produtos = await getCadastrosProdutos()
    // Mapa nome_normalizado -> set de indústrias
    const produtoIndMap = new Map<string, Set<{ id: string; nome: string }>>()
    for (const p of produtos) {
      const norm = normalizarNomeProduto(p.nome_produto)
      if (!produtoIndMap.has(norm)) {
        produtoIndMap.set(norm, new Set())
      }
      produtoIndMap.get(norm)!.add({ id: p.industry_id, nome: p.industry_name })
    }

    // 3. Busca rupturas não identificadas
    const rupturas = await pb.collection('rupturas_base').getList<{
      id: string
      codigo_cliente?: string
      produto?: string
      cliente?: string
    }>(1, 200, {
      filter: "cliente = 'Não identificada'",
    })

    for (const r of rupturas.items) {
      processadas++
      let indEncontrada: { id: string; nome: string } | null = null

      // Passo 1: Cód. Cliente
      const codCliente = (r.codigo_cliente || '').trim()
      if (codCliente && clientMap.has(codCliente)) {
        const ind = clientMap.get(codCliente)!
        indEncontrada = { id: ind.id, nome: ind.nome }
      }

      // Passo 2: Produto oficial unívoco (pertence exclusivamente a uma única indústria)
      if (!indEncontrada && r.produto) {
        const norm = normalizarNomeProduto(r.produto)
        const candidatos = produtoIndMap.get(norm)
        if (candidatos && candidatos.size === 1) {
          indEncontrada = Array.from(candidatos)[0]
        }
      }

      // Se encontrou com segurança total
      if (indEncontrada) {
        try {
          await pb.collection('rupturas_base').update(r.id, {
            cliente: indEncontrada.nome,
          })
          recuperadas++
        } catch {
          /* intentionally ignored */
        }
      }
    }

    if (recuperadas > 0) {
      await logCadastroAudit(
        'rupturas_reavaliadas_indústria',
        `${recuperadas} rupturas identificadas`,
        'rupturas_base',
        {
          executorNome: userName,
          detalhes: { processadas, recuperadas },
        },
      )
    }
  } catch (err) {
    console.warn('[cadastrosService] Erro ao reavaliar rupturas não identificadas:', err)
  }

  return { processadas, recuperadas }
}

// ---------------------------------------------------------------------------------
// 11. PRIMEIRA CAMADA DE INTELIGÊNCIA DE MIX (Leituras Operacionais Explicáveis)
// ---------------------------------------------------------------------------------
/**
 * Compara presença operacional de produtos entre lojas comparáveis da MESMA REDE.
 * LINGUAGEM CUIDADOSA OBRIGATÓRIA:
 * Nunca afirma "o produto vende bem" ou "tem maior faturamento" sem fonte comercial.
 * Analisa estritamente presença física observada nas lojas do grupo.
 */
export async function getMixOpportunityAnalyses(
  storeCode: string,
): Promise<MixOpportunityAnalysis[]> {
  try {
    // 1. Identifica loja e sua rede
    const stores = await pb.collection('stores').getList<CadastroLoja>(1, 1, {
      filter: `codigo_externo = '${storeCode.replace(/'/g, "\\'")}' || codigo_loja = '${storeCode.replace(/'/g, "\\'")}'`,
    })
    if (stores.items.length === 0) return []
    const targetStore = stores.items[0]
    const networkId = targetStore.network_id
    if (!networkId) return []

    // 2. Lojas da mesma rede
    const peerStores = await pb.collection('stores').getFullList<CadastroLoja>({
      filter: `network_id = '${networkId}' && ativo = true`,
    })
    const peerCodes = peerStores.map((s) => s.codigo_externo || s.codigo_loja || '').filter(Boolean)
    if (peerCodes.length <= 1) return []

    // 3. Mix Definido da Loja Alvo
    const targetDefinedMix = await pb
      .collection('industry_store_product_mix')
      .getFullList<IndustryStoreProductMix>({
        filter: `store_code = '${storeCode}' && status = 'ativo'`,
      })
    const definedNames = new Set(targetDefinedMix.map((m) => m.nome_produto.trim().toUpperCase()))

    // 4. Produtos observados recentemente na rede (validades_base)
    const validadesRede = await pb.collection('validades_base').getList<{
      produto: string
      codigo_loja: string
      cliente: string
      cod_produto?: string
    }>(1, 500, {
      filter: `network_id = '${networkId}' || rede = '${targetStore.rede_nome?.replace(/'/g, "\\'")}'`,
    })

    // Contagem de lojas da rede onde cada produto foi observado
    const productPresenceInNetwork = new Map<
      string,
      {
        produto: string
        cliente: string
        codProduto?: string
        storesWithPresence: Set<string>
      }
    >()

    for (const v of validadesRede.items) {
      const pName = (v.produto || '').trim()
      if (!pName) continue
      const upper = pName.toUpperCase()

      if (!productPresenceInNetwork.has(upper)) {
        productPresenceInNetwork.set(upper, {
          produto: pName,
          cliente: v.cliente || 'Geral',
          codProduto: v.cod_produto,
          storesWithPresence: new Set(),
        })
      }
      if (v.codigo_loja) {
        productPresenceInNetwork.get(upper)!.storesWithPresence.add(v.codigo_loja)
      }
    }

    // 5. Identifica oportunidades explicáveis (presente em >= 50% das outras lojas da rede, mas ausente do mix definido da loja)
    const opportunities: MixOpportunityAnalysis[] = []
    const totalPeers = peerCodes.length

    for (const [prodUpper, data] of productPresenceInNetwork.entries()) {
      if (!definedNames.has(prodUpper)) {
        const presenceCount = data.storesWithPresence.size
        const pct = Math.round((presenceCount / totalPeers) * 100)

        // Se observado em pelo menos metade das lojas da mesma rede
        if (presenceCount >= Math.ceil(totalPeers * 0.4) && presenceCount >= 2) {
          opportunities.push({
            produtoNome: data.produto,
            codigoProduto: data.codProduto,
            industriaNome: data.cliente,
            lojaCodigo: targetStore.codigo_externo,
            lojaNome: targetStore.razao_social || targetStore.nome,
            redeNome: targetStore.rede_nome || 'Rede',
            motivo: `Observado operacionalmente em ${presenceCount} de ${totalPeers} lojas (${pct}%) da rede ${targetStore.rede_nome || ''}. Ausente do Mix Definido desta unidade.`,
            totalLojasRede: totalPeers,
            lojasComPresencaRede: presenceCount,
            percentualPresencaRede: pct,
            statusSugerido: 'avaliacao_inclusao_mix',
          })
        }
      }
    }

    return opportunities
  } catch (err) {
    console.warn('[cadastrosService] Erro ao calcular oportunidades de mix:', err)
    return []
  }
}
