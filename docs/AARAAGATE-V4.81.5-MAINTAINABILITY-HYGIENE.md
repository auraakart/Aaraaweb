# Aaraagate V4.81.5 — Maintainability, Repository Hygiene & Governance Closure

Date: 2026-10-06  
Status: Repository implementation candidate on `develop`.

## Objective

V4.81.5 converts the V4.81.4 health-check recommendations into one bounded repository-maintenance release. It deliberately avoids new product-domain scope and concentrates on keeping the existing Aaraagate platform safe to extend.

Production hosting, PostgreSQL RLS activation, live provider credentials, signed store release and real society pilot acceptance remain outside this repository-only milestone.

## 1. Hotspot decomposition

The highest-growth orchestration files are reduced without changing their public controllers or product authority:

- `AmenitiesService`: booking creation and booking-specific no-show eligibility move to `AmenityBookingCreator`.
- `AiAssistantService`: society finance, gate, security, facilities, vendor, governance, discovery and resident status-support queries move to `AiSocietyInsights`.
- `BillingService`: maintenance and amenity-deposit payment-order preparation move to `PaymentOrderService`.
- `ResidentDataController`: visitor-invite in-flight/idempotency coordination moves to `ResidentGuestInviteCoordinator`.

The guarded hotspot ceilings are tightened to:
- AmenitiesService: 1050 lines
- AiAssistantService: 580 lines
- BillingService: 425 lines
- ResidentDataController: 850 lines
- GuardOperationsScreen: 360 lines

These are maximum growth boundaries, not target sizes.

## 1.1 Historical contract extraction resilience

The first protected validation pass exposed the underlying cause of repeated milestone-check delays: historical source-contract scripts were reading large orchestration files directly and therefore treated safe extractions as missing behavior. Fixing those scripts one by one would repeat on every future decomposition.

V4.81.5 therefore introduces `scripts/lib/source-contract-bundles.mjs` as the stable logical source boundary for Amenities, Billing, AI Assistant and Resident controller contracts. Historical checks read the logical bundle rather than assuming a token must remain in one physical file. `check-source-contract-extraction-resilience.mjs` runs first in the stable-domain suite and fails any future historical V4 checker that directly reads one of these decomposable hotspot files. New extractions now require one bundle update instead of a cascade of stale milestone-script repairs.

## 2. Risk-coverage uplift

Existing green evidence allowed conservative floor increases without manufacturing coverage:

- ResidentDataController: 40% → 42%
- GuardController: 35% → 38%
- API SessionService: statements/lines 25% → 30%, branches 25% → 28%
- API AI Operations: statements/lines 30% → 35%, branches 30% → 32%, functions 25% → 30%

Existing end-to-end and regression suites remain authoritative for behavior.

The focused API risk suite is also explicitly aligned with its raised floors: SessionService lifecycle security, the broader AiOperationsService suite, PrivacySelfController authorization/method delegation, and PaymentAvailabilityService's empty-result fallback are part of the coverage evidence. This prevents future threshold changes from depending on incidental coverage or on tests that the focused configuration does not execute.

Because visitor-invite orchestration moved out of ResidentDataController, its file-local coverage no longer receives incidental lines from that workflow. The risk-weighted Resident CI set therefore explicitly includes family-member recovery, emergency-contact recovery, workforce lifecycle and notice-acknowledgement tests before enforcing the raised controller floor.

## 3. Branch hygiene closure

The previous cleanup rule preserved any branch whose name contained words such as `recovery`. That was too broad because ordinary completed feature branches frequently contain that word.

V4.81.5 narrows automatic preservation to branches whose names begin with an explicit disaster-recovery class: `backup`, `recovery`, `archive` or `snapshot`.

Seven previously manual-review branches now have exact-SHA supersession evidence in `.github/branch-superseded.json`. A branch is eligible for deletion only while its head still equals the reviewed SHA. Any branch movement invalidates that evidence and returns it to review.

The scheduled/merged-PR Branch hygiene workflow remains the mutation authority. V4.81.5 does not bulk-delete unknown source.

## 4. Dependency-risk evidence

Dependency CI now emits machine-readable audit details through `scripts/check-dependency-risk-budget.mjs`.

The protected audit initially exposed newly published advisories in the previously green lockfile. V4.81.5 patches those paths to proxy-addr 2.0.8, source-map-js 1.2.2, brace-expansion 5.0.12, multer 2.4.0 and path-scoped uuid 11.1.1 overrides for the legacy gaxios 6.7.1, google-gax 4.6.1 and teeny-request 9.0.0 chains.

The release budget is now:
- critical: 0
- high: 0
- moderate: 0

NestJS and Prisma major upgrades remain coordinated cohorts. V4.81.5 does not perform an unsafe partial major migration.

## 5. Release and Git governance

Live GitHub repository state was verified on 2026-10-06:

- `develop` ruleset is active and requires Repository structure, API validation, Admin validation, Flutter validation and Dependency security.
- `staging` ruleset is active and requires Staging API smoke.
- `main` ruleset is active, has no bypass actors, requires the five engineering checks, one approving review and last-push approval.

Therefore no branch-protection source change is required.

The repository is currently public and has no software license file. V4.81.5 does **not** invent a license or change repository visibility because that is an owner/legal policy decision rather than an engineering assumption. The production tracker must retain that decision as an explicit pre-production governance item.

## 6. Release identity

- Root/API/Admin: `4.81.5`
- Resident/Guard: `4.81.5+48105`

## Promotion discipline

V4.81.5 must pass protected validation and merge to `develop` through one squash commit. The exact validated develop tree may then be promoted to `staging` through one governed staging release commit. `main` remains unchanged until explicit owner approval and the protected main review flow.


## Post-V4.82 repository health revalidation — 2026-10-06

After V4.82 product/staging closure and staging-controller race hardening, repository health was revalidated before branch cleanup.

- Canonical branches `develop`, `staging` and `main` remain protected by active repository rulesets.
- Open pull requests: 0.
- Open issue scope remains the intentional production-operationalization tracker (#212).
- Repository branch count before cleanup: 36.
- The backup branch remains preserved by the explicit disaster-recovery naming rule.
- The 24 exact-SHA legacy entries in `.github/branch-retention.json` remain preserved pending explicit source reconciliation.
- Five older recovery branches remain **review-only** because their current heads contain commits not proven integrated into canonical history:
  - `feature/v4.68-emergency-contact-recovery-20260928`
  - `feature/v466-household-request-recovery-20260928`
  - `feature/v466-vehicle-request-recovery-20260928`
  - `feature/v4641-visitor-invite-recovery-20260927`
  - `fix/v4651-family-approval-recovery-20260928`
- The following V4.82 branches are safe for hygiene deletion because their exact heads are represented by merged canonical pull requests:
  - `mastermind/v4.82-competitive-resident-operations-depth` — merged PR #1065.
  - `mastermind/v4.82-staging-controller-race-hardening` — merged PR #1068.
  - `release/v4.82-staging-candidate` — merged PR #1067.

Cleanup remains delegated to the repository's `Branch hygiene` workflow so deletion is exact-SHA/ancestry/tree-evidence based. Unknown or moved branches must remain in review rather than being bulk-deleted.


### Cleanup execution note

Develop PRs are normally auto-merged by GitHub Actions. GitHub intentionally does not start a second workflow from events emitted by its own `GITHUB_TOKEN`, so an Actions-origin merge does not invoke the `pull_request: closed` Branch Hygiene workflow. For explicit on-demand cleanup, this documentation-only PR is intended to be merged through the authenticated repository connector after required checks pass. The resulting user-authenticated merge event is then allowed to invoke the current Branch Hygiene workflow, which remains the only deletion authority.
