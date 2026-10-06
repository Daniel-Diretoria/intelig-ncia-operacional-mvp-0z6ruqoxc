/**
 * Serviço de Deduplicação Escalável e Persistente para Importações WhatsApp
 * Módulo Devoluções / NF — SKIP Inteligência Operacional
 *
 * Garante que mensagens já processadas permaneçam conhecidas sem depender de limites
 * de janela (ex: 50 lotes) e sem carregar indefinidamente todo o banco no frontend.
 *
 * Unicidade garantida por índice UNIQUE no banco (idx_dev_msg_hash em devolucoes_mensagens_importadas).
 * Respeita a regra de privacidade: metadados mínimos (hash, batch, data/hora, autor resumido, sol_id)
 * sem registrar conteúdo sensível desnecessariamente.
 */

import pb from '@/lib/pocketbase/client'
import {
  DevolucaoMensagemImportadaRegistro,
  DevolucoesImportBatchRegistro,
  SolicitacaoIdentificadaWhatsApp,
  SolicitacaoImportadaRegistro,
} from '@/types/devolucoes'

/**
 * Consulta de solicitações persistidas na Caixa de Importação.
 * Retorna mapa de id de solicitação / hash de mensagem para seu registro com estado operacional.
 */
/**
 * Consulta vínculos existentes entre solicitações (ou hashes de mensagens) e devolucoes_casos.
 * Permite que mensagens conhecidas legadas sem estado que já geraram caso no passado
 * sejam identificadas e tratadas como processadas (sem recriar casos).
 */
export async function carregarVinculosCasosExistentes(
  hashesDoArquivo?: string[],
): Promise<Map<string, { casoId: string; casoCodigo: string }>> {
  const mapa = new Map<string, { casoId: string; casoCodigo: string }>()
  if (!hashesDoArquivo || hashesDoArquivo.length === 0) {
    return mapa
  }

  // 1. Tentar consultar em devolucoes_solicitacoes_importadas registros com caso_criado_id
  try {
    const CHUNK_SIZE = 30
    for (let i = 0; i < hashesDoArquivo.length; i += CHUNK_SIZE) {
      const chunk = hashesDoArquivo.slice(i, i + CHUNK_SIZE)
      const cond = chunk
        .map(
          (h) =>
            `raw_mensagem_id = '${h.replace(/'/g, "\\'")}' || solicitacao_id = 'sol_${h.replace(/'/g, "\\'")}'`,
        )
        .join(' || ')
      const res = await pb
        .collection('devolucoes_solicitacoes_importadas')
        .getList<SolicitacaoImportadaRegistro>(1, chunk.length * 2, {
          filter: `(${cond}) && caso_criado_id != ''`,
        })
      for (const item of res.items) {
        if (item.caso_criado_id) {
          const entry = {
            casoId: item.caso_criado_id,
            casoCodigo: item.caso_criado_codigo || '',
          }
          mapa.set(item.solicitacao_id, entry)
          mapa.set(item.raw_mensagem_id, entry)
        }
      }
    }
  } catch (err) {
    console.warn('[devolucoesDedup] Falha ao consultar vínculos em devolucoes_solicitacoes_importadas:', err)
  }

  // 2. Consultar devolucoes_casos diretamente por observacoes com menção determinística
  try {
    const CHUNK_SIZE = 20
    for (let i = 0; i < hashesDoArquivo.length; i += CHUNK_SIZE) {
      const chunk = hashesDoArquivo.slice(i, i + CHUNK_SIZE)
      const filterCasos = chunk
        .map((h) => `observacoes ~ '${h.replace(/'/g, "\\'")}'`)
        .join(' || ')
      const resCasos = await pb
        .collection('devolucoes_casos')
        .getList(1, chunk.length * 2, {
          filter: filterCasos,
        })
      for (const c of resCasos.items) {
        const casoRecord = c as unknown as { id: string; codigo_caso: string; observacoes?: string }
        const obs = casoRecord.observacoes || ''
        for (const h of chunk) {
          if (obs.includes(h)) {
            const entry = { casoId: casoRecord.id, casoCodigo: casoRecord.codigo_caso }
            mapa.set(`sol_${h}`, entry)
            mapa.set(h, entry)
          }
        }
      }
    }
  } catch (err) {
    console.warn('[devolucoesDedup] Falha ao consultar vínculos em devolucoes_casos:', err)
  }

  return mapa
}

export async function carregarSolicitacoesPersistidas(
  hashesDoArquivo?: string[],
): Promise<Map<string, SolicitacaoImportadaRegistro>> {
  const mapa = new Map<string, SolicitacaoImportadaRegistro>()
  try {
    let filter = ''
    if (hashesDoArquivo && hashesDoArquivo.length > 0) {
      // Filtrar hashes específicos em chunks
      const CHUNK_SIZE = 40
      for (let i = 0; i < hashesDoArquivo.length; i += CHUNK_SIZE) {
        const chunk = hashesDoArquivo.slice(i, i + CHUNK_SIZE)
        const cond = chunk
          .map(
            (h) =>
              `raw_mensagem_id = '${h.replace(/'/g, "\\'")}' || solicitacao_id = 'sol_${h.replace(/'/g, "\\'")}'`,
          )
          .join(' || ')
        const res = await pb
          .collection('devolucoes_solicitacoes_importadas')
          .getList<SolicitacaoImportadaRegistro>(1, chunk.length * 2, {
            filter: cond,
          })
        for (const item of res.items) {
          mapa.set(item.solicitacao_id, item)
          mapa.set(item.raw_mensagem_id, item)
        }
      }
      return mapa
    }

    // Se nenhum hash foi especificado, traz as pendentes de revisão e ativas da fila
    const res = await pb
      .collection('devolucoes_solicitacoes_importadas')
      .getList<SolicitacaoImportadaRegistro>(1, 200, {
        sort: '-created',
      })
    for (const item of res.items) {
      mapa.set(item.solicitacao_id, item)
      mapa.set(item.raw_mensagem_id, item)
    }
  } catch (err) {
    console.warn('[devolucoesDedup] Falha ao carregar devolucoes_solicitacoes_importadas:', err)
  }
  return mapa
}

/**
 * Atualiza ou persiste uma lista de solicitações identificadas com seus estados operacionais.
 * REGRA FUNDAMENTAL: "Uma mensagem NÃO pode sair da fila apenas porque já foi importada."
 * Preserva histórico, quem ignorou, quem processou, e ajustes feitos pelo operador.
 */
export async function salvarOuAtualizarSolicitacoesPersistidas(
  solicitacoes: SolicitacaoIdentificadaWhatsApp[],
  batchId?: string,
): Promise<void> {
  const user = pb.authStore.model
  const userName = user?.name || user?.email || 'Operador'
  const agoraIso = new Date().toISOString()

  for (const sol of solicitacoes) {
    const rawMsgId = sol.rawMensagemId || sol.id.replace(/^sol_/, '')
    const estado =
      sol.estadoOperacional || (sol.statusRevisao === 'ignorada' ? 'ignorada' : 'pendente_revisao')

    const payload: Record<string, unknown> = {
      solicitacao_id: sol.id,
      raw_mensagem_id: rawMsgId,
      batch_id: batchId || sol.batchId || '',
      data_hora_msg: sol.dataHoraMsg || '',
      autor: sol.autor || '',
      loja_informada: sol.lojaInformada || '',
      loja_codigo: sol.lojaResolvida?.codigo || '',
      industria_informada: sol.industriaInformada || '',
      industria_id: sol.industriaResolvida?.id || '',
      estado_operacional: estado,
      caso_criado_id: sol.casoCriadoId || '',
      caso_criado_codigo: sol.casoCriadoCodigo || '',
      produtos_json: sol.produtos,
      evidencias_json: sol.evidenciasDisponiveis,
      foi_recuperada: Boolean(sol.foiRecuperada),
      trecho_original:
        (sol as unknown as { trechoOriginalWhatsapp?: string }).trechoOriginalWhatsapp || '',
    }

    if (estado === 'ignorada') {
      payload.ignorado_por = sol.ignoradoPor || userName
      payload.ignorado_em = sol.ignoradoEm || agoraIso
      payload.ignorado_motivo = sol.ignoradoMotivo || 'Ignorado pelo operador na revisão'
    } else if (estado === 'processada') {
      payload.processado_por = sol.processadoPor || userName
      payload.processado_em = sol.processadoEm || agoraIso
    }

    try {
      // Tentar localizar registro existente
      const existing = await pb
        .collection('devolucoes_solicitacoes_importadas')
        .getFirstListItem(`solicitacao_id = '${sol.id}'`)
      if (existing) {
        // Se já foi processada anteriormente e não estamos explicitamente forçando alteração, não sobrescreve
        if (existing.estado_operacional === 'processada' && estado !== 'processada') {
          continue
        }
        await pb.collection('devolucoes_solicitacoes_importadas').update(existing.id, payload)
        continue
      }
    } catch {
      // Se não encontrou, prossegue para criação
    }

    try {
      await pb.collection('devolucoes_solicitacoes_importadas').create(payload)
    } catch (err) {
      // Se falhar por concorrência de chave única, tenta update
      try {
        const existing = await pb
          .collection('devolucoes_solicitacoes_importadas')
          .getFirstListItem(`solicitacao_id = '${sol.id}'`)
        if (existing) {
          await pb.collection('devolucoes_solicitacoes_importadas').update(existing.id, payload)
        }
      } catch (e2) {
        console.warn('[devolucoesDedup] Erro ao persistir solicitacao importada:', e2)
      }
    }
  }
}

/**
 * Atualiza o estado de uma solicitação para ignorada com rastreabilidade
 */
export async function marcarSolicitacaoComoIgnorada(
  solicitacaoId: string,
  motivo?: string,
): Promise<void> {
  const user = pb.authStore.model
  const userName = user?.name || user?.email || 'Operador'
  const agora = new Date().toISOString()
  try {
    const existing = await pb
      .collection('devolucoes_solicitacoes_importadas')
      .getFirstListItem(`solicitacao_id = '${solicitacaoId}'`)
    if (existing) {
      await pb.collection('devolucoes_solicitacoes_importadas').update(existing.id, {
        estado_operacional: 'ignorada',
        ignorado_por: userName,
        ignorado_em: agora,
        ignorado_motivo: motivo || 'Decisão registrada pelo operador',
      })
    }
  } catch (err) {
    console.warn('[devolucoesDedup] Erro ao marcar solicitação como ignorada:', err)
  }
}

/**
 * Reabre uma solicitação ignorada de volta para pendente de revisão
 */
export async function reabrirSolicitacaoIgnorada(solicitacaoId: string): Promise<void> {
  try {
    const existing = await pb
      .collection('devolucoes_solicitacoes_importadas')
      .getFirstListItem(`solicitacao_id = '${solicitacaoId}'`)
    if (existing) {
      await pb.collection('devolucoes_solicitacoes_importadas').update(existing.id, {
        estado_operacional: 'pendente_revisao',
        ignorado_por: '',
        ignorado_em: '',
        ignorado_motivo: '',
      })
    }
  } catch (err) {
    console.warn('[devolucoesDedup] Erro ao reabrir solicitação ignorada:', err)
  }
}

/**
 * Marca solicitação como processada após a criação confirmada do Caso
 * REGRA 11: Vínculo estrito Solicitação -> Caso Criado
 * REGRA 12: Só marca processada SE a criação do caso tiver sido bem-sucedida!
 */
export async function marcarSolicitacaoProcessada(
  solicitacaoId: string,
  casoCriadoId: string,
  casoCriadoCodigo: string,
): Promise<void> {
  const user = pb.authStore.model
  const userName = user?.name || user?.email || 'Operador'
  const agora = new Date().toISOString()
  try {
    const existing = await pb
      .collection('devolucoes_solicitacoes_importadas')
      .getFirstListItem(`solicitacao_id = '${solicitacaoId}'`)
    if (existing) {
      await pb.collection('devolucoes_solicitacoes_importadas').update(existing.id, {
        estado_operacional: 'processada',
        caso_criado_id: casoCriadoId,
        caso_criado_codigo: casoCriadoCodigo,
        processado_por: userName,
        processado_em: agora,
      })
    }
  } catch (err) {
    console.warn('[devolucoesDedup] Erro ao marcar solicitacao como processada:', err)
  }
}

/**
 * Consulta de hashes conhecidos de forma escalável.
 * 1. Tenta endpoint customizado backend (/backend/v1/devolucoes/verificar-hashes).
 * 2. Em caso de fallback (ex: teste ou offline), faz consulta indexada por chunks
 *    filtrando exclusivamente pelos hashes do arquivo atual na coleção devolucoes_mensagens_importadas.
 * 3. Fallback adicional defensivo consulta devolucoes_import_batches se a coleção nova estiver inacessível.
 */
export async function verificarHashesConhecidos(hashesDoArquivo: string[]): Promise<Set<string>> {
  const conhecidos = new Set<string>()

  if (!hashesDoArquivo || hashesDoArquivo.length === 0) {
    return conhecidos
  }

  // Filtrar hashes únicos e limpos
  const hashesUnicos = Array.from(
    new Set(hashesDoArquivo.filter((h) => typeof h === 'string' && h.trim().length > 0)),
  )

  if (hashesUnicos.length === 0) {
    return conhecidos
  }

  // 1. Tentar via endpoint backend
  try {
    const res = await pb.send<{ hashesConhecidos?: string[] }>(
      '/backend/v1/devolucoes/verificar-hashes',
      {
        method: 'POST',
        body: { hashes: hashesUnicos },
      },
    )
    if (res && Array.isArray(res.hashesConhecidos)) {
      res.hashesConhecidos.forEach((h) => conhecidos.add(h))
      return conhecidos
    }
  } catch (err) {
    // Se o endpoint falhar (ex: em ambiente de teste mockado sem router), usa fallback SDK
    console.warn(
      '[devolucoesDedup] Falha no endpoint /backend/v1/devolucoes/verificar-hashes, usando fallback SDK:',
      err,
    )
  }

  // 2. Fallback indexado via SDK: consulta devolucoes_mensagens_importadas em chunks
  const CHUNK_SIZE = 50
  for (let i = 0; i < hashesUnicos.length; i += CHUNK_SIZE) {
    const chunk = hashesUnicos.slice(i, i + CHUNK_SIZE)
    const filterConditions = chunk
      .map((h) => `hash_mensagem = '${h.replace(/'/g, "\\'")}'`)
      .join(' || ')

    try {
      const records = await pb
        .collection('devolucoes_mensagens_importadas')
        .getList(1, chunk.length, {
          filter: filterConditions,
        })
      for (const item of records.items) {
        const raw = item as unknown as { hash_mensagem?: string }
        if (raw.hash_mensagem) {
          conhecidos.add(raw.hash_mensagem)
        }
      }
    } catch {
      // Se devolucoes_mensagens_importadas falhar, tenta fallback defensivo de lotes
      break
    }
  }

  // 3. Fallback defensivo: se não encontrou nada ou deu erro, inspeciona devolucoes_import_batches
  if (conhecidos.size === 0) {
    try {
      const batches = await pb.collection('devolucoes_import_batches').getList(1, 50, {
        sort: '-created',
      })
      for (const b of batches.items) {
        const item = b as unknown as { hashes_mensagens_json?: string[] }
        if (Array.isArray(item.hashes_mensagens_json)) {
          for (const rawHash of item.hashes_mensagens_json) {
            // Normaliza se veio com prefixo antigo 'sol_'
            const cleanHash = rawHash.startsWith('sol_wmsg_')
              ? rawHash.replace(/^sol_/, '')
              : rawHash
            if (hashesUnicos.includes(cleanHash)) {
              conhecidos.add(cleanHash)
            }
          }
        }
      }
    } catch (err) {
      console.warn('[devolucoesDedup] Fallback de lotes também falhou:', err)
    }
  }

  return conhecidos
}

export interface PersistirLoteWhatsAppInput {
  fileName: string
  fileHash: string
  totalMensagens: number
  mensagensConhecidas: number
  mensagensNovas: number
  solicitacoes: SolicitacaoIdentificadaWhatsApp[]
  resumoProcessamento: Record<string, unknown>
  usuarioNome?: string
  /**
   * Todos os hashes reais de mensagem gerados pelo parser (wmsg_xxx)
   */
  hashesReaisMensagens: string[]
}

/**
 * Persiste o lote de importação em devolucoes_import_batches E registra cada hash individual
 * na coleção devolucoes_mensagens_importadas com garantia de unicidade (idx_dev_msg_hash).
 */
export async function persistirLoteWhatsApp(
  input: PersistirLoteWhatsAppInput,
): Promise<{ batchId: string }> {
  const user = pb.authStore.model
  const userName = input.usuarioNome || user?.name || user?.email || 'Operador'

  // Garante que só salvamos hashes reais de mensagens (formato wmsg_xxx), nunca IDs de solicitação
  const hashesLimpos = Array.from(
    new Set(
      input.hashesReaisMensagens
        .filter((h) => typeof h === 'string' && h.startsWith('wmsg_'))
        .map((h) => h.trim()),
    ),
  )

  // 1. Criar registro do lote em devolucoes_import_batches
  const batchRecord = await pb.collection('devolucoes_import_batches').create({
    file_name: input.fileName,
    file_hash: input.fileHash,
    origem_canal: 'whatsapp',
    total_mensagens: input.totalMensagens,
    mensagens_conhecidas: input.mensagensConhecidas,
    mensagens_novas: input.mensagensNovas,
    solicitacoes_identificadas: input.solicitacoes.length,
    solicitacoes_revisadas: input.solicitacoes.filter((s) => s.statusRevisao === 'confirmada')
      .length,
    solicitacoes_importadas: 0,
    solicitacoes_ignoradas: input.solicitacoes.filter((s) => s.statusRevisao === 'ignorada').length,
    solicitacoes_incompletas: Number(input.resumoProcessamento?.incompletas || 0),
    usuario_nome: userName,
    resumo_processamento_json: input.resumoProcessamento,
    hashes_mensagens_json: hashesLimpos,
  })

  const batchId = batchRecord.id

  // 1.1 Persistir ou atualizar estado operacional das solicitações identificadas
  // Garante que solicitações pendentes não sejam perdidas mesmo fechando ou recarregando
  try {
    await salvarOuAtualizarSolicitacoesPersistidas(input.solicitacoes, batchId)
  } catch (err) {
    console.warn('[devolucoesDedup] Aviso ao persistir estado de solicitações:', err)
  }

  // Mapa de hash -> solicitacao_id para associar metadados mínimos
  const hashToSolMap = new Map<string, { solId: string; autor?: string; dataHora?: string }>()
  for (const sol of input.solicitacoes) {
    if (sol.rawMensagemId) {
      hashToSolMap.set(sol.rawMensagemId, {
        solId: sol.id,
        autor: sol.autor,
        dataHora: sol.dataHoraMsg,
      })
    }
  }

  // 2. Persistir cada hash de mensagem individual em devolucoes_mensagens_importadas
  // Preserva privacidade: sem conteúdo de mensagem, apenas hash + contexto mínimo
  for (const hash of hashesLimpos) {
    const meta = hashToSolMap.get(hash)
    try {
      await pb.collection('devolucoes_mensagens_importadas').create({
        hash_mensagem: hash,
        batch_id: batchId,
        file_hash: input.fileHash,
        origem_canal: 'whatsapp',
        data_hora_msg: meta?.dataHora || '',
        autor: meta?.autor || '',
        solicitacao_id: meta?.solId || '',
      })
    } catch {
      // Se já existir no banco (unicidade violada por reimportação concorrente), ignorar sem quebrar
    }
  }

  return { batchId }
}
