import React, { useState, useEffect, useCallback } from 'react'
import { Sparkles, ShieldCheck, AlertCircle, Database, RefreshCw, Info } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { AssistantInput } from '@/components/assistant/AssistantInput'
import { AssistantSuggestions } from '@/components/assistant/AssistantSuggestions'
import { AssistantHistory, type HistoryItem } from '@/components/assistant/AssistantHistory'
import { getBaseAtualSnapshot, type BaseAtualSnapshot } from '@/lib/selectors/baseAtualSelectors'
import {
  parseIntent,
  executeIntent,
  type AssistantResponse,
} from '@/lib/assistant/operationalAssistantEngine'
import { useCrossEvidence } from '@/services/useCrossEvidence'

export const AssistantPage: React.FC = () => {
  const [snapshot, setSnapshot] = useState<BaseAtualSnapshot | null>(null)
  const [isSnapshotLoading, setIsSnapshotLoading] = useState<boolean>(true)
  const [snapshotError, setSnapshotError] = useState<string | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false)
  const [history, setHistory] = useState<HistoryItem[]>([])

  const { data: crossEvidences } = useCrossEvidence()

  // Carrega snapshot da Base Atual
  const loadSnapshot = useCallback(async (forceRefresh = false) => {
    setIsSnapshotLoading(true)
    setSnapshotError(null)
    try {
      const data = await getBaseAtualSnapshot(forceRefresh)
      setSnapshot(data)
    } catch (err) {
      console.error('[AssistantPage] Falha ao consultar a Base Atual:', err)
      setSnapshotError('Falha ao consultar a Base Atual. Verifique a conexão com o banco de dados.')
    } finally {
      setIsSnapshotLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSnapshot()
  }, [loadSnapshot])

  // Ouvinte de refresh global disparado pelo header do AppLayout
  useEffect(() => {
    const handleGlobalRefresh = () => {
      loadSnapshot(true)
    }
    window.addEventListener('diretoria:refresh', handleGlobalRefresh)
    return () => window.removeEventListener('diretoria:refresh', handleGlobalRefresh)
  }, [loadSnapshot])

  // Processa uma pergunta enviada pelo usuário ou via chip de sugestão
  const handleQuerySubmit = (queryText: string) => {
    if (!queryText.trim() || !snapshot) return

    setIsAnalyzing(true)

    // Simula cálculo curto em memória
    setTimeout(() => {
      try {
        const parsed = parseIntent(queryText)
        const response: AssistantResponse = executeIntent(parsed, snapshot, crossEvidences || [])

        const newHistoryItem: HistoryItem = {
          id: `hist_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          query: queryText,
          response,
          timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        }

        setHistory((prev) => [newHistoryItem, ...prev])
      } catch (err) {
        console.error('[AssistantPage] Erro durante a análise:', err)
      } finally {
        setIsAnalyzing(false)
      }
    }, 150)
  }

  const handleClearHistory = () => {
    setHistory([])
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-fade-in pb-12">
      {/* Cabeçalho da Página */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200/80">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
              <Sparkles className="w-5 h-5" />
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Assistente de Inteligência Operacional
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 font-normal">
            Consultas analíticas determinísticas calculadas em tempo real sobre a fotografia da Base
            Atual.
          </p>
        </div>

        {/* Selo Auditável Somente Leitura */}
        <div className="flex items-center gap-2 self-start md:self-center">
          <Badge
            variant="outline"
            className="h-8 px-3 rounded-full bg-slate-900 text-slate-100 border-slate-800 font-semibold text-xs flex items-center gap-1.5 shadow-2xs"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Análise auditável • somente leitura</span>
          </Badge>
        </div>
      </div>

      {/* Indicador de Status da Base Atual */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl bg-indigo-50/60 border border-indigo-100 text-xs text-indigo-950 shadow-2xs">
        <div className="flex items-center gap-2.5">
          <Database className="w-4 h-4 text-indigo-600 shrink-0" />
          <span>
            <strong>Assistente analítico:</strong> respostas calculadas sobre a Base Atual (
            {snapshot ? (
              <>
                {snapshot.kpisReconciliados.validadesCriticas} validades críticas •{' '}
                {snapshot.kpisReconciliados.rupturasAtivasTotal} rupturas ativas •{' '}
                {snapshot.lojasAgregadas.length} lojas
              </>
            ) : (
              'Carregando base...'
            )}
            ).
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => loadSnapshot(true)}
            disabled={isSnapshotLoading}
            className="h-7 px-2.5 text-xs text-indigo-700 hover:text-indigo-900 hover:bg-indigo-100/80 rounded-lg"
          >
            <RefreshCw className={`w-3 h-3 mr-1 ${isSnapshotLoading ? 'animate-spin' : ''}`} />
            <span>Recarregar Base</span>
          </Button>
        </div>
      </div>

      {/* Alerta de Erro na Base */}
      {snapshotError && (
        <Card className="p-4 rounded-2xl border-rose-200 bg-rose-50 text-rose-800 flex items-start gap-3 shadow-2xs">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs">
            <p className="font-bold">Falha ao consultar a Base Atual</p>
            <p>{snapshotError}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadSnapshot(true)}
              className="mt-2 h-7 px-3 bg-white border-rose-300 text-rose-700 hover:bg-rose-100 text-xs"
            >
              Tentar novamente
            </Button>
          </div>
        </Card>
      )}

      {/* Área Central de Pergunta e Sugestões */}
      <Card className="p-5 sm:p-6 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-5">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              O que você deseja analisar na operação?
            </label>
            <div className="flex items-center gap-1 text-[11px] text-slate-400">
              <Info className="w-3 h-3" />
              <span>Sem IA generativa • 100% determinístico</span>
            </div>
          </div>

          <AssistantInput
            onSubmit={handleQuerySubmit}
            isLoading={isAnalyzing || isSnapshotLoading}
          />
        </div>

        <AssistantSuggestions
          onSelectSuggestion={handleQuerySubmit}
          disabled={isAnalyzing || isSnapshotLoading}
        />
      </Card>

      {/* Lista de Histórico da Sessão */}
      <AssistantHistory items={history} onClearHistory={handleClearHistory} />
    </div>
  )
}
