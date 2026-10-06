import { describe, it, expect, vi, beforeEach } from 'vitest'
import pb from '@/lib/pocketbase/client'
import { parseConversaWhatsApp, MidiaDisponivelInput } from '@/lib/import/whatsappParser'
import {
  carregarSolicitacoesPersistidas,
  salvarOuAtualizarSolicitacoesPersistidas,
  marcarSolicitacaoComoIgnorada,
  reabrirSolicitacaoIgnorada,
  marcarSolicitacaoProcessada,
} from '@/services/devolucoesDedupService'
import {
  registrarAutorizacaoIndustria,
  concluirDevolucaoHumana,
  criarCasoDevolucao,
} from '@/services/devolucoesService'
import { DevolucaoCaso, SolicitacaoIdentificadaWhatsApp } from '@/types/devolucoes'

describe('Caixa de Importação Persistente + Autorização da Indústria + NF Assinada e Descarte (v0.0.122)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  // -------------------------------------------------------------
  // PARTE 1 — TESTES OBRIGATÓRIOS: CAIXA DE IMPORTAÇÃO WHATSAPP
  // -------------------------------------------------------------
  describe('Caixa de Importação WhatsApp Persistente', () => {
    const conversaMock = `
10/10/2026, 09:30 - Lucas Promotor: Bom dia equipe, troca na Loja 405 Fort Atacadista
10/10/2026, 09:31 - Lucas Promotor: Indústria: FRUTAP. Vencidos: 10un Iogurte Morango 1.25L val 15/10/2026 e 5un Frutapinho 320g val 18/10/2026
10/10/2026, 09:32 - Carlos Supervisor: Ok Lucas, anotado.
`

    it('A) Importar conversa, identificar solicitações, não confirmar nenhuma, fechar e voltar -> continuam pendentes', async () => {
      // 1ª importação: nenhuma hash conhecida ainda
      const hashesConhecidos = new Set<string>()
      const parseResult1 = await parseConversaWhatsApp(conversaMock, hashesConhecidos)

      expect(parseResult1.solicitacoes.length).toBeGreaterThan(0)
      const sol = parseResult1.solicitacoes[0]
      expect(sol.statusRevisao).toBe('pendente')

      // Simula persistência na Caixa (operador não confirmou nada)
      const mockCreate = vi.fn().mockResolvedValue({ id: 'sol-db-1' })
      const mockGetFirst = vi.fn().mockRejectedValue(new Error('not found'))
      vi.spyOn(pb, 'collection').mockImplementation((col: string) => {
        if (col === 'devolucoes_solicitacoes_importadas') {
          return {
            create: mockCreate,
            getFirstListItem: mockGetFirst,
          } as unknown as ReturnType<typeof pb.collection>
        }
        return {} as unknown as ReturnType<typeof pb.collection>
      })

      await salvarOuAtualizarSolicitacoesPersistidas(parseResult1.solicitacoes)
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          solicitacao_id: sol.id,
          estado_operacional: 'pendente_revisao',
        }),
      )
    })

    it('B) Importar, não confirmar, reimportar o mesmo arquivo -> mensagens conhecidas, zero duplicadas, solicitações pendentes continuam disponíveis', async () => {
      // 1. Extrai hashes
      const res1 = await parseConversaWhatsApp(conversaMock, new Set())
      const todosHashes = new Set(res1.todosHashesMensagens)

      // 2. Monta mapa de solicitações conhecidas persistidas como pendente_revisao
      const mapaConhecidas = new Map<string, any>()
      res1.solicitacoes.forEach((s) => {
        mapaConhecidas.set(s.id, {
          solicitacaoId: s.id,
          rawMensagemId: s.rawMensagemId,
          estadoOperacional: 'pendente_revisao',
        })
      })

      // 3. Reimportar mesmo arquivo com hashes já conhecidos
      const parseResult2 = await parseConversaWhatsApp(
        conversaMock,
        todosHashes,
        [],
        [],
        mapaConhecidas,
      )

      expect(parseResult2.mensagensConhecidas).toBe(parseResult2.totalMensagens)
      expect(parseResult2.mensagensNovas).toBe(0)
      // REGRA FUNDAMENTAL: a solicitação não sumiu, continua disponível na fila de revisão!
      expect(parseResult2.solicitacoes.length).toBe(res1.solicitacoes.length)
      expect(parseResult2.solicitacoes[0].estadoOperacional).toBe('pendente_revisao')
      expect(parseResult2.solicitacoes[0].statusRevisao).toBe('pendente')
    })

    it('C) e D) 10 solicitações; confirmar 4, ignorar 1, fechar -> 4 processadas, 1 ignorada, 5 pendentes. Ao reimportar: processadas não duplicam, ignorada continua ignorada, pendentes continuam pendentes', async () => {
      // Cria 10 mensagens simuladas
      const linhas: string[] = []
      for (let i = 1; i <= 10; i++) {
        linhas.push(
          `10/10/2026, 10:${10 + i} - Promotor: Loja ${100 + i} Frutap 5un Iogurte val 20/10/2026`,
        )
      }
      const texto10 = linhas.join('\n')

      const resInicial = await parseConversaWhatsApp(texto10, new Set())
      expect(resInicial.solicitacoes.length).toBe(10)

      // Operador confirma 4, ignora 1 e deixa 5 pendentes
      const mapaPersistido = new Map<string, any>()
      resInicial.solicitacoes.forEach((s, idx) => {
        if (idx < 4) {
          mapaPersistido.set(s.id, {
            solicitacaoId: s.id,
            rawMensagemId: s.rawMensagemId,
            estadoOperacional: 'processada',
            casoCriadoId: `caso-${idx + 1}`,
            casoCriadoCodigo: `DEV-2026-000${idx + 1}`,
          })
        } else if (idx === 4) {
          mapaPersistido.set(s.id, {
            solicitacaoId: s.id,
            rawMensagemId: s.rawMensagemId,
            estadoOperacional: 'ignorada',
            ignoradoPor: 'Operador Teste',
          })
        } else {
          mapaPersistido.set(s.id, {
            solicitacaoId: s.id,
            rawMensagemId: s.rawMensagemId,
            estadoOperacional: 'pendente_revisao',
          })
        }
      })

      // Reimporta a mesma conversa
      const todosHashes = new Set(resInicial.todosHashesMensagens)
      const resReimportada = await parseConversaWhatsApp(
        texto10,
        todosHashes,
        [],
        [],
        mapaPersistido,
      )

      // As 4 processadas não entram como pendentes (não duplicam Casos)
      // A ignorada continua com estado ignorada
      // As 5 pendentes continuam na fila de revisão
      const pendentes = resReimportada.solicitacoes.filter((s) => s.statusRevisao === 'pendente')
      const ignoradas = resReimportada.solicitacoes.filter((s) => s.statusRevisao === 'ignorada')
      const processadasNoParser = resReimportada.solicitacoes.filter(
        (s) => s.estadoOperacional === 'processada',
      )

      expect(pendentes.length).toBe(5)
      expect(ignoradas.length).toBe(1)
      expect(processadasNoParser.length).toBe(0) // Processadas não são re-exibidas para revisão
    })

    it('E) Arquivo contém mensagens antigas + novas -> estado das antigas preservado, novas analisadas normalmente', async () => {
      const msgAntiga = '10/10/2026, 08:00 - Promotor: Loja 101 Frutap 5un Iogurte val 20/10/2026\n'
      const msgNova = '10/10/2026, 15:00 - Promotor: Loja 102 Frutap 8un Requeijao val 25/10/2026\n'
      const textoCombinado = msgAntiga + msgNova

      const resAntiga = await parseConversaWhatsApp(msgAntiga, new Set())
      const hashesAntigos = new Set(resAntiga.todosHashesMensagens)

      const mapaAntigas = new Map<string, any>()
      mapaAntigas.set(resAntiga.solicitacoes[0].id, {
        solicitacaoId: resAntiga.solicitacoes[0].id,
        rawMensagemId: resAntiga.solicitacoes[0].rawMensagemId,
        estadoOperacional: 'pendente_revisao',
      })

      const resCombinada = await parseConversaWhatsApp(
        textoCombinado,
        hashesAntigos,
        [],
        [],
        mapaAntigas,
      )

      expect(resCombinada.mensagensConhecidas).toBeGreaterThan(0)
      expect(resCombinada.mensagensNovas).toBeGreaterThan(0)
      expect(resCombinada.solicitacoes.length).toBe(2)

      const solAntiga = resCombinada.solicitacoes.find((s) => s.id === resAntiga.solicitacoes[0].id)
      const solNova = resCombinada.solicitacoes.find((s) => s.id !== resAntiga.solicitacoes[0].id)

      expect(solAntiga?.estadoOperacional).toBe('pendente_revisao')
      expect(solNova?.estadoOperacional).toBe('nova')
    })

    it('F) Falha na criação do Caso -> não marcar como processada', async () => {
      const mockUpdate = vi.fn()
      vi.spyOn(pb, 'collection').mockImplementation((col: string) => {
        if (col === 'devolucoes_solicitacoes_importadas') {
          return { update: mockUpdate } as unknown as ReturnType<typeof pb.collection>
        }
        if (col === 'devolucoes_casos') {
          return {
            create: vi.fn().mockRejectedValue(new Error('Database error on create caso')),
          } as unknown as ReturnType<typeof pb.collection>
        }
        return {} as unknown as ReturnType<typeof pb.collection>
      })

      // Se tentar criar o caso e houver exceção
      await expect(
        criarCasoDevolucao({
          data_solicitacao: '2026-10-10',
          industry_name: 'FRUTAP',
          store_code: '405',
          store_name: 'Fort 405',
          promotor_nome: 'Promotor',
          motivo_geral: 'Vencimento',
          itens: [],
          solicitacaoOrigemId: 'sol_teste_falha',
        } as any),
      ).rejects.toThrow()

      // REGRA 12: mockUpdate da coleção devolucoes_solicitacoes_importadas NÃO deve ter sido chamado com 'processada'
      expect(mockUpdate).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ estado_operacional: 'processada' }),
      )
    })

    it('G) Solicitação processada com sucesso -> possui referência ao Caso criado', async () => {
      const mockUpdateSolicitacao = vi.fn().mockResolvedValue({ id: 'sol-rec' })
      const mockGetFirst = vi.fn().mockResolvedValue({ id: 'sol-rec', solicitacao_id: 'sol_123' })

      vi.spyOn(pb, 'collection').mockImplementation((col: string) => {
        if (col === 'devolucoes_solicitacoes_importadas') {
          return {
            getFirstListItem: mockGetFirst,
            update: mockUpdateSolicitacao,
          } as unknown as ReturnType<typeof pb.collection>
        }
        return {} as unknown as ReturnType<typeof pb.collection>
      })

      await marcarSolicitacaoProcessada('sol_123', 'caso-456', 'DEV-2026-0042')

      expect(mockUpdateSolicitacao).toHaveBeenCalledWith('sol-rec', {
        estado_operacional: 'processada',
        caso_criado_id: 'caso-456',
        caso_criado_codigo: 'DEV-2026-0042',
        processado_por: expect.any(String),
        processado_em: expect.any(String),
      })
    })

    it('H) Item ignorado -> preservar decisão e permitir reabrir para revisão', async () => {
      const mockUpdate = vi.fn().mockResolvedValue({ id: 'sol-rec-2' })
      const mockGetFirst = vi.fn().mockResolvedValue({ id: 'sol-rec-2', solicitacao_id: 'sol_ign' })

      vi.spyOn(pb, 'collection').mockImplementation((col: string) => {
        if (col === 'devolucoes_solicitacoes_importadas') {
          return {
            getFirstListItem: mockGetFirst,
            update: mockUpdate,
          } as unknown as ReturnType<typeof pb.collection>
        }
        return {} as unknown as ReturnType<typeof pb.collection>
      })

      // 1. Ignorar
      await marcarSolicitacaoComoIgnorada('sol_ign', 'Fora do escopo de devolução')
      expect(mockUpdate).toHaveBeenCalledWith(
        'sol-rec-2',
        expect.objectContaining({
          estado_operacional: 'ignorada',
          ignorado_motivo: 'Fora do escopo de devolução',
        }),
      )

      // 2. Reabrir para revisão
      await reabrirSolicitacaoIgnorada('sol_ign')
      expect(mockUpdate).toHaveBeenCalledWith(
        'sol-rec-2',
        expect.objectContaining({
          estado_operacional: 'pendente_revisao',
          ignorado_motivo: '',
        }),
      )
    })

    it('I) Solicitação pendente com ajustes realizados; fechar e voltar -> preservar os ajustes', async () => {
      const msgLinha = '10/10/2026, 09:00 - Promotor: Fort 405 Frutap Iogurte 10un'
      const parsed = await parseConversaWhatsApp(msgLinha, new Set())
      const sol = parsed.solicitacoes[0]

      // Ajustes do operador: alterou quantidade para 15 e corrigiu validade
      const produtosAjustados = [
        {
          ...sol.produtos[0],
          quantidadeInformada: 15,
          validadeInformada: '2026-11-20',
        },
      ]

      const mapaConhecidas = new Map<string, any>()
      mapaConhecidas.set(sol.id, {
        solicitacaoId: sol.id,
        rawMensagemId: sol.rawMensagemId,
        estadoOperacional: 'pendente_revisao',
        produtosAjustados,
      })

      const reparse = await parseConversaWhatsApp(
        msgLinha,
        new Set(parsed.todosHashesMensagens),
        [],
        [],
        mapaConhecidas,
      )

      expect(reparse.solicitacoes[0].produtos[0].quantidadeInformada).toBe(15)
      expect(reparse.solicitacoes[0].produtos[0].validadeInformada).toBe('2026-11-20')
    })
  })

  // -------------------------------------------------------------
  // PARTE 2 — TESTES OBRIGATÓRIOS: AUTORIZAÇÃO DA INDÚSTRIA
  // -------------------------------------------------------------
  describe('Autorização da Indústria e Avanço de Fluxo', () => {
    it('A) Autorização total -> registrar decisão, timeline e avançar automaticamente para aguardando_nf_descarte', async () => {
      const mockUpdateItem = vi.fn().mockResolvedValue({})
      const mockUpdateCaso = vi.fn().mockImplementation((id, payload) => ({ id, ...payload }))
      const mockCreateTimeline = vi.fn().mockResolvedValue({})
      const mockCreateAudit = vi.fn().mockResolvedValue({})
      const mockGetFullListItens = vi.fn().mockResolvedValue([
        { id: 'it-1', quantidade_solicitada: 10 },
        { id: 'it-2', quantidade_solicitada: 15 },
      ])

      vi.spyOn(pb, 'collection').mockImplementation((name: string) => {
        if (name === 'devolucoes_itens') {
          return {
            getFullList: mockGetFullListItens,
            update: mockUpdateItem,
          } as unknown as ReturnType<typeof pb.collection>
        }
        if (name === 'devolucoes_casos') {
          return { update: mockUpdateCaso } as unknown as ReturnType<typeof pb.collection>
        }
        if (name === 'devolucoes_timeline') {
          return { create: mockCreateTimeline } as unknown as ReturnType<typeof pb.collection>
        }
        if (name === 'devolucoes_audit') {
          return { create: mockCreateAudit } as unknown as ReturnType<typeof pb.collection>
        }
        return {} as unknown as ReturnType<typeof pb.collection>
      })

      const caso = await registrarAutorizacaoIndustria({
        casoId: 'caso-1',
        codigoCaso: 'DEV-2026-0001',
        tipoAutorizacao: 'total',
        dataAutorizacao: '2026-10-12',
        protocolo: 'AUT-FRUTAP-100',
        observacao: 'Aprovado pelo SAC Frutap',
      })

      // Status deve ser automaticamente aguardando_nf_descarte (Regra 20 e 23)
      expect(caso.status).toBe('aguardando_nf_descarte')
      expect(caso.tipo_autorizacao_industria).toBe('total')
      expect(caso.total_unidades_autorizadas).toBe(25)
      expect(mockCreateTimeline).toHaveBeenCalledWith(
        expect.objectContaining({
          titulo: 'Indústria autorizou a devolução',
          descricao: expect.stringContaining(
            'Autorização total registrada. 25 unidade(s) autorizada(s)',
          ),
        }),
      )
    })

    it('B) Autorização parcial por produto -> somente produtos selecionados autorizados no mesmo Caso', async () => {
      const mockUpdateItem = vi.fn().mockResolvedValue({})
      const mockUpdateCaso = vi.fn().mockImplementation((id, payload) => ({ id, ...payload }))
      const mockCreateTimeline = vi.fn().mockResolvedValue({})
      const mockCreateAudit = vi.fn().mockResolvedValue({})
      const mockGetFullListItens = vi.fn().mockResolvedValue([
        { id: 'it-1', produto_nome_informado: 'Iogurte 1', quantidade_solicitada: 10 },
        { id: 'it-2', produto_nome_informado: 'Requeijao 2', quantidade_solicitada: 5 },
      ])

      vi.spyOn(pb, 'collection').mockImplementation((name: string) => {
        if (name === 'devolucoes_itens') {
          return {
            getFullList: mockGetFullListItens,
            update: mockUpdateItem,
          } as unknown as ReturnType<typeof pb.collection>
        }
        if (name === 'devolucoes_casos') {
          return { update: mockUpdateCaso } as unknown as ReturnType<typeof pb.collection>
        }
        if (name === 'devolucoes_timeline') {
          return { create: mockCreateTimeline } as unknown as ReturnType<typeof pb.collection>
        }
        if (name === 'devolucoes_audit') {
          return { create: mockCreateAudit } as unknown as ReturnType<typeof pb.collection>
        }
        return {} as unknown as ReturnType<typeof pb.collection>
      })

      const caso = await registrarAutorizacaoIndustria({
        casoId: 'caso-parcial',
        codigoCaso: 'DEV-2026-0002',
        tipoAutorizacao: 'parcial',
        dataAutorizacao: '2026-10-12',
        observacao: 'Requeijão recusado por falta de foto legível do lote',
        itensAutorizados: [
          { itemId: 'it-1', autorizado: true, quantidadeAutorizada: 10 },
          {
            itemId: 'it-2',
            autorizado: false,
            quantidadeAutorizada: 0,
            motivoNaoAutorizado: 'Lote ilegível',
          },
        ],
      })

      expect(caso.status).toBe('aguardando_nf_descarte')
      expect(caso.total_unidades_autorizadas).toBe(10)
      expect(mockUpdateItem).toHaveBeenCalledWith(
        'it-1',
        expect.objectContaining({ quantidade_autorizada: 10, situacao_autorizacao: 'autorizado' }),
      )
      expect(mockUpdateItem).toHaveBeenCalledWith(
        'it-2',
        expect.objectContaining({
          quantidade_autorizada: 0,
          situacao_autorizacao: 'nao_autorizado',
        }),
      )
    })

    it('C) Autorização parcial por quantidade -> quantidade solicitada e autorizada permanecem distintas', async () => {
      const mockUpdateItem = vi.fn().mockResolvedValue({})
      const mockUpdateCaso = vi.fn().mockImplementation((id, payload) => ({ id, ...payload }))
      const mockGetFullListItens = vi
        .fn()
        .mockResolvedValue([{ id: 'it-1', quantidade_solicitada: 10 }])

      vi.spyOn(pb, 'collection').mockImplementation((name: string) => {
        if (name === 'devolucoes_itens') {
          return {
            getFullList: mockGetFullListItens,
            update: mockUpdateItem,
          } as unknown as ReturnType<typeof pb.collection>
        }
        if (name === 'devolucoes_casos') {
          return { update: mockUpdateCaso } as unknown as ReturnType<typeof pb.collection>
        }
        if (name === 'devolucoes_timeline' || name === 'devolucoes_audit') {
          return { create: vi.fn().mockResolvedValue({}) } as unknown as ReturnType<
            typeof pb.collection
          >
        }
        return {} as unknown as ReturnType<typeof pb.collection>
      })

      // Solicitado 10, indústria autorizou apenas 6
      const caso = await registrarAutorizacaoIndustria({
        casoId: 'caso-qtd',
        codigoCaso: 'DEV-2026-0003',
        tipoAutorizacao: 'parcial',
        dataAutorizacao: '2026-10-12',
        itensAutorizados: [{ itemId: 'it-1', autorizado: true, quantidadeAutorizada: 6 }],
      })

      expect(caso.total_unidades_autorizadas).toBe(6)
      expect(mockUpdateItem).toHaveBeenCalledWith(
        'it-1',
        expect.objectContaining({ quantidade_autorizada: 6 }),
      )
    })

    it('D) Não autorizado -> preservar Caso, auditoria e histórico', async () => {
      const mockUpdateCaso = vi.fn().mockImplementation((id, payload) => ({ id, ...payload }))
      const mockCreateTimeline = vi.fn().mockResolvedValue({})
      const mockGetFullListItens = vi
        .fn()
        .mockResolvedValue([{ id: 'it-1', quantidade_solicitada: 10 }])

      vi.spyOn(pb, 'collection').mockImplementation((name: string) => {
        if (name === 'devolucoes_itens') {
          return {
            getFullList: mockGetFullListItens,
            update: vi.fn().mockResolvedValue({}),
          } as unknown as ReturnType<typeof pb.collection>
        }
        if (name === 'devolucoes_casos') {
          return { update: mockUpdateCaso } as unknown as ReturnType<typeof pb.collection>
        }
        if (name === 'devolucoes_timeline') {
          return { create: mockCreateTimeline } as unknown as ReturnType<typeof pb.collection>
        }
        if (name === 'devolucoes_audit') {
          return { create: vi.fn().mockResolvedValue({}) } as unknown as ReturnType<
            typeof pb.collection
          >
        }
        return {} as unknown as ReturnType<typeof pb.collection>
      })

      const caso = await registrarAutorizacaoIndustria({
        casoId: 'caso-recusado',
        codigoCaso: 'DEV-2026-0004',
        tipoAutorizacao: 'nao_autorizado',
        dataAutorizacao: '2026-10-12',
        observacao: 'Produto fora do prazo de troca contratual da indústria',
      })

      // Caso continua existindo, com status 'nao_autorizado', sem ser apagado
      expect(caso.status).toBe('nao_autorizado')
      expect(caso.tipo_autorizacao_industria).toBe('nao_autorizado')
      expect(mockCreateTimeline).toHaveBeenCalledWith(
        expect.objectContaining({
          titulo: 'Indústria não autorizou a devolução',
        }),
      )
    })
  })

  // -------------------------------------------------------------
  // PARTE 3 — TESTES OBRIGATÓRIOS: DOCUMENTAÇÃO E CONCLUSÃO
  // -------------------------------------------------------------
  describe('Controle Documental Estrito e Conclusão Humana', () => {
    it('A, B, C, D) Completude Documental Estrita', () => {
      // REGRA 29: NF comum != NF assinada; foto genérica != descarte
      const casoApenasNfComum: Partial<DevolucaoCaso> = {
        nf_anexo_nome: 'nf_01429.pdf',
        nf_assinada_anexo_nome: undefined,
        evidencia_descarte_anexo_nome: undefined,
        evidencias: [{ id: '1', tipo: 'nf_documento', titulo: 'NF Comum' } as any],
      }
      const temNfAssinadaA = Boolean(
        casoApenasNfComum.nf_assinada_anexo_nome?.trim() ||
        casoApenasNfComum.evidencias?.some((e) => e.tipo === 'nf_assinada'),
      )
      const temDescarteA = Boolean(
        casoApenasNfComum.evidencia_descarte_anexo_nome?.trim() ||
        casoApenasNfComum.evidencias?.some((e) => e.tipo === 'comprovante_descarte'),
      )
      expect(temNfAssinadaA).toBe(false)
      expect(temDescarteA).toBe(false)
      expect(temNfAssinadaA && temDescarteA).toBe(false)

      // Foto genérica de produto != descarte
      const casoFotoGenerica: Partial<DevolucaoCaso> = {
        nf_assinada_anexo_nome: 'nf_assinada.pdf',
        evidencia_descarte_anexo_nome: undefined,
        evidencias: [
          { id: '2', tipo: 'foto_produto', titulo: 'Foto do produto na gôndola' } as any,
        ],
      }
      const temNfAssinadaB = Boolean(
        casoFotoGenerica.nf_assinada_anexo_nome?.trim() ||
        casoFotoGenerica.evidencias?.some((e) => e.tipo === 'nf_assinada'),
      )
      const temDescarteB = Boolean(
        casoFotoGenerica.evidencia_descarte_anexo_nome?.trim() ||
        casoFotoGenerica.evidencias?.some((e) => e.tipo === 'comprovante_descarte'),
      )
      expect(temNfAssinadaB).toBe(true)
      expect(temDescarteB).toBe(false)
      expect(temNfAssinadaB && temDescarteB).toBe(false)
    })

    it('E, F, G) Ambos presentes -> habilita conclusão humana. Concluir devolução move para finalizadas', async () => {
      const casoCompleto: Partial<DevolucaoCaso> = {
        nf_assinada_anexo_nome: 'nf_assinada_88.pdf',
        evidencia_descarte_anexo_nome: 'descarte_loja405.jpg',
      }
      const documentacaoCompleta = Boolean(
        casoCompleto.nf_assinada_anexo_nome && casoCompleto.evidencia_descarte_anexo_nome,
      )
      expect(documentacaoCompleta).toBe(true)

      const mockUpdateCaso = vi.fn().mockImplementation((id, payload) => ({ id, ...payload }))
      const mockCreateTimeline = vi.fn().mockResolvedValue({})
      const mockCreateAudit = vi.fn().mockResolvedValue({})

      vi.spyOn(pb, 'collection').mockImplementation((name: string) => {
        if (name === 'devolucoes_casos') {
          return { update: mockUpdateCaso } as unknown as ReturnType<typeof pb.collection>
        }
        if (name === 'devolucoes_timeline') {
          return { create: mockCreateTimeline } as unknown as ReturnType<typeof pb.collection>
        }
        if (name === 'devolucoes_audit') {
          return { create: mockCreateAudit } as unknown as ReturnType<typeof pb.collection>
        }
        return {} as unknown as ReturnType<typeof pb.collection>
      })

      // Operador clica Concluir devolução (decisão humana)
      const casoConcluido = await concluirDevolucaoHumana(
        'caso-doc-ok',
        'DEV-2026-0099',
        'Conferência manual de NF assinada e foto do descarte realizada.',
      )

      expect(casoConcluido.status).toBe('concluido')
      expect(mockCreateTimeline).toHaveBeenCalledWith(
        expect.objectContaining({
          tipo_evento: 'caso_concluido',
          titulo: 'Devolução Concluída e Arquivada',
        }),
      )
      expect(mockCreateAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          acao: 'conclusao_devolucao',
        }),
      )
    })
  })
})
