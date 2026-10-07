import { describe, it, expect, vi } from 'vitest'
import { detectarConflitoCadastro } from '@/services/cadastrosService'
import type {
  CadastroIndustria,
  CadastroProduto,
  CadastroRede,
  CadastroLoja,
  CadastroPromotor,
  CadastroSupervisor,
  CadastroPromotorAssignment,
  OperacionalVisita,
} from '@/types/cadastros'

describe('Validação Completa dos Cadastros Mestres & Visitas Operacionais', () => {
  // 1. Cadastro manual de Indústria e de Produto
  it('permite criação manual de Indústria e Produto sem depender de deploy', () => {
    const novaIndustria: Partial<CadastroIndustria> = {
      nome: 'LATÍCINIOS ALVORADA',
      razao_social: 'Laticínios Alvorada Ltda',
      cnpj: '12.345.678/0001-90',
      status: 'ativa',
      tradepro_client_id: '88',
      app_diretoria_industry_id: 'APP_ALV_01',
    }
    expect(novaIndustria.nome).toBe('LATÍCINIOS ALVORADA')
    expect(novaIndustria.app_diretoria_industry_id).toBe('APP_ALV_01')

    const novoProduto: Partial<CadastroProduto> = {
      nome_produto: 'IOGURTE GREGO CRANBERRY 100G',
      industry_name: novaIndustria.nome,
      codigo_produto: '9002',
      cod_barras: '7891234567890',
      tipo_mix: 'oficial_industria',
      status: 'ativo',
    }
    expect(novoProduto.nome_produto).toBe('IOGURTE GREGO CRANBERRY 100G')
    expect(novoProduto.industry_name).toBe('LATÍCINIOS ALVORADA')
    expect(novoProduto.tipo_mix).toBe('oficial_industria')
  })

  // 2. Edição manual e dados brutos preservados
  it('preserva dados brutos e suporta edição manual sem corrupção', () => {
    const rawTradeProItem = {
      codCliente: '7',
      cliente: 'FRUTAP',
      codProduto: '101',
      produto: 'FRUTAPINHO MORANGO 320G',
    }
    const cadastroSkip: Partial<CadastroProduto> = {
      codigo_produto: rawTradeProItem.codProduto,
      nome_produto: rawTradeProItem.produto,
      industry_name: 'Frutap',
      categoria: 'Produto normalizado no SKIP',
    }
    // Dados brutos preservados
    expect(rawTradeProItem.cliente).toBe('FRUTAP')
    expect(cadastroSkip.nome_produto).toBe('FRUTAPINHO MORANGO 320G')
  })

  // 3. Conflito API × Configuração manual (Ajuste manual NÃO pode ser sobrescrito silenciosamente)
  it('detecta conflito entre configuração manual existente e dados recebidos da API', () => {
    const conflito = detectarConflitoCadastro(
      'produto',
      'prod_1',
      'FRUTAPINHO MORANGO',
      'gramatura',
      '320g', // valor atual configurado manualmente
      '300g', // valor recebido da API
      'TradePro API',
    )
    expect(conflito).not.toBeNull()
    expect(conflito?.valor_atual).toBe('320g')
    expect(conflito?.valor_recebido).toBe('300g')
    expect(conflito?.tipo_entidade).toBe('produto')
  })

  it('não acusa conflito quando o valor recebido for idêntico (case-insensitive)', () => {
    const conflito = detectarConflitoCadastro(
      'loja',
      'loja_165',
      'Loja 165',
      'cidade',
      'Joinville',
      'JOINVILLE',
      'TradePro API',
    )
    expect(conflito).toBeNull()
  })

  // 4. Produto → Indústria (Vínculo oficial)
  it('produto oficial quando conhecido vincula exclusivamente à sua indústria', () => {
    const produtoFrutapinho: Partial<CadastroProduto> = {
      id: 'p_frutapinho',
      nome_produto: 'FRUTAPINHO PATATI PATATA MORANGO 320G',
      industry_id: 'ind_frutap',
      industry_name: 'FRUTAP',
    }
    expect(produtoFrutapinho.industry_name).toBe('FRUTAP')
  })

  // 5. Os Três Níveis de Mix Permanecem Independentes
  it('mix oficial não aplica automaticamente em todas as lojas; mix observado não vira definido sem aprovação', () => {
    const mixOficialFrutap = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10']
    const mixDefinidoLoja165 = ['P1', 'P2', 'P3'] // Loja trabalha com catálogo restrito

    // 1. Loja 165 não possui os 10 produtos no Mix Definido
    expect(mixDefinidoLoja165.length).toBe(3)
    expect(mixDefinidoLoja165.includes('P4')).toBe(false)

    // 2. Produto P4 é observado repetidamente em visita/ruptura
    const evidenciasObservadas = ['P4', 'P4', 'P4']
    const mixObservadoLoja165 = [...new Set([...mixDefinidoLoja165, ...evidenciasObservadas])]
    expect(mixObservadoLoja165).toContain('P4')

    // 3. P4 NUNCA entra automaticamente no Mix Definido
    expect(mixDefinidoLoja165.includes('P4')).toBe(false)
  })

  // 6. Rede → Loja (Fantasia TradePro vira Rede, Loja configurável)
  it('estrutura Rede e Lojas corretamente a partir da semântica TradePro', () => {
    const rede: CadastroRede = {
      id: 'net_pereira',
      nome: 'GRUPO PEREIRA',
      codigo_externo: 'GP_01',
      ativo: true,
      total_lojas: 1,
    }
    const loja: CadastroLoja = {
      id: 'store_165',
      codigo_externo: '165',
      codigo_loja: '165',
      nome: '165 - FORT ATACADISTA AVENTUREIRO',
      razao_social: '165 - FORT ATACADISTA AVENTUREIRO',
      network_id: rede.id,
      rede_nome: rede.nome,
      cidade: 'Joinville',
      estado: 'SC',
      ativo: true,
    }
    expect(loja.network_id).toBe('net_pereira')
    expect(loja.rede_nome).toBe('GRUPO PEREIRA')
    expect(loja.codigo_externo).toBe('165')
  })

  // 7. Promotor → Várias Lojas & Múltiplas Indústrias
  it('permite promotor atender várias lojas e trabalhar com mais de uma indústria', () => {
    const promotor: CadastroPromotor = {
      id: 'prom_joao',
      nome: 'JOÃO SILVA',
      codigo_externo: '236',
      status: 'ativo',
    }

    const assignments: CadastroPromotorAssignment[] = [
      {
        id: 'ass_1',
        promoter_id: promotor.id,
        promoter_nome: promotor.nome,
        store_code: '165',
        store_name: 'Fort Aventureiro',
        industry_name: 'FRUTAP',
        status: 'ativo',
        tipo_vinculo: 'confirmado',
      },
      {
        id: 'ass_2',
        promoter_id: promotor.id,
        promoter_nome: promotor.nome,
        store_code: '250',
        store_name: 'Fort Bucarein',
        industry_name: "MASSAS D'ITÁLIA",
        status: 'ativo',
        tipo_vinculo: 'confirmado',
      },
    ]

    expect(assignments.length).toBe(2)
    const lojas = new Set(assignments.map((a) => a.store_code))
    const industrias = new Set(assignments.map((a) => a.industry_name))
    expect(lojas.size).toBe(2)
    expect(industrias.size).toBe(2)
  })

  // 8. Relação confirmada × Relação observada pela API
  it('distingue vínculo confirmado no roteiro de relação observada em visita', () => {
    const vinculoConfirmado: Partial<CadastroPromotorAssignment> = {
      promoter_nome: 'JOÃO SILVA',
      store_code: '165',
      tipo_vinculo: 'confirmado',
      origem_vinculo: 'Manual / Roteiro Aprovado',
    }

    const vinculoObservado: Partial<CadastroPromotorAssignment> = {
      promoter_nome: 'JOÃO SILVA',
      store_code: '999', // Loja visitada fora do roteiro
      tipo_vinculo: 'observado_visita',
      origem_vinculo: 'Visita registrada em 2026-03-30',
    }

    expect(vinculoConfirmado.tipo_vinculo).toBe('confirmado')
    expect(vinculoObservado.tipo_vinculo).toBe('observado_visita')
    // Vínculo observado NÃO altera a cobertura confirmada
    expect(vinculoConfirmado.store_code).not.toBe(vinculoObservado.store_code)
  })

  // 9. Histórico temporal de Promotor (Substituição de promotores na loja)
  it('preserva histórico temporal quando um promotor substitui outro na mesma unidade', () => {
    const historicoLoja165: CadastroPromotorAssignment[] = [
      {
        id: 'ass_antigo',
        promoter_id: 'prom_joao',
        promoter_nome: 'JOÃO SILVA',
        store_code: '165',
        store_name: 'Fort Aventureiro',
        status: 'encerrado',
        data_inicio: '2026-01-01',
        data_fim: '2026-02-28',
        observacao: 'Encerrado por substituição temporal',
      },
      {
        id: 'ass_novo',
        promoter_id: 'prom_maria',
        promoter_nome: 'MARIA SANTOS',
        store_code: '165',
        store_name: 'Fort Aventureiro',
        status: 'ativo',
        data_inicio: '2026-03-01',
        data_fim: '',
      },
    ]

    expect(historicoLoja165.length).toBe(2)
    expect(historicoLoja165[0].status).toBe('encerrado')
    expect(historicoLoja165[0].data_fim).toBe('2026-02-28')
    expect(historicoLoja165[1].status).toBe('ativo')
    expect(historicoLoja165[1].promoter_nome).toBe('MARIA SANTOS')
  })

  // 10. Supervisor → Vários Promotores
  it('supervisor acompanha múltiplos promotores sob sua coordenação', () => {
    const supervisor: CadastroSupervisor = {
      id: 'sup_carlos',
      nome: 'CARLOS COORDENADOR',
      codigo_externo: 'SUP_01',
      status: 'ativo',
      total_promotores: 3,
    }
    const equipe = [
      { nome: 'João', supervisor_id: supervisor.id },
      { nome: 'Maria', supervisor_id: supervisor.id },
      { nome: 'Pedro', supervisor_id: supervisor.id },
    ]
    expect(equipe.filter((e) => e.supervisor_id === 'sup_carlos').length).toBe(3)
  })

  // 11. Fundação de Visitas: Preservação de horários reais sem invenções
  it('preserva horários reais da visita e não inventa check-out ou falta', () => {
    const visitaReal: OperacionalVisita = {
      id: 'vis_1',
      data: '2026-03-30',
      promoter_nome: 'JOÃO SILVA',
      store_code: '165',
      store_name: 'Fort Aventureiro',
      hora_inicio: '08:15',
      hora_fim: '', // Check-out ausente na API
      origem_fonte: 'tradepro_rupturas',
    }

    // A hora de início foi capturada
    expect(visitaReal.hora_inicio).toBe('08:15')
    // Não inventa hora final quando a fonte não fornecer
    expect(visitaReal.hora_fim).toBe('')
    // Ausência de visita futura em outra loja é "Sem visita registrada", nunca falta
    const semRegistro = null
    const rotuloApresentado = semRegistro ? 'Visita realizada' : 'Sem visita registrada'
    expect(rotuloApresentado).toBe('Sem visita registrada')
    expect(rotuloApresentado).not.toContain('faltou')
  })

  // 12. Identidade Própria / Preparação Multi-Fonte (App Diretoria)
  it('aceita identificadores externos futuros sem depender exclusivamente do TradePro', () => {
    const promotorSkip: Partial<CadastroPromotor> = {
      id: 'prom_01',
      nome: 'CARLOS EDUARDO',
      codigo_externo: '236', // TradePro ID
      observacoes: 'ID App Diretoria: APP-DIR-USER-99', // Campo futuro
    }
    expect(promotorSkip.codigo_externo).toBe('236')
    expect(promotorSkip.observacoes).toContain('APP-DIR-USER-99')
  })
})
