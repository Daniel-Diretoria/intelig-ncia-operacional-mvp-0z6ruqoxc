import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useLojas } from '../useLojas'
import * as baseSelectors from '@/lib/selectors/baseAtualSelectors'
import type { BaseAtualSnapshot } from '@/lib/selectors'

describe('useLojas.test.ts — Serviço useLojas Refatorado', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  const mockSnapshot: BaseAtualSnapshot = {
    alertasOperacionais: [],
    loadedFromBackend: true,
    timestamp: new Date().toISOString(),
    kpisReconciliados: {
      validadesAtivasTotal: 3,
      validadesCriticas: 1,
      validadesAtencao: 1,
      validadesModerado: 1,
      validadesNormal: 1,
      quantidadeTotalEmRisco: 30,
      produtosDistintosEmRisco: 3,
      lojasAfetadas: 3,
      clientesAfetados: 3,
      rupturasAtivasTotal: 1,
      alertasAbertosTotal: 2,
      auditoriaVencidosTotal: 0,
    },
    validadesAtivas: [
      {
        id: 'v1',
        product: 'PROD 1',
        sku: 'SKU1',
        lote: 'L1',
        category: 'Mercearia',
        validade: '2025-06-01',
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
        quantidade: 10,
        dataEntrada: '2025-05-01',
      },
      {
        id: 'v2',
        product: 'PROD 2',
        sku: 'SKU2',
        lote: 'L2',
        category: 'Mercearia',
        validade: '2025-06-20',
        diasRestantes: 25, // Moderado / Normal
        status: 'Moderado',
        unidade: 'UN',
        estoque: 10,
        cliente: 'OUTRA MARCA',
        industria: 'Outra',
        rede: 'COMPER',
        codigoLoja: '165',
        loja: 'COMPER CENTRO',
        cidade: 'Campo Grande',
        uf: 'MS',
        quantidade: 10,
        dataEntrada: '2025-05-01',
      },
      {
        id: 'v3',
        product: 'PROD 3',
        sku: 'SKU3',
        lote: 'L3',
        category: 'Mercearia',
        validade: '2025-08-01',
        diasRestantes: 90, // Normal
        status: 'Normal',
        unidade: 'UN',
        estoque: 10,
        cliente: 'TERCEIRA MARCA',
        industria: 'Terceira',
        rede: 'ASSAI',
        codigoLoja: '085',
        loja: 'ASSAI NORTE',
        cidade: 'Curitiba',
        uf: 'PR',
        quantidade: 10,
        dataEntrada: '2025-05-01',
      },
    ],
    validadesAuditoria: [],
    rupturasAtivas: [
      {
        id: 'r1',
        data_visita: '2025-05-10',
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
        data_entrada: '2025-05-10',
        ultima_aparicao: '2025-05-10',
        operational_key: 'op2',
        dedup_key: 'dedup2',
        source_import_id: 'imp1',
        source_row: 2,
        produto: 'PROD 2',
        motivo: 'Ruptura Total',
        dias_em_ruptura: 4,
        situacao_atual: 'Ativo',
      },
    ],
    lojasAgregadas: [
      {
        lojaKey: '165|FORT ATACADISTA KOBRASOL|FORT ATACADISTA|SÃO JOSÉ (SC)',
        identidade: '165 • FORT ATACADISTA KOBRASOL',
        codigoLoja: '165',
        nomeLoja: 'FORT ATACADISTA KOBRASOL',
        rede: 'FORT ATACADISTA',
        cidade: 'São José',
        uf: 'SC',
        cidadeUf: 'São José (SC)',
        totalClientes: 1,
        totalOcorrenciasAtivas: 1,
        totalRupturasAtivas: 0,
        totalProdutosEmRisco: 1,
        totalQuantidade: 10,
        statusMaisCritico: 'Crítico',
        itemsAtivos: [
          {
            id: 'v1',
            product: 'PROD 1',
            sku: 'SKU1',
            lote: 'L1',
            category: 'Mercearia',
            validade: '2025-06-01',
            diasRestantes: 10,
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
            quantidade: 10,
            dataEntrada: '2025-05-01',
          },
        ],
        itemsAuditoria: [],
      },
      {
        lojaKey: '165|COMPER CENTRO|COMPER|CAMPO GRANDE (MS)',
        identidade: '165 • COMPER CENTRO',
        codigoLoja: '165',
        nomeLoja: 'COMPER CENTRO',
        rede: 'COMPER',
        cidade: 'Campo Grande',
        uf: 'MS',
        cidadeUf: 'Campo Grande (MS)',
        totalClientes: 1,
        totalOcorrenciasAtivas: 1,
        totalRupturasAtivas: 1,
        totalProdutosEmRisco: 1,
        totalQuantidade: 10,
        statusMaisCritico: 'Normal',
        itemsAtivos: [
          {
            id: 'v2',
            product: 'PROD 2',
            sku: 'SKU2',
            lote: 'L2',
            category: 'Mercearia',
            validade: '2025-06-20',
            diasRestantes: 25,
            status: 'Moderado',
            unidade: 'UN',
            estoque: 10,
            cliente: 'OUTRA MARCA',
            industria: 'Outra',
            rede: 'COMPER',
            codigoLoja: '165',
            loja: 'COMPER CENTRO',
            cidade: 'Campo Grande',
            uf: 'MS',
            quantidade: 10,
            dataEntrada: '2025-05-01',
          },
        ],
        itemsAuditoria: [],
      },
      {
        lojaKey: '085|ASSAI NORTE|ASSAI|CURITIBA (PR)',
        identidade: '085 • ASSAI NORTE',
        codigoLoja: '085',
        nomeLoja: 'ASSAI NORTE',
        rede: 'ASSAI',
        cidade: 'Curitiba',
        uf: 'PR',
        cidadeUf: 'Curitiba (PR)',
        totalClientes: 1,
        totalOcorrenciasAtivas: 1,
        totalRupturasAtivas: 0,
        totalProdutosEmRisco: 0,
        totalQuantidade: 10,
        statusMaisCritico: 'Normal',
        itemsAtivos: [
          {
            id: 'v3',
            product: 'PROD 3',
            sku: 'SKU3',
            lote: 'L3',
            category: 'Mercearia',
            validade: '2025-08-01',
            diasRestantes: 90,
            status: 'Normal',
            unidade: 'UN',
            estoque: 10,
            cliente: 'TERCEIRA MARCA',
            industria: 'Terceira',
            rede: 'ASSAI',
            codigoLoja: '085',
            loja: 'ASSAI NORTE',
            cidade: 'Curitiba',
            uf: 'PR',
            quantidade: 10,
            dataEntrada: '2025-05-01',
          },
        ],
        itemsAuditoria: [],
      },
    ],
  }

  it('filteredStores com filtro Rede: KPIs e tabela usam mesmo subconjunto', async () => {
    vi.spyOn(baseSelectors, 'getBaseAtualSnapshot').mockResolvedValue(mockSnapshot)

    const { result } = renderHook(() => useLojas({ networkName: 'FORT ATACADISTA' }))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.filteredStores.length).toBe(1)
    expect(result.current.filteredStores[0].networkName).toBe('FORT ATACADISTA')
    expect(result.current.filteredStores[0].storeName).toBe('FORT ATACADISTA KOBRASOL')
  })

  it('useLojas expõe validadesAtivas e rupturasAtivas após carga', async () => {
    vi.spyOn(baseSelectors, 'getBaseAtualSnapshot').mockResolvedValue(mockSnapshot)

    const { result } = renderHook(() => useLojas())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.validadesAtivas.length).toBe(3)
    expect(result.current.rupturasAtivas.length).toBe(1)
    expect(result.current.validadesAtivas[0].product).toBe('PROD 1')
    expect(result.current.rupturasAtivas[0].produto).toBe('PROD 2')
  })

  it('filteredStores com filtro Situação="Críticas": só lojas com validades 0-15 OU ruptura', async () => {
    vi.spyOn(baseSelectors, 'getBaseAtualSnapshot').mockResolvedValue(mockSnapshot)

    const { result } = renderHook(() => useLojas({ situacao: 'Críticas' }))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // 2 lojas críticas: FORT (validade 10d) e COMPER (ruptura 1)
    expect(result.current.filteredStores.length).toBe(2)
    const storeNames = result.current.filteredStores.map((s) => s.storeName)
    expect(storeNames).toContain('FORT ATACADISTA KOBRASOL')
    expect(storeNames).toContain('COMPER CENTRO')
    expect(storeNames).not.toContain('ASSAI NORTE')
  })

  it('getStoreById com storeId composto retorna loja exata; código parcial NÃO retorna loja errada', async () => {
    vi.spyOn(baseSelectors, 'getBaseAtualSnapshot').mockResolvedValue(mockSnapshot)

    const { result } = renderHook(() => useLojas())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    const targetStore = result.current.stores[0]
    const found = result.current.getStoreById(targetStore.storeId)
    expect(found).toBeDefined()
    expect(found?.storeName).toBe('FORT ATACADISTA KOBRASOL')

    // Passar apenas o código "165" NÃO deve retornar nada
    const partialMatch = result.current.getStoreById('165')
    expect(partialMatch).toBeUndefined()
  })

  it('duas lojas com mesmo código 165 e nomes diferentes: getStoreById distingue', async () => {
    vi.spyOn(baseSelectors, 'getBaseAtualSnapshot').mockResolvedValue(mockSnapshot)

    const { result } = renderHook(() => useLojas())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    const storeFort = result.current.stores.find((s) => s.storeName === 'FORT ATACADISTA KOBRASOL')
    const storeComper = result.current.stores.find((s) => s.storeName === 'COMPER CENTRO')

    expect(storeFort?.storeCode).toBe('165')
    expect(storeComper?.storeCode).toBe('165')
    expect(storeFort?.storeId).not.toBe(storeComper?.storeId)

    const resolvedFort = result.current.getStoreById(storeFort!.storeId)
    const resolvedComper = result.current.getStoreById(storeComper!.storeId)

    expect(resolvedFort?.networkName).toBe('FORT ATACADISTA')
    expect(resolvedComper?.networkName).toBe('COMPER')
  })

  it('deduplicação de StoreSummary: duas entradas com mesmo storeCode+storeName+city unificam na entrada com UF e rede preenchidos', async () => {
    const duplicateSnapshot: BaseAtualSnapshot = {
      alertasOperacionais: [],
      loadedFromBackend: true,
      timestamp: new Date().toISOString(),
      kpisReconciliados: {
        validadesAtivasTotal: 2,
        validadesCriticas: 1,
        validadesAtencao: 0,
        validadesModerado: 1,
        validadesNormal: 0,
        quantidadeTotalEmRisco: 20,
        produtosDistintosEmRisco: 2,
        lojasAfetadas: 1,
        clientesAfetados: 1,
        rupturasAtivasTotal: 1,
        alertasAbertosTotal: 1,
        auditoriaVencidosTotal: 0,
      },
      validadesAtivas: [],
      validadesAuditoria: [],
      rupturasAtivas: [],
      lojasAgregadas: [
        {
          lojaKey: '165|FORT ATACADISTA AVENTUREIRO||JOINVILLE',
          identidade: '165 • FORT ATACADISTA AVENTUREIRO',
          codigoLoja: '165',
          nomeLoja: 'FORT ATACADISTA AVENTUREIRO',
          rede: '',
          cidade: 'Joinville',
          uf: '',
          cidadeUf: 'Joinville',
          totalClientes: 1,
          totalOcorrenciasAtivas: 1,
          totalRupturasAtivas: 0,
          totalProdutosEmRisco: 1,
          totalQuantidade: 10,
          statusMaisCritico: 'Crítico',
          itemsAtivos: [
            {
              id: 'v_dup_1',
              product: 'PROD DUP 1',
              sku: 'SKU_D1',
              lote: 'L1',
              category: 'Mercearia',
              validade: '2025-06-01',
              diasRestantes: 5, // Crítico
              status: 'Crítico',
              unidade: 'UN',
              estoque: 10,
              cliente: 'MARCA TESTE',
              industria: 'Indústria',
              rede: '',
              codigoLoja: '165',
              loja: 'FORT ATACADISTA AVENTUREIRO',
              cidade: 'Joinville',
              uf: '',
              quantidade: 10,
            },
          ],
          itemsAuditoria: [],
        },
        {
          lojaKey: '165|FORT ATACADISTA AVENTUREIRO|FORT ATACADISTA|JOINVILLE (SC)',
          identidade: '165 • FORT ATACADISTA AVENTUREIRO',
          codigoLoja: '165',
          nomeLoja: 'FORT ATACADISTA AVENTUREIRO',
          rede: 'FORT ATACADISTA',
          cidade: 'Joinville',
          uf: 'SC',
          cidadeUf: 'Joinville (SC)',
          totalClientes: 1,
          totalOcorrenciasAtivas: 0,
          totalRupturasAtivas: 1,
          totalProdutosEmRisco: 0,
          totalQuantidade: 0,
          statusMaisCritico: 'Normal',
          itemsAtivos: [],
          itemsAuditoria: [],
        },
      ],
    }

    vi.spyOn(baseSelectors, 'getBaseAtualSnapshot').mockResolvedValue(duplicateSnapshot)

    const { result } = renderHook(() => useLojas())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // Deve resultar em exatamente 1 loja após a deduplicação
    expect(result.current.stores.length).toBe(1)
    const store = result.current.stores[0]
    expect(store.storeCode).toBe('165')
    expect(store.storeName).toBe('FORT ATACADISTA AVENTUREIRO')
    expect(store.networkName).toBe('FORT ATACADISTA')
    expect(store.city).toBe('Joinville')
    expect(store.uf).toBe('SC')
    expect(store.validadesCriticasCount).toBe(1)
    expect(store.rupturasAtivasCount).toBe(1)
    expect(store.situacao).toBe('Crítica')
  })
})
