import type { ProductCategory, ValidadeItem } from '@/types'

/**
 * Camada de mapeamento de colunas — a "verdade" que o arquivo de entrada
 * (Excel, API TradePro, etc.) precisa atender para alimentar o módulo de
 * Validades.
 *
 * Esta definição é a ÚNICA fonte de verdade sobre quais campos existem, quais
 * são obrigatórios e qual o tipo esperado de cada um. A UI de importação e o
 * mapper consomem este array — nenhum nome de coluna é hardcoded na interface.
 *
 * O nome interno (`key`) corresponde a um campo de `ValidadeItem`.
 * O `aliases` traz os rótulos pt-BR mais comuns encontrados em planilhas
 * operacionais, usados para sugerir automaticamente um mapeamento.
 */

export type ColumnType = 'string' | 'number' | 'date' | 'enum'

export interface ExpectedColumn {
  /** Campo interno — espelha uma propriedade de `ValidadeItem`. */
  key: keyof ValidadeItem | 'import_id'
  /** Rótulo exibido na UI de mapeamento. */
  label: string
  /** Descrição curta auxiliar. */
  description?: string
  /** Se true, a coluna é obrigatória para que a importação prossiga. */
  required: boolean
  /** Tipo esperado do valor. */
  type: ColumnType
  /** Valores válidos quando `type === 'enum'`. */
  enumValues?: string[]
  /** Aliases pt-BR comuns usados para auto-detecção de coluna. */
  aliases: string[]
}

/**
 * Colunas esperadas pelo sistema. Edite este array para ajustar o contrato
 * de importação — a UI, o mapper e os validators se adaptam automaticamente.
 */
export const EXPECTED_COLUMNS: ExpectedColumn[] = [
  {
    key: 'product',
    label: 'Produto',
    description: 'Nome/descrição do produto',
    required: true,
    type: 'string',
    aliases: ['produto', 'descricao', 'descricao do produto', 'nome do produto', 'item'],
  },
  {
    key: 'sku',
    label: 'SKU',
    description: 'Código do produto',
    required: true,
    type: 'string',
    aliases: ['sku', 'codigo', 'codigo do produto', 'cod', 'ean', 'gtin'],
  },
  {
    key: 'lote',
    label: 'Lote',
    required: true,
    type: 'string',
    aliases: ['lote', 'lote fabricacao', 'batch', 'numero do lote'],
  },
  {
    key: 'category',
    label: 'Categoria',
    required: true,
    type: 'enum',
    enumValues: ['Mercearia', 'Laticínios', 'Bebidas', 'Limpeza', 'Higiene'],
    aliases: ['categoria', 'departamento', 'grupo', 'categoria do produto'],
  },
  {
    key: 'validade',
    label: 'Data de Validade',
    description: 'Data de vencimento (dd/mm/aaaa ou aaaa-mm-dd)',
    required: true,
    type: 'date',
    aliases: ['validade', 'vencimento', 'data de validade', 'data vencimento', 'val', 'shelf life'],
  },
  {
    key: 'estoque',
    label: 'Estoque',
    description: 'Quantidade em estoque',
    required: true,
    type: 'number',
    aliases: ['estoque', 'saldo', 'quantidade em estoque', 'qtde estoque', 'qtd estoque'],
  },
  {
    key: 'unidade',
    label: 'Unidade',
    description: 'Unidade de medida (UN, CX, PCT, FD...)',
    required: true,
    type: 'string',
    aliases: ['unidade', 'un', 'unidade de medida', 'uom', 'embalagem'],
  },
  {
    key: 'cliente',
    label: 'Cliente',
    required: false,
    type: 'string',
    aliases: ['cliente', 'razao social', 'chain', 'distribuidor'],
  },
  {
    key: 'industria',
    label: 'Indústria',
    required: false,
    type: 'string',
    aliases: ['industria', 'fabricante', 'fornecedor', 'marca'],
  },
  {
    key: 'rede',
    label: 'Rede',
    required: false,
    type: 'string',
    aliases: ['rede', 'bandeira', 'chain'],
  },
  {
    key: 'loja',
    label: 'Loja',
    required: false,
    type: 'string',
    aliases: ['loja', 'unidade loja', 'filial', 'store', 'pdv'],
  },
  {
    key: 'cidade',
    label: 'Cidade',
    required: false,
    type: 'string',
    aliases: ['cidade', 'municipio', 'city'],
  },
  {
    key: 'uf',
    label: 'UF',
    required: false,
    type: 'string',
    aliases: ['uf', 'estado', 'sigla estado', 'state'],
  },
  {
    key: 'promotor',
    label: 'Promotor',
    required: false,
    type: 'string',
    aliases: ['promotor', 'consultor', 'promotor de vendas'],
  },
  {
    key: 'supervisor',
    label: 'Supervisor',
    required: false,
    type: 'string',
    aliases: ['supervisor', 'coordenador', 'gerente'],
  },
  {
    key: 'quantidade',
    label: 'Quantidade',
    description: 'Quantidade envolvida na ocorrência',
    required: false,
    type: 'number',
    aliases: ['quantidade', 'qtd', 'qtde', 'volume', 'quantidade unidades'],
  },
  {
    key: 'precoUnitario',
    label: 'Preço Unitário',
    description: 'Preço médio unitário (R$)',
    required: false,
    type: 'number',
    aliases: ['preco unitario', 'preco', 'valor unitario', 'preco medio', 'price'],
  },
]

/** Lista apenas as colunas obrigatórias. */
export const REQUIRED_COLUMNS: ExpectedColumn[] = EXPECTED_COLUMNS.filter((c) => c.required)

/** Lista apenas as colunas opcionais. */
export const OPTIONAL_COLUMNS: ExpectedColumn[] = EXPECTED_COLUMNS.filter((c) => !c.required)

/**
 * Normaliza um cabeçalho de planilha para comparação tolerante a acentos,
 * espaços extras e caixa.
 */
export function normalizeHeader(header: string): string {
  return header
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

/**
 * Dado um conjunto de cabeçalhos detectados no arquivo, sugere um mapeamento
 * coluna-do-arquivo -> campo interno. Usa os aliases para detectar
 * correspondências; quando não encontra, deixa o campo sem mapeamento.
 *
 * Retorna um record: { [campoInterno]: nomeDaColunaNoArquivo | undefined }
 */
export function suggestMapping(detectedHeaders: string[]): Record<string, string | undefined> {
  const normalized = detectedHeaders.map((h) => ({ raw: h, norm: normalizeHeader(h) }))
  const mapping: Record<string, string | undefined> = {}

  for (const col of EXPECTED_COLUMNS) {
    const aliasNorms = col.aliases.map(normalizeHeader)
    // correspondência exata primeiro
    const exact = normalized.find((h) => aliasNorms.includes(h.norm))
    if (exact) {
      mapping[col.key as string] = exact.raw
      continue
    }
    // correspondência parcial (alias contido no header ou vice-versa)
    const partial = normalized.find((h) =>
      aliasNorms.some((a) => h.norm.includes(a) || a.includes(h.norm)),
    )
    if (partial) {
      mapping[col.key as string] = partial.raw
      continue
    }
    mapping[col.key as string] = undefined
  }

  return mapping
}

/**
 * valida a estrutura: dado os cabeçalhos detectados, retorna quais colunas
 * obrigatórias estão presentes e quais ausentes.
 */
export interface StructureValidation {
  detectedHeaders: string[]
  missingRequired: ExpectedColumn[]
  presentRequired: ExpectedColumn[]
  presentOptional: ExpectedColumn[]
  missingOptional: ExpectedColumn[]
  isStructureValid: boolean
}

export function validateStructure(detectedHeaders: string[]): StructureValidation {
  const normalized = new Set(detectedHeaders.map(normalizeHeader))

  const matchesColumn = (col: ExpectedColumn): boolean => {
    return col.aliases.some((a) => normalized.has(normalizeHeader(a)))
  }

  const missingRequired: ExpectedColumn[] = []
  const presentRequired: ExpectedColumn[] = []
  const missingOptional: ExpectedColumn[] = []
  const presentOptional: ExpectedColumn[] = []

  for (const col of EXPECTED_COLUMNS) {
    const present = matchesColumn(col)
    if (col.required) {
      if (present) presentRequired.push(col)
      else missingRequired.push(col)
    } else {
      if (present) presentOptional.push(col)
      else missingOptional.push(col)
    }
  }

  return {
    detectedHeaders,
    missingRequired,
    presentRequired,
    presentOptional,
    missingOptional,
    isStructureValid: missingRequired.length === 0,
  }
}

/** Valida se um valor de categoria é aceito pelo sistema. */
export function isValidCategory(value: string): value is ProductCategory {
  return (['Mercearia', 'Laticínios', 'Bebidas', 'Limpeza', 'Higiene'] as string[]).includes(value)
}

/** Tenta normalizar um valor livre de categoria para um valor aceito. */
export function normalizeCategory(value: string): ProductCategory | null {
  const v = value.trim().toLowerCase()
  const map: Record<string, ProductCategory> = {
    mercearia: 'Mercearia',
    'mercearia seca': 'Mercearia',
    laticinios: 'Laticínios',
    laticinio: 'Laticínios',
    leites: 'Laticínios',
    bebidas: 'Bebidas',
    bebida: 'Bebidas',
    limpeza: 'Limpeza',
    higiene: 'Higiene',
    'higiene pessoal': 'Higiene',
  }
  return map[v] ?? null
}
