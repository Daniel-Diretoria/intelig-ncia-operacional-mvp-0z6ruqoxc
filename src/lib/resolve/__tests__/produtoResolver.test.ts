import { describe, it, expect } from 'vitest'
import {
  normalizarNomeProduto,
  extrairMedida,
  extrairTokensRelevantes,
  calcularAfinidadeProduto,
  resolverProduto,
  CatalogoProdutoContexto,
} from '../produtoResolver'
import { ProductAliasRegistro } from '@/types/devolucoes'

describe('Resolvedor de Produtos — Suíte Abrangente de Regras', () => {
  // Catálogo simulado da indústria FRUTAP e OUTRA_IND
  const catalogoMock: CatalogoProdutoContexto[] = [
    {
      codigo: 'FRUT-001',
      nome: 'Frutilac Bebida Láctea Saquinho Frutas Vermelhas 850g',
      industria_nome: 'FRUTAP',
      noMixDefinidoLoja: true,
      noMixObservadoLoja: true,
      historicoNaLoja: true,
    },
    {
      codigo: 'FRUT-002',
      nome: 'Petit Suisse Morango 40g',
      industria_nome: 'FRUTAP',
      noMixDefinidoLoja: true,
    },
    {
      codigo: 'FRUT-003',
      nome: 'Petit Suisse Morango 80g',
      industria_nome: 'FRUTAP',
      noMixDefinidoLoja: false,
    },
    {
      codigo: 'FRUT-004',
      nome: 'Petit Suisse Frutas Vermelhas 40g',
      industria_nome: 'FRUTAP',
    },
    {
      codigo: 'FRUT-005',
      nome: 'Iogurte Grego Tradicional 100g',
      industria_nome: 'FRUTAP',
    },
    {
      codigo: 'MASS-001',
      nome: 'Ravioli de Queijo 500g',
      industria_nome: "MASSAS D'ITÁLIA",
      noMixDefinidoLoja: true,
    },
    {
      codigo: 'MASS-002',
      nome: 'Ravioli de Carne 500g',
      industria_nome: "MASSAS D'ITÁLIA",
    },
    {
      codigo: 'OUTRA-999',
      nome: 'Frutilac Bebida Láctea Saquinho Frutas Vermelhas 850g',
      industria_nome: 'OUTRA_INDUSTRIA_CONCORRENTE',
    },
  ]

  const aliasesMock: ProductAliasRegistro[] = [
    {
      id: 'al-1',
      alias: 'barrigudinho frutas vermelhas',
      alias_normalizado: 'barrigudinho frutas vermelhas',
      produto_oficial_nome: 'Frutilac Bebida Láctea Saquinho Frutas Vermelhas 850g',
      produto_oficial_codigo: 'FRUT-001',
      industria_nome: 'FRUTAP',
      status: 'ativo',
      quantidade_utilizacoes: 10,
    },
    {
      id: 'al-2',
      alias: 'petizinho',
      alias_normalizado: 'petizinho',
      produto_oficial_nome: 'Petit Suisse',
      industria_nome: 'FRUTAP',
      tipo_alias: 'familia_generica',
      familia: 'Petit Suisse',
      status: 'ativo',
    },
    {
      id: 'al-3',
      alias: 'iogurte velho desativado',
      alias_normalizado: 'iogurte velho desativado',
      produto_oficial_nome: 'Iogurte Grego Tradicional 100g',
      industria_nome: 'FRUTAP',
      status: 'inativo',
    },
  ]

  it('1. Deve resolver com correspondência segura para nome oficial exato', async () => {
    const res = await resolverProduto(
      {
        textoInformado: 'Petit Suisse Morango 40g',
        industriaNome: 'FRUTAP',
      },
      catalogoMock,
      aliasesMock,
    )

    expect(res.nivel).toBe('correspondencia_segura')
    expect(res.produtoOficial?.codigo).toBe('FRUT-002')
    expect(res.precisaConfirmacaoHumana).toBe(false)
  })

  it('2. Deve tolerar diferença somente de acento, caixa e pontuação', async () => {
    const res = await resolverProduto(
      {
        textoInformado: 'pêtit suísse morango, 40G!!',
        industriaNome: 'FRUTAP',
      },
      catalogoMock,
      aliasesMock,
    )

    expect(res.nivel).toBe('correspondencia_segura')
    expect(res.produtoOficial?.codigo).toBe('FRUT-002')
  })

  it('3. Deve expandir abreviações pontuais (ex: qjo -> queijo)', async () => {
    const res = await resolverProduto(
      {
        textoInformado: 'ravioli qjo 500g',
        industriaNome: "MASSAS D'ITÁLIA",
      },
      catalogoMock,
      aliasesMock,
    )

    expect(res.produtoOficial?.codigo).toBe('MASS-001')
    expect(res.candidatos[0].nome).toBe('Ravioli de Queijo 500g')
  })

  it('4. Deve utilizar alias previamente confirmado ("barrigudinho frutas vermelhas")', async () => {
    const res = await resolverProduto(
      {
        textoInformado: 'barrigudinho frutas vermelhas',
        industriaNome: 'FRUTAP',
      },
      catalogoMock,
      aliasesMock,
    )

    expect(res.produtoOficial?.codigo).toBe('FRUT-001')
    expect(res.aliasUtilizado).toBe('barrigudinho frutas vermelhas')
    expect(res.candidatos[0].motivoPrincipal).toContain('Alias confirmado')
  })

  it('5. Alias genérico de família ("petizinho") NÃO deve forçar SKU específico sem atributos', async () => {
    const res = await resolverProduto(
      {
        textoInformado: 'petizinho',
        industriaNome: 'FRUTAP',
      },
      catalogoMock,
      aliasesMock,
    )

    // Como falta sabor e gramatura, deve ficar ambígua e exigir confirmação humana
    expect(res.nivel).toBe('ambigua')
    expect(res.precisaConfirmacaoHumana).toBe(true)
    expect(res.candidatos.length).toBeGreaterThan(1)
  })

  it('6. Alias de família refinado com sabor e gramatura ("petizinho morango 40g")', async () => {
    const res = await resolverProduto(
      {
        textoInformado: 'petizinho morango 40g',
        industriaNome: 'FRUTAP',
      },
      catalogoMock,
      aliasesMock,
    )

    expect(res.candidatos[0].codigo).toBe('FRUT-002')
    expect(res.candidatos[0].nome).toBe('Petit Suisse Morango 40g')
  })

  it('7. Dois produtos muito semelhantes com gramaturas diferentes devem gerar ambiguidade', async () => {
    const res = await resolverProduto(
      {
        textoInformado: 'petit suisse morango',
        industriaNome: 'FRUTAP',
      },
      catalogoMock,
      aliasesMock,
    )

    // Sem a gramatura explícita, tanto 40g quanto 80g são candidatos próximos
    expect(res.precisaConfirmacaoHumana).toBe(true)
    expect(res.nivel).toBe('ambigua')
  })

  it('8. Conflito explícito de gramatura (informou 40g contra produto 80g) não pode vencer', async () => {
    const afinidade = calcularAfinidadeProduto(
      'Petit Suisse Morango 40g',
      'Petit Suisse Morango 80g',
    )
    expect(afinidade.conflitoGramatura).toBe(true)
    expect(afinidade.mesmaGramatura).toBe(false)
  })

  it('9. Candidato de indústria errada NÃO pode vencer por similaridade textual', async () => {
    const res = await resolverProduto(
      {
        textoInformado: 'Frutilac Bebida Láctea Saquinho Frutas Vermelhas 850g',
        industriaNome: 'FRUTAP',
        permitirOutrasIndustrias: false,
      },
      catalogoMock,
      aliasesMock,
    )

    // O produto da OUTRA_INDUSTRIA_CONCORRENTE não pode ser sugerido
    const temOutraInd = res.candidatos.some(
      (c) => c.industria_nome === 'OUTRA_INDUSTRIA_CONCORRENTE',
    )
    expect(temOutraInd).toBe(false)
    expect(res.produtoOficial?.industria_nome).toBe('FRUTAP')
  })

  it('10. Mix Definido, Mix Observado e Histórico aumentam relevância do candidato', async () => {
    const res = await resolverProduto(
      {
        textoInformado: 'Ravioli',
        industriaNome: "MASSAS D'ITÁLIA",
      },
      catalogoMock,
      aliasesMock,
    )

    // Ravioli de Queijo tem noMixDefinidoLoja = true, logo deve ficar à frente de Carne
    expect(res.candidatos[0].codigo).toBe('MASS-001')
    expect(res.candidatos[0].sinais.some((s) => s.rotulo === 'Mix da loja' && s.presente)).toBe(
      true,
    )
  })

  it('11. Nenhum candidato adequado deve retornar nivel nao_identificado', async () => {
    const res = await resolverProduto(
      {
        textoInformado: 'Pneu aro 17 radial',
        industriaNome: 'FRUTAP',
      },
      catalogoMock,
      aliasesMock,
    )

    expect(res.nivel).toBe('nao_identificado')
    expect(res.candidatos.length).toBe(0)
    expect(res.precisaConfirmacaoHumana).toBe(true)
  })

  it('12. Alias inativo/desativado não deve ser utilizado', async () => {
    const res = await resolverProduto(
      {
        textoInformado: 'iogurte velho desativado',
        industriaNome: 'FRUTAP',
      },
      catalogoMock,
      aliasesMock,
    )

    expect(res.aliasUtilizado).toBeUndefined()
  })
})
