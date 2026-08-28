/**
 * Exportação PDF da página de Relatórios.
 *
 * Gera um PDF (via jspdf + jspdf-autotable) seguindo o layout de referência
 * da Massas D'Itália, com:
 *   - Capa com título, KPIs em cards e tabela "Produtos Mais Críticos" (top 12).
 *   - Páginas por loja (ordenadas por maior nº de críticos), com tabela de
 *     6 colunas (PRODUTO | REALIZADO | VALIDADE | DIAS P/VENCER | QTD | STATUS).
 *   - Rodapé "Diretoria Promoções · Uso Confidencial" + número da página em
 *     todas as páginas.
 *
 * Os dados vêm 100% da `validades_base` (filtro `is_base_atual = true` e
 * `diasRestantes > 0`) reaproveitando o `fetchValidadesForExport` do
 * `relatoriosExport` (mesmo pipeline do TradeProApiAdapter, sem mock).
 */
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import pb from '@/lib/pocketbase/client'
import { fetchValidadesForExport, type NormItem } from './relatoriosExport'
import { classificarStatusOperacional } from '@/lib/data/criticidade'
import type { ValidadesFilter } from '@/types'

// -- Cores (hex sem "#") para usar no jsPDF / autotable ----------------------
const COLOR_PRIMARY: [number, number, number] = [79, 70, 229] // indigo-600
const COLOR_SLATE_900: [number, number, number] = [15, 23, 42]
const COLOR_SLATE_700: [number, number, number] = [51, 65, 85]
const COLOR_SLATE_500: [number, number, number] = [100, 116, 139]
const COLOR_SLATE_200: [number, number, number] = [226, 232, 240]
const COLOR_RED: [number, number, number] = [220, 38, 38] // red-600
const COLOR_ORANGE: [number, number, number] = [234, 88, 12] // orange-600
const COLOR_AMBER: [number, number, number] = [180, 83, 9] // amber-700
const COLOR_GREEN: [number, number, number] = [4, 120, 87] // emerald-700
const COLOR_RED_BG: [number, number, number] = [254, 226, 226] // red-100
const COLOR_ORANGE_BG: [number, number, number] = [255, 237, 213] // orange-100
const COLOR_AMBER_BG: [number, number, number] = [254, 243, 199] // amber-100
const COLOR_GREEN_BG: [number, number, number] = [209, 250, 229] // emerald-100

// -- Helpers ------------------------------------------------------------------

/** Formata data ISO (YYYY-MM-DD ou ISO date-time) em dd/mm/aaaa. */
function fmtDate(iso: string | undefined): string {
  if (!iso) return '—'
  const clean = iso.split(' ')[0]
  const d = new Date(clean + 'T00:00:00')
  if (isNaN(d.getTime())) return '—'
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

/** Monta a string de loja no formato "CÓDIGO • NOME" (zero à esquerda preservado). */
function fmtLoja(item: NormItem): string {
  const codigo = item.codigoLoja?.trim() || ''
  const paddedCode = codigo ? codigo.replace(/^0+/, '').padStart(3, '0') : ''
  const nome = item.loja?.trim() || ''
  if (paddedCode && nome) return `${paddedCode} • ${nome}`
  if (nome) return nome
  if (paddedCode) return paddedCode
  return 'Loja não identificada'
}

/** Cor (fundo, texto) do status para badges coloridos no PDF. */
function statusColors(status: string): {
  fill: [number, number, number]
  text: [number, number, number]
} {
  switch (status) {
    case 'Crítico':
      return { fill: COLOR_RED_BG, text: COLOR_RED }
    case 'Atenção':
      return { fill: COLOR_ORANGE_BG, text: COLOR_ORANGE }
    case 'Moderado':
      return { fill: COLOR_AMBER_BG, text: COLOR_AMBER }
    case 'Normal':
      return { fill: COLOR_GREEN_BG, text: COLOR_GREEN }
    default:
      return { fill: COLOR_SLATE_200, text: COLOR_SLATE_700 }
  }
}

// -- KPIs ---------------------------------------------------------------------

interface PdfKpis {
  total: number
  critico: number
  atencao: number
  moderado: number
  normal: number
}

/** Conta KPIs conforme faixas do layout (1-15, 16-25, 26-35, >35). */
function computeKpis(items: NormItem[]): PdfKpis {
  let critico = 0
  let atencao = 0
  let moderado = 0
  let normal = 0
  for (const it of items) {
    const s = classificarStatusOperacional(it.diasRestantes)
    if (s === 'Crítico') critico++
    else if (s === 'Atenção') atencao++
    else if (s === 'Moderado') moderado++
    else normal++
  }
  return { total: items.length, critico, atencao, moderado, normal }
}

// -- Agrupamento por loja -----------------------------------------------------

interface StoreGroup {
  loja: string
  items: NormItem[]
  kpis: PdfKpis
}

/** Agrupa itens por loja (formato "CÓDIGO • NOME"), ordenando por nº de críticos. */
function groupByStore(items: NormItem[]): StoreGroup[] {
  const map = new Map<string, NormItem[]>()
  for (const it of items) {
    const key = fmtLoja(it)
    const arr = map.get(key) ?? []
    arr.push(it)
    map.set(key, arr)
  }
  const groups: StoreGroup[] = []
  for (const [loja, lojaItems] of map.entries()) {
    groups.push({ loja, items: lojaItems, kpis: computeKpis(lojaItems) })
  }
  // Ordenar lojas: com mais críticos primeiro; empate por total de ocorrências.
  groups.sort((a, b) => b.kpis.critico - a.kpis.critico || b.kpis.total - a.kpis.total)
  return groups
}

// -- Desenho da capa ----------------------------------------------------------

/** Desenha um card KPI retangular na capa. */
function drawKpiCard(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  value: number,
  accent: [number, number, number],
) {
  // Borda/cor de fundo suave
  doc.setFillColor(248, 250, 252) // slate-50
  doc.setDrawColor(COLOR_SLATE_200[0], COLOR_SLATE_200[1], COLOR_SLATE_200[2])
  doc.setLineWidth(0.3)
  doc.roundedRect(x, y, w, h, 3, 3, 'FD')

  // Faixa de cor (accent) à esquerda
  doc.setFillColor(accent[0], accent[1], accent[2])
  doc.roundedRect(x, y, 1.6, h, 1.2, 1.2, 'F')

  // Label (com quebra automática para caber na largura do card)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(COLOR_SLATE_500[0], COLOR_SLATE_500[1], COLOR_SLATE_500[2])
  const labelLines = doc.splitTextToSize(label.toUpperCase(), w - 5)
  doc.text(labelLines, x + 3.2, y + 4.2)

  // Valor (número grande)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(COLOR_SLATE_900[0], COLOR_SLATE_900[1], COLOR_SLATE_900[2])
  doc.text(String(value), x + 3.2, y + h - 3.2)
}

/** Desenha a capa do PDF (página 1). */
function drawCover(
  doc: jsPDF,
  kpis: PdfKpis,
  topCritical: NormItem[],
  pageWidth: number,
  _pageHeight: number,
) {
  // Cabeçalho colorido
  doc.setFillColor(COLOR_PRIMARY[0], COLOR_PRIMARY[1], COLOR_PRIMARY[2])
  doc.rect(0, 0, pageWidth, 30, 'F')

  // Título (centralizado)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(255, 255, 255)
  doc.text('RELATÓRIO DE VALIDADES', pageWidth / 2, 15, { align: 'center' })

  // Subtítulo (centralizado)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(224, 231, 255) // indigo-100
  doc.text('Gestão de Vencimentos · Diretoria Promoções', pageWidth / 2, 23, {
    align: 'center',
  })

  // Data de geração (abaixo do cabeçalho, canto direito)
  const hoje = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(COLOR_SLATE_500[0], COLOR_SLATE_500[1], COLOR_SLATE_500[2])
  doc.text(`Gerado em ${hoje}`, pageWidth - 14, 38, { align: 'right' })

  // -- KPIs em cards lado a lado --------------------------------------------
  const cardY = 44
  const cardH = 18
  const cardGap = 3
  const cardW = (pageWidth - 28 - cardGap * 4) / 5

  drawKpiCard(doc, 14, cardY, cardW, cardH, 'Total de Ocorrências', kpis.total, COLOR_SLATE_700)
  drawKpiCard(
    doc,
    14 + (cardW + cardGap),
    cardY,
    cardW,
    cardH,
    'Crítico (1-15 dias)',
    kpis.critico,
    COLOR_RED,
  )
  drawKpiCard(
    doc,
    14 + (cardW + cardGap) * 2,
    cardY,
    cardW,
    cardH,
    'Atenção (16-25 dias)',
    kpis.atencao,
    COLOR_ORANGE,
  )
  drawKpiCard(
    doc,
    14 + (cardW + cardGap) * 3,
    cardY,
    cardW,
    cardH,
    'Moderado (26-35 dias)',
    kpis.moderado,
    COLOR_AMBER,
  )
  drawKpiCard(
    doc,
    14 + (cardW + cardGap) * 4,
    cardY,
    cardW,
    cardH,
    'Normal (36+ dias)',
    kpis.normal,
    COLOR_GREEN,
  )

  // -- Tabela "Produtos Mais Críticos" (top 12 por menor diasRestantes) ------
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(COLOR_SLATE_900[0], COLOR_SLATE_900[1], COLOR_SLATE_900[2])
  doc.text('PRODUTOS MAIS CRÍTICOS', 14, cardY + cardH + 8)

  const body = topCritical.map((it) => [
    it.product || '—',
    fmtLoja(it),
    fmtDate(it.validade),
    String(it.diasRestantes),
    String(it.quantidade ?? 0),
    it.status || classificarStatusOperacional(it.diasRestantes),
  ])

  autoTable(doc, {
    startY: cardY + cardH + 10,
    head: [['PRODUTO', 'LOJA', 'VALIDADE', 'DIAS P/VENCER', 'QTD', 'STATUS']],
    body,
    theme: 'grid',
    margin: { left: 14, right: 14 },
    styles: {
      font: 'helvetica',
      fontSize: 7.5,
      cellPadding: 2,
      lineColor: COLOR_SLATE_200,
      lineWidth: 0.2,
      textColor: COLOR_SLATE_700,
    },
    headStyles: {
      fillColor: COLOR_SLATE_900,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.5,
    },
    columnStyles: {
      0: { cellWidth: 70 },
      1: { cellWidth: 50 },
      2: { cellWidth: 22, halign: 'center' },
      3: { cellWidth: 22, halign: 'center' },
      4: { cellWidth: 16, halign: 'center' },
      5: { cellWidth: 22, halign: 'center' },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 5 && data.cell.text[0]) {
        const { fill, text } = statusColors(data.cell.text[0])
        data.cell.styles.fillColor = fill
        data.cell.styles.textColor = text
        data.cell.styles.fontStyle = 'bold'
      }
      if (data.section === 'body' && data.column.index === 3 && data.cell.text[0]) {
        const dias = parseInt(data.cell.text[0], 10)
        if (!isNaN(dias) && dias <= 15) {
          data.cell.styles.textColor = COLOR_RED
          data.cell.styles.fontStyle = 'bold'
        }
      }
    },
  })
}

// -- Desenho de página por loja -----------------------------------------------

/** Desenha a página de uma loja (cabeçalho + resumo + tabela). */
function drawStorePage(doc: jsPDF, group: StoreGroup, pageWidth: number, _pageHeight: number) {
  // Cabeçalho da loja
  doc.setFillColor(COLOR_PRIMARY[0], COLOR_PRIMARY[1], COLOR_PRIMARY[2])
  doc.rect(0, 0, pageWidth, 14, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(255, 255, 255)
  doc.text(group.loja.toUpperCase(), 14, 9.5)

  // Linha de resumo
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(COLOR_SLATE_700[0], COLOR_SLATE_700[1], COLOR_SLATE_700[2])
  const resumo = `${group.kpis.total} produtos · ${group.kpis.critico} Crítico · ${group.kpis.atencao} Atenção · ${group.kpis.moderado} Moderado · ${group.kpis.normal} Normal`
  doc.text(resumo, 14, 20)

  const body = group.items
    .slice()
    .sort((a, b) => a.diasRestantes - b.diasRestantes)
    .map((it) => [
      it.product || '—',
      fmtDate(it.ultimaAtualizacao),
      fmtDate(it.validade),
      String(it.diasRestantes),
      String(it.quantidade ?? 0),
      it.status || classificarStatusOperacional(it.diasRestantes),
    ])

  autoTable(doc, {
    startY: 24,
    head: [['PRODUTO', 'REALIZADO', 'VALIDADE', 'DIAS P/VENCER', 'QTD', 'STATUS']],
    body,
    theme: 'grid',
    margin: { left: 14, right: 14 },
    styles: {
      font: 'helvetica',
      fontSize: 7.5,
      cellPadding: 2,
      lineColor: COLOR_SLATE_200,
      lineWidth: 0.2,
      textColor: COLOR_SLATE_700,
    },
    headStyles: {
      fillColor: COLOR_SLATE_900,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.5,
    },
    columnStyles: {
      0: { cellWidth: 70 },
      1: { cellWidth: 22, halign: 'center' },
      2: { cellWidth: 22, halign: 'center' },
      3: { cellWidth: 22, halign: 'center' },
      4: { cellWidth: 16, halign: 'center' },
      5: { cellWidth: 22, halign: 'center' },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 5 && data.cell.text[0]) {
        const { fill, text } = statusColors(data.cell.text[0])
        data.cell.styles.fillColor = fill
        data.cell.styles.textColor = text
        data.cell.styles.fontStyle = 'bold'
      }
      if (data.section === 'body' && data.column.index === 3 && data.cell.text[0]) {
        const dias = parseInt(data.cell.text[0], 10)
        if (!isNaN(dias) && dias <= 15) {
          data.cell.styles.textColor = COLOR_RED
          data.cell.styles.fontStyle = 'bold'
        }
      }
    },
  })
}

// -- Rodapé -------------------------------------------------------------------

/** Desenha o rodapé em todas as páginas do documento. */
function drawFooter(doc: jsPDF, pageWidth: number, pageHeight: number, pageCount: number) {
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(COLOR_SLATE_500[0], COLOR_SLATE_500[1], COLOR_SLATE_500[2])
    doc.text('Diretoria Promoções · Uso Confidencial', 14, pageHeight - 6)
    doc.text(`Página ${i} de ${pageCount}`, pageWidth - 14, pageHeight - 6, {
      align: 'right',
    })
  }
}

// -- API pública -------------------------------------------------------------

/** Nome do arquivo PDF (com data atual). */
export function relatorioPdfFileName(): string {
  const now = new Date()
  const dd = String(now.getDate()).padStart(2, '0')
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const yyyy = now.getFullYear()
  return `Relatorio_Validades_${dd}-${mm}-${yyyy}.pdf`
}

/**
 * Gera e baixa o PDF com as ocorrências filtradas de `validades_base`,
 * seguindo o layout da Massas D'Itália.
 * @returns número de ocorrências incluídas no PDF.
 */
export async function exportarRelatorioRupturasPdf(
  filters?: import('@/types').RupturasFilters,
): Promise<number> {
  let records: import('@/types').Ruptura[] = []
  try {
    const { getCurrentRupturas } = await import('@/lib/selectors/baseAtualSelectors')
    const { applyRupturasFilters } = await import('@/lib/pipeline/rupturasPipeline')
    const allRupturas = await getCurrentRupturas()
    records = applyRupturasFilters(allRupturas, filters)
  } catch (err) {
    console.error('[relatoriosPdfExport] Falha ao carregar rupturas_base:', err)
  }

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()

  // Cabeçalho
  doc.setFillColor(COLOR_PRIMARY[0], COLOR_PRIMARY[1], COLOR_PRIMARY[2])
  doc.rect(0, 0, pageWidth, 30, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(255, 255, 255)
  doc.text('RELATÓRIO DE RUPTURAS', pageWidth / 2, 15, { align: 'center' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(224, 231, 255)
  doc.text('Controle de Desabastecimento no PDV · Diretoria Promoções', pageWidth / 2, 23, {
    align: 'center',
  })

  const hoje = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(COLOR_SLATE_500[0], COLOR_SLATE_500[1], COLOR_SLATE_500[2])
  doc.text(`Gerado em ${hoje}`, pageWidth - 14, 38, { align: 'right' })

  const totalAtivas = records.filter((r) => r.situacao_atual === 'Ativo').length
  const totalResolvidas = records.filter((r) => r.situacao_atual === 'Resolvido').length
  const totalRupturaTotal = records.filter((r) => r.motivo === 'Ruptura Total').length
  const totalVirtual = records.filter((r) => r.motivo === 'Estoque Virtual').length

  const cardY = 44
  const cardH = 18
  const cardGap = 3
  const cardW = (pageWidth - 28 - cardGap * 3) / 4

  drawKpiCard(doc, 14, cardY, cardW, cardH, 'Rupturas Ativas', totalAtivas, COLOR_RED)
  drawKpiCard(
    doc,
    14 + (cardW + cardGap),
    cardY,
    cardW,
    cardH,
    'Ruptura Total',
    totalRupturaTotal,
    COLOR_ORANGE,
  )
  drawKpiCard(
    doc,
    14 + (cardW + cardGap) * 2,
    cardY,
    cardW,
    cardH,
    'Estoque Virtual',
    totalVirtual,
    COLOR_AMBER,
  )
  drawKpiCard(
    doc,
    14 + (cardW + cardGap) * 3,
    cardY,
    cardW,
    cardH,
    'Resolvidas',
    totalResolvidas,
    COLOR_GREEN,
  )

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(COLOR_SLATE_900[0], COLOR_SLATE_900[1], COLOR_SLATE_900[2])
  doc.text('OCORRÊNCIAS DE RUPTURA', 14, cardY + cardH + 8)

  const body = records.map((it) => {
    const code = it.codigo_loja?.trim()
    const paddedCode = code ? code.replace(/^0+/, '').padStart(3, '0') : ''
    const lojaStr =
      paddedCode && it.nome_loja
        ? `${paddedCode} • ${it.nome_loja}`
        : it.nome_loja || paddedCode || '—'
    return [
      it.produto,
      lojaStr,
      it.motivo,
      fmtDate(it.data_visita),
      `${it.dias_em_ruptura}d`,
      it.situacao_atual,
    ]
  })

  autoTable(doc, {
    startY: cardY + cardH + 10,
    head: [['PRODUTO', 'LOJA', 'MOTIVO', 'DATA VISITA', 'DIAS', 'STATUS']],
    body,
    theme: 'grid',
    margin: { left: 14, right: 14 },
    styles: {
      font: 'helvetica',
      fontSize: 7.5,
      cellPadding: 2,
      lineColor: COLOR_SLATE_200,
      lineWidth: 0.2,
      textColor: COLOR_SLATE_700,
    },
    headStyles: {
      fillColor: COLOR_SLATE_900,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.5,
    },
    columnStyles: {
      0: { cellWidth: 56 },
      1: { cellWidth: 52 },
      2: { cellWidth: 32 },
      3: { cellWidth: 18, halign: 'center' },
      4: { cellWidth: 12, halign: 'center' },
      5: { cellWidth: 18, halign: 'center' },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 5 && data.cell.text[0]) {
        const isAtivo = data.cell.text[0] === 'Ativo'
        data.cell.styles.fillColor = isAtivo ? COLOR_RED_BG : COLOR_GREEN_BG
        data.cell.styles.textColor = isAtivo ? COLOR_RED : COLOR_GREEN
        data.cell.styles.fontStyle = 'bold'
      }
    },
  })

  const pageCount = doc.internal.pages.length - 1
  drawFooter(doc, pageWidth, pageHeight, pageCount)

  const dd = String(new Date().getDate()).padStart(2, '0')
  const mm = String(new Date().getMonth() + 1).padStart(2, '0')
  const yyyy = new Date().getFullYear()
  doc.save(`Relatório_Rupturas_${dd}-${mm}-${yyyy}.pdf`)

  return records.length
}

export async function exportarRelatorioValidadesPdf(filters?: ValidadesFilter): Promise<number> {
  return exportarRelatorioPdf(filters)
}

export async function exportarRelatorioPdf(filters?: ValidadesFilter): Promise<number> {
  const items = await fetchValidadesForExport(filters)
  const kpis = computeKpis(items)

  // Top 12 produtos mais críticos (menor diasRestantes > 0).
  const topCritical = items
    .slice()
    .sort((a, b) => a.diasRestantes - b.diasRestantes)
    .slice(0, 12)

  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()

  // Capa (página 1)
  drawCover(doc, kpis, topCritical, pageWidth, pageHeight)

  // Páginas por loja (ordenadas por mais críticos primeiro)
  const storeGroups = groupByStore(items)
  for (const group of storeGroups) {
    doc.addPage()
    drawStorePage(doc, group, pageWidth, pageHeight)
  }

  // Rodapé em todas as páginas
  drawFooter(doc, pageWidth, pageHeight, doc.getNumberOfPages())

  doc.save(relatorioPdfFileName())

  return items.length
}
