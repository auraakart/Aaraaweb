# Aaraagate V4.72 — Cross-Domain Handoff & Operator Discovery

Date: 2026-09-28  
Baseline: `develop@6fecb1ac3c97bd7b6f507d6bc99e6ee9915c836d`

## Objective

V4.72 improves operational continuity between already-authoritative domains instead of adding another module. It closes two repository-only usability gaps: an explicit Helpdesk-to-Facilities handoff and a permission-aware Admin discovery surface over the existing universal-search API.

**Productionization remains explicitly excluded.** V4.72 does not promote staging/main, certify hosted environments or providers, claim field adoption, or increase the production-readiness score.

## 1. Controlled Helpdesk → Facilities Handoff

V4.71 linked Helpdesk complaints to Facility Assets for recurrence evidence. V4.72 adds an explicit handoff from an active Helpdesk ticket into the existing Facilities work-order lifecycle.

The handoff has two distinct server actions:

- **Preview** requires both `HELPDESK_REVIEW` and `FACILITIES_READ`.
- **Create** requires both `HELPDESK_REVIEW` and `FACILITIES_MANAGE`.

The preview is read-only. It shows the source ticket, linked asset when present, an existing active work order if one exists, the deterministic corrective-work priority suggestion and blockers. It returns `confirmationRequired:true` and `mutationPerformed:false`.

Creation occurs only after an explicit Admin confirmation. It:
- re-locks and revalidates the Helpdesk ticket inside the transaction;
- rejects resolved/closed tickets;
- reuses the Helpdesk-linked asset when present;
- maps Helpdesk priority deterministically into Facilities priority;
- creates the work order through the existing Facilities truth domain;
- writes an append-only Facilities work-order event;
- writes an append-only Helpdesk activity referencing the new work order.

### Duplicate-active-work protection

The create path uses a PostgreSQL advisory transaction lock scoped to society + Helpdesk ticket. A partial unique database index additionally permits completed/cancelled work-order history but prevents more than one `OPEN` or `IN_PROGRESS` Facilities work order from the same Helpdesk ticket.

The cross-domain foreign key is society-scoped, so a Facilities work order cannot reference a Helpdesk ticket from another society.

**No automatic Facilities work-order creation** is enabled. Triage, recurrence or asset linkage never triggers a Facilities mutation by itself.

## 2. Permission-aware Admin Operator Discovery

The repository already has a permission-aware universal-search service covering members, visitors, invoices, Helpdesk, notices, marketplace services and Facility Assets. V4.72 surfaces that capability inside the authenticated Admin console.

The server remains authoritative for which result types a role may search. The Admin layer adds a second routing boundary: it maps returned records only to Admin surfaces the current role can actually open.

Examples:
- members → resident-management view or occupancy lifecycle when authorized;
- visitors → Gate view;
- invoices → Billing/Finance;
- Helpdesk results → Helpdesk;
- notices → Notices;
- services → Marketplace;
- assets → Facilities.

The Admin UI intentionally does **not** navigate using the shared result `path` blindly because those paths may be resident-oriented. Search results with no valid current-role Admin target are hidden.

**No cross-tenant deep-linking** is introduced. Search remains scoped to the current tenant supplied by the authenticated Admin session, and navigation does not change society context.

## Authority and safety boundaries

- Helpdesk remains the complaint/source-of-request truth.
- Facilities remains the work-order/lifecycle truth.
- Handoff preview never mutates either domain.
- Handoff creation requires explicit confirmation and Facilities-manage authority.
- Database locking + a partial unique constraint protect against duplicate active handoffs.
- Search authorization remains server-derived from permissions.
- Admin routing is a UI convenience layer and never grants backend capability.
- No AI or background process auto-creates work orders from complaint text, recurrence or asset state.

## Verification

Focused coverage includes:
- Helpdesk→Facilities preview semantics;
- dual-domain permission metadata;
- explicit create evidence in both domains;
- duplicate-active-work rejection;
- migration-level society-scoped foreign key and partial unique guard;
- migration-browser fixture continuity for the new Helpdesk detail call;
- semantic search-routing contracts that prohibit blind use of shared result paths.

`scripts/check-v4.72-cross-domain-handoff-discovery.mjs` protects these architectural boundaries without coupling the regression gate to incidental presentation copy.

## External exclusions

V4.72 does not claim:
- hosted staging or production acceptance;
- live provider/hardware certification;
- representative-device or human field UAT;
- real-society outcome improvements;
- production `GO`;
- staging or `main` promotion.

Those remain outside this repository-only cycle.
