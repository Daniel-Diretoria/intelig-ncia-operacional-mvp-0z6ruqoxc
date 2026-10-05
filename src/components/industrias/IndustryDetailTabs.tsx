import React, { useState, useMemo } from 'react'
import {
  Factory,
  Store,
  Package,
  CalendarCheck,
  ShieldCheck,
  History,
  Edit,
  Save,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  Clock,
  Layers,
  ArrowRight,
  Sparkles,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { useAuth } from '@/services/authContext'
import type { UseIndustryOperationalResult } from '@/services/useIndustryOperational'
import type {
  StoreCoverageRelationStatus,
  ProductMixType,
  ProductMixStatus,
  ResearchFrequency,
  ResearchDay,
  IndustryValidityPolicy,
} from '@/types/industryOperational'
import type { ValidadeItem, Ruptura } from '@/types'
import { formatDisplayDate } from '@/lib/format/dateParser'

interface IndustryDetailTabsProps {
  operational: UseIndustryOperationalResult
  validades: ValidadeItem[]
  rupturas: Ruptura[]
}

export const IndustryDetailTabs: React.FC<IndustryDetailTabsProps> = ({
  operational,
  validades,
  rupturas,
}) => {
  const { user } = useAuth()
  const userName = user?.name || user?.email || 'Operador'

  const [activeTab, setActiveTab] = useState<
    'visao-geral' | 'cobertura' | 'mix' | 'pesquisas' | 'validade' | 'auditoria'
  >('visao-geral')

  const {
    industry,
    coverages,
    mix,
    researchConfigs,
    validityPolicies,
    audits,
    saveIndustry,
    saveCoverage,
    removeCoverage,
    saveMixItem,
    removeMixItem,
    saveResearch,
    savePolicy,
    removePolicy,
  } = operational

  // -------------------------------------------------------------
  // ESTADOS MODAIS
  // -------------------------------------------------------------
  // Edição Geral
  const [isEditIndustryModalOpen, setIsEditIndustryModalOpen] = useState(false)
  const [industryForm, setIndustryForm] = useState({
    nome: '',
    razao_social: '',
    cnpj: '',
    segmento: '',
    contato_nome: '',
    contato_email: '',
    contato_telefone: '',
    status: 'ativa' as 'ativa' | 'inativa',
    observacoes: '',
  })

  // Modal Cobertura (Loja)
  const [isCoverageModalOpen, setIsCoverageModalOpen] = useState(false)
  const [coverageForm, setCoverageForm] = useState({
    id: '',
    store_code: '',
    store_name: '',
    network_name: '',
    city: '',
    state: '',
    status_relacao: 'confirmada' as StoreCoverageRelationStatus,
    observacao: '',
  })

  // Modal Mix de Produtos
  const [isMixModalOpen, setIsMixModalOpen] = useState(false)
  const [mixForm, setMixForm] = useState({
    id: '',
    codigo_produto: '',
    cod_barras: '',
    nome_produto: '',
    categoria: 'Geral',
    tipo_mix: 'oficial_industria' as ProductMixType,
    status: 'ativo' as ProductMixStatus,
    shelf_life_dias: 60,
  })

  // Modal Política de Validade / Exceção
  const [isPolicyModalOpen, setIsPolicyModalOpen] = useState(false)
  const [policyForm, setPolicyForm] = useState({
    id: '',
    nivel_regra: 'produto_excecao' as 'industria' | 'produto_excecao',
    produto_nome: '',
    codigo_produto: '',
    dias_critico: 15,
    dias_atencao: 20,
    dias_moderado: 30,
    shelf_life_padrao_dias: 60,
    justificativa: '',
    ativo: true,
  })

  // Confirmação para remoção
  const [confirmDelete, setConfirmDelete] = useState<{
    open: boolean
    type: 'coverage' | 'mix' | 'policy'
    id: string
    title: string
  }>({ open: false, type: 'coverage', id: '', title: '' })

  // -------------------------------------------------------------
  // DADOS CRUZADOS CANÔNICOS
  // -------------------------------------------------------------
  const canonicalData = useMemo(() => {
    if (!industry) return { validades: [], rupturas: [], criticas: 0, atencao: 0, lojas: 0 }
    const norm = industry.nome.trim().toUpperCase()

    const indValidades = validades.filter(
      (v) =>
        (v.cliente || '').trim().toUpperCase() === norm ||
        (v.industria || '').trim().toUpperCase() === norm,
    )
    const indRupturas = rupturas.filter((r) => (r.cliente || '').trim().toUpperCase() === norm)

    const criticas = indValidades.filter((v) => v.diasRestantes <= 15).length
    const atencao = indValidades.filter(
      (v) => v.diasRestantes >= 16 && v.diasRestantes <= 20,
    ).length
    const lojasSet = new Set<string>()
    indValidades.forEach((v) => v.loja && lojasSet.add(v.loja.trim().toUpperCase()))
    indRupturas.forEach((r) => r.nome_loja && lojasSet.add(r.nome_loja.trim().toUpperCase()))

    return {
      validades: indValidades,
      rupturas: indRupturas,
      criticas,
      atencao,
      lojas: lojasSet.size,
    }
  }, [industry, validades, rupturas])

  if (!industry) {
    return (
      <div className="p-8 text-center bg-white rounded-2xl border border-slate-200">
        <p className="text-sm text-slate-500">Nenhuma indústria selecionada.</p>
      </div>
    )
  }

  // -------------------------------------------------------------
  // HANDLERS
  // -------------------------------------------------------------
  const openEditIndustry = () => {
    setIndustryForm({
      nome: industry.nome,
      razao_social: industry.razao_social || '',
      cnpj: industry.cnpj || '',
      segmento: industry.segmento || '',
      contato_nome: industry.contato_nome || '',
      contato_email: industry.contato_email || '',
      contato_telefone: industry.contato_telefone || '',
      status: industry.status,
      observacoes: industry.observacoes || '',
    })
    setIsEditIndustryModalOpen(true)
  }

  const handleSaveIndustrySubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await saveIndustry({
      id: industry.id,
      ...industryForm,
    })
    setIsEditIndustryModalOpen(false)
  }

  const openNewCoverage = () => {
    setCoverageForm({
      id: '',
      store_code: '',
      store_name: '',
      network_name: '',
      city: '',
      state: '',
      status_relacao: 'confirmada',
      observacao: '',
    })
    setIsCoverageModalOpen(true)
  }

  const openEditCoverage = (cov: (typeof coverages)[0]) => {
    setCoverageForm({
      id: cov.id,
      store_code: cov.store_code || '',
      store_name: cov.store_name,
      network_name: cov.network_name || '',
      city: cov.city || '',
      state: cov.state || '',
      status_relacao: cov.status_relacao,
      observacao: cov.observacao || '',
    })
    setIsCoverageModalOpen(true)
  }

  const handleCoverageSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await saveCoverage({
      id: coverageForm.id || undefined,
      industry_id: industry.id,
      industry_name: industry.nome,
      ...coverageForm,
    })
    setIsCoverageModalOpen(false)
  }

  const openNewMix = () => {
    setMixForm({
      id: '',
      codigo_produto: '',
      cod_barras: '',
      nome_produto: '',
      categoria: 'Geral',
      tipo_mix: 'oficial_industria',
      status: 'ativo',
      shelf_life_dias: 60,
    })
    setIsMixModalOpen(true)
  }

  const openEditMix = (item: (typeof mix)[0]) => {
    setMixForm({
      id: item.id,
      codigo_produto: item.codigo_produto || '',
      cod_barras: item.cod_barras || '',
      nome_produto: item.nome_produto,
      categoria: item.categoria || 'Geral',
      tipo_mix: item.tipo_mix,
      status: item.status,
      shelf_life_dias: item.shelf_life_dias || 60,
    })
    setIsMixModalOpen(true)
  }

  const handleMixSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await saveMixItem({
      id: mixForm.id || undefined,
      industry_id: industry.id,
      industry_name: industry.nome,
      ...mixForm,
    })
    setIsMixModalOpen(false)
  }

  const openNewException = () => {
    setPolicyForm({
      id: '',
      nivel_regra: 'produto_excecao',
      produto_nome: '',
      codigo_produto: '',
      dias_critico: 10,
      dias_atencao: 15,
      dias_moderado: 25,
      shelf_life_padrao_dias: 30,
      justificativa: '',
      ativo: true,
    })
    setIsPolicyModalOpen(true)
  }

  const openEditPolicy = (p: IndustryValidityPolicy) => {
    setPolicyForm({
      id: p.id,
      nivel_regra: p.nivel_regra as any,
      produto_nome: p.produto_nome || '',
      codigo_produto: p.codigo_produto || '',
      dias_critico: p.dias_critico,
      dias_atencao: p.dias_atencao,
      dias_moderado: p.dias_moderado || 30,
      shelf_life_padrao_dias: p.shelf_life_padrao_dias || 60,
      justificativa: p.justificativa || '',
      ativo: p.ativo,
    })
    setIsPolicyModalOpen(true)
  }

  const handlePolicySubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await savePolicy({
      id: policyForm.id || undefined,
      industry_id: industry.id,
      ...policyForm,
    })
    setIsPolicyModalOpen(false)
  }

  const handleConfirmDelete = async () => {
    if (confirmDelete.type === 'coverage') {
      await removeCoverage(confirmDelete.id)
    } else if (confirmDelete.type === 'mix') {
      await removeMixItem(confirmDelete.id)
    } else if (confirmDelete.type === 'policy') {
      await removePolicy(confirmDelete.id)
    }
    setConfirmDelete({ open: false, type: 'coverage', id: '', title: '' })
  }

  // Pesquisas: atalhos de toggle e frequência
  const validadesConfig = researchConfigs.find((r) => r.tipo_pesquisa === 'validades')
  const rupturasConfig = researchConfigs.find((r) => r.tipo_pesquisa === 'rupturas')

  const toggleResearchStatus = async (type: 'validades' | 'rupturas') => {
    const cfg = type === 'validades' ? validadesConfig : rupturasConfig
    const currentActive = cfg ? cfg.ativo : false
    await saveResearch({
      id: cfg?.id,
      industry_id: industry.id,
      tipo_pesquisa: type,
      ativo: !currentActive,
      frequencia: cfg?.frequencia || 'semanal',
      dia_esperado: cfg?.dia_esperado || 'terca',
      tolerancia_dias: cfg?.tolerancia_dias ?? 1,
    })
  }

  const updateResearchParam = async (
    type: 'validades' | 'rupturas',
    field: 'frequencia' | 'dia_esperado',
    value: string,
  ) => {
    const cfg = type === 'validades' ? validadesConfig : rupturasConfig
    await saveResearch({
      id: cfg?.id,
      industry_id: industry.id,
      tipo_pesquisa: type,
      ativo: cfg ? cfg.ativo : true,
      frequencia: (field === 'frequencia' ? value : cfg?.frequencia || 'semanal') as any,
      dia_esperado: (field === 'dia_esperado' ? value : cfg?.dia_esperado || 'terca') as any,
      tolerancia_dias: cfg?.tolerancia_dias ?? 1,
    })
  }

  return (
    <div className="space-y-6">
      {/* NAVEGAÇÃO POR ABAS CONTEXTUAIS */}
      <div className="flex items-center gap-1.5 p-1 bg-slate-100/90 rounded-xl border border-slate-200/80 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('visao-geral')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
            activeTab === 'visao-geral'
              ? 'bg-white text-indigo-700 shadow-2xs font-bold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
          }`}
        >
          <Factory className="w-3.5 h-3.5" />
          <span>Visão Geral</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('cobertura')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
            activeTab === 'cobertura'
              ? 'bg-white text-indigo-700 shadow-2xs font-bold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
          }`}
        >
          <Store className="w-3.5 h-3.5" />
          <span>Cobertura Operacional</span>
          <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-indigo-50 text-indigo-600">
            {coverages.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('mix')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
            activeTab === 'mix'
              ? 'bg-white text-indigo-700 shadow-2xs font-bold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
          }`}
        >
          <Package className="w-3.5 h-3.5" />
          <span>Mix de Produtos</span>
          <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-indigo-50 text-indigo-600">
            {mix.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('pesquisas')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
            activeTab === 'pesquisas'
              ? 'bg-white text-indigo-700 shadow-2xs font-bold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
          }`}
        >
          <CalendarCheck className="w-3.5 h-3.5" />
          <span>Pesquisas Obrigatórias</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('validade')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
            activeTab === 'validade'
              ? 'bg-white text-indigo-700 shadow-2xs font-bold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Política de Validade</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('auditoria')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
            activeTab === 'auditoria'
              ? 'bg-white text-indigo-700 shadow-2xs font-bold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
          }`}
        >
          <History className="w-3.5 h-3.5" />
          <span>Histórico &amp; Auditoria</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* 1. ABA: VISÃO GERAL                                                       */}
      {/* ========================================================================= */}
      {activeTab === 'visao-geral' && (
        <div className="space-y-6">
          {/* Card Resumo do Cadastro */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                  <Factory className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-slate-900">{industry.nome}</h2>
                    <Badge
                      className={
                        industry.status === 'ativa'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-slate-100 text-slate-600 border-slate-200'
                      }
                    >
                      {industry.status === 'ativa' ? 'Indústria Ativa' : 'Inativa'}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-500">
                    Chave canônica de relacionamento:{' '}
                    <code className="text-slate-700 font-mono bg-slate-100 px-1 py-0.5 rounded">
                      {industry.nome_chave}
                    </code>
                  </p>
                </div>
              </div>

              <Button
                size="sm"
                variant="outline"
                onClick={openEditIndustry}
                className="gap-1.5 text-xs text-slate-700 border-slate-200"
              >
                <Edit className="w-3.5 h-3.5 text-slate-500" />
                <span>Editar Cadastro</span>
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs pt-1">
              <div>
                <span className="text-slate-400 block text-[11px]">Razão Social</span>
                <span className="font-semibold text-slate-800">
                  {industry.razao_social || 'Não informada'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">CNPJ</span>
                <span className="font-semibold text-slate-800">
                  {industry.cnpj || 'Não informado'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Segmento</span>
                <span className="font-semibold text-slate-800">
                  {industry.segmento || 'Alimentos / Consumo'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Contato Principal</span>
                <span className="font-semibold text-slate-800">
                  {industry.contato_nome || 'Não cadastrado'}
                  {industry.contato_email ? ` (${industry.contato_email})` : ''}
                </span>
              </div>
            </div>

            {industry.observacoes && (
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-600">
                <span className="font-semibold text-slate-700 block mb-0.5">
                  Observações Operacionais:
                </span>
                {industry.observacoes}
              </div>
            )}
          </div>

          {/* Comparativo: Base Cadastrada vs Operação Observada */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Lojas na Cobertura
              </span>
              <p className="text-2xl font-bold text-slate-900 mt-2">{coverages.length}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {coverages.filter((c) => c.status_relacao === 'confirmada').length} confirmadas •{' '}
                {canonicalData.lojas} na Base Atual
              </p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Mix Cadastrado
              </span>
              <p className="text-2xl font-bold text-slate-900 mt-2">{mix.length}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {mix.filter((m) => m.tipo_mix === 'oficial_industria').length} oficiais •{' '}
                {mix.filter((m) => m.tipo_mix === 'observado_operacional').length} observados
              </p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Pesquisas Configuradas
              </span>
              <p className="text-2xl font-bold text-indigo-600 mt-2">
                {researchConfigs.filter((r) => r.ativo).length} de {researchConfigs.length}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {validadesConfig?.ativo ? 'Validades ativas' : 'Validades inativas'} •{' '}
                {rupturasConfig?.ativo ? 'Rupturas ativas' : 'Rupturas inativas'}
              </p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Regras de Validade
              </span>
              <p className="text-2xl font-bold text-emerald-600 mt-2">{validityPolicies.length}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {validityPolicies.filter((p) => p.nivel_regra === 'produto_excecao').length}{' '}
                exceção(ões) de produto
              </p>
            </div>
          </div>

          {/* Destaque didático da Fundação para o Futuro Motor */}
          <div className="bg-indigo-50/60 border border-indigo-100 rounded-2xl p-5 flex items-start gap-3.5 text-xs text-indigo-900 leading-relaxed">
            <Info className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
            <div>
              <strong className="block font-bold text-indigo-950 mb-1">
                Fundação Operacional do Motor de Acompanhamento (Etapa Estrutural)
              </strong>
              <p className="text-indigo-800">
                Esta tela administra a fonte da verdade para pesquisas e políticas da indústria. As
                configurações aqui cadastradas servirão como parâmetros para as futuras análises de
                ciclos e aderência sem qualquer código fixado.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. ABA: COBERTURA OPERACIONAL (LOJAS)                                      */}
      {/* ========================================================================= */}
      {activeTab === 'cobertura' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Cobertura Operacional de Lojas ({coverages.length})
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Identifica onde a indústria atua. Lojas detectadas pelo sistema histórico são
                mantidas sem descartes automáticos.
              </p>
            </div>
            <Button
              size="sm"
              onClick={openNewCoverage}
              className="bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5 text-xs self-start sm:self-auto"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Adicionar Loja à Cobertura</span>
            </Button>
          </div>

          {coverages.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">
              Nenhuma loja registrada na cobertura desta indústria.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/70 border-b border-slate-200 text-slate-600 font-semibold">
                    <th className="py-2.5 px-3">Código</th>
                    <th className="py-2.5 px-3">Loja</th>
                    <th className="py-2.5 px-3">Rede / Bandeira</th>
                    <th className="py-2.5 px-3">Cidade / UF</th>
                    <th className="py-2.5 px-3 text-center">Status da Relação</th>
                    <th className="py-2.5 px-3">Origem</th>
                    <th className="py-2.5 px-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {coverages.map((cov) => {
                    const badgeStyles: Record<StoreCoverageRelationStatus, string> = {
                      detectada: 'bg-indigo-50 text-indigo-700 border-indigo-200',
                      confirmada: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                      ativa: 'bg-blue-50 text-blue-700 border-blue-200',
                      inativa: 'bg-slate-100 text-slate-500 border-slate-200',
                    }
                    const badgeLabels: Record<StoreCoverageRelationStatus, string> = {
                      detectada: 'Detectada pelo Sistema',
                      confirmada: 'Confirmada pela Operação',
                      ativa: 'Ativa em Atendimento',
                      inativa: 'Inativa / Suspensa',
                    }

                    return (
                      <tr key={cov.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-2.5 px-3 font-mono font-medium text-slate-600">
                          {cov.store_code || '—'}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-slate-900">
                          {cov.store_name}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">{cov.network_name || '—'}</td>
                        <td className="py-2.5 px-3 text-slate-600">
                          {cov.city ? `${cov.city}${cov.state ? ` - ${cov.state}` : ''}` : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <Badge
                            variant="outline"
                            className={`text-[10px] font-semibold ${badgeStyles[cov.status_relacao]}`}
                          >
                            {badgeLabels[cov.status_relacao]}
                          </Badge>
                        </td>
                        <td className="py-2.5 px-3 text-[11px] text-slate-400">
                          {cov.origem_deteccao === 'historico_validades'
                            ? 'Histórico Validades'
                            : cov.origem_deteccao === 'historico_rupturas'
                              ? 'Histórico Rupturas'
                              : 'Cadastro Manual'}
                        </td>
                        <td className="py-2.5 px-3 text-right space-x-1 whitespace-nowrap">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditCoverage(cov)}
                            className="h-7 px-2 text-slate-600 hover:text-indigo-600 text-xs"
                          >
                            Editar
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setConfirmDelete({
                                open: true,
                                type: 'coverage',
                                id: cov.id,
                                title: `Remover loja ${cov.store_name} da cobertura?`,
                              })
                            }
                            className="h-7 px-2 text-slate-400 hover:text-red-600 text-xs"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. ABA: MIX DE PRODUTOS                                                   */}
      {/* ========================================================================= */}
      {activeTab === 'mix' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">
                  Mix de Produtos ({mix.length})
                </h3>
                <span className="text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                  Mix da Indústria ≠ Mix de Todas as Lojas
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Distingue o catálogo oficial do fornecedor do mix observado em loja pelo histórico.
              </p>
            </div>
            <Button
              size="sm"
              onClick={openNewMix}
              className="bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5 text-xs self-start sm:self-auto"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Cadastrar Produto no Mix</span>
            </Button>
          </div>

          {mix.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">
              Nenhum produto cadastrado no mix desta indústria.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/70 border-b border-slate-200 text-slate-600 font-semibold">
                    <th className="py-2.5 px-3">Código</th>
                    <th className="py-2.5 px-3">Produto</th>
                    <th className="py-2.5 px-3">Categoria</th>
                    <th className="py-2.5 px-3 text-center">Tipo de Mix</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                    <th className="py-2.5 px-3 text-center">Shelf Life Esperado</th>
                    <th className="py-2.5 px-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {mix.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-2.5 px-3 font-mono text-slate-600">
                        {item.codigo_produto || item.cod_barras || '—'}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-900">
                        {item.nome_produto}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">{item.categoria || 'Geral'}</td>
                      <td className="py-2.5 px-3 text-center">
                        <Badge
                          variant="outline"
                          className={
                            item.tipo_mix === 'oficial_industria'
                              ? 'bg-purple-50 text-purple-700 border-purple-200'
                              : 'bg-blue-50 text-blue-700 border-blue-200'
                          }
                        >
                          {item.tipo_mix === 'oficial_industria'
                            ? 'Oficial da Indústria'
                            : 'Observado em Loja'}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <Badge
                          variant="outline"
                          className={
                            item.status === 'ativo'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : item.status === 'descontinuado'
                                ? 'bg-slate-100 text-slate-500 border-slate-200'
                                : 'bg-amber-50 text-amber-700 border-amber-200'
                          }
                        >
                          {item.status}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 text-center tabular-nums text-slate-700 font-medium">
                        {item.shelf_life_dias ? `${item.shelf_life_dias} dias` : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right space-x-1 whitespace-nowrap">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditMix(item)}
                          className="h-7 px-2 text-slate-600 hover:text-indigo-600 text-xs"
                        >
                          Editar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setConfirmDelete({
                              open: true,
                              type: 'mix',
                              id: item.id,
                              title: `Remover "${item.nome_produto}" do mix?`,
                            })
                          }
                          className="h-7 px-2 text-slate-400 hover:text-red-600 text-xs"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. ABA: PESQUISAS OBRIGATÓRIAS                                            */}
      {/* ========================================================================= */}
      {activeTab === 'pesquisas' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-4">
            <div className="border-b border-slate-100 pb-4">
              <h3 className="text-base font-bold text-slate-900">
                Pesquisas Obrigatórias por Indústria
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Define quais pesquisas de campo devem ocorrer, a frequência esperada e o dia da
                semana programado. Futuros motores de acompanhamento lerão diretamente estas
                configurações.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
              {/* Card Pesquisa: Validades */}
              <div
                className={`p-5 rounded-2xl border transition-all ${
                  validadesConfig?.ativo
                    ? 'border-indigo-200 bg-indigo-50/20'
                    : 'border-slate-200 bg-slate-50/50 opacity-75'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-indigo-100/80 text-indigo-700 flex items-center justify-center">
                      <CalendarCheck className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">Pesquisa de Validades</h4>
                      <p className="text-[11px] text-slate-500">
                        Aferição de datas de vencimento em loja
                      </p>
                    </div>
                  </div>

                  <Button
                    size="sm"
                    variant={validadesConfig?.ativo ? 'default' : 'outline'}
                    onClick={() => toggleResearchStatus('validades')}
                    className={
                      validadesConfig?.ativo
                        ? 'bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-8'
                        : 'text-slate-600 text-xs h-8'
                    }
                  >
                    {validadesConfig?.ativo ? 'Ativa' : 'Inativa'}
                  </Button>
                </div>

                <div className="mt-4 pt-4 border-t border-slate-200/60 space-y-3 text-xs">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                        Frequência
                      </label>
                      <select
                        value={validadesConfig?.frequencia || 'semanal'}
                        onChange={(e) =>
                          updateResearchParam('validades', 'frequencia', e.target.value)
                        }
                        className="w-full h-8 px-2.5 bg-white border border-slate-300 rounded-lg text-slate-800 text-xs font-medium cursor-pointer"
                      >
                        <option value="diaria">Diária</option>
                        <option value="semanal">Semanal</option>
                        <option value="quinzenal">Quinzenal</option>
                        <option value="mensal">Mensal</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                        Dia Esperado
                      </label>
                      <select
                        value={validadesConfig?.dia_esperado || 'terca'}
                        onChange={(e) =>
                          updateResearchParam('validades', 'dia_esperado', e.target.value)
                        }
                        className="w-full h-8 px-2.5 bg-white border border-slate-300 rounded-lg text-slate-800 text-xs font-medium cursor-pointer"
                      >
                        <option value="segunda">Segunda-feira</option>
                        <option value="terca">Terça-feira</option>
                        <option value="quarta">Quarta-feira</option>
                        <option value="quinta">Quinta-feira</option>
                        <option value="sexta">Sexta-feira</option>
                        <option value="sabado">Sábado</option>
                        <option value="domingo">Domingo</option>
                        <option value="qualquer">Qualquer dia</option>
                      </select>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-white/80 border border-slate-200 text-[11px] text-slate-600">
                    <span className="font-semibold text-slate-800 block">Regra Configurada:</span>
                    A pesquisa de validades deve ser realizada com frequência{' '}
                    <strong>{validadesConfig?.frequencia || 'semanal'}</strong> com execução
                    prevista em <strong>{validadesConfig?.dia_esperado || 'terca'}-feira</strong>.
                  </div>
                </div>
              </div>

              {/* Card Pesquisa: Rupturas */}
              <div
                className={`p-5 rounded-2xl border transition-all ${
                  rupturasConfig?.ativo
                    ? 'border-indigo-200 bg-indigo-50/20'
                    : 'border-slate-200 bg-slate-50/50 opacity-75'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-amber-100/80 text-amber-800 flex items-center justify-center">
                      <Clock className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">Pesquisa de Rupturas</h4>
                      <p className="text-[11px] text-slate-500">
                        Identificação de falta de produtos em gôndola
                      </p>
                    </div>
                  </div>

                  <Button
                    size="sm"
                    variant={rupturasConfig?.ativo ? 'default' : 'outline'}
                    onClick={() => toggleResearchStatus('rupturas')}
                    className={
                      rupturasConfig?.ativo
                        ? 'bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-8'
                        : 'text-slate-600 text-xs h-8'
                    }
                  >
                    {rupturasConfig?.ativo ? 'Ativa' : 'Inativa'}
                  </Button>
                </div>

                <div className="mt-4 pt-4 border-t border-slate-200/60 space-y-3 text-xs">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                        Frequência
                      </label>
                      <select
                        value={rupturasConfig?.frequencia || 'semanal'}
                        onChange={(e) =>
                          updateResearchParam('rupturas', 'frequencia', e.target.value)
                        }
                        className="w-full h-8 px-2.5 bg-white border border-slate-300 rounded-lg text-slate-800 text-xs font-medium cursor-pointer"
                      >
                        <option value="diaria">Diária</option>
                        <option value="semanal">Semanal</option>
                        <option value="quinzenal">Quinzenal</option>
                        <option value="mensal">Mensal</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                        Dia Esperado
                      </label>
                      <select
                        value={rupturasConfig?.dia_esperado || 'terca'}
                        onChange={(e) =>
                          updateResearchParam('rupturas', 'dia_esperado', e.target.value)
                        }
                        className="w-full h-8 px-2.5 bg-white border border-slate-300 rounded-lg text-slate-800 text-xs font-medium cursor-pointer"
                      >
                        <option value="segunda">Segunda-feira</option>
                        <option value="terca">Terça-feira</option>
                        <option value="quarta">Quarta-feira</option>
                        <option value="quinta">Quinta-feira</option>
                        <option value="sexta">Sexta-feira</option>
                        <option value="sabado">Sábado</option>
                        <option value="domingo">Domingo</option>
                        <option value="qualquer">Qualquer dia</option>
                      </select>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-white/80 border border-slate-200 text-[11px] text-slate-600">
                    <span className="font-semibold text-slate-800 block">Regra Configurada:</span>
                    A pesquisa de rupturas deve ser realizada com frequência{' '}
                    <strong>{rupturasConfig?.frequencia || 'semanal'}</strong> com execução prevista
                    em <strong>{rupturasConfig?.dia_esperado || 'terca'}-feira</strong>.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. ABA: POLÍTICA DE VALIDADE & EXCEÇÕES DE PRODUTO                          */}
      {/* ========================================================================= */}
      {activeTab === 'validade' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">
                  Política de Validade &amp; Criticidade
                </h3>
                <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                  Herança em Cascata Ativa
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                A criticidade segue a cadeia de precedência:{' '}
                <em>
                  Regra padrão do sistema ↓ Regra específica da indústria ↓ Exceção específica do
                  produto
                </em>
                .
              </p>
            </div>
            <Button
              size="sm"
              onClick={openNewException}
              className="bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5 text-xs self-start sm:self-auto"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Cadastrar Exceção de Produto</span>
            </Button>
          </div>

          {/* Diagrama Didático de Herança */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 rounded-xl bg-slate-50 border border-slate-200/80 text-xs">
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-400">
                1º Nível (Base)
              </span>
              <p className="font-bold text-slate-800">Regra Padrão do Sistema</p>
              <p className="text-slate-500 text-[11px]">
                Crítico: 15d • Atenção: 20d • Moderado: 30d
              </p>
            </div>
            <div className="space-y-1 md:border-l md:border-slate-200 md:pl-4">
              <span className="text-[10px] uppercase font-bold text-indigo-600">
                2º Nível (Sobrescreve Sistema)
              </span>
              <p className="font-bold text-indigo-950">Regra Específica da Indústria</p>
              {(() => {
                const indRule = validityPolicies.find(
                  (p) => p.nivel_regra === 'industria' && p.ativo,
                )
                return (
                  <p className="text-indigo-800 text-[11px]">
                    {indRule
                      ? `Crítico: ${indRule.dias_critico}d • Atenção: ${indRule.dias_atencao}d`
                      : 'Herda o padrão do sistema'}
                  </p>
                )
              })()}
            </div>
            <div className="space-y-1 md:border-l md:border-slate-200 md:pl-4">
              <span className="text-[10px] uppercase font-bold text-purple-600">
                3º Nível (Sobrescreve Ambos)
              </span>
              <p className="font-bold text-purple-950">Exceções por Produto</p>
              <p className="text-purple-800 text-[11px]">
                {validityPolicies.filter((p) => p.nivel_regra === 'produto_excecao').length}{' '}
                produto(s) com regra personalizada
              </p>
            </div>
          </div>

          {/* Tabela de Regras Atuais da Indústria */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Políticas Configuradas para esta Indústria
            </h4>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/70 border-b border-slate-200 text-slate-600 font-semibold">
                    <th className="py-2.5 px-3">Nível</th>
                    <th className="py-2.5 px-3">Produto / Escopo</th>
                    <th className="py-2.5 px-3 text-center">Dias para Crítico</th>
                    <th className="py-2.5 px-3 text-center">Dias para Atenção</th>
                    <th className="py-2.5 px-3 text-center">Shelf Life Esperado</th>
                    <th className="py-2.5 px-3">Justificativa</th>
                    <th className="py-2.5 px-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {validityPolicies.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-2.5 px-3">
                        <Badge
                          variant="outline"
                          className={
                            p.nivel_regra === 'produto_excecao'
                              ? 'bg-purple-50 text-purple-700 border-purple-200 font-bold'
                              : p.nivel_regra === 'industria'
                                ? 'bg-indigo-50 text-indigo-700 border-indigo-200 font-bold'
                                : 'bg-slate-100 text-slate-700 border-slate-300'
                          }
                        >
                          {p.nivel_regra === 'produto_excecao'
                            ? 'Exceção Produto'
                            : p.nivel_regra === 'industria'
                              ? 'Regra da Indústria'
                              : 'Regra Sistema'}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-900">
                        {p.nivel_regra === 'produto_excecao'
                          ? p.produto_nome || 'Produto sem nome'
                          : p.nivel_regra === 'industria'
                            ? `Todos os produtos de ${industry.nome}`
                            : 'Padrão Geral do Sistema'}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <Badge
                          variant="outline"
                          className="bg-red-50 text-red-700 border-red-200 font-bold"
                        >
                          ≤ {p.dias_critico}d
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <Badge
                          variant="outline"
                          className="bg-amber-50 text-amber-700 border-amber-200 font-bold"
                        >
                          ≤ {p.dias_atencao}d
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 text-center tabular-nums text-slate-700">
                        {p.shelf_life_padrao_dias ? `${p.shelf_life_padrao_dias}d` : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 max-w-xs truncate">
                        {p.justificativa || '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right space-x-1 whitespace-nowrap">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditPolicy(p)}
                          className="h-7 px-2 text-slate-600 hover:text-indigo-600 text-xs"
                        >
                          Editar
                        </Button>
                        {p.nivel_regra === 'produto_excecao' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setConfirmDelete({
                                open: true,
                                type: 'policy',
                                id: p.id,
                                title: `Remover exceção para "${p.produto_nome}"?`,
                              })
                            }
                            className="h-7 px-2 text-slate-400 hover:text-red-600 text-xs"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 6. ABA: HISTÓRICO & AUDITORIA DE CONFIGURAÇÕES                            */}
      {/* ========================================================================= */}
      {activeTab === 'auditoria' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-4">
          <div className="border-b border-slate-100 pb-4">
            <h3 className="text-base font-bold text-slate-900">
              Histórico &amp; Auditoria de Alterações ({audits.length})
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Preserva a rastreabilidade de todas as alterações feitas na cobertura, mix, pesquisas
              e políticas desta indústria.
            </p>
          </div>

          {audits.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">
              Nenhuma alteração registrada até o momento no histórico desta indústria.
            </div>
          ) : (
            <div className="space-y-2.5">
              {audits.map((a) => (
                <div
                  key={a.id}
                  className="p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className="text-[10px] font-semibold bg-white text-slate-700"
                      >
                        {a.modulo.replace('_', ' ').toUpperCase()}
                      </Badge>
                      <span className="font-semibold text-slate-900">{a.acao}</span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Alterado por <strong>{a.usuario_nome || 'Operador'}</strong> em{' '}
                      {formatDisplayDate(a.created || a.data_alteracao, '—')}
                    </p>
                  </div>
                  {a.detalhes_json && (
                    <pre className="text-[10px] font-mono bg-white p-2 rounded border border-slate-200 text-slate-600 max-h-20 overflow-auto max-w-xs sm:max-w-md">
                      {JSON.stringify(a.detalhes_json, null, 2)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* DIÁLOGOS MODAIS                                                           */}
      {/* ========================================================================= */}

      {/* Modal 1: Edição da Indústria */}
      <Dialog open={isEditIndustryModalOpen} onOpenChange={setIsEditIndustryModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar Cadastro da Indústria</DialogTitle>
            <DialogDescription className="text-xs">
              Atualize as informações operacionais básicas deste fornecedor.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveIndustrySubmit} className="space-y-3.5 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Nome da Indústria / Marca *</label>
                <Input
                  required
                  value={industryForm.nome}
                  onChange={(e) => setIndustryForm({ ...industryForm, nome: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Status Operacional</label>
                <select
                  value={industryForm.status}
                  onChange={(e) =>
                    setIndustryForm({ ...industryForm, status: e.target.value as any })
                  }
                  className="w-full h-8 px-2 bg-white border border-slate-300 rounded-md text-xs font-medium"
                >
                  <option value="ativa">Ativa</option>
                  <option value="inativa">Inativa</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Razão Social</label>
                <Input
                  value={industryForm.razao_social}
                  onChange={(e) =>
                    setIndustryForm({ ...industryForm, razao_social: e.target.value })
                  }
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">CNPJ</label>
                <Input
                  value={industryForm.cnpj}
                  onChange={(e) => setIndustryForm({ ...industryForm, cnpj: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Segmento</label>
                <Input
                  value={industryForm.segmento}
                  onChange={(e) => setIndustryForm({ ...industryForm, segmento: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Nome do Contato</label>
                <Input
                  value={industryForm.contato_nome}
                  onChange={(e) =>
                    setIndustryForm({ ...industryForm, contato_nome: e.target.value })
                  }
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">E-mail</label>
                <Input
                  type="email"
                  value={industryForm.contato_email}
                  onChange={(e) =>
                    setIndustryForm({ ...industryForm, contato_email: e.target.value })
                  }
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-700">Observações Operacionais</label>
              <textarea
                rows={2}
                value={industryForm.observacoes}
                onChange={(e) => setIndustryForm({ ...industryForm, observacoes: e.target.value })}
                className="w-full p-2 bg-white border border-slate-300 rounded-md text-xs"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsEditIndustryModalOpen(false)}
                className="text-xs"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs"
              >
                Salvar Alterações
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal 2: Cobertura de Loja */}
      <Dialog open={isCoverageModalOpen} onOpenChange={setIsCoverageModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {coverageForm.id ? 'Editar Cobertura de Loja' : 'Adicionar Loja à Cobertura'}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Informe a loja onde a indústria atua e defina o status da relação.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCoverageSubmit} className="space-y-3.5 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Código da Loja</label>
                <Input
                  placeholder="Ex: 250"
                  value={coverageForm.store_code}
                  onChange={(e) => setCoverageForm({ ...coverageForm, store_code: e.target.value })}
                  className="h-8 text-xs font-mono"
                />
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Status da Relação</label>
                <select
                  value={coverageForm.status_relacao}
                  onChange={(e) =>
                    setCoverageForm({ ...coverageForm, status_relacao: e.target.value as any })
                  }
                  className="w-full h-8 px-2 bg-white border border-slate-300 rounded-md text-xs font-medium"
                >
                  <option value="confirmada">Confirmada Operacionalmente</option>
                  <option value="detectada">Detectada pelo Sistema</option>
                  <option value="ativa">Ativa</option>
                  <option value="inativa">Inativa</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-700">Nome da Loja *</label>
              <Input
                required
                placeholder="Ex: FORT ATACADISTA FLORESTA"
                value={coverageForm.store_name}
                onChange={(e) => setCoverageForm({ ...coverageForm, store_name: e.target.value })}
                className="h-8 text-xs"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Rede / Bandeira</label>
                <Input
                  placeholder="Ex: Grupo Pereira"
                  value={coverageForm.network_name}
                  onChange={(e) =>
                    setCoverageForm({ ...coverageForm, network_name: e.target.value })
                  }
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Cidade</label>
                <Input
                  placeholder="Ex: Joinville"
                  value={coverageForm.city}
                  onChange={(e) => setCoverageForm({ ...coverageForm, city: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">UF</label>
                <Input
                  placeholder="Ex: SC"
                  maxLength={2}
                  value={coverageForm.state}
                  onChange={(e) =>
                    setCoverageForm({ ...coverageForm, state: e.target.value.toUpperCase() })
                  }
                  className="h-8 text-xs font-mono uppercase"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-700">Observação</label>
              <Input
                placeholder="Ex: Ponto de venda estratégico"
                value={coverageForm.observacao}
                onChange={(e) => setCoverageForm({ ...coverageForm, observacao: e.target.value })}
                className="h-8 text-xs"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsCoverageModalOpen(false)}
                className="text-xs"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs"
              >
                Salvar Cobertura
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal 3: Mix de Produtos */}
      <Dialog open={isMixModalOpen} onOpenChange={setIsMixModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {mixForm.id ? 'Editar Produto do Mix' : 'Cadastrar Produto no Mix'}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Mantenha o mix oficial da indústria ou ajuste os produtos observados.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleMixSubmit} className="space-y-3.5 text-xs">
            <div className="space-y-1">
              <label className="font-semibold text-slate-700">Nome do Produto *</label>
              <Input
                required
                placeholder="Ex: IOGURTE EM PEDAÇOS MORANGO"
                value={mixForm.nome_produto}
                onChange={(e) => setMixForm({ ...mixForm, nome_produto: e.target.value })}
                className="h-8 text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Código Interno / SKU</label>
                <Input
                  placeholder="Ex: 444"
                  value={mixForm.codigo_produto}
                  onChange={(e) => setMixForm({ ...mixForm, codigo_produto: e.target.value })}
                  className="h-8 text-xs font-mono"
                />
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Código de Barras (EAN)</label>
                <Input
                  placeholder="Ex: 789..."
                  value={mixForm.cod_barras}
                  onChange={(e) => setMixForm({ ...mixForm, cod_barras: e.target.value })}
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Tipo de Mix</label>
                <select
                  value={mixForm.tipo_mix}
                  onChange={(e) => setMixForm({ ...mixForm, tipo_mix: e.target.value as any })}
                  className="w-full h-8 px-2 bg-white border border-slate-300 rounded-md text-xs font-medium"
                >
                  <option value="oficial_industria">Oficial da Indústria</option>
                  <option value="observado_operacional">Observado em Loja</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Status</label>
                <select
                  value={mixForm.status}
                  onChange={(e) => setMixForm({ ...mixForm, status: e.target.value as any })}
                  className="w-full h-8 px-2 bg-white border border-slate-300 rounded-md text-xs font-medium"
                >
                  <option value="ativo">Ativo</option>
                  <option value="em_avaliacao">Em Avaliação</option>
                  <option value="descontinuado">Descontinuado</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Shelf Life (dias)</label>
                <Input
                  type="number"
                  placeholder="60"
                  value={mixForm.shelf_life_dias}
                  onChange={(e) =>
                    setMixForm({ ...mixForm, shelf_life_dias: Number(e.target.value) })
                  }
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsMixModalOpen(false)}
                className="text-xs"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs"
              >
                Salvar Produto
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal 4: Exceção de Política de Validade */}
      <Dialog open={isPolicyModalOpen} onOpenChange={setIsPolicyModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {policyForm.nivel_regra === 'industria'
                ? 'Editar Regra da Indústria'
                : 'Cadastrar Exceção Específica de Produto'}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Sobrescreva as faixas de dias para que um produto entre em Atenção ou Crítico.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handlePolicySubmit} className="space-y-3.5 text-xs">
            {policyForm.nivel_regra === 'produto_excecao' && (
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Nome do Produto (Exceção) *</label>
                <Input
                  required
                  placeholder="Ex: IOGURTE MORANGO 1,25L"
                  value={policyForm.produto_nome}
                  onChange={(e) => setPolicyForm({ ...policyForm, produto_nome: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
            )}

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="font-semibold text-red-600">Dias para Crítico *</label>
                <Input
                  type="number"
                  required
                  value={policyForm.dias_critico}
                  onChange={(e) =>
                    setPolicyForm({ ...policyForm, dias_critico: Number(e.target.value) })
                  }
                  className="h-8 text-xs"
                />
                <span className="text-[10px] text-slate-400">Padrão: 15d</span>
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-amber-700">Dias para Atenção *</label>
                <Input
                  type="number"
                  required
                  value={policyForm.dias_atencao}
                  onChange={(e) =>
                    setPolicyForm({ ...policyForm, dias_atencao: Number(e.target.value) })
                  }
                  className="h-8 text-xs"
                />
                <span className="text-[10px] text-slate-400">Padrão: 20d</span>
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Shelf Life Esperado</label>
                <Input
                  type="number"
                  value={policyForm.shelf_life_padrao_dias}
                  onChange={(e) =>
                    setPolicyForm({ ...policyForm, shelf_life_padrao_dias: Number(e.target.value) })
                  }
                  className="h-8 text-xs"
                />
                <span className="text-[10px] text-slate-400">Em dias</span>
              </div>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-700">Justificativa da Regra *</label>
              <textarea
                required
                rows={2}
                placeholder="Ex: Produto de altíssimo giro com validade curta de fábrica."
                value={policyForm.justificativa}
                onChange={(e) => setPolicyForm({ ...policyForm, justificativa: e.target.value })}
                className="w-full p-2 bg-white border border-slate-300 rounded-md text-xs"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsPolicyModalOpen(false)}
                className="text-xs"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs"
              >
                Salvar Política
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal Confirmação de Exclusão */}
      <Dialog
        open={confirmDelete.open}
        onOpenChange={(open) => setConfirmDelete((prev) => ({ ...prev, open }))}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-red-600 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              <span>Confirmar Remoção</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-600 pt-1">
              {confirmDelete.title}
              <br />
              <span className="text-slate-400 mt-1 block">
                Esta ação será auditada no histórico da indústria.
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setConfirmDelete({ open: false, type: 'coverage', id: '', title: '' })}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleConfirmDelete}
              className="text-xs bg-red-600 hover:bg-red-700"
            >
              Confirmar Remoção
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
