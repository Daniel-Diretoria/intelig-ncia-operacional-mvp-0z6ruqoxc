import { describe, it, expect } from 'vitest'
import {
  parseCityUf,
  buildStoreCompositeKey,
  buildCityUfCanonicalizer,
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

  describe('buildCityUfCanonicalizer', () => {
    it('duas lojas diferentes em Joinville, uma uf="" e outra uf="SC": as duas lojas permanecem, mas canonicalize infere SC para a sem UF', () => {
      const stores = [
        { city: 'Joinville', uf: 'SC' },
        { city: 'Joinville', uf: '' },
      ]
      const canonicalize = buildCityUfCanonicalizer(stores)

      // Ambas as lojas existem — canonicalizer não remove nada
      const r1 = canonicalize('Joinville', 'SC')
      const r2 = canonicalize('Joinville', '')

      expect(r1).toEqual({ city: 'Joinville', uf: 'SC' })
      expect(r2).toEqual({ city: 'Joinville', uf: 'SC' }) // infere SC
    })

    it('cidade com múltiplas UFs não infere para vazios', () => {
      const stores = [
        { city: 'São Paulo', uf: 'SP' },
        { city: 'São Paulo', uf: 'MG' },
      ]
      const canonicalize = buildCityUfCanonicalizer(stores)

      const r1 = canonicalize('São Paulo', 'SP')
      const r2 = canonicalize('São Paulo', 'MG')
      const r3 = canonicalize('São Paulo', '')

      expect(r1).toEqual({ city: 'São Paulo', uf: 'SP' })
      expect(r2).toEqual({ city: 'São Paulo', uf: 'MG' })
      expect(r3).toEqual({ city: 'São Paulo', uf: '' }) // ambíguo: mantém vazio
    })

    it('cidade com UF conhecida, canonicalize com UF já preenchida retorna igual', () => {
      const stores = [
        { city: 'Florianópolis', uf: 'SC' },
        { city: 'Palhoça', uf: 'SC' },
      ]
      const canonicalize = buildCityUfCanonicalizer(stores)

      expect(canonicalize('Florianópolis', 'SC')).toEqual({ city: 'Florianópolis', uf: 'SC' })
      expect(canonicalize('Florianópolis', '')).toEqual({ city: 'Florianópolis', uf: 'SC' })
      expect(canonicalize('Palhoça', 'SC')).toEqual({ city: 'Palhoça', uf: 'SC' })
      expect(canonicalize('Palhoça', '')).toEqual({ city: 'Palhoça', uf: 'SC' })
    })

    it('cidade sem nenhuma UF conhecida retorna com uf vazia', () => {
      const stores = [{ city: 'Cidade Desconhecida', uf: '' }]
      const canonicalize = buildCityUfCanonicalizer(stores)
      expect(canonicalize('Cidade Desconhecida', '')).toEqual({
        city: 'Cidade Desconhecida',
        uf: '',
      })
    })

    it('extrai UF do nome da cidade caso esteja formatado tipo "Blumenau / SC" e infere para "Blumenau"', () => {
      const stores = [
        { city: 'Blumenau / SC', uf: '' },
        { city: 'Blumenau', uf: '' },
      ]
      const canonicalize = buildCityUfCanonicalizer(stores)
      expect(canonicalize('Blumenau', '')).toEqual({ city: 'Blumenau', uf: 'SC' })
    })
  })
})
