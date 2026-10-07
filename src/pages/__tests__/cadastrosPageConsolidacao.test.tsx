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
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}))

// Dados de teste mockados
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
  {
    id: 'rede_atacadao',
    nome: 'ATACADÃO',
    codigo_externo: 'ATAC',
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
  {
    id: 'loja_185',
    codigo_externo: '185',
    codigo_loja: '185',
    nome: 'FORT ATACADISTA IÇARA',
    razao_social: '185 - FORT ATACADISTA IÇARA',
    network_id: 'rede_pereira',
    rede_nome: 'GRUPO PEREIRA',
    cidade: 'Içara',
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
    total_lojas: 2,
    industrias_relacionadas: ['FRUTAP'],
  },
]

const mockPendencias: CadastroPendencia[] = [
  {
    id: 'pen_1',
    tipo_entidade: 'industria',
    valor_identificador: '7',
    nome_identificado: 'FRUTAPINHO ALIMENTOS',
    codigo_externo: '7',
    origem_fonte: 'tradepro_rupturas',
    status: 'pendente',
    volume_ocorrencias: 3,
  },
]

const mockAssignments: CadastroPromotorAssignment[] = [
  {
    id: 'ass_1',
    promoter_id: 'prom_1',
    promoter_nome: 'JOÃO BATISTA',
    store_code: '165',
    store_name: '165 - FORT ATACADISTA AVENTUREIRO',
    industry_name: 'FRUTAP',
    status: 'ativo',
    tipo_vinculo: 'confirmado',
  },
]

describe('CadastrosPage — Consolidação nas 4 Grandes Famílias', () => {
  beforeEach(() => {
    vi.spyOn(cadastrosService, 'getCadastrosIndustrias').mockResolvedValue(mockIndustrias)
    vi.spyOn(cadastrosService, 'getCadastrosProdutos').mockResolvedValue(mockProdutos)
    vi.spyOn(cadastrosService, 'getCadastrosRedes').mockResolvedValue(mockRedes)
    vi.spyOn(cadastrosService, 'getCadastrosLojas').mockResolvedValue(mockLojas)
    vi.spyOn(cadastrosService, 'getCadastrosSupervisores').mockResolvedValue(mockSupervisores)
    vi.spyOn(cadastrosService, 'getCadastrosPromotores').mockResolvedValue(mockPromotores)
    vi.spyOn(cadastrosService, 'getCadastrosPendencias').mockResolvedValue(mockPendencias)
    vi.spyOn(cadastrosService, 'getPromoterAssignments').mockResolvedValue(mockAssignments)
    vi.spyOn(cadastrosService, 'getProductOperationalStats').mockResolvedValue({
      lojasComMixDefinido: [{ store_code: '165', store_name: 'FORT ATACADISTA AVENTUREIRO' }],
      lojasObservadas: [
        { store_code: '165', store_name: 'FORT ATACADISTA AVENTUREIRO', ultima_data: '2026-03-30' },
      ],
      ultimaObservacao: '2026-03-30',
      totalRupturasRelacionadas: 2,
      totalValidadesRelacionadas: 5,
    })
  })

  // 1. Renderiza as 4 famílias principais consolidando as 7 abas antigas
  it('apresenta exatamente as 4 grandes famílias de cadastros', async () => {
    render(<CadastrosPage />)

    await waitFor(() => {
      expect(screen.getByText('Indústrias / Marcas')).toBeInTheDocument()
      expect(screen.getByText('Redes & Lojas')).toBeInTheDocument()
      expect(screen.getByText('Equipe de Campo')).toBeInTheDocument()
      expect(screen.getByText('Pendências')).toBeInTheDocument()
    })
  })

  // 2. Família Indústrias: alterna para [Todos os Produtos] e compartilha a mesma base
  it('permite alternar entre Indústrias e Todos os Produtos com filtro por indústria e ordenação', async () => {
    render(<CadastrosPage />)

    await waitFor(() => {
      expect(screen.getByText('FRUTAP')).toBeInTheDocument()
      expect(screen.getByText('CHULETÃO')).toBeInTheDocument()
    })

    // Alterna para "Todos os Produtos"
    const btnTodosProdutos = screen.getByRole('button', { name: /Todos os Produtos/i })
    fireEvent.click(btnTodosProdutos)

    await waitFor(() => {
      // Exibe os produtos de todas as indústrias
      expect(screen.getByText('IOGURTE FRUTAP MORANGO 170G')).toBeInTheDocument()
      expect(screen.getByText('LINGUIÇA CALABRESA CHULETÃO 500G')).toBeInTheDocument()
    })

    // Botão de ordenação A–Z presente
    expect(screen.getByTitle(/Alternar ordenação A–Z/i)).toBeInTheDocument()
  })

  // 3. Ficha da Indústria exibe seus Produtos & Mix e permite ação no Mix Oficial sem deletar
  it('abre ficha da indústria e lista seus produtos com ação de Mix Oficial', async () => {
    const saveProdutoSpy = vi.spyOn(cadastrosService, 'saveCadastroProduto').mockResolvedValue({
      ...mockProdutos[0],
      tipo_mix: 'observado_operacional',
    })

    render(<CadastrosPage />)

    await waitFor(() => {
      expect(screen.getByText('FRUTAP')).toBeInTheDocument()
    })

    // Clica no botão "Ficha Completa" da Frutap
    const btnsFicha = screen.getAllByRole('button', { name: /Ficha Completa/i })
    fireEvent.click(btnsFicha[0])

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Produtos & Mix/i })).toBeInTheDocument()
    })

    // Clica na seção de Produtos & Mix
    fireEvent.click(screen.getByRole('button', { name: /Produtos & Mix/i }))

    await waitFor(() => {
      expect(screen.getByText('IOGURTE FRUTAP MORANGO 170G')).toBeInTheDocument()
    })

    // Ação de remover do mix oficial
    const btnRemoverMix = screen.getByRole('button', { name: /Remover do Mix/i })
    fireEvent.click(btnRemoverMix)

    await waitFor(() => {
      expect(saveProdutoSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'prod_1',
          tipo_mix: 'observado_operacional',
        }),
      )
    })
  })

  // 4. Redes & Lojas: lista Redes com contagem de lojas e abre lojas da rede
  it('família Redes & Lojas lista redes com contagem e abre as lojas da rede selecionada', async () => {
    render(<CadastrosPage />)

    // Clica na família Redes & Lojas
    const tabRedes = screen.getByRole('button', { name: /Redes & Lojas/i })
    fireEvent.click(tabRedes)

    await waitFor(() => {
      expect(screen.getByText('GRUPO PEREIRA')).toBeInTheDocument()
      expect(screen.getByText(/2 lojas/i)).toBeInTheDocument()
    })

    // Clica para ver as lojas da rede
    const btnVerLojas = screen.getByRole('button', { name: /Ver Lojas da Rede/i })
    fireEvent.click(btnVerLojas)

    await waitFor(() => {
      expect(screen.getByText('165 - FORT ATACADISTA AVENTUREIRO')).toBeInTheDocument()
      expect(screen.getByText('185 - FORT ATACADISTA IÇARA')).toBeInTheDocument()
    })
  })

  // 5. Transferência de Loja de Rede (Mover Loja) auditada
  it('permite mover loja para outra rede de forma auditada', async () => {
    const moverLojaSpy = vi.spyOn(cadastrosService, 'moverLojaDeRede').mockResolvedValue({
      ...mockLojas[0],
      network_id: 'rede_atacadao',
      rede_nome: 'ATACADÃO',
    })

    render(<CadastrosPage />)

    fireEvent.click(screen.getByRole('button', { name: /Redes & Lojas/i }))

    await waitFor(() => {
      expect(screen.getByText('GRUPO PEREIRA')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Ver Lojas da Rede/i }))

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /Mover/i })[0]).toBeInTheDocument()
    })

    // Clica em Mover loja 165
    fireEvent.click(screen.getAllByRole('button', { name: /Mover/i })[0])

    await waitFor(() => {
      expect(screen.getByText('Mover Loja para Outra Rede')).toBeInTheDocument()
      expect(screen.getByText(/Confirmar Transferência/i)).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Confirmar Transferência/i }))

    await waitFor(() => {
      expect(moverLojaSpy).toHaveBeenCalledWith(
        'loja_165',
        expect.anything(),
        expect.anything(),
        expect.anything(),
      )
    })
  })

  // 6. Equipe de Campo: Promotores e Supervisores agrupados com alternância
  it('família Equipe de Campo agrupa Promotores e Supervisores com alternância', async () => {
    render(<CadastrosPage />)

    fireEvent.click(screen.getByRole('button', { name: /Equipe de Campo/i }))

    await waitFor(() => {
      // Subvisão de Promotores
      expect(screen.getByText('JOÃO BATISTA')).toBeInTheDocument()
      expect(screen.getByText(/Supervisor: CARLOS SILVA/i)).toBeInTheDocument()
    })

    // Alterna para Supervisores
    fireEvent.click(screen.getByRole('button', { name: /Supervisores/i }))

    await waitFor(() => {
      expect(screen.getByText('CARLOS SILVA')).toBeInTheDocument()
      expect(screen.getByText(/1 promotores/i)).toBeInTheDocument()
    })
  })

  // 7. Fila de Pendências: permite vincular entidade
  it('família Pendências exibe fila e abre modal de vinculação assistida', async () => {
    render(<CadastrosPage />)

    fireEvent.click(screen.getByRole('button', { name: /Pendências/i }))

    await waitFor(() => {
      expect(screen.getByText('FRUTAPINHO ALIMENTOS')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Vincular Entidade/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Vincular Entidade/i }))

    await waitFor(() => {
      expect(screen.getByText(/Vincular industria Pendente/i)).toBeInTheDocument()
    })
  })
})
