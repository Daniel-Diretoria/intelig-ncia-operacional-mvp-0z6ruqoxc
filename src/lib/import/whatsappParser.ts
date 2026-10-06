/**
 * Parser de Exportações do WhatsApp para Devoluções/NF — SKIP Inteligência Operacional
 *
 * Suporta formatos reais de exportação nativa do WhatsApp (ZIP com ou sem mídias, TXT direto).
 *
 * Características aprovadas:
 * - Aceita ZIP diretamente ou TXT diretamente;
 * - Detecta marcadores de evidência ausente na exportação (<imagem ocultada>, <vídeo omitido>, etc.);
 * - Reconciliação do cabeçalho da mensagem (promotor, loja) com os campos do formulário (Repositor, Loja);
 *   aponta consistência ou divergência humana obrigatória;
 * - Tolerância à escrita de indústria ("DItália" -> Massas D'Itália, frutap, parmissimo, italac) sem criar nova indústria;
 * - Interpretação do bloco inteiro da solicitação para múltiplos produtos:
 *    * Cenário A: "Produto, v e Q:" com itens empilhados e validades intercaladas;
 *    * Cenário B: produtos listados dentro do campo "Quantidade:" com quantidades e nomes combinados;
 *    * Cenário C: listas de produtos e quantidades separadas por barra com correspondência 1:1;
 *    * Cenário D: positional ambíguo (contagens diferentes) enviado para revisão humana;
 * - Uma solicitação com múltiplos produtos permanece UM ÚNICO Caso de Devolução com N itens;
 * - Validade ausente marcada explicitamente como "Validade não informada", sem inventar dados;
 * - Deduplicação determinística preservada: hash determinístico wmsg_xxx, file_hash SHA-256;
 * - Integração limpa com o Resolvedor de Produtos existente e Dicionário de Aliases.
 */

import { SolicitacaoIdentificadaWhatsApp, EvidenciaTipo } from '@/types/devolucoes'
import { resolverProduto } from '@/lib/resolve/produtoResolver'

export interface MensagemWhatsAppBruta {
  id: string
  dataHoraStr: string
  timestampIso?: string
  autor: string
  conteudo: string
  arquivoAnexo?: string
  temMarcadorMidiaOcultada?: boolean
  midiaOcultadaDescricao?: string
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
    comMidiaOcultada: number
    comMidiaRealAnexa: number
    solicitacoesNovas?: number
    solicitacoesPendentes?: number
    solicitacoesProcessadas?: number
    solicitacoesIgnoradas?: number
    solicitacoesRecuperadas?: number
  }
}

export interface ItemExtraidoParser {
  id?: string
  textoProdutoInformado: string
  quantidadeInformada: number
  validadeInformada?: string
  validadeAusente?: boolean
  motivoInformado?: string
  oQueEstaSendoSolicitado?: string
  precisaRevisaoItem?: boolean
  motivoRevisaoItem?: string
}

export interface InformacoesReconciliacaoCabecalho {
  promotorCabecalho?: string
  lojaCabecalho?: string
  codigoLojaCabecalho?: string
  lojaCorpo?: string
  codigoLojaCorpo?: string
  promotorCorpo?: string
  divergenciaLoja: boolean
  divergenciaLojaMensagem?: string
  consistenciaLoja: boolean
}

export interface MidiaDisponivelInput {
  nome: string
  arquivo?: File | Blob
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
 * Normalização fonética/tolerante para nomes de indústrias cadastradas.
 * Tolera ausência de apóstrofo ("DItália" -> "Massas D'Itália"), caixa alta/baixa, acentos e espaços.
 */
export function normalizarEscritaIndustria(termo?: string): string {
  if (!termo) return ''
  return termo
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['"’`\-_\s]/g, '')
    .trim()
}

/**
 * Sugere a indústria oficial a partir de variações conhecidas ou tolerância ortográfica
 * NUNCA cria nova indústria por erro de digitação.
 */
export function sugerirIndustriaOficial(
  termoInformado?: string,
  industriasCadastradas: Array<{ id?: string; nome: string }> = [],
): { industriaNomeOficial?: string; id?: string; segura: boolean; ambigua: boolean } {
  if (!termoInformado || termoInformado.trim() === '') {
    return { segura: false, ambigua: false }
  }

  const norm = normalizarEscritaIndustria(termoInformado)

  // Mapeamentos conhecidos de apelidos/abreviações para a lista oficial
  const apelidosConhecidos: Record<string, string> = {
    frutap: 'FRUTAP',
    ditalia: "MASSAS D'ITÁLIA",
    massasditalia: "MASSAS D'ITÁLIA",
    parmissimo: 'PARMÍSSIMO',
    italac: 'ITALAC',
    vigor: 'VIGOR',
    itambe: 'ITAMBÉ',
    piracanjuba: 'PIRACANJUBA',
    tirolez: 'TIROLEZ',
  }

  const matchApelido = apelidosConhecidos[norm]

  // Candidatos da lista cadastrada
  const matches: Array<{ id?: string; nome: string }> = []
  for (const ind of industriasCadastradas) {
    const normOficial = normalizarEscritaIndustria(ind.nome)
    if (normOficial === norm || normOficial.includes(norm) || norm.includes(normOficial)) {
      matches.push(ind)
    } else if (
      matchApelido &&
      normalizarEscritaIndustria(ind.nome).includes(normalizarEscritaIndustria(matchApelido))
    ) {
      matches.push(ind)
    }
  }

  if (matches.length === 1) {
    return {
      industriaNomeOficial: matches[0].nome,
      id: matches[0].id,
      segura: true,
      ambigua: false,
    }
  }

  if (matches.length > 1) {
    // Dúvida entre duas ou mais indústrias cadastradas: pedir confirmação humana
    return {
      industriaNomeOficial: matches[0].nome,
      id: matches[0].id,
      segura: false,
      ambigua: true,
    }
  }

  // Se não estiver na lista cadastrada mas é apelido seguro
  if (matchApelido) {
    return {
      industriaNomeOficial: matchApelido,
      segura: true,
      ambigua: false,
    }
  }

  // Fallback: mantém o nome informado mas sem segurança total
  return {
    industriaNomeOficial: termoInformado.trim(),
    segura: false,
    ambigua: false,
  }
}

/**
 * Expressões regulares para quebra de mensagens de exportação do WhatsApp
 * Suporta formatos:
 * [18/09/2026, 14:32:10] João: ...
 * 18/09/2026, 14:32 - João: ...
 * 18/09/2026 14:32 - João: ...
 * 18/09/26, 14:32 - João: ...
 * 18/09/26 14:32:10: João: ...
 */
const REGEX_CABECALHO_MSG =
  /^(?:\[?(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?)(?:\s*(?:AM|PM|am|pm))?\]?\s*[-–—:]?\s*)([^:]+):\s*([\s\S]*)$/

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

    // Checar se há menção a anexo real exportado (ex: "<arquivo anexado: IMG-20260918-WA0001.jpg>")
    let anexo: string | undefined = undefined
    const anexoMatch =
      texto.match(/<arquivo anexado:\s*([^>]+)>/i) ||
      texto.match(/<anexo:\s*([^>]+)>/i) ||
      texto.match(/<attached:\s*([^>]+)>/i) ||
      texto.match(/\((arquivo anexado|imagem anexada|vídeo anexado)\)/i)

    if (anexoMatch && anexoMatch[1] && !anexoMatch[1].startsWith('arquivo')) {
      anexo = anexoMatch[1].trim()
    }

    // Checar marcadores de mídia omitida / ocultada na exportação sem mídia:
    // Ex: "<imagem ocultada>", "<vídeo omitido>", "<áudio ocultado>", "<mídia omitida>", "<image omitted>"
    const marcadorOcultadoMatch = texto.match(
      /<(?:imagem ocultada|imagem omitida|vídeo omitido|video omitido|áudio ocultado|audio omitido|mídia omitida|midia ocultada|image omitted|video omitted|audio omitted|media omitted)>/i,
    )

    const temMarcadorMidiaOcultada = Boolean(marcadorOcultadoMatch)
    const midiaOcultadaDescricao = marcadorOcultadoMatch ? marcadorOcultadoMatch[0] : undefined

    const hash = gerarHashMensagem(msgAtual.dataHoraStr, msgAtual.autor, texto)
    mensagens.push({
      id: hash,
      dataHoraStr: msgAtual.dataHoraStr,
      autor: msgAtual.autor.trim(),
      conteudo: texto,
      arquivoAnexo: anexo,
      temMarcadorMidiaOcultada,
      midiaOcultadaDescricao,
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
 * Analisa o cabeçalho do autor da mensagem (ex: "Cerlys - 306", "Analice loja 260", "Cenny 160",
 * "Ana Furtado 240", "Deyvison 325", "Henrique - 825") e extrai evidências de promotor e loja.
 */
export function analisarCabecalhoAutor(autor: string): {
  promotorSugerido: string
  codigoLojaSugerido?: string
  lojaTexto?: string
} {
  const trimmed = autor.trim()

  // Padrões comuns: "Nome - 306", "Nome loja 260", "Nome 160", "Nome (Loja 240)"
  const matchComTraco = trimmed.match(/^([A-Za-zÀ-ÖØ-öø-ÿ\s]+?)\s*[-–—]\s*(?:loja\s*)?(\d{2,5})$/i)
  if (matchComTraco) {
    return {
      promotorSugerido: matchComTraco[1].trim(),
      codigoLojaSugerido: matchComTraco[2].trim(),
      lojaTexto: `Loja ${matchComTraco[2].trim()}`,
    }
  }

  const matchComLoja = trimmed.match(/^([A-Za-zÀ-ÖØ-öø-ÿ\s]+?)\s+loja\s+(\d{2,5})$/i)
  if (matchComLoja) {
    return {
      promotorSugerido: matchComLoja[1].trim(),
      codigoLojaSugerido: matchComLoja[2].trim(),
      lojaTexto: `Loja ${matchComLoja[2].trim()}`,
    }
  }

  const matchNomeNumero = trimmed.match(/^([A-Za-zÀ-ÖØ-öø-ÿ\s]+?)\s+(\d{2,5})$/)
  if (matchNomeNumero) {
    return {
      promotorSugerido: matchNomeNumero[1].trim(),
      codigoLojaSugerido: matchNomeNumero[2].trim(),
      lojaTexto: `Loja ${matchNomeNumero[2].trim()}`,
    }
  }

  return {
    promotorSugerido: trimmed,
  }
}

/**
 * Reconcilia o cabeçalho com o corpo estruturado (Cenários F e G).
 * Se o cabeçalho diz "loja 260" e o corpo "Loja: 260" -> consistência (F).
 * Se o cabeçalho diz "loja 260" e o corpo "Loja: 405" -> divergência mostrada para revisão humana (G).
 */
export function reconciliarCabecalhoCorpo(
  autorCabecalho: string,
  lojaCorpo?: string,
  promotorCorpo?: string,
): InformacoesReconciliacaoCabecalho {
  const infoAutor = analisarCabecalhoAutor(autorCabecalho)

  const codCabecalho = infoAutor.codigoLojaSugerido
  const codCorpoMatch = lojaCorpo ? lojaCorpo.match(/\b(\d{2,5})\b/) : null
  const codCorpo = codCorpoMatch ? codCorpoMatch[1] : undefined

  let divergenciaLoja = false
  let divergenciaLojaMensagem: string | undefined = undefined
  let consistenciaLoja = false

  if (codCabecalho && codCorpo) {
    if (codCabecalho === codCorpo) {
      consistenciaLoja = true
    } else {
      divergenciaLoja = true
      divergenciaLojaMensagem = `Divergência detectada: o cabeçalho indica Loja ${codCabecalho} ("${autorCabecalho}"), mas o corpo informa "${lojaCorpo}". Requer conferência humana.`
    }
  } else if (codCabecalho && !codCorpo) {
    // Cabeçalho tem loja e corpo não tem
    consistenciaLoja = true
  }

  return {
    promotorCabecalho: infoAutor.promotorSugerido,
    lojaCabecalho: infoAutor.lojaTexto,
    codigoLojaCabecalho: codCabecalho,
    lojaCorpo,
    codigoLojaCorpo: codCorpo,
    promotorCorpo,
    divergenciaLoja,
    divergenciaLojaMensagem,
    consistenciaLoja,
  }
}

/**
 * Tenta quebrar uma linha no padrão "QTD PRODUTO" (ex: "57un Fermentado de 75g natural", "44 bandeja de morango", "2 pudim")
 */
function tentarExtrairQtdEProduto(linha: string): { qtd: number; nome: string } | null {
  const l = linha.trim()
  if (!l) return null

  // Expressão: número no início seguido opcionalmente de "un", "uni", "bandeja", "litros", etc.
  const match = l.match(
    /^(\d+)\s*(?:un|uni|und|unidades?|cx|caixa|bandejas?|potes?|copos?|litros?|pct|pacotes?)?\s*[-–—:]?\s*(.+)$/i,
  )
  if (match) {
    const q = parseInt(match[1], 10)
    const resto = match[2].trim()
    if (q > 0 && resto.length > 1) {
      return { qtd: q, nome: resto }
    }
  }

  return null
}

/**
 * Verifica se a linha é estritamente uma data (ex: "05/10", "29/09/2026", "02/10")
 */
function isLinhaData(linha: string): boolean {
  return /^\d{1,2}[/\-.]\d{1,2}(?:[/\-.]\d{2,4})?$/.test(linha.trim())
}

/**
 * Parser inteligente de múltiplos produtos no bloco da mensagem (Cenários A, B, C, D)
 */
export function extrairProdutosBlocoInteiro(
  linhasBloco: string[],
  produtoCampoBruto?: string,
  quantidadeCampoBruto?: string,
  validadeCampoBruto?: string,
): { itens: ItemExtraidoParser[]; ambiguidadePosicional: boolean } {
  const itens: ItemExtraidoParser[] = []

  // -------------------------------------------------------------
  // CENÁRIO A: "Produto, v e Q:" com itens empilhados e datas intercaladas
  // Exemplo:
  // "57un Fermentado de 75g natural\n05/10\n01un iogurte de morango com leite condensado\n29/09\n02un pudim\n02/10"
  // -------------------------------------------------------------
  const itensEmpilhados: ItemExtraidoParser[] = []
  let achouEmpilhadoValido = false

  for (let i = 0; i < linhasBloco.length; i++) {
    const l = linhasBloco[i].trim()
    if (!l) continue

    const extraido = tentarExtrairQtdEProduto(l)
    if (extraido) {
      // Verificar se a próxima linha é uma data de validade (Cenário A)
      let valEncontrada: string | undefined = undefined
      if (i + 1 < linhasBloco.length && isLinhaData(linhasBloco[i + 1])) {
        valEncontrada = normalizarDataPtBr(linhasBloco[i + 1].trim())
        i++ // avança para pular a linha de data consumida
      }

      itensEmpilhados.push({
        textoProdutoInformado: extraido.nome,
        quantidadeInformada: extraido.qtd,
        validadeInformada: valEncontrada,
        validadeAusente: !valEncontrada,
      })
      achouEmpilhadoValido = true
    }
  }

  // Se encontrou 2 ou mais itens empilhados com o padrão número+produto, esse é o formato real!
  if (itensEmpilhados.length >= 2) {
    return { itens: itensEmpilhados, ambiguidadePosicional: false }
  }

  // -------------------------------------------------------------
  // CENÁRIO C & D: listas separadas por barra ("/") em Produto e Quantidade
  // Ex: Produto: frutap salada de frutas / marga com leite
  //     Quantidade: 4 uni / 6 uni
  // -------------------------------------------------------------
  if (
    produtoCampoBruto &&
    produtoCampoBruto.includes('/') &&
    quantidadeCampoBruto &&
    quantidadeCampoBruto.includes('/')
  ) {
    const prodsSeparados = produtoCampoBruto
      .split('/')
      .map((p) => p.trim())
      .filter((p) => p.length > 0)

    const qtdsSeparadas = quantidadeCampoBruto
      .split('/')
      .map((q) => q.trim())
      .filter((q) => q.length > 0)

    // Se a correspondência posicional for 1:1 clara (Cenário C)
    if (prodsSeparados.length === qtdsSeparadas.length && prodsSeparados.length > 1) {
      const itensBarra: ItemExtraidoParser[] = []
      for (let i = 0; i < prodsSeparados.length; i++) {
        const numMatch = qtdsSeparadas[i].match(/(\d+)/)
        const qtdVal = numMatch ? parseInt(numMatch[1], 10) : 0
        itensBarra.push({
          textoProdutoInformado: prodsSeparados[i],
          quantidadeInformada: qtdVal,
          validadeAusente: true,
        })
      }
      return { itens: itensBarra, ambiguidadePosicional: false }
    }

    // Se houver contagens diferentes (Cenário D: ex: 3 produtos e 2 quantidades) -> ambiguidade posicional!
    if (prodsSeparados.length !== qtdsSeparadas.length) {
      const itensAmbiguos: ItemExtraidoParser[] = prodsSeparados.map((p) => ({
        textoProdutoInformado: p,
        quantidadeInformada: 0,
        validadeAusente: true,
        precisaRevisaoItem: true,
        motivoRevisaoItem:
          'Associação ambígua: a quantidade de produtos informados não coincide com o número de quantidades na lista por barra. Requer revisão humana.',
      }))
      return { itens: itensAmbiguos, ambiguidadePosicional: true }
    }
  }

  // -------------------------------------------------------------
  // CENÁRIO B: produtos empilhados dentro do campo "Quantidade:"
  // Exemplo:
  // Produto: frutap
  // Quantidade:
  // 44 bandeja de morango
  // 4 sobremesa de chocolate
  // 2 frutapinho
  // 4 copo de natural
  // 2 litros de salada de fruta
  // 1 fermentado
  // 1 litros de morango
  // -------------------------------------------------------------
  if (quantidadeCampoBruto && quantidadeCampoBruto.includes('\n')) {
    const linhasQtd = quantidadeCampoBruto.split(/\r?\n/)
    const itensQtd: ItemExtraidoParser[] = []

    for (const l of linhasQtd) {
      const extraido = tentarExtrairQtdEProduto(l)
      if (extraido) {
        itensQtd.push({
          textoProdutoInformado: extraido.nome,
          quantidadeInformada: extraido.qtd,
          validadeAusente: true,
        })
      }
    }

    if (itensQtd.length >= 2) {
      return { itens: itensQtd, ambiguidadePosicional: false }
    }
  }

  // Se encontrou ao menos 1 item empilhado na primeira passagem
  if (itensEmpilhados.length === 1) {
    return { itens: itensEmpilhados, ambiguidadePosicional: false }
  }

  // Fallback padrão: 1 item único usando os campos tradicionais
  const qtdMatch = quantidadeCampoBruto?.match(/(\d+)/)
  const qtdVal = qtdMatch ? parseInt(qtdMatch[1], 10) : 0

  itens.push({
    textoProdutoInformado: produtoCampoBruto || '',
    quantidadeInformada: qtdVal,
    validadeInformada: validadeCampoBruto ? normalizarDataPtBr(validadeCampoBruto) : undefined,
    validadeAusente: !validadeCampoBruto,
  })

  return { itens, ambiguidadePosicional: false }
}

/**
 * Extrai campos da mensagem tolerando blocos multilinha, produtos empilhados e rótulos combinados
 */
export function extrairCamposSolicitacao(texto: string): {
  data?: string
  repositor?: string
  loja?: string
  industria?: string
  produto?: string
  quantidade?: number
  validade?: string
  produtoBruto?: string
  quantidadeBruta?: string
  validadeBruta?: string
  motivo?: string
  solicitado?: string
  evidenciaTexto?: string
  itensExtraidos: ItemExtraidoParser[]
  ambiguidadePosicional: boolean
  isEstruturada: boolean
  isPossivel: boolean
} {
  const linhas = texto.split(/\r?\n/)

  let dataVal: string | undefined
  let repositorVal: string | undefined
  let lojaVal: string | undefined
  let industriaVal: string | undefined
  let produtoVal: string | undefined
  let quantidadeVal: string | undefined
  let validadeVal: string | undefined
  let motivoVal: string | undefined
  let solicitadoVal: string | undefined
  let evidenciaVal: string | undefined

  // Captura de blocos multilinhas de campos (ex: "Quantidade:\n44 ...\n2 ...")
  let campoAtual: string | null = null
  const blocoConteudoPorCampo: Record<string, string[]> = {}

  let camposEncontrados = 0

  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i].trim()
    if (!l) continue

    // Reconhecimento de "Produto, v e Q:" ou "Produto, V e Q:" (Cenário A)
    if (/^produto\s*,\s*(?:v|validade)\s*e\s*(?:q|quantidade)\s*:/i.test(l)) {
      campoAtual = 'bloco_completo_pvq'
      blocoConteudoPorCampo[campoAtual] = []
      camposEncontrados += 3
      continue
    }

    // Data:
    const dataMatch = l.match(/^data\s*:\s*(.*)$/i)
    if (dataMatch) {
      dataVal = dataMatch[1].trim()
      campoAtual = 'data'
      camposEncontrados++
      continue
    }

    // Repositor: / Promotor: / Colaborador:
    const repMatch = l.match(/^(?:repositor|promotor|colaborador)\s*:\s*(.*)$/i)
    if (repMatch) {
      repositorVal = repMatch[1].trim()
      campoAtual = 'repositor'
      camposEncontrados++
      continue
    }

    // Loja: / Cliente: / Mercado:
    const lojaMatch = l.match(/^(?:loja|mercado|supermercado|cliente)\s*:\s*(.*)$/i)
    if (lojaMatch) {
      lojaVal = lojaMatch[1].trim()
      campoAtual = 'loja'
      camposEncontrados++
      continue
    }

    // Indústria: / Fornecedor: / Marca:
    const indMatch = l.match(/^(?:industria|indústria|marca|fornecedor)\s*:\s*(.*)$/i)
    if (indMatch) {
      industriaVal = indMatch[1].trim()
      campoAtual = 'industria'
      camposEncontrados++
      continue
    }

    // Produto: / Item: / Mercadoria:
    const prodMatch = l.match(/^(?:produto|item|mercadoria)\s*:\s*(.*)$/i)
    if (prodMatch) {
      produtoVal = prodMatch[1].trim()
      campoAtual = 'produto'
      blocoConteudoPorCampo[campoAtual] = produtoVal ? [produtoVal] : []
      camposEncontrados++
      continue
    }

    // Quantidade: / Qtd: / Volume:
    const qtdMatch = l.match(/^(?:quantidade|qtd|volume)\s*:\s*(.*)$/i)
    if (qtdMatch) {
      quantidadeVal = qtdMatch[1].trim()
      campoAtual = 'quantidade'
      blocoConteudoPorCampo[campoAtual] = quantidadeVal ? [quantidadeVal] : []
      camposEncontrados++
      continue
    }

    // Validade: / Vencimento: / Val:
    const valMatch = l.match(/^(?:validade|vencimento|val)\s*:\s*(.*)$/i)
    if (valMatch) {
      validadeVal = valMatch[1].trim()
      campoAtual = 'validade'
      blocoConteudoPorCampo[campoAtual] = validadeVal ? [validadeVal] : []
      camposEncontrados++
      continue
    }

    // Motivo: / Razão:
    const motMatch = l.match(/^(?:motivo|razao|razão)\s*:\s*(.*)$/i)
    if (motMatch) {
      motivoVal = motMatch[1].trim()
      campoAtual = 'motivo'
      camposEncontrados++
      continue
    }

    // Solicitação: / Ação: / O que está sendo solicitado:
    const solMatch = l.match(
      /^(?:o que esta sendo solicitado|o que está sendo solicitado|solicitacao|solicitação|acao|ação)\s*:\s*(.*)$/i,
    )
    if (solMatch) {
      solicitadoVal = solMatch[1].trim()
      campoAtual = 'solicitado'
      camposEncontrados++
      continue
    }

    // Evidência: / Foto: / Anexo:
    const evidMatch = l.match(/^(?:foto|evidencia|evidência|anexo)\s*:\s*(.*)$/i)
    if (evidMatch) {
      evidenciaVal = evidMatch[1].trim()
      campoAtual = 'evidencia'
      camposEncontrados++
      continue
    }

    // Linha continuada do campo anterior
    if (campoAtual) {
      if (!blocoConteudoPorCampo[campoAtual]) {
        blocoConteudoPorCampo[campoAtual] = []
      }
      blocoConteudoPorCampo[campoAtual].push(l)
    }
  }

  // Se houve linhas acumuladas no bloco "produto" ou "quantidade", unificar
  if (blocoConteudoPorCampo['produto'] && blocoConteudoPorCampo['produto'].length > 0) {
    produtoVal = blocoConteudoPorCampo['produto'].join('\n')
  }
  if (blocoConteudoPorCampo['quantidade'] && blocoConteudoPorCampo['quantidade'].length > 0) {
    quantidadeVal = blocoConteudoPorCampo['quantidade'].join('\n')
  }

  // Linhas do bloco para parsing avançado
  const linhasParaParserProdutos = blocoConteudoPorCampo['bloco_completo_pvq'] || linhas

  const { itens, ambiguidadePosicional } = extrairProdutosBlocoInteiro(
    linhasParaParserProdutos,
    produtoVal,
    quantidadeVal,
    validadeVal,
  )

  // Preencher motivo e ação em cada item
  for (const it of itens) {
    if (!it.motivoInformado) it.motivoInformado = motivoVal
    if (!it.oQueEstaSendoSolicitado) it.oQueEstaSendoSolicitado = solicitadoVal
  }

  const temTituloTroca = /troca|solicitacao|solicitação|devolucao|devolução/i.test(texto)
  const isEstruturada = temTituloTroca && camposEncontrados >= 2

  const isPossivel =
    isEstruturada ||
    temTituloTroca ||
    (lojaVal !== undefined &&
      (motivoVal !== undefined || produtoVal !== undefined || itens.length > 0)) ||
    /loja\s+\d+.*validade/i.test(texto) ||
    /motivo\s*:\s*validade/i.test(texto)

  const p0 = itens[0]
  const produtoPrimeiro = p0?.textoProdutoInformado || produtoVal
  const qtdPrimeiro =
    p0?.quantidadeInformada !== undefined
      ? p0.quantidadeInformada
      : quantidadeVal
        ? parseInt(quantidadeVal.match(/\d+/)?.[0] || '0', 10)
        : undefined
  const valPrimeiro = p0?.validadeInformada || validadeVal

  return {
    data: dataVal,
    repositor: repositorVal,
    loja: lojaVal,
    industria: industriaVal,
    produto: produtoPrimeiro,
    quantidade: qtdPrimeiro,
    validade: valPrimeiro,
    produtoBruto: produtoVal,
    quantidadeBruta: quantidadeVal,
    validadeBruta: validadeVal,
    motivo: motivoVal,
    solicitado: solicitadoVal,
    evidenciaTexto: evidenciaVal,
    itensExtraidos: itens,
    ambiguidadePosicional,
    isEstruturada,
    isPossivel,
  }
}

/**
 * Função principal de parsing de conversas WhatsApp
 * Processa mensagens, deduplica via hashes, extrai blocos com múltiplos produtos,
 * reconcilia cabeçalho vs corpo e submete cada produto individualmente ao Resolvedor de Produtos existente.
 */
export interface EstadoSolicitacaoConhecida {
  solicitacaoId: string
  rawMensagemId: string
  estadoOperacional: 'nova' | 'pendente_revisao' | 'processada' | 'ignorada'
  casoCriadoId?: string
  casoCriadoCodigo?: string
  ignoradoPor?: string
  ignoradoEm?: string
  ajustesOperador?: Record<string, unknown>
  produtosAjustados?: SolicitacaoIdentificadaWhatsApp['produtos']
  foiRecuperada?: boolean
}

export interface VinculoCasoExistente {
  casoId: string
  casoCodigo: string
}

export async function parseConversaWhatsApp(
  conteudoArquivo: string,
  hashesJaConhecidos: Set<string> = new Set(),
  arquivosMidiaDisponiveis: MidiaDisponivelInput[] = [],
  industriasCadastradas: Array<{ id?: string; nome: string }> = [],
  mapaSolicitacoesConhecidas: Map<string, EstadoSolicitacaoConhecida> = new Map(),
  mapaVinculosCasosExistentes: Map<string, VinculoCasoExistente> = new Map(),
): Promise<ParseWhatsAppResult> {
  const mensagens = extrairMensagensArquivoWhatsApp(conteudoArquivo)

  let mensagensConhecidas = 0
  let mensagensNovas = 0
  const solicitacoes: SolicitacaoIdentificadaWhatsApp[] = []

  let possiveisCount = 0
  let precisamRevisaoCount = 0
  let incompletasCount = 0
  let comMidiaOcultadaCount = 0
  let comMidiaRealCount = 0

  for (let i = 0; i < mensagens.length; i++) {
    const msg = mensagens[i]
    const isMsgConhecida = hashesJaConhecidos.has(msg.hashDeterminista)

    if (isMsgConhecida) {
      mensagensConhecidas++
    } else {
      mensagensNovas++
    }

    const solId = `sol_${msg.hashDeterminista}`
    const estadoConhecido =
      mapaSolicitacoesConhecidas.get(solId) || mapaSolicitacoesConhecidas.get(msg.hashDeterminista)

    if (estadoConhecido?.estadoOperacional === 'processada') {
      // Já gerou caso anteriormente; não recria e não enfileira como nova
      possiveisCount++
      continue
    }

    const campos = extrairCamposSolicitacao(msg.conteudo)

    // EDIÇÃO 1: Tratar mensagens conhecidas sem estado persistido (legado)
    // Se a mensagem já é conhecida e não possui estado persistido:
    // NÃO dar continue antes da análise — reavaliar o conteúdo com o parser.
    // Se NÃO for possível solicitação (!campos.isPossivel), aí sim continue (conversa comum).
    // Se for possível solicitação: consultar se existe vínculo seguro com Caso em devolucoes_casos.
    // Se houver vínculo seguro com Caso: tratar como processada (não recria e não enfileira para revisão).
    // Sem vínculo: criar registro operacional como pendente_revisao (marcado com foiRecuperada = true).
    let legadaRecuperadaComoPendente = false
    if (isMsgConhecida && !estadoConhecido) {
      if (!campos.isPossivel) {
        // Mensagem comum já conhecida que nunca foi e não é solicitação
        continue
      }

      // Consultar se existe vínculo seguro com Caso em devolucoes_casos
      const vinculoCaso =
        mapaVinculosCasosExistentes.get(solId) ||
        mapaVinculosCasosExistentes.get(msg.hashDeterminista)

      if (vinculoCaso?.casoId) {
        // Vinculada previamente a Caso em devolucoes_casos: tratar como processada
        possiveisCount++
        continue
      }

      legadaRecuperadaComoPendente = true
    }

    if (campos.isPossivel) {
      possiveisCount++

      // 1. Reconciliação Cabeçalho (Autor) vs Corpo (Cenários F e G)
      const reconciliacao = reconciliarCabecalhoCorpo(msg.autor, campos.loja, campos.repositor)

      // Identificar loja preferencial: priorizar corpo estruturado, mas usar cabeçalho se corpo não tiver
      const lojaFinalTexto = campos.loja || reconciliacao.lojaCabecalho
      const lojaCodigoFinal =
        reconciliacao.codigoLojaCorpo || reconciliacao.codigoLojaCabecalho || ''

      // Identificar promotor preferencial: priorizar repositor do corpo, ou promotor do cabeçalho
      const promotorFinal = campos.repositor || reconciliacao.promotorCabecalho || msg.autor

      // 2. Tolerância ortográfica de Indústria (Cenário E: "DItália" -> "Massas D'Itália")
      const industriaSugerida = sugerirIndustriaOficial(campos.industria, industriasCadastradas)
      const industriaFinalNome = industriaSugerida.industriaNomeOficial || campos.industria

      // 3. Mídias e Evidências
      const evidenciasMsg: Array<{
        nome: string
        tipo: EvidenciaTipo
        arquivo?: File | Blob
        segura: boolean
      }> = []

      // CENÁRIO H: Se contém marcador de mídia ocultada (<imagem ocultada>), registrar com clareza sem inventar arquivo
      let temMidiaOcultada = msg.temMarcadorMidiaOcultada
      let midiaOcultadaTexto = msg.midiaOcultadaDescricao

      // Checar se a própria mensagem traz menção a anexo real
      if (msg.arquivoAnexo) {
        const midiaEncontrada = arquivosMidiaDisponiveis.find((m) =>
          m.nome.toLowerCase().includes(msg.arquivoAnexo!.toLowerCase()),
        )
        evidenciasMsg.push({
          nome: msg.arquivoAnexo,
          tipo: 'foto_produto',
          arquivo: midiaEncontrada?.arquivo,
          segura: Boolean(midiaEncontrada),
        })
      }

      // CENÁRIO I / B: Se a mensagem seguinte foi enviada pelo mesmo autor no mesmo minuto com anexo
      if (i + 1 < mensagens.length) {
        const prox = mensagens[i + 1]
        if (prox.autor === msg.autor && prox.dataHoraStr === msg.dataHoraStr) {
          if (prox.arquivoAnexo) {
            const midiaEncontrada = arquivosMidiaDisponiveis.find((m) =>
              m.nome.toLowerCase().includes(prox.arquivoAnexo!.toLowerCase()),
            )
            evidenciasMsg.push({
              nome: prox.arquivoAnexo,
              tipo: 'foto_produto',
              arquivo: midiaEncontrada?.arquivo,
              segura: Boolean(midiaEncontrada),
            })
          }
          if (prox.temMarcadorMidiaOcultada) {
            temMidiaOcultada = true
            midiaOcultadaTexto = prox.midiaOcultadaDescricao
          }
        }
      }

      if (temMidiaOcultada) comMidiaOcultadaCount++
      if (evidenciasMsg.some((e) => e.arquivo)) comMidiaRealCount++

      // 4. Verificação de Campos Faltantes (Regra central: NUNCA inventar dados ausentes)
      const faltantes: string[] = []
      if (!lojaFinalTexto) faltantes.push('Loja')
      if (!industriaFinalNome) faltantes.push('Indústria')
      if (campos.itensExtraidos.length === 0 || !campos.itensExtraidos[0].textoProdutoInformado) {
        faltantes.push('Produto')
      }
      if (
        campos.itensExtraidos.some(
          (it) => it.quantidadeInformada === undefined || isNaN(it.quantidadeInformada),
        )
      ) {
        faltantes.push('Quantidade')
      }
      if (campos.itensExtraidos.some((it) => it.validadeAusente)) {
        faltantes.push('Validade')
      }

      const incompleta = faltantes.length > 0
      if (incompleta) incompletasCount++

      let precisaRevisao =
        incompleta ||
        reconciliacao.divergenciaLoja ||
        campos.ambiguidadePosicional ||
        industriaSugerida.ambigua

      // 5. Resolução individual de cada item extraído com o Resolvedor de Produtos existente
      // Se houver produtos já ajustados anteriormente pelo operador em estado pendente, reutiliza
      const produtosProcessados: SolicitacaoIdentificadaWhatsApp['produtos'] = []

      for (let pIdx = 0; pIdx < campos.itensExtraidos.length; pIdx++) {
        const it = campos.itensExtraidos[pIdx]
        const textoProd = it.textoProdutoInformado || 'Produto não identificado'

        let resolucao = undefined
        if (it.textoProdutoInformado && it.textoProdutoInformado.trim() !== '') {
          resolucao = await resolverProduto({
            textoInformado: it.textoProdutoInformado,
            industriaNome: industriaFinalNome,
            storeCode: lojaCodigoFinal,
          })
          if (resolucao.precisaConfirmacaoHumana) {
            precisaRevisao = true
          }
        } else {
          precisaRevisao = true
        }

        produtosProcessados.push({
          id: `prod_${msg.hashDeterminista}_${pIdx}`,
          textoProdutoInformado: textoProd,
          quantidadeInformada: it.quantidadeInformada,
          validadeInformada: it.validadeInformada,
          validadeAusente: it.validadeAusente,
          motivoInformado: it.motivoInformado || campos.motivo || 'Troca operacional',
          oQueEstaSendoSolicitado: it.oQueEstaSendoSolicitado || campos.solicitado,
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
        })
      }

      if (precisaRevisao) {
        precisamRevisaoCount++
      }

      // Determina estado operacional:
      // se é mensagem nova -> 'nova' (ou 'pendente' se identificada como possível solicitação)
      // se já conhecida e pendente -> 'pendente_revisao'
      // se já conhecida e ignorada -> 'ignorada'
      let statusRevisao: 'pendente' | 'confirmada' | 'ignorada' = 'pendente'
      let estadoOp: 'nova' | 'pendente_revisao' | 'processada' | 'ignorada' = isMsgConhecida
        ? 'pendente_revisao'
        : 'nova'

      let foiRecuperada = legadaRecuperadaComoPendente || Boolean(estadoConhecido?.foiRecuperada)

      if (estadoConhecido) {
        estadoOp = estadoConhecido.estadoOperacional
        if (estadoConhecido.estadoOperacional === 'ignorada') {
          statusRevisao = 'ignorada'
        }
      }

      // Montagem da solicitação preservando estrutura aprovada
      const solicitacao: SolicitacaoIdentificadaWhatsApp = {
        id: solId,
        rawMensagemId: msg.id,
        timestamp: msg.timestampIso,
        dataHoraMsg: msg.dataHoraStr,
        autor: promotorFinal,
        lojaInformada: lojaFinalTexto,
        lojaResolvida: lojaFinalTexto
          ? {
              codigo: lojaCodigoFinal,
              nome: lojaFinalTexto,
            }
          : undefined,
        industriaInformada: industriaFinalNome,
        industriaResolvida: industriaFinalNome
          ? {
              id: industriaSugerida.id,
              nome: industriaFinalNome,
            }
          : undefined,
        produtos:
          estadoConhecido?.produtosAjustados && estadoConhecido.produtosAjustados.length > 0
            ? estadoConhecido.produtosAjustados
            : produtosProcessados,
        incompleta,
        camposFaltantes: faltantes,
        evidenciasDisponiveis: evidenciasMsg,
        statusRevisao,
        estadoOperacional: estadoOp,
        casoCriadoId: estadoConhecido?.casoCriadoId,
        casoCriadoCodigo: estadoConhecido?.casoCriadoCodigo,
        ignoradoPor: estadoConhecido?.ignoradoPor,
        ignoradoEm: estadoConhecido?.ignoradoEm,
        foiRecuperada,
      }

      // Adicionar metadados enriquecidos para exibição didática (sem quebrar a tipagem de domínio)
      ;(
        solicitacao as unknown as {
          reconciliacaoCabecalho?: InformacoesReconciliacaoCabecalho
          temMidiaOcultada?: boolean
          midiaOcultadaDescricao?: string
          ambiguidadePosicional?: boolean
          trechoOriginalWhatsapp?: string
        }
      ).reconciliacaoCabecalho = reconciliacao

      ;(solicitacao as unknown as { temMidiaOcultada?: boolean }).temMidiaOcultada =
        temMidiaOcultada
      ;(solicitacao as unknown as { midiaOcultadaDescricao?: string }).midiaOcultadaDescricao =
        midiaOcultadaTexto
      ;(solicitacao as unknown as { ambiguidadePosicional?: boolean }).ambiguidadePosicional =
        campos.ambiguidadePosicional
      ;(solicitacao as unknown as { trechoOriginalWhatsapp?: string }).trechoOriginalWhatsapp =
        msg.conteudo

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

      if (
        s1.lojaInformada &&
        s2.lojaInformada &&
        s1.lojaInformada.toLowerCase().trim() === s2.lojaInformada.toLowerCase().trim() &&
        s1.autor &&
        s2.autor &&
        s1.autor.toLowerCase().trim() === s2.autor.toLowerCase().trim()
      ) {
        s2.grupoCasoSugeridoId = s1.id
      }
    }
  }

  const todosHashesMensagens = mensagens.map((m) => m.hashDeterminista)

  const solNovas = solicitacoes.filter((s) => s.estadoOperacional === 'nova').length
  const solPendentes = solicitacoes.filter(
    (s) =>
      s.estadoOperacional === 'pendente_revisao' ||
      (!s.estadoOperacional && s.statusRevisao === 'pendente'),
  ).length
  const solIgnoradas = solicitacoes.filter((s) => s.statusRevisao === 'ignorada').length
  const solRecuperadas = solicitacoes.filter((s) => s.foiRecuperada).length

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
      comMidiaOcultada: comMidiaOcultadaCount,
      comMidiaRealAnexa: comMidiaRealCount,
      solicitacoesNovas: solNovas,
      solicitacoesPendentes: solPendentes,
      solicitacoesIgnoradas: solIgnoradas,
      solicitacoesRecuperadas: solRecuperadas,
    },
  }
}
