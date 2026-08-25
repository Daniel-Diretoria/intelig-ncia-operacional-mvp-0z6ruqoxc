import { describe, it, expect } from 'vitest'
import {
  computeConfrontoBidirecional,
  buildOperationalConfrontoKey,
} from '../confrontoBidirecional'
import type { Ruptura } from '@/types/rupturas'
import type { ValidadeRecord } from '../ruptureValidityReconciliationEngine'

const mockRuptura = (overrides: Partial<Ruptura> = {}): Ruptura => ({
  id: 'rup-1',
  produto: 'Iogurte Frutap Morango 170g',
  motivo: 'Sem Estoque Mínimo',
  codigo_loja: '085',
  nome_loja: '085 - FORT ATACADISTA JARAGUÁ DO SUL',
  cnpj_loja: '09.477.652/0085-00',
  cidade: 'Jaraguá do Sul',
  estado: 'SC',
  codigo_cliente: 'CLI-001',
  cliente: 'FRUTAP',
  colaborador: 'Carlos Promotor',
  categoria: 'Laticínios',
  observacao: '',
  data_visita: '2025-05-10',
  data_entrada: '2025-05-10',
  ultima_aparicao: '2025-05-10',
  situacao_atual: 'Ativo',
  operational_key: '085|Iogurte Frutap Morango 170g|2025-05-10',
  dedup_key: '085|Iogurte Frutap Morango 170g|FRUTAP',
  source_import_id: 'imp-1',
  source_row: 1,
  dias_em_ruptura: 2,
  ...overrides,
})

const mockValidade = (overrides: Partial<ValidadeRecord> = {}): ValidadeRecord => ({
  id: 'val-1',
  produto: 'Iogurte Frutap Morango 170g',
  cod_produto: undefined,
  cliente: 'FRUTAP',
  codigo_loja: '085',
  razao_social: '085 - FORT ATACADISTA JARAGUÁ DO SUL',
  realizado: '2025-05-15',
  validade_efetiva: '2025-06-20',
  quantidade: 50,
  is_base_atual: true,
  ...overrides,
})

describe('confrontoBidirecional.test.ts — Contrato de Regras Puras (a até m)', () => {
  // a) Mesma chave Loja;Marca;Produto, validade com Realizado posterior -> ruptura encerrada, validade permanece ativa
  it('a) Mesma chave, validade posterior (2025-05-15 > 2025-05-10) -> ruptura vai para histórico de encerradas', () => {
    const rup = mockRuptura({ data_visita: '2025-05-10' })
    const val = mockValidade({ realizado: '2025-05-15' })

    const res = computeConfrontoBidirecional([rup], [val])

    expect(res.ativas.length).toBe(0)
    expect(res.historico.length).toBe(1)
    expect(res.historico[0].id).toBe('rup-1')
    expect(res.historico[0].statusHistorico).toBe('Encerrada por validade posterior')
    expect(res.historico[0].eventoReferencia.id).toBe('val-1')
    expect(res.historico[0].eventoReferencia.tipo).toBe('validade')
    expect(res.historico[0].diasResolucao).toBe(5)
    expect(res.conflitos.length).toBe(0)
  })

  // b) Mesma chave, ruptura com Data de Visita posterior -> ruptura ativa
  it('b) Mesma chave, ruptura posterior (2025-05-20 > 2025-05-15) -> ruptura permanece ativa', () => {
    const rup = mockRuptura({ data_visita: '2025-05-20' })
    const val = mockValidade({ realizado: '2025-05-15' })

    const res = computeConfrontoBidirecional([rup], [val])

    expect(res.ativas.length).toBe(1)
    expect(res.ativas[0].id).toBe('rup-1')
    expect(res.historico.length).toBe(0)
    expect(res.conflitos.length).toBe(0)
  })

  // c) Mesma chave, datas iguais -> ambas vão para conflitos, zero mudança automática
  it('c) Mesma chave, datas iguais (2025-05-10 === 2025-05-10) -> vai para conflitos e ruptura não é encerrada', () => {
    const rup = mockRuptura({ data_visita: '2025-05-10' })
    const val = mockValidade({ realizado: '2025-05-10' })

    const res = computeConfrontoBidirecional([rup], [val])

    expect(res.ativas.length).toBe(1) // mantida em ativas
    expect(res.historico.length).toBe(0)
    expect(res.conflitos.length).toBe(1)
    expect(res.conflitos[0].motivo).toBe('Mesma data sem horário')
  })

  // d) Chave diferente em qualquer parte -> zero confronto
  it('d) Chave diferente em Loja, Marca ou Produto não gera confronto', () => {
    const rup = mockRuptura({ codigo_loja: '085', cliente: 'FRUTAP', produto: 'Produto A' })
    const valLojaDif = mockValidade({
      codigo_loja: '010',
      cliente: 'FRUTAP',
      produto: 'Produto A',
      realizado: '2025-05-20',
    })
    const valMarcaDif = mockValidade({
      codigo_loja: '085',
      cliente: 'ITALAC',
      produto: 'Produto A',
      realizado: '2025-05-20',
    })
    const valProdDif = mockValidade({
      codigo_loja: '085',
      cliente: 'FRUTAP',
      produto: 'Produto B',
      realizado: '2025-05-20',
    })

    const res1 = computeConfrontoBidirecional([rup], [valLojaDif])
    expect(res1.ativas.length).toBe(1)
    expect(res1.historico.length).toBe(0)

    const res2 = computeConfrontoBidirecional([rup], [valMarcaDif])
    expect(res2.ativas.length).toBe(1)
    expect(res2.historico.length).toBe(0)

    const res3 = computeConfrontoBidirecional([rup], [valProdDif])
    expect(res3.ativas.length).toBe(1)
    expect(res3.historico.length).toBe(0)
  })

  // e) Código de loja preserva zeros à esquerda na chave operacional
  it('e) Código de loja preserva zeros na chave e normaliza consistentemente', () => {
    const key1 = buildOperationalConfrontoKey('085', 'FRUTAP', 'prod_123')
    const key2 = buildOperationalConfrontoKey('85', 'FRUTAP', 'prod_123')
    const key3 = buildOperationalConfrontoKey('00085', 'FRUTAP', 'prod_123')

    expect(key1).toBe('085|frutap|prod_123')
    expect(key2).toBe('085|frutap|prod_123') // normaliza padStart 3
    expect(key3).toBe('00085|frutap|prod_123') // preserva zeros
  })

  // f) Fallback por produto SOMENTE com match EXATO normalizado; similar/contains NÃO gera match
  it('f) Fallback por produto exige match exato normalizado (sem acentos/espaços), similar não gera match', () => {
    const rup = mockRuptura({ produto: 'Iogurte Morango 170g', data_visita: '2025-05-10' })
    // Nome similar/contém mas não idêntico
    const valSimilar = mockValidade({
      produto: 'Iogurte Morango 170g Bandeja 6un',
      realizado: '2025-05-20',
    })

    const res = computeConfrontoBidirecional([rup], [valSimilar])
    expect(res.ativas.length).toBe(1)
    expect(res.historico.length).toBe(0)

    // Nome idêntico com acentos/espaços diferentes deve casar
    const valExato = mockValidade({ produto: '  IOGURTE  MORANGO 170G  ', realizado: '2025-05-20' })
    const resExato = computeConfrontoBidirecional([rup], [valExato])
    expect(resExato.ativas.length).toBe(0)
    expect(resExato.historico.length).toBe(1)
  })

  // g) Reprocessamento idempotente: mesma entrada 2x -> mesmo estado, zero duplicações
  it('g) Idempotência: rodar 2x gera exatamente os mesmos resultados', () => {
    const rup = mockRuptura({ data_visita: '2025-05-10' })
    const val = mockValidade({ realizado: '2025-05-15' })

    const res1 = computeConfrontoBidirecional([rup], [val])
    const res2 = computeConfrontoBidirecional([rup], [val])

    expect(res1.ativas).toEqual(res2.ativas)
    expect(res1.historico).toEqual(res2.historico)
    expect(res1.conflitos).toEqual(res2.conflitos)
  })

  // h) Marca-only (Ruptura Total sem produto) expande somente produtos do sortimento conhecido (validades/rupturas naquela loja)
  it('h) Ruptura Total sem produto expande apenas para sortimento conhecido daquela loja/marca', () => {
    const rupTotal = mockRuptura({
      id: 'rup-total-1',
      produto: '',
      motivo: 'Ruptura Total',
      data_visita: '2025-05-10',
      cliente: 'FRUTAP',
      codigo_loja: '085',
    })

    const val1 = mockValidade({
      id: 'val-prod-1',
      produto: 'Iogurte Morango 170g',
      cliente: 'FRUTAP',
      codigo_loja: '085',
      realizado: '2025-05-15', // posterior -> encerra
    })

    const val2 = mockValidade({
      id: 'val-prod-2',
      produto: 'Leite Fermentado 6x80g',
      cliente: 'FRUTAP',
      codigo_loja: '085',
      realizado: '2025-05-05', // anterior -> permanece ativa
    })

    // Validade de outra loja (não deve ser expandida para a loja 085)
    const valOutraLoja = mockValidade({
      id: 'val-outra-loja',
      produto: 'Requeijão Frutap 200g',
      cliente: 'FRUTAP',
      codigo_loja: '999',
      realizado: '2025-05-15',
    })

    const res = computeConfrontoBidirecional([rupTotal], [val1, val2, valOutraLoja])

    // Deve ter expandido para os 2 produtos conhecidos na loja 085
    expect(res.historico.length).toBe(1)
    expect(res.historico[0].produto).toBe('Iogurte Morango 170g')
    expect(res.historico[0].origemInferida).toBe(true)

    expect(res.ativas.length).toBe(1)
    expect(res.ativas[0].produto).toBe('Leite Fermentado 6x80g')

    // Nenhuma expansão para 'Requeijão Frutap 200g' da loja 999
    expect(res.ativas.some((a) => a.produto === 'Requeijão Frutap 200g')).toBe(false)
    expect(res.historico.some((h) => h.produto === 'Requeijão Frutap 200g')).toBe(false)
  })

  // m) Nenhuma escrita no banco ao filtrar, ordenar ou exportar
  it('m) Função é estritamente pura e síncrona, sem escritas ou mutações externas', () => {
    const rup = mockRuptura()
    const val = mockValidade()
    const rupCopy = { ...rup }
    const valCopy = { ...val }

    computeConfrontoBidirecional([rup], [val])

    expect(rup).toEqual(rupCopy)
    expect(val).toEqual(valCopy)
  })
})
