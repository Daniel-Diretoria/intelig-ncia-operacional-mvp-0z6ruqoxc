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
 * O nome interno (`key`) corresponde a um campo de `ValidadeItem` ou a um dos
 * campos do modelo TradePro (`TradeProRawRecord`).
 * O `aliases` traz os rótulos pt-BR mais comuns encontrados em planilhas
 * operacionais, usados para sugerir automaticamente um mapeamento.
 */

export type ColumnType = 'string' | 'number' | 'date' | 'enum' | 'text-id'

export interface ExpectedColumn {
  /** Campo interno — espelha uma propriedade de `ValidadeItem` ou `TradeProRawRecord`. */
  key: string
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
 *
 * O formato TradePro (aba "Pesquisa Validade") possui exatamente 23 colunas,
 * mapeadas abaixo. Os aliases cobrem pequenas variações de acentuação, caixa,
 * espaços e abreviações previamente mapeadas.
 */
export const EXPECTED_COLUMNS: ExpectedColumn[] = [
  // --- Colunas do formato TradePro (23) ---
  {
    key: 'codColaborador',
    label: 'Cód. Colaborador',
    description: 'Texto — preserva zeros à esquerda',
    required: false,
    type: 'text-id',
    aliases: ['cod. colaborador', 'codigo colaborador', 'cod colaborador', 'cod.colaborador'],
  },
  {
    key: 'colaborador',
    label: 'Colaborador',
    required: false,
    type: 'string',
    aliases: ['colaborador'],
  },
  {
    key: 'codSupervisor',
    label: 'Cód. Supervisor',
    description: 'Texto — preserva zeros à esquerda',
    required: false,
    type: 'text-id',
    aliases: ['cod. supervisor', 'codigo supervisor', 'cod supervisor', 'cod.supervisor'],
  },
  {
    key: 'supervisor',
    label: 'Supervisor',
    required: false,
    type: 'string',
    aliases: ['supervisor'],
  },
  {
    key: 'cpfCnpj',
    label: 'CPF/CNPJ',
    description: 'Texto — não validar como CPF/CNPJ fiscal',
    required: false,
    type: 'text-id',
    aliases: ['cpf/cnpj', 'cpf cnpj', 'cpfcnpj', 'cpf / cnpj'],
  },
  {
    key: 'razaoSocial',
    label: 'Razão Social',
    description: 'Ex.: "250 - FORT ATACADISTA FLORESTA"',
    required: true,
    type: 'string',
    aliases: ['razao social', 'razão social', 'razaosocial', 'razao'],
  },
  {
    key: 'fantasia',
    label: 'Fantasia',
    required: false,
    type: 'string',
    aliases: ['fantasia', 'nome fantasia'],
  },
  {
    key: 'cidade',
    label: 'Cidade',
    required: false,
    type: 'string',
    aliases: ['cidade', 'municipio', 'city'],
  },
  {
    key: 'estado',
    label: 'Estado',
    required: false,
    type: 'string',
    aliases: ['estado', 'uf', 'sigla estado', 'state'],
  },
  {
    key: 'codCliente',
    label: 'Cód. Cliente',
    description: 'Texto — preserva zeros à esquerda',
    required: false,
    type: 'text-id',
    aliases: ['cod. cliente', 'codigo cliente', 'cod cliente', 'cod.cliente'],
  },
  {
    key: 'cliente',
    label: 'Cliente',
    required: true,
    type: 'string',
    aliases: ['cliente'],
  },
  {
    key: 'codProduto',
    label: 'Cód. Produto',
    description: 'Texto — preserva zeros à esquerda',
    required: false,
    type: 'text-id',
    aliases: ['cod. produto', 'codigo produto', 'cod produto', 'cod.produto'],
  },
  {
    key: 'produto',
    label: 'Produto',
    description: 'Nome/descrição do produto',
    required: true,
    type: 'string',
    aliases: ['produto', 'descricao', 'descricao do produto', 'nome do produto', 'item'],
  },
  {
    key: 'codBarras',
    label: 'Cód. Barras',
    description: 'Texto — preserva zeros à esquerda (EAN/GTIN)',
    required: false,
    type: 'text-id',
    aliases: ['cod. barras', 'codigo barras', 'cod barras', 'ean', 'gtin', 'cod.barras'],
  },
  {
    key: 'dataFabricacao',
    label: 'Data Fabricação',
    required: false,
    type: 'date',
    aliases: ['data fabricacao', 'data de fabricacao', 'fab', 'fabricacao'],
  },
  {
    key: 'realizado',
    label: 'Realizado',
    description: 'Data da coleta',
    required: true,
    type: 'date',
    aliases: ['realizado', 'data realizado', 'data da coleta', 'coleta'],
  },
  {
    key: 'quantidade',
    label: 'Quantidade',
    description: 'Quantidade envolvida (0 é válido; negativo é rejeitado)',
    required: true,
    type: 'number',
    aliases: ['quantidade', 'qtd', 'qtde', 'volume', 'quantidade unidades'],
  },
  {
    key: 'diasVencimentoArquivo',
    label: 'Dias p/ Vencimento',
    description: 'Preservado do arquivo para auditoria (Dias p/Vencimento)',
    required: true,
    type: 'number',
    aliases: [
      'dias p/ vencimento',
      'dias p/vencimento',
      'dias p vencimento',
      'dias pvencimento',
      'dias para vencimento',
      'dias vencimento',
    ],
  },
  {
    key: 'validade',
    label: 'Validade',
    description: 'Data de vencimento (dd/mm/aaaa ou aaaa-mm-dd)',
    required: true,
    type: 'date',
    aliases: ['validade', 'vencimento', 'data de validade', 'data vencimento', 'val', 'shelf life'],
  },
  {
    key: 'statusOperacionalArquivo',
    label: 'Status Operacional',
    description: 'Status operacional constante do arquivo',
    required: true,
    type: 'string',
    aliases: ['status operacional', 'status operacao', 'status', 'situacao operacional'],
  },
  {
    key: 'dataEntradaArquivo',
    label: 'Data Entrada',
    description: 'Data de entrada ou registro inicial',
    required: true,
    type: 'date',
    aliases: ['data entrada', 'data de entrada', 'dt entrada', 'entrada'],
  },
  {
    key: 'numeroLote',
    label: 'Número do lote',
    required: false,
    type: 'string',
    aliases: ['numero do lote', 'lote', 'n lote', 'n. lote', 'lote fabricacao', 'batch'],
  },
  {
    key: 'representante',
    label: 'Representante',
    required: false,
    type: 'string',
    aliases: ['representante', 'rep', 'representante comercial'],
  },
  {
    key: 'cnpj',
    label: 'CNPJ',
    description: 'CNPJ do fornecedor — texto, preserva zeros à esquerda',
    required: false,
    type: 'text-id',
    aliases: ['cnpj'],
  },
  {
    key: 'fornecedor',
    label: 'Fornecedor',
    required: false,
    type: 'string',
    aliases: ['fornecedor', 'industria', 'fabricante', 'marca', 'supplier'],
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
    // correspondência parcial (alias contido no header ou vice-versa, exigindo min 8 caracteres na string menor)
    const partial = normalized.find((h) =>
      aliasNorms.some(
        (a) => Math.min(h.norm.length, a.length) >= 8 && (h.norm.includes(a) || a.includes(h.norm)),
      ),
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

/**
 * Conjunto característico de colunas de um arquivo de Rupturas (aba "Ruptura").
 * Usado para recusar arquivos de Rupturas no importador de Validades.
 */
const RUPTURA_COLUMN_HINTS = [
  'ruptura',
  'data ruptura',
  'inicio ruptura',
  'fim ruptura',
  'dias ruptura',
  'motivo ruptura',
  'reposicao',
  'previsao chegada',
  'previsao reposicao',
  'tipo ruptura',
]

/**
 * Abas consideradas indicativas de arquivo de Rupturas.
 */
export const RUPTURA_SHEET_HINTS = ['ruptura', 'rupturas']

/**
 * Detecta se os cabeçalhos/aba correspondem a um arquivo de Rupturas.
 * Retorna true quando há forte indício de que o arquivo é de Rupturas.
 */
export function isRupturaFile(detectedHeaders: string[], sheetName?: string): boolean {
  const normalized = detectedHeaders.map(normalizeHeader)
  const sheet = sheetName ? normalizeHeader(sheetName) : ''

  // aba principal "Ruptura"
  if (RUPTURA_SHEET_HINTS.includes(sheet)) return true

  // conjunto de colunas característico de Rupturas
  const rupturaHits = RUPTURA_COLUMN_HINTS.filter((h) => normalized.some((hdr) => hdr.includes(h)))
  if (rupturaHits.length >= 2) return true

  return false
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
