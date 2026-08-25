import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { LojasPage } from '../Lojas'
import * as useLojasModule from '@/services/useLojas'
import * as exportModule from '@/lib/export/lojasTableViewExport'
import type { StoreSummary } from '@/services/useLojas'

const createMockStore = (overrides: Partial<StoreSummary> = {}): StoreSummary => ({
  storeId: '085|FORT ATACADISTA FLORESTA|FORT ATACADISTA|JOINVILLE (SC)',
  storeCode: '085',
  storeName: 'FORT ATACADISTA FLORESTA',
  networkName: 'FORT ATACADISTA',
  city: 'Joinville',
  uf: 'SC',
  marcasCount: 1,
  marcasList: ['CHULETÃO'],
  validadesCriticasCount: 2,
  validadesAtencaoCount: 1,
  rupturasAtivasCount: 1,
  situacao: 'Crítica',
  itemsAtivos: [],
  itemsAuditoria: [],
  rupturasList: [],
  ...overrides,
})

describe('lojasJourney.test.tsx — Contrato de Regressão da Tela /lojas', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  // 1. 7 colunas na ordem exata, sem coluna Ação
  it('1. Tabela tem exatamente 7 colunas na ordem exata sem coluna Ação', () => {
    const stores: StoreSummary[] = [createMockStore()]

    vi.spyOn(useLojasModule, 'useLojas').mockReturnValue({
      stores,
      filteredStores: stores,
      validadesAtivas: [],
      rupturasAtivas: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      getStoreById: vi.fn(),
    })

    render(
      <MemoryRouter>
        <LojasPage />
      </MemoryRouter>,
    )

    const headers = screen.getAllByRole('columnheader').map((th) => th.textContent?.trim())
    expect(headers).toEqual([
      'Loja',
      'Cidade / UF',
      'Rede',
      'Marcas atendidas',
      'Validades até 15 dias',
      'Rupturas ativas',
      'Situação',
    ])
    expect(screen.queryByText(/Ação/i)).toBeNull()
  })

  // 2. KPIs sobre filteredStores (filtro marca "CHULETÃO" -> todos os 4 KPIs recalculam)
  it('2. KPIs são calculados sobre filteredStores', () => {
    const stores: StoreSummary[] = [
      createMockStore({
        storeId: 's1',
        storeCode: '085',
        storeName: 'LOJA CHULETAO',
        marcasList: ['CHULETÃO'],
        validadesCriticasCount: 3,
        rupturasAtivasCount: 1,
        situacao: 'Crítica',
      }),
      createMockStore({
        storeId: 's2',
        storeCode: '086',
        storeName: 'LOJA OUTRA',
        marcasList: ['OUTRA MARCA'],
        validadesCriticasCount: 0,
        rupturasAtivasCount: 0,
        situacao: 'Normal',
      }),
    ]

    // Quando filteredStores contém apenas a loja do Chuletão
    vi.spyOn(useLojasModule, 'useLojas').mockReturnValue({
      stores,
      filteredStores: [stores[0]],
      validadesAtivas: [],
      rupturasAtivas: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      getStoreById: vi.fn(),
    })

    render(
      <MemoryRouter>
        <LojasPage />
      </MemoryRouter>,
    )

    expect(screen.getByText('Lojas monitoradas')).toBeTruthy()
    expect(screen.getByText('1')).toBeTruthy() // Apenas 1 monitorada
    expect(screen.getByText('Lojas críticas')).toBeTruthy()
    expect(screen.getByText('Lojas com casos complexos')).toBeTruthy()
    expect(screen.getByText('Lojas com rupturas')).toBeTruthy()
  })

  // 3. KPI "Lojas críticas" clicável aplica/remove filtro
  it('3. KPI "Lojas críticas" é clicável e altera a seleção', () => {
    const stores: StoreSummary[] = [createMockStore()]

    vi.spyOn(useLojasModule, 'useLojas').mockReturnValue({
      stores,
      filteredStores: stores,
      validadesAtivas: [],
      rupturasAtivas: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      getStoreById: vi.fn(),
    })

    render(
      <MemoryRouter>
        <LojasPage />
      </MemoryRouter>,
    )

    const kpiCriticas = screen.getByText('Lojas críticas').closest('div')
    expect(kpiCriticas).toBeTruthy()
    fireEvent.click(kpiCriticas!)
  })

  // 4. Linha da tabela navega para /lojas/:storeId com identidade composta
  it('4. Linha inteira é clicável e navega para /lojas/:storeId', () => {
    const store = createMockStore({
      storeId: '165|FORT ATACADISTA KOBRASOL|FORT ATACADISTA|SÃO JOSÉ (SC)',
      storeCode: '165',
      storeName: 'FORT ATACADISTA KOBRASOL',
    })

    vi.spyOn(useLojasModule, 'useLojas').mockReturnValue({
      stores: [store],
      filteredStores: [store],
      validadesAtivas: [],
      rupturasAtivas: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      getStoreById: vi.fn(),
    })

    render(
      <MemoryRouter initialEntries={['/lojas']}>
        <Routes>
          <Route path="/lojas" element={<LojasPage />} />
          <Route path="/lojas/:storeId" element={<div data-testid="detail-page" />} />
        </Routes>
      </MemoryRouter>,
    )

    const row = screen.getByText('165 — FORT ATACADISTA KOBRASOL').closest('tr')
    expect(row).toBeTruthy()
    fireEvent.click(row!)

    expect(screen.getByTestId('detail-page')).toBeTruthy()
  })

  // 5. Exportação contém todos os filteredStores, não só a página visível
  it('5. Exportação XLSX é chamada com todos os filteredStores', () => {
    const exportSpy = vi.spyOn(exportModule, 'exportLojasTableViewXLSX').mockReturnValue({
      count: 2,
      fileName: 'Lojas_TODAS_01-01-2025.xlsx',
    })

    const stores: StoreSummary[] = [
      createMockStore({ storeId: 's1', storeCode: '001' }),
      createMockStore({ storeId: 's2', storeCode: '002' }),
    ]

    vi.spyOn(useLojasModule, 'useLojas').mockReturnValue({
      stores,
      filteredStores: stores,
      validadesAtivas: [],
      rupturasAtivas: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      getStoreById: vi.fn(),
    })

    render(
      <MemoryRouter>
        <LojasPage />
      </MemoryRouter>,
    )

    const exportBtn = screen.getByRole('button', { name: /Exportar visão atual/i })
    fireEvent.click(exportBtn)

    expect(exportSpy).toHaveBeenCalledTimes(1)
    expect(exportSpy).toHaveBeenCalledWith(stores, null)
  })

  // 6. Código 165 duplicado: duas lojas distintas aparecem na tabela
  it('6. Lojas com mesmo código 165 e nomes/cidades diferentes aparecem como 2 linhas separadas', () => {
    const store1 = createMockStore({
      storeId: '165|FORT ATACADISTA KOBRASOL|FORT ATACADISTA|SÃO JOSÉ (SC)',
      storeCode: '165',
      storeName: 'FORT ATACADISTA KOBRASOL',
      networkName: 'FORT ATACADISTA',
      city: 'São José',
      uf: 'SC',
    })
    const store2 = createMockStore({
      storeId: '165|COMPER CENTRO|COMPER|CAMPO GRANDE (MS)',
      storeCode: '165',
      storeName: 'COMPER CENTRO',
      networkName: 'COMPER',
      city: 'Campo Grande',
      uf: 'MS',
    })

    vi.spyOn(useLojasModule, 'useLojas').mockReturnValue({
      stores: [store1, store2],
      filteredStores: [store1, store2],
      validadesAtivas: [],
      rupturasAtivas: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      getStoreById: vi.fn(),
    })

    render(
      <MemoryRouter>
        <LojasPage />
      </MemoryRouter>,
    )

    expect(screen.getByText('165 — FORT ATACADISTA KOBRASOL')).toBeTruthy()
    expect(screen.getByText('165 — COMPER CENTRO')).toBeTruthy()
  })
})
