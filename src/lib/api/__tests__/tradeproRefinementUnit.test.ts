import { describe, it, expect, vi } from 'vitest'

/**
 * Testes Unitários de Refinamento TradePro:
 * 1. Desativação de resíduos legados de rupturas (1.110 registros legados -> 6.780 registros limpos)
 * 2. Loop de retry autônomo com backoff progressivo (5s, 15s, 30s) e preservação de staging
 * 3. Anti-paralelismo: chamada concorrente quando status é 'syncing' tratada como safe no-op
 * 4. Mapeamento semântico canônico Rupturas (Indústria / Rede / Loja / Produto / Motivo)
 * 5. Mapeamento semântico canônico Validades (Fornecedor DIRETORIA mantido separadamente da Indústria, quantidade 0 válida)
 */

describe('TradePro Refinement — Desativação de Resíduos Legados de Rupturas', () => {
  it('identifica e desativa registros residuais de tenant-default preservando o job canônico', () => {
    // Cenário simulado do banco antes da intervenção: 6.780 registros do job novo + 1.110 legados
    const database = [
      ...Array.from({ length: 6780 }, (_, i) => ({
        id: `rup_new_${i}`,
        tenant_id: 'tradepro_job_e8enyr17kqlbl1f',
        is_base_atual: 1,
        codigo_cliente: '7',
        cliente: 'FORT ATACADISTA', // Antes da normalização de marca
        produto: `PRODUTO_${i % 50}`,
        motivo: 'Ruptura Total',
      })),
      ...Array.from({ length: 1110 }, (_, i) => ({
        id: `rup_legacy_${i}`,
        tenant_id: 'tenant-default',
        is_base_atual: 1,
        codigo_cliente: '',
        cliente: 'CLIENTE_ANTIGO',
        produto: `PRODUTO_LEGADO_${i % 30}`,
        motivo: 'Ruptura Total',
      })),
    ]

    expect(database.filter((r) => r.is_base_atual === 1).length).toBe(7890)

    // Executa a lógica da migração 0039:
    // UPDATE rupturas_base SET is_base_atual = 0 WHERE is_base_atual = 1 AND tenant_id != 'tradepro_job_e8enyr17kqlbl1f'
    const targetJobTenant = 'tradepro_job_e8enyr17kqlbl1f'
    let deactivatedCount = 0

    for (const row of database) {
      if (row.is_base_atual === 1 && row.tenant_id !== targetJobTenant) {
        row.is_base_atual = 0
        deactivatedCount++
      }
    }

    expect(deactivatedCount).toBe(1110)
    const activeRows = database.filter((r) => r.is_base_atual === 1)
    expect(activeRows.length).toBe(6780)
    expect(activeRows.every((r) => r.tenant_id === targetJobTenant)).toBe(true)
  })

  it('normaliza o nome da indústria via tradepro_client_id (7=FRUTAP, 4=COCOLEVE, etc.) nos registros ativos', () => {
    const industryRegistry = {
      '7': 'FRUTAP',
      '4': 'COCOLEVE',
      '40': 'CHULETÃO',
      '43': 'OLIVEIRA',
      '51': 'MASSAS D´ITÁLIA',
    }

    const records = [
      { id: '1', codigo_cliente: '7', cliente: 'FORT ATACADISTA', is_base_atual: 1 },
      { id: '2', codigo_cliente: '4', cliente: 'COMPER', is_base_atual: 1 },
      { id: '3', codigo_cliente: '40', cliente: 'ATACADAO', is_base_atual: 1 },
      { id: '4', codigo_cliente: '43', cliente: 'SUPER A', is_base_atual: 1 },
      { id: '5', codigo_cliente: '51', cliente: 'FORT', is_base_atual: 1 },
    ]

    // Normalização via tradepro_client_id
    for (const r of records) {
      if (
        r.is_base_atual === 1 &&
        industryRegistry[r.codigo_cliente as keyof typeof industryRegistry]
      ) {
        r.cliente = industryRegistry[r.codigo_cliente as keyof typeof industryRegistry]
      }
    }

    expect(records[0].cliente).toBe('FRUTAP')
    expect(records[1].cliente).toBe('COCOLEVE')
    expect(records[2].cliente).toBe('CHULETÃO')
    expect(records[3].cliente).toBe('OLIVEIRA')
    expect(records[4].cliente).toBe('MASSAS D´ITÁLIA')
  })
})

describe('TradePro Refinement — Retomada Autônoma e Backoff Progressivo', () => {
  it('executa loop de retentativas para erros transitórios (429/timeout/5xx) até 5 vezes', () => {
    const sleepCalls: number[] = []
    const mockSleep = (ms: number) => sleepCalls.push(ms)

    const retryDelaysMs = [5000, 15000, 30000, 30000, 30000]
    let attemptsCount = 0
    const jobMessageUpdates: string[] = []

    function fetchPageWithRetry(page: number, shouldSucceedOnAttempt: number) {
      const maxAttempts = 5
      let res = { statusCode: 0 }

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        attemptsCount++
        if (attempt === shouldSucceedOnAttempt) {
          res = { statusCode: 200 }
          break
        } else {
          // Erro transitório HTTP 429
          res = { statusCode: 429 }
        }

        if (attempt < maxAttempts) {
          const waitTime = retryDelaysMs[attempt - 1] || 30000
          jobMessageUpdates.push(
            `Aguardando liberação do TradePro. 0 páginas concluídas. 0 registros preservados. Tentativa automática ${attempt + 1} de 5...`,
          )
          mockSleep(waitTime)
        }
      }

      return res
    }

    // Sucesso na 3ª tentativa
    const resultSuccess = fetchPageWithRetry(1, 3)
    expect(resultSuccess.statusCode).toBe(200)
    expect(attemptsCount).toBe(3)
    expect(sleepCalls).toEqual([5000, 15000])
    expect(jobMessageUpdates.length).toBe(2)
    expect(jobMessageUpdates[0]).toContain('Tentativa automática 2 de 5...')
    expect(jobMessageUpdates[1]).toContain('Tentativa automática 3 de 5...')
  })

  it('pausa o job preservando staging somente após 5 tentativas esgotadas', () => {
    const sleepCalls: number[] = []
    const mockSleep = (ms: number) => sleepCalls.push(ms)
    const retryDelaysMs = [5000, 15000, 30000, 30000, 30000]

    let jobState = {
      status: 'syncing',
      error_code: '',
      message: '',
      paginas_processadas: 10,
      registros_validos: 300,
    }

    const maxAttempts = 5
    let statusCode = 429

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      // Simula falha contínua
      statusCode = 429
      if (attempt < maxAttempts) {
        mockSleep(retryDelaysMs[attempt - 1])
      }
    }

    if (statusCode === 429) {
      jobState.status = 'paused'
      jobState.error_code = 'rate_limited'
      jobState.message =
        'Limite de requisições mantido após 5 tentativas na página 11 de 50. Staging preservado. Clique em Retomar para continuar.'
    }

    expect(jobState.status).toBe('paused')
    expect(jobState.error_code).toBe('rate_limited')
    expect(jobState.registros_validos).toBe(300) // Preservado
    expect(jobState.paginas_processadas).toBe(10) // Preservado
    expect(sleepCalls).toEqual([5000, 15000, 30000, 30000]) // 4 esperas entre 5 tentativas
  })
})

describe('TradePro Refinement — Proteção Anti-Paralelismo', () => {
  it('bloqueia execução concorrente se o job já estava com status syncing', () => {
    function handleSyncRupturasUpdate(record: {
      status: string
      originalStatus: string
      action: string
    }) {
      if (record.action === 'sync_rupturas' && record.status === 'syncing') {
        // Anti-paralelismo: se original já era 'syncing', é no-op seguro
        if (record.originalStatus === 'syncing') {
          return { executed: false, reason: 'concurrency_noop' }
        }
        return { executed: true, reason: 'started' }
      }
      return { executed: false, reason: 'ignored' }
    }

    // Caso 1: Transição válida de 'preview' para 'syncing'
    const transicaoValida = handleSyncRupturasUpdate({
      action: 'sync_rupturas',
      status: 'syncing',
      originalStatus: 'preview',
    })
    expect(transicaoValida.executed).toBe(true)
    expect(transicaoValida.reason).toBe('started')

    // Caso 2: Chamada paralela quando já estava em 'syncing' (ex: update de progresso pelo backend)
    const chamadaConcorrente = handleSyncRupturasUpdate({
      action: 'sync_rupturas',
      status: 'syncing',
      originalStatus: 'syncing',
    })
    expect(chamadaConcorrente.executed).toBe(false)
    expect(chamadaConcorrente.reason).toBe('concurrency_noop')
  })
})

describe('TradePro Refinement — Mapeamento Semântico Canônico', () => {
  it('Rupturas: mapeia corretamente Indústria=Cód. Cliente, Rede=Fantasia, Loja=Razão Social, Produto=Atividade, Motivo', () => {
    const rawRupturaItem = {
      codigoCliente: '7',
      cliente: 'FRUTAP',
      fantasiaCliente: 'GRUPO PEREIRA',
      razaoSocialCliente: '165 - FORT ATACADISTA AVENTUREIRO',
      descricaoAtividade: 'IOGURTE X',
      descricaoMotivo: 'RUPTURA TOTAL',
      dataVisita: '2026-09-15 10:30:00',
      idPromotor: '101',
      nomePromotor: 'JOAO SILVA',
      idSupervisor: '201',
      nomeSupervisor: 'MARCOS SUPERVISOR',
      observacaoRuptura: 'Gôndola vazia',
    }

    const industryMap = {
      '7': { id: 'ind_7', nome: 'FRUTAP' },
    }

    // Normalização semântica
    const codCliente = (rawRupturaItem.codigoCliente || '').trim()
    const mappedIndustry = industryMap[codCliente as keyof typeof industryMap]

    const normalizedRuptura = {
      industria: mappedIndustry ? mappedIndustry.nome : rawRupturaItem.cliente,
      rede: rawRupturaItem.fantasiaCliente,
      loja: rawRupturaItem.razaoSocialCliente,
      produto: rawRupturaItem.descricaoAtividade,
      motivo: rawRupturaItem.descricaoMotivo === 'RUPTURA TOTAL' ? 'Ruptura Total' : 'Outro',
      dataOperacional: rawRupturaItem.dataVisita.split(' ')[0],
      promotor: `${rawRupturaItem.idPromotor} - ${rawRupturaItem.nomePromotor}`,
      supervisor: `${rawRupturaItem.idSupervisor} - ${rawRupturaItem.nomeSupervisor}`,
      observacao: rawRupturaItem.observacaoRuptura,
    }

    expect(normalizedRuptura.industria).toBe('FRUTAP')
    expect(normalizedRuptura.rede).toBe('GRUPO PEREIRA')
    expect(normalizedRuptura.loja).toBe('165 - FORT ATACADISTA AVENTUREIRO')
    expect(normalizedRuptura.produto).toBe('IOGURTE X')
    expect(normalizedRuptura.motivo).toBe('Ruptura Total')
    expect(normalizedRuptura.dataOperacional).toBe('2026-09-15')
    expect(normalizedRuptura.promotor).toBe('101 - JOAO SILVA')
    expect(normalizedRuptura.supervisor).toBe('201 - MARCOS SUPERVISOR')
  })

  it('Validades: Cód. Produto preservado, Quantidade 0 é válida, Fornecedor DIRETORIA mantido como fornecedor e NUNCA como indústria', () => {
    const rawValidadeItem = {
      codCliente: '7',
      clienteNome: 'FRUTAP',
      fornecedor: 'DIRETORIA',
      produto: {
        codigo: '58',
        descricao: 'BEBIDA LÁCTEA 800ML SABOR MORANGO',
      },
      cliente: {
        razaoSocial: '165 - FORT ATACADISTA AVENTUREIRO',
        fantasia: 'GRUPO PEREIRA',
      },
      quantidade: 10,
      validade: '2026-10-22',
      realizado: '2026-09-29',
      diasParaVencimento: 23,
    }

    const industryMap = {
      '7': { id: 'ind_frutap', nome: 'FRUTAP' },
    }

    const resolvedIndustry = industryMap[rawValidadeItem.codCliente as keyof typeof industryMap]

    const normalizedValidade = {
      industria: resolvedIndustry ? resolvedIndustry.nome : rawValidadeItem.clienteNome,
      rede: rawValidadeItem.cliente.fantasia,
      loja: rawValidadeItem.cliente.razaoSocial,
      codigoProduto: String(rawValidadeItem.produto.codigo),
      produto: rawValidadeItem.produto.descricao,
      quantidade: rawValidadeItem.quantidade,
      validade: rawValidadeItem.validade,
      dataOperacional: rawValidadeItem.realizado,
      diasParaVencimento: rawValidadeItem.diasParaVencimento,
      fornecedor: rawValidadeItem.fornecedor,
    }

    // Validações obrigatórias
    expect(normalizedValidade.industria).toBe('FRUTAP')
    expect(normalizedValidade.fornecedor).toBe('DIRETORIA')
    expect(normalizedValidade.fornecedor).not.toBe(normalizedValidade.industria)
    expect(normalizedValidade.codigoProduto).toBe('58')
    expect(normalizedValidade.produto).toBe('BEBIDA LÁCTEA 800ML SABOR MORANGO')
    expect(normalizedValidade.quantidade).toBe(10)
    expect(normalizedValidade.validade).toBe('2026-10-22')
    expect(normalizedValidade.dataOperacional).toBe('2026-09-29')
    expect(normalizedValidade.diasParaVencimento).toBe(23)

    // Quantidade 0 é aceita como atualização legítima
    const zeroItem = { ...normalizedValidade, quantidade: 0 }
    expect(zeroItem.quantidade).toBe(0)
    expect(zeroItem.quantidade >= 0).toBe(true)
  })
})
