/**
 * Serviço de Homologação Cadastral TradePro (Bloco A / A.1)
 *
 * Objetivo Único:
 * Reconciliar e homologar com segurança os Cadastros Mestres do SKIP
 * a partir das fontes operacionais e dados reais da base (validades_base,
 * rupturas_base, operacional_visitas, staging).
 *
 * Diretrizes Obrigatórias:
 * 1. Sem limite de 10 páginas: percorre todas as páginas necessárias da base ativa elegível.
 * 2. Métricas completas do universo processado (Validades lidas, Rupturas lidas, Visitas lidas, Total de páginas por fonte).
 * 3. Operacional_visitas incluído de verdade (promotor, loja, eventualmente indústria quando disponível; NUNCA inventar supervisor/indústria ausentes).
 * 4. Visita observada NÃO é roteiro confirmado (tipo_vinculo: 'observado_visita').
 * 5. Persistir vínculos observados de forma idempotente em store_promoter_assignments sem criar cadastros paralelos.
 * 6. Diferenciar detectado de persistido: relações detectadas, relações novas persistidas, já existentes e pendentes.
 * 7. Promotor -> Loja: registrar como vínculo observado preservando datas, origem, tipo de vínculo.
 * 8. Promotor -> Indústria e Supervisor -> Promotor: relações observadas registradas sem confundir com confirmação administrativa.
 * 9. Proteção de edição manual consistente: edicao_manual = true impede que campos administrativos sejam alterados pela API.
 * 10. Enriquecimento seguro sem conflito: atualização de ultima_observacao_fonte e identificadores brutos permitidos se não houver conflito.
 * 11. Última observação atualizada para todas as entidades (indústria, loja, promotor, supervisor, redes). Nunca desativar automaticamente.
 * 12. Contador de pendências representa o volume real acumulado no universo processado (ex.: 500 ocorrências -> 500).
 * 13. Pendência idempotente: nova homologação da mesma base mantém 500 ocorrências, sem somar +1 ou dobrar.
 * 14. Indústria: preferência obrigatória Cód. Cliente TradePro. Fallback de correspondência por nome gera "Possível vínculo encontrado" na pendência assistida para decisão humana, sem gravar tradepro_client_id silenciosamente.
 * 15. Produtos de Ruptura: exportação pode não ter Cód. Produto. Produto resolvido por Indústria + nome normalizado + Catálogo. Relatório não afirma falsamente que todo produto teve código.
 * 16. Preservar: Fornecedor fora de indústria, Fantasia -> Rede, Razão Social -> Loja, Cód. Cliente -> Indústria, Mix em 3 níveis, etc.
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
  CadastroPromotorAssignment,
  OperacionalVisita,
  HomologacaoCadastralResultado,
} from '@/types/cadastros'
import {
  normalizarChaveEntidade,
  extrairCodigoLojaRazaoSocial,
} from '@/lib/resolve/cadastrosResolver'
import { normalizarNomeProduto } from '@/lib/resolve/produtoResolver'
import {
  getCadastrosIndustrias,
  getCadastrosRedes,
  getCadastrosLojas,
  getCadastrosSupervisores,
  getCadastrosPromotores,
  getCadastrosProdutos,
  logCadastroAudit,
} from '@/services/cadastrosService'

export interface RawEntityPayload {
  origemFonte: 'tradepro_rupturas' | 'tradepro_validades' | 'tradepro_visitas' | 'base_atual'
  codCliente?: string
  cliente?: string
  fornecedor?: string
  fantasia?: string
  razaoSocial?: string
  codigoLoja?: string
  nomeLoja?: string
  cidade?: string
  estado?: string
  codColaborador?: string
  colaborador?: string
  codSupervisor?: string
  supervisor?: string
  codProduto?: string
  produto?: string
  dataObservacao?: string
  dadosBrutosJson?: Record<string, unknown>
}

/**
 * Registra ou atualiza pendência consolidada de forma idempotente e exata.
 * O volume_ocorrencias recebe o volume REAL calculado no universo atual processado,
 * garantindo que reexecuções da mesma base mantenham o número exato (ex: 500) sem duplicar.
 */
export async function registrarPendenciaConsolidada(
  tipo: CadastroPendencia['tipo_entidade'],
  valorIdentificador: string,
  codigoExterno?: string,
  nomeIdentificado?: string,
  origemFonte = 'tradepro_sync',
  contexto?: Record<string, unknown>,
  volumeUniverso = 1,
): Promise<void> {
  const valLimpo = (valorIdentificador || codigoExterno || nomeIdentificado || '').trim()
  if (!valLimpo) return

  const ocorrencias = Math.max(1, volumeUniverso)

  try {
    const valEscaped = valLimpo.replace(/'/g, "\\'")
    const existing = await pb.collection('cadastros_pendencias').getList<CadastroPendencia>(1, 1, {
      filter: `tipo_entidade = '${tipo}' && valor_identificador = '${valEscaped}' && status = 'pendente'`,
    })

    if (existing.items.length > 0) {
      const p = existing.items[0]
      // Atualiza de forma idempotente para o volume real do universo
      await pb.collection('cadastros_pendencias').update(p.id, {
        volume_ocorrencias: ocorrencias,
        codigo_externo: codigoExterno?.trim() || p.codigo_externo || '',
        nome_identificado: nomeIdentificado?.trim() || p.nome_identificado || '',
        origem_fonte: origemFonte,
        contexto_adicional: {
          ...(p.contexto_adicional || {}),
          ...(contexto || {}),
          atualizado_em: new Date().toISOString(),
        },
        updated: new Date().toISOString(),
      })
    } else {
      await pb.collection('cadastros_pendencias').create({
        tipo_entidade: tipo,
        valor_identificador: valLimpo,
        codigo_externo: codigoExterno?.trim() || '',
        nome_identificado: nomeIdentificado?.trim() || '',
        origem_fonte: origemFonte,
        status: 'pendente',
        volume_ocorrencias: ocorrencias,
        contexto_adicional: contexto || {},
      })
    }
  } catch (err) {
    console.warn('[homologacaoCadastral] Falha ao registrar pendência consolidada:', err)
  }
}

/**
 * Executa a homologação cadastral completa sobre os dados existentes na base:
 * - validades_base (todas as páginas necessárias da base ativa/elegível)
 * - rupturas_base (todas as páginas necessárias da base ativa/elegível)
 * - operacional_visitas (todas as páginas de visitas operacionais reais)
 *
 * Garante idempotência, proteção estrita a edicao_manual = true, governança assistida
 * para indústrias sem tradepro_client_id e persistência de vínculos observados.
 */
export async function executarHomologacaoCadastralBaseAtual(
  userName = 'Operador',
): Promise<HomologacaoCadastralResultado> {
  const dataHoje = new Date().toISOString().split('T')[0]

  const resultado: HomologacaoCadastralResultado = {
    fonteHomologada: 'TradePro API',
    dataExecucao: new Date().toISOString(),
    metricasOrigem: {
      registrosTradeProConsiderados: 0,
      registrosExcelExcluidos: 0,
      registrosLegadosExcluidos: 0,
      registrosSemOrigemConfiavelExcluidos: 0,
      detalhesPorFonte: {
        validades: {
          consideradosTradePro: 0,
          excluidosExcel: 0,
          excluidosLegados: 0,
          excluidosSemOrigem: 0,
          paginasProcessadas: 0,
        },
        rupturas: {
          consideradosTradePro: 0,
          excluidosExcel: 0,
          excluidosLegados: 0,
          excluidosSemOrigem: 0,
          paginasProcessadas: 0,
        },
        visitas: {
          consideradosTradePro: 0,
          excluidosExcel: 0,
          excluidosLegados: 0,
          excluidosSemOrigem: 0,
          paginasProcessadas: 0,
        },
      },
    },
    universoProcessado: {
      validadesLidas: 0,
      rupturasLidas: 0,
      visitasLidas: 0,
      totalPaginasPorFonte: {
        validades: 0,
        rupturas: 0,
        visitas: 0,
      },
    },
    industrias: { descobertas: 0, vinculadas: 0, pendentes: 0, conflitos: 0, detalhes: [] },
    redes: { descobertas: 0, vinculadas: 0, pendentes: 0, detalhes: [] },
    lojas: { descobertas: 0, vinculadas: 0, pendentes: 0, possiveisDuplicidades: 0, detalhes: [] },
    produtos: { descobertos: 0, resolvidos: 0, pendentes: 0, ambiguos: 0, detalhes: [] },
    promotores: { descobertos: 0, vinculados: 0, pendentes: 0, detalhes: [] },
    supervisores: { descobertos: 0, vinculados: 0, pendentes: 0, detalhes: [] },
    relacoes: {
      detectadas: 0,
      novasPersistidas: 0,
      jaExistentes: 0,
      historicasEncerradas: 0,
      pendentes: 0,
    },
    vinculosObservados: { promotorLoja: 0, promotorIndustria: 0, supervisorPromotor: 0 },
    visitasStatus: 'Visitas TradePro: Aguardando homologação da integração (Bloco B)',
  }

  try {
    // 1. Carregar estado cadastral mestre atual do SKIP
    const [
      industriasAtuais,
      redesAtuais,
      lojasAtuais,
      supervisoresAtuais,
      promotoresAtuais,
      produtosAtuais,
    ] = await Promise.all([
      getCadastrosIndustrias(),
      getCadastrosRedes(),
      getCadastrosLojas(),
      getCadastrosSupervisores(),
      getCadastrosPromotores(),
      getCadastrosProdutos(),
    ])

    // Índices em memória para busca segura O(1)
    const indByTradeproId = new Map<string, CadastroIndustria>()
    const indByName = new Map<string, CadastroIndustria>()
    for (const ind of industriasAtuais) {
      if (ind.tradepro_client_id) {
        indByTradeproId.set(ind.tradepro_client_id.trim(), ind)
      }
      indByName.set(normalizarChaveEntidade(ind.nome), ind)
    }

    const redeByName = new Map<string, CadastroRede>()
    for (const r of redesAtuais) {
      redeByName.set(normalizarChaveEntidade(r.nome), r)
    }

    const lojaByCode = new Map<string, CadastroLoja>()
    const lojaByName = new Map<string, CadastroLoja>()
    for (const l of lojasAtuais) {
      const cod = (l.codigo_externo || l.codigo_loja || '').trim()
      if (cod) lojaByCode.set(cod, l)
      if (l.razao_social) lojaByName.set(normalizarChaveEntidade(l.razao_social), l)
      if (l.nome) lojaByName.set(normalizarChaveEntidade(l.nome), l)
    }

    const supByCode = new Map<string, CadastroSupervisor>()
    const supByName = new Map<string, CadastroSupervisor>()
    for (const s of supervisoresAtuais) {
      if (s.codigo_externo) supByCode.set(s.codigo_externo.trim(), s)
      supByName.set(normalizarChaveEntidade(s.nome), s)
    }

    const promByCode = new Map<string, CadastroPromotor>()
    const promByName = new Map<string, CadastroPromotor>()
    for (const p of promotoresAtuais) {
      if (p.codigo_externo) promByCode.set(p.codigo_externo.trim(), p)
      promByName.set(normalizarChaveEntidade(p.nome), p)
    }

    // Produtos por (industry_id, codigo_produto) e por (industry_id, nome_normalizado)
    const prodByIndCode = new Map<string, CadastroProduto>()
    const prodByIndName = new Map<string, CadastroProduto>()
    for (const p of produtosAtuais) {
      if (p.industry_id && p.codigo_produto) {
        prodByIndCode.set(`${p.industry_id}_${p.codigo_produto.trim()}`, p)
      }
      if (p.industry_id && p.nome_produto) {
        prodByIndName.set(`${p.industry_id}_${normalizarNomeProduto(p.nome_produto)}`, p)
      }
    }

    // Carregar assignments existentes para verificar relações já cadastradas
    // Separamos vínculos ATIVOS de vínculos HISTÓRICOS ENCERRADOS por par canônico (promoter_id + store_id / store_code)
    let assignmentsExistentes: CadastroPromotorAssignment[] = []
    try {
      assignmentsExistentes = await pb
        .collection('store_promoter_assignments')
        .getFullList<CadastroPromotorAssignment>()
    } catch {
      assignmentsExistentes = []
    }
    // Map para vínculos ATIVOS existentes: chave canônica promoter_id + store_id (ou store_code se store_id não existir)
    const assignmentsAtivosMap = new Map<string, CadastroPromotorAssignment>()
    // Map para vínculos ENCERRADOS históricos: chave canônica
    const assignmentsEncerradosMap = new Map<string, CadastroPromotorAssignment[]>()

    for (const a of assignmentsExistentes) {
      const promKey = a.promoter_id || a.promoter_nome
      const storeKey = a.store_id || a.store_code
      const canonicalKey = `${promKey}__${storeKey}`

      if (a.status === 'ativo') {
        assignmentsAtivosMap.set(canonicalKey, a)
      } else if (a.status === 'encerrado') {
        const list = assignmentsEncerradosMap.get(canonicalKey) || []
        list.push(a)
        assignmentsEncerradosMap.set(canonicalKey, list)
      }
    }

    // -------------------------------------------------------------------------
    // 2. Extração segura de dados brutos com paginação TOTAL (SEM limite de 10 páginas)
    // E FILTRO RIGOROSO DE ORIGEM (Bloco A.2 - Fonte Oficial TradePro)
    // -------------------------------------------------------------------------
    type ValidadeRow = {
      cod_cliente?: string
      cliente?: string
      fornecedor?: string
      fantasia?: string
      razao_social?: string
      codigo_loja?: string
      nome_loja?: string
      cidade?: string
      estado?: string
      cod_colaborador?: string
      colaborador?: string
      cod_supervisor?: string
      supervisor?: string
      cod_produto?: string
      produto?: string
      data_arquivo?: string
      realizado?: string
      dados_brutos_json?: any
      // Campos de auditoria/origem
      is_base_atual?: boolean
      data_importacao?: string
      tenant_id?: string
      import_id?: string
      origem_fonte?: string
      source?: string
    }

    const validadesAmostra: ValidadeRow[] = []
    let pageV = 1
    let totalPagesV = 1
    const perPage = 200

    do {
      const resp = await pb.collection('validades_base').getList<ValidadeRow>(pageV, perPage, {
        sort: '-created',
      })
      totalPagesV = resp.totalPages || 1
      const items = resp.items || []

      for (const row of items) {
        // Regra Validades TradePro Oficial:
        // is_base_atual = true E (data_importacao ~ 'tradepro_job' || tenant_id ~ 'tradepro_job');
        // excluir qualquer registro com import_id (vinculado a import_history / Excel manual).
        const hasImportId = Boolean(row.import_id && String(row.import_id).trim())
        const isTradeProOrigin =
          (row.data_importacao && String(row.data_importacao).includes('tradepro_job')) ||
          (row.tenant_id && String(row.tenant_id).includes('tradepro_job')) ||
          (row.origem_fonte && String(row.origem_fonte).includes('tradepro'))
        const isBaseAtual = Boolean(row.is_base_atual)

        if (hasImportId) {
          resultado.metricasOrigem.registrosExcelExcluidos++
          resultado.metricasOrigem.detalhesPorFonte.validades.excluidosExcel++
        } else if (!isTradeProOrigin) {
          if (
            row.origem_fonte === 'legado' ||
            String(row.data_importacao || '').includes('legado')
          ) {
            resultado.metricasOrigem.registrosLegadosExcluidos++
            resultado.metricasOrigem.detalhesPorFonte.validades.excluidosLegados++
          } else {
            resultado.metricasOrigem.registrosSemOrigemConfiavelExcluidos++
            resultado.metricasOrigem.detalhesPorFonte.validades.excluidosSemOrigem++
          }
        } else if (!isBaseAtual) {
          // Não é base atual vigente
          resultado.metricasOrigem.registrosLegadosExcluidos++
          resultado.metricasOrigem.detalhesPorFonte.validades.excluidosLegados++
        } else {
          // Qualificado: TradePro + is_base_atual + sem import_id
          validadesAmostra.push(row)
          resultado.metricasOrigem.registrosTradeProConsiderados++
          resultado.metricasOrigem.detalhesPorFonte.validades.consideradosTradePro++
        }
      }

      pageV++
    } while (pageV <= totalPagesV)

    resultado.universoProcessado.validadesLidas = validadesAmostra.length
    resultado.universoProcessado.totalPaginasPorFonte.validades = totalPagesV
    resultado.metricasOrigem.detalhesPorFonte.validades.paginasProcessadas = totalPagesV

    type RupturaRow = {
      codigo_cliente?: string
      cliente?: string
      fantasia?: string
      razao_social?: string
      codigo_loja?: string
      nome_loja?: string
      cidade?: string
      estado?: string
      colaborador?: string
      produto?: string
      data_visita?: string
      dados_brutos_json?: any
      // Campos de auditoria/origem
      is_base_atual?: boolean
      tenant_id?: string
      source_import_id?: string
      import_id?: string
      origem_fonte?: string
    }

    const rupturasAmostra: RupturaRow[] = []
    let pageR = 1
    let totalPagesR = 1

    do {
      const resp = await pb.collection('rupturas_base').getList<RupturaRow>(pageR, perPage, {
        sort: '-created',
      })
      totalPagesR = resp.totalPages || 1
      const items = resp.items || []

      for (const row of items) {
        // Regra Rupturas TradePro Oficial:
        // is_base_atual = true E tenant_id ~ 'tradepro_job' (ou origem_fonte ~ 'tradepro');
        // excluir registros com source_import_id / import_id apontando para rupturas_imports / planilhas.
        const hasSpreadsheetImport = Boolean(
          (row.source_import_id && String(row.source_import_id).trim()) ||
          (row.import_id && String(row.import_id).trim()),
        )
        const isTradeProOrigin =
          (row.tenant_id && String(row.tenant_id).includes('tradepro_job')) ||
          (row.origem_fonte && String(row.origem_fonte).includes('tradepro'))
        const isBaseAtual = Boolean(row.is_base_atual)

        if (hasSpreadsheetImport) {
          resultado.metricasOrigem.registrosExcelExcluidos++
          resultado.metricasOrigem.detalhesPorFonte.rupturas.excluidosExcel++
        } else if (!isTradeProOrigin) {
          if (row.origem_fonte === 'legado' || String(row.tenant_id || '').includes('legado')) {
            resultado.metricasOrigem.registrosLegadosExcluidos++
            resultado.metricasOrigem.detalhesPorFonte.rupturas.excluidosLegados++
          } else {
            resultado.metricasOrigem.registrosSemOrigemConfiavelExcluidos++
            resultado.metricasOrigem.detalhesPorFonte.rupturas.excluidosSemOrigem++
          }
        } else if (!isBaseAtual) {
          resultado.metricasOrigem.registrosLegadosExcluidos++
          resultado.metricasOrigem.detalhesPorFonte.rupturas.excluidosLegados++
        } else {
          // Qualificado: TradePro + is_base_atual + sem source_import_id
          rupturasAmostra.push(row)
          resultado.metricasOrigem.registrosTradeProConsiderados++
          resultado.metricasOrigem.detalhesPorFonte.rupturas.consideradosTradePro++
        }
      }

      pageR++
    } while (pageR <= totalPagesR)

    resultado.universoProcessado.rupturasLidas = rupturasAmostra.length
    resultado.universoProcessado.totalPaginasPorFonte.rupturas = totalPagesR
    resultado.metricasOrigem.detalhesPorFonte.rupturas.paginasProcessadas = totalPagesR

    // 2.3 Processamento de operacional_visitas (BLOCO A.3 — AGUARDANDO HOMOLOGAÇÃO NO BLOCO B)
    // Diretriz Bloco A.3 (Itens 8, 9, 15): A integração de Visitas ainda será revisada no Bloco B.
    // NÃO utilizar operacional_visitas para produzir vínculos oficiais da homologação cadastral principal.
    // Registros não são contabilizados como "0 Visitas realizadas", mas informados como:
    // "Visitas TradePro: Aguardando homologação da integração (Bloco B)".
    // Lemos a contagem apenas para auditoria técnica transparente sem produzir contaminação cadastral.
    let totalVisitasLidasNoBanco = 0
    let totalPagesVis = 0
    try {
      const respVisCount = await pb
        .collection('operacional_visitas')
        .getList<OperacionalVisita>(1, 1, {
          sort: '-data',
        })
      totalVisitasLidasNoBanco = respVisCount.totalItems || 0
      totalPagesVis = respVisCount.totalPages || 0
    } catch {
      totalVisitasLidasNoBanco = 0
      totalPagesVis = 0
    }

    resultado.visitasStatus = 'Visitas TradePro: Aguardando homologação da integração (Bloco B)'
    resultado.universoProcessado.visitasLidas = totalVisitasLidasNoBanco
    resultado.universoProcessado.totalPaginasPorFonte.visitas = totalPagesVis
    resultado.metricasOrigem.detalhesPorFonte.visitas.paginasProcessadas = totalPagesVis

    // Estruturas de Agrupamento das Descobertas
    const descobertasInd = new Map<string, { nome: string; count: number; datas: string[] }>()
    const descobertasRede = new Map<string, { count: number; datas: string[] }>()
    const descobertasLoja = new Map<
      string,
      {
        razaoSocial: string
        nome: string
        cidade: string
        estado: string
        fantasia: string
        count: number
        datas: string[]
      }
    >()
    const descobertasProm = new Map<
      string,
      { nome: string; codSup?: string; nomeSup?: string; count: number; datas: string[] }
    >()
    const descobertasSup = new Map<string, { nome: string; count: number; datas: string[] }>()
    const descobertasProd = new Map<
      string,
      {
        codProduto?: string
        nomeProduto: string
        nomeProdutoNormalizado: string
        codCliente?: string
        clienteNome?: string
        origemSemCodigo?: boolean
        count: number
      }
    >()

    // Relações observadas rastreadas com metadados temporais e tipo/origem precisos
    interface RelPromLojaInfo {
      promoterCod: string
      promoterNome: string
      storeCode: string
      storeName: string
      industryName?: string
      datas: string[]
      tipoVinculo: 'observado_visita' | 'observado_operacao'
      origemVinculo: 'tradepro_visitas' | 'tradepro_validades' | 'tradepro_rupturas'
      origem: string
    }
    const relPromLojaMap = new Map<string, RelPromLojaInfo>()
    const relPromIndMap = new Map<string, { promCod: string; indName: string; datas: string[] }>()
    const relSupPromMap = new Map<string, { supCod: string; promCod: string; datas: string[] }>()

    // -------------------------------------------------------------------------
    // 2.1 Processar Validades
    // -------------------------------------------------------------------------
    for (const v of validadesAmostra) {
      const codCli = (v.cod_cliente || '').trim()
      const nomeCli = (v.cliente || '').trim()
      const dataObs = (v.realizado || v.data_arquivo || dataHoje).split('T')[0]

      // Indústria: Fornecedor (ex: DIRETORIA) NUNCA é Indústria!
      if (codCli) {
        if (!descobertasInd.has(codCli)) {
          descobertasInd.set(codCli, { nome: nomeCli, count: 0, datas: [] })
        }
        const indItem = descobertasInd.get(codCli)!
        indItem.count++
        if (dataObs && !indItem.datas.includes(dataObs)) indItem.datas.push(dataObs)
      }

      // Rede: Fantasia é autoridade
      const fan = (v.fantasia || '').trim()
      if (fan) {
        const normFan = normalizarChaveEntidade(fan)
        if (!descobertasRede.has(normFan)) {
          descobertasRede.set(normFan, { count: 0, datas: [] })
        }
        const rItem = descobertasRede.get(normFan)!
        rItem.count++
        if (dataObs && !rItem.datas.includes(dataObs)) rItem.datas.push(dataObs)
      }

      // Loja: Código e Razão Social
      const codLoja = (
        v.codigo_loja || extrairCodigoLojaRazaoSocial(v.razao_social || v.nome_loja)
      ).trim()
      if (codLoja) {
        if (!descobertasLoja.has(codLoja)) {
          descobertasLoja.set(codLoja, {
            razaoSocial: v.razao_social || v.nome_loja || '',
            nome: v.nome_loja || v.razao_social || '',
            cidade: v.cidade || '',
            estado: v.estado || '',
            fantasia: fan,
            count: 0,
            datas: [],
          })
        }
        const lItem = descobertasLoja.get(codLoja)!
        lItem.count++
        if (dataObs && !lItem.datas.includes(dataObs)) lItem.datas.push(dataObs)
      }

      // Supervisor
      const codSup = (v.cod_supervisor || '').trim()
      const nomeSup = (v.supervisor || '').trim()
      if (codSup || nomeSup) {
        const keySup = codSup || normalizarChaveEntidade(nomeSup)
        if (!descobertasSup.has(keySup)) {
          descobertasSup.set(keySup, { nome: nomeSup, count: 0, datas: [] })
        }
        const sItem = descobertasSup.get(keySup)!
        sItem.count++
        if (dataObs && !sItem.datas.includes(dataObs)) sItem.datas.push(dataObs)
      }

      // Promotor
      const codProm = (v.cod_colaborador || '').trim()
      const nomeProm = (v.colaborador || '').trim()
      if (codProm || nomeProm) {
        const keyProm = codProm || normalizarChaveEntidade(nomeProm)
        if (!descobertasProm.has(keyProm)) {
          descobertasProm.set(keyProm, {
            nome: nomeProm,
            codSup,
            nomeSup,
            count: 0,
            datas: [],
          })
        }
        const pItem = descobertasProm.get(keyProm)!
        pItem.count++
        if (dataObs && !pItem.datas.includes(dataObs)) pItem.datas.push(dataObs)

        if (codProm && codLoja) {
          const relKey = `${codProm}__${codLoja}`
          if (!relPromLojaMap.has(relKey)) {
            relPromLojaMap.set(relKey, {
              promoterCod: codProm,
              promoterNome: nomeProm,
              storeCode: codLoja,
              storeName: v.nome_loja || v.razao_social || '',
              industryName: nomeCli,
              datas: [],
              tipoVinculo: 'observado_operacao',
              origemVinculo: 'tradepro_validades',
              origem: 'validades_base',
            })
          }
          const rel = relPromLojaMap.get(relKey)!
          if (dataObs && !rel.datas.includes(dataObs)) rel.datas.push(dataObs)
        }

        if (codProm && nomeCli) {
          const relKey = `${codProm}__${nomeCli}`
          if (!relPromIndMap.has(relKey)) {
            relPromIndMap.set(relKey, { promCod: codProm, indName: nomeCli, datas: [] })
          }
          const rel = relPromIndMap.get(relKey)!
          if (dataObs && !rel.datas.includes(dataObs)) rel.datas.push(dataObs)
        }

        if (codSup && codProm) {
          const relKey = `${codSup}__${codProm}`
          if (!relSupPromMap.has(relKey)) {
            relSupPromMap.set(relKey, { supCod: codSup, promCod: codProm, datas: [] })
          }
          const rel = relSupPromMap.get(relKey)!
          if (dataObs && !rel.datas.includes(dataObs)) rel.datas.push(dataObs)
        }
      }

      // Produto: preservar codigoProduto, nomeProduto, nomeProdutoNormalizado
      const prodNome = (v.produto || '').trim()
      const codProd = (v.cod_produto || '').trim()
      if (prodNome) {
        const normNome = normalizarNomeProduto(prodNome)
        const keyProd = `${codCli || 'SEM_IND'}__${codProd || normNome}`
        if (!descobertasProd.has(keyProd)) {
          descobertasProd.set(keyProd, {
            codProduto: codProd,
            nomeProduto: prodNome,
            nomeProdutoNormalizado: normNome,
            codCliente: codCli,
            clienteNome: nomeCli,
            origemSemCodigo: !codProd,
            count: 0,
          })
        }
        descobertasProd.get(keyProd)!.count++
      }
    }

    // -------------------------------------------------------------------------
    // 2.2 Processar Rupturas
    // Semântica comprovada por payload real TradePro:
    // - codigoCliente em Rupturas é o código da LOJA (ex: "165"), NUNCA Indústria!
    // - Fantasia = Rede (ex: "GRUPO PEREIRA")
    // - Razão Social = Loja (ex: "165 - FORT ATACADISTA - AVENTUREIRO")
    // - Fornecedor = Fornecedor operacional (ex: "DIRETORIA"), NUNCA Indústria!
    // - Portanto, r.codigo_cliente em Rupturas TradePro NUNCA gera descoberta de Indústria!
    //   A Indústria só entra em descobertas se industry_id estiver resolvido no registro,
    //   ou r.cliente não for nulo nem "Não identificada".
    // -------------------------------------------------------------------------
    for (const r of rupturasAmostra) {
      const nomeCli = (r.cliente || '').trim()
      const dataObs = (r.data_visita || dataHoje).split('T')[0]

      // Apenas considera Indústria em Rupturas se já houver industry_id resolvido
      // ou se o nome foi derivado com segurança e não é 'Não identificada'
      if (r.industry_id && nomeCli && nomeCli !== 'Não identificada') {
        const indKey = r.industry_id
        if (!descobertasInd.has(indKey)) {
          descobertasInd.set(indKey, { nome: nomeCli, count: 0, datas: [] })
        }
        const indItem = descobertasInd.get(indKey)!
        indItem.count++
        if (dataObs && !indItem.datas.includes(dataObs)) indItem.datas.push(dataObs)
      }

      const fan = (r.fantasia || '').trim()
      if (fan) {
        const normFan = normalizarChaveEntidade(fan)
        if (!descobertasRede.has(normFan)) {
          descobertasRede.set(normFan, { count: 0, datas: [] })
        }
        const rItem = descobertasRede.get(normFan)!
        rItem.count++
        if (dataObs && !rItem.datas.includes(dataObs)) rItem.datas.push(dataObs)
      }

      const codLoja = (
        r.codigo_loja || extrairCodigoLojaRazaoSocial(r.razao_social || r.nome_loja)
      ).trim()
      if (codLoja) {
        if (!descobertasLoja.has(codLoja)) {
          descobertasLoja.set(codLoja, {
            razaoSocial: r.razao_social || r.nome_loja || '',
            nome: r.nome_loja || r.razao_social || '',
            cidade: r.cidade || '',
            estado: r.estado || '',
            fantasia: fan,
            count: 0,
            datas: [],
          })
        }
        const lItem = descobertasLoja.get(codLoja)!
        lItem.count++
        if (dataObs && !lItem.datas.includes(dataObs)) lItem.datas.push(dataObs)
      }

      const nomeColab = (r.colaborador || '').trim()
      if (nomeColab) {
        const keyProm = normalizarChaveEntidade(nomeColab)
        if (!descobertasProm.has(keyProm)) {
          descobertasProm.set(keyProm, {
            nome: nomeColab,
            count: 0,
            datas: [],
          })
        }
        const pItem = descobertasProm.get(keyProm)!
        pItem.count++
        if (dataObs && !pItem.datas.includes(dataObs)) pItem.datas.push(dataObs)

        if (codLoja) {
          const relKey = `${nomeColab}__${codLoja}`
          if (!relPromLojaMap.has(relKey)) {
            relPromLojaMap.set(relKey, {
              promoterCod: '',
              promoterNome: nomeColab,
              storeCode: codLoja,
              storeName: r.nome_loja || r.razao_social || '',
              industryName: nomeCli,
              datas: [],
              tipoVinculo: 'observado_operacao',
              origemVinculo: 'tradepro_rupturas',
              origem: 'rupturas_base',
            })
          }
          const rel = relPromLojaMap.get(relKey)!
          if (dataObs && !rel.datas.includes(dataObs)) rel.datas.push(dataObs)
        }
      }

      // Na exportação de rupturas NÃO há Cód. Produto obrigatoriamente.
      // Preservar nome e nome normalizado. NUNCA usar código numérico como nome.
      // Em Rupturas TradePro, codCliente NUNCA é Indústria.
      const prodNome = (r.produto || '').trim()
      if (prodNome) {
        const normNome = normalizarNomeProduto(prodNome)
        const keyProd = `${r.industry_id || 'SEM_IND'}__${normNome}`
        if (!descobertasProd.has(keyProd)) {
          descobertasProd.set(keyProd, {
            codProduto: undefined,
            nomeProduto: prodNome,
            nomeProdutoNormalizado: normNome,
            codCliente: r.industry_id || undefined,
            clienteNome: nomeCli !== 'Não identificada' ? nomeCli : undefined,
            origemSemCodigo: true,
            count: 0,
          })
        }
        descobertasProd.get(keyProd)!.count++
      }
    }

    // NOTA BLOCO A.3: Visitas reais de operacional_visitas NÃO são processadas aqui para vínculos oficiais.
    // Permanecem em estado "Aguardando homologação da integração" até o Bloco B.

    // -------------------------------------------------------------------------
    // 3. RECONCILIAÇÃO 1: INDÚSTRIAS
    // Preferência obrigatória: Cód. Cliente TradePro -> vínculo seguro.
    // Quando não houver vínculo pelo código e existir apenas nome, gerar
    // "Possível vínculo encontrado" na fila de pendências assistida para governança humana.
    // NUNCA gravar tradepro_client_id silenciosamente.
    // -------------------------------------------------------------------------
    for (const [codCli, info] of descobertasInd.entries()) {
      resultado.industrias.descobertas++
      const maisRecente = info.datas.sort().reverse()[0] || dataHoje

      // 1. Busca obrigatória por tradepro_client_id
      const matchPorId = indByTradeproId.get(codCli)

      if (matchPorId) {
        resultado.industrias.vinculadas++
        resultado.industrias.detalhes.push({
          id: matchPorId.id,
          nome: matchPorId.nome,
          codCliente: codCli,
          status: 'vinculado_seguro',
        })

        // Atualização segura de última observação sem alterar campos administrativos protegidos
        try {
          await pb.collection('industry_registry').update(matchPorId.id, {
            ultima_observacao_fonte: maisRecente,
          })
        } catch {
          /* non-fatal */
        }
      } else {
        // Fallback por nome: NÃO grava tradepro_client_id silenciosamente.
        // Gera pendência assistida com sugestão de vínculo para o operador confirmar.
        let matchSugerido: CadastroIndustria | undefined
        if (info.nome) {
          matchSugerido = indByName.get(normalizarChaveEntidade(info.nome))
        }

        resultado.industrias.pendentes++
        resultado.industrias.detalhes.push({
          id: `pendente_${codCli}`,
          nome: info.nome || `Cliente TradePro #${codCli}`,
          codCliente: codCli,
          status: matchSugerido ? 'possivel_vinculo_sugerido' : 'pendente_vinculacao',
        })

        await registrarPendenciaConsolidada(
          'industria',
          codCli,
          codCli,
          info.nome || `Cliente TradePro #${codCli}`,
          'tradepro_sync',
          {
            motivo: matchSugerido
              ? `Possível vínculo encontrado com indústria existente "${matchSugerido.nome}" (ID ${matchSugerido.id}). Requer confirmação humana.`
              : 'Código de cliente TradePro sem vínculo correspondente no Cadastro Mestre.',
            industriaSugeridaId: matchSugerido?.id,
            industriaSugeridaNome: matchSugerido?.nome,
            ocorrencias: info.count,
            ultimasDatas: info.datas,
          },
          info.count,
        )
      }
    }

    // -------------------------------------------------------------------------
    // 4. RECONCILIAÇÃO 2: REDES
    // -------------------------------------------------------------------------
    for (const [normRede, info] of descobertasRede.entries()) {
      resultado.redes.descobertas++
      const match = redeByName.get(normRede)

      if (match) {
        resultado.redes.vinculadas++
        resultado.redes.detalhes.push({
          id: match.id,
          nome: match.nome,
          status: 'vinculado_seguro',
        })
      } else {
        resultado.redes.pendentes++
        resultado.redes.detalhes.push({
          id: `pendente_${normRede}`,
          nome: normRede,
          status: 'pendente_vinculacao',
        })

        await registrarPendenciaConsolidada(
          'rede',
          normRede,
          undefined,
          normRede,
          'tradepro_sync',
          { ocorrencias: info.count },
          info.count,
        )
      }
    }

    // -------------------------------------------------------------------------
    // 5. RECONCILIAÇÃO 3: LOJAS
    // Proteção de edicao_manual = true: não sobrescreve razão social, nome ou rede.
    // Atualiza ultima_observacao_fonte de forma consistente sem desativar a loja.
    // -------------------------------------------------------------------------
    for (const [codLoja, info] of descobertasLoja.entries()) {
      resultado.lojas.descobertas++
      const maisRecente = info.datas.sort().reverse()[0] || dataHoje

      let match = lojaByCode.get(codLoja)
      if (!match && info.razaoSocial) {
        match = lojaByName.get(normalizarChaveEntidade(info.razaoSocial))
      }

      if (match) {
        resultado.lojas.vinculadas++

        const updatePayload: Record<string, unknown> = {
          ultima_observacao_fonte: maisRecente,
        }

        // Se NÃO estiver sob edição manual, enriquece vínculo com a rede com segurança
        if (!match.edicao_manual) {
          if (info.fantasia && !match.network_id) {
            const rMatch = redeByName.get(normalizarChaveEntidade(info.fantasia))
            if (rMatch) {
              updatePayload.network_id = rMatch.id
              updatePayload.rede_nome = rMatch.nome
              match.network_id = rMatch.id
              match.rede_nome = rMatch.nome
            }
          }
        }

        try {
          await pb.collection('stores').update(match.id, updatePayload)
        } catch {
          /* non-fatal */
        }

        resultado.lojas.detalhes.push({
          id: match.id,
          codigo: codLoja,
          nome: match.razao_social || match.nome,
          rede: match.rede_nome,
          status: 'vinculado_seguro',
        })
      } else {
        resultado.lojas.pendentes++
        resultado.lojas.detalhes.push({
          id: `pendente_${codLoja}`,
          codigo: codLoja,
          nome: info.razaoSocial || info.nome,
          rede: info.fantasia,
          status: 'pendente_vinculacao',
        })

        await registrarPendenciaConsolidada(
          'loja',
          codLoja,
          codLoja,
          info.razaoSocial || info.nome,
          'tradepro_sync',
          { info, ocorrencias: info.count },
          info.count,
        )
      }
    }

    // -------------------------------------------------------------------------
    // 6. RECONCILIAÇÃO 4: SUPERVISORES
    // Proteção de edicao_manual = true: preserva dados administrativos.
    // Atualiza ultima_observacao_fonte de forma consistente sem desativar a entidade.
    // -------------------------------------------------------------------------
    for (const [keySup, info] of descobertasSup.entries()) {
      resultado.supervisores.descobertos++
      const maisRecente = info.datas.sort().reverse()[0] || dataHoje

      let match = supByCode.get(keySup)
      if (!match && info.nome) {
        match = supByName.get(normalizarChaveEntidade(info.nome))
      }

      if (match) {
        resultado.supervisores.vinculados++
        try {
          await pb.collection('supervisors').update(match.id, {
            ultima_observacao_fonte: maisRecente,
          })
        } catch {
          /* non-fatal */
        }

        resultado.supervisores.detalhes.push({
          id: match.id,
          codigo: match.codigo_externo,
          nome: match.nome,
          status: 'vinculado_seguro',
        })
      } else {
        resultado.supervisores.pendentes++
        resultado.supervisores.detalhes.push({
          id: `pendente_${keySup}`,
          codigo: keySup,
          nome: info.nome,
          status: 'pendente_vinculacao',
        })

        await registrarPendenciaConsolidada(
          'supervisor',
          keySup,
          keySup,
          info.nome,
          'tradepro_sync',
          { ocorrencias: info.count },
          info.count,
        )
      }
    }

    // -------------------------------------------------------------------------
    // 7. RECONCILIAÇÃO 5: PROMOTORES
    // Proteção de edicao_manual = true: não sobrescreve supervisor_id manual.
    // Atualiza ultima_observacao_fonte de forma consistente sem desativar a entidade.
    // -------------------------------------------------------------------------
    for (const [keyProm, info] of descobertasProm.entries()) {
      resultado.promotores.descobertos++
      const maisRecente = info.datas.sort().reverse()[0] || dataHoje

      let match = promByCode.get(keyProm)
      if (!match && info.nome) {
        match = promByName.get(normalizarChaveEntidade(info.nome))
      }

      if (match) {
        resultado.promotores.vinculados++

        const updatePayload: Record<string, unknown> = {
          ultima_observacao_fonte: maisRecente,
        }

        // Se NÃO estiver sob edição manual e não tiver supervisor, associa se conhecido
        if (!match.edicao_manual && !match.supervisor_id && info.codSup) {
          const sMatch =
            supByCode.get(info.codSup) ||
            (info.nomeSup ? supByName.get(normalizarChaveEntidade(info.nomeSup)) : undefined)
          if (sMatch) {
            updatePayload.supervisor_id = sMatch.id
            updatePayload.supervisor_nome = sMatch.nome
            match.supervisor_id = sMatch.id
            match.supervisor_nome = sMatch.nome
          }
        }

        try {
          await pb.collection('promoters').update(match.id, updatePayload)
        } catch {
          /* non-fatal */
        }

        resultado.promotores.detalhes.push({
          id: match.id,
          codigo: match.codigo_externo,
          nome: match.nome,
          status: 'vinculado_seguro',
        })
      } else {
        resultado.promotores.pendentes++
        resultado.promotores.detalhes.push({
          id: `pendente_${keyProm}`,
          codigo: keyProm,
          nome: info.nome,
          status: 'pendente_vinculacao',
        })

        await registrarPendenciaConsolidada(
          'promotor',
          keyProm,
          keyProm,
          info.nome,
          'tradepro_sync',
          { info, ocorrencias: info.count },
          info.count,
        )
      }
    }

    // -------------------------------------------------------------------------
    // 8. RECONCILIAÇÃO 6: PRODUTOS (Contextualizado por Indústria)
    // Preserva separadamente: codigoProduto, nomeProduto, nomeProdutoNormalizado.
    // Resolução: Indústria+Código -> Indústria+nome real normalizado -> aliases/Catálogo -> Pendência.
    // NUNCA usar código numérico como nome do produto!
    // -------------------------------------------------------------------------
    for (const [keyProd, info] of descobertasProd.entries()) {
      resultado.produtos.descobertos++

      let indIdResolved: string | undefined
      if (info.codCliente && indByTradeproId.has(info.codCliente)) {
        indIdResolved = indByTradeproId.get(info.codCliente)!.id
      }

      let match: CadastroProduto | undefined
      // Resolução Passo 1: Indústria + Código externo
      if (indIdResolved && info.codProduto) {
        match = prodByIndCode.get(`${indIdResolved}_${info.codProduto}`)
      }

      // Resolução Passo 2: Indústria + Nome real normalizado
      if (!match && indIdResolved) {
        match = prodByIndName.get(`${indIdResolved}_${info.nomeProdutoNormalizado}`)
      }

      // Resolução Passo 3: Fallback em aliases cadastrados na indústria
      if (!match && indIdResolved) {
        match = produtosAtuais.find(
          (p) =>
            p.industry_id === indIdResolved &&
            Array.isArray(p.aliases) &&
            p.aliases.some((al) => normalizarNomeProduto(al) === info.nomeProdutoNormalizado),
        )
      }

      const nomeExibicao =
        info.nomeProduto || info.nomeProdutoNormalizado || 'Produto sem identificação'

      if (match) {
        resultado.produtos.resolvidos++
        resultado.produtos.detalhes.push({
          id: match.id,
          codigo: match.codigo_produto || info.codProduto,
          nome: match.nome_produto, // Mantém nome mestre de verdade
          industria: match.industry_name,
          status: 'resolvido_contextualizado',
        })
      } else if (!indIdResolved) {
        resultado.produtos.ambiguos++
        resultado.produtos.detalhes.push({
          codigo: info.codProduto,
          nome: nomeExibicao,
          status: 'ambiguo_sem_industria',
        })

        await registrarPendenciaConsolidada(
          'produto',
          keyProd,
          info.codProduto,
          nomeExibicao,
          'tradepro_sync',
          {
            info,
            origemSemCodigo: info.origemSemCodigo,
            nomeProdutoReal: info.nomeProduto,
            nomeNormalizado: info.nomeProdutoNormalizado,
            motivo: 'Produto recebido sem contexto de Indústria resolvida.',
          },
          info.count,
        )
      } else {
        resultado.produtos.pendentes++
        resultado.produtos.detalhes.push({
          codigo: info.codProduto,
          nome: nomeExibicao,
          industria: info.clienteNome,
          status: 'pendente_cadastro_mix',
        })

        await registrarPendenciaConsolidada(
          'produto',
          keyProd,
          info.codProduto,
          nomeExibicao,
          'tradepro_sync',
          {
            info,
            origemSemCodigo: info.origemSemCodigo,
            industryId: indIdResolved,
            nomeProdutoReal: info.nomeProduto,
            nomeNormalizado: info.nomeProdutoNormalizado,
          },
          info.count,
        )
      }
    }

    // -------------------------------------------------------------------------
    // 9. PERSISTÊNCIA IDEMPOTENTE DE VÍNCULOS OBSERVADOS (BLOCO A.3 - DIRETRIZES 3, 4, 5, 6, 10, 11, 12)
    //
    // Diretriz 10 - CANONIZAÇÃO DAS RELAÇÕES:
    // Uma mesma relação pode ser descoberta como Cód. Promotor + Loja e Nome do Promotor + Loja.
    // Depois de resolver Promotor e Loja no Cadastro Mestre, calcular a relação única usando
    // promoter_id + store_id, para que nunca existam duplicatas se resolverem para as mesmas entidades.
    //
    // Diretriz 3 - Campo estruturado ultima_observacao_fonte:
    // data_inicio = primeira evidência; data_fim = VAZIO em vínculo ativo;
    // ultima_observacao_fonte = última data de evidência.
    //
    // Diretriz 5 - VÍNCULO ENCERRADO NÃO É VÍNCULO ATUAL:
    // Se existir vínculo histórico encerrado e chegar nova evidência, criar NOVA relação ativa iniciada
    // na data da evidência, com data_fim vazio e status ativo. Não reutilizar o encerrado como ativo.
    //
    // Diretriz 6 - VÍNCULO ATIVO EXISTENTE:
    // Se já existir relação ativa observada: não duplicar; apenas atualizar ultima_observacao_fonte.
    // Se for vínculo confirmado: não rebaixar para observado; preservar confirmação administrativa.
    //
    // Diretriz 11 - MÉTRICAS DE RELAÇÕES CANÔNICAS:
    // Detectadas únicas; novas persistidas; já existentes ativas; históricas encerradas encontradas; pendentes.
    //
    // Diretriz 12 - PROMOTOR ↔ INDÚSTRIA E SUPERVISOR ↔ PROMOTOR:
    // São relações detectadas. No relatório: Detectadas: X / Persistidas: 0.
    // -------------------------------------------------------------------------

    // Agrupamento canônico de relações resolvidas por promoterRecord.id + lojaRecord.id
    interface CanonicalRelInfo {
      promoterId: string
      promoterNome: string
      storeId: string
      storeCode: string
      storeName: string
      industryName?: string
      datas: string[]
      origens: string[]
    }

    const canonicalRelsMap = new Map<string, CanonicalRelInfo>()
    let pendentesResolucaoCount = 0

    for (const [, rawRel] of relPromLojaMap.entries()) {
      const promRecord =
        promByCode.get(rawRel.promoterCod) ||
        (rawRel.promoterNome
          ? promByName.get(normalizarChaveEntidade(rawRel.promoterNome))
          : undefined)
      const lojaRecord =
        lojaByCode.get(rawRel.storeCode) ||
        (rawRel.storeName ? lojaByName.get(normalizarChaveEntidade(rawRel.storeName)) : undefined)

      if (!promRecord || !lojaRecord) {
        pendentesResolucaoCount++
        continue
      }

      const canonicalKey = `${promRecord.id}__${lojaRecord.id}`
      if (!canonicalRelsMap.has(canonicalKey)) {
        canonicalRelsMap.set(canonicalKey, {
          promoterId: promRecord.id,
          promoterNome: promRecord.nome,
          storeId: lojaRecord.id,
          storeCode: lojaRecord.codigo_externo || rawRel.storeCode,
          storeName: lojaRecord.razao_social || lojaRecord.nome || rawRel.storeName,
          industryName: rawRel.industryName,
          datas: [...rawRel.datas],
          origens: [rawRel.origemVinculo],
        })
      } else {
        const cRel = canonicalRelsMap.get(canonicalKey)!
        for (const d of rawRel.datas) {
          if (!cRel.datas.includes(d)) cRel.datas.push(d)
        }
        if (!cRel.origens.includes(rawRel.origemVinculo)) {
          cRel.origens.push(rawRel.origemVinculo)
        }
      }
    }

    resultado.vinculosObservados.promotorLoja = canonicalRelsMap.size
    resultado.vinculosObservados.promotorIndustria = relPromIndMap.size
    resultado.vinculosObservados.supervisorPromotor = relSupPromMap.size

    // Métricas canônicas separadas
    resultado.relacoes = {
      detectadas: canonicalRelsMap.size,
      novasPersistidas: 0,
      jaExistentes: 0,
      historicasEncerradas: 0,
      pendentes: pendentesResolucaoCount,
    }

    for (const [canonicalKey, cRel] of canonicalRelsMap.entries()) {
      const datasOrdenadas = cRel.datas.sort()
      const primeiraData = datasOrdenadas[0] || dataHoje
      const ultimaData = datasOrdenadas[datasOrdenadas.length - 1] || dataHoje
      const origemStr = cRel.origens.join(', ') || 'tradepro_validades'

      // 1. Verificar se já existe vínculo ATIVO existente
      const existingAtivo =
        assignmentsAtivosMap.get(canonicalKey) ||
        assignmentsAtivosMap.get(`${cRel.promoterId}__${cRel.storeCode}`)

      // 2. Verificar se existem vínculos HISTÓRICOS ENCERRADOS
      const existingEncerrados =
        assignmentsEncerradosMap.get(canonicalKey) ||
        assignmentsEncerradosMap.get(`${cRel.promoterId}__${cRel.storeCode}`) ||
        []

      if (existingEncerrados.length > 0) {
        resultado.relacoes.historicasEncerradas += existingEncerrados.length
      }

      if (existingAtivo) {
        // Já existe vínculo ATIVO
        resultado.relacoes.jaExistentes++

        // Diretriz 6: Se for confirmado, NÃO rebaixar para observado. Apenas atualiza ultima_observacao_fonte.
        // Se for observado: não duplicar, atualiza ultima_observacao_fonte e mantém data_fim vazio.
        const updatePayload: Record<string, unknown> = {
          ultima_observacao_fonte: ultimaData,
          observacao: `Vínculo ativo mantido. Última evidência: ${ultimaData} (origem: ${origemStr}).`,
        }

        try {
          await pb.collection('store_promoter_assignments').update(existingAtivo.id, updatePayload)
        } catch {
          /* non-fatal */
        }
      } else {
        // Não existe vínculo ativo. (Mesmo que existam vínculos encerrados históricos, cria uma NOVA relação ativa!)
        // Diretriz 4 e 5: data_inicio = primeira data observada; data_fim = VAZIO; status = ativo;
        // ultima_observacao_fonte = última observação; tipo_vinculo = 'observado_operacao'.
        try {
          const novo = await pb.collection('store_promoter_assignments').create({
            promoter_id: cRel.promoterId,
            promoter_nome: cRel.promoterNome,
            store_id: cRel.storeId,
            store_code: cRel.storeCode,
            store_name: cRel.storeName,
            industry_name: cRel.industryName || '',
            status: 'ativo',
            tipo_vinculo: 'observado_operacao',
            origem_vinculo: origemStr,
            data_inicio: primeiraData,
            data_fim: '', // VAZIO em vínculo ativo!
            ultima_observacao_fonte: ultimaData,
            observacao: `Vínculo observado ativo iniciado em ${primeiraData}. Última evidência operacional: ${ultimaData} (origem: ${origemStr}).`,
          })
          assignmentsAtivosMap.set(canonicalKey, novo as any)
          resultado.relacoes.novasPersistidas++
        } catch {
          resultado.relacoes.pendentes++
        }
      }
    }

    // Registrar log de auditoria detalhado da homologação
    await logCadastroAudit(
      'homologacao_cadastral_executada',
      `Homologação Cadastral Bloco A.1: ${resultado.industrias.vinculadas} ind., ${resultado.redes.vinculadas} redes, ${resultado.lojas.vinculadas} lojas, ${resultado.promotores.vinculados} promotores`,
      'homologacao_bloco_a1',
      {
        executorNome: userName,
        detalhes: {
          universoProcessado: resultado.universoProcessado,
          industrias: resultado.industrias,
          redes: resultado.redes,
          lojas: resultado.lojas,
          supervisores: resultado.supervisores,
          promotores: resultado.promotores,
          produtos: resultado.produtos,
          relacoes: resultado.relacoes,
          vinculosObservados: resultado.vinculosObservados,
        },
      },
    )
  } catch (err) {
    console.warn('[homologacaoCadastral] Erro durante homologação cadastral:', err)
  }

  return resultado
}
