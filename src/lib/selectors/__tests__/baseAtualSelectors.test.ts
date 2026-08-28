import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getBaseAtualSnapshot, resetBaseAtualCache } from '../baseAtualSelectors'
import pb from '@/lib/pocketbase/client'

describe('baseAtualSelectors.test.ts — Carregamento Paginado, Concorrência, Cache e Telemetria', () => {
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

  it('2. Concorrência máxima 4 workers: com 15 páginas, dispara em batches de até 4 simultâneos', async () => {
    let currentConcurrent = 0
    let maxObservedConcurrent = 0

    const mockGetList = vi.fn().mockImplementation(async (page: number) => {
      currentConcurrent++
      if (currentConcurrent > maxObservedConcurrent) {
        maxObservedConcurrent = currentConcurrent
      }

      // Simula latência de rede de 30ms por página
      await new Promise((resolve) => setTimeout(resolve, 30))
      currentConcurrent--

      return {
        items: [
          {
            id: `val_p${page}`,
            produto: `Produto P${page}`,
            quantidade: 1,
            validade: '2026-12-01',
            codigo_loja: '001',
            nome_loja: 'Loja 1',
            cidade: 'Florianópolis',
            estado: 'SC',
          },
        ],
        page,
        perPage: 500,
        totalPages: 15,
        totalItems: 7401,
      }
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

    const startTime = Date.now()
    const snapshot = await getBaseAtualSnapshot(true)
    const duration = Date.now() - startTime

    // 15 páginas foram chamadas
    expect(mockGetList).toHaveBeenCalledTimes(15)
    // Concorrência nunca deve ultrapassar 4 workers simultâneos
    expect(maxObservedConcurrent).toBeLessThanOrEqual(4)
    // Coletou todos os 15 itens
    expect(snapshot.validadesAtivas.length).toBe(15)
    // Com mock de 30ms, 15 páginas levam em torno de ~150-300ms (muito menos que 15 * 30ms = 450ms sequenciais)
    expect(duration).toBeLessThan(4000)
  })

  it('3. Cache hit: segunda chamada retorna sem nova requisição', async () => {
    const mockGetList = vi.fn().mockResolvedValue({
      items: [
        {
          id: 'val_1',
          produto: 'Prod 1',
          quantidade: 5,
          validade: '2026-05-10',
          nome_loja: 'Loja A',
        },
      ],
      page: 1,
      perPage: 500,
      totalPages: 1,
      totalItems: 1,
    })

    vi.spyOn(pb, 'collection').mockReturnValue({ getList: mockGetList } as any)

    // Primeira chamada: cache miss (busca no banco)
    const snap1 = await getBaseAtualSnapshot()
    expect(mockGetList).toHaveBeenCalledTimes(2) // 1x validades_base, 1x rupturas_base

    // Segunda chamada: cache hit (retorna imediatamente da memória)
    const snap2 = await getBaseAtualSnapshot()
    expect(mockGetList).toHaveBeenCalledTimes(2) // nenhuma nova chamada ao getList
    expect(snap1).toBe(snap2)
  })

  it('8. Defesa de cache: se o cache tem 0 rupturas e validades > 0, invalida cache e busca fresh', async () => {
    let callCount = 0
    const mockGetList = vi.fn().mockImplementation((col: string) => {
      callCount++
      if (callCount <= 2) {
        // Primeira rodada: validades retorna 1 item, rupturas retorna 0 itens (simulando cache corrompido/inconsistente)
        if (callCount === 1) {
          return Promise.resolve({
            items: [
              { id: 'v1', produto: 'P1', quantidade: 5, validade: '2026-06-01', nome_loja: 'L1' },
            ],
            page: 1,
            perPage: 500,
            totalPages: 1,
            totalItems: 1,
          })
        }
        return Promise.resolve({
          items: [],
          page: 1,
          perPage: 500,
          totalPages: 1,
          totalItems: 0,
        })
      }
      // Segunda rodada: rupturas restauradas
      return Promise.resolve({
        items: [{ id: 'r1', produto: 'R1', situacao_atual: 'Ativo', nome_loja: 'L1' }],
        page: 1,
        perPage: 500,
        totalPages: 1,
        totalItems: 1,
      })
    })

    vi.spyOn(pb, 'collection').mockReturnValue({ getList: mockGetList } as any)

    const snap1 = await getBaseAtualSnapshot()
    expect(snap1.validadesAtivas.length).toBe(1)
    expect(snap1.rupturasAtivas.length).toBe(0)
    expect(mockGetList).toHaveBeenCalledTimes(2)

    // Segunda chamada sem forceRefresh: detecta 0 rupturas com validades > 0 e força refresh automático
    const snap2 = await getBaseAtualSnapshot()
    expect(mockGetList).toHaveBeenCalledTimes(4) // disparou nova busca fresh
    expect(snap2.rupturasAtivas.length).toBe(1)
  })

  it('4. Deduplicação StrictMode: duas chamadas simultâneas compartilham a mesma promessa', async () => {
    const mockGetList = vi.fn().mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
      return {
        items: [
          { id: 'v1', produto: 'P1', quantidade: 2, validade: '2026-06-01', nome_loja: 'L1' },
        ],
        page: 1,
        perPage: 500,
        totalPages: 1,
        totalItems: 1,
      }
    })

    vi.spyOn(pb, 'collection').mockReturnValue({ getList: mockGetList } as any)

    // Dispara duas chamadas concorrentes
    const [snap1, snap2] = await Promise.all([getBaseAtualSnapshot(), getBaseAtualSnapshot()])

    // Ambas recebem o mesmo snapshot e houve apenas 2 requisições no total (1 validades + 1 rupturas)
    expect(snap1).toEqual(snap2)
    expect(mockGetList).toHaveBeenCalledTimes(2)
  })

  it('5. Invalidação de cache por evento diretoria:refresh', async () => {
    const mockGetList = vi.fn().mockResolvedValue({
      items: [{ id: 'v1', produto: 'P1', quantidade: 2, validade: '2026-06-01', nome_loja: 'L1' }],
      page: 1,
      perPage: 500,
      totalPages: 1,
      totalItems: 1,
    })

    vi.spyOn(pb, 'collection').mockReturnValue({ getList: mockGetList } as any)

    await getBaseAtualSnapshot()
    expect(mockGetList).toHaveBeenCalledTimes(2)

    // Dispara evento global 'diretoria:refresh'
    window.dispatchEvent(new Event('diretoria:refresh'))

    // Próxima chamada deve buscar fresh novamente
    await getBaseAtualSnapshot()
    expect(mockGetList).toHaveBeenCalledTimes(4)
  })

  it('6. Projection fields: adiciona fields projection nas requisições', async () => {
    const mockGetList = vi.fn().mockResolvedValue({
      items: [],
      page: 1,
      perPage: 500,
      totalPages: 1,
      totalItems: 0,
    })

    vi.spyOn(pb, 'collection').mockReturnValue({ getList: mockGetList } as any)

    await getBaseAtualSnapshot(true)

    expect(mockGetList).toHaveBeenCalledWith(
      1,
      500,
      expect.objectContaining({
        fields: expect.stringContaining('is_base_atual'),
      }),
    )
  })

  it('7. Resiliência: se uma página falhar, não quebra todo o snapshot', async () => {
    const mockGetList = vi.fn().mockImplementation((page: number) => {
      if (page === 1) {
        return Promise.resolve({
          items: [{ id: 'val_1', validade: '2025-10-15', quantidade: 10, nome_loja: 'Loja 1' }],
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

  it('filtra snapshot exclusivamente por is_base_atual=true, incluindo registros promovidos de tradepro_job_*', async () => {
    const mockRupturas = [
      {
        id: 'r1',
        is_base_atual: true,
        tenant_id: 'import_123',
        codigo_loja: '001',
        produto: 'Prod A',
        situacao_atual: 'Ativo',
      },
      {
        id: 'r2',
        is_base_atual: false,
        tenant_id: 'tradepro_job_abc',
        codigo_loja: '002',
        produto: 'Prod B',
        situacao_atual: 'Ativo',
      },
      {
        id: 'r3',
        is_base_atual: true,
        tenant_id: 'tradepro_job_xyz',
        codigo_loja: '003',
        produto: 'Prod C',
        situacao_atual: 'Ativo',
      },
    ]

    const mockGetList = vi
      .fn()
      .mockImplementation((page: number, perPage: number, options: any) => {
        // Simula o PocketBase aplicando o filtro passado na query (is_base_atual = true)
        const filterStr = options?.filter || ''
        expect(filterStr).toContain('is_base_atual = true')
        expect(filterStr).not.toContain('tenant_id !~ "tradepro_job_"')

        const filtered = mockRupturas.filter((r) => {
          if (filterStr.includes('is_base_atual = true') && !r.is_base_atual) return false
          return true
        })

        return Promise.resolve({
          items: filtered,
          page: 1,
          perPage: 500,
          totalPages: 1,
          totalItems: filtered.length,
        })
      })

    vi.spyOn(pb, 'collection').mockImplementation(((col: string) => {
      if (col === 'rupturas_base') {
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

    // r1 e r3 são elegíveis (is_base_atual=true); r2 é oculto (is_base_atual=false)
    expect(snapshot.rupturasAtivas.length).toBe(2)
    expect(snapshot.rupturasAtivas.map((r) => r.id)).toEqual(['r1', 'r3'])
    expect(snapshot.kpisReconciliados.rupturasAtivasTotal).toBe(2)
  })
})
