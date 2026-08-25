import { buildStoreCompositeKey, parseCityUf } from '@/lib/format/storeIdentity'
import type { ValidadeItem, Ruptura } from '@/types'

export interface SupervisorAttribution {
  /** Chave estável: cod_supervisor quando existir; fallback = nome normalizado; sem ambos = "sem-supervisor" */
  supervisorKey: string
  /** Nome de exibição */
  supervisorName: string
  /** Data do registro-fonte (Realizado mais recente) */
  sourceDate: string
}

export interface StoreSupervisorResolution {
  supervisorKey: string
  supervisorName: string
  supervisoresList: Array<{ nome: string; marcas: string[] }>
}

/**
 * Normaliza string para chave estável (trim, uppercase, sem acentos).
 */
export function normalizeSupervisorKey(text: string | null | undefined): string {
  if (!text) return ''
  return text
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
}

/**
 * Constrói a storeKey a partir dos campos de um ValidadeItem.
 */
function getValidadeStoreKey(item: ValidadeItem, fallbackStoreKey?: string): string {
  const { city, uf } = parseCityUf(item.cidade, item.uf)
  const key = buildStoreCompositeKey({
    codigoLoja: item.codigoLoja,
    nomeLoja: item.loja,
    rede: item.rede,
    cidade: city,
    uf,
  })
  return key || fallbackStoreKey || ''
}

/**
 * Extrai data para comparação (maior data ISO é a mais recente).
 */
function getItemDate(item: ValidadeItem): string {
  return item.dataEntrada || item.validade || item.ultimaAtualizacao || ''
}

/**
 * Resolve os supervisores para uma loja a partir de seus itens de validade e rupturas.
 *
 * Regras:
 * - Agrupa itemsAtivos por chave Loja×Marca = `${storeKey}|${cliente}`.
 * - Para cada grupo Loja×Marca, seleciona o item com `realizado` (dataEntrada/data) mais recente.
 * - Se codSupervisor não vazio -> supervisorKey = codSupervisor normalizado (trim, uppercase, sem acentos).
 *   Se vazio, use supervisor normalizado. Se ambos vazios -> "sem-supervisor".
 * - supervisorName = preserve o nome original mais legível do registro-fonte (ou "Sem supervisor definido" se vazio).
 * - No nível da loja: supervisorKey e supervisorName do registro-fonte globalmente mais recente da loja (entre todas as marcas).
 * - supervisoresList = array de { nome, marcas } distintos.
 * - Rupturas herdam supervisor do grupo Loja×Marca correspondente; sem correspondência -> "sem-supervisor".
 */
export function resolveStoreSupervisors(
  itemsAtivos: ValidadeItem[],
  rupturasList: Ruptura[] = [],
  explicitStoreKey?: string,
): StoreSupervisorResolution {
  if (!itemsAtivos || itemsAtivos.length === 0) {
    return {
      supervisorKey: 'sem-supervisor',
      supervisorName: 'Sem supervisor definido',
      supervisoresList: [],
    }
  }

  // 1. Agrupar itemsAtivos por Loja×Marca
  interface GroupInfo {
    storeKey: string
    cliente: string
    mostRecentItem: ValidadeItem
    mostRecentDate: string
  }

  const groupsMap = new Map<string, GroupInfo>()

  for (const item of itemsAtivos) {
    const storeKey = explicitStoreKey || getValidadeStoreKey(item)
    const cliente = (item.cliente || '').trim()
    const groupKey = `${storeKey}|${cliente}`
    const itemDate = getItemDate(item)

    const existing = groupsMap.get(groupKey)
    if (!existing) {
      groupsMap.set(groupKey, {
        storeKey,
        cliente,
        mostRecentItem: item,
        mostRecentDate: itemDate,
      })
    } else {
      // Compara datas lexicograficamente (ISO YYYY-MM-DD)
      if (itemDate > existing.mostRecentDate) {
        existing.mostRecentItem = item
        existing.mostRecentDate = itemDate
      }
    }
  }

  // 2. Para cada grupo Loja×Marca, resolver o supervisor
  interface ResolvedGroup {
    cliente: string
    attribution: SupervisorAttribution
  }

  const resolvedGroups: ResolvedGroup[] = []
  let globalMostRecentItem: ValidadeItem | null = null
  let globalMostRecentDate = ''

  for (const group of groupsMap.values()) {
    const it = group.mostRecentItem
    const date = group.mostRecentDate

    const rawCod = (it.codSupervisor || '').trim()
    const rawName = (it.supervisor || '').trim()

    let supervisorKey = 'sem-supervisor'
    let supervisorName = 'Sem supervisor definido'

    if (rawCod) {
      supervisorKey = normalizeSupervisorKey(rawCod)
      supervisorName = rawName || rawCod
    } else if (rawName) {
      supervisorKey = normalizeSupervisorKey(rawName)
      supervisorName = rawName
    }

    const attribution: SupervisorAttribution = {
      supervisorKey,
      supervisorName,
      sourceDate: date,
    }

    resolvedGroups.push({
      cliente: group.cliente,
      attribution,
    })

    // Avalia o global mais recente da loja
    if (!globalMostRecentItem || date > globalMostRecentDate) {
      globalMostRecentItem = it
      globalMostRecentDate = date
    }
  }

  // 3. Supervisor global da loja (do registro-fonte globalmente mais recente)
  let storeSupervisorKey = 'sem-supervisor'
  let storeSupervisorName = 'Sem supervisor definido'

  if (globalMostRecentItem) {
    const rawCod = (globalMostRecentItem.codSupervisor || '').trim()
    const rawName = (globalMostRecentItem.supervisor || '').trim()

    if (rawCod) {
      storeSupervisorKey = normalizeSupervisorKey(rawCod)
      storeSupervisorName = rawName || rawCod
    } else if (rawName) {
      storeSupervisorKey = normalizeSupervisorKey(rawName)
      storeSupervisorName = rawName
    }
  }

  // 4. Montar supervisoresList = array de { nome, marcas: string[] } distintos
  // Agrupar marcas por nome legível do supervisor
  const supToMarcasMap = new Map<string, Set<string>>()
  for (const rg of resolvedGroups) {
    const sName = rg.attribution.supervisorName
    if (sName && sName !== 'Sem supervisor definido') {
      let marcas = supToMarcasMap.get(sName)
      if (!marcas) {
        marcas = new Set<string>()
        supToMarcasMap.set(sName, marcas)
      }
      if (rg.cliente) {
        marcas.add(rg.cliente)
      }
    }
  }

  const supervisoresList = Array.from(supToMarcasMap.entries())
    .map(([nome, marcasSet]) => ({
      nome,
      marcas: Array.from(marcasSet).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

  return {
    supervisorKey: storeSupervisorKey,
    supervisorName: storeSupervisorName,
    supervisoresList,
  }
}
