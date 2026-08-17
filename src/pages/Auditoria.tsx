import React, { useState, useMemo, useEffect } from 'react'
import {
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Send,
  Search,
  Loader2,
  X,
  Building2,
  CalendarDays,
  UserCheck,
  UserCog,
  Package,
} from 'lucide-react'
import { useAuditoria } from '@/services'
import type { AuditoriaOcorrencia } from '@/services'
import { useAuth } from '@/services/authContext'
import { AlertBanner } from '@/components/ui/alert-banner'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Modal } from '@/components/ui/modal'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

const fmtDate = (iso: string): string => {
  if (!iso) return '—'
  try {
    return new Date(iso + 'T00:00:00Z').toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'UTC',
    })
  } catch {
    return iso
  }
}

/** Badge de dias vencido com destaque visual. */
const DiasVencidoBadge: React.FC<{ dias: number }> = ({ dias }) => {
  if (dias === 0) {
    return (
      <Badge className="bg-red-600 text-white border-red-700 text-[11px] font-semibold">
        Vence hoje
      </Badge>
    )
  }
  const abs = Math.abs(dias)
  return (
    <Badge
      className={cn(
        'text-[11px] font-semibold border',
        dias < 0
          ? 'bg-red-100 text-red-700 border-red-200'
          : 'bg-amber-100 text-amber-700 border-amber-200',
      )}
    >
      {dias < 0 ? `Vencido há ${abs} dia${abs === 1 ? '' : 's'}` : `Vence em ${dias} dias`}
    </Badge>
  )
}

const StatusAuditoriaBadge: React.FC<{ status?: string }> = ({ status }) => {
  if (!status) {
    return (
      <Badge variant="outline" className="text-[11px] text-slate-500 border-slate-200">
        Aguardando
      </Badge>
    )
  }
  switch (status) {
    case 'pendente':
      return (
        <Badge className="text-[11px] bg-amber-100 text-amber-700 border-amber-200 font-semibold">
          <Clock className="w-3 h-3 mr-1" />
          Pendente
        </Badge>
      )
    case 'corrigido':
      return (
        <Badge className="text-[11px] bg-emerald-100 text-emerald-700 border-emerald-200 font-semibold">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          Corrigido
        </Badge>
      )
    case 'confirmado':
      return (
        <Badge className="text-[11px] bg-blue-100 text-blue-700 border-blue-200 font-semibold">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          Confirmado
        </Badge>
      )
    default:
      return (
        <Badge variant="outline" className="text-[11px] text-slate-500 border-slate-200">
          {status}
        </Badge>
      )
  }
}

interface ResumoCard {
  label: string
  value: number
  icon: React.ComponentType<{ className?: string }>
  tone: 'red' | 'amber' | 'blue' | 'emerald'
}

const ResumoCardItem: React.FC<ResumoCard> = ({ label, value, icon: Icon, tone }) => {
  const tones: Record<ResumoCard['tone'], string> = {
    red: 'border-red-200 bg-red-50/50 text-red-700',
    amber: 'border-amber-200 bg-amber-50/50 text-amber-700',
    blue: 'border-blue-200 bg-blue-50/50 text-blue-700',
    emerald: 'border-emerald-200 bg-emerald-50/50 text-emerald-700',
  }
  return (
    <div className={cn('p-4 rounded-xl border flex items-center justify-between', tones[tone])}>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider opacity-80">{label}</p>
        <p className="text-2xl font-bold tabular-nums mt-0.5">{value}</p>
      </div>
      <div className="w-10 h-10 rounded-lg bg-white/70 flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5" />
      </div>
    </div>
  )
}

export const AuditoriaPage: React.FC = () => {
  const { toast } = useToast()
  const { user } = useAuth()
  const { ocorrencias, resumo, isLoading, error, refetch, sinalizarCorrecao, confirmarLegitimo } =
    useAuditoria()

  const [search, setSearch] = useState('')
  const [filtroStatus, setFiltroStatus] = useState<
    'todos' | 'pendente' | 'confirmado' | 'aguardando'
  >('todos')
  const [sinalizando, setSinalizando] = useState<AuditoriaOcorrencia | null>(null)
  const [motivo, setMotivo] = useState('')
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null)

  useEffect(() => {
    const handleGlobalRefresh = () => refetch()
    window.addEventListener('diretoria:refresh', handleGlobalRefresh)
    return () => window.removeEventListener('diretoria:refresh', handleGlobalRefresh)
  }, [refetch])

  const usuarioNome = user?.name || user?.email?.split('@')[0] || 'Sistema'

  const filtradas = useMemo(() => {
    let list = ocorrencias
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(
        (o) =>
          o.produto.toLowerCase().includes(q) ||
          o.loja.toLowerCase().includes(q) ||
          o.promotor.toLowerCase().includes(q) ||
          o.supervisor.toLowerCase().includes(q) ||
          o.codigoLoja.toLowerCase().includes(q),
      )
    }
    if (filtroStatus !== 'todos') {
      if (filtroStatus === 'aguardando') {
        list = list.filter((o) => !o.statusAuditoria)
      } else {
        list = list.filter((o) => o.statusAuditoria === filtroStatus)
      }
    }
    return list
  }, [ocorrencias, search, filtroStatus])

  const handleConfirmar = async (o: AuditoriaOcorrencia) => {
    setActionLoadingId(o.id)
    try {
      await confirmarLegitimo(o, usuarioNome)
      toast({
        title: 'Ocorrência confirmada',
        description: 'Marcada como Vencido legítimo (verificado). Permanece na Base Atual.',
      })
    } catch (err) {
      toast({
        title: 'Falha ao confirmar',
        description: err instanceof Error ? err.message : 'Erro inesperado.',
        variant: 'destructive',
      })
    } finally {
      setActionLoadingId(null)
    }
  }

  const handleSinalizarSubmit = async () => {
    if (!sinalizando) return
    if (!motivo.trim()) {
      toast({
        title: 'Motivo obrigatório',
        description: 'Descreva o motivo da sinalização para correção.',
        variant: 'destructive',
      })
      return
    }
    setActionLoadingId(sinalizando.id)
    try {
      await sinalizarCorrecao(sinalizando, motivo.trim(), usuarioNome)
      toast({
        title: 'Sinalizado para correção',
        description: 'Ocorrência marcada como pendente de correção manual.',
      })
      setSinalizando(null)
      setMotivo('')
    } catch (err) {
      toast({
        title: 'Falha ao sinalizar',
        description: err instanceof Error ? err.message : 'Erro inesperado.',
        variant: 'destructive',
      })
    } finally {
      setActionLoadingId(null)
    }
  }

  const cards: ResumoCard[] = [
    { label: 'Total Vencidos', value: resumo.totalVencidos, icon: ShieldAlert, tone: 'red' },
    { label: 'Pendentes', value: resumo.pendentes, icon: Clock, tone: 'amber' },
    { label: 'Confirmados', value: resumo.confirmados, icon: CheckCircle2, tone: 'blue' },
    { label: 'Sinalizados', value: resumo.sinalizados, icon: AlertTriangle, tone: 'emerald' },
  ]

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-bold text-slate-900 tracking-tight">Auditoria de Vencidos</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Verifique ocorrências Vencidas — sinalize erros de registro do promotor ou confirme
            vencimentos legítimos antes que contaminem relatórios.
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-50 text-red-700 border border-red-100 text-xs font-semibold">
          <ShieldAlert className="w-4 h-4" />
          {resumo.totalVencidos} ocorrência(s) vencida(s)
        </div>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => (
          <ResumoCardItem key={c.label} {...c} />
        ))}
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-slate-200 p-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por produto, loja, promotor ou supervisor..."
            className="w-full h-9 pl-9 pr-3 text-sm rounded-lg border border-slate-200 bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300"
          />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {(
            [
              ['todos', 'Todos'],
              ['aguardando', 'Aguardando'],
              ['pendente', 'Pendentes'],
              ['confirmado', 'Confirmados'],
            ] as const
          ).map(([val, label]) => (
            <button
              key={val}
              onClick={() => setFiltroStatus(val)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                filtroStatus === val
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Erro */}
      {error && (
        <AlertBanner
          type="error"
          title="Erro ao carregar auditoria"
          message={error.message || 'Falha ao buscar ocorrências vencidas.'}
          onRetry={refetch}
        />
      )}

      {/* Tabela */}
      {!error && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 rounded-lg" />
              ))}
            </div>
          ) : filtradas.length === 0 ? (
            <div className="p-8">
              <EmptyState
                icon={ShieldAlert}
                title="Nenhuma ocorrência vencida"
                description="Não há ocorrências Vencidas para os filtros selecionados. Quando houver, elas aparecerão aqui para auditoria."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/60">
                    <TableHead className="text-xs">Produto</TableHead>
                    <TableHead className="text-xs">Loja</TableHead>
                    <TableHead className="text-xs text-right">Qtd</TableHead>
                    <TableHead className="text-xs">Validade</TableHead>
                    <TableHead className="text-xs">Dias Vencido</TableHead>
                    <TableHead className="text-xs">Data Entrada</TableHead>
                    <TableHead className="text-xs">Promotor</TableHead>
                    <TableHead className="text-xs">Supervisor</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtradas.map((o) => (
                    <TableRow key={o.id} className="hover:bg-slate-50/70">
                      <TableCell className="text-xs font-medium text-slate-900 max-w-[180px]">
                        <div className="flex items-center gap-1.5">
                          <Package className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">{o.produto || '—'}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-slate-600 max-w-[220px]">
                        <div className="flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">{o.loja || '—'}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-right tabular-nums font-semibold text-slate-700">
                        {o.quantidade}
                      </TableCell>
                      <TableCell className="text-xs text-slate-600 tabular-nums whitespace-nowrap">
                        {fmtDate(o.validadeEfetiva)}
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        <DiasVencidoBadge dias={o.diasVencido} />
                      </TableCell>
                      <TableCell className="text-xs text-slate-600 tabular-nums whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <CalendarDays className="w-3 h-3 text-slate-400" />
                          {fmtDate(o.dataEntrada)}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-slate-600 max-w-[120px]">
                        <div className="flex items-center gap-1">
                          <UserCheck className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="truncate">{o.promotor || '—'}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-slate-600 max-w-[120px]">
                        <div className="flex items-center gap-1">
                          <UserCog className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="truncate">{o.supervisor || '—'}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">
                        <StatusAuditoriaBadge status={o.statusAuditoria} />
                      </TableCell>
                      <TableCell className="text-xs text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {o.statusAuditoria !== 'confirmado' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleConfirmar(o)}
                              disabled={actionLoadingId === o.id}
                              className="h-7 px-2 text-[11px] gap-1 border-blue-200 text-blue-700 hover:bg-blue-50"
                              title="Confirmar como Vencido legítimo"
                            >
                              {actionLoadingId === o.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <CheckCircle2 className="w-3 h-3" />
                              )}
                              Confirmar
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSinalizando(o)
                              setMotivo('')
                            }}
                            disabled={actionLoadingId === o.id || o.sinalizadoCorrecao}
                            className="h-7 px-2 text-[11px] gap-1 border-amber-200 text-amber-700 hover:bg-amber-50"
                            title="Sinalizar para correção manual"
                          >
                            <Send className="w-3 h-3" />
                            {o.sinalizadoCorrecao ? 'Sinalizado' : 'Sinalizar'}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}

      {/* Nota informativa */}
      <div className="flex items-start gap-3 p-4 rounded-xl border border-blue-200 bg-blue-50/50">
        <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
          <ShieldAlert className="w-4 h-4" />
        </div>
        <div className="text-xs text-slate-700 leading-relaxed">
          <p className="font-semibold text-slate-900 mb-0.5">Como funciona a auditoria</p>
          <p>
            A lista mostra ocorrências da Base Atual com <strong>status Vencido</strong>. Use{' '}
            <strong>Sinalizar</strong> quando suspeitar de erro de registro do promotor (ex.: data
            lançada errada) — a ocorrência é marcada como pendente de correção e copiada para a
            collection <code className="text-blue-700">auditoria_pendencias</code>. Use{' '}
            <strong>Confirmar</strong> para validar um vencimento legítimo (verificado), mantendo o
            registro na Base Atual.
          </p>
        </div>
      </div>

      {/* Modal de sinalização */}
      <Modal
        isOpen={!!sinalizando}
        onClose={() => {
          setSinalizando(null)
          setMotivo('')
        }}
        title="Sinalizar para correção"
        description="Descreva o motivo da sinalização para correção manual."
        footer={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSinalizando(null)
                setMotivo('')
              }}
              className="h-9 text-xs gap-1.5"
            >
              <X className="w-3.5 h-3.5" />
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleSinalizarSubmit}
              disabled={actionLoadingId === sinalizando?.id || !motivo.trim()}
              className="h-9 text-xs gap-1.5 bg-amber-600 hover:bg-amber-700 text-white"
            >
              {actionLoadingId === sinalizando?.id ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              Sinalizar
            </Button>
          </>
        }
      >
        {sinalizando && (
          <div className="space-y-3">
            <div className="p-3 rounded-lg border border-slate-200 bg-slate-50/60 space-y-1">
              <p className="text-xs font-semibold text-slate-900">{sinalizando.produto}</p>
              <p className="text-[11px] text-slate-500">
                {sinalizando.loja} • Qtd: {sinalizando.quantidade} • Validade:{' '}
                {fmtDate(sinalizando.validadeEfetiva)} • Vencido há{' '}
                {Math.abs(sinalizando.diasVencido)} dia(s)
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="motivo" className="text-xs font-semibold text-slate-700">
                Motivo da sinalização <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="motivo"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ex.: Promotor lançou data de validade errada — conferir nota fiscal do lote."
                rows={4}
                className="text-xs resize-none"
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
