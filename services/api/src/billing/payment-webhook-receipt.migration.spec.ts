import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = () => readFileSync(
  join(__dirname, '../../prisma/migrations/20260918103000_v4_payment_webhook_receipts/migration.sql'),
  'utf8',
);

describe('V4 payment webhook receipt schema', () => {
  it('locks provider event identity and replay audit lifecycle', () => {
    const migration = sql();
    expect(migration).toContain('PaymentWebhookReceipt_event_key');
    expect(migration).toContain("('RECEIVED','PROCESSED','FAILED')");
    expect(migration).toContain('"replayCount"');
    expect(migration).toContain('"lastReplayedByUserId"');
    expect(migration).toContain('PaymentWebhookReceipt_society_status_idx');
  });
});
