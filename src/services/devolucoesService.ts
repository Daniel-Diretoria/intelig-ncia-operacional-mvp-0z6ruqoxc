/**
 * Serviço do Módulo Devoluções / NF — SKIP Inteligência Operacional
 * Gerencia persistência em devolucoes_casos, devolucoes_itens, devolucoes_timeline, devolucoes_evidencias e devolucoes_audit
 */

import pb from '@/lib/pocketbase/client'
import {
  DevolucaoCaso,
  DevolucaoItem,
  DevolucaoTimelineEvento,
  DevolucaoEvidencia,
  CriarDevolucaoCasoInput,
  DevolucoesFiltros,
  FilaOperacionalAgrupada,
  DevolucaoStatus,
  DecisaoHumanaItem,
  AuditoriaClassificacao,
  RegistrarAutorizacaoIndustriaInput,
} from '@/types/devolucoes'
import { marcarSolicitacaoProcessada } from '@/services/devolucoesDedupService'
import {
  auditarItemDevolucao,
  consolidarAuditoriaCaso,
  AuditoriaContextoLojaIndustria,
  HistoricoValidadeRaw,
  HistoricoRupturaRaw,
  AuditoriaItemResultado,
} from '@/lib/engine/devolucoesAuditEngine'

/**
 * Gera próximo código de caso no formato DEV-YYYY-XXXX
 */
export async function gerarProximoCodigoCaso(): Promise<string> {
  const anoAtual = new Date().getFullYear()
  const prefixo = `DEV-${anoAtual}-`

  try {
    const records = await pb.collection('devolucoes_casos').getList(1, 1, {
      filter: `codigo_caso ~ '${prefixo}'`,
      sort: '-created',
    })

    if (records.items.length > 0) {
      const ultimoCodigo = (records.items[0] as unknown as { codigo_caso: string }).codigo_caso
      const match = ultimoCodigo.match(/DEV-\d{4}-(\d+)/)
      if (match) {
        const num = parseInt(match[1], 10) + 1
        return `${prefixo}${String(num).padStart(4, '0')}`
      }
    }
  } catch (err) {
    console.warn(
      '[devolucoesService] Erro ao buscar último caso, gerando sequencial fallback:',
      err,
    )
  }

  // Fallback caso seja o primeiro do ano ou haja falha de listagem
  const seq = Math.floor(Math.random() * 900) + 100
  return `${prefixo}${String(seq).padStart(4, '0')}`
}

/**
 * Registra auditoria interna de sistema (Regra 22: Preservar rastreabilidade completa)
 */
export async function registrarDevolucaoAudit(
  casoId: string,
  acao: string,
  detalhes?: Record<string, unknown>,
  usuarioNome?: string,
): Promise<void> {
  try {
    const user = pb.authStore.model
    await pb.collection('devolucoes_audit').create({
      caso_id: casoId,
      acao,
      usuario_nome: usuarioNome || user?.name || user?.email || 'Sistema',
      usuario_id: user?.id || '',
      detalhes_json: detalhes || {},
      data_acao: new Date().toISOString(),
    })
  } catch (err) {
    console.warn('[devolucoesService] Falha ao gravar log de auditoria:', err)
  }
}

/**
 * Registra a resposta da Indústria no caso (Parte 2: Autorização Total, Parcial ou Não Autorizado)
 * Avança o caso automaticamente:
 * - Total / Parcial -> status 'aguardando_nf_descarte' (próxima etapa: NF assinada + descarte)
 * - Não autorizado -> status 'nao_autorizado' (preserva o caso, auditoria e linha do tempo)
 * NUNCA divide em casos diferentes (mesmo caso preservado)
 */
export async function registrarAutorizacaoIndustria(
  input: RegistrarAutorizacaoIndustriaInput,
): Promise<DevolucaoCaso> {
  const user = pb.authStore.model
  const responsavel = input.responsavelNome || user?.name || user?.email || 'Operador'
  const dataHoje = input.dataAutorizacao || new Date().toISOString().slice(0, 10)

  // 1. Obter itens atuais do caso para atualizar quantidades autorizadas
  const itensRecords = await pb.collection('devolucoes_itens').getFullList({
    filter: `caso_id = '${input.casoId}'`,
  })
  const itensAtuais = itensRecords as unknown as DevolucaoItem[]

  let totalQtdAutorizada = 0
  let itensAutorizadosCount = 0
  const totalItens = itensAtuais.length

  if (input.tipoAutorizacao === 'total') {
    // Todos os itens autorizados integralmente
    for (const it of itensAtuais) {
      const qtd = it.quantidade_solicitada
      totalQtdAutorizada += qtd
      itensAutorizadosCount++
      await pb.collection('devolucoes_itens').update(it.id, {
        quantidade_autorizada: qtd,
        situacao_autorizacao: 'autorizado',
      })
    }
  } else if (input.tipoAutorizacao === 'parcial') {
    // Respeita a seleção por item informada pelo operador
    const mapaItensInput = new Map(input.itensAutorizados?.map((i) => [i.itemId, i]))
    for (const it of itensAtuais) {
      const itemInfo = mapaItensInput.get(it.id)
      if (itemInfo && itemInfo.autorizado) {
        const qtdAut = Math.min(
          itemInfo.quantidadeAutorizada !== undefined
            ? itemInfo.quantidadeAutorizada
            : it.quantidade_solicitada,
          it.quantidade_solicitada,
        )
        totalQtdAutorizada += qtdAut
        itensAutorizadosCount++
        await pb.collection('devolucoes_itens').update(it.id, {
          quantidade_autorizada: qtdAut,
          situacao_autorizacao: 'autorizado',
          observacao: itemInfo.motivoNaoAutorizado || it.observacao || '',
        })
      } else {
        await pb.collection('devolucoes_itens').update(it.id, {
          quantidade_autorizada: 0,
          situacao_autorizacao: 'nao_autorizado',
          motivo_nao_autorizado: itemInfo?.motivoNaoAutorizado || 'Não autorizado pela indústria',
        })
      }
    }
  } else {
    // Não autorizado
    for (const it of itensAtuais) {
      await pb.collection('devolucoes_itens').update(it.id, {
        quantidade_autorizada: 0,
        situacao_autorizacao: 'nao_autorizado',
        motivo_nao_autorizado: input.observacao || 'Devolução não autorizada pela indústria',
      })
    }
  }

  // 2. Determinar próximo status e próxima ação automática (Regra 20 e 23)
  let novoStatus: DevolucaoStatus = 'aguardando_nf_descarte'
  let proximaAcao = 'Aguardando envio da NF assinada e comprovante de descarte pelo promotor.'

  if (input.tipoAutorizacao === 'nao_autorizado') {
    novoStatus = 'nao_autorizado'
    proximaAcao = 'Devolução recusada pela indústria. Caso finalizado sem emissão de NF.'
  }

  // 3. Atualizar Caso
  const payloadCaso: Record<string, unknown> = {
    status: novoStatus,
    tipo_autorizacao_industria: input.tipoAutorizacao,
    autorizacao_data: dataHoje,
    autorizacao_protocolo: input.protocolo || '',
    autorizacao_observacao: input.observacao || '',
    autorizacao_registrada_por: responsavel,
    total_unidades_autorizadas: totalQtdAutorizada,
    proxima_acao: proximaAcao,
  }

  const casoAtualizado = (await pb
    .collection('devolucoes_casos')
    .update(input.casoId, payloadCaso)) as unknown as DevolucaoCaso

  // 4. Registrar Linha do Tempo detalhada (Regra 25)
  let tituloTimeline = 'Indústria autorizou a devolução'
  let descTimeline = `Autorização total registrada. ${totalQtdAutorizada} unidade(s) autorizada(s).`

  if (input.tipoAutorizacao === 'parcial') {
    tituloTimeline = 'Indústria autorizou parcialmente a devolução'
    descTimeline = `Autorização parcial: ${itensAutorizadosCount} de ${totalItens} item(ns) autorizado(s) (${totalQtdAutorizada} unidades autorizadas).`
  } else if (input.tipoAutorizacao === 'nao_autorizado') {
    tituloTimeline = 'Indústria não autorizou a devolução'
    descTimeline = `Solicitação recusada pela indústria. Motivo: ${input.observacao || 'Não informado'}.`
  }

  if (input.observacao) {
    descTimeline += ` Observação: "${input.observacao}".`
  }

  await registrarTimelineEvento(
    input.casoId,
    input.codigoCaso,
    'autorizacao_industria',
    tituloTimeline,
    descTimeline,
    {
      usuarioNome: responsavel,
      dadosExtras: {
        tipoAutorizacao: input.tipoAutorizacao,
        totalAutorizado: totalQtdAutorizada,
        protocolo: input.protocolo,
      },
    },
  )

  await registrarDevolucaoAudit(input.casoId, 'autorizacao_industria_registrada', {
    tipo: input.tipoAutorizacao,
    totalQtdAutorizada,
    usuario: responsavel,
  })

  return casoAtualizado
}

/**
 * Conclusão humana do processo de devolução (Regra 30 e 31)
 * Requer conferência humana e verificação se a documentação necessária foi recebida.
 */
export async function concluirDevolucaoHumana(
  casoId: string,
  codigoCaso: string,
  observacaoConclusao?: string,
): Promise<DevolucaoCaso> {
  const user = pb.authStore.model
  const responsavel = user?.name || user?.email || 'Operador'
  const dataHoje = new Date().toISOString().slice(0, 10)

  // Atualizar caso para 'concluido'
  const casoAtualizado = (await pb.collection('devolucoes_casos').update(casoId, {
    status: 'concluido',
    conclusao_data: dataHoje,
    conclusao_usuario_nome: responsavel,
    proxima_acao: 'Devolução concluída com sucesso. Documentação arquivada.',
  })) as unknown as DevolucaoCaso

  // Registrar na linha do tempo
  await registrarTimelineEvento(
    casoId,
    codigoCaso,
    'caso_concluido',
    'Devolução Concluída e Arquivada',
    `Processo concluído com documentação completa por ${responsavel}.${observacaoConclusao ? ` Obs: ${observacaoConclusao}` : ''}`,
    {
      usuarioNome: responsavel,
      dadosExtras: {
        dataConclusao: dataHoje,
      },
    },
  )

  await registrarDevolucaoAudit(casoId, 'conclusao_devolucao', {
    responsavel,
    data: dataHoje,
    observacao: observacaoConclusao,
  })

  return casoAtualizado
}

/**
 * Registra evento na linha do tempo
 */
export async function registrarTimelineEvento(
  casoId: string,
  codigoCaso: string,
  tipoEvento: DevolucaoTimelineEvento['tipo_evento'],
  titulo: string,
  descricao?: string,
  extras?: {
    itemId?: string
    itemNome?: string
    statusAnterior?: string
    statusNovo?: string
    dadosExtras?: Record<string, unknown>
    usuarioNome?: string
  },
): Promise<DevolucaoTimelineEvento> {
  const user = pb.authStore.model
  const record = await pb.collection('devolucoes_timeline').create({
    caso_id: casoId,
    codigo_caso: codigoCaso,
    tipo_evento: tipoEvento,
    titulo,
    descricao: descricao || '',
    usuario_nome: extras?.usuarioNome || user?.name || user?.email || 'Sistema',
    usuario_id: user?.id || '',
    item_id: extras?.itemId || '',
    item_nome: extras?.itemNome || '',
    status_anterior: extras?.statusAnterior || '',
    status_novo: extras?.statusNovo || '',
    dados_extras_json: extras?.dadosExtras || {},
    data_evento: new Date().toISOString(),
  })

  return record as unknown as DevolucaoTimelineEvento
}

/**
 * Busca histórico prévio de validades e rupturas para alimentar a auditoria
 */
export async function carregarContextoAuditoria(
  industryName: string,
  storeCode?: string,
  storeName?: string,
  dataSolicitacao?: string,
  industryId?: string,
): Promise<AuditoriaContextoLojaIndustria> {
  const historicoValidades: HistoricoValidadeRaw[] = []
  const historicoRupturas: HistoricoRupturaRaw[] = []
  let mixOficialProdutos: Array<{ codigo_produto?: string; nome_produto: string }> = []
  let dataInicioBaseHistorica: string | undefined = undefined

  // 1. Resolução segura da indústria via Cadastro Operacional (industry_registry)
  let resolvedIndustryId = industryId || ''
  let resolvedTradeProClientId = ''
  let resolvedIndustryName = industryName.trim()
  let contextoIndustriaSeguro = true
  let motivoInsegurancaIndustria: string | undefined = undefined

  try {
    if (resolvedIndustryId) {
      const reg = await pb
        .collection('industry_registry')
        .getOne<{ id: string; nome: string; tradepro_client_id?: string }>(resolvedIndustryId)
      if (reg) {
        resolvedIndustryName = reg.nome || resolvedIndustryName
        resolvedTradeProClientId = reg.tradepro_client_id?.trim() || ''
      }
    } else if (resolvedIndustryName) {
      // Buscar pelo nome canônico no cadastro operacional
      const cleanKey = resolvedIndustryName.toUpperCase()
      const regList = await pb.collection('industry_registry').getList<{
        id: string
        nome: string
        nome_chave: string
        tradepro_client_id?: string
      }>(1, 1, {
        filter: `nome_chave = '${cleanKey.replace(/'/g, "\\'")}' || nome ~ '${resolvedIndustryName.replace(/'/g, "\\'")}'`,
      })
      if (regList.items.length > 0) {
        resolvedIndustryId = regList.items[0].id
        resolvedTradeProClientId = regList.items[0].tradepro_client_id?.trim() || ''
      }
    }
  } catch (err) {
    console.warn('[devolucoesService] Aviso ao resolver industry_registry:', err)
  }

  // Se não foi possível resolver nenhum vínculo seguro com industry_registry nem tradepro_client_id
  if (!resolvedIndustryId && !resolvedTradeProClientId) {
    contextoIndustriaSeguro = false
    motivoInsegurancaIndustria = `A indústria "${industryName}" não possui cadastro operacional validado ou vínculo com Cód. Cliente TradePro (tradepro_client_id). Por segurança, registros operacionais de outras indústrias não foram misturados.`
  }

  // 2. Buscar configuração operacional de pesquisas/ciclos por indústria (Cadastro Operacional)
  let cicloPesquisaConfigurado: AuditoriaContextoLojaIndustria['cicloPesquisaConfigurado'] =
    undefined
  if (resolvedIndustryId) {
    try {
      const researchConfigs = await pb.collection('industry_research_config').getFullList<{
        industry_id: string
        tipo_pesquisa: string
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
        tolerancia_dias?: number
        ativo: boolean
      }>({
        filter: `industry_id = '${resolvedIndustryId}' && tipo_pesquisa = 'validades' && ativo = true`,
      })
      if (researchConfigs.length > 0) {
        const rc = researchConfigs[0]
        cicloPesquisaConfigurado = {
          frequencia: rc.frequencia,
          dia_esperado: rc.dia_esperado,
          tolerancia_dias: rc.tolerancia_dias,
          ativo: rc.ativo,
        }
      }
    } catch (err) {
      console.warn('[devolucoesService] Aviso ao carregar industry_research_config:', err)
    }
  }

  // 3. Buscar histórico de validades em validades_base — RESTRINGIR POR INDÚSTRIA + LOJA
  // Apenas busca se o contexto da indústria for seguro, garantindo nunca misturar indústrias
  if (contextoIndustriaSeguro) {
    try {
      const storeClauses: string[] = []
      if (storeCode && storeCode.trim() !== '') {
        storeClauses.push(`codigo_loja = '${storeCode.replace(/'/g, "\\'")}'`)
      } else if (storeName && storeName.trim() !== '') {
        storeClauses.push(
          `nome_loja ~ '${storeName.replace(/'/g, "\\'")}' || razao_social ~ '${storeName.replace(/'/g, "\\'")}'`,
        )
      }

      // Vínculo da Indústria:
      // - industry_id (relação direta se populada)
      // - OU cod_cliente = tradepro_client_id (vínculo por código numérico de cliente TradePro)
      // NUNCA cruzar por fornecedor!
      const industryClauses: string[] = []
      if (resolvedIndustryId) {
        industryClauses.push(`industry_id = '${resolvedIndustryId}'`)
      }
      if (resolvedTradeProClientId) {
        industryClauses.push(`cod_cliente = '${resolvedTradeProClientId.replace(/'/g, "\\'")}'`)
      }

      const filters: string[] = []
      if (storeClauses.length > 0) {
        filters.push(`(${storeClauses.join(' || ')})`)
      }
      if (industryClauses.length > 0) {
        filters.push(`(${industryClauses.join(' || ')})`)
      }

      const filterStr = filters.join(' && ')

      const records = await pb.collection('validades_base').getList(1, 200, {
        filter: filterStr,
        sort: 'realizado',
      })

      for (const r of records.items) {
        const row = r as unknown as {
          id: string
          produto: string
          cod_produto?: string
          codigo_loja?: string
          nome_loja?: string
          razao_social?: string
          quantidade: number
          realizado: string
          validade_efetiva?: string
          validade_original?: string
          colaborador?: string
          status_operacional?: string
          cliente?: string
          fornecedor?: string
        }
        historicoValidades.push({
          id: row.id,
          produto: row.produto,
          cod_produto: row.cod_produto,
          codigo_loja: row.codigo_loja,
          nome_loja: row.nome_loja,
          razao_social: row.razao_social,
          quantidade: typeof row.quantidade === 'number' ? row.quantidade : 0,
          realizado: row.realizado,
          validade_efetiva: row.validade_efetiva,
          validade_original: row.validade_original,
          colaborador: row.colaborador,
          status_operacional: row.status_operacional,
          cliente: row.cliente,
          fornecedor: row.fornecedor,
        })
        if (!dataInicioBaseHistorica && row.realizado) {
          dataInicioBaseHistorica = row.realizado
        }
      }
    } catch (err) {
      console.warn('[devolucoesService] Aviso ao carregar validades_base para auditoria:', err)
    }

    // 4. Buscar histórico de rupturas em rupturas_base — RESTRINGIR POR INDÚSTRIA + LOJA
    // Rupturas_base possui codigo_cliente (ex.: "4" para COCOLEVE) e cliente (nome da indústria/cliente TradePro)
    try {
      const rStoreClauses: string[] = []
      if (storeCode && storeCode.trim() !== '') {
        rStoreClauses.push(`codigo_loja = '${storeCode.replace(/'/g, "\\'")}'`)
      } else if (storeName && storeName.trim() !== '') {
        rStoreClauses.push(`nome_loja ~ '${storeName.replace(/'/g, "\\'")}'`)
      }

      const rIndClauses: string[] = []
      if (resolvedTradeProClientId) {
        rIndClauses.push(`codigo_cliente = '${resolvedTradeProClientId.replace(/'/g, "\\'")}'`)
      }

      const rFilters: string[] = []
      if (rStoreClauses.length > 0) {
        rFilters.push(`(${rStoreClauses.join(' || ')})`)
      }
      if (rIndClauses.length > 0) {
        rFilters.push(`(${rIndClauses.join(' || ')})`)
      }

      const rFilterStr = rFilters.length > 0 ? rFilters.join(' && ') : ''

      const rupRecords = await pb.collection('rupturas_base').getList(1, 100, {
        filter: rFilterStr,
        sort: '-created',
      })

      for (const r of rupRecords.items) {
        const row = r as unknown as {
          id: string
          produto: string
          codigo_loja?: string
          nome_loja?: string
          motivo?: string
          situacao_atual?: string
          data_visita?: string
          observacao?: string
        }
        historicoRupturas.push(row)
      }
    } catch (err) {
      console.warn('[devolucoesService] Aviso ao carregar rupturas_base para auditoria:', err)
    }

    // 5. Buscar Mix de produtos da indústria se houver
    try {
      let mixFilter = `industry_name ~ '${industryName.replace(/'/g, "\\'")}'`
      if (resolvedIndustryId) {
        mixFilter = `industry_id = '${resolvedIndustryId}' || ${mixFilter}`
      }
      const mixRecords = await pb.collection('industry_product_mix').getList(1, 150, {
        filter: mixFilter,
      })
      mixOficialProdutos = mixRecords.items.map((m) => {
        const item = m as unknown as { codigo_produto?: string; nome_produto: string }
        return {
          codigo_produto: item.codigo_produto,
          nome_produto: item.nome_produto,
        }
      })
    } catch (err) {
      console.warn('[devolucoesService] Aviso ao carregar industry_product_mix:', err)
    }
  }

  return {
    industry_name: resolvedIndustryName || industryName,
    industry_id: resolvedIndustryId,
    tradepro_client_id: resolvedTradeProClientId,
    store_code: storeCode,
    store_name: storeName || '',
    data_solicitacao: dataSolicitacao || new Date().toISOString().slice(0, 10),
    historicoValidades,
    historicoRupturas,
    mixOficialProdutos,
    dataInicioBaseHistorica,
    contextoIndustriaSeguro,
    motivoInsegurancaIndustria,
    cicloPesquisaConfigurado,
  }
}

/**
 * Cria uma Nova Solicitação gerando o Caso de Devolução, seus itens e executando a primeira auditoria
 */
export async function criarCasoDevolucao(input: CriarDevolucaoCasoInput): Promise<DevolucaoCaso> {
  const codigoCaso = await gerarProximoCodigoCaso()
  const user = pb.authStore.model

  // Calcular totais
  const totalItens = input.itens.length
  const totalUnidades = input.itens.reduce(
    (acc, curr) => acc + (curr.quantidade_solicitada || 0),
    0,
  )

  // 1. Criar Caso com status inicial 'em_analise' (ou 'solicitacao_recebida')
  const casoRecord = await pb.collection('devolucoes_casos').create({
    codigo_caso: codigoCaso,
    data_solicitacao: input.data_solicitacao,
    industry_id: input.industry_id || '',
    industry_name: input.industry_name,
    store_id: input.store_id || '',
    store_code: input.store_code || '',
    store_name: input.store_name,
    promotor_nome: input.promotor_nome,
    promotor_cod: input.promotor_cod || '',
    motivo_geral: input.motivo_geral || '',
    observacoes: input.observacoes || '',
    status: 'em_analise',
    responsavel_nome: input.responsavel_nome || user?.name || user?.email || '',
    proxima_acao: 'Realizar auditoria operacional e validação dos itens solicitados',
    total_itens: totalItens,
    total_unidades_solicitadas: totalUnidades,
    created_by: user?.id || null,
  })

  const casoId = casoRecord.id

  // 2. Carregar contexto de histórico operacional
  const contexto = await carregarContextoAuditoria(
    input.industry_name,
    input.store_code,
    input.store_name,
    input.data_solicitacao,
    input.industry_id,
  )

  // 3. Criar e auditar cada item
  const resultadosAuditados: AuditoriaItemResultado[] = []
  const itensCriados: DevolucaoItem[] = []

  for (const itemInput of input.itens) {
    const auditRes = auditarItemDevolucao(itemInput, contexto)
    resultadosAuditados.push(auditRes)

    const itemRecord = await pb.collection('devolucoes_itens').create({
      caso_id: casoId,
      codigo_caso: codigoCaso,
      produto_nome_informado: itemInput.produto_nome_informado,
      produto_codigo: auditRes.produtoCodigoOficial || itemInput.produto_codigo || '',
      produto_nome_oficial: auditRes.produtoNomeOficial || itemInput.produto_nome_oficial || '',
      precisa_identificacao: auditRes.precisaIdentificacao,
      quantidade_solicitada: itemInput.quantidade_solicitada,
      validade_informada: itemInput.validade_ausente ? '' : itemInput.validade_informada || '',
      validade_ausente: itemInput.validade_ausente || false,
      motivo_item: itemInput.motivo_item || '',
      observacao: itemInput.observacao || '',
      evidencia_foto_url: itemInput.evidencia_foto_url || '',
      classificacao_auditoria: auditRes.classificacao,
      auditoria_explicacao: auditRes.explicacao,
      auditoria_detalhes_json: auditRes.detalhes,
      decisao_humana: 'pendente',
    })

    itensCriados.push(itemRecord as unknown as DevolucaoItem)
  }

  // 4. Consolidar auditoria geral do caso
  const consolidado = consolidarAuditoriaCaso(resultadosAuditados)

  let proximaAcao = 'Conferir auditoria operacional dos itens'
  let novoStatus: DevolucaoStatus = 'em_analise'

  if (consolidado.resultadoGeral === 'divergencia') {
    proximaAcao =
      'Atenção: Divergência encontrada em itens solicitados — analisar histórico com promotor'
  } else if (consolidado.resultadoGeral === 'dados_insuficientes') {
    proximaAcao = 'Aguardando informação complementar ou dados de validade ausentes'
  } else if (consolidado.resultadoGeral === 'acompanhamento_consistente') {
    proximaAcao = 'Itens com acompanhamento consistente — prontos para decisão humana'
  }

  await pb.collection('devolucoes_casos').update(casoId, {
    resultado_auditoria_geral: consolidado.resultadoGeral,
    resumo_auditoria_json: consolidado.resumoJson,
    proxima_acao: proximaAcao,
    status: novoStatus,
  })

  // 5. Gravar na Timeline
  await registrarTimelineEvento(
    casoId,
    codigoCaso,
    'criacao_solicitacao',
    'Solicitação de Devolução criada',
    `Caso ${codigoCaso} registrado para ${input.industry_name} (${input.store_name}) com ${totalItens} produto(s) totalizando ${totalUnidades} unidade(s).`,
    {
      usuarioNome: user?.name || user?.email,
    },
  )

  await registrarTimelineEvento(
    casoId,
    codigoCaso,
    'auditoria_executada',
    'Auditoria operacional executada',
    `Resultado geral: ${consolidado.resultadoGeral.toUpperCase().replace('_', ' ')}. ${
      consolidado.resumoJson.itens_consistentes
    } consistente(s), ${consolidado.resumoJson.itens_atencao} atenção, ${
      consolidado.resumoJson.itens_divergencia
    } divergência(s), ${consolidado.resumoJson.itens_insuficientes} dados insuficientes.`,
    {
      usuarioNome: 'Motor SKIP Auditoria',
    },
  )

  // 6. Gravar Auditoria de Sistema (Regra 22)
  await registrarDevolucaoAudit(casoId, 'criacao_solicitacao', {
    codigo_caso: codigoCaso,
    total_itens: totalItens,
    total_unidades: totalUnidades,
    resultado_auditoria: consolidado.resultadoGeral,
  })

  // 7. Se o input tem vínculo com solicitação identificada do WhatsApp, marcar como processada
  // REGRA 11 e 12: só marca como processada após criação concluída do Caso
  const solOrigemId = (input as unknown as { solicitacaoOrigemId?: string }).solicitacaoOrigemId
  if (solOrigemId) {
    try {
      await marcarSolicitacaoProcessada(solOrigemId, casoId, codigoCaso)
    } catch (e) {
      console.warn('[devolucoesService] Aviso ao marcar solicitacao como processada:', e)
    }
  }

  return {
    ...(casoRecord as unknown as DevolucaoCaso),
    codigo_caso: codigoCaso,
    resultado_auditoria_geral: consolidado.resultadoGeral,
    resumo_auditoria_json: consolidado.resumoJson,
    proxima_acao: proximaAcao,
    itens: itensCriados,
  }
}

/**
 * Reexecuta a auditoria em um caso existente
 */
export async function reexecutarAuditoriaCaso(casoId: string): Promise<DevolucaoCaso> {
  const caso = (await pb.collection('devolucoes_casos').getOne(casoId)) as unknown as DevolucaoCaso
  const itensRecords = await pb.collection('devolucoes_itens').getFullList({
    filter: `caso_id = '${casoId}'`,
  })

  const contexto = await carregarContextoAuditoria(
    caso.industry_name,
    caso.store_code,
    caso.store_name,
    caso.data_solicitacao,
    caso.industry_id,
  )

  const resultadosAuditados: AuditoriaItemResultado[] = []
  const itensAtualizados: DevolucaoItem[] = []

  for (const it of itensRecords) {
    const item = it as unknown as DevolucaoItem
    const auditRes = auditarItemDevolucao(
      {
        id: item.id,
        produto_nome_informado: item.produto_nome_informado,
        produto_codigo: item.produto_codigo,
        produto_nome_oficial: item.produto_nome_oficial,
        precisa_identificacao: item.precisa_identificacao,
        quantidade_solicitada: item.quantidade_solicitada,
        validade_informada: item.validade_informada,
        validade_ausente: item.validade_ausente,
      },
      contexto,
    )
    resultadosAuditados.push(auditRes)

    const updated = await pb.collection('devolucoes_itens').update(item.id, {
      classificacao_auditoria: auditRes.classificacao,
      auditoria_explicacao: auditRes.explicacao,
      auditoria_detalhes_json: auditRes.detalhes,
      precisa_identificacao: auditRes.precisaIdentificacao,
      produto_nome_oficial: auditRes.produtoNomeOficial || item.produto_nome_oficial,
      produto_codigo: auditRes.produtoCodigoOficial || item.produto_codigo,
    })
    itensAtualizados.push(updated as unknown as DevolucaoItem)
  }

  const consolidado = consolidarAuditoriaCaso(resultadosAuditados)

  await pb.collection('devolucoes_casos').update(casoId, {
    resultado_auditoria_geral: consolidado.resultadoGeral,
    resumo_auditoria_json: consolidado.resumoJson,
  })

  await registrarTimelineEvento(
    casoId,
    caso.codigo_caso,
    'auditoria_executada',
    'Reauditoria executada manualmente',
    `Auditoria reprocessada: ${consolidado.resultadoGeral.toUpperCase().replace('_', ' ')}.`,
  )

  await registrarDevolucaoAudit(casoId, 'reexecucao_auditoria', {
    resultado_auditoria: consolidado.resultadoGeral,
    resumo: consolidado.resumoJson,
  })

  return {
    ...caso,
    resultado_auditoria_geral: consolidado.resultadoGeral,
    resumo_auditoria_json: consolidado.resumoJson,
    itens: itensAtualizados,
  }
}

/**
 * Atualiza a decisão humana de um item específico (Regra 13: Decisão por item permitida)
 */
export async function registrarDecisaoItem(
  casoId: string,
  codigoCaso: string,
  itemId: string,
  produtoNome: string,
  decisao: DecisaoHumanaItem,
  observacao?: string,
  quantidadeAutorizada?: number,
): Promise<DevolucaoItem> {
  const user = pb.authStore.model
  const usuarioNome = user?.name || user?.email || 'Usuário'
  const dataHoje = new Date().toISOString()

  const payload: Record<string, unknown> = {
    decisao_humana: decisao,
    decisao_observacao: observacao || '',
    decisao_usuario_nome: usuarioNome,
    decisao_data: dataHoje,
  }

  if (typeof quantidadeAutorizada === 'number') {
    payload.quantidade_autorizada = quantidadeAutorizada
  }

  const updatedItem = await pb.collection('devolucoes_itens').update(itemId, payload)

  // Gravar timeline
  const descricoesDecisao: Record<DecisaoHumanaItem, string> = {
    pendente: 'Decisão redefinida para pendente',
    aprovado_para_industria: `Item aprovado para solicitação à indústria (${quantidadeAutorizada ?? ''} un.)`,
    solicitar_informacao_promotor: 'Solicitação de informação adicional enviada ao promotor',
    registrar_divergencia: 'Divergência operacional confirmada para este item',
    manter_em_analise: 'Item mantido sob análise da equipe de inteligência',
    rejeitado: 'Item rejeitado para devolução',
  }

  await registrarTimelineEvento(
    casoId,
    codigoCaso,
    'decisao_humana',
    `Decisão no item: ${produtoNome}`,
    descricoesDecisao[decisao] + (observacao ? ` — Obs: "${observacao}"` : ''),
    {
      itemId,
      itemNome: produtoNome,
      usuarioNome,
    },
  )

  await registrarDevolucaoAudit(casoId, 'decisao_humana_item', {
    item_id: itemId,
    produto_nome: produtoNome,
    decisao,
    observacao,
    quantidade_autorizada: quantidadeAutorizada,
  })

  // Recalcular totais autorizados no caso
  const todosItens = await pb.collection('devolucoes_itens').getFullList({
    filter: `caso_id = '${casoId}'`,
  })
  const totalAutorizado = todosItens.reduce((acc, curr) => {
    const it = curr as unknown as { quantidade_autorizada?: number; decisao_humana?: string }
    if (
      it.decisao_humana === 'aprovado_para_industria' &&
      typeof it.quantidade_autorizada === 'number'
    ) {
      return acc + it.quantidade_autorizada
    }
    return acc
  }, 0)

  // Atualizar caso com total autorizado
  await pb.collection('devolucoes_casos').update(casoId, {
    total_unidades_autorizadas: totalAutorizado,
  })

  return updatedItem as unknown as DevolucaoItem
}

/**
 * Atualiza o status geral do Caso de Devolução (Regra 7 e 13: avanço parcial)
 */
export async function atualizarStatusCaso(
  casoId: string,
  codigoCaso: string,
  novoStatus: DevolucaoStatus,
  proximaAcao?: string,
  justificativa?: string,
): Promise<DevolucaoCaso> {
  const casoAtual = (await pb
    .collection('devolucoes_casos')
    .getOne(casoId)) as unknown as DevolucaoCaso
  const statusAnterior = casoAtual.status
  const user = pb.authStore.model

  const payload: Record<string, unknown> = {
    status: novoStatus,
  }
  if (proximaAcao) {
    payload.proxima_acao = proximaAcao
  }

  const updatedRecord = await pb.collection('devolucoes_casos').update(casoId, payload)

  await registrarTimelineEvento(
    casoId,
    codigoCaso,
    'mudanca_status',
    `Status alterado para ${novoStatus.toUpperCase().replace(/_/g, ' ')}`,
    justificativa || `Mudança de status de ${statusAnterior} para ${novoStatus}.`,
    {
      statusAnterior,
      statusNovo: novoStatus,
      usuarioNome: user?.name || user?.email,
    },
  )

  await registrarDevolucaoAudit(casoId, 'alteracao_status', {
    status_anterior: statusAnterior,
    status_novo: novoStatus,
    justificativa,
  })

  return updatedRecord as unknown as DevolucaoCaso
}

/**
 * Atualiza dados de Autorização da Indústria, NF e Descarte (Regra 20)
 */
export async function atualizarDadosAutorizacaoNFDescarte(
  casoId: string,
  codigoCaso: string,
  dados: {
    autorizacao_protocolo?: string
    autorizacao_data?: string
    nf_numero?: string
    nf_data?: string
    nf_valor?: number
    nf_anexo_nome?: string
    nf_assinada_anexo_nome?: string
    evidencia_descarte_anexo_nome?: string
    total_unidades_devolvidas?: number
    novo_status?: DevolucaoStatus
    proxima_acao?: string
  },
): Promise<DevolucaoCaso> {
  const user = pb.authStore.model
  const payload: Record<string, unknown> = {}

  if (dados.autorizacao_protocolo !== undefined)
    payload.autorizacao_protocolo = dados.autorizacao_protocolo
  if (dados.autorizacao_data !== undefined) payload.autorizacao_data = dados.autorizacao_data
  if (dados.nf_numero !== undefined) payload.nf_numero = dados.nf_numero
  if (dados.nf_data !== undefined) payload.nf_data = dados.nf_data
  if (dados.nf_valor !== undefined) payload.nf_valor = dados.nf_valor
  if (dados.nf_anexo_nome !== undefined) payload.nf_anexo_nome = dados.nf_anexo_nome
  if (dados.nf_assinada_anexo_nome !== undefined)
    payload.nf_assinada_anexo_nome = dados.nf_assinada_anexo_nome
  if (dados.evidencia_descarte_anexo_nome !== undefined)
    payload.evidencia_descarte_anexo_nome = dados.evidencia_descarte_anexo_nome
  if (dados.total_unidades_devolvidas !== undefined)
    payload.total_unidades_devolvidas = dados.total_unidades_devolvidas
  if (dados.novo_status) payload.status = dados.novo_status
  if (dados.proxima_acao) payload.proxima_acao = dados.proxima_acao

  const updated = await pb.collection('devolucoes_casos').update(casoId, payload)

  let tipoEvento: DevolucaoTimelineEvento['tipo_evento'] = 'outro'
  let tituloEvento = 'Atualização operacional do caso'

  if (dados.nf_numero) {
    tipoEvento = 'nf_registrada'
    tituloEvento = `Nota Fiscal ${dados.nf_numero} registrada`
  } else if (dados.autorizacao_protocolo) {
    tipoEvento = 'autorizacao_industria'
    tituloEvento = `Autorização da Indústria registrada (Prot. ${dados.autorizacao_protocolo})`
  } else if (dados.evidencia_descarte_anexo_nome) {
    tipoEvento = 'descarte_registrado'
    tituloEvento = 'Comprovante de Descarte anexado'
  } else if (dados.novo_status === 'concluido') {
    tipoEvento = 'caso_concluido'
    tituloEvento = 'Processo de Devolução / NF Concluído'
  }

  await registrarTimelineEvento(
    casoId,
    codigoCaso,
    tipoEvento,
    tituloEvento,
    `Atualização de dados operacionais (NF: ${dados.nf_numero || '-'}, Autorização: ${dados.autorizacao_protocolo || '-'}).`,
    {
      usuarioNome: user?.name || user?.email,
      dadosExtras: dados as Record<string, unknown>,
    },
  )

  await registrarDevolucaoAudit(casoId, 'atualizacao_nf_descarte', dados as Record<string, unknown>)

  return updated as unknown as DevolucaoCaso
}

/**
 * Anexa evidência (foto/documento) ao caso ou a item específico (Regra 15)
 */
export async function anexarEvidencia(
  casoId: string,
  codigoCaso: string,
  dados: {
    tipo: DevolucaoEvidencia['tipo']
    titulo: string
    descricao?: string
    url_arquivo?: string
    itemId?: string
    timelineId?: string
  },
): Promise<DevolucaoEvidencia> {
  const user = pb.authStore.model
  const record = await pb.collection('devolucoes_evidencias').create({
    caso_id: casoId,
    item_id: dados.itemId || '',
    timeline_id: dados.timelineId || '',
    tipo: dados.tipo,
    titulo: dados.titulo,
    descricao: dados.descricao || '',
    url_arquivo: dados.url_arquivo || '',
    usuario_nome: user?.name || user?.email || 'Sistema',
  })

  await registrarTimelineEvento(
    casoId,
    codigoCaso,
    'evidencia_anexada',
    `Evidência anexada: ${dados.titulo}`,
    dados.descricao,
    {
      itemId: dados.itemId,
      usuarioNome: user?.name || user?.email,
    },
  )

  await registrarDevolucaoAudit(casoId, 'anexo_evidencia', dados as Record<string, unknown>)

  return record as unknown as DevolucaoEvidencia
}

/**
 * Carrega Caso completo com itens, timeline e evidências
 */
export async function carregarCasoDetalhes(casoId: string): Promise<DevolucaoCaso | null> {
  try {
    const caso = (await pb
      .collection('devolucoes_casos')
      .getOne(casoId)) as unknown as DevolucaoCaso

    const [itensRes, timelineRes, evidenciasRes] = await Promise.all([
      pb.collection('devolucoes_itens').getFullList({
        filter: `caso_id = '${casoId}'`,
        sort: 'created',
      }),
      pb.collection('devolucoes_timeline').getFullList({
        filter: `caso_id = '${casoId}'`,
        sort: '-data_evento',
      }),
      pb.collection('devolucoes_evidencias').getFullList({
        filter: `caso_id = '${casoId}'`,
        sort: '-created',
      }),
    ])

    return {
      ...caso,
      itens: itensRes as unknown as DevolucaoItem[],
      timeline: timelineRes as unknown as DevolucaoTimelineEvento[],
      evidencias: evidenciasRes as unknown as DevolucaoEvidencia[],
    }
  } catch (err) {
    console.error('[devolucoesService] Erro ao carregar detalhes do caso:', err)
    return null
  }
}

/**
 * Lista todos os casos com suporte a filtros e agrupamento na fila operacional (Regra 16 e 17)
 */
export async function listarCasosOperacionais(
  filtros?: DevolucoesFiltros,
  allowedIndustries?: string[],
): Promise<{
  todos: DevolucaoCaso[]
  fila: FilaOperacionalAgrupada
}> {
  try {
    const filterClauses: string[] = []

    // Escopo restrito de indústrias no backend / query
    if (allowedIndustries && allowedIndustries.length > 0) {
      const allowedConditions = allowedIndustries.map(
        (ind) =>
          `industry_name = '${ind.replace(/'/g, "\\'")}' || industry_id = '${ind.replace(/'/g, "\\'")}'`,
      )
      filterClauses.push(`(${allowedConditions.join(' || ')})`)
    }

    if (filtros?.industria && filtros.industria !== 'todas') {
      filterClauses.push(`industry_name = '${filtros.industria.replace(/'/g, "\\'")}'`)
    }
    if (filtros?.loja && filtros.loja !== 'todas') {
      filterClauses.push(
        `store_code = '${filtros.loja.replace(/'/g, "\\'")}' || store_name ~ '${filtros.loja.replace(/'/g, "\\'")}'`,
      )
    }
    if (filtros?.promotor && filtros.promotor.trim() !== '') {
      filterClauses.push(`promotor_nome ~ '${filtros.promotor.replace(/'/g, "\\'")}'`)
    }
    if (filtros?.status && filtros.status !== 'todos') {
      filterClauses.push(`status = '${filtros.status}'`)
    }
    if (filtros?.classificacaoAuditoria && filtros.classificacaoAuditoria !== 'todos') {
      filterClauses.push(`resultado_auditoria_geral = '${filtros.classificacaoAuditoria}'`)
    }
    if (filtros?.periodoInicio) {
      filterClauses.push(`data_solicitacao >= '${filtros.periodoInicio}'`)
    }
    if (filtros?.periodoFim) {
      filterClauses.push(`data_solicitacao <= '${filtros.periodoFim}'`)
    }

    const filterString = filterClauses.length > 0 ? filterClauses.join(' && ') : ''

    const records = await pb.collection('devolucoes_casos').getFullList({
      filter: filterString,
      sort: '-created',
    })

    let todos = records as unknown as DevolucaoCaso[]

    // Busca textual livre no código, promotor, loja ou indústria
    if (filtros?.busca && filtros.busca.trim() !== '') {
      const q = filtros.busca.toLowerCase().trim()
      todos = todos.filter(
        (c) =>
          c.codigo_caso?.toLowerCase().includes(q) ||
          c.industry_name?.toLowerCase().includes(q) ||
          c.store_name?.toLowerCase().includes(q) ||
          c.promotor_nome?.toLowerCase().includes(q) ||
          c.observacoes?.toLowerCase().includes(q),
      )
    }

    // Agrupamento da Fila Operacional (Regra 16)
    // 1. PRECISA DE AÇÃO: Aguardando análise, Com divergência, Aguardando informação
    const statusPrecisaDeAcao: DevolucaoStatus[] = [
      'em_analise',
      'solicitacao_recebida',
      'aguardando_informacao',
      'divergencia_encontrada',
    ]

    // 2. EM ANDAMENTO: Prontas para envio, Aguardando indústria, Aguardando NF + descarte, Indústria autorizou
    const statusEmAndamento: DevolucaoStatus[] = [
      'pronta_para_envio',
      'aguardando_autorizacao_industria',
      'industria_autorizou',
      'aguardando_nf_descarte',
    ]

    // 3. FINALIZADAS: Concluído, Não autorizado, Cancelado
    const statusFinalizadas: DevolucaoStatus[] = ['concluido', 'nao_autorizado', 'cancelado']

    const precisaDeAcao = todos.filter((c) => statusPrecisaDeAcao.includes(c.status))
    const emAndamento = todos.filter((c) => statusEmAndamento.includes(c.status))
    const finalizadas = todos.filter((c) => statusFinalizadas.includes(c.status))

    const contagens = {
      total: todos.length,
      precisaDeAcao: precisaDeAcao.length,
      emAndamento: emAndamento.length,
      finalizadas: finalizadas.length,
      divergencias: todos.filter(
        (c) =>
          c.status === 'divergencia_encontrada' || c.resultado_auditoria_geral === 'divergencia',
      ).length,
      aguardandoInformacao: todos.filter((c) => c.status === 'aguardando_informacao').length,
      aguardandoAnalise: todos.filter(
        (c) => c.status === 'em_analise' || c.status === 'solicitacao_recebida',
      ).length,
    }

    return {
      todos,
      fila: {
        precisaDeAcao,
        emAndamento,
        finalizadas,
        contagens,
      },
    }
  } catch (err) {
    console.error('[devolucoesService] Erro ao listar casos:', err)
    return {
      todos: [],
      fila: {
        precisaDeAcao: [],
        emAndamento: [],
        finalizadas: [],
        contagens: {
          total: 0,
          precisaDeAcao: 0,
          emAndamento: 0,
          finalizadas: 0,
          divergencias: 0,
          aguardandoInformacao: 0,
          aguardandoAnalise: 0,
        },
      },
    }
  }
}

/**
 * Gera mensagem formatada pronta para solicitação à indústria (Regra 18)
 * Agrupada por Indústria e por Loja
 */
export function gerarMensagemSolicitacaoIndustria(caso: DevolucaoCaso): string {
  const itensAprovados = (caso.itens || []).filter(
    (it) =>
      it.decisao_humana === 'aprovado_para_industria' ||
      !it.decisao_humana ||
      it.decisao_humana === 'pendente',
  )

  const linhasProdutos = itensAprovados
    .map((it, idx) => {
      const nome = it.produto_nome_oficial || it.produto_nome_informado
      const qtd = it.quantidade_autorizada ?? it.quantidade_solicitada
      const val = it.validade_ausente
        ? 'Validade não informada'
        : it.validade_informada || 'Não informada'
      const motivo = it.motivo_item || caso.motivo_geral || 'Troca operacional'
      return `  ${idx + 1}. *${nome}* — ${qtd} un. | Validade: ${val} | Motivo: ${motivo}`
    })
    .join('\n')

  return `*SOLICITAÇÃO DE DEVOLUÇÃO / TROCA — DIRETORIA PROMOÇÕES*
*Caso:* ${caso.codigo_caso}
*Indústria:* ${caso.industry_name}
*Loja:* ${caso.store_name} ${caso.store_code ? `(Cód. ${caso.store_code})` : ''}
*Data da Solicitação:* ${caso.data_solicitacao}
*Promotor Responsável:* ${caso.promotor_nome}

*PRODUTOS:*
${linhasProdutos || '  (Nenhum produto selecionado)'}

*Total de Produtos:* ${itensAprovados.length}
*Total de Unidades:* ${itensAprovados.reduce((a, b) => a + (b.quantidade_autorizada ?? b.quantidade_solicitada ?? 0), 0)}

*Observações:* ${caso.observacoes || 'Conforme alinhamento operacional.'}

Aguardamos autorização para emissão da NF e destinação.`
}
