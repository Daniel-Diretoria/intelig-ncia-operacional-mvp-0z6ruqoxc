// Inspeção profunda do item de visitas e de outros relatórios que trazem eventos de visita
routerAdd('GET', '/backend/v1/tradepro/inspect-deep', (e) => {
  const rawToken = $os.getenv('TRADEPRO_BASIC_TOKEN') || ''
  const authHeader = rawToken.trim().startsWith('Basic ')
    ? rawToken.trim()
    : 'Basic ' + rawToken.trim()

  // 1. Inspecionar campos do primeiro item de /v1/relatorio-visitas
  const resVisitas = $http.send({
    url: 'https://diretoria.tradepro.com.br/diretoria/servicos/v1/relatorio-visitas/20261001/20261006?paginaAtual=1&quantidadePorPagina=1',
    method: 'GET',
    headers: { Authorization: authHeader, Accept: 'application/json' },
    timeout: 15,
  })

  // 2. Inspecionar se o endpoint de atendimentos existe no plural
  let resAtendimentos = null
  try {
    resAtendimentos = $http.send({
      url: 'https://diretoria.tradepro.com.br/diretoria/servicos/v1/relatorio-atendimentos/20261001/20261006?paginaAtual=1&quantidadePorPagina=1',
      method: 'GET',
      headers: { Authorization: authHeader, Accept: 'application/json' },
      timeout: 10,
    })
  } catch (_) {}

  // 3. Inspecionar relatorio-roteiro
  let resRoteiro = null
  try {
    resRoteiro = $http.send({
      url: 'https://diretoria.tradepro.com.br/diretoria/servicos/v1/relatorio-roteiro/20261001/20261006?paginaAtual=1&quantidadePorPagina=1',
      method: 'GET',
      headers: { Authorization: authHeader, Accept: 'application/json' },
      timeout: 10,
    })
  } catch (_) {}

  const jsonVisitas = resVisitas.json || {}
  const firstItem = jsonVisitas.visitas && jsonVisitas.visitas[0] ? jsonVisitas.visitas[0] : null
  const itemKeys = firstItem ? Object.keys(firstItem) : []

  return e.json(200, {
    visitasKeys: itemKeys,
    firstItemSummary: firstItem
      ? {
          idPromotor: firstItem.idPromotor,
          nomePromotor: firstItem.nomePromotor,
          idSupervisor: firstItem.idSupervisor,
          nomeSupervisor: firstItem.nomeSupervisor,
          visitasPrevistas: firstItem.visitasPrevistas,
          visitasRealizadas: firstItem.visitasRealizadas,
          percentualVisitas: firstItem.percentualVisitas,
          temLojas: Boolean(firstItem.lojas || firstItem.clientes || firstItem.carteiraClientes),
          promotorCarteiraClientesLen:
            firstItem.promotor && firstItem.promotor.carteiraClientes
              ? firstItem.promotor.carteiraClientes.length
              : 0,
          promotorFiliaisSupervisoresLen:
            firstItem.promotor && firstItem.promotor.filiaisSupervisores
              ? firstItem.promotor.filiaisSupervisores.length
              : 0,
          outrosCamposItem: itemKeys.filter(
            (k) =>
              ![
                'promotor',
                'supervisor',
                'nomePromotor',
                'idPromotor',
                'nomeSupervisor',
                'idSupervisor',
              ].includes(k),
          ),
        }
      : null,
    atendimentosStatus: resAtendimentos ? resAtendimentos.statusCode : null,
    roteiroStatus: resRoteiro ? resRoteiro.statusCode : null,
  })
})
