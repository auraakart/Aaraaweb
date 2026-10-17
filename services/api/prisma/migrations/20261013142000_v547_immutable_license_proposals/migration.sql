-- Proposal snapshots never have an edit lifecycle; renewals/replacements create new drafts.
-- Approval, consent, allocation and revocation are already separate append-only records.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
CREATE OR REPLACE FUNCTION aaraagate_reserved_draft_check() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Commercial license proposal snapshots are immutable' USING ERRCODE='55000';
END $$;
COMMIT;
