import React from 'react'
import { Link } from 'react-router-dom'
import { Info, RefreshCw, Upload, AlertCircle } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

interface BaseEmReconstrucaoBannerProps {
  totalValidades?: number
  totalRupturas?: number
  className?: string
}

/**
 * Componente que identifica quando a base operacional está sem massa suficiente
 * (ex: logo após a limpeza de preparação do piloto histórico) e orienta o operador
 * a importar o período histórico sem gerar falsos alertas de criticidade.
 */
export const BaseEmReconstrucaoBanner: React.FC<BaseEmReconstrucaoBannerProps> = ({
  totalValidades = 0,
  totalRupturas = 0,
  className = '',
}) => {
  const isVazia = totalValidades === 0 && totalRupturas === 0

  if (!isVazia) {
    return null
  }

  return (
    <Alert
      className={`border-amber-300 bg-amber-50/70 text-amber-900 rounded-2xl p-5 shadow-xs ${className}`}
    >
      <div className="flex items-start gap-3.5">
        <div className="w-10 h-10 rounded-xl bg-amber-100 border border-amber-200 flex items-center justify-center text-amber-700 shrink-0">
          <Info className="w-5 h-5" />
        </div>
        <div className="flex-1 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <AlertTitle className="text-sm font-bold text-amber-900 tracking-tight mb-0">
              Base Operacional em Reconstrução (Piloto Histórico)
            </AlertTitle>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-300">
              Aguardando sincronização
            </span>
          </div>
          <AlertDescription className="text-xs text-amber-800 leading-relaxed">
            A massa operacional de Validades e Rupturas foi limpa para a preparação do piloto
            histórico. A ausência temporária de registros reflete a limpeza controlada e{' '}
            <strong>não configura pesquisa atrasada ou falha de monitoramento</strong>. Assim que a
            sincronização do período histórico (2 a 3 semanas) for executada, os cálculos e
            diagnósticos do Motor de Acompanhamento serão restabelecidos automaticamente.
          </AlertDescription>
          <div className="pt-2 flex flex-wrap items-center gap-3">
            <Button
              asChild
              size="sm"
              className="bg-amber-700 hover:bg-amber-800 text-white text-xs h-8 px-3 gap-1.5 shadow-2xs"
            >
              <Link to="/importacao">
                <Upload className="w-3.5 h-3.5" />
                <span>Ir para Importação / Sincronização</span>
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="sm"
              className="border-amber-300 text-amber-800 hover:bg-amber-100 text-xs h-8 px-3 gap-1.5"
            >
              <Link to="/configuracoes">
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Ver Administração de Dados</span>
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </Alert>
  )
}
