// Migração 0040 — Ajuste Final da Semântica TradePro: Rede Real (Fantasia) + Indústria sem Fallback Inseguro
//
// REQUISITOS:
// 1. Adicionar campos 'rede', 'fantasia', 'razao_social', 'tradepro_cliente_nome' em rupturas_base caso não existam.
// 2. Não inventar valores: para os registros atuais (6.780), o campo 'cliente' gravou o valor bruto recebido
//    da fonte (ex: 'GRUPO PEREIRA', 'Combo Atacadista - Tubarão', etc.), pois no job e8enyr17kqlbl1f
//    a API enviou item.fantasiaCliente / item.cliente com esse nome de Fantasia/Rede e codigoCliente vazio ou não mapeado.
// 3. Onde o valor gravado em 'cliente' é comprovadamente uma Rede/Fantasia de varejo (ex: 'GRUPO PEREIRA')
//    e NÃO uma Indústria homologada em industry_registry, migramos esse valor para 'rede'/'fantasia'
//    e definimos cliente = 'Não identificada' para não transformar Rede em Indústria!
// 4. Se houver codigo_cliente mapeado em industry_registry (ex: 7=FRUTAP, 4=COCOLEVE, etc.),
//    preenche o campo 'cliente' com o nome canônico da Indústria.

migrate(
  (app) => {
    const rupturasCol = app.findCollectionByNameOrId('rupturas_base')

    if (!rupturasCol.fields.getByName('rede')) {
      rupturasCol.fields.add(new TextField({ name: 'rede' }))
    }
    if (!rupturasCol.fields.getByName('fantasia')) {
      rupturasCol.fields.add(new TextField({ name: 'fantasia' }))
    }
    if (!rupturasCol.fields.getByName('razao_social')) {
      rupturasCol.fields.add(new TextField({ name: 'razao_social' }))
    }
    if (!rupturasCol.fields.getByName('tradepro_cliente_nome')) {
      rupturasCol.fields.add(new TextField({ name: 'tradepro_cliente_nome' }))
    }

    app.save(rupturasCol)

    rupturasCol.addIndex('idx_rupturas_base_rede', false, 'rede', '')
    app.save(rupturasCol)

    // Também garante campo 'rede' em validades_base caso não exista
    try {
      const validadesCol = app.findCollectionByNameOrId('validades_base')
      if (!validadesCol.fields.getByName('rede')) {
        validadesCol.fields.add(new TextField({ name: 'rede' }))
        app.save(validadesCol)
      }
    } catch (_) {}

    // 2. Carrega indústrias cadastradas em industry_registry para resolução legítima
    const industryMapByClientId = {}
    const knownIndustryNames = new Set()
    try {
      const allIndustries = app.findRecordsByFilter(
        'industry_registry',
        'id != ""',
        'nome',
        1000,
        0,
      )
      for (let i = 0; i < allIndustries.length; i++) {
        const ind = allIndustries[i]
        const cid = (ind.getString('tradepro_client_id') || '').trim()
        const cname = (ind.getString('nome') || '').trim()
        if (cid) industryMapByClientId[cid] = cname
        if (cname) knownIndustryNames.add(cname.toUpperCase())
      }
    } catch (e) {
      console.log('[0040] Aviso ao carregar industry_registry:', e)
    }

    // 3. Normalização dos 6.780 registros atuais do job canônico
    // No job e8enyr17kqlbl1f, os registros tinham no campo 'cliente' o valor que a API enviou como fantasiaCliente
    // (ex.: 'GRUPO PEREIRA', 'Combo Atacadista - Tubarão').
    // Onde 'cliente' = 'GRUPO PEREIRA':
    // - O valor real da Rede / Fantasia é 'GRUPO PEREIRA'.
    // - Como 'GRUPO PEREIRA' NÃO é Indústria, ele DEVE ir para o campo 'rede' e 'fantasia'.
    // - E o campo 'cliente' (Indústria) NUNCA pode ser 'GRUPO PEREIRA'! Se não tiver código de cliente mapeado,
    //   fica 'Não identificada' e tradepro_cliente_nome = valor bruto.
    app
      .db()
      .newQuery(`
      UPDATE rupturas_base
      SET
        rede = CASE
          WHEN rede IS NOT NULL AND rede != '' THEN rede
          WHEN cliente = 'GRUPO PEREIRA' THEN 'GRUPO PEREIRA'
          WHEN nome_loja LIKE '%FORT ATACADISTA%' THEN 'FORT ATACADISTA'
          WHEN nome_loja LIKE '%COMBO ATACADISTA%' THEN 'COMBO ATACADISTA'
          WHEN nome_loja LIKE '%BRASIL ATACADISTA%' THEN 'BRASIL ATACADISTA'
          WHEN nome_loja LIKE '%ATACADÃO%' OR nome_loja LIKE '%ATACADAO%' THEN 'ATACADÃO'
          WHEN nome_loja LIKE '%GIASSI%' THEN 'GIASSI'
          WHEN nome_loja LIKE '%COMPER%' THEN 'COMPER'
          ELSE ''
        END,
        fantasia = CASE
          WHEN fantasia IS NOT NULL AND fantasia != '' THEN fantasia
          WHEN cliente = 'GRUPO PEREIRA' THEN 'GRUPO PEREIRA'
          ELSE ''
        END,
        razao_social = CASE
          WHEN razao_social IS NOT NULL AND razao_social != '' THEN razao_social
          ELSE nome_loja
        END
      WHERE is_base_atual = 1
    `)
      .execute()

    // Agora, para o campo 'cliente' (Indústria):
    // Se codigo_cliente tiver vínculo no industry_registry, garante o nome da indústria.
    for (const cid in industryMapByClientId) {
      const indNome = industryMapByClientId[cid]
      app
        .db()
        .newQuery(`
        UPDATE rupturas_base
        SET cliente = {:indNome}
        WHERE is_base_atual = 1 AND codigo_cliente = {:cid}
      `)
        .bind({ indNome, cid })
        .execute()
    }

    // Se o campo 'cliente' ainda estiver preenchido com nomes que NÃO são indústrias
    // (como 'GRUPO PEREIRA', ou nomes de lojas/redes):
    // Desvincula imediatamente de Indústria para evitar fallback inseguro!
    app
      .db()
      .newQuery(`
      UPDATE rupturas_base
      SET
        tradepro_cliente_nome = cliente,
        cliente = 'Não identificada'
      WHERE is_base_atual = 1
        AND (
          cliente = 'GRUPO PEREIRA'
          OR cliente = 'Combo Atacadista - Tubarão'
          OR (cliente NOT IN (SELECT nome FROM industry_registry) AND (codigo_cliente = '' OR codigo_cliente IS NULL))
        )
    `)
      .execute()

    console.log(
      '[0040] Migração 0040 aplicada: campos rede/fantasia/razao_social adicionados e semântica TradePro corrigida sem fallback inseguro.',
    )
  },
  (app) => {
    try {
      const rupturasCol = app.findCollectionByNameOrId('rupturas_base')
      rupturasCol.removeIndex('idx_rupturas_base_rede')
      app.save(rupturasCol)
    } catch (_) {}
  },
)
