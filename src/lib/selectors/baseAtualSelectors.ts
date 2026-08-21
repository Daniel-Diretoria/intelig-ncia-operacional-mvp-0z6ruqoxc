/**
 * Camada Central de Seletores e Normalização da Base Operacional.
 *
 * Garante que a MESMA fotografia da Base Atual alimenta todas as abas:
 * - validadesAtivas: is_base_atual=true, quantidade > 0, validade efetiva válida, dias > 0
 * - validadesAuditoria: dias <= 0 OU data inválida, com motivo explícito ("Vencido" ou "Data inválida")
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
  formatStoreIdentity,
  extractStoreRealCode,
  extractStoreCleanName,
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

/** Cache em memória para evitar requisições redundantes */
let cachedSnapshot: BaseAtualSnapshot | null = null
let fetchPromise: Promise<BaseAtualSnapshot> | null = null

/**
 * Lê da Base Atual de `validades_base` e `rupturas_base` e constrói a fotografia reconciliada.
 */
export async function getBaseAtualSnapshot(forceRefresh = false): Promise<BaseAtualSnapshot> {
  if (cachedSnapshot && !forceRefresh) {
    return cachedSnapshot
  }
  if (fetchPromise && !forceRefresh) {
    return fetchPromise
  }

  fetchPromise = (async () => {
    try {
      // 1. Busca validades_base (Base Atual)
      let validadesRecords: Array<Record<string, unknown>> = []
      try {
        validadesRecords = (await pb.collection('validades_base').getFullList({
          filter: 'is_base_atual = true',
          sort: '-created',
        })) as unknown as Array<Record<string, unknown>>
      } catch (err) {
        console.warn('[getBaseAtualSnapshot] Falha ao consultar validades_base:', err)
      }

      // 2. Busca rupturas_base (Base Atual)
      let rupturasRecords: Array<Record<string, unknown>> = []
      try {
        rupturasRecords = (await pb.collection('rupturas_base').getFullList({
          filter: 'is_base_atual = true',
          sort: '-created',
        })) as unknown as Array<Record<string, unknown>>
      } catch (err) {
        console.warn('[getBaseAtualSnapshot] Falha ao consultar rupturas_base:', err)
      }

      const hasBackendData = validadesRecords.length > 0 || rupturasRecords.length > 0

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
        const storeIdentity = formatStoreIdentity({
          codigo_loja: rawCode,
          nome_loja: rawName,
          razao_social: rec.razao_social as string,
        })
        const cleanStoreName = extractStoreCleanName({ codigo_loja: rawCode, nome_loja: rawName })
        const storeRealCode = extractStoreRealCode({ codigo_loja: rawCode, nome_loja: rawName })

        const rawSku = (rec.cod_produto || rec.cod_barras || '') as string
        const produtoNome = (rec.produto || 'Produto sem descrição') as string
        const { skuDisplay, hasRealSku } = formatProductSku(rawSku, produtoNome)

        const rawRede = (rec.rede || 'Rede não informada') as string
        const redeCanonica = normalizeNetworkName(rawRede)

        const cidade = (rec.cidade || '') as string
        const uf = (rec.estado || rec.uf || '') as string

        const cliente = (rec.cliente || rec.razao_social || cleanStoreName) as string
        const fornecedor = (rec.fornecedor || rec.representante || 'Diretoria') as string
        const lote = (rec.numero_lote || '') as string
        const promotor = (rec.colaborador || '') as string
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
          dataEntrada: entradaParsed ? entradaParsed.toISOString().slice(0, 10) : undefined,
          ultimaAtualizacao: rec.updated ? String(rec.updated) : undefined,
          chaveOperacional: (rec.chave_operacional as string) || undefined,
        }

        // Filtro de fotografia Base Atual:
        // - Ativas: quantidade > 0, data válida e dias > 0
        // - Auditoria: dias <= 0 OU data inválida
        if (parsedDate && dias !== null && dias > 0 && quantidade > 0) {
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
        const storeRealCode = extractStoreRealCode({ codigo_loja: rawCode, nome_loja: rawName })
        const storeIdFormatted = formatStoreIdentity({ codigo_loja: rawCode, nome_loja: rawName })
        const rupCidade = (rec.cidade || '') as string
        const rupUf = (rec.estado || rec.uf || '') as string

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
        const storedReads = localStorage.getItem('diretoria_read_alerts')
        if (storedReads) {
          JSON.parse(storedReads).forEach((id: string) => readAlertIds.add(id))
        }
      } catch {
        // ignore
      }

      for (const item of validadesAtivas) {
        if (item.status === 'Crítico' || item.status === 'Atenção' || item.status === 'Moderado') {
          const severidade: 'Crítico' | 'Atenção' | 'Moderado' =
            item.status === 'Crítico'
              ? 'Crítico'
              : item.status === 'Atenção'
                ? 'Atenção'
                : 'Moderado'

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

      // Agrega validades ativas e auditoria por loja
      const processItemForLoja = (item: ValidadeItem, isAuditoria = false) => {
        const code = item.codigoLoja || null
        const cleanName = item.loja
        const ident = formatStoreIdentity({ codigo_loja: code, nome_loja: cleanName })
        // Chave de agrupamento segura: se tem código, usa código. Se não, usa combinação normalizada de nome + cidade
        const lojaKey = code
          ? `COD_${code}`
          : `NAME_${cleanName.toLowerCase()}_${item.cidade.toLowerCase()}`

        let loja = lojasMap.get(lojaKey)
        if (!loja) {
          loja = {
            lojaKey,
            identidade: ident,
            codigoLoja: code,
            nomeLoja: cleanName,
            rede: item.rede,
            cidade: item.cidade,
            uf: item.uf,
            cidadeUf: formatCityUf(item.cidade, item.uf),
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
        const lojaKey = code ? `COD_${code}` : `NAME_${cleanName.toLowerCase()}`
        const loja = lojasMap.get(lojaKey)
        if (loja) {
          if (rup.situacao_atual === 'Ativo') {
            loja.totalRupturasAtivas++
          }
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

      const lojasAgregadas = Array.from(lojasMap.values()).sort((a, b) =>
        a.identidade.localeCompare(b.identidade, 'pt-BR'),
      )

      // Produtos distintos em risco (com código real ou nome normalizado)
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
      const clientesDistintosSet = new Set(
        validadesAtivas.map((i) => i.cliente.trim()).filter(Boolean),
      )

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

      cachedSnapshot = snapshot
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
  cachedSnapshot = null
  fetchPromise = null
}
