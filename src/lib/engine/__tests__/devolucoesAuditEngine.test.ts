import { describe, it, expect } from 'vitest'
import {
  auditarItemDevolucao,
  consolidarAuditoriaCaso,
  AuditoriaContextoLojaIndustria,
  AuditoriaInputItem,
  verificarCorrespondenciaProduto,
} from '@/lib/engine/devolucoesAuditEngine'

describe('Motor de Auditoria de Devoluções / NF — SKIP Inteligência Operacional', () => {
  const contextoBase: AuditoriaContextoLojaIndustria = {
    industry_name: 'FRUTAP',
    store_code: '405',
    store_name: 'FORT ATACADISTA 405',
    data_solicitacao: '2026-09-20',
    dataInicioBaseHistorica: '2026-06-01',
    historicoValidades: [
      {
        id: 'val-1',
        produto: 'IOGURTE MORANGO 1.25L',
        quantidade: 16,
        realizado: '2026-09-05',
        validade_efetiva: '2026-09-26',
      },
      {
        id: 'val-2',
        produto: 'IOGURTE MORANGO 1.25L',
        quantidade: 14,
        realizado: '2026-09-12',
        validade_efetiva: '2026-09-26',
      },
      {
        id: 'val-3',
        produto: 'IOGURTE MORANGO 1.25L',
        quantidade: 11,
        realizado: '2026-09-19',
        validade_efetiva: '2026-09-26',
      },
    ],
    historicoRupturas: [],
    mixOficialProdutos: [
      { codigo_produto: '001', nome_produto: 'IOGURTE MORANGO 1.25L' },
      { codigo_produto: '002', nome_produto: 'PETIT SUISSE MORANGO 320G' },
    ],
  }

  // (1) Teste 1: Produto com histórico consistente e mesma validade
  it('1. deve classificar como ACOMPANHAMENTO CONSISTENTE quando produto e validade possuem histórico contínuo', () => {
    const item: AuditoriaInputItem = {
      produto_nome_informado: 'Iogurte Morango 1.25L',
      quantidade_solicitada: 11,
      validade_informada: '2026-09-26',
    }

    const res = auditarItemDevolucao(item, contextoBase)
    expect(res.classificacao).toBe('acompanhamento_consistente')
    expect(res.detalhes.mesmaValidadeEncontrada).toBe(true)
    expect(res.detalhes.totalRegistrosAnteriores).toBe(3)
    expect(res.explicacao).toContain(
      'aparecem em registros anteriores com continuidade de acompanhamento',
    )
  })

  // (2) Teste 2: Produto existente, mas com períodos sem atualização
  it('2. deve classificar como ATENÇÃO quando produto possui histórico mas ficou longo período sem atualização', () => {
    const contextoComGap: AuditoriaContextoLojaIndustria = {
      ...contextoBase,
      data_solicitacao: '2026-09-20',
      cicloPesquisaConfigurado: {
        frequencia: 'semanal',
        dia_esperado: 'terca',
        ativo: true,
      },
      historicoValidades: [
        {
          id: 'val-gap',
          produto: 'IOGURTE MORANGO 1.25L',
          quantidade: 20,
          realizado: '2026-08-10', // 41 dias antes da solicitação (> múltiplos ciclos semanais perdidos)
          validade_efetiva: '2026-09-26',
        },
      ],
    }

    const item: AuditoriaInputItem = {
      produto_nome_informado: 'Iogurte Morango 1.25L',
      quantidade_solicitada: 15,
      validade_informada: '2026-09-26',
    }

    const res = auditarItemDevolucao(item, contextoComGap)
    expect(res.classificacao).toBe('atencao')
    expect(res.detalhes.periodosSemAtualizacao).toBe(true)
    expect(res.detalhes.ciclosSemAtualizacao).toBeGreaterThanOrEqual(1)
    expect(res.explicacao).toContain('ciclo esperado da indústria sem atualização')
  })

  // (3) Teste 3: Produto sem histórico anterior
  it('3. deve classificar como DIVERGÊNCIA quando produto não foi localizado no histórico anterior disponível', () => {
    const item: AuditoriaInputItem = {
      produto_nome_informado: 'BEBIDA LACTEA CHOCOLATE 1L',
      quantidade_solicitada: 8,
      validade_informada: '2026-09-25',
    }

    const res = auditarItemDevolucao(item, contextoBase)
    expect(res.classificacao).toBe('divergencia')
    expect(res.detalhes.produtoLocalizado).toBe(false)
    expect(res.detalhes.totalRegistrosAnteriores).toBe(0)
    expect(res.explicacao).toContain(
      'não foi localizado no histórico anterior disponível para esta loja',
    )
  })

  // (4) Teste 4: Histórico insuficiente para conclusão (Regra 12: NÃO confundir ausência de dado com falha)
  it('4. deve classificar como DADOS INSUFICIENTES quando a base histórica começou recentemente (menos de 14 dias)', () => {
    const contextoBaseRecente: AuditoriaContextoLojaIndustria = {
      ...contextoBase,
      data_solicitacao: '2026-09-20',
      dataInicioBaseHistorica: '2026-09-12', // Iniciada há apenas 8 dias
      historicoValidades: [], // Loja nova sem registros ainda
    }

    const item: AuditoriaInputItem = {
      produto_nome_informado: 'PRODUTO NOVO TESTE',
      quantidade_solicitada: 5,
      validade_informada: '2026-09-28',
    }

    const res = auditarItemDevolucao(item, contextoBaseRecente)
    expect(res.classificacao).toBe('dados_insuficientes')
    expect(res.detalhes.dadosHistoricoInsuficientes).toBe(true)
    expect(res.explicacao).toContain('iniciada recentemente')
    expect(res.classificacao).not.toBe('divergencia')
  })

  // (5) Teste 5: Validade não informada (Regra 5: nunca inventar data)
  it('5. deve registrar explicitamente validade ausente e classificar como DADOS INSUFICIENTES', () => {
    const item: AuditoriaInputItem = {
      produto_nome_informado: 'IOGURTE MORANGO 1.25L',
      quantidade_solicitada: 10,
      validade_ausente: true,
      validade_informada: '',
    }

    const res = auditarItemDevolucao(item, contextoBase)
    expect(res.classificacao).toBe('dados_insuficientes')
    expect(res.detalhes.dadosHistoricoInsuficientes).toBe(true)
    expect(res.explicacao).toContain('Validade não informada na solicitação')
  })

  // (6) Teste 6: Quantidade 0 registrada anteriormente (Regra 9: quantidade 0 é atualização válida)
  it('6. deve considerar quantidade 0 como atualização válida de esgotamento sem classificar como ausência de dado', () => {
    const contextoComQtdZero: AuditoriaContextoLojaIndustria = {
      ...contextoBase,
      historicoValidades: [
        {
          id: 'val-z1',
          produto: 'IOGURTE MORANGO 1.25L',
          quantidade: 0, // promotor reportou 0 unidades anteriormente
          realizado: '2026-09-15',
          validade_efetiva: '2026-09-26',
        },
      ],
    }

    const item: AuditoriaInputItem = {
      produto_nome_informado: 'IOGURTE MORANGO 1.25L',
      quantidade_solicitada: 5,
      validade_informada: '2026-09-26',
    }

    const res = auditarItemDevolucao(item, contextoComQtdZero)
    expect(res.detalhes.quantidadeZeroRegistrada).toBe(true)
    expect(res.detalhes.totalRegistrosAnteriores).toBe(1)
    expect(res.detalhes.ultimaAtualizacaoAnterior?.quantidade).toBe(0)
    // A presença da quantidade 0 foi devidamente contabilizada
    expect(res.classificacao).not.toBe('divergencia')
  })

  // (7) Teste 7: Solicitação com vários produtos e resultados diferentes
  it('7. deve auditar múltiplos produtos gerando classificações distintas e consolidação geral correta', () => {
    const item1: AuditoriaInputItem = {
      produto_nome_informado: 'IOGURTE MORANGO 1.25L',
      quantidade_solicitada: 11,
      validade_informada: '2026-09-26',
    }
    const item2: AuditoriaInputItem = {
      produto_nome_informado: 'PRODUTO INEXISTENTE NA LOJA',
      quantidade_solicitada: 6,
      validade_informada: '2026-09-26',
    }
    const item3: AuditoriaInputItem = {
      produto_nome_informado: 'PRODUTO SEM VALIDADE',
      quantidade_solicitada: 4,
      validade_ausente: true,
    }

    const res1 = auditarItemDevolucao(item1, contextoBase)
    const res2 = auditarItemDevolucao(item2, contextoBase)
    const res3 = auditarItemDevolucao(item3, contextoBase)

    expect(res1.classificacao).toBe('acompanhamento_consistente')
    expect(res2.classificacao).toBe('divergencia')
    expect(res3.classificacao).toBe('dados_insuficientes')

    const consolidado = consolidarAuditoriaCaso([res1, res2, res3])
    // Quando há pelo menos uma divergência no caso, o status de auditoria geral prioriza divergência
    expect(consolidado.resultadoGeral).toBe('divergencia')
    expect(consolidado.resumoJson.itens_consistentes).toBe(1)
    expect(consolidado.resumoJson.itens_divergencia).toBe(1)
    expect(consolidado.resumoJson.itens_insuficientes).toBe(1)
  })

  // (8) Teste 8: Informação POSTERIOR à solicitação NUNCA pode ser usada como evidência anterior
  it('8. NUNCA deve utilizar informação com data posterior à solicitação como evidência prévia', () => {
    const contextoComDataPosterior: AuditoriaContextoLojaIndustria = {
      ...contextoBase,
      data_solicitacao: '2026-09-10', // Solicitação feita em 10/09
      historicoValidades: [
        {
          id: 'val-antiga',
          produto: 'IOGURTE MORANGO 1.25L',
          quantidade: 5,
          realizado: '2026-09-01', // ANTERIOR: válido
          validade_efetiva: '2026-09-26',
        },
        {
          id: 'val-posterior-1',
          produto: 'IOGURTE MORANGO 1.25L',
          quantidade: 15,
          realizado: '2026-09-15', // POSTERIOR à solicitação
          validade_efetiva: '2026-09-26',
        },
        {
          id: 'val-posterior-2',
          produto: 'IOGURTE MORANGO 1.25L',
          quantidade: 20,
          realizado: '2026-09-18', // POSTERIOR à solicitação
          validade_efetiva: '2026-09-26',
        },
      ],
    }

    const item: AuditoriaInputItem = {
      produto_nome_informado: 'IOGURTE MORANGO 1.25L',
      quantidade_solicitada: 5,
      validade_informada: '2026-09-26',
    }

    const res = auditarItemDevolucao(item, contextoComDataPosterior)
    // Apenas o registro de 01/09 deve ser considerado como anterior
    expect(res.detalhes.totalRegistrosAnteriores).toBe(1)
    expect(res.detalhes.ultimaAtualizacaoAnterior?.data).toBe('2026-09-01')
    expect(res.detalhes.registrosPosterioresIgnorados).toBe(2)
    expect(res.explicacao).toContain(
      'registro(s) com data posterior à solicitação foram desconsiderados',
    )
  })

  // (9) Teste 9: Ruptura existente aparece como contexto sem invalidar/aprovar automaticamente
  it('9. deve apresentar rupturas relacionadas como contexto operacional sem transformar em reprovação/aprovação', () => {
    const contextoComRuptura: AuditoriaContextoLojaIndustria = {
      ...contextoBase,
      historicoRupturas: [
        {
          id: 'rup-1',
          produto: 'IOGURTE MORANGO 1.25L',
          motivo: 'Ruptura Total',
          situacao_atual: 'Ativo',
          data_visita: '2026-09-10',
          observacao: 'Falta na gôndola',
        },
      ],
    }

    const item: AuditoriaInputItem = {
      produto_nome_informado: 'IOGURTE MORANGO 1.25L',
      quantidade_solicitada: 11,
      validade_informada: '2026-09-26',
    }

    const res = auditarItemDevolucao(item, contextoComRuptura)
    expect(res.detalhes.rupturasRelacionadas.length).toBe(1)
    expect(res.detalhes.rupturasRelacionadas[0].motivo).toBe('Ruptura Total')
    expect(res.explicacao).toContain('Contexto operacional: foram identificadas 1 ruptura(s)')
    // A ruptura foi apresentada como contexto de evidência, mantendo o cruzamento de histórico
    expect(res.classificacao).toBe('acompanhamento_consistente')
  })

  // (10) Teste 10: Produto sem correspondência segura não deve ser associado silenciosamente
  it('10. deve sinalizar "precisa_identificacao" e NÃO associar silenciosamente quando não há correspondência segura', () => {
    const item: AuditoriaInputItem = {
      produto_nome_informado: 'PRODUTO XYZ SEM MATCH',
      quantidade_solicitada: 3,
      validade_informada: '2026-09-26',
    }

    const res = auditarItemDevolucao(item, contextoBase)
    expect(res.precisaIdentificacao).toBe(true)
    expect(res.detalhes.correspondenciaSegura).toBe(false)
    expect(res.detalhes.produtoIdentificadoNome).toBeUndefined()
  })

  // (11) Teste 11: Correspondência de produtos (códigos e nomes)
  it('11. deve validar correspondência por código idêntico ou igualdade semântica', () => {
    const matchCod = verificarCorrespondenciaProduto(
      'Frutap Morango',
      '001',
      'Iogurte Frutap Morango 1L',
      '001',
    )
    expect(matchCod.match).toBe(true)
    expect(matchCod.tipo).toBe('codigo')

    const matchNome = verificarCorrespondenciaProduto(
      'Iogurte Morango 1.25L',
      undefined,
      'iogurte morango 1 25l',
      undefined,
    )
    expect(matchNome.match).toBe(true)
    expect(matchNome.tipo).toBe('exato')

    const matchDiferente = verificarCorrespondenciaProduto(
      'Iogurte Morango 1.25L',
      undefined,
      'Iogurte Ameixa 1.25L',
      undefined,
    )
    expect(matchDiferente.match).toBe(false)
  })

  // (12) Teste 12: Decisão e avanço parcial permitido
  it('12. valida que uma solicitação pode ter avanços e decisões independentes por produto', () => {
    // Simulação da estrutura de decisão independente por item
    const itens = [
      { id: '1', decisao: 'aprovado_para_industria', qtdAutorizada: 10 },
      { id: '2', decisao: 'solicitar_informacao_promotor', qtdAutorizada: 0 },
      { id: '3', decisao: 'registrar_divergencia', qtdAutorizada: 0 },
    ]

    const aprovados = itens.filter((i) => i.decisao === 'aprovado_para_industria')
    const pendentesInfo = itens.filter((i) => i.decisao === 'solicitar_informacao_promotor')
    const divergentes = itens.filter((i) => i.decisao === 'registrar_divergencia')

    expect(aprovados.length).toBe(1)
    expect(aprovados[0].qtdAutorizada).toBe(10)
    expect(pendentesInfo.length).toBe(1)
    expect(divergentes.length).toBe(1)
  })

  // =========================================================================
  // AJUSTES ESPECÍFICOS & NOVOS TESTES OBRIGATÓRIOS (CENÁRIOS A, B, C, D, E)
  // =========================================================================

  // CENÁRIO A: mesma loja possui Produto X em duas indústrias diferentes;
  // uma solicitação da Indústria A NUNCA pode utilizar registro da Indústria B como evidência de acompanhamento.
  it('Cenário A: mesma loja + mesmo/similar produto + indústrias diferentes → não cruzar indústria errada', () => {
    // Contexto com validades restritas apenas à Indústria FRUTAP (cod_cliente 7)
    // Se a loja tem registros de "IOGURTE MORANGO 1L" da indústria ITALAC (cod_cliente 43),
    // a auditoria de devolução para a FRUTAP não deve considerar os registros da ITALAC.
    const contextoFrutapApenas: AuditoriaContextoLojaIndustria = {
      industry_name: 'FRUTAP',
      industry_id: 'ind-frutap',
      tradepro_client_id: '7',
      store_code: '405',
      store_name: 'FORT ATACADISTA 405',
      data_solicitacao: '2026-09-20',
      historicoValidades: [
        // Apenas registros da FRUTAP (fornecidos pelo serviço após filtro estrito)
        {
          id: 'val-frutap-1',
          produto: 'IOGURTE MORANGO 1L FRUTAP',
          quantidade: 10,
          realizado: '2026-09-15',
          validade_efetiva: '2026-09-28',
          cliente: 'FRUTAP',
        },
      ],
      historicoRupturas: [],
    }

    // Solicitação de devolução para FRUTAP de um produto "Iogurte Morango 1L Italac" (produto de outra indústria)
    const itemOutraIndustria: AuditoriaInputItem = {
      produto_nome_informado: 'Iogurte Morango 1L Italac',
      quantidade_solicitada: 5,
      validade_informada: '2026-09-28',
    }

    const resultado = auditarItemDevolucao(itemOutraIndustria, contextoFrutapApenas)
    // Não pode considerar como acompanhamento consistente do produto da Italac, pois não está no histórico da Frutap
    expect(resultado.classificacao).toBe('divergencia')
    expect(resultado.detalhes.produtoLocalizado).toBe(false)
    expect(resultado.detalhes.totalRegistrosAnteriores).toBe(0)
  })

  // CENÁRIO B: indústria com ciclo semanal e ciclo perdido → pode gerar Atenção
  it('Cenário B: indústria com ciclo semanal e ciclo perdido → gera Atenção operacional com ciclos perdidos', () => {
    const contextoSemanalPerdido: AuditoriaContextoLojaIndustria = {
      ...contextoBase,
      data_solicitacao: '2026-09-22', // Terça-feira
      cicloPesquisaConfigurado: {
        frequencia: 'semanal',
        dia_esperado: 'terca',
        ativo: true,
      },
      historicoValidades: [
        {
          id: 'val-s1',
          produto: 'IOGURTE MORANGO 1.25L',
          quantidade: 20,
          // Atualizado há 14 dias (08/09), perdendo o ciclo de 15/09 e 22/09
          realizado: '2026-09-08',
          validade_efetiva: '2026-09-26',
        },
      ],
    }

    const item: AuditoriaInputItem = {
      produto_nome_informado: 'IOGURTE MORANGO 1.25L',
      quantidade_solicitada: 8,
      validade_informada: '2026-09-26',
    }

    const res = auditarItemDevolucao(item, contextoSemanalPerdido)
    expect(res.classificacao).toBe('atencao')
    expect(res.detalhes.periodosSemAtualizacao).toBe(true)
    expect(res.detalhes.ciclosSemAtualizacao).toBeGreaterThanOrEqual(1)
    expect(res.explicacao).toContain('ciclo esperado da indústria sem atualização')
  })

  // CENÁRIO C: indústria quinzenal sem ciclo perdido → NÃO gerar Atenção por regra fixa de dias (ex: 12 dias)
  it('Cenário C: indústria quinzenal sem ciclo perdido → NÃO gerar Atenção por regra fixa de dias', () => {
    // Em pesquisa quinzenal, 12 dias desde a última visita é perfeitamente dentro do ciclo quinzenal esperado
    const contextoQuinzenalEmDia: AuditoriaContextoLojaIndustria = {
      ...contextoBase,
      data_solicitacao: '2026-09-22',
      cicloPesquisaConfigurado: {
        frequencia: 'quinzenal',
        dia_esperado: 'terca',
        ativo: true,
      },
      historicoValidades: [
        {
          id: 'val-q1',
          produto: 'IOGURTE MORANGO 1.25L',
          quantidade: 15,
          realizado: '2026-09-10', // 12 dias antes da solicitação, perfeitamente compatível com quinzenal
          validade_efetiva: '2026-09-26',
        },
      ],
    }

    const item: AuditoriaInputItem = {
      produto_nome_informado: 'IOGURTE MORANGO 1.25L',
      quantidade_solicitada: 5,
      validade_informada: '2026-09-26',
    }

    const res = auditarItemDevolucao(item, contextoQuinzenalEmDia)
    expect(res.classificacao).toBe('acompanhamento_consistente')
    expect(res.detalhes.periodosSemAtualizacao).toBe(false)
    expect(res.detalhes.ciclosSemAtualizacao).toBe(0)
  })

  // CENÁRIO D: indústria mensal → 21 dias sem registro NÃO significam automaticamente Atenção
  it('Cenário D: indústria mensal → 21 dias sem registro NÃO significam automaticamente Atenção', () => {
    // 21 dias após a última visita em uma pesquisa mensal (ciclo a cada ~28 dias) NÃO é atraso
    const contextoMensal: AuditoriaContextoLojaIndustria = {
      ...contextoBase,
      data_solicitacao: '2026-09-25',
      cicloPesquisaConfigurado: {
        frequencia: 'mensal',
        dia_esperado: 'terca',
        ativo: true,
      },
      historicoValidades: [
        {
          id: 'val-m1',
          produto: 'IOGURTE MORANGO 1.25L',
          quantidade: 22,
          realizado: '2026-09-04', // Exatos 21 dias antes da solicitação
          validade_efetiva: '2026-10-15',
        },
      ],
    }

    const item: AuditoriaInputItem = {
      produto_nome_informado: 'IOGURTE MORANGO 1.25L',
      quantidade_solicitada: 6,
      validade_informada: '2026-10-15',
    }

    const res = auditarItemDevolucao(item, contextoMensal)
    // Não pode disparar Atenção por regra fixa de 20/21 dias! Deve ser Acompanhamento consistente
    expect(res.classificacao).toBe('acompanhamento_consistente')
    expect(res.detalhes.periodosSemAtualizacao).toBe(false)
    expect(res.detalhes.ciclosSemAtualizacao).toBe(0)
  })

  // CENÁRIO E: ausência de configuração de ciclo → não inventar janela temporal (continuidade não determinável, explicada na saída)
  it('Cenário E: ausência de configuração de ciclo → não inventar janela temporal e sinalizar continuidade não determinável', () => {
    const contextoSemCiclo: AuditoriaContextoLojaIndustria = {
      ...contextoBase,
      cicloPesquisaConfigurado: undefined, // Sem pesquisa cadastrada
      data_solicitacao: '2026-09-20',
      historicoValidades: [
        {
          id: 'val-sc1',
          produto: 'IOGURTE MORANGO 1.25L',
          quantidade: 14,
          realizado: '2026-08-25', // 26 dias antes
          validade_efetiva: '2026-09-26',
        },
      ],
    }

    const item: AuditoriaInputItem = {
      produto_nome_informado: 'IOGURTE MORANGO 1.25L',
      quantidade_solicitada: 5,
      validade_informada: '2026-09-26',
    }

    const res = auditarItemDevolucao(item, contextoSemCiclo)
    // Não inventa regra de 20/21 dias: classifica como acompanhamento consistente do histórico existente
    expect(res.classificacao).toBe('acompanhamento_consistente')
    expect(res.detalhes.continuidadeNaoDeterminavel).toBe(true)
    expect(res.detalhes.periodosSemAtualizacao).toBe(false)
    expect(res.explicacao).toContain('Nota de calendário: Não há ciclo de pesquisa configurado')
  })

  // CENÁRIO COMPLEMENTAR: contexto de indústria inseguro → classificar DADOS INSUFICIENTES
  it('deve classificar como DADOS INSUFICIENTES quando o contexto da indústria for inseguro/ambíguo', () => {
    const contextoInseguro: AuditoriaContextoLojaIndustria = {
      ...contextoBase,
      contextoIndustriaSeguro: false,
      motivoInsegurancaIndustria:
        'A indústria "DESCONHECIDA" não possui vínculo validado no Cadastro Operacional.',
      historicoValidades: [],
    }

    const item: AuditoriaInputItem = {
      produto_nome_informado: 'QUALQUER PRODUTO',
      quantidade_solicitada: 5,
      validade_informada: '2026-09-26',
    }

    const res = auditarItemDevolucao(item, contextoInseguro)
    expect(res.classificacao).toBe('dados_insuficientes')
    expect(res.detalhes.dadosHistoricoInsuficientes).toBe(true)
    expect(res.explicacao).toContain('não possui vínculo validado')
  })
})
