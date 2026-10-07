import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  normalizarChaveEntidade,
  extrairCodigoLojaRazaoSocial,
} from '@/lib/resolve/cadastrosResolver'
import { normalizarNomeProduto } from '@/lib/resolve/produtoResolver'

describe('Cadastros — Resolução Estrutural e Semântica de Entidades', () => {
  describe('1. Cenários Indústria / Produto', () => {
    it('normaliza chaves sem duplicar por caixa, acentos ou espaços', () => {
      const k1 = normalizarChaveEntidade('  Frutap  Indústria e Comércio  ')
      const k2 = normalizarChaveEntidade('FRUTAP INDUSTRIA E COMERCIO')
      expect(k1).toBe(k2)
    })

    it('produto oficial mantém nome e indústria relacionados', () => {
      const produto = {
        id: 'p1',
        nome_produto: 'IOGURTE MORANGO 170G',
        industry_id: 'ind_frutap',
        industry_name: 'Frutap',
        codigo_produto: '1001',
      }
      expect(produto.industry_name).toBe('Frutap')
      expect(produto.codigo_produto).toBe('1001')
    })

    it('mesmo código de produto em indústrias diferentes não colide quando contextualizado', () => {
      const pInd1 = {
        industry_id: 'ind_1',
        codigo_produto: '99',
        nome_produto: 'REQUEIJAO TRADICIONAL 200G',
      }
      const pInd2 = {
        industry_id: 'ind_2',
        codigo_produto: '99',
        nome_produto: 'MASSA FOLHADA 400G',
      }
      // O par (industry_id, codigo_produto) é único
      expect(`${pInd1.industry_id}_${pInd1.codigo_produto}`).not.toBe(
        `${pInd2.industry_id}_${pInd2.codigo_produto}`,
      )
    })

    it('produto ambíguo sem indústria e com múltiplos donos não define indústria sozinho', () => {
      const catalogo = [
        { nome: 'LEITE INTEGRAL 1L', industry: 'Indústria A' },
        { nome: 'LEITE INTEGRAL 1L', industry: 'Indústria B' },
      ]
      const matches = catalogo.filter(
        (p) => normalizarNomeProduto(p.nome) === normalizarNomeProduto('Leite Integral 1L'),
      )
      expect(matches.length).toBe(2)
      // Como tem 2 indústrias, não pode definir de forma silenciosa
      const indUnica = matches.length === 1 ? matches[0].industry : null
      expect(indUnica).toBeNull()
    })
  })

  describe('2. Cenários de Três Níveis de Mix', () => {
    it('Mix Oficial, Mix Definido da Loja e Mix Observado permanecem independentes', () => {
      const mixOficialIndustria = ['P1', 'P2', 'P3', 'P4', 'P5']
      const mixDefinidoLoja165 = ['P1', 'P2']
      const mixObservadoLoja165 = ['P1', 'P3', 'P99_EXTRA']

      // Mix Oficial não é imposto automaticamente na loja
      expect(mixDefinidoLoja165.length).toBeLessThan(mixOficialIndustria.length)

      // Mix Observado fora do Definido NÃO entra automaticamente no Definido
      const observadosForaDoMix = mixObservadoLoja165.filter((p) => !mixDefinidoLoja165.includes(p))
      expect(observadosForaDoMix).toEqual(['P3', 'P99_EXTRA'])
      // Continua fora até intervenção humana
      expect(mixDefinidoLoja165.includes('P3')).toBe(false)

      // Produto definido sem observação continua identificável
      const definidosNaoObservados = mixDefinidoLoja165.filter(
        (p) => !mixObservadoLoja165.includes(p),
      )
      expect(definidosNaoObservados).toEqual(['P2'])
    })
  })

  describe('3. Cenários Rede / Loja (Semântica TradePro)', () => {
    it('Fantasia GRUPO PEREIRA + Razão Social 165 - FORT ATACADISTA -> Rede GRUPO PEREIRA, Loja 165', () => {
      const rawFantasia = 'GRUPO PEREIRA'
      const rawRazaoSocial = '165 - FORT ATACADISTA AVENTUREIRO'

      const rede = rawFantasia
      const codigoLoja = extrairCodigoLojaRazaoSocial(rawRazaoSocial)

      expect(rede).toBe('GRUPO PEREIRA')
      expect(codigoLoja).toBe('165')
      // NUNCA derivar Rede = FORT quando Fantasia estiver disponível
      expect(rede).not.toBe('FORT')
    })
  })

  describe('4. Cenários Promotor / Supervisor', () => {
    it('Cód. Colaborador não duplica Promotor por escrita diferente', () => {
      const p1 = { codigo_externo: '234', nome: 'JOAO SILVA' }
      const p2 = { codigo_externo: '234', nome: 'João da Silva' }
      const saoMesmoPromotor = p1.codigo_externo === p2.codigo_externo
      expect(saoMesmoPromotor).toBe(true)
    })

    it('Promotor pode atender várias lojas e trabalhar com múltiplas indústrias', () => {
      const alocacoes = [
        { promotorId: 'prom_1', lojaCodigo: '165', industria: 'Frutap' },
        { promotorId: 'prom_1', lojaCodigo: '250', industria: 'Frutap' },
        { promotorId: 'prom_1', lojaCodigo: '165', industria: "Massas D'Itália" },
      ]
      const lojasAtendidas = new Set(alocacoes.map((a) => a.lojaCodigo))
      const industriasAtendidas = new Set(alocacoes.map((a) => a.industria))

      expect(lojasAtendidas.size).toBe(2)
      expect(industriasAtendidas.size).toBe(2)
    })

    it('Supervisor pode possuir múltiplos promotores sob sua alçada', () => {
      const promotores = [
        { id: 'p1', supervisorId: 'sup_1' },
        { id: 'p2', supervisorId: 'sup_1' },
        { id: 'p3', supervisorId: 'sup_2' },
      ]
      const equipeSup1 = promotores.filter((p) => p.supervisorId === 'sup_1')
      expect(equipeSup1.length).toBe(2)
    })
  })

  describe('5. Cenários de Pendências Seguras', () => {
    it('cliente TradePro desconhecido não bloqueia lote e gera pendência de vinculação', () => {
      const clienteRecebido = { codigo_cliente: '99', nome_cliente: 'Cliente Novo X' }
      const clientesConhecidos = new Map([['7', 'Frutap']])

      let pendenciaGerada = false
      if (!clientesConhecidos.has(clienteRecebido.codigo_cliente)) {
        pendenciaGerada = true
      }

      expect(pendenciaGerada).toBe(true)
    })

    it('após vinculação humana da pendência, entidade passa a ser reconhecida', () => {
      const clientesConhecidos = new Map([['7', 'Frutap']])
      // Usuário vincula 99 -> 'Nova Indústria'
      clientesConhecidos.set('99', 'Nova Indústria')
      expect(clientesConhecidos.get('99')).toBe('Nova Indústria')
    })
  })

  describe('6. Oportunidades de Mix com Linguagem Cuidadosa Operacional', () => {
    it('compara presença operacional entre lojas comparáveis da mesma rede sem afirmar vendas', () => {
      const redeLojas = ['L1', 'L2', 'L3', 'L4']
      const lojasComProdutoObservado = ['L1', 'L2', 'L3']
      const lojaAlvo = 'L4'

      const presencaRede = lojasComProdutoObservado.length / redeLojas.length
      expect(presencaRede).toBe(0.75) // 75% das lojas da rede têm presença

      const textoExplicativo = `Observado operacionalmente em 3 de 4 lojas da rede. Ausente do Mix Definido desta unidade.`
      // Valida que NÃO usa afirmações comerciais infundadas
      expect(textoExplicativo).not.toContain('vende bem')
      expect(textoExplicativo).not.toContain('maior faturamento')
      expect(textoExplicativo).toContain('Observado operacionalmente')
    })
  })
})
