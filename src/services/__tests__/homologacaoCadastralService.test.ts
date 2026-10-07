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
  logCadastroAudit,
} from '@/services/cadastrosService'

describe('Homologação Cadastral TradePro (Bloco A) - Testes Obrigatórios', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('1. Cliente 7 -> Frutap correta por tradepro_client_id sem duplicar', async () => {
    vi.mocked(getCadastrosIndustrias).mockResolvedValue([
      {
        id: 'ind_frutap',
        nome: 'Frutap',
        tradepro_client_id: '7',
        tradepro_client_name: 'FRUTAP',
        status: 'ativa',
      } as any,
    ])
    vi.mocked(getCadastrosRedes).mockResolvedValue([])
    vi.mocked(getCadastrosLojas).mockResolvedValue([])
    vi.mocked(getCadastrosSupervisores).mockResolvedValue([])
    vi.mocked(getCadastrosPromotores).mockResolvedValue([])
    vi.mocked(getCadastrosProdutos).mockResolvedValue([])

    // Simula registros de validades da base com Cliente 7 repetido 3 vezes
    const mockValidades = [
      { cod_cliente: '7', cliente: 'FRUTAP' },
      { cod_cliente: '7', cliente: 'FRUTAP' },
      { cod_cliente: '7', cliente: 'FRUTAP' },
    ]

    vi.spyOn(pb, 'collection').mockImplementation((name: string) => {
      if (name === 'validades_base') {
        return {
          getList: vi.fn().mockResolvedValue({ items: mockValidades, totalPages: 1 }),
        } as any
      }
      if (name === 'rupturas_base') {
        return {
          getList: vi.fn().mockResolvedValue({ items: [], totalPages: 1 }),
        } as any
      }
      if (name === 'industry_registry') {
        return {
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

    expect(resultado.industrias.descobertas).toBe(1)
    expect(resultado.industrias.vinculadas).toBe(1)
    expect(resultado.industrias.pendentes).toBe(0)
    expect(resultado.industrias.detalhes[0].id).toBe('ind_frutap')
    expect(resultado.industrias.detalhes[0].status).toBe('vinculado_seguro')
  })

  it('2. Cliente desconhecido -> gera UMA pendência consolidada com contador de ocorrências', async () => {
    vi.mocked(getCadastrosIndustrias).mockResolvedValue([])
    vi.mocked(getCadastrosRedes).mockResolvedValue([])
    vi.mocked(getCadastrosLojas).mockResolvedValue([])
    vi.mocked(getCadastrosSupervisores).mockResolvedValue([])
    vi.mocked(getCadastrosPromotores).mockResolvedValue([])
    vi.mocked(getCadastrosProdutos).mockResolvedValue([])

    const mockValidades = [
      { cod_cliente: '99', cliente: 'INDÚSTRIA DESCONHECIDA' },
      { cod_cliente: '99', cliente: 'INDÚSTRIA DESCONHECIDA' },
    ]

    const pendenciaCreateSpy = vi.fn().mockResolvedValue({ id: 'pend_1' })
    const pendenciaUpdateSpy = vi.fn().mockResolvedValue({})

    vi.spyOn(pb, 'collection').mockImplementation((name: string) => {
      if (name === 'validades_base') {
        return {
          getList: vi.fn().mockResolvedValue({ items: mockValidades, totalPages: 1 }),
        } as any
      }
      if (name === 'rupturas_base') {
        return {
          getList: vi.fn().mockResolvedValue({ items: [], totalPages: 1 }),
        } as any
      }
      if (name === 'cadastros_pendencias') {
        return {
          getList: vi.fn().mockResolvedValue({ items: [] }),
          create: pendenciaCreateSpy,
          update: pendenciaUpdateSpy,
        } as any
      }
      return {
        getList: vi.fn().mockResolvedValue({ items: [] }),
      } as any
    })

    const resultado = await executarHomologacaoCadastralBaseAtual('Tester')

    expect(resultado.industrias.descobertas).toBe(1)
    expect(resultado.industrias.vinculadas).toBe(0)
    expect(resultado.industrias.pendentes).toBe(1)
    expect(pendenciaCreateSpy).toHaveBeenCalledTimes(1)
    expect(pendenciaCreateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo_entidade: 'industria',
        valor_identificador: '99',
        status: 'pendente',
      }),
    )
  })

  it('3. Fornecedor DIRETORIA NUNCA vira Indústria (semântica oficial confirmada)', async () => {
    vi.mocked(getCadastrosIndustrias).mockResolvedValue([])
    vi.mocked(getCadastrosRedes).mockResolvedValue([])
    vi.mocked(getCadastrosLojas).mockResolvedValue([])
    vi.mocked(getCadastrosSupervisores).mockResolvedValue([])
    vi.mocked(getCadastrosPromotores).mockResolvedValue([])
    vi.mocked(getCadastrosProdutos).mockResolvedValue([])

    // Registro com fornecedor DIRETORIA mas sem cod_cliente de indústria
    const mockValidades = [
      { fornecedor: 'DIRETORIA', cliente: '085 - FORT ATACADISTA' }, // aqui "cliente" no item de validade é a loja, não a indústria!
    ]

    vi.spyOn(pb, 'collection').mockImplementation((name: string) => {
      if (name === 'validades_base') {
        return {
          getList: vi.fn().mockResolvedValue({ items: mockValidades, totalPages: 1 }),
        } as any
      }
      if (name === 'rupturas_base') {
        return {
          getList: vi.fn().mockResolvedValue({ items: [], totalPages: 1 }),
        } as any
      }
      return {
        getList: vi.fn().mockResolvedValue({ items: [] }),
      } as any
    })

    const resultado = await executarHomologacaoCadastralBaseAtual('Tester')

    // Nenhuma indústria deve ser criada ou descoberta a partir de "DIRETORIA"
    expect(resultado.industrias.descobertas).toBe(0)
    expect(resultado.industrias.vinculadas).toBe(0)
  })

  it('4. Fantasia GRUPO PEREIRA -> Rede Grupo Pereira', async () => {
    vi.mocked(getCadastrosIndustrias).mockResolvedValue([])
    vi.mocked(getCadastrosRedes).mockResolvedValue([
      { id: 'rede_pereira', nome: 'Grupo Pereira', ativo: true } as any,
    ])
    vi.mocked(getCadastrosLojas).mockResolvedValue([])
    vi.mocked(getCadastrosSupervisores).mockResolvedValue([])
    vi.mocked(getCadastrosPromotores).mockResolvedValue([])
    vi.mocked(getCadastrosProdutos).mockResolvedValue([])

    const mockValidades = [{ fantasia: 'GRUPO PEREIRA' }, { fantasia: 'Grupo Pereira' }]

    vi.spyOn(pb, 'collection').mockImplementation((name: string) => {
      if (name === 'validades_base') {
        return {
          getList: vi.fn().mockResolvedValue({ items: mockValidades, totalPages: 1 }),
        } as any
      }
      if (name === 'rupturas_base') {
        return {
          getList: vi.fn().mockResolvedValue({ items: [], totalPages: 1 }),
        } as any
      }
      return {
        getList: vi.fn().mockResolvedValue({ items: [] }),
      } as any
    })

    const resultado = await executarHomologacaoCadastralBaseAtual('Tester')

    expect(resultado.redes.descobertas).toBe(1)
    expect(resultado.redes.vinculadas).toBe(1)
    expect(resultado.redes.detalhes[0].id).toBe('rede_pereira')
  })

  it('5. Razão Social contextualizada -> Loja correta e mesma Loja recebida várias vezes não duplica', async () => {
    vi.mocked(getCadastrosIndustrias).mockResolvedValue([])
    vi.mocked(getCadastrosRedes).mockResolvedValue([
      { id: 'rede_pereira', nome: 'Grupo Pereira', ativo: true } as any,
    ])
    vi.mocked(getCadastrosLojas).mockResolvedValue([
      {
        id: 'loja_085',
        codigo_externo: '085',
        razao_social: '085 - FORT ATACADISTA JARAGUA DO SUL',
        nome: 'Fort Atacadista Jaraguá',
        ativo: true,
      } as any,
    ])
    vi.mocked(getCadastrosSupervisores).mockResolvedValue([])
    vi.mocked(getCadastrosPromotores).mockResolvedValue([])
    vi.mocked(getCadastrosProdutos).mockResolvedValue([])

    const mockValidades = [
      {
        codigo_loja: '085',
        razao_social: '085 - FORT ATACADISTA JARAGUÁ DO SUL',
        fantasia: 'GRUPO PEREIRA',
      },
      {
        codigo_loja: '085',
        razao_social: '085 - FORT ATACADISTA JARAGUÁ DO SUL',
        fantasia: 'GRUPO PEREIRA',
      },
      {
        razao_social: '085 - FORT ATACADISTA JARAGUA DO SUL',
        fantasia: 'GRUPO PEREIRA',
      },
    ]

    vi.spyOn(pb, 'collection').mockImplementation((name: string) => {
      if (name === 'validades_base') {
        return {
          getList: vi.fn().mockResolvedValue({ items: mockValidades, totalPages: 1 }),
        } as any
      }
      if (name === 'rupturas_base') {
        return {
          getList: vi.fn().mockResolvedValue({ items: [], totalPages: 1 }),
        } as any
      }
      if (name === 'stores') {
        return {
          update: vi.fn().mockResolvedValue({}),
        } as any
      }
      return {
        getList: vi.fn().mockResolvedValue({ items: [] }),
      } as any
    })

    const resultado = await executarHomologacaoCadastralBaseAtual('Tester')

    expect(resultado.lojas.descobertas).toBe(1)
    expect(resultado.lojas.vinculadas).toBe(1)
    expect(resultado.lojas.pendentes).toBe(0)
    expect(resultado.lojas.detalhes[0].id).toBe('loja_085')
  })

  it('6. Cód. Colaborador -> Promotor correto; Cód. Supervisor -> Supervisor correto', async () => {
    vi.mocked(getCadastrosIndustrias).mockResolvedValue([])
    vi.mocked(getCadastrosRedes).mockResolvedValue([])
    vi.mocked(getCadastrosLojas).mockResolvedValue([])
    vi.mocked(getCadastrosSupervisores).mockResolvedValue([
      { id: 'sup_10', codigo_externo: '10', nome: 'Carlos Supervisor', status: 'ativo' } as any,
    ])
    vi.mocked(getCadastrosPromotores).mockResolvedValue([
      { id: 'prom_50', codigo_externo: '50', nome: 'Ana Promotora', status: 'ativo' } as any,
    ])
    vi.mocked(getCadastrosProdutos).mockResolvedValue([])

    const mockValidades = [
      {
        cod_colaborador: '50',
        colaborador: 'Ana Promotora',
        cod_supervisor: '10',
        supervisor: 'Carlos Supervisor',
      },
    ]

    vi.spyOn(pb, 'collection').mockImplementation((name: string) => {
      if (name === 'validades_base') {
        return {
          getList: vi.fn().mockResolvedValue({ items: mockValidades, totalPages: 1 }),
        } as any
      }
      if (name === 'rupturas_base') {
        return {
          getList: vi.fn().mockResolvedValue({ items: [], totalPages: 1 }),
        } as any
      }
      return {
        getList: vi.fn().mockResolvedValue({ items: [] }),
      } as any
    })

    const resultado = await executarHomologacaoCadastralBaseAtual('Tester')

    expect(resultado.promotores.vinculados).toBe(1)
    expect(resultado.supervisores.vinculados).toBe(1)
    expect(resultado.vinculosObservados.supervisorPromotor).toBe(1)
  })

  it('7. Produto com Indústria + Código -> Produto correto; Sem contexto -> Pendência/Ambiguidade', async () => {
    vi.mocked(getCadastrosIndustrias).mockResolvedValue([
      {
        id: 'ind_frutap',
        nome: 'Frutap',
        tradepro_client_id: '7',
        status: 'ativa',
      } as any,
    ])
    vi.mocked(getCadastrosRedes).mockResolvedValue([])
    vi.mocked(getCadastrosLojas).mockResolvedValue([])
    vi.mocked(getCadastrosSupervisores).mockResolvedValue([])
    vi.mocked(getCadastrosPromotores).mockResolvedValue([])
    vi.mocked(getCadastrosProdutos).mockResolvedValue([
      {
        id: 'prod_iogurte',
        industry_id: 'ind_frutap',
        codigo_produto: 'P100',
        nome_produto: 'Iogurte Morango 1L',
        tipo_mix: 'oficial_industria',
      } as any,
    ])

    const mockValidades = [
      // Com contexto de indústria e código -> resolve
      { cod_cliente: '7', cod_produto: 'P100', produto: 'Iogurte Morango 1L' },
      // Sem contexto de indústria -> ambíguo
      { cod_produto: 'P200', produto: 'Bebida Láctea Sem Indústria' },
    ]

    vi.spyOn(pb, 'collection').mockImplementation((name: string) => {
      if (name === 'validades_base') {
        return {
          getList: vi.fn().mockResolvedValue({ items: mockValidades, totalPages: 1 }),
        } as any
      }
      if (name === 'rupturas_base') {
        return {
          getList: vi.fn().mockResolvedValue({ items: [], totalPages: 1 }),
        } as any
      }
      if (name === 'cadastros_pendencias') {
        return {
          getList: vi.fn().mockResolvedValue({ items: [] }),
          create: vi.fn().mockResolvedValue({}),
          update: vi.fn().mockResolvedValue({}),
        } as any
      }
      return {
        getList: vi.fn().mockResolvedValue({ items: [] }),
      } as any
    })

    const resultado = await executarHomologacaoCadastralBaseAtual('Tester')

    expect(resultado.produtos.resolvidos).toBe(1)
    expect(resultado.produtos.ambiguos).toBe(1)
  })

  it('8. Correção manual preservada: edicao_manual = true não é sobrescrita pela API', async () => {
    const updateSpy = vi.fn().mockResolvedValue({})

    vi.mocked(getCadastrosIndustrias).mockResolvedValue([
      {
        id: 'ind_editada',
        nome: 'Frutap Nome Corrigido Manualmente',
        tradepro_client_id: '7',
        edicao_manual: true,
        status: 'ativa',
      } as any,
    ])
    vi.mocked(getCadastrosRedes).mockResolvedValue([])
    vi.mocked(getCadastrosLojas).mockResolvedValue([])
    vi.mocked(getCadastrosSupervisores).mockResolvedValue([])
    vi.mocked(getCadastrosPromotores).mockResolvedValue([])
    vi.mocked(getCadastrosProdutos).mockResolvedValue([])

    const mockValidades = [{ cod_cliente: '7', cliente: 'FRUTAP NOME DA FONTE' }]

    vi.spyOn(pb, 'collection').mockImplementation((name: string) => {
      if (name === 'validades_base') {
        return {
          getList: vi.fn().mockResolvedValue({ items: mockValidades, totalPages: 1 }),
        } as any
      }
      if (name === 'rupturas_base') {
        return {
          getList: vi.fn().mockResolvedValue({ items: [], totalPages: 1 }),
        } as any
      }
      if (name === 'industry_registry') {
        return {
          update: updateSpy,
        } as any
      }
      return {
        getList: vi.fn().mockResolvedValue({ items: [] }),
      } as any
    })

    const resultado = await executarHomologacaoCadastralBaseAtual('Tester')

    // Não deve sobrescrever o registro manual
    expect(resultado.industrias.vinculadas).toBe(1)
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it('9. Idempotência e Consolidação de Pendências: registrarPendenciaConsolidada reutiliza pendência aberta', async () => {
    const updateSpy = vi.fn().mockResolvedValue({})
    const createSpy = vi.fn().mockResolvedValue({})

    vi.spyOn(pb, 'collection').mockImplementation((name: string) => {
      if (name === 'cadastros_pendencias') {
        return {
          getList: vi.fn().mockResolvedValue({
            items: [
              {
                id: 'pend_existente',
                tipo_entidade: 'loja',
                valor_identificador: '999',
                volume_ocorrencias: 5,
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

    await registrarPendenciaConsolidada('loja', '999', '999', 'Loja Não Cadastrada')

    expect(createSpy).not.toHaveBeenCalled()
    expect(updateSpy).toHaveBeenCalledWith(
      'pend_existente',
      expect.objectContaining({
        volume_ocorrencias: 6,
      }),
    )
  })
})
