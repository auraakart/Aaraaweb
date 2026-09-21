import { Prisma } from '@prisma/client';

export type HelpdeskSlaState =
  | 'UNTRACKED'
  | 'ON_TRACK'
  | 'RESPONSE_BREACHED'
  | 'RESOLUTION_BREACHED'
  | 'MET';

/**
 * Authoritative SQL expression for the current SLA state of a HelpdeskTicket
 * selected with the conventional `ht` alias. Keep queue, readiness and
 * resident projections on this fragment so terminal-state semantics cannot drift.
 */
export const HELPDESK_TICKET_SLA_STATE_SQL = Prisma.sql`
  CASE
    WHEN ht."status" IN ('RESOLVED','CLOSED') AND ht."resolutionDueAt" IS NOT NULL
      THEN CASE
        WHEN COALESCE(ht."resolvedAt", ht."closedAt") IS NULL THEN 'UNTRACKED'
        WHEN COALESCE(ht."resolvedAt", ht."closedAt") <= ht."resolutionDueAt" THEN 'MET'
        ELSE 'RESOLUTION_BREACHED'
      END
    WHEN ht."status" NOT IN ('RESOLVED','CLOSED')
      AND ht."resolutionDueAt" IS NOT NULL
      AND CURRENT_TIMESTAMP > ht."resolutionDueAt" THEN 'RESOLUTION_BREACHED'
    WHEN ht."firstRespondedAt" IS NULL
      AND ht."firstResponseDueAt" IS NOT NULL
      AND CURRENT_TIMESTAMP > ht."firstResponseDueAt" THEN 'RESPONSE_BREACHED'
    WHEN ht."firstResponseDueAt" IS NULL THEN 'UNTRACKED'
    ELSE 'ON_TRACK'
  END
`;

/**
 * Same domain rule for a ticket snapshot already locked/read by the service.
 * Values remain parameterized; only the rule is centralized here.
 */
export function helpdeskSlaStateForSnapshotSql(ticket: {
  status: string;
  firstRespondedAt: Date | null;
  firstResponseDueAt: Date | null;
  resolutionDueAt: Date | null;
  resolvedAt: Date | null;
  closedAt: Date | null;
}) {
  return Prisma.sql`
    CASE
      WHEN ${ticket.status} IN ('RESOLVED','CLOSED')
        AND ${ticket.resolutionDueAt}::timestamptz IS NOT NULL
        THEN CASE
          WHEN COALESCE(${ticket.resolvedAt}::timestamptz, ${ticket.closedAt}::timestamptz) IS NULL THEN 'UNTRACKED'
          WHEN COALESCE(${ticket.resolvedAt}::timestamptz, ${ticket.closedAt}::timestamptz)
            <= ${ticket.resolutionDueAt}::timestamptz THEN 'MET'
          ELSE 'RESOLUTION_BREACHED'
        END
      WHEN ${ticket.status} NOT IN ('RESOLVED','CLOSED')
        AND ${ticket.resolutionDueAt}::timestamptz IS NOT NULL
        AND CURRENT_TIMESTAMP > ${ticket.resolutionDueAt}::timestamptz THEN 'RESOLUTION_BREACHED'
      WHEN ${ticket.firstRespondedAt}::timestamptz IS NULL
        AND ${ticket.firstResponseDueAt}::timestamptz IS NOT NULL
        AND CURRENT_TIMESTAMP > ${ticket.firstResponseDueAt}::timestamptz THEN 'RESPONSE_BREACHED'
      WHEN ${ticket.firstResponseDueAt}::timestamptz IS NULL THEN 'UNTRACKED'
      ELSE 'ON_TRACK'
    END::text
  `;
}
