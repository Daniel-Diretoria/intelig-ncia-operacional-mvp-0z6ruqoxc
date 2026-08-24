import React from 'react'
import { MessageSquare, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AssistantResponseCard } from './AssistantResponseCard'
import type { AssistantResponse } from '@/lib/assistant/operationalAssistantEngine'

export interface HistoryItem {
  id: string
  query: string
  response: AssistantResponse
  timestamp: string
}

interface AssistantHistoryProps {
  items: HistoryItem[]
  onClearHistory: () => void
}

export const AssistantHistory: React.FC<AssistantHistoryProps> = ({ items, onClearHistory }) => {
  if (items.length === 0) {
    return (
      <div className="py-12 px-4 text-center border border-dashed border-slate-200 rounded-2xl bg-white/50 space-y-3">
        <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto shadow-2xs">
          <MessageSquare className="w-6 h-6" />
        </div>
        <div className="max-w-md mx-auto space-y-1">
          <h3 className="text-sm font-bold text-slate-800">Nenhuma consulta realizada na sessão</h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            Selecione uma das sugestões acima ou digite uma pergunta operacional para receber
            análises calculadas e auditáveis sobre a Base Atual.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-slate-800">Histórico da Sessão ({items.length})</h3>
          <span className="text-[11px] text-slate-400 font-medium">(em memória)</span>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClearHistory}
          className="text-xs text-slate-500 hover:text-red-600 hover:bg-red-50 h-8 px-2.5 gap-1.5 cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Limpar histórico</span>
        </Button>
      </div>

      <div className="space-y-4">
        {items.map((item) => (
          <AssistantResponseCard
            key={item.id}
            query={item.query}
            response={item.response}
            timestamp={item.timestamp}
          />
        ))}
      </div>
    </div>
  )
}
