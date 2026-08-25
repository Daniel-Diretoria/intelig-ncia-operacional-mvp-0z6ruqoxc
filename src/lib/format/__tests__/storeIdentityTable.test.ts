import { describe, it, expect } from 'vitest'
import {
  formatStoreIdentityTable,
  buildStoreCompositeKey,
  formatStoreIdentity,
} from '../storeIdentity'

describe('storeIdentityTable.test.ts — Formatação e Chave Composta da Loja', () => {
  it('formatStoreIdentityTable com código: "085 — FORT ATACADISTA" (em-dash)', () => {
    const res = formatStoreIdentityTable({
      codigoLoja: '085',
      nomeLoja: 'FORT ATACADISTA',
    })
    expect(res).toBe('085 — FORT ATACADISTA')
  })

  it('formatStoreIdentityTable sem código: "SEM CÓDIGO — FORT ATACADISTA"', () => {
    const res = formatStoreIdentityTable({
      codigoLoja: null,
      nomeLoja: 'FORT ATACADISTA',
    })
    expect(res).toBe('SEM CÓDIGO — FORT ATACADISTA')
  })

  it('buildStoreCompositeKey: duas lojas com mesmo código "165" mas nomes/redes diferentes geram chaves DIFERENTES', () => {
    const key1 = buildStoreCompositeKey({
      codigoLoja: '165',
      nomeLoja: 'FORT ATACADISTA KOBRASOL',
      rede: 'FORT ATACADISTA',
      cidade: 'São José',
      uf: 'SC',
    })

    const key2 = buildStoreCompositeKey({
      codigoLoja: '165',
      nomeLoja: 'COMPER CENTRO',
      rede: 'COMPER',
      cidade: 'Campo Grande',
      uf: 'MS',
    })

    expect(key1).not.toBe(key2)
    expect(key1).toContain('165|FORT ATACADISTA KOBRASOL|FORT ATACADISTA|SÃO JOSÉ / SC')
    expect(key2).toContain('165|COMPER CENTRO|COMPER|CAMPO GRANDE / MS')
  })

  it('buildStoreCompositeKey: preserva zeros à esquerda no código', () => {
    const key = buildStoreCompositeKey({
      codigoLoja: '007',
      nomeLoja: 'SUPERMERCADO MODELO',
      rede: 'MODELO',
      cidade: 'Cuiabá',
      uf: 'MT',
    })

    expect(key.startsWith('007|')).toBe(true)
  })

  it('formatStoreIdentity original preserva o bullet • sem quebrar compatibilidade', () => {
    const res = formatStoreIdentity({
      codigo_loja: '085',
      nome_loja: 'FORT ATACADISTA',
    })
    expect(res).toBe('085 • FORT ATACADISTA')
  })
})
