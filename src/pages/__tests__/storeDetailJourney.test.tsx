import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { StoreDetailPage } from '../StoreDetailPage'
import * as useLojasModule from '@/services/useLojas'
import * as exportModule from '@/lib/export/lojasTableViewExport'
import type { StoreSummary } from '@/services/useLojas'
import type { ValidadeItem, Ruptura } from '@/types'

const mockStore: StoreSummary = {
  storeId: '165|FORT ATACADISTA KOBRASOL|FORT ATACADISTA|SÃO JOSÉ (SC)',
  storeCode: '165',
  storeName: 'FORT ATACADISTA KOBRASOL',
  networkName: 'FORT ATACADISTA',
  city: 'São José',
  uf: 'SC',
  marcasCount: 1,
  marcasList: ['CHULETÃO'],
  validadesCriticasCount: 1,
  validadesAtencaoCount: 1,
  rupturasAtivasCount: 1,
  situacao: 'Crítica',
  supervisorKey: 'CAROLINE OLIVEIRA',
  supervisorName: 'CAROLINE OLIVEIRA',
  supervisoresList: [{ nome: 'CAROLINE OLIVEIRA', marcas: ['CHULETÃO'] }],
  itemsAtivos: [
    {
      id: 'v1',
      product: 'PICANHA 1KG',
      sku: 'SKU1',
      lote: 'L1',
      category: 'Mercearia',
      validade: '2025-05-15',
      diasRestantes: 10, // Crítico
      status: 'Crítico',
      unidade: 'UN',
      estoque: 10,
      cliente: 'CHULETÃO',
      industria: 'Chuletão',
      rede: 'FORT ATACADISTA',
      codigoLoja: '165',
      loja: 'FORT ATACADISTA KOBRASOL',
      cidade: 'São José',
      uf: 'SC',
      quantidade: 5,
      dataEntrada: '2025-05-01',
      ultimaAtualizacao: '2025-05-02T10:00:00Z',
    },
    {
      id: 'v2',
      product: 'COSTELA 1KG',
      sku: 'SKU2',
      lote: 'L2',
      category: 'Mercearia',
      validade: '2025-05-25',
      diasRestantes: 20, // Atenção (16-20)
      status: 'Atenção',
      unidade: 'UN',
      estoque: 10,
      cliente: 'CHULETÃO',
      industria: 'Chuletão',
      rede: 'FORT ATACADISTA',
      codigoLoja: '165',
      loja: 'FORT ATACADISTA KOBRASOL',
      cidade: 'São José',
      uf: 'SC',
      quantidade: 8,
      dataEntrada: '2025-05-01',
      ultimaAtualizacao: '2025-05-02T10:00:00Z',
    },
    {
      id: 'v3',
      product: 'LINGUICA 1KG',
      sku: 'SKU3',
      lote: 'L3',
      category: 'Mercearia',
      validade: '2025-06-01',
      diasRestantes: 25, // Moderado (21-29)
      status: 'Moderado',
      unidade: 'UN',
      estoque: 10,
      cliente: 'CHULETÃO',
      industria: 'Chuletão',
      rede: 'FORT ATACADISTA',
      codigoLoja: '165',
      loja: 'FORT ATACADISTA KOBRASOL',
      cidade: 'São José',
      uf: 'SC',
      quantidade: 12,
      dataEntrada: '2025-05-01',
      ultimaAtualizacao: '2025-05-02T10:00:00Z',
    },
    {
      id: 'v4',
      product: 'ALCATRA 1KG',
      sku: 'SKU4',
      lote: 'L4',
      category: 'Mercearia',
      validade: '2025-10-01',
      diasRestantes: 135, // OK/Normal (>=30)
      status: 'Normal',
      unidade: 'UN',
      estoque: 10,
      cliente: 'CHULETÃO',
      industria: 'Chuletão',
      rede: 'FORT ATACADISTA',
      codigoLoja: '165',
      loja: 'FORT ATACADISTA KOBRASOL',
      cidade: 'São José',
      uf: 'SC',
      quantidade: 20,
      dataEntrada: '2025-05-01',
      ultimaAtualizacao: '2025-05-02T10:00:00Z',
    },
  ],
  itemsAuditoria: [
    {
      id: 'va1',
      product: 'CUPIM 1KG',
      sku: 'SKU5',
      lote: 'L5',
      category: 'Mercearia',
      validade: '2025-04-01',
      diasRestantes: -35,
      status: 'Vencido',
      unidade: 'UN',
      estoque: 4,
      cliente: 'CHULETÃO',
      industria: 'Chuletão',
      rede: 'FORT ATACADISTA',
      codigoLoja: '165',
      loja: 'FORT ATACADISTA KOBRASOL',
      cidade: 'São José',
      uf: 'SC',
      quantidade: 4,
      dataEntrada: '2025-04-01',
      ultimaAtualizacao: '2025-04-01',
    },
  ],
  rupturasList: [
    {
      id: 'r1',
      data_visita: '2025-05-08',
      codigo_loja: '165',
      nome_loja: 'FORT ATACADISTA KOBRASOL',
      cnpj_loja: '00.000.000/0001-00',
      cidade: 'São José',
      estado: 'SC',
      codigo_cliente: 'C1',
      cliente: 'CHULETÃO',
      colaborador: 'Promotor 1',
      categoria: 'Mercearia',
      observacao: '',
      data_entrada: '2025-05-08',
      ultima_aparicao: '2025-05-08',
      operational_key: 'op1',
      dedup_key: 'dedup1',
      source_import_id: 'imp1',
      source_row: 1,
      produto: 'FRALDINHA 1KG',
      motivo: 'Ruptura Total',
      dias_em_ruptura: 3,
      situacao_atual: 'Ativo',
    },
  ],
}

describe('storeDetailJourney.test.tsx — Contrato de Regressão da Tela /lojas/:storeId', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  // 1. Criticidade: 135 dias = badge "OK" (NUNCA "Atenção")
  // 2. Criticidade: 0-15 = "Crítico", 16-20 = "Atenção", 21-29 = "Moderado", >=30 = "OK"
  it('1 & 2. Classificação de criticidade respeita faixas oficiais: 135 dias = OK, 0-15 = Crítico, 16-20 = Atenção, 21-29 = Moderado', () => {
    vi.spyOn(useLojasModule, 'useLojas').mockReturnValue({
      stores: [mockStore],
      filteredStores: [mockStore],
      validadesAtivas: [],
      rupturasAtivas: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      getStoreById: (id) => (id === mockStore.storeId ? mockStore : undefined),
    })

    render(
      <MemoryRouter initialEntries={[`/lojas/${encodeURIComponent(mockStore.storeId)}`]}>
        <Routes>
          <Route path="/lojas/:storeId" element={<StoreDetailPage />} />
        </Routes>
      </MemoryRouter>,
    )

    // Clicar na aba Validades
    const validadesTab = screen.getByRole('tab', { name: /Validades/i })
    fireEvent.click(validadesTab)

    expect(screen.getByText('Crítico')).toBeTruthy()
    expect(screen.getByText('Atenção')).toBeTruthy()
    expect(screen.getByText('Moderado')).toBeTruthy()
    expect(screen.getByText('OK')).toBeTruthy()
  })

  // 3. Aba Validades: 7 colunas sem Loja, sem Fornecedor DIRETORIA, sem Lote vazio, sem Promotor, sem Drill-down
  it('3. Aba Validades tem 7 colunas sem Loja, Promotor ou Drill-down', () => {
    vi.spyOn(useLojasModule, 'useLojas').mockReturnValue({
      stores: [mockStore],
      filteredStores: [mockStore],
      validadesAtivas: [],
      rupturasAtivas: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      getStoreById: (id) => (id === mockStore.storeId ? mockStore : undefined),
    })

    render(
      <MemoryRouter initialEntries={[`/lojas/${encodeURIComponent(mockStore.storeId)}`]}>
        <Routes>
          <Route path="/lojas/:storeId" element={<StoreDetailPage />} />
        </Routes>
      </MemoryRouter>,
    )

    const validadesTab = screen.getByRole('tab', { name: /Validades/i })
    fireEvent.click(validadesTab)

    const headers = screen.getAllByRole('columnheader').map((th) => th.textContent?.trim())
    expect(headers).toEqual([
      'Marca',
      'Realizado',
      'Produto',
      'Dias pra vencer',
      'Validade',
      'Criticidade',
      'Data de Entrada',
    ])
    expect(screen.queryByText(/Promotor/i)).toBeNull()
    expect(screen.queryByText(/Supervisor/i)).toBeNull()
    expect(screen.queryByText(/Drill-down/i)).toBeNull()
  })

  // 4. Aba Rupturas: 6 colunas sem Loja
  it('4. Aba Rupturas tem 6 colunas sem Loja', () => {
    vi.spyOn(useLojasModule, 'useLojas').mockReturnValue({
      stores: [mockStore],
      filteredStores: [mockStore],
      validadesAtivas: [],
      rupturasAtivas: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      getStoreById: (id) => (id === mockStore.storeId ? mockStore : undefined),
    })

    render(
      <MemoryRouter initialEntries={[`/lojas/${encodeURIComponent(mockStore.storeId)}`]}>
        <Routes>
          <Route path="/lojas/:storeId" element={<StoreDetailPage />} />
        </Routes>
      </MemoryRouter>,
    )

    const rupturasTab = screen.getByRole('tab', { name: /Rupturas/i })
    fireEvent.click(rupturasTab)

    const headers = screen.getAllByRole('columnheader').map((th) => th.textContent?.trim())
    expect(headers).toEqual([
      'Marca',
      'Data da Visita',
      'Produto',
      'Motivo',
      'Dias em Ruptura',
      'Situação',
    ])
  })

  // 5. Aba Auditoria: itens vencidos aparecem; sem Promotor/coluna Ação
  it('5. Aba Auditoria mostra itens vencidos e quantidade sem Promotor ou coluna Ação', () => {
    vi.spyOn(useLojasModule, 'useLojas').mockReturnValue({
      stores: [mockStore],
      filteredStores: [mockStore],
      validadesAtivas: [],
      rupturasAtivas: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      getStoreById: (id) => (id === mockStore.storeId ? mockStore : undefined),
    })

    render(
      <MemoryRouter initialEntries={[`/lojas/${encodeURIComponent(mockStore.storeId)}`]}>
        <Routes>
          <Route path="/lojas/:storeId" element={<StoreDetailPage />} />
        </Routes>
      </MemoryRouter>,
    )

    const auditoriaTab = screen.getByRole('tab', { name: /Auditoria/i })
    fireEvent.click(auditoriaTab)

    expect(screen.getByText('CUPIM 1KG')).toBeTruthy()
    expect(screen.getByText('35 dias atrás')).toBeTruthy()
    expect(screen.queryByText(/Auditar/i)).toBeNull()
  })

  // 6. Exportação da loja gera XLSX com 2 abas
  it('6. Exportação gera XLSX com as 2 abas da loja', () => {
    const exportSpy = vi.spyOn(exportModule, 'exportStoreDetailXLSX').mockReturnValue({
      countValidades: 4,
      countRupturas: 1,
      fileName: 'Loja_165_FORT_ATACADISTA_KOBRASOL_01-01-2025.xlsx',
    })

    vi.spyOn(useLojasModule, 'useLojas').mockReturnValue({
      stores: [mockStore],
      filteredStores: [mockStore],
      validadesAtivas: [],
      rupturasAtivas: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      getStoreById: (id) => (id === mockStore.storeId ? mockStore : undefined),
    })

    render(
      <MemoryRouter initialEntries={[`/lojas/${encodeURIComponent(mockStore.storeId)}`]}>
        <Routes>
          <Route path="/lojas/:storeId" element={<StoreDetailPage />} />
        </Routes>
      </MemoryRouter>,
    )

    const exportBtn = screen.getByRole('button', { name: /Exportar loja/i })
    fireEvent.click(exportBtn)

    expect(exportSpy).toHaveBeenCalledTimes(1)
  })

  // 7. Loja não encontrada: empty state com botão Voltar
  it('7. Loja inexistente exibe tela amigável de erro com botão Voltar', () => {
    vi.spyOn(useLojasModule, 'useLojas').mockReturnValue({
      stores: [mockStore],
      filteredStores: [mockStore],
      validadesAtivas: [],
      rupturasAtivas: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      getStoreById: () => undefined,
    })

    render(
      <MemoryRouter initialEntries={['/lojas/NAO_EXISTE']}>
        <Routes>
          <Route path="/lojas/:storeId" element={<StoreDetailPage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByText('Loja não encontrada')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Voltar para Lojas/i })).toBeTruthy()
  })
})
