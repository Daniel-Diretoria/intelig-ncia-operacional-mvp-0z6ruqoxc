/**
 * Serviço do Arquivo de Devoluções / NF — SKIP Inteligência Operacional
 *
 * Princípios e Requisitos do Arquivo Documental:
 * - Fotos, autorizações, NFs e evidências ficam armazenadas e encontráveis sem depender do histórico do WhatsApp.
 * - Arquivos pertencem aos Casos de Devolução; SEM duplicação física desnecessária.
 * - Organização AUTOMÁTICA em árvore: ANO → MÊS DA SOLICITAÇÃO → LOJA → CASO
 *   Ex: 2026 / Outubro / Loja 115 / DEV-2026-0184 · Massas D'Itália
 *   Dentro do Caso: Fotos da solicitação, Autorização da indústria, NF de devolução, NF assinada, Evidência de descarte.
 * - O usuário NÃO cria pastas manualmente — a organização nasce dos metadados do Caso.
 * - Consulta documental com filtros por período, mês, ano, loja, indústria, promotor,
 *   tipo de documento, status do caso, número da NF.
 * - Controle de COMPLETUDE DOCUMENTAL:
 *   "NF recebida: sim/não", "NF assinada: sim/não", "Descarte recebido: sim/não"
 *   A existência de um anexo qualquer NÃO significa documentação completa!
 */

import pb from '@/lib/pocketbase/client'
import {
  DocumentoArquivoDevolucao,
  ArvoreArquivoNo,
  DevolucaoCaso,
  DevolucaoEvidencia,
  DevolucaoItem,
  EvidenciaTipo,
} from '@/types/devolucoes'

const MESES_NOMES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
]

export const ROTULOS_TIPO_DOCUMENTO: Record<EvidenciaTipo, string> = {
  foto_produto: 'Foto do Produto',
  foto_validade: 'Foto da Validade',
  foto_lote: 'Foto do Lote',
  nf_documento: 'NF de Devolução',
  nf_assinada: 'NF Assinada',
  comprovante_descarte: 'Evidência de Descarte',
  outro: 'Outro Documento',
}

export interface ArquivoFiltros {
  ano?: number | 'todos'
  mes?: number | 'todos'
  loja?: string | 'todas'
  industria?: string | 'todas'
  promotor?: string
  tipoDocumento?: EvidenciaTipo | 'todos'
  statusCaso?: string | 'todos'
  numeroNf?: string
  apenasSemNfAssinada?: boolean
  apenasSemDescarte?: boolean
  apenasIncompletos?: boolean
  buscaTexto?: string
}

/**
 * Mapeia evidências e anexos de casos para a estrutura unificada de documentos
 */
export function mapearCasosParaDocumentos(
  casos: DevolucaoCaso[],
  todasEvidencias: DevolucaoEvidencia[] = [],
  todosItens: DevolucaoItem[] = [],
): DocumentoArquivoDevolucao[] {
  const documentos: DocumentoArquivoDevolucao[] = []
  const itensMap = new Map<string, DevolucaoItem>()
  todosItens.forEach((it) => itensMap.set(it.id, it))

  // Agrupar evidências por caso_id
  const evidenciasPorCaso = new Map<string, DevolucaoEvidencia[]>()
  for (const ev of todasEvidencias) {
    const lista = evidenciasPorCaso.get(ev.caso_id) || []
    lista.push(ev)
    evidenciasPorCaso.set(ev.caso_id, lista)
  }

  for (const c of casos) {
    const dataSol = c.data_solicitacao || c.created || new Date().toISOString().slice(0, 10)
    const partesData = dataSol.split('-')
    const ano = parseInt(partesData[0], 10) || new Date().getFullYear()
    const mes = parseInt(partesData[1], 10) || 1
    const mesNome = MESES_NOMES[mes - 1] || 'Indefinido'

    const temNfNumero = Boolean(c.nf_numero && c.nf_numero.trim() !== '')
    const temNfAssinada = Boolean(
      c.nf_assinada_anexo_nome && c.nf_assinada_anexo_nome.trim() !== '',
    )
    const temDescarte = Boolean(
      c.evidencia_descarte_anexo_nome && c.evidencia_descarte_anexo_nome.trim() !== '',
    )

    // 1. Evidências registradas em devolucoes_evidencias para este caso
    const evs = evidenciasPorCaso.get(c.id) || c.evidencias || []
    for (const ev of evs) {
      const itemRel = ev.item_id ? itensMap.get(ev.item_id) : undefined

      // Se este anexo for o de NF assinada ou descarte, reflete
      if (ev.tipo === 'nf_assinada') {
        // Marcado
      }

      documentos.push({
        id: ev.id,
        caso_id: c.id,
        codigo_caso: c.codigo_caso,
        data_solicitacao: dataSol,
        ano,
        mes,
        mesNome,
        loja_codigo: c.store_code || 'S/C',
        loja_nome: c.store_name,
        industria_nome: c.industry_name,
        promotor_nome: c.promotor_nome,
        tipo: ev.tipo,
        tipoRotulo: ROTULOS_TIPO_DOCUMENTO[ev.tipo] || ev.tipo,
        nomeOriginal: ev.titulo,
        url: ev.url_arquivo,
        usuarioQueAnexou: ev.usuario_nome,
        dataEnvio: ev.created,
        itemIdRelacionado: ev.item_id,
        itemNomeRelacionado: itemRel
          ? itemRel.produto_nome_oficial || itemRel.produto_nome_informado
          : undefined,
        observacao: ev.descricao,
        nf_numero: c.nf_numero,
        nf_assinada: temNfAssinada || ev.tipo === 'nf_assinada',
        descarte_realizado: temDescarte || ev.tipo === 'comprovante_descarte',
        casoStatus: c.status,
      })
    }

    // 2. Anexos virtuais derivados do registro de NF / Autorização do próprio Caso
    if (c.nf_anexo_nome && !evs.some((e) => e.titulo === c.nf_anexo_nome)) {
      documentos.push({
        id: `doc_nf_${c.id}`,
        caso_id: c.id,
        codigo_caso: c.codigo_caso,
        data_solicitacao: dataSol,
        ano,
        mes,
        mesNome,
        loja_codigo: c.store_code || 'S/C',
        loja_nome: c.store_name,
        industria_nome: c.industry_name,
        promotor_nome: c.promotor_nome,
        tipo: 'nf_documento',
        tipoRotulo: 'NF de Devolução',
        nomeOriginal: c.nf_anexo_nome,
        dataEnvio: c.nf_data || c.updated || dataSol,
        nf_numero: c.nf_numero,
        nf_assinada: temNfAssinada,
        descarte_realizado: temDescarte,
        casoStatus: c.status,
      })
    }

    if (c.nf_assinada_anexo_nome && !evs.some((e) => e.titulo === c.nf_assinada_anexo_nome)) {
      documentos.push({
        id: `doc_nfas_${c.id}`,
        caso_id: c.id,
        codigo_caso: c.codigo_caso,
        data_solicitacao: dataSol,
        ano,
        mes,
        mesNome,
        loja_codigo: c.store_code || 'S/C',
        loja_nome: c.store_name,
        industria_nome: c.industry_name,
        promotor_nome: c.promotor_nome,
        tipo: 'nf_assinada',
        tipoRotulo: 'NF Assinada',
        nomeOriginal: c.nf_assinada_anexo_nome,
        dataEnvio: c.updated || dataSol,
        nf_numero: c.nf_numero,
        nf_assinada: true,
        descarte_realizado: temDescarte,
        casoStatus: c.status,
      })
    }

    if (
      c.evidencia_descarte_anexo_nome &&
      !evs.some((e) => e.titulo === c.evidencia_descarte_anexo_nome)
    ) {
      documentos.push({
        id: `doc_desc_${c.id}`,
        caso_id: c.id,
        codigo_caso: c.codigo_caso,
        data_solicitacao: dataSol,
        ano,
        mes,
        mesNome,
        loja_codigo: c.store_code || 'S/C',
        loja_nome: c.store_name,
        industria_nome: c.industry_name,
        promotor_nome: c.promotor_nome,
        tipo: 'comprovante_descarte',
        tipoRotulo: 'Evidência de Descarte',
        nomeOriginal: c.evidencia_descarte_anexo_nome,
        dataEnvio: c.updated || dataSol,
        nf_numero: c.nf_numero,
        nf_assinada: temNfAssinada,
        descarte_realizado: true,
        casoStatus: c.status,
      })
    }
  }

  return documentos
}

/**
 * Aplica filtros operacionais à lista de documentos
 */
export function filtrarDocumentos(
  documentos: DocumentoArquivoDevolucao[],
  filtros: ArquivoFiltros,
): DocumentoArquivoDevolucao[] {
  return documentos.filter((doc) => {
    if (filtros.ano && filtros.ano !== 'todos' && doc.ano !== filtros.ano) {
      return false
    }
    if (filtros.mes && filtros.mes !== 'todos' && doc.mes !== filtros.mes) {
      return false
    }
    if (
      filtros.industria &&
      filtros.industria !== 'todas' &&
      !doc.industria_nome.toLowerCase().includes(filtros.industria.toLowerCase())
    ) {
      return false
    }
    if (
      filtros.loja &&
      filtros.loja !== 'todas' &&
      !doc.loja_codigo.toLowerCase().includes(filtros.loja.toLowerCase()) &&
      !doc.loja_nome.toLowerCase().includes(filtros.loja.toLowerCase())
    ) {
      return false
    }
    if (
      filtros.promotor &&
      filtros.promotor.trim() !== '' &&
      !doc.promotor_nome?.toLowerCase().includes(filtros.promotor.toLowerCase())
    ) {
      return false
    }
    if (
      filtros.tipoDocumento &&
      filtros.tipoDocumento !== 'todos' &&
      doc.tipo !== filtros.tipoDocumento
    ) {
      return false
    }
    if (
      filtros.statusCaso &&
      filtros.statusCaso !== 'todos' &&
      doc.casoStatus !== filtros.statusCaso
    ) {
      return false
    }
    if (
      filtros.numeroNf &&
      filtros.numeroNf.trim() !== '' &&
      (!doc.nf_numero || !doc.nf_numero.toLowerCase().includes(filtros.numeroNf.toLowerCase()))
    ) {
      return false
    }
    if (filtros.apenasSemNfAssinada && doc.nf_assinada) {
      return false
    }
    if (filtros.apenasSemDescarte && doc.descarte_realizado) {
      return false
    }
    if (filtros.apenasIncompletos && doc.nf_assinada && doc.descarte_realizado) {
      return false
    }
    if (filtros.buscaTexto && filtros.buscaTexto.trim() !== '') {
      const q = filtros.buscaTexto.toLowerCase()
      const match =
        doc.codigo_caso.toLowerCase().includes(q) ||
        doc.nomeOriginal.toLowerCase().includes(q) ||
        doc.industria_nome.toLowerCase().includes(q) ||
        doc.loja_nome.toLowerCase().includes(q) ||
        doc.loja_codigo.toLowerCase().includes(q) ||
        (doc.nf_numero && doc.nf_numero.toLowerCase().includes(q)) ||
        (doc.observacao && doc.observacao.toLowerCase().includes(q))
      if (!match) return false
    }
    return true
  })
}

/**
 * Constrói a estrutura de Árvore Automática:
 * ANO → MÊS DA SOLICITAÇÃO → LOJA → CASO
 */
export function construirArvoreArquivo(
  documentos: DocumentoArquivoDevolucao[],
  casos: DevolucaoCaso[] = [],
): ArvoreArquivoNo[] {
  const casosMap = new Map<string, DevolucaoCaso>()
  casos.forEach((c) => casosMap.set(c.id, c))

  // Agrupamento multinível: Ano -> Mes -> Loja -> Caso
  const mapaAnos = new Map<
    number,
    Map<number, Map<string, Map<string, DocumentoArquivoDevolucao[]>>>
  >()

  for (const doc of documentos) {
    if (!mapaAnos.has(doc.ano)) {
      mapaAnos.set(doc.ano, new Map())
    }
    const mapaMeses = mapaAnos.get(doc.ano)!

    if (!mapaMeses.has(doc.mes)) {
      mapaMeses.set(doc.mes, new Map())
    }
    const mapaLojas = mapaMeses.get(doc.mes)!

    const chaveLoja = `${doc.loja_codigo || '000'} - ${doc.loja_nome}`
    if (!mapaLojas.has(chaveLoja)) {
      mapaLojas.set(chaveLoja, new Map())
    }
    const mapaCasos = mapaLojas.get(chaveLoja)!

    const listaDocs = mapaCasos.get(doc.caso_id) || []
    listaDocs.push(doc)
    mapaCasos.set(doc.caso_id, listaDocs)
  }

  // Converter estrutura aninhada para árvore de nós ordenada
  const nosAnos: ArvoreArquivoNo[] = []

  const anosOrdenados = Array.from(mapaAnos.keys()).sort((a, b) => b - a)

  for (const ano of anosOrdenados) {
    const mapaMeses = mapaAnos.get(ano)!
    const nosMeses: ArvoreArquivoNo[] = []
    let totalDocsAno = 0

    const mesesOrdenados = Array.from(mapaMeses.keys()).sort((a, b) => b - a)

    for (const mes of mesesOrdenados) {
      const mapaLojas = mapaMeses.get(mes)!
      const nosLojas: ArvoreArquivoNo[] = []
      let totalDocsMes = 0

      const lojasOrdenadas = Array.from(mapaLojas.keys()).sort()

      for (const lojaChave of lojasOrdenadas) {
        const mapaCasos = mapaLojas.get(lojaChave)!
        const nosCasos: ArvoreArquivoNo[] = []
        let totalDocsLoja = 0

        for (const [casoId, docsCaso] of mapaCasos.entries()) {
          const c = casosMap.get(casoId)
          const codigoCaso = docsCaso[0]?.codigo_caso || 'DEV-CASO'
          const indNome = docsCaso[0]?.industria_nome || c?.industry_name || ''

          const temNf = Boolean(c?.nf_numero)
          const temNfAssinada = Boolean(
            c?.nf_assinada_anexo_nome || docsCaso.some((d) => d.tipo === 'nf_assinada'),
          )
          const temDescarte = Boolean(
            c?.evidencia_descarte_anexo_nome ||
            docsCaso.some((d) => d.tipo === 'comprovante_descarte'),
          )
          const completo = temNf && temNfAssinada && temDescarte

          nosCasos.push({
            chave: `caso_${casoId}`,
            titulo: `${codigoCaso} · ${indNome}`,
            subtitulo: `${docsCaso.length} arquivo(s)`,
            tipo: 'caso',
            contagemDocumentos: docsCaso.length,
            documentos: docsCaso,
            metadadosCaso: {
              codigo_caso: codigoCaso,
              industry_name: indNome,
              status: c?.status || 'concluido',
              nf_recebida: temNf,
              nf_assinada: temNfAssinada,
              descarte_recebido: temDescarte,
              completo,
            },
          })

          totalDocsLoja += docsCaso.length
        }

        nosLojas.push({
          chave: `loja_${ano}_${mes}_${lojaChave}`,
          titulo: lojaChave,
          subtitulo: `${nosCasos.length} caso(s), ${totalDocsLoja} arquivo(s)`,
          tipo: 'loja',
          contagemDocumentos: totalDocsLoja,
          documentos: nosCasos.flatMap((nc) => nc.documentos),
          filhos: nosCasos,
        })

        totalDocsMes += totalDocsLoja
      }

      const mesNome = MESES_NOMES[mes - 1] || `Mês ${mes}`
      nosMeses.push({
        chave: `mes_${ano}_${mes}`,
        titulo: `${mesNome} / ${ano}`,
        subtitulo: `${nosLojas.length} loja(s), ${totalDocsMes} arquivo(s)`,
        tipo: 'mes',
        contagemDocumentos: totalDocsMes,
        documentos: nosLojas.flatMap((nl) => nl.documentos),
        filhos: nosLojas,
      })

      totalDocsAno += totalDocsMes
    }

    nosAnos.push({
      chave: `ano_${ano}`,
      titulo: `Ano ${ano}`,
      subtitulo: `${nosMeses.length} mês(es), ${totalDocsAno} arquivo(s)`,
      tipo: 'ano',
      contagemDocumentos: totalDocsAno,
      documentos: nosMeses.flatMap((nm) => nm.documentos),
      filhos: nosMeses,
    })
  }

  return nosAnos
}

/**
 * Carrega todos os documentos e constrói a visão do arquivo
 */
export async function carregarArquivoDocumental(): Promise<{
  todosDocumentos: DocumentoArquivoDevolucao[]
  casos: DevolucaoCaso[]
  anosDisponiveis: number[]
  industriasDisponiveis: string[]
  lojasDisponiveis: Array<{ codigo: string; nome: string }>
}> {
  try {
    const [casosRes, evidenciasRes, itensRes] = await Promise.all([
      pb.collection('devolucoes_casos').getFullList({ sort: '-data_solicitacao' }),
      pb.collection('devolucoes_evidencias').getFullList({ sort: '-created' }),
      pb.collection('devolucoes_itens').getFullList(),
    ])

    const casos = casosRes as unknown as DevolucaoCaso[]
    const evidencias = evidenciasRes as unknown as DevolucaoEvidencia[]
    const itens = itensRes as unknown as DevolucaoItem[]

    const todosDocumentos = mapearCasosParaDocumentos(casos, evidencias, itens)

    // Extrair listas para filtros
    const anosSet = new Set<number>()
    const indSet = new Set<string>()
    const lojasMap = new Map<string, string>()

    for (const d of todosDocumentos) {
      if (d.ano) anosSet.add(d.ano)
      if (d.industria_nome) indSet.add(d.industria_nome)
      if (d.loja_codigo || d.loja_nome) {
        lojasMap.set(d.loja_codigo, d.loja_nome)
      }
    }

    const anosDisponiveis = Array.from(anosSet).sort((a, b) => b - a)
    const industriasDisponiveis = Array.from(indSet).sort()
    const lojasDisponiveis = Array.from(lojasMap.entries()).map(([codigo, nome]) => ({
      codigo,
      nome,
    }))

    return {
      todosDocumentos,
      casos,
      anosDisponiveis,
      industriasDisponiveis,
      lojasDisponiveis,
    }
  } catch (err) {
    console.error('[devolucoesArquivoService] Erro ao carregar arquivo documental:', err)
    return {
      todosDocumentos: [],
      casos: [],
      anosDisponiveis: [],
      industriasDisponiveis: [],
      lojasDisponiveis: [],
    }
  }
}
