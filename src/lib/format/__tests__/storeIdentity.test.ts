import { describe, it, expect } from 'vitest'
import {
  parseCityUf,
  buildStoreCompositeKey,
  formatStoreIdentity,
  formatStoreIdentityTable,
} from '../storeIdentity'

describe('storeIdentity.test.ts — Normalização e Identidade de Lojas', () => {
  // 1. parseCityUf("Joinville", "SC") → { city: "Joinville", uf: "SC" }
  it('1. parseCityUf("Joinville", "SC") retorna { city: "Joinville", uf: "SC" }', () => {
    expect(parseCityUf('Joinville', 'SC')).toEqual({ city: 'Joinville', uf: 'SC' })
  })

  // 2. parseCityUf("Joinville / SC", "") → { city: "Joinville", uf: "SC" }
  it('2. parseCityUf("Joinville / SC", "") extrai UF da barra com espaços', () => {
    expect(parseCityUf('Joinville / SC', '')).toEqual({ city: 'Joinville', uf: 'SC' })
  })

  // 3. parseCityUf("Joinville/SC", "") → { city: "Joinville", uf: "SC" }
  it('3. parseCityUf("Joinville/SC", "") extrai UF da barra colada', () => {
    expect(parseCityUf('Joinville/SC', '')).toEqual({ city: 'Joinville', uf: 'SC' })
  })

  // 4. parseCityUf("JOINVILLE - SC", "") → { city: "JOINVILLE", uf: "SC" }
  it('4. parseCityUf("JOINVILLE - SC", "") extrai UF do traço', () => {
    expect(parseCityUf('JOINVILLE - SC', '')).toEqual({ city: 'JOINVILLE', uf: 'SC' })
  })

  // 5. parseCityUf("Chapecó", "") → { city: "Chapecó", uf: "" } (sem UF)
  it('5. parseCityUf("Chapecó", "") retorna cidade sem UF inventada', () => {
    expect(parseCityUf('Chapecó', '')).toEqual({ city: 'Chapecó', uf: '' })
  })

  // 6. parseCityUf("São Paulo / SP", "") → { city: "São Paulo", uf: "SP" }
  it('6. parseCityUf("São Paulo / SP", "") extrai SP corretamente', () => {
    expect(parseCityUf('São Paulo / SP', '')).toEqual({ city: 'São Paulo', uf: 'SP' })
  })

  // 7. Chave composta para "165" FORT ATACADISTA AVENTUREIRO com cidade="Joinville", uf="" → deve conter "JOINVILLE" (sem UF inventada)
  it('7. Chave composta para "165" FORT ATACADISTA AVENTUREIRO com cidade="Joinville", uf="" contém JOINVILLE', () => {
    const key = buildStoreCompositeKey({
      codigoLoja: '165',
      nomeLoja: 'FORT ATACADISTA AVENTUREIRO',
      rede: 'FORT ATACADISTA',
      cidade: 'Joinville',
      uf: '',
    })
    expect(key).toBe('165|FORT ATACADISTA AVENTUREIRO|FORT ATACADISTA|JOINVILLE')
  })

  // 8. Chave composta para "165" BRASIL ATACADISTA PALHOÇA BR 101 com cidade="Palhoça", uf="SC" → deve ser DIFERENTE da chave do FORT
  it('8. Chave composta para "165" BRASIL ATACADISTA PALHOÇA BR 101 é DIFERENTE da chave do FORT', () => {
    const keyFort = buildStoreCompositeKey({
      codigoLoja: '165',
      nomeLoja: 'FORT ATACADISTA AVENTUREIRO',
      rede: 'FORT ATACADISTA',
      cidade: 'Joinville',
      uf: 'SC',
    })

    const keyBrasil = buildStoreCompositeKey({
      codigoLoja: '165',
      nomeLoja: 'BRASIL ATACADISTA PALHOÇA BR 101',
      rede: 'BRASIL ATACADISTA',
      cidade: 'Palhoça',
      uf: 'SC',
    })

    expect(keyBrasil).not.toBe(keyFort)
    expect(keyBrasil).toBe('165|BRASIL ATACADISTA PALHOÇA BR 101|BRASIL ATACADISTA|PALHOÇA / SC')
  })

  // 9. Duas lojas mesmo código "165", nomes/rede diferentes → buildStoreCompositeKey retorna chaves diferentes
  it('9. Duas lojas mesmo código "165", nomes/rede diferentes geram chaves diferentes', () => {
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
  })

  // 10. Loja com mesmo código, nome, rede, mas cidade "Joinville" vs "Joinville / SC" → parseCityUf normaliza para mesma chave
  it('10. Loja com mesma identidade e cidade "Joinville" vs "Joinville / SC" normaliza para a MESMA chave', () => {
    // Caso 1: Ruptura com cidade="Joinville", estado="SC"
    const keyRuptura = buildStoreCompositeKey({
      codigoLoja: '944',
      nomeLoja: 'FORT ATACADISTA CHAPECÓ II',
      rede: 'FORT ATACADISTA',
      cidade: 'Chapecó',
      uf: 'SC',
    })

    // Caso 2: Validade com cidade="Chapecó / SC", estado=""
    const keyValidadeComUfNaCidade = buildStoreCompositeKey({
      codigoLoja: '944',
      nomeLoja: 'FORT ATACADISTA CHAPECÓ II',
      rede: 'FORT ATACADISTA',
      cidade: 'Chapecó / SC',
      uf: '',
    })

    expect(keyValidadeComUfNaCidade).toBe(keyRuptura)
  })
})
