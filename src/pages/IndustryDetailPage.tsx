import React, { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Factory, RefreshCw, ExternalLink, ShieldCheck, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useIndustryOperational } from '@/services/useIndustryOperational'
import { useValidades } from '@/services/useValidades'
import { useRupturas } from '@/services/useRupturas'
import { IndustryDetailTabs } from '@/components/industrias/IndustryDetailTabs'

export const IndustryDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const operational = useIndustryOperational(id)
  const { items: validades } = useValidades()
  const { rupturas } = useRupturas()

  const { industry, isLoading, error, refetch } = operational

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin" />
          <p className="text-xs text-slate-500 font-medium">
            Carregando cadastro operacional da indústria...
          </p>
        </div>
      </div>
    )
  }

  if (error || !industry) {
    return (
      <div className="p-8 max-w-xl mx-auto my-12 text-center bg-white rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h2 className="text-base font-bold text-slate-900">Indústria não encontrada</h2>
        <p className="text-xs text-slate-500">
          Não localizamos nenhuma indústria registrada com o identificador &quot;{id}&quot;.
        </p>
        <div className="pt-2">
          <Button
            size="sm"
            onClick={() => navigate('/industrias')}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs"
          >
            Voltar para Indústrias
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* HEADER & VOLTAR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/industrias')}
            className="h-8 w-8 p-0 text-slate-500 hover:text-slate-900"
            title="Voltar para a listagem"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>

          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-indigo-600 uppercase tracking-wider">
                Cadastro Operacional
              </span>
              <span className="text-slate-300">•</span>
              <span className="text-xs text-slate-500">Área Indústrias</span>
            </div>
            <div className="flex items-center gap-3 mt-0.5">
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900">{industry.nome}</h1>
              <Badge
                className={
                  industry.status === 'ativa'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-slate-100 text-slate-600 border-slate-200'
                }
              >
                {industry.status === 'ativa' ? 'Ativa' : 'Inativa'}
              </Badge>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="h-8 text-xs text-slate-700 border-slate-200 gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
            <span>Atualizar</span>
          </Button>
        </div>
      </div>

      {/* ABAS CONTEXTUAIS */}
      <IndustryDetailTabs operational={operational} validades={validades} rupturas={rupturas} />
    </div>
  )
}
