CREATE INDEX "AuditEvent_society_event_time_idx"
ON "AuditEvent"("societyId", "event", "occurredAt" DESC);
