import { describe, it, expect } from 'vitest'
import {
  mapearCasosParaDocumentos,
  filtrarDocumentos,
  construirArvoreArquivo,
} from '../devolucoesArquivoService'
import { DevolucaoCaso, DevolucaoEvidencia, DevolucaoItem } from '@/types/devolucoes'

describe('Arquivo Documental de Devoluções / NF — Regras de Organização e Filtros', () => {
  const casosMock: DevolucaoCaso[] = [
    {
      id: 'caso-1',
      codigo_caso: 'DEV-2026-0184',
      data_solicitacao: '2026-10-15',
      industry_name: "Massas D'Itália",
      store_code: '115',
      store_name: 'Supermercado Central',
      promotor_nome: 'João Silva',
      status: 'concluido',
      nf_numero: 'NF-98765',
      nf_anexo_nome: 'danfe_98765.pdf',
      nf_assinada_anexo_nome: 'canhoto_assinado_98765.jpg',
      evidencia_descarte_anexo_nome: 'foto_descarte_lote.jpg',
      total_itens: 1,
      total_unidades_solicitadas: 10,
    },
    {
      id: 'caso-2',
      codigo_caso: 'DEV-2026-0185',
      data_solicitacao: '2026-10-20',
      industry_name: 'Frutap',
      store_code: '115',
      store_name: 'Supermercado Central',
      promotor_nome: 'Maria Santos',
      status: 'aguardando_nf_descarte',
      nf_numero: 'NF-11223',
      nf_anexo_nome: 'danfe_11223.pdf',
      // Sem NF assinada e sem descarte
      total_itens: 2,
      total_unidades_solicitadas: 15,
    },
    {
      id: 'caso-3',
      codigo_caso: 'DEV-2026-0090',
      data_solicitacao: '2026-09-05',
      industry_name: 'Frutap',
      store_code: '405',
      store_name: 'Hipermercado Sul',
      promotor_nome: 'Carlos Souza',
      status: 'concluido',
      nf_numero: 'NF-55443',
      nf_anexo_nome: 'danfe_55443.pdf',
      nf_assinada_anexo_nome: 'canhoto_55443.pdf',
      evidencia_descarte_anexo_nome: 'descarte_55443.jpg',
      total_itens: 1,
      total_unidades_solicitadas: 8,
    },
  ]

  const evidenciasMock: DevolucaoEvidencia[] = [
    {
      id: 'ev-1',
      caso_id: 'caso-1',
      tipo: 'foto_produto',
      titulo: 'foto_ravioli_validade.jpg',
      url_arquivo: 'https://cdn.exemplo.com/foto1.jpg',
    },
  ]

  const itensMock: DevolucaoItem[] = [
    {
      id: 'item-1',
      caso_id: 'caso-1',
      codigo_caso: 'DEV-2026-0184',
      produto_nome_informado: 'Ravioli Queijo',
      produto_nome_oficial: 'Ravioli de Queijo 500g',
      quantidade_solicitada: 10,
    },
  ]

  it('1. Deve mapear anexos e evidências do caso para documentos sem duplicar fisicamente', () => {
    const docs = mapearCasosParaDocumentos(casosMock, evidenciasMock, itensMock)
    expect(docs.length).toBeGreaterThan(0)

    const docCaso1 = docs.filter((d) => d.caso_id === 'caso-1')
    // Deve conter foto do produto, NF, NF assinada e descarte
    expect(docCaso1.some((d) => d.tipo === 'foto_produto')).toBe(true)
    expect(docCaso1.some((d) => d.tipo === 'nf_documento')).toBe(true)
    expect(docCaso1.some((d) => d.tipo === 'nf_assinada')).toBe(true)
    expect(docCaso1.some((d) => d.tipo === 'comprovante_descarte')).toBe(true)
  })

  it('2. Deve construir árvore automática de Ano -> Mês -> Loja -> Caso', () => {
    const docs = mapearCasosParaDocumentos(casosMock, evidenciasMock, itensMock)
    const arvore = construirArvoreArquivo(docs, casosMock)

    expect(arvore.length).toBe(1)
    expect(arvore[0].titulo).toBe('Ano 2026')

    // Filhos do ano são meses (Outubro e Setembro)
    const nosMeses = arvore[0].filhos!
    expect(nosMeses.length).toBe(2)
    expect(nosMeses.some((m) => m.titulo.includes('Outubro'))).toBe(true)
    expect(nosMeses.some((m) => m.titulo.includes('Setembro'))).toBe(true)

    // Filhos do mês são lojas
    const mesOutubro = nosMeses.find((m) => m.titulo.includes('Outubro'))!
    const nosLojas = mesOutubro.filhos!
    expect(nosLojas.length).toBe(1) // Loja 115
    expect(nosLojas[0].titulo).toContain('115')

    // Filhos da loja são os casos
    const nosCasos = nosLojas[0].filhos!
    expect(nosCasos.length).toBe(2) // Caso 1 e Caso 2
  })

  it('3. Deve identificar corretamente a completude documental de cada caso', () => {
    const docs = mapearCasosParaDocumentos(casosMock, evidenciasMock, itensMock)
    const arvore = construirArvoreArquivo(docs, casosMock)

    const mesOutubro = arvore[0].filhos!.find((m) => m.titulo.includes('Outubro'))!
    const loja115 = mesOutubro.filhos![0]
    const caso1No = loja115.filhos!.find((c) => c.metadadosCaso?.codigo_caso === 'DEV-2026-0184')!
    const caso2No = loja115.filhos!.find((c) => c.metadadosCaso?.codigo_caso === 'DEV-2026-0185')!

    // Caso 1: tem NF, NF assinada e descarte -> Completo = true
    expect(caso1No.metadadosCaso?.completo).toBe(true)
    expect(caso1No.metadadosCaso?.nf_assinada).toBe(true)
    expect(caso1No.metadadosCaso?.descarte_recebido).toBe(true)

    // Caso 2: tem NF, mas NÃO tem NF assinada nem descarte -> Completo = false
    expect(caso2No.metadadosCaso?.completo).toBe(false)
    expect(caso2No.metadadosCaso?.nf_assinada).toBe(false)
    expect(caso2No.metadadosCaso?.descarte_recebido).toBe(false)
  })

  it('4. Filtro por Indústria: responder "Todas as NFs da Frutap de setembro"', () => {
    const docs = mapearCasosParaDocumentos(casosMock, evidenciasMock, itensMock)
    const filtrados = filtrarDocumentos(docs, {
      industria: 'Frutap',
      mes: 9, // Setembro
    })

    expect(filtrados.length).toBeGreaterThan(0)
    expect(filtrados.every((d) => d.industria_nome === 'Frutap' && d.mes === 9)).toBe(true)
  })

  it('5. Filtro por número de NF: localizar documento por NF específica', () => {
    const docs = mapearCasosParaDocumentos(casosMock, evidenciasMock, itensMock)
    const filtrados = filtrarDocumentos(docs, {
      numeroNf: '98765',
    })

    expect(filtrados.length).toBeGreaterThan(0)
    expect(filtrados.every((d) => d.codigo_caso === 'DEV-2026-0184')).toBe(true)
  })

  it('6. Filtro de pendências: "Quais casos concluídos estão sem NF assinada?"', () => {
    const docs = mapearCasosParaDocumentos(casosMock, evidenciasMock, itensMock)
    const pendentesAssinatura = filtrarDocumentos(docs, {
      apenasSemNfAssinada: true,
    })

    // Deve incluir documentos do caso-2 que não tem NF assinada
    expect(pendentesAssinatura.some((d) => d.caso_id === 'caso-2')).toBe(true)
    // NÃO deve incluir o caso-1 que já tem NF assinada
    expect(pendentesAssinatura.some((d) => d.caso_id === 'caso-1')).toBe(false)
  })
})
