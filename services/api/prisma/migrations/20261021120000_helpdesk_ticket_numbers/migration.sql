-- Prisma schema diff, extended with sequence allocation, historical backfill and immutability.
-- Apply atomically: no writer may see the intermediate nullable column.
BEGIN;

CREATE SEQUENCE "HelpdeskTicket_number_seq" AS BIGINT NO CYCLE;

CREATE FUNCTION next_helpdesk_ticket_number(numbered_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)
RETURNS TEXT LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  sequence_number TEXT;
BEGIN
  sequence_number := nextval('"HelpdeskTicket_number_seq"')::TEXT;
  RETURN 'HD-' || to_char(numbered_at AT TIME ZONE 'UTC', 'YYYY') || '-' ||
    lpad(sequence_number, greatest(6, length(sequence_number)), '0');
END;
$$;

-- AlterTable
ALTER TABLE "HelpdeskTicket" ADD COLUMN     "ticketNumber" TEXT;

-- Preserve each existing ticket's creation year without changing its identity or history.
UPDATE "HelpdeskTicket" SET "ticketNumber" = next_helpdesk_ticket_number("createdAt");
ALTER TABLE "HelpdeskTicket" ALTER COLUMN "ticketNumber" SET NOT NULL,
  ALTER COLUMN "ticketNumber" SET DEFAULT next_helpdesk_ticket_number();

-- CreateIndex
CREATE UNIQUE INDEX "HelpdeskTicket_ticketNumber_key" ON "HelpdeskTicket"("ticketNumber");


ALTER SEQUENCE "HelpdeskTicket_number_seq" OWNED BY "HelpdeskTicket"."ticketNumber";
ALTER TABLE "HelpdeskTicket" ADD CONSTRAINT "HelpdeskTicket_ticketNumber_format"
  CHECK ("ticketNumber" ~ '^HD-[0-9]{4}-[0-9]{6,}$');

CREATE FUNCTION preserve_helpdesk_ticket_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."ticketNumber" IS DISTINCT FROM OLD."ticketNumber" THEN
    RAISE EXCEPTION 'Helpdesk ticket number cannot be changed' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "HelpdeskTicket_preserve_ticketNumber"
BEFORE UPDATE OF "ticketNumber" ON "HelpdeskTicket"
FOR EACH ROW EXECUTE FUNCTION preserve_helpdesk_ticket_number();

COMMIT;
