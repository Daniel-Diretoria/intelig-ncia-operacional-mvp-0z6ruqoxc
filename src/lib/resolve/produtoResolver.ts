/**
 * Resolvedor de Produtos do SKIP — Inteligência Operacional
 *
 * Capacidade compartilhada e reutilizável para transformar nomes informais, abreviados,
 * gírias e variações no produto oficial do catálogo SKIP, sem inventar correspondências.
 *
 * Pipeline:
 *  1. Normalização do texto (acentuação, caixa, abreviações pontuais como "qjo" -> "queijo")
 *  2. Filtragem e restrição forte por Indústria (produtos de outra indústria NUNCA vencem)
 *  3. Verificação em Dicionário de Aliases/Apelidos confirmados (product_aliases)
 *  4. Cruzamento com Catálogo Oficial, Mix Definido da Loja, Mix Operacional Observado e Histórico da Loja
 *  5. Avaliação de atributos discriminantes (gramatura, sabor, apresentação, família)
 *  6. Classificação em níveis sem falsa precisão:
 *     - correspondencia_segura (só esta pode aplicar automática)
 *     - muito_provavel
 *     - possivel
 *     - ambigua
 *     - nao_identificado
 *  7. Explicabilidade por sinais simples ("Mesma indústria ✓", "Mix da loja ✓", etc.)
 */

import pb from '@/lib/pocketbase/client'
import {
  NivelCorrespondenciaProduto,
  CandidatoProdutoSugerido,
  ResolverProdutoInput,
  ResolverProdutoResultado,
  ProductAliasRegistro,
} from '@/types/devolucoes'

// Mapeamento de abreviações operacionais frequentes
const ABREVIACOES_OPERACIONAIS: Record<string, string> = {
  qjo: 'queijo',
  queij: 'queijo',
  morg: 'morango',
  mrg: 'morango',
  choc: 'chocolate',
  pct: 'pacote',
  pcte: 'pacote',
  frut: 'frutas',
  verm: 'vermelhas',
  trad: 'tradicional',
  req: 'requeijao',
  reqjo: 'requeijao',
  desn: 'desnatado',
  integ: 'integral',
  iog: 'iogurte',
  iogt: 'iogurte',
  beb: 'bebida',
  lact: 'lactea',
  un: 'unidade',
  und: 'unidade',
}

/**
 * Normaliza texto removendo acentos, pontuação, padronizando espaços e expandindo abreviações comuns
 */
export function normalizarNomeProduto(texto?: string): string {
  if (!texto) return ''
  const base = texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const tokens = base.split(' ').map((t) => ABREVIACOES_OPERACIONAIS[t] || t)
  return tokens.join(' ')
}

/**
 * Extrai gramatura/medida expressa no texto (ex: "40g", "1.25l", "1l", "320g", "200g")
 */
export function extrairMedida(texto: string): string | null {
  const norm = texto.toLowerCase().replace(',', '.')
  // Busca padrão número + unidade (g, kg, ml, l)
  const match = norm.match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|l)\b/)
  if (match) {
    let valor = parseFloat(match[1])
    const unidade = match[2]
    if (unidade === 'kg') return `${Math.round(valor * 1000)}g`
    if (unidade === 'l') return `${Math.round(valor * 1000)}ml`
    if (unidade === 'g') return `${Math.round(valor)}g`
    if (unidade === 'ml') return `${Math.round(valor)}ml`
  }
  return null
}

/**
 * Extrai tokens relevantes ignorando stopwords curtas
 */
export function extrairTokensRelevantes(texto: string): string[] {
  const stopwords = new Set([
    'de',
    'da',
    'do',
    'das',
    'dos',
    'com',
    'sem',
    'para',
    'em',
    'e',
    'o',
    'a',
    'un',
    'unidade',
    'unidades',
  ])
  return normalizarNomeProduto(texto)
    .split(' ')
    .filter((t) => t.length > 1 && !stopwords.has(t))
}

export interface CatalogoProdutoContexto {
  codigo?: string
  nome: string
  industria_nome: string
  industria_id?: string
  noMixDefinidoLoja?: boolean
  noMixObservadoLoja?: boolean
  historicoNaLoja?: boolean
  tipoMix?: 'oficial_industria' | 'observado_operacional'
}

/**
 * Busca aliases confirmados no banco PocketBase ou em lista de fallback
 */
export async function buscarAliasesConfirmados(
  aliasOuTermo: string,
  industriaNome?: string,
): Promise<ProductAliasRegistro[]> {
  const termoNorm = normalizarNomeProduto(aliasOuTermo)
  if (!termoNorm) return []

  try {
    const filters: string[] = [`status = 'ativo'`]
    if (industriaNome && industriaNome.trim() !== '' && industriaNome !== 'todas') {
      filters.push(`industria_nome ~ '${industriaNome.replace(/'/g, "\\'")}'`)
    }

    const records = await pb.collection('product_aliases').getFullList({
      filter: filters.join(' && '),
      sort: '-quantidade_utilizacoes',
    })

    return (records as unknown as ProductAliasRegistro[]).filter((rec) => {
      const aNorm = rec.alias_normalizado || normalizarNomeProduto(rec.alias)
      return aNorm === termoNorm || termoNorm.includes(aNorm) || aNorm.includes(termoNorm)
    })
  } catch (err) {
    console.warn('[produtoResolver] Falha ao carregar aliases:', err)
    return []
  }
}

/**
 * Salva ou atualiza um alias confirmado no Dicionário de Produtos
 */
export async function salvarProductAlias(dados: {
  alias: string
  produto_oficial_nome: string
  produto_oficial_codigo?: string
  industria_id?: string
  industria_nome: string
  familia?: string
  sabor?: string
  gramatura?: string
  tipo_alias?: 'sku_direto' | 'familia_generica'
  confirmado_por?: string
  origem?: string
  observacao?: string
}): Promise<ProductAliasRegistro> {
  const aliasNorm = normalizarNomeProduto(dados.alias)

  // Checar se já existe o mesmo alias para a mesma indústria
  try {
    const existentes = await pb.collection('product_aliases').getList(1, 1, {
      filter: `alias_normalizado = '${aliasNorm.replace(/'/g, "\\'")}' && industria_nome = '${dados.industria_nome.replace(/'/g, "\\'")}'`,
    })

    if (existentes.items.length > 0) {
      const rec = existentes.items[0]
      const qtdAtual =
        typeof rec.quantidade_utilizacoes === 'number' ? rec.quantidade_utilizacoes : 1
      const updated = await pb.collection('product_aliases').update(rec.id, {
        produto_oficial_nome: dados.produto_oficial_nome,
        produto_oficial_codigo: dados.produto_oficial_codigo || rec.produto_oficial_codigo || '',
        status: 'ativo',
        quantidade_utilizacoes: qtdAtual + 1,
        ultima_utilizacao: new Date().toISOString(),
        confirmado_por: dados.confirmado_por || rec.confirmado_por || 'Operador',
      })
      return updated as unknown as ProductAliasRegistro
    }
  } catch (err) {
    console.warn('[produtoResolver] Erro ao buscar alias existente:', err)
  }

  const created = await pb.collection('product_aliases').create({
    alias: dados.alias,
    alias_normalizado: aliasNorm,
    produto_oficial_nome: dados.produto_oficial_nome,
    produto_oficial_codigo: dados.produto_oficial_codigo || '',
    industria_id: dados.industria_id || '',
    industria_nome: dados.industria_nome,
    familia: dados.familia || '',
    sabor: dados.sabor || '',
    gramatura: dados.gramatura || '',
    tipo_alias: dados.tipo_alias || 'sku_direto',
    confirmado_por: dados.confirmado_por || 'Operador',
    origem: dados.origem || 'importacao_whatsapp',
    status: 'ativo',
    quantidade_utilizacoes: 1,
    ultima_utilizacao: new Date().toISOString(),
    observacao: dados.observacao || '',
  })

  return created as unknown as ProductAliasRegistro
}

/**
 * Desativa ou reativa um alias do dicionário
 */
export async function alterarStatusAlias(
  aliasId: string,
  novoStatus: 'ativo' | 'inativo',
): Promise<void> {
  await pb.collection('product_aliases').update(aliasId, {
    status: novoStatus,
  })
}

/**
 * Carrega catálogo contextual para resolução combinando:
 * - Catálogo oficial e Mix observado da Indústria (industry_product_mix)
 * - Mix Definido da Loja (industry_store_product_mix)
 * - Histórico operacional recente na Loja (validades_base)
 */
export async function carregarCatalogoContextual(
  industriaNome?: string,
  industriaId?: string,
  storeCode?: string,
): Promise<CatalogoProdutoContexto[]> {
  const catalogo: Map<string, CatalogoProdutoContexto> = new Map()

  // 1. Produtos de industry_product_mix
  try {
    const filters: string[] = []
    if (industriaId) {
      filters.push(`industry_id = '${industriaId}'`)
    } else if (industriaNome && industriaNome.trim() !== '' && industriaNome !== 'todas') {
      filters.push(`industry_name ~ '${industriaNome.replace(/'/g, "\\'")}'`)
    }

    const mixList = await pb.collection('industry_product_mix').getFullList({
      filter: filters.length > 0 ? filters.join(' && ') : undefined,
    })

    for (const item of mixList) {
      const it = item as unknown as {
        codigo_produto?: string
        nome_produto: string
        industry_name: string
        industry_id?: string
        tipo_mix?: 'oficial_industria' | 'observado_operacional'
      }
      const chave = `${it.industry_name.toUpperCase()}|${normalizarNomeProduto(it.nome_produto)}`
      catalogo.set(chave, {
        codigo: it.codigo_produto,
        nome: it.nome_produto,
        industria_nome: it.industry_name,
        industria_id: it.industry_id,
        tipoMix: it.tipo_mix || 'oficial_industria',
      })
    }
  } catch (err) {
    console.warn('[produtoResolver] Erro ao carregar industry_product_mix:', err)
  }

  // 2. Mix definido por loja (industry_store_product_mix)
  if (storeCode && storeCode.trim() !== '') {
    try {
      const storeMixList = await pb.collection('industry_store_product_mix').getFullList({
        filter: `store_code = '${storeCode.replace(/'/g, "\\'")}'`,
      })

      for (const item of storeMixList) {
        const it = item as unknown as {
          codigo_produto?: string
          nome_produto: string
          industry_name?: string
        }
        const indName = it.industry_name || industriaNome || 'Indústria'
        const chave = `${indName.toUpperCase()}|${normalizarNomeProduto(it.nome_produto)}`
        const existente = catalogo.get(chave)
        if (existente) {
          existente.noMixDefinidoLoja = true
        } else {
          catalogo.set(chave, {
            codigo: it.codigo_produto,
            nome: it.nome_produto,
            industria_nome: indName,
            noMixDefinidoLoja: true,
          })
        }
      }
    } catch (err) {
      console.warn('[produtoResolver] Erro ao carregar industry_store_product_mix:', err)
    }
  }

  // 3. Histórico recente de validades_base da loja
  if (storeCode && storeCode.trim() !== '') {
    try {
      const validadesHist = await pb.collection('validades_base').getList(1, 150, {
        filter: `codigo_loja = '${storeCode.replace(/'/g, "\\'")}'`,
        sort: '-realizado',
      })

      for (const item of validadesHist.items) {
        const it = item as unknown as {
          produto: string
          cod_produto?: string
          cliente?: string
        }
        const indName = it.cliente || industriaNome || 'Indústria'
        const chave = `${indName.toUpperCase()}|${normalizarNomeProduto(it.produto)}`
        const existente = catalogo.get(chave)
        if (existente) {
          existente.historicoNaLoja = true
          existente.noMixObservadoLoja = true
        } else {
          catalogo.set(chave, {
            codigo: it.cod_produto,
            nome: it.produto,
            industria_nome: indName,
            historicoNaLoja: true,
            noMixObservadoLoja: true,
          })
        }
      }
    } catch (err) {
      console.warn('[produtoResolver] Erro ao carregar validades_base da loja:', err)
    }
  }

  return Array.from(catalogo.values())
}

/**
 * Compara dois produtos calculando afinidade semântica e discriminantes (sabor, gramatura)
 */
export function calcularAfinidadeProduto(
  textoInformado: string,
  candidatoNome: string,
): {
  scoreTexto: number
  mesmaGramatura: boolean | null
  mesmoSaborOuVariacao: boolean
  conflitoGramatura: boolean
} {
  const normInfo = normalizarNomeProduto(textoInformado)
  const normCand = normalizarNomeProduto(candidatoNome)

  if (normInfo === normCand) {
    return {
      scoreTexto: 100,
      mesmaGramatura: true,
      mesmoSaborOuVariacao: true,
      conflitoGramatura: false,
    }
  }

  const medInfo = extrairMedida(textoInformado)
  const medCand = extrairMedida(candidatoNome)

  let mesmaGramatura: boolean | null = null
  let conflitoGramatura = false
  if (medInfo && medCand) {
    if (medInfo === medCand) {
      mesmaGramatura = true
    } else {
      mesmaGramatura = false
      conflitoGramatura = true
    }
  }

  const tokensInfo = extrairTokensRelevantes(textoInformado)
  const tokensCand = extrairTokensRelevantes(candidatoNome)

  if (tokensInfo.length === 0 || tokensCand.length === 0) {
    return {
      scoreTexto: 0,
      mesmaGramatura,
      mesmoSaborOuVariacao: false,
      conflitoGramatura,
    }
  }

  const intersecao = tokensInfo.filter((t) => tokensCand.includes(t))
  const recallInfo = intersecao.length / tokensInfo.length
  const precisionCand = intersecao.length / tokensCand.length

  // Score textual equilibrado
  let scoreTexto = Math.round((recallInfo * 0.6 + precisionCand * 0.4) * 100)

  // Penalização drástica se houver conflito de gramatura explícito ("40g" vs "80g")
  if (conflitoGramatura) {
    scoreTexto = Math.max(0, scoreTexto - 35)
  }

  const mesmoSaborOuVariacao = recallInfo >= 0.7

  return {
    scoreTexto,
    mesmaGramatura,
    mesmoSaborOuVariacao,
    conflitoGramatura,
  }
}

/**
 * Função principal do Resolvedor de Produtos (reutilizável)
 */
export async function resolverProduto(
  input: ResolverProdutoInput,
  catalogoFornecido?: CatalogoProdutoContexto[],
  aliasesFornecidos?: ProductAliasRegistro[],
): Promise<ResolverProdutoResultado> {
  const termo = input.textoInformado.trim()
  const termoNorm = normalizarNomeProduto(termo)

  if (!termoNorm) {
    return {
      termoNormalizado: '',
      nivel: 'nao_identificado',
      candidatos: [],
      precisaConfirmacaoHumana: true,
      explicacao: 'Nenhum nome de produto foi fornecido para identificação.',
    }
  }

  // 1. Carregar Aliases e Catálogo se não injetados (permite testes unitários determinísticos)
  const aliases =
    aliasesFornecidos !== undefined
      ? aliasesFornecidos
      : await buscarAliasesConfirmados(termo, input.industriaNome)

  const catalogo =
    catalogoFornecido !== undefined
      ? catalogoFornecido
      : await carregarCatalogoContextual(input.industriaNome, input.industriaId, input.storeCode)

  const candidatos: CandidatoProdutoSugerido[] = []
  const indFiltro = input.industriaNome?.toUpperCase().trim() || ''

  // 2. Avaliar Aliases Confirmados (Atalhos de Aprendizado)
  let aliasMatchExato: ProductAliasRegistro | null = null
  let aliasGenericoFamilia: ProductAliasRegistro | null = null

  for (const al of aliases) {
    if (al.status !== 'ativo') continue

    // Restrição estrita de indústria: alias de outra indústria NÃO pode vencer
    if (
      indFiltro &&
      indFiltro !== 'TODAS' &&
      al.industria_nome.toUpperCase().trim() !== indFiltro
    ) {
      continue
    }

    const aNorm = al.alias_normalizado || normalizarNomeProduto(al.alias)
    if (aNorm === termoNorm) {
      if (al.tipo_alias === 'familia_generica') {
        aliasGenericoFamilia = al
      } else {
        aliasMatchExato = al
        break
      }
    } else if (termoNorm.startsWith(aNorm) || aNorm.startsWith(termoNorm)) {
      if (al.tipo_alias === 'familia_generica') {
        aliasGenericoFamilia = al
      }
    }
  }

  // 3. Avaliar Catálogo Contextual
  for (const prod of catalogo) {
    const mesmaIndustria =
      !indFiltro || indFiltro === 'TODAS' || prod.industria_nome.toUpperCase().trim() === indFiltro

    // RESTRIÇÃO DURA: Se pertencer a outra indústria e não for explicitamente permitido,
    // não permitir que vença por similaridade textual silenciosamente
    if (!mesmaIndustria && !input.permitirOutrasIndustrias) {
      continue
    }

    const afinidade = calcularAfinidadeProduto(termo, prod.nome)

    // Sinais explicáveis
    const sinais: Array<{ rotulo: string; presente: boolean }> = [
      { rotulo: 'Mesma indústria', presente: mesmaIndustria },
      { rotulo: 'Mix da loja', presente: Boolean(prod.noMixDefinidoLoja) },
      { rotulo: 'Já observado nesta loja', presente: Boolean(prod.noMixObservadoLoja) },
      { rotulo: 'Histórico na loja', presente: Boolean(prod.historicoNaLoja) },
    ]

    if (afinidade.mesmaGramatura === true) {
      sinais.push({ rotulo: 'Gramatura compatível', presente: true })
    }
    if (afinidade.mesmoSaborOuVariacao) {
      sinais.push({ rotulo: 'Sabor / atributos compatíveis', presente: true })
    }

    // Cálculo do Score de Ordenação com pesos contextualizados
    let score = afinidade.scoreTexto

    // Bônus de Indústria Correta
    if (mesmaIndustria) score += 30
    else score -= 50 // Incompatibilidade relevante

    // Bônus do Mix Definido da Loja
    if (prod.noMixDefinidoLoja) score += 15

    // Bônus do Mix Observado / Histórico Operacional
    if (prod.noMixObservadoLoja) score += 10
    if (prod.historicoNaLoja) score += 10

    // Bônus por alias direto conhecido
    let temAliasConhecido = false
    if (
      aliasMatchExato &&
      normalizarNomeProduto(aliasMatchExato.produto_oficial_nome) ===
        normalizarNomeProduto(prod.nome)
    ) {
      score += 40
      temAliasConhecido = true
      sinais.push({ rotulo: 'Alias confirmado', presente: true })
    }

    // Se houver conflito de gramatura ("40g" vs "80g"), penaliza severamente
    if (afinidade.conflitoGramatura) {
      score -= 30
    }

    // Filtrar candidatos com relevância mínima
    if (score > 35 || afinidade.scoreTexto >= 50 || temAliasConhecido) {
      // Determinar nível preliminar do candidato
      let nivelCand: NivelCorrespondenciaProduto = 'possivel'
      if (score >= 95 && mesmaIndustria && !afinidade.conflitoGramatura) {
        nivelCand = 'correspondencia_segura'
      } else if (score >= 75 && mesmaIndustria) {
        nivelCand = 'muito_provavel'
      } else if (afinidade.conflitoGramatura || score < 55) {
        nivelCand = 'ambigua'
      }

      let motivo = 'Correspondência parcial de palavras'
      if (temAliasConhecido) motivo = 'Alias confirmado anteriormente para este produto'
      else if (afinidade.scoreTexto === 100) motivo = 'Nome oficial exato'
      else if (prod.noMixDefinidoLoja) motivo = 'Compatível com o Mix Definido da Loja'
      else if (prod.historicoNaLoja) motivo = 'Produto já observado no histórico da loja'

      candidatos.push({
        codigo: prod.codigo,
        nome: prod.nome,
        industria_nome: prod.industria_nome,
        nivel: nivelCand,
        sinais,
        scoreOrdenacao: score,
        motivoPrincipal: motivo,
        aliasCorrespondente: temAliasConhecido ? aliasMatchExato?.alias : undefined,
      })
    }
  }

  // Ordenar candidatos pelo score composto decrescente
  candidatos.sort((a, b) => b.scoreOrdenacao - a.scoreOrdenacao)

  // 4. Tratamento especial de Alias de Família Genérica
  // Exemplo: "petizinho" -> Petit Suisse (mas sem sabor/gramatura, não deve forçar SKU específico sem confirmação)
  if (aliasGenericoFamilia && !aliasMatchExato) {
    const medTermo = extrairMedida(termo)
    const tokensTermo = extrairTokensRelevantes(termo)

    // Se o termo só tem o alias e falta sabor ou gramatura discriminante
    if (!medTermo && tokensTermo.length <= 2) {
      return {
        termoNormalizado: termoNorm,
        nivel: 'ambigua',
        candidatos: candidatos.slice(0, 5),
        aliasUtilizado: aliasGenericoFamilia.alias,
        precisaConfirmacaoHumana: true,
        explicacao: `O termo "${termo}" é um apelido de família ("${aliasGenericoFamilia.familia || 'Família'}"). Como não foi informado sabor ou gramatura específica, foram sugeridos os candidatos mais prováveis para confirmação humana.`,
      }
    }
  }

  // 5. Avaliação do Melhor Candidato e Regras de Segurança
  if (candidatos.length === 0) {
    return {
      termoNormalizado: termoNorm,
      nivel: 'nao_identificado',
      candidatos: [],
      precisaConfirmacaoHumana: true,
      explicacao: `Nenhum produto correspondente foi localizado no catálogo da indústria (${input.industriaNome || 'selecionada'}). Use a busca manual no catálogo completo.`,
    }
  }

  const top1 = candidatos[0]
  const top2 = candidatos.length > 1 ? candidatos[1] : null

  // Se houver dois candidatos muito próximos em score (diferença <= 10) e ambos com pontuação alta
  const haAmbiguidadeForte =
    top2 &&
    top1.scoreOrdenacao >= 70 &&
    top2.scoreOrdenacao >= 65 &&
    Math.abs(top1.scoreOrdenacao - top2.scoreOrdenacao) <= 12

  // Se o top1 tem conflito de gramatura ou há ambiguidade forte
  if (haAmbiguidadeForte) {
    return {
      termoNormalizado: termoNorm,
      nivel: 'ambigua',
      candidatos: candidatos.slice(0, 5),
      precisaConfirmacaoHumana: true,
      explicacao: `Foram encontrados múltiplos produtos muito parecidos (ex.: ${top1.nome} e ${top2.nome}). Exige confirmação humana para evitar associação a SKU incorreto.`,
    }
  }

  // REGRA DE CORRESPONDÊNCIA SEGURA (única que pode aplicar automaticamente sem clique manual)
  // Requisitos:
  // - Top1 com nível 'correspondencia_segura' (Score >= 95)
  // - Mesma indústria garantida
  // - Sem conflito de gramatura
  // - Distância significativa para o segundo candidato (se houver)
  const isSegura =
    top1.nivel === 'correspondencia_segura' &&
    (!top2 || top1.scoreOrdenacao - top2.scoreOrdenacao >= 20)

  if (isSegura) {
    return {
      termoNormalizado: termoNorm,
      nivel: 'correspondencia_segura',
      produtoOficial: {
        codigo: top1.codigo,
        nome: top1.nome,
        industria_nome: top1.industria_nome,
      },
      candidatos: candidatos.slice(0, 5),
      aliasUtilizado: top1.aliasCorrespondente,
      precisaConfirmacaoHumana: false,
      explicacao: `Correspondência segura identificada: "${top1.nome}" (${top1.motivoPrincipal}).`,
    }
  }

  // Demais casos: Muito provável / Possível / Ambígua
  const nivelFinal: NivelCorrespondenciaProduto =
    top1.scoreOrdenacao >= 75 ? 'muito_provavel' : 'possivel'

  return {
    termoNormalizado: termoNorm,
    nivel: nivelFinal,
    produtoOficial: {
      codigo: top1.codigo,
      nome: top1.nome,
      industria_nome: top1.industria_nome,
    },
    candidatos: candidatos.slice(0, 5),
    aliasUtilizado: top1.aliasCorrespondente,
    precisaConfirmacaoHumana: true,
    explicacao: `Sugestão provável encontrada: "${top1.nome}". Por segurança operacional, confirme a escolha ou selecione outro candidato.`,
  }
}
