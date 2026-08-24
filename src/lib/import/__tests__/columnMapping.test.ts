import { describe, it, expect } from 'vitest'
import { suggestMapping } from '../columnMapping'

describe('columnMapping.ts — Sugestão e Auto-Mapeamento de Colunas', () => {
  it('Partial match NÃO dispara quando string curta < 8 caracteres ("cliente" vs "cod. cliente")', () => {
    // Quando os cabeçalhos detectados têm apenas "Cliente"
    const mapping = suggestMapping(['Cliente'])

    // "cliente" (7 caracteres normalizado) deve mapear para o campo "cliente"
    expect(mapping.cliente).toBe('Cliente')

    // "codCliente" tem aliases como "cod. cliente", "cod cliente", etc.
    // "cod. cliente" (12 chars) vs "cliente" (7 chars): como Math.min(7, 12) = 7 < 8,
    // o partial match NÃO deve associar "Cliente" a "codCliente".
    expect(mapping.codCliente).toBeUndefined()
  })

  it('Partial match dispara quando ambas >= 8 ("dias p/ vencimento" vs "dias pvencimento")', () => {
    // "dias pvencimento" tem 16 caracteres
    // alias "dias p/ vencimento" normalizado para "dias p/ vencimento" ou "dias p vencimento" tem 17/18 chars
    const mapping = suggestMapping(['Dias pvencimento'])
    expect(mapping.diasVencimentoArquivo).toBe('Dias pvencimento')
  })

  it('Exact match continua funcionando normalmente para todos os aliases', () => {
    const headers = [
      'Cód. Colaborador',
      'Colaborador',
      'Cód. Supervisor',
      'Supervisor',
      'CPF/CNPJ',
      'Razão Social',
      'Fantasia',
      'Cidade',
      'Estado',
      'Cód. Cliente',
      'Cliente',
      'Cód. Produto',
      'Produto',
      'Cód. Barras',
      'Data Fabricação',
      'Realizado',
      'Quantidade',
      'Dias p/ Vencimento',
      'Validade',
      'Status Operacional',
      'Data Entrada',
      'Número do lote',
      'Representante',
      'CNPJ',
      'Fornecedor',
    ]

    const mapping = suggestMapping(headers)

    expect(mapping.codColaborador).toBe('Cód. Colaborador')
    expect(mapping.colaborador).toBe('Colaborador')
    expect(mapping.codSupervisor).toBe('Cód. Supervisor')
    expect(mapping.supervisor).toBe('Supervisor')
    expect(mapping.cpfCnpj).toBe('CPF/CNPJ')
    expect(mapping.razaoSocial).toBe('Razão Social')
    expect(mapping.fantasia).toBe('Fantasia')
    expect(mapping.cidade).toBe('Cidade')
    expect(mapping.estado).toBe('Estado')
    expect(mapping.codCliente).toBe('Cód. Cliente')
    expect(mapping.cliente).toBe('Cliente')
    expect(mapping.codProduto).toBe('Cód. Produto')
    expect(mapping.produto).toBe('Produto')
    expect(mapping.codBarras).toBe('Cód. Barras')
    expect(mapping.dataFabricacao).toBe('Data Fabricação')
    expect(mapping.realizado).toBe('Realizado')
    expect(mapping.quantidade).toBe('Quantidade')
    expect(mapping.diasVencimentoArquivo).toBe('Dias p/ Vencimento')
    expect(mapping.validade).toBe('Validade')
    expect(mapping.statusOperacionalArquivo).toBe('Status Operacional')
    expect(mapping.dataEntradaArquivo).toBe('Data Entrada')
    expect(mapping.numeroLote).toBe('Número do lote')
    expect(mapping.representante).toBe('Representante')
    expect(mapping.cnpj).toBe('CNPJ')
    expect(mapping.fornecedor).toBe('Fornecedor')
  })

  it('"Razão Social" mapeia para razaoSocial, NÃO para outro campo', () => {
    const mapping = suggestMapping(['Razão Social'])
    expect(mapping.razaoSocial).toBe('Razão Social')
    expect(mapping.cliente).toBeUndefined()
    expect(mapping.codCliente).toBeUndefined()
  })

  it('"Cliente" mapeia para cliente, NÃO para codCliente', () => {
    const mapping = suggestMapping(['Cliente'])
    expect(mapping.cliente).toBe('Cliente')
    expect(mapping.codCliente).toBeUndefined()
  })

  it('"Cód. Cliente" NÃO mapeia a partir da coluna "Cliente"', () => {
    const mapping = suggestMapping(['Cliente', 'Produto', 'Quantidade'])
    expect(mapping.codCliente).toBeUndefined()
    expect(mapping.cliente).toBe('Cliente')
  })
})
