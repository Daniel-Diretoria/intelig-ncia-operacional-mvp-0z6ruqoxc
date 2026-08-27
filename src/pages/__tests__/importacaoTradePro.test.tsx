import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ImportacaoPage } from '../Importacao'
import * as useTradeProApiModule from '@/hooks/useTradeProApi'
import * as useImportHistoryModule from '@/services/useImportHistory'
import type { TradeProTestConnectionResult } from '@/lib/api/tradeProClient'

describe('ImportacaoPage — Teste de Conexão TradePro e Regressão de Importação Excel', () => {
  const mockTestConnection = vi.fn()
  const mockRequestRupturasPreview = vi.fn()
  const mockStartRupturasSync = vi.fn()
  const mockCancelRupturasSync = vi.fn()
  const mockResetRupturasSyncState = vi.fn()

  beforeEach(() => {
    vi.restoreAllMocks()

    vi.spyOn(useImportHistoryModule, 'useImportHistory').mockReturnValue({
      history: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })

    vi.spyOn(useTradeProApiModule, 'useTradeProApi').mockReturnValue({
      isConfigured: true,
      isSyncing: false,
      syncProgress: { step: '', percent: 0 },
      lastSyncResult: null,
      syncHistory: [],
      isLoadingHistory: false,
      rupturasPreviewJob: null,
      rupturasPreviewStatus: 'idle',
      rupturasSyncJob: null,
      rupturasSyncStatus: 'idle',
      requestRupturasPreview: mockRequestRupturasPreview,
      startRupturasSync: mockStartRupturasSync,
      cancelRupturasSync: mockCancelRupturasSync,
      resetRupturasSyncState: mockResetRupturasSyncState,
      sync: vi.fn(),
      testConnection: mockTestConnection,
      refreshHistory: vi.fn(),
    })
  })

  it('1. Renderiza campos de data e botão "Testar conexão" na aba Integração TradePro', async () => {
    render(
      <MemoryRouter>
        <ImportacaoPage />
      </MemoryRouter>,
    )

    // Clica na aba Integração TradePro
    const tabApi = screen.getByRole('tab', { name: /Integração TradePro/i })
    fireEvent.click(tabApi)

    await waitFor(() => {
      expect(screen.getByLabelText(/Data inicial/i)).toBeTruthy()
      expect(screen.getByLabelText(/Data final/i)).toBeTruthy()
      expect(screen.getByRole('button', { name: /Testar conexão/i })).toBeTruthy()
      expect(screen.getByText(/Pronta para teste/i)).toBeTruthy()
    })
  })

  it('2. Botão "Testar conexão" fica desabilitado sem datas preenchidas', async () => {
    render(
      <MemoryRouter>
        <ImportacaoPage />
      </MemoryRouter>,
    )

    const tabApi = screen.getByRole('tab', { name: /Integração TradePro/i })
    fireEvent.click(tabApi)

    const testBtn = screen.getByRole('button', { name: /Testar conexão/i }) as HTMLButtonElement
    expect(testBtn.disabled).toBe(true)
  })

  it('3. Exibe erro inline quando intervalo > 31 dias ou dataInicial > dataFinal', async () => {
    render(
      <MemoryRouter>
        <ImportacaoPage />
      </MemoryRouter>,
    )

    const tabApi = screen.getByRole('tab', { name: /Integração TradePro/i })
    fireEvent.click(tabApi)

    const dataInicialInput = screen.getByLabelText(/Data inicial/i)
    const dataFinalInput = screen.getByLabelText(/Data final/i)
    const testBtn = screen.getByRole('button', { name: /Testar conexão/i })

    // Intervalo de 40 dias (> 31 dias)
    fireEvent.change(dataInicialInput, { target: { value: '2026-05-01' } })
    fireEvent.change(dataFinalInput, { target: { value: '2026-06-10' } })

    expect(screen.getByText(/Intervalo máximo permitido é de 31 dias/i)).toBeTruthy()
    expect((testBtn as HTMLButtonElement).disabled).toBe(true)

    // Data inicial maior que data final
    fireEvent.change(dataInicialInput, { target: { value: '2026-05-20' } })
    fireEvent.change(dataFinalInput, { target: { value: '2026-05-10' } })

    expect(screen.getByText(/A data final deve ser maior ou igual à data inicial/i)).toBeTruthy()
    expect((testBtn as HTMLButtonElement).disabled).toBe(true)
  })

  it('4. Habilita botão com datas válidas, exibe estado "Verificando conexão..." durante o teste', async () => {
    let resolvePromise: (res: TradeProTestConnectionResult) => void
    const pendingPromise = new Promise<TradeProTestConnectionResult>((resolve) => {
      resolvePromise = resolve
    })

    mockTestConnection.mockReturnValueOnce(pendingPromise)

    render(
      <MemoryRouter>
        <ImportacaoPage />
      </MemoryRouter>,
    )

    const tabApi = screen.getByRole('tab', { name: /Integração TradePro/i })
    fireEvent.click(tabApi)

    const dataInicialInput = screen.getByLabelText(/Data inicial/i)
    const dataFinalInput = screen.getByLabelText(/Data final/i)

    fireEvent.change(dataInicialInput, { target: { value: '2026-05-01' } })
    fireEvent.change(dataFinalInput, { target: { value: '2026-05-15' } })

    const testBtn = screen.getByRole('button', { name: /Testar conexão/i }) as HTMLButtonElement
    expect(testBtn.disabled).toBe(false)

    fireEvent.click(testBtn)

    // Estado de verificação
    await waitFor(() => {
      expect(screen.getAllByText(/Verificando conexão/i).length).toBeGreaterThan(0)
    })

    // Resolve com 200 OK
    resolvePromise!({
      conectado: true,
      statusHttp: 200,
      possuiDados: true,
      registrosRecebidos: 1,
      totalDeRegistrosInformado: 90,
      tempoRespostaMs: 450,
      mensagem: 'Conexão realizada com sucesso.',
    })

    await waitFor(() => {
      expect(screen.getByText('Conectada')).toBeTruthy()
      expect(screen.getByText(/Conexão realizada com sucesso/i)).toBeTruthy()
      expect(screen.getByText('90')).toBeTruthy()
      expect(screen.getByText('450 ms')).toBeTruthy()
    })
  })

  it('5. Exibe resultado 204 (sem ocorrências) com selo apropriado', async () => {
    mockTestConnection.mockResolvedValueOnce({
      conectado: true,
      statusHttp: 204,
      possuiDados: false,
      registrosRecebidos: 0,
      totalDeRegistrosInformado: 0,
      tempoRespostaMs: 120,
      mensagem: 'Conexão válida, sem ocorrências no período.',
    })

    render(
      <MemoryRouter>
        <ImportacaoPage />
      </MemoryRouter>,
    )

    const tabApi = screen.getByRole('tab', { name: /Integração TradePro/i })
    fireEvent.click(tabApi)

    fireEvent.change(screen.getByLabelText(/Data inicial/i), { target: { value: '2026-05-01' } })
    fireEvent.change(screen.getByLabelText(/Data final/i), { target: { value: '2026-05-15' } })

    fireEvent.click(screen.getByRole('button', { name: /Testar conexão/i }))

    await waitFor(() => {
      expect(screen.getByText(/Conectada \(Sem dados\)/i)).toBeTruthy()
      expect(screen.getByText(/Conexão válida, sem ocorrências no período/i)).toBeTruthy()
    })
  })

  it('6. Exibe mensagem de erro após falha no teste', async () => {
    mockTestConnection.mockResolvedValueOnce({
      conectado: false,
      statusHttp: 401,
      possuiDados: false,
      registrosRecebidos: 0,
      totalDeRegistrosInformado: 0,
      tempoRespostaMs: 210,
      mensagem: 'Token inválido ou autenticação recusada.',
    })

    render(
      <MemoryRouter>
        <ImportacaoPage />
      </MemoryRouter>,
    )

    const tabApi = screen.getByRole('tab', { name: /Integração TradePro/i })
    fireEvent.click(tabApi)

    fireEvent.change(screen.getByLabelText(/Data inicial/i), { target: { value: '2026-05-01' } })
    fireEvent.change(screen.getByLabelText(/Data final/i), { target: { value: '2026-05-15' } })

    fireEvent.click(screen.getByRole('button', { name: /Testar conexão/i }))

    await waitFor(() => {
      expect(screen.getByText('Com erro')).toBeTruthy()
      expect(screen.getByText(/Token inválido ou autenticação recusada/i)).toBeTruthy()
      expect(screen.getByText(/Código retornado: HTTP 401/i)).toBeTruthy()
    })
  })

  it('7. Segurança: NUNCA exibe token, Authorization, ou headers na tela', async () => {
    mockTestConnection.mockResolvedValueOnce({
      conectado: true,
      statusHttp: 200,
      possuiDados: true,
      registrosRecebidos: 1,
      totalDeRegistrosInformado: 50,
      tempoRespostaMs: 300,
      mensagem: 'Conexão realizada com sucesso.',
    })

    const { container } = render(
      <MemoryRouter>
        <ImportacaoPage />
      </MemoryRouter>,
    )

    const tabApi = screen.getByRole('tab', { name: /Integração TradePro/i })
    fireEvent.click(tabApi)

    fireEvent.change(screen.getByLabelText(/Data inicial/i), { target: { value: '2026-05-01' } })
    fireEvent.change(screen.getByLabelText(/Data final/i), { target: { value: '2026-05-15' } })

    fireEvent.click(screen.getByRole('button', { name: /Testar conexão/i }))

    await waitFor(() => {
      expect(screen.getByText('Conectada')).toBeTruthy()
    })

    const htmlContent = container.innerHTML
    expect(htmlContent).not.toMatch(/TRADEPRO_BASIC_TOKEN/i)
    expect(htmlContent).not.toMatch(/Basic [A-Za-z0-9+/=]+/i)
    expect(htmlContent).not.toMatch(/Authorization:/i)
  })

  it('8. Renderiza seção de Sincronização de Rupturas com campos e botão de prévia', async () => {
    render(
      <MemoryRouter>
        <ImportacaoPage />
      </MemoryRouter>,
    )

    const tabApi = screen.getByRole('tab', { name: /Integração TradePro/i })
    fireEvent.click(tabApi)

    await waitFor(() => {
      expect(screen.getByText('Sincronização de Rupturas')).toBeTruthy()
      expect(screen.getByRole('button', { name: /Consultar prévia/i })).toBeTruthy()
    })
  })

  it('9. Regressão: Aba "Importar Arquivo Excel" e alternância de abas permanecem funcionais', async () => {
    render(
      <MemoryRouter>
        <ImportacaoPage />
      </MemoryRouter>,
    )

    // Por padrão ou clicando na aba de arquivo
    const tabFile = screen.getByRole('tab', { name: /Importar Arquivo Excel/i })
    fireEvent.click(tabFile)

    await waitFor(() => {
      expect(screen.getByText(/Arraste um arquivo Excel do TradePro/i)).toBeTruthy()
      expect(screen.getByText(/Histórico de importações \(Arquivos\)/i)).toBeTruthy()
      expect(screen.getByText(/Selecionar arquivo/i)).toBeTruthy()
    })
  })
})
