import { useState, useEffect, useMemo, useCallback } from 'react'
import type {
  OperationalTrackingItem,
  OperationalTrackingSummary,
  ResearchCycle,
} from '@/types/operationalTracking'
import type {
  IndustryRegistry,
  IndustryResearchConfig,
  IndustryStoreProductMix,
  IndustryStoreCoverage,
  IndustryValidityPolicy,
} from '@/types/industryOperational'
import { useValidades } from './useValidades'
import { useRupturas } from './useRupturas'
import {
  getIndustryRegistries,
  getIndustryResearchConfigs,
  getIndustryStoreCoverages,
  getIndustryStoreProductMixes,
  getIndustryValidityPolicies,
} from './industryService'
import { runOperationalTrackingEngine } from '@/lib/tracking/operationalTrackingEngine'

export interface UseOperationalTrackingResult {
  isLoading: boolean
  industries: IndustryRegistry[]
  selectedIndustry: string
  setSelectedIndustry: (ind: string) => void
  items: OperationalTrackingItem[]
  summary: OperationalTrackingSummary
  cycles: ResearchCycle[]
  refetch: () => Promise<void>
}

export function useOperationalTracking(): UseOperationalTrackingResult {
  const { data: validades, isLoading: isLoadingValidades } = useValidades()
  const { filteredRupturas: rupturas, isLoading: isLoadingRupturas } = useRupturas()

  const [industries, setIndustries] = useState<IndustryRegistry[]>([])
  const [selectedIndustry, setSelectedIndustry] = useState<string>('')
  const [researchConfigs, setResearchConfigs] = useState<IndustryResearchConfig[]>([])
  const [coverages, setCoverages] = useState<IndustryStoreCoverage[]>([])
  const [storeMixes, setStoreMixes] = useState<IndustryStoreProductMix[]>([])
  const [validityPolicies, setValidityPolicies] = useState<IndustryValidityPolicy[]>([])
  const [isLoadingConfigs, setIsLoadingConfigs] = useState<boolean>(true)

  // 1. Carregar indústrias cadastradas
  useEffect(() => {
    let isMounted = true
    getIndustryRegistries().then((list) => {
      if (!isMounted) return
      setIndustries(list)
      if (list.length > 0 && !selectedIndustry) {
        setSelectedIndustry(list[0].nome)
      }
    })
    return () => {
      isMounted = false
    }
  }, [selectedIndustry])

  // 2. Carregar configurações da indústria selecionada
  const fetchConfigsForSelected = useCallback(async (indName: string) => {
    if (!indName) return
    setIsLoadingConfigs(true)
    try {
      const allInds = await getIndustryRegistries()
      const current = allInds.find(
        (i) => i.nome.trim().toUpperCase() === indName.trim().toUpperCase(),
      )
      const indId = current?.id || ''

      const [resConfigs, covs, smixes, policies] = await Promise.all([
        indId ? getIndustryResearchConfigs(indId) : Promise.resolve([]),
        indId ? getIndustryStoreCoverages(indId) : Promise.resolve([]),
        indId ? getIndustryStoreProductMixes(indId) : Promise.resolve([]),
        indId ? getIndustryValidityPolicies(indId) : Promise.resolve([]),
      ])

      setResearchConfigs(resConfigs)
      setCoverages(covs)
      setStoreMixes(smixes)
      setValidityPolicies(policies)
    } catch (err) {
      console.warn('[useOperationalTracking] Erro ao carregar configurações:', err)
    } finally {
      setIsLoadingConfigs(false)
    }
  }, [])

  useEffect(() => {
    if (selectedIndustry) {
      fetchConfigsForSelected(selectedIndustry)
    }
  }, [selectedIndustry, fetchConfigsForSelected])

  // 3. Executar o motor de acompanhamento operacional
  const engineResult = useMemo(() => {
    const validadesConfig = researchConfigs.find((c) => c.tipo_pesquisa === 'validades')
    const currentInd = industries.find(
      (i) => i.nome.trim().toUpperCase() === selectedIndustry.trim().toUpperCase(),
    )

    return runOperationalTrackingEngine({
      industryName: selectedIndustry,
      industryId: currentInd?.id,
      validades,
      rupturas,
      researchConfig: validadesConfig,
      storeCoverages: coverages,
      storeDefinedMixes: storeMixes,
      validityPolicies,
    })
  }, [
    selectedIndustry,
    industries,
    researchConfigs,
    coverages,
    storeMixes,
    validityPolicies,
    validades,
    rupturas,
  ])

  const isLoading = isLoadingValidades || isLoadingRupturas || isLoadingConfigs

  const refetch = useCallback(async () => {
    if (selectedIndustry) {
      await fetchConfigsForSelected(selectedIndustry)
    }
  }, [selectedIndustry, fetchConfigsForSelected])

  return {
    isLoading,
    industries,
    selectedIndustry,
    setSelectedIndustry,
    items: engineResult.items,
    summary: engineResult.summary,
    cycles: engineResult.cycles,
    refetch,
  }
}
