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
} from '@/types/devolucoes'

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
    solicitacoes_revisadas: 0,
    solicitacoes_importadas: 0,
    solicitacoes_ignoradas: 0,
    solicitacoes_incompletas: Number(input.resumoProcessamento?.incompletas || 0),
    usuario_nome: userName,
    resumo_processamento_json: input.resumoProcessamento,
    hashes_mensagens_json: hashesLimpos,
  })

  const batchId = batchRecord.id

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
