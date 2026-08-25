import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Store,
  AlertTriangle,
  CalendarClock,
  Package,
  Search,
  Download,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  ChevronRight as BreadcrumbSeparator,
  X,
  Info,
  ArrowLeft,
} from 'lucide-react'
import { useLojas, type StoreSummary } from '@/services/useLojas'
import type { ValidadeItem, Ruptura } from '@/types'
import {
  formatStoreIdentityTable,
  formatCityUf,
  buildCityUfCanonicalizer,
} from '@/lib/format/storeIdentity'
import { formatDisplayDate } from '@/lib/format/dateParser'
import { classificarCriticidade } from '@/lib/data/criticidade'
import { getAcaoRecomendada } from '@/lib/resolve/acaoRecomendada'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useToast } from '@/hooks/use-toast'
import {
  exportLojasTableViewXLSX,
  exportSupervisorDrillLojasXLSX,
  exportSupervisorDrillProdutosXLSX,
  type SupervisorDrillProductRow,
} from '@/lib/export/lojasTableViewExport'

type PageSizeOption = 25 | 50 | 100

interface FilterState {
  search: string
  marca: string
  rede: string
  cidade: string
  uf: string
  situacao: 'Todas' | 'Críticas' | 'Casos complexos' | 'Com rupturas'
}

const initialFilterState: FilterState = {
  search: '',
  marca: 'Todas as marcas',
  rede: 'Todas as redes',
  cidade: 'Todas as cidades',
  uf: 'Todos os estados',
  situacao: 'Todas',
}

export const LojasPage: React.FC = () => {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { toast } = useToast()

  const [filterState, setFilterState] = useState<FilterState>(initialFilterState)

  // Leitura do estado de Drill e Supervisor a partir dos Search Params da URL
  const urlSupervisor = searchParams.get('supervisor') || 'Todos'
  const urlDrill = searchParams.get('drill') as 'lojas' | 'produtos' | null
  const urlIndicador = searchParams.get('indicador') as
    | 'todas'
    | 'criticas'
    | 'complexos'
    | 'rupturas'
    | null
  const urlLoja = searchParams.get('loja') || null

  const [selectedSupervisor, setSelectedSupervisor] = useState<string>(urlSupervisor)
  // KPI selecionado via clique rápido: 'criticas' | 'complexos' | 'rupturas' | null
  const [selectedKpi, setSelectedKpi] = useState<'criticas' | 'complexos' | 'rupturas' | null>(
    () => {
      if (
        urlIndicador === 'criticas' ||
        urlIndicador === 'complexos' ||
        urlIndicador === 'rupturas'
      ) {
        return urlIndicador
      }
      return null
    },
  )

  // Sincroniza estado de supervisor/kpi quando a URL muda
  useEffect(() => {
    const currentSup = searchParams.get('supervisor') || 'Todos'
    setSelectedSupervisor(currentSup)

    const ind = searchParams.get('indicador') as
      | 'todas'
      | 'criticas'
      | 'complexos'
      | 'rupturas'
      | null
    if (ind === 'criticas' || ind === 'complexos' || ind === 'rupturas') {
      setSelectedKpi(ind)
    } else {
      setSelectedKpi(null)
    }
  }, [searchParams])

  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState<PageSizeOption>(25)

  // Sincroniza KPI selecionado com o filtro de situação
  const effectiveSituacao = useMemo(() => {
    if (selectedKpi === 'criticas') return 'Críticas'
    if (selectedKpi === 'complexos') return 'Casos complexos'
    if (selectedKpi === 'rupturas') return 'Com rupturas'
    return filterState.situacao
  }, [selectedKpi, filterState.situacao])

  const { stores, filteredStores, isLoading, error, refetch } = useLojas({
    search: filterState.search.trim() || undefined,
    marca: filterState.marca !== 'Todas as marcas' ? filterState.marca : undefined,
    networkName: filterState.rede !== 'Todas as redes' ? filterState.rede : undefined,
    cityUf: filterState.cidade !== 'Todas as cidades' ? filterState.cidade : undefined,
    uf: filterState.uf !== 'Todos os estados' ? filterState.uf : undefined,
    situacao: effectiveSituacao !== 'Todas' ? effectiveSituacao : undefined,
  })

  // Supervisores distintos derivados de stores
  const supervisoresUnicos = useMemo(() => {
    const map = new Map<string, string>() // key -> displayName
    for (const s of stores) {
      if (s.supervisorKey && !map.has(s.supervisorKey)) {
        map.set(s.supervisorKey, s.supervisorName || s.supervisorKey)
      }
    }
    const sorted = Array.from(map.entries())
      .filter(([k]) => k !== 'sem-supervisor')
      .sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'))
    const semSupervisor = map.get('sem-supervisor')
    if (semSupervisor) {
      sorted.push(['sem-supervisor', semSupervisor])
    }
    return sorted
  }, [stores])

  // Lojas filtradas por supervisor combinadas com os demais filtros
  const supervisorFilteredStores = useMemo(() => {
    if (selectedSupervisor === 'Todos') return filteredStores
    if (selectedSupervisor === 'sem-supervisor') {
      return filteredStores.filter((s) => s.supervisorKey === 'sem-supervisor')
    }
    return filteredStores.filter((s) => s.supervisorKey === selectedSupervisor)
  }, [filteredStores, selectedSupervisor])

  // KPIs normais (quando selectedSupervisor === 'Todos') calculados estritamente sobre filteredStores
  const kpis = useMemo(() => {
    const total = filteredStores.length
    const criticas = filteredStores.filter((s) => s.situacao === 'Crítica').length
    // "Casos complexos" = lojas com ao menos 1 validade 0-15d
    const complexos = filteredStores.filter((s) => s.validadesCriticasCount > 0).length
    // "Lojas com rupturas" = lojas com ao menos 1 ruptura ativa
    const comRupturas = filteredStores.filter((s) => s.rupturasAtivasCount > 0).length

    return {
      total,
      criticas,
      complexos,
      comRupturas,
    }
  }, [filteredStores])

  // KPIs de supervisor (quando selectedSupervisor !== 'Todos')
  // Card 1 — Lojas sob responsabilidade: supervisorFilteredStores.length
  // Card 2 — Lojas com atenção urgente: lojas onde validadesCriticasCount > 0 || rupturasAtivasCount > 0 (conte loja UMA vez)
  // Card 3 — Validades críticas 0-15 dias: lojas com ao menos 1 validade crítica (para bater com filtro de tabela) / ou contagem correspondente ao clique
  // Conforme regra: O total em cada card DEVE ser exatamente igual ao total de registros exibidos na tabela após o clique.
  // Card 1 -> Todas as lojas do supervisor: supervisorFilteredStores.length
  // Card 2 -> situacao: 'Críticas' -> supervisorFilteredStores.filter(s => s.situacao === 'Crítica').length (lojas com validadesCriticas > 0 || rupturasAtivas > 0)
  // Card 3 -> situacao: 'Casos complexos' -> supervisorFilteredStores.filter(s => s.validadesCriticasCount > 0).length
  // Card 4 -> situacao: 'Com rupturas' -> supervisorFilteredStores.filter(s => s.rupturasAtivasCount > 0).length
  const supervisorKpis = useMemo(() => {
    const totalLojas = supervisorFilteredStores.length
    const atencaoUrgente = supervisorFilteredStores.filter(
      (s) => s.validadesCriticasCount > 0 || s.rupturasAtivasCount > 0,
    ).length
    const validadesCriticas = supervisorFilteredStores.filter(
      (s) => s.validadesCriticasCount > 0,
    ).length
    const rupturasAtivas = supervisorFilteredStores.filter((s) => s.rupturasAtivasCount > 0).length

    return {
      totalLojas,
      atencaoUrgente,
      validadesCriticas,
      rupturasAtivas,
    }
  }, [supervisorFilteredStores])

  // Lojas a exibir na tabela e paginação:
  const displayStores = supervisorFilteredStores

  // Determinação do indicador ativo no drill
  const currentIndicador: 'todas' | 'criticas' | 'complexos' | 'rupturas' = useMemo(() => {
    if (
      urlIndicador === 'criticas' ||
      urlIndicador === 'complexos' ||
      urlIndicador === 'rupturas'
    ) {
      return urlIndicador
    }
    if (selectedKpi) return selectedKpi
    return 'todas'
  }, [urlIndicador, selectedKpi])

  // Lojas filtradas para o Drill Nível 1 conforme o indicador
  const drillLojas = useMemo(() => {
    if (currentIndicador === 'criticas') {
      return supervisorFilteredStores.filter(
        (s) => s.validadesCriticasCount > 0 || s.rupturasAtivasCount > 0,
      )
    }
    if (currentIndicador === 'complexos') {
      return supervisorFilteredStores.filter((s) => s.validadesCriticasCount > 0)
    }
    if (currentIndicador === 'rupturas') {
      return supervisorFilteredStores.filter((s) => s.rupturasAtivasCount > 0)
    }
    return supervisorFilteredStores
  }, [supervisorFilteredStores, currentIndicador])

  // Loja selecionada no Drill Nível 2
  const selectedDrillStore = useMemo(() => {
    if (urlDrill === 'produtos' && urlLoja) {
      const decodedLoja = decodeURIComponent(urlLoja)
      return (
        stores.find((s) => s.storeId === decodedLoja) ||
        stores.find((s) => s.storeCode === decodedLoja)
      )
    }
    return null
  }, [urlDrill, urlLoja, stores])

  // Produtos agrupados e mesclados para o Drill Nível 2
  const drillProdutos = useMemo(() => {
    if (!selectedDrillStore) return []

    const itemsAtivos = selectedDrillStore.itemsAtivos || []
    const rupturasList = selectedDrillStore.rupturasList || []

    // Filtragem de validades conforme o indicador
    let filteredValidades = itemsAtivos
    if (currentIndicador === 'criticas' || currentIndicador === 'complexos') {
      filteredValidades = itemsAtivos.filter((item) => item.diasRestantes <= 15)
    } else if (currentIndicador === 'rupturas') {
      filteredValidades = []
    }

    // Filtragem de rupturas conforme o indicador
    let filteredRupturas = rupturasList.filter((r) => r.situacao_atual === 'Ativo')
    if (currentIndicador === 'complexos') {
      filteredRupturas = []
    }

    // Agrupamento por cliente|produto normalizado
    interface GroupData {
      cliente: string
      produto: string
      validades: ValidadeItem[]
      rupturas: Ruptura[]
    }

    const groupsMap = new Map<string, GroupData>()

    const normalizeGroupKey = (cliente: string, produto: string) => {
      const normCli = (cliente || '').trim().toUpperCase()
      const normProd = (produto || '').trim().toUpperCase()
      return `${normCli}|${normProd}`
    }

    for (const v of filteredValidades) {
      const cli = (v.cliente || 'Sem Marca').trim()
      const prod = (v.product || 'Sem Produto').trim()
      const key = normalizeGroupKey(cli, prod)
      const existing = groupsMap.get(key) || {
        cliente: cli,
        produto: prod,
        validades: [],
        rupturas: [],
      }
      existing.validades.push(v)
      groupsMap.set(key, existing)
    }

    for (const r of filteredRupturas) {
      const cli = (r.cliente || 'Sem Marca').trim()
      const prod = (r.produto || 'Sem Produto').trim()
      const key = normalizeGroupKey(cli, prod)
      const existing = groupsMap.get(key) || {
        cliente: cli,
        produto: prod,
        validades: [],
        rupturas: [],
      }
      existing.rupturas.push(r)
      groupsMap.set(key, existing)
    }

    const rows: SupervisorDrillProductRow[] = []

    for (const group of groupsMap.values()) {
      const hasValidade = group.validades.length > 0
      const hasRuptura = group.rupturas.length > 0

      let tipoRisco: 'Validade' | 'Ruptura' | 'Ambos' = 'Validade'
      if (hasValidade && hasRuptura) {
        tipoRisco = 'Ambos'
      } else if (hasRuptura) {
        tipoRisco = 'Ruptura'
      }

      // Se tiver validades, pega a com menor validade / menor diasRestantes
      let primaryValidade: ValidadeItem | undefined
      if (hasValidade) {
        primaryValidade = [...group.validades].sort((a, b) => a.diasRestantes - b.diasRestantes)[0]
      }

      let primaryRuptura: Ruptura | undefined
      if (hasRuptura) {
        primaryRuptura = [...group.rupturas].sort((a, b) => {
          const diasA = a.dias_em_ruptura ?? 0
          const diasB = b.dias_em_ruptura ?? 0
          return diasB - diasA
        })[0]
      }

      const cliente = primaryValidade?.cliente || primaryRuptura?.cliente || group.cliente
      const produto = primaryValidade?.product || primaryRuptura?.produto || group.produto

      const rawRealizado = primaryValidade?.dataEntrada || primaryRuptura?.data_visita || ''
      const realizadoDisplay = formatDisplayDate(rawRealizado, '—')

      const validadeDisplay = primaryValidade
        ? formatDisplayDate(primaryValidade.validade, '—')
        : '—'
      const diasRestantes = primaryValidade ? primaryValidade.diasRestantes : null
      const diasEmRuptura = primaryRuptura ? (primaryRuptura.dias_em_ruptura ?? 0) : null
      const quantidade =
        primaryValidade?.quantidade !== undefined ? primaryValidade.quantidade : null

      let criticidade = '—'
      if (tipoRisco === 'Ambos') {
        criticidade = 'Crítica'
      } else if (tipoRisco === 'Validade' && primaryValidade) {
        criticidade = classificarCriticidade(primaryValidade.diasRestantes)
      } else if (tipoRisco === 'Ruptura') {
        criticidade = 'Ruptura'
      }

      const acaoRecomendada = getAcaoRecomendada(
        tipoRisco === 'Ambos' ? 'ambos' : tipoRisco === 'Validade' ? 'validade' : 'ruptura',
        diasRestantes ?? undefined,
        diasEmRuptura ?? undefined,
      )

      rows.push({
        cliente,
        produto,
        tipoRisco,
        realizado: realizadoDisplay,
        validade: validadeDisplay,
        diasRestantes,
        diasEmRuptura,
        quantidade,
        criticidade,
        acaoRecomendada,
      })
    }

    // Ordenação padrão dos produtos:
    // 1. Tipo "Ambos" primeiro, depois "Validade" com menor dias, depois "Ruptura" com maior dias
    rows.sort((a, b) => {
      if (a.tipoRisco === 'Ambos' && b.tipoRisco !== 'Ambos') return -1
      if (b.tipoRisco === 'Ambos' && a.tipoRisco !== 'Ambos') return 1

      if (a.tipoRisco === 'Validade' && b.tipoRisco === 'Validade') {
        return (a.diasRestantes ?? 999) - (b.diasRestantes ?? 999)
      }
      if (a.tipoRisco === 'Ruptura' && b.tipoRisco === 'Ruptura') {
        return (b.diasEmRuptura ?? 0) - (a.diasEmRuptura ?? 0)
      }
      return a.produto.localeCompare(b.produto, 'pt-BR')
    })

    return rows
  }, [selectedDrillStore, currentIndicador])

  // Indicador labels amigáveis
  const indicadorTitles: Record<string, string> = {
    todas: 'Lojas sob responsabilidade',
    criticas: 'Lojas com atenção urgente',
    complexos: 'Validades críticas 0-15d',
    rupturas: 'Rupturas ativas',
  }

  // Nome do supervisor selecionado
  const selectedSupervisorName = useMemo(() => {
    if (selectedSupervisor === 'Todos') return 'Todos'
    if (selectedSupervisor === 'sem-supervisor') return 'Sem supervisor definido'
    const found = supervisoresUnicos.find(([k]) => k === selectedSupervisor)
    return found ? found[1] : selectedSupervisor
  }, [selectedSupervisor, supervisoresUnicos])

  // Navegação Drill Helpers
  const handleEnterDrillLevel1 = useCallback(
    (indicador: 'todas' | 'criticas' | 'complexos' | 'rupturas') => {
      const sup = selectedSupervisor === 'Todos' ? 'CAROLINE OLIVEIRA' : selectedSupervisor
      setSearchParams({
        supervisor: sup,
        drill: 'lojas',
        indicador,
      })
      if (indicador === 'criticas') {
        setSelectedKpi('criticas')
        setFilterState((s) => ({ ...s, situacao: 'Críticas' }))
      } else if (indicador === 'complexos') {
        setSelectedKpi('complexos')
        setFilterState((s) => ({ ...s, situacao: 'Casos complexos' }))
      } else if (indicador === 'rupturas') {
        setSelectedKpi('rupturas')
        setFilterState((s) => ({ ...s, situacao: 'Com rupturas' }))
      } else {
        setSelectedKpi(null)
        setFilterState((s) => ({ ...s, situacao: 'Todas' }))
      }
      setCurrentPage(1)
    },
    [selectedSupervisor, setSearchParams],
  )

  const handleEnterDrillLevel2 = useCallback(
    (storeId: string) => {
      setSearchParams({
        supervisor: selectedSupervisor,
        drill: 'produtos',
        indicador: currentIndicador,
        loja: encodeURIComponent(storeId),
      })
      setCurrentPage(1)
    },
    [selectedSupervisor, currentIndicador, setSearchParams],
  )

  const handleExitDrill = useCallback(() => {
    setSearchParams({
      supervisor: selectedSupervisor,
    })
    setSelectedKpi(null)
    setFilterState((s) => ({ ...s, situacao: 'Todas' }))
    setCurrentPage(1)
  }, [selectedSupervisor, setSearchParams])

  const handleBackToDrillLevel1 = useCallback(() => {
    setSearchParams({
      supervisor: selectedSupervisor,
      drill: 'lojas',
      indicador: currentIndicador,
    })
    setCurrentPage(1)
  }, [selectedSupervisor, currentIndicador, setSearchParams])

  // Ordenação padrão para visão normal:
  // 1. Validades até 15 dias (desc)
  // 2. Rupturas ativas (desc)
  // 3. Loja nome/identidade (asc)
  const sortedStores = useMemo(() => {
    const list = [...displayStores]
    list.sort((a, b) => {
      // 1. Validades até 15 dias desc
      if (b.validadesCriticasCount !== a.validadesCriticasCount) {
        return b.validadesCriticasCount - a.validadesCriticasCount
      }
      // 2. Rupturas ativas desc
      if (b.rupturasAtivasCount !== a.rupturasAtivasCount) {
        return b.rupturasAtivasCount - a.rupturasAtivasCount
      }
      // 3. Loja asc
      const nameA = formatStoreIdentityTable({ codigoLoja: a.storeCode, nomeLoja: a.storeName })
      const nameB = formatStoreIdentityTable({ codigoLoja: b.storeCode, nomeLoja: b.storeName })
      return nameA.localeCompare(nameB, 'pt-BR', { numeric: true, sensitivity: 'base' })
    })
    return list
  }, [displayStores])

  // Ordenação para lojas do Drill Nível 1:
  const sortedDrillStores = useMemo(() => {
    const list = [...drillLojas]
    list.sort((a, b) => {
      if (b.validadesCriticasCount !== a.validadesCriticasCount) {
        return b.validadesCriticasCount - a.validadesCriticasCount
      }
      if (b.rupturasAtivasCount !== a.rupturasAtivasCount) {
        return b.rupturasAtivasCount - a.rupturasAtivasCount
      }
      const nameA = formatStoreIdentityTable({ codigoLoja: a.storeCode, nomeLoja: a.storeName })
      const nameB = formatStoreIdentityTable({ codigoLoja: b.storeCode, nomeLoja: b.storeName })
      return nameA.localeCompare(nameB, 'pt-BR', { numeric: true, sensitivity: 'base' })
    })
    return list
  }, [drillLojas])

  const canonicalize = useMemo(() => buildCityUfCanonicalizer(stores), [stores])

  // Opções para os selects derivadas de stores
  const filterOptions = useMemo(() => {
    const marcasSet = new Set<string>()
    const redesSet = new Set<string>()
    const cidadesSet = new Set<string>()
    const ufsSet = new Set<string>()

    for (const s of stores) {
      s.marcasList.forEach((m) => {
        if (m && m.trim()) marcasSet.add(m.trim())
      })
      if (s.networkName && s.networkName.trim() && s.networkName !== 'Rede não identificada') {
        redesSet.add(s.networkName.trim())
      }
      const { city, uf } = canonicalize(s.city, s.uf)
      const formatted = formatCityUf(city, uf)
      if (formatted && formatted !== '—') cidadesSet.add(formatted)
      if (uf) ufsSet.add(uf.trim().toUpperCase())
    }

    return {
      marcas: Array.from(marcasSet).sort((a, b) => a.localeCompare(b, 'pt-BR')),
      redes: Array.from(redesSet).sort((a, b) => a.localeCompare(b, 'pt-BR')),
      cidades: Array.from(cidadesSet).sort((a, b) => a.localeCompare(b, 'pt-BR')),
      ufs: Array.from(ufsSet).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    }
  }, [stores, canonicalize])

  // Paginação (visão normal)
  const totalItems = sortedStores.length
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const safeCurrentPage = Math.min(currentPage, totalPages)
  const startIndex = (safeCurrentPage - 1) * pageSize
  const endIndex = Math.min(startIndex + pageSize, totalItems)
  const paginatedStores = sortedStores.slice(startIndex, endIndex)

  // Paginação (Drill Nível 1 — Lojas)
  const totalDrillLojasItems = sortedDrillStores.length
  const totalDrillLojasPages = Math.max(1, Math.ceil(totalDrillLojasItems / pageSize))
  const safeDrillLojasPage = Math.min(currentPage, totalDrillLojasPages)
  const drillLojasStartIndex = (safeDrillLojasPage - 1) * pageSize
  const drillLojasEndIndex = Math.min(drillLojasStartIndex + pageSize, totalDrillLojasItems)
  const paginatedDrillLojas = sortedDrillStores.slice(drillLojasStartIndex, drillLojasEndIndex)

  // Paginação (Drill Nível 2 — Produtos)
  const totalDrillProdutosItems = drillProdutos.length
  const totalDrillProdutosPages = Math.max(1, Math.ceil(totalDrillProdutosItems / pageSize))
  const safeDrillProdutosPage = Math.min(currentPage, totalDrillProdutosPages)
  const drillProdutosStartIndex = (safeDrillProdutosPage - 1) * pageSize
  const drillProdutosEndIndex = Math.min(
    drillProdutosStartIndex + pageSize,
    totalDrillProdutosItems,
  )
  const paginatedDrillProdutos = drillProdutos.slice(drillProdutosStartIndex, drillProdutosEndIndex)

  const handleClearFilters = useCallback(() => {
    setFilterState(initialFilterState)
    setSelectedSupervisor('Todos')
    setSelectedKpi(null)
    setCurrentPage(1)
  }, [])

  const handleKpiToggle = (kpiKey: 'criticas' | 'complexos' | 'rupturas' | 'todas') => {
    if (kpiKey === 'todas') {
      setSelectedKpi(null)
      setFilterState((s) => ({ ...s, situacao: 'Todas' }))
    } else if (selectedKpi === kpiKey) {
      setSelectedKpi(null)
      setFilterState((s) => ({ ...s, situacao: 'Todas' }))
    } else {
      setSelectedKpi(kpiKey)
      if (kpiKey === 'criticas') setFilterState((s) => ({ ...s, situacao: 'Críticas' }))
      if (kpiKey === 'complexos') setFilterState((s) => ({ ...s, situacao: 'Casos complexos' }))
      if (kpiKey === 'rupturas') setFilterState((s) => ({ ...s, situacao: 'Com rupturas' }))
    }
    setCurrentPage(1)
  }

  const hasActiveFilters =
    Boolean(filterState.search.trim()) ||
    filterState.marca !== 'Todas as marcas' ||
    filterState.rede !== 'Todas as redes' ||
    filterState.cidade !== 'Todas as cidades' ||
    filterState.uf !== 'Todos os estados' ||
    effectiveSituacao !== 'Todas' ||
    selectedSupervisor !== 'Todos'

  // Chips ativos para remoção individual
  const activeChips = useMemo(() => {
    const chips: Array<{ id: string; label: string; onRemove: () => void }> = []

    if (selectedSupervisor !== 'Todos') {
      const supLabel =
        supervisoresUnicos.find(([k]) => k === selectedSupervisor)?.[1] || selectedSupervisor
      chips.push({
        id: 'supervisor',
        label: `Supervisor: ${supLabel}`,
        onRemove: () => {
          setSelectedSupervisor('Todos')
          setCurrentPage(1)
        },
      })
    }

    if (filterState.search.trim()) {
      chips.push({
        id: 'search',
        label: `Busca: "${filterState.search.trim()}"`,
        onRemove: () => {
          setFilterState((s) => ({ ...s, search: '' }))
          setCurrentPage(1)
        },
      })
    }

    if (filterState.marca !== 'Todas as marcas') {
      chips.push({
        id: 'marca',
        label: `Marca: ${filterState.marca}`,
        onRemove: () => {
          setFilterState((s) => ({ ...s, marca: 'Todas as marcas' }))
          setCurrentPage(1)
        },
      })
    }

    if (filterState.rede !== 'Todas as redes') {
      chips.push({
        id: 'rede',
        label: `Rede: ${filterState.rede}`,
        onRemove: () => {
          setFilterState((s) => ({ ...s, rede: 'Todas as redes' }))
          setCurrentPage(1)
        },
      })
    }

    if (filterState.cidade !== 'Todas as cidades') {
      chips.push({
        id: 'cidade',
        label: `Cidade: ${filterState.cidade}`,
        onRemove: () => {
          setFilterState((s) => ({ ...s, cidade: 'Todas as cidades' }))
          setCurrentPage(1)
        },
      })
    }

    if (filterState.uf !== 'Todos os estados') {
      chips.push({
        id: 'uf',
        label: `UF: ${filterState.uf}`,
        onRemove: () => {
          setFilterState((s) => ({ ...s, uf: 'Todos os estados' }))
          setCurrentPage(1)
        },
      })
    }

    if (effectiveSituacao !== 'Todas') {
      chips.push({
        id: 'situacao',
        label: `Situação: ${effectiveSituacao}`,
        onRemove: () => {
          setSelectedKpi(null)
          setFilterState((s) => ({ ...s, situacao: 'Todas' }))
          setCurrentPage(1)
        },
      })
    }

    return chips
  }, [filterState, effectiveSituacao])

  // Determina se estamos em modo drill
  const isDrillMode = selectedSupervisor !== 'Todos' && Boolean(urlDrill)

  // Exportação XLSX Dinâmica (Normal ou Drill Nível 1 ou Drill Nível 2)
  const handleExportUnifiedXLSX = useCallback(() => {
    try {
      if (urlDrill === 'produtos' && selectedDrillStore) {
        if (drillProdutos.length === 0) return
        const { count, fileName } = exportSupervisorDrillProdutosXLSX(
          drillProdutos,
          selectedSupervisorName,
          selectedDrillStore.storeCode,
          selectedDrillStore.storeName,
          currentIndicador,
        )
        toast({
          title: 'Exportação concluída',
          description: `${count} produto(s) exportado(s) com sucesso em ${fileName}.`,
        })
      } else if (urlDrill === 'lojas') {
        if (sortedDrillStores.length === 0) return
        const { count, fileName } = exportSupervisorDrillLojasXLSX(
          sortedDrillStores,
          selectedSupervisorName,
          currentIndicador,
        )
        toast({
          title: 'Exportação concluída',
          description: `${count} loja(s) exportada(s) com sucesso em ${fileName}.`,
        })
      } else {
        if (sortedStores.length === 0) return
        const { count, fileName } = exportLojasTableViewXLSX(
          sortedStores,
          filterState.marca !== 'Todas as marcas' ? filterState.marca : null,
        )
        toast({
          title: 'Exportação concluída',
          description: `${count} loja(s) exportada(s) com sucesso em ${fileName}.`,
        })
      }
    } catch (err) {
      toast({
        title: 'Erro ao exportar',
        description: err instanceof Error ? err.message : 'Falha na exportação.',
        variant: 'destructive',
      })
    }
  }, [
    urlDrill,
    selectedDrillStore,
    drillProdutos,
    sortedDrillStores,
    sortedStores,
    selectedSupervisorName,
    currentIndicador,
    filterState.marca,
    toast,
  ])

  const isExportDisabled = useMemo(() => {
    if (isLoading) return true
    if (urlDrill === 'produtos') return drillProdutos.length === 0
    if (urlDrill === 'lojas') return sortedDrillStores.length === 0
    return sortedStores.length === 0
  }, [isLoading, urlDrill, drillProdutos.length, sortedDrillStores.length, sortedStores.length])

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-6 animate-fade-in pb-12">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
              <Store className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">Gestão de Lojas</h1>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
                  Base Atual
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Monitoramento operacional de validades e rupturas por ponto de venda.
              </p>
            </div>
          </div>

          {/* CTA Único de Exportação */}
          <Button
            onClick={handleExportUnifiedXLSX}
            disabled={isExportDisabled}
            className="h-10 px-4 gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs self-start sm:self-center font-semibold text-xs rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            <span>Exportar visão atual (.xlsx)</span>
          </Button>
        </div>

        {/* Bloco Gestão por Supervisor com Seletor e 4 Cards */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-sm font-bold text-slate-900 tracking-tight">
                Gestão por Supervisor
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Visão consolidada de responsabilidade e criticidade por supervisor.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <label
                htmlFor="supervisor-select"
                className="text-xs font-semibold text-slate-600 whitespace-nowrap"
              >
                Supervisor:
              </label>
              <select
                id="supervisor-select"
                aria-label="Supervisor"
                value={selectedSupervisor}
                onChange={(e) => {
                  const newSup = e.target.value
                  setSelectedSupervisor(newSup)
                  if (newSup === 'Todos') {
                    setSearchParams({})
                    setSelectedKpi(null)
                  } else {
                    // Mantém indicador se já estiver em drill, ou ajusta URL
                    if (urlDrill) {
                      setSearchParams({
                        supervisor: newSup,
                        drill: urlDrill,
                        indicador: currentIndicador,
                        ...(urlDrill === 'produtos' && urlLoja ? { loja: urlLoja } : {}),
                      })
                    } else {
                      setSearchParams({ supervisor: newSup })
                    }
                  }
                  setCurrentPage(1)
                }}
                className="h-9 px-3 py-1 text-xs sm:text-sm bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer min-w-[200px]"
              >
                <option value="Todos">Todos</option>
                {supervisoresUnicos.map(([key, name]) => (
                  <option key={key} value={key}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 4 Cards (Mudam quando supervisor específico está selecionado) */}
          {selectedSupervisor === 'Todos' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* KPI 1: Lojas monitoradas (informativo) */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Lojas monitoradas
                  </span>
                  <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center">
                    <Store className="w-4 h-4" />
                  </div>
                </div>
                {isLoading ? (
                  <div className="mt-2 space-y-1">
                    <div className="h-8 bg-slate-200 rounded w-16 animate-pulse" />
                    <div className="h-3 bg-slate-100 rounded w-28 animate-pulse" />
                  </div>
                ) : (
                  <>
                    <p className="text-2xl font-bold text-slate-900 mt-2">{kpis.total}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Pontos de venda filtrados</p>
                  </>
                )}
              </div>

              {/* KPI 2: Lojas críticas (clicável) */}
              <div
                onClick={() => !isLoading && handleKpiToggle('criticas')}
                className={`bg-white p-5 rounded-2xl border shadow-xs transition-all ${
                  isLoading
                    ? 'border-slate-200/80 cursor-default'
                    : selectedKpi === 'criticas'
                      ? 'border-indigo-600 ring-2 ring-indigo-500/20 bg-indigo-50/20 cursor-pointer hover:shadow-sm'
                      : 'border-slate-200/80 hover:border-slate-300 cursor-pointer hover:shadow-sm'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Lojas críticas
                  </span>
                  <div className="w-8 h-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                </div>
                {isLoading ? (
                  <div className="mt-2 space-y-1">
                    <div className="h-8 bg-slate-200 rounded w-16 animate-pulse" />
                    <div className="h-3 bg-slate-100 rounded w-36 animate-pulse" />
                  </div>
                ) : (
                  <>
                    <p className="text-2xl font-bold text-red-600 mt-2">{kpis.criticas}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Validade ≤ 15d ou ruptura ativa
                    </p>
                  </>
                )}
              </div>

              {/* KPI 3: Lojas com casos complexos (clicável) */}
              <div
                onClick={() => !isLoading && handleKpiToggle('complexos')}
                className={`bg-white p-5 rounded-2xl border shadow-xs transition-all ${
                  isLoading
                    ? 'border-slate-200/80 cursor-default'
                    : selectedKpi === 'complexos'
                      ? 'border-indigo-600 ring-2 ring-indigo-500/20 bg-indigo-50/20 cursor-pointer hover:shadow-sm'
                      : 'border-slate-200/80 hover:border-slate-300 cursor-pointer hover:shadow-sm'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Lojas com casos complexos
                  </span>
                  <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                    <CalendarClock className="w-4 h-4" />
                  </div>
                </div>
                {isLoading ? (
                  <div className="mt-2 space-y-1">
                    <div className="h-8 bg-slate-200 rounded w-16 animate-pulse" />
                    <div className="h-3 bg-slate-100 rounded w-32 animate-pulse" />
                  </div>
                ) : (
                  <>
                    <p className="text-2xl font-bold text-amber-700 mt-2">{kpis.complexos}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Ao menos 1 validade 0-15d</p>
                  </>
                )}
              </div>

              {/* KPI 4: Lojas com rupturas (clicável) */}
              <div
                onClick={() => !isLoading && handleKpiToggle('rupturas')}
                className={`bg-white p-5 rounded-2xl border shadow-xs transition-all ${
                  isLoading
                    ? 'border-slate-200/80 cursor-default'
                    : selectedKpi === 'rupturas'
                      ? 'border-indigo-600 ring-2 ring-indigo-500/20 bg-indigo-50/20 cursor-pointer hover:shadow-sm'
                      : 'border-slate-200/80 hover:border-slate-300 cursor-pointer hover:shadow-sm'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Lojas com rupturas
                  </span>
                  <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                    <Package className="w-4 h-4" />
                  </div>
                </div>
                {isLoading ? (
                  <div className="mt-2 space-y-1">
                    <div className="h-8 bg-slate-200 rounded w-16 animate-pulse" />
                    <div className="h-3 bg-slate-100 rounded w-32 animate-pulse" />
                  </div>
                ) : (
                  <>
                    <p className="text-2xl font-bold text-blue-700 mt-2">{kpis.comRupturas}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Ao menos 1 ruptura ativa</p>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Card 1: Lojas sob responsabilidade (clicável: entra em drill=lojas indicador=todas) */}
              <div
                onClick={() => !isLoading && handleEnterDrillLevel1('todas')}
                className={`bg-white p-5 rounded-2xl border shadow-xs transition-all ${
                  isLoading
                    ? 'border-slate-200/80 cursor-default'
                    : (isDrillMode && currentIndicador === 'todas') ||
                        (effectiveSituacao === 'Todas' && !selectedKpi && !isDrillMode)
                      ? 'border-indigo-600 ring-2 ring-indigo-500/20 bg-indigo-50/20 cursor-pointer hover:shadow-sm'
                      : 'border-slate-200/80 hover:border-slate-300 cursor-pointer hover:shadow-sm'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Lojas sob responsabilidade
                  </span>
                  <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center">
                    <Store className="w-4 h-4" />
                  </div>
                </div>
                {isLoading ? (
                  <div className="mt-2 space-y-1">
                    <div className="h-8 bg-slate-200 rounded w-16 animate-pulse" />
                    <div className="h-3 bg-slate-100 rounded w-28 animate-pulse" />
                  </div>
                ) : (
                  <>
                    <p className="text-2xl font-bold text-slate-900 mt-2">
                      {supervisorKpis.totalLojas}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Lojas sob este supervisor</p>
                  </>
                )}
              </div>

              {/* Card 2: Lojas com atenção urgente (clicável: entra em drill=lojas indicador=criticas) */}
              <div
                onClick={() => !isLoading && handleEnterDrillLevel1('criticas')}
                className={`bg-white p-5 rounded-2xl border shadow-xs transition-all ${
                  isLoading
                    ? 'border-slate-200/80 cursor-default'
                    : (isDrillMode && currentIndicador === 'criticas') ||
                        (!isDrillMode &&
                          (selectedKpi === 'criticas' || effectiveSituacao === 'Críticas'))
                      ? 'border-indigo-600 ring-2 ring-indigo-500/20 bg-indigo-50/20 cursor-pointer hover:shadow-sm'
                      : 'border-slate-200/80 hover:border-slate-300 cursor-pointer hover:shadow-sm'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Lojas com atenção urgente
                  </span>
                  <div className="w-8 h-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                </div>
                {isLoading ? (
                  <div className="mt-2 space-y-1">
                    <div className="h-8 bg-slate-200 rounded w-16 animate-pulse" />
                    <div className="h-3 bg-slate-100 rounded w-36 animate-pulse" />
                  </div>
                ) : (
                  <>
                    <p className="text-2xl font-bold text-red-600 mt-2">
                      {supervisorKpis.atencaoUrgente}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Validade ≤ 15d ou ruptura ativa
                    </p>
                  </>
                )}
              </div>

              {/* Card 3: Validades críticas 0-15d (clicável: entra em drill=lojas indicador=complexos) */}
              <div
                onClick={() => !isLoading && handleEnterDrillLevel1('complexos')}
                className={`bg-white p-5 rounded-2xl border shadow-xs transition-all ${
                  isLoading
                    ? 'border-slate-200/80 cursor-default'
                    : (isDrillMode && currentIndicador === 'complexos') ||
                        (!isDrillMode &&
                          (selectedKpi === 'complexos' || effectiveSituacao === 'Casos complexos'))
                      ? 'border-indigo-600 ring-2 ring-indigo-500/20 bg-indigo-50/20 cursor-pointer hover:shadow-sm'
                      : 'border-slate-200/80 hover:border-slate-300 cursor-pointer hover:shadow-sm'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Validades críticas 0-15d
                  </span>
                  <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                    <CalendarClock className="w-4 h-4" />
                  </div>
                </div>
                {isLoading ? (
                  <div className="mt-2 space-y-1">
                    <div className="h-8 bg-slate-200 rounded w-16 animate-pulse" />
                    <div className="h-3 bg-slate-100 rounded w-32 animate-pulse" />
                  </div>
                ) : (
                  <>
                    <p className="text-2xl font-bold text-amber-700 mt-2">
                      {supervisorKpis.validadesCriticas}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Ao menos 1 validade 0-15d</p>
                  </>
                )}
              </div>

              {/* Card 4: Rupturas ativas (clicável: entra em drill=lojas indicador=rupturas) */}
              <div
                onClick={() => !isLoading && handleEnterDrillLevel1('rupturas')}
                className={`bg-white p-5 rounded-2xl border shadow-xs transition-all ${
                  isLoading
                    ? 'border-slate-200/80 cursor-default'
                    : (isDrillMode && currentIndicador === 'rupturas') ||
                        (!isDrillMode &&
                          (selectedKpi === 'rupturas' || effectiveSituacao === 'Com rupturas'))
                      ? 'border-indigo-600 ring-2 ring-indigo-500/20 bg-indigo-50/20 cursor-pointer hover:shadow-sm'
                      : 'border-slate-200/80 hover:border-slate-300 cursor-pointer hover:shadow-sm'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Rupturas ativas
                  </span>
                  <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                    <Package className="w-4 h-4" />
                  </div>
                </div>
                {isLoading ? (
                  <div className="mt-2 space-y-1">
                    <div className="h-8 bg-slate-200 rounded w-16 animate-pulse" />
                    <div className="h-3 bg-slate-100 rounded w-32 animate-pulse" />
                  </div>
                ) : (
                  <>
                    <p className="text-2xl font-bold text-blue-700 mt-2">
                      {supervisorKpis.rupturasAtivas}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Ao menos 1 ruptura ativa</p>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Breadcrumb e Barra Superior do Modo Drill */}
        {isDrillMode && (
          <div className="bg-white rounded-2xl border border-indigo-100 p-4 sm:p-5 shadow-xs space-y-3 bg-gradient-to-r from-indigo-50/40 via-white to-slate-50/50">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              {/* Breadcrumbs */}
              <nav
                aria-label="Navegação Drill-down"
                className="flex items-center flex-wrap gap-1.5 text-xs sm:text-sm"
              >
                <button
                  type="button"
                  onClick={handleExitDrill}
                  className="font-medium text-slate-500 hover:text-indigo-600 transition-colors cursor-pointer"
                >
                  Supervisor
                </button>
                <BreadcrumbSeparator className="w-3.5 h-3.5 text-slate-400" />
                <button
                  type="button"
                  onClick={handleExitDrill}
                  className="font-semibold text-slate-700 hover:text-indigo-600 transition-colors cursor-pointer"
                >
                  {selectedSupervisorName}
                </button>
                <BreadcrumbSeparator className="w-3.5 h-3.5 text-slate-400" />
                {urlDrill === 'lojas' ? (
                  <span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md">
                    {indicadorTitles[currentIndicador] || 'Lojas'}
                  </span>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={handleBackToDrillLevel1}
                      className="font-medium text-slate-600 hover:text-indigo-600 transition-colors cursor-pointer"
                    >
                      {indicadorTitles[currentIndicador] || 'Lojas'}
                    </button>
                    <BreadcrumbSeparator className="w-3.5 h-3.5 text-slate-400" />
                    <span className="font-semibold text-slate-800">
                      {selectedDrillStore
                        ? `${selectedDrillStore.storeCode} — ${selectedDrillStore.storeName}`
                        : 'Loja'}
                    </span>
                    <BreadcrumbSeparator className="w-3.5 h-3.5 text-slate-400" />
                    <span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md">
                      Produtos
                    </span>
                  </>
                )}
              </nav>

              {/* Botão Voltar */}
              <div className="flex items-center gap-2">
                {urlDrill === 'produtos' ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleBackToDrillLevel1}
                    className="h-8 px-3 gap-1.5 text-xs text-slate-700 border-slate-300 hover:bg-slate-100 rounded-lg"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Voltar para Lojas</span>
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleExitDrill}
                    className="h-8 px-3 gap-1.5 text-xs text-slate-700 border-slate-300 hover:bg-slate-100 rounded-lg"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Sair do Drill</span>
                  </Button>
                )}
              </div>
            </div>

            <div className="text-xs text-slate-600">
              {urlDrill === 'lojas' ? (
                <span>
                  Visualizando <strong>{sortedDrillStores.length}</strong> loja(s) sob a gestão de{' '}
                  <strong>{selectedSupervisorName}</strong> para o indicador{' '}
                  <span className="text-indigo-700 font-semibold">
                    "{indicadorTitles[currentIndicador]}"
                  </span>
                  . Clique em uma linha para detalhar os produtos.
                </span>
              ) : (
                <span>
                  Detalhamento de <strong>{drillProdutos.length}</strong> produto(s) e ocorrências
                  para a loja{' '}
                  <strong>
                    {selectedDrillStore
                      ? `${selectedDrillStore.storeCode} — ${selectedDrillStore.storeName}`
                      : 'selecionada'}
                  </strong>
                  .
                </span>
              )}
            </div>
          </div>
        )}

        {/* Barra de Filtros Compacta SEMPRE Visível */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-xs space-y-3.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 items-end">
            {/* Busca */}
            <div className="flex flex-col gap-1 sm:col-span-2 lg:col-span-2">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Busca
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <Input
                  type="text"
                  value={filterState.search}
                  onChange={(e) => {
                    setFilterState((s) => ({ ...s, search: e.target.value }))
                    setCurrentPage(1)
                  }}
                  placeholder="Buscar código, nome ou cidade..."
                  className="pl-9 h-9 text-xs sm:text-sm rounded-lg border-slate-300 bg-slate-50/50 focus:bg-white"
                />
              </div>
            </div>

            {/* Marca (cliente) */}
            <div className="flex flex-col gap-1 flex-1 min-w-[130px]">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Marca
              </label>
              <select
                aria-label="Marca"
                value={filterState.marca}
                onChange={(e) => {
                  setFilterState((s) => ({ ...s, marca: e.target.value }))
                  setCurrentPage(1)
                }}
                className="w-full h-9 px-2.5 py-1 text-xs sm:text-sm bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer truncate"
              >
                <option value="Todas as marcas">Todas as marcas</option>
                {filterOptions.marcas.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            {/* Rede */}
            <div className="flex flex-col gap-1 flex-1 min-w-[130px]">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Rede
              </label>
              <select
                aria-label="Rede"
                value={filterState.rede}
                onChange={(e) => {
                  setFilterState((s) => ({ ...s, rede: e.target.value }))
                  setCurrentPage(1)
                }}
                className="w-full h-9 px-2.5 py-1 text-xs sm:text-sm bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer truncate"
              >
                <option value="Todas as redes">Todas as redes</option>
                {filterOptions.redes.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            {/* Cidade */}
            <div className="flex flex-col gap-1 flex-1 min-w-[120px]">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Cidade
              </label>
              <select
                aria-label="Cidade"
                value={filterState.cidade}
                onChange={(e) => {
                  setFilterState((s) => ({ ...s, cidade: e.target.value }))
                  setCurrentPage(1)
                }}
                className="w-full h-9 px-2.5 py-1 text-xs sm:text-sm bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer truncate"
              >
                <option value="Todas as cidades">Todas as cidades</option>
                {filterOptions.cidades.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {/* UF */}
            <div className="flex flex-col gap-1 flex-1 min-w-[90px]">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                UF
              </label>
              <select
                aria-label="UF"
                value={filterState.uf}
                onChange={(e) => {
                  setFilterState((s) => ({ ...s, uf: e.target.value }))
                  setCurrentPage(1)
                }}
                className="w-full h-9 px-2.5 py-1 text-xs sm:text-sm bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer truncate"
              >
                <option value="Todos os estados">Todos os estados</option>
                {filterOptions.ufs.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Linha secundária: Situação + Limpar Filtros */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 border-t border-slate-100">
            <div className="flex items-center gap-3">
              <div className="flex flex-col gap-1 w-full sm:w-56">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  Situação
                </label>
                <select
                  aria-label="Situação"
                  value={effectiveSituacao}
                  onChange={(e) => {
                    const val = e.target.value as FilterState['situacao']
                    setFilterState((s) => ({ ...s, situacao: val }))
                    if (val === 'Críticas') setSelectedKpi('criticas')
                    else if (val === 'Casos complexos') setSelectedKpi('complexos')
                    else if (val === 'Com rupturas') setSelectedKpi('rupturas')
                    else setSelectedKpi(null)
                    setCurrentPage(1)
                  }}
                  className="w-full h-9 px-2.5 py-1 text-xs sm:text-sm bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer"
                >
                  <option value="Todas">Todas as situações</option>
                  <option value="Críticas">Críticas</option>
                  <option value="Casos complexos">Casos complexos</option>
                  <option value="Com rupturas">Com rupturas</option>
                </select>
              </div>
            </div>

            {hasActiveFilters && (
              <Button
                type="button"
                onClick={handleClearFilters}
                variant="outline"
                size="sm"
                className="h-9 px-3.5 gap-1.5 border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg font-medium text-xs self-start sm:self-end"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                <span>Limpar filtros</span>
              </Button>
            )}
          </div>

          {/* Chips de filtros ativos */}
          {activeChips.length > 0 && (
            <div className="pt-2 flex flex-wrap items-center gap-1.5 border-t border-slate-100 animate-fade-in">
              <span className="text-[11px] font-semibold text-slate-400 mr-1">Filtros ativos:</span>
              {activeChips.map((chip) => (
                <span
                  key={chip.id}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200"
                >
                  <span>{chip.label}</span>
                  <button
                    type="button"
                    onClick={chip.onRemove}
                    className="w-3.5 h-3.5 rounded-full inline-flex items-center justify-center hover:bg-indigo-200/70 text-indigo-800 transition-colors"
                    title="Remover filtro"
                    aria-label={`Remover filtro ${chip.label}`}
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Erro */}
        {error && (
          <div className="p-6 bg-red-50 border border-red-200 rounded-2xl text-center space-y-3">
            <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 mx-auto flex items-center justify-center">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <p className="text-sm font-semibold text-red-900">Falha ao carregar lojas</p>
            <p className="text-xs text-red-700 max-w-sm mx-auto">{error.message}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="gap-1.5 text-xs"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Tentar novamente
            </Button>
          </div>
        )}

        {/* Tabela de Dados: Nível 2 (Produtos), Nível 1 (Lojas Drill) ou Tabela Normal (7 Colunas) */}
        {!error && (
          <>
            {isLoading ? (
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-500">
                  <span className="font-medium text-slate-500 animate-pulse">
                    Carregando dados...
                  </span>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50/70 border-b border-slate-200 text-slate-600 font-semibold select-none">
                          <th className="py-3 px-4 min-w-[220px]">
                            {urlDrill === 'produtos' ? 'Marca / Produto' : 'Loja'}
                          </th>
                          <th className="py-3 px-4 min-w-[140px]">
                            {urlDrill === 'produtos' ? 'Tipo de risco' : 'Cidade / UF'}
                          </th>
                          <th className="py-3 px-4 min-w-[130px]">
                            {urlDrill === 'produtos' ? 'Realizado' : 'Rede'}
                          </th>
                          <th className="py-3 px-4 text-center min-w-[130px]">
                            {urlDrill === 'produtos' ? 'Validade' : 'Marcas'}
                          </th>
                          <th className="py-3 px-4 text-center min-w-[140px]">
                            {urlDrill === 'produtos' ? 'Dias restantes' : 'Validades até 15 dias'}
                          </th>
                          <th className="py-3 px-4 text-center min-w-[120px]">
                            {urlDrill === 'produtos' ? 'Dias em ruptura' : 'Rupturas ativas'}
                          </th>
                          <th className="py-3 px-4 text-center min-w-[100px]">
                            {urlDrill === 'produtos' ? 'Criticidade' : 'Situação'}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {Array.from({ length: 6 }).map((_, i) => (
                          <tr key={i} className="h-12">
                            <td className="py-3 px-4">
                              <div className="h-4 bg-slate-100 rounded w-48 animate-pulse" />
                            </td>
                            <td className="py-3 px-4">
                              <div className="h-4 bg-slate-100 rounded w-24 animate-pulse" />
                            </td>
                            <td className="py-3 px-4">
                              <div className="h-4 bg-slate-100 rounded w-28 animate-pulse" />
                            </td>
                            <td className="py-3 px-4 text-center">
                              <div className="h-4 bg-slate-100 rounded w-8 mx-auto animate-pulse" />
                            </td>
                            <td className="py-3 px-4 text-center">
                              <div className="h-4 bg-slate-100 rounded w-8 mx-auto animate-pulse" />
                            </td>
                            <td className="py-3 px-4 text-center">
                              <div className="h-4 bg-slate-100 rounded w-8 mx-auto animate-pulse" />
                            </td>
                            <td className="py-3 px-4 text-center">
                              <div className="h-4 bg-slate-100 rounded w-16 mx-auto animate-pulse" />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : urlDrill === 'produtos' ? (
              /* ================== DRILL NÍVEL 2: PRODUTOS ================== */
              drillProdutos.length === 0 ? (
                <div className="p-12 text-center bg-white rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
                  <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
                    <Info className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-semibold text-slate-800">
                    Nenhum produto encontrado para este recorte.
                  </p>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    Não foram encontradas ocorrências ativas de validade ou ruptura para esta loja
                    no indicador selecionado.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleBackToDrillLevel1}
                    className="text-xs mt-2"
                  >
                    Voltar para Lojas
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Barra de Contagem e Paginação */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-500">
                    <span className="font-medium text-slate-700">
                      {totalDrillProdutosItems} produto(s) encontrado(s) na loja{' '}
                      <strong>
                        {selectedDrillStore
                          ? `${selectedDrillStore.storeCode} — ${selectedDrillStore.storeName}`
                          : ''}
                      </strong>
                    </span>

                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-500">Itens por página:</span>
                        <select
                          aria-label="Itens por página"
                          value={pageSize}
                          onChange={(e) => {
                            setPageSize(Number(e.target.value) as PageSizeOption)
                            setCurrentPage(1)
                          }}
                          className="h-8 px-2 py-0.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                        >
                          <option value={25}>25</option>
                          <option value={50}>50</option>
                          <option value={100}>100</option>
                        </select>
                      </div>

                      <span>
                        Página {safeDrillProdutosPage} de {totalDrillProdutosPages}
                      </span>
                    </div>
                  </div>

                  {/* Tabela de 10 Colunas de Produtos */}
                  <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-50/70 border-b border-slate-200 text-slate-600 font-semibold select-none">
                            <th className="py-3 px-4 min-w-[130px]">Marca</th>
                            <th className="py-3 px-4 min-w-[200px]">Produto</th>
                            <th className="py-3 px-4 text-center min-w-[100px]">Tipo de risco</th>
                            <th className="py-3 px-4 text-center min-w-[100px]">Realizado</th>
                            <th className="py-3 px-4 text-center min-w-[100px]">Validade</th>
                            <th className="py-3 px-4 text-center min-w-[100px]">Dias restantes</th>
                            <th className="py-3 px-4 text-center min-w-[110px]">Dias em ruptura</th>
                            <th className="py-3 px-4 text-center min-w-[90px]">Quantidade</th>
                            <th className="py-3 px-4 text-center min-w-[100px]">Criticidade</th>
                            <th className="py-3 px-4 min-w-[240px]">Ação recomendada</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {paginatedDrillProdutos.map((item, idx) => (
                            <tr
                              key={`${item.cliente}-${item.produto}-${idx}`}
                              className="hover:bg-slate-50/70 transition-colors"
                            >
                              {/* 1. Marca */}
                              <td className="py-3 px-4 text-slate-800 font-medium whitespace-nowrap">
                                {item.cliente}
                              </td>

                              {/* 2. Produto */}
                              <td className="py-3 px-4 font-semibold text-slate-900">
                                {item.produto}
                              </td>

                              {/* 3. Tipo de risco */}
                              <td className="py-3 px-4 text-center whitespace-nowrap">
                                <Badge
                                  variant="outline"
                                  className={
                                    item.tipoRisco === 'Ambos'
                                      ? 'bg-purple-50 text-purple-700 border-purple-200 font-bold'
                                      : item.tipoRisco === 'Validade'
                                        ? 'bg-amber-50 text-amber-800 border-amber-200 font-semibold'
                                        : 'bg-blue-50 text-blue-700 border-blue-200 font-semibold'
                                  }
                                >
                                  {item.tipoRisco}
                                </Badge>
                              </td>

                              {/* 4. Realizado */}
                              <td className="py-3 px-4 text-center text-slate-600 whitespace-nowrap">
                                {item.realizado}
                              </td>

                              {/* 5. Validade */}
                              <td className="py-3 px-4 text-center text-slate-600 whitespace-nowrap">
                                {item.validade}
                              </td>

                              {/* 6. Dias restantes */}
                              <td className="py-3 px-4 text-center whitespace-nowrap">
                                {item.diasRestantes !== null && item.diasRestantes !== undefined ? (
                                  <span
                                    className={`font-semibold ${
                                      item.diasRestantes <= 7
                                        ? 'text-red-600'
                                        : item.diasRestantes <= 15
                                          ? 'text-amber-600'
                                          : 'text-slate-700'
                                    }`}
                                  >
                                    {item.diasRestantes}d
                                  </span>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                              </td>

                              {/* 7. Dias em ruptura */}
                              <td className="py-3 px-4 text-center whitespace-nowrap">
                                {item.diasEmRuptura !== null && item.diasEmRuptura !== undefined ? (
                                  <span className="font-semibold text-blue-700">
                                    {item.diasEmRuptura}d
                                  </span>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                              </td>

                              {/* 8. Quantidade */}
                              <td className="py-3 px-4 text-center text-slate-700 whitespace-nowrap">
                                {item.quantidade !== null && item.quantidade !== undefined
                                  ? item.quantidade
                                  : '—'}
                              </td>

                              {/* 9. Criticidade */}
                              <td className="py-3 px-4 text-center whitespace-nowrap">
                                <Badge
                                  variant="outline"
                                  className={
                                    item.criticidade === 'Crítica' || item.criticidade === 'Vencido'
                                      ? 'bg-red-50 text-red-700 border-red-200 font-semibold'
                                      : item.criticidade === 'Atenção'
                                        ? 'bg-amber-50 text-amber-700 border-amber-200 font-semibold'
                                        : item.criticidade === 'Ruptura'
                                          ? 'bg-blue-50 text-blue-700 border-blue-200 font-semibold'
                                          : 'bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold'
                                  }
                                >
                                  {item.criticidade}
                                </Badge>
                              </td>

                              {/* 10. Ação recomendada */}
                              <td className="py-3 px-4 text-xs text-slate-700 font-medium">
                                <span className="inline-block p-1.5 rounded-lg bg-slate-50 border border-slate-100">
                                  {item.acaoRecomendada}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Paginação Drill Produtos */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 bg-white rounded-xl border border-slate-200/80 shadow-2xs text-xs text-slate-600">
                    <span>
                      Mostrando{' '}
                      <strong className="text-slate-900">
                        {totalDrillProdutosItems === 0 ? 0 : drillProdutosStartIndex + 1}
                      </strong>
                      –<strong className="text-slate-900">{drillProdutosEndIndex}</strong> de{' '}
                      <strong className="text-slate-900">{totalDrillProdutosItems}</strong> produtos
                    </span>

                    <div className="flex items-center gap-2">
                      <span className="text-slate-500 mr-1">
                        Página <strong className="text-slate-900">{safeDrillProdutosPage}</strong>{' '}
                        de <strong className="text-slate-900">{totalDrillProdutosPages}</strong>
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={safeDrillProdutosPage <= 1 || isLoading}
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        className="h-8 px-2.5 text-xs gap-1 border-slate-200 rounded-lg hover:bg-slate-50"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                        <span>Anterior</span>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={safeDrillProdutosPage >= totalDrillProdutosPages || isLoading}
                        onClick={() =>
                          setCurrentPage((p) => Math.min(totalDrillProdutosPages, p + 1))
                        }
                        className="h-8 px-2.5 text-xs gap-1 border-slate-200 rounded-lg hover:bg-slate-50"
                      >
                        <span>Próxima</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              )
            ) : urlDrill === 'lojas' ? (
              /* ================== DRILL NÍVEL 1: LOJAS (8 COLUNAS) ================== */
              sortedDrillStores.length === 0 ? (
                <div className="p-12 text-center bg-white rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
                  <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
                    <Info className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-semibold text-slate-800">
                    Nenhuma loja encontrada para este indicador.
                  </p>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    Não existem lojas atendidas por este supervisor no filtro selecionado.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleExitDrill}
                    className="text-xs mt-2"
                  >
                    Ver todas as lojas
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Barra de Contagem e Paginação */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-500">
                    <span className="font-medium text-slate-700">
                      {totalDrillLojasItems} loja(s) encontrada(s) no indicador{' '}
                      <strong>"{indicadorTitles[currentIndicador]}"</strong>
                    </span>

                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-500">Itens por página:</span>
                        <select
                          aria-label="Itens por página"
                          value={pageSize}
                          onChange={(e) => {
                            setPageSize(Number(e.target.value) as PageSizeOption)
                            setCurrentPage(1)
                          }}
                          className="h-8 px-2 py-0.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                        >
                          <option value={25}>25</option>
                          <option value={50}>50</option>
                          <option value={100}>100</option>
                        </select>
                      </div>

                      <span>
                        Página {safeDrillLojasPage} de {totalDrillLojasPages}
                      </span>
                    </div>
                  </div>

                  {/* Tabela de 8 Colunas do Drill Nível 1 */}
                  <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-50/70 border-b border-slate-200 text-slate-600 font-semibold select-none">
                            <th className="py-3 px-4 min-w-[220px]">Loja</th>
                            <th className="py-3 px-4 min-w-[140px]">Cidade / UF</th>
                            <th className="py-3 px-4 min-w-[130px]">Rede</th>
                            <th className="py-3 px-4 text-center min-w-[120px]">Marcas</th>
                            <th className="py-3 px-4 text-center min-w-[130px]">Validades 0-15d</th>
                            <th className="py-3 px-4 text-center min-w-[120px]">Rupturas ativas</th>
                            <th className="py-3 px-4 text-center min-w-[130px]">
                              Principal motivo
                            </th>
                            <th className="py-3 px-4 text-center min-w-[100px]">Criticidade</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {paginatedDrillLojas.map((store) => {
                            const storeDisplay = formatStoreIdentityTable({
                              codigoLoja: store.storeCode,
                              nomeLoja: store.storeName,
                            })

                            const tooltipMarcas =
                              store.marcasList.length > 5
                                ? `${store.marcasList.slice(0, 5).join(', ')} (+${store.marcasList.length - 5})`
                                : store.marcasList.join(', ') || 'Nenhuma marca'

                            const valCrit = store.validadesCriticasCount || 0
                            const rupAtiv = store.rupturasAtivasCount || 0
                            let principalMotivo = '—'
                            if (valCrit > 0 && rupAtiv > 0) {
                              principalMotivo = 'Ambos'
                            } else if (valCrit > 0) {
                              principalMotivo = 'Validade'
                            } else if (rupAtiv > 0) {
                              principalMotivo = 'Ruptura'
                            }

                            return (
                              <tr
                                key={store.storeId}
                                onClick={() => handleEnterDrillLevel2(store.storeId)}
                                className="hover:bg-indigo-50/40 transition-colors cursor-pointer group"
                              >
                                {/* 1. Loja */}
                                <td className="py-3 px-4 min-w-[220px]">
                                  <div className="font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors flex items-center justify-between">
                                    <span>{storeDisplay}</span>
                                    <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-all" />
                                  </div>
                                </td>

                                {/* 2. Cidade / UF */}
                                <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                                  {formatCityUf(
                                    canonicalize(store.city, store.uf).city,
                                    canonicalize(store.city, store.uf).uf,
                                  )}
                                </td>

                                {/* 3. Rede */}
                                <td className="py-3 px-4 text-slate-700 font-medium whitespace-nowrap">
                                  {store.networkName}
                                </td>

                                {/* 4. Marcas */}
                                <td className="py-3 px-4 text-center whitespace-nowrap">
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="inline-flex">
                                        <Badge
                                          variant="outline"
                                          className="bg-slate-50 text-slate-700 border-slate-200 font-semibold cursor-help"
                                        >
                                          {store.marcasCount}
                                        </Badge>
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-xs text-xs">
                                      <p className="font-semibold mb-1">Marcas atendidas:</p>
                                      <p>{tooltipMarcas}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </td>

                                {/* 5. Validades 0-15d */}
                                <td className="py-3 px-4 text-center whitespace-nowrap">
                                  <Badge
                                    variant="outline"
                                    className={
                                      valCrit > 0
                                        ? 'bg-red-50 text-red-700 border-red-200 font-bold'
                                        : 'bg-slate-50 text-slate-500 border-slate-200 font-medium'
                                    }
                                  >
                                    {valCrit}
                                  </Badge>
                                </td>

                                {/* 6. Rupturas ativas */}
                                <td className="py-3 px-4 text-center whitespace-nowrap">
                                  <Badge
                                    variant="outline"
                                    className={
                                      rupAtiv > 0
                                        ? 'bg-amber-50 text-amber-800 border-amber-200 font-bold'
                                        : 'bg-slate-50 text-slate-500 border-slate-200 font-medium'
                                    }
                                  >
                                    {rupAtiv}
                                  </Badge>
                                </td>

                                {/* 7. Principal motivo */}
                                <td className="py-3 px-4 text-center whitespace-nowrap">
                                  <Badge
                                    variant="outline"
                                    className={
                                      principalMotivo === 'Ambos'
                                        ? 'bg-purple-50 text-purple-700 border-purple-200 font-semibold'
                                        : principalMotivo === 'Validade'
                                          ? 'bg-red-50 text-red-700 border-red-200 font-semibold'
                                          : principalMotivo === 'Ruptura'
                                            ? 'bg-amber-50 text-amber-800 border-amber-200 font-semibold'
                                            : 'bg-slate-50 text-slate-500 border-slate-200 font-medium'
                                    }
                                  >
                                    {principalMotivo}
                                  </Badge>
                                </td>

                                {/* 8. Criticidade */}
                                <td className="py-3 px-4 text-center whitespace-nowrap">
                                  {store.situacao === 'Crítica' ? (
                                    <Badge
                                      variant="outline"
                                      className="bg-red-50 text-red-700 border-red-200 font-semibold"
                                    >
                                      Crítica
                                    </Badge>
                                  ) : (
                                    <Badge
                                      variant="outline"
                                      className="bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold"
                                    >
                                      Normal
                                    </Badge>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Paginação Drill Lojas */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 bg-white rounded-xl border border-slate-200/80 shadow-2xs text-xs text-slate-600">
                    <span>
                      Mostrando{' '}
                      <strong className="text-slate-900">
                        {totalDrillLojasItems === 0 ? 0 : drillLojasStartIndex + 1}
                      </strong>
                      –<strong className="text-slate-900">{drillLojasEndIndex}</strong> de{' '}
                      <strong className="text-slate-900">{totalDrillLojasItems}</strong> lojas
                    </span>

                    <div className="flex items-center gap-2">
                      <span className="text-slate-500 mr-1">
                        Página <strong className="text-slate-900">{safeDrillLojasPage}</strong> de{' '}
                        <strong className="text-slate-900">{totalDrillLojasPages}</strong>
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={safeDrillLojasPage <= 1 || isLoading}
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        className="h-8 px-2.5 text-xs gap-1 border-slate-200 rounded-lg hover:bg-slate-50"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                        <span>Anterior</span>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={safeDrillLojasPage >= totalDrillLojasPages || isLoading}
                        onClick={() => setCurrentPage((p) => Math.min(totalDrillLojasPages, p + 1))}
                        className="h-8 px-2.5 text-xs gap-1 border-slate-200 rounded-lg hover:bg-slate-50"
                      >
                        <span>Próxima</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              )
            ) : sortedStores.length === 0 ? (
              /* ================== VISÃO NORMAL: VAZIA ================== */
              <div className="p-12 text-center bg-white rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
                <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
                  <Info className="w-6 h-6" />
                </div>
                <p className="text-sm font-semibold text-slate-800">
                  {hasActiveFilters
                    ? 'Nenhuma loja corresponde aos filtros selecionados.'
                    : 'Nenhuma loja registrada na Base Atual.'}
                </p>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  {hasActiveFilters
                    ? 'Tente ajustar ou limpar os filtros de busca para visualizar os pontos de venda.'
                    : 'Importe novos dados operacionais para acompanhar lojas.'}
                </p>
                {hasActiveFilters && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleClearFilters}
                    className="text-xs mt-2"
                  >
                    Limpar filtros
                  </Button>
                )}
              </div>
            ) : (
              /* ================== VISÃO NORMAL: TABELA 7 COLUNAS ================== */
              <div className="space-y-3">
                {/* Barra de Contagem e Paginação */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-500">
                  <span className="font-medium text-slate-700">
                    {totalItems} loja(s) encontrada(s)
                    {selectedKpi === 'criticas' && ' • Filtro: Lojas críticas'}
                    {selectedKpi === 'complexos' && ' • Filtro: Casos complexos'}
                    {selectedKpi === 'rupturas' && ' • Filtro: Com rupturas'}
                  </span>

                  <div className="flex items-center gap-4">
                    {/* Seletor de Page Size */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-500">Itens por página:</span>
                      <select
                        aria-label="Itens por página"
                        value={pageSize}
                        onChange={(e) => {
                          setPageSize(Number(e.target.value) as PageSizeOption)
                          setCurrentPage(1)
                        }}
                        className="h-8 px-2 py-0.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                      >
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                      </select>
                    </div>

                    <span>
                      Página {safeCurrentPage} de {totalPages}
                    </span>
                  </div>
                </div>

                {/* Tabela de 7 Colunas */}
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50/70 border-b border-slate-200 text-slate-600 font-semibold select-none">
                          <th className="py-3 px-4 min-w-[220px]">Loja</th>
                          <th className="py-3 px-4 min-w-[140px]">Cidade / UF</th>
                          <th className="py-3 px-4 min-w-[130px]">Rede</th>
                          <th className="py-3 px-4 text-center min-w-[130px]">Marcas atendidas</th>
                          <th className="py-3 px-4 text-center min-w-[140px]">
                            Validades até 15 dias
                          </th>
                          <th className="py-3 px-4 text-center min-w-[120px]">Rupturas ativas</th>
                          <th className="py-3 px-4 text-center min-w-[100px]">Situação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {paginatedStores.map((store) => {
                          const storeDisplay = formatStoreIdentityTable({
                            codigoLoja: store.storeCode,
                            nomeLoja: store.storeName,
                          })

                          const tooltipMarcas =
                            store.marcasList.length > 5
                              ? `${store.marcasList.slice(0, 5).join(', ')} (+${store.marcasList.length - 5})`
                              : store.marcasList.join(', ') || 'Nenhuma marca'

                          return (
                            <tr
                              key={store.storeId}
                              onClick={() =>
                                navigate(`/lojas/${encodeURIComponent(store.storeId)}`)
                              }
                              className="hover:bg-slate-50/70 transition-colors cursor-pointer group"
                            >
                              {/* 1. Loja */}
                              <td className="py-3 px-4 min-w-[220px]">
                                <div className="font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors">
                                  {storeDisplay}
                                </div>
                              </td>

                              {/* 2. Cidade / UF */}
                              <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                                {formatCityUf(
                                  canonicalize(store.city, store.uf).city,
                                  canonicalize(store.city, store.uf).uf,
                                )}
                              </td>

                              {/* 3. Rede */}
                              <td className="py-3 px-4 text-slate-700 font-medium whitespace-nowrap">
                                {store.networkName}
                              </td>

                              {/* 4. Marcas atendidas */}
                              <td className="py-3 px-4 text-center whitespace-nowrap">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="inline-flex">
                                      <Badge
                                        variant="outline"
                                        className="bg-slate-50 text-slate-700 border-slate-200 font-semibold cursor-help"
                                      >
                                        {store.marcasCount}
                                      </Badge>
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-xs text-xs">
                                    <p className="font-semibold mb-1">Marcas atendidas:</p>
                                    <p>{tooltipMarcas}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </td>

                              {/* 5. Validades até 15 dias */}
                              <td className="py-3 px-4 text-center whitespace-nowrap">
                                <Badge
                                  variant="outline"
                                  className={
                                    store.validadesCriticasCount > 0
                                      ? 'bg-red-50 text-red-700 border-red-200 font-bold'
                                      : 'bg-slate-50 text-slate-500 border-slate-200 font-medium'
                                  }
                                >
                                  {store.validadesCriticasCount}
                                </Badge>
                              </td>

                              {/* 6. Rupturas ativas */}
                              <td className="py-3 px-4 text-center whitespace-nowrap">
                                <Badge
                                  variant="outline"
                                  className={
                                    store.rupturasAtivasCount > 0
                                      ? 'bg-amber-50 text-amber-800 border-amber-200 font-bold'
                                      : 'bg-slate-50 text-slate-500 border-slate-200 font-medium'
                                  }
                                >
                                  {store.rupturasAtivasCount}
                                </Badge>
                              </td>

                              {/* 7. Situação */}
                              <td className="py-3 px-4 text-center whitespace-nowrap">
                                {store.situacao === 'Crítica' ? (
                                  <Badge
                                    variant="outline"
                                    className="bg-red-50 text-red-700 border-red-200 font-semibold"
                                  >
                                    Crítica
                                  </Badge>
                                ) : (
                                  <Badge
                                    variant="outline"
                                    className="bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold"
                                  >
                                    Normal
                                  </Badge>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Paginação */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 bg-white rounded-xl border border-slate-200/80 shadow-2xs text-xs text-slate-600">
                  <span>
                    Mostrando{' '}
                    <strong className="text-slate-900">
                      {totalItems === 0 ? 0 : startIndex + 1}
                    </strong>
                    –<strong className="text-slate-900">{endIndex}</strong> de{' '}
                    <strong className="text-slate-900">{totalItems}</strong> lojas
                  </span>

                  <div className="flex items-center gap-2">
                    <span className="text-slate-500 mr-1">
                      Página <strong className="text-slate-900">{safeCurrentPage}</strong> de{' '}
                      <strong className="text-slate-900">{totalPages}</strong>
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={safeCurrentPage <= 1 || isLoading}
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      className="h-8 px-2.5 text-xs gap-1 border-slate-200 rounded-lg hover:bg-slate-50"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      <span>Anterior</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={safeCurrentPage >= totalPages || isLoading}
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      className="h-8 px-2.5 text-xs gap-1 border-slate-200 rounded-lg hover:bg-slate-50"
                    >
                      <span>Próxima</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </TooltipProvider>
  )
}
