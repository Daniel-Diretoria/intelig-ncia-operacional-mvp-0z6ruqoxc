import { describe, it, expect } from 'vitest'
import {
  extrairMensagensArquivoWhatsApp,
  extrairCamposSolicitacao,
  parseConversaWhatsApp,
  gerarHashMensagem,
} from '../whatsappParser'

describe('Parser de Conversas WhatsApp — Devoluções/NF', () => {
  const conversaCompletaMock = `
[18/09/2026, 14:10:00] João Promotor: Olá equipe, segue troca
[18/09/2026, 14:10:15] João Promotor: TROCA / SOLICITAÇÃO
Data: 18/09/2026
Repositor: João Promotor
Loja: Supermercado Alvorada 115
Indústria: Massas D'Itália
Produto: Ravioli de Queijo 500g
Quantidade: 12
Validade: 25/09/2026
Motivo: Vencimento próximo
O que está sendo solicitado: Autorização de troca
Foto: anexo_ravioli.jpg
[18/09/2026, 14:10:30] João Promotor: <arquivo anexado: anexo_ravioli.jpg>
[18/09/2026, 14:15:00] Maria Supervisora: Recebido João, em análise.
`

  const conversaIncompletaMock = `
19/09/2026, 09:30 - Carlos Promotor: Bom dia
19/09/2026, 09:31 - Carlos Promotor: Loja 306 / Motivo validade
19/09/2026, 09:32 - Carlos Promotor: <arquivo anexado: foto_vencido.jpg>
`

  const conversaVariacoesMock = `
[20/09/2026, 11:00:00] Ana: solicitacao de devolucao
data: 20/09/26
promotor: Ana Paula
mercado: Loja 405 Centro
marca: Frutap
item: barrigudinho frutas vermelhas
qtd: 24
val: 30/09/2026
razao: Validade
`

  it('1. Deve extrair mensagens individuais com autor, data e conteúdo', () => {
    const msgs = extrairMensagensArquivoWhatsApp(conversaCompletaMock)
    expect(msgs.length).toBe(4)
    expect(msgs[0].autor).toBe('João Promotor')
    expect(msgs[1].conteudo).toContain('TROCA / SOLICITAÇÃO')
    expect(msgs[2].arquivoAnexo).toBe('anexo_ravioli.jpg')
  })

  it('2. Deve reconhecer mensagem completa e extrair todos os campos estruturados', () => {
    const texto = `TROCA / SOLICITAÇÃO
Data: 18/09/2026
Repositor: João Promotor
Loja: Supermercado Alvorada 115
Indústria: Massas D'Itália
Produto: Ravioli de Queijo 500g
Quantidade: 12
Validade: 25/09/2026
Motivo: Vencimento próximo
O que está sendo solicitado: Autorização de troca`

    const campos = extrairCamposSolicitacao(texto)
    expect(campos.isEstruturada).toBe(true)
    expect(campos.loja).toBe('Supermercado Alvorada 115')
    expect(campos.industria).toBe("Massas D'Itália")
    expect(campos.produto).toBe('Ravioli de Queijo 500g')
    expect(campos.quantidade).toBe(12)
    expect(campos.validade).toBe('25/09/2026')
    expect(campos.motivo).toBe('Vencimento próximo')
  })

  it('3. Deve tolerar pequenas variações de maiúsculas/minúsculas, acentos e sinônimos de campos', () => {
    const texto = `solicitacao de devolucao
data: 20/09/26
promotor: Ana Paula
mercado: Loja 405 Centro
marca: Frutap
item: iogurte morango
qtd: 24
val: 30/09/2026
razao: Validade`

    const campos = extrairCamposSolicitacao(texto)
    expect(campos.isPossivel).toBe(true)
    expect(campos.repositor).toBe('Ana Paula')
    expect(campos.loja).toBe('Loja 405 Centro')
    expect(campos.industria).toBe('Frutap')
    expect(campos.produto).toBe('iogurte morango')
    expect(campos.quantidade).toBe(24)
  })

  it('4. Mensagem incompleta deve ser identificada como POSSÍVEL SOLICITAÇÃO sem inventar campos ausentes', async () => {
    const res = await parseConversaWhatsApp(conversaIncompletaMock)
    expect(res.solicitacoes.length).toBeGreaterThan(0)

    const sol = res.solicitacoes[0]
    expect(sol.incompleta).toBe(true)
    expect(sol.camposFaltantes).toContain('Indústria')
    expect(sol.camposFaltantes).toContain('Produto')
    expect(sol.camposFaltantes).toContain('Quantidade')
    expect(sol.camposFaltantes).toContain('Validade')

    // NUNCA inventar campos ausentes
    expect(sol.industriaInformada).toBeUndefined()
    expect(sol.produtos[0].quantidadeInformada).toBe(0)
    expect(sol.produtos[0].validadeAusente).toBe(true)
  })

  it('5. Deduplicação determinística: reimportar a mesma conversa não duplica mensagens conhecidas', async () => {
    // 1ª importação
    const res1 = await parseConversaWhatsApp(conversaCompletaMock)
    expect(res1.mensagensNovas).toBe(4)
    expect(res1.mensagensConhecidas).toBe(0)

    // Coletar hashes conhecidos
    const hashes = new Set<string>()
    const msgs = extrairMensagensArquivoWhatsApp(conversaCompletaMock)
    msgs.forEach((m) => hashes.add(m.hashDeterminista))

    // 2ª importação da mesma conversa
    const res2 = await parseConversaWhatsApp(conversaCompletaMock, hashes)
    expect(res2.mensagensConhecidas).toBe(4)
    expect(res2.mensagensNovas).toBe(0)
    expect(res2.solicitacoes.length).toBe(0)
  })

  it('6. Mídia com associação segura deve ser vinculada à solicitação', async () => {
    const res = await parseConversaWhatsApp(conversaCompletaMock, new Set(), [
      { nome: 'anexo_ravioli.jpg' },
    ])

    const sol = res.solicitacoes[0]
    expect(sol.evidenciasDisponiveis.length).toBeGreaterThan(0)
    expect(sol.evidenciasDisponiveis[0].nome).toBe('anexo_ravioli.jpg')
    expect(sol.evidenciasDisponiveis[0].segura).toBe(true)
  })

  it('7. Agrupamento: mensagens da mesma loja e mesmo autor devem sugerir vinculação ao mesmo caso', async () => {
    const conversaMultiplosItens = `
[21/09/2026, 10:00:00] João: TROCA / SOLICITAÇÃO
Loja: Loja 115
Indústria: Massas D'Itália
Produto: Ravioli Queijo
Quantidade: 5
Validade: 28/09/2026
[21/09/2026, 10:02:00] João: TROCA / SOLICITAÇÃO
Loja: Loja 115
Indústria: Massas D'Itália
Produto: Capeletti Carne
Quantidade: 8
Validade: 30/09/2026
`
    const res = await parseConversaWhatsApp(conversaMultiplosItens)
    expect(res.solicitacoes.length).toBe(2)
    // Ambas devem ter o mesmo grupoCasoSugeridoId
    expect(res.solicitacoes[0].grupoCasoSugeridoId).toBe(res.solicitacoes[1].grupoCasoSugeridoId)
  })

  it('8. Exige confirmação humana antes da criação (statusRevisao inicial é sempre pendente)', async () => {
    const res = await parseConversaWhatsApp(conversaCompletaMock)
    const sol = res.solicitacoes[0]
    expect(sol.statusRevisao).toBe('pendente')
  })
})
