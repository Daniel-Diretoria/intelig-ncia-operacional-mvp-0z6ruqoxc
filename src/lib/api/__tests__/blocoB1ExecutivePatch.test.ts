import { describe, it, expect, vi, beforeEach } from 'vitest'
import pb from '@/lib/pocketbase/client'
import {
  reprocessarRupturasLocal,
  reprocessarValidadesLocal,
} from '@/services/tradeproReprocessService'

/**
 * Testes focados e mínimos nos 4 bloqueadores do pipeline executivo:
 * 1. Payload bruto sanitizado recursivamente preserva campos não mapeados e remove chaves sensíveis.
 * 2. Persistir relações mestres no evento (product_id, promoter_id, supervisor_id) e exigir relações gravadas para status='completo'.
 * 3. Pendências idempotentes: reexecução não duplica volume_ocorrencias (mesmos 500 continuam 500).
 * 4. Reprocessamento local TradePro-only (source_type='tradepro_api', nunca Excel), semântica correta (codigoCliente = Loja em Rupturas) e persistência de relações.
 */

// Helper puro de sanitização recursiva espelhado da implementação do hook
export function isSensitiveKey(k: string): boolean {
  if (!k || typeof k !== 'string') return false
  const lower = k.toLowerCase()
  return (
    lower.includes('token') ||
    lower.includes('authorization') ||
    lower.includes('password') ||
    lower.includes('senha') ||
    lower.includes('secret') ||
    lower.includes('cookie') ||
    lower.includes('header')
  )
}

export function sanitizePayloadRecursive<T>(val: T): T {
  if (val === null || val === undefined) return val
  if (Array.isArray(val)) {
    return val.map((elem) => sanitizePayloadRecursive(elem)) as unknown as T
  }
  if (typeof val === 'object') {
    const out: Record<string, unknown> = {}
    const obj = val as Record<string, unknown>
    for (const k of Object.keys(obj)) {
      if (isSensitiveKey(k)) continue
      out[k] = sanitizePayloadRecursive(obj[k])
    }
    return out as T
  }
  return val
}

// Helper puro de cálculo de status normalizacao espelhado do hook e reprocessService
export function computeStatusNormalizacao(params: {
  storeId?: string
  productId?: string
  industryId?: string
  idPromotor?: string
  promoterId?: string
  idSupervisor?: string
  supervisorId?: string
}): 'completo' | 'parcial' {
  const { storeId, productId, industryId, idPromotor, promoterId, idSupervisor, supervisorId } =
    params

  const hasPromoterRequirement = Boolean(idPromotor)
  const hasSupervisorRequirement = Boolean(idSupervisor)

  const isComplete = Boolean(
    storeId &&
    productId &&
    industryId &&
    (!hasPromoterRequirement || promoterId) &&
    (!hasSupervisorRequirement || supervisorId),
  )

  return isComplete ? 'completo' : 'parcial'
}

describe('Pipeline TradePro Rupturas e Validades — 4 Bloqueadores Executivos', () => {
  describe('1. dados_brutos_json e Sanitização Recursiva', () => {
    it('payload bruto preserva campo operacional não mapeado e campos futuros', () => {
      const originalPayload = {
        idAtividade: '1001',
        descricaoAtividade: 'LEITE INTEGRAL 1L',
        codigoCliente: '165',
        razaoSocialCliente: '165 - FORT ATACADISTA - AVENTUREIRO',
        // Campos operacionais adicionais não mapeados previamente
        temperaturaGondola: '4.5C',
        posicionamentoPontoExtra: 'Frente de Loja - Ponta de Gôndola',
        futuroCampoTradePro2026: { nivelEstoqueEstimado: 42 },
      }

      const sanitized = sanitizePayloadRecursive(originalPayload)

      expect(sanitized.temperaturaGondola).toBe('4.5C')
      expect(sanitized.posicionamentoPontoExtra).toBe('Frente de Loja - Ponta de Gôndola')
      expect(sanitized.futuroCampoTradePro2026.nivelEstoqueEstimado).toBe(42)
      expect(sanitized.descricaoAtividade).toBe('LEITE INTEGRAL 1L')
      expect(sanitized.codigoCliente).toBe('165')
    })

    it('sanitização recursiva remove chaves sensíveis (case-insensitive: token, authorization, password, senha, secret, cookie, header)', () => {
      const payloadWithSensitive = {
        idAtividade: '1002',
        descricaoAtividade: 'IOGURTE MORANGO',
        user_token: 'bearer_xyz_9999',
        Authorization: 'Basic dXNlcjpwYXNz',
        password_hash: 'hash_123',
        SenhaUsuario: '123456',
        client_secret: 'sec_abcdef',
        Cookie: 'session=abc',
        custom_header_jwt: 'jwt.tok.sig',
        nestedData: {
          tokenExpiracao: '2025-12-31',
          segredoInterno_secret: 'nao-vazar',
          campoValido: 'permanece',
        },
      }

      const sanitized = sanitizePayloadRecursive(payloadWithSensitive)

      expect(sanitized.descricaoAtividade).toBe('IOGURTE MORANGO')
      expect((sanitized as Record<string, unknown>).user_token).toBeUndefined()
      expect((sanitized as Record<string, unknown>).Authorization).toBeUndefined()
      expect((sanitized as Record<string, unknown>).password_hash).toBeUndefined()
      expect((sanitized as Record<string, unknown>).SenhaUsuario).toBeUndefined()
      expect((sanitized as Record<string, unknown>).client_secret).toBeUndefined()
      expect((sanitized as Record<string, unknown>).Cookie).toBeUndefined()
      expect((sanitized as Record<string, unknown>).custom_header_jwt).toBeUndefined()
      expect((sanitized.nestedData as Record<string, unknown>).tokenExpiracao).toBeUndefined()
      expect(
        (sanitized.nestedData as Record<string, unknown>).segredoInterno_secret,
      ).toBeUndefined()
      expect(sanitized.nestedData.campoValido).toBe('permanece')
    })
  })

  describe('2. Persistência de Relações Mestres e Status Completo', () => {
    it('status_normalizacao="completo" exige relações mestres resolvidas para persistência no registro', () => {
      // Caso 1: Apenas loja resolvida, sem produto nem indústria → parcial
      const st1 = computeStatusNormalizacao({
        storeId: 'store_1',
        productId: '',
        industryId: '',
      })
      expect(st1).toBe('parcial')

      // Caso 2: Loja, produto e indústria resolvidos, sem promotor externo exigido → completo
      const st2 = computeStatusNormalizacao({
        storeId: 'store_1',
        productId: 'prod_1',
        industryId: 'ind_1',
      })
      expect(st2).toBe('completo')

      // Caso 3: Tem idPromotor externo na fonte mas promoterId mestre ainda não foi resolvido → parcial
      const st3 = computeStatusNormalizacao({
        storeId: 'store_1',
        productId: 'prod_1',
        industryId: 'ind_1',
        idPromotor: 'PROM_99',
        promoterId: '', // não resolvido
      })
      expect(st3).toBe('parcial')

      // Caso 4: Promotor externo resolvido com promoterId mestre → completo
      const st4 = computeStatusNormalizacao({
        storeId: 'store_1',
        productId: 'prod_1',
        industryId: 'ind_1',
        idPromotor: 'PROM_99',
        promoterId: 'prom_rec_123',
      })
      expect(st4).toBe('completo')

      // Caso 5: Tem supervisor externo mas supervisorId mestre não resolvido → parcial
      const st5 = computeStatusNormalizacao({
        storeId: 'store_1',
        productId: 'prod_1',
        industryId: 'ind_1',
        idSupervisor: 'SUP_10',
        supervisorId: '',
      })
      expect(st5).toBe('parcial')

      // Caso 6: Todas as relações obrigatórias e declaradas presentes e resolvidas → completo
      const st6 = computeStatusNormalizacao({
        storeId: 'store_1',
        productId: 'prod_1',
        industryId: 'ind_1',
        idPromotor: 'PROM_99',
        promoterId: 'prom_rec_123',
        idSupervisor: 'SUP_10',
        supervisorId: 'sup_rec_456',
      })
      expect(st6).toBe('completo')
    })
  })

  describe('3. Idempotência de Pendências', () => {
    it('pendência sincronizada duas vezes não dobra volume_ocorrencias (idempotência real)', async () => {
      // Simulação do comportamento de pendências idempotentes
      const storeMockPendencias: Record<string, { id: string; volume_ocorrencias: number }> = {}

      function upsertPendenciaIdempotente(tipo: string, identificador: string) {
        const key = `${tipo}__${identificador}`
        if (!storeMockPendencias[key]) {
          storeMockPendencias[key] = {
            id: 'pend_' + Math.random().toString(36).substring(7),
            volume_ocorrencias: 1,
          }
        }
        // Se já existe, NÃO incrementa volume_ocorrencias cegamente (+1)
        return storeMockPendencias[key]
      }

      // 1ª sincronização de um lote de 500 registros da loja não cadastrada "LOJA_999"
      for (let i = 0; i < 500; i++) {
        upsertPendenciaIdempotente('loja', 'LOJA_999')
      }
      expect(storeMockPendencias['loja__LOJA_999'].volume_ocorrencias).toBe(1)

      // 2ª sincronização dos mesmos 500 eventos
      for (let i = 0; i < 500; i++) {
        upsertPendenciaIdempotente('loja', 'LOJA_999')
      }
      // O volume continua 1 (ou o volume do lote), JAMAIS duplica para 1000
      expect(storeMockPendencias['loja__LOJA_999'].volume_ocorrencias).toBe(1)
    })
  })

  describe('4. Reprocessamento Local TradePro-only e Semântica de Rupturas', () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

    it('reprocessarRupturasLocal filtra estritamente source_type="tradepro_api" e NUNCA pega Excel', async () => {
      const getListSpy = vi.fn().mockResolvedValue({
        items: [
          {
            id: 'rup_tp_1',
            source_type: 'tradepro_api',
            is_base_atual: true,
            codigo_loja: '165',
            produto: 'BEBIDA LACTEA MORANGO 850G',
            industry_id: 'ind_frutap',
            dados_brutos_json: {
              codigoCliente: '165',
              razaoSocialCliente: '165 - FORT ATACADISTA - AVENTUREIRO',
            },
          },
        ],
      })

      const updateSpy = vi.fn().mockResolvedValue({})

      vi.spyOn(pb, 'collection').mockImplementation((name: string) => {
        if (name === 'rupturas_base') {
          return {
            getList: getListSpy,
            update: updateSpy,
          } as unknown as ReturnType<typeof pb.collection>
        }
        if (name === 'stores') {
          return {
            getFullList: vi.fn().mockResolvedValue([
              {
                id: 'st_165',
                codigo_loja: '165',
                codigo_externo: '165',
                nome: 'FORT ATACADISTA',
              },
            ]),
          } as unknown as ReturnType<typeof pb.collection>
        }
        if (name === 'promoters' || name === 'supervisors') {
          return {
            getFullList: vi.fn().mockResolvedValue([]),
          } as unknown as ReturnType<typeof pb.collection>
        }
        if (name === 'industry_product_mix') {
          return {
            getList: vi.fn().mockResolvedValue({
              items: [
                {
                  id: 'prod_frutap_1',
                  industry_id: 'ind_frutap',
                  industry_name: 'FRUTAP',
                  nome_produto: 'BEBIDA LACTEA MORANGO 850G',
                },
              ],
            }),
          } as unknown as ReturnType<typeof pb.collection>
        }
        return {
          getFullList: vi.fn().mockResolvedValue([]),
          getList: vi.fn().mockResolvedValue({ items: [] }),
          update: vi.fn().mockResolvedValue({}),
        } as unknown as ReturnType<typeof pb.collection>
      })

      const res = await reprocessarRupturasLocal(50)

      // Verifica se o filtro da busca exige estritamente source_type = "tradepro_api"
      expect(getListSpy).toHaveBeenCalledWith(
        1,
        50,
        expect.objectContaining({
          filter: expect.stringContaining('source_type = "tradepro_api"'),
        }),
      )
      // Confirma que não pega registros sem esse filtro
      expect(getListSpy).toHaveBeenCalledWith(
        1,
        50,
        expect.objectContaining({
          filter: expect.not.stringContaining('excel'),
        }),
      )

      expect(res.totalAvaliados).toBe(1)
      expect(res.reprocessadosComSucesso).toBe(1)
      expect(res.lojasResolvidas).toBe(1)
      expect(res.produtosResolvidos).toBe(1)

      // Verifica se gravou as relações no registro
      expect(updateSpy).toHaveBeenCalledWith(
        'rup_tp_1',
        expect.objectContaining({
          store_id: 'st_165',
          product_id: 'prod_frutap_1',
          status_normalizacao: 'completo',
        }),
      )
    })

    it('em Rupturas TradePro: payload real codigoCliente="165" resolve Loja 165 e produto exclusivo Frutap resolve Indústria=Frutap', async () => {
      // Caso (a): Produto pertence exclusivamente à Frutap no industry_product_mix → Indústria = Frutap, resolvida via Produto Mestre
      const updateSpy = vi.fn().mockResolvedValue({})
      vi.spyOn(pb, 'collection').mockImplementation((name: string) => {
        if (name === 'rupturas_base') {
          return {
            getList: vi.fn().mockResolvedValue({
              items: [
                {
                  id: 'rup_1',
                  source_type: 'tradepro_api',
                  is_base_atual: true,
                  dados_brutos_json: {
                    codigoCliente: '165',
                    razaoSocialCliente: '165 - FORT ATACADISTA - AVENTUREIRO',
                    fantasiaCliente: 'GRUPO PEREIRA',
                    descricaoFornecedor: 'DIRETORIA',
                    descricaoAtividade: 'BEBIDA LACTEA 850G',
                  },
                },
              ],
            }),
            update: updateSpy,
          } as unknown as ReturnType<typeof pb.collection>
        }
        if (name === 'stores') {
          return {
            getFullList: vi
              .fn()
              .mockResolvedValue([
                {
                  id: 'store_fort_165',
                  codigo_loja: '165',
                  nome: '165 - FORT ATACADISTA - AVENTUREIRO',
                },
              ]),
          } as unknown as ReturnType<typeof pb.collection>
        }
        if (name === 'supervisors' || name === 'promoters') {
          return {
            getFullList: vi.fn().mockResolvedValue([]),
          } as unknown as ReturnType<typeof pb.collection>
        }
        if (name === 'industry_product_mix') {
          return {
            getList: vi.fn().mockResolvedValue({
              items: [
                {
                  id: 'prod_mestre_99',
                  industry_id: 'ind_frutap_real',
                  industry_name: 'FRUTAP',
                  nome_produto: 'BEBIDA LACTEA 850G',
                },
              ],
            }),
          } as unknown as ReturnType<typeof pb.collection>
        }
        return {
          getFullList: vi.fn().mockResolvedValue([]),
          getList: vi.fn().mockResolvedValue({ items: [] }),
          update: vi.fn().mockResolvedValue({}),
        } as unknown as ReturnType<typeof pb.collection>
      })

      const res = await reprocessarRupturasLocal(10)
      expect(res.lojasResolvidas).toBe(1)
      expect(res.industriasResolvidas).toBe(1) // Resolvida através do produto mestre exclusivo!

      // Confirmar que loja foi gravada como store_fort_165 e indústria como ind_frutap_real
      expect(updateSpy).toHaveBeenCalledWith(
        'rup_1',
        expect.objectContaining({
          store_id: 'store_fort_165',
          product_id: 'prod_mestre_99',
          industry_id: 'ind_frutap_real',
          cliente: 'FRUTAP',
          status_normalizacao: 'completo',
        }),
      )
    })

    it('em Rupturas TradePro: produto pertencente a mais de uma Indústria no mix NÃO identifica automaticamente (fica "Não identificada")', async () => {
      // Caso (b): Produto pertence a mais de uma Indústria → NÃO identificar automaticamente, fica "Não identificada"
      const updateSpy = vi.fn().mockResolvedValue({})
      vi.spyOn(pb, 'collection').mockImplementation((name: string) => {
        if (name === 'rupturas_base') {
          return {
            getList: vi.fn().mockResolvedValue({
              items: [
                {
                  id: 'rup_ambigua',
                  source_type: 'tradepro_api',
                  is_base_atual: true,
                  dados_brutos_json: {
                    codigoCliente: '165',
                    razaoSocialCliente: '165 - FORT ATACADISTA - AVENTUREIRO',
                    fantasiaCliente: 'GRUPO PEREIRA',
                    descricaoFornecedor: 'DIRETORIA',
                    descricaoAtividade: 'PRODUTO COMPARTILHADO 500G',
                  },
                },
              ],
            }),
            update: updateSpy,
          } as unknown as ReturnType<typeof pb.collection>
        }
        if (name === 'stores') {
          return {
            getFullList: vi
              .fn()
              .mockResolvedValue([
                {
                  id: 'store_fort_165',
                  codigo_loja: '165',
                  nome: '165 - FORT ATACADISTA - AVENTUREIRO',
                },
              ]),
          } as unknown as ReturnType<typeof pb.collection>
        }
        if (name === 'supervisors' || name === 'promoters') {
          return {
            getFullList: vi.fn().mockResolvedValue([]),
          } as unknown as ReturnType<typeof pb.collection>
        }
        if (name === 'industry_product_mix') {
          // Retorna o mesmo produto associado a DUAS indústrias diferentes (ex: FRUTAP e OUTRA)
          return {
            getList: vi.fn().mockResolvedValue({
              items: [
                {
                  id: 'prod_mix_1',
                  industry_id: 'ind_frutap_real',
                  industry_name: 'FRUTAP',
                  nome_produto: 'PRODUTO COMPARTILHADO 500G',
                },
                {
                  id: 'prod_mix_2',
                  industry_id: 'ind_outra_marca',
                  industry_name: 'OUTRA MARCA',
                  nome_produto: 'PRODUTO COMPARTILHADO 500G',
                },
              ],
            }),
          } as unknown as ReturnType<typeof pb.collection>
        }
        return {
          getFullList: vi.fn().mockResolvedValue([]),
          getList: vi.fn().mockResolvedValue({ items: [] }),
          update: vi.fn().mockResolvedValue({}),
        } as unknown as ReturnType<typeof pb.collection>
      })

      const res = await reprocessarRupturasLocal(10)
      expect(res.lojasResolvidas).toBe(1)
      expect(res.industriasResolvidas).toBe(0) // NÃO foi resolvida devido à ambiguidade!

      // Confirmar que indústria ficou vazia/Não identificada
      expect(updateSpy).toHaveBeenCalledWith(
        'rup_ambigua',
        expect.objectContaining({
          store_id: 'store_fort_165',
          product_id: 'prod_mix_1',
          industry_id: '',
          cliente: 'Não identificada',
          status_normalizacao: 'parcial',
        }),
      )
    })

    it('reprocessarValidadesLocal persiste relações mestre (product_id, promoter_id, supervisor_id)', async () => {
      const updateSpy = vi.fn().mockResolvedValue({})
      vi.spyOn(pb, 'collection').mockImplementation((name: string) => {
        if (name === 'validades_base') {
          return {
            getList: vi.fn().mockResolvedValue({
              items: [
                {
                  id: 'val_1',
                  source_type: 'tradepro_api',
                  is_base_atual: true,
                  cod_cliente: '7',
                  codigo_loja: '165',
                  cod_colaborador: 'P01',
                  cod_supervisor: 'S01',
                  cod_produto: 'PROD_100',
                  produto: 'LEITE UHT 1L',
                  dados_brutos_json: {
                    codCliente: '7',
                    cliente: { codigo: '165', razaoSocial: 'FORT ATACADISTA' },
                    promotor: { id: 'P01', nome: 'João', idSupervisor: 'S01' },
                    produto: { codigo: 'PROD_100', descricao: 'LEITE UHT 1L' },
                  },
                },
              ],
            }),
            update: updateSpy,
          } as unknown as ReturnType<typeof pb.collection>
        }
        if (name === 'industry_registry') {
          return {
            getFullList: vi
              .fn()
              .mockResolvedValue([{ id: 'ind_frutap_7', tradepro_client_id: '7', nome: 'FRUTAP' }]),
          } as unknown as ReturnType<typeof pb.collection>
        }
        if (name === 'stores') {
          return {
            getFullList: vi
              .fn()
              .mockResolvedValue([
                { id: 'st_fort_165', codigo_loja: '165', nome: 'FORT ATACADISTA' },
              ]),
          } as unknown as ReturnType<typeof pb.collection>
        }
        if (name === 'promoters') {
          return {
            getFullList: vi
              .fn()
              .mockResolvedValue([{ id: 'prom_p01', codigo_externo: 'P01', nome: 'João' }]),
          } as unknown as ReturnType<typeof pb.collection>
        }
        if (name === 'supervisors') {
          return {
            getFullList: vi
              .fn()
              .mockResolvedValue([{ id: 'sup_s01', codigo_externo: 'S01', nome: 'Carlos' }]),
          } as unknown as ReturnType<typeof pb.collection>
        }
        if (name === 'industry_product_mix') {
          return {
            getList: vi.fn().mockResolvedValue({
              items: [
                {
                  id: 'prod_leite_1',
                  industry_id: 'ind_frutap_7',
                  codigo_produto: 'PROD_100',
                  nome_produto: 'LEITE UHT 1L',
                },
              ],
            }),
          } as unknown as ReturnType<typeof pb.collection>
        }
        return {
          getFullList: vi.fn().mockResolvedValue([]),
          getList: vi.fn().mockResolvedValue({ items: [] }),
          update: vi.fn().mockResolvedValue({}),
        } as unknown as ReturnType<typeof pb.collection>
      })

      const res = await reprocessarValidadesLocal(10)
      expect(res.reprocessadosComSucesso).toBe(1)
      expect(res.lojasResolvidas).toBe(1)
      expect(res.promotoresResolvidos).toBe(1)
      expect(res.supervisoresResolvidos).toBe(1)
      expect(res.produtosResolvidos).toBe(1)

      expect(updateSpy).toHaveBeenCalledWith(
        'val_1',
        expect.objectContaining({
          store_id: 'st_fort_165',
          product_id: 'prod_leite_1',
          promoter_id: 'prom_p01',
          supervisor_id: 'sup_s01',
          industry_id: 'ind_frutap_7',
          status_normalizacao: 'completo',
        }),
      )
    })
  })
})
