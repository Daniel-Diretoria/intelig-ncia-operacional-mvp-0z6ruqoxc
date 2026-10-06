import '@testing-library/jest-dom/vitest'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { BaseEmReconstrucaoBanner } from '@/components/common/BaseEmReconstrucaoBanner'

describe('BaseEmReconstrucaoBanner', () => {
  it('não deve renderizar quando houver dados operacionais (validades > 0 ou rupturas > 0)', () => {
    const { container } = render(
      <MemoryRouter>
        <BaseEmReconstrucaoBanner totalValidades={10} totalRupturas={0} />
      </MemoryRouter>,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('deve renderizar banner de base em reconstrução quando total for 0', () => {
    render(
      <MemoryRouter>
        <BaseEmReconstrucaoBanner totalValidades={0} totalRupturas={0} />
      </MemoryRouter>,
    )

    expect(
      screen.getByText(/Base Operacional em Reconstrução \(Piloto Histórico\)/i),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/não configura pesquisa atrasada ou falha de monitoramento/i),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /Ir para Importação \/ Sincronização/i }),
    ).toBeInTheDocument()
  })
})
