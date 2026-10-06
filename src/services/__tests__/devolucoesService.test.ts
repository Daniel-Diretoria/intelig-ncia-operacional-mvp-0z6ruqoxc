import { describe, it, expect, vi, beforeEach } from 'vitest'
import pb from '@/lib/pocketbase/client'
import {
  criarCasoDevolucao,
  registrarDecisaoItem,
  atualizarStatusCaso,
  atualizarDadosAutorizacaoNFDescarte,
  gerarMensagemSolicitacaoIndustria,
  gerarProximoCodigoCaso,
  carregarContextoAuditoria,
} from '@/services/devolucoesService'
import { DevolucaoCaso, CriarDevolucaoCasoInput } from '@/types/devolucoes'

describe('Serviço de Devoluções / NF — Fluxo Operacional e Rastreabilidade', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('deve gerar mensagem formatada de WhatsApp agrupando dados por indústria e loja', () => {
    const mockCaso: DevolucaoCaso = {
      id: 'caso-1',
      codigo_caso: 'DEV-2026-0042',
      data_solicitacao: '2026-09-20',
      industry_name: 'FRUTAP',
      store_code: '405',
      store_name: 'FORT ATACADISTA 405',
      promotor_nome: 'Pedro Repositor',
      status: 'pronta_para_envio',
      total_itens: 2,
      total_unidades_solicitadas: 25,
      observacoes: 'Produtos retirados da gôndola conforme procedimento.',
      itens: [
        {
          id: 'item-1',
          caso_id: 'caso-1',
          produto_nome_informado: 'Iogurte Morango 1.25L',
          produto_nome_oficial: 'IOGURTE MORANGO 1.25L',
          quantidade_solicitada: 15,
          quantidade_autorizada: 15,
          validade_informada: '2026-09-26',
          decisao_humana: 'aprovado_para_industria',
          motivo_item: 'Vencido em gôndola',
        },
        {
          id: 'item-2',
          caso_id: 'caso-1',
          produto_nome_informado: 'Frutapinho Chocolate 320g',
          quantidade_solicitada: 10,
          quantidade_autorizada: 10,
          validade_ausente: true,
          decisao_humana: 'aprovado_para_industria',
          motivo_item: 'Avaria na embalagem',
        },
      ],
    }

    const msg = gerarMensagemSolicitacaoIndustria(mockCaso)
    expect(msg).toContain('*SOLICITAÇÃO DE DEVOLUÇÃO / TROCA — DIRETORIA PROMOÇÕES*')
    expect(msg).toContain('DEV-2026-0042')
    expect(msg).toContain('*Indústria:* FRUTAP')
    expect(msg).toContain('*Loja:* FORT ATACADISTA 405 (Cód. 405)')
    expect(msg).toContain('Pedro Repositor')
    expect(msg).toContain('*IOGURTE MORANGO 1.25L* — 15 un.')
    expect(msg).toContain('Validade não informada')
    expect(msg).toContain('*Total de Produtos:* 2')
    expect(msg).toContain('*Total de Unidades:* 25')
  })

  it('deve registrar decisão no item e recalcular quantidade autorizada no caso', async () => {
    // Mock PocketBase
    const mockUpdateItem = vi.fn().mockResolvedValue({
      id: 'it-1',
      decisao_humana: 'aprovado_para_industria',
      quantidade_autorizada: 12,
    })
    const mockCreateTimeline = vi.fn().mockResolvedValue({ id: 'time-1' })
    const mockCreateAudit = vi.fn().mockResolvedValue({ id: 'aud-1' })
    const mockGetFullListItens = vi
      .fn()
      .mockResolvedValue([
        { id: 'it-1', decisao_humana: 'aprovado_para_industria', quantidade_autorizada: 12 },
      ])
    const mockUpdateCaso = vi.fn().mockResolvedValue({ id: 'c-1', total_unidades_autorizadas: 12 })

    vi.spyOn(pb, 'collection').mockImplementation((name: string) => {
      if (name === 'devolucoes_itens') {
        return {
          update: mockUpdateItem,
          getFullList: mockGetFullListItens,
        } as unknown as ReturnType<typeof pb.collection>
      }
      if (name === 'devolucoes_timeline') {
        return { create: mockCreateTimeline } as unknown as ReturnType<typeof pb.collection>
      }
      if (name === 'devolucoes_audit') {
        return { create: mockCreateAudit } as unknown as ReturnType<typeof pb.collection>
      }
      if (name === 'devolucoes_casos') {
        return { update: mockUpdateCaso } as unknown as ReturnType<typeof pb.collection>
      }
      return {} as unknown as ReturnType<typeof pb.collection>
    })

    const item = await registrarDecisaoItem(
      'c-1',
      'DEV-2026-0001',
      'it-1',
      'Produto Teste',
      'aprovado_para_industria',
      'Conferido pelo supervisor',
      12,
    )

    expect(item.decisao_humana).toBe('aprovado_para_industria')
    expect(mockUpdateItem).toHaveBeenCalledWith(
      'it-1',
      expect.objectContaining({
        decisao_humana: 'aprovado_para_industria',
        quantidade_autorizada: 12,
        decisao_observacao: 'Conferido pelo supervisor',
      }),
    )
    expect(mockCreateTimeline).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo_evento: 'decisao_humana',
        titulo: 'Decisão no item: Produto Teste',
      }),
    )
    expect(mockCreateAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        acao: 'decisao_humana_item',
      }),
    )
    expect(mockUpdateCaso).toHaveBeenCalledWith('c-1', {
      total_unidades_autorizadas: 12,
    })
  })

  it('deve registrar mudança de status do caso gerando evento na timeline e auditoria', async () => {
    const mockGetOneCaso = vi.fn().mockResolvedValue({
      id: 'c-1',
      status: 'em_analise',
      codigo_caso: 'DEV-2026-0005',
    })
    const mockUpdateCaso = vi.fn().mockResolvedValue({
      id: 'c-1',
      status: 'aguardando_autorizacao_industria',
    })
    const mockCreateTimeline = vi.fn().mockResolvedValue({ id: 'time-2' })
    const mockCreateAudit = vi.fn().mockResolvedValue({ id: 'aud-2' })

    vi.spyOn(pb, 'collection').mockImplementation((name: string) => {
      if (name === 'devolucoes_casos') {
        return {
          getOne: mockGetOneCaso,
          update: mockUpdateCaso,
        } as unknown as ReturnType<typeof pb.collection>
      }
      if (name === 'devolucoes_timeline') {
        return { create: mockCreateTimeline } as unknown as ReturnType<typeof pb.collection>
      }
      if (name === 'devolucoes_audit') {
        return { create: mockCreateAudit } as unknown as ReturnType<typeof pb.collection>
      }
      return {} as unknown as ReturnType<typeof pb.collection>
    })

    const res = await atualizarStatusCaso(
      'c-1',
      'DEV-2026-0005',
      'aguardando_autorizacao_industria',
      'Aguardar retorno do setor comercial',
      'Solicitação enviada por e-mail para a indústria',
    )

    expect(res.status).toBe('aguardando_autorizacao_industria')
    expect(mockCreateTimeline).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo_evento: 'mudanca_status',
        status_anterior: 'em_analise',
        status_novo: 'aguardando_autorizacao_industria',
      }),
    )
    expect(mockCreateAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        acao: 'alteracao_status',
      }),
    )
  })

  it('deve armazenar dados de NF, protocolo de autorização e descarte', async () => {
    const mockUpdateCaso = vi.fn().mockResolvedValue({
      id: 'c-1',
      nf_numero: '09841',
      autorizacao_protocolo: 'AUT-FRUTAP-99',
    })
    const mockCreateTimeline = vi.fn().mockResolvedValue({ id: 'time-3' })
    const mockCreateAudit = vi.fn().mockResolvedValue({ id: 'aud-3' })

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

    await atualizarDadosAutorizacaoNFDescarte('c-1', 'DEV-2026-0010', {
      nf_numero: '09841',
      nf_data: '2026-09-22',
      nf_valor: 450.5,
      autorizacao_protocolo: 'AUT-FRUTAP-99',
      evidencia_descarte_anexo_nome: 'foto_descarte_loja.jpg',
    })

    expect(mockUpdateCaso).toHaveBeenCalledWith(
      'c-1',
      expect.objectContaining({
        nf_numero: '09841',
        nf_data: '2026-09-22',
        nf_valor: 450.5,
        autorizacao_protocolo: 'AUT-FRUTAP-99',
        evidencia_descarte_anexo_nome: 'foto_descarte_loja.jpg',
      }),
    )
  })

  it('carregarContextoAuditoria deve restringir histórico por indústria validada (industry_id / tradepro_client_id)', async () => {
    const mockValidadesFilter = vi.fn()
    vi.spyOn(pb, 'collection').mockImplementation((name: string) => {
      if (name === 'industry_registry') {
        return {
          getOne: vi.fn().mockResolvedValue({
            id: 'ind-frutap',
            nome: 'FRUTAP',
            tradepro_client_id: '7',
          }),
        } as unknown as ReturnType<typeof pb.collection>
      }
      if (name === 'industry_research_config') {
        return {
          getFullList: vi.fn().mockResolvedValue([
            {
              industry_id: 'ind-frutap',
              tipo_pesquisa: 'validades',
              frequencia: 'semanal',
              dia_esperado: 'terca',
              tolerancia_dias: 2,
              ativo: true,
            },
          ]),
        } as unknown as ReturnType<typeof pb.collection>
      }
      if (name === 'validades_base') {
        return {
          getList: vi.fn().mockImplementation((page, perPage, options) => {
            mockValidadesFilter(options?.filter)
            return Promise.resolve({ items: [], totalItems: 0 })
          }),
        } as unknown as ReturnType<typeof pb.collection>
      }
      if (name === 'rupturas_base') {
        return {
          getList: vi.fn().mockResolvedValue({ items: [], totalItems: 0 }),
        } as unknown as ReturnType<typeof pb.collection>
      }
      if (name === 'industry_product_mix') {
        return {
          getList: vi.fn().mockResolvedValue({ items: [], totalItems: 0 }),
        } as unknown as ReturnType<typeof pb.collection>
      }
      return {} as unknown as ReturnType<typeof pb.collection>
    })

    const ctx = await carregarContextoAuditoria(
      'FRUTAP',
      '405',
      'Fort 405',
      '2026-09-20',
      'ind-frutap',
    )
    expect(ctx.industry_id).toBe('ind-frutap')
    expect(ctx.tradepro_client_id).toBe('7')
    expect(ctx.contextoIndustriaSeguro).toBe(true)
    expect(ctx.cicloPesquisaConfigurado?.frequencia).toBe('semanal')
    // Verifica que o filtro de validades_base restringiu pela indústria (industry_id e/ou cod_cliente=7) e pela loja
    expect(mockValidadesFilter).toHaveBeenCalled()
    const filterUsed = mockValidadesFilter.mock.calls[0][0]
    expect(filterUsed).toContain("codigo_loja = '405'")
    expect(filterUsed).toContain("industry_id = 'ind-frutap'")
    expect(filterUsed).toContain("cod_cliente = '7'")
  })

  it('carregarContextoAuditoria sinaliza contexto inseguro quando indústria não for encontrada no cadastro operacional', async () => {
    vi.spyOn(pb, 'collection').mockImplementation((name: string) => {
      if (name === 'industry_registry') {
        return {
          getOne: vi.fn().mockRejectedValue(new Error('Record not found')),
          getList: vi.fn().mockResolvedValue({ items: [] }),
        } as unknown as ReturnType<typeof pb.collection>
      }
      return {
        getList: vi.fn().mockResolvedValue({ items: [] }),
      } as unknown as ReturnType<typeof pb.collection>
    })

    const ctx = await carregarContextoAuditoria('Indústria Sem Cadastro', '405', 'Fort 405')
    expect(ctx.contextoIndustriaSeguro).toBe(false)
    expect(ctx.motivoInsegurancaIndustria).toContain('não possui cadastro operacional validado')
    // Por segurança, não mistura registros
    expect(ctx.historicoValidades).toEqual([])
  })
})
