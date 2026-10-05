import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { IndustryDetailTabs } from '@/components/industrias/IndustryDetailTabs'
import type { UseIndustryOperationalResult } from '@/services/useIndustryOperational'
import type {
  IndustryRegistry,
  IndustryStoreCoverage,
  IndustryProductMix,
  IndustryStoreProductMix,
  IndustryValidityPolicy,
} from '@/types/industryOperational'

// Mock de useAuth
vi.mock('@/services/authContext', () => ({
  useAuth: () => ({
    user: { name: 'Operador Teste', email: 'teste@skip.com' },
  }),
}))

const mockIndustry: IndustryRegistry = {
  id: 'ind-123',
  nome: 'FRUTAP',
  nome_chave: 'FRUTAP',
  status: 'ativa',
  segmento: 'Laticínios',
}

const mockCoverages: IndustryStoreCoverage[] = [
  {
    id: 'cov-1',
    industry_id: 'ind-123',
    industry_name: 'FRUTAP',
    store_code: '310',
    store_name: 'FORT ATACADISTA 310',
    network_name: 'Grupo Pereira',
    status_relacao: 'confirmada',
  },
]

const mockCatalogMix: IndustryProductMix[] = [
  {
    id: 'mix-1',
    industry_id: 'ind-123',
    industry_name: 'FRUTAP',
    codigo_produto: '101',
    nome_produto: 'IOGURTE MORANGO 1L',
    categoria: 'Iogurtes',
    tipo_mix: 'oficial_industria',
    status: 'ativo',
    shelf_life_dias: 45,
  },
  {
    id: 'mix-2',
    industry_id: 'ind-123',
    industry_name: 'FRUTAP',
    codigo_produto: '102',
    nome_produto: 'IOGURTE PESSEGO 1L',
    categoria: 'Iogurtes',
    tipo_mix: 'oficial_industria',
    status: 'ativo',
    shelf_life_dias: 45,
  },
  {
    id: 'mix-3',
    industry_id: 'ind-123',
    industry_name: 'FRUTAP',
    codigo_produto: '103',
    nome_produto: 'LEITE FERMENTADO 180G',
    categoria: 'Fermentados',
    tipo_mix: 'oficial_industria',
    status: 'ativo',
    shelf_life_dias: 30,
  },
]

// Na Loja 310, apenas o IOGURTE MORANGO 1L está no Mix Definido
const mockStoreMixes: IndustryStoreProductMix[] = [
  {
    id: 'smix-1',
    industry_id: 'ind-123',
    store_code: '310',
    store_name: 'FORT ATACADISTA 310',
    codigo_produto: '101',
    nome_produto: 'IOGURTE MORANGO 1L',
    status: 'ativo',
    origem_inclusao: 'acordo_comercial',
  },
]

const mockValidityPolicies: IndustryValidityPolicy[] = [
  {
    id: 'pol-ind',
    industry_id: 'ind-123',
    nivel_regra: 'industria',
    dias_critico: 15,
    dias_atencao: 20,
    dias_moderado: 30,
    shelf_life_padrao_dias: 60,
    ativo: true,
  },
  {
    id: 'pol-exc',
    industry_id: 'ind-123',
    nivel_regra: 'produto_excecao',
    produto_nome: 'IOGURTE MORANGO 1L',
    dias_critico: 7,
    dias_atencao: 12,
    dias_moderado: 20,
    justificativa: 'Validade curta',
    ativo: true,
  },
]

// Validades observadas em loja:
// - IOGURTE MORANGO 1L está presente
// - IOGURTE PESSEGO 1L foi observado na loja 310 mesmo sem estar no Mix Definido!
const mockValidades: any[] = [
  {
    id: 'v1',
    loja: 'FORT ATACADISTA 310',
    product: 'IOGURTE MORANGO 1L',
    cliente: 'FRUTAP',
    diasRestantes: 10,
    quantidade: 50,
  },
  {
    id: 'v2',
    loja: 'FORT ATACADISTA 310',
    product: 'IOGURTE PESSEGO 1L',
    cliente: 'FRUTAP',
    diasRestantes: 25,
    quantidade: 30,
  },
]

describe('Refinamento do Conceito de Mix: Mix Oficial vs Definido da Loja vs Observado', () => {
  let mockOperational: UseIndustryOperationalResult

  beforeEach(() => {
    vi.clearAllMocks()
    mockOperational = {
      industry: mockIndustry,
      coverages: mockCoverages,
      mix: mockCatalogMix,
      storeMixes: mockStoreMixes,
      researchConfigs: [],
      validityPolicies: mockValidityPolicies,
      audits: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      saveIndustry: vi.fn(),
      saveCoverage: vi.fn(),
      removeCoverage: vi.fn(),
      saveMixItem: vi.fn(),
      removeMixItem: vi.fn(),
      saveStoreMixItem: vi.fn().mockResolvedValue({} as any),
      removeStoreMixItem: vi.fn().mockResolvedValue(true),
      saveResearch: vi.fn(),
      savePolicy: vi.fn(),
      removePolicy: vi.fn(),
      resolvePolicyForProduct: (productName: string) => {
        if (productName.toUpperCase() === 'IOGURTE MORANGO 1L') {
          return {
            diasCritico: 7,
            diasAtencao: 12,
            diasModerado: 20,
            origem: 'produto_excecao',
            detalhesOrigem: 'Exceção personalizada',
          }
        }
        return {
          diasCritico: 15,
          diasAtencao: 20,
          diasModerado: 30,
          origem: 'industria',
          detalhesOrigem: 'Política da indústria',
        }
      },
    }
  })

  it('exibe os 3 conceitos distintos e permite navegar para a Visão por Loja', async () => {
    render(
      <IndustryDetailTabs operational={mockOperational} validades={mockValidades} rupturas={[]} />,
    )

    // Clica na aba Mix de Produtos
    const mixTabButton = screen.getByRole('button', { name: /Mix de Produtos/i })
    fireEvent.click(mixTabButton)

    // Verifica a presença explícita dos 3 conceitos com texto didático
    expect(screen.getByText(/1. Mix Oficial da Indústria/i)).toBeTruthy()
    expect(screen.getByText(/2. Mix Definido da Loja/i)).toBeTruthy()
    expect(screen.getByText(/3. Mix Operacional Observado/i)).toBeTruthy()

    // Clica na sub-aba de Visão por Loja
    const storeViewButton = screen.getByRole('button', { name: /Visão por Loja/i })
    fireEvent.click(storeViewButton)

    // Loja selecionada no select
    expect(screen.getByText(/Selecione a Loja para Analisar o Mix/i)).toBeTruthy()
    expect(screen.getByDisplayValue(/FORT ATACADISTA 310/i)).toBeTruthy()
  })

  it('na Visão por Loja, sinaliza produto observado mas não cadastrado no Mix Definido com texto explícito', async () => {
    render(
      <IndustryDetailTabs operational={mockOperational} validades={mockValidades} rupturas={[]} />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Mix de Produtos/i }))
    fireEvent.click(screen.getByRole('button', { name: /Visão por Loja/i }))

    // IOGURTE PESSEGO 1L foi observado na loja 310 mas NÃO está no mockStoreMixes
    await waitFor(() => {
      expect(screen.getByText('IOGURTE PESSEGO 1L')).toBeTruthy()
      expect(
        screen.getByText(/Produto observado nesta loja, mas não cadastrado no mix definido/i),
      ).toBeTruthy()
    })

    // IOGURTE MORANGO 1L pertence ao mix definido e possui presença recente
    expect(screen.getByText('IOGURTE MORANGO 1L')).toBeTruthy()
    expect(screen.getByText(/Mix da Loja: Sim/i)).toBeTruthy()
    expect(screen.getByText(/Presença Recente: Sim/i)).toBeTruthy()

    // LEITE FERMENTADO 180G pertence ao catálogo oficial, mas não está no mix definido da loja nem foi observado
    expect(screen.getByText('LEITE FERMENTADO 180G')).toBeTruthy()
    expect(screen.getByText(/Não pertence ao Mix Definido da loja/i)).toBeTruthy()
  })

  it('permite que o usuário autorizado avalie e clique em Adicionar ao Mix da Loja sem inclusão automática', async () => {
    render(
      <IndustryDetailTabs operational={mockOperational} validades={mockValidades} rupturas={[]} />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Mix de Produtos/i }))
    fireEvent.click(screen.getByRole('button', { name: /Visão por Loja/i }))

    // Encontra o botão "Adicionar ao Mix da Loja" para o produto observado
    const addButtons = screen.getAllByRole('button', { name: /Adicionar ao Mix da Loja/i })
    expect(addButtons.length).toBeGreaterThan(0)
    fireEvent.click(addButtons[0])

    // Verifica abertura do modal com preenchimento da loja e do produto
    await waitFor(() => {
      expect(screen.getByText('Adicionar Produto ao Mix Definido da Loja')).toBeTruthy()
      expect(screen.getByText(/Confirmação manual/i)).toBeTruthy()
    })

    const confirmButton = screen.getByRole('button', { name: /Confirmar e Adicionar ao Mix/i })
    fireEvent.click(confirmButton)

    await waitFor(() => {
      expect(mockOperational.saveStoreMixItem).toHaveBeenCalledTimes(1)
    })
  })

  it('na Política de Validade, exibe claramente a origem da regra ("Usando política da indústria" / "Política personalizada do produto")', async () => {
    render(
      <IndustryDetailTabs operational={mockOperational} validades={mockValidades} rupturas={[]} />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Política de Validade/i }))

    await waitFor(() => {
      expect(screen.getByText('Usando política da indústria')).toBeTruthy()
      expect(screen.getByText('Política personalizada do produto')).toBeTruthy()
      expect(screen.getByText('Resolução Efetiva por Produto do Catálogo')).toBeTruthy()
    })
  })
})
