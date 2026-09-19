import { describe, expect, it } from 'vitest';
import { HELPDESK_TICKET_SLA_STATE_SQL, helpdeskSlaStateForSnapshotSql } from './helpdesk-sla-state';

function textOf(sql: { strings: readonly string[] }) {
  return sql.strings.join(' ');
}

describe('helpdesk SLA state semantics', () => {
  it('uses the terminal timestamp for resolved or directly closed tickets', () => {
    const text = textOf(HELPDESK_TICKET_SLA_STATE_SQL);
    expect(text).toContain('COALESCE(ht."resolvedAt", ht."closedAt")');
    expect(text).toContain("'MET'");
    expect(text).toContain("'RESOLUTION_BREACHED'");
  });

  it('keeps the locked-snapshot evaluator aligned with terminal timestamp semantics', () => {
    const sql = helpdeskSlaStateForSnapshotSql({
      status: 'CLOSED',
      firstRespondedAt: new Date('2026-09-14T08:00:00Z'),
      firstResponseDueAt: new Date('2026-09-14T08:30:00Z'),
      resolutionDueAt: new Date('2026-09-14T10:00:00Z'),
      resolvedAt: null,
      closedAt: new Date('2026-09-14T09:00:00Z'),
    });
    const text = textOf(sql);
    expect(text).toContain('COALESCE');
    expect(text).toContain("'UNTRACKED'");
    expect(text).toContain("'MET'");
    expect(text).toContain("'RESPONSE_BREACHED'");
    expect(text).toContain("IN ('RESOLVED','CLOSED')");
    expect(text).toMatch(/IN \('RESOLVED','CLOSED'\)[\\s\\S]*COALESCE[\\s\\S]*'MET'[\\s\\S]*'RESPONSE_BREACHED'[\\s\\S]*'UNTRACKED'/);
  });
});
