import { describe, it, expect } from 'vitest'
import { parseConversaWhatsApp, extrairMensagensArquivoWhatsApp } from '../whatsappParser'
import type { SolicitacaoIdentificadaWhatsApp } from '@/types/devolucoes'

describe('Suíte Obrigatória — Recuperação de Mensagens Legadas (Cenários A–G)', () => {
  // Conversa com mensagem estruturada contendo solicitação operacional
  const conversaMsgSolicitacao = `[10/05/2026, 08:30:00] Carlos Promotor: TROCA / SOLICITAÇÃO
Loja: Supermercado Alvorada 115
Indústria: Massas D'Itália
Produto: Ravioli de Queijo 500g
Quantidade: 10
Validade: 25/09/2026
Motivo: Vencimento próximo
O que está sendo solicitado: Autorização de troca`

  // Conversa comum de bom dia / conversa informal (não é solicitação)
  const conversaMsgComum = `[10/05/2026, 08:15:00] Carlos Promotor: Bom dia pessoal, bom trabalho a todos hoje!`

  // Conversa mista com 4 mensagens
  const conversaMista = `[10/05/2026, 08:00:00] Carlos Promotor: TROCA / SOLICITAÇÃO
Loja: Loja 101 Centro
Indústria: Frutap
Produto: Iogurte Morango 1L
Quantidade: 12
Validade: 30/09/2026
[10/05/2026, 08:05:00] Marcos Repositor: TROCA / SOLICITAÇÃO
Loja: Loja 202 Norte
Indústria: Massas D'Itália
Produto: Capeletti Carne 400g
Quantidade: 8
Validade: 15/10/2026
[10/05/2026, 08:10:00] Julia Promotora: TROCA / SOLICITAÇÃO
Loja: Loja 303 Sul
Indústria: Frutap
Produto: Requeijão Cremoso 200g
Quantidade: 5
Validade: 20/10/2026
[10/05/2026, 08:15:00] Roberto: TROCA / SOLICITAÇÃO
Loja: Loja 404 Leste
Indústria: Frutap
Produto: Bebida Láctea 900ml
Quantidade: 20
Validade: 25/10/2026`

  /**
   * CENÁRIO A: Legado real: mensagem existe na deduplicação (hash conhecido),
   * sem registro em devolucoes_solicitacoes_importadas, contém solicitação.
   * -> Continua conhecida (não vira nova), é reavaliada pelo parser,
   * -> Solicitação criada como Pendente de revisão (estadoOperacional = 'pendente_revisao'),
   * -> Marcada como foiRecuperada = true,
   * -> Resumo reporta solicitacoesRecuperadas = 1.
   */
  it('Cenário A — Legado real: conhecida sem estado persistido mas com solicitação deve ser recuperada para revisão', async () => {
    const msgs = extrairMensagensArquivoWhatsApp(conversaMsgSolicitacao)
    expect(msgs.length).toBe(1)
    const hash = msgs[0].hashDeterminista

    // Mensagem existe na deduplicação (conhecida)
    const hashesConhecidos = new Set([hash])
    // Sem registro em devolucoes_solicitacoes_importadas (mapa vazio)
    const mapaConhecidasVazio = new Map()
    // Sem vínculo com caso existente (mapa vazio)
    const mapaVinculosCasosVazio = new Map()

    const res = await parseConversaWhatsApp(
      conversaMsgSolicitacao,
      hashesConhecidos,
      [],
      [],
      mapaConhecidasVazio,
      mapaVinculosCasosVazio,
    )

    // Continua conhecida, NÃO é nova
    expect(res.mensagensConhecidas).toBe(1)
    expect(res.mensagensNovas).toBe(0)

    // Solicitação recuperada na fila de revisão
    expect(res.solicitacoes.length).toBe(1)
    const sol = res.solicitacoes[0]
    expect(sol.id).toBe(`sol_${hash}`)
    expect(sol.estadoOperacional).toBe('pendente_revisao')
    expect(sol.statusRevisao).toBe('pendente')
    expect(sol.foiRecuperada).toBe(true)

    // Resumo indica recuperação
    expect(res.resumo.solicitacoesRecuperadas).toBe(1)
    expect(res.resumo.solicitacoesPendentes).toBe(1)
  })

  /**
   * CENÁRIO B: Conhecida com estado Pendente previamente persistido.
   * -> Não duplicar, continuar pendente com dados preservados.
   */
  it('Cenário B — Conhecida com estado Pendente previamente persistido não deve duplicar e continuar pendente', async () => {
    const msgs = extrairMensagensArquivoWhatsApp(conversaMsgSolicitacao)
    const hash = msgs[0].hashDeterminista
    const solId = `sol_${hash}`

    const hashesConhecidos = new Set([hash])
    const mapaConhecidas = new Map<string, any>()
    mapaConhecidas.set(solId, {
      solicitacaoId: solId,
      rawMensagemId: msgs[0].id,
      estadoOperacional: 'pendente_revisao',
      foiRecuperada: false,
    })

    const res = await parseConversaWhatsApp(
      conversaMsgSolicitacao,
      hashesConhecidos,
      [],
      [],
      mapaConhecidas,
    )

    expect(res.mensagensConhecidas).toBe(1)
    expect(res.mensagensNovas).toBe(0)
    expect(res.solicitacoes.length).toBe(1)

    const sol = res.solicitacoes[0]
    expect(sol.estadoOperacional).toBe('pendente_revisao')
    expect(sol.statusRevisao).toBe('pendente')
  })

  /**
   * CENÁRIO C: Conhecida com estado Processada e vinculada a Caso.
   * -> Não voltar para revisão, não criar novo Caso (res.solicitacoes vazia para revisão).
   * -> Também testar conhecida sem estado, mas com vínculo seguro em devolucoes_casos.
   */
  it('Cenário C — Conhecida com estado Processada ou vinculada a Caso não deve voltar para revisão', async () => {
    const msgs = extrairMensagensArquivoWhatsApp(conversaMsgSolicitacao)
    const hash = msgs[0].hashDeterminista
    const solId = `sol_${hash}`
    const hashesConhecidos = new Set([hash])

    // Subcaso C1: Estado já persistido como processada
    const mapaProcessada = new Map<string, any>()
    mapaProcessada.set(solId, {
      solicitacaoId: solId,
      rawMensagemId: msgs[0].id,
      estadoOperacional: 'processada',
      casoCriadoId: 'caso_123',
      casoCriadoCodigo: 'DEV-2026-0001',
    })

    const res1 = await parseConversaWhatsApp(
      conversaMsgSolicitacao,
      hashesConhecidos,
      [],
      [],
      mapaProcessada,
    )

    expect(res1.mensagensConhecidas).toBe(1)
    expect(res1.solicitacoes.length).toBe(0) // Não entra na fila de revisão ativa
    expect(res1.resumo.possiveisSolicitacoes).toBe(1) // Contada como solicitação já existente

    // Subcaso C2: Sem estado em devolucoes_solicitacoes_importadas, mas com vínculo seguro em devolucoes_casos
    const mapaSemEstado = new Map()
    const mapaVinculoCaso = new Map<string, { casoId: string; casoCodigo: string }>()
    mapaVinculoCaso.set(solId, { casoId: 'caso_999', casoCodigo: 'DEV-2026-0099' })

    const res2 = await parseConversaWhatsApp(
      conversaMsgSolicitacao,
      hashesConhecidos,
      [],
      [],
      mapaSemEstado,
      mapaVinculoCaso,
    )

    expect(res2.mensagensConhecidas).toBe(1)
    expect(res2.solicitacoes.length).toBe(0) // Trata como já vinculada / processada
    expect(res2.resumo.possiveisSolicitacoes).toBe(1)
  })

  /**
   * CENÁRIO D: Conhecida com estado Ignorada.
   * -> Continuar ignorada (não reabrir automaticamente).
   */
  it('Cenário D — Conhecida com estado Ignorada deve continuar ignorada', async () => {
    const msgs = extrairMensagensArquivoWhatsApp(conversaMsgSolicitacao)
    const hash = msgs[0].hashDeterminista
    const solId = `sol_${hash}`
    const hashesConhecidos = new Set([hash])

    const mapaIgnorada = new Map<string, any>()
    mapaIgnorada.set(solId, {
      solicitacaoId: solId,
      rawMensagemId: msgs[0].id,
      estadoOperacional: 'ignorada',
      ignoradoPor: 'Operador Teste',
      ignoradoEm: '2026-05-10T09:00:00Z',
    })

    const res = await parseConversaWhatsApp(
      conversaMsgSolicitacao,
      hashesConhecidos,
      [],
      [],
      mapaIgnorada,
    )

    expect(res.mensagensConhecidas).toBe(1)
    expect(res.solicitacoes.length).toBe(1)
    const sol = res.solicitacoes[0]
    expect(sol.estadoOperacional).toBe('ignorada')
    expect(sol.statusRevisao).toBe('ignorada')
    expect(sol.ignoradoPor).toBe('Operador Teste')
  })

  /**
   * CENÁRIO E: Conhecida sem estado, reanálise não identifica solicitação (conversa comum).
   * -> Não inventar solicitação, descartar silenciosamente (solicitacoes = 0).
   */
  it('Cenário E — Conhecida sem estado onde a reanálise não identifica solicitação não deve inventar solicitação', async () => {
    const msgs = extrairMensagensArquivoWhatsApp(conversaMsgComum)
    const hash = msgs[0].hashDeterminista
    const hashesConhecidos = new Set([hash])

    const res = await parseConversaWhatsApp(
      conversaMsgComum,
      hashesConhecidos,
      [],
      [],
      new Map(),
      new Map(),
    )

    expect(res.mensagensConhecidas).toBe(1)
    expect(res.mensagensNovas).toBe(0)
    expect(res.solicitacoes.length).toBe(0) // Conversa comum descartada sem inventar nada
    expect(res.resumo.possiveisSolicitacoes).toBe(0)
    expect(res.resumo.solicitacoesRecuperadas).toBe(0)
  })

  /**
   * CENÁRIO F: Idempotência: conhecida sem estado, reanálise recupera solicitação.
   * -> Na primeira importação: recuperada como pendente_revisao.
   * -> Simulando persistência na Caixa (agora existe no mapa persistido): reimportar novamente.
   * -> Na segunda importação: usa o estado persistido normal, não reconstrói cópia adicional.
   */
  it('Cenário F — Idempotência: reimportar após recuperação usa o estado persistido e não reconstrói', async () => {
    const msgs = extrairMensagensArquivoWhatsApp(conversaMsgSolicitacao)
    const hash = msgs[0].hashDeterminista
    const solId = `sol_${hash}`
    const hashesConhecidos = new Set([hash])

    // 1ª importação: conhecida legada sem estado
    const res1 = await parseConversaWhatsApp(
      conversaMsgSolicitacao,
      hashesConhecidos,
      [],
      [],
      new Map(),
      new Map(),
    )

    expect(res1.solicitacoes.length).toBe(1)
    expect(res1.solicitacoes[0].foiRecuperada).toBe(true)
    expect(res1.resumo.solicitacoesRecuperadas).toBe(1)

    // Simula a persistência gerada pela 1ª importação no backend
    const mapaPersistidoAposPrimeira = new Map<string, any>()
    mapaPersistidoAposPrimeira.set(solId, {
      solicitacaoId: solId,
      rawMensagemId: msgs[0].id,
      estadoOperacional: 'pendente_revisao',
      foiRecuperada: false, // Uma vez persistida na fila regular, reimportações usam o estado normal
    })

    // 2ª importação com o estado persistido
    const res2 = await parseConversaWhatsApp(
      conversaMsgSolicitacao,
      hashesConhecidos,
      [],
      [],
      mapaPersistidoAposPrimeira,
      new Map(),
    )

    expect(res2.solicitacoes.length).toBe(1)
    expect(res2.solicitacoes[0].id).toBe(solId)
    // Não é mais contada como reconstruída na rodada atual
    expect(res2.resumo.solicitacoesRecuperadas).toBe(0)
  })

  /**
   * CENÁRIO G: Arquivo misto contendo:
   * 1. Legada sem estado (recuperada para revisão)
   * 2. Conhecida com estado Processada e vinculada a Caso (preservada processada, fora da fila)
   * 3. Conhecida com estado Pendente (preservada pendente)
   * 4. Mensagem Nova (nova na fila)
   */
  it('Cenário G — Arquivo misto trata cada mensagem conforme seu próprio estado', async () => {
    const msgs = extrairMensagensArquivoWhatsApp(conversaMista)
    expect(msgs.length).toBe(4)

    const hash0 = msgs[0].hashDeterminista // Legada sem estado
    const hash1 = msgs[1].hashDeterminista // Conhecida Processada
    const hash2 = msgs[2].hashDeterminista // Conhecida Pendente
    // msgs[3] não está nos hashes conhecidos -> Nova

    const hashesConhecidos = new Set([hash0, hash1, hash2])

    const mapaConhecidas = new Map<string, any>()
    // msgs[0]: sem registro no mapa (legado)
    // msgs[1]: processada
    mapaConhecidas.set(`sol_${hash1}`, {
      solicitacaoId: `sol_${hash1}`,
      rawMensagemId: msgs[1].id,
      estadoOperacional: 'processada',
      casoCriadoId: 'caso_abc',
    })
    // msgs[2]: pendente
    mapaConhecidas.set(`sol_${hash2}`, {
      solicitacaoId: `sol_${hash2}`,
      rawMensagemId: msgs[2].id,
      estadoOperacional: 'pendente_revisao',
    })

    const res = await parseConversaWhatsApp(
      conversaMista,
      hashesConhecidos,
      [],
      [],
      mapaConhecidas,
      new Map(),
    )

    // Contadores de mensagens
    expect(res.totalMensagens).toBe(4)
    expect(res.mensagensConhecidas).toBe(3)
    expect(res.mensagensNovas).toBe(1)

    // Solicitações na fila:
    // msgs[0]: recuperada (pendente)
    // msgs[1]: processada (fora da fila de revisão)
    // msgs[2]: pendente (continua pendente)
    // msgs[3]: nova (entra na fila como nova)
    expect(res.solicitacoes.length).toBe(3)

    const sol0 = res.solicitacoes.find((s) => s.id === `sol_${hash0}`)
    expect(sol0).toBeDefined()
    expect(sol0?.foiRecuperada).toBe(true)
    expect(sol0?.estadoOperacional).toBe('pendente_revisao')

    const sol1 = res.solicitacoes.find((s) => s.id === `sol_${hash1}`)
    expect(sol1).toBeUndefined() // Processada não entra na fila ativa

    const sol2 = res.solicitacoes.find((s) => s.id === `sol_${hash2}`)
    expect(sol2).toBeDefined()
    expect(sol2?.estadoOperacional).toBe('pendente_revisao')

    const sol3 = res.solicitacoes.find((s) => s.id === `sol_${msgs[3].hashDeterminista}`)
    expect(sol3).toBeDefined()
    expect(sol3?.estadoOperacional).toBe('nova')

    // Resumo de importação
    expect(res.resumo.solicitacoesRecuperadas).toBe(1)
    expect(res.resumo.solicitacoesNovas).toBe(1)
    expect(res.resumo.solicitacoesPendentes).toBe(2)
  })

  /**
   * Simulação do caso real do usuário:
   * 49 mensagens conhecidas na deduplicação, 0 novas, sem estados persistidos em devolucoes_solicitacoes_importadas.
   * Se o arquivo contiver N solicitações operacionais, NENHUMA é descartada silenciosamente:
   * todas voltam para a fila como Pendente de revisão.
   */
  it('Caso Real do Usuário — 49 mensagens conhecidas, 0 novas, sem estados persistidos recupera solicitações operacionais', async () => {
    // Gerar 49 mensagens (40 conversas comuns e 9 solicitações estruturadas)
    const linhas: string[] = []
    for (let i = 1; i <= 40; i++) {
      linhas.push(
        `[10/05/2026, 08:${(i % 50).toString().padStart(2, '0')}:00] Promotor ${i}: Bom dia, registrando entrada no posto de trabalho ${i}.`,
      )
    }
    for (let i = 1; i <= 9; i++) {
      linhas.push(`[10/05/2026, 09:${i.toString().padStart(2, '0')}:00] Promotor ${i}: TROCA / SOLICITAÇÃO
Loja: Loja ${100 + i}
Indústria: Frutap
Produto: Produto Teste ${i}
Quantidade: ${i * 2}
Validade: 30/10/2026
Motivo: Validade vencendo`)
    }

    const conversa49 = linhas.join('\n')
    const msgs = extrairMensagensArquivoWhatsApp(conversa49)
    expect(msgs.length).toBe(49)

    // Todas as 49 já conhecidas na deduplicação
    const hashesConhecidos = new Set(msgs.map((m) => m.hashDeterminista))
    expect(hashesConhecidos.size).toBe(49)

    // Sem estados persistidos (banco legado anterior à migração 0034)
    const mapaConhecidasVazio = new Map()

    const res = await parseConversaWhatsApp(
      conversa49,
      hashesConhecidos,
      [],
      [],
      mapaConhecidasVazio,
      new Map(),
    )

    // Comportamento esperado:
    expect(res.totalMensagens).toBe(49)
    expect(res.mensagensConhecidas).toBe(49)
    expect(res.mensagensNovas).toBe(0)

    // Exatamente as 9 solicitações operacionais foram recuperadas para revisão
    expect(res.solicitacoes.length).toBe(9)
    expect(res.resumo.solicitacoesRecuperadas).toBe(9)
    expect(res.resumo.solicitacoesPendentes).toBe(9)

    // Nenhuma mensagem foi criada como 'nova' e nenhum caso foi gerado automaticamente
    for (const sol of res.solicitacoes) {
      expect(sol.estadoOperacional).toBe('pendente_revisao')
      expect(sol.statusRevisao).toBe('pendente')
      expect(sol.foiRecuperada).toBe(true)
      expect(sol.casoCriadoId).toBeFalsy()
    }
  })
})
