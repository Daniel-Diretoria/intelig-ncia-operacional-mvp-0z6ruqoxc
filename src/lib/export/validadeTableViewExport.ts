import * as XLSX from 'xlsx'
import type { ValidadeItem } from '@/types'
import { classificarCriticidade } from '@/lib/data/criticidade'
import { formatDisplayDate } from '@/lib/format/dateParser'
import { formatStoreIdentity } from '@/lib/format/storeIdentity'

/**
 * Formata o nome da loja especificamente para exibição na tabela e exportação:
 * "CÓDIGO — NOME" (usando em-dash '—' no lugar de '•').
 * Se sem código numérico confiável: "SEM CÓDIGO — NOME".
 * Preserva zeros à esquerda e evita inventar valores.
 */
export function formatStoreIdentityTable(item: {
  codigoLoja?: string | number | null
  loja?: string | null
  razaoSocial?: string | null
}): string {
  const formatted = formatStoreIdentity({
    codigo_loja: item.codigoLoja,
    nome_loja: item.loja,
    razao_social: item.razaoSocial,
  })

  // formatted pode ser:
  // "00250 • FORT ATACADISTA FLORESTA"
  // "Código não identificado • FORT ATACADISTA"
  // "Código não identificado • Loja não identificada"
  if (formatted.startsWith('Código não identificado • ')) {
    const cleanName = formatted.replace('Código não identificado • ', '').trim()
    return `SEM CÓDIGO — ${cleanName || 'Loja não identificada'}`
  }

  // Substituir o separador central " • " por " — "
  return formatted.replace(' • ', ' — ')
}

/**
 * Gera o nome do arquivo XLSX:
 * Se houver filtro de Marca ativo: Validades_[MARCA]_DD-MM-YYYY.xlsx
 * Caso contrário: Validades_Completa_DD-MM-YYYY.xlsx
 */
export function getValidadesExportFileName(marcaFilter?: string | null): string {
  const now = new Date()
  const dd = String(now.getDate()).padStart(2, '0')
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const yyyy = now.getFullYear()
  const dateStr = `${dd}-${mm}-${yyyy}`

  if (
    marcaFilter &&
    marcaFilter.trim() &&
    marcaFilter !== 'Todos' &&
    marcaFilter !== 'Todas as marcas'
  ) {
    // Sanitiza o nome da marca para uso em nome de arquivo
    const sanitizedMarca = marcaFilter
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/gi, '_')
      .replace(/_+/g, '_')
    return `Validades_${sanitizedMarca}_${dateStr}.xlsx`
  }

  return `Validades_Completa_${dateStr}.xlsx`
}

/**
 * Exporta exatamente os registros de sortedData com as 8 colunas exatas da tabela:
 * 1. Loja ("CÓDIGO — NOME")
 * 2. Marca (cliente)
 * 3. Realizado (dataEntrada em dd/MM/yyyy)
 * 4. Produto (product)
 * 5. Dias pra vencer (diasRestantes - número)
 * 6. Validade (validade em dd/MM/yyyy)
 * 7. Criticidade (classificarCriticidade)
 * 8. Data de Entrada (ultimaAtualizacao em dd/MM/yyyy)
 */
export function exportValidadesTableViewXLSX(
  items: ValidadeItem[],
  marcaFilter?: string | null,
): { count: number; fileName: string } {
  if (items.length === 0) {
    throw new Error('Nenhuma ocorrência para exportar.')
  }

  const rows = items.map((row) => ({
    Loja: formatStoreIdentityTable({
      codigoLoja: row.codigoLoja,
      loja: row.loja,
    }),
    Marca: row.cliente || '—',
    Realizado: formatDisplayDate(row.dataEntrada, '—'),
    Produto: row.product || '—',
    'Dias pra vencer': row.diasRestantes,
    Validade: formatDisplayDate(row.validade, '—'),
    Criticidade: classificarCriticidade(row.diasRestantes),
    'Data de Entrada': formatDisplayDate(row.ultimaAtualizacao, '—'),
  }))

  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Validades')

  const fileName = getValidadesExportFileName(marcaFilter)
  XLSX.writeFile(wb, fileName)

  return { count: items.length, fileName }
}
