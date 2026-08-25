import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getBaseAtualSnapshot, resetBaseAtualCache } from '../baseAtualSelectors'
import pb from '@/lib/pocketbase/client'

describe('baseAtualSelectors.test.ts — Carregamento Paginado e parseCityUf', () => {
  beforeEach(() => {
    resetBaseAtualCache()
    vi.restoreAllMocks()
  })

  it('1. Carrega dados paginados de validades_base com perPage=500 e normaliza cidade/UF', async () => {
    // Simula 2 páginas de 500 registros
    const page1Items = Array.from({ length: 500 }, (_, i) => ({
      id: `val_${i + 1}`,
      produto: `Produto ${i + 1}`,
      cod_produto: `SKU_${i + 1}`,
      validade: '2025-10-15',
      quantidade: 10,
      codigo_loja: '944',
      nome_loja: 'FORT ATACADISTA CHAPECÓ II',
      cidade: 'Chapecó / SC',
      estado: '', // vazio, deve ser extraído via parseCityUf
      cliente: 'MARCA A',
    }))

    const page2Items = Array.from({ length: 100 }, (_, i) => ({
      id: `val_${501 + i}`,
      produto: `Produto ${501 + i}`,
      cod_produto: `SKU_${501 + i}`,
      validade: '2025-10-20',
      quantidade: 5,
      codigo_loja: '165',
      nome_loja: 'FORT ATACADISTA AVENTUREIRO',
      cidade: 'Joinville',
      estado: '', // sem UF
      cliente: 'MARCA B',
    }))

    const mockGetList = vi.fn().mockImplementation((page: number) => {
      if (page === 1) {
        return Promise.resolve({
          items: page1Items,
          page: 1,
          perPage: 500,
          totalPages: 2,
          totalItems: 600,
        })
      }
      return Promise.resolve({
        items: page2Items,
        page: 2,
        perPage: 500,
        totalPages: 2,
        totalItems: 600,
      })
    })

    const mockCollection = vi.fn().mockImplementation((col: string) => {
      if (col === 'validades_base') {
        return { getList: mockGetList }
      }
      return {
        getList: vi.fn().mockResolvedValue({
          items: [
            {
              id: 'rup_1',
              codigo_loja: '944',
              nome_loja: 'FORT ATACADISTA CHAPECÓ II',
              cidade: 'Chapecó',
              estado: 'SC',
              situacao_atual: 'Ativo',
              produto: 'Produto Ruptura',
            },
          ],
          page: 1,
          perPage: 500,
          totalPages: 1,
          totalItems: 1,
        }),
      }
    })

    vi.spyOn(pb, 'collection').mockImplementation(mockCollection as any)

    const snapshot = await getBaseAtualSnapshot(true)

    // Verifica que fez 2 chamadas paginadas para validades_base
    expect(mockGetList).toHaveBeenCalledTimes(2)
    expect(mockGetList).toHaveBeenCalledWith(1, 500, expect.any(Object))
    expect(mockGetList).toHaveBeenCalledWith(2, 500, expect.any(Object))

    // Validades ativas totalizam 600
    expect(snapshot.validadesAtivas.length).toBe(600)

    // Primeira loja com cidade "Chapecó / SC" e estado "" teve UF extraída para "SC"
    const firstVal = snapshot.validadesAtivas[0]
    expect(firstVal.cidade).toBe('Chapecó')
    expect(firstVal.uf).toBe('SC')

    // Segunda loja com cidade "Joinville" e sem UF preserva "Joinville" e ""
    const secondVal = snapshot.validadesAtivas[500]
    expect(secondVal.cidade).toBe('Joinville')
    expect(secondVal.uf).toBe('')

    // A loja 944 consolidou a ruptura e as 500 validades na mesma loja agregada!
    const loja944 = snapshot.lojasAgregadas.find((l) => l.codigoLoja === '944')
    expect(loja944).toBeDefined()
    expect(loja944?.totalOcorrenciasAtivas).toBe(500)
    expect(loja944?.totalRupturasAtivas).toBe(1)
  })

  it('2. Segunda passagem de merge: unifica LojaAgregada com mesmo codigo+nome+cidade quando rede ou uf estão vazias', async () => {
    // Simula uma validade com rede vazia e uf vazia, e uma ruptura da mesma loja com rede "FORT ATACADISTA" e uf "SC"
    const validadesRecords = [
      {
        id: 'val_joinville_1',
        produto: 'PRODUTO VALIDADE',
        cod_produto: 'SKU_100',
        validade: '2025-11-01',
        quantidade: 15,
        codigo_loja: '165',
        nome_loja: 'FORT ATACADISTA AVENTUREIRO',
        cidade: 'Joinville',
        estado: '', // UF vazia
        rede: '', // Rede vazia
        cliente: 'MARCA TESTE',
      },
    ]

    const rupturasRecords = [
      {
        id: 'rup_joinville_1',
        codigo_loja: '165',
        nome_loja: 'FORT ATACADISTA AVENTUREIRO',
        cidade: 'Joinville',
        estado: 'SC', // UF presente
        situacao_atual: 'Ativo',
        produto: 'PRODUTO RUPTURA',
        cliente: 'MARCA TESTE',
      },
    ]

    const mockCollection = vi.fn().mockImplementation((col: string) => {
      if (col === 'validades_base') {
        return {
          getList: vi.fn().mockResolvedValue({
            items: validadesRecords,
            page: 1,
            perPage: 500,
            totalPages: 1,
            totalItems: 1,
          }),
        }
      }
      return {
        getList: vi.fn().mockResolvedValue({
          items: rupturasRecords,
          page: 1,
          perPage: 500,
          totalPages: 1,
          totalItems: 1,
        }),
      }
    })

    vi.spyOn(pb, 'collection').mockImplementation(mockCollection as any)

    const snapshot = await getBaseAtualSnapshot(true)

    // Deve resultar em exatamente 1 LojaAgregada após a segunda passagem de merge
    const lojasAventureiro = snapshot.lojasAgregadas.filter(
      (l) => l.codigoLoja === '165' && l.nomeLoja.toUpperCase().includes('AVENTUREIRO'),
    )
    expect(lojasAventureiro.length).toBe(1)

    const loja = lojasAventureiro[0]
    expect(loja.rede).toBe('FORT ATACADISTA')
    expect(loja.uf).toBe('SC')
    expect(loja.cidade).toBe('Joinville')
    expect(loja.totalOcorrenciasAtivas).toBe(1)
    expect(loja.totalRupturasAtivas).toBe(1)
    expect(loja.totalQuantidade).toBe(15)
  })

  it('3. Resiliência: se uma página falhar, não quebra todo o snapshot', async () => {
    let callCount = 0
    const mockGetList = vi.fn().mockImplementation((page: number) => {
      callCount++
      if (page === 1) {
        return Promise.resolve({
          items: [{ id: 'val_1', validade: '2025-10-15', quantidade: 10, loja: 'Loja 1' }],
          page: 1,
          perPage: 500,
          totalPages: 2,
          totalItems: 501,
        })
      }
      return Promise.reject(new Error('Network drop on page 2'))
    })

    vi.spyOn(pb, 'collection').mockImplementation(((col: string) => {
      if (col === 'validades_base') {
        return { getList: mockGetList }
      }
      return {
        getList: vi.fn().mockResolvedValue({
          items: [],
          page: 1,
          perPage: 500,
          totalPages: 1,
          totalItems: 0,
        }),
      }
    }) as any)

    const snapshot = await getBaseAtualSnapshot(true)

    // Acumulou os itens da página 1 mesmo com falha na página 2
    expect(snapshot.validadesAtivas.length).toBe(1)
    expect(snapshot.loadedFromBackend).toBe(true)
  })
})
