import React from 'react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'

export interface Column<T> {
  key: string
  header: string
  className?: string
  align?: 'left' | 'center' | 'right'
  sortable?: boolean
  render?: (row: T, index: number) => React.ReactNode
}

interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  isLoading?: boolean
  skeletonRows?: number
  sortKey?: string
  sortOrder?: 'asc' | 'desc'
  onSort?: (key: string) => void
  emptyMessage?: string
  className?: string
  stickyFirstCol?: boolean
  /** Quando definido, cada linha fica clicável e invoca este callback. */
  onRowClick?: (row: T, index: number) => void
}

export function DataTable<T extends Record<string, any>>({
  columns,
  data,
  isLoading = false,
  skeletonRows = 5,
  sortKey,
  sortOrder,
  onSort,
  emptyMessage = 'Nenhum registro encontrado.',
  className,
  stickyFirstCol = true,
  onRowClick,
}: DataTableProps<T>) {
  if (isLoading) {
    return (
      <div
        className={cn(
          'w-full overflow-hidden rounded-xl border border-slate-200 bg-white',
          className,
        )}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80">
                {columns.map((col, idx) => (
                  <th
                    key={idx}
                    className={cn(
                      'py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider',
                      col.className,
                    )}
                  >
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {Array.from({ length: skeletonRows }).map((_, rIdx) => (
                <tr key={rIdx} className="h-12">
                  {columns.map((col, cIdx) => (
                    <td key={cIdx} className={cn('py-3 px-4', col.className)}>
                      <Skeleton className="h-4 w-full max-w-[120px]" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div
        className={cn(
          'w-full rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500 text-sm',
          className,
        )}
      >
        {emptyMessage}
      </div>
    )
  }

  return (
    <div
      className={cn(
        'w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm',
        className,
      )}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/90 sticky top-0 z-10">
              {columns.map((col, idx) => {
                const isSorted = sortKey === col.key
                const isFirst = idx === 0 && stickyFirstCol

                return (
                  <th
                    key={col.key || idx}
                    onClick={() => col.sortable && onSort && onSort(col.key)}
                    className={cn(
                      'py-3.5 px-4 text-xs font-semibold text-slate-600 uppercase tracking-wider transition-colors select-none',
                      col.sortable && 'cursor-pointer hover:bg-slate-100/80 hover:text-slate-900',
                      col.align === 'center' && 'text-center',
                      col.align === 'right' && 'text-right',
                      isFirst && 'sticky left-0 bg-slate-50/90 z-20 shadow-[1px_0_0_0_#E2E8F0]',
                      col.className,
                    )}
                  >
                    <div
                      className={cn(
                        'inline-flex items-center gap-1.5',
                        col.align === 'center' && 'justify-center',
                        col.align === 'right' && 'justify-end',
                      )}
                    >
                      <span>{col.header}</span>
                      {col.sortable && (
                        <span className="text-slate-400">
                          {isSorted ? (
                            sortOrder === 'asc' ? (
                              <ArrowUp className="w-3.5 h-3.5 text-indigo-600" />
                            ) : (
                              <ArrowDown className="w-3.5 h-3.5 text-indigo-600" />
                            )
                          ) : (
                            <ArrowUpDown className="w-3 h-3 opacity-60" />
                          )}
                        </span>
                      )}
                    </div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.map((row, rowIdx) => (
              <tr
                key={row.id || rowIdx}
                onClick={() => onRowClick?.(row, rowIdx)}
                className={cn(
                  'group hover:bg-slate-50/80 transition-colors duration-150 h-12',
                  onRowClick && 'cursor-pointer',
                )}
              >
                {columns.map((col, colIdx) => {
                  const isFirst = colIdx === 0 && stickyFirstCol
                  return (
                    <td
                      key={col.key || colIdx}
                      className={cn(
                        'py-3 px-4 text-slate-700 text-[13px] font-normal leading-normal whitespace-nowrap',
                        col.align === 'center' && 'text-center',
                        col.align === 'right' && 'text-right font-medium tabular-nums',
                        isFirst &&
                          'sticky left-0 bg-white group-hover:bg-slate-50/80 z-10 shadow-[1px_0_0_0_#E2E8F0] font-medium text-slate-900',
                        col.className,
                      )}
                    >
                      {col.render ? col.render(row, rowIdx) : row[col.key]}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
