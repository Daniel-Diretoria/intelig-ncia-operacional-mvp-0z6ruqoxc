import { describe, it, expect } from 'vitest'
import {
  dedupRupturas,
  buildRupturaDedupKey,
  buildRupturaOperationalKey,
  normalizeRupturaMotivo,
  extractStoreCode,
  filterLast90Days,
} from '../rupturasPipeline'

describe('Pipeline de Rupturas (Rupturas Pipeline)', () => {
  // Teste a) solicitado no briefing:
  // dedupRupturas escolhe a MAIOR data_visita (não a menor).
  // Dado 3 registros do mesmo grupo com datas 2026-08-01, 2026-08-10, 2026-08-05,
  // o escolhido deve ser 2026-08-10.
  it('a) dedupRupturas deve selecionar a MAIOR data_visita em cada grupo de dedup', () => {
    const rows = [
      {
        nome_loja: '085 - FORT ATACADISTA JARAGUÁ DO SUL',
        produto: 'LEITE INTEGRAL 1L',
        cliente: 'PIRACANJUBA',
        data_visita: '2026-08-01',
        id_temp: '1',
      },
      {
        nome_loja: '085 - FORT ATACADISTA JARAGUÁ DO SUL',
        produto: 'LEITE INTEGRAL 1L',
        cliente: 'PIRACANJUBA',
        data_visita: '2026-08-10',
        id_temp: '2',
      },
      {
        nome_loja: '085 - FORT ATACADISTA JARAGUÁ DO SUL',
        produto: 'LEITE INTEGRAL 1L',
        cliente: 'PIRACANJUBA',
        data_visita: '2026-08-05',
        id_temp: '3',
      },
    ]

    const resultado = dedupRupturas(rows)
    expect(resultado).toHaveLength(1)
    expect(resultado[0].data_visita).toBe('2026-08-10')
    expect(resultado[0].id_temp).toBe('2')
  })

  it('deve agrupar por loja, produto e cliente separadamente no dedup', () => {
    const rows = [
      // Grupo 1: Loja 085, Produto A, Cliente X
      {
        nome_loja: '085 - FORT ATACADISTA',
        produto: 'PRODUTO A',
        cliente: 'CLIENTE X',
        data_visita: '2026-08-02',
      },
      {
        nome_loja: '085 - FORT ATACADISTA',
        produto: 'PRODUTO A',
        cliente: 'CLIENTE X',
        data_visita: '2026-08-09',
      },
      // Grupo 2: Loja 085, Produto B, Cliente X
      {
        nome_loja: '085 - FORT ATACADISTA',
        produto: 'PRODUTO B',
        cliente: 'CLIENTE X',
        data_visita: '2026-08-04',
      },
      // Grupo 3: Loja 120, Produto A, Cliente X
      {
        nome_loja: '120 - FORT ATACADISTA',
        produto: 'PRODUTO A',
        cliente: 'CLIENTE X',
        data_visita: '2026-08-07',
      },
    ]

    const resultado = dedupRupturas(rows)
    expect(resultado).toHaveLength(3)

    const grupo1 = resultado.find((r) => r.produto === 'PRODUTO A' && r.nome_loja.includes('085'))
    expect(grupo1?.data_visita).toBe('2026-08-09')

    const grupo2 = resultado.find((r) => r.produto === 'PRODUTO B')
    expect(grupo2?.data_visita).toBe('2026-08-04')

    const grupo3 = resultado.find((r) => r.nome_loja.includes('120'))
    expect(grupo3?.data_visita).toBe('2026-08-07')
  })

  it('deve extrair código de loja numérico preservando zeros à esquerda', () => {
    expect(extractStoreCode('085 - FORT ATACADISTA')).toBe('085')
    expect(extractStoreCode('007 - HIPERMERCADO ABC')).toBe('007')
    expect(extractStoreCode('LOJA 12 - SEM NUMERO NO INICIO')).toBe('LOJA 12')
    expect(extractStoreCode('')).toBe('')
  })

  it('deve padronizar os motivos de ruptura corretamente', () => {
    expect(normalizeRupturaMotivo('Ruptura total no pdv')).toBe('Ruptura Total')
    expect(normalizeRupturaMotivo('Estoque zerado')).toBe('Sem Estoque Mínimo')
    expect(normalizeRupturaMotivo('Sem estoque mínimo')).toBe('Sem Estoque Mínimo')
    expect(normalizeRupturaMotivo('Estoque virtual divergente')).toBe('Estoque Virtual')
    expect(normalizeRupturaMotivo('Outro motivo qualquer')).toBe('Ruptura Total')
  })

  it('deve construir chaves operacionais e de dedup canônicas', () => {
    expect(buildRupturaOperationalKey('085', 'IOGURTE', '2026-08-10')).toBe(
      '085|IOGURTE|2026-08-10',
    )
    expect(buildRupturaDedupKey('085', 'IOGURTE', 'FRUTAP')).toBe('085|IOGURTE|FRUTAP')
  })
})
