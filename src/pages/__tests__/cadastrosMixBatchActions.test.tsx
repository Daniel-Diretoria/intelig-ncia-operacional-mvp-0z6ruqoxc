import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { CadastrosPage } from '@/pages/CadastrosPage'
import * as cadastrosService from '@/services/cadastrosService'
import type {
  CadastroIndustria,
  CadastroProduto,
  CadastroRede,
  CadastroLoja,
  CadastroSupervisor,
  CadastroPromotor,
  CadastroPendencia,
  CadastroPromotorAssignment,
} from '@/types/cadastros'

// Mock do contexto de autenticação
vi.mock('@/services/authContext', () => ({
  useAuth: () => ({
    user: { id: 'user_1', name: 'Administrador Teste', role: 'admin' },
    can: (perm: string) => true,
  }),
}))

// Mock do toast
const mockToast = vi.fn()
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: mockToast,
  }),
}))

const mockIndustrias: CadastroIndustria[] = [
  {
    id: 'ind_frutap',
    nome: 'FRUTAP',
    nome_chave: 'FRUTAP',
    razao_social: 'Frutap Laticínios Ltda',
    segmento: 'Laticínios',
    status: 'ativa',
    tradepro_client_id: '7',
  },
  {
    id: 'ind_chuletao',
    nome: 'CHULETÃO',
    nome_chave: 'CHULETAO',
    razao_social: 'Chuletão Carnes Ltda',
    segmento: 'Carnes',
    status: 'ativa',
    tradepro_client_id: '12',
  },
]

const mockProdutos: CadastroProduto[] = [
  {
    id: 'prod_1',
    nome_produto: 'IOGURTE FRUTAP MORANGO 170G',
    industry_id: 'ind_frutap',
    industry_name: 'FRUTAP',
    codigo_produto: '101',
    tipo_mix: 'oficial_industria',
    status: 'ativo',
    familia: 'Iogurtes',
    sabor: 'Morango',
    gramatura: '170g',
  },
  {
    id: 'prod_2',
    nome_produto: 'BEBIDA LACTEA CHOCOLATE 200ML',
    industry_id: 'ind_frutap',
    industry_name: 'FRUTAP',
    codigo_produto: '102',
    tipo_mix: 'observado_operacional',
    status: 'ativo',
    familia: 'Bebidas Lácteas',
    sabor: 'Chocolate',
    gramatura: '200ml',
  },
  {
    id: 'prod_3',
    nome_produto: 'LEITE FERMENTADO FRUTAP 80G',
    industry_id: 'ind_frutap',
    industry_name: 'FRUTAP',
    codigo_produto: '103',
    tipo_mix: 'observado_operacional',
    status: 'ativo',
    familia: 'Leites Fermentados',
    sabor: 'Tradicional',
    gramatura: '80g',
  },
  {
    id: 'prod_4',
    nome_produto: 'LINGUIÇA CALABRESA CHULETÃO 500G',
    industry_id: 'ind_chuletao',
    industry_name: 'CHULETÃO',
    codigo_produto: '201',
    tipo_mix: 'oficial_industria',
    status: 'ativo',
    familia: 'Defumados',
    sabor: 'Tradicional',
    gramatura: '500g',
  },
]

const mockRedes: CadastroRede[] = [
  {
    id: 'rede_pereira',
    nome: 'GRUPO PEREIRA',
    codigo_externo: 'GP',
    ativo: true,
  },
]

const mockLojas: CadastroLoja[] = [
  {
    id: 'loja_165',
    codigo_externo: '165',
    codigo_loja: '165',
    nome: 'FORT ATACADISTA AVENTUREIRO',
    razao_social: '165 - FORT ATACADISTA AVENTUREIRO',
    network_id: 'rede_pereira',
    rede_nome: 'GRUPO PEREIRA',
    cidade: 'Joinville',
    estado: 'SC',
    ativo: true,
  },
]

const mockSupervisores: CadastroSupervisor[] = [
  {
    id: 'sup_1',
    nome: 'CARLOS SILVA',
    codigo_externo: 'SUP01',
    status: 'ativo',
    total_promotores: 1,
  },
]

const mockPromotores: CadastroPromotor[] = [
  {
    id: 'prom_1',
    nome: 'JOÃO BATISTA',
    codigo_externo: 'PROM01',
    supervisor_id: 'sup_1',
    supervisor_nome: 'CARLOS SILVA',
    status: 'ativo',
    total_lojas: 1,
    industrias_relacionadas: ['FRUTAP'],
  },
]

const mockPendencias: CadastroPendencia[] = []
const mockAssignments: CadastroPromotorAssignment[] = []

describe('CadastrosPage — Ações em Lote no Mix (Item 5 da Consolidação)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(cadastrosService, 'getCadastrosIndustrias').mockResolvedValue(mockIndustrias)
    vi.spyOn(cadastrosService, 'getCadastrosProdutos').mockResolvedValue(mockProdutos)
    vi.spyOn(cadastrosService, 'getCadastrosRedes').mockResolvedValue(mockRedes)
    vi.spyOn(cadastrosService, 'getCadastrosLojas').mockResolvedValue(mockLojas)
    vi.spyOn(cadastrosService, 'getCadastrosSupervisores').mockResolvedValue(mockSupervisores)
    vi.spyOn(cadastrosService, 'getCadastrosPromotores').mockResolvedValue(mockPromotores)
    vi.spyOn(cadastrosService, 'getCadastrosPendencias').mockResolvedValue(mockPendencias)
    vi.spyOn(cadastrosService, 'getPromoterAssignments').mockResolvedValue(mockAssignments)
    vi.spyOn(cadastrosService, 'getProductOperationalStats').mockResolvedValue({
      lojasComMixDefinido: [],
      lojasObservadas: [],
      ultimaObservacao: null,
      totalRupturasRelacionadas: 0,
      totalValidadesRelacionadas: 0,
    })
  })

  // 1. Seleção individual e exibição da barra de ações em lote
  it('exibe barra de ações em lote ao selecionar produtos na tabela Todos os Produtos', async () => {
    render(<CadastrosPage />)

    // Vai para "Todos os Produtos"
    const btnTodos = await screen.findByRole('button', { name: /Todos os Produtos/i })
    fireEvent.click(btnTodos)

    await screen.findByText('IOGURTE FRUTAP MORANGO 170G')

    // Antes de selecionar, a barra não deve estar no DOM
    expect(screen.queryByTestId('mix-batch-actions-bar')).not.toBeInTheDocument()

    // Marca o checkbox do primeiro produto (prod_1)
    const checkboxProd1 = screen.getByLabelText(/Selecionar produto IOGURTE FRUTAP MORANGO 170G/i)
    fireEvent.click(checkboxProd1)

    // A barra surge com 1 selecionado
    const batchBar = await screen.findByTestId('mix-batch-actions-bar')
    expect(batchBar).toBeInTheDocument()
    expect(screen.getByText(/1 produto selecionado/i)).toBeInTheDocument()

    // Desmarca
    fireEvent.click(checkboxProd1)
    expect(screen.queryByTestId('mix-batch-actions-bar')).not.toBeInTheDocument()
  })

  // 2. Seleção de todos os visíveis via checkbox do cabeçalho
  it('marca todos os produtos visíveis ao clicar no checkbox do cabeçalho', async () => {
    render(<CadastrosPage />)

    const btnTodos = await screen.findByRole('button', { name: /Todos os Produtos/i })
    fireEvent.click(btnTodos)

    await screen.findByText('IOGURTE FRUTAP MORANGO 170G')

    const headerCheckbox = screen.getByLabelText(/Selecionar todos os produtos visíveis/i)
    fireEvent.click(headerCheckbox)

    // Total de 4 produtos no mock
    expect(screen.getByText(/4 produtos selecionados/i)).toBeInTheDocument()

    // Clica novamente para desmarcar todos
    fireEvent.click(headerCheckbox)
    expect(screen.queryByTestId('mix-batch-actions-bar')).not.toBeInTheDocument()
  })

  // 3. Botão [Promover Observado → Oficial] só fica ativo se houver produtos observados selecionados
  it('habilita [Promover Observado → Oficial] apenas quando há produtos observados selecionados', async () => {
    render(<CadastrosPage />)

    const btnTodos = await screen.findByRole('button', { name: /Todos os Produtos/i })
    fireEvent.click(btnTodos)

    await screen.findByText('IOGURTE FRUTAP MORANGO 170G')

    // prod_1 é oficial_industria
    const checkboxProd1 = screen.getByLabelText(/Selecionar produto IOGURTE FRUTAP MORANGO 170G/i)
    fireEvent.click(checkboxProd1)

    const btnPromover = screen.getByRole('button', { name: /Promover Observado → Oficial/i })
    // Deve estar desabilitado (0 observados selecionados)
    expect(btnPromover).toBeDisabled()

    // Seleciona prod_2 que é observado_operacional
    const checkboxProd2 = screen.getByLabelText(/Selecionar produto BEBIDA LACTEA CHOCOLATE 200ML/i)
    fireEvent.click(checkboxProd2)

    // Agora deve estar habilitado e indicar (1)
    expect(btnPromover).not.toBeDisabled()
    expect(btnPromover).toHaveTextContent(/Promover Observado → Oficial \(1\)/i)
  })

  // 4. Diálogo de confirmação obrigatório antes de aplicar ação e chamada ao backend
  it('exige confirmação explícita no diálogo antes de executar promoção em lote', async () => {
    const batchActionSpy = vi.spyOn(cadastrosService, 'executeMixBatchAction').mockResolvedValue({
      totalSolicitados: 2,
      sucessos: 2,
      falhas: 0,
      erros: [],
      acao: 'promover_observado_oficial',
    })

    render(<CadastrosPage />)

    const btnTodos = await screen.findByRole('button', { name: /Todos os Produtos/i })
    fireEvent.click(btnTodos)

    await screen.findByText('IOGURTE FRUTAP MORANGO 170G')

    // Seleciona dois produtos observados (prod_2 e prod_3)
    fireEvent.click(screen.getByLabelText(/Selecionar produto BEBIDA LACTEA CHOCOLATE 200ML/i))
    fireEvent.click(screen.getByLabelText(/Selecionar produto LEITE FERMENTADO FRUTAP 80G/i))

    const btnPromover = screen.getByRole('button', { name: /Promover Observado → Oficial/i })
    fireEvent.click(btnPromover)

    // Diálogo de confirmação deve abrir com contagem e regra de governança
    expect(await screen.findByText(/Promover Observado → Mix Oficial\?/i)).toBeInTheDocument()
    expect(
      screen.getByText(
        /Esta ação promoverá 2 produto\(s\) de origem observada para o Mix Oficial/i,
      ),
    ).toBeInTheDocument()
    expect(screen.getByText(/Regra de Governança SKIP/i)).toBeInTheDocument()

    // Confirma no diálogo
    const btnConfirmar = screen.getByRole('button', {
      name: /Confirmar Promoção de 2 Produto\(s\)/i,
    })
    fireEvent.click(btnConfirmar)

    await waitFor(() => {
      expect(batchActionSpy).toHaveBeenCalledWith(
        ['prod_2', 'prod_3'],
        'promover_observado_oficial',
        mockProdutos,
        expect.anything(),
      )
    })

    // Exibe modal de conclusão com contagem
    expect(await screen.findByText(/Ação em Lote Concluída/i)).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  // 5. Ação em Lote dentro da Ficha da Indústria específica
  it('permite seleção em lote na aba de Produtos & Mix da Ficha da Indústria', async () => {
    const batchActionSpy = vi.spyOn(cadastrosService, 'executeMixBatchAction').mockResolvedValue({
      totalSolicitados: 1,
      sucessos: 1,
      falhas: 0,
      erros: [],
      acao: 'adicionar_mix_oficial',
    })

    render(<CadastrosPage />)

    await screen.findByText('FRUTAP')

    // Abre Ficha da Frutap
    const btnsFicha = screen.getAllByRole('button', { name: /Ficha Completa/i })
    fireEvent.click(btnsFicha[0])

    const tabProdMix = await screen.findByRole('button', { name: /Produtos & Mix/i })
    fireEvent.click(tabProdMix)

    await screen.findByText('Catálogo de Produtos desta Indústria')

    // Marca prod_2 na ficha da indústria
    const checkboxProd2 = screen.getByLabelText(/Selecionar produto BEBIDA LACTEA CHOCOLATE 200ML/i)
    fireEvent.click(checkboxProd2)

    // Barra deve abrir indicando contexto da indústria FRUTAP
    const batchBar = await screen.findByTestId('mix-batch-actions-bar')
    expect(batchBar).toBeInTheDocument()
    expect(screen.getByText('FRUTAP')).toBeInTheDocument()

    // Clica em "Adicionar ao Mix Oficial"
    const btnAdicionar = screen.getByRole('button', { name: /Adicionar ao Mix Oficial/i })
    fireEvent.click(btnAdicionar)

    // Confirma
    expect(await screen.findByText(/Adicionar ao Mix Oficial\?/i)).toBeInTheDocument()
    const btnConfirmar = screen.getByRole('button', { name: /Confirmar e Adicionar/i })
    fireEvent.click(btnConfirmar)

    await waitFor(() => {
      expect(batchActionSpy).toHaveBeenCalledWith(
        ['prod_2'],
        'adicionar_mix_oficial',
        mockProdutos,
        expect.anything(),
      )
    })
  })
})
