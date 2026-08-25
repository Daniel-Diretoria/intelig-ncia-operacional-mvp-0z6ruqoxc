import { describe, it, expect, vi } from 'vitest'
import * as XLSX from 'xlsx'
import {
  exportLojasTableViewXLSX,
  exportSupervisorDrillLojasXLSX,
  exportSupervisorDrillProdutosXLSX,
  exportStoreDetailXLSX,
  type SupervisorDrillProductRow,
} from '../lojasTableViewExport'
import type { StoreSummary } from '@/services/useLojas'

describe('lojasTableViewExport — Exportações da Gestão de Lojas e Drill Supervisor', () => {
  const mockStores: StoreSummary[] = [
    {
      storeId: 'store-1',
      storeCode: '101',
      storeName: 'Hipermercado Central',
      city: 'São Paulo',
      uf: 'SP',
      networkName: 'Carrefour',
      supervisorKey: 'CAROLINE OLIVEIRA',
      supervisorName: 'CAROLINE OLIVEIRA',
      marcasCount: 3,
      marcasList: ['Nestle', 'Mondelez', 'Unilever'],
      validadesCriticasCount: 2,
      validadesAtencaoCount: 3,
      rupturasAtivasCount: 1,
      situacao: 'Crítica',
      itemsAtivos: [],
      itemsAuditoria: [],
      supervisoresList: [{ nome: 'CAROLINE OLIVEIRA', marcas: ['Nestle'] }],
      rupturasList: [],
    },
    {
      storeId: 'store-2',
      storeCode: '102',
      storeName: 'Supermercado Bairro',
      city: 'Campinas',
      uf: 'SP',
      networkName: 'Pão de Açúcar',
      supervisorKey: 'CAROLINE OLIVEIRA',
      supervisorName: 'CAROLINE OLIVEIRA',
      marcasCount: 1,
      marcasList: ['Nestle'],
      validadesCriticasCount: 0,
      validadesAtencaoCount: 1,
      rupturasAtivasCount: 2,
      situacao: 'Crítica',
      itemsAtivos: [],
      itemsAuditoria: [],
      supervisoresList: [{ nome: 'CAROLINE OLIVEIRA', marcas: ['Nestle'] }],
      rupturasList: [],
    },  ]

  it('1. exportSupervisorDrillLojasXLSX — Exporta lojas com 8 colunas e formato de nome correto', () => {
    const writeFileSpy = vi.spyOn(XLSX, 'writeFile').mockImplementation(() => {})

    const customDate = new Date(2025, 4, 18) // 18-05-2025
    const result = exportSupervisorDrillLojasXLSX(
      mockStores,
      'CAROLINE OLIVEIRA',
      'criticas',
      customDate,
    )

    expect(result.count).toBe(2)
    expect(result.fileName).toBe(
      'Supervisor_CAROLINE_OLIVEIRA_Lojas_com_atencao_urgente_18-05-2025.xlsx',
    )
    expect(writeFileSpy).toHaveBeenCalled()

    writeFileSpy.mockRestore()
  })

  it('2. exportSupervisorDrillProdutosXLSX — Exporta produtos com 10 colunas e formato de nome correto', () => {
    const writeFileSpy = vi.spyOn(XLSX, 'writeFile').mockImplementation(() => {})

    const mockProdutos: SupervisorDrillProductRow[] = [
      {
        cliente: 'Nestlé',
        produto: 'Ninho Integral 400g',
        tipoRisco: 'Ambos',
        realizado: '10/05/2025',
        validade: '15/05/2025',
        diasRestantes: 5,
        diasEmRuptura: 2,
        quantidade: 14,
        criticidade: 'Crítica',
        acaoRecomendada:
          'Priorizar reposição sem ampliar estoque do lote crítico. Validar retirada do vencido.',
      },
    ]

    const customDate = new Date(2025, 4, 18)
    const result = exportSupervisorDrillProdutosXLSX(
      mockProdutos,
      'CAROLINE OLIVEIRA',
      '101',
      'Hiper Centro',
      'criticas',
      customDate,
    )

    expect(result.count).toBe(1)
    expect(result.fileName).toBe(
      'Supervisor_CAROLINE_OLIVEIRA_101_Hiper_Centro_Produtos_18-05-2025.xlsx',
    )
    expect(writeFileSpy).toHaveBeenCalled()

    writeFileSpy.mockRestore()
  })

  it('3. Lança erro se a lista de itens para exportação estiver vazia', () => {
    expect(() => exportSupervisorDrillLojasXLSX([], 'CAROLINE', 'todas')).toThrow(
      'Nenhuma loja para exportar.',
    )
    expect(() => exportSupervisorDrillProdutosXLSX([], 'CAROLINE', '101', 'Loja', 'todas')).toThrow(
      'Nenhum produto para exportar.',
    )
  })
})
