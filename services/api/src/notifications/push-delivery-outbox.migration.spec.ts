import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = () => readFileSync(
  join(__dirname, '../../prisma/migrations/20260918100000_v4_push_delivery_outbox/migration.sql'),
  'utf8',
);

describe('V4 push delivery outbox schema', () => {
  it('enforces dedupe, lifecycle state and resident society ownership', () => {
    const migration = sql();
    expect(migration).toContain('PushDeliveryOutbox_scope_dedupe_key');
    expect(migration).toContain("('PENDING','IN_FLIGHT','DISPATCHED','FAILED')");
    expect(migration).toContain('PushDeliveryOutbox_resident_society_check');
    expect(migration).toContain('PushDeliveryOutbox_due_idx');
  });
});
