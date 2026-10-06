import { describe, it, expect, vi, beforeEach } from 'vitest'
import { verificarHashesConhecidos, persistirLoteWhatsApp } from '../devolucoesDedupService'
import {
  parseConversaWhatsApp,
  extrairMensagensArquivoWhatsApp,
  gerarHashMensagem,
} from '@/lib/import/whatsappParser'
import { calcularHashArquivo } from '@/lib/data/tradeProPipeline'
import pb from '@/lib/pocketbase/client'

describe('Serviço de Deduplicação Escalável — Devoluções / WhatsApp', () => {
  const conversaExemplo = `
[10/10/2026, 08:00:00] Promotor Carlos: Bom dia equipe
[10/10/2026, 08:01:00] Promotor Carlos: TROCA / SOLICITAÇÃO
Data: 10/10/2026
Repositor: Promotor Carlos
Loja: Supermercado Estrela 201
Indústria: Massas D'Itália
Produto: Talharim Ovos 500g
Quantidade: 10
Validade: 15/10/2026
Motivo: Vencimento iminente
[10/10/2026, 08:05:00] Supervisor Rodrigo: Anotado Carlos
`

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('1. HASH DE MENSAGEM: gera wmsg_xxx e persiste hashes reais no lote, nunca sol_wmsg_xxx', async () => {
    const parseRes = await parseConversaWhatsApp(conversaExemplo)
    expect(parseRes.totalMensagens).toBe(3)
    expect(parseRes.solicitacoes.length).toBe(1)

    // O id da solicitação é sol_wmsg_xxx
    expect(parseRes.solicitacoes[0].id).toMatch(/^sol_wmsg_/)

    // Mas os hashes reais de mensagem são wmsg_xxx
    for (const h of parseRes.todosHashesMensagens) {
      expect(h).toMatch(/^wmsg_/)
      expect(h.startsWith('sol_')).toBe(false)
    }

    // Mock do pb.collection
    let batchCreatedData: any = null
    const msgsCreated: any[] = []

    vi.spyOn(pb, 'collection').mockImplementation((collName: string) => {
      if (collName === 'devolucoes_import_batches') {
        return {
          create: vi.fn().mockImplementation(async (data: any) => {
            batchCreatedData = data
            return { id: 'batch_test_123', ...data }
          }),
        } as any
      }
      if (collName === 'devolucoes_mensagens_importadas') {
        return {
          create: vi.fn().mockImplementation(async (data: any) => {
            msgsCreated.push(data)
            return { id: `msg_${msgsCreated.length}`, ...data }
          }),
        } as any
      }
      return {} as any
    })

    const { batchId } = await persistirLoteWhatsApp({
      fileName: 'conversa_teste.txt',
      fileHash: 'sha256_mock_123',
      totalMensagens: parseRes.totalMensagens,
      mensagensConhecidas: parseRes.mensagensConhecidas,
      mensagensNovas: parseRes.mensagensNovas,
      solicitacoes: parseRes.solicitacoes,
      resumoProcessamento: parseRes.resumo,
      hashesReaisMensagens: parseRes.todosHashesMensagens,
    })

    expect(batchId).toBe('batch_test_123')
    expect(batchCreatedData).toBeDefined()

    // O campo hashes_mensagens_json deve conter hashes reais wmsg_xxx, NUNCA sol_
    expect(Array.isArray(batchCreatedData.hashes_mensagens_json)).toBe(true)
    for (const h of batchCreatedData.hashes_mensagens_json) {
      expect(h).toMatch(/^wmsg_/)
      expect(h.startsWith('sol_')).toBe(false)
    }

    // Mensagens persistidas individualmente em devolucoes_mensagens_importadas
    expect(msgsCreated.length).toBe(3)
    for (const m of msgsCreated) {
      expect(m.hash_mensagem).toMatch(/^wmsg_/)
      expect(m.batch_id).toBe('batch_test_123')
      expect(m.file_hash).toBe('sha256_mock_123')
    }
  })

  it('2. DEDUPLICAÇÃO PERSISTENTE E ESCALÁVEL: identifica mensagens antigas sem depender de janela de 50 lotes', async () => {
    const msgs = extrairMensagensArquivoWhatsApp(conversaExemplo)
    const hashesDoArquivo = msgs.map((m) => m.hashDeterminista)

    // Simula resposta do endpoint de verificação backend
    vi.spyOn(pb, 'send').mockResolvedValueOnce({
      hashesConhecidos: [hashesDoArquivo[0], hashesDoArquivo[1]],
      totalVerificados: 3,
    })

    const conhecidos = await verificarHashesConhecidos(hashesDoArquivo)
    expect(conhecidos.size).toBe(2)
    expect(conhecidos.has(hashesDoArquivo[0])).toBe(true)
    expect(conhecidos.has(hashesDoArquivo[1])).toBe(true)
    expect(conhecidos.has(hashesDoArquivo[2])).toBe(false)

    // Ao reimportar com os hashes conhecidos e mapa indicando que a solicitação já foi processada
    const mapaConhecidas = new Map<string, any>()
    mapaConhecidas.set(`sol_${hashesDoArquivo[1]}`, {
      solicitacaoId: `sol_${hashesDoArquivo[1]}`,
      rawMensagemId: hashesDoArquivo[1],
      estadoOperacional: 'processada',
    })
    const parseReimport = await parseConversaWhatsApp(
      conversaExemplo,
      conhecidos,
      [],
      [],
      mapaConhecidas,
    )
    expect(parseReimport.mensagensConhecidas).toBe(2)
    expect(parseReimport.mensagensNovas).toBe(1)
    // A mensagem de solicitação (índice 1) já era conhecida e processada, logo 0 solicitações sugeridas
    expect(parseReimport.solicitacoes.length).toBe(0)
  })

  it('3. FALLBACK SDK: quando o endpoint customizado não responde, busca indexado em devolucoes_mensagens_importadas', async () => {
    const msgs = extrairMensagensArquivoWhatsApp(conversaExemplo)
    const hashesDoArquivo = msgs.map((m) => m.hashDeterminista)

    // Falha intencional do endpoint /backend/v1/devolucoes/verificar-hashes
    vi.spyOn(pb, 'send').mockRejectedValueOnce(new Error('Endpoint não disponível'))

    // Mock do pb.collection('devolucoes_mensagens_importadas')
    vi.spyOn(pb, 'collection').mockImplementation((collName: string) => {
      if (collName === 'devolucoes_mensagens_importadas') {
        return {
          getList: vi.fn().mockResolvedValue({
            items: [{ hash_mensagem: hashesDoArquivo[1] }],
            totalItems: 1,
          }),
        } as any
      }
      return {} as any
    })

    const conhecidos = await verificarHashesConhecidos(hashesDoArquivo)
    expect(conhecidos.has(hashesDoArquivo[1])).toBe(true)
    expect(conhecidos.size).toBe(1)
  })

  it('4. FILE_HASH DETERMINÍSTICO: mesmo conteúdo gera exatamente o mesmo hash; conteúdos diferentes geram hashes distintos', async () => {
    const conteudo1 = 'Linha 1 da conversa WhatsApp\nLinha 2 troca solicitada'
    const conteudo2 = 'Linha 1 da conversa WhatsApp\nLinha 2 troca solicitada'
    const conteudo3 = 'Linha 1 da conversa WhatsApp\nLinha 2 outra troca solicitada'

    const buffer1 = new TextEncoder().encode(conteudo1).buffer
    const buffer2 = new TextEncoder().encode(conteudo2).buffer
    const buffer3 = new TextEncoder().encode(conteudo3).buffer

    const hash1 = await calcularHashArquivo(buffer1, 'export1.txt', buffer1.byteLength)
    const hash2 = await calcularHashArquivo(buffer2, 'export2.txt', buffer2.byteLength)
    const hash3 = await calcularHashArquivo(buffer3, 'export3.txt', buffer3.byteLength)

    // Mesmo conteúdo -> mesmo hash determinístico SHA-256
    expect(hash1).toBe(hash2)
    expect(hash1.length).toBe(64) // SHA-256 hex string

    // Conteúdo diferente -> hash diferente
    expect(hash1).not.toBe(hash3)
  })

  it('5. FLUXO INTEGRADO: importar conversa -> persistir -> reimportar mesma conversa -> todas conhecidas e 0 duplicadas', async () => {
    // 1ª importação
    const msgs1 = extrairMensagensArquivoWhatsApp(conversaExemplo)
    const hashes1 = msgs1.map((m) => m.hashDeterminista)

    // Nenhuma mensagem conhecida inicialmente
    const conhecidosInicial = new Set<string>()
    const res1 = await parseConversaWhatsApp(conversaExemplo, conhecidosInicial)
    expect(res1.mensagensNovas).toBe(3)
    expect(res1.mensagensConhecidas).toBe(0)
    expect(res1.solicitacoes.length).toBe(1)

    // Base simulada de devolucoes_mensagens_importadas
    const bancoMensagensPersistidas = new Map<string, any>()

    vi.spyOn(pb, 'collection').mockImplementation((collName: string) => {
      if (collName === 'devolucoes_import_batches') {
        return {
          create: vi.fn().mockImplementation(async (data: any) => ({
            id: 'batch_simulado_001',
            ...data,
          })),
        } as any
      }
      if (collName === 'devolucoes_mensagens_importadas') {
        return {
          create: vi.fn().mockImplementation(async (data: any) => {
            bancoMensagensPersistidas.set(data.hash_mensagem, data)
            return { id: `id_${data.hash_mensagem}`, ...data }
          }),
          getList: vi.fn().mockImplementation(async () => {
            const items = Array.from(bancoMensagensPersistidas.values())
            return { items, totalItems: items.length }
          }),
        } as any
      }
      return {} as any
    })

    const fileHash = await calcularHashArquivo(
      new TextEncoder().encode(conversaExemplo).buffer,
      'whatsapp.txt',
    )

    // Persistir lote e mensagens
    await persistirLoteWhatsApp({
      fileName: 'whatsapp.txt',
      fileHash,
      totalMensagens: res1.totalMensagens,
      mensagensConhecidas: res1.mensagensConhecidas,
      mensagensNovas: res1.mensagensNovas,
      solicitacoes: res1.solicitacoes,
      resumoProcessamento: res1.resumo,
      hashesReaisMensagens: res1.todosHashesMensagens,
    })

    // Todas as 3 mensagens devem estar no banco com chave wmsg_
    expect(bancoMensagensPersistidas.size).toBe(3)
    for (const h of hashes1) {
      expect(bancoMensagensPersistidas.has(h)).toBe(true)
    }

    // 2ª importação da MESMA conversa
    vi.spyOn(pb, 'send').mockResolvedValueOnce({
      hashesConhecidos: Array.from(bancoMensagensPersistidas.keys()),
      totalVerificados: 3,
    })

    const conhecidosSegundaVez = await verificarHashesConhecidos(hashes1)
    expect(conhecidosSegundaVez.size).toBe(3)

    // Estado conhecido persistido: solicitação já foi salva e processada (ou pendente)
    const mapaConhecidas = new Map<string, any>()
    mapaConhecidas.set(res1.solicitacoes[0].id, {
      solicitacaoId: res1.solicitacoes[0].id,
      rawMensagemId: res1.solicitacoes[0].rawMensagemId,
      estadoOperacional: 'processada',
      casoCriadoId: 'caso_123',
    })

    const res2 = await parseConversaWhatsApp(
      conversaExemplo,
      conhecidosSegundaVez,
      [],
      [],
      mapaConhecidas,
    )

    // TODAS as mensagens anteriores devem aparecer como conhecidas
    expect(res2.mensagensConhecidas).toBe(3)
    expect(res2.mensagensNovas).toBe(0)
    // Solicitação já processada não é reexibida
    expect(res2.solicitacoes.length).toBe(0)
  })
})
