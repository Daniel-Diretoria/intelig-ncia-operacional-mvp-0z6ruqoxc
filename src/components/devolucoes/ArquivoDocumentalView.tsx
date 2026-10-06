import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DocumentoArquivoDevolucao,
  ArvoreArquivoNo,
  DevolucaoCaso,
  EvidenciaTipo,
} from '@/types/devolucoes'
import {
  carregarArquivoDocumental,
  filtrarDocumentos,
  construirArvoreArquivo,
  ArquivoFiltros,
  ROTULOS_TIPO_DOCUMENTO,
} from '@/services/devolucoesArquivoService'
import {
  Folder,
  FolderOpen,
  FileText,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  Search,
  Filter,
  Download,
  Calendar,
  Building2,
  Store,
  FileCheck,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  Layers,
  FileQuestion,
} from 'lucide-react'

interface ArquivoDocumentalViewProps {
  onAbrirCasoDetalhe: (casoId: string) => void
}

export const ArquivoDocumentalView: React.FC<ArquivoDocumentalViewProps> = ({
  onAbrirCasoDetalhe,
}) => {
  const [todosDocumentos, setTodosDocumentos] = useState<DocumentoArquivoDevolucao[]>([])
  const [casos, setCasos] = useState<DevolucaoCaso[]>([])
  const [anosDisponiveis, setAnosDisponiveis] = useState<number[]>([])
  const [industriasDisponiveis, setIndustriasDisponiveis] = useState<string[]>([])
  const [lojasDisponiveis, setLojasDisponiveis] = useState<Array<{ codigo: string; nome: string }>>(
    [],
  )
  const [isLoading, setIsLoading] = useState(false)

  // Filtros
  const [filtros, setFiltros] = useState<ArquivoFiltros>({
    ano: 'todos',
    mes: 'todos',
    industria: 'todas',
    loja: 'todas',
    tipoDocumento: 'todos',
    statusCaso: 'todos',
    buscaTexto: '',
    apenasSemNfAssinada: false,
    apenasSemDescarte: false,
    apenasIncompletos: false,
  })

  // Nós expandidos na árvore
  const [nosExpandidos, setNosExpandidos] = useState<Set<string>>(new Set())

  // Carregar dados
  const carregarDados = async () => {
    setIsLoading(true)
    try {
      const res = await carregarArquivoDocumental()
      setTodosDocumentos(res.todosDocumentos)
      setCasos(res.casos)
      setAnosDisponiveis(res.anosDisponiveis)
      setIndustriasDisponiveis(res.industriasDisponiveis)
      setLojasDisponiveis(res.lojasDisponiveis)

      // Autoexpandir primeiro ano se houver
      if (res.anosDisponiveis.length > 0) {
        setNosExpandidos(new Set([`ano_${res.anosDisponiveis[0]}`]))
      }
    } catch (err) {
      console.warn('Erro ao carregar arquivo:', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    carregarDados()
  }, [])

  // Documentos filtrados
  const documentosFiltrados = filtrarDocumentos(todosDocumentos, filtros)

  // Árvore gerada a partir dos filtrados
  const arvore = construirArvoreArquivo(documentosFiltrados, casos)

  const toggleNo = (chave: string) => {
    setNosExpandidos((prev) => {
      const proximo = new Set(prev)
      if (proximo.has(chave)) {
        proximo.delete(chave)
      } else {
        proximo.add(chave)
      }
      return proximo
    })
  }

  // Estatísticas Rápidas de Completude Documental
  const totalCasosUnicos = new Set(documentosFiltrados.map((d) => d.caso_id)).size
  const casosSemNfAssinada = new Set(
    documentosFiltrados.filter((d) => !d.nf_assinada).map((d) => d.caso_id),
  ).size
  const casosSemDescarte = new Set(
    documentosFiltrados.filter((d) => !d.descarte_realizado).map((d) => d.caso_id),
  ).size
  const totalNfsRegistradas = documentosFiltrados.filter((d) => Boolean(d.nf_numero)).length

  return (
    <div className="space-y-4">
      {/* Cards de Resumo & Completude Documental */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-3 bg-white border border-slate-200">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Documentos Armazenados
          </span>
          <div className="flex items-center justify-between mt-1">
            <span className="text-xl font-bold text-slate-900">{documentosFiltrados.length}</span>
            <FileText className="w-5 h-5 text-indigo-600" />
          </div>
          <span className="text-[10px] text-slate-400">
            Em {totalCasosUnicos} casos operacionais
          </span>
        </Card>

        <Card className="p-3 bg-white border border-slate-200">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            NFs Documentadas
          </span>
          <div className="flex items-center justify-between mt-1">
            <span className="text-xl font-bold text-slate-900">{totalNfsRegistradas}</span>
            <FileCheck className="w-5 h-5 text-emerald-600" />
          </div>
          <span className="text-[10px] text-slate-400">Com número ou anexo de NF</span>
        </Card>

        <Card
          className={`p-3 bg-white border ${
            casosSemNfAssinada > 0 ? 'border-amber-300' : 'border-slate-200'
          }`}
        >
          <span className="text-[11px] font-semibold text-amber-800 uppercase tracking-wider block">
            Pendentes: NF Assinada
          </span>
          <div className="flex items-center justify-between mt-1">
            <span className="text-xl font-bold text-amber-700">{casosSemNfAssinada}</span>
            <AlertCircle className="w-5 h-5 text-amber-600" />
          </div>
          <span className="text-[10px] text-amber-700 font-medium">
            Aguardando canhoto assinado
          </span>
        </Card>

        <Card
          className={`p-3 bg-white border ${
            casosSemDescarte > 0 ? 'border-rose-300' : 'border-slate-200'
          }`}
        >
          <span className="text-[11px] font-semibold text-rose-800 uppercase tracking-wider block">
            Pendentes: Descarte
          </span>
          <div className="flex items-center justify-between mt-1">
            <span className="text-xl font-bold text-rose-700">{casosSemDescarte}</span>
            <FileQuestion className="w-5 h-5 text-rose-600" />
          </div>
          <span className="text-[10px] text-rose-700 font-medium">
            Aguardando evidência de descarte
          </span>
        </Card>
      </div>

      {/* Barra de Filtros Documentais */}
      <Card className="p-3.5 bg-white border border-slate-200">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2 text-xs">
          {/* Busca textual por NF, Caso, Loja ou Anexo */}
          <div className="md:col-span-2 relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            <Input
              type="text"
              placeholder="Buscar por NF, Caso (DEV-...), Loja ou nome do arquivo..."
              value={filtros.buscaTexto || ''}
              onChange={(e) => setFiltros((prev) => ({ ...prev, buscaTexto: e.target.value }))}
              className="pl-8 text-xs h-8"
            />
          </div>

          {/* Ano */}
          <Select
            value={filtros.ano === 'todos' ? 'todos' : String(filtros.ano)}
            onValueChange={(val) =>
              setFiltros((prev) => ({
                ...prev,
                ano: val === 'todos' ? 'todos' : parseInt(val, 10),
              }))
            }
          >
            <SelectTrigger className="h-8 text-xs bg-white">
              <SelectValue placeholder="Ano" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os Anos</SelectItem>
              {anosDisponiveis.map((ano) => (
                <SelectItem key={ano} value={String(ano)}>
                  {ano}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Indústria */}
          <Select
            value={filtros.industria || 'todas'}
            onValueChange={(val) => setFiltros((prev) => ({ ...prev, industria: val }))}
          >
            <SelectTrigger className="h-8 text-xs bg-white">
              <SelectValue placeholder="Indústria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as Indústrias</SelectItem>
              {industriasDisponiveis.map((ind) => (
                <SelectItem key={ind} value={ind}>
                  {ind}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Tipo de Documento */}
          <Select
            value={filtros.tipoDocumento || 'todos'}
            onValueChange={(val) =>
              setFiltros((prev) => ({ ...prev, tipoDocumento: val as EvidenciaTipo | 'todos' }))
            }
          >
            <SelectTrigger className="h-8 text-xs bg-white">
              <SelectValue placeholder="Tipo de Documento" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os Tipos</SelectItem>
              {Object.entries(ROTULOS_TIPO_DOCUMENTO).map(([tipo, rotulo]) => (
                <SelectItem key={tipo} value={tipo}>
                  {rotulo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Filtros rápidos de completude */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2.5 mt-2.5 border-t border-slate-100 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5 cursor-pointer text-slate-700">
              <input
                type="checkbox"
                checked={filtros.apenasSemNfAssinada}
                onChange={(e) =>
                  setFiltros((prev) => ({ ...prev, apenasSemNfAssinada: e.target.checked }))
                }
                className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
              />
              <span className="text-[11px] font-medium">Apenas sem NF assinada</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer text-slate-700">
              <input
                type="checkbox"
                checked={filtros.apenasSemDescarte}
                onChange={(e) =>
                  setFiltros((prev) => ({ ...prev, apenasSemDescarte: e.target.checked }))
                }
                className="rounded border-slate-300 text-rose-600 focus:ring-rose-500"
              />
              <span className="text-[11px] font-medium">Apenas sem comprovante de descarte</span>
            </label>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={carregarDados}
            disabled={isLoading}
            className="h-7 text-xs text-slate-600"
          >
            <RefreshCw className={`w-3 h-3 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
            Atualizar Arquivo
          </Button>
        </div>
      </Card>

      {/* ÁRVORE DOCUMENTAL AUTOMÁTICA: ANO → MÊS → LOJA → CASO */}
      <Card className="border border-slate-200 overflow-hidden bg-white">
        <CardHeader className="p-3.5 bg-slate-50 border-b border-slate-200 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="p-1 rounded-md bg-indigo-100 text-indigo-700">
              <Layers className="w-4 h-4" />
            </span>
            <div>
              <CardTitle className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Estrutura Documental Automática (Ano → Mês → Loja → Caso)
              </CardTitle>
              <p className="text-[10px] text-slate-500">
                Organização gerada a partir dos metadados dos Casos de Devolução, sem pastas manuais
                soltas.
              </p>
            </div>
          </div>
          <Badge variant="outline" className="text-xs bg-white">
            {arvore.length} Ano(s)
          </Badge>
        </CardHeader>

        <CardContent className="p-0 divide-y divide-slate-100">
          {isLoading ? (
            <div className="py-16 text-center text-xs text-slate-500">
              <RefreshCw className="w-6 h-6 text-indigo-600 animate-spin mx-auto mb-2" />
              Carregando arquivo documental...
            </div>
          ) : arvore.length === 0 ? (
            <div className="py-16 text-center text-xs text-slate-500">
              Nenhum documento encontrado para os filtros selecionados.
            </div>
          ) : (
            arvore.map((noAno) => {
              const expandidoAno = nosExpandidos.has(noAno.chave)

              return (
                <div key={noAno.chave} className="text-xs">
                  {/* NÍVEL 1: ANO */}
                  <div
                    onClick={() => toggleNo(noAno.chave)}
                    className="flex items-center justify-between px-4 py-2.5 bg-slate-100/70 hover:bg-slate-100 cursor-pointer font-bold text-slate-800 border-b border-slate-200/60"
                  >
                    <div className="flex items-center gap-2">
                      {expandidoAno ? (
                        <ChevronDown className="w-4 h-4 text-slate-500" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-slate-500" />
                      )}
                      <Folder className="w-4 h-4 text-amber-500" />
                      <span>{noAno.titulo}</span>
                    </div>
                    <Badge variant="secondary" className="text-[10px]">
                      {noAno.contagemDocumentos} documento(s)
                    </Badge>
                  </div>

                  {/* NÍVEL 2: MÊS */}
                  {expandidoAno &&
                    noAno.filhos?.map((noMes) => {
                      const expandidoMes = nosExpandidos.has(noMes.chave)

                      return (
                        <div key={noMes.chave} className="pl-4">
                          <div
                            onClick={() => toggleNo(noMes.chave)}
                            className="flex items-center justify-between px-4 py-2 bg-slate-50/70 hover:bg-slate-100/60 cursor-pointer font-semibold text-slate-700 border-b border-slate-100"
                          >
                            <div className="flex items-center gap-2">
                              {expandidoMes ? (
                                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                              )}
                              <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                              <span>{noMes.titulo}</span>
                            </div>
                            <span className="text-[10px] text-slate-500">{noMes.subtitulo}</span>
                          </div>

                          {/* NÍVEL 3: LOJA */}
                          {expandidoMes &&
                            noMes.filhos?.map((noLoja) => {
                              const expandidoLoja = nosExpandidos.has(noLoja.chave)

                              return (
                                <div key={noLoja.chave} className="pl-4">
                                  <div
                                    onClick={() => toggleNo(noLoja.chave)}
                                    className="flex items-center justify-between px-4 py-2 hover:bg-slate-50 cursor-pointer text-slate-800 border-b border-slate-100"
                                  >
                                    <div className="flex items-center gap-2">
                                      {expandidoLoja ? (
                                        <ChevronDown className="w-3 h-3 text-slate-400" />
                                      ) : (
                                        <ChevronRight className="w-3 h-3 text-slate-400" />
                                      )}
                                      <Store className="w-3.5 h-3.5 text-emerald-600" />
                                      <span className="font-medium">{noLoja.titulo}</span>
                                    </div>
                                    <span className="text-[10px] text-slate-400">
                                      {noLoja.contagemDocumentos} arquivo(s)
                                    </span>
                                  </div>

                                  {/* NÍVEL 4: CASOS E SEUS ARQUIVOS */}
                                  {expandidoLoja &&
                                    noLoja.filhos?.map((noCaso) => {
                                      const meta = noCaso.metadadosCaso
                                      const casoId = noCaso.chave.replace('caso_', '')

                                      return (
                                        <div
                                          key={noCaso.chave}
                                          className="pl-6 py-2.5 border-b border-slate-100 hover:bg-indigo-50/20"
                                        >
                                          {/* Cabeçalho do Caso com Status de Completude */}
                                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pr-4 mb-2">
                                            <div className="flex items-center gap-2">
                                              <span className="font-bold text-slate-900">
                                                {noCaso.titulo}
                                              </span>
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => onAbrirCasoDetalhe(casoId)}
                                                className="h-6 text-[10px] px-2 text-indigo-700 hover:bg-indigo-100"
                                              >
                                                Ver Detalhes do Caso →
                                              </Button>
                                            </div>

                                            {/* Indicadores de Completude Documental */}
                                            <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                                              <Badge
                                                variant="outline"
                                                className={
                                                  meta?.nf_recebida
                                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                                    : 'bg-slate-100 text-slate-500 border-slate-200'
                                                }
                                              >
                                                NF: {meta?.nf_recebida ? 'Sim' : 'Não'}
                                              </Badge>

                                              <Badge
                                                variant="outline"
                                                className={
                                                  meta?.nf_assinada
                                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                                    : 'bg-amber-50 text-amber-800 border-amber-300'
                                                }
                                              >
                                                Assinada: {meta?.nf_assinada ? 'Sim' : 'Pendente'}
                                              </Badge>

                                              <Badge
                                                variant="outline"
                                                className={
                                                  meta?.descarte_recebido
                                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                                    : 'bg-rose-50 text-rose-800 border-rose-300'
                                                }
                                              >
                                                Descarte:{' '}
                                                {meta?.descarte_recebido ? 'Sim' : 'Pendente'}
                                              </Badge>
                                            </div>
                                          </div>

                                          {/* Lista de Documentos Deste Caso */}
                                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 pr-4">
                                            {noCaso.documentos.map((doc) => (
                                              <div
                                                key={doc.id}
                                                className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200 text-xs hover:border-slate-300"
                                              >
                                                <div className="flex items-center gap-2 overflow-hidden">
                                                  {doc.tipo.includes('foto') ? (
                                                    <ImageIcon className="w-4 h-4 text-sky-600 shrink-0" />
                                                  ) : (
                                                    <FileText className="w-4 h-4 text-slate-600 shrink-0" />
                                                  )}
                                                  <div className="truncate">
                                                    <span className="font-semibold text-slate-800 block truncate">
                                                      {doc.nomeOriginal}
                                                    </span>
                                                    <span className="text-[10px] text-slate-400 block">
                                                      {doc.tipoRotulo}
                                                      {doc.nf_numero
                                                        ? ` • NF ${doc.nf_numero}`
                                                        : ''}
                                                    </span>
                                                  </div>
                                                </div>

                                                {doc.url ? (
                                                  <a
                                                    href={doc.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="p-1 text-indigo-600 hover:text-indigo-800 shrink-0"
                                                    title="Visualizar / Download"
                                                  >
                                                    <Download className="w-3.5 h-3.5" />
                                                  </a>
                                                ) : (
                                                  <span className="text-[9px] text-slate-400 shrink-0 italic">
                                                    Registrado
                                                  </span>
                                                )}
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )
                                    })}
                                </div>
                              )
                            })}
                        </div>
                      )
                    })}
                </div>
              )
            })
          )}
        </CardContent>
      </Card>
    </div>
  )
}
