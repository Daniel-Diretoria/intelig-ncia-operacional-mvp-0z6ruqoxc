// Migração 0018 — Força Restauração da Base Atual de Rupturas (tenant-default) e desativação de staging TradePro
// Idempotente e segura:
// 1. Seta is_base_atual = 1 em TODOS os registros com tenant_id = 'tenant-default' onde is_base_atual = 0
// 2. Seta is_base_atual = 0 em TODOS os registros com tenant_id LIKE 'tradepro_job_%' onde is_base_atual = 1
// 3. NÃO apaga nenhum registro
// 4. NÃO altera nenhum outro campo nem coleção

migrate(
  (app) => {
    // Restaura tenant-default como Base Atual
    const result1 = app
      .db()
      .newQuery(`
      UPDATE rupturas_base
      SET is_base_atual = 1
      WHERE tenant_id = 'tenant-default' AND is_base_atual = 0
    `)
      .execute()

    // Garante que staging tradepro_job_ fique is_base_atual=false
    const result2 = app
      .db()
      .newQuery(`
      UPDATE rupturas_base
      SET is_base_atual = 0
      WHERE tenant_id LIKE 'tradepro_job_%' AND is_base_atual = 1
    `)
      .execute()

    console.log(`[0018] tenant-default restaurados para is_base_atual=1`)
    console.log(`[0018] tradepro_job_* movidos para is_base_atual=0`)
  },
  (app) => {
    // Reversão defensiva: não apaga nada, só desativa tenant-default
    app
      .db()
      .newQuery(`
      UPDATE rupturas_base
      SET is_base_atual = 0
      WHERE tenant_id = 'tenant-default' AND is_base_atual = 1
    `)
      .execute()
  },
)
