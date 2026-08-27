/**
 * Camada Central de Seletores e Normalização da Base Operacional.
 *
 * Garante que a MESMA fotografia da Base Atual alimenta todas as abas:
 * - validadesAtivas: is_base_atual=true, quantidade > 0, validade efetiva válida, dias >= 0
 * - validadesAuditoria: dias < 0 OU data inválida, com motivo explícito ("Vencido" ou "Data inválida")
 * - rupturasAtivas: is_base_atual=true
 * - alertasOperacionais: Crítico/Atenção/Moderado da Base Atual válida, dias > 0
 * - agregadosPorLoja
 * - KPIs reconciliados
 *
 * Se existirem dados reais no PocketBase, NUNCA complementa com mock.
 */
import pb from '@/lib/pocketbase/client'
import {
  parseOperationalDate,
  calcOperationalDays,
  formatDisplayDate,
  classifyOperationalStatus,
  type StatusOperacionalFaixa,
} from '@/lib/format/dateParser'
import {
  parseCityUf,
  formatStoreIdentity,
  buildStoreCompositeKey,
  extractStoreRealCode,
  extractStoreCleanName,
  deriveNetworkName,
  normalizeNetworkName,
  formatCityUf,
  formatProductSku,
} from '@/lib/format/storeIdentity'
import type { ValidadeItem, Ruptura, CriticidadeLevel } from '@/types'

export interface BaseAtualSnapshot {
  validadesAtivas: ValidadeItem[]
  validadesAuditoria: ValidadeItemAuditoria[]
  rupturasAtivas: Ruptura[]
  alertasOperacionais: AlertaOperacionalItem[]
  kpisReconciliados: KpisReconciliados
  lojasAgregadas: LojaAgregada[]
  loadedFromBackend: boolean
  timestamp: string
}

export interface ValidadeItemAuditoria extends ValidadeItem {
  motivoAuditoria: 'Vencido' | 'Data inválida'
  diasVencido: number
}

export interface AlertaOperacionalItem {
  id: string
  cliente: string
  industria: string
  produto: string
  codigoProduto: string
  sku: string
  lojaIdentidade: string
  codigoLoja: string | null
  nomeLoja: string
  validadeFormatada: string
  validadeRaw: string
  diasRestantes: number
  quantidade: number
  severidade: 'Crítico' | 'Atenção' | 'Moderado'
  status: CriticidadeLevel
  tipo: 'Validade'
  lido: boolean
  chaveOperacional: string
}

export interface KpisReconciliados {
  validadesAtivasTotal: number
  validadesCriticas: number
  validadesAtencao: number
  validadesModerado: number
  validadesNormal: number
  quantidadeTotalEmRisco: number
  produtosDistintosEmRisco: number
  lojasAfetadas: number
  clientesAfetados: number
  rupturasAtivasTotal: number
  alertasAbertosTotal: number
  auditoriaVencidosTotal: number
}

export interface LojaAgregada {
  lojaKey: string
  identidade: string
  codigoLoja: string | null
  nomeLoja: string
  rede: string
  cidade: string
  uf: string
  cidadeUf: string
  totalClientes: number
  totalOcorrenciasAtivas: number
  totalRupturasAtivas: number
  totalProdutosEmRisco: number
  totalQuantidade: number
  statusMaisCritico: StatusOperacionalFaixa
  itemsAtivos: ValidadeItem[]
  itemsAuditoria: ValidadeItemAuditoria[]
}

const VALIDATION_PROJECTION_FIELDS =
  'id,quantidade,validade_corrigida,validade_efetiva,validade_original,validade,codigo_loja,cod_cliente,nome_loja,razao_social,fantasia,cliente,cod_produto,cod_barras,produto,rede,cidade,estado,uf,fornecedor,representante,numero_lote,colaborador,cod_supervisor,supervisor,data_entrada,data_arquivo,created,updated,chave_operacional,is_base_atual'

const RUPTURA_PROJECTION_FIELDS =
  'id,codigo_loja,cod_cliente,nome_loja,razao_social,cliente,cnpj_loja,cnpj,cidade,estado,uf,codigo_cliente,produto,motivo,data_visita,situacao_atual,colaborador,promotor,data_entrada,primeira_ocorrencia,ultima_aparicao,categoria,observacao,dedup_key,source_import_id,source_row,chave_operacional,is_base_atual'

/**
 * Executa uma requisição de página individual com timeout de 15s (Promise.race)
 * e backoff controlado de 1 tentativa para HTTP 429 (delay de 2s).
 * NUNCA faz retry para outros erros.
 */
async function fetchSinglePage(
  collectionName: 'validades_base' | 'rupturas_base',
  page: number,
  perPage: number,
  fields: string,
  timeoutMs = 15000,
): Promise<{ items: Array<Record<string, unknown>>; totalPages: number; totalItems: number }> {
  const executeCall = async () => {
    const filter =
      collectionName === 'rupturas_base'
        ? 'is_base_atual = true && tenant_id !~ "tradepro_job_"'
        : 'is_base_atual = true'

    const pagePromise = pb.collection(collectionName).getList(page, perPage, {
      filter,
      sort: '-created',
      fields,
    })

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Timeout de ${timeoutMs}ms excedido na página ${page}`)),
        timeoutMs,
      ),
    )

    return (await Promise.race([pagePromise, timeoutPromise])) as {
      items: Array<Record<string, unknown>>
      totalPages: number
      totalItems: number
    }
  }

  try {
    return await executeCall()
  } catch (err: unknown) {
    const isRateLimit =
      (err &&
        typeof err === 'object' &&
        'status' in err &&
        (err as { status: number }).status === 429) ||
      (err instanceof Error && err.message.includes('429'))

    if (isRateLimit) {
      // 1 única tentativa com backoff controlado de 2s
      await new Promise((resolve) => setTimeout(resolve, 2000))
      return await executeCall()
    }
    throw err
  }
}

/**
 * Helper para carregar coleções com concorrência controlada (máximo 4 workers).
 * Algoritmo:
 * 1. Faz getList da página 1 para obter totalPages e os primeiros itens.
 * 2. Dispara páginas 2..totalPages em lotes concorrentes de até 4 workers com Promise.all.
 * 3. Coleta os itens na ordem correta (página 1, 2, 3...) independente da ordem de chegada.
 */
async function fetchPagedBaseRecords(
  collectionName: 'validades_base' | 'rupturas_base',
): Promise<Array<Record<string, unknown>>> {
  const perPage = 500
  const maxConcurrency = 4
  const fields =
    collectionName === 'validades_base' ? VALIDATION_PROJECTION_FIELDS : RUPTURA_PROJECTION_FIELDS

  // 1. Busca página 1
  let page1Res: { items: Array<Record<string, unknown>>; totalPages: number; totalItems: number }
  try {
    page1Res = await fetchSinglePage(collectionName, 1, perPage, fields)
  } catch (err) {
    console.warn(`[fetchPagedBaseRecords] Falha ao carregar página 1 de ${collectionName}:`, err)
    return []
  }

  const totalPages = page1Res.totalPages || 1
  const pagesData: Map<number, Array<Record<string, unknown>>> = new Map()
  pagesData.set(1, page1Res.items || [])

  if (totalPages > 1) {
    const remainingPages: number[] = []
    for (let p = 2; p <= totalPages; p++) {
      remainingPages.push(p)
    }

    // Processa em batches de maxConcurrency (4)
    for (let i = 0; i < remainingPages.length; i += maxConcurrency) {
      const batch = remainingPages.slice(i, i + maxConcurrency)
      const batchPromises = batch.map(async (pageNumber) => {
        try {
          const res = await fetchSinglePage(collectionName, pageNumber, perPage, fields)
          return { pageNumber, items: res.items || [] }
        } catch (err) {
          console.warn(
            `[fetchPagedBaseRecords] Falha ao carregar página ${pageNumber} de ${collectionName}:`,
            err,
          )
          return { pageNumber, items: [] }
        }
      })

      const batchResults = await Promise.all(batchPromises)
      for (const result of batchResults) {
        pagesData.set(result.pageNumber, result.items)
      }
    }
  }

  // Coleta os registros estritamente na ordem das páginas 1..totalPages
  const allRecords: Array<Record<string, unknown>> = []
  for (let p = 1; p <= totalPages; p++) {
    const items = pagesData.get(p)
    if (items && items.length > 0) {
      allRecords.push(...items)
    }
  }

  return allRecords
}

/** Configuração do Cache e SWR */
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutos (300.000ms)
const SWR_GRACE_MS = 2 * 60 * 1000 // 2 minutos adicionais para stale-while-revalidate

interface CacheEntry {
  snapshot: BaseAtualSnapshot
  cachedAt: number
}

let cachedEntry: CacheEntry | null = null
let fetchPromise: Promise<BaseAtualSnapshot> | null = null

// Configura listener global para 'diretoria:refresh'
if (typeof window !== 'undefined') {
  window.addEventListener('diretoria:refresh', () => {
    resetBaseAtualCache()
  })
}

/**
 * Constrói o snapshot processando validades e rupturas.
 */
async function buildSnapshotFromBackend(): Promise<{
  snapshot: BaseAtualSnapshot
  validadesCount: number
  rupturasCount: number
  totalPagesCount: number
}> {
  const startTime = Date.now()

  // 1. Busca validades_base (Base Atual)
  let validadesRecords: Array<Record<string, unknown>> = []
  try {
    validadesRecords = await fetchPagedBaseRecords('validades_base')
  } catch (err) {
    console.warn('[getBaseAtualSnapshot] Falha ao consultar validades_base:', err)
  }

  // 2. Busca rupturas_base (Base Atual)
  let rupturasRecords: Array<Record<string, unknown>> = []
  try {
    rupturasRecords = await fetchPagedBaseRecords('rupturas_base')
  } catch (err) {
    console.warn('[getBaseAtualSnapshot] Falha ao consultar rupturas_base:', err)
  }

  const hasBackendData = validadesRecords.length > 0 || rupturasRecords.length > 0
  const totalPagesCount =
    Math.ceil(validadesRecords.length / 500) + Math.ceil(rupturasRecords.length / 500)

  // Normaliza Validades
  const validadesAtivas: ValidadeItem[] = []
  const validadesAuditoria: ValidadeItemAuditoria[] = []

  for (const rec of validadesRecords) {
    const id = String(rec.id || '')
    const quantidade =
      typeof rec.quantidade === 'number'
        ? rec.quantidade
        : parseFloat(String(rec.quantidade || 0)) || 0

    // Validade efetiva com prioridade
    const rawValidade =
      rec.validade_corrigida || rec.validade_efetiva || rec.validade_original || rec.validade
    const parsedDate = parseOperationalDate(rawValidade)
    const dias = parsedDate ? calcOperationalDays(parsedDate) : null

    const rawCode = (rec.codigo_loja || rec.cod_cliente || '') as string
    const rawName = (rec.nome_loja ||
      rec.razao_social ||
      rec.fantasia ||
      rec.cliente ||
      '') as string
    const cleanStoreName = extractStoreCleanName({ codigo_loja: rawCode, nome_loja: rawName })
    const storeRealCode = extractStoreRealCode({ codigo_loja: rawCode, nome_loja: rawName })

    const rawSku = (rec.cod_produto || rec.cod_barras || '') as string
    const produtoNome = (rec.produto || 'Produto sem descrição') as string
    const { skuDisplay } = formatProductSku(rawSku, produtoNome)

    // Deriva Rede/Bandeira prioritariamente pelo nome da loja / razão social para não absorver 'GRUPO PEREIRA' de fantasia genérica
    const rawRedeCandidate = (rawName ||
      rec.razao_social ||
      rec.rede ||
      rec.fantasia ||
      '') as string
    const derivedFromStore = deriveNetworkName(rawRedeCandidate)
    const redeCanonica =
      derivedFromStore !== 'Rede não identificada'
        ? derivedFromStore
        : normalizeNetworkName((rec.rede || rec.fantasia || rawName || '') as string)

    const rawCidade = (rec.cidade || '') as string
    const rawUf = (rec.estado || rec.uf || '') as string
    const { city: cidade, uf } = parseCityUf(rawCidade, rawUf)

    const cliente = (rec.cliente || rec.razao_social || cleanStoreName) as string
    const fornecedor = (rec.fornecedor || rec.representante || 'Diretoria') as string
    const lote = (rec.numero_lote || '') as string
    const promotor = (rec.colaborador || '') as string
    const codSupervisor = (rec.cod_supervisor || rec.codSupervisor || '') as string
    const supervisor = (rec.supervisor || '') as string

    // Data de entrada / última aparição
    const rawEntrada = rec.data_entrada || rec.data_arquivo || rec.created
    const entradaParsed = parseOperationalDate(rawEntrada)

    // Classificação operacional
    const statusOp = classifyOperationalStatus(dias)

    const item: ValidadeItem = {
      id,
      cliente,
      industria: fornecedor,
      rede: redeCanonica,
      loja: cleanStoreName,
      codigoLoja: storeRealCode || undefined,
      cidade,
      uf,
      product: produtoNome,
      category: 'Não informada',
      sku: skuDisplay,
      lote,
      quantidade,
      estoque: quantidade,
      unidade: 'UN',
      validade: parsedDate ? parsedDate.toISOString().slice(0, 10) : '',
      diasRestantes: dias ?? 0,
      status: statusOp,
      promotor,
      supervisor,
      codSupervisor: codSupervisor || undefined,
      dataEntrada: entradaParsed ? entradaParsed.toISOString().slice(0, 10) : undefined,
      ultimaAtualizacao: rec.updated ? String(rec.updated) : undefined,
      chaveOperacional: (rec.chave_operacional as string) || undefined,
    }

    // Filtro de fotografia Base Atual:
    // - Ativas: quantidade > 0, data válida e dias >= 0
    // - Auditoria: dias < 0 OU data inválida
    if (parsedDate && dias !== null && dias >= 0 && quantidade > 0) {
      validadesAtivas.push(item)
    } else {
      const motivo: 'Vencido' | 'Data inválida' = !parsedDate ? 'Data inválida' : 'Vencido'
      validadesAuditoria.push({
        ...item,
        motivoAuditoria: motivo,
        diasVencido: dias !== null ? Math.abs(dias) : 0,
      })
    }
  }

  // Normaliza Rupturas
  const rupturasAtivas: Ruptura[] = []
  for (const rec of rupturasRecords) {
    const rawCode = (rec.codigo_loja || rec.cod_cliente || '') as string
    const rawName = (rec.nome_loja || rec.razao_social || rec.cliente || '') as string
    const cleanStoreName = extractStoreCleanName({ codigo_loja: rawCode, nome_loja: rawName })
    const storeRealCode = extractStoreRealCode({
      codigo_loja: rawCode,
      nome_loja: rawName,
      razao_social: rec.razao_social as string,
    })
    const rawRupCidade = (rec.cidade || '') as string
    const rawRupUf = (rec.estado || rec.uf || '') as string
    const { city: rupCidade, uf: rupUf } = parseCityUf(rawRupCidade, rawRupUf)

    const rawEntrada = rec.data_entrada || rec.primeira_ocorrencia || rec.data_visita
    const entradaParsed = parseOperationalDate(rawEntrada)
    const diasEmRuptura = entradaParsed ? calcOperationalDays(entradaParsed) : null
    const diasPositivos = diasEmRuptura !== null ? Math.abs(diasEmRuptura) : 0

    rupturasAtivas.push({
      id: String(rec.id || ''),
      operational_key: String(rec.chave_operacional || rec.id || ''),
      codigo_loja: storeRealCode || '',
      nome_loja: cleanStoreName,
      cnpj_loja: String(rec.cnpj_loja || rec.cnpj || ''),
      cidade: rupCidade,
      estado: rupUf,
      codigo_cliente: String(rec.codigo_cliente || rec.cod_cliente || ''),
      produto: String(rec.produto || 'Produto não informado'),
      motivo: (rec.motivo as Ruptura['motivo']) || 'Ruptura Total',
      data_visita: rec.data_visita ? String(rec.data_visita) : '',
      situacao_atual: (rec.situacao_atual as Ruptura['situacao_atual']) || 'Ativo',
      dias_em_ruptura: diasPositivos,
      cliente: (rec.cliente as string) || cleanStoreName,
      colaborador: (rec.colaborador as string) || (rec.promotor as string) || '',
      data_entrada: entradaParsed ? entradaParsed.toISOString().slice(0, 10) : '',
      ultima_aparicao: rec.ultima_aparicao
        ? String(rec.ultima_aparicao)
        : rec.data_visita
          ? String(rec.data_visita)
          : '',
      categoria: (rec.categoria as string) || '',
      observacao: (rec.observacao as string) || '',
      dedup_key: String(rec.dedup_key || ''),
      source_import_id: String(rec.source_import_id || ''),
      source_row: Number(rec.source_row || 0),
    })
  }

  // Gera Alertas Operacionais (apenas da Base Atual válida: Crítico, Atenção, Moderado com dias > 0)
  const alertasOperacionais: AlertaOperacionalItem[] = []
  const readAlertIds = new Set<string>()
  try {
    const storedReads =
      typeof localStorage !== 'undefined' ? localStorage.getItem('diretoria_read_alerts') : null
    if (storedReads) {
      JSON.parse(storedReads).forEach((id: string) => readAlertIds.add(id))
    }
  } catch {
    // ignore
  }

  for (const item of validadesAtivas) {
    if (item.status === 'Crítico' || item.status === 'Atenção' || item.status === 'Moderado') {
      const severidade: 'Crítico' | 'Atenção' | 'Moderado' =
        item.status === 'Crítico' ? 'Crítico' : item.status === 'Atenção' ? 'Atenção' : 'Moderado'

      const rawCode = item.codigoLoja || null
      const lojaIdent = formatStoreIdentity({ codigo_loja: rawCode, nome_loja: item.loja })

      alertasOperacionais.push({
        id: item.id,
        cliente: item.cliente,
        industria: item.industria,
        produto: item.product,
        codigoProduto: item.sku !== 'Código não informado' ? item.sku : '',
        sku: item.sku,
        lojaIdentidade: lojaIdent,
        codigoLoja: rawCode,
        nomeLoja: item.loja,
        validadeFormatada: formatDisplayDate(item.validade),
        validadeRaw: item.validade,
        diasRestantes: item.diasRestantes,
        quantidade: item.quantidade ?? item.estoque,
        severidade,
        status: item.status as CriticidadeLevel,
        tipo: 'Validade',
        lido: readAlertIds.has(item.id),
        chaveOperacional: item.chaveOperacional || item.id,
      })
    }
  }

  // Agregações por Loja
  const lojasMap = new Map<string, LojaAgregada>()

  const getCompositeKey = (
    code: string | null | undefined,
    name: string,
    rede: string,
    cidade: string,
    uf: string,
  ) => {
    return buildStoreCompositeKey({
      codigoLoja: code,
      nomeLoja: name,
      rede,
      cidade,
      uf,
    })
  }

  const processItemForLoja = (item: ValidadeItem, isAuditoria = false) => {
    const code = item.codigoLoja || null
    const cleanName = item.loja
    const ident = formatStoreIdentity({ codigo_loja: code, nome_loja: cleanName })
    const { city: itemCity, uf: itemUf } = parseCityUf(item.cidade, item.uf)
    const lojaKey = getCompositeKey(code, cleanName, item.rede, itemCity, itemUf)

    let loja = lojasMap.get(lojaKey)
    if (!loja) {
      loja = {
        lojaKey,
        identidade: ident,
        codigoLoja: code,
        nomeLoja: cleanName,
        rede: item.rede,
        cidade: itemCity,
        uf: itemUf,
        cidadeUf: formatCityUf(itemCity, itemUf),
        totalClientes: 0,
        totalOcorrenciasAtivas: 0,
        totalRupturasAtivas: 0,
        totalProdutosEmRisco: 0,
        totalQuantidade: 0,
        statusMaisCritico: 'Normal',
        itemsAtivos: [],
        itemsAuditoria: [],
      }
      lojasMap.set(lojaKey, loja)
    }

    if (isAuditoria) {
      loja.itemsAuditoria.push(item as ValidadeItemAuditoria)
    } else {
      loja.itemsAtivos.push(item)
      loja.totalOcorrenciasAtivas++
      loja.totalQuantidade += item.quantidade ?? item.estoque
      const itemStatus = classifyOperationalStatus(item.diasRestantes)
      const hierarchy: Record<StatusOperacionalFaixa, number> = {
        Vencido: 0,
        Crítico: 1,
        Atenção: 2,
        Moderado: 3,
        Normal: 4,
      }
      if (hierarchy[itemStatus] < hierarchy[loja.statusMaisCritico]) {
        loja.statusMaisCritico = itemStatus
      }
    }
  }

  validadesAtivas.forEach((i) => processItemForLoja(i, false))
  validadesAuditoria.forEach((i) => processItemForLoja(i, true))

  // Agrega rupturas ativas nas lojas
  for (const rup of rupturasAtivas) {
    const code = rup.codigo_loja || null
    const cleanName = rup.nome_loja
    const rupRede = deriveNetworkName(rup.nome_loja)
    const { city: rupCity, uf: rupState } = parseCityUf(rup.cidade, rup.estado)
    const lojaKey = getCompositeKey(code, cleanName, rupRede, rupCity, rupState)
    let loja = lojasMap.get(lojaKey)
    if (!loja) {
      const ident = formatStoreIdentity({ codigo_loja: code, nome_loja: cleanName })
      loja = {
        lojaKey,
        identidade: ident,
        codigoLoja: code,
        nomeLoja: cleanName,
        rede: rupRede,
        cidade: rupCity,
        uf: rupState,
        cidadeUf: formatCityUf(rupCity, rupState),
        totalClientes: 0,
        totalOcorrenciasAtivas: 0,
        totalRupturasAtivas: 0,
        totalProdutosEmRisco: 0,
        totalQuantidade: 0,
        statusMaisCritico: 'Normal',
        itemsAtivos: [],
        itemsAuditoria: [],
      }
      lojasMap.set(lojaKey, loja)
    }

    if (rup.situacao_atual === 'Ativo') {
      loja.totalRupturasAtivas++
    }
  }

  // Finaliza contagens de produtos distintos e clientes por loja
  for (const loja of lojasMap.values()) {
    const clientesSet = new Set<string>()
    const produtosSet = new Set<string>()
    loja.itemsAtivos.forEach((it) => {
      if (it.cliente) clientesSet.add(it.cliente)
      if (it.product) produtosSet.add(it.product)
    })
    loja.totalClientes = clientesSet.size || 1
    loja.totalProdutosEmRisco = produtosSet.size
  }

  // Merge pós-agregação: consolidar contagens e unificar UF
  const mergedMap = new Map<string, LojaAgregada>()
  const hierarchy: Record<StatusOperacionalFaixa, number> = {
    Vencido: 0,
    Crítico: 1,
    Atenção: 2,
    Moderado: 3,
    Normal: 4,
  }

  for (const entry of lojasMap.values()) {
    const normCode = entry.codigoLoja ? String(entry.codigoLoja).trim() : 'SEM_CODIGO'
    const normName = entry.nomeLoja.trim().toUpperCase()
    const normNetwork = entry.rede.trim().toUpperCase()
    const normCity = entry.cidade.trim().toUpperCase()
    const mergeKey = `${normCode}|${normName}|${normNetwork}|${normCity}`

    const existing = mergedMap.get(mergeKey)
    if (!existing) {
      mergedMap.set(mergeKey, {
        ...entry,
        itemsAtivos: [...entry.itemsAtivos],
        itemsAuditoria: [...entry.itemsAuditoria],
      })
    } else {
      if (!existing.uf && entry.uf) {
        existing.uf = entry.uf
        existing.cidadeUf = formatCityUf(existing.cidade, entry.uf)
        existing.lojaKey = getCompositeKey(
          existing.codigoLoja,
          existing.nomeLoja,
          existing.rede,
          existing.cidade,
          existing.uf,
        )
      }
      existing.totalOcorrenciasAtivas += entry.totalOcorrenciasAtivas
      existing.totalRupturasAtivas += entry.totalRupturasAtivas
      existing.totalQuantidade += entry.totalQuantidade
      existing.itemsAtivos.push(...entry.itemsAtivos)
      existing.itemsAuditoria.push(...entry.itemsAuditoria)

      if (hierarchy[entry.statusMaisCritico] < hierarchy[existing.statusMaisCritico]) {
        existing.statusMaisCritico = entry.statusMaisCritico
      }

      const clientesSet = new Set<string>()
      const produtosSet = new Set<string>()
      existing.itemsAtivos.forEach((it) => {
        if (it.cliente) clientesSet.add(it.cliente)
        if (it.product) produtosSet.add(it.product)
      })
      existing.totalClientes = clientesSet.size || 1
      existing.totalProdutosEmRisco = produtosSet.size
    }
  }

  // Segunda passagem de merge conservadora
  const isRedeVazia = (r: string) =>
    !r ||
    !r.trim() ||
    r.trim().toUpperCase() === 'REDE NÃO IDENTIFICADA' ||
    r.trim().toUpperCase() === 'REDE NÃO INFORMADA'

  const mergedEntries = Array.from(mergedMap.entries())
  const toDeleteKeys = new Set<string>()

  for (let i = 0; i < mergedEntries.length; i++) {
    const [keyA, entryA] = mergedEntries[i]
    if (toDeleteKeys.has(keyA)) continue

    const normCodeA = entryA.codigoLoja
      ? String(entryA.codigoLoja).trim().toUpperCase()
      : 'SEM_CODIGO'
    const normNameA = entryA.nomeLoja.trim().toUpperCase()
    const normCityA = entryA.cidade.trim().toUpperCase()

    for (let j = i + 1; j < mergedEntries.length; j++) {
      const [keyB, entryB] = mergedEntries[j]
      if (toDeleteKeys.has(keyB)) continue

      const normCodeB = entryB.codigoLoja
        ? String(entryB.codigoLoja).trim().toUpperCase()
        : 'SEM_CODIGO'
      const normNameB = entryB.nomeLoja.trim().toUpperCase()
      const normCityB = entryB.cidade.trim().toUpperCase()

      if (normCodeA === normCodeB && normNameA === normNameB && normCityA === normCityB) {
        const redeAVazia = isRedeVazia(entryA.rede)
        const redeBVazia = isRedeVazia(entryB.rede)
        const ufAVazia = !entryA.uf || !entryA.uf.trim()
        const ufBVazia = !entryB.uf || !entryB.uf.trim()

        const shouldMerge =
          (redeAVazia && !redeBVazia) ||
          (!redeAVazia && redeBVazia) ||
          (ufAVazia && !ufBVazia) ||
          (!ufAVazia && ufBVazia)

        if (shouldMerge) {
          if (redeAVazia && !redeBVazia) {
            entryA.rede = entryB.rede
          }
          if (ufAVazia && !ufBVazia) {
            entryA.uf = entryB.uf
            entryA.cidadeUf = formatCityUf(entryA.cidade, entryB.uf)
          } else if (!ufAVazia && ufBVazia && !entryA.cidadeUf) {
            entryA.cidadeUf = formatCityUf(entryA.cidade, entryA.uf)
          }

          entryA.lojaKey = getCompositeKey(
            entryA.codigoLoja,
            entryA.nomeLoja,
            entryA.rede,
            entryA.cidade,
            entryA.uf,
          )

          entryA.totalOcorrenciasAtivas += entryB.totalOcorrenciasAtivas
          entryA.totalRupturasAtivas += entryB.totalRupturasAtivas
          entryA.totalQuantidade += entryB.totalQuantidade

          entryA.itemsAtivos.push(...entryB.itemsAtivos)
          entryA.itemsAuditoria.push(...entryB.itemsAuditoria)

          if (hierarchy[entryB.statusMaisCritico] < hierarchy[entryA.statusMaisCritico]) {
            entryA.statusMaisCritico = entryB.statusMaisCritico
          }

          const clientesSet = new Set<string>()
          const produtosSet = new Set<string>()
          entryA.itemsAtivos.forEach((it) => {
            if (it.cliente) clientesSet.add(it.cliente)
            if (it.product) produtosSet.add(it.product)
          })
          entryA.totalClientes = clientesSet.size || 1
          entryA.totalProdutosEmRisco = produtosSet.size

          toDeleteKeys.add(keyB)
          mergedMap.delete(keyB)
        }
      }
    }
  }

  const lojasAgregadas = Array.from(mergedMap.values()).sort((a, b) =>
    a.identidade.localeCompare(b.identidade, 'pt-BR'),
  )

  // Produtos distintos em risco
  const produtosDistintosSet = new Set<string>()
  for (const item of validadesAtivas) {
    if (item.status === 'Crítico' || item.status === 'Atenção' || item.status === 'Moderado') {
      const key =
        item.sku && item.sku !== 'Código não informado'
          ? `SKU_${item.sku}`
          : `PROD_${item.product.toLowerCase().trim()}`
      produtosDistintosSet.add(key)
    }
  }

  // Clientes distintos
  const clientesDistintosSet = new Set(validadesAtivas.map((i) => i.cliente.trim()).filter(Boolean))

  // KPIs Reconciliados
  const validadesCriticas = validadesAtivas.filter((i) => i.status === 'Crítico').length
  const validadesAtencao = validadesAtivas.filter((i) => i.status === 'Atenção').length
  const validadesModerado = validadesAtivas.filter((i) => i.status === 'Moderado').length
  const validadesNormal = validadesAtivas.filter((i) => i.status === 'Normal').length
  const quantidadeTotalEmRisco = validadesAtivas
    .filter((i) => i.status === 'Crítico' || itemIsAtencaoOuModerado(i.status))
    .reduce((sum, i) => sum + (i.quantidade ?? i.estoque), 0)

  const snapshot: BaseAtualSnapshot = {
    validadesAtivas,
    validadesAuditoria,
    rupturasAtivas,
    alertasOperacionais,
    lojasAgregadas,
    loadedFromBackend: hasBackendData,
    timestamp: new Date().toISOString(),
    kpisReconciliados: {
      validadesAtivasTotal: validadesAtivas.length,
      validadesCriticas,
      validadesAtencao,
      validadesModerado,
      validadesNormal,
      quantidadeTotalEmRisco,
      produtosDistintosEmRisco: produtosDistintosSet.size,
      lojasAfetadas: lojasAgregadas.filter((l) => l.totalOcorrenciasAtivas > 0).length,
      clientesAfetados: clientesDistintosSet.size,
      rupturasAtivasTotal: rupturasAtivas.filter((r) => r.situacao_atual === 'Ativo').length,
      alertasAbertosTotal: alertasOperacionais.filter((a) => !a.lido).length,
      auditoriaVencidosTotal: validadesAuditoria.length,
    },
  }

  const durationMs = Date.now() - startTime
  const totalRows = validadesRecords.length + rupturasRecords.length
  // Estimativa sanitizada de bytes (~250 bytes por registro projetado)
  const approxBytes = totalRows * 250
  console.debug(
    `[Telemetry] BaseAtual carregada em ${durationMs}ms | páginas=${totalPagesCount} | cache=miss | registros=${totalRows} | bytesApprox=${approxBytes}`,
  )

  return {
    snapshot,
    validadesCount: validadesRecords.length,
    rupturasCount: rupturasRecords.length,
    totalPagesCount,
  }
}

/**
 * Lê da Base Atual de `validades_base` e `rupturas_base` e constrói a fotografia reconciliada.
 * Implementa cache em memória com TTL de 5 minutos e Stale-While-Revalidate (+2 minutos).
 */
export async function getBaseAtualSnapshot(forceRefresh = false): Promise<BaseAtualSnapshot> {
  const now = Date.now()

  // 1. Se forceRefresh=true, invalida cache imediatamente
  if (forceRefresh) {
    cachedEntry = null
  }

  // 2. Se cache existe e está fresco (< 5min)
  if (cachedEntry && !forceRefresh) {
    const age = now - cachedEntry.cachedAt
    if (age <= CACHE_TTL_MS) {
      console.debug(
        `[Telemetry] BaseAtual carregada em 0ms | páginas=0 | cache=hit | registros=${
          cachedEntry.snapshot.validadesAtivas.length + cachedEntry.snapshot.rupturasAtivas.length
        }`,
      )
      return cachedEntry.snapshot
    }

    // Se expirado mas dentro da janela SWR (5min..7min)
    if (age <= CACHE_TTL_MS + SWR_GRACE_MS) {
      console.debug(
        `[Telemetry] BaseAtual carregada em 0ms | páginas=0 | cache=swr | registros=${
          cachedEntry.snapshot.validadesAtivas.length + cachedEntry.snapshot.rupturasAtivas.length
        }`,
      )
      // Dispara revalidação em background se não houver uma em andamento
      if (!fetchPromise) {
        fetchPromise = (async () => {
          try {
            const { snapshot } = await buildSnapshotFromBackend()
            cachedEntry = { snapshot, cachedAt: Date.now() }
            return snapshot
          } finally {
            fetchPromise = null
          }
        })()
      }
      return cachedEntry.snapshot
    }
  }

  // 3. Coalescência de promessas (para StrictMode double-mount ou chamadas concorrentes)
  if (fetchPromise && !forceRefresh) {
    return fetchPromise
  }

  // 4. Busca fresh
  fetchPromise = (async () => {
    try {
      const { snapshot } = await buildSnapshotFromBackend()
      cachedEntry = { snapshot, cachedAt: Date.now() }
      return snapshot
    } finally {
      fetchPromise = null
    }
  })()

  return fetchPromise
}

function itemIsAtencaoOuModerado(st: StatusOperacionalFaixa): boolean {
  return st === 'Atenção' || st === 'Moderado'
}

/** Reseta cache quando houver importação ou refresh */
export function resetBaseAtualCache(): void {
  cachedEntry = null
  fetchPromise = null
}
