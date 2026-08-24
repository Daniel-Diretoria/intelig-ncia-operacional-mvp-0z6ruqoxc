import { describe, it, expect } from 'vitest'
import {
  normalizeStoreCode,
  formatStoreCode,
  normalizeStoreCodeForMatching,
} from '../../format/storeCode'
import {
  extractStoreFromRazaoSocial,
  resolveStoreMatch,
  detectNetworkFromFantasia,
  recognizeStore,
} from '../storeRecognition'
import {
  formatStoreIdentity,
  extractStoreRealCode,
  extractStoreCleanName,
  extractFromCombined,
  removeRepeatedCodePrefix,
  deriveNetworkName,
  formatCityUf,
  formatProductSku,
} from '../../format/storeIdentity'

describe('storeCode / storeRecognition / storeIdentity.test.ts — Identidade e Reconhecimento de Lojas', () => {
  describe('1. Separadores de Razão Social (" - ", " • ", " · ") e extração', () => {
    it('reconhece "00001 - NOME LOJA"', () => {
      const rec = extractStoreFromRazaoSocial('00001 - NOME LOJA')
      expect(rec.codigoLoja).toBe('00001')
      expect(rec.nomeLoja).toBe('NOME LOJA')
      expect(rec.origemReconhecimento).toBe('codigo_externo')

      const combined = extractFromCombined('00001 - NOME LOJA')
      expect(combined.extractedCode).toBe('00001')
      expect(combined.cleanName).toBe('NOME LOJA')
    })

    it('reconhece "00001 • NOME LOJA"', () => {
      const rec = extractStoreFromRazaoSocial('00001 • NOME LOJA')
      expect(rec.codigoLoja).toBe('00001')
      expect(rec.nomeLoja).toBe('NOME LOJA')
      expect(rec.origemReconhecimento).toBe('codigo_externo')

      const combined = extractFromCombined('00001 • NOME LOJA')
      expect(combined.extractedCode).toBe('00001')
      expect(combined.cleanName).toBe('NOME LOJA')
    })

    it('reconhece "00001 · NOME LOJA"', () => {
      const rec = extractStoreFromRazaoSocial('00001 · NOME LOJA')
      expect(rec.codigoLoja).toBe('00001')
      expect(rec.nomeLoja).toBe('NOME LOJA')
      expect(rec.origemReconhecimento).toBe('codigo_externo')

      const combined = extractFromCombined('00001 · NOME LOJA')
      expect(combined.extractedCode).toBe('00001')
      expect(combined.cleanName).toBe('NOME LOJA')
    })
  })

  describe('2. Preservação de zeros à esquerda como texto ("007" não vira 7)', () => {
    it('normalizeStoreCode preserva string "007" e formata 7 como "007"', () => {
      expect(normalizeStoreCode('007')).toBe('007')
      expect(normalizeStoreCode(7)).toBe('007')
      expect(formatStoreCode('007')).toBe('007')
      expect(formatStoreCode('085')).toBe('085')
      expect(formatStoreCode('115')).toBe('115')
    })

    it('formatStoreIdentity preserva zeros à esquerda no código da loja', () => {
      const res = formatStoreIdentity({
        codigoLoja: '007',
        nomeLoja: 'FORT ATACADISTA CENTRO',
      })
      expect(res).toBe('007 • FORT ATACADISTA CENTRO')
    })

    it('extractStoreRealCode preserva zeros à esquerda ("00045")', () => {
      expect(extractStoreRealCode('00045 - BISTEK SUPERMERCADOS')).toBe('00045')
      expect(extractStoreCleanName('00045 - BISTEK SUPERMERCADOS')).toBe('BISTEK SUPERMERCADOS')
    })

    it('rejeita "000", "0" e palavras proibidas (FRUTAP, ITALAC) como códigos de loja', () => {
      expect(normalizeStoreCode('000')).toBe('')
      expect(normalizeStoreCode('0')).toBe('')
      expect(normalizeStoreCode('FRUTAP')).toBe('')
      expect(normalizeStoreCode('ITALAC')).toBe('')
      expect(extractStoreRealCode('000 - Loja Sem Codigo')).toBeNull()
      expect(extractStoreRealCode('FRUTAP - Distribuidora')).toBeNull()
    })
  })

  describe('3. Resolução de Loja (match único, LOJA_AMBIGUA, LOJA_NAO_RESOLVIDA)', () => {
    const knownStores = [
      { codigo: '00101', nome: 'KOMPRAO ATACAREJO', cidade: 'Itajaí' },
      { codigo: '00102', nome: 'KOMPRAO ATACAREJO', cidade: 'Balneário Camboriú' },
      { codigo: '00300', nome: 'GIASSI SUPERMERCADOS', cidade: 'Criciúma' },
    ]

    it('match único por nome + cidade → resolvida', () => {
      const match = resolveStoreMatch({
        razaoSocial: 'GIASSI SUPERMERCADOS',
        cidade: 'Criciúma',
        knownStores,
      })
      expect(match.status).toBe('resolvida')
      expect(match.recognition.codigoLoja).toBe('00300')
      expect(match.recognition.origemReconhecimento).toBe('razao_cidade')
    })

    it('nome ambíguo (2 lojas com mesmo nome sem desambiguação clara) → LOJA_AMBIGUA, sem inventar código', () => {
      const match = resolveStoreMatch({
        razaoSocial: 'KOMPRAO ATACAREJO',
        cidade: '',
        knownStores,
      })
      expect(match.status).toBe('LOJA_AMBIGUA')
      expect(match.recognition.codigoLoja).toBeUndefined()
    })

    it('nome não encontrado no cadastro mestre → LOJA_NAO_RESOLVIDA, sem inventar código', () => {
      const match = resolveStoreMatch({
        razaoSocial: 'MERCADO DO ZE LTDA',
        cidade: 'Blumenau',
        knownStores,
      })
      expect(match.status).toBe('LOJA_NAO_RESOLVIDA')
      expect(match.recognition.codigoLoja).toBeUndefined()
    })
  })

  describe('4. Utilitários de Formatação de Rede, Cidade/UF e SKU', () => {
    it('deriveNetworkName identifica redes canônicas corretamente', () => {
      expect(deriveNetworkName('250 - FORT ATACADISTA FLORESTA')).toBe('FORT ATACADISTA')
      expect(deriveNetworkName('BRASIL ATACADISTA FLORIANOPOLIS')).toBe('BRASIL ATACADISTA')
      expect(deriveNetworkName('ATACADAO BRASIL')).toBe('ATACADÃO')
      expect(deriveNetworkName('GIASSI SANTA CATARINA')).toBe('GIASSI')
      expect(deriveNetworkName('COMPER SUPERMERCADOS')).toBe('COMPER')
      expect(deriveNetworkName('PADARIA DO BAIRRO')).toBe('Rede não identificada')
    })

    it('formatCityUf formata sem barras vazias ("Joinville / SC", "Joinville", "SC")', () => {
      expect(formatCityUf('Joinville', 'SC')).toBe('Joinville / SC')
      expect(formatCityUf('Joinville', '')).toBe('Joinville')
      expect(formatCityUf('', 'SC')).toBe('SC')
      expect(formatCityUf(null, null)).toBe('Localização não informada')
    })

    it('formatProductSku não inventa código nem usa descrição como código', () => {
      expect(formatProductSku('7891000100', 'Iogurte Grego')).toEqual({
        skuDisplay: '7891000100',
        hasRealSku: true,
      })
      expect(formatProductSku('', 'Iogurte Grego')).toEqual({
        skuDisplay: 'Código não informado',
        hasRealSku: false,
      })
      expect(formatProductSku('Iogurte Grego', 'Iogurte Grego')).toEqual({
        skuDisplay: 'Código não informado',
        hasRealSku: false,
      })
    })
  })

  describe('5. PreviewStats simulado — reconhecimento de código e contagem', () => {
    it('previewStats simulado com fixture de 6.462 linhas com código + 200 sem código → comCodigo = 6.462, naoResolvidas (sem match) = 200', () => {
      // Cria fixture simulando 6.462 itens mapeados que possuem codigoLoja extraído da Razão Social
      // e 200 itens sem código e sem match conhecido
      const comCodigoItems = Array.from({ length: 6462 }, (_, i) => ({
        codigoLoja: String(i + 1).padStart(5, '0'),
        loja: `FORT ATACADISTA LOJA ${i + 1}`,
        cidade: 'Florianópolis',
      }))

      const semCodigoItems = Array.from({ length: 200 }, (_, i) => ({
        codigoLoja: undefined,
        loja: `MERCADO DESCONHECIDO ${i + 1}`,
        cidade: 'Cidade Inexistente',
      }))

      const allItems = [...comCodigoItems, ...semCodigoItems]

      let comCodigo = 0
      let resolvidas = 0
      let ambiguas = 0
      let naoResolvidas = 0

      for (const item of allItems) {
        if (item.codigoLoja) {
          comCodigo++
        } else {
          const rawRazao = String(item.loja || '').trim()
          const rawCidade = String(item.cidade || '').trim()

          const storeRes = resolveStoreMatch({
            razaoSocial: rawRazao,
            cidade: rawCidade,
          })

          if (storeRes.status === 'com_codigo') {
            comCodigo++
          } else if (storeRes.status === 'resolvida') {
            resolvidas++
          } else if (storeRes.status === 'LOJA_AMBIGUA') {
            ambiguas++
          } else {
            naoResolvidas++
          }
        }
      }

      expect(comCodigo).toBe(6462)
      expect(resolvidas).toBe(0)
      expect(ambiguas).toBe(0)
      expect(naoResolvidas).toBe(200)
      const uteis = comCodigo + resolvidas + ambiguas + naoResolvidas
      expect(uteis).toBe(6662)
    })
  })
})
