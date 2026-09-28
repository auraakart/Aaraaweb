# Aaraagate V4.67 — Helpdesk Comment Retry Safety

Date: 2026-09-28
Status: Repository release candidate closed on develop; release identity is 4.67.0.

## Slice 1 — Resident comment idempotency

Resident Helpdesk comments are now safe to retry after an ambiguous transport outcome.

- Resident comment requests carry a request-bound idempotency key.
- The Resident client reuses the same key while the normalized comment text is unchanged and creates a new key after the message changes.
- The API continues to verify the resident owns the complaint under the existing Helpdesk own-ticket boundary.
- Same-key resident comment attempts are serialized inside the transaction.
- An exact replay returns success only when the original activity is a COMMENT for the same ticket with the same normalized message.
- Reusing the key for another ticket or changed message fails closed with conflict.
- Only the first successful attempt writes the COMMENT activity.
- Reviewer comments remain backward-compatible and continue through the existing HELPDESK_REVIEW authority without requiring a resident retry key.

Historical HelpdeskActivity rows remain valid because the new idempotency key is nullable; the unique constraint applies to non-null request identities without rewriting historical activity.

## Boundary

This release does not widen Helpdesk permissions, expose internal notes, change ticket states or alter reviewer authority. Repository release truth is closed on `develop`; staging/main promotion and production/external acceptance remain separate.
