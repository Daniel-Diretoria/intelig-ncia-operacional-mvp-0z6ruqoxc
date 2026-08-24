import { describe, it, expect } from 'vitest'
import type { ValidadesApiResponse, RupturasApiResponse } from '@/types/tradeProApi'
import {
  parseValidadeResponse,
  adaptValidadeItem,
  parseRupturasResponse,
  adaptRupturaItem,
  normalizePageMeta,
  normalizeMotivo,
  BLOCKER_MISSING_INDUSTRY_CONTEXT,
} from '../tradeProAdapter'

// ---------------------------------------------------------------------------
// Fixtures sintéticas fiéis ao JSON oficial
// ---------------------------------------------------------------------------

export const mockValidadesResponse: ValidadesApiResponse = {
  validade: [
    {
      promotor: { nome: 'PROMOTOR TESTE 1', id: '0001' },
      cliente: {
        fantasia: 'MERCADO TESTE 1',
        endereco: 'RUA DAS FLORES, 100',
        cpfCnpj: '12.345.678/0001-90',
        razaoSocial: '001 - MERCADO TESTE LTDA',
        cidade: {
          nome: 'CIDADE TESTE',
          estado: {
            sigla: 'TS',
          },
        },
      },
      produto: {
        codigo: '001020',
        descricao: 'PRODUTO TESTE A 500G',
      },
      realizado: '2026-08-10',
      diasParaVencimento: 15,
      quantidade: 10,
      validade: '2026-08-25',
    },
    {
      promotor: { nome: 'PROMOTOR TESTE 2', id: '0002' },
      cliente: {
        fantasia: 'SUPERMERCADO TESTE 2',
        endereco: 'AV PRINCIPAL, 200',
        cpfCnpj: '98.765.432/0001-10',
        razaoSocial: '002 - SUPER TESTE S/A',
        cidade: {
          nome: 'CIDADE MODELO',
          estado: {
            sigla: 'SP',
          },
        },
      },
      produto: {
        codigo: '002030',
        descricao: 'PRODUTO TESTE B 1KG',
      },
      realizado: '2026-08-11',
      diasParaVencimento: 45,
      quantidade: 25,
      validade: '2026-09-25',
    },
    {
      promotor: { nome: 'PROMOTOR TESTE 3', id: '0003' },
      cliente: {
        fantasia: 'HIPER TESTE 3',
        endereco: 'RODOVIA BR 101, KM 50',
        cpfCnpj: '11.222.333/0001-44',
        razaoSocial: '003 - HIPER TESTE COMERCIO',
        cidade: {
          nome: 'JOINVILLE',
          estado: {
            sigla: 'SC',
          },
        },
      },
      produto: {
        codigo: '003040',
        descricao: 'PRODUTO TESTE C 200G',
      },
      realizado: '2026-08-12',
      diasParaVencimento: 5,
      quantidade: 8,
      validade: '2026-08-17',
    },
  ],
  paginaAtual: '1', // string intencional na borda
  quantidadePorPagina: '50',
  totalDePaginas: '3',
  totalDeProdutos: '120',
}

export const mockRupturasResponse: RupturasApiResponse = {
  rupturas: [
    {
      idSupervisor: 'SUP-01',
      nomeSupervisor: 'SUPERVISOR 1',
      idPromotor: '0010',
      nomePromotor: 'PROMOTOR RUPTURA 1',
      imeiPromotor: '123456789012345',
      idCliente: 'CLI-001',
      cpfCnpjCliente: '12.345.678/0001-90',
      codigoCliente: '0007',
      razaoSocialCliente: '0007 - ATACADISTA TESTE',
      fantasiaCliente: 'ATACADISTA TESTE',
      redeCliente: 'REDE TESTE',
      enderecoCliente: 'AV BRASIL, 500',
      bairroCliente: 'CENTRO',
      ramoAtividadeCliente: 'SUPERMERCADO',
      telefoneCliente: '11999999999',
      cidadeCliente: 'CURITIBA',
      siglaEstadoCliente: 'PR',
      descricaoRotina: 'ROTINA PADRAO',
      idAtividade: 'ATV-01',
      descricaoAtividade: 'EXEMPLO ATIVIDADE',
      descricaoCategoria: 'MERCEARIA',
      descricaoMotivo: 'SEM ESTOQUE MINIMO',
      statusRoteiro: 'CONCLUIDO',
      idRoteiroPadrao: 'ROT-01',
      descricaoRoteiroPadrao: 'ROTEIRO 1',
      dataVisita: '2026-08-10',
      horaInicioExecucaoRoteiro: '08:00',
      horaFinalExecucaoRoteiro: '09:30',
      observacaoRuptura: 'GÔNDOLA VAZIA',
      cnpjFornecedor: '00.111.222/0001-33',
      descricaoFornecedor: 'INDUSTRIA ALIMENTOS S/A',
      idAtividadeRuptura: 'RUPT-01',
      idCategoria: 'CAT-01',
      codigoFamilia: 'FAM-01',
      descricaoFamilia: 'MASSAS',
      ruptura: 1,
      dataHoraExecucaoAtividade: '2026-08-10 08:30:00',
    },
    {
      idSupervisor: 'SUP-02',
      nomeSupervisor: 'SUPERVISOR 2',
      idPromotor: '0020',
      nomePromotor: 'PROMOTOR RUPTURA 2',
      imeiPromotor: '987654321098765',
      idCliente: 'CLI-002',
      cpfCnpjCliente: '22.333.444/0001-55',
      codigoCliente: '0008',
      razaoSocialCliente: '0008 - VAREJO TESTE',
      fantasiaCliente: 'VAREJO TESTE',
      redeCliente: 'REDE SUL',
      enderecoCliente: 'RUA XV, 100',
      bairroCliente: 'BATEL',
      ramoAtividadeCliente: 'HIPERMERCADO',
      telefoneCliente: '41988888888',
      cidadeCliente: 'CURITIBA',
      siglaEstadoCliente: 'PR',
      descricaoRotina: 'ROTINA MATUTINA',
      idAtividade: 'ATV-02',
      descricaoAtividade: 'EXEMPLO ATIVIDADE 2',
      descricaoCategoria: 'BEBIDAS',
      descricaoMotivo: 'RUPTURA TOTAL',
      statusRoteiro: 'CONCLUIDO',
      idRoteiroPadrao: 'ROT-02',
      descricaoRoteiroPadrao: 'ROTEIRO 2',
      dataVisita: '2026-08-11',
      horaInicioExecucaoRoteiro: '10:00',
      horaFinalExecucaoRoteiro: '11:00',
      observacaoRuptura: 'FORA DE LINHA',
      cnpjFornecedor: '33.444.555/0001-66',
      descricaoFornecedor: 'INDUSTRIA BEBIDAS DO BRASIL',
      idAtividadeRuptura: 'RUPT-02',
      idCategoria: 'CAT-02',
      codigoFamilia: 'FAM-02',
      descricaoFamilia: 'SUCOS',
      ruptura: 1,
      dataHoraExecucaoAtividade: '2026-08-11 10:15:00',
    },
    {
      idSupervisor: 'SUP-03',
      nomeSupervisor: 'SUPERVISOR 3',
      idPromotor: '0030',
      nomePromotor: 'PROMOTOR RUPTURA 3',
      imeiPromotor: '555666777888999',
      idCliente: 'CLI-003',
      cpfCnpjCliente: '44.555.666/0001-77',
      codigoCliente: '0009',
      razaoSocialCliente: '0009 - ATACADO NORTE',
      fantasiaCliente: 'ATACADO NORTE',
      redeCliente: 'REDE NORTE',
      enderecoCliente: 'AV DAS TORRES, 300',
      bairroCliente: 'JARDIM DAS AMERICAS',
      ramoAtividadeCliente: 'ATACADISTA',
      telefoneCliente: '41977777777',
      cidadeCliente: 'LONDRINA',
      siglaEstadoCliente: 'PR',
      descricaoRotina: 'ROTINA TARDE',
      idAtividade: 'ATV-03',
      descricaoAtividade: 'EXEMPLO ATIVIDADE 3',
      descricaoCategoria: 'LIMPEZA',
      descricaoMotivo: 'ESTOQUE VIRTUAL',
      statusRoteiro: 'CONCLUIDO',
      idRoteiroPadrao: 'ROT-03',
      descricaoRoteiroPadrao: 'ROTEIRO 3',
      dataVisita: '2026-08-12',
      horaInicioExecucaoRoteiro: '14:00',
      horaFinalExecucaoRoteiro: '15:30',
      observacaoRuptura: 'CONSTA NO SISTEMA MAS NÃO TEM FISICO',
      cnpjFornecedor: '77.888.999/0001-88',
      descricaoFornecedor: 'INDUSTRIA QUIMICA LIMPEZA',
      idAtividadeRuptura: 'RUPT-03',
      idCategoria: 'CAT-03',
      codigoFamilia: 'FAM-03',
      descricaoFamilia: 'DETERGENTES',
      ruptura: 1,
      dataHoraExecucaoAtividade: '2026-08-12 14:45:00',
    },
  ],
  paginaAtual: 1, // number intencional
  quantidadePorPagina: 50,
  totalDePaginas: 1,
  totalDeRegistros: 3,
}

// ---------------------------------------------------------------------------
// Testes obrigatórios
// ---------------------------------------------------------------------------

describe('TradePro Offline API Contracts & Adapters', () => {
  // Teste 1: parseValidadeResponse com fixture válida
  it('1. parseValidadeResponse com fixture válida → sucesso, validade.length === 3, paginaAtual === 1', () => {
    const res = parseValidadeResponse(mockValidadesResponse)
    expect(res.success).toBe(true)
    if (!res.success) return

    expect(res.data.validade).toHaveLength(3)
    expect(res.data.paginaAtual).toBe(1)
    expect(res.data.quantidadePorPagina).toBe(50)
    expect(res.data.totalDePaginas).toBe(3)
    expect(res.data.totalDeProdutos).toBe(120)
  })

  // Teste 2: parseValidadeResponse com paginaAtual: "1" (string) → normalizado para 1
  it('2. parseValidadeResponse com paginaAtual: "1" (string) → normalizado para 1', () => {
    const raw = {
      validade: [],
      paginaAtual: '1',
      quantidadePorPagina: '20',
      totalDePaginas: '5',
      totalDeProdutos: '100',
    }
    const res = parseValidadeResponse(raw)
    expect(res.success).toBe(true)
    if (!res.success) return
    expect(res.data.paginaAtual).toBe(1)
    expect(typeof res.data.paginaAtual).toBe('number')
  })

  // Teste 3: parseValidadeResponse com paginaAtual: NaN → erro rejeitado
  it('3. parseValidadeResponse com paginaAtual: NaN → erro rejeitado', () => {
    const raw = {
      validade: [],
      paginaAtual: NaN,
      quantidadePorPagina: 20,
      totalDePaginas: 5,
      totalDeProdutos: 100,
    }
    const res = parseValidadeResponse(raw)
    expect(res.success).toBe(false)
    if (res.success === false) {
      expect(res.error).toContain('paginaAtual')
    }
  })

  // Teste 4: adaptValidadeItem sem industryClient → retorna status: 'blocked' com blockerCode: 'missing_industry_context'
  it("4. adaptValidadeItem sem industryClient → retorna status: 'blocked' com blockerCode: 'missing_industry_context'", () => {
    const candidate = adaptValidadeItem(mockValidadesResponse.validade[0])
    expect(candidate.status).toBe('blocked')
    if (candidate.status === 'blocked') {
      expect(candidate.blockerCode).toBe(BLOCKER_MISSING_INDUSTRY_CONTEXT)
      expect(candidate.blockerCode).toBe('missing_industry_context')
      expect(candidate.motivoBloqueio).toContain('industryClient')
    }
  })

  // Teste 5: adaptValidadeItem com industryClient → retorna status: 'valid', fornecedor='DIRETORIA' e cliente=industryClient
  it('5. adaptValidadeItem com industryClient → retorna status: "valid", fornecedor="DIRETORIA" e cliente=industryClient', () => {
    const candidate = adaptValidadeItem(mockValidadesResponse.validade[0], {
      industryClient: 'CASA KUNZLER',
    })
    expect(candidate.status).toBe('valid')
    if (candidate.status === 'valid') {
      expect(candidate.candidato.fornecedor).toBe('DIRETORIA')
      expect(candidate.candidato.cliente).toBe('CASA KUNZLER')
      expect(candidate.candidato.produto).toBe('PRODUTO TESTE A 500G')
      expect(candidate.candidato.razaoSocial).toBe('001 - MERCADO TESTE LTDA')
      expect(candidate.candidato.fantasia).toBe('MERCADO TESTE 1')
    }
  })

  // Teste 6: parseRupturasResponse com fixture válida → sucesso, rupturas.length === 3
  it('6. parseRupturasResponse com fixture válida → sucesso, rupturas.length === 3', () => {
    const res = parseRupturasResponse(mockRupturasResponse)
    expect(res.success).toBe(true)
    if (!res.success) return

    expect(res.data.rupturas).toHaveLength(3)
    expect(res.data.paginaAtual).toBe(1)
    expect(res.data.totalDeRegistros).toBe(3)
  })

  // Teste 7: parseRupturasResponse com paginaAtual inválido → erro rejeitado
  it('7. parseRupturasResponse com paginaAtual inválido → erro rejeitado', () => {
    const raw = {
      rupturas: [],
      paginaAtual: 'texto_invalido',
      quantidadePorPagina: 50,
      totalDePaginas: 1,
      totalDeRegistros: 0,
    }
    const res = parseRupturasResponse(raw)
    expect(res.success).toBe(false)
    if (res.success === false) {
      expect(res.error).toContain('paginaAtual')
    }
  })

  // Teste 8: adaptRupturaItem → mapeia descricaoAtividade para produto e define scope='product' ou 'brand_total'
  it('8. adaptRupturaItem → mapeia descricaoAtividade para produto com scope="product"', () => {
    const candidate = adaptRupturaItem(mockRupturasResponse.rupturas[0])
    expect(candidate.status).toBe('valid')
    expect(candidate.candidato.produto).toBe('EXEMPLO ATIVIDADE')
    expect(candidate.candidato.cliente).toBe('INDUSTRIA ALIMENTOS S/A')
    expect(candidate.candidato.scope).toBe('product')
  })

  it('8b. adaptRupturaItem com descricaoAtividade === descricaoFornecedor → scope="brand_total"', () => {
    const itemTotal = {
      ...mockRupturasResponse.rupturas[0],
      descricaoAtividade: 'INDUSTRIA ALIMENTOS S/A',
      descricaoFornecedor: 'INDUSTRIA ALIMENTOS S/A',
    }
    const candidate = adaptRupturaItem(itemTotal)
    expect(candidate.status).toBe('valid')
    expect(candidate.candidato.scope).toBe('brand_total')
    expect(candidate.candidato.produto).toBe('INDUSTRIA ALIMENTOS S/A')
  })

  // Teste 9: parseValidadeResponse com payload null → erro legível, sem expor conteúdo integral
  it('9. parseValidadeResponse com payload null → erro legível', () => {
    const res = parseValidadeResponse(null)
    expect(res.success).toBe(false)
    if (res.success === false) {
      expect(res.error).toMatch(/Payload inválido/i)
    }
  })

  // Teste 10: parseValidadeResponse com payload {} (sem validade) → erro legível
  it('10. parseValidadeResponse com payload {} (sem validade) → erro legível', () => {
    const res = parseValidadeResponse({})
    expect(res.success).toBe(false)
    if (res.success === false) {
      expect(res.error).toContain('validade')
    }
  })

  // Teste 11: parseRupturasResponse com payload malformado (array em vez de objeto) → erro legível
  it('11. parseRupturasResponse com payload malformado (array em vez de objeto) → erro legível', () => {
    const res = parseRupturasResponse([])
    expect(res.success).toBe(false)
    if (res.success === false) {
      expect(res.error).toMatch(/Payload inválido/i)
    }
  })

  // Teste 12: IDs com zeros à esquerda preservados
  it('12. IDs com zeros à esquerda preservados: promotor.id: "0001" e codigoCliente: "0007"', () => {
    const candValidade = adaptValidadeItem(mockValidadesResponse.validade[0])
    if (candValidade.status === 'blocked') {
      expect(candValidade.candidatoParcial.codColaborador).toBe('0001')
      expect(candValidade.candidatoParcial.codProduto).toBe('001020')
    }

    const candRuptura = adaptRupturaItem(mockRupturasResponse.rupturas[0])
    expect(candRuptura.candidato.codigo_loja).toBe('0007')
    expect(candRuptura.candidato.codColaborador).toBe('0010')
  })

  // Teste 13: Extração correta de cliente.cidade.nome e cliente.cidade.estado.sigla
  it('13. Extração correta de cliente.cidade.nome e cliente.cidade.estado.sigla', () => {
    const candValidade = adaptValidadeItem(mockValidadesResponse.validade[0])
    if (candValidade.status === 'blocked') {
      expect(candValidade.candidatoParcial.cidade).toBe('CIDADE TESTE')
      expect(candValidade.candidatoParcial.estado).toBe('TS')
    }

    const candValidade2 = adaptValidadeItem(mockValidadesResponse.validade[1])
    if (candValidade2.status === 'blocked') {
      expect(candValidade2.candidatoParcial.cidade).toBe('CIDADE MODELO')
      expect(candValidade2.candidatoParcial.estado).toBe('SP')
    }
  })

  // Teste 14: normalizePageMeta com valores: "5" → 5, 5 → 5, NaN → erro, -1 → erro, undefined → erro
  it('14. normalizePageMeta com valores: "5" → 5, 5 → 5, NaN → erro, -1 → erro, undefined → erro', () => {
    expect(normalizePageMeta('5', 'teste')).toBe(5)
    expect(normalizePageMeta(5, 'teste')).toBe(5)
    expect(normalizePageMeta('0', 'teste')).toBe(0)
    expect(normalizePageMeta(0, 'teste')).toBe(0)

    expect(() => normalizePageMeta(NaN, 'teste')).toThrowError(/número finito/)
    expect(() => normalizePageMeta('abc', 'teste')).toThrowError(/número finito/)
    expect(() => normalizePageMeta(-1, 'teste')).toThrowError(/maior ou igual a zero/)
    expect(() => normalizePageMeta(undefined, 'teste')).toThrowError(/obrigatório/)
    expect(() => normalizePageMeta(null, 'teste')).toThrowError(/obrigatório/)
    expect(() => normalizePageMeta('', 'teste')).toThrowError(/não pode ser vazio/)
  })

  // Teste Adicional: normalizeMotivo puro
  it('normalizeMotivo pura padroniza motivos canônicos sem duplicação', () => {
    expect(normalizeMotivo('RUPTURA TOTAL')).toBe('Ruptura Total')
    expect(normalizeMotivo('SEM ESTOQUE MINIMO')).toBe('Sem Estoque Mínimo')
    expect(normalizeMotivo('PRODUTO ZERADO')).toBe('Sem Estoque Mínimo')
    expect(normalizeMotivo('ESTOQUE VIRTUAL')).toBe('Estoque Virtual')
    expect(normalizeMotivo('OUTRO')).toBe('Ruptura Total')
  })
})
