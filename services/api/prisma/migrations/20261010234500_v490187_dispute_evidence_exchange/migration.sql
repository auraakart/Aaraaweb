-- V4.90.18.7: private service dispute evidence notes, scoped to a dispute.
-- Dispute-state locking in the API serializes evidence submission and closure.
CREATE TABLE "ConsumerServiceDisputeEvidence" (
  "id" UUID NOT NULL,
  "disputeId" UUID NOT NULL,
  "actorUserId" UUID NOT NULL,
  "actorType" TEXT NOT NULL,
  "note" TEXT NOT NULL,
  "reference" TEXT,
  "idempotencyKey" VARCHAR(120) NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConsumerServiceDisputeEvidence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConsumerServiceDisputeEvidence_actor_check" CHECK ("actorType" IN ('RESIDENT','PROVIDER')),
  CONSTRAINT "ConsumerServiceDisputeEvidence_note_check" CHECK (char_length(btrim("note")) BETWEEN 5 AND 2000),
  CONSTRAINT "ConsumerServiceDisputeEvidence_reference_check" CHECK ("reference" IS NULL OR char_length("reference") <= 400),
  CONSTRAINT "ConsumerServiceDisputeEvidence_key_check" CHECK (char_length("idempotencyKey") BETWEEN 8 AND 120),
  CONSTRAINT "ConsumerServiceDisputeEvidence_dispute_fkey" FOREIGN KEY ("disputeId") REFERENCES "ConsumerServiceDispute"("id") ON DELETE CASCADE,
  CONSTRAINT "ConsumerServiceDisputeEvidence_actor_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "ConsumerServiceDisputeEvidence_idempotency_key"
  ON "ConsumerServiceDisputeEvidence"("disputeId","actorUserId","idempotencyKey");
CREATE INDEX "ConsumerServiceDisputeEvidence_thread_idx"
  ON "ConsumerServiceDisputeEvidence"("disputeId","createdAt" DESC,"id" DESC);
