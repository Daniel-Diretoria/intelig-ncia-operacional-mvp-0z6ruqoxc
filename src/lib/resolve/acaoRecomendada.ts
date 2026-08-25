/**
 * Regras de Ação Recomendada para a gestão de produtos no drill-down de supervisores.
 * Função pura e determinística.
 */
export function getAcaoRecomendada(
  tipo: 'validade' | 'ruptura' | 'ambos',
  diasRestantes?: number,
  diasEmRuptura?: number,
): string {
  if (tipo === 'ambos') {
    return 'Priorizar reposição sem ampliar estoque do lote crítico.'
  }

  if (tipo === 'validade') {
    if (diasRestantes !== undefined && diasRestantes !== null) {
      if (diasRestantes >= 0 && diasRestantes <= 7) {
        return 'Ação imediata: negociar giro, remanejamento ou retirada do lote.'
      }
      if (diasRestantes >= 8 && diasRestantes <= 15) {
        return 'Plano preventivo: acompanhar giro e programar ação antes do vencimento.'
      }
    }
    return 'Acompanhar evolução do indicador.'
  }

  if (tipo === 'ruptura') {
    return 'Verificar estoque, pedido e reposição com o fornecedor.'
  }

  return 'Acompanhar evolução do indicador.'
}
