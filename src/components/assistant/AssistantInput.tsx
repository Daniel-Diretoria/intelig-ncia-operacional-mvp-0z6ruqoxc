import React, { useState } from 'react'
import { Search, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface AssistantInputProps {
  onSubmit: (query: string) => void
  isLoading?: boolean
}

export const AssistantInput: React.FC<AssistantInputProps> = ({ onSubmit, isLoading = false }) => {
  const [query, setQuery] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim() || isLoading) return
    onSubmit(query.trim())
    setQuery('')
  }

  return (
    <form onSubmit={handleSubmit} className="w-full relative flex items-center gap-2">
      <div className="relative flex-1">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <Input
          type="text"
          value={query}
          maxLength={500}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Faça uma pergunta sobre validades, lojas, rupturas, marcas ou scores..."
          disabled={isLoading}
          aria-label="Campo de pergunta operacional"
          className="pl-10 pr-16 h-12 text-sm bg-white border-slate-200 focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-xl shadow-xs transition-all text-slate-900 placeholder:text-slate-400 font-medium"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-mono pointer-events-none select-none">
          {query.length}/500
        </span>
      </div>

      <Button
        type="submit"
        disabled={!query.trim() || isLoading}
        aria-label="Analisar pergunta"
        className="h-12 px-6 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm shadow-xs transition-all shrink-0 cursor-pointer flex items-center gap-2"
      >
        {isLoading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Analisando...</span>
          </>
        ) : (
          <span>Analisar</span>
        )}
      </Button>
    </form>
  )
}
