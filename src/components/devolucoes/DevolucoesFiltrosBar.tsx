import React from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DevolucoesFiltros, DevolucaoStatus, AuditoriaClassificacao } from '@/types/devolucoes'
import { Search, RotateCcw, Filter } from 'lucide-react'

interface DevolucoesFiltrosBarProps {
  filtros: DevolucoesFiltros
  onFiltrosChange: (novosFiltros: DevolucoesFiltros) => void
  onLimparFiltros: () => void
  industriasDisponiveis: Array<{ id: string; nome: string }>
  lojasDisponiveis: Array<{ codigo: string; nome: string }>
}

export const DevolucoesFiltrosBar: React.FC<DevolucoesFiltrosBarProps> = ({
  filtros,
  onFiltrosChange,
  onLimparFiltros,
  industriasDisponiveis,
  lojasDisponiveis,
}) => {
  return (
    <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-2xs space-y-3">
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        {/* Busca textual livre */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            type="text"
            placeholder="Buscar por código DEV, promotor, loja, indústria..."
            value={filtros.busca || ''}
            onChange={(e) => onFiltrosChange({ ...filtros, busca: e.target.value })}
            className="pl-9 h-9 text-xs"
          />
        </div>

        {/* Filtros em dropdowns */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Indústria */}
          <Select
            value={filtros.industria || 'todas'}
            onValueChange={(val) =>
              onFiltrosChange({ ...filtros, industria: val === 'todas' ? undefined : val })
            }
          >
            <SelectTrigger className="w-[160px] h-9 text-xs">
              <SelectValue placeholder="Indústria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as Indústrias</SelectItem>
              {industriasDisponiveis.map((ind) => (
                <SelectItem key={ind.id} value={ind.nome}>
                  {ind.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Loja */}
          <Select
            value={filtros.loja || 'todas'}
            onValueChange={(val) =>
              onFiltrosChange({ ...filtros, loja: val === 'todas' ? undefined : val })
            }
          >
            <SelectTrigger className="w-[160px] h-9 text-xs">
              <SelectValue placeholder="Loja" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as Lojas</SelectItem>
              {lojasDisponiveis.map((lj) => (
                <SelectItem key={lj.codigo || lj.nome} value={lj.codigo || lj.nome}>
                  {lj.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Status Geral */}
          <Select
            value={filtros.status || 'todos'}
            onValueChange={(val) =>
              onFiltrosChange({
                ...filtros,
                status: val === 'todos' ? undefined : (val as DevolucaoStatus),
              })
            }
          >
            <SelectTrigger className="w-[160px] h-9 text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os Status</SelectItem>
              <SelectItem value="em_analise">Em Análise</SelectItem>
              <SelectItem value="aguardando_informacao">Aguardando Informação</SelectItem>
              <SelectItem value="pronta_para_envio">Pronta para Envio</SelectItem>
              <SelectItem value="aguardando_autorizacao_industria">Aguardando Indústria</SelectItem>
              <SelectItem value="industria_autorizou">Indústria Autorizou</SelectItem>
              <SelectItem value="aguardando_nf_descarte">Aguardando NF / Descarte</SelectItem>
              <SelectItem value="concluido">Concluído</SelectItem>
              <SelectItem value="divergencia_encontrada">Com Divergência</SelectItem>
              <SelectItem value="cancelado">Cancelado</SelectItem>
            </SelectContent>
          </Select>

          {/* Auditoria SKIP */}
          <Select
            value={filtros.classificacaoAuditoria || 'todos'}
            onValueChange={(val) =>
              onFiltrosChange({
                ...filtros,
                classificacaoAuditoria:
                  val === 'todos' ? undefined : (val as AuditoriaClassificacao),
              })
            }
          >
            <SelectTrigger className="w-[180px] h-9 text-xs">
              <SelectValue placeholder="Auditoria SKIP" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas Auditorias</SelectItem>
              <SelectItem value="acompanhamento_consistente">Acompanhamento Consistente</SelectItem>
              <SelectItem value="atencao">Atenção</SelectItem>
              <SelectItem value="divergencia">Divergência</SelectItem>
              <SelectItem value="dados_insuficientes">Dados Insuficientes</SelectItem>
            </SelectContent>
          </Select>

          {/* Botão Limpar */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onLimparFiltros}
            className="h-9 px-2 text-xs text-slate-500 hover:text-slate-800"
            title="Limpar Filtros"
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1" />
            Limpar
          </Button>
        </div>
      </div>
    </div>
  )
}
