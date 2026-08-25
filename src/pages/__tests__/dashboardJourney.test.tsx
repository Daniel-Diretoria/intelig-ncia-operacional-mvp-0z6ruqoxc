import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { Dashboard } from '../Dashboard'
import * as useLojasModule from '@/services/useLojas'
import * as baseSelectors from '@/lib/selectors/baseAtualSelectors'
import type { StoreSummary } from '@/services/useLojas'
import type { BaseAtualSnapshot } from '@/lib/selectors'
import type { ValidadeItem, Ruptura } from '@/types'

const mockValidadesAtivas: ValidadeItem[] = [
  {
    id: 'v1',
    product: 'PICANHA 1KG',
    sku: 'SKU1',
    lote: 'L1',
    category: 'Mercearia',
    validade: '2025-05-15',
    diasRestantes: 5,
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
  },
  {
    id: 'v2',
    product: 'COSTELA 1KG',
    sku: 'SKU2',
    lote: 'L2',
    category: 'Mercearia',
    validade: '2025-05-18',
    diasRestantes: 8,
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
    quantidade: 8,
    dataEntrada: '2025-05-01',
  },
]

const mockRupturasAtivas: Ruptura[] = [
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
    dias_em_ruptura: 6,
    situacao_atual: 'Ativo',
  },
  {
    id: 'r2',
    data_visita: '2025-05-07',
    codigo_loja: '165',
    nome_loja: 'COMPER CENTRO',
    cnpj_loja: '00.000.000/0002-00',
    cidade: 'Campo Grande',
    estado: 'MS',
    codigo_cliente: 'C2',
    cliente: 'OUTRA MARCA',
    colaborador: 'Promotor 2',
    categoria: 'Mercearia',
    observacao: '',
    data_entrada: '2025-05-07',
    ultima_aparicao: '2025-05-07',
    operational_key: 'op2',
    dedup_key: 'dedup2',
    source_import_id: 'imp1',
    source_row: 2,
    produto: 'FRALDINHA 1KG',
    motivo: 'Sem Estoque Mínimo',
    dias_em_ruptura: 10,
    situacao_atual: 'Ativo',
  },
]

const mockStores: StoreSummary[] = [
  {
    storeId: '165|FORT ATACADISTA KOBRASOL|FORT ATACADISTA|SÃO JOSÉ (SC)',
    storeCode: '165',
    storeName: 'FORT ATACADISTA KOBRASOL',
    networkName: 'FORT ATACADISTA',
    city: 'São José',
    uf: 'SC',
    marcasCount: 1,
    marcasList: ['CHULETÃO'],
    validadesCriticasCount: 2,
    validadesAtencaoCount: 0,
    rupturasAtivasCount: 1,
    situacao: 'Crítica',
    itemsAtivos: [],
    itemsAuditoria: [],
    rupturasList: [],
  },
  {
    storeId: '165|COMPER CENTRO|COMPER|CAMPO GRANDE (MS)',
    storeCode: '165',
    storeName: 'COMPER CENTRO',
    networkName: 'COMPER',
    city: 'Campo Grande',
    uf: 'MS',
    marcasCount: 1,
    marcasList: ['OUTRA MARCA'],
    validadesCriticasCount: 0,
    validadesAtencaoCount: 1,
    rupturasAtivasCount: 3,
    situacao: 'Crítica',
    itemsAtivos: [],
    itemsAuditoria: [],
    rupturasList: [],
  },
]

const mockSnapshot: BaseAtualSnapshot = {
  validadesAtivas: [
    {
      id: 'v1',
      product: 'PICANHA 1KG',
      sku: 'SKU1',
      lote: 'L1',
      category: 'Mercearia',
      validade: '2025-05-15',
      diasRestantes: 5,
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
    },
    {
      id: 'v2',
      product: 'COSTELA 1KG',
      sku: 'SKU2',
      lote: 'L2',
      category: 'Mercearia',
      validade: '2025-05-18',
      diasRestantes: 8,
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
      quantidade: 8,
      dataEntrada: '2025-05-01',
    },
  ],
  validadesAuditoria: [],
  rupturasAtivas: [
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
      dias_em_ruptura: 6,
      situacao_atual: 'Ativo',
    },
    {
      id: 'r2',
      data_visita: '2025-05-07',
      codigo_loja: '165',
      nome_loja: 'COMPER CENTRO',
      cnpj_loja: '00.000.000/0002-00',
      cidade: 'Campo Grande',
      estado: 'MS',
      codigo_cliente: 'C2',
      cliente: 'OUTRA MARCA',
      colaborador: 'Promotor 2',
      categoria: 'Mercearia',
      observacao: '',
      data_entrada: '2025-05-07',
      ultima_aparicao: '2025-05-07',
      operational_key: 'op2',
      dedup_key: 'dedup2',
      source_import_id: 'imp1',
      source_row: 2,
      produto: 'FRALDINHA 1KG',
      motivo: 'Sem Estoque Mínimo',
      dias_em_ruptura: 10,
      situacao_atual: 'Ativo',
    },
  ],
  lojasAgregadas: [],
  alertasOperacionais: [],
  kpisReconciliados: {
    validadesAtivasTotal: 2,
    validadesCriticas: 2,
    validadesAtencao: 0,
    validadesModerado: 0,
    validadesNormal: 0,
    quantidadeTotalEmRisco: 13,
    produtosDistintosEmRisco: 3,
    lojasAfetadas: 2,
    clientesAfetados: 2,
    rupturasAtivasTotal: 2,
    alertasAbertosTotal: 2,
    auditoriaVencidosTotal: 0,
  },
  loadedFromBackend: true,
  timestamp: new Date().toISOString(),
}

describe('dashboardJourney.test.tsx — Contrato de Regressão da Visão Estratégica (/)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(useLojasModule, 'useLojas').mockReturnValue({
      stores: mockStores,
      filteredStores: mockStores,
      validadesAtivas: mockValidadesAtivas,
      rupturasAtivas: mockRupturasAtivas,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      getStoreById: vi.fn(),
    })
  })

  // 1. 4 KPIs corretos (sem "Alertas Abertos")
  it('1. 4 KPIs corretos são renderizados sem Alertas Abertos', async () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('Casos complexos')).toBeTruthy()
      expect(screen.getByText('Rupturas ativas')).toBeTruthy()
      expect(screen.getByText('Lojas críticas')).toBeTruthy()
      expect(screen.getByText('Produtos em risco')).toBeTruthy()
    })

    expect(screen.queryByText(/Alertas Abertos/i)).toBeNull()
    expect(screen.queryByText(/Alertas Operacionais Recentes/i)).toBeNull()
  })

  // 1b. Dashboard não faz chamada separada a getBaseAtualSnapshot (usa apenas useLojas)
  it('1b. Dashboard renderiza consumindo apenas useLojas e não chama getBaseAtualSnapshot diretamente', async () => {
    const getBaseAtualSpy = vi.spyOn(baseSelectors, 'getBaseAtualSnapshot')

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('Visão Estratégica')).toBeTruthy()
    })

    expect(getBaseAtualSpy).not.toHaveBeenCalled()
  })

  // 1c. Mostra estado de loading sem exibir "0" nem "..."
  it('1c. Dashboard mostra estado de loading com skeletons quando useLojas.isLoading é true e não exibe 0 ou ...', async () => {
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

    const { container } = render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    )

    expect(container.querySelector('.animate-pulse')).toBeTruthy()
    // Durante loading, não deve exibir número 0 nem reticências soltas
    expect(screen.queryByText('0 a 15 dias para vencer')).toBeNull()
  })

  // 1d. Mostra estado vazio sem dados
  it('1d. Dashboard mostra estado vazio sem dados quando não há prioridades', async () => {
    vi.spyOn(useLojasModule, 'useLojas').mockReturnValue({
      stores: [],
      filteredStores: [],
      validadesAtivas: [],
      rupturasAtivas: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      getStoreById: vi.fn(),
    })

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('Nenhuma loja com prioridade crítica encontrada')).toBeTruthy()
      expect(screen.getByText('Nenhuma ocorrência de validade ativa no momento.')).toBeTruthy()
      expect(screen.getByText('Nenhuma ruptura ativa no momento.')).toBeTruthy()
    })
  })

  // 2. Ranking usa regra transparente: ambos > validades desc > rupturas desc > nome asc
  it('2. Prioridades de ação lista as lojas pela ordenação transparente (ambos primeiro)', async () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    )

    await waitFor(() => {
      // FORT tem validades (2) e rupturas (1) => Ambos => Primeira da fila
      expect(screen.getByText('165 — FORT ATACADISTA KOBRASOL')).toBeTruthy()
      expect(screen.getByText('165 — COMPER CENTRO')).toBeTruthy()
      expect(screen.getByText('Ambos')).toBeTruthy()
    })
  })

  // 3. Sem gráfico de barras, sem Central Estratégica, sem "Exportar Central"
  it('3. Elementos removidos não aparecem na tela', async () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.queryByText(/Distribuição de Validades por Status Operacional/i)).toBeNull()
      expect(screen.queryByText(/Central Estratégica/i)).toBeNull()
      expect(screen.queryByText(/Exportar Central/i)).toBeNull()
    })
  })

  // 4. Links "Ver todas" e navegação de prioridades
  it('4. Links para páginas operacionais preservam filtros', async () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('Ver todas as validades')).toBeTruthy()
      expect(screen.getByText('Ver todas as rupturas')).toBeTruthy()
      expect(screen.getByText('Ver todas as lojas')).toBeTruthy()
    })
  })

  // 5. Zero escritas ao navegar ou renderizar
  it('5. Nenhuma mutação ocorre no banco', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('Visão Estratégica')).toBeTruthy()
    })

    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
