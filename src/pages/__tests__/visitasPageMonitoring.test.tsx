import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { VisitasPage } from '@/pages/VisitasPage'
import * as useOperacionalVisitasModule from '@/hooks/useOperacionalVisitas'
import * as useLojasModule from '@/services/useLojas'
import * as storeIdentityModule from '@/lib/format/storeIdentity'
import type { OperacionalVisita } from '@/types/cadastros'

const mockVisitas: OperacionalVisita[] = [
  {
    id: 'vis-1',
    data: '2026-10-01',
    promoter_id: 'prom-1',
    promoter_cod: '001',
    promoter_nome: 'CARLOS SILVA',
    store_id: 'st-101',
    store_code: '101',
    store_name: 'SUPERMERCADO ALVORADA',
    hora_inicio: '08:12',
    hora_fim: '09:03',
    duracao_minutos: 51,
    status_roteiro: 'concluida',
    origem_fonte: 'tradepro_api',
    dados_brutos_json: {
      itemPromotor: {
        idPromotor: '001',
        nomePromotor: 'CARLOS SILVA',
        nomeSupervisor: 'SUPERVISOR GERAL',
        pesquisasRealizadas: 3,
        pendencias: 0,
      },
    },
  },
  {
    id: 'vis-2',
    data: '2026-10-01',
    promoter_id: 'prom-2',
    promoter_cod: '002',
    promoter_nome: 'ANA SOUZA',
    store_id: 'st-202',
    store_code: '202',
    store_name: 'HIPERMERCADO ESTRELA / CENTRO',
    hora_inicio: '09:30',
    hora_fim: undefined, // Sem saída registrada
    duracao_minutos: undefined, // Sem duração calculada
    status_roteiro: 'pendente',
    origem_fonte: 'tradepro_api',
  },
]

const mockLojasContexto = [
  {
    storeId: '101|SUPERMERCADO ALVORADA|SAO JOSE',
    storeCode: '101',
    storeName: 'SUPERMERCADO ALVORADA',
    networkName: 'REDE ALVORADA',
    city: 'São José',
    uf: 'SC',
    marcasCount: 1,
    marcasList: ['FRUTAP'],
    validadesCriticasCount: 2,
    validadesAtencaoCount: 1,
    rupturasAtivasCount: 1,
    situacao: 'Crítica' as const,
    requerAtencao: true,
    motivosAtencao: ['2 validades críticas'],
    dimensoes: {} as any,
    itemsAtivos: [],
    itemsAuditoria: [],
    rupturasList: [],
    supervisorKey: 'sup-1',
    supervisorName: 'SUPERVISOR GERAL',
    supervisoresList: [],
  },
  {
    storeId: '202|HIPERMERCADO ESTRELA / CENTRO|FLORIANOPOLIS',
    storeCode: '202',
    storeName: 'HIPERMERCADO ESTRELA / CENTRO',
    networkName: 'REDE ESTRELA',
    city: 'Florianópolis',
    uf: 'SC',
    marcasCount: 1,
    marcasList: ['PIRACANJUBA'],
    validadesCriticasCount: 0,
    validadesAtencaoCount: 0,
    rupturasAtivasCount: 0,
    situacao: 'Normal' as const,
    requerAtencao: false,
    motivosAtencao: [],
    dimensoes: {} as any,
    itemsAtivos: [],
    itemsAuditoria: [],
    rupturasList: [],
    supervisorKey: 'sup-2',
    supervisorName: 'SUPERVISOR REGIONAL',
    supervisoresList: [],
  },
]

describe('VisitasPage — Item 4 Parte 2: Visões de Monitoramento e Diretrizes Factuais', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    vi.spyOn(useLojasModule, 'useLojas').mockReturnValue({
      stores: mockLojasContexto as any,
      filteredStores: mockLojasContexto as any,
      validadesAtivas: [],
      rupturasAtivas: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      getStoreById: (id) => mockLojasContexto.find((s) => s.storeId === id) as any,
    })
  })

  it('1. Renderiza cabeçalho, governança estrita e métricas consolidadas factuais', async () => {
    vi.spyOn(useOperacionalVisitasModule, 'useOperacionalVisitas').mockReturnValue({
      visitas: mockVisitas,
      promotores: [{ id: 'prom-1', nome: 'CARLOS SILVA', status: 'ativo' }] as any,
      lojas: [{ id: 'st-101', codigo_loja: '101', nome: 'SUPERMERCADO ALVORADA' }] as any,
      supervisores: [],
      assignments: [],
      isLoading: false,
      isFonteSincronizada: true,
      totalVisitas: 2,
      promotoresComRegistroCount: 2,
      lojasAtendidasCount: 2,
      promotoresResumo: [
        {
          promoterCod: '001',
          promoterNome: 'CARLOS SILVA',
          supervisorNome: 'SUPERVISOR GERAL',
          primeiraVisitaRegistrada: '08:12',
          lojaAtualOuUltima: {
            storeCode: '101',
            storeName: 'SUPERMERCADO ALVORADA',
            horaRegistro: '09:03',
          },
          qtdLojasVisitadas: 1,
          visitasConcluidas: 1,
          visitasSemSaida: 0,
          pesquisasRealizadas: 3,
          pendenciasOperacionais: 0,
          visitas: [mockVisitas[0]],
        },
        {
          promoterCod: '002',
          promoterNome: 'ANA SOUZA',
          supervisorNome: 'Sem dado na fonte',
          primeiraVisitaRegistrada: '09:30',
          lojaAtualOuUltima: {
            storeCode: '202',
            storeName: 'HIPERMERCADO ESTRELA / CENTRO',
            horaRegistro: '09:30',
          },
          qtdLojasVisitadas: 1,
          visitasConcluidas: 0,
          visitasSemSaida: 1,
          pesquisasRealizadas: undefined,
          pendenciasOperacionais: undefined,
          visitas: [mockVisitas[1]],
        },
      ],
      lojasResumo: [
        {
          storeCode: '101',
          storeName: 'SUPERMERCADO ALVORADA',
          visitasHoje: [mockVisitas[0]],
          promotoresComRegistro: [
            {
              promoterNome: 'CARLOS SILVA',
              promoterCod: '001',
              horaInicio: '08:12',
              horaFim: '09:03',
              duracaoMinutos: 51,
              origemFonte: 'tradepro_api',
            },
          ],
          primeiroRegistro: '08:12',
          ultimoRegistro: '09:03',
          temVisitaSemSaida: false,
        },
      ],
      refetch: vi.fn(),
    })

    render(
      <MemoryRouter>
        <VisitasPage />
      </MemoryRouter>,
    )

    expect(screen.getByText('Operação — Visitas de Promotores')).toBeTruthy()
    expect(
      screen.getByText(/Sem visita registrada não significa automaticamente: Promotor faltou/i),
    ).toBeTruthy()
    expect(
      screen.getByText(/Sem pesquisa registrada não significa automaticamente: Promotor não fez/i),
    ).toBeTruthy()
    expect(screen.getByText('2 de 1 cadastrados')).toBeTruthy()
  })

  it('2. Exibe estado "Fonte de Visitas ainda não sincronizada" quando a coleção está vazia', async () => {
    vi.spyOn(useOperacionalVisitasModule, 'useOperacionalVisitas').mockReturnValue({
      visitas: [],
      promotores: [],
      lojas: [],
      supervisores: [],
      assignments: [],
      isLoading: false,
      isFonteSincronizada: false,
      totalVisitas: 0,
      promotoresComRegistroCount: 0,
      lojasAtendidasCount: 0,
      promotoresResumo: [],
      lojasResumo: [],
      refetch: vi.fn(),
    })

    render(
      <MemoryRouter>
        <VisitasPage />
      </MemoryRouter>,
    )

    expect(screen.getByText('Fonte de Visitas ainda não sincronizada')).toBeTruthy()
    expect(
      screen.getByText(
        /Isso não significa ausência de promotores em loja nem falta de atendimento/i,
      ),
    ).toBeTruthy()
  })

  it('3. Perspectiva "Por Promotor": mostra promotor, supervisor factual, pesquisas e não inventa dados', async () => {
    const user = userEvent.setup()
    vi.spyOn(useOperacionalVisitasModule, 'useOperacionalVisitas').mockReturnValue({
      visitas: mockVisitas,
      promotores: [],
      lojas: [],
      supervisores: [],
      assignments: [],
      isLoading: false,
      isFonteSincronizada: true,
      totalVisitas: 2,
      promotoresComRegistroCount: 2,
      lojasAtendidasCount: 2,
      promotoresResumo: [
        {
          promoterCod: '001',
          promoterNome: 'CARLOS SILVA',
          supervisorNome: 'SUPERVISOR GERAL',
          primeiraVisitaRegistrada: '08:12',
          lojaAtualOuUltima: {
            storeCode: '101',
            storeName: 'SUPERMERCADO ALVORADA',
            horaRegistro: '09:03',
          },
          qtdLojasVisitadas: 1,
          visitasConcluidas: 1,
          visitasSemSaida: 0,
          pesquisasRealizadas: 3,
          pendenciasOperacionais: 0,
          visitas: [mockVisitas[0]],
        },
        {
          promoterCod: '002',
          promoterNome: 'ANA SOUZA',
          supervisorNome: 'Sem dado na fonte',
          primeiraVisitaRegistrada: '09:30',
          lojaAtualOuUltima: {
            storeCode: '202',
            storeName: 'HIPERMERCADO ESTRELA / CENTRO',
            horaRegistro: '09:30',
          },
          qtdLojasVisitadas: 1,
          visitasConcluidas: 0,
          visitasSemSaida: 1,
          pesquisasRealizadas: undefined,
          pendenciasOperacionais: undefined,
          visitas: [mockVisitas[1]],
        },
      ],
      lojasResumo: [],
      refetch: vi.fn(),
    })

    render(
      <MemoryRouter>
        <VisitasPage />
      </MemoryRouter>,
    )

    // Clica na aba "Por Promotor"
    const tabPromotores = screen.getByRole('tab', { name: /Por Promotor/i })
    await user.click(tabPromotores)

    // Promotor 1 com supervisor real
    expect(screen.getByText('CARLOS SILVA')).toBeTruthy()
    expect(screen.getByText('SUPERVISOR GERAL')).toBeTruthy()
    expect(screen.getByText('08:12')).toBeTruthy()

    // Promotor 2 com ausência de dados na fonte ("Sem dado na fonte")
    expect(screen.getByText('ANA SOUZA')).toBeTruthy()
    const semDadoElements = screen.getAllByText('Sem dado na fonte')
    expect(semDadoElements.length).toBeGreaterThanOrEqual(1)

    // Vínculo observado sem promover a confirmado
    expect(screen.getByText(/As visitas alimentam vínculos observados/i)).toBeTruthy()
  })

  it('4. Perspectiva "Por Loja": conecta indústrias, validades críticas e usa navigateToStore', async () => {
    const user = userEvent.setup()
    const navigateSpy = vi.spyOn(storeIdentityModule, 'navigateToStore')

    vi.spyOn(useOperacionalVisitasModule, 'useOperacionalVisitas').mockReturnValue({
      visitas: mockVisitas,
      promotores: [],
      lojas: [],
      supervisores: [],
      assignments: [],
      isLoading: false,
      isFonteSincronizada: true,
      totalVisitas: 2,
      promotoresComRegistroCount: 2,
      lojasAtendidasCount: 2,
      promotoresResumo: [],
      lojasResumo: [
        {
          storeCode: '101',
          storeName: 'SUPERMERCADO ALVORADA',
          visitasHoje: [mockVisitas[0]],
          promotoresComRegistro: [
            {
              promoterNome: 'CARLOS SILVA',
              promoterCod: '001',
              horaInicio: '08:12',
              horaFim: '09:03',
              duracaoMinutos: 51,
              origemFonte: 'tradepro_api',
            },
          ],
          primeiroRegistro: '08:12',
          ultimoRegistro: '09:03',
          temVisitaSemSaida: false,
        },
      ],
      refetch: vi.fn(),
    })

    render(
      <MemoryRouter>
        <VisitasPage />
      </MemoryRouter>,
    )

    // Clica na aba "Por Loja"
    const tabLojas = screen.getByRole('tab', { name: /Por Loja/i })
    await user.click(tabLojas)

    expect(screen.getByText('SUPERMERCADO ALVORADA')).toBeTruthy()
    expect(screen.getByText('Rede: REDE ALVORADA')).toBeTruthy()
    // Validades e Rupturas conectadas da loja
    expect(screen.getByText('Validades 0–15d')).toBeTruthy()
    expect(screen.getByText('FRUTAP')).toBeTruthy()

    // Clica no botão "Ficha da Loja"
    const btnFicha = screen.getByRole('button', { name: /Ficha da Loja/i })
    await user.click(btnFicha)

    // Valida que chamou navigateToStore canonicamente
    expect(navigateSpy).toHaveBeenCalled()
  })

  it('5. Perspectiva "Histórico": exibe tabela paginada com Primeiro Registro e Sem saída reg.', async () => {
    const user = userEvent.setup()
    vi.spyOn(useOperacionalVisitasModule, 'useOperacionalVisitas').mockReturnValue({
      visitas: mockVisitas,
      promotores: [],
      lojas: [],
      supervisores: [],
      assignments: [],
      isLoading: false,
      isFonteSincronizada: true,
      totalVisitas: 2,
      promotoresComRegistroCount: 2,
      lojasAtendidasCount: 2,
      promotoresResumo: [],
      lojasResumo: [],
      refetch: vi.fn(),
    })

    render(
      <MemoryRouter>
        <VisitasPage />
      </MemoryRouter>,
    )

    // Clica na aba Histórico
    const tabHistorico = screen.getByRole('tab', { name: /Histórico/i })
    await user.click(tabHistorico)

    expect(screen.getByText('Histórico Operacional de Visitas')).toBeTruthy()
    expect(screen.getByText('08:12')).toBeTruthy()
    expect(screen.getByText('09:03')).toBeTruthy()
    expect(screen.getByText('51 min')).toBeTruthy()

    // Visita 2 sem saída
    expect(screen.getByText('Sem saída registrada')).toBeTruthy()
  })
})
