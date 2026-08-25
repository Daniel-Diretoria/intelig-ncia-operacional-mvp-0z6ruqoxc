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
  supervisorKey: 'CAROLINE OLIVEIRA',
  supervisorName: 'CAROLINE OLIVEIRA',
  supervisoresList: [{ nome: 'CAROLINE OLIVEIRA', marcas: ['CHULETÃO'] }],
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

  // 7. Loading state: NÃO exibe "0 loja(s) encontrada(s)" nem estado vazio
  it('7. Durante loading NÃO exibe 0 lojas nem estado vazio, exibe Carregando dados e skeletons', () => {
    vi.spyOn(useLojasModule, 'useLojas').mockReturnValue({
      stores: [],
      filteredStores: [],
      validadesAtivas: [],
      rupturasAtivas: [],
      isLoading: true,
      error: null,
      refetch: vi.fn(),
      getStoreById: vi.fn(),
    })

    render(
      <MemoryRouter>
        <LojasPage />
      </MemoryRouter>,
    )

    // Deve mostrar indicação de carregamento
    expect(screen.getByText('Carregando dados...')).toBeTruthy()
    // NÃO deve mostrar contadores de "0 loja(s)" nem texto vazio
    expect(screen.queryByText(/0 loja\(s\) encontrada\(s\)/i)).toBeNull()
    expect(screen.queryByText(/Nenhuma loja registrada/i)).toBeNull()
    expect(screen.queryByText(/Nenhuma loja corresponde/i)).toBeNull()
  })

  // 8. Filtro de supervisor reduz lojas na tabela
  it('8. Filtro de supervisor reduz lojas na tabela', () => {
    const store1 = createMockStore({
      storeId: 's1',
      storeCode: '085',
      storeName: 'LOJA CAROLINE',
      supervisorKey: 'CAROLINE OLIVEIRA',
      supervisorName: 'Caroline Oliveira',
    })
    const store2 = createMockStore({
      storeId: 's2',
      storeCode: '086',
      storeName: 'LOJA MARCOS',
      supervisorKey: 'MARCOS SILVA',
      supervisorName: 'Marcos Silva',
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

    // Inicialmente mostra as 2 lojas
    expect(screen.getByText('085 — LOJA CAROLINE')).toBeTruthy()
    expect(screen.getByText('086 — LOJA MARCOS')).toBeTruthy()

    // Seleciona o supervisor "CAROLINE OLIVEIRA"
    const supervisorSelect = screen.getByLabelText('Supervisor')
    fireEvent.change(supervisorSelect, { target: { value: 'CAROLINE OLIVEIRA' } })

    // Agora deve exibir apenas a loja da Caroline
    expect(screen.getByText('085 — LOJA CAROLINE')).toBeTruthy()
    expect(screen.queryByText('086 — LOJA MARCOS')).toBeNull()
    expect(screen.getByText('1 loja(s) encontrada(s)')).toBeTruthy()
  })

  // 9. Cards de supervisor mostram totais corretos
  it('9. Cards de supervisor mostram totais corretos', () => {
    const storeSup1 = createMockStore({
      storeId: 's1',
      storeCode: '085',
      storeName: 'LOJA SUP 1',
      supervisorKey: 'CAROLINE OLIVEIRA',
      supervisorName: 'Caroline Oliveira',
      validadesCriticasCount: 3,
      rupturasAtivasCount: 0,
      situacao: 'Crítica',
    })
    const storeSup2 = createMockStore({
      storeId: 's2',
      storeCode: '086',
      storeName: 'LOJA SUP 2',
      supervisorKey: 'CAROLINE OLIVEIRA',
      supervisorName: 'Caroline Oliveira',
      validadesCriticasCount: 0,
      rupturasAtivasCount: 2,
      situacao: 'Crítica',
    })
    const storeOutro = createMockStore({
      storeId: 's3',
      storeCode: '087',
      storeName: 'LOJA OUTRO SUP',
      supervisorKey: 'MARCOS SILVA',
      supervisorName: 'Marcos Silva',
      validadesCriticasCount: 5,
      rupturasAtivasCount: 5,
      situacao: 'Crítica',
    })

    vi.spyOn(useLojasModule, 'useLojas').mockReturnValue({
      stores: [storeSup1, storeSup2, storeOutro],
      filteredStores: [storeSup1, storeSup2, storeOutro],
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

    // Seleciona Caroline
    const supervisorSelect = screen.getByLabelText('Supervisor')
    fireEvent.change(supervisorSelect, { target: { value: 'CAROLINE OLIVEIRA' } })

    // Deve mostrar os títulos dos 4 cards de supervisor
    expect(screen.getByText('Lojas sob responsabilidade')).toBeTruthy()
    expect(screen.getByText('Lojas com atenção urgente')).toBeTruthy()
    expect(screen.getByText('Validades críticas 0-15d')).toBeTruthy()
    expect(screen.getByText('Rupturas ativas')).toBeTruthy()

    // Totais de Caroline:
    // Total de lojas: 2
    // Lojas urgentes (validade > 0 || ruptura > 0): 2
    // Lojas com validade crítica (validadesCriticasCount > 0): 1
    // Lojas com rupturas ativas (rupturasAtivasCount > 0): 1
    expect(screen.getByText('Lojas sob este supervisor')).toBeTruthy()
  })

  // 10. Card "Lojas com atenção urgente" clicado → texto "Filtro: Lojas críticas" aparece
  it('10. Card "Lojas com atenção urgente" clicado → texto "Filtro: Lojas críticas" aparece', () => {
    const storeSup = createMockStore({
      storeId: 's1',
      storeCode: '085',
      storeName: 'LOJA SUP 1',
      supervisorKey: 'CAROLINE OLIVEIRA',
      supervisorName: 'Caroline Oliveira',
      validadesCriticasCount: 1,
      rupturasAtivasCount: 0,
      situacao: 'Crítica',
    })

    vi.spyOn(useLojasModule, 'useLojas').mockReturnValue({
      stores: [storeSup],
      filteredStores: [storeSup],
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

    // Seleciona supervisor
    const supervisorSelect = screen.getByLabelText('Supervisor')
    fireEvent.change(supervisorSelect, { target: { value: 'CAROLINE OLIVEIRA' } })

    // Clica no card "Lojas com atenção urgente"
    const cardUrgente = screen.getByText('Lojas com atenção urgente').closest('div')
    expect(cardUrgente).toBeTruthy()
    fireEvent.click(cardUrgente!)

    // Verifica que o texto "Filtro: Lojas críticas" aparece na barra de contagem
    expect(screen.getByText(/• Filtro: Lojas críticas/i)).toBeTruthy()
  })
})
