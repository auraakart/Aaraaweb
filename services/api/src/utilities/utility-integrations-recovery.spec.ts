import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = () => readFileSync(
  join(__dirname, '../../prisma/migrations/20260915061000_v23_utility_integration_recovery/migration.sql'),
  'utf8',
);

describe('utility integration lifecycle and recovery migration', () => {
  it('keeps lifecycle and resolution evidence append-only', () => {
    const sql = migration();
    expect(sql).toContain('"UtilityIntegrationEvent_append_only"');
    expect(sql).toContain('"UtilityIngestionResolution_append_only"');
    expect(sql).toContain('prevent_utility_ingestion_evidence_mutation');
  });

  it('retains mapping history while allowing one active replacement', () => {
    const sql = migration();
    expect(sql).toContain('"retiredAt" TIMESTAMPTZ');
    expect(sql).toContain('"replacesMappingId" UUID');
    expect(sql).toContain('"UtilityIntegrationMeterMap_active_external_key"');
    expect(sql).toContain('WHERE "active"=TRUE');
  });

  it('links reprocessing outcomes to new receipts without changing billing data', () => {
    const sql = migration();
    expect(sql).toContain('"replacementReceiptId" UUID');
    expect(sql).toContain("'REPROCESS_REQUESTED'");
    expect(sql).toContain("'REPROCESS_ACCEPTED'");
    expect(sql).not.toContain('"Charge"');
    expect(sql).not.toContain('"Invoice"');
    expect(sql).not.toContain('"Payment"');
  });
});
