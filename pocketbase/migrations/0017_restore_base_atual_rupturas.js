// Migração 0017 — Restauração da Base Atual de Rupturas (Excel / tenant-default)
// Idempotente:
// 1. Seta is_base_atual = true em TODOS os registros com tenant_id = 'tenant-default' (Excel)
// 2. Seta is_base_atual = false em TODOS os registros com tenant_id que começa com 'tradepro_job_' (staging)
// 3. NÃO apaga nenhum registro
// 4. NÃO altera nenhum outro campo

migrate(
  (app) => {
    // 1. Restaura Base Atual para os registros do tenant-default (Excel)
    app
      .db()
      .newQuery(`
    UPDATE rupturas_base
    SET is_base_atual = 1
    WHERE tenant_id = 'tenant-default'
  `)
      .execute()

    // 2. Garante que qualquer registro de staging de jobs TradePro fique com is_base_atual = false
    app
      .db()
      .newQuery(`
    UPDATE rupturas_base
    SET is_base_atual = 0
    WHERE tenant_id LIKE 'tradepro_job_%'
  `)
      .execute()
  },
  (app) => {
    // Reversão defensiva (mantém integridade sem apagar dados)
    app
      .db()
      .newQuery(`
    UPDATE rupturas_base
    SET is_base_atual = 0
    WHERE tenant_id = 'tenant-default'
  `)
      .execute()
  },
)
