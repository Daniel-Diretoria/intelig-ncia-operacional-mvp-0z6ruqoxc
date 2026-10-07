import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  executarHomologacaoCadastralBaseAtual,
  registrarPendenciaConsolidada,
} from '../homologacaoCadastralService'
import pb from '@/lib/pocketbase/client'

// Mock dos serviços de cadastros
vi.mock('@/services/cadastrosService', () => ({
  getCadastrosIndustrias: vi.fn(),
  getCadastrosRedes: vi.fn(),
  getCadastrosLojas: vi.fn(),
  getCadastrosSupervisores: vi.fn(),
  getCadastrosPromotores: vi.fn(),
  getCadastrosProdutos: vi.fn(),
  logCadastroAudit: vi.fn().mockResolvedValue(true),
}))

import {
  getCadastrosIndustrias,
  getCadastrosRedes,
  getCadastrosLojas,
  getCadastrosSupervisores,
  getCadastrosPromotores,
  getCadastrosProdutos,
} from '@/services/cadastrosService'

describe('Homologação Cadastral TradePro (Bloco A.1) - Testes Obrigatórios (Item 17)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('1. Mais de 10 páginas de Validades são processadas completamente (removeu limite pageV <= 10)', async () => {
    vi.mocked(getCadastrosIndustrias).mockResolvedValue([])
    vi.mocked(getCadastrosRedes).mockResolvedValue([])
    vi.mocked(getCadastrosLojas).mockResolvedValue([])
    vi.mocked(getCadastrosSupervisores).mockResolvedValue([])
    vi.mocked(getCadastrosPromotores).mockResolvedValue([])
    vi.mocked(getCadastrosProdutos).mockResolvedValue([])

    let validadesCalls = 0
    vi.spyOn(pb, 'collection').mockImplementation((name: string) => {
      if (name === 'validades_base') {
        return {
          getList: vi.fn().mockImplementation((page: number) => {
            validadesCalls++
            return Promise.resolve({
              items: [{ cod_cliente: '7', cliente: 'FRUTAP', realizado: '2025-05-10' }],
              totalPages: 12, // 12 páginas (> 10)
            })
          }),
        } as any
      }
      if (name === 'rupturas_base') {
        return {
          getList: vi.fn().mockResolvedValue({ items: [], totalPages: 1 }),
        } as any
      }
      if (name === 'operacional_visitas') {
        return {
          getList: vi.fn().mockResolvedValue({ items: [], totalPages: 1 }),
        } as any
      }
      return {
        getList: vi.fn().mockResolvedValue({ items: [] }),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
        getFullList: vi.fn().mockResolvedValue([]),
      } as any
    })

    const resultado = await executarHomologacaoCadastralBaseAtual('Tester')

    // Deve ter percorrido as 12 páginas completas de Validades
    expect(validadesCalls).toBe(12)
    expect(resultado.universoProcessado.validadesLidas).toBe(12)
    expect(resultado.universoProcessado.totalPaginasPorFonte.validades).toBe(12)
  })

  it('2. Mais de 10 páginas de Rupturas são processadas completamente (removeu limite pageR <= 10)', async () => {
    vi.mocked(getCadastrosIndustrias).mockResolvedValue([])
    vi.mocked(getCadastrosRedes).mockResolvedValue([])
    vi.mocked(getCadastrosLojas).mockResolvedValue([])
    vi.mocked(getCadastrosSupervisores).mockResolvedValue([])
    vi.mocked(getCadastrosPromotores).mockResolvedValue([])
    vi.mocked(getCadastrosProdutos).mockResolvedValue([])

    let rupturasCalls = 0
    vi.spyOn(pb, 'collection').mockImplementation((name: string) => {
      if (name === 'validades_base') {
        return {
          getList: vi.fn().mockResolvedValue({ items: [], totalPages: 1 }),
        } as any
      }
      if (name === 'rupturas_base') {
        return {
          getList: vi.fn().mockImplementation((page: number) => {
            rupturasCalls++
            return Promise.resolve({
              items: [{ codigo_cliente: '7', cliente: 'FRUTAP', data_visita: '2025-05-10' }],
              totalPages: 15, // 15 páginas (> 10)
            })
          }),
        } as any
      }
      if (name === 'operacional_visitas') {
        return {
          getList: vi.fn().mockResolvedValue({ items: [], totalPages: 1 }),
        } as any
      }
      return {
        getList: vi.fn().mockResolvedValue({ items: [] }),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
        getFullList: vi.fn().mockResolvedValue([]),
      } as any
    })

    const resultado = await executarHomologacaoCadastralBaseAtual('Tester')

    expect(rupturasCalls).toBe(15)
    expect(resultado.universoProcessado.rupturasLidas).toBe(15)
    expect(resultado.universoProcessado.totalPaginasPorFonte.rupturas).toBe(15)
  })

  it('3. Operacional_visitas participa efetivamente da homologação e descobre Promotor e Loja sem inventar supervisor ausente', async () => {
    vi.mocked(getCadastrosIndustrias).mockResolvedValue([])
    vi.mocked(getCadastrosRedes).mockResolvedValue([])
    vi.mocked(getCadastrosLojas).mockResolvedValue([
      {
        id: 'loja_165',
        codigo_externo: '165',
        razao_social: '165 - Fort Joinville',
        ativo: true,
      } as any,
    ])
    vi.mocked(getCadastrosSupervisores).mockResolvedValue([])
    vi.mocked(getCadastrosPromotores).mockResolvedValue([
      { id: 'prom_99', codigo_externo: '99', nome: 'João Visita', status: 'ativo' } as any,
    ])
    vi.mocked(getCadastrosProdutos).mockResolvedValue([])

    const mockVisitas = [
      {
        id: 'vis_1',
        data: '2025-05-15',
        promoter_cod: '99',
        promoter_nome: 'João Visita',
        store_code: '165',
        store_name: '165 - Fort Joinville',
        // Supervisor NÃO fornecido no evento de visita
      },
    ]

    const assignmentCreateSpy = vi.fn().mockResolvedValue({ id: 'ass_novo' })

    vi.spyOn(pb, 'collection').mockImplementation((name: string) => {
      if (name === 'validades_base' || name === 'rupturas_base') {
        return {
          getList: vi.fn().mockResolvedValue({ items: [], totalPages: 1 }),
        } as any
      }
      if (name === 'operacional_visitas') {
        return {
          getList: vi.fn().mockResolvedValue({ items: mockVisitas, totalPages: 1 }),
        } as any
      }
      if (name === 'store_promoter_assignments') {
        return {
          getFullList: vi.fn().mockResolvedValue([]),
          create: assignmentCreateSpy,
          update: vi.fn().mockResolvedValue({}),
        } as any
      }
      return {
        getList: vi.fn().mockResolvedValue({ items: [] }),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
      } as any
    })

    const resultado = await executarHomologacaoCadastralBaseAtual('Tester')

    expect(resultado.universoProcessado.visitasLidas).toBe(1)
    expect(resultado.promotores.vinculados).toBe(1)
    expect(resultado.lojas.vinculadas).toBe(1)
    // NUNCA inventar supervisor quando visita não fornecer
    expect(resultado.supervisores.descobertos).toBe(0)
    expect(resultado.supervisores.vinculados).toBe(0)
    expect(resultado.vinculosObservados.promotorLoja).toBe(1)
  })

  it('4. Vínculo Promotor ↔ Loja observado é persistido com tipo_vinculo = observado_visita e NÃO vira confirmado', async () => {
    vi.mocked(getCadastrosIndustrias).mockResolvedValue([])
    vi.mocked(getCadastrosRedes).mockResolvedValue([])
    vi.mocked(getCadastrosLojas).mockResolvedValue([
      {
        id: 'loja_165',
        codigo_externo: '165',
        razao_social: '165 - Fort Joinville',
        ativo: true,
      } as any,
    ])
    vi.mocked(getCadastrosSupervisores).mockResolvedValue([])
    vi.mocked(getCadastrosPromotores).mockResolvedValue([
      { id: 'prom_99', codigo_externo: '99', nome: 'João Visita', status: 'ativo' } as any,
    ])
    vi.mocked(getCadastrosProdutos).mockResolvedValue([])

    const mockVisitas = [
      {
        id: 'vis_1',
        data: '2025-05-15',
        promoter_cod: '99',
        promoter_nome: 'João Visita',
        store_code: '165',
        store_name: '165 - Fort Joinville',
      },
    ]

    const assignmentCreateSpy = vi.fn().mockResolvedValue({ id: 'ass_novo' })

    vi.spyOn(pb, 'collection').mockImplementation((name: string) => {
      if (name === 'validades_base' || name === 'rupturas_base') {
        return {
          getList: vi.fn().mockResolvedValue({ items: [], totalPages: 1 }),
        } as any
      }
      if (name === 'operacional_visitas') {
        return {
          getList: vi.fn().mockResolvedValue({ items: mockVisitas, totalPages: 1 }),
        } as any
      }
      if (name === 'store_promoter_assignments') {
        return {
          getFullList: vi.fn().mockResolvedValue([]),
          create: assignmentCreateSpy,
          update: vi.fn().mockResolvedValue({}),
        } as any
      }
      return {
        getList: vi.fn().mockResolvedValue({ items: [] }),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
      } as any
    })

    const resultado = await executarHomologacaoCadastralBaseAtual('Tester')

    expect(assignmentCreateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        promoter_id: 'prom_99',
        store_code: '165',
        tipo_vinculo: 'observado_visita', // NUNCA confirmado
        status: 'ativo',
        origem_vinculo: 'Observado via operacional_visitas',
      }),
    )
    expect(resultado.relacoes.novasPersistidas).toBe(1)
    expect(resultado.relacoes.jaExistentes).toBe(0)
  })

  it('5. Segunda execução não duplica vínculo: incrementa relacoes.jaExistentes e não recria', async () => {
    vi.mocked(getCadastrosIndustrias).mockResolvedValue([])
    vi.mocked(getCadastrosRedes).mockResolvedValue([])
    vi.mocked(getCadastrosLojas).mockResolvedValue([
      {
        id: 'loja_165',
        codigo_externo: '165',
        razao_social: '165 - Fort Joinville',
        ativo: true,
      } as any,
    ])
    vi.mocked(getCadastrosSupervisores).mockResolvedValue([])
    vi.mocked(getCadastrosPromotores).mockResolvedValue([
      { id: 'prom_99', codigo_externo: '99', nome: 'João Visita', status: 'ativo' } as any,
    ])
    vi.mocked(getCadastrosProdutos).mockResolvedValue([])

    const mockVisitas = [
      {
        id: 'vis_1',
        data: '2025-05-15',
        promoter_cod: '99',
        promoter_nome: 'João Visita',
        store_code: '165',
        store_name: '165 - Fort Joinville',
      },
    ]

    const assignmentCreateSpy = vi.fn().mockResolvedValue({ id: 'ass_novo' })
    const assignmentUpdateSpy = vi.fn().mockResolvedValue({})

    vi.spyOn(pb, 'collection').mockImplementation((name: string) => {
      if (name === 'validades_base' || name === 'rupturas_base') {
        return {
          getList: vi.fn().mockResolvedValue({ items: [], totalPages: 1 }),
        } as any
      }
      if (name === 'operacional_visitas') {
        return {
          getList: vi.fn().mockResolvedValue({ items: mockVisitas, totalPages: 1 }),
        } as any
      }
      if (name === 'store_promoter_assignments') {
        return {
          // Já existe o vínculo cadastrado previamente
          getFullList: vi.fn().mockResolvedValue([
            {
              id: 'ass_existente',
              promoter_id: 'prom_99',
              store_code: '165',
              tipo_vinculo: 'observado_visita',
              status: 'ativo',
            },
          ]),
          create: assignmentCreateSpy,
          update: assignmentUpdateSpy,
        } as any
      }
      return {
        getList: vi.fn().mockResolvedValue({ items: [] }),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
      } as any
    })

    const resultado = await executarHomologacaoCadastralBaseAtual('Tester')

    expect(assignmentCreateSpy).not.toHaveBeenCalled()
    expect(resultado.relacoes.novasPersistidas).toBe(0)
    expect(resultado.relacoes.jaExistentes).toBe(1)
  })

  it('6. Pendência com 500 ocorrências apresenta 500 e segunda homologação mantém 500 sem virar 1.000', async () => {
    const updateSpy = vi.fn().mockResolvedValue({})
    const createSpy = vi.fn().mockResolvedValue({})

    // 1ª execução com pendência aberta existente que já tinha 500 ocorrências
    vi.spyOn(pb, 'collection').mockImplementation((name: string) => {
      if (name === 'cadastros_pendencias') {
        return {
          getList: vi.fn().mockResolvedValue({
            items: [
              {
                id: 'pend_500',
                tipo_entidade: 'loja',
                valor_identificador: '999',
                volume_ocorrencias: 500,
                status: 'pendente',
              },
            ],
          }),
          create: createSpy,
          update: updateSpy,
        } as any
      }
      return {} as any
    })

    // Reprocessando com 500 ocorrências no universo atual
    await registrarPendenciaConsolidada('loja', '999', '999', 'Loja 999', 'tradepro_sync', {}, 500)

    expect(createSpy).not.toHaveBeenCalled()
    // Atualiza idempotentemente para 500, e não 500 + 1 ou 500 + 500 = 1000
    expect(updateSpy).toHaveBeenCalledWith(
      'pend_500',
      expect.objectContaining({
        volume_ocorrencias: 500,
      }),
    )
  })

  it('7. Loja com edicao_manual = true não perde configuração nem tem rede alterada', async () => {
    const storeUpdateSpy = vi.fn().mockResolvedValue({})

    vi.mocked(getCadastrosIndustrias).mockResolvedValue([])
    vi.mocked(getCadastrosRedes).mockResolvedValue([
      { id: 'rede_outra', nome: 'REDE NOVA DA FONTE', ativo: true } as any,
    ])
    vi.mocked(getCadastrosLojas).mockResolvedValue([
      {
        id: 'loja_manual',
        codigo_externo: '085',
        razao_social: '085 - FORT DEFINIDO MANUALMENTE',
        network_id: 'rede_manual_fixada',
        rede_nome: 'Rede Manual Fixada',
        edicao_manual: true,
        ativo: true,
      } as any,
    ])
    vi.mocked(getCadastrosSupervisores).mockResolvedValue([])
    vi.mocked(getCadastrosPromotores).mockResolvedValue([])
    vi.mocked(getCadastrosProdutos).mockResolvedValue([])

    const mockValidades = [
      {
        codigo_loja: '085',
        razao_social: '085 - NOME DA API',
        fantasia: 'REDE NOVA DA FONTE',
        realizado: '2025-05-18',
      },
    ]

    vi.spyOn(pb, 'collection').mockImplementation((name: string) => {
      if (name === 'validades_base') {
        return {
          getList: vi.fn().mockResolvedValue({ items: mockValidades, totalPages: 1 }),
        } as any
      }
      if (name === 'rupturas_base' || name === 'operacional_visitas') {
        return {
          getList: vi.fn().mockResolvedValue({ items: [], totalPages: 1 }),
        } as any
      }
      if (name === 'stores') {
        return {
          update: storeUpdateSpy,
        } as any
      }
      return {
        getList: vi.fn().mockResolvedValue({ items: [] }),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
        getFullList: vi.fn().mockResolvedValue([]),
      } as any
    })

    const resultado = await executarHomologacaoCadastralBaseAtual('Tester')

    expect(resultado.lojas.vinculadas).toBe(1)
    // Atualiza ultima_observacao_fonte SEM alterar network_id ou rede_nome
    expect(storeUpdateSpy).toHaveBeenCalledWith(
      'loja_manual',
      expect.objectContaining({
        ultima_observacao_fonte: '2025-05-18',
      }),
    )
    expect(storeUpdateSpy).not.toHaveBeenCalledWith(
      'loja_manual',
      expect.objectContaining({
        network_id: 'rede_outra',
      }),
    )
  })

  it('8. Promotor com edicao_manual = true não perde supervisor manual', async () => {
    const promUpdateSpy = vi.fn().mockResolvedValue({})

    vi.mocked(getCadastrosIndustrias).mockResolvedValue([])
    vi.mocked(getCadastrosRedes).mockResolvedValue([])
    vi.mocked(getCadastrosLojas).mockResolvedValue([])
    vi.mocked(getCadastrosSupervisores).mockResolvedValue([
      { id: 'sup_api', codigo_externo: '99', nome: 'Supervisor API', status: 'ativo' } as any,
    ])
    vi.mocked(getCadastrosPromotores).mockResolvedValue([
      {
        id: 'prom_manual',
        codigo_externo: '10',
        nome: 'Promotor Manual',
        supervisor_id: 'sup_manual_fixo',
        supervisor_nome: 'Supervisor Manual Fixo',
        edicao_manual: true,
        status: 'ativo',
      } as any,
    ])
    vi.mocked(getCadastrosProdutos).mockResolvedValue([])

    const mockValidades = [
      {
        cod_colaborador: '10',
        colaborador: 'Promotor Manual',
        cod_supervisor: '99',
        supervisor: 'Supervisor API',
        realizado: '2025-05-18',
      },
    ]

    vi.spyOn(pb, 'collection').mockImplementation((name: string) => {
      if (name === 'validades_base') {
        return {
          getList: vi.fn().mockResolvedValue({ items: mockValidades, totalPages: 1 }),
        } as any
      }
      if (name === 'rupturas_base' || name === 'operacional_visitas') {
        return {
          getList: vi.fn().mockResolvedValue({ items: [], totalPages: 1 }),
        } as any
      }
      if (name === 'promoters') {
        return {
          update: promUpdateSpy,
        } as any
      }
      return {
        getList: vi.fn().mockResolvedValue({ items: [] }),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
        getFullList: vi.fn().mockResolvedValue([]),
      } as any
    })

    const resultado = await executarHomologacaoCadastralBaseAtual('Tester')

    expect(resultado.promotores.vinculados).toBe(1)
    // Atualiza ultima_observacao_fonte SEM alterar supervisor_id manual
    expect(promUpdateSpy).toHaveBeenCalledWith(
      'prom_manual',
      expect.objectContaining({
        ultima_observacao_fonte: '2025-05-18',
      }),
    )
    expect(promUpdateSpy).not.toHaveBeenCalledWith(
      'prom_manual',
      expect.objectContaining({
        supervisor_id: 'sup_api',
      }),
    )
  })

  it('9. Supervisor com edicao_manual = true tem ultima_observacao_fonte atualizada sem desativar', async () => {
    const supUpdateSpy = vi.fn().mockResolvedValue({})

    vi.mocked(getCadastrosIndustrias).mockResolvedValue([])
    vi.mocked(getCadastrosRedes).mockResolvedValue([])
    vi.mocked(getCadastrosLojas).mockResolvedValue([])
    vi.mocked(getCadastrosSupervisores).mockResolvedValue([
      {
        id: 'sup_manual',
        codigo_externo: '3',
        nome: 'Supervisor Manual',
        edicao_manual: true,
        status: 'ativo',
      } as any,
    ])
    vi.mocked(getCadastrosPromotores).mockResolvedValue([])
    vi.mocked(getCadastrosProdutos).mockResolvedValue([])

    const mockValidades = [
      {
        cod_supervisor: '3',
        supervisor: 'Supervisor Manual',
        realizado: '2025-05-19',
      },
    ]

    vi.spyOn(pb, 'collection').mockImplementation((name: string) => {
      if (name === 'validades_base') {
        return {
          getList: vi.fn().mockResolvedValue({ items: mockValidades, totalPages: 1 }),
        } as any
      }
      if (name === 'rupturas_base' || name === 'operacional_visitas') {
        return {
          getList: vi.fn().mockResolvedValue({ items: [], totalPages: 1 }),
        } as any
      }
      if (name === 'supervisors') {
        return {
          update: supUpdateSpy,
        } as any
      }
      return {
        getList: vi.fn().mockResolvedValue({ items: [] }),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
        getFullList: vi.fn().mockResolvedValue([]),
      } as any
    })

    const resultado = await executarHomologacaoCadastralBaseAtual('Tester')

    expect(resultado.supervisores.vinculados).toBe(1)
    expect(supUpdateSpy).toHaveBeenCalledWith(
      'sup_manual',
      expect.objectContaining({
        ultima_observacao_fonte: '2025-05-19',
      }),
    )
  })

  it('10. Fallback de correspondência por nome de Indústria NÃO grava tradepro_client_id silenciosamente: gera pendência assistida', async () => {
    const indUpdateSpy = vi.fn().mockResolvedValue({})
    const pendenciaCreateSpy = vi.fn().mockResolvedValue({ id: 'pend_1' })

    // Indústria existente no SKIP "Frutap", mas SEM tradepro_client_id vinculado ainda
    vi.mocked(getCadastrosIndustrias).mockResolvedValue([
      {
        id: 'ind_frutap',
        nome: 'Frutap',
        tradepro_client_id: '',
        status: 'ativa',
      } as any,
    ])
    vi.mocked(getCadastrosRedes).mockResolvedValue([])
    vi.mocked(getCadastrosLojas).mockResolvedValue([])
    vi.mocked(getCadastrosSupervisores).mockResolvedValue([])
    vi.mocked(getCadastrosPromotores).mockResolvedValue([])
    vi.mocked(getCadastrosProdutos).mockResolvedValue([])

    // Chega Cliente 7 com nome "Frutap"
    const mockValidades = [
      {
        cod_cliente: '7',
        cliente: 'Frutap',
      },
    ]

    vi.spyOn(pb, 'collection').mockImplementation((name: string) => {
      if (name === 'validades_base') {
        return {
          getList: vi.fn().mockResolvedValue({ items: mockValidades, totalPages: 1 }),
        } as any
      }
      if (name === 'rupturas_base' || name === 'operacional_visitas') {
        return {
          getList: vi.fn().mockResolvedValue({ items: [], totalPages: 1 }),
        } as any
      }
      if (name === 'industry_registry') {
        return {
          update: indUpdateSpy,
        } as any
      }
      if (name === 'cadastros_pendencias') {
        return {
          getList: vi.fn().mockResolvedValue({ items: [] }),
          create: pendenciaCreateSpy,
          update: vi.fn().mockResolvedValue({}),
        } as any
      }
      return {
        getList: vi.fn().mockResolvedValue({ items: [] }),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
        getFullList: vi.fn().mockResolvedValue([]),
      } as any
    })

    const resultado = await executarHomologacaoCadastralBaseAtual('Tester')

    // NUNCA grava silenciosamente o tradepro_client_id por mera similaridade de nome
    expect(indUpdateSpy).not.toHaveBeenCalledWith(
      'ind_frutap',
      expect.objectContaining({
        tradepro_client_id: '7',
      }),
    )

    // Gera pendência assistida com sugestão de vínculo para confirmação humana
    expect(resultado.industrias.pendentes).toBe(1)
    expect(resultado.industrias.vinculadas).toBe(0)
    expect(pendenciaCreateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo_entidade: 'industria',
        valor_identificador: '7',
        status: 'pendente',
        contexto_adicional: expect.objectContaining({
          industriaSugeridaId: 'ind_frutap',
        }),
      }),
    )
  })
})
