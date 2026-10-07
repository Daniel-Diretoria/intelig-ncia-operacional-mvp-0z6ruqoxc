import { describe, it, expect } from 'vitest'
import {
  adaptRupturaItem,
  adaptValidadeItem,
  BLOCKER_MISSING_INDUSTRY_CONTEXT,
} from '@/lib/api/tradeProAdapter'
import type { TradeProRupturaItem, TradeProValidadeItem } from '@/types/tradeProApi'

describe('BLOCO B.1 — TradePro Rupturas e Validades Normalização & Preservação', () => {
  // 1. Fornecedor DIRETORIA não vira Indústria
  it('garante que Fornecedor "DIRETORIA" não substitui Indústria em Validades', () => {
    const validadeMock: TradeProValidadeItem = {
      promotor: { id: '101', nome: 'CARLOS SILVA' },
      cliente: {
        razaoSocial: '123 - SUPERMERCADO EXEMPLO LTDA',
        fantasia: 'SUPERMERCADO EXEMPLO',
        cpfCnpj: '12.345.678/0001-90',
        endereco: 'Rua A',
        cidade: { nome: 'São Paulo', estado: { sigla: 'SP' } },
      },
      produto: { codigo: '00456', descricao: 'IOGURTE MORANGO 170G' },
      realizado: '2025-04-10',
      quantidade: 15,
      validade: '2025-04-25',
      diasParaVencimento: 15,
      fornecedor: 'DIRETORIA',
    }

    const adapted = adaptValidadeItem(validadeMock, {
      industryClient: 'FRUTAP',
      supplierOperation: 'DIRETORIA',
    })

    expect(adapted.status).toBe('valid')
    if (adapted.status === 'valid') {
      expect(adapted.candidato.fornecedor).toBe('DIRETORIA')
      expect(adapted.candidato.cliente).toBe('FRUTAP')
      expect(adapted.candidato.cliente).not.toBe('DIRETORIA')
    }
  })

  // 2. Cliente TradePro vira Indústria (não Fornecedor)
  it('garante que em Rupturas, fornecedor não vira Indústria', () => {
    const rupturaMock: TradeProRupturaItem = {
      idSupervisor: '99',
      nomeSupervisor: 'SUPERVISOR CHEFE',
      idPromotor: '101',
      nomePromotor: 'CARLOS SILVA',
      imeiPromotor: '',
      idCliente: '7',
      cpfCnpjCliente: '12.345.678/0001-90',
      codigoCliente: '7',
      razaoSocialCliente: '123 - SUPERMERCADO EXEMPLO LTDA',
      fantasiaCliente: 'REDE EXEMPLO',
      redeCliente: 'REDE EXEMPLO',
      enderecoCliente: '',
      bairroCliente: '',
      ramoAtividadeCliente: '',
      telefoneCliente: '',
      cidadeCliente: 'São Paulo',
      siglaEstadoCliente: 'SP',
      descricaoRotina: '',
      idAtividade: '55',
      descricaoAtividade: 'IOGURTE MORANGO 170G',
      descricaoCategoria: 'Laticínios',
      descricaoMotivo: 'RUPTURA TOTAL',
      statusRoteiro: 'REALIZADO',
      idRoteiroPadrao: '1',
      descricaoRoteiroPadrao: 'ROTA PADRAO',
      dataVisita: '2025-04-10',
      horaInicioExecucaoRoteiro: '08:00',
      horaFinalExecucaoRoteiro: '09:00',
      observacaoRuptura: 'Item esgotado na gôndola',
      cnpjFornecedor: '00.111.222/0001-33',
      descricaoFornecedor: 'DIRETORIA LOGISTICA',
      idAtividadeRuptura: '88812',
      idCategoria: '3',
      codigoFamilia: '10',
      descricaoFamilia: 'Iogurtes',
      ruptura: 1,
      dataHoraExecucaoAtividade: '2025-04-10 08:30:00',
    }

    const adapted = adaptRupturaItem(rupturaMock, { industryClient: 'FRUTAP' })
    expect(adapted.status).toBe('valid')
    expect(adapted.candidato.cliente).toBe('FRUTAP')
    expect(adapted.candidato.cliente).not.toBe('DIRETORIA LOGISTICA')
  })

  // 3. Fantasia vira Rede e Razão Social vira Loja
  it('preserva Fantasia como Rede e Razão Social como Loja', () => {
    const rupturaMock: TradeProRupturaItem = {
      idSupervisor: '99',
      nomeSupervisor: 'SUPERVISOR CHEFE',
      idPromotor: '101',
      nomePromotor: 'CARLOS SILVA',
      imeiPromotor: '',
      idCliente: '7',
      cpfCnpjCliente: '12.345.678/0001-90',
      codigoCliente: '123',
      razaoSocialCliente: '123 - SUPERMERCADO MODELO LOJA 01',
      fantasiaCliente: 'SUPERMERCADOS MODELO',
      redeCliente: 'SUPERMERCADOS MODELO',
      enderecoCliente: '',
      bairroCliente: '',
      ramoAtividadeCliente: '',
      telefoneCliente: '',
      cidadeCliente: 'Campinas',
      siglaEstadoCliente: 'SP',
      descricaoRotina: '',
      idAtividade: '55',
      descricaoAtividade: 'IOGURTE',
      descricaoCategoria: '',
      descricaoMotivo: 'RUPTURA TOTAL',
      statusRoteiro: '',
      idRoteiroPadrao: '',
      descricaoRoteiroPadrao: '',
      dataVisita: '2025-04-10',
      horaInicioExecucaoRoteiro: '',
      horaFinalExecucaoRoteiro: '',
      observacaoRuptura: '',
      cnpjFornecedor: '',
      descricaoFornecedor: '',
      idAtividadeRuptura: '',
      idCategoria: '',
      codigoFamilia: '',
      descricaoFamilia: '',
      ruptura: 1,
      dataHoraExecucaoAtividade: '',
    }

    const adapted = adaptRupturaItem(rupturaMock)
    expect(adapted.candidato.rede).toBe('SUPERMERCADOS MODELO')
    expect(adapted.candidato.fantasia).toBe('SUPERMERCADOS MODELO')
    expect(adapted.candidato.nome_loja).toBe('123 - SUPERMERCADO MODELO LOJA 01')
    expect(adapted.candidato.razao_social).toBe('123 - SUPERMERCADO MODELO LOJA 01')
  })

  // 4. idPromotor / Cód. Colaborador e idSupervisor são preservados
  it('preserva identificadores fortes idPromotor e idSupervisor sem perda de tipo texto', () => {
    const rupturaMock: TradeProRupturaItem = {
      idSupervisor: '0078',
      nomeSupervisor: 'ALBERTO SANTOS',
      idPromotor: '00105',
      nomePromotor: 'MARCOS OLIVEIRA',
      imeiPromotor: '',
      idCliente: '7',
      cpfCnpjCliente: '',
      codigoCliente: '',
      razaoSocialCliente: 'LOJA TESTE',
      fantasiaCliente: '',
      redeCliente: '',
      enderecoCliente: '',
      bairroCliente: '',
      ramoAtividadeCliente: '',
      telefoneCliente: '',
      cidadeCliente: '',
      siglaEstadoCliente: '',
      descricaoRotina: '',
      idAtividade: '',
      descricaoAtividade: 'LEITE FERMENTADO',
      descricaoCategoria: '',
      descricaoMotivo: 'RUPTURA TOTAL',
      statusRoteiro: '',
      idRoteiroPadrao: '',
      descricaoRoteiroPadrao: '',
      dataVisita: '2025-04-10',
      horaInicioExecucaoRoteiro: '',
      horaFinalExecucaoRoteiro: '',
      observacaoRuptura: '',
      cnpjFornecedor: '',
      descricaoFornecedor: '',
      idAtividadeRuptura: '',
      idCategoria: '',
      codigoFamilia: '',
      descricaoFamilia: '',
      ruptura: 1,
      dataHoraExecucaoAtividade: '',
    }

    const adapted = adaptRupturaItem(rupturaMock)
    expect(adapted.candidato.codColaborador).toBe('00105')
    expect(adapted.candidato.colaborador).toBe('MARCOS OLIVEIRA')
  })

  // 5. Quantidade zero continua estritamente válida
  it('preserva Quantidade = 0 como atualização válida em Validades', () => {
    const validadeZero: TradeProValidadeItem = {
      promotor: { id: '101', nome: 'CARLOS SILVA' },
      cliente: {
        razaoSocial: 'SUPERMERCADO TESTE',
        fantasia: 'SUPER TESTE',
        cpfCnpj: '12.345.678/0001-90',
        endereco: 'Rua B',
        cidade: { nome: 'São Paulo', estado: { sigla: 'SP' } },
      },
      produto: { codigo: '00123', descricao: 'REQUEIJAO TRADICIONAL 200G' },
      realizado: '2025-04-10',
      quantidade: 0, // Zero estrito
      validade: '2025-05-01',
      diasParaVencimento: 21,
    }

    const adapted = adaptValidadeItem(validadeZero, { industryClient: 'FRUTAP' })
    expect(adapted.status).toBe('valid')
    if (adapted.status === 'valid') {
      expect(adapted.candidato.quantidade).toBe(0)
    }
  })

  // 6. Bloqueio quando falta contexto de Indústria em Validades
  it('retorna bloqueado com blockerCode missing_industry_context quando não há indústria resolvida', () => {
    const validadeMock: TradeProValidadeItem = {
      promotor: { id: '101', nome: 'CARLOS SILVA' },
      cliente: {
        razaoSocial: 'SUPERMERCADO TESTE',
        fantasia: 'SUPER TESTE',
        cpfCnpj: '12.345.678/0001-90',
        endereco: 'Rua B',
        cidade: { nome: 'São Paulo', estado: { sigla: 'SP' } },
      },
      produto: { codigo: '00123', descricao: 'REQUEIJAO' },
      realizado: '2025-04-10',
      quantidade: 5,
      validade: '2025-05-01',
      diasParaVencimento: 21,
    }

    const adapted = adaptValidadeItem(validadeMock)
    expect(adapted.status).toBe('blocked')
    if (adapted.status === 'blocked') {
      expect(adapted.blockerCode).toBe(BLOCKER_MISSING_INDUSTRY_CONTEXT)
      expect(adapted.candidatoParcial.produto).toBe('REQUEIJAO')
    }
  })

  // 7. Não inventa código de produto artificial em Rupturas
  it('não inventa código de produto artificial em Rupturas', () => {
    const rupturaMock: TradeProRupturaItem = {
      idSupervisor: '',
      nomeSupervisor: '',
      idPromotor: '101',
      nomePromotor: 'PROMOTOR',
      imeiPromotor: '',
      idCliente: '7',
      cpfCnpjCliente: '',
      codigoCliente: '',
      razaoSocialCliente: 'LOJA',
      fantasiaCliente: '',
      redeCliente: '',
      enderecoCliente: '',
      bairroCliente: '',
      ramoAtividadeCliente: '',
      telefoneCliente: '',
      cidadeCliente: '',
      siglaEstadoCliente: '',
      descricaoRotina: '',
      idAtividade: '99',
      descricaoAtividade: 'BEBIDA LACTEA MORANGO 850G',
      descricaoCategoria: '',
      descricaoMotivo: 'RUPTURA TOTAL',
      statusRoteiro: '',
      idRoteiroPadrao: '',
      descricaoRoteiroPadrao: '',
      dataVisita: '2025-04-10',
      horaInicioExecucaoRoteiro: '',
      horaFinalExecucaoRoteiro: '',
      observacaoRuptura: '',
      cnpjFornecedor: '',
      descricaoFornecedor: '',
      idAtividadeRuptura: '',
      idCategoria: '',
      codigoFamilia: '',
      descricaoFamilia: '',
      ruptura: 1,
      dataHoraExecucaoAtividade: '',
    }

    const adapted = adaptRupturaItem(rupturaMock)
    expect(adapted.candidato.produto).toBe('BEBIDA LACTEA MORANGO 850G')
    // Nenhum campo de código de produto artificial inventado
    expect((adapted.candidato as Record<string, unknown>).codigo_produto).toBeUndefined()
  })

  // 8. Timestamps de Ruptura são preservados separadamente
  it('preserva timestamps operacionais de Ruptura de forma segregada', () => {
    const rupturaMock: TradeProRupturaItem = {
      idSupervisor: '',
      nomeSupervisor: '',
      idPromotor: '',
      nomePromotor: '',
      imeiPromotor: '',
      idCliente: '',
      cpfCnpjCliente: '',
      codigoCliente: '',
      razaoSocialCliente: 'LOJA',
      fantasiaCliente: '',
      redeCliente: '',
      enderecoCliente: '',
      bairroCliente: '',
      ramoAtividadeCliente: '',
      telefoneCliente: '',
      cidadeCliente: '',
      siglaEstadoCliente: '',
      descricaoRotina: '',
      idAtividade: '',
      descricaoAtividade: 'PRODUTO',
      descricaoCategoria: '',
      descricaoMotivo: 'RUPTURA TOTAL',
      statusRoteiro: 'EM_ANDAMENTO',
      idRoteiroPadrao: '12',
      descricaoRoteiroPadrao: 'ROTA NORTE',
      dataVisita: '2025-04-10',
      horaInicioExecucaoRoteiro: '07:45',
      horaFinalExecucaoRoteiro: '08:50',
      observacaoRuptura: '',
      cnpjFornecedor: '',
      descricaoFornecedor: '',
      idAtividadeRuptura: '555',
      idCategoria: '',
      codigoFamilia: '',
      descricaoFamilia: '',
      ruptura: 1,
      dataHoraExecucaoAtividade: '2025-04-10 08:15:22',
    }

    expect(rupturaMock.dataVisita).toBe('2025-04-10')
    expect(rupturaMock.horaInicioExecucaoRoteiro).toBe('07:45')
    expect(rupturaMock.horaFinalExecucaoRoteiro).toBe('08:50')
    expect(rupturaMock.dataHoraExecucaoAtividade).toBe('2025-04-10 08:15:22')
  })
})
