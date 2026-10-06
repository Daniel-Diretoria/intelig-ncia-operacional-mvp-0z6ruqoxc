/**
 * Parser de Exportações do WhatsApp para Devoluções/NF — SKIP Inteligência Operacional
 *
 * Suporta formatos reais de exportação nativa do WhatsApp (TXT com ou sem mídias).
 *
 * Características:
 * - Reconhece padrão estruturado "TROCA / SOLICITAÇÃO" com tolerância a acentos,
 *   espaços, quebras de linha, maiúsculas/minúsculas e pontuação.
 * - Reconhece mensagens menos estruturadas / incompletas (ex.: "Loja 306 / Motivo validade")
 *   como POSSÍVEL SOLICITAÇÃO sem inventar produto, indústria, quantidade, validade ou loja.
 * - Deduplicação determinística via hash de contexto (data, hora, autor, conteúdo)
 *   evitando duplicar solicitações em reexportações.
 * - Agrupamento inteligente: permite vincular múltiplos produtos e mensagens ao mesmo caso.
 * - Associação segura de mídias anexas (fotos) quando o formato contiver referência direta.
 */

import {
  SolicitacaoIdentificadaWhatsApp,
  DevolucoesImportBatchRegistro,
  EvidenciaTipo,
} from '@/types/devolucoes'
import { resolverProduto } from '@/lib/resolve/produtoResolver'

export interface MensagemWhatsAppBruta {
  id: string
  dataHoraStr: string
  timestampIso?: string
  autor: string
  conteudo: string
  arquivoAnexo?: string
  hashDeterminista: string
}

export interface ParseWhatsAppResult {
  totalMensagens: number
  mensagensConhecidas: number
  mensagensNovas: number
  todosHashesMensagens: string[]
  solicitacoes: SolicitacaoIdentificadaWhatsApp[]
  resumo: {
    totalEncontradas: number
    jaConhecidas: number
    novas: number
    possiveisSolicitacoes: number
    precisamRevisao: number
    incompletas: number
  }
}

/**
 * Gera hash determinístico simples e rápido em string a partir de contexto suficiente
 */
export function gerarHashMensagem(dataHora: string, autor: string, conteudo: string): string {
  const norm = `${dataHora.trim()}|${autor.trim()}|${conteudo.trim().toLowerCase().replace(/\s+/g, ' ')}`
  let hash = 0
  for (let i = 0; i < norm.length; i++) {
    const char = norm.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash |= 0 // converte para 32bit int
  }
  return `wmsg_${Math.abs(hash).toString(36)}`
}

/**
 * Normaliza data DD/MM/YYYY ou DD/MM/YY para ISO YYYY-MM-DD
 */
export function normalizarDataPtBr(dataStr: string): string {
  const match = dataStr.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/)
  if (!match) return ''
  const dia = match[1].padStart(2, '0')
  const mes = match[2].padStart(2, '0')
  let ano = match[3]
  if (ano.length === 2) {
    ano = `20${ano}`
  }
  return `${ano}-${mes}-${dia}`
}

/**
 * Expressões regulares para quebra de mensagens de exportação do WhatsApp
 * Exemplo Android/iOS:
 * [18/09/2026, 14:32:10] João Promotor: TROCA / SOLICITAÇÃO...
 * 18/09/2026 14:32 - João Promotor: Mensagem...
 * 18/09/26, 14:32 - João: ...
 */
const REGEX_CABECALHO_MSG =
  /^(?:\[?(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?)(?:\s*(?:AM|PM|am|pm))?\]?\s*[-–—]?\s*)([^:]+):\s*([\s\S]*)$/

/**
 * Divide o texto do arquivo exportado em mensagens individuais
 */
export function extrairMensagensArquivoWhatsApp(conteudoArquivo: string): MensagemWhatsAppBruta[] {
  const linhas = conteudoArquivo.split(/\r?\n/)
  const mensagens: MensagemWhatsAppBruta[] = []

  let msgAtual: {
    dataHoraStr: string
    autor: string
    linhasConteudo: string[]
  } | null = null

  const finalizarMsgAtual = () => {
    if (!msgAtual) return
    const texto = msgAtual.linhasConteudo.join('\n').trim()
    if (!texto) return

    // Checar se há menção a anexo (ex: "<arquivo anexado: IMG-20260918-WA0001.jpg>")
    let anexo: string | undefined = undefined
    const anexoMatch =
      texto.match(/<arquivo anexado:\s*([^>]+)>/i) ||
      texto.match(/<anexo:\s*([^>]+)>/i) ||
      texto.match(/\((arquivo anexado|imagem anexada|vídeo anexado)\)/i)

    if (anexoMatch && anexoMatch[1] && !anexoMatch[1].startsWith('arquivo')) {
      anexo = anexoMatch[1].trim()
    }

    const hash = gerarHashMensagem(msgAtual.dataHoraStr, msgAtual.autor, texto)
    mensagens.push({
      id: hash,
      dataHoraStr: msgAtual.dataHoraStr,
      autor: msgAtual.autor.trim(),
      conteudo: texto,
      arquivoAnexo: anexo,
      hashDeterminista: hash,
    })
  }

  for (const linha of linhas) {
    const match = linha.match(REGEX_CABECALHO_MSG)
    if (match) {
      finalizarMsgAtual()
      msgAtual = {
        dataHoraStr: `${match[1]} ${match[2]}`,
        autor: match[3],
        linhasConteudo: [match[4]],
      }
    } else if (msgAtual) {
      msgAtual.linhasConteudo.push(linha)
    }
  }

  finalizarMsgAtual()
  return mensagens
}

/**
 * Extrai campos operacionais da mensagem estruturada com alta tolerância
 */
export function extrairCamposSolicitacao(texto: string): {
  data?: string
  repositor?: string
  loja?: string
  industria?: string
  produto?: string
  quantidade?: number
  validade?: string
  motivo?: string
  solicitado?: string
  evidenciaTexto?: string
  isEstruturada: boolean
  isPossivel: boolean
} {
  const normLinhas = texto.split(/\r?\n/)

  let dataVal: string | undefined
  let repositorVal: string | undefined
  let lojaVal: string | undefined
  let industriaVal: string | undefined
  let produtoVal: string | undefined
  let qtdVal: number | undefined
  let validadeVal: string | undefined
  let motivoVal: string | undefined
  let solicitadoVal: string | undefined
  let evidenciaVal: string | undefined

  let camposEncontrados = 0

  for (const linha of normLinhas) {
    const l = linha.trim()
    if (!l) continue

    // Data:
    const dataMatch = l.match(/^data\s*:\s*(.+)$/i)
    if (dataMatch) {
      dataVal = dataMatch[1].trim()
      camposEncontrados++
      continue
    }

    // Repositor: / Promotor:
    const repMatch = l.match(/^(?:repositor|promotor|colaborador)\s*:\s*(.+)$/i)
    if (repMatch) {
      repositorVal = repMatch[1].trim()
      camposEncontrados++
      continue
    }

    // Loja: / Cliente:
    const lojaMatch = l.match(/^(?:loja|mercado|supermercado|cliente)\s*:\s*(.+)$/i)
    if (lojaMatch) {
      lojaVal = lojaMatch[1].trim()
      camposEncontrados++
      continue
    }

    // Indústria: / Fornecedor:
    const indMatch = l.match(/^(?:industria|indústria|marca|fornecedor)\s*:\s*(.+)$/i)
    if (indMatch) {
      industriaVal = indMatch[1].trim()
      camposEncontrados++
      continue
    }

    // Produto:
    const prodMatch = l.match(/^(?:produto|item|mercadoria)\s*:\s*(.+)$/i)
    if (prodMatch) {
      produtoVal = prodMatch[1].trim()
      camposEncontrados++
      continue
    }

    // Quantidade: / Qtd:
    const qtdMatch = l.match(/^(?:quantidade|qtd|volume)\s*:\s*(.+)$/i)
    if (qtdMatch) {
      const numMatch = qtdMatch[1].match(/(\d+)/)
      if (numMatch) {
        qtdVal = parseInt(numMatch[1], 10)
      }
      camposEncontrados++
      continue
    }

    // Validade: / Vencimento:
    const valMatch = l.match(/^(?:validade|vencimento|val)\s*:\s*(.+)$/i)
    if (valMatch) {
      validadeVal = valMatch[1].trim()
      camposEncontrados++
      continue
    }

    // Motivo:
    const motMatch = l.match(/^(?:motivo|razao|razão)\s*:\s*(.+)$/i)
    if (motMatch) {
      motivoVal = motMatch[1].trim()
      camposEncontrados++
      continue
    }

    // O que está sendo solicitado: / Ação:
    const solMatch = l.match(
      /^(?:o que esta sendo solicitado|o que está sendo solicitado|solicitacao|solicitação|acao|ação)\s*:\s*(.+)$/i,
    )
    if (solMatch) {
      solicitadoVal = solMatch[1].trim()
      camposEncontrados++
      continue
    }

    // Foto / Evidência:
    const evidMatch = l.match(/^(?:foto|evidencia|evidência|anexo)\s*:\s*(.+)$/i)
    if (evidMatch) {
      evidenciaVal = evidMatch[1].trim()
      camposEncontrados++
      continue
    }
  }

  // Identificação do padrão:
  // Se contiver título "TROCA" ou "SOLICITAÇÃO" ou ao menos 3 campos padrão
  const temTituloTroca = /troca|solicitacao|solicitação|devolucao|devolução/i.test(texto)
  const isEstruturada = temTituloTroca && camposEncontrados >= 2

  // Mensagens menos estruturadas (ex: "Loja 306 / Motivo validade" ou menção a produto + troca)
  const isPossivel =
    isEstruturada ||
    temTituloTroca ||
    (lojaVal !== undefined && (motivoVal !== undefined || produtoVal !== undefined)) ||
    /loja\s+\d+.*validade/i.test(texto) ||
    /motivo\s*:\s*validade/i.test(texto)

  return {
    data: dataVal,
    repositor: repositorVal,
    loja: lojaVal,
    industria: industriaVal,
    produto: produtoVal,
    quantidade: qtdVal,
    validade: validadeVal,
    motivo: motivoVal,
    solicitado: solicitadoVal,
    evidenciaTexto: evidenciaVal,
    isEstruturada,
    isPossivel,
  }
}

/**
 * Função principal de parsing de conversas WhatsApp
 */
export async function parseConversaWhatsApp(
  conteudoArquivo: string,
  hashesJaConhecidos: Set<string> = new Set(),
  arquivosMidiaDisponiveis: Array<{ nome: string; arquivo?: File | Blob }> = [],
): Promise<ParseWhatsAppResult> {
  const mensagens = extrairMensagensArquivoWhatsApp(conteudoArquivo)

  let mensagensConhecidas = 0
  let mensagensNovas = 0
  const solicitacoes: SolicitacaoIdentificadaWhatsApp[] = []

  let possiveisCount = 0
  let precisamRevisaoCount = 0
  let incompletasCount = 0

  for (let i = 0; i < mensagens.length; i++) {
    const msg = mensagens[i]

    if (hashesJaConhecidos.has(msg.hashDeterminista)) {
      mensagensConhecidas++
      continue
    }
    mensagensNovas++

    const campos = extrairCamposSolicitacao(msg.conteudo)

    if (campos.isPossivel) {
      possiveisCount++

      // Verificar campos faltantes (Regra: NUNCA inventar informação ausente)
      const faltantes: string[] = []
      if (!campos.loja) faltantes.push('Loja')
      if (!campos.industria) faltantes.push('Indústria')
      if (!campos.produto) faltantes.push('Produto')
      if (campos.quantidade === undefined || isNaN(campos.quantidade)) faltantes.push('Quantidade')
      if (!campos.validade) faltantes.push('Validade')

      const incompleta = faltantes.length > 0
      if (incompleta) {
        incompletasCount++
      }

      // Resolver data
      const dataIso = campos.data ? normalizarDataPtBr(campos.data) : ''

      // Verificar evidências/mídias próximas (Regra de associação segura)
      const evidenciasMsg: Array<{
        nome: string
        tipo: EvidenciaTipo
        arquivo?: File | Blob
        segura: boolean
      }> = []

      // 1. Se a própria mensagem tem referência de anexo
      if (msg.arquivoAnexo) {
        const midiaEncontrada = arquivosMidiaDisponiveis.find((m) =>
          m.nome.toLowerCase().includes(msg.arquivoAnexo!.toLowerCase()),
        )
        evidenciasMsg.push({
          nome: msg.arquivoAnexo,
          tipo: 'foto_produto',
          arquivo: midiaEncontrada?.arquivo,
          segura: true,
        })
      }

      // 2. Se a mensagem seguinte foi enviada pelo mesmo autor no mesmo minuto com anexo
      if (i + 1 < mensagens.length) {
        const prox = mensagens[i + 1]
        if (prox.autor === msg.autor && prox.dataHoraStr === msg.dataHoraStr && prox.arquivoAnexo) {
          const midiaEncontrada = arquivosMidiaDisponiveis.find((m) =>
            m.nome.toLowerCase().includes(prox.arquivoAnexo!.toLowerCase()),
          )
          evidenciasMsg.push({
            nome: prox.arquivoAnexo,
            tipo: 'foto_produto',
            arquivo: midiaEncontrada?.arquivo,
            segura: true,
          })
        }
      }

      // Resolver Produto se houver texto de produto
      const textoProd = campos.produto || 'Produto não identificado'
      let resolucao = undefined
      let precisaRevisao = incompleta

      if (campos.produto) {
        resolucao = await resolverProduto({
          textoInformado: campos.produto,
          industriaNome: campos.industria,
        })
        if (resolucao.precisaConfirmacaoHumana) {
          precisaRevisao = true
        }
      } else {
        precisaRevisao = true
      }

      if (precisaRevisao) {
        precisamRevisaoCount++
      }

      const solicitacao: SolicitacaoIdentificadaWhatsApp = {
        id: `sol_${msg.hashDeterminista}`,
        rawMensagemId: msg.id,
        timestamp: msg.timestampIso,
        dataHoraMsg: msg.dataHoraStr,
        autor: campos.repositor || msg.autor,
        lojaInformada: campos.loja,
        lojaResolvida: campos.loja
          ? {
              codigo: campos.loja.match(/\d+/)?.[0] || '',
              nome: campos.loja,
            }
          : undefined,
        industriaInformada: campos.industria,
        industriaResolvida: campos.industria
          ? {
              nome: campos.industria,
            }
          : undefined,
        produtos: [
          {
            id: `prod_${msg.hashDeterminista}_0`,
            textoProdutoInformado: textoProd,
            quantidadeInformada: campos.quantidade ?? 0,
            validadeInformada: campos.validade ? normalizarDataPtBr(campos.validade) : undefined,
            validadeAusente: !campos.validade,
            motivoInformado: campos.motivo || 'Troca operacional',
            oQueEstaSendoSolicitado: campos.solicitado,
            evidenciaDisponivel: evidenciasMsg.length > 0 || Boolean(campos.evidenciaTexto),
            evidenciaNome: evidenciasMsg[0]?.nome || campos.evidenciaTexto,
            evidenciaArquivo: evidenciasMsg[0]?.arquivo,
            resolucaoProduto: resolucao,
            produtoConfirmado:
              resolucao && !resolucao.precisaConfirmacaoHumana && resolucao.produtoOficial
                ? {
                    codigo: resolucao.produtoOficial.codigo,
                    nome: resolucao.produtoOficial.nome,
                  }
                : undefined,
          },
        ],
        incompleta,
        camposFaltantes: faltantes,
        evidenciasDisponiveis: evidenciasMsg,
        statusRevisao: 'pendente',
      }

      solicitacoes.push(solicitacao)
    }
  }

  // Agrupamento determinístico: sugerir vincular solicitações da MESMA loja e MESMO autor no mesmo dia/janela
  for (let i = 0; i < solicitacoes.length; i++) {
    const s1 = solicitacoes[i]
    if (s1.grupoCasoSugeridoId) continue

    s1.grupoCasoSugeridoId = s1.id

    for (let j = i + 1; j < solicitacoes.length; j++) {
      const s2 = solicitacoes[j]
      if (s2.grupoCasoSugeridoId) continue

      // Se for a mesma loja informada e mesmo autor na mesma data
      if (
        s1.lojaInformada &&
        s2.lojaInformada &&
        s1.lojaInformada.toLowerCase().trim() === s2.lojaInformada.toLowerCase().trim() &&
        s1.autor.toLowerCase().trim() === s2.autor.toLowerCase().trim()
      ) {
        s2.grupoCasoSugeridoId = s1.id
      }
    }
  }

  const todosHashesMensagens = mensagens.map((m) => m.hashDeterminista)

  return {
    totalMensagens: mensagens.length,
    mensagensConhecidas,
    mensagensNovas,
    todosHashesMensagens,
    solicitacoes,
    resumo: {
      totalEncontradas: mensagens.length,
      jaConhecidas: mensagensConhecidas,
      novas: mensagensNovas,
      possiveisSolicitacoes: possiveisCount,
      precisamRevisao: precisamRevisaoCount,
      incompletas: incompletasCount,
    },
  }
}
