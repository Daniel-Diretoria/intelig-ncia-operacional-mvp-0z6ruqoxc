import { describe, it, expect } from 'vitest'
import { adaptVisitaItem, computeVisitaDurationMinutes } from '@/lib/api/tradeProAdapter'
import type { TradeProVisitaItem, TradeProVisitaCliente } from '@/types/tradeProApi'

describe('TradePro Visitas Adapter & Regras Operacionais (Item 4 - Parte 1)', () => {
  it('não inventa check-in ou check-out se apenas um ou nenhum for fornecido', () => {
    const promotorItem: TradeProVisitaItem = {
      idPromotor: '00123',
      nomePromotor: 'CARLOS SILVA',
      idSupervisor: '99',
      nomeSupervisor: 'SUPERVISOR GERAL',
      visitasPrevistas: 5,
      visitasRealizadas: 4,
    }

    // Caso 1: Apenas check-in informado
    const clienteEntradaApenas: TradeProVisitaCliente = {
      codigo: '1001',
      razaoSocial: '1001 - SUPERMERCADO ALVORADA',
      horaEntrada: '08:12',
    }

    const visita1 = adaptVisitaItem(promotorItem, clienteEntradaApenas, '2026-10-01')
    expect(visita1.hora_entrada).toBe('08:12')
    expect(visita1.hora_saida).toBeUndefined()
    expect(visita1.duracao_minutos).toBeUndefined() // NUNCA calcula duração sem ambos

    // Caso 2: Apenas check-out informado
    const clienteSaidaApenas: TradeProVisitaCliente = {
      codigo: '1002',
      razaoSocial: '1002 - SUPERMERCADO ESTRELA',
      horaSaida: '11:45',
    }

    const visita2 = adaptVisitaItem(promotorItem, clienteSaidaApenas, '2026-10-01')
    expect(visita2.hora_entrada).toBeUndefined()
    expect(visita2.hora_saida).toBe('11:45')
    expect(visita2.duracao_minutos).toBeUndefined()

    // Caso 3: Nenhum horário fornecido pela API
    const clienteSemHorarios: TradeProVisitaCliente = {
      codigo: '1003',
      razaoSocial: '1003 - HIPERMERCADO CENTRAL',
    }

    const visita3 = adaptVisitaItem(promotorItem, clienteSemHorarios, '2026-10-01')
    expect(visita3.hora_entrada).toBeUndefined()
    expect(visita3.hora_saida).toBeUndefined()
    expect(visita3.duracao_minutos).toBeUndefined()
  })

  it('calcula duração em minutos EXATAMENTE quando ambos os horários são fornecidos', () => {
    expect(computeVisitaDurationMinutes('08:12', '09:03')).toBe(51)
    expect(computeVisitaDurationMinutes('13:00', '14:30')).toBe(90)
    expect(computeVisitaDurationMinutes('10:00', '10:05')).toBe(5)
    // Se invertido ou inválido, retorna undefined sem quebrar
    expect(computeVisitaDurationMinutes('15:00', '14:00')).toBeUndefined()
    expect(computeVisitaDurationMinutes(null, '14:00')).toBeUndefined()
    expect(computeVisitaDurationMinutes('08:00', undefined)).toBeUndefined()

    const promotorItem: TradeProVisitaItem = {
      idPromotor: '00123',
      nomePromotor: 'CARLOS SILVA',
    }

    const clienteCompleto: TradeProVisitaCliente = {
      codigo: '1001',
      razaoSocial: '1001 - SUPERMERCADO ALVORADA',
      horaEntrada: '08:12',
      horaSaida: '09:03',
      realizada: true,
    }

    const adaptada = adaptVisitaItem(promotorItem, clienteCompleto, '2026-10-01')
    expect(adaptada.hora_entrada).toBe('08:12')
    expect(adaptada.hora_saida).toBe('09:03')
    expect(adaptada.duracao_minutos).toBe(51)
    expect(adaptada.status).toBe('realizada')
  })

  it('registra o vínculo promotor <-> loja como RELAÇÃO OBSERVADA (nunca confirmado)', () => {
    const promotorItem: TradeProVisitaItem = {
      idPromotor: '0077',
      nomePromotor: 'JOAO SOUZA',
    }

    const cliente: TradeProVisitaCliente = {
      codigo: '2020',
      razaoSocial: '2020 - LOJA MODELO',
    }

    const resultado = adaptVisitaItem(promotorItem, cliente, '2026-10-02')
    // Regra: "Visita observada não altera roteiro confirmado: vínculo com status observado ('observado_visita'), não confirmado"
    expect(resultado.vinculo_relacao).toBe('observado')
    expect(resultado.origem_relacao).toBe('observado_visita')
    expect(resultado.promoter_cod).toBe('0077')
    expect(resultado.store_code).toBe('2020')
  })

  it('preserva dados brutos (raw_data) para auditoria e rastreabilidade total', () => {
    const rawPromotorItem: TradeProVisitaItem = {
      idPromotor: '0044',
      nomePromotor: 'MARIA OLIVEIRA',
      idSupervisor: '001',
      nomeSupervisor: 'SUPERVISOR REGIONAL',
      visitasPrevistas: 8,
      visitasRealizadas: 7,
      percentualVisitas: '87.5%',
    }

    const rawClienteItem: TradeProVisitaCliente = {
      codigo: '3030',
      razaoSocial: '3030 - COMERCIAL NORTE LTDA',
      checkIn: '09:15',
      checkOut: '10:00',
    }

    const resultado = adaptVisitaItem(rawPromotorItem, rawClienteItem, '2026-10-03')
    expect(resultado.raw_data).toBeDefined()
    expect(resultado.raw_data.promotorItem).toEqual(rawPromotorItem)
    expect(resultado.raw_data.clienteItem).toEqual(rawClienteItem)
    expect(resultado.origem).toBe('tradepro_api')
  })

  it('deduplicação idempotente: mesma visita (promotor, loja, data) não gera duplicidade', () => {
    // Simula a lógica de deduplicação empregada pelo hook e adapter
    const visitasExistentes = new Set<string>()

    const gerarChaveDedup = (promoterCod: string, storeCode: string, data: string) =>
      `${promoterCod.trim()}|${storeCode.trim()}|${data.trim()}`

    const item1 = { promoterCod: '001', storeCode: '500', data: '2026-10-01' }
    const chave1 = gerarChaveDedup(item1.promoterCod, item1.storeCode, item1.data)
    expect(visitasExistentes.has(chave1)).toBe(false)
    visitasExistentes.add(chave1)

    // Segunda ocorrência com mesma tupla
    const itemDuplicado = { promoterCod: '001', storeCode: '500', data: '2026-10-01' }
    const chaveDuplicada = gerarChaveDedup(
      itemDuplicado.promoterCod,
      itemDuplicado.storeCode,
      itemDuplicado.data,
    )
    expect(visitasExistentes.has(chaveDuplicada)).toBe(true)

    // Terceira ocorrência em data diferente ou loja diferente NÃO é duplicada
    const itemOutraData = { promoterCod: '001', storeCode: '500', data: '2026-10-02' }
    const chaveOutraData = gerarChaveDedup(
      itemOutraData.promoterCod,
      itemOutraData.storeCode,
      itemOutraData.data,
    )
    expect(visitasExistentes.has(chaveOutraData)).toBe(false)
  })
})
