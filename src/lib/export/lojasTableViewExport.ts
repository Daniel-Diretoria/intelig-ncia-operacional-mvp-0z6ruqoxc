import * as XLSX from 'xlsx'
import type { StoreSummary } from '@/services/useLojas'
import type { ValidadeItem, Ruptura } from '@/types'
import { formatStoreIdentityTable } from '@/lib/format/storeIdentity'
import { formatCityUf } from '@/lib/format/storeIdentity'
import { formatDisplayDate } from '@/lib/format/dateParser'
import { classificarCriticidade } from '@/lib/data/criticidade'

/**
 * Gera o nome do arquivo XLSX para a listagem de lojas:
 * Lojas_[MARCA ou TODAS]_DD-MM-YYYY.xlsx
 */
export function getLojasExportFileName(marcaFilter?: string | null, customDate?: Date): string {
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
    marcaFilter !== 'Todas' &&
    marcaFilter !== 'Todas as marcas'
  ) {
    const sanitizedMarca = marcaFilter
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/gi, '_')
      .replace(/_+/g, '_')
    return `Lojas_${sanitizedMarca}_${dateStr}.xlsx`
  }

  return `Lojas_TODAS_${dateStr}.xlsx`
}

/**
 * Exporta a tabela de lojas (/lojas) com 7 colunas exatas:
 * 1. Loja ("CÓDIGO — NOME")
 * 2. Cidade / UF
 * 3. Rede
 * 4. Marcas atendidas (número)
 * 5. Validades até 15 dias (número)
 * 6. Rupturas ativas (número)
 * 7. Situação ("Crítica" ou "Normal")
 */
export function exportLojasTableViewXLSX(
  items: StoreSummary[],
  marcaFilter?: string | null,
  customDate?: Date,
): { count: number; fileName: string } {
  if (items.length === 0) {
    throw new Error('Nenhuma loja para exportar.')
  }

  const rows = items.map((store) => ({
    Loja: formatStoreIdentityTable({
      codigoLoja: store.storeCode,
      nomeLoja: store.storeName,
    }),
    'Cidade / UF': formatCityUf(store.city, store.uf),
    Rede: store.networkName,
    'Marcas atendidas': store.marcasCount,
    'Validades até 15 dias': store.validadesCriticasCount,
    'Rupturas ativas': store.rupturasAtivasCount,
    Situação: store.situacao,
  }))

  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Lojas')

  const fileName = getLojasExportFileName(marcaFilter, customDate)
  XLSX.writeFile(wb, fileName)

  return { count: items.length, fileName }
}

/**
 * Gera o nome do arquivo XLSX para o detalhe da loja:
 * Loja_[CODIGO]_[NOME]_DD-MM-YYYY.xlsx
 * Se código ausente: Loja_SEM_CODIGO_[NOME]_DD-MM-YYYY.xlsx
 */
export function getStoreDetailExportFileName(
  store: { storeCode?: string | null; storeName: string },
  customDate?: Date,
): string {
  const now = customDate || new Date()
  const dd = String(now.getDate()).padStart(2, '0')
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const yyyy = now.getFullYear()
  const dateStr = `${dd}-${mm}-${yyyy}`

  const codePart = store.storeCode && store.storeCode.trim() ? store.storeCode.trim() : 'SEM_CODIGO'
  const namePart = (store.storeName || 'LOJA')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/gi, '_')
    .replace(/_+/g, '_')

  return `Loja_${codePart}_${namePart}_${dateStr}.xlsx`
}

/**
 * Exporta o detalhe da loja (/lojas/:storeId) com 2 abas:
 * Aba 1: "Validades" (7 colunas SEM Loja)
 *   1. Marca
 *   2. Realizado (dd/MM/yyyy)
 *   3. Produto
 *   4. Dias pra vencer (número)
 *   5. Validade (dd/MM/yyyy)
 *   6. Criticidade (Crítico, Atenção, Moderado, OK)
 *   7. Data de Entrada (dd/MM/yyyy)
 *
 * Aba 2: "Rupturas" (6 colunas SEM Loja)
 *   1. Marca
 *   2. Data da Visita (dd/MM/yyyy)
 *   3. Produto
 *   4. Motivo
 *   5. Dias em Ruptura (número)
 *   6. Situação
 */
export function exportStoreDetailXLSX(
  store: { storeCode?: string | null; storeName: string },
  validades: ValidadeItem[],
  rupturas: Ruptura[],
  customDate?: Date,
): { countValidades: number; countRupturas: number; fileName: string } {
  if (validades.length === 0 && rupturas.length === 0) {
    throw new Error('Nenhum dado disponível nesta loja para exportar.')
  }

  const wb = XLSX.utils.book_new()

  // Aba 1: Validades
  const validadesRows = validades.map((row) => ({
    Marca: row.cliente || '—',
    Realizado: formatDisplayDate(row.dataEntrada, '—'),
    Produto: row.product || '—',
    'Dias pra vencer': row.diasRestantes,
    Validade: formatDisplayDate(row.validade, '—'),
    Criticidade: classificarCriticidade(row.diasRestantes),
    'Data de Entrada': formatDisplayDate(row.ultimaAtualizacao || row.dataEntrada, '—'),
  }))

  const wsValidades = XLSX.utils.json_to_sheet(
    validadesRows.length > 0
      ? validadesRows
      : [
          {
            Marca: 'Nenhum registro',
            Realizado: '',
            Produto: '',
            'Dias pra vencer': '',
            Validade: '',
            Criticidade: '',
            'Data de Entrada': '',
          },
        ],
  )
  XLSX.utils.book_append_sheet(wb, wsValidades, 'Validades')

  // Aba 2: Rupturas
  const rupturasRows = rupturas.map((row) => ({
    Marca: row.cliente || '—',
    'Data da Visita': formatDisplayDate(row.data_visita, '—'),
    Produto: row.produto || '—',
    Motivo: row.motivo || '—',
    'Dias em Ruptura': row.dias_em_ruptura ?? 0,
    Situação: row.situacao_atual === 'Ativo' ? 'Ativa' : row.situacao_atual || 'Ativa',
  }))

  const wsRupturas = XLSX.utils.json_to_sheet(
    rupturasRows.length > 0
      ? rupturasRows
      : [
          {
            Marca: 'Nenhum registro',
            'Data da Visita': '',
            Produto: '',
            Motivo: '',
            'Dias em Ruptura': '',
            Situação: '',
          },
        ],
  )
  XLSX.utils.book_append_sheet(wb, wsRupturas, 'Rupturas')

  const fileName = getStoreDetailExportFileName(store, customDate)
  XLSX.writeFile(wb, fileName)

  return {
    countValidades: validades.length,
    countRupturas: rupturas.length,
    fileName,
  }
}
