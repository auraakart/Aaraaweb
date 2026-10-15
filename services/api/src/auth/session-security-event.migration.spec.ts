import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = () => readFileSync(
  join(__dirname, '../../prisma/migrations/20260918123000_v45_session_security_events/migration.sql'),
  'utf8',
);

describe('V4.5 session security event schema', () => {
  it('records session revocation atomically without storing credentials', () => {
    const migration = sql();
    expect(migration).toContain('CREATE TABLE "SecurityEvent"');
    expect(migration).toContain('Session_revocation_security_event');
    expect(migration).toContain("OLD.\"revokedAt\" IS NULL AND NEW.\"revokedAt\" IS NOT NULL");
    expect(migration).toContain("'SESSION_REVOKED'");
    expect(migration).toContain('NEW."revocationReason"');
    expect(migration).not.toContain('"accessToken"');
    expect(migration).not.toContain('"refreshToken"');
    expect(migration).not.toContain('"accessTokenHash"');
    expect(migration).not.toContain('"refreshTokenHash"');
  });
});
