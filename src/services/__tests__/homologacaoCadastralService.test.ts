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
              items: [
                {
                  cod_cliente: '7',
                  cliente: 'FRUTAP',
                  realizado: '2025-05-10',
                  is_base_atual: true,
                  data_importacao: 'tradepro_job_20250510',
                },
              ],
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
              items: [
                {
                  codigo_cliente: '7',
                  cliente: 'FRUTAP',
                  data_visita: '2025-05-10',
                  is_base_atual: true,
                  tenant_id: 'tradepro_job_sync',
                },
              ],
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

  it('3. Operacional_visitas fica em "Aguardando homologação da integração (Bloco B)" e não contamina cadastros', async () => {
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
        origem_fonte: 'tradepro_api',
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
          getList: vi.fn().mockResolvedValue({ items: mockVisitas, totalPages: 1, totalItems: 1 }),
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

    // Visitas informadas claramente em estado de aguardo sem contaminação cadastral
    expect(resultado.visitasStatus).toBe(
      'Visitas TradePro: Aguardando homologação da integração (Bloco B)',
    )
    expect(resultado.universoProcessado.visitasLidas).toBe(1)
    // Sem validades/rupturas, NÃO cria vínculos a partir de visitas ainda não homologadas
    expect(assignmentCreateSpy).not.toHaveBeenCalled()
    expect(resultado.relacoes.novasPersistidas).toBe(0)
    expect(resultado.vinculosObservados.promotorLoja).toBe(0)
  })

  it('4. Vínculo Promotor ↔ Loja observado via operação é persistido com tipo_vinculo = observado_operacao, data_fim vazia e ultima_observacao_fonte', async () => {
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

    const mockValidades = [
      {
        id: 'val_1',
        realizado: '2025-05-15',
        cod_colaborador: '99',
        colaborador: 'João Visita',
        codigo_loja: '165',
        razao_social: '165 - Fort Joinville',
        is_base_atual: true,
        tenant_id: 'tradepro_job',
      },
    ]

    const assignmentCreateSpy = vi.fn().mockResolvedValue({ id: 'ass_novo' })

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
        store_id: 'loja_165',
        store_code: '165',
        tipo_vinculo: 'observado_operacao', // NUNCA confirmado
        status: 'ativo',
        data_inicio: '2025-05-15',
        data_fim: '', // Vazio em vínculo ativo!
        ultima_observacao_fonte: '2025-05-15',
      }),
    )
    expect(resultado.relacoes.novasPersistidas).toBe(1)
    expect(resultado.relacoes.jaExistentes).toBe(0)
  })

  it('5. Segunda execução não duplica vínculo: incrementa relacoes.jaExistentes e apenas atualiza ultima_observacao_fonte', async () => {
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

    const mockValidades = [
      {
        id: 'val_1',
        realizado: '2025-05-22',
        cod_colaborador: '99',
        colaborador: 'João Visita',
        codigo_loja: '165',
        razao_social: '165 - Fort Joinville',
        is_base_atual: true,
        tenant_id: 'tradepro_job',
      },
    ]

    const assignmentCreateSpy = vi.fn().mockResolvedValue({ id: 'ass_novo' })
    const assignmentUpdateSpy = vi.fn().mockResolvedValue({})

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
      if (name === 'store_promoter_assignments') {
        return {
          // Já existe o vínculo cadastrado previamente como ativo
          getFullList: vi.fn().mockResolvedValue([
            {
              id: 'ass_existente',
              promoter_id: 'prom_99',
              store_id: 'loja_165',
              store_code: '165',
              tipo_vinculo: 'observado_operacao',
              status: 'ativo',
              data_inicio: '2025-05-01',
              data_fim: '',
              ultima_observacao_fonte: '2025-05-15',
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
    expect(assignmentUpdateSpy).toHaveBeenCalledWith(
      'ass_existente',
      expect.objectContaining({
        ultima_observacao_fonte: '2025-05-22',
      }),
    )
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
        is_base_atual: true,
        data_importacao: 'tradepro_job',
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
        is_base_atual: true,
        data_importacao: 'tradepro_job',
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
        is_base_atual: true,
        data_importacao: 'tradepro_job',
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
        is_base_atual: true,
        data_importacao: 'tradepro_job',
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

  // ---------------------------------------------------------------------------
  // Bloco A.2: Testes Obrigatórios de Origem TradePro e Vigência
  // ---------------------------------------------------------------------------

  it('11. Registro TradePro participa da homologação cadastral', async () => {
    vi.mocked(getCadastrosIndustrias).mockResolvedValue([])
    vi.mocked(getCadastrosRedes).mockResolvedValue([])
    vi.mocked(getCadastrosLojas).mockResolvedValue([])
    vi.mocked(getCadastrosSupervisores).mockResolvedValue([])
    vi.mocked(getCadastrosPromotores).mockResolvedValue([])
    vi.mocked(getCadastrosProdutos).mockResolvedValue([])

    vi.spyOn(pb, 'collection').mockImplementation((name: string) => {
      if (name === 'validades_base') {
        return {
          getList: vi.fn().mockResolvedValue({
            items: [
              {
                cod_cliente: '7',
                cliente: 'FRUTAP',
                is_base_atual: true,
                data_importacao: 'tradepro_job_20250520',
              },
            ],
            totalPages: 1,
          }),
        } as any
      }
      if (name === 'rupturas_base' || name === 'operacional_visitas') {
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

    expect(resultado.fonteHomologada).toBe('TradePro API')
    expect(resultado.metricasOrigem.registrosTradeProConsiderados).toBe(1)
    expect(resultado.metricasOrigem.registrosExcelExcluidos).toBe(0)
    expect(resultado.universoProcessado.validadesLidas).toBe(1)
    expect(resultado.industrias.descobertas).toBe(1)
  })

  it('12. Registro de Excel manual NÃO participa da homologação (mesmo com is_base_atual=true)', async () => {
    vi.mocked(getCadastrosIndustrias).mockResolvedValue([])
    vi.mocked(getCadastrosRedes).mockResolvedValue([])
    vi.mocked(getCadastrosLojas).mockResolvedValue([])
    vi.mocked(getCadastrosSupervisores).mockResolvedValue([])
    vi.mocked(getCadastrosPromotores).mockResolvedValue([])
    vi.mocked(getCadastrosProdutos).mockResolvedValue([])

    vi.spyOn(pb, 'collection').mockImplementation((name: string) => {
      if (name === 'validades_base') {
        return {
          getList: vi.fn().mockResolvedValue({
            items: [
              // Registro com import_id (planilha Excel manual) mesmo com is_base_atual = true
              {
                cod_cliente: '999',
                cliente: 'EXCEL_CLIENTE',
                is_base_atual: true,
                import_id: 'excel_history_123',
                data_importacao: 'manual_excel',
              },
            ],
            totalPages: 1,
          }),
        } as any
      }
      if (name === 'rupturas_base') {
        return {
          getList: vi.fn().mockResolvedValue({
            items: [
              // Ruptura com source_import_id apontando para importação Excel
              {
                codigo_cliente: '888',
                cliente: 'EXCEL_RUPTURA',
                is_base_atual: true,
                source_import_id: 'rupturas_import_456',
              },
            ],
            totalPages: 1,
          }),
        } as any
      }
      if (name === 'operacional_visitas') {
        return {
          getList: vi.fn().mockResolvedValue({
            items: [
              {
                promoter_cod: '111',
                promoter_nome: 'Promotor Manual',
                origem_fonte: 'importacao_manual_excel',
              },
            ],
            totalPages: 1,
          }),
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

    expect(resultado.metricasOrigem.registrosExcelExcluidos).toBe(3)
    expect(resultado.metricasOrigem.registrosTradeProConsiderados).toBe(0)
    expect(resultado.universoProcessado.validadesLidas).toBe(0)
    expect(resultado.universoProcessado.rupturasLidas).toBe(0)
    expect(resultado.universoProcessado.visitasLidas).toBe(0)
    expect(resultado.industrias.descobertas).toBe(0)
  })

  it('13. Registro legado NÃO participa da homologação TradePro', async () => {
    vi.mocked(getCadastrosIndustrias).mockResolvedValue([])
    vi.mocked(getCadastrosRedes).mockResolvedValue([])
    vi.mocked(getCadastrosLojas).mockResolvedValue([])
    vi.mocked(getCadastrosSupervisores).mockResolvedValue([])
    vi.mocked(getCadastrosPromotores).mockResolvedValue([])
    vi.mocked(getCadastrosProdutos).mockResolvedValue([])

    vi.spyOn(pb, 'collection').mockImplementation((name: string) => {
      if (name === 'validades_base') {
        return {
          getList: vi.fn().mockResolvedValue({
            items: [
              {
                cod_cliente: '7',
                cliente: 'FRUTAP',
                is_base_atual: false, // Inativo / lote antigo não vigente
                origem_fonte: 'legado',
              },
            ],
            totalPages: 1,
          }),
        } as any
      }
      if (name === 'rupturas_base' || name === 'operacional_visitas') {
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

    expect(resultado.metricasOrigem.registrosLegadosExcluidos).toBe(1)
    expect(resultado.metricasOrigem.registrosTradeProConsiderados).toBe(0)
    expect(resultado.universoProcessado.validadesLidas).toBe(0)
  })

  it('14. Validade e Ruptura geram tipo_vinculo = observado_operacao com ultima_observacao_fonte', async () => {
    vi.mocked(getCadastrosIndustrias).mockResolvedValue([])
    vi.mocked(getCadastrosRedes).mockResolvedValue([])
    vi.mocked(getCadastrosLojas).mockResolvedValue([
      { id: 'loja_10', codigo_externo: '10', razao_social: 'Loja 10', ativo: true } as any,
      { id: 'loja_20', codigo_externo: '20', razao_social: 'Loja 20', ativo: true } as any,
    ])
    vi.mocked(getCadastrosSupervisores).mockResolvedValue([])
    vi.mocked(getCadastrosPromotores).mockResolvedValue([
      { id: 'prom_1', codigo_externo: '1', nome: 'Promotor 1', status: 'ativo' } as any,
      { id: 'prom_2', codigo_externo: '2', nome: 'Promotor 2', status: 'ativo' } as any,
    ])
    vi.mocked(getCadastrosProdutos).mockResolvedValue([])

    const assignmentCreateSpy = vi.fn().mockResolvedValue({ id: 'ass_novo' })

    vi.spyOn(pb, 'collection').mockImplementation((name: string) => {
      if (name === 'validades_base') {
        return {
          getList: vi.fn().mockResolvedValue({
            items: [
              {
                realizado: '2025-05-10',
                cod_colaborador: '1',
                colaborador: 'Promotor 1',
                codigo_loja: '10',
                is_base_atual: true,
                tenant_id: 'tradepro_job',
              },
            ],
            totalPages: 1,
          }),
        } as any
      }
      if (name === 'rupturas_base') {
        return {
          getList: vi.fn().mockResolvedValue({
            items: [
              {
                data_visita: '2025-05-12',
                promotor_codigo: '2',
                promotor: 'Promotor 2',
                codigo_loja: '20',
                is_base_atual: true,
                tenant_id: 'tradepro_job',
              },
            ],
            totalPages: 1,
          }),
        } as any
      }
      if (name === 'operacional_visitas') {
        return {
          getList: vi.fn().mockResolvedValue({
            items: [],
            totalPages: 1,
          }),
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

    expect(resultado.relacoes.novasPersistidas).toBe(2)

    // Vínculo por Validade DEVE ser observado_operacao
    expect(assignmentCreateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        promoter_id: 'prom_1',
        store_code: '10',
        tipo_vinculo: 'observado_operacao',
        origem_vinculo: 'tradepro_validades',
        ultima_observacao_fonte: '2025-05-10',
        data_fim: '',
      }),
    )

    // Vínculo por Ruptura DEVE ser observado_operacao
    expect(assignmentCreateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        promoter_id: 'prom_2',
        store_code: '20',
        tipo_vinculo: 'observado_operacao',
        origem_vinculo: 'tradepro_rupturas',
        ultima_observacao_fonte: '2025-05-12',
        data_fim: '',
      }),
    )
  })

  it('15. Vigência: data_fim fica VAZIO em vínculo ativo novo a partir de Validades/Rupturas', async () => {
    vi.mocked(getCadastrosIndustrias).mockResolvedValue([])
    vi.mocked(getCadastrosRedes).mockResolvedValue([])
    vi.mocked(getCadastrosLojas).mockResolvedValue([
      { id: 'loja_10', codigo_externo: '10', razao_social: 'Loja 10', ativo: true } as any,
    ])
    vi.mocked(getCadastrosSupervisores).mockResolvedValue([])
    vi.mocked(getCadastrosPromotores).mockResolvedValue([
      { id: 'prom_1', codigo_externo: '1', nome: 'Promotor 1', status: 'ativo' } as any,
    ])
    vi.mocked(getCadastrosProdutos).mockResolvedValue([])

    const assignmentCreateSpy = vi.fn().mockResolvedValue({ id: 'ass_novo' })

    vi.spyOn(pb, 'collection').mockImplementation((name: string) => {
      if (name === 'validades_base') {
        return {
          getList: vi.fn().mockResolvedValue({
            items: [
              {
                realizado: '2025-05-20',
                cod_colaborador: '1',
                colaborador: 'Promotor 1',
                codigo_loja: '10',
                is_base_atual: true,
                tenant_id: 'tradepro_job',
              },
            ],
            totalPages: 1,
          }),
        } as any
      }
      if (name === 'rupturas_base' || name === 'operacional_visitas') {
        return {
          getList: vi.fn().mockResolvedValue({ items: [], totalPages: 1 }),
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

    await executarHomologacaoCadastralBaseAtual('Tester')

    expect(assignmentCreateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data_inicio: '2025-05-20',
        data_fim: '', // Deve ficar VAZIO!
        status: 'ativo',
        ultima_observacao_fonte: '2025-05-20',
      }),
    )
  })

  it('16. Produto: preserva codigoProduto e nome real normalizado, resolvendo sem usar código como nome', async () => {
    vi.mocked(getCadastrosIndustrias).mockResolvedValue([
      { id: 'ind_7', nome: 'FRUTAP', tradepro_client_id: '7', status: 'ativa' } as any,
    ])
    vi.mocked(getCadastrosRedes).mockResolvedValue([])
    vi.mocked(getCadastrosLojas).mockResolvedValue([])
    vi.mocked(getCadastrosSupervisores).mockResolvedValue([])
    vi.mocked(getCadastrosPromotores).mockResolvedValue([])
    vi.mocked(getCadastrosProdutos).mockResolvedValue([
      {
        id: 'prod_100',
        industry_id: 'ind_7',
        codigo_produto: 'SKU999',
        nome_produto: 'Iogurte Grego 100g',
        tipo_mix: 'oficial_industria',
        status: 'ativo',
      } as any,
    ])

    vi.spyOn(pb, 'collection').mockImplementation((name: string) => {
      if (name === 'validades_base') {
        return {
          getList: vi.fn().mockResolvedValue({
            items: [
              {
                cod_cliente: '7',
                cliente: 'FRUTAP',
                cod_produto: 'SKU999',
                produto: 'Iogurte Grego 100g',
                is_base_atual: true,
                data_importacao: 'tradepro_job',
              },
            ],
            totalPages: 1,
          }),
        } as any
      }
      if (name === 'rupturas_base' || name === 'operacional_visitas') {
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

    expect(resultado.produtos.descobertos).toBe(1)
    expect(resultado.produtos.resolvidos).toBe(1)
    expect(resultado.produtos.detalhes[0].nome).toBe('Iogurte Grego 100g')
    expect(resultado.produtos.detalhes[0].codigo).toBe('SKU999')
  })

  // ---------------------------------------------------------------------------
  // Bloco A.3: Blindagem de Runtime, Schema Real, Vínculo Encerrado e Canonização
  // ---------------------------------------------------------------------------

  it('17. Schema real de store_promoter_assignments contém tipo_vinculo com observado_operacao e campo ultima_observacao_fonte', async () => {
    // Carrega o schema.json espelhado do PocketBase
    const schemaFile = await import('../../lib/pocketbase/schema.json')
    const schemaData = (schemaFile.default || schemaFile) as { collections?: any[] } | any[]
    const collections: any[] = Array.isArray(schemaData) ? schemaData : schemaData.collections || []

    const assignmentsCollection = collections.find(
      (c: any) => c.name === 'store_promoter_assignments',
    )
    expect(assignmentsCollection).toBeDefined()

    const tipoVinculoField = assignmentsCollection.fields?.find(
      (f: any) => f.name === 'tipo_vinculo',
    )
    expect(tipoVinculoField).toBeDefined()
    expect(tipoVinculoField.values).toContain('confirmado')
    expect(tipoVinculoField.values).toContain('observado_visita')
    expect(tipoVinculoField.values).toContain('observado_operacao')

    const ultimaObsField = assignmentsCollection.fields?.find(
      (f: any) => f.name === 'ultima_observacao_fonte',
    )
    expect(ultimaObsField).toBeDefined()
  })

  it('18. Vínculo histórico encerrado NÃO bloqueia criação de novo vínculo ativo se houver nova evidência', async () => {
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
      { id: 'prom_236', codigo_externo: '236', nome: 'João Silva', status: 'ativo' } as any,
    ])
    vi.mocked(getCadastrosProdutos).mockResolvedValue([])

    const assignmentCreateSpy = vi.fn().mockResolvedValue({ id: 'ass_novo_ativo' })
    const assignmentUpdateSpy = vi.fn().mockResolvedValue({})

    vi.spyOn(pb, 'collection').mockImplementation((name: string) => {
      if (name === 'validades_base') {
        return {
          getList: vi.fn().mockResolvedValue({
            items: [
              {
                realizado: '2026-10-07',
                cod_colaborador: '236',
                colaborador: 'João Silva',
                codigo_loja: '165',
                razao_social: '165 - Fort Joinville',
                is_base_atual: true,
                tenant_id: 'tradepro_job',
              },
            ],
            totalPages: 1,
          }),
        } as any
      }
      if (name === 'rupturas_base' || name === 'operacional_visitas') {
        return {
          getList: vi.fn().mockResolvedValue({ items: [], totalPages: 1 }),
        } as any
      }
      if (name === 'store_promoter_assignments') {
        return {
          // Existe apenas vínculo ENCERRADO prévio (01/08/2026 até 31/08/2026)
          getFullList: vi.fn().mockResolvedValue([
            {
              id: 'ass_historico_antigo',
              promoter_id: 'prom_236',
              store_id: 'loja_165',
              store_code: '165',
              status: 'encerrado',
              data_inicio: '2026-08-01',
              data_fim: '2026-08-31',
              tipo_vinculo: 'confirmado',
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

    // Deve registrar a histórica encerrada nas métricas
    expect(resultado.relacoes.historicasEncerradas).toBe(1)
    // E DEVE CRIAR uma NOVA relação ativa para a nova evidência
    expect(resultado.relacoes.novasPersistidas).toBe(1)
    expect(resultado.relacoes.jaExistentes).toBe(0)

    expect(assignmentCreateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        promoter_id: 'prom_236',
        store_id: 'loja_165',
        store_code: '165',
        status: 'ativo',
        data_inicio: '2026-10-07',
        data_fim: '', // Vazio
        ultima_observacao_fonte: '2026-10-07',
        tipo_vinculo: 'observado_operacao',
      }),
    )
    // NÃO deve reativar nem sobrescrever o vínculo encerrado histórico
    expect(assignmentUpdateSpy).not.toHaveBeenCalled()
  })

  it('19. Vínculo confirmado ativo NÃO é rebaixado para observado, preservando confirmação administrativa', async () => {
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
      { id: 'prom_236', codigo_externo: '236', nome: 'João Silva', status: 'ativo' } as any,
    ])
    vi.mocked(getCadastrosProdutos).mockResolvedValue([])

    const assignmentUpdateSpy = vi.fn().mockResolvedValue({})
    const assignmentCreateSpy = vi.fn().mockResolvedValue({})

    vi.spyOn(pb, 'collection').mockImplementation((name: string) => {
      if (name === 'validades_base') {
        return {
          getList: vi.fn().mockResolvedValue({
            items: [
              {
                realizado: '2026-10-07',
                cod_colaborador: '236',
                colaborador: 'João Silva',
                codigo_loja: '165',
                razao_social: '165 - Fort Joinville',
                is_base_atual: true,
                tenant_id: 'tradepro_job',
              },
            ],
            totalPages: 1,
          }),
        } as any
      }
      if (name === 'rupturas_base' || name === 'operacional_visitas') {
        return {
          getList: vi.fn().mockResolvedValue({ items: [], totalPages: 1 }),
        } as any
      }
      if (name === 'store_promoter_assignments') {
        return {
          getFullList: vi.fn().mockResolvedValue([
            {
              id: 'ass_confirmado_ativo',
              promoter_id: 'prom_236',
              store_id: 'loja_165',
              store_code: '165',
              status: 'ativo',
              tipo_vinculo: 'confirmado',
              data_inicio: '2026-01-01',
              data_fim: '',
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
    expect(resultado.relacoes.jaExistentes).toBe(1)
    expect(resultado.relacoes.novasPersistidas).toBe(0)

    // Apenas atualiza ultima_observacao_fonte e observação SEM rebaixar tipo_vinculo para 'observado_operacao'
    expect(assignmentUpdateSpy).toHaveBeenCalledWith(
      'ass_confirmado_ativo',
      expect.objectContaining({
        ultima_observacao_fonte: '2026-10-07',
      }),
    )
    expect(assignmentUpdateSpy).not.toHaveBeenCalledWith(
      'ass_confirmado_ativo',
      expect.objectContaining({
        tipo_vinculo: 'observado_operacao',
      }),
    )
  })

  it('20. Relações Canônicas: Mesmo Promotor e Loja descobertos por código e por nome consolidam em 1 única relação canônica', async () => {
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
      { id: 'prom_236', codigo_externo: '236', nome: 'João Silva', status: 'ativo' } as any,
    ])
    vi.mocked(getCadastrosProdutos).mockResolvedValue([])

    const assignmentCreateSpy = vi.fn().mockResolvedValue({ id: 'ass_canonico' })

    vi.spyOn(pb, 'collection').mockImplementation((name: string) => {
      if (name === 'validades_base') {
        return {
          getList: vi.fn().mockResolvedValue({
            items: [
              // Validade traz código 236 + Loja 165
              {
                realizado: '2026-05-10',
                cod_colaborador: '236',
                colaborador: 'João Silva',
                codigo_loja: '165',
                razao_social: '165 - Fort Joinville',
                is_base_atual: true,
                tenant_id: 'tradepro_job',
              },
            ],
            totalPages: 1,
          }),
        } as any
      }
      if (name === 'rupturas_base') {
        return {
          getList: vi.fn().mockResolvedValue({
            items: [
              // Ruptura traz apenas o nome "JOÃO SILVA" (sem código) + Loja 165
              {
                data_visita: '2026-05-12',
                promotor_codigo: '',
                promotor: 'JOÃO SILVA',
                codigo_loja: '165',
                loja: '165 - Fort Joinville',
                is_base_atual: true,
                tenant_id: 'tradepro_job',
              },
            ],
            totalPages: 1,
          }),
        } as any
      }
      if (name === 'operacional_visitas') {
        return {
          getList: vi.fn().mockResolvedValue({ items: [], totalPages: 1 }),
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

    // Como ambos resolvem para prom_236 e loja_165, a relação canônica única é 1 só!
    expect(resultado.relacoes.detectadas).toBe(1)
    expect(resultado.relacoes.novasPersistidas).toBe(1)
    expect(assignmentCreateSpy).toHaveBeenCalledTimes(1)
    expect(assignmentCreateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        promoter_id: 'prom_236',
        store_id: 'loja_165',
        store_code: '165',
        data_inicio: '2026-05-10',
        ultima_observacao_fonte: '2026-05-12',
      }),
    )
  })
})
