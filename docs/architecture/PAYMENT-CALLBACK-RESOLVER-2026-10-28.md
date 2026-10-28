# Signed payment callback routing capability — 28 October 2026

Backlog: H27-03 (partial), H27-04/H27-08. Baseline develop: `ee806fa84b61d5a8cc84e96dec36cdd38ef9e1ad`. Target: protected develop integration only; no staging/main or production policy activation.

## Change and root cause

A signed callback has no authenticated resident-selected society. Billing previously read six payment fields directly through the root Prisma client to discover two routing identifiers. That table-level exception could not operate under the planned non-owner RLS boundary without broader privileges.

The callback now verifies HMAC before calling `public.aaraagate_resolve_payment_webhook_order(text)`. This exact-order function returns only payment id and society id, fixes provider to `gateway-adapter` and returns at most one row using the existing unique providerOrderId index. No tenant id, SQL fragment, status, amount, payer or arbitrary predicate is accepted. Missing/denied lookup fails closed with no raw table fallback. Receipt persistence and locked processing continue in the stored society's existing scoped transactions; signature, payload-digest binding, provider-event uniqueness, idempotency and invoice/amenity behavior remain unchanged.

Migration `20261028060000_v510_payment_callback_resolver` creates the SQL STABLE STRICT SECURITY DEFINER function and revokes PUBLIC execution in one transaction. The search path is fixed to pg_catalog, pg_temp; Payment is schema-qualified and row_security is on. No RLS/table policy, application bypass role, runtime grant or new table/index is introduced. The function initially belongs to the migration executor. That default is not acceptance of its privileges for production.

## Deployment prerequisites — before deploying this application change

A runtime role different from the migration/function owner must receive explicit EXECUTE on this one function. Without it callbacks fail closed. Do not promote this candidate until the actual runtime role can execute the function and hosted signed callbacks pass; do not use a generic table/bypass grant to work around the failure.

Use a dedicated NOLOGIN, NOSUPERUSER, NOBYPASSRLS function-owner role with no application membership. It needs schema USAGE and SELECT only on Payment id, societyId, providerOrderId and provider. It must not own Payment or read payer/amount columns. When forced RLS is enabled, review a SELECT policy for that capability-owner role permitting this routing lookup; row_security=on does not create an allowance. Do not give the runtime role owner-role membership. Provisioning and independent approval remain part of hosted acceptance, not automatic migration behavior.

Operator SQL after provisioning the reviewed owner role (psql identifier variables must name the actual roles):

```sql
BEGIN;
-- Ownership transfer requires CREATE temporarily; the NOLOGIN role has no members.
GRANT USAGE, CREATE ON SCHEMA public TO :"lookup_owner";
GRANT SELECT ("id", "societyId", "providerOrderId", "provider") ON public."Payment" TO :"lookup_owner";
ALTER FUNCTION public.aaraagate_resolve_payment_webhook_order(text) OWNER TO :"lookup_owner";
REVOKE CREATE ON SCHEMA public FROM :"lookup_owner";
REVOKE ALL ON FUNCTION public.aaraagate_resolve_payment_webhook_order(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.aaraagate_resolve_payment_webhook_order(text) TO :"runtime_role";
COMMIT;
```

The RLS policy/role creation is deliberately excluded from that deployment example: it must match reviewed hosted roles and staged policies. Verify all effective/default/inherited ACLs, role membership, function settings, schema CREATE permissions, owner/table-owner separation, exact provider/order behavior, invalid signatures, unknown orders, payload replays and tenant receipt isolation. Restrict database network access and credentials; application authorization still precedes capability use. PostgreSQL guidance: [safe SECURITY DEFINER functions](https://www.postgresql.org/docs/16/sql-createfunction.html#SQL-CREATEFUNCTION-SECURITY).

## Acceptance and remaining scope

The isolated RLS fixture grows from 18 to 22 cases. It instantiates the same migration in its private schema and transfers the function to a NOLOGIN non-owner without superuser/BYPASSRLS, grants only four routing columns and a fixture-only SELECT policy, and grants the caller no owner membership. Cases prove denial before explicit EXECUTE, two-society exact resolution, provider/unknown/null/injection-looking-input negatives, no raw context-free Payment visibility, restricted owner columns/ACL/settings, and resistance to caller temporary-table shadowing. Public policies/roles remain untouched by this isolated fixture.

A new migrated public-schema case runs actual signed callbacks in two societies, checks invoice settlement and stored receipt routing, and repeats each event to verify one capture and a duplicate receipt response. Strict tests bind the app query to the exact capability and deny missing/failed resolution without a fallback. Existing owner/tenant, reconciliation and webhook tests remain required.

The source register now has eight indirect SQL sites: the new site is BillingService.reconcile calling this migration-defined function. Its body is a parameterized, exact providerOrderId lookup on Payment with two routing outputs. Retain that unresolved marker and this mapping; no scanner allowlist hides the exception.

Global worker claimOperations/claimCases remain unconverted. Production runtime/owner grants, policy-enabled hosted acceptance, parent-derived/global records, other domains, private storage and actual provider acceptance remain open. The capability is a narrow global exception, not tenant authorization or production RLS certification.

## Deletion ledger and impact

| Item | Classification / reason | Evidence | Risk | Validation |
| --- | --- | --- | --- | --- |
| Direct global Payment lookup | REFACTOR to exact routing capability | Old extra fields unused by reconcile; processor rereads locked Payment in tenant context | Medium: callback and migration/grants | Signed/unsigned, denied/missing, migrated callback and restricted-owner RLS tests |
| Files, dependencies, existing types and workflows | RETAIN | No removal/upgrade proposed; PaymentWebhookRow remains used by processing/tests | No removal risk | Reviewed diff |

One root SQL call becomes one function call; the indexed lookup remains. No measured latency gain or extra infrastructure is claimed. Deploy migration and reviewed grants before the new application; retain function/grants during code rollback until old/new callback compatibility is confirmed. Never disable RLS automatically to recover. Overall health remains the provisional 7.6 checkpoint, with H27-03/H27-04 still partial.

Local checkpoint: 44 focused webhook tests passed; full API 2,522 passed / 165 database or dedicated Redis cases skipped; risk 316 passed / 5 Redis skips, all floors met. Lint/typecheck/build, 44 domain invariants, SQL/complexity/security/inventory checks passed. Required CI must run all 22 RLS cases, the new migrated callback case and existing payment/finance workflows; no local PostgreSQL acceptance is claimed.
