import { describe, expect, it } from 'vitest';
import { validateHistory } from './resident-history';

describe('Resident history keyset boundaries', () => {
  it('retains microseconds and treats wildcard search as literal data', () => {
    const query = { beforeDate: '2026-10-22T12:00:00.123456Z', beforeId: '12345678-1111-4111-8111-111111111111', search: '%_' };
    expect(validateHistory(query)).toBe('%\\%\\_%');
    expect(query.beforeDate).toContain('123456');
  });
  it.each([{beforeId:'123'}, {beforeDate:'2026-10-22'}, {beforeDate:'bad',beforeId:'bad'}, {search:'x'.repeat(121)}])('rejects malformed cursor/search %j', query => {
    expect(() => validateHistory(query)).toThrow();
  });
});
