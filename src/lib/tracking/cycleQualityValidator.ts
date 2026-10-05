import type { CycleQualityAssessment } from '@/types/operationalTracking'

/**
 * Validação de qualidade do ciclo antes de gerar alertas em massa.
 *
 * NOTA ARQUITETURAL / OPERACIONAL:
 * - O acompanhamento automático atual usa a configuração de pesquisa de VALIDADES como fonte principal dos ciclos;
 * - Rupturas entram apenas como evidência de cruzamento e explicação operacional de ausência;
 * - A lógica NÃO vale ainda para pesquisas obrigatórias de Ruptura (a serem desenvolvidas depois).
 * - O volume do ciclo corresponde estritamente ao número de PRODUTOS DISTINTOS atualizados naquele ciclo para
 *   a combinação: Indústria + Loja + Pesquisa de Validades. Múltiplos lotes/registros do mesmo produto contam como 1.
 *
 * Princípios do usuário:
 * 1. Compare o volume atual da loja (produtos distintos) com seu comportamento histórico e ciclos anteriores.
 * 2. Queda muito anormal -> sinalizar "Possível inconsistência na pesquisa".
 *    Exemplo do usuário (Fort Aventureiro 165 / Frutap / Pesquisa de Validades):
 *    ciclos 08/09→36, 15/09→34, 22/09→38, 29/09→1; histórico=[36,34,38], atual=1.
 *    Em vez de gerar 35 alertas individuais como perda de acompanhamento crítico, sinalizar
 *    que a pesquisa daquela loja precisa ser validada (pendência de qualidade da pesquisa/loja).
 * 3. NÃO usar número rígido universal (não fixar "menos de 50%"): a detecção considera o
 *    histórico da própria combinação indústria+loja+pesquisa, com abordagem auditável e conservadora.
 * 4. Distinguir: pesquisa inteira aparentemente não realizada (priorizar pendência de pesquisa/loja)
 *    vs. ciclo com produtos específicos ausentes (gerar acompanhamentos por produto).
 * 5. "Quando a qualidade do ciclo estiver em dúvida, não classifique silenciosamente dezenas de produtos como críticos."
 */

export interface StoreCycleMetrics {
  storeName: string
  industryName: string
  volumeCicloAtual: number
  volumeCiclosAnteriores: number[]
  totalEsperadoMixDefinido?: number
}

export function evaluateStoreCycleQuality(metrics: StoreCycleMetrics): CycleQualityAssessment {
  const { volumeCicloAtual, volumeCiclosAnteriores, totalEsperadoMixDefinido } = metrics

  // 1. Caso: Pesquisa Inteira Não Realizada
  // Volume zero no ciclo atual quando historicamente a loja sempre registrava produtos
  const mediaHistorica =
    volumeCiclosAnteriores.length > 0
      ? volumeCiclosAnteriores.reduce((a, b) => a + b, 0) / volumeCiclosAnteriores.length
      : totalEsperadoMixDefinido || 0

  if (volumeCicloAtual === 0 && mediaHistorica >= 3) {
    return {
      isInconsistent: true,
      isPesquisaNaoRealizada: true,
      motivoInconsistencia: 'Pesquisa da loja aparentemente não realizada no ciclo atual',
      volumeAtual: 0,
      volumeHistoricoEsperado: Math.round(mediaHistorica),
      percentualQueda: 100,
      detalhesAuditaveis: `A loja registra historicamente média de ${Math.round(mediaHistorica)} produtos por ciclo, porém nenhum registro foi recebido no ciclo atual. A pendência é da pesquisa/loja inteira e não ausência isolada de produtos.`,
    }
  }

  // 2. Caso: Queda Anormal e Abrupta de Volume (Inconsistência da Pesquisa)
  // Exemplo: média de 25-40 produtos e ciclo atual veio com 1 ou 2 produtos (queda superior a ~75-80% em relação à mediana/média da loja)
  if (mediaHistorica >= 8) {
    const percentualQueda = Math.round(((mediaHistorica - volumeCicloAtual) / mediaHistorica) * 100)

    // Se o volume atual caiu para menos de 20% do volume histórico (ex: de 35 caiu para 2), ou < 3 produtos
    if (volumeCicloAtual <= 2 && mediaHistorica >= 10) {
      return {
        isInconsistent: true,
        isPesquisaNaoRealizada: false,
        motivoInconsistencia: 'Possível inconsistência na pesquisa (volume anormalmente baixo)',
        volumeAtual: volumeCicloAtual,
        volumeHistoricoEsperado: Math.round(mediaHistorica),
        percentualQueda,
        detalhesAuditaveis: `Loja registrou apenas ${volumeCicloAtual} produto(s) no ciclo atual versus média histórica de ${Math.round(mediaHistorica)} produtos (queda de ${percentualQueda}%). Pesquisa precisa ser auditada antes de gerar dezenas de alertas individuais.`,
      }
    }

    if (percentualQueda >= 80 && volumeCicloAtual <= 5) {
      return {
        isInconsistent: true,
        isPesquisaNaoRealizada: false,
        motivoInconsistencia: 'Possível inconsistência na pesquisa (queda abrupta de volume)',
        volumeAtual: volumeCicloAtual,
        volumeHistoricoEsperado: Math.round(mediaHistorica),
        percentualQueda,
        detalhesAuditaveis: `Volume do ciclo atual (${volumeCicloAtual} produtos) é muito inferior ao padrão histórico da loja (${Math.round(mediaHistorica)} produtos). Queda de ${percentualQueda}%.`,
      }
    }
  }

  // 3. Ciclo Regular / Saudável
  return {
    isInconsistent: false,
    isPesquisaNaoRealizada: false,
    volumeAtual: volumeCicloAtual,
    volumeHistoricoEsperado: Math.round(mediaHistorica || volumeCicloAtual),
    percentualQueda: 0,
    detalhesAuditaveis: 'Volume do ciclo condizente com o histórico operacional da loja.',
  }
}
