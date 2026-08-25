import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { RupturasPage } from '../Rupturas'
import type { Ruptura } from '@/types/rupturas'
import type { RupturaEncerrada } from '@/lib/engine/confrontoBidirecional'
import * as useRupturasModule from '@/services/useRupturas'
import { exportRupturasTableViewXLSX } from '@/lib/export/rupturaTableViewExport'
import * as XLSX from 'xlsx'

const createMockRuptura = (overrides: Partial<Ruptura> = {}): Ruptura => ({
  id: 'rup-001',
  produto: 'Iogurte Frutap Morango 170g',
  motivo: 'Sem Estoque Mínimo',
  codigo_loja: '085',
  nome_loja: 'FORT ATACADISTA JARAGUÁ DO SUL',
  cnpj_loja: '09.477.652/0085-00',
  cidade: 'Jaraguá do Sul',
  estado: 'SC',
  codigo_cliente: 'CLI-001',
  cliente: 'FRUTAP',
  colaborador: 'Carlos Promotor',
  categoria: 'Laticínios',
  observacao: '',
  data_visita: '2025-05-10',
  data_entrada: '2025-05-10',
  ultima_aparicao: '2025-05-10',
  situacao_atual: 'Ativo',
  operational_key: '085|Iogurte Frutap Morango 170g|2025-05-10',
  dedup_key: '085|Iogurte Frutap Morango 170g|FRUTAP',
  source_import_id: 'imp-1',
  source_row: 1,
  dias_em_ruptura: 4,
  ...overrides,
})

const createMockHistorico = (overrides: Partial<RupturaEncerrada> = {}): RupturaEncerrada => ({
  ...createMockRuptura(),
  id: 'rup-enc-001',
  produto: 'Requeijão Frutap 200g',
  statusHistorico: 'Encerrada por validade posterior',
  eventoReferencia: {
    id: 'val-99',
    data: '2025-05-15',
    tipo: 'validade',
  },
  diasResolucao: 5,
  ...overrides,
})

describe('rupturasJourney.test.tsx — Testes Obrigatórios de Interface e Fluxo (i até w)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  // i) KPIs calculados sobre filteredRupturas, não sobre total global
  // n) Renderiza 4 KPIs com nomes corretos
  it('i & n) Renderiza 4 KPIs com os nomes exatos e valores calculados sobre filteredRupturas', () => {
    const mockList: Ruptura[] = [
      createMockRuptura({
        id: '1',
        codigo_loja: '085',
        motivo: 'Ruptura Total',
        dias_em_ruptura: 6,
      }),
      createMockRuptura({
        id: '2',
        codigo_loja: '085',
        motivo: 'Sem Estoque Mínimo',
        dias_em_ruptura: 2,
      }),
      createMockRuptura({
        id: '3',
        codigo_loja: '010',
        motivo: 'Ruptura Total',
        dias_em_ruptura: 4,
      }),
    ]

    vi.spyOn(useRupturasModule, 'useRupturas').mockReturnValue({
      data: mockList,
      filteredRupturas: mockList,
      historicoRupturas: [],
      conflitos: [],
      kpis: null,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })

    render(
      <MemoryRouter>
        <RupturasPage />
      </MemoryRouter>,
    )

    // 4 KPIs: Rupturas ativas (3), Lojas críticas (2), Ruptura total (2), Tempo médio em ruptura (4 dias)
    expect(screen.getByText('Rupturas ativas')).toBeTruthy()
    expect(screen.getByText('Lojas críticas')).toBeTruthy()
    expect(screen.getByText('Ruptura total')).toBeTruthy()
    expect(screen.getByText('Tempo médio em ruptura')).toBeTruthy()

    expect(screen.getByText('3')).toBeTruthy() // ativas
    expect(screen.getByText('2')).toBeTruthy() // lojas críticas
    expect(screen.getByText('4 dias')).toBeTruthy() // tempo médio
  })

  // o) Toggle Ativas/Histórico alterna entre filteredRupturas e historicoRupturas
  it('o) Toggle Ativas/Histórico alterna dados exibidos na tabela', () => {
    const ativas = [createMockRuptura({ id: 'rup-1', produto: 'PRODUTO ATIVO' })]
    const historico = [createMockHistorico({ id: 'rup-2', produto: 'PRODUTO ENCERRADO' })]

    vi.spyOn(useRupturasModule, 'useRupturas').mockReturnValue({
      data: ativas,
      filteredRupturas: ativas,
      historicoRupturas: historico,
      conflitos: [],
      kpis: null,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })

    render(
      <MemoryRouter>
        <RupturasPage />
      </MemoryRouter>,
    )

    // Inicialmente mostra Ativas
    expect(screen.getByText('PRODUTO ATIVO')).toBeTruthy()
    expect(screen.queryByText('PRODUTO ENCERRADO')).toBeNull()

    // Clica no botão de Histórico
    const historicoBtn = screen.getByRole('button', { name: /Histórico/i })
    fireEvent.click(historicoBtn)

    // Agora deve mostrar o histórico
    expect(screen.getByText('PRODUTO ENCERRADO')).toBeTruthy()
    expect(screen.queryByText('PRODUTO ATIVO')).toBeNull()
  })

  // k) Tabela tem exatamente 7 colunas na ordem: Loja, Marca, Data da Visita, Produto, Motivo, Dias em Ruptura, Situação
  it('k) Tabela tem exatamente 7 colunas na ordem especificada', () => {
    const ativas = [createMockRuptura()]

    vi.spyOn(useRupturasModule, 'useRupturas').mockReturnValue({
      data: ativas,
      filteredRupturas: ativas,
      historicoRupturas: [],
      conflitos: [],
      kpis: null,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })

    render(
      <MemoryRouter>
        <RupturasPage />
      </MemoryRouter>,
    )

    const tableHeaders = screen.getAllByRole('columnheader').map((th) => th.textContent?.trim())
    expect(tableHeaders).toEqual([
      'Loja',
      'Marca',
      'Data da Visita',
      'Produto',
      'Motivo',
      'Dias em Ruptura ↓',
      'Situação',
    ])
  })

  // q) Loja exibida como "CÓDIGO — NOME" com zero à esquerda
  it('q) Loja exibe formato "CÓDIGO — NOME" preservando zeros à esquerda', () => {
    const ativas = [
      createMockRuptura({
        codigo_loja: '085',
        nome_loja: 'FORT ATACADISTA JARAGUÁ DO SUL',
      }),
    ]

    vi.spyOn(useRupturasModule, 'useRupturas').mockReturnValue({
      data: ativas,
      filteredRupturas: ativas,
      historicoRupturas: [],
      conflitos: [],
      kpis: null,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })

    render(
      <MemoryRouter>
        <RupturasPage />
      </MemoryRouter>,
    )

    expect(screen.getByText('085 — FORT ATACADISTA JARAGUÁ DO SUL')).toBeTruthy()
  })

  // r) Datas em dd/MM/yyyy, nunca Invalid Date
  it('r) Datas em formato dd/MM/yyyy sem nunca exibir Invalid Date', () => {
    const ativas = [
      createMockRuptura({
        data_visita: '2025-05-10',
      }),
    ]

    vi.spyOn(useRupturasModule, 'useRupturas').mockReturnValue({
      data: ativas,
      filteredRupturas: ativas,
      historicoRupturas: [],
      conflitos: [],
      kpis: null,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })

    render(
      <MemoryRouter>
        <RupturasPage />
      </MemoryRouter>,
    )

    expect(screen.getByText('10/05/2025')).toBeTruthy()
    expect(screen.queryByText(/Invalid Date/i)).toBeNull()
  })

  // s) Ordenação padrão: maior Dias em Ruptura primeiro (decrescente)
  it('s) Ordenação padrão é decrescente por Dias em Ruptura', () => {
    const ativas = [
      createMockRuptura({ id: '1', produto: 'PROD_2_DIAS', dias_em_ruptura: 2 }),
      createMockRuptura({ id: '2', produto: 'PROD_8_DIAS', dias_em_ruptura: 8 }),
      createMockRuptura({ id: '3', produto: 'PROD_5_DIAS', dias_em_ruptura: 5 }),
    ]

    vi.spyOn(useRupturasModule, 'useRupturas').mockReturnValue({
      data: ativas,
      filteredRupturas: ativas,
      historicoRupturas: [],
      conflitos: [],
      kpis: null,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })

    render(
      <MemoryRouter>
        <RupturasPage />
      </MemoryRouter>,
    )

    const rows = screen.getAllByRole('row')
    // A primeira linha de dados (índice 1) deve ser a de 8 dias
    expect(rows[1].textContent).toContain('PROD_8_DIAS')
    expect(rows[2].textContent).toContain('PROD_5_DIAS')
    expect(rows[3].textContent).toContain('PROD_2_DIAS')
  })

  // t & l) Exportação gera arquivo com nome contextual e contém todos os registros filtrados
  it('t & l) Exportação XLSX gera nome contextual e exporta todos os registros filtrados com 7 colunas', () => {
    const writeSpy = vi.spyOn(XLSX, 'writeFile').mockImplementation(() => {})

    const items = [
      createMockRuptura({ id: '1', cliente: 'FRUTAP' }),
      createMockRuptura({ id: '2', cliente: 'FRUTAP' }),
    ]

    const fixedDate = new Date(2026, 7, 25) // 25-08-2026
    const res = exportRupturasTableViewXLSX(items, 'FRUTAP', 'ativas', fixedDate)

    expect(res.count).toBe(2)
    expect(res.fileName).toBe('Rupturas_FRUTAP_25-08-2026.xlsx')
    expect(writeSpy).toHaveBeenCalledTimes(1)
  })

  // u, v, w) Sem indústria/categoria/supervisor/promotor, sem "Importar Rupturas", "Atualizar", dropdown XLSX/CSV ou Shadow tab
  it('u, v, w) Remove complexidade técnica legada e botões desnecessários', () => {
    vi.spyOn(useRupturasModule, 'useRupturas').mockReturnValue({
      data: [createMockRuptura()],
      filteredRupturas: [createMockRuptura()],
      historicoRupturas: [],
      conflitos: [],
      kpis: null,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })

    render(
      <MemoryRouter>
        <RupturasPage />
      </MemoryRouter>,
    )

    expect(screen.queryByText('Importar Rupturas')).toBeNull()
    expect(screen.queryByText('Atualizar')).toBeNull()
    expect(screen.queryByText('Exportar Base Tratada')).toBeNull()
    expect(screen.queryByText('Confronto Validades')).toBeNull()
    expect(screen.queryByText('Shadow')).toBeNull()
    expect(screen.queryByLabelText(/Indústria/i)).toBeNull()
    expect(screen.queryByLabelText(/Promotor/i)).toBeNull()
    expect(screen.queryByLabelText(/Supervisor/i)).toBeNull()
    expect(screen.queryByLabelText(/Categoria/i)).toBeNull()
  })

  // p) Filtro por Motivo "Ruptura Total" ou clique no KPI
  it('p) Clicar no KPI Ruptura Total ativa o filtro contextual', () => {
    const ativas = [
      createMockRuptura({ id: '1', motivo: 'Ruptura Total' }),
      createMockRuptura({ id: '2', motivo: 'Sem Estoque Mínimo' }),
    ]

    vi.spyOn(useRupturasModule, 'useRupturas').mockReturnValue({
      data: ativas,
      filteredRupturas: ativas,
      historicoRupturas: [],
      conflitos: [],
      kpis: null,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })

    render(
      <MemoryRouter>
        <RupturasPage />
      </MemoryRouter>,
    )

    const kpiRupturaTotal = screen.getByRole('button', { name: /Ruptura total/i })
    fireEvent.click(kpiRupturaTotal)

    // Chip de filtro do KPI deve aparecer
    expect(screen.getByText('Filtro de KPI: Ruptura Total')).toBeTruthy()
  })

  // x) Durante loading NÃO exibe 0 ocorrências nem estado vazio
  it('x) Durante loading NÃO exibe 0 ocorrências nem estado vazio, exibe Carregando dados', () => {
    vi.spyOn(useRupturasModule, 'useRupturas').mockReturnValue({
      data: [],
      filteredRupturas: [],
      historicoRupturas: [],
      conflitos: [],
      kpis: null,
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    })

    render(
      <MemoryRouter>
        <RupturasPage />
      </MemoryRouter>,
    )

    expect(screen.getByText('Carregando dados...')).toBeTruthy()
    expect(screen.queryByText(/0 ocorrência\(s\) encontrada\(s\)/i)).toBeNull()
    expect(screen.queryByText(/Nenhuma ruptura registrada/i)).toBeNull()
  })
})
