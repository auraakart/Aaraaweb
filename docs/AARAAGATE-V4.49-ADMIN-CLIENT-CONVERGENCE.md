# Aaraagate V4.49 Admin Client Convergence Closure

## Objective

Complete the remaining Admin JSON transport convergence onto the canonical `apps/admin/lib/admin-client.ts` boundary without changing backend behavior, permissions, schemas, productionization scope or provider-session semantics.

## Closed scope

V4.49 converges the remaining Admin-session pages identified by direct repository reads, including finance, occupancy, audit, onboarding, governance readiness, vendor/procurement, utilities, emergency operations, provider trust, integration readiness, AI Assistant, reports JSON transport, marketplace controls, privacy operations, access integrations, platform providers, waivers, notice metrics, household approvals, finance operations, financial statements, parking permits, platform privacy, society vendors, facilities operations surfaces, advanced parking, governance polls, migration import staging and documents JSON transport.

The repository check now fails if an Admin-session TypeScript surface reintroduces a local `async function api<T>` helper. Direct API-base use is also rejected for Admin-session files except the documented special transport pages below.

## Intentional transport exceptions

These are not convergence gaps:

- `apps/admin/app/migration/page.tsx`: shared JSON client plus direct authenticated CSV evidence download.
- `apps/admin/app/reports/page.tsx`: shared JSON client plus direct CSV export download.
- `apps/admin/app/finance/exports/page.tsx`: shared JSON client plus direct authenticated artifact blob download.
- `apps/admin/app/documents/page.tsx`: shared JSON client plus signed object-storage upload PUTs.

## Separate provider-session boundary

The provider operator surfaces intentionally do not use the Admin session:

- `apps/admin/app/provider/page.tsx`
- `apps/admin/app/provider/media/page.tsx`

They use `aaraagate.provider.session`. Provider Media additionally performs signed object-storage upload PUTs. V4.49 explicitly protects this separation so provider identity is not accidentally folded into society Admin identity.

## Verification

The V4.49 regression contract:

1. checks every explicitly migrated page for shared-client adoption;
2. protects the special blob/signed-upload transports above;
3. scans `apps/admin/app` recursively and rejects local API helpers for Admin-session files;
4. rejects direct Admin API bases outside the documented special transports;
5. asserts the provider workspace/media stay on the provider-session boundary.

## Non-goals

V4.49 does not claim production hosting, live provider/payment integration certification, physical access-control hardware certification, app-store release, or field-pilot acceptance. Those remain external evidence boundaries.
