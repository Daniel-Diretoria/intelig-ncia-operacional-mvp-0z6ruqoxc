/**
 * Leitor e Extrator de ZIP determinístico para exportações do WhatsApp
 * Módulo Devoluções / NF — SKIP Inteligência Operacional
 *
 * Funciona nativamente no browser e em Node.js (Vitest) sem dependências externas.
 * Suporta:
 *  - Método 0: STORE (sem compressão)
 *  - Método 8: DEFLATE (via DecompressionStream standard no browser ou zlib / pako fallback)
 *
 * Localiza arquivos de conversa WhatsApp dentro de arquivos .zip (ex: "_chat.txt", "chat.txt",
 * ou arquivos .md), priorizando formato .txt e selecionando apenas UMA fonte principal de conversa.
 */

export interface ArquivoExtraidoZip {
  nome: string
  caminhoCompleto: string
  dados: Uint8Array
  tamanho: number
}

export interface PacoteWhatsAppExtraido {
  arquivoConversaNome: string
  arquivoConversaConteudo: string
  formatoConversa: 'txt' | 'md'
  midias: Array<{
    nome: string
    caminho: string
    blob: Blob
    tamanho: number
  }>
  todosArquivos: string[]
}

/**
 * Descomprime dados com método DEFLATE (método 8 do ZIP)
 */
async function descompactarDeflate(dadosComprimidos: Uint8Array): Promise<Uint8Array> {
  // 1. Tentar DecompressionStream('deflate-raw') nativo do Web Streams API (Chrome, Firefox, Safari, Edge, Node 18+)
  if (typeof DecompressionStream !== 'undefined') {
    try {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(dadosComprimidos)
          controller.close()
        },
      }).pipeThrough(new DecompressionStream('deflate-raw'))

      const chunks: Uint8Array[] = []
      const reader = stream.getReader()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (value) chunks.push(value)
      }

      const totalLen = chunks.reduce((acc, c) => acc + c.length, 0)
      const out = new Uint8Array(totalLen)
      let offset = 0
      for (const chunk of chunks) {
        out.set(chunk, offset)
        offset += chunk.length
      }
      return out
    } catch {
      // continua para fallback dinâmico
    }
  }

  // 2. Fallback dinâmico em ambiente Node.js sem acoplamento estático de tipos
  try {
    const globalObj = globalThis as unknown as { process?: { versions?: { node?: string } } }
    if (globalObj.process?.versions?.node) {
      const zlibModuleName = 'node:zlib'
      const zlib = await import(/* @vite-ignore */ zlibModuleName)
      return new Promise<Uint8Array>((resolve, reject) => {
        zlib.inflateRaw(dadosComprimidos, (err: unknown, result: Uint8Array) => {
          if (err) reject(err)
          else resolve(new Uint8Array(result.buffer, result.byteOffset, result.byteLength))
        })
      })
    }
  } catch {
    // fallback
  }

  throw new Error('Ambiente sem suporte a descompressão DEFLATE.')
}

/**
 * Lê os arquivos contidos em um buffer de arquivo ZIP (especificação PKZIP)
 */
export async function extrairArquivosZip(
  buffer: ArrayBuffer | Uint8Array,
): Promise<ArquivoExtraidoZip[]> {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const len = bytes.length

  // 1. Localizar o End of Central Directory Record (EOCD): assinatura 0x06054b50
  // O EOCD pode ter até 65535 bytes de comentário no final
  let eocdOffset = -1
  const minEocdLen = 22
  const maxSearch = Math.min(len, 65535 + minEocdLen)
  for (let i = len - minEocdLen; i >= len - maxSearch; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i
      break
    }
  }

  if (eocdOffset === -1) {
    throw new Error('Arquivo ZIP inválido ou corrompido: registro EOCD não encontrado.')
  }

  const numEntries = view.getUint16(eocdOffset + 10, true)
  const centralDirOffset = view.getUint32(eocdOffset + 16, true)

  const arquivos: ArquivoExtraidoZip[] = []
  const textDecoderUtf8 = new TextDecoder('utf-8')
  const textDecoderCp437 = new TextDecoder('iso-8859-1')

  let cdPtr = centralDirOffset
  for (let e = 0; e < numEntries; e++) {
    if (cdPtr + 46 > len) break
    const sig = view.getUint32(cdPtr, true)
    if (sig !== 0x02014b50) break // Assinatura Central Directory

    const flags = view.getUint16(cdPtr + 8, true)
    const compressionMethod = view.getUint16(cdPtr + 10, true)
    const compressedSize = view.getUint32(cdPtr + 20, true)
    const uncompressedSize = view.getUint32(cdPtr + 24, true)
    const fileNameLen = view.getUint16(cdPtr + 28, true)
    const extraFieldLen = view.getUint16(cdPtr + 30, true)
    const fileCommentLen = view.getUint16(cdPtr + 32, true)
    const localHeaderOffset = view.getUint32(cdPtr + 42, true)

    const isUtf8 = (flags & 0x0800) !== 0
    const rawName = bytes.subarray(cdPtr + 46, cdPtr + 46 + fileNameLen)
    const fileName = isUtf8 ? textDecoderUtf8.decode(rawName) : textDecoderCp437.decode(rawName)

    cdPtr += 46 + fileNameLen + extraFieldLen + fileCommentLen

    // Ignorar diretórios
    if (fileName.endsWith('/') || fileName.endsWith('\\')) {
      continue
    }

    // Ler do cabeçalho local
    if (localHeaderOffset + 30 > len) continue
    const localSig = view.getUint32(localHeaderOffset, true)
    if (localSig !== 0x04034b50) continue

    const localFileNameLen = view.getUint16(localHeaderOffset + 26, true)
    const localExtraLen = view.getUint16(localHeaderOffset + 28, true)
    const dataOffset = localHeaderOffset + 30 + localFileNameLen + localExtraLen

    if (dataOffset + compressedSize > len) continue

    const rawData = bytes.subarray(dataOffset, dataOffset + compressedSize)
    let finalData: Uint8Array

    if (compressionMethod === 0) {
      // STORE
      finalData = rawData.slice()
    } else if (compressionMethod === 8) {
      // DEFLATE
      finalData = await descompactarDeflate(rawData)
    } else {
      // Método não suportado diretamente (pula ou ignora)
      continue
    }

    // Normalizar nome do arquivo (remover barras de pasta)
    const partes = fileName.replace(/\\/g, '/').split('/')
    const baseName = partes[partes.length - 1]

    arquivos.push({
      nome: baseName,
      caminhoCompleto: fileName,
      dados: finalData,
      tamanho: uncompressedSize,
    })
  }

  return arquivos
}

/**
 * Inspeciona o arquivo ZIP extraído e localiza a fonte de conversa e mídias
 * Regras:
 * - Localiza arquivo de conversa compatível (prioriza .txt, depois .md)
 * - Se existirem .txt e .md, seleciona UMA ÚNICA fonte principal segura (.txt)
 * - Coleta todas as mídias (imagens, vídeos, áudios) para associação
 */
export async function processarZipWhatsApp(
  buffer: ArrayBuffer | Uint8Array,
): Promise<PacoteWhatsAppExtraido> {
  const arquivos = await extrairArquivosZip(buffer)
  if (arquivos.length === 0) {
    throw new Error('O arquivo ZIP está vazio ou não contém arquivos legíveis.')
  }

  const todosNomes = arquivos.map((a) => a.caminhoCompleto)

  // Identificar candidatos a conversa WhatsApp:
  // WhatsApp exporta geralmente como "_chat.txt", "chat.txt" ou "Nome do Grupo.txt" ou às vezes ".md"
  const candidatosTxt: ArquivoExtraidoZip[] = []
  const candidatosMd: ArquivoExtraidoZip[] = []
  const midias: PacoteWhatsAppExtraido['midias'] = []

  const extensoesMidia = new Set([
    'jpg',
    'jpeg',
    'png',
    'webp',
    'gif',
    'mp4',
    'opus',
    'ogg',
    'mp3',
    'm4a',
    'pdf',
  ])

  for (const arq of arquivos) {
    const nomeNorm = arq.nome.toLowerCase()
    const ext = nomeNorm.split('.').pop() || ''

    // Se for arquivo de texto
    if (ext === 'txt') {
      candidatosTxt.push(arq)
    } else if (ext === 'md') {
      candidatosMd.push(arq)
    } else if (extensoesMidia.has(ext)) {
      // Detectar tipo MIME básico
      let mime = 'application/octet-stream'
      if (['jpg', 'jpeg'].includes(ext)) mime = 'image/jpeg'
      else if (ext === 'png') mime = 'image/png'
      else if (ext === 'webp') mime = 'image/webp'
      else if (ext === 'mp4') mime = 'video/mp4'
      else if (ext === 'pdf') mime = 'application/pdf'

      const blob = new Blob([arq.dados as unknown as BlobPart], { type: mime })
      midias.push({
        nome: arq.nome,
        caminho: arq.caminhoCompleto,
        blob,
        tamanho: arq.tamanho,
      })
    }
  }

  // Escolher UMA ÚNICA fonte principal segura:
  // Priorizar _chat.txt > chat.txt > qualquer .txt > _chat.md > chat.md > qualquer .md
  let arquivoEscolhido: ArquivoExtraidoZip | null = null
  let formato: 'txt' | 'md' = 'txt'

  const encontrarMelhor = (lista: ArquivoExtraidoZip[]): ArquivoExtraidoZip | null => {
    if (lista.length === 0) return null
    const prefChat = lista.find((a) => {
      const n = a.nome.toLowerCase()
      return n === '_chat.txt' || n === 'chat.txt' || n === '_chat.md' || n === 'chat.md'
    })
    if (prefChat) return prefChat

    // Se não tiver nome exato de chat, pega o maior arquivo de texto (pois conversas longas têm mais bytes que READMEs)
    const ordenados = [...lista].sort((a, b) => b.tamanho - a.tamanho)
    return ordenados[0]
  }

  if (candidatosTxt.length > 0) {
    arquivoEscolhido = encontrarMelhor(candidatosTxt)
    formato = 'txt'
  } else if (candidatosMd.length > 0) {
    arquivoEscolhido = encontrarMelhor(candidatosMd)
    formato = 'md'
  }

  if (!arquivoEscolhido) {
    throw new Error(
      'Nenhum arquivo de conversa (.txt ou .md) foi localizado dentro do arquivo ZIP exportado.',
    )
  }

  const decoder = new TextDecoder('utf-8')
  const conteudoTexto = decoder.decode(arquivoEscolhido.dados)

  return {
    arquivoConversaNome: arquivoEscolhido.nome,
    arquivoConversaConteudo: conteudoTexto,
    formatoConversa: formato,
    midias,
    todosArquivos: todosNomes,
  }
}
