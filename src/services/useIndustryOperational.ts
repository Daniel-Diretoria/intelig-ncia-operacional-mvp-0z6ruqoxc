import { useState, useEffect, useCallback, useRef } from 'react'
import {
  getIndustryRegistries,
  getIndustryRegistryByIdOrKey,
  getIndustryStoreCoverages,
  getIndustryProductMix,
  getIndustryResearchConfigs,
  getIndustryValidityPolicies,
  getIndustryConfigAudits,
  saveIndustryRegistry,
  saveStoreCoverage,
  deleteStoreCoverage,
  saveProductMixItem,
  deleteProductMixItem,
  saveResearchConfig,
  saveValidityPolicy,
  deleteValidityPolicy,
  resolveValidityPolicy,
  type SaveIndustryInput,
  type SaveStoreCoverageInput,
  type SaveProductMixInput,
  type SaveResearchConfigInput,
  type SaveValidityPolicyInput,
} from '@/services/industryService'
import type {
  IndustryRegistry,
  IndustryStoreCoverage,
  IndustryProductMix,
  IndustryResearchConfig,
  IndustryValidityPolicy,
  IndustryConfigAudit,
  ResolvedValidityPolicy,
} from '@/types/industryOperational'

export interface UseIndustryOperationalResult {
  industry: IndustryRegistry | null
  coverages: IndustryStoreCoverage[]
  mix: IndustryProductMix[]
  researchConfigs: IndustryResearchConfig[]
  validityPolicies: IndustryValidityPolicy[]
  audits: IndustryConfigAudit[]
  isLoading: boolean
  error: Error | null
  refetch: () => Promise<void>
  saveIndustry: (input: SaveIndustryInput) => Promise<IndustryRegistry>
  saveCoverage: (input: SaveStoreCoverageInput) => Promise<IndustryStoreCoverage>
  removeCoverage: (id: string) => Promise<boolean>
  saveMixItem: (input: SaveProductMixInput) => Promise<IndustryProductMix>
  removeMixItem: (id: string) => Promise<boolean>
  saveResearch: (input: SaveResearchConfigInput) => Promise<IndustryResearchConfig>
  savePolicy: (input: SaveValidityPolicyInput) => Promise<IndustryValidityPolicy>
  removePolicy: (id: string) => Promise<boolean>
  resolvePolicyForProduct: (productName: string) => ResolvedValidityPolicy
}

export function useIndustryOperational(idOrKey?: string): UseIndustryOperationalResult {
  const [industry, setIndustry] = useState<IndustryRegistry | null>(null)
  const [coverages, setCoverages] = useState<IndustryStoreCoverage[]>([])
  const [mix, setMix] = useState<IndustryProductMix[]>([])
  const [researchConfigs, setResearchConfigs] = useState<IndustryResearchConfig[]>([])
  const [validityPolicies, setValidityPolicies] = useState<IndustryValidityPolicy[]>([])
  const [audits, setAudits] = useState<IndustryConfigAudit[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<Error | null>(null)
  const isMounted = useRef(true)

  const fetchData = useCallback(async () => {
    if (!idOrKey) {
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)
    try {
      const reg = await getIndustryRegistryByIdOrKey(idOrKey)
      if (!isMounted.current) return

      if (!reg) {
        setIndustry(null)
        setIsLoading(false)
        return
      }

      setIndustry(reg)

      // Carrega em paralelo todos os contextos operacionais
      const [covList, mixList, resList, polList, auditList] = await Promise.all([
        getIndustryStoreCoverages(reg.id),
        getIndustryProductMix(reg.id),
        getIndustryResearchConfigs(reg.id),
        getIndustryValidityPolicies(reg.id),
        getIndustryConfigAudits(reg.id),
      ])

      if (isMounted.current) {
        setCoverages(covList)
        setMix(mixList)
        setResearchConfigs(resList)
        setValidityPolicies(polList)
        setAudits(auditList)
      }
    } catch (err) {
      if (isMounted.current) {
        setError(err instanceof Error ? err : new Error('Erro ao carregar cadastro operacional'))
      }
    } finally {
      if (isMounted.current) {
        setIsLoading(false)
      }
    }
  }, [idOrKey])

  useEffect(() => {
    isMounted.current = true
    fetchData()
    return () => {
      isMounted.current = false
    }
  }, [fetchData])

  const handleSaveIndustry = async (input: SaveIndustryInput) => {
    const updated = await saveIndustryRegistry(input)
    await fetchData()
    return updated
  }

  const handleSaveCoverage = async (input: SaveStoreCoverageInput) => {
    const res = await saveStoreCoverage(input)
    await fetchData()
    return res
  }

  const handleRemoveCoverage = async (id: string) => {
    if (!industry) return false
    const ok = await deleteStoreCoverage(id, industry.id)
    if (ok) await fetchData()
    return ok
  }

  const handleSaveMix = async (input: SaveProductMixInput) => {
    const res = await saveProductMixItem(input)
    await fetchData()
    return res
  }

  const handleRemoveMix = async (id: string) => {
    if (!industry) return false
    const ok = await deleteProductMixItem(id, industry.id)
    if (ok) await fetchData()
    return ok
  }

  const handleSaveResearch = async (input: SaveResearchConfigInput) => {
    const res = await saveResearchConfig(input)
    await fetchData()
    return res
  }

  const handleSavePolicy = async (input: SaveValidityPolicyInput) => {
    const res = await saveValidityPolicy(input)
    await fetchData()
    return res
  }

  const handleRemovePolicy = async (id: string) => {
    const ok = await deleteValidityPolicy(id, industry?.id)
    if (ok) await fetchData()
    return ok
  }

  const handleResolvePolicy = (productName: string) => {
    return resolveValidityPolicy(productName, validityPolicies)
  }

  return {
    industry,
    coverages,
    mix,
    researchConfigs,
    validityPolicies,
    audits,
    isLoading,
    error,
    refetch: fetchData,
    saveIndustry: handleSaveIndustry,
    saveCoverage: handleSaveCoverage,
    removeCoverage: handleRemoveCoverage,
    saveMixItem: handleSaveMix,
    removeMixItem: handleRemoveMix,
    saveResearch: handleSaveResearch,
    savePolicy: handleSavePolicy,
    removePolicy: handleRemovePolicy,
    resolvePolicyForProduct: handleResolvePolicy,
  }
}

/** Hook leve para listar todas as indústrias cadastradas */
export function useIndustryRegistriesList() {
  const [registries, setRegistries] = useState<IndustryRegistry[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchList = useCallback(async () => {
    setIsLoading(true)
    try {
      const list = await getIndustryRegistries()
      setRegistries(list)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Erro ao listar indústrias'))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchList()
  }, [fetchList])

  return { registries, isLoading, error, refetch: fetchList }
}
