-- V2.3 advanced-report export audit foundation.
-- Report exports are privileged read operations and must remain visible in the
-- society audit trail even though they do not mutate business data.
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'REPORT_EXPORTED';
