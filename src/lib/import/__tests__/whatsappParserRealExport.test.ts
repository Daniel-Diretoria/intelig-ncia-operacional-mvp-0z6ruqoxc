import { describe, it, expect } from 'vitest'
import {
  extrairMensagensArquivoWhatsApp,
  extrairCamposSolicitacao,
  parseConversaWhatsApp,
  reconciliarCabecalhoCorpo,
  analisarCabecalhoAutor,
  sugerirIndustriaOficial,
} from '../whatsappParser'
import { processarZipWhatsApp } from '../zipReader'

/**
 * Helper para construir um arquivo ZIP válido em memória (STORE, sem compressão) para os testes
 */
function criarZipEmMemoria(
  arquivos: Array<{ nome: string; conteudo: string | Uint8Array }>,
): Uint8Array {
  const encoder = new TextEncoder()
  const entries = arquivos.map((a) => {
    const data = typeof a.conteudo === 'string' ? encoder.encode(a.conteudo) : a.conteudo
    const nameBytes = encoder.encode(a.nome)
    return { nameBytes, data }
  })

  // Tabela CRC32 simples
  const crcTable = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crcTable[i] = c
  }
  function calcCrc32(bytes: Uint8Array): number {
    let crc = 0xffffffff
    for (let i = 0; i < bytes.length; i++) {
      crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
    }
    return (crc ^ 0xffffffff) >>> 0
  }

  const localParts: Uint8Array[] = []
  const cdParts: Uint8Array[] = []
  let offset = 0

  for (const entry of entries) {
    const crc = calcCrc32(entry.data)
    const localHeader = new Uint8Array(30 + entry.nameBytes.length)
    const lv = new DataView(localHeader.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(4, 20, true)
    lv.setUint16(6, 0, true)
    lv.setUint16(8, 0, true) // STORE
    lv.setUint16(10, 0, true)
    lv.setUint16(12, 0, true)
    lv.setUint32(14, crc, true)
    lv.setUint32(18, entry.data.length, true)
    lv.setUint32(22, entry.data.length, true)
    lv.setUint16(26, entry.nameBytes.length, true)
    lv.setUint16(28, 0, true)
    localHeader.set(entry.nameBytes, 30)

    localParts.push(localHeader, entry.data)

    const cdHeader = new Uint8Array(46 + entry.nameBytes.length)
    const cv = new DataView(cdHeader.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true)
    cv.setUint16(6, 20, true)
    cv.setUint16(8, 0, true)
    cv.setUint16(10, 0, true) // STORE
    cv.setUint16(12, 0, true)
    cv.setUint16(14, 0, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, entry.data.length, true)
    cv.setUint32(24, entry.data.length, true)
    cv.setUint16(28, entry.nameBytes.length, true)
    cv.setUint16(30, 0, true)
    cv.setUint16(32, 0, true)
    cv.setUint16(34, 0, true)
    cv.setUint16(36, 0, true)
    cv.setUint32(38, 0, true)
    cv.setUint32(42, offset, true)
    cdHeader.set(entry.nameBytes, 46)

    cdParts.push(cdHeader)

    offset += localHeader.length + entry.data.length
  }

  const cdOffset = offset
  const cdSize = cdParts.reduce((acc, p) => acc + p.length, 0)

  const eocd = new Uint8Array(22)
  const ev = new DataView(eocd.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(4, 0, true)
  ev.setUint16(6, 0, true)
  ev.setUint16(8, entries.length, true)
  ev.setUint16(10, entries.length, true)
  ev.setUint32(12, cdSize, true)
  ev.setUint32(16, cdOffset, true)
  ev.setUint16(20, 0, true)

  const totalLen = cdOffset + cdSize + eocd.length
  const zip = new Uint8Array(totalLen)
  let ptr = 0
  for (const p of [...localParts, ...cdParts, eocd]) {
    zip.set(p, ptr)
    ptr += p.length
  }

  return zip
}

describe('Testes Específicos dos Cenários Reais A–J — Exportação WhatsApp', () => {
  // -------------------------------------------------------------
  // CENÁRIO A: "Produto, v e Q:" com itens empilhados
  // -------------------------------------------------------------
  it('CENÁRIO A — "Produto, v e Q:" com itens empilhados e validades intercaladas deve gerar 3 itens separados', () => {
    const texto = `TROCA / SOLICITAÇÃO
Loja: Supermercado 306
Indústria: Frutap
Produto, v e Q:
57un Fermentado de 75g natural
05/10
01un iogurte de morango com leite condensado
29/09
02un pudim
02/10`

    const campos = extrairCamposSolicitacao(texto)
    expect(campos.itensExtraidos.length).toBe(3)

    // Item 1: 57, Fermentado de 75g natural, 05/10
    expect(campos.itensExtraidos[0].quantidadeInformada).toBe(57)
    expect(campos.itensExtraidos[0].textoProdutoInformado).toBe('Fermentado de 75g natural')
    expect(campos.itensExtraidos[0].validadeInformada).toBe('2026-10-05')

    // Item 2: 1, iogurte de morango com leite condensado, 29/09
    expect(campos.itensExtraidos[1].quantidadeInformada).toBe(1)
    expect(campos.itensExtraidos[1].textoProdutoInformado).toBe(
      'iogurte de morango com leite condensado',
    )
    expect(campos.itensExtraidos[1].validadeInformada).toBe('2026-09-29')

    // Item 3: 2, pudim, 02/10
    expect(campos.itensExtraidos[2].quantidadeInformada).toBe(2)
    expect(campos.itensExtraidos[2].textoProdutoInformado).toBe('pudim')
    expect(campos.itensExtraidos[2].validadeInformada).toBe('2026-10-02')
  })

  // -------------------------------------------------------------
  // CENÁRIO B: Produtos dentro do campo Quantidade
  // -------------------------------------------------------------
  it('CENÁRIO B — Produtos listados dentro do campo Quantidade: devem gerar 7 itens e validade ausente', () => {
    const texto = `TROCA / SOLICITAÇÃO
Loja: Loja 115
Indústria: Frutap
Produto: frutap
Quantidade:
44 bandeja de morango
4 sobremesa de chocolate
2 frutapinho
4 copo de natural
2 litros de salada de fruta
1 fermentado
1 litros de morango`

    const campos = extrairCamposSolicitacao(texto)
    expect(campos.itensExtraidos.length).toBe(7)

    expect(campos.itensExtraidos[0].quantidadeInformada).toBe(44)
    expect(campos.itensExtraidos[0].textoProdutoInformado).toBe('bandeja de morango')
    expect(campos.itensExtraidos[0].validadeAusente).toBe(true)

    expect(campos.itensExtraidos[1].quantidadeInformada).toBe(4)
    expect(campos.itensExtraidos[1].textoProdutoInformado).toBe('sobremesa de chocolate')

    expect(campos.itensExtraidos[2].quantidadeInformada).toBe(2)
    expect(campos.itensExtraidos[2].textoProdutoInformado).toBe('frutapinho')

    expect(campos.itensExtraidos[3].quantidadeInformada).toBe(4)
    expect(campos.itensExtraidos[3].textoProdutoInformado).toBe('copo de natural')

    expect(campos.itensExtraidos[4].quantidadeInformada).toBe(2)
    expect(campos.itensExtraidos[4].textoProdutoInformado).toBe('litros de salada de fruta')

    expect(campos.itensExtraidos[5].quantidadeInformada).toBe(1)
    expect(campos.itensExtraidos[5].textoProdutoInformado).toBe('fermentado')

    expect(campos.itensExtraidos[6].quantidadeInformada).toBe(1)
    expect(campos.itensExtraidos[6].textoProdutoInformado).toBe('litros de morango')
  })

  // -------------------------------------------------------------
  // CENÁRIO C: Listas separadas por barra com correspondência clara
  // -------------------------------------------------------------
  it('CENÁRIO C — Listas separadas por barra 1:1 devem associar 2 itens corretamente', () => {
    const texto = `TROCA / SOLICITAÇÃO
Loja: Hiper 200
Indústria: Frutap
Produto:
frutap salada de frutas / marga com leite
Quantidade:
4 uni / 6 uni`

    const campos = extrairCamposSolicitacao(texto)
    expect(campos.ambiguidadePosicional).toBe(false)
    expect(campos.itensExtraidos.length).toBe(2)

    expect(campos.itensExtraidos[0].textoProdutoInformado).toBe('frutap salada de frutas')
    expect(campos.itensExtraidos[0].quantidadeInformada).toBe(4)

    expect(campos.itensExtraidos[1].textoProdutoInformado).toBe('marga com leite')
    expect(campos.itensExtraidos[1].quantidadeInformada).toBe(6)
  })

  // -------------------------------------------------------------
  // CENÁRIO D: Positional ambíguo (contagens diferentes enviadas para revisão)
  // -------------------------------------------------------------
  it('CENÁRIO D — Produto A / B / C com Quantidade 4 / 6 deve acusar ambiguidade posicional para revisão humana', () => {
    const texto = `TROCA / SOLICITAÇÃO
Loja: Hiper 200
Indústria: Frutap
Produto:
A / B / C
Quantidade:
4 / 6`

    const campos = extrairCamposSolicitacao(texto)
    expect(campos.ambiguidadePosicional).toBe(true)
    expect(campos.itensExtraidos.length).toBe(3)
    expect(campos.itensExtraidos[0].precisaRevisaoItem).toBe(true)
  })

  // -------------------------------------------------------------
  // CENÁRIO E: Variações de escrita de indústria
  // -------------------------------------------------------------
  it('CENÁRIO E — Variação "DItália" deve sugerir "MASSAS D\'ITÁLIA" sem criar nova indústria', () => {
    const industriasCadastradas = [
      { id: 'ind_1', nome: "MASSAS D'ITÁLIA" },
      { id: 'ind_2', nome: 'FRUTAP' },
    ]

    const sug1 = sugerirIndustriaOficial('DItália', industriasCadastradas)
    expect(sug1.segura).toBe(true)
    expect(sug1.industriaNomeOficial).toBe("MASSAS D'ITÁLIA")

    const sug2 = sugerirIndustriaOficial('frutap', industriasCadastradas)
    expect(sug2.segura).toBe(true)
    expect(sug2.industriaNomeOficial).toBe('FRUTAP')

    const sug3 = sugerirIndustriaOficial('parmissimo', [{ id: 'ind_3', nome: 'PARMÍSSIMO' }])
    expect(sug3.segura).toBe(true)
    expect(sug3.industriaNomeOficial).toBe('PARMÍSSIMO')
  })

  // -------------------------------------------------------------
  // CENÁRIOS F & G: Reconciliação Cabeçalho × Corpo
  // -------------------------------------------------------------
  it('CENÁRIO F — Cabeçalho "Analice loja 260" e corpo "Loja: 260" devem registrar consistência', () => {
    const rec = reconciliarCabecalhoCorpo('Analice loja 260', 'Loja: 260', 'Analice')
    expect(rec.consistenciaLoja).toBe(true)
    expect(rec.divergenciaLoja).toBe(false)
    expect(rec.codigoLojaCabecalho).toBe('260')
    expect(rec.codigoLojaCorpo).toBe('260')
  })

  it('CENÁRIO G — Cabeçalho "loja 260" e corpo "Loja: 405" devem registrar divergência clara para revisão humana', () => {
    const rec = reconciliarCabecalhoCorpo('Analice loja 260', 'Loja: 405', 'Analice')
    expect(rec.divergenciaLoja).toBe(true)
    expect(rec.consistenciaLoja).toBe(false)
    expect(rec.divergenciaLojaMensagem).toContain('Divergência detectada')
    expect(rec.divergenciaLojaMensagem).toContain('260')
    expect(rec.divergenciaLojaMensagem).toContain('405')
  })

  it('CENÁRIO F/G (Adicional) — Análise de cabeçalhos de promotores com traço e número', () => {
    expect(analisarCabecalhoAutor('Cerlys - 306')).toEqual({
      promotorSugerido: 'Cerlys',
      codigoLojaSugerido: '306',
      lojaTexto: 'Loja 306',
    })
    expect(analisarCabecalhoAutor('Henrique - 825')).toEqual({
      promotorSugerido: 'Henrique',
      codigoLojaSugerido: '825',
      lojaTexto: 'Loja 825',
    })
    expect(analisarCabecalhoAutor('Cenny 160')).toEqual({
      promotorSugerido: 'Cenny',
      codigoLojaSugerido: '160',
      lojaTexto: 'Loja 160',
    })
  })

  // -------------------------------------------------------------
  // CENÁRIO H: "<imagem ocultada>"
  // -------------------------------------------------------------
  it('CENÁRIO H — "<imagem ocultada>" deve registrar existência de mídia mas NÃO marcar evidência recebida', async () => {
    const conversaComOcultada = `
[22/09/2026, 15:00:00] João: TROCA / SOLICITAÇÃO
Loja: Loja 115
Indústria: Frutap
Produto: Requeijão Tradicional 200g
Quantidade: 3
Validade: 25/09/2026
[22/09/2026, 15:00:05] João: <imagem ocultada>
`
    const res = await parseConversaWhatsApp(conversaComOcultada)
    expect(res.solicitacoes.length).toBe(1)
    const sol = res.solicitacoes[0] as unknown as { temMidiaOcultada: boolean }
    expect(sol.temMidiaOcultada).toBe(true)
    // Nenhuma evidência com arquivo físico real
    expect(res.solicitacoes[0].evidenciasDisponiveis.filter((e) => e.arquivo).length).toBe(0)
    expect(res.resumo.comMidiaOcultada).toBe(1)
  })

  // -------------------------------------------------------------
  // CENÁRIO I: ZIP com mídia real
  // -------------------------------------------------------------
  it('CENÁRIO I — ZIP contendo conversa e mídia real deve permitir associação com contexto seguro', async () => {
    const chatTxt = `
[22/09/2026, 16:00:00] Carlos: TROCA / SOLICITAÇÃO
Loja: Loja 300
Indústria: Frutap
Produto: Iogurte Morango 1L
Quantidade: 10
Validade: 30/09/2026
Foto: foto_troca_300.jpg
[22/09/2026, 16:00:10] Carlos: <arquivo anexado: foto_troca_300.jpg>
`
    const zipBytes = criarZipEmMemoria([
      { nome: '_chat.txt', conteudo: chatTxt },
      { nome: 'foto_troca_300.jpg', conteudo: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]) },
    ])

    const pacote = await processarZipWhatsApp(zipBytes)
    expect(pacote.arquivoConversaNome).toBe('_chat.txt')
    expect(pacote.midias.length).toBe(1)
    expect(pacote.midias[0].nome).toBe('foto_troca_300.jpg')

    const res = await parseConversaWhatsApp(
      pacote.arquivoConversaConteudo,
      new Set(),
      pacote.midias.map((m) => ({ nome: m.nome, arquivo: m.blob })),
    )

    expect(res.solicitacoes.length).toBe(1)
    const sol = res.solicitacoes[0]
    expect(sol.evidenciasDisponiveis.length).toBe(1)
    expect(sol.evidenciasDisponiveis[0].nome).toBe('foto_troca_300.jpg')
    expect(sol.evidenciasDisponiveis[0].segura).toBe(true)
    expect(sol.evidenciasDisponiveis[0].arquivo).toBeDefined()
  })

  // -------------------------------------------------------------
  // CENÁRIO J: Reimportação do mesmo ZIP -> Zero solicitações duplicadas
  // -------------------------------------------------------------
  it('CENÁRIO J — Reimportação do mesmo ZIP não pode gerar solicitações duplicadas (Zero novas)', async () => {
    const chatTxt = `
[23/09/2026, 10:00:00] Marcos: TROCA / SOLICITAÇÃO
Loja: Loja 500
Indústria: Frutap
Produto: Manteiga 200g
Quantidade: 5
Validade: 01/10/2026
`
    const zipBytes = criarZipEmMemoria([{ nome: 'chat.txt', conteudo: chatTxt }])
    const pacote = await processarZipWhatsApp(zipBytes)

    // 1ª importação
    const res1 = await parseConversaWhatsApp(pacote.arquivoConversaConteudo)
    expect(res1.solicitacoes.length).toBe(1)
    expect(res1.mensagensNovas).toBe(1)
    expect(res1.mensagensConhecidas).toBe(0)

    // Coleta dos hashes determinísticos wmsg_xxx
    const hashesConhecidos = new Set(res1.todosHashesMensagens)

    // 2ª importação do mesmo ZIP
    const res2 = await parseConversaWhatsApp(pacote.arquivoConversaConteudo, hashesConhecidos)
    expect(res2.solicitacoes.length).toBe(0) // ZERO solicitações duplicadas!
    expect(res2.mensagensNovas).toBe(0)
    expect(res2.mensagensConhecidas).toBe(1)
  })

  // -------------------------------------------------------------
  // Teste de seleção única quando existirem TXT e MD no mesmo ZIP
  // -------------------------------------------------------------
  it('Deve selecionar uma ÚNICA fonte principal segura (.txt) quando o ZIP contiver TXT e MD', async () => {
    const zipBytes = criarZipEmMemoria([
      { nome: 'README.md', conteudo: '# Documentação da exportação' },
      { nome: '_chat.txt', conteudo: '[24/09/2026, 09:00:00] Promotor: TROCA / SOLICITAÇÃO...' },
    ])

    const pacote = await processarZipWhatsApp(zipBytes)
    expect(pacote.arquivoConversaNome).toBe('_chat.txt')
    expect(pacote.formatoConversa).toBe('txt')
    expect(pacote.arquivoConversaConteudo).toContain('[24/09/2026')
  })
})
