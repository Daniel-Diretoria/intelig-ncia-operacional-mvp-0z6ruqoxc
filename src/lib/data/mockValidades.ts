import type { ValidadeItem } from '@/types'
import { classificarCriticidade } from './criticidade'

/**
 * Mock de dados de validades realista para supermercado/varejo.
 *
 * Os registros são gerados de forma determinística (PRNG simples) para que a
 * tela seja estável entre refreshes e os testes sejam reproduzíveis. Os campos
 * de varejo (cliente, indústria, rede, loja, cidade, promotor, supervisor)
 * cobrem múltiplas combinações para suportar filtros combináveis e drill-down.
 */

interface DimCliente {
  nome: string
  redes: string[]
}
interface DimLoja {
  nome: string
  cidade: string
  uf: string
  rede: string
}
interface DimProduto {
  nome: string
  sku: string
  categoria: ValidadeItem['category']
  industria: string
  unidade: string
  preco: number
}

const CLIENTES: DimCliente[] = [
  { nome: 'Supermercados Bom Preço', redes: ['Bom Preço', 'Bom Preço Express'] },
  { nome: 'Rede Compre Mais', redes: ['Compre Mais', 'Compre Mais Max'] },
  { nome: 'Grupo Mercalejo', redes: ['Mercalejo', 'Mercalejo Max'] },
  { nome: 'Atacadão Santa Helena', redes: ['Atacadão Santa Helena'] },
  { nome: 'SuperCenter Tocantins', redes: ['SuperCenter Tocantins', 'Tocantins Mini'] },
]

const CIDADES: { cidade: string; uf: string }[] = [
  { cidade: 'São Paulo', uf: 'SP' },
  { cidade: 'Guarulhos', uf: 'SP' },
  { cidade: 'Campinas', uf: 'SP' },
  { cidade: 'Rio de Janeiro', uf: 'RJ' },
  { cidade: 'Belo Horizonte', uf: 'MG' },
  { cidade: 'Curitiba', uf: 'PR' },
  { cidade: 'Goiânia', uf: 'GO' },
  { cidade: 'Brasília', uf: 'DF' },
  { cidade: 'Salvador', uf: 'BA' },
  { cidade: 'Recife', uf: 'PE' },
]

const LOJAS: DimLoja[] = [
  { nome: 'Loja 001 - Centro', cidade: 'São Paulo', uf: 'SP', rede: 'Bom Preço' },
  { nome: 'Loja 002 - Zona Norte', cidade: 'São Paulo', uf: 'SP', rede: 'Bom Preço' },
  { nome: 'Loja 003 - Guarulhos', cidade: 'Guarulhos', uf: 'SP', rede: 'Bom Preço Express' },
  { nome: 'Loja 010 - Campinas', cidade: 'Campinas', uf: 'SP', rede: 'Compre Mais' },
  { nome: 'Loja 011 - Rio Centro', cidade: 'Rio de Janeiro', uf: 'RJ', rede: 'Compre Mais Max' },
  { nome: 'Loja 020 - BH Savassi', cidade: 'Belo Horizonte', uf: 'MG', rede: 'Mercalejo' },
  { nome: 'Loja 021 - BH Barro Preto', cidade: 'Belo Horizonte', uf: 'MG', rede: 'Mercalejo Max' },
  { nome: 'Loja 030 - Curitiba', cidade: 'Curitiba', uf: 'PR', rede: 'Atacadão Santa Helena' },
  { nome: 'Loja 031 - Goiânia', cidade: 'Goiânia', uf: 'GO', rede: 'Atacadão Santa Helena' },
  { nome: 'Loja 040 - Brasília', cidade: 'Brasília', uf: 'DF', rede: 'SuperCenter Tocantins' },
  { nome: 'Loja 041 - Salvador', cidade: 'Salvador', uf: 'BA', rede: 'Tocantins Mini' },
  { nome: 'Loja 042 - Recife', cidade: 'Recife', uf: 'PE', rede: 'SuperCenter Tocantins' },
]

const PRODUTOS: DimProduto[] = [
  {
    nome: 'Molho de Tomate Tradicional 340g',
    sku: 'MER-0921',
    categoria: 'Mercearia',
    industria: 'Quero Alimentos',
    unidade: 'UN',
    preco: 4.49,
  },
  {
    nome: 'Iogurte Natural 170g',
    sku: 'LAT-3312',
    categoria: 'Laticínios',
    industria: 'Nestlé',
    unidade: 'UN',
    preco: 3.29,
  },
  {
    nome: 'Leite Integral 1L',
    sku: 'LAT-1044',
    categoria: 'Laticínios',
    industria: 'Itambé',
    unidade: 'CX',
    preco: 5.79,
  },
  {
    nome: 'Manteiga com Sal 200g',
    sku: 'LAT-2201',
    categoria: 'Laticínios',
    industria: 'Vigor',
    unidade: 'UN',
    preco: 9.9,
  },
  {
    nome: 'Biscoito Cream Cracker 400g',
    sku: 'MER-4419',
    categoria: 'Mercearia',
    industria: 'M. Dias Branco',
    unidade: 'PCT',
    preco: 7.5,
  },
  {
    nome: 'Cerveja Pilsen 350ml',
    sku: 'BEB-8802',
    categoria: 'Bebidas',
    industria: 'Ambev',
    unidade: 'FD',
    preco: 3.19,
  },
  {
    nome: 'Refrigerante Cola 2L',
    sku: 'BEB-1190',
    categoria: 'Bebidas',
    industria: 'Coca-Cola',
    unidade: 'FD',
    preco: 8.99,
  },
  {
    nome: 'Arroz Tipo 1 5kg',
    sku: 'MER-7701',
    categoria: 'Mercearia',
    industria: 'Tio João',
    unidade: 'FD',
    preco: 28.9,
  },
  {
    nome: 'Feijão Carioca 1kg',
    sku: 'MER-7702',
    categoria: 'Mercearia',
    industria: 'Camil',
    unidade: 'FD',
    preco: 8.49,
  },
  {
    nome: 'Óleo de Soja 900ml',
    sku: 'MER-5520',
    categoria: 'Mercearia',
    industria: 'Bunge',
    unidade: 'CX',
    preco: 9.79,
  },
  {
    nome: 'Café Torrado 500g',
    sku: 'MER-3390',
    categoria: 'Mercearia',
    industria: 'Melitta',
    unidade: 'CX',
    preco: 19.9,
  },
  {
    nome: 'Sabão em Pó 1kg',
    sku: 'LIM-9912',
    categoria: 'Limpeza',
    industria: 'Unilever',
    unidade: 'CX',
    preco: 12.9,
  },
  {
    nome: 'Detergente Líquido 500ml',
    sku: 'LIM-8831',
    categoria: 'Limpeza',
    industria: 'Ypê',
    unidade: 'CX',
    preco: 2.79,
  },
  {
    nome: 'Creme Dental 90g',
    sku: 'HIG-6610',
    categoria: 'Higiene',
    industria: 'Colgate',
    unidade: 'CX',
    preco: 4.99,
  },
  {
    nome: 'Queijo Muçarela Fatiado 200g',
    sku: 'LAT-8890',
    categoria: 'Laticínios',
    industria: 'Piracanjuba',
    unidade: 'PCT',
    preco: 12.49,
  },
  {
    nome: 'Requeijão Cremoso 200g',
    sku: 'LAT-5521',
    categoria: 'Laticínios',
    industria: 'Catupiry',
    unidade: 'UN',
    preco: 8.79,
  },
  {
    nome: 'Suco de Uva Integral 1L',
    sku: 'BEB-4423',
    categoria: 'Bebidas',
    industria: 'Aurora',
    unidade: 'UN',
    preco: 15.9,
  },
  {
    nome: 'Macarrão Espaguete 500g',
    sku: 'MER-1002',
    categoria: 'Mercearia',
    industria: 'M. Dias Branco',
    unidade: 'PCT',
    preco: 3.99,
  },
  {
    nome: 'Achocolatado em Pó 400g',
    sku: 'MER-6678',
    categoria: 'Mercearia',
    industria: 'Nestlé',
    unidade: 'CX',
    preco: 14.49,
  },
  {
    nome: 'Amaciante Concentrado 2L',
    sku: 'LIM-7714',
    categoria: 'Limpeza',
    industria: 'Downy',
    unidade: 'UN',
    preco: 22.9,
  },
  {
    nome: 'Shampoo Neutro 400ml',
    sku: 'HIG-7708',
    categoria: 'Higiene',
    industria: 'Seda',
    unidade: 'UN',
    preco: 13.49,
  },
  {
    nome: 'Papel Higiênico Folha Dupla 12un',
    sku: 'HIG-3310',
    categoria: 'Higiene',
    industria: 'Personal',
    unidade: 'PCT',
    preco: 18.9,
  },
  {
    nome: 'Água Mineral Sem Gás 1.5L',
    sku: 'BEB-9001',
    categoria: 'Bebidas',
    industria: 'Crystal',
    unidade: 'FD',
    preco: 4.29,
  },
  {
    nome: 'Mistura para Bolo Baunilha 500g',
    sku: 'MER-2245',
    categoria: 'Mercearia',
    industria: 'Donna Benta',
    unidade: 'CX',
    preco: 8.99,
  },
]

const PROMOTORES = [
  'Ana Souza',
  'Bruno Lima',
  'Carla Mendes',
  'Diego Ramos',
  'Elaine Costa',
  'Felipe Araújo',
  'Gabriela Rocha',
  'Henrique Dias',
]

const SUPERVISORES = ['Marcos Oliveira', 'Patrícia Nunes', 'Rafael Teixeira']

// PRNG determinístico (mulberry32) — sem dependência externa, saída estável.
function mulberry32(seed: number) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)]
}

function pickLojaForCliente(rng: () => number, cliente: DimCliente): DimLoja {
  // Casamos lojas cuja rede pertença ao cliente; se não houver, usa qualquer loja.
  const possiveis = LOJAS.filter((l) => cliente.redes.includes(l.rede))
  return possiveis.length > 0 ? pick(rng, possiveis) : pick(rng, LOJAS)
}

/** Data de referência para o cálculo de "dias restantes" no mock. */
const REF_DATE = new Date('2025-05-12T00:00:00Z')

/**
 * Gera o dataset determinístico de validades. A distribuição de dias restantes
 * é enviesada para garantir boa cobertura de todas as faixas de criticidade.
 */
function gerarValidades(): ValidadeItem[] {
  const rng = mulberry32(20250512)
  const items: ValidadeItem[] = []
  const TOTAL = 96

  // Distribuição aproximada de dias restantes para garantir representatividade:
  // 30% crítico (<=7), 20% atenção (8-15), 20% moderado (16-30), 30% ok (>30).
  const janelas: Array<[number, number]> = [
    [-6, 7],
    [-6, 7],
    [-6, 7],
    [8, 15],
    [8, 15],
    [16, 30],
    [16, 30],
    [31, 120],
    [31, 120],
  ]

  for (let i = 0; i < TOTAL; i++) {
    const cliente = pick(rng, CLIENTES)
    const loja = pickLojaForCliente(rng, cliente)
    const produto = pick(rng, PRODUTOS)
    const [min, max] = pick(rng, janelas)
    const diasRestantes = Math.round(min + rng() * (max - min))
    const validadeDate = new Date(REF_DATE)
    validadeDate.setUTCDate(validadeDate.getUTCDate() + diasRestantes)
    const validade = validadeDate.toISOString().slice(0, 10)

    const quantidade = Math.round(8 + rng() * 240)
    const estoque = Math.max(quantidade, Math.round(20 + rng() * 380))
    const lote = `LT${2024 + Math.floor(rng() * 2)}-${String.fromCharCode(65 + Math.floor(rng() * 26))}${Math.floor(rng() * 9)}`

    const ultimaDate = new Date(REF_DATE)
    ultimaDate.setUTCHours(Math.floor(rng() * 24), Math.floor(rng() * 60), 0, 0)
    ultimaDate.setUTCDate(ultimaDate.getUTCDate() - Math.floor(rng() * 14))
    const ultimaAtualizacao = ultimaDate.toISOString()

    // status operacional (faixas TradePro) — Vencido/Crítico/Atenção/Moderado/Normal
    let status: ValidadeItem['status']
    if (diasRestantes <= 0) status = 'Vencido'
    else if (diasRestantes <= 15) status = 'Crítico'
    else if (diasRestantes <= 25) status = 'Atenção'
    else if (diasRestantes <= 35) status = 'Moderado'
    else status = 'Normal'

    items.push({
      id: `val-${String(i + 1).padStart(3, '0')}`,
      product: produto.nome,
      sku: produto.sku,
      lote,
      category: produto.categoria,
      validade,
      diasRestantes,
      status,
      unidade: produto.unidade,
      estoque,
      cliente: cliente.nome,
      industria: produto.industria,
      rede: loja.rede,
      loja: `${loja.nome} (${loja.cidade}/${loja.uf})`,
      cidade: loja.cidade,
      uf: loja.uf,
      promotor: pick(rng, PROMOTORES),
      supervisor: pick(rng, SUPERVISORES),
      quantidade,
      precoUnitario: produto.preco,
      ultimaAtualizacao,
    })
  }

  // Sanity: garante que o campo criticidade seja derivável pelo classificador.
  void classificarCriticidade

  return items.sort((a, b) => a.diasRestantes - b.diasRestantes)
}

export const MOCK_VALIDADES_VAREJO: ValidadeItem[] = gerarValidades()

/** Listas de valores distintos para popular filtros. */
export const MOCK_VALIDADES_CLIENTES = [
  ...new Set(MOCK_VALIDADES_VAREJO.map((v) => v.cliente!)),
].sort()
export const MOCK_VALIDADES_INDUSTRIAS = [
  ...new Set(MOCK_VALIDADES_VAREJO.map((v) => v.industria!)),
].sort()
export const MOCK_VALIDADES_REDES = [...new Set(MOCK_VALIDADES_VAREJO.map((v) => v.rede!))].sort()
export const MOCK_VALIDADES_LOJAS = [...new Set(MOCK_VALIDADES_VAREJO.map((v) => v.loja!))].sort()
export const MOCK_VALIDADES_CIDADES = [
  ...new Set(MOCK_VALIDADES_VAREJO.map((v) => v.cidade!)),
].sort()
export const MOCK_VALIDADES_PRODUTOS = [
  ...new Set(MOCK_VALIDADES_VAREJO.map((v) => v.product)),
].sort()
export const MOCK_VALIDADES_PROMOTORES = [
  ...new Set(MOCK_VALIDADES_VAREJO.map((v) => v.promotor!)),
].sort()
export const MOCK_VALIDADES_SUPERVISORES = [
  ...new Set(MOCK_VALIDADES_VAREJO.map((v) => v.supervisor!)),
].sort()
