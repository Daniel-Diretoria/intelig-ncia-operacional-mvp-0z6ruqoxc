import React, { useState, useEffect, useCallback, useRef } from 'react'
import { AlertTriangle, CheckCircle2, RefreshCw, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/empty-state'
import { DataSourceFactory } from '@/lib/data'
import type { Ruptura } from '@/types'

interface StoreRupturasTabProps {
  storeCode: string
  onSelectRuptura?: (item: Ruptura) => void
}

export const StoreRupturasTab: React.FC<StoreRupturasTabProps> = ({
  storeCode,
  onSelectRuptura,
}) => {
  const [rupturas, setRupturas] = useState<Ruptura[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<Error | null>(null)
  const [search, setSearch] = useState('')
  const isMounted = useRef(true)

  const fetchStoreRupturas = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const provider = DataSourceFactory.getProvider()
      // Busca todas as rupturas do domínio pelo adapter
      const allRupturas = provider.listRupturasDomain ? await provider.listRupturasDomain() : []

      // Normaliza código da loja (numérico padronizado)
      const currentCodeTrimmed = (storeCode || '').trim()
      const currentCodeNum =
        !isNaN(Number(currentCodeTrimmed)) && currentCodeTrimmed !== ''
          ? Number(currentCodeTrimmed)
          : null

      const filtered = allRupturas.filter((r) => {
        const rCodeTrimmed = (r.codigo_loja || '').trim()
        if (currentCodeNum !== null) {
          const rCodeNum =
            !isNaN(Number(rCodeTrimmed)) && rCodeTrimmed !== '' ? Number(rCodeTrimmed) : null
          if (rCodeNum !== null && rCodeNum === currentCodeNum) {
            return true
          }
        }
        // Comparação de string direta ou com zeros à esquerda
        if (rCodeTrimmed && currentCodeTrimmed && rCodeTrimmed === currentCodeTrimmed) {
          return true
        }
        return false
      })

      // Ordena por data_visita decrescente
      filtered.sort((a, b) => {
        const da = a.data_visita ? new Date(a.data_visita).getTime() : 0
        const db = b.data_visita ? new Date(b.data_visita).getTime() : 0
        return db - da
      })

      if (isMounted.current) {
        setRupturas(filtered)
      }
    } catch (err) {
      if (isMounted.current) {
        setError(err instanceof Error ? err : new Error('Falha ao carregar rupturas da loja.'))
      }
    } finally {
      if (isMounted.current) {
        setIsLoading(false)
      }
    }
  }, [storeCode])

  useEffect(() => {
    isMounted.current = true
    fetchStoreRupturas()
    return () => {
      isMounted.current = false
    }
  }, [fetchStoreRupturas])

  // Ouvir evento global de atualização após importação
  useEffect(() => {
    const handleRefresh = () => {
      fetchStoreRupturas()
    }
    window.addEventListener('diretoria:refresh', handleRefresh)
    return () => {
      window.removeEventListener('diretoria:refresh', handleRefresh)
    }
  }, [fetchStoreRupturas])

  // Filtro de busca local (produto, cliente, motivo, colaborador)
  const filteredRupturas = rupturas.filter((r) => {
    if (!search.trim()) return true
    const q = search.trim().toLowerCase()
    return (
      (r.produto || '').toLowerCase().includes(q) ||
      (r.cliente || '').toLowerCase().includes(q) ||
      (r.motivo || '').toLowerCase().includes(q) ||
      (r.colaborador || '').toLowerCase().includes(q)
    )
  })

  const totalAtivas = rupturas.filter((r) => r.situacao_atual === 'Ativo').length
  const totalResolvidas = rupturas.length - totalAtivas

  if (isLoading) {
    return (
      <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-2xs space-y-4">
        <div className="h-6 w-56 bg-slate-100 rounded animate-pulse" />
        <div className="h-10 bg-slate-50 rounded-lg animate-pulse" />
        <div className="h-48 bg-slate-100 rounded-lg animate-pulse" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white p-6 rounded-xl border border-red-200 text-center space-y-3 shadow-2xs">
        <AlertTriangle className="w-8 h-8 text-red-500 mx-auto" />
        <p className="text-sm font-semibold text-red-900">Erro ao carregar dados de rupturas</p>
        <p className="text-xs text-red-600">{error.message}</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchStoreRupturas()}
          className="h-8 text-xs gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Tentar novamente
        </Button>
      </div>
    )
  }

  if (rupturas.length === 0) {
    return (
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
        <EmptyState
          title="Nenhuma ruptura registrada para esta loja."
          description="Não há registros de desabastecimento ou falta de produto nesta loja na base atual."
          className="py-10 border-0"
        />
      </div>
    )
  }

  return (
    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
      {/* Cabeçalho da Aba */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div>
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <span>Ocorrências de Ruptura ({rupturas.length})</span>
          </h3>
          <span className="text-xs text-slate-500 mt-0.5 block">
            {totalAtivas} ativas • {totalResolvidas} resolvidas
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
            <Input
              placeholder="Filtrar por produto, motivo, cliente..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs w-56 bg-slate-50 border-slate-200"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchStoreRupturas()}
            className="h-8 text-xs gap-1.5 text-slate-600 hover:text-slate-900"
            title="Atualizar dados"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Tabela de Rupturas */}
      {filteredRupturas.length === 0 ? (
        <div className="py-8 text-center text-xs text-slate-500">
          Nenhuma ocorrência encontrada para o filtro informado.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="py-2.5 px-3">PRODUTO</th>
                <th className="py-2.5 px-3">CLIENTE</th>
                <th className="py-2.5 px-3">MOTIVO</th>
                <th className="py-2.5 px-3">DATA VISITA</th>
                <th className="py-2.5 px-3">COLABORADOR</th>
                <th className="py-2.5 px-3">STATUS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRupturas.map((rup) => {
                const isAtivo = rup.situacao_atual === 'Ativo'
                return (
                  <tr
                    key={rup.id || rup.operational_key}
                    onClick={() => onSelectRuptura?.(rup)}
                    className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                  >
                    {/* PRODUTO */}
                    <td className="py-3 px-3">
                      <div
                        className="font-semibold text-slate-900 max-w-[280px] truncate"
                        title={rup.produto}
                      >
                        {rup.produto}
                      </div>
                      {rup.categoria && (
                        <div className="text-[11px] text-slate-400">{rup.categoria}</div>
                      )}
                    </td>

                    {/* CLIENTE */}
                    <td className="py-3 px-3 text-slate-600">
                      <div className="font-medium">{rup.cliente || rup.nome_loja || '—'}</div>
                    </td>

                    {/* MOTIVO */}
                    <td className="py-3 px-3">
                      <Badge
                        variant="secondary"
                        className="text-[10px] font-medium bg-slate-100 text-slate-700 whitespace-nowrap"
                      >
                        {rup.motivo}
                      </Badge>
                    </td>

                    {/* DATA VISITA */}
                    <td className="py-3 px-3 text-slate-600 tabular-nums whitespace-nowrap">
                      {rup.data_visita
                        ? new Date(
                            rup.data_visita.includes('T')
                              ? rup.data_visita
                              : rup.data_visita + 'T00:00:00',
                          ).toLocaleDateString('pt-BR')
                        : '—'}
                    </td>

                    {/* COLABORADOR */}
                    <td className="py-3 px-3 text-slate-600 text-[11px]">
                      {rup.colaborador || '—'}
                    </td>

                    {/* STATUS */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <Badge
                        variant="outline"
                        className={
                          isAtivo
                            ? 'bg-red-50 text-red-700 border-red-200 font-semibold text-[11px]'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold text-[11px]'
                        }
                      >
                        {isAtivo ? (
                          <span className="flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3 text-red-600" />
                            Ativo
                          </span>
                        ) : (
                          <span className="flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            Resolvido
                          </span>
                        )}
                      </Badge>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
