import * as XLSX from 'xlsx'
import type { Ruptura } from '@/types/rupturas'
import type { RupturaEncerrada } from '@/lib/engine/confrontoBidirecional'
import { formatDisplayDate } from '@/lib/format/dateParser'
import { formatStoreIdentityTable } from '@/lib/export/validadeTableViewExport'

export interface RupturaExportItem extends Ruptura {
  statusHistorico?: string
}

/**
 * Gera o nome do arquivo XLSX:
 * Se houver filtro de Marca ativo: Rupturas_[MARCA]_DD-MM-YYYY.xlsx
 * Caso contrário: Rupturas_TODAS_DD-MM-YYYY.xlsx
 */
export function getRupturasExportFileName(marcaFilter?: string | null, customDate?: Date): string {
  const now = customDate || new Date()
  const dd = String(now.getDate()).padStart(2, '0')
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const yyyy = now.getFullYear()
  const dateStr = `${dd}-${mm}-${yyyy}`

  if (
    marcaFilter &&
    marcaFilter.trim() &&
    marcaFilter !== 'all' &&
    marcaFilter !== 'Todos' &&
    marcaFilter !== 'Todas as marcas'
  ) {
    const sanitizedMarca = marcaFilter
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/gi, '_')
      .replace(/_+/g, '_')
    return `Rupturas_${sanitizedMarca}_${dateStr}.xlsx`
  }

  return `Rupturas_TODAS_${dateStr}.xlsx`
}

/**
 * Exporta exatamente os registros de filteredRupturas com as 7 colunas exatas da tabela:
 * 1. Loja ("CÓDIGO — NOME")
 * 2. Marca (cliente)
 * 3. Data da Visita (data_visita em dd/MM/yyyy)
 * 4. Produto (produto)
 * 5. Motivo (motivo)
 * 6. Dias em Ruptura (dias_em_ruptura - número)
 * 7. Situação ("Ativa" ou status do Histórico)
 */
export function exportRupturasTableViewXLSX(
  items: Array<Ruptura | RupturaEncerrada>,
  marcaFilter?: string | null,
  viewMode: 'ativas' | 'historico' = 'ativas',
  customDate?: Date,
): { count: number; fileName: string } {
  if (items.length === 0) {
    throw new Error('Nenhuma ocorrência de ruptura para exportar.')
  }

  const rows = items.map((row) => {
    let situacao = 'Ativa'
    if (viewMode === 'historico' || (row as RupturaEncerrada).statusHistorico) {
      situacao =
        (row as RupturaEncerrada).statusHistorico ||
        (row.situacao_atual === 'Resolvido' ? 'Resolvido' : 'Encerrada')
    }

    return {
      Loja: formatStoreIdentityTable({
        codigoLoja: row.codigo_loja,
        loja: row.nome_loja,
      }),
      Marca: row.cliente || '—',
      'Data da Visita': formatDisplayDate(row.data_visita, '—'),
      Produto: row.produto || '—',
      Motivo: row.motivo || '—',
      'Dias em Ruptura': row.dias_em_ruptura ?? 0,
      Situação: situacao,
    }
  })

  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Rupturas')

  const fileName = getRupturasExportFileName(marcaFilter, customDate)
  XLSX.writeFile(wb, fileName)

  return { count: items.length, fileName }
}
