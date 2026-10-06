/**
 * Motor de Auditoria de Devoluções / NF — Inteligência Operacional SKIP
 *
 * Princípios e Regras Fundamentais:
 * - O SKIP NÃO aprova ou reprova automaticamente; apoia a análise humana.
 * - Considera PRINCIPALMENTE os registros ANTERIORES à data da solicitação (Regra 8).
 * - NUNCA utiliza informação posterior como evidência de acompanhamento anterior (Regra 8).
 * - Quantidade 0 é uma atualização válida — NÃO interpretar automaticamente como ausência de dado (Regra 9).
 * - Ruptura entra como CONTEXTO/EVIDÊNCIA, não como conclusão automática (Regra 9).
 * - Se não houver histórico suficiente, classificar como DADOS INSUFICIENTES — NÃO Divergência (Regra 12).
 * - Validade ausente registrada explicitamente como "Validade não informada", nunca inventar data (Regra 5).
 * - Sem correspondência segura no cadastro de produtos, marcar "precisa_identificacao" (Regra 6).
 */

import {
  AuditoriaClassificacao,
  AuditoriaItemDetalhes,
  AuditoriaHistoricoRegistro,
  AuditoriaRupturaContexto,
} from '@/types/devolucoes'
import { generateExpectedCycles, calculateCyclesMissed } from '@/lib/tracking/cycleCalculator'

export interface AuditoriaInputItem {
  id?: string
  produto_nome_informado: string
  produto_codigo?: string
  produto_nome_oficial?: string
  precisa_identificacao?: boolean
  quantidade_solicitada: number
  validade_informada?: string // 'YYYY-MM-DD' ou vazio
  validade_ausente?: boolean
}

export interface HistoricoValidadeRaw {
  id: string
  produto: string
  cod_produto?: string
  codigo_loja?: string
  nome_loja?: string
  razao_social?: string
  quantidade: number
  realizado: string // ISO ou date string
  validade_efetiva?: string
  validade_original?: string
  colaborador?: string
  status_operacional?: string
  cliente?: string
  fornecedor?: string
}

export interface HistoricoRupturaRaw {
  id: string
  produto: string
  codigo_loja?: string
  nome_loja?: string
  motivo?: string
  situacao_atual?: string
  data_visita?: string
  observacao?: string
}

export interface AuditoriaContextoLojaIndustria {
  industry_name: string
  industry_id?: string
  tradepro_client_id?: string
  store_code?: string
  store_name: string
  data_solicitacao: string // YYYY-MM-DD
  historicoValidades: HistoricoValidadeRaw[]
  historicoRupturas: HistoricoRupturaRaw[]
  mixOficialProdutos?: Array<{ codigo_produto?: string; nome_produto: string }>
  dataInicioBaseHistorica?: string
  contextoIndustriaSeguro?: boolean
  motivoInsegurancaIndustria?: string
  cicloPesquisaConfigurado?: {
    frequencia: 'diaria' | 'semanal' | 'quinzenal' | 'mensal'
    dia_esperado?:
      | 'segunda'
      | 'terca'
      | 'quarta'
      | 'quinta'
      | 'sexta'
      | 'sabado'
      | 'domingo'
      | 'qualquer'
    tolerancia_dias?: number
    ativo?: boolean
  }
}

export interface AuditoriaItemResultado {
  classificacao: AuditoriaClassificacao
  explicacao: string
  detalhes: AuditoriaItemDetalhes
  precisaIdentificacao: boolean
  produtoNomeOficial?: string
  produtoCodigoOficial?: string
}

/**
 * Normaliza string para comparação sem acentos, pontuação ou maiúsculas
 */
export function normalizarTexto(str?: string): string {
  if (!str) return ''
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Extrai data YYYY-MM-DD de uma string ISO ou formato operacional brasileiro
 */
export function extrairDataIso(str?: string): string {
  if (!str) return ''
  // Se for ISO simples: 2026-08-13T... ou 2026-08-13
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`
  }
  // Se for formato BR: DD/MM/YYYY
  const brMatch = str.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (brMatch) {
    return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`
  }
  return ''
}

/**
 * Formata data ISO para exibição BR (DD/MM/AAAA)
 */
export function formatarDataBr(iso?: string): string {
  if (!iso) return '-'
  const d = extrairDataIso(iso)
  if (!d) return iso
  const parts = d.split('-')
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`
  }
  return iso
}

/**
 * Calcula diferença em dias entre duas datas ISO (data2 - data1)
 */
export function diferencaEmDias(iso1: string, iso2: string): number {
  const d1 = new Date(iso1 + 'T00:00:00Z').getTime()
  const d2 = new Date(iso2 + 'T00:00:00Z').getTime()
  if (isNaN(d1) || isNaN(d2)) return 0
  return Math.round((d2 - d1) / (1000 * 60 * 60 * 24))
}

/**
 * Verifica se um produto informado corresponde a um produto do histórico/mix
 */
export function verificarCorrespondenciaProduto(
  nomeInformado: string,
  codigoInformado: string | undefined,
  candidatoNome: string,
  candidatoCodigo: string | undefined,
): { match: boolean; tipo: 'codigo' | 'exato' | 'parcial_forte' | 'nenhum' } {
  // 1. Se ambos têm código e são idênticos
  if (
    codigoInformado &&
    candidatoCodigo &&
    codigoInformado.trim() !== '' &&
    codigoInformado.trim() === candidatoCodigo.trim()
  ) {
    return { match: true, tipo: 'codigo' }
  }

  const normInfo = normalizarTexto(nomeInformado)
  const normCand = normalizarTexto(candidatoNome)

  if (!normInfo || !normCand) {
    return { match: false, tipo: 'nenhum' }
  }

  // 2. Correspondência exata normalizada
  if (normInfo === normCand) {
    return { match: true, tipo: 'exato' }
  }

  // 3. Correspondência forte por inclusão mútua de palavras-chave principais
  // Evitar falsos positivos com produtos de sabores/tamanhos diferentes
  const wordsInfo = normInfo.split(' ').filter((w) => w.length > 2)
  const wordsCand = normCand.split(' ').filter((w) => w.length > 2)

  if (wordsInfo.length >= 2 && wordsCand.length >= 2) {
    const intersection = wordsInfo.filter((w) => wordsCand.includes(w))
    const ratioInfo = intersection.length / wordsInfo.length
    const ratioCand = intersection.length / wordsCand.length
    if (ratioInfo >= 0.85 && ratioCand >= 0.85) {
      return { match: true, tipo: 'parcial_forte' }
    }
  }

  return { match: false, tipo: 'nenhum' }
}

/**
 * Executa a auditoria de um produto solicitado cruzando histórico operacional
 */
export function auditarItemDevolucao(
  item: AuditoriaInputItem,
  contexto: AuditoriaContextoLojaIndustria,
): AuditoriaItemResultado {
  const dataSolIso = extrairDataIso(contexto.data_solicitacao)
  const nomeInformado = item.produto_nome_informado || ''
  const validadeInformada = item.validade_ausente ? '' : extrairDataIso(item.validade_informada)

  // 1. Identificação do produto no mix oficial ou histórico
  let produtoNomeOficial = item.produto_nome_oficial
  let produtoCodigoOficial = item.produto_codigo
  let correspondenciaSegura = false
  let precisaIdentificacao = item.precisa_identificacao ?? false

  // Tentar casar com Mix oficial se fornecido
  if (contexto.mixOficialProdutos && contexto.mixOficialProdutos.length > 0) {
    for (const mixProd of contexto.mixOficialProdutos) {
      const match = verificarCorrespondenciaProduto(
        nomeInformado,
        item.produto_codigo,
        mixProd.nome_produto,
        mixProd.codigo_produto,
      )
      if (match.match) {
        correspondenciaSegura = true
        produtoNomeOficial = mixProd.nome_produto
        produtoCodigoOficial = mixProd.codigo_produto || produtoCodigoOficial
        break
      }
    }
  }

  // 2. Filtrar histórico de validades desta loja e indústria
  // Separar estritamente registros ANTERIORES e POSTERIORES (Regra 8)
  const registrosAnteriores: AuditoriaHistoricoRegistro[] = []
  let registrosPosterioresIgnorados = 0
  let produtoEncontradoHistorico = false

  // Normalizar registros disponíveis
  for (const reg of contexto.historicoValidades) {
    const dataRegIso = extrairDataIso(reg.realizado)
    if (!dataRegIso) continue

    const matchProd = verificarCorrespondenciaProduto(
      nomeInformado,
      item.produto_codigo || produtoCodigoOficial,
      reg.produto,
      reg.cod_produto,
    )

    if (matchProd.match) {
      produtoEncontradoHistorico = true
      if (!produtoNomeOficial) {
        produtoNomeOficial = reg.produto
      }
      if (!produtoCodigoOficial && reg.cod_produto) {
        produtoCodigoOficial = reg.cod_produto
      }
      correspondenciaSegura = true

      // Regra 8: NUNCA utilizar informação posterior como se fosse evidência anterior
      if (dataSolIso && dataRegIso > dataSolIso) {
        registrosPosterioresIgnorados++
        continue
      }

      // Registro válido anterior ou na mesma data da solicitação
      const valIso = extrairDataIso(reg.validade_efetiva || reg.validade_original)
      registrosAnteriores.push({
        data: dataRegIso,
        quantidade: typeof reg.quantidade === 'number' ? reg.quantidade : 0,
        validade: valIso || 'Não informada',
        colaborador: reg.colaborador,
        status_operacional: reg.status_operacional,
      })
    }
  }

  // Ordenar registros anteriores por data cronológica (mais antigo -> mais recente)
  registrosAnteriores.sort((a, b) => a.data.localeCompare(b.data))

  // Se não encontrou correspondência no mix nem no histórico anterior/posterior
  if (!correspondenciaSegura && !produtoEncontradoHistorico) {
    precisaIdentificacao = true
  }

  // 3. Buscar Rupturas Relacionadas (Regra 9: Ruptura é contexto, não conclusão automática)
  const rupturasRelacionadas: AuditoriaRupturaContexto[] = []
  for (const rup of contexto.historicoRupturas) {
    const matchProd = verificarCorrespondenciaProduto(
      nomeInformado,
      item.produto_codigo || produtoCodigoOficial,
      rup.produto,
      undefined,
    )
    if (matchProd.match) {
      const dataRupIso = extrairDataIso(rup.data_visita)
      // Pode incluir rupturas próximas ou anteriores
      if (!dataSolIso || !dataRupIso || dataRupIso <= dataSolIso) {
        rupturasRelacionadas.push({
          data: dataRupIso || rup.data_visita || '',
          motivo: rup.motivo || 'Ruptura reportada',
          situacao: rup.situacao_atual || 'Ativo',
          observacao: rup.observacao,
        })
      }
    }
  }

  // 4. Analisar presença da mesma validade
  let mesmaValidadeEncontrada = false
  let quantidadeZeroRegistrada = false
  if (registrosAnteriores.length > 0) {
    for (const reg of registrosAnteriores) {
      // Regra 9: Quantidade 0 é uma atualização válida
      if (reg.quantidade === 0) {
        quantidadeZeroRegistrada = true
      }
      if (validadeInformada && reg.validade === validadeInformada) {
        mesmaValidadeEncontrada = true
      }
    }
  }

  // Última atualização antes da solicitação
  const ultimaAtualizacao =
    registrosAnteriores.length > 0 ? registrosAnteriores[registrosAnteriores.length - 1] : undefined

  // 5. Analisar ciclos / continuidade segundo o calendário operacional configurado da própria indústria
  // REMOÇÃO DA REGRA FIXA DE 20/21 DIAS (Ajuste 2):
  // Reutiliza a configuração de ciclos da indústria (industry_research_config) via cycleCalculator.
  // Se não houver ciclo configurado suficiente, NÃO inventar janela arbitrária.
  let periodosSemAtualizacao = false
  let diasSemAtualizacao = 0
  let ciclosSemAtualizacao = 0
  let cicloEsperadoDescricao: string | undefined = undefined
  let continuidadeNaoDeterminavel = false

  if (ultimaAtualizacao && dataSolIso) {
    diasSemAtualizacao = diferencaEmDias(ultimaAtualizacao.data, dataSolIso)
  }

  const cicloCfg = contexto.cicloPesquisaConfigurado
  if (cicloCfg && cicloCfg.frequencia && dataSolIso) {
    cicloEsperadoDescricao = `${cicloCfg.frequencia}${
      cicloCfg.dia_esperado ? ` (${cicloCfg.dia_esperado})` : ''
    }`

    // Gerar ciclos esperados até a data da solicitação
    const refDate = new Date(dataSolIso + 'T12:00:00Z')
    const expectedCycles = generateExpectedCycles(
      {
        tipo_pesquisa: 'validades',
        frequencia: cicloCfg.frequencia,
        dia_esperado: cicloCfg.dia_esperado || 'qualquer',
      },
      refDate,
      6,
    )

    if (ultimaAtualizacao) {
      const missed = calculateCyclesMissed(ultimaAtualizacao.data, expectedCycles)
      ciclosSemAtualizacao = missed.ciclosSemAtualizacao
      // Se perdeu 1 ou mais ciclos esperados da frequência configurada
      if (ciclosSemAtualizacao >= 1) {
        periodosSemAtualizacao = true
      }
    }
  } else {
    // Sem configuração operacional de ciclos para esta indústria:
    // NÃO inventar janela arbitrária. A continuidade não pode ser determinada pelo calendário operacional.
    continuidadeNaoDeterminavel = true
    periodosSemAtualizacao = false
  }

  // 6. Verificar se há histórico suficiente (Regra 12: NÃO confundir ausência de dado com falha)
  let dadosHistoricoInsuficientes = false
  let motivoInsuficiencia: string | undefined = undefined

  // Cenário de limitação de contexto/dados da indústria (Ajuste 1: contextoIndustriaSeguro === false)
  if (contexto.contextoIndustriaSeguro === false) {
    dadosHistoricoInsuficientes = true
    motivoInsuficiencia =
      contexto.motivoInsegurancaIndustria ||
      'Contexto de indústria ambíguo ou não identificado no Cadastro Operacional com segurança. Por integridade operacional, registros de outras indústrias não foram considerados.'
  }

  // Cenário 5: Validade não informada
  if (item.validade_ausente || !validadeInformada) {
    dadosHistoricoInsuficientes = true
    motivoInsuficiencia =
      'Validade não informada na solicitação — necessário solicitar a data de validade para cruzamento consistente.'
  }

  // Cenário 4: Base histórica da loja muito recente ou sem dados históricos para o período
  if (contexto.dataInicioBaseHistorica && dataSolIso) {
    const diasBase = diferencaEmDias(contexto.dataInicioBaseHistorica, dataSolIso)
    if (diasBase >= 0 && diasBase < 14 && registrosAnteriores.length === 0) {
      dadosHistoricoInsuficientes = true
      motivoInsuficiencia = `A base histórica disponível para esta loja foi iniciada recentemente em ${formatarDataBr(
        contexto.dataInicioBaseHistorica,
      )} (menos de 14 dias antes da solicitação). Não há histórico anterior suficiente para concluir divergência.`
    }
  }

  // Se a loja não tem nenhum registro de nenhuma validade anterior no contexto
  if (
    contexto.historicoValidades.length === 0 &&
    registrosAnteriores.length === 0 &&
    !dadosHistoricoInsuficientes
  ) {
    dadosHistoricoInsuficientes = true
    motivoInsuficiencia =
      'Não há registros operacionais anteriores cadastrados no sistema para esta loja/indústria até a data da solicitação.'
  }

  // 7. Determinar a Classificação Final (Regra 10: 4 classificações explicáveis)
  let classificacao: AuditoriaClassificacao
  let resumoExplicativo = ''

  if (dadosHistoricoInsuficientes) {
    classificacao = 'dados_insuficientes'
    resumoExplicativo =
      motivoInsuficiencia ||
      'A validade não foi informada ou não existem dados históricos suficientes no SKIP para concluir com segurança.'
  } else if (!produtoEncontradoHistorico || registrosAnteriores.length === 0) {
    // Cenário 3: Divergência real (há histórico para a loja, mas este produto nunca foi registrado)
    classificacao = 'divergencia'
    resumoExplicativo = `O produto solicitado não foi localizado no histórico anterior disponível para esta loja (${contexto.store_name}). Nunca houve registro prévio desta mercadoria pelo promotor antes da data da solicitação (${formatarDataBr(
      dataSolIso,
    )}).`
  } else if (periodosSemAtualizacao || !mesmaValidadeEncontrada) {
    // Cenário 2: Atenção
    classificacao = 'atencao'
    const motivosAtencao: string[] = []
    if (periodosSemAtualizacao) {
      motivosAtencao.push(
        `ciclo esperado da indústria sem atualização (configuração ${cicloEsperadoDescricao || 'operacional'}: ${ciclosSemAtualizacao} ciclo(s) sem registro antes da solicitação, última atualização em ${formatarDataBr(
          ultimaAtualizacao?.data,
        )})`,
      )
    }
    if (!mesmaValidadeEncontrada && validadeInformada) {
      motivosAtencao.push(
        `a validade solicitada (${formatarDataBr(
          validadeInformada,
        )}) não coincide exatamente com as validades registradas nos ciclos anteriores (última registrada: ${formatarDataBr(
          ultimaAtualizacao?.validade,
        )})`,
      )
    }
    resumoExplicativo = `O produto possui histórico na loja, porém com pontos de atenção: ${motivosAtencao.join(
      '; ',
    )}.`
  } else {
    // Cenário 1: Acompanhamento consistente
    classificacao = 'acompanhamento_consistente'
    resumoExplicativo = `O produto e a validade solicitada (${formatarDataBr(
      validadeInformada,
    )}) aparecem em registros anteriores com continuidade de acompanhamento. Foram localizados ${
      registrosAnteriores.length
    } registro(s) anterior(es); última atualização em ${formatarDataBr(
      ultimaAtualizacao?.data,
    )} com ${ultimaAtualizacao?.quantidade} un.`
  }

  // Se não havia ciclo configurado para determinar continuidade pelo calendário operacional, explicar com transparência
  if (
    continuidadeNaoDeterminavel &&
    !dadosHistoricoInsuficientes &&
    registrosAnteriores.length > 0
  ) {
    resumoExplicativo += ` (Nota de calendário: Não há ciclo de pesquisa configurado no Cadastro Operacional para a indústria ${contexto.industry_name}; a continuidade foi avaliada com base no histórico existente, sem aplicar janelas temporais arbitrárias).`
  }

  // Contexto adicional de Ruptura (Regra 9)
  if (rupturasRelacionadas.length > 0) {
    resumoExplicativo += ` Contexto operacional: foram identificadas ${
      rupturasRelacionadas.length
    } ruptura(s) registrada(s) para este item na loja (${rupturasRelacionadas
      .map((r) => `${r.motivo} em ${formatarDataBr(r.data)}`)
      .join(', ')}).`
  }

  // Transparência sobre registros posteriores ignorados (Regra 8)
  if (registrosPosterioresIgnorados > 0) {
    resumoExplicativo += ` (Nota de auditoria: ${registrosPosterioresIgnorados} registro(s) com data posterior à solicitação foram desconsiderados da análise prévia).`
  }

  const detalhes: AuditoriaItemDetalhes = {
    produtoLocalizado: produtoEncontradoHistorico,
    correspondenciaSegura,
    termoBuscado: nomeInformado,
    produtoIdentificadoNome: produtoNomeOficial,
    produtoIdentificadoCodigo: produtoCodigoOficial,
    registrosAnteriores,
    totalRegistrosAnteriores: registrosAnteriores.length,
    ultimaAtualizacaoAnterior: ultimaAtualizacao,
    mesmaValidadeEncontrada,
    quantidadeZeroRegistrada,
    periodosSemAtualizacao,
    diasSemAtualizacao,
    ciclosSemAtualizacao,
    cicloEsperadoDescricao,
    continuidadeNaoDeterminavel,
    rupturasRelacionadas,
    dadosHistoricoInsuficientes,
    motivoInsuficiencia,
    dataInicioBaseHistorica: contexto.dataInicioBaseHistorica,
    dataSolicitacaoAuditorada: dataSolIso,
    registrosPosterioresIgnorados,
    resumoExplicativo,
  }

  return {
    classificacao,
    explicacao: resumoExplicativo,
    detalhes,
    precisaIdentificacao,
    produtoNomeOficial,
    produtoCodigoOficial,
  }
}

/**
 * Calcula o resumo consolidado da auditoria de todos os itens de um Caso de Devolução
 */
export function consolidarAuditoriaCaso(itensAuditados: AuditoriaItemResultado[]): {
  resultadoGeral: AuditoriaClassificacao
  resumoJson: {
    itens_consistentes: number
    itens_atencao: number
    itens_divergencia: number
    itens_insuficientes: number
    data_auditoria: string
  }
} {
  let itensConsistentes = 0
  let itensAtencao = 0
  let itensDivergencia = 0
  let itensInsuficientes = 0

  for (const it of itensAuditados) {
    if (it.classificacao === 'acompanhamento_consistente') itensConsistentes++
    else if (it.classificacao === 'atencao') itensAtencao++
    else if (it.classificacao === 'divergencia') itensDivergencia++
    else if (it.classificacao === 'dados_insuficientes') itensInsuficientes++
  }

  // Classificação geral prioritária (se tiver divergência -> destaque divergência; senão atenção; etc.)
  let resultadoGeral: AuditoriaClassificacao = 'acompanhamento_consistente'
  if (itensDivergencia > 0) {
    resultadoGeral = 'divergencia'
  } else if (itensAtencao > 0) {
    resultadoGeral = 'atencao'
  } else if (itensInsuficientes > 0) {
    resultadoGeral = 'dados_insuficientes'
  } else if (itensAuditados.length === 0) {
    resultadoGeral = 'dados_insuficientes'
  }

  return {
    resultadoGeral,
    resumoJson: {
      itens_consistentes: itensConsistentes,
      itens_atencao: itensAtencao,
      itens_divergencia: itensDivergencia,
      itens_insuficientes: itensInsuficientes,
      data_auditoria: new Date().toISOString(),
    },
  }
}
