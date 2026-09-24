# Aaraagate V4.52 — Competitive Excellence Convergence

Date: 2026-09-24  
Target: software/product depth beyond V4.51.1. Productionization and physical hardware integration remain explicitly outside this milestone.

## Objective

Raise the strongest remaining software-only competitive gaps without duplicating capabilities that already exist and without converting assumptions into product claims. V4.52 is evidence-driven: every new claim below is tied to code, tests or a repository contract.

## Slices

1. **Provider-neutral AutoPay readiness**
   - Adds an owner/current-tenant scoped AutoPay preference lifecycle per property.
   - Supports an optional payment cap and debit-day preference in the domain contract.
   - Persists provider/mandate fields for future integration, but the current application returns `automaticDebitAvailable:false`.
   - A saved preference is not treated as a mandate, payment, debit or successful collection.

2. **Deterministic watchlist assessment**
   - Screens active society watchlist records by exact normalized name, phone or vehicle metadata.
   - Returns `DENY`, `REVIEW` or `CLEAR`.
   - `DENY` stops Guard intake before a resident approval request is created.
   - `REVIEW` requires an explicit operator decision before continuing.
   - The assessment does not infer identity and performs no automatic access-state mutation.

3. **Resident Action Inbox**
   - Consolidates deterministic resident urgency into Act now / Soon / Info counts.
   - Includes a pending gate approval in the immediate-action count.
   - Adds a semantic live-region summary while preserving the existing Home/Gate/Services/Community/Profile navigation and non-duplicating Quick Actions.

4. **Privacy program readiness**
   - Reports missing recorded legal-basis/retention fields, processor agreement references, grievance-contact state, overdue privacy cases and open privacy/security incidents.
   - Provides deterministic next actions.
   - The boundary explicitly states that operational readiness does not certify statutory compliance, legal validity or jurisdiction-specific acceptance.

5. **Service continuity posture**
   - Derives Stable / Watch / At risk from recorded critical alerts, overdue facility work, expiring service contracts and open operational alerts.
   - Provides next actions from current evidence.
   - It is explicitly current-state evidence, not predictive reliability or physical-equipment certification.

6. **AI evidence-quality contract**
   - Every Action Centre card exposes source count, current-query-snapshot basis and `causalClaim:false`.
   - “Likely cause” is explicitly presented as a deterministic signal interpretation, not causal proof.
   - No numerical confidence score is invented.
   - Existing permission, tenant-scope, prompt-injection and non-mutating boundaries remain intact.

## Existing capabilities deliberately not duplicated

V4.52 does not rebuild move-in/move-out lifecycle, consent/self-service privacy, preventive maintenance, society watchlists, Resident urgency, accounting evidence or grounded Action Centre workflows. Those capabilities already exist and are extended only where a concrete gap was demonstrated.

## Verification

The milestone adds focused API tests for AutoPay preference authorization/truth boundaries, watchlist assessment, privacy readiness and facilities continuity. Guard UI regression coverage verifies that an exact `DENY` match prevents creation of a resident approval request. The V4.52 repository contract verifies that the truth boundaries and UI evidence remain present, in addition to the existing API, Admin, Flutter, migration and dependency-security suites.

## Scoring boundary

V4.52 targets software/product capability gaps that affected the earlier competitive scorecard. It **does not claim a 9.5+ score merely because code exists**. Any re-score must be based on the implemented repository evidence after CI and must continue to exclude production/market proof and physical hardware integration when those categories are intentionally out of scope.

## External boundary

No live payment-mandate provider, automatic debit executor, physical gate device, telephony provider, hosted deployment, external compliance certification or market adoption is claimed by this milestone.
