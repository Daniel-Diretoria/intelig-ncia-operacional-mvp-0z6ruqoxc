import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  reconcileImportState,
  findPreviousAttempt,
  checkFileHash,
  submitProcessValidades,
  loadAlreadyPersistedBaseKeys,
  type ProcessValidadesPayload,
} from '../importClient'
import pb from '@/lib/pocketbase/client'

describe('Máquina de Estados e Reconciliação (reconciliation)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // (a) raw 6.203/6.662 => RAW_PARTIAL com rawPersisted=6203, rawPending=459
  it('(a) raw 6.203/6.662 => RAW_PARTIAL com rawPersisted=6203, rawPending=459', async () => {
    const importId = 'hist_part_6203'

    vi.spyOn(pb, 'collection').mockImplementation((collName: string) => {
      if (collName === 'import_history') {
        return {
          getOne: vi.fn().mockResolvedValue({
            id: importId,
            total_rows: 6662,
            base_count: 6660,
            skipped_rows: 2,
            status: 'failed',
          }),
        } as unknown as ReturnType<typeof pb.collection>
      }
      if (collName === 'validades_raw') {
        return {
          getList: vi.fn().mockResolvedValue({
            items: [],
            totalItems: 6203,
          }),
        } as unknown as ReturnType<typeof pb.collection>
      }
      if (collName === 'validades_base') {
        return {
          getList: vi.fn().mockResolvedValue({
            items: [],
            totalItems: 0,
          }),
        } as unknown as ReturnType<typeof pb.collection>
      }
      if (collName === 'auditoria_pendencias') {
        return {
          getList: vi.fn().mockResolvedValue({
            items: [],
            totalItems: 0,
          }),
        } as unknown as ReturnType<typeof pb.collection>
      }
      return {} as unknown as ReturnType<typeof pb.collection>
    })

    const rec = await reconcileImportState(importId, 6662, 6660, 2)
    expect(rec.state).toBe('RAW_PARTIAL')
    expect(rec.rawPersisted).toBe(6203)
    expect(rec.receivedExpected).toBe(6662)
    expect(rec.rawPending).toBe(459)
    expect(rec.basePersisted).toBe(0)
    expect(rec.auditPersisted).toBe(0)
  })

  // (b) raw 6.662/6.662, base=0, audit=0 => RAW_COMPLETE_CONSOLIDATION_PENDING com consolidationPending=6662
  it('(b) raw 6.662/6.662, base=0, audit=0 => RAW_COMPLETE_CONSOLIDATION_PENDING com consolidationPending=6662', async () => {
    const importId = 'hist_raw_complete'

    vi.spyOn(pb, 'collection').mockImplementation((collName: string) => {
      if (collName === 'import_history') {
        return {
          getOne: vi.fn().mockResolvedValue({
            id: importId,
            total_rows: 6662,
            base_count: 6660,
            skipped_rows: 2,
            status: 'failed',
            raw_count: 0, // Legado com 0 no histórico
          }),
        } as unknown as ReturnType<typeof pb.collection>
      }
      if (collName === 'validades_raw') {
        return {
          // Retorna 6662 real no banco
          getList: vi.fn().mockResolvedValue({
            items: [],
            totalItems: 6662,
          }),
        } as unknown as ReturnType<typeof pb.collection>
      }
      if (collName === 'validades_base') {
        return {
          getList: vi.fn().mockResolvedValue({
            items: [],
            totalItems: 0,
          }),
        } as unknown as ReturnType<typeof pb.collection>
      }
      if (collName === 'auditoria_pendencias') {
        return {
          getList: vi.fn().mockResolvedValue({
            items: [],
            totalItems: 0,
          }),
        } as unknown as ReturnType<typeof pb.collection>
      }
      return {} as unknown as ReturnType<typeof pb.collection>
    })

    const rec = await reconcileImportState(importId, 6662, 6660, 2)
    expect(rec.state).toBe('RAW_COMPLETE_CONSOLIDATION_PENDING')
    expect(rec.rawPersisted).toBe(6662)
    expect(rec.rawPending).toBe(0)
    expect(rec.validExpected).toBe(6660)
    expect(rec.auditExpected).toBe(2)
    expect(rec.basePersisted).toBe(0)
    expect(rec.auditPersisted).toBe(0)
    expect(rec.consolidationPending).toBe(6662)
  })

  // (c) base 3.000, audit 1 => CONSOLIDATION_PARTIAL com consolidationPending=3661
  it('(c) base 3.000, audit 1 => CONSOLIDATION_PARTIAL com consolidationPending=3661', async () => {
    const importId = 'hist_consol_partial'

    vi.spyOn(pb, 'collection').mockImplementation((collName: string) => {
      if (collName === 'import_history') {
        return {
          getOne: vi.fn().mockResolvedValue({
            id: importId,
            total_rows: 6662,
            base_count: 6660,
            skipped_rows: 2,
            status: 'failed',
          }),
        } as unknown as ReturnType<typeof pb.collection>
      }
      if (collName === 'validades_raw') {
        return {
          getList: vi.fn().mockResolvedValue({
            items: [],
            totalItems: 6662,
          }),
        } as unknown as ReturnType<typeof pb.collection>
      }
      if (collName === 'validades_base') {
        return {
          getList: vi.fn().mockResolvedValue({
            items: [],
            totalItems: 3000,
          }),
        } as unknown as ReturnType<typeof pb.collection>
      }
      if (collName === 'auditoria_pendencias') {
        return {
          getList: vi.fn().mockResolvedValue({
            items: [],
            totalItems: 1,
          }),
        } as unknown as ReturnType<typeof pb.collection>
      }
      return {} as unknown as ReturnType<typeof pb.collection>
    })

    const rec = await reconcileImportState(importId, 6662, 6660, 2)
    expect(rec.state).toBe('CONSOLIDATION_PARTIAL')
    expect(rec.rawPersisted).toBe(6662)
    expect(rec.basePersisted).toBe(3000)
    expect(rec.auditPersisted).toBe(1)
    expect(rec.consolidationPending).toBe(3661) // (6660 + 2) - (3000 + 1) = 3661
  })

  // (d) tudo reconciliado => COMPLETED, consolidationPending=0
  it('(d) tudo reconciliado => COMPLETED, consolidationPending=0', async () => {
    const importId = 'hist_completed'

    vi.spyOn(pb, 'collection').mockImplementation((collName: string) => {
      if (collName === 'import_history') {
        return {
          getOne: vi.fn().mockResolvedValue({
            id: importId,
            total_rows: 6662,
            base_count: 6660,
            skipped_rows: 2,
            status: 'completed',
          }),
        } as unknown as ReturnType<typeof pb.collection>
      }
      if (collName === 'validades_raw') {
        return {
          getList: vi.fn().mockResolvedValue({
            items: [],
            totalItems: 6662,
          }),
        } as unknown as ReturnType<typeof pb.collection>
      }
      if (collName === 'validades_base') {
        return {
          getList: vi.fn().mockResolvedValue({
            items: [],
            totalItems: 6660,
          }),
        } as unknown as ReturnType<typeof pb.collection>
      }
      if (collName === 'auditoria_pendencias') {
        return {
          getList: vi.fn().mockResolvedValue({
            items: [],
            totalItems: 2,
          }),
        } as unknown as ReturnType<typeof pb.collection>
      }
      return {} as unknown as ReturnType<typeof pb.collection>
    })

    const rec = await reconcileImportState(importId, 6662, 6660, 2)
    expect(rec.state).toBe('COMPLETED')
    expect(rec.rawPersisted).toBe(6662)
    expect(rec.basePersisted).toBe(6660)
    expect(rec.auditPersisted).toBe(2)
    expect(rec.consolidationPending).toBe(0)
  })

  // (e) segunda execução idempotente => COMPLETED com 0 writes
  it('(e) segunda execução idempotente quando checkFileHash detecta completed', async () => {
    vi.spyOn(pb, 'collection').mockImplementation((collName: string) => {
      if (collName === 'import_history') {
        return {
          getList: vi.fn().mockResolvedValue({
            items: [
              {
                id: 'hist_completed_prev',
                file_hash: 'hash_duplicate_ok',
                status: 'completed',
                created: '2026-03-01T10:00:00Z',
              },
            ],
          }),
        } as unknown as ReturnType<typeof pb.collection>
      }
      return {} as unknown as ReturnType<typeof pb.collection>
    })

    const check = await checkFileHash('hash_duplicate_ok')
    expect(check.duplicate).toBe(true)
    expect(check.importId).toBe('hist_completed_prev')
  })

  // (f) identidade insuficiente (importId='') => BLOCKED_UNSAFE ou NEW
  it('(f) identidade insuficiente (importId="") => NEW ou BLOCKED_UNSAFE quando sem total esperado', async () => {
    const emptyRec = await reconcileImportState('')
    expect(emptyRec.state).toBe('NEW')

    // Quando o importId existe mas total_rows é 0/indeterminado
    vi.spyOn(pb, 'collection').mockImplementation((collName: string) => {
      if (collName === 'import_history') {
        return {
          getOne: vi.fn().mockResolvedValue({
            id: 'hist_without_total',
            total_rows: 0,
            status: 'failed',
          }),
        } as unknown as ReturnType<typeof pb.collection>
      }
      if (collName === 'validades_raw') {
        return {
          getList: vi.fn().mockResolvedValue({
            items: [],
            totalItems: 100,
          }),
        } as unknown as ReturnType<typeof pb.collection>
      }
      return {} as unknown as ReturnType<typeof pb.collection>
    })

    const blockedRec = await reconcileImportState('hist_without_total')
    expect(blockedRec.state).toBe('BLOCKED_UNSAFE')
    expect(blockedRec.blockedReason).toContain('Não foi possível determinar o total esperado')
  })

  // (g) retomada de consolidação após RAW completo (RAW_COMPLETE_CONSOLIDATION_PENDING) não grava raw
  it('(g) retomada com RAW_COMPLETE_CONSOLIDATION_PENDING vai direto para base e não chama create em validades_raw', async () => {
    const rawCreateMock = vi.fn()
    const baseCreateMock = vi.fn().mockResolvedValue({ id: 'base_rec_1' })
    const updateHistMock = vi.fn().mockResolvedValue({ id: 'hist_resume_raw_complete' })

    vi.spyOn(pb, 'collection').mockImplementation((collName: string) => {
      if (collName === 'import_history') {
        return {
          update: updateHistMock,
        } as unknown as ReturnType<typeof pb.collection>
      }
      if (collName === 'validades_raw') {
        return {
          create: rawCreateMock,
          getList: vi.fn().mockResolvedValue({ items: [], totalItems: 3 }),
        } as unknown as ReturnType<typeof pb.collection>
      }
      if (collName === 'validades_base') {
        return {
          getList: vi.fn().mockResolvedValue({ items: [] }),
          create: baseCreateMock,
          update: vi.fn(),
        } as unknown as ReturnType<typeof pb.collection>
      }
      return {} as unknown as ReturnType<typeof pb.collection>
    })

    const reconciliation = {
      state: 'RAW_COMPLETE_CONSOLIDATION_PENDING' as const,
      importId: 'hist_resume_raw_complete',
      receivedExpected: 3,
      rawPersisted: 3,
      rawPending: 0,
      validExpected: 3,
      auditExpected: 0,
      basePersisted: 0,
      auditPersisted: 0,
      consolidationPending: 3,
    }

    const payload: ProcessValidadesPayload = {
      fileName: 'resumo.xlsx',
      fileSize: 1024,
      fileHash: 'hash_resume_test',
      reconciliation,
      rawRecords: [
        { produto: 'P1', realizado: '2026-08-10', quantidade: 1 },
        { produto: 'P2', realizado: '2026-08-10', quantidade: 2 },
        { produto: 'P3', realizado: '2026-08-10', quantidade: 3 },
      ],
      baseAtual: [
        { produto: 'P1', quantidade: 1, chaveOperacional: 'c1' },
        { produto: 'P2', quantidade: 2, chaveOperacional: 'c2' },
        { produto: 'P3', quantidade: 3, chaveOperacional: 'c3' },
      ],
      summary: {
        totalBrutos: 3,
        validos: 3,
        filtrados90Dias: 3,
        consolidados: 0,
        baseAtual: 3,
      },
    }

    const result = await submitProcessValidades(payload)
    expect(result.success).toBe(true)
    expect(result.rawRows).toBe(3)
    expect(result.importedRows).toBe(3)

    // NENHUMA gravação feita no raw (já estava completo!)
    expect(rawCreateMock).not.toHaveBeenCalled()
    // Gravações feitas na base
    expect(baseCreateMock).toHaveBeenCalledTimes(3)
  })

  // (h) reconciliação usa totalItems do PocketBase, não raw_count do histórico
  it('(h) reconciliação usa totalItems do PocketBase, ignorando raw_count=0 legado do histórico', async () => {
    const importId = 'hist_legacy_zero'

    vi.spyOn(pb, 'collection').mockImplementation((collName: string) => {
      if (collName === 'import_history') {
        return {
          getOne: vi.fn().mockResolvedValue({
            id: importId,
            total_rows: 6662,
            base_count: 6660,
            skipped_rows: 2,
            status: 'failed',
            raw_count: 0, // Legado registrou 0
          }),
        } as unknown as ReturnType<typeof pb.collection>
      }
      if (collName === 'validades_raw') {
        return {
          // Mas no banco temos 6662 registros reais
          getList: vi.fn().mockResolvedValue({
            items: [],
            totalItems: 6662,
          }),
        } as unknown as ReturnType<typeof pb.collection>
      }
      if (collName === 'validades_base') {
        return {
          getList: vi.fn().mockResolvedValue({
            items: [],
            totalItems: 0,
          }),
        } as unknown as ReturnType<typeof pb.collection>
      }
      return {} as unknown as ReturnType<typeof pb.collection>
    })

    const rec = await reconcileImportState(importId)
    // Confirma que usou os 6662 contados do banco
    expect(rec.rawPersisted).toBe(6662)
    expect(rec.state).toBe('RAW_COMPLETE_CONSOLIDATION_PENDING')
  })

  // (i) findPreviousAttempt retorna reconciliation populado
  it('(i) findPreviousAttempt retorna reconciliation populado quando status for failed', async () => {
    vi.spyOn(pb, 'collection').mockImplementation((collName: string) => {
      if (collName === 'import_history') {
        return {
          getList: vi.fn().mockResolvedValue({
            items: [
              {
                id: 'hist_prev_failed_123',
                file_hash: 'hash_failed_prev',
                status: 'failed',
                total_rows: 50,
                created: '2026-03-01T12:00:00Z',
              },
            ],
          }),
          getOne: vi.fn().mockResolvedValue({
            id: 'hist_prev_failed_123',
            total_rows: 50,
            status: 'failed',
          }),
        } as unknown as ReturnType<typeof pb.collection>
      }
      if (collName === 'validades_raw') {
        return {
          getList: vi.fn().mockResolvedValue({
            items: [],
            totalItems: 50,
          }),
        } as unknown as ReturnType<typeof pb.collection>
      }
      if (collName === 'validades_base') {
        return {
          getList: vi.fn().mockResolvedValue({
            items: [],
            totalItems: 0,
          }),
        } as unknown as ReturnType<typeof pb.collection>
      }
      return {} as unknown as ReturnType<typeof pb.collection>
    })

    const attempt = await findPreviousAttempt('hash_failed_prev')
    expect(attempt.found).toBe(true)
    expect(attempt.importId).toBe('hist_prev_failed_123')
    expect(attempt.reconciliation).toBeDefined()
    expect(attempt.reconciliation?.state).toBe('RAW_COMPLETE_CONSOLIDATION_PENDING')
    expect(attempt.reconciliation?.rawPersisted).toBe(50)
  })

  // loadAlreadyPersistedBaseKeys test
  it('loadAlreadyPersistedBaseKeys retorna Set com as chaves operacionais persistidas', async () => {
    vi.spyOn(pb, 'collection').mockImplementation((collName: string) => {
      if (collName === 'validades_base') {
        return {
          getList: vi.fn().mockResolvedValue({
            items: [{ chave_operacional: 'chave_1' }, { chave_operacional: 'chave_2' }],
            totalItems: 2,
          }),
        } as unknown as ReturnType<typeof pb.collection>
      }
      return {} as unknown as ReturnType<typeof pb.collection>
    })

    const keys = await loadAlreadyPersistedBaseKeys('test_import_id')
    expect(keys.size).toBe(2)
    expect(keys.has('chave_1')).toBe(true)
    expect(keys.has('chave_2')).toBe(true)
    expect(keys.has('chave_3')).toBe(false)
  })
})
