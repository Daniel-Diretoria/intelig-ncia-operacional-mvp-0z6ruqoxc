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
  OperacionalVisita,
  CadastroConflito,
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

export interface MixBatchActionResult {
  totalSolicitados: number
  sucessos: number
  falhas: number
  erros: { id: string; nome: string; erro: string }[]
  acao: 'adicionar_mix_oficial' | 'remover_mix_oficial' | 'promover_observado_oficial'
}

/**
 * Executa ações em lote sobre o Mix Oficial de Produtos
 * - 'adicionar_mix_oficial': define tipo_mix = 'oficial_industria' para os produtos selecionados
 * - 'remover_mix_oficial': define tipo_mix = 'observado_operacional' para os produtos selecionados (sem deletar nem perder histórico)
 * - 'promover_observado_oficial': promove produtos observados para mix oficial de forma explícita
 *
 * REGRA OBRIGATÓRIA: NUNCA promove automaticamente. Sempre disparado por ação explícita com auditoria.
 */
export async function executeMixBatchAction(
  produtosIds: string[],
  acao: 'adicionar_mix_oficial' | 'remover_mix_oficial' | 'promover_observado_oficial',
  produtosBase: CadastroProduto[],
  options?: AuditLogOptions,
): Promise<MixBatchActionResult> {
  const result: MixBatchActionResult = {
    totalSolicitados: produtosIds.length,
    sucessos: 0,
    falhas: 0,
    erros: [],
    acao,
  }

  // Semântica estrita Bloco A (item 32):
  // 'remover_mix_oficial' -> define tipo_mix = 'fora_mix_oficial' (Produto cadastrado mas não pertencente ao Mix Oficial atual).
  // NÃO transforma em observado_operacional. 'observado_operacional' é reservado para produtos observados na operação!
  const novoTipoMix = acao === 'remover_mix_oficial' ? 'fora_mix_oficial' : 'oficial_industria'

  const produtosAlvo = produtosBase.filter((p) => produtosIds.includes(p.id))

  for (const produto of produtosAlvo) {
    // Se for promoção de observado para oficial, garantir que produtos observados ou fora do mix oficial são afetados
    if (acao === 'promover_observado_oficial' && produto.tipo_mix === 'oficial_industria') {
      continue
    }

    try {
      await pb.collection('industry_product_mix').update(produto.id, {
        tipo_mix: novoTipoMix,
      })
      result.sucessos += 1
    } catch (err: any) {
      result.falhas += 1
      result.erros.push({
        id: produto.id,
        nome: produto.nome_produto,
        erro: err?.message || 'Erro desconhecido ao atualizar produto',
      })
    }
  }

  // Registrar auditoria em lote
  await logCadastroAudit(
    'mix_acao_em_lote',
    `Ação em Lote: ${acao} (${result.sucessos}/${result.totalSolicitados})`,
    'batch_mix',
    {
      ...options,
      detalhes: {
        ...options?.detalhes,
        acao,
        totalSolicitados: result.totalSolicitados,
        sucessos: result.sucessos,
        falhas: result.falhas,
        novoTipoMix,
        produtosAfetados: produtosAlvo.map((p) => ({
          id: p.id,
          nome: p.nome_produto,
          industria: p.industry_name,
        })),
      },
    },
  )

  return result
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

/**
 * Move uma Loja para outra Rede de forma auditada
 */
export async function moverLojaDeRede(
  lojaId: string,
  novaRedeId: string | null,
  novaRedeNome: string,
  options?: AuditLogOptions,
): Promise<CadastroLoja> {
  const lojaAtual = await pb.collection('stores').getOne<CadastroLoja>(lojaId)
  const redeAnterior = lojaAtual.rede_nome || 'Sem Rede'

  const record = await pb.collection('stores').update<CadastroLoja>(lojaId, {
    network_id: novaRedeId || null,
    rede_nome: novaRedeNome || '',
  })

  await logCadastroAudit('loja_movida_de_rede', record.razao_social || record.nome, record.id, {
    ...options,
    detalhes: {
      rede_anterior: redeAnterior,
      nova_rede: novaRedeNome,
      novo_network_id: novaRedeId,
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
  // Transição temporal: Se estiver alocando um novo promotor ativo para a mesma loja/indústria,
  // encerra a alocação anterior e registra o histórico temporal completo
  if (data.store_code && data.status !== 'encerrado') {
    try {
      const ativas = await pb
        .collection('store_promoter_assignments')
        .getFullList<CadastroPromotorAssignment>({
          filter: `store_code = '${data.store_code.replace(/'/g, "\\'")}' && status = 'ativo'`,
        })
      const todayStr = new Date().toISOString().split('T')[0]
      for (const a of ativas) {
        if (a.promoter_id !== data.promoter_id) {
          await pb.collection('store_promoter_assignments').update(a.id, {
            status: 'encerrado',
            data_fim: todayStr,
            observacao:
              `${a.observacao || ''} [Encerrado por substituição temporal em ${todayStr}]`.trim(),
          })
          await logCadastroAudit(
            'promotor_desalocado_loja',
            `${a.promoter_nome} -> ${a.store_name}`,
            a.id,
            {
              detalhes: {
                motivo: 'substituicao_temporal',
                substituto_id: data.promoter_id,
                substituto_nome: data.promoter_nome,
              },
            },
          )
        }
      }
    } catch {
      /* non-fatal */
    }
  }

  const payload = {
    promoter_id: data.promoter_id,
    promoter_nome: data.promoter_nome?.trim() || '',
    store_id: data.store_id || null,
    store_code: data.store_code?.trim() || '',
    store_name: data.store_name?.trim() || '',
    industry_id: data.industry_id || null,
    industry_name: data.industry_name?.trim() || '',
    status: data.status || 'ativo',
    tipo_vinculo: data.tipo_vinculo || 'confirmado',
    origem_vinculo: data.origem_vinculo || 'manual',
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
        tipo_vinculo: record.tipo_vinculo,
      },
    },
  )

  return record
}

/**
 * Confirma relação observada como roteiro/cobertura permanente da loja
 */
export async function confirmarVinculoObservado(
  assignmentId: string,
  options?: AuditLogOptions,
): Promise<CadastroPromotorAssignment> {
  const record = await pb
    .collection('store_promoter_assignments')
    .update<CadastroPromotorAssignment>(assignmentId, {
      tipo_vinculo: 'confirmado',
      origem_vinculo: 'Confirmado manualmente pelo operador',
      observacao: 'Roteiro confirmado como cobertura oficial.',
    })

  await logCadastroAudit(
    'vinculo_observado_confirmado',
    `${record.promoter_nome} -> ${record.store_name}`,
    record.id,
    options,
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
export interface ReavaliacaoRupturasResultado {
  analisados: number
  identificados: number
  precisamRevisao: number
  semIdentificacao: number
  detalhes: Array<{
    id: string
    produto: string
    loja: string
    status: 'identificado' | 'revisao' | 'sem_identificacao'
    industria?: string
    origemResolucao?: string
    possiveisCorrespondencias?: string[]
  }>
}

/**
 * Reavalia registros com Indústria "Não identificada" ou vazia em rupturas_base na base ativa.
 *
 * Hierarquia obrigatória:
 * 1) Cód. Cliente TradePro (tradepro_client_id em industry_registry, nunca por nome);
 * 2) Cliente bruto preservado (dados_brutos_json / tradepro_cliente_nome quando compatível com tradepro_client_id);
 * 3) Produto oficial e relação Produto → Indústria agrupada em Set<string> de industry_id (Set.size === 1: correspondência unívoca segura; Set.size > 1: ambíguo, envia para revisão);
 * 4) Resolvedor de Produtos com catálogo de produtos oficiais;
 * 5) Mix Oficial da Indústria (produto exclusivo do Mix Oficial = evidência forte unívoca; registrar origem);
 * 6) Ambiguidade real (Set.size > 1) -> NUNCA forçar atribuição. Fila de pendências / 'precisamRevisao';
 * NUNCA usar Rede, Loja ou Fornecedor (DIRETORIA) como substituto de indústria.
 */
export async function reavaliarRupturasNaoIdentificadas(
  userName = 'Operador',
): Promise<ReavaliacaoRupturasResultado> {
  const resultado: ReavaliacaoRupturasResultado = {
    analisados: 0,
    identificados: 0,
    precisamRevisao: 0,
    semIdentificacao: 0,
    detalhes: [],
  }

  try {
    // 1. Carrega todas as indústrias cadastradas com tradepro_client_id
    const industrias = await getCadastrosIndustrias()
    const clientMap = new Map<string, CadastroIndustria>()
    const industryById = new Map<string, CadastroIndustria>()

    for (const ind of industrias) {
      industryById.set(ind.id, ind)
      if (ind.tradepro_client_id) {
        clientMap.set(ind.tradepro_client_id.trim(), ind)
      }
    }

    // 2. Carrega catálogo mestre de produtos
    const produtos = await getCadastrosProdutos()

    // Mapeamento normalizado:
    // Chave: nome_normalizado -> Map<industry_id, { id: string; nome: string; mixOficial: boolean }>
    // Agrupa por INDÚSTRIAS ÚNICAS (Set de industry_id) para que produtos repetidos 3x na mesma indústria FRUTAP não gerem falso conflito!
    const produtoIndMap = new Map<
      string,
      Map<string, { id: string; nome: string; mixOficial: boolean }>
    >()

    for (const p of produtos) {
      if (!p.industry_id) continue
      const norm = normalizarNomeProduto(p.nome_produto)
      if (!norm) continue

      if (!produtoIndMap.has(norm)) {
        produtoIndMap.set(norm, new Map())
      }
      const indMap = produtoIndMap.get(norm)!
      const isOficial = p.tipo_mix === 'oficial_industria'

      if (!indMap.has(p.industry_id)) {
        indMap.set(p.industry_id, {
          id: p.industry_id,
          nome: p.industry_name || industryById.get(p.industry_id)?.nome || 'Indústria',
          mixOficial: isOficial,
        })
      } else if (isOficial) {
        indMap.get(p.industry_id)!.mixOficial = true
      }
    }

    // 3. Paginação em LOOP acumulando TODOS os registros elegíveis da base ativa (perPage=100)
    type RupturaItem = {
      id: string
      codigo_cliente?: string
      produto?: string
      cliente?: string
      nome_loja?: string
      codigo_loja?: string
      dados_brutos_json?: any
      tradepro_cliente_nome?: string
    }

    const rupturasElegiveis: RupturaItem[] = []
    let page = 1
    let totalPages = 1
    const perPage = 100

    do {
      const resp = await pb.collection('rupturas_base').getList<RupturaItem>(page, perPage, {
        filter:
          "is_base_atual = true && (cliente = '' || cliente = 'Não identificada' || cliente = null)",
      })
      totalPages = resp.totalPages || 1
      rupturasElegiveis.push(...resp.items)
      page++
    } while (page <= totalPages)

    // Se a base ativa não tinha nenhum registro elegível ou filtro retornou vazio, tenta sem is_base_atual estrito
    // caso o ambiente não tenha marcado is_base_atual ainda
    if (rupturasElegiveis.length === 0) {
      let pageLegacy = 1
      let totalPagesLegacy = 1
      do {
        const resp = await pb
          .collection('rupturas_base')
          .getList<RupturaItem>(pageLegacy, perPage, {
            filter: "cliente = '' || cliente = 'Não identificada' || cliente = null",
          })
        totalPagesLegacy = resp.totalPages || 1
        rupturasElegiveis.push(...resp.items)
        pageLegacy++
      } while (pageLegacy <= totalPagesLegacy)
    }

    resultado.analisados = rupturasElegiveis.length

    // 4. Processar cada ruptura com a hierarquia estrita
    for (const r of rupturasElegiveis) {
      let indEncontrada: { id: string; nome: string } | null = null
      let origemResolucao = ''
      const possiveisCorrespondencias: string[] = []

      // Passo 1: Cód. Cliente TradePro via industry_registry (NUNCA por nome)
      const codCliente = (r.codigo_cliente || '').trim()
      if (codCliente && clientMap.has(codCliente)) {
        const ind = clientMap.get(codCliente)!
        indEncontrada = { id: ind.id, nome: ind.nome }
        origemResolucao = 'Código de Cliente TradePro'
      }

      // Passo 2: Cliente bruto preservado (dados_brutos_json)
      if (!indEncontrada && r.dados_brutos_json) {
        const rawJson = r.dados_brutos_json
        const rawCod = String(rawJson?.idCliente || rawJson?.codigoCliente || '').trim()
        if (rawCod && clientMap.has(rawCod)) {
          const ind = clientMap.get(rawCod)!
          indEncontrada = { id: ind.id, nome: ind.nome }
          origemResolucao = 'Cliente Bruto Preservado (TradePro ID)'
        }
      }

      // Passo 3: Produto oficial agrupado por indústrias únicas
      const prodNome = (r.produto || '').trim()
      const prodNorm = normalizarNomeProduto(prodNome)

      if (!indEncontrada && prodNorm) {
        const indMap = produtoIndMap.get(prodNorm)

        if (indMap) {
          const distinctIndustries = Array.from(indMap.values())

          // Set.size === 1: correspondência unívoca (mesmo produto repetido 3x na Frutap continua sendo 1)
          if (distinctIndustries.length === 1) {
            indEncontrada = {
              id: distinctIndustries[0].id,
              nome: distinctIndustries[0].nome,
            }
            origemResolucao = distinctIndustries[0].mixOficial
              ? 'Mix Oficial da Indústria (Correspondência Única)'
              : 'Produto Cadastrado (Correspondência Única)'
          } else if (distinctIndustries.length > 1) {
            // Ambiguidade real: Set.size > 1
            // Avaliar se existe uma indústria onde o produto é EXCLUSIVO do Mix Oficial
            const oficiais = distinctIndustries.filter((d) => d.mixOficial)
            if (oficiais.length === 1) {
              indEncontrada = { id: oficiais[0].id, nome: oficiais[0].nome }
              origemResolucao = 'Mix Oficial Exclusivo da Indústria'
            } else {
              // Ambiguidade persistente: NUNCA forçar
              possiveisCorrespondencias.push(...distinctIndustries.map((d) => d.nome))
            }
          }
        }
      }

      // Passo 4: Se ainda não encontrou e temos nome de produto, busca por similaridade semântica
      // Mas exigindo correspondência segura unívoca por indústrias
      if (!indEncontrada && prodNorm && possiveisCorrespondencias.length === 0) {
        // Tenta encontrar produtos no catálogo que contenham as palavras principais
        const candidatasMap = new Map<string, { id: string; nome: string }>()
        for (const [pNorm, indMap] of produtoIndMap.entries()) {
          if (pNorm === prodNorm || pNorm.includes(prodNorm) || prodNorm.includes(pNorm)) {
            for (const ind of indMap.values()) {
              candidatasMap.set(ind.id, { id: ind.id, nome: ind.nome })
            }
          }
        }

        const distinctCands = Array.from(candidatasMap.values())
        if (distinctCands.length === 1) {
          indEncontrada = distinctCands[0]
          origemResolucao = 'Resolvedor de Produtos (Semântica Unívoca)'
        } else if (distinctCands.length > 1) {
          possiveisCorrespondencias.push(...distinctCands.map((c) => c.nome))
        }
      }

      // 5. Destino de cada registro
      if (indEncontrada) {
        try {
          await pb.collection('rupturas_base').update(r.id, {
            cliente: indEncontrada.nome,
          })
          resultado.identificados++
          resultado.detalhes.push({
            id: r.id,
            produto: r.produto || 'Sem produto',
            loja: r.nome_loja || r.codigo_loja || 'Loja',
            status: 'identificado',
            industria: indEncontrada.nome,
            origemResolucao,
          })
        } catch (updateErr) {
          console.warn(
            '[cadastrosService] Falha ao atualizar ruptura identificada:',
            r.id,
            updateErr,
          )
        }
      } else if (possiveisCorrespondencias.length > 0) {
        resultado.precisamRevisao++
        resultado.detalhes.push({
          id: r.id,
          produto: r.produto || 'Sem produto',
          loja: r.nome_loja || r.codigo_loja || 'Loja',
          status: 'revisao',
          possiveisCorrespondencias,
        })

        // Envia para a fila de pendências para governança humana
        try {
          await createCadastroPendencia({
            tipo_entidade: 'produto',
            valor_identificador: r.produto || 'Produto sem identificação',
            nome_identificado: r.produto,
            origem_fonte: 'reavaliacao_rupturas_ambigua',
            contexto_adicional: {
              ruptura_id: r.id,
              loja: r.nome_loja,
              codigo_loja: r.codigo_loja,
              possiveis_correspondencias: possiveisCorrespondencias,
            },
          })
        } catch {
          /* non-fatal */
        }
      } else {
        resultado.semIdentificacao++
        resultado.detalhes.push({
          id: r.id,
          produto: r.produto || 'Sem produto',
          loja: r.nome_loja || r.codigo_loja || 'Loja',
          status: 'sem_identificacao',
        })
      }
    }

    if (resultado.identificados > 0 || resultado.precisamRevisao > 0) {
      await logCadastroAudit(
        'rupturas_reavaliadas_indústria',
        `${resultado.identificados} identificadas, ${resultado.precisamRevisao} em revisão de ${resultado.analisados} analisadas`,
        'rupturas_base',
        {
          executorNome: userName,
          detalhes: {
            analisados: resultado.analisados,
            identificados: resultado.identificados,
            precisamRevisao: resultado.precisamRevisao,
            semIdentificacao: resultado.semIdentificacao,
          },
        },
      )
    }
  } catch (err) {
    console.warn('[cadastrosService] Erro ao reavaliar rupturas não identificadas:', err)
  }

  return resultado
}

// Item 1 verificado: reavaliação de rupturas não identificadas com paginação em loop completa
// ---------------------------------------------------------------------------------
// 10.1 VISITAS OPERACIONAIS (Fundação de Controle de Visitas)
// ---------------------------------------------------------------------------------
export async function getOperacionalVisitas(filters?: {
  promoterId?: string
  promoterCod?: string
  storeCode?: string
  data?: string
}): Promise<OperacionalVisita[]> {
  try {
    const f: string[] = []
    if (filters?.promoterId) f.push(`promoter_id = '${filters.promoterId.replace(/'/g, "\\'")}'`)
    if (filters?.promoterCod) f.push(`promoter_cod = '${filters.promoterCod.replace(/'/g, "\\'")}'`)
    if (filters?.storeCode) f.push(`store_code = '${filters.storeCode.replace(/'/g, "\\'")}'`)
    if (filters?.data) f.push(`data = '${filters.data.replace(/'/g, "\\'")}'`)

    return await pb.collection('operacional_visitas').getFullList<OperacionalVisita>({
      filter: f.length ? f.join(' && ') : undefined,
      sort: '-data,-hora_inicio',
    })
  } catch (err) {
    console.warn('[cadastrosService] Erro ao carregar visitas operacionais:', err)
    return []
  }
}

export async function recordOperacionalVisita(
  data: Partial<OperacionalVisita>,
  options?: AuditLogOptions,
): Promise<OperacionalVisita> {
  const payload = {
    data: data.data || new Date().toISOString().split('T')[0],
    promoter_id: data.promoter_id || null,
    promoter_cod: data.promoter_cod?.trim() || '',
    promoter_nome: data.promoter_nome?.trim() || '',
    store_id: data.store_id || null,
    store_code: data.store_code?.trim() || '',
    store_name: data.store_name?.trim() || '',
    industry_name: data.industry_name?.trim() || '',
    hora_inicio: data.hora_inicio?.trim() || '',
    hora_fim: data.hora_fim?.trim() || '',
    duracao_minutos: data.duracao_minutos || 0,
    status_roteiro: data.status_roteiro?.trim() || 'concluida',
    sequencia: data.sequencia || 1,
    origem_fonte: data.origem_fonte || 'manual',
    observacao: data.observacao?.trim() || '',
    dados_brutos_json: data.dados_brutos_json || {},
  }

  const record = await pb.collection('operacional_visitas').create<OperacionalVisita>(payload)

  // Registra relação Promotor × Loja como 'observado_visita' se ainda não existir vínculo ativo
  if (record.promoter_id && record.store_code) {
    try {
      const existing = await pb.collection('store_promoter_assignments').getList(1, 1, {
        filter: `promoter_id = '${record.promoter_id}' && store_code = '${record.store_code}' && status = 'ativo'`,
      })
      if (existing.items.length === 0) {
        await pb.collection('store_promoter_assignments').create({
          promoter_id: record.promoter_id,
          promoter_nome: record.promoter_nome,
          store_id: record.store_id,
          store_code: record.store_code,
          store_name: record.store_name,
          industry_name: record.industry_name,
          status: 'ativo',
          tipo_vinculo: 'observado_visita',
          origem_vinculo: `Visita registrada em ${record.data}`,
          data_inicio: record.data,
          observacao:
            'Relação observada através da API de Visitas. Requer confirmação de roteiro pelo administrador.',
        })
      }
    } catch {
      /* non-fatal */
    }
  }

  return record
}

// ---------------------------------------------------------------------------------
// 10.2 GESTÃO DOS 3 NÍVEIS DE MIX (Oficial da Indústria, Definido da Loja, Observado Operacional)
// ---------------------------------------------------------------------------------
export async function getStoreFullMix(
  storeCode: string,
  industryId?: string,
): Promise<{
  oficialIndustria: CadastroProduto[]
  definidoLoja: IndustryStoreProductMix[]
  observadoOperacional: Array<
    IndustryStoreProductMix & { ultima_observacao?: string; evidencia_origem?: string }
  >
  foraDoMixDefinido: Array<{
    produto: string
    codProduto?: string
    evidencia: string
    ultimaData: string
  }>
}> {
  try {
    // 1. Mix Oficial da Indústria
    const oficial = await getCadastrosProdutos(industryId)
    const oficialAtivos = oficial.filter(
      (p) => p.tipo_mix === 'oficial_industria' && p.status === 'ativo',
    )

    // 2. Mix Definido desta Loja
    const fStore = `store_code = '${storeCode.replace(/'/g, "\\'")}'`
    const allStoreMix = await pb
      .collection('industry_store_product_mix')
      .getFullList<IndustryStoreProductMix>({
        filter: industryId
          ? `${fStore} && industry_id = '${industryId.replace(/'/g, "\\'")}'`
          : fStore,
      })

    const definidoLoja = allStoreMix.filter(
      (m: any) => m.tipo_presenca !== 'observado_operacional' && m.status === 'ativo',
    )
    const observadoOperacional = allStoreMix.filter(
      (m: any) => m.tipo_presenca === 'observado_operacional',
    )

    // 3. Identifica produtos observados que estão fora do mix definido
    const definidosSet = new Set(definidoLoja.map((d) => d.nome_produto.trim().toUpperCase()))
    const foraDoMixDefinido: Array<{
      produto: string
      codProduto?: string
      evidencia: string
      ultimaData: string
    }> = []

    for (const obs of observadoOperacional) {
      if (!definidosSet.has(obs.nome_produto.trim().toUpperCase())) {
        foraDoMixDefinido.push({
          produto: obs.nome_produto,
          codProduto: obs.codigo_produto,
          evidencia: (obs as any).evidencia_origem || 'Evidência operacional',
          ultimaData: (obs as any).ultima_observacao || obs.created || '',
        })
      }
    }

    return {
      oficialIndustria: oficialAtivos,
      definidoLoja,
      observadoOperacional,
      foraDoMixDefinido,
    }
  } catch (err) {
    console.warn('[cadastrosService] Erro ao carregar mix em 3 níveis:', err)
    return {
      oficialIndustria: [],
      definidoLoja: [],
      observadoOperacional: [],
      foraDoMixDefinido: [],
    }
  }
}

// ---------------------------------------------------------------------------------
// 10.3 DETECÇÃO E RESOLUÇÃO DE CONFLITOS (API vs Cadastro Manual)
// ---------------------------------------------------------------------------------
/**
 * Detecta conflito entre o valor já cadastrado e o que veio da fonte externa.
 * O ajuste manual NUNCA é sobrescrito silenciosamente.
 */
export function detectarConflitoCadastro(
  tipo: CadastroConflito['tipo_entidade'],
  entidadeId: string,
  entidadeNome: string,
  campo: string,
  valorAtual: string,
  valorRecebido: string,
  fonte = 'TradePro API',
): CadastroConflito | null {
  if (!valorAtual || !valorRecebido) return null
  if (valorAtual.trim().toLowerCase() === valorRecebido.trim().toLowerCase()) return null

  return {
    id: `${tipo}_${entidadeId}_${campo}_${Date.now()}`,
    tipo_entidade: tipo,
    entidade_id: entidadeId,
    entidade_nome: entidadeNome,
    campo,
    valor_atual: valorAtual,
    valor_recebido: valorRecebido,
    fonte_origem: fonte,
    data_deteccao: new Date().toISOString(),
  }
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
/**
 * Estatísticas e evidências operacionais de um Produto no SKIP
 * Retorna contagem de lojas com mix definido, lojas com mix observado,
 * data da última observação, total de rupturas e validades relacionadas.
 */
export async function getProductOperationalStats(
  productName: string,
  productCode?: string,
): Promise<{
  lojasComMixDefinido: Array<{ store_code: string; store_name: string }>
  lojasObservadas: Array<{ store_code: string; store_name: string; ultima_data: string }>
  ultimaObservacao?: string
  totalRupturasRelacionadas: number
  totalValidadesRelacionadas: number
}> {
  const normName = productName.trim().toUpperCase()

  try {
    // 1. Lojas com Mix Definido
    const mixDefinidoRecords = await pb
      .collection('industry_store_product_mix')
      .getFullList<IndustryStoreProductMix>({
        filter: "status = 'ativo'",
      })
    const lojasDefinidasMap = new Map<string, string>()
    for (const m of mixDefinidoRecords) {
      if (m.nome_produto?.trim().toUpperCase() === normName) {
        lojasDefinidasMap.set(m.store_code, m.store_name)
      }
    }

    // 2. Rupturas relacionadas
    let totalRupturas = 0
    let ultimaDataRuptura = ''
    try {
      const rupturasList = await pb.collection('rupturas_base').getList<{
        id: string
        produto?: string
        data?: string
        created?: string
      }>(1, 100, {
        filter: `produto ~ '${normName.replace(/'/g, "\\'")}'`,
        sort: '-created',
      })
      totalRupturas = rupturasList.totalItems
      if (rupturasList.items.length > 0) {
        ultimaDataRuptura = rupturasList.items[0].data || rupturasList.items[0].created || ''
      }
    } catch {
      /* non-fatal */
    }

    // 3. Validades relacionadas e lojas observadas
    let totalValidades = 0
    let ultimaDataValidade = ''
    const lojasObsMap = new Map<string, { store_name: string; ultima_data: string }>()

    try {
      const validadesList = await pb.collection('validades_base').getList<{
        id: string
        produto?: string
        codigo_loja?: string
        loja?: string
        data_pesquisa?: string
        created?: string
      }>(1, 200, {
        filter: `produto ~ '${normName.replace(/'/g, "\\'")}'`,
        sort: '-created',
      })
      totalValidades = validadesList.totalItems

      for (const v of validadesList.items) {
        const d = v.data_pesquisa || v.created || ''
        if (!ultimaDataValidade && d) ultimaDataValidade = d
        if (v.codigo_loja) {
          if (!lojasObsMap.has(v.codigo_loja)) {
            lojasObsMap.set(v.codigo_loja, {
              store_name: v.loja || `Loja ${v.codigo_loja}`,
              ultima_data: d,
            })
          }
        }
      }
    } catch {
      /* non-fatal */
    }

    // Identifica a data mais recente de observação
    const datas = [ultimaDataValidade, ultimaDataRuptura].filter(Boolean).sort().reverse()
    const ultimaObservacao = datas[0] || undefined

    const lojasComMixDefinido = Array.from(lojasDefinidasMap.entries()).map(
      ([store_code, store_name]) => ({
        store_code,
        store_name,
      }),
    )

    const lojasObservadas = Array.from(lojasObsMap.entries()).map(([store_code, info]) => ({
      store_code,
      store_name: info.store_name,
      ultima_data: info.ultima_data,
    }))

    return {
      lojasComMixDefinido,
      lojasObservadas,
      ultimaObservacao,
      totalRupturasRelacionadas: totalRupturas,
      totalValidadesRelacionadas: totalValidades,
    }
  } catch (err) {
    console.warn('[cadastrosService] Erro ao obter estatísticas de produto:', err)
    return {
      lojasComMixDefinido: [],
      lojasObservadas: [],
      totalRupturasRelacionadas: 0,
      totalValidadesRelacionadas: 0,
    }
  }
}

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
