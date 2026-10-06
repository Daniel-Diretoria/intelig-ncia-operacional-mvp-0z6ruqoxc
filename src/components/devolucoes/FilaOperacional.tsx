import React from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { StatusBadge, AuditoriaBadge } from './DevolucaoBadges'
import { DevolucaoCaso } from '@/types/devolucoes'
import {
  AlertTriangle,
  ArrowRight,
  Clock,
  Calendar,
  Store,
  User,
  Package,
  Layers,
  ChevronRight,
} from 'lucide-react'

interface FilaOperacionalProps {
  precisaDeAcao: DevolucaoCaso[]
  emAndamento: DevolucaoCaso[]
  finalizadas: DevolucaoCaso[]
  onSelecionarCaso: (caso: DevolucaoCaso) => void
  onNovaSolicitacao: () => void
}

export const FilaOperacional: React.FC<FilaOperacionalProps> = ({
  precisaDeAcao,
  emAndamento,
  finalizadas,
  onSelecionarCaso,
  onNovaSolicitacao,
}) => {
  return (
    <div className="space-y-6">
      {/* 1. BLOCO: PRECISA DE AÇÃO (Prioridade máxima de inteligência operacional) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-3 h-3 rounded-full bg-rose-500 animate-pulse" />
            <h3 className="text-base font-bold text-slate-900 tracking-tight">
              PRECISA DE AÇÃO ({precisaDeAcao.length})
            </h3>
            <span className="text-xs text-slate-500">
              Solicitações aguardando análise humana, com divergência ou aguardando promotor
            </span>
          </div>
          {precisaDeAcao.length > 0 && (
            <Badge variant="outline" className="text-xs bg-rose-50 text-rose-700 border-rose-200">
              Atenção Requerida
            </Badge>
          )}
        </div>

        {precisaDeAcao.length === 0 ? (
          <div className="bg-white border border-dashed border-slate-300 rounded-xl p-8 text-center">
            <div className="inline-flex p-3 rounded-full bg-emerald-50 text-emerald-600 mb-2">
              <Clock className="w-5 h-5" />
            </div>
            <h4 className="text-sm font-semibold text-slate-800">Tudo em dia!</h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
              Nenhuma solicitação de devolução pendente de análise ou com divergência aberta neste
              momento.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {precisaDeAcao.map((caso) => (
              <CasoCard
                key={caso.id}
                caso={caso}
                destaque="acao"
                onSelect={() => onSelecionarCaso(caso)}
              />
            ))}
          </div>
        )}
      </section>

      {/* 2. BLOCO: EM ANDAMENTO (Fluxo com Indústria / NF / Descarte) */}
      <section className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-3 h-3 rounded-full bg-indigo-500" />
            <h3 className="text-base font-bold text-slate-900 tracking-tight">
              EM ANDAMENTO ({emAndamento.length})
            </h3>
            <span className="text-xs text-slate-500">
              Prontas para envio, aguardando autorização da indústria ou aguardando NF/descarte
            </span>
          </div>
        </div>

        {emAndamento.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-6 text-center text-xs text-slate-500">
            Nenhum caso em tramitação com a indústria atualmente.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {emAndamento.map((caso) => (
              <CasoCard
                key={caso.id}
                caso={caso}
                destaque="andamento"
                onSelect={() => onSelecionarCaso(caso)}
              />
            ))}
          </div>
        )}
      </section>

      {/* 3. BLOCO: FINALIZADAS (Histórico concluído) */}
      <section className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-3 h-3 rounded-full bg-slate-400" />
            <h3 className="text-base font-bold text-slate-700 tracking-tight">
              FINALIZADAS ({finalizadas.length})
            </h3>
            <span className="text-xs text-slate-500">
              Casos concluídos com NF/descarte ou encerrados
            </span>
          </div>
        </div>

        {finalizadas.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-5 text-center text-xs text-slate-500">
            Nenhum caso finalizado no filtro atual.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {finalizadas.slice(0, 6).map((caso) => (
              <CasoCard
                key={caso.id}
                caso={caso}
                destaque="finalizada"
                onSelect={() => onSelecionarCaso(caso)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

const CasoCard: React.FC<{
  caso: DevolucaoCaso
  destaque: 'acao' | 'andamento' | 'finalizada'
  onSelect: () => void
}> = ({ caso, destaque, onSelect }) => {
  const bordaClasse =
    destaque === 'acao'
      ? caso.resultado_auditoria_geral === 'divergencia'
        ? 'border-l-4 border-l-rose-500 border-slate-200 hover:border-rose-400'
        : 'border-l-4 border-l-amber-500 border-slate-200 hover:border-amber-400'
      : destaque === 'andamento'
        ? 'border-l-4 border-l-indigo-500 border-slate-200 hover:border-indigo-400'
        : 'border-l-4 border-l-slate-400 border-slate-200 opacity-90 hover:opacity-100'

  return (
    <Card
      onClick={onSelect}
      className={`cursor-pointer transition-all hover:shadow-md bg-white ${bordaClasse} flex flex-col justify-between`}
    >
      <CardHeader className="p-4 pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <span className="text-xs font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-sm">
              {caso.codigo_caso}
            </span>
            <CardTitle className="text-sm font-bold text-slate-900 mt-1.5 line-clamp-1">
              {caso.industry_name}
            </CardTitle>
          </div>
          <StatusBadge status={caso.status} />
        </div>
      </CardHeader>

      <CardContent className="p-4 pt-1 space-y-3 text-xs">
        {/* Loja & Promotor */}
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-slate-700 font-medium">
            <Store className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="truncate">
              {caso.store_code ? `[${caso.store_code}] ` : ''}
              {caso.store_name}
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-slate-500">
            <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="truncate">Promotor: {caso.promotor_nome}</span>
          </div>

          <div className="flex items-center gap-1.5 text-slate-500">
            <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span>Solicitado em: {caso.data_solicitacao}</span>
          </div>
        </div>

        {/* Quantidades e Produtos */}
        <div className="bg-slate-50 rounded-lg p-2.5 flex items-center justify-between border border-slate-100">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-slate-500" />
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-400 leading-none">
                Produtos
              </p>
              <p className="text-xs font-bold text-slate-800">{caso.total_itens} item(ns)</p>
            </div>
          </div>

          <div className="text-right">
            <p className="text-[10px] uppercase font-bold text-slate-400 leading-none">
              Volume Total
            </p>
            <p className="text-xs font-bold text-slate-900">
              {caso.total_unidades_solicitadas} un.
            </p>
          </div>
        </div>

        {/* Resultado Auditoria Explicável & Quantidades Autorizadas */}
        <div className="pt-1 flex items-center justify-between border-t border-slate-100">
          <span className="text-[10px] font-semibold text-slate-500">Auditoria SKIP:</span>
          <AuditoriaBadge classificacao={caso.resultado_auditoria_geral} />
        </div>

        {/* Indicador de Autorização da Indústria quando existente */}
        {caso.tipo_autorizacao_industria && (
          <div className="flex items-center justify-between text-[11px] bg-slate-50 px-2 py-1 rounded">
            <span className="text-slate-500">Indústria:</span>
            <span
              className={`font-bold ${
                caso.tipo_autorizacao_industria === 'total'
                  ? 'text-emerald-700'
                  : caso.tipo_autorizacao_industria === 'parcial'
                    ? 'text-amber-700'
                    : 'text-red-700'
              }`}
            >
              {caso.tipo_autorizacao_industria === 'total'
                ? `Total (${caso.total_unidades_autorizadas ?? caso.total_unidades_solicitadas} un.)`
                : caso.tipo_autorizacao_industria === 'parcial'
                  ? `Parcial (${caso.total_unidades_autorizadas ?? 0} un.)`
                  : 'Não autorizada'}
            </span>
          </div>
        )}

        {/* Próxima Ação */}
        {caso.proxima_acao && (
          <div className="bg-amber-50/60 rounded-md p-2 text-[11px] text-amber-900 border border-amber-200/50 flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
            <span className="line-clamp-2 leading-tight">
              <strong>Próxima ação:</strong> {caso.proxima_acao}
            </span>
          </div>
        )}

        {/* Footer com link ver detalhes */}
        <div className="pt-2 flex items-center justify-end text-indigo-600 font-semibold text-[11px] group-hover:underline">
          <span>Abrir Caso &amp; Auditoria</span>
          <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
        </div>
      </CardContent>
    </Card>
  )
}
