import { describe, it, expect } from 'vitest'
import { resolveStoreSupervisors, normalizeSupervisorKey } from '../supervisorResolver'
import type { ValidadeItem, Ruptura } from '@/types'

const baseValidade: ValidadeItem = {
  id: 'v1',
  product: 'Produto Teste',
  sku: '12345',
  lote: 'L01',
  category: 'Mercearia',
  validade: '2025-06-01',
  diasRestantes: 30,
  status: 'Moderado',
  unidade: 'UN',
  estoque: 10,
  cliente: 'CHULETÃO',
  industria: 'Chuletão',
  rede: 'FORT ATACADISTA',
  codigoLoja: '085',
  loja: 'FORT ATACADISTA FLORESTA',
  cidade: 'Joinville',
  uf: 'SC',
  quantidade: 10,
  dataEntrada: '2025-05-01',
}

describe('supervisorResolver unit tests', () => {
  it('normalizeSupervisorKey: remove acentos, trim, uppercase', () => {
    expect(normalizeSupervisorKey('  caroline oliveira  ')).toBe('CAROLINE OLIVEIRA')
    expect(normalizeSupervisorKey('José Da Silva')).toBe('JOSE DA SILVA')
    expect(normalizeSupervisorKey('CAROLINE OLIVEIRA')).toBe('CAROLINE OLIVEIRA')
    expect(normalizeSupervisorKey('  CAROLINE   OLIVEIRA  ')).toBe('CAROLINE OLIVEIRA')
    expect(normalizeSupervisorKey('')).toBe('')
    expect(normalizeSupervisorKey(null)).toBe('')
    expect(normalizeSupervisorKey(undefined)).toBe('')
  })

  it('1. Registro mais recente vence: duas validades mesma Loja×Marca, uma com data mais recente -> supervisor da mais recente', () => {
    const itemAntigo: ValidadeItem = {
      ...baseValidade,
      id: 'v1',
      dataEntrada: '2025-04-01',
      codSupervisor: 'SUP-ANTIGO',
      supervisor: 'Supervisor Antigo',
    }
    const itemRecente: ValidadeItem = {
      ...baseValidade,
      id: 'v2',
      dataEntrada: '2025-05-15',
      codSupervisor: 'SUP-RECENTE',
      supervisor: 'Supervisor Recente',
    }

    const res = resolveStoreSupervisors([itemAntigo, itemRecente])
    expect(res.supervisorKey).toBe('SUP-RECENTE')
    expect(res.supervisorName).toBe('Supervisor Recente')
  })

  it('2. Fallback de nome: codSupervisor vazio, supervisor preenchido -> supervisorKey usa nome normalizado', () => {
    const item: ValidadeItem = {
      ...baseValidade,
      codSupervisor: '',
      supervisor: 'Caroline Oliveira',
      dataEntrada: '2025-05-01',
    }

    const res = resolveStoreSupervisors([item])
    expect(res.supervisorKey).toBe('CAROLINE OLIVEIRA')
    expect(res.supervisorName).toBe('Caroline Oliveira')
    expect(res.supervisoresList).toEqual([{ nome: 'Caroline Oliveira', marcas: ['CHULETÃO'] }])
  })

  it('3. Sem supervisor: ambos vazios -> "sem-supervisor"', () => {
    const item: ValidadeItem = {
      ...baseValidade,
      codSupervisor: '',
      supervisor: '',
      dataEntrada: '2025-05-01',
    }

    const res = resolveStoreSupervisors([item])
    expect(res.supervisorKey).toBe('sem-supervisor')
    expect(res.supervisorName).toBe('Sem supervisor definido')
    expect(res.supervisoresList).toEqual([])
  })

  it('4. Loja com validade+ruptura: supervisor definido para validade -> ruptura sem correspondência fica "sem-supervisor" mas não afeta o supervisor da loja', () => {
    const item: ValidadeItem = {
      ...baseValidade,
      codSupervisor: 'SUP-1',
      supervisor: 'Supervisor Validade',
      dataEntrada: '2025-05-01',
    }

    const rupturaSemMarca: Ruptura = {
      id: 'r1',
      codigo_loja: '085',
      nome_loja: 'FORT ATACADISTA FLORESTA',
      cnpj_loja: '',
      cidade: 'Joinville',
      estado: 'SC',
      codigo_cliente: 'OUTRO',
      cliente: 'OUTRA MARCA',
      produto: 'Produto R',
      motivo: 'Ruptura Total',
      data_visita: '2025-05-10',
      situacao_atual: 'Ativo',
      dias_em_ruptura: 5,
      colaborador: '',
      data_entrada: '2025-05-10',
      ultima_aparicao: '2025-05-10',
      categoria: '',
      observacao: '',
      operational_key: 'op1',
      dedup_key: 'dedup1',
      source_import_id: '',
      source_row: 1,
    }

    const res = resolveStoreSupervisors([item], [rupturaSemMarca])
    expect(res.supervisorKey).toBe('SUP-1')
    expect(res.supervisorName).toBe('Supervisor Validade')
    expect(res.supervisoresList).toEqual([{ nome: 'Supervisor Validade', marcas: ['CHULETÃO'] }])
  })

  it('5. Múltiplas marcas com supervisores distintos: supervisor global é do registro mais recente da loja', () => {
    const itemMarca1: ValidadeItem = {
      ...baseValidade,
      id: 'v1',
      cliente: 'MARCA A',
      codSupervisor: 'SUP-A',
      supervisor: 'Supervisor A',
      dataEntrada: '2025-04-01',
    }
    const itemMarca2: ValidadeItem = {
      ...baseValidade,
      id: 'v2',
      cliente: 'MARCA B',
      codSupervisor: 'SUP-B',
      supervisor: 'Supervisor B',
      dataEntrada: '2025-05-20', // mais recente
    }

    const res = resolveStoreSupervisors([itemMarca1, itemMarca2])
    expect(res.supervisorKey).toBe('SUP-B')
    expect(res.supervisorName).toBe('Supervisor B')
    expect(res.supervisoresList).toHaveLength(2)
    expect(res.supervisoresList).toContainEqual({
      nome: 'Supervisor A',
      marcas: ['MARCA A'],
    })
    expect(res.supervisoresList).toContainEqual({
      nome: 'Supervisor B',
      marcas: ['MARCA B'],
    })
  })
})
