import { describe, expect, it, vi } from 'vitest';
import { ResidentStatementService, statementWindow } from './resident-statement.service';

describe('Resident financial export boundaries', () => {
  it.each([['2026-02-30','2026-03-01'],['2026-01-02','2026-01-01'],['2025-01-01','2026-01-02'],['bad','2026-01-01']])('rejects invalid/unbounded dates %s', (from,to) => {
    expect(() => statementWindow(from,to)).toThrow();
  });
  it('includes the full final India calendar day and accepts leap day', () => {
    expect(statementWindow('2024-02-29','2024-02-29').end.toISOString()).toBe('2024-02-29T18:30:00.000Z');
  });
  it('denies foreign or revoked property scope before querying history', async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValue([]) };
    const prisma = { $transaction: vi.fn().mockImplementation(fn => fn(tx)) };
    await expect(new ResidentStatementService(prisma as never).statement('society','user','unit','2026-01-01','2026-01-31')).rejects.toThrow('Property not found');
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
  });
  it('keeps tenant payment evidence private and fails rather than silently truncating', async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValueOnce([{unitNumber:'1'}]).mockResolvedValueOnce(Array(1001).fill({})).mockResolvedValueOnce([]) };
    const prisma = { $transaction: vi.fn().mockImplementation(fn => fn(tx)) };
    await expect(new ResidentStatementService(prisma as never).statement('society','user','unit','2026-01-01','2026-01-31')).rejects.toThrow('shorter period');
    const query = tx.$queryRaw.mock.calls[2][0];
    expect(query.sql).toContain('p."payerUserId"=');
    expect(query.sql).toContain('own."verified"=TRUE');
    expect(query.sql).toContain('LIMIT 1001');
  });
});
