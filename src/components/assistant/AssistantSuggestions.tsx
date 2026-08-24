import React from 'react'
import { Sparkles, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

export const DEFAULT_SUGGESTIONS = [
  'Quais são as 5 lojas mais críticas?',
  'Quais produtos vencem nos próximos 7 dias?',
  'Como está a loja 240?',
  'Quais marcas exigem ação imediata?',
  'Quais rupturas possuem evidência posterior de validade?',
  'Quantas rupturas totais foram expandidas?',
  'Como o score de risco é calculado?',
]

interface AssistantSuggestionsProps {
  onSelectSuggestion: (query: string) => void
  disabled?: boolean
}

export const AssistantSuggestions: React.FC<AssistantSuggestionsProps> = ({
  onSelectSuggestion,
  disabled = false,
}) => {
  return (
    <div className="w-full space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
        <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
        <span>Sugestões de análises rápidas:</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {DEFAULT_SUGGESTIONS.map((suggestion) => (
          <Button
            key={suggestion}
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => onSelectSuggestion(suggestion)}
            className="h-8 px-3 py-1 text-xs font-medium bg-white hover:bg-indigo-50/80 hover:text-indigo-700 hover:border-indigo-200 border-slate-200 text-slate-700 rounded-full transition-colors shadow-2xs group flex items-center gap-1.5 cursor-pointer text-left"
          >
            <span>{suggestion}</span>
            <ArrowRight className="w-3 h-3 text-slate-400 group-hover:text-indigo-600 transition-transform group-hover:translate-x-0.5" />
          </Button>
        ))}
      </div>
    </div>
  )
}
