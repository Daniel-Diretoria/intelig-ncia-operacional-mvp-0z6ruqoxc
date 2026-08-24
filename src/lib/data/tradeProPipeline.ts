import type {
  TradeProRawRecord,
  ProcessedValidade,
  ValidadeCorrection,
  StatusOperacional,
} from '@/types'
import { classificarStatusOperacional } from './criticidade'
import { deduplicar, type DedupResult } from './deduplication'
import { recognizeStore } from './storeRecognition'
import { parseDate, parseNumber, parseString, parseTextId } from '@/lib/import/excelMapper'

/**
 * Pipeline completo de processamento de Validades no formato TradePro.
 *
 * Implementa os 30 passos na ordem exata definida na especificação:
 *
 *  1. Identificar tipo do arquivo
 *  2. Confirmar que é Validades
 *  3. Ler aba Pesquisa Validade
 *  4. Preservar dados brutos
 *  5. Validar colunas e tipos
 *  6. Gerar Data Importação
 *  7. Filtrar operacionalmente últimos 90 dias pelo Realizado
 *  8. Gerar chave provisória de correção
 *  9. Aplicar correções de validade
 * 10. Gerar Chave Operacional definitiva
 * 11. Extrair Data Arquivo
 * 12. Calcular Data Entrada
 * 13. Calcular Última Aparição
 * 14. Encontrar maior Data Arquivo
 * 15. Gerar Chave Dedup
 * 16. Recalcular Dias p/Vencimento
 * 17. Agrupar pela Chave Dedup
 * 18. Somar Quantidade dentro da Chave Dedup
 * 19. Escolher linha-base pela maior Data Arquivo
 * 20. Agrupar pela Chave Operacional
 * 21. Escolher linha com maior Realizado
 * 22. Remover logicamente Quantidade zero da Base Atual
 * 23. Calcular Status Operacional
 * 24. Associar Data Entrada
 * 25. Calcular Dias p/Vencimento na Entrada
 * 26. Calcular Status na Entrada
 * 27. Associar Última Aparição
 * 28. Calcular Situação Atual
 * 29. Reconhecer Loja e Rede
 * 30. Persistir e atualizar módulo de Validades
 *
 * O pipeline é puramente funcional: recebe registros brutos + correções e
 * retorna a Base Atual processada. A persistência (passo 30) é feita pelo
 * backend (pb_hook) ou pelo cliente.
 */

/** Janela operacional em dias. */
const JANELA_OPERACIONAL_DIAS = 90

/** Fuso America/Sao_Paulo — Data Importação = data local do processamento. */
function gerarDataImportacao(): string {
  // Data atual no fuso America/Sao_Paulo.
  // Usamos Intl para obter a data correta independentemente do fuso do host.
  const now = new Date()
  const saoPaulo = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(now)
  return saoPaulo.replace(',', '') // "2026-08-15 19:15:30"
}

/** Calcula data atual (ISO YYYY-MM-DD) no fuso America/Sao_Paulo. */
export function dataAtualSaoPaulo(): string {
  const now = new Date()
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/** Normaliza uma string para a chave operacional (sem acentos, caixa baixa, trimmed). */
function normKey(s: string | undefined | null): string {
  return (s ?? '')
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

/**
 * Gera a Chave Operacional normalizada:
 *   Fornecedor + "|" + Razão Social + "|" + Produto + "|" + Validade efetiva
 */
export function gerarChaveOperacional(
  fornecedor: string,
  razaoSocial: string,
  produto: string,
  validadeEfetiva: string,
): string {
  return [normKey(fornecedor), normKey(razaoSocial), normKey(produto), validadeEfetiva].join('|')
}

/**
 * Gera a Chave Dedup:
 *   Chave Operacional + "|" + Realizado
 */
export function gerarChaveDedup(chaveOperacional: string, realizado: string): string {
  return `${chaveOperacional}|${realizado}`
}

/**
 * Gera a chave de correção:
 *   Fornecedor + "|" + Razão Social + "|" + Produto + "|" + Validade original
 */
export function gerarChaveCorrecao(
  fornecedor: string,
  razaoSocial: string,
  produto: string,
  validadeOriginal: string,
): string {
  return [normKey(fornecedor), normKey(razaoSocial), normKey(produto), validadeOriginal].join('|')
}

/** Calcula dias entre duas datas ISO YYYY-MM-DD (a - b). */
function diasEntre(a: string, b: string): number {
  const da = new Date(a + 'T00:00:00Z')
  const db = new Date(b + 'T00:00:00Z')
  if (isNaN(da.getTime()) || isNaN(db.getTime())) return 0
  return Math.floor((da.getTime() - db.getTime()) / 86400000)
}

export interface PipelineInput {
  /** Registros brutos lidos da aba "Pesquisa Validade". */
  rawRecords: Record<string, unknown>[]
  /** Mapeamento coluna-do-arquivo -> campo interno. */
  mapping: Record<string, string | undefined>
  /** Nome do arquivo (para extrair Data Arquivo). */
  fileName: string
  /** Data Arquivo extraída do nome (ISO YYYY-MM-DD). */
  dataArquivo?: string
  /** Correções de validade cadastradas. */
  correcoes?: ValidadeCorrection[]
  /** Identificador da importação (import_history.id). */
  importId?: string
}

export interface PipelineSummary {
  totalBrutos: number
  /** Registros que passaram na validação (campos obrigatórios + qtd não negativa). */
  validos: number
  /** Registros genuinamente rejeitados (campos obrigatórios ausentes / qtd negativa). */
  rejeitados: number
  filtrados90Dias: number
  consolidados: number
  baseAtual: number
  quantidadeZeroRemovidos: number
  maiorDataArquivo?: string
}

export interface PipelineResult {
  /** Base Atual (registros selecionados pela etapa 2, quantidade > 0). */
  baseAtual: ProcessedValidade[]
  /** Registros que não entraram na Base Atual (auditoria). */
  descartados: ProcessedValidade[]
  /** Todos os registros processados (antes da remoção de qtd zero). */
  processados: ProcessedValidade[]
  /** Resultado da deduplicação. */
  dedup: DedupResult
  /** Resumo do processamento. */
  summary: PipelineSummary
}

/**
 * Converte um registro bruto do Excel em TradeProRawRecord (modelo bruto).
 * Passo 4-5: preserva dados brutos e valida colunas/tipos.
 */
export function toRawRecord(
  record: Record<string, unknown>,
  mapping: Record<string, string | undefined>,
  numeroLinha: number,
): TradeProRawRecord {
  const get = (key: string): unknown => {
    const sourceKey = mapping[key]
    if (sourceKey && Object.prototype.hasOwnProperty.call(record, sourceKey)) {
      return record[sourceKey]
    }
    // fallback por alias normalizado
    const aliasNorm = normKey(sourceKey ?? key)
    for (const k of Object.keys(record)) {
      if (normKey(k) === aliasNorm) return record[k]
    }
    return undefined
  }

  const realizadoRaw = get('realizado')
  const validadeRaw = get('validade')
  const quantidadeRaw = get('quantidade')

  return {
    codColaborador: parseTextId(get('codColaborador')),
    colaborador: parseString(get('colaborador')),
    codSupervisor: parseTextId(get('codSupervisor')),
    supervisor: parseString(get('supervisor')),
    cpfCnpj: parseTextId(get('cpfCnpj')),
    razaoSocial: parseString(get('razaoSocial')),
    fantasia: parseString(get('fantasia')),
    cidade: parseString(get('cidade')),
    estado: parseString(get('estado')),
    codCliente: parseTextId(get('codCliente')),
    cliente: parseString(get('cliente')),
    codProduto: parseTextId(get('codProduto')),
    produto: parseString(get('produto')),
    codBarras: parseTextId(get('codBarras')),
    dataFabricacao: parseDate(get('dataFabricacao')) || undefined,
    realizado: parseDate(realizadoRaw) || undefined,
    realizadoRaw,
    quantidade: parseNumber(quantidadeRaw) ?? undefined,
    quantidadeRaw,
    diasVencimentoArquivo: parseNumber(get('diasVencimentoArquivo')) ?? undefined,
    validade: parseDate(validadeRaw) || undefined,
    validadeRaw,
    numeroLote: parseString(get('numeroLote')) || undefined,
    representante: parseString(get('representante')) || undefined,
    cnpj: parseTextId(get('cnpj')),
    fornecedor: parseString(get('fornecedor')),
    numeroLinha,
  }
}

/**
 * Valida campos obrigatórios do modelo TradePro (7):
 * Razão Social, Realizado, Cliente, Produto, Quantidade, Validade, Fornecedor.
 * Quantidade < 0 é rejeitada. Quantidade = 0 é válida.
 */
export function isOperacional(raw: TradeProRawRecord): { ok: boolean; motivo?: string } {
  if (!raw.razaoSocial) return { ok: false, motivo: 'Razão Social ausente' }
  if (!raw.realizado) return { ok: false, motivo: 'Realizado ausente' }
  if (!raw.cliente) return { ok: false, motivo: 'Cliente ausente' }
  if (!raw.produto) return { ok: false, motivo: 'Produto ausente' }
  if (raw.quantidade == null) return { ok: false, motivo: 'Quantidade ausente' }
  if (raw.quantidade < 0) return { ok: false, motivo: 'Quantidade negativa' }
  if (!raw.validade) return { ok: false, motivo: 'Validade ausente' }
  return { ok: true }
}

/**
 * Aplica a tabela de Correções de validade.
 * Passo 8-9: chave de correção = Fornecedor|Razão Social|Produto|Validade original.
 * Se encontrada: Validade efetiva = Validade CORRETA. Senão: = Validade original.
 */
export function aplicarCorrecao(
  raw: TradeProRawRecord,
  correcoes: ValidadeCorrection[],
): { validadeEfetiva: string; correcaoAplicada: boolean; regra?: string } {
  const validadeOriginal = raw.validade!
  const chave = gerarChaveCorrecao(
    raw.fornecedor!,
    raw.razaoSocial!,
    raw.produto!,
    validadeOriginal,
  )

  const found = correcoes.find((c) => {
    const chaveC = gerarChaveCorrecao(c.fornecedor, c.razaoSocial, c.produto, c.validadeErrada)
    return chaveC === chave
  })

  if (found) {
    return {
      validadeEfetiva: found.validadeCorreta,
      correcaoAplicada: true,
      regra: found.regra || `Correção manual: ${found.validadeErrada} → ${found.validadeCorreta}`,
    }
  }

  return { validadeEfetiva: validadeOriginal, correcaoAplicada: false }
}

/**
 * Executa o pipeline completo de processamento.
 */
export function executarPipeline(input: PipelineInput): PipelineResult {
  const dataImportacao = gerarDataImportacao()
  const dataArquivo = input.dataArquivo
  const correcoes = input.correcoes ?? []
  const importId = input.importId

  // Passo 4: preservar dados brutos + converter para TradeProRawRecord
  const rawRecords: TradeProRawRecord[] = input.rawRecords.map((r, i) =>
    toRawRecord(r, input.mapping, i + 2),
  ) // +2: linha 1 é cabeçalho

  // Passo 5: validar colunas e tipos (filtrar não-operacionais)
  const operacionais = rawRecords.filter((r) => isOperacional(r).ok)
  // Total de registros que passaram na validação de campos obrigatórios
  // (antes do filtro de 90 dias). Usado pelo resumo "Válidos".
  const totalValidos = operacionais.length
  // Registros rejeitados na validação (campos obrigatórios ausentes / qtd negativa).
  // São os ÚNICOS genuinamente "ignorados" (não processados) pelo pipeline.
  const totalRejeitados = rawRecords.length - totalValidos
  // (totalRejeitados exposto via summary.rejeitados para o resumo de importação)
  // (Passo 6: Data Importação já gerada acima.)

  // Passo 7: filtrar últimos 90 dias pelo Realizado
  const hoje = dataAtualSaoPaulo()
  const limite90 = new Date(hoje + 'T00:00:00Z')
  limite90.setUTCDate(limite90.getUTCDate() - JANELA_OPERACIONAL_DIAS)
  const limite90ISO = limite90.toISOString().slice(0, 10)

  const filtrados90 = operacionais.filter((r) => {
    if (!r.realizado) return false
    return r.realizado >= limite90ISO
  })

  // Passos 8-10: correção + chave operacional
  const processados: ProcessedValidade[] = filtrados90.map((raw, idx) => {
    const { validadeEfetiva, correcaoAplicada, regra } = aplicarCorrecao(raw, correcoes)

    const chaveOperacional = gerarChaveOperacional(
      raw.fornecedor!,
      raw.razaoSocial!,
      raw.produto!,
      validadeEfetiva,
    )
    const chaveDedup = gerarChaveDedup(chaveOperacional, raw.realizado!)

    // Passo 16: recalcular Dias p/ Vencimento (Validade efetiva − data atual)
    const diasVencimentoAtual = diasEntre(validadeEfetiva, hoje)

    // Reconhecimento de loja/rede (passo 29 — aplicado aqui para enriquecer)
    const rec = recognizeStore({
      razaoSocial: raw.razaoSocial,
      fantasia: raw.fantasia,
      cidade: raw.cidade,
      cpfCnpj: raw.cpfCnpj,
      cnpj: raw.cnpj,
    })

    return {
      id: `${importId ?? 'proc'}-${idx}`,
      fornecedor: raw.fornecedor!,
      razaoSocial: raw.razaoSocial!,
      produto: raw.produto!,
      cliente: raw.cliente,
      codCliente: raw.codCliente,
      codProduto: raw.codProduto,
      codBarras: raw.codBarras,
      cpfCnpj: raw.cpfCnpj,
      cnpj: raw.cnpj,
      codigoLoja: rec.codigoLoja,
      nomeLoja: rec.nomeLoja,
      rede: rec.rede,
      cidade: raw.cidade,
      estado: raw.estado,
      colaborador: raw.colaborador,
      codColaborador: raw.codColaborador,
      supervisor: raw.supervisor,
      codSupervisor: raw.codSupervisor,
      fantasia: raw.fantasia,
      representante: raw.representante,
      numeroLote: raw.numeroLote,
      realizado: raw.realizado!,
      validadeOriginal: raw.validade!,
      validadeEfetiva,
      dataArquivo,
      dataImportacao,
      quantidade: raw.quantidade ?? 0,
      isBaseAtual: false,
      chaveOperacional,
      chaveDedup,
      correcaoAplicada,
      regraCorrecao: regra,
      diasVencimentoAtual,
      diasVencimentoArquivo: raw.diasVencimentoArquivo,
      statusOperacional: classificarStatusOperacional(diasVencimentoAtual) as StatusOperacional,
      situacaoAtual: 'Ativo', // será ajustado abaixo
      importId,
    }
  })

  // Passo 14: maior Data Arquivo global
  const maiorDataArquivo = processados
    .map((p) => p.dataArquivo)
    .filter((d): d is string => !!d)
    .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))[0]

  // Passos 15-21: deduplicação em duas etapas
  const dedup = deduplicar(processados)

  // Passo 12-13: Data Entrada e Última Aparição por Chave Operacional
  // (calculadas a partir de TODOS os registros processados da chave)
  const porOperacional = new Map<string, ProcessedValidade[]>()
  for (const p of processados) {
    const arr = porOperacional.get(p.chaveOperacional)
    if (arr) arr.push(p)
    else porOperacional.set(p.chaveOperacional, [p])
  }

  const entradaSaidaMap = new Map<string, { dataEntrada: string; ultimaAparicao: string }>()
  for (const [chave, regs] of porOperacional) {
    const datasArquivo = regs
      .map((r) => r.dataArquivo)
      .filter((d): d is string => !!d)
      .sort()
    const dataEntrada = datasArquivo[0] ?? regs[0].realizado
    const ultimaAparicao = datasArquivo[datasArquivo.length - 1] ?? regs[0].realizado
    entradaSaidaMap.set(chave, { dataEntrada, ultimaAparicao })
  }

  // Aplica Data Entrada, Última Aparição, Status na Entrada, Situação Atual
  // aos registros selecionados na etapa 2.
  const selecionadosComMeta = dedup.selecionadosEtapa2.map((p) => {
    const meta = entradaSaidaMap.get(p.chaveOperacional)
    const dataEntrada = meta?.dataEntrada ?? p.dataArquivo ?? p.realizado
    const ultimaAparicao = meta?.ultimaAparicao ?? p.dataArquivo ?? p.realizado

    // Passo 25: Dias p/ Vencimento na Entrada = Validade efetiva − Data Entrada
    const diasVencimentoEntrada = diasEntre(p.validadeEfetiva, dataEntrada)
    // Passo 26: Status na Entrada (histórico)
    const statusNaEntrada = classificarStatusOperacional(diasVencimentoEntrada) as StatusOperacional

    // Passo 28: Situação Atual
    const situacaoAtual: 'Ativo' | 'Encerrado/Não Reportado' =
      maiorDataArquivo && ultimaAparicao === maiorDataArquivo ? 'Ativo' : 'Encerrado/Não Reportado'

    return {
      ...p,
      dataEntrada,
      ultimaAparicao,
      diasVencimentoEntrada,
      statusNaEntrada,
      situacaoAtual,
    }
  })

  // Passo 22: remover logicamente Quantidade zero da Base Atual
  // (depois das duas etapas de consolidação)
  // Os registros selecionados com quantidade > 0 formam a Base Atual e recebem
  // isBaseAtual = true (usado pelo adapter para listar a Base Atual).
  const baseAtual = selecionadosComMeta
    .filter((p) => p.quantidade > 0)
    .map((p) => ({ ...p, isBaseAtual: true }))
  const quantidadeZeroRemovidos = selecionadosComMeta.filter((p) => p.quantidade === 0)

  // Descartados = não selecionados na etapa 2 + quantidade zero
  const descartados = [...dedup.naoSelecionados, ...quantidadeZeroRemovidos]

  const summary: PipelineSummary = {
    totalBrutos: rawRecords.length,
    validos: totalValidos,
    rejeitados: totalRejeitados,
    filtrados90Dias: filtrados90.length,
    consolidados: dedup.gruposEtapa1.length,
    baseAtual: baseAtual.length,
    quantidadeZeroRemovidos: quantidadeZeroRemovidos.length,
    maiorDataArquivo,
  }

  return {
    baseAtual,
    descartados,
    processados,
    dedup,
    summary,
  }
}

/**
 * Calcula hash do arquivo para proteção contra reenvio.
 * Usa SubtleCrypto (SHA-256) quando disponível.
 */
export async function calcularHashArquivo(file: File): Promise<string> {
  try {
    const buffer = await file.arrayBuffer()
    const digest = await crypto.subtle.digest('SHA-256', buffer)
    const bytes = Array.from(new Uint8Array(digest))
    return bytes.map((b) => b.toString(16).padStart(2, '0')).join('')
  } catch {
    // fallback simples
    return `size-${file.size}-${file.name}`
  }
}
