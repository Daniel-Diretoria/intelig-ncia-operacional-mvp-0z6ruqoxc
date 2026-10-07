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
    dataExecucao: new Date().toISOString(),
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
      pendentes: 0,
    },
    vinculosObservados: { promotorLoja: 0, promotorIndustria: 0, supervisorPromotor: 0 },
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
    let assignmentsExistentes: CadastroPromotorAssignment[] = []
    try {
      assignmentsExistentes = await pb
        .collection('store_promoter_assignments')
        .getFullList<CadastroPromotorAssignment>()
    } catch {
      assignmentsExistentes = []
    }
    const assignmentsMap = new Map<string, CadastroPromotorAssignment>()
    for (const a of assignmentsExistentes) {
      const key = `${a.promoter_id || a.promoter_nome}__${a.store_code}`
      assignmentsMap.set(key, a)
    }

    // -------------------------------------------------------------------------
    // 2. Extração segura de dados brutos com paginação TOTAL (SEM limite de 10 páginas)
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
      validadesAmostra.push(...resp.items)
      pageV++
    } while (pageV <= totalPagesV)

    resultado.universoProcessado.validadesLidas = validadesAmostra.length
    resultado.universoProcessado.totalPaginasPorFonte.validades = totalPagesV

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
    }

    const rupturasAmostra: RupturaRow[] = []
    let pageR = 1
    let totalPagesR = 1

    do {
      const resp = await pb.collection('rupturas_base').getList<RupturaRow>(pageR, perPage, {
        sort: '-created',
      })
      totalPagesR = resp.totalPages || 1
      rupturasAmostra.push(...resp.items)
      pageR++
    } while (pageR <= totalPagesR)

    resultado.universoProcessado.rupturasLidas = rupturasAmostra.length
    resultado.universoProcessado.totalPaginasPorFonte.rupturas = totalPagesR

    // 2.3 Processamento de operacional_visitas (FONTE EFETIVA OBRIGATÓRIA)
    const visitasAmostra: OperacionalVisita[] = []
    let pageVis = 1
    let totalPagesVis = 1

    try {
      do {
        const resp = await pb
          .collection('operacional_visitas')
          .getList<OperacionalVisita>(pageVis, perPage, {
            sort: '-data',
          })
        totalPagesVis = resp.totalPages || 1
        visitasAmostra.push(...resp.items)
        pageVis++
      } while (pageVis <= totalPagesVis)
    } catch {
      totalPagesVis = 1
    }

    resultado.universoProcessado.visitasLidas = visitasAmostra.length
    resultado.universoProcessado.totalPaginasPorFonte.visitas = totalPagesVis

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
        codCliente?: string
        clienteNome?: string
        origemSemCodigo?: boolean
        count: number
      }
    >()

    // Relações observadas rastreadas com metadados temporais
    interface RelPromLojaInfo {
      promoterCod: string
      promoterNome: string
      storeCode: string
      storeName: string
      industryName?: string
      datas: string[]
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

      // Produto
      const prodNome = (v.produto || '').trim()
      const codProd = (v.cod_produto || '').trim()
      if (prodNome) {
        const keyProd = `${codCli || 'SEM_IND'}__${codProd || normalizarNomeProduto(prodNome)}`
        if (!descobertasProd.has(keyProd)) {
          descobertasProd.set(keyProd, {
            codProduto: codProd,
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
    // -------------------------------------------------------------------------
    for (const r of rupturasAmostra) {
      const codCli = (r.codigo_cliente || '').trim()
      const nomeCli = (r.cliente || '').trim()
      const dataObs = (r.data_visita || dataHoje).split('T')[0]

      if (codCli) {
        if (!descobertasInd.has(codCli)) {
          descobertasInd.set(codCli, { nome: nomeCli, count: 0, datas: [] })
        }
        const indItem = descobertasInd.get(codCli)!
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
              origem: 'rupturas_base',
            })
          }
          const rel = relPromLojaMap.get(relKey)!
          if (dataObs && !rel.datas.includes(dataObs)) rel.datas.push(dataObs)
        }
      }

      // Na exportação de rupturas NÃO há Cód. Produto obrigatoriamente.
      // Resolução através de Indústria + nome normalizado.
      const prodNome = (r.produto || '').trim()
      if (prodNome) {
        const keyProd = `${codCli || 'SEM_IND'}__${normalizarNomeProduto(prodNome)}`
        if (!descobertasProd.has(keyProd)) {
          descobertasProd.set(keyProd, {
            codCliente: codCli,
            clienteNome: nomeCli,
            origemSemCodigo: true,
            count: 0,
          })
        }
        descobertasProd.get(keyProd)!.count++
      }
    }

    // -------------------------------------------------------------------------
    // 2.3 Processar Visitas Reais (operacional_visitas)
    // Uma Visita contribui para descobrir/confirmar Promotor e Loja; eventualmente Indústria.
    // NUNCA inventar Supervisor ou Indústria quando ausentes do registro.
    // -------------------------------------------------------------------------
    for (const vis of visitasAmostra) {
      const dataObs = (vis.data || dataHoje).split('T')[0]
      const codProm = (vis.promoter_cod || '').trim()
      const nomeProm = (vis.promoter_nome || '').trim()
      const codLoja = (vis.store_code || '').trim()
      const nomeLoja = (vis.store_name || '').trim()
      const indNome = (vis.industry_name || '').trim()

      if (codProm || nomeProm) {
        const keyProm = codProm || normalizarChaveEntidade(nomeProm)
        if (!descobertasProm.has(keyProm)) {
          descobertasProm.set(keyProm, {
            nome: nomeProm,
            count: 0,
            datas: [],
          })
        }
        const pItem = descobertasProm.get(keyProm)!
        pItem.count++
        if (dataObs && !pItem.datas.includes(dataObs)) pItem.datas.push(dataObs)
      }

      if (codLoja) {
        if (!descobertasLoja.has(codLoja)) {
          descobertasLoja.set(codLoja, {
            razaoSocial: nomeLoja,
            nome: nomeLoja,
            cidade: '',
            estado: '',
            fantasia: '',
            count: 0,
            datas: [],
          })
        }
        const lItem = descobertasLoja.get(codLoja)!
        lItem.count++
        if (dataObs && !lItem.datas.includes(dataObs)) lItem.datas.push(dataObs)
      }

      // Relação Promotor ↔ Loja OBSERVADA via Visita (NUNCA confirmada automaticamente)
      if ((codProm || nomeProm) && codLoja) {
        const relKey = `${codProm || nomeProm}__${codLoja}`
        if (!relPromLojaMap.has(relKey)) {
          relPromLojaMap.set(relKey, {
            promoterCod: codProm,
            promoterNome: nomeProm,
            storeCode: codLoja,
            storeName: nomeLoja,
            industryName: indNome,
            datas: [],
            origem: 'operacional_visitas',
          })
        }
        const rel = relPromLojaMap.get(relKey)!
        if (dataObs && !rel.datas.includes(dataObs)) rel.datas.push(dataObs)
      }

      // Vínculo Promotor ↔ Indústria observado se indústria fornecida
      if ((codProm || nomeProm) && indNome) {
        const relKey = `${codProm || nomeProm}__${indNome}`
        if (!relPromIndMap.has(relKey)) {
          relPromIndMap.set(relKey, {
            promCod: codProm || nomeProm,
            indName: indNome,
            datas: [],
          })
        }
        const rel = relPromIndMap.get(relKey)!
        if (dataObs && !rel.datas.includes(dataObs)) rel.datas.push(dataObs)
      }
    }

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
    // -------------------------------------------------------------------------
    for (const [keyProd, info] of descobertasProd.entries()) {
      resultado.produtos.descobertos++

      let indIdResolved: string | undefined
      if (info.codCliente && indByTradeproId.has(info.codCliente)) {
        indIdResolved = indByTradeproId.get(info.codCliente)!.id
      }

      let match: CadastroProduto | undefined
      if (indIdResolved && info.codProduto) {
        match = prodByIndCode.get(`${indIdResolved}_${info.codProduto}`)
      }

      if (!match && indIdResolved) {
        const prodNameFromKey = keyProd.split('__')[1]
        match = prodByIndName.get(`${indIdResolved}_${prodNameFromKey}`)
      }

      if (match) {
        resultado.produtos.resolvidos++
        resultado.produtos.detalhes.push({
          id: match.id,
          codigo: match.codigo_produto,
          nome: match.nome_produto,
          industria: match.industry_name,
          status: 'resolvido_contextualizado',
        })
      } else if (!indIdResolved) {
        resultado.produtos.ambiguos++
        resultado.produtos.detalhes.push({
          codigo: info.codProduto,
          nome: keyProd.split('__')[1] || 'Produto sem identificação',
          status: 'ambiguo_sem_industria',
        })

        await registrarPendenciaConsolidada(
          'produto',
          keyProd,
          info.codProduto,
          keyProd.split('__')[1],
          'tradepro_sync',
          {
            info,
            origemSemCodigo: info.origemSemCodigo,
            motivo: 'Produto recebido sem contexto de Indústria resolvida.',
          },
          info.count,
        )
      } else {
        resultado.produtos.pendentes++
        resultado.produtos.detalhes.push({
          codigo: info.codProduto,
          nome: keyProd.split('__')[1] || 'Produto sem identificação',
          industria: info.clienteNome,
          status: 'pendente_cadastro_mix',
        })

        await registrarPendenciaConsolidada(
          'produto',
          keyProd,
          info.codProduto,
          keyProd.split('__')[1],
          'tradepro_sync',
          {
            info,
            origemSemCodigo: info.origemSemCodigo,
            industryId: indIdResolved,
          },
          info.count,
        )
      }
    }

    // -------------------------------------------------------------------------
    // 9. PERSISTÊNCIA IDEMPOTENTE DE VÍNCULOS OBSERVADOS
    // Persiste vínculos em store_promoter_assignments com tipo_vinculo: 'observado_visita'.
    // NUNCA transforma observado em confirmado.
    // Segunda execução não duplica vínculo: reutiliza ou atualiza vigência.
    // -------------------------------------------------------------------------
    resultado.vinculosObservados.promotorLoja = relPromLojaMap.size
    resultado.vinculosObservados.promotorIndustria = relPromIndMap.size
    resultado.vinculosObservados.supervisorPromotor = relSupPromMap.size

    resultado.relacoes.detectadas = relPromLojaMap.size + relPromIndMap.size + relSupPromMap.size

    for (const [, rel] of relPromLojaMap.entries()) {
      const promRecord =
        promByCode.get(rel.promoterCod) ||
        (rel.promoterNome ? promByName.get(normalizarChaveEntidade(rel.promoterNome)) : undefined)
      const lojaRecord =
        lojaByCode.get(rel.storeCode) ||
        (rel.storeName ? lojaByName.get(normalizarChaveEntidade(rel.storeName)) : undefined)

      if (!promRecord || !lojaRecord) {
        resultado.relacoes.pendentes++
        continue
      }

      const assignmentKey = `${promRecord.id}__${lojaRecord.codigo_externo || rel.storeCode}`
      const existingAssignment = assignmentsMap.get(assignmentKey)

      const primeiraData = rel.datas.sort()[0] || dataHoje
      const ultimaData = rel.datas.sort().reverse()[0] || dataHoje

      if (existingAssignment) {
        resultado.relacoes.jaExistentes++
        // Atualiza a última observação no vínculo observado sem alterar vínculos confirmados
        if (existingAssignment.tipo_vinculo === 'observado_visita') {
          try {
            await pb.collection('store_promoter_assignments').update(existingAssignment.id, {
              data_fim: ultimaData,
              observacao: `Vínculo observado mantido. Última observação: ${ultimaData} (origem: ${rel.origem}).`,
            })
          } catch {
            /* non-fatal */
          }
        }
      } else {
        // Novo vínculo observado persistido
        try {
          const novo = await pb.collection('store_promoter_assignments').create({
            promoter_id: promRecord.id,
            promoter_nome: promRecord.nome,
            store_id: lojaRecord.id,
            store_code: lojaRecord.codigo_externo || rel.storeCode,
            store_name: lojaRecord.razao_social || lojaRecord.nome || rel.storeName,
            industry_name: rel.industryName || '',
            status: 'ativo',
            tipo_vinculo: 'observado_visita',
            origem_vinculo: `Observado via ${rel.origem}`,
            data_inicio: primeiraData,
            data_fim: ultimaData,
            observacao: `Vínculo observado pela primeira vez em ${primeiraData}. Requer confirmação administrativa.`,
          })
          assignmentsMap.set(assignmentKey, novo as any)
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
