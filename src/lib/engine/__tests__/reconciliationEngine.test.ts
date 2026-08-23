import { describe, it, expect } from 'vitest'
import {
  reconcileRuptureValidity,
  type RupturaRecord,
  type ValidadeRecord,
} from '../ruptureValidityReconciliationEngine'
import { buildStoreCanonicalKey, buildProductCanonicalKey } from '../reconciliationKeys'

describe('Motor de Confronto Rupturas × Validades (Reconciliation Engine)', () => {
  const baseRuptura: RupturaRecord = {
    id: 'rup_001',
    produto: 'LEITE FERMENTADO FRUTAP 170G',
    codigo_loja: '305',
    nome_loja: '305 - FORT ATACADISTA BUCAREIN',
    cliente: 'FRUTAP',
    data_visita: '2026-08-10',
    situacao_atual: 'Ativo',
    is_base_atual: true,
  }

  // 1. High confidence: ruptura 10/08, validade 12/08, mesma loja + mesmo código produto -> high + inferred_resolved + 2 dias
  it('1. deve gerar match de alta confiança quando mesma loja e mesmo código de produto', () => {
    const ruptura: RupturaRecord = {
      ...baseRuptura,
      cod_produto: '983',
    }

    const validades: ValidadeRecord[] = [
      {
        id: 'val_001',
        produto: 'LEITE FERMENTADO FRUTAP 170G',
        cod_produto: '983',
        codigo_loja: '305',
        razao_social: '305 - FORT ATACADISTA BUCAREIN',
        cliente: 'FRUTAP',
        realizado: '2026-08-12',
        validade_efetiva: '2026-09-15',
        quantidade: 12,
        is_base_atual: true,
      },
    ]

    const result = reconcileRuptureValidity(ruptura, validades)
    expect(result).not.toBeNull()
    expect(result?.confidence).toBe('high')
    expect(result?.match_method).toBe('high_code_product')
    expect(result?.proposed_status).toBe('inferred_resolved')
    expect(result?.resolution_days).toBe(2)
    expect(result?.quantity_found).toBe(12)
    expect(result?.evidence_key).toBe('rup_001|val_001')
  })

  // 2. Quantidade zero: validade com quantidade 0 -> não resolve
  it('2. não deve cruzar quando validade possui quantidade zero', () => {
    const validades: ValidadeRecord[] = [
      {
        id: 'val_zero',
        produto: 'LEITE FERMENTADO FRUTAP 170G',
        codigo_loja: '305',
        razao_social: '305 - FORT ATACADISTA BUCAREIN',
        cliente: 'FRUTAP',
        realizado: '2026-08-12',
        validade_efetiva: '2026-09-15',
        quantidade: 0,
      },
    ]

    const result = reconcileRuptureValidity(baseRuptura, validades)
    expect(result).toBeNull()
  })

  // 3. Validade vencida: validade vencida na data da pesquisa -> não resolve
  it('3. não deve cruzar quando produto estava vencido na data da pesquisa', () => {
    const validades: ValidadeRecord[] = [
      {
        id: 'val_vencida',
        produto: 'LEITE FERMENTADO FRUTAP 170G',
        codigo_loja: '305',
        razao_social: '305 - FORT ATACADISTA BUCAREIN',
        cliente: 'FRUTAP',
        realizado: '2026-08-12',
        validade_efetiva: '2026-08-05', // Vencido antes de 12/08
        quantidade: 10,
      },
    ]

    const result = reconcileRuptureValidity(baseRuptura, validades)
    expect(result).toBeNull()
  })

  // 4. Produto diferente (embalagem): "IOGURTE 850G" vs "IOGURTE 1,25KG" -> não resolve
  it('4. não deve cruzar quando gramatura/embalagem são conflitantes', () => {
    const ruptura: RupturaRecord = {
      ...baseRuptura,
      produto: 'IOGURTE MORANGO 850G',
    }

    const validades: ValidadeRecord[] = [
      {
        id: 'val_diff_pack',
        produto: 'IOGURTE MORANGO 1,25KG',
        codigo_loja: '305',
        razao_social: '305 - FORT ATACADISTA BUCAREIN',
        cliente: 'FRUTAP',
        realizado: '2026-08-12',
        validade_efetiva: '2026-09-15',
        quantidade: 10,
      },
    ]

    const result = reconcileRuptureValidity(ruptura, validades)
    expect(result).toBeNull()
  })

  // 5. Código diferente: códigos de produto diferentes -> não resolve (se ambos têm código)
  it('5. não deve cruzar quando ambos possuem códigos de produto distintos', () => {
    const ruptura: RupturaRecord = {
      ...baseRuptura,
      cod_produto: '101',
    }

    const validades: ValidadeRecord[] = [
      {
        id: 'val_diff_code',
        produto: 'LEITE FERMENTADO FRUTAP 170G',
        cod_produto: '999',
        codigo_loja: '305',
        razao_social: '305 - FORT ATACADISTA BUCAREIN',
        cliente: 'FRUTAP',
        realizado: '2026-08-12',
        validade_efetiva: '2026-09-15',
        quantidade: 10,
      },
    ]

    const result = reconcileRuptureValidity(ruptura, validades)
    expect(result).toBeNull()
  })

  // 6. Nome exato sem código: mesmo nome, sem código -> medium + awaiting_review
  it('6. deve gerar correspondência média (medium) para nome exato sem código', () => {
    const ruptura: RupturaRecord = {
      ...baseRuptura,
      cod_produto: undefined,
    }

    const validades: ValidadeRecord[] = [
      {
        id: 'val_exact_name',
        produto: 'LEITE FERMENTADO FRUTAP 170G',
        cod_produto: undefined,
        codigo_loja: '305',
        razao_social: '305 - FORT ATACADISTA BUCAREIN',
        cliente: 'FRUTAP',
        realizado: '2026-08-14',
        validade_efetiva: '2026-09-20',
        quantidade: 25,
      },
    ]

    const result = reconcileRuptureValidity(ruptura, validades)
    expect(result).not.toBeNull()
    expect(result?.confidence).toBe('medium')
    expect(result?.match_method).toBe('medium_exact_name')
    expect(result?.proposed_status).toBe('awaiting_review')
    expect(result?.resolution_days).toBe(4)
  })

  // 7. Mesmo dia sem hora: mesma data -> inconclusive
  it('7. deve marcar como inconclusivo quando validade foi pesquisada no mesmo dia da ruptura', () => {
    const validades: ValidadeRecord[] = [
      {
        id: 'val_same_day',
        produto: 'LEITE FERMENTADO FRUTAP 170G',
        codigo_loja: '305',
        razao_social: '305 - FORT ATACADISTA BUCAREIN',
        cliente: 'FRUTAP',
        realizado: '2026-08-10', // Mesmo dia da data_visita (2026-08-10)
        validade_efetiva: '2026-09-15',
        quantidade: 15,
      },
    ]

    const result = reconcileRuptureValidity(baseRuptura, validades)
    expect(result).not.toBeNull()
    expect(result?.confidence).toBe('inconclusive')
    expect(result?.proposed_status).toBe('inconclusive')
    expect(result?.resolution_days).toBe(0)
  })

  // 8. Validade anterior à ruptura: validade com realizado < data_visita -> não resolve
  it('8. não deve cruzar quando a validade foi coletada antes da ruptura', () => {
    const validades: ValidadeRecord[] = [
      {
        id: 'val_before',
        produto: 'LEITE FERMENTADO FRUTAP 170G',
        codigo_loja: '305',
        razao_social: '305 - FORT ATACADISTA BUCAREIN',
        cliente: 'FRUTAP',
        realizado: '2026-08-08', // 2 dias antes da ruptura
        validade_efetiva: '2026-09-15',
        quantidade: 20,
      },
    ]

    const result = reconcileRuptureValidity(baseRuptura, validades)
    expect(result).toBeNull()
  })

  // 9. Reopened: ruptura -> validade posterior -> nova ruptura posterior -> testado via status ou lógica
  it('9. deve calcular chave de evidência única consistente para suporte a reopened', () => {
    const ruptura1: RupturaRecord = {
      id: 'rup_old',
      produto: 'GELO PARA DRINK',
      codigo_loja: '220',
      cliente: 'COCOLEVE',
      data_visita: '2026-08-01',
    }

    const validades: ValidadeRecord[] = [
      {
        id: 'val_mid',
        produto: 'GELO PARA DRINK',
        codigo_loja: '220',
        cliente: 'COCOLEVE',
        realizado: '2026-08-05',
        validade_efetiva: '2026-09-01',
        quantidade: 5,
      },
    ]

    const res1 = reconcileRuptureValidity(ruptura1, validades)
    expect(res1).not.toBeNull()
    expect(res1?.evidence_key).toBe('rup_old|val_mid')
  })

  // 10. Idempotência: rodar 2x com mesmos dados -> mesmo resultado determinístico
  it('10. deve ser puramente determinístico e idempotente', () => {
    const validades: ValidadeRecord[] = [
      {
        id: 'val_idem',
        produto: 'LEITE FERMENTADO FRUTAP 170G',
        codigo_loja: '305',
        razao_social: '305 - FORT ATACADISTA BUCAREIN',
        cliente: 'FRUTAP',
        realizado: '2026-08-15',
        validade_efetiva: '2026-09-15',
        quantidade: 18,
      },
    ]

    const run1 = reconcileRuptureValidity(baseRuptura, validades)
    const run2 = reconcileRuptureValidity(baseRuptura, validades)

    expect(run1).toEqual(run2)
    expect(run1?.evidence_key).toBe('rup_001|val_idem')
  })

  // 11. Datas sem UTC: verificar que resolution_days calcula diferença em dias corridos de calendário
  it('11. deve calcular resolution_days em dias corridos sem desvio de fuso horário UTC', () => {
    const ruptura: RupturaRecord = {
      ...baseRuptura,
      data_visita: '2026-08-10',
    }

    const validades: ValidadeRecord[] = [
      {
        id: 'val_fuso',
        produto: 'LEITE FERMENTADO FRUTAP 170G',
        codigo_loja: '305',
        razao_social: '305 - FORT ATACADISTA BUCAREIN',
        cliente: 'FRUTAP',
        realizado: '2026-08-17T00:00:00.000Z',
        validade_efetiva: '2026-09-15T00:00:00.000Z',
        quantidade: 10,
      },
    ]

    const res = reconcileRuptureValidity(ruptura, validades)
    expect(res).not.toBeNull()
    expect(res?.resolution_days).toBe(7) // 17 - 10 = 7 dias
  })

  // 12. Loja diferente, mesmo produto: não cruza
  it('12. não deve cruzar produtos em lojas diferentes', () => {
    const validades: ValidadeRecord[] = [
      {
        id: 'val_other_store',
        produto: 'LEITE FERMENTADO FRUTAP 170G',
        codigo_loja: '250', // Loja diferente da 305
        razao_social: '250 - FORT ATACADISTA FLORESTA',
        cliente: 'FRUTAP',
        realizado: '2026-08-15',
        validade_efetiva: '2026-09-15',
        quantidade: 20,
      },
    ]

    const res = reconcileRuptureValidity(baseRuptura, validades)
    expect(res).toBeNull()
  })
})
