import PocketBase from 'pocketbase'
import { parseOperationalDate, formatDisplayDate, toOperationalIsoDate } from '../format/dateParser'
import { extractStoreRealCode } from '../format/storeIdentity'
import {
  buildStoreCanonicalKey,
  buildProductCanonicalKey,
  buildClientBrandKey,
  normalizeString,
  hasPackagingConflict,
} from './reconciliationKeys'
import type {
  CrossEvidence,
  MatchMethod,
  CrossEvidenceConfidence,
  ProposedStatus,
  ReconciliationResult,
} from '@/types'

export interface RupturaRecord {
  id: string
  produto?: string | null
  motivo?: string | null
  codigo_loja?: string | null
  nome_loja?: string | null
  cnpj_loja?: string | null
  cidade?: string | null
  estado?: string | null
  codigo_cliente?: string | null
  cliente?: string | null
  colaborador?: string | null
  categoria?: string | null
  observacao?: string | null
  data_visita?: string | null
  data_entrada?: string | null
  ultima_aparicao?: string | null
  situacao_atual?: string | null
  operational_key?: string | null
  dedup_key?: string | null
  is_base_atual?: boolean
  cod_produto?: string | null
}

export interface ValidadeRecord {
  id: string
  produto?: string | null
  cod_produto?: string | null
  cod_barras?: string | null
  cliente?: string | null
  fornecedor?: string | null
  razao_social?: string | null
  nome_loja?: string | null
  codigo_loja?: string | null
  cnpj?: string | null
  cpf_cnpj?: string | null
  cidade?: string | null
  estado?: string | null
  realizado?: string | Date | null
  validade_efetiva?: string | Date | null
  validade_original?: string | Date | null
  quantidade?: number | null
  is_base_atual?: boolean
  situacao_atual?: string | null
}

/**
 * Reconcilia uma Ruptura individual contra uma lista de registros de Validade.
 *
 * Regras:
 * 1. ruptureDate = parseOperationalDate(ruptura.data_visita). Se inválida -> retorna null.
 * 2. storeKeyRup = buildStoreCanonicalKey(ruptura)
 * 3. productKeyRup = buildProductCanonicalKey(ruptura)
 * 4. brandKeyRup = buildClientBrandKey(ruptura)
 *
 * Para cada validade em validadesRecentes:
 * 5. evidenceDate = parseOperationalDate(validade.realizado). Se inválida -> pula.
 * 6. expiryDate = parseOperationalDate(validade.validade_efetiva). Se inválida -> pula.
 * 7. Regra cronológica: evidenceDate > ruptureDate (estritamente posterior) ou mesmo dia inconclusivo.
 * 8. Mesmo dia: se evidenceDate.getTime() === ruptureDate.getTime(), marca como inconclusive (sem horário não dá para saber a ordem).
 * 9. Validade não vencida: expiryDate >= evidenceDate (na data da pesquisa, o produto não estava vencido).
 * 10. Quantidade > 0: validade.quantidade > 0.
 * 11. Mesma loja: buildStoreCanonicalKey(validade) === storeKeyRup.
 * 12. Match de produto:
 *     - Se cod_produto existe em AMBOS e coincide: high_code_product / high / inferred_resolved
 *     - Se nome exato (após normalização): medium_exact_name / medium / awaiting_review
 *     - Se nome similar (contains parcial) -> inconclusive / inconclusive / awaiting_review
 * 13. Cliente/marca: buildClientBrandKey(validade) deve ser igual a brandKeyRup. Se diferente -> inconclusive.
 * 14. Embalagem/peso: se o nome normalizado difere em número/gramatura (ex: "850g" vs "1,25kg"), NÃO match.
 * 15. resolutionDays = Math.floor((evidenceDate.getTime() - ruptureDate.getTime()) / 86400000)
 */
export function reconcileRuptureValidity(
  ruptura: RupturaRecord,
  validadesRecentes: ValidadeRecord[],
  _today: Date = new Date(),
): CrossEvidence | null {
  const ruptureDate = parseOperationalDate(ruptura.data_visita)
  if (!ruptureDate) return null
  const storeKeyRup = buildStoreCanonicalKey(ruptura)
  const productKeyRup = buildProductCanonicalKey(ruptura)
  const brandKeyRup = buildClientBrandKey(ruptura)
  const normRupProdName = normalizeString(ruptura.produto)

  let bestHighMatch: CrossEvidence | null = null
  let bestMediumMatch: CrossEvidence | null = null
  let bestInconclusiveMatch: CrossEvidence | null = null

  for (const validade of validadesRecentes) {
    const evidenceDate = parseOperationalDate(validade.realizado)
    if (!evidenceDate) continue

    const expiryDate = parseOperationalDate(validade.validade_efetiva)
    if (!expiryDate) continue

    // 10. Quantidade > 0
    const qty = Number(validade.quantidade || 0)
    if (qty <= 0) continue

    // 9. Validade não vencida na data da pesquisa: expiryDate >= evidenceDate
    if (expiryDate.getTime() < evidenceDate.getTime()) continue

    // 8 & 7. Ordem cronológica: evidenceDate >= ruptureDate
    if (evidenceDate.getTime() < ruptureDate.getTime()) {
      // Validade anterior à ruptura -> não cruza
      continue
    }

    const isSameDay = evidenceDate.getTime() === ruptureDate.getTime()

    // 11. Mesma loja
    const storeKeyVal = buildStoreCanonicalKey(validade)
    if (storeKeyVal !== storeKeyRup) continue

    // 14. Checagem de embalagem/peso conflitante
    const normValProdName = normalizeString(validade.produto)
    if (hasPackagingConflict(normRupProdName, normValProdName)) {
      continue // Embalagens incompatíveis
    }

    // 12. Match de produto & código
    const codProdRup = ruptura.cod_produto ? String(ruptura.cod_produto).trim() : null
    const codProdVal = validade.cod_produto ? String(validade.cod_produto).trim() : null

    let matchMethod: MatchMethod = 'inconclusive'
    let confidence: CrossEvidenceConfidence = 'inconclusive'
    let proposedStatus: ProposedStatus = 'awaiting_review'

    const bothHaveCode = Boolean(
      codProdRup && codProdVal && codProdRup !== 'undefined' && codProdVal !== 'undefined',
    )

    if (bothHaveCode) {
      if (codProdRup === codProdVal) {
        matchMethod = 'high_code_product'
        confidence = 'high'
        proposedStatus = 'inferred_resolved'
      } else {
        // Códigos diferentes -> não match!
        continue
      }
    } else if (normRupProdName && normValProdName && normRupProdName === normValProdName) {
      // Mesmo nome exato
      matchMethod = 'medium_exact_name'
      confidence = 'medium'
      proposedStatus = 'awaiting_review'
    } else if (
      normRupProdName &&
      normValProdName &&
      (normRupProdName.includes(normValProdName) || normValProdName.includes(normRupProdName))
    ) {
      // Nome similar / contains parcial
      matchMethod = 'inconclusive'
      confidence = 'inconclusive'
      proposedStatus = 'awaiting_review'
    } else {
      // Produtos completamente diferentes
      continue
    }

    // 13. Cliente / Marca
    const brandKeyVal = buildClientBrandKey(validade)
    if (brandKeyRup && brandKeyVal && brandKeyRup !== brandKeyVal) {
      matchMethod = 'inconclusive'
      confidence = 'inconclusive'
      proposedStatus = 'awaiting_review'
    }

    // 8. Mesmo dia sem hora -> inconclusivo
    if (isSameDay) {
      matchMethod = 'inconclusive'
      confidence = 'inconclusive'
      proposedStatus = 'inconclusive'
    }

    const resolutionDays = Math.floor((evidenceDate.getTime() - ruptureDate.getTime()) / 86400000)

    const storeRealCode =
      extractStoreRealCode({
        codigo_loja: ruptura.codigo_loja,
        razao_social: ruptura.nome_loja,
      }) || ''

    const evidence: CrossEvidence = {
      rupture_record_id: ruptura.id,
      validity_record_id: validade.id,
      store_code: storeRealCode,
      store_name: ruptura.nome_loja || validade.razao_social || validade.nome_loja || '',
      store_key: storeKeyRup,
      product_code: validade.cod_produto ? String(validade.cod_produto) : '',
      product_name: ruptura.produto || validade.produto || '',
      product_key: productKeyRup,
      client_or_brand: ruptura.cliente || validade.cliente || '',
      rupture_detected_at: toOperationalIsoDate(ruptureDate) || '',
      stock_evidence_at: toOperationalIsoDate(evidenceDate) || '',
      quantity_found: qty,
      product_expiry_date: toOperationalIsoDate(expiryDate) || '',
      resolution_days: Math.max(0, resolutionDays),
      match_method: matchMethod,
      confidence: confidence,
      proposed_status: proposedStatus,
      review_status: 'pending',
      engine_version: '1.0.0',
      evidence_key: `${ruptura.id}|${validade.id}`,
    }

    if (confidence === 'high') {
      if (!bestHighMatch || evidence.resolution_days < bestHighMatch.resolution_days) {
        bestHighMatch = evidence
      }
    } else if (confidence === 'medium') {
      if (!bestMediumMatch || evidence.resolution_days < bestMediumMatch.resolution_days) {
        bestMediumMatch = evidence
      }
    } else {
      if (!bestInconclusiveMatch) {
        bestInconclusiveMatch = evidence
      }
    }
  }

  // Retorna na prioridade: High > Medium > Inconclusive > null
  if (bestHighMatch) return bestHighMatch
  if (bestMediumMatch) return bestMediumMatch
  if (bestInconclusiveMatch) return bestInconclusiveMatch

  return null
}

/**
 * Função batch principal que executa a reconciliação em modo Shadow no PocketBase.
 *
 * 1. NUNCA altera ou exclui validades_base nem rupturas_base.
 * 2. Busca rupturas ativas e validades ativas.
 * 3. Cruza ocorrências de forma idempotente em lotes de 50.
 * 4. Persiste evidências SOMENTE em operational_cross_evidence.
 */
/**
 * Helper interno paginado que consome registros de uma coleção usando `getList`
 * em lotes controlados até cobrir `totalItems` ou esgotar páginas.
 */
export async function fetchAllPaginated<T>(
  pb: PocketBase,
  collection: string,
  filter?: string,
  sort?: string,
  pageSize = 200,
  fields?: string,
): Promise<T[]> {
  const results: T[] = []
  let page = 1

  while (true) {
    const list = await pb.collection(collection).getList<T>(page, pageSize, {
      filter: filter || undefined,
      sort: sort || undefined,
      fields: fields || undefined,
    })

    results.push(...list.items)

    // Se a página retornou menos itens que o pageSize ou atingiu o totalItems, encerra
    if (
      list.items.length < pageSize ||
      results.length >= list.totalItems ||
      list.page >= list.totalPages
    ) {
      break
    }

    page++
  }

  return results
}

export async function runShadowReconciliation(
  pb: PocketBase,
  options?: { storeCode?: string; force?: boolean },
): Promise<ReconciliationResult> {
  const result: ReconciliationResult = {
    rupturasAnalisadas: 0,
    validadesAnalisadas: 0,
    evidenciasGeradas: 0,
    high: 0,
    medium: 0,
    inconclusive: 0,
    reopened: 0,
    semCorrespondencia: 0,
    erros: 0,
    detalhes: [],
  }

  try {
    // 1. Buscar rupturas ativas oficiais com paginação controlada
    let ruptureFilter =
      "is_base_atual = true && situacao_atual = 'Ativo' && tenant_id !~ 'tradepro_job_'"
    if (options?.storeCode) {
      ruptureFilter += ` && (codigo_loja = '${options.storeCode}' || nome_loja ~ '${options.storeCode}')`
    }

    const rupturas = await fetchAllPaginated<RupturaRecord>(
      pb,
      'rupturas_base',
      ruptureFilter,
      '-data_visita',
      200,
    )

    result.rupturasAnalisadas = rupturas.length

    // 2. Buscar validades ativas com quantidade > 0 com paginação controlada
    let validadesFilter = 'is_base_atual = true && quantidade > 0'
    if (options?.storeCode) {
      validadesFilter += ` && (codigo_loja = '${options.storeCode}' || razao_social ~ '${options.storeCode}')`
    }

    const validades = await fetchAllPaginated<ValidadeRecord>(
      pb,
      'validades_base',
      validadesFilter,
      '-realizado',
      200,
    )

    result.validadesAnalisadas = validades.length

    // 3. Buscar evidências já existentes com paginação controlada
    const existingEvidences = await fetchAllPaginated<CrossEvidence>(
      pb,
      'operational_cross_evidence',
      undefined,
      undefined,
      200,
      'id,evidence_key,rupture_record_id,validity_record_id,review_status,store_key,product_key,client_or_brand,proposed_status',
    )

    const existingKeysMap = new Map<string, CrossEvidence>()
    const confirmedEvidencesMap = new Map<string, CrossEvidence>() // chave store_key|product_key|brand_key

    existingEvidences.forEach((ev) => {
      existingKeysMap.set(ev.evidence_key, ev)
      if (ev.review_status === 'confirmed') {
        const tripleKey = `${ev.store_key}|${ev.product_key}|${ev.client_or_brand}`
        confirmedEvidencesMap.set(tripleKey, ev)
      }
    })

    // Agrupar validades por store_key para otimizar busca O(1)
    const validadesByStore = new Map<string, ValidadeRecord[]>()
    for (const val of validades) {
      const sKey = buildStoreCanonicalKey(val)
      if (!validadesByStore.has(sKey)) {
        validadesByStore.set(sKey, [])
      }
      validadesByStore.get(sKey)!.push(val)
    }

    // 4. Processar cada ruptura em lotes
    const BATCH_SIZE = 50
    const nowIso = new Date().toISOString()
    const today = new Date()

    for (let i = 0; i < rupturas.length; i += BATCH_SIZE) {
      const batchRupturas = rupturas.slice(i, i + BATCH_SIZE)

      for (const rup of batchRupturas) {
        try {
          const storeKeyRup = buildStoreCanonicalKey(rup)
          const productKeyRup = buildProductCanonicalKey(rup)
          const brandKeyRup = buildClientBrandKey(rup)
          const tripleKey = `${storeKeyRup}|${productKeyRup}|${brandKeyRup}`

          // Se force === false, pula se esta ruptura já tem evidência registrada
          if (!options?.force) {
            const hasExistingForRupture = existingEvidences.some(
              (e) => e.rupture_record_id === rup.id,
            )
            if (hasExistingForRupture) {
              continue
            }
          }

          const storeValidades = validadesByStore.get(storeKeyRup) || []

          // Reconcilia
          const evidence = reconcileRuptureValidity(rup, storeValidades, today)

          if (!evidence) {
            result.semCorrespondencia++
            continue
          }

          // 7. Verificar "reopened": se esta chave loja+produto+marca já teve evidência confirmada
          // e agora surge nova ruptura com data_visita mais recente
          if (confirmedEvidencesMap.has(tripleKey)) {
            const previousConfirmed = confirmedEvidencesMap.get(tripleKey)!
            if (previousConfirmed.rupture_record_id !== rup.id) {
              evidence.proposed_status = 'reopened'
            }
          }

          // Verificar se a evidência já existe no banco (idempotência)
          const existing = existingKeysMap.get(evidence.evidence_key)
          if (existing) {
            // Já existe, não sobrescreve a revisão humana
            continue
          }

          // Salvar nova evidência no PocketBase
          const payload = {
            ...evidence,
            created_at: nowIso,
            updated_at: nowIso,
          }

          const createdRec = await pb.collection('operational_cross_evidence').create(payload)
          existingKeysMap.set(evidence.evidence_key, createdRec as unknown as CrossEvidence)

          result.evidenciasGeradas++
          if (evidence.proposed_status === 'reopened') {
            result.reopened++
          } else if (evidence.confidence === 'high') {
            result.high++
          } else if (evidence.confidence === 'medium') {
            result.medium++
          } else {
            result.inconclusive++
          }
        } catch (rowErr) {
          result.erros++
          console.error(`Erro ao processar ruptura ${rup.id}:`, rowErr)
        }
      }
    }

    result.detalhes?.push(
      `Confronto concluído: ${result.evidenciasGeradas} evidências geradas (Alta: ${result.high}, Média: ${result.medium}, Inconclusivo: ${result.inconclusive}, Reabertas: ${result.reopened}).`,
    )
  } catch (err) {
    console.error('Erro global na execução do Shadow Reconciliation:', err)
    result.erros++
    result.detalhes?.push(`Erro geral: ${(err as Error).message}`)
  }

  return result
}
