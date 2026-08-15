import type { ProcessedValidade } from '@/types'

/**
 * Deduplicação em duas etapas do pipeline TradePro de Validades.
 *
 * Etapa 1 — consolidação por ocorrência e dia da coleta:
 *   Agrupar pela Chave Dedup (Chave Operacional + "|" + Realizado).
 *   Para cada grupo: Quantidade consolidada = soma de todas as Quantidades.
 *   Linha-base = registro com a maior Data Arquivo dentro da Chave Dedup.
 *
 * Etapa 2 — situação mais recente da ocorrência:
 *   Agrupar pela Chave Operacional. Para cada Chave Operacional: selecionar
 *   registro com o maior Realizado. NÃO somar novamente. NÃO selecionar pela
 *   Data Arquivo.
 *
 * Desempates determinísticos: data/hora importação -> identificador importação
 * -> número linha arquivo. O resultado não varia por ordem de leitura.
 */

export interface DedupGroup {
  chaveDedup: string
  chaveOperacional: string
  realizado: string
  registros: ProcessedValidade[]
  quantidadeConsolidada: number
  linhaBase: ProcessedValidade
  /** Índices/ids dos registros que participaram da soma. */
  participantes: string[]
}

export interface DedupResult {
  /** Grupos consolidados da etapa 1 (por Chave Dedup). */
  gruposEtapa1: DedupGroup[]
  /** Registro selecionado por Chave Operacional (etapa 2) — Base Atual bruta. */
  selecionadosEtapa2: ProcessedValidade[]
  /** Registros da etapa 1 que NÃO foram selecionados na etapa 2. */
  naoSelecionados: ProcessedValidade[]
}

/** Compara datas ISO YYYY-MM-DD de forma segura. */
function compareISODate(a: string | undefined, b: string | undefined): number {
  const da = a ?? ''
  const db = b ?? ''
  if (da === db) return 0
  return da < db ? -1 : 1
}

/**
 * Função de desempate determinística para escolher a "maior" linha quando
 * há empate no critério principal.
 *
 * Ordem: data/hora importação -> identificador importação -> número linha arquivo.
 */
function desempateMaior(a: ProcessedValidade, b: ProcessedValidade): number {
  // 1. data/hora importação (maior vence)
  const cmpImport = compareISODate(a.dataImportacao, b.dataImportacao)
  if (cmpImport !== 0) return cmpImport > 0 ? 1 : -1

  // 2. identificador importação (maior vence)
  const impA = a.importId ?? ''
  const impB = b.importId ?? ''
  if (impA !== impB) return impA > impB ? 1 : -1

  // 3. número linha arquivo (maior vence) — fallback final
  const linA = a.id ?? ''
  const linB = b.id ?? ''
  if (linA !== linB) return linA > linB ? 1 : -1
  return 0
}

/**
 * Etapa 1: consolidação por Chave Dedup (Chave Operacional + "|" + Realizado).
 *
 * - Agrupa registros pela chaveDedup.
 * - Soma as Quantidades de todos os registros do grupo.
 * - Escolhe a linha-base = registro com a MAIOR Data Arquivo dentro do grupo
 *   (desempate determinístico).
 * - A linha-base recebe a quantidade consolidada e referencia todos os
 *   participantes.
 */
export function consolidarPorChaveDedup(registros: ProcessedValidade[]): DedupGroup[] {
  const grupos = new Map<string, ProcessedValidade[]>()

  for (const r of registros) {
    const key = r.chaveDedup
    const arr = grupos.get(key)
    if (arr) {
      arr.push(r)
    } else {
      grupos.set(key, [r])
    }
  }

  const result: DedupGroup[] = []

  for (const [chaveDedup, regs] of grupos) {
    // Soma das quantidades
    const quantidadeConsolidada = regs.reduce((acc, r) => acc + (r.quantidade ?? 0), 0)

    // Linha-base: maior Data Arquivo (desempate determinístico)
    // Ordena estável por (dataArquivo desc, desempate) e pega o primeiro.
    const ordenados = [...regs].sort((a, b) => {
      const cmp = compareISODate(b.dataArquivo, a.dataArquivo) // desc
      if (cmp !== 0) return cmp
      return desempateMaior(b, a) // desempate: maior vence
    })
    const linhaBase = ordenados[0]

    result.push({
      chaveDedup,
      chaveOperacional: linhaBase.chaveOperacional,
      realizado: linhaBase.realizado,
      registros: regs,
      quantidadeConsolidada,
      linhaBase,
      participantes: regs.map((r) => r.id),
    })
  }

  return result
}

/**
 * Etapa 2: situação mais recente da ocorrência.
 *
 * - Agrupa pela Chave Operacional.
 * - Para cada Chave Operacional: seleciona o registro com o MAIOR Realizado.
 * - NÃO soma novamente. NÃO seleciona pela Data Arquivo.
 *
 * Recebe os grupos da etapa 1 (linha-base de cada grupo, já com quantidade
 * consolidada) e seleciona um por Chave Operacional.
 */
export function selecionarMaiorRealizado(grupos: DedupGroup[]): {
  selecionados: ProcessedValidade[]
  naoSelecionados: ProcessedValidade[]
} {
  const porOperacional = new Map<string, DedupGroup[]>()

  for (const g of grupos) {
    const key = g.chaveOperacional
    const arr = porOperacional.get(key)
    if (arr) {
      arr.push(g)
    } else {
      porOperacional.set(key, [g])
    }
  }

  const selecionados: ProcessedValidade[] = []
  const naoSelecionados: ProcessedValidade[] = []

  for (const [, gs] of porOperacional) {
    // Seleciona o grupo cuja linha-base tem o MAIOR Realizado.
    // Desempate: data/hora importação -> identificador importação -> número linha.
    const ordenados = [...gs].sort((a, b) => {
      const cmp = compareISODate(b.realizado, a.realizado) // desc por Realizado
      if (cmp !== 0) return cmp
      return desempateMaior(b.linhaBase, a.linhaBase)
    })

    const escolhido = ordenados[0]
    // Marca a linha-base escolhida como pertencente à Base Atual.
    selecionados.push({
      ...escolhido.linhaBase,
      isBaseAtual: true,
    })

    // Os demais grupos (mesma chave operacional, menor Realizado) não entram
    // na Base Atual, mas permanecem para auditoria.
    for (let i = 1; i < ordenados.length; i++) {
      naoSelecionados.push({
        ...ordenados[i].linhaBase,
        isBaseAtual: false,
      })
    }
  }

  return { selecionados, naoSelecionados }
}

/**
 * Executa a deduplicação completa em duas etapas.
 */
export function deduplicar(registros: ProcessedValidade[]): DedupResult {
  const gruposEtapa1 = consolidarPorChaveDedup(registros)
  const { selecionados, naoSelecionados } = selecionarMaiorRealizado(gruposEtapa1)
  return {
    gruposEtapa1,
    selecionadosEtapa2: selecionados,
    naoSelecionados,
  }
}
