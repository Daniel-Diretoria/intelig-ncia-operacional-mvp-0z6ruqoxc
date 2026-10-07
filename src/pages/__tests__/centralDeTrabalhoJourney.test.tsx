import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { CentralDeTrabalhoPage } from '@/pages/CentralDeTrabalho'
import { IndustriasPage } from '@/pages/Industrias'
import * as useValidadesModule from '@/services/useValidades'
import * as useRupturasModule from '@/services/useRupturas'

const mockValidades = [
  {
    id: 'v1',
    codigoLoja: '165',
    loja: 'FORT ATACADISTA KOBRASOL',
    cidade: 'São José',
    uf: 'SC',
    product: 'LEITE CONDENSADO PIRACANJUBA 395G',
    cliente: 'PIRACANJUBA',
    diasRestantes: 5,
    validade: '2026-09-02',
    quantidade: 12,
    status: 'Crítico',
  },
  {
    id: 'v2',
    codigoLoja: '165',
    loja: 'FORT ATACADISTA KOBRASOL',
    cidade: 'São José',
    uf: 'SC',
    product: 'CREME DE LEITE PIRACANJUBA 200G',
    cliente: 'PIRACANJUBA',
    diasRestantes: 18,
    validade: '2026-09-15',
    quantidade: 30,
    status: 'Atenção',
  },
]

const mockRupturas = [
  {
    id: 'r1',
    codigo_loja: '165',
    nome_loja: 'FORT ATACADISTA KOBRASOL',
    cidade: 'São José',
    estado: 'SC',
    produto: 'MANTEIGA PIRACANJUBA 200G',
    cliente: 'PIRACANJUBA',
    situacao_atual: 'Ativo',
    dias_em_ruptura: 4,
    motivo: 'Ruptura Total',
  },
]

describe('Fase 1: Central de Trabalho & Indústrias', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(useValidadesModule, 'useValidades').mockReturnValue({
      data: mockValidades as any,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })
    vi.spyOn(useRupturasModule, 'useRupturas').mockReturnValue({
      data: mockRupturas as any,
      filteredRupturas: mockRupturas as any,
      historicoRupturas: [],
      conflitos: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      kpis: null,
    })
  })

  it('Central de Trabalho renderiza "O que está acontecendo", "O que eu faço agora" e saúde por dimensão', async () => {
    render(
      <MemoryRouter>
        <CentralDeTrabalhoPage />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('Central de Trabalho')).toBeTruthy()
      expect(screen.getByText('O que está acontecendo na operação?')).toBeTruthy()
      expect(screen.getByText('O que eu faço agora?')).toBeTruthy()
      expect(screen.getByText(/Lojas que exigem atenção/i)).toBeTruthy()
      expect(screen.getByText(/Produtos que exigem atenção/i)).toBeTruthy()
    })

    // Explicação do motivo sem classificação vazia
    expect(screen.getByText(/Por que importa:/i)).toBeTruthy()

    // Espaços preparados e desativados "Em breve" presentes sem dados falsos
    expect(screen.getByText(/Ocorrências Abertas/i)).toBeTruthy()
    expect(screen.getByText(/NF \/ Devoluções/i)).toBeTruthy()
  })

  it('Página de Indústrias renderiza KPIs reais e tabela agregada sem dados inventados', async () => {
    render(
      <MemoryRouter>
        <IndustriasPage />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText(/Cockpit Operacional — Indústrias \/ Marcas/i)).toBeTruthy()
      expect(screen.getByText('PIRACANJUBA')).toBeTruthy()
      expect(screen.getByText('Total de Indústrias')).toBeTruthy()
      expect(screen.getByText('Nova Indústria')).toBeTruthy()
    })
  })
})
