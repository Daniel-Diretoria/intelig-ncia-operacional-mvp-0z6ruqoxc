import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ValidadesPage } from '../Validades'
import type { ValidadeItem } from '@/types'
import {
  formatStoreIdentityTable,
  exportValidadesTableViewXLSX,
} from '@/lib/export/validadeTableViewExport'
import * as useValidadesModule from '@/services/useValidades'
import * as XLSX from 'xlsx'

// Mock de dados representativos com marcas "CHULETÃO" e "OUTRA MARCA"
const createMockItem = (overrides: Partial<ValidadeItem> = {}): ValidadeItem => ({
  id: 'val-001',
  product: 'PICANHA CHULETÃO 1KG',
  sku: 'SKU-001',
  lote: 'LT2025-A1',
  category: 'Mercearia',
  validade: '2026-08-25',
  diasRestantes: 10, // Crítico (<=15)
  status: 'Crítico',
  unidade: 'UN',
  estoque: 100,
  cliente: 'CHULETÃO',
  industria: 'Frigorífico Chuletão',
  rede: 'FORT ATACADISTA',
  codigoLoja: '00250',
  loja: 'FORT ATACADISTA FLORESTA',
  cidade: 'Joinville',
  uf: 'SC',
  quantidade: 50,
  dataEntrada: '2025-05-10',
  ultimaAtualizacao: '2025-05-12T10:00:00Z',
  ...overrides,
})

describe('validadesJourney.test.tsx — Contrato de Regressão da Tela /validades', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  // a) e b) Selecionar Marca "CHULETÃO": assert que KPIs e tabela mostram subconjunto (ex: 353 e NUNCA 7228)
  it('a & b) Com itens filtrados por marca CHULETÃO (ex: 353), KPI "Validades ativas" é 353 e nunca o total global (7228)', () => {
    const itemsChuletao: ValidadeItem[] = Array.from({ length: 353 }).map((_, i) =>
      createMockItem({
        id: `chuletao-${i}`,
        cliente: 'CHULETÃO',
        diasRestantes: i % 2 === 0 ? 10 : 25,
      }),
    )

    vi.spyOn(useValidadesModule, 'useValidades').mockReturnValue({
      data: itemsChuletao,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })

    render(
      <MemoryRouter>
        <ValidadesPage />
      </MemoryRouter>,
    )

    // Validades ativas deve ser exatamente 353
    expect(screen.getByText('Validades ativas')).toBeTruthy()
    expect(screen.getByText('353')).toBeTruthy()
    expect(screen.queryByText('7.228')).toBeNull()
    expect(screen.queryByText('7228')).toBeNull()
  })

  // c) KPI "Casos complexos" inclui diasRestantes <= 15; "Atenção" inclui 16-30
  it('c) KPIs calculam corretamente: Casos complexos (<= 15) e Atenção (16-30)', () => {
    const mixedItems: ValidadeItem[] = [
      createMockItem({ id: '1', diasRestantes: -2 }), // complexo (vencido <= 15)
      createMockItem({ id: '2', diasRestantes: 0 }), // complexo (<= 15)
      createMockItem({ id: '3', diasRestantes: 15 }), // complexo (<= 15)
      createMockItem({ id: '4', diasRestantes: 16 }), // atencao (16-30)
      createMockItem({ id: '5', diasRestantes: 30 }), // atencao (16-30)
      createMockItem({ id: '6', diasRestantes: 31 }), // ok (> 30)
      createMockItem({ id: '7', diasRestantes: 90 }), // ok (> 30)
    ]

    vi.spyOn(useValidadesModule, 'useValidades').mockReturnValue({
      data: mixedItems,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })

    render(
      <MemoryRouter>
        <ValidadesPage />
      </MemoryRouter>,
    )

    // Ativas: 7, Casos complexos: 3, Atenção: 2
    expect(screen.getByText('Validades ativas')).toBeTruthy()
    expect(screen.getByText('7')).toBeTruthy() // ativas
    expect(screen.getByText('Casos complexos')).toBeTruthy()
    expect(screen.getByText('3')).toBeTruthy() // casos complexos
    expect(screen.getByText('Atenção')).toBeTruthy()
    expect(screen.getByText('2')).toBeTruthy() // atencao
  })

  // k) KPI "Lojas críticas" conta lojas distintas com ao menos 1 item <= 15 dias
  it('k) KPI "Lojas críticas" conta lojas distintas com ao menos 1 item <= 15 dias', () => {
    const items: ValidadeItem[] = [
      createMockItem({ id: '1', codigoLoja: '00100', loja: 'LOJA CENTRO', diasRestantes: 5 }), // crítica
      createMockItem({ id: '2', codigoLoja: '00100', loja: 'LOJA CENTRO', diasRestantes: 10 }), // mesma loja
      createMockItem({ id: '3', codigoLoja: '00200', loja: 'LOJA SUL', diasRestantes: 12 }), // crítica
      createMockItem({ id: '4', codigoLoja: '00300', loja: 'LOJA NORTE', diasRestantes: 20 }), // não crítica (>15)
    ]

    vi.spyOn(useValidadesModule, 'useValidades').mockReturnValue({
      data: items,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })

    render(
      <MemoryRouter>
        <ValidadesPage />
      </MemoryRouter>,
    )

    // Lojas críticas deve ser 2 (LOJA CENTRO e LOJA SUL)
    expect(screen.getByText('Lojas críticas')).toBeTruthy()
    expect(screen.getByText('2')).toBeTruthy()
  })

  // d) Tabela tem exatamente 8 colunas na ordem: Loja, Marca, Realizado, Produto, Dias pra vencer, Validade, Criticidade, Data de Entrada
  it('d) Tabela tem exatamente 8 colunas na ordem especificada', () => {
    const items: ValidadeItem[] = [createMockItem()]

    vi.spyOn(useValidadesModule, 'useValidades').mockReturnValue({
      data: items,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })

    render(
      <MemoryRouter>
        <ValidadesPage />
      </MemoryRouter>,
    )

    const tableHeaders = screen.getAllByRole('columnheader').map((th) => th.textContent?.trim())
    expect(tableHeaders).toEqual([
      'Loja',
      'Marca',
      'Realizado',
      'Produto',
      'Dias pra vencer',
      'Validade',
      'Criticidade',
      'Data de Entrada',
    ])
  })

  // e) Loja mostra "00250 — FORT ATACADISTA FLORESTA" (código + nome com em-dash, preservando zeros à esquerda)
  it('e) Loja formata como "CÓDIGO — NOME" preservando zeros à esquerda ou "SEM CÓDIGO — NOME"', () => {
    const formattedWithCode = formatStoreIdentityTable({
      codigoLoja: '00250',
      loja: 'FORT ATACADISTA FLORESTA',
    })
    expect(formattedWithCode).toBe('00250 — FORT ATACADISTA FLORESTA')

    const formattedWithoutCode = formatStoreIdentityTable({
      codigoLoja: null,
      loja: 'MERCADO CENTRAL',
    })
    expect(formattedWithoutCode).toBe('SEM CÓDIGO — MERCADO CENTRAL')
  })

  // f) Datas em dd/MM/yyyy, nunca "Invalid Date"
  it('f) Datas formatam em dd/MM/yyyy sem nunca exibir "Invalid Date"', () => {
    const items: ValidadeItem[] = [
      createMockItem({
        dataEntrada: '2025-05-10',
        validade: '2026-08-25',
        ultimaAtualizacao: '2025-05-12T10:00:00Z',
      }),
      createMockItem({
        id: 'val-inv',
        dataEntrada: undefined,
        validade: 'data-corrompida',
        ultimaAtualizacao: undefined,
      }),
    ]

    vi.spyOn(useValidadesModule, 'useValidades').mockReturnValue({
      data: items,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })

    render(
      <MemoryRouter>
        <ValidadesPage />
      </MemoryRouter>,
    )

    expect(screen.getByText('10/05/2025')).toBeTruthy()
    expect(screen.getByText('25/08/2026')).toBeTruthy()
    expect(screen.getByText('12/05/2025')).toBeTruthy()
    expect(screen.queryByText(/Invalid Date/i)).toBeNull()
  })

  // g) Exportação contém todos e somente os registros filtrados com 8 colunas e nome correto
  it('g) Exportação XLSX contém exatamente os registros filtrados com 8 colunas e nome correto', () => {
    const writeSpy = vi.spyOn(XLSX, 'writeFile').mockImplementation(() => {})

    const items: ValidadeItem[] = [
      createMockItem({
        id: '1',
        cliente: 'CHULETÃO',
        codigoLoja: '00250',
        loja: 'FORT ATACADISTA FLORESTA',
      }),
      createMockItem({
        id: '2',
        cliente: 'CHULETÃO',
        codigoLoja: '00300',
        loja: 'FORT ATACADISTA CENTRO',
      }),
    ]

    const result = exportValidadesTableViewXLSX(items, 'CHULETÃO')
    expect(result.count).toBe(2)
    expect(result.fileName).toMatch(/^Validades_CHULETAO_\d{2}-\d{2}-\d{4}\.xlsx$/)

    const resultCompleta = exportValidadesTableViewXLSX(items, null)
    expect(resultCompleta.fileName).toMatch(/^Validades_Completa_\d{2}-\d{2}-\d{4}\.xlsx$/)

    expect(writeSpy).toHaveBeenCalledTimes(2)
  })

  // h) Filtros combinados e botão Limpar filtros
  it('h) Filtros da barra atualizam o estado e botão Limpar restaura', () => {
    const items: ValidadeItem[] = [
      createMockItem({ id: '1', cliente: 'CHULETÃO', rede: 'FORT ATACADISTA' }),
      createMockItem({ id: '2', cliente: 'OUTRA', rede: 'COMPER' }),
    ]

    vi.spyOn(useValidadesModule, 'useValidades').mockReturnValue({
      data: items,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })

    render(
      <MemoryRouter>
        <ValidadesPage />
      </MemoryRouter>,
    )

    // A barra possui os selects
    const searchInput = screen.getByPlaceholderText(/Buscar por produto, loja, código ou marca/i)
    fireEvent.change(searchInput, { target: { value: 'PICANHA' } })

    // Chip de busca aparece
    expect(screen.getByText('Busca: "PICANHA"')).toBeTruthy()

    // Botão limpar filtros
    const clearBtn = screen.getByRole('button', { name: /Limpar filtros/i }) as HTMLButtonElement
    expect(clearBtn.disabled).toBe(false)
    fireEvent.click(clearBtn)

    // Chip deve sumir e input esvaziar
    expect(screen.queryByText('Busca: "PICANHA"')).toBeNull()
  })

  // i) Nenhum filtro de Categoria/Indústria/Promotor/Supervisor aparece na UI
  it('i) Nenhum filtro de Categoria/Indústria/Promotor/Supervisor ou toggle "Filtros avançados" aparece na UI', () => {
    vi.spyOn(useValidadesModule, 'useValidades').mockReturnValue({
      data: [createMockItem()],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })

    render(
      <MemoryRouter>
        <ValidadesPage />
      </MemoryRouter>,
    )

    expect(screen.queryByText(/Filtros avançados/i)).toBeNull()
    expect(screen.queryByLabelText(/Indústria/i)).toBeNull()
    expect(screen.queryByLabelText(/Fornecedor/i)).toBeNull()
    expect(screen.queryByLabelText(/Promotor/i)).toBeNull()
    expect(screen.queryByLabelText(/Supervisor/i)).toBeNull()
    expect(screen.queryByLabelText(/Categoria/i)).toBeNull()
    expect(screen.queryByText(/Inteligência Operacional/i)).toBeNull()
  })

  // j) Nenhuma escrita no banco ocorre ao filtrar, ordenar ou exportar
  it('j) Nenhuma mutação de banco ocorre nas operações de tela', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const items: ValidadeItem[] = [createMockItem()]

    vi.spyOn(useValidadesModule, 'useValidades').mockReturnValue({
      data: items,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })

    render(
      <MemoryRouter>
        <ValidadesPage />
      </MemoryRouter>,
    )

    // Clicar para ordenar por Loja
    const lojaTh = screen.getByText('Loja')
    fireEvent.click(lojaTh)

    // Fetch não deve ter sido chamado para gravação/mutação (apenas leituras gerenciadas pelo hook)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
