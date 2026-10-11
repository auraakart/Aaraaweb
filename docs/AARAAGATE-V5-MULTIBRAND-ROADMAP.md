# Aaraagate V5 Multi Brand and White Label Development Roadmap

**Document version:** 5.0.0
**Workstream:** Aaraagate V5, a bounded non-production development program
**Review date:** 11 October 2026, Asia/Kolkata
**Repository:** auraakart/Aaraaweb
**Reviewed develop snapshot:** `4e3bc2e4af4e3f597557d119586d7ce60462d348`
**Snapshot commit:** `fix(android): reduce demo APK and verify Android package integrity (#1206)`, 11 October 2026 at 13:42 IST
**Status:** Development authorized by the owner on 11 October 2026. V5.0.1 foundation merged with protected checks; V5.0.2 inventory and V5.1.0 ownership/compatibility foundation merged with all protected checks passed; later milestones remain planned. Staging/main promotion is separate; main requires explicit owner approval.
**Scope:** Engineering, automated tests, local/test-environment demonstrations and build artifacts. Productionization excluded.

## 1. Recommended product and architecture decision

Extend the existing modular monolith and monorepo with a shared brand control plane. Keep societyId as the operational data-isolation boundary; add partner ownership as a separate commercial and administrative boundary. A brand is presentation and distribution configuration, never an authorization principal. Retain Aaraagate as the default brand and preserve existing users, workflows, APIs and app identities.

Deliver two offerings in sequence:

| Offering | User experience | Packaging | Commercial boundary |
|---|---|---|---|
| Society Branding | Society name, logo, approved accent palette and support information inside Aaraagate | Existing resident/guard apps and shared admin portal; no society-specific binary by default | Existing society subscription plus optional branding entitlement |
| Partner White Label | Partner name, theme, portal hostname and optional partner Android apps; society identity remains visible | Same Flutter sources and one shared web deployment; package-specific Android resources generated from a manifest | Partner contract, portfolio scope, licensed capabilities and society allocations |

Avoid forks, partner-specific controllers, copied screens, separate databases per brand and always-on build servers. Separate Resident and Guard apps remain because they serve different roles; share the new branding/configuration implementation without rewriting their business workflows.

The owner has assigned this entire workstream to Aaraagate V5 in the existing Aaraaweb repository. Track it in docs/v5-release-manifest.json. Existing V4 application versions remain unchanged until a consolidated V5 candidate is approved; program version and distributed application version are separate. Do not reopen the closed Services 3.1 workstream or turn branding into a Finance expansion.

## 2. Evidence and review limits

This is a targeted architectural review of the exact develop snapshot, not a complete security audit or runtime certification. Read the repository tree, current architecture documentation, Prisma schema, authentication/session/permission paths, entitlements, themes, admin root layout, packaging workflows and live GitHub rulesets. The original planning review ran no application tests. V5.0.1 implementation validation is recorded separately below. Live provider behavior, device behavior, database role grants and installed database policies were not inspected.

The attached August 2026 product specification was read as historical requirements. Its recommended architecture agrees with the current stack, but its proposed Organization and Subscription entities are not evidence that those entities now exist. The attached image was inspected; it is an old GitHub main-branch screenshot and does not establish current implementation state.

### Current architecture and gap assessment

| Area | Verified repository evidence | Gap and required response | Priority |
|---|---|---|---|
| Stack | README: Flutter Resident/Guard, Next.js Admin, NestJS modular monolith, PostgreSQL, Redis, object storage, FCM, REST `/api/v1` | Extend existing modules; no new service deployment | P0 |
| Society tenancy | SocietyMembership; societyId throughout operational models; TenantGuard requires session society context | Partner association and resource-level portfolio checks must supplement society checks | P0 |
| Identity | User has globally unique phone/email; session stores nullable societyId; roles reloaded from active membership | Preserve shared identity; add app audience and explicit partner context without cloning user accounts | P0 |
| Independent homes | USER-CONTEXT-MODEL and session service preserve society-less external-services users | White-label defaults must not infer society access or silently remove independent-home behavior | P0 |
| Permissions | PermissionsGuard enforces granular permission checks and explicit gate-role segregation of duties | Add partner permissions in a separate scope; partner admins must not inherit SUPER_ADMIN privileges | P0 |
| Database enforcement | PrismaService.withTenantContext sets transaction-local `app.aaraagate_society_id`; comment explicitly says it does not enable RLS | Route protected access through scoped transactions and add tested policies; do not claim current RLS coverage | P0 |
| Entitlements | Society.productTier, featureOverrides and EntitlementService.current | Existing boolean overrides can enable features outside tier; add commercial ceilings without changing legacy effective rights unexpectedly | P0 |
| Branding | Resident/Guard theme constants; admin brand-tokens.css; root metadata says Aaraagate Admin | Introduce validated runtime brand config and adapters, retaining default theme equivalence | P1 |
| Configuration | packages/config holds API prefix and admin session key conventions | Add versioned public config contract, not secrets or arbitrary scripts | P1 |
| Branding guard | check-product-branding.sh rejects AaraaPlatforms in product UI | Preserve default-product check and add manifest-aware partner checks; avoid broad global string replacement | P1 |
| Android builds | Demo APK and signed Resident AAB workflows generate Android wrappers during CI; AAB main-only and dispatch-driven | Share validated generation/build steps; parameterize identity/resources/secrets; add Guard packaging coverage | P1 |
| Push | DevicePushToken has globally unique token and society/user scope | Explicit app-distribution audience, Firebase application mapping and cross-brand routing tests | P0 |
| Partner lifecycle | No dedicated Partner/Brand/Subscription model in the inspected Prisma schema; no brand control module identified in tree | Build a bounded commercial control plane; do not imply a ready licensing engine | P1 |
| Governance | Live active rulesets for develop/staging/main and REPOSITORY-GOVERNANCE.md | Preserve required checks and promotion policy; no repository mutations in this review | P0 |

Preserve occupancy-derived gate routing, non-resident owner versus occupant payment notifications, either permitted payer paying, admin broadcast audience controls, existing services pricing/consent constraints, privacy workflows and audit history. Branding must not change these domain rules.

## 3. Scope and non-negotiable boundaries

Included: runtime themes; brand profiles/assets/revisions; partner membership and portfolio ownership; licensing and subscription state calculation; optional branded Android artifact generation; custom-domain registration/verification contracts; local/test hostname routing; security and migration tests; developer documentation and rollback rehearsals.

Excluded: production hosting, DNS purchases or live changes, production TLS issuance, payment collection for licenses, taxation implementation, live SMS/email/FCM provisioning, store publishing, legal contract execution, partner onboarding in production, real society migration, iOS rollout, hardware integrations and provider-specific infrastructure changes. Android signing adapters and test-signed artifacts are included; live credentials and commercial app distribution remain a separate authorized release activity.

No brand may alter financial calculations, authorization, required audit fields, gate verification, emergency semantics, consent controls or privacy safeguards. Configuration can choose approved features and presentation, not execute code or inject UI layouts.

## 4. Multi-brand architecture and resolution rules

### Distinct identifiers

- `societyId`: existing operational tenant; mandatory for society workflows.
- `partnerId`: owner/operator of a portfolio and contractual entitlements; derived from verified society ownership or partner membership.
- `brandId`: presentation identity; includes built-in Aaraagate and partner brands.
- `appDistributionId`: immutable application audience/Android identity; separate resident and guard entries.
- `configRevision`: immutable published configuration revision and digest.

Recommended relationship: Partner has many Societies and permitted Brands; Society has exactly one current commercial owner, with an explicit built-in Aaraagate owner. AppDistribution references a permitted Brand and fixed application identity. Society operational records continue using societyId; avoid duplicating partnerId onto every existing row and creating inconsistent ownership copies.

Public hostname or client-supplied brand identifiers resolve a candidate presentation only. Authenticated access then checks app audience, session, active membership, society ownership and requested resource. Neither a branded APK nor a hostname is proof of partner membership.

### Resolution and precedence

1. Built-in Aaraagate config provides a complete fallback.
2. Registered app distribution or verified hostname selects the presentation brand.
3. Selected society's published overrides apply only to fields the owning brand permits.
4. Device preferences choose language, accessibility and light/dark mode within approved tokens.

Partner-branded apps may display only their allowed portfolio. The default Aaraagate app retains existing cross-society property selection, including societies owned by partners, subject to normal membership. A user with homes across partners can use the default app; a partner app offers its scoped portfolio and an explanatory handoff for other homes. Do not expose inaccessible partner membership lists. Society-less external-services access remains on Aaraagate; enable it in a partner distribution only through an explicit licensed policy.

Store app audience in server-created sessions. Existing sessions resolve to the legacy Aaraagate audience. App client IDs are public identifiers, not secrets or device-attestation substitutes. For custom web domains use host-bound sessions and host-only cookies; never share cookies across unrelated partner domains. This is a target design, not a claim about current browser token storage. Preserve the existing default portal login during an explicitly tested session-storage transition; namespace any retained local storage by origin, audience and context, and never copy tokens between hosts.

### Feature calculation

For new partner-managed subscriptions:

`effectiveFeatures = platformSafetyAllowlist ∩ partnerLicenseAllowlist ∩ societySubscriptionAllowlist ∩ societyOperationalAllowlist`

User permissions and relationships then determine what actions within those features are allowed. A theme, navigation item or brand manifest cannot grant capability. Reuse EntitlementService and FeatureGuard; add a resolver rather than an independent feature framework.

Legacy societies use a compatibility subscription grant that preserves their exact pre-migration effective feature set, including authorized overrides. Only an explicitly approved commercial transition moves them to new limits. Unknown keys are rejected on writes; old clients ignore optional unknown fields. Disabling a feature defines read/history access, in-progress workflow completion and background-job behavior; it does not merely hide a menu.

Safety and grace behavior must be policy-driven. Partner license expiration must not automatically mark Society.status SUSPENDED, revoke residents en masse or disable essential gate/SOS functions. Preserve the existing explicit society suspension semantics. Define contractual grace/limited mode separately from fraud/security suspension.

## 5. Database technical specification

Extend `services/api/prisma/schema.prisma` and additive migration files. Names below are proposed, not current tables.

| Entity | Minimum fields and constraints | Purpose |
|---|---|---|
| Partner | UUID id; unique slug; displayName; status; timestamps | Platform-owned portfolio operator; built-in Aaraagate partner |
| PartnerMembership | partnerId, userId, scoped role, active; unique partner/user/role | Explicit partner administration, independent of SocietyMembership |
| Society extension | required partnerId with constant built-in default; ownershipVersion | V5.1.0 additive default preserves old-server INSERTs; atomic fixture-reconciled cutover |
| SocietyPartnerTransfer | societyId, old/new partner, approvedBy, effectiveAt, reason, status | Controlled transfer and immutable history |
| BrandProfile | id, partnerId, unique slug, displayName, status | Ownership and editable profile identity |
| BrandRevision | brandId, monotonic version, schemaVersion, validated config JSON, digest, state, actor, timestamps | Immutable draft/validated/published/retired snapshots; unique brand/version |
| SocietyBrandRevision | societyId, version, approved override JSON, baseBrandId | Society identity and permitted override history; separate from domain policy |
| BrandAsset | owner scope, opaque object key, mime, size, checksum, processing status | Validated image assets with no arbitrary external fetch |
| AppDistribution | brandId, role surface, unique applicationId, immutable signing reference/fingerprint, allowed portfolio policy, status | Fixed Android/application audience; secrets stored externally |
| BrandDomain | normalized unique hostname, brandId, status, hashed verification challenge, verification/expiry timestamps | Unique verified hostname ownership and routing |
| LicensePlanRevision | immutable code/version, features, limits, billing basis | Reproducible contractual capability definition |
| PartnerLicense | partnerId, plan revision, startsAt/endsAt, state, graceUntil, capacity allocation | Portfolio ceiling, commercial lifecycle |
| SocietySubscription | societyId, plan/grant revision, dates/state, legacy grant, entitlementVersion | Society-level allocation; distinct from maintenance billing |
| LicenseEvent | license/subscription scope, idempotency key, event type, actor, timestamp | Auditable changes and simulated payment-event adapter |
| BrandBuild | distributionId, source SHA, config digest, toolchain, versionCode, artifact digest, signing fingerprint, status | Provenance and serialized version allocation |

Avoid generic polymorphic foreign keys where they remove referential integrity. Use separate partner/society relationships or explicit checked ownership columns. Critical relational fields stay typed; JSON is bounded, schema-validated presentation or feature configuration only.

Indexes: Society(partnerId,status); PartnerMembership(partnerId,userId,active); revisions(owner,version); subscriptions(societyId,state,endsAt); licenses(partnerId,state,endsAt); normalized unique hostname; distribution applicationId unique; builds(distributionId,versionCode) unique. Operational queries retain societyId-leading indexes; add indexes only with query-plan evidence.

New child records must use composite foreign keys or equivalent transaction-enforced ownership checks. For example, references to brand revisions must include a validated same-partner association. Existing cross-society parent/child relationships require an inventory and gradual composite-FK hardening after orphan detection; do not enable constraints blindly over legacy data.

Licensing money, if recorded for simulations, uses integer minor units plus currency; capacity uses checked non-negative integers; periods use UTC timestamps with explicitly documented exclusive end boundaries. Historical maintenance invoices and services bookings remain untouched.

### Migration protocol

Expand schema → deploy compatible readers in test environment → idempotent bounded backfill → reconcile counts/ownership/features → enforce new constraints → activate new resolver for opted-in test fixtures. Record pre/post effective features for every fixture society. No destructive renames or historical invoice rewrites. Test new server with old clients and old server with additive schema before advancing.

Partner transfer is a platform-authorized transaction: validate capacity/brand/domain/distribution consequences; change society association and ownership version; revoke affected partner administration access; invalidate caches; reroute future notifications; retain history and society memberships. A queued task validates current ownership at execution so the old partner cannot see results. Initially disallow automated transfers with unresolved contractual conflicts.

## 6. RBAC and strict tenant isolation

| Principal | Permitted control-plane scope | Operational data access |
|---|---|---|
| Existing platform Super Admin | Partner lifecycle, grants, distribution approval, transfers | Existing explicit platform capabilities retained and audited; no new gate execution authority |
| Partner Owner | Own partner profile, member management and allowed allocation | No automatic resident/finance/gate access |
| Partner Brand Manager | Own draft assets/config and approved publication rights | None from brand role |
| Partner Commercial Admin | Own license/subscription metadata and limits | No society ledger or resident PII by default |
| Partner Support | Scoped support case metadata | Explicit time-limited society support grant; no blanket impersonation |
| Society Admin | Own society brand overrides and existing administration | Current society permissions only |
| Resident/Owner/Tenant/Guard/Provider | Existing role-specific surfaces | Existing membership, occupancy and resource checks unchanged |

Permissions should include `partner.members.manage`, `partner.brand.edit`, `partner.brand.publish`, `partner.subscription.allocate`, `society.brand.manage`, `distribution.build.request` and `domain.verify`. Separate edit/publish and allocation/approval where commercial impact requires review. Map existing roles carefully; never add partner permissions to the current SUPER_ADMIN-all-permissions helper without scope tests.

Every read/write must validate resource scope, including list counts, search, exports, reports, AI tool calls, WebSocket subscriptions, push registration, storage downloads, idempotency receipts and background jobs. Use 404-style non-disclosure for inaccessible resources, consistent with existing API policy. No trusting `X-Partner-Id`, route partnerId, hostname, QR content or cached client context.

### Database enforcement plan

The inspected helper is preparatory; complete database enforcement before declaring strict-isolation acceptance. Keep explicit service authorization as well as RLS.

- Build an inventory of every operational table/query, raw SQL path, nested relation, global entity and asynchronous worker. Route society operations through the existing transaction-local context helper; require the supplied transaction client for all queries in that operation.
- Add policies with both USING and WITH CHECK against societyId, default-denying missing context. Application role must be non-owner, non-superuser and without BYPASSRLS; use FORCE RLS where relevant. Migration credentials are separate and unavailable to runtime.
- Global User, session authentication, shared provider/catalogue records and partner control-plane queries require explicit scoped repositories/policies. Do not apply a universal society predicate that breaks independent homes or multi-property context discovery.
- Partner administrators do not receive portfolio-wide RLS access to operational rows. Explicit society support grants use a selected society context; scoped aggregate reports expose only approved fields.
- RLS settings constrain accidental unscoped queries; they do not replace authentication or protect against arbitrary SQL execution. Parameterize SQL and eliminate unsafe execution paths.
- Enable policies table-by-table after converting all consumers, with paired API/database integration tests. Full operational coverage or documented equivalent controls for global entities is a release requirement, not an assumption.

Test pooled-connection reuse, missing/invalid context, cross-society INSERT/UPDATE/nested connect, transaction rollback and workers. Cache keys include audience, partner ownership version, societyId, user/permission scope and config/entitlement version where relevant. Never use brandId alone for operational caches. Storage is logically scoped and signed URLs authorize each request; public branding assets are separated from private evidence. Public logo revisions may be world-readable; operational files may not.

## 7. API contracts

All additions remain under `/api/v1`; preserve current response shapes and routes. New DTOs reject unknown writable fields, impose size limits and use explicit enum/UUID validators. Add contracts to packages/types and packages/api-client; generate Dart DTOs from the same schema where practical, without moving unrelated domain code.

| Proposed endpoint | Access and behavior |
|---|---|
| GET `/branding/bootstrap` | Minimal public identity only; registered client/verified hostname candidate; no society roster, license secrets or private contacts |
| GET `/context/config` | Authenticated selected context; effective theme/features, revision/ETag and safe support metadata |
| GET/POST `/platform/partners` | Platform authority; create/list partners with audit and idempotency |
| PATCH `/platform/partners/:id` | Platform lifecycle changes; version precondition |
| GET/POST/PATCH `/partners/:id/members` | Explicit own-partner membership permissions; bounded listing and invitation lifecycle |
| POST `/partners/:id/brands/:brandId/revisions` | Draft creation; own scope, validated payload |
| POST `/partners/:id/brands/:brandId/revisions/:version/publish` | Publish permission; If-Match/current version; immutable event |
| POST `/societies/:id/branding/revisions` | Current society admin; allowlisted override fields only |
| POST `/partners/:id/domains` and `/:domainId/verify` | Ownership challenge; no routing activation until verification succeeds |
| GET/POST `/partners/:id/licenses` | Reads scoped; contract grants platform-only; simulated lifecycle adapter |
| POST `/partners/:id/societies/:societyId/subscription` | Allocation within verified portfolio and license capacity |
| POST `/platform/societies/:id/partner-transfer` | Platform authority; explicit audited transfer preconditions |
| POST `/partners/:id/distributions/:distributionId/builds` | Authorized build request for approved immutable inputs; job request, not an API process invoking arbitrary shell |

Effective config fields: schemaVersion, revision, brand identity, society identity, token sets, asset references, feature flags with disabled reasons, app audience and allowed support URLs. Omit financial/legal/provider secrets. Server capabilities remain authoritative even when a stale client config is cached.

Use If-Match or an explicit expectedVersion for edits, returning 409/412 for conflict according to contract; idempotency keys for create/publish/allocation/build actions scoped by actor and owner; UTC timestamps; structured errors. Unknown/unverified custom hosts fail closed. The canonical default host/app may use Aaraagate fallback; an unknown custom host must not silently become another tenant.

## 8. Dynamic branding in Flutter and admin

Runtime fields: display names, logo/wordmark, selected accessible primary/accent tokens, approved support details, portal metadata and feature visibility. Native fields: Android applicationId, launcher icon/label, native splash resources, signing identity, app links and Firebase client configuration. Native identity changes require a new artifact; runtime logo/color changes do not.

Create a narrow shared Dart branding/config package consumed by Resident and Guard. Adapt the existing AaraagateTheme/AaraagateGuardTheme factories to accept validated tokens with exact default values; retain Guard's larger operational controls. Web uses validated CSS custom properties and request-scoped metadata in the existing root/layout shell. Never accept arbitrary CSS, HTML, JavaScript, unrestricted fonts or remote layouts.

Feature visibility uses existing navigation conventions. Retain Home, Gate, Services, Community and Profile as the default resident bottom navigation; preserve Staff, Billing, Amenities and Helpdesk quick actions and Home assistant placement. Disabled optional modules show a consistent availability state without duplicating destinations. No theme redesign or unrelated premium UI work is bundled.

Switching property/partner context must cancel or invalidate old requests, close subscriptions, clear scoped state and atomically install new config. Ignore responses from the previous context generation. Pending offline gate mutations retain their original society/gate context and must never be replayed into a newly selected society.

Cache last validated public theme per audience and society with revision/digest. Corrupt or unavailable theme falls back to built-in Aaraagate presentation on recognized clients; it cannot grant features. Online API authorization revalidates current rights; offline modes retain existing permission expiry and safe-operation restrictions. Define entitlement cache freshness separately from cosmetic cache lifetime.

Validate light/dark token pairs, ordinary-text contrast at least 4.5:1, focus states and semantic colors. Emergency/error/success colors and gate statuses are fixed semantic tokens, not partner-editable. Support large text, TalkBack, reduced motion and existing minimum touch sizes. Test unusually long partner/society names and missing/transparent logos.

BrandAsset accepts bounded PNG/JPEG/WebP inputs, validates actual bytes, strips metadata and re-encodes. Reject active SVG content unless a later explicit sanitization implementation is approved. Provide upload/preview/publish/history/revert workflows; preview drafts only for authorized editors and never let draft SSR responses enter public caches.

Branded invoices/receipts and notifications need controlled display adapters. Existing invoice content, legal issuer, amounts and immutable original artifacts stay unchanged; future renderings snapshot brand revision. Commercial brand and legal payee/issuer are separate fields. Do not rebrand provider guarantees into partner underwriting promises.

## 9. Partner management licensing and domains

Partner lifecycle: draft → approved → active → restricted → terminated, with explicit reinstatement and transfer rules. Include portfolio counts, scoped member invitation/revocation, draft brand previews, license status, allocation and build history in existing admin routes/components. Reuse existing PageShell/form/status/action patterns after confirming current component locations.

Licensing is contractual capability management, distinct from repository software licensing and society maintenance payment collection. Start with manually granted plans and deterministic simulated billing events. Specify monthly/annual periods, flat/society capacity basis, maximum branded distributions, optional domain limits, renewal, grace, suspension, cancellation and grandfathering. No price is invented in this plan. Product owner sets commercial terms before implementation of priced screens.

Use transactional capacity reservations and idempotent changes to prevent two simultaneous allocations exceeding a partner limit. Downgrades report affected allocations and require a migration/grace decision. An event with an old sequence number cannot reactivate expired grants. A platform kill switch can disable a broken optional capability, with audit and a recovery policy.

Custom domains use one shared web deployment and a domain registry. Normalize lowercase/IDNA hostnames, reject IPs/wildcards/invalid ports, reserve canonical/internal names, require a fresh DNS TXT proof, and enforce unique ownership. Resolver accepts forwarding headers only from a configured trusted proxy. Exact host checks precede session/config rendering; domain ownership does not authorize API data.

Implement an injectable DNS verifier with deterministic tests; do not modify live DNS. Verification outbound access must be constrained; never fetch arbitrary URLs or private-network destinations. Unverified/deleted/expired domains do not route. Transfer/reclaim requires fresh proof and invalidates old sessions. Add per-host CORS, CSRF/origin validation, redirect allowlists, host-only cookies and app-link association metadata contracts. Local test hostnames exercise SSR isolation; live DNS/TLS/assetlinks hosting is deferred.

The public repository currently has no software license according to repository governance. Record who owns partner brand assets, Android identifiers, signing keys, distribution rights, data-controller duties and exit/export obligations as decision dependencies. Do not assume public code visibility grants white-label resale rights.

## 10. Automated APK AAB builds and CI CD

Extend the current workflows without changing default main-only demo publication or signed release restrictions. Centralize reusable build logic for Resident and Guard; no duplicated partner workflow files.

An approved manifest includes brand/distribution IDs, fixed applicationId and namespace, app role, label, validated asset digests, environment/API allowlist, Firebase public client reference, app-link hosts, config revision, source SHA, build mode and signing-profile reference. It contains no private key, token or password. Generate only native resources/config in an isolated temporary workspace; application business sources stay unchanged.

Pipeline:

1. Validate manifest, approved source SHA, brand ownership, app identity and signing profile.
2. Reserve a strictly increasing versionCode per distribution; failed allocations are not reused. Preserve existing default app's sequence and version policy.
3. Install pinned repository toolchain/locked dependencies and generate the Android wrapper using the existing approach plus reproducible templates; fail if generated structure differs unexpectedly.
4. Generate labels/icons/splash/manifest/Gradle settings/Firebase client config; validate native package/application identity and deep-link hosts.
5. Analyze/test common code once per SHA, then run selected brand/app packaging and smoke tests. Require full default regression plus representative partner configurations at milestones.
6. Build APK and AAB. Demo/test and release modes are separate; reject demo flags/fixtures in release artifacts. Validate archives, ABI coverage, package/SDK/version metadata, signatures and expected fingerprints.
7. Produce provenance: SHA, config/assets digests, toolchain/lock digests, build mode, distributionId, versionCode, artifact checksums and signer fingerprint. Store artifacts with bounded retention and scoped access.
8. Delete temporary signing materials with an always-run cleanup step. No publishing or branch mutation in the development artifact job.

Use approved inputs, not arbitrary script fragments or secret names supplied by partner editors. Build dispatch is platform-controlled or validated through a trusted queue adapter; CI independently revalidates all references. Untrusted PR jobs cannot access signing secrets. Test keys may prove pipeline separation; genuine release signing requires separate release authorization and managed credentials.

Default strategy is one Aaraagate Resident and one Aaraagate Guard distribution. Add dedicated partner apps only when contract value justifies extra build, push/app-link and update maintenance. Do not build every society/brand on every commit. Use bounded on-demand matrices and shared dependency caches; signing credentials never enter caches. Distinct distributions have distinct signing references and artifact names to prevent partner collisions.

Android application identity and signing continuity are immutable update concerns. Verify the existing default identity from an actual artifact before editing templates, because native wrappers are generated rather than stored at the fetched path. Package changes create a separate installed app; they do not migrate local data automatically. Store publishing and signing ownership agreements are outside this workstream, but their contract fields and validation are prerequisites for a distributable brand artifact.

CD within this plan means test-environment validation and promotion readiness evidence only. Existing `feature/* → develop → staging → main` governance remains authoritative; this plan performs none of those promotions.

## 11. Security scalability and cost controls

Primary threats: brand spoofing, host-header poisoning, partner/society BOLA, excessive admin privileges, poisoned theme assets, cross-host SSR/cache leaks, push delivery to the wrong app, licensing over-allocation, build-input injection, signing-secret exposure, partner transfer races and stale offline context.

Mitigations: server-derived context; explicit scoped grants; deny-by-default checks; RLS plus service checks; strong relational ownership constraints; host registry; sanitized assets; no executable config; transactional changes; least-privilege CI; per-audience push registrations; contextual audit trails and negative isolation tests. Audit events capture actor, partner/society, action, before/after revision or digest and correlation ID; avoid storing sensitive full config or session tokens.

Keep one API, shared PostgreSQL, Redis and object store. Brand configuration is small and cached; use ETags and immutable content-addressed asset paths. Do not create dedicated VMs, Redis instances, buckets or Firebase projects per society. A shared Firebase project with separately registered app clients is the default proposal; routing/credential permissions must be validated before live use. A contractual requirement for separate projects is an explicit exception with cost attribution.

Targets for test-environment validation: 50 societies across at least three partner portfolios; at least two memberships spanning partners; representative real schema cardinality; no N+1 branding lookups; warm config resolution adds no more than 20 ms at p95; critical API p95 no more than 10% worse than measured pre-change baseline at identical load. These are proposed acceptance budgets, not claimed current measurements.

Bound admin pagination, upload size, config size, build concurrency, artifact retention and partner quotas. Measure database query plans and cache hit ratio. Reuse existing queue abstractions if present; otherwise a small build request adapter suffices, with GitHub Actions doing ephemeral execution. Avoid Kubernetes, per-partner microservices and bespoke billing infrastructure.

## 12. Prioritized milestones and acceptance gates

Effort below is indicative engineering effort in person-days including focused tests/review, not an agent execution-time promise. Re-estimate after V5.0 because RLS coverage dominates uncertainty. Indicative total with integration contingency: 50–80 person-days; parallel UI work can follow approved contracts, but isolation gates cannot be skipped.

| Milestone | Priority and estimate | Tasks and affected modules | Dependencies | Acceptance and rollback |
|---|---|---|---|---|
| V5.0 Baseline and ADR | P0, 3–4 days | Freeze scope/invariants; inventory tenant/global queries and native identity; define schema/RBAC/config/OpenAPI; map affected auth, Prisma, contracts, themes, workflows | Approved workstream; fresh develop SHA | Reviewed ADR, full capability/tenant inventory, baseline test evidence and default artifact identity. Documentation-only rollback |
| V5.1 Ownership and compatibility schema | P0, 4–6 days | Add Partner/memberships, Society ownership, revisions and legacy subscription grants; additive Prisma migrations and fixtures | V5.0 | Backfill reruns safely; old effective features exactly retained; existing clients/servers tolerate additive schema. Disable new readers; retain additive tables |
| V5.2 Isolation and audience | P0, 10–16 days | Auth/session context, partner RBAC, resource checks, transaction paths/RLS, cache/jobs/storage/realtime/push audit; contracts | V5.1 | Cross-partner/society negative matrix, scoped DB role tests, legacy and independent-home workflows pass; no incomplete RLS claim. Stop partner onboarding on failure; retain safe scope enforcement, never globally disable RLS to recover |
| V5.3 Runtime Society Branding | P1, 6–9 days | Branding service/config/assets/publish; shared Dart package; Resident/Guard adapters; admin CSS/metadata and own-society editor | V5.2 and config contract | Default theme/nav equivalence; society switch race/offline tests; accessible light/dark overrides; no binary rebuild for logo changes. Repoint to previous published revision/default tokens |
| V5.4 Partner portal and licensing | P1, 7–11 days | Scoped partner routes/components, member lifecycle, plan revisions, allocations/grace/downgrade, domain registry/verifier, entitlement integration | V5.2; brand preview from V5.3 | Partner cannot see resident PII by default; concurrent quota and stale-event tests pass; local multi-host SSR/session isolation; no maintenance-money side effects. Freeze new allocations/routes and use prior approved grants |
| V5.5 Android build automation | P1, 6–10 days | Manifest schema, reusable build generation, Resident/Guard matrices, identity/version allocator, provenance and test signing; workflows/scripts | V5.3; distribution approval from V5.4 | Default and two partner artifacts validate, default update continuity proven, wrong key/package/brand inputs fail; no auto-publish. Disable partner dispatch and reuse last valid artifact; fix forward with higher versionCode |
| V5.6 End-to-end closure | P0 release gate, 8–12 days | Full regression/security/accessibility/performance; migration/rollback drills; traceability and UAT scripts; all affected apps/API | V5.1–V5.5 | Definition of Done met; bounded backlog signed off; evidence tied to candidate SHA; no production-ready claim. Revert optional config/features to known safe revision; retain backward-compatible schema |

Each milestone is finite. A failed acceptance test results in a scoped fix and retest; it does not authorize additional commercial, Finance, Privacy, Services or UI programs. V5.6 closes this engineering program explicitly.

### Concrete initial backlog

| Task | Priority | Deliverable | Completion evidence |
|---|---|---|---|
| V5-001 | P0 | Brand versus partner versus society ADR | Approved relation/precedence examples |
| V5-002 | P0 | Query/policy coverage register | Every table and access path classified, owner assigned |
| V5-003 | P0 | Legacy entitlement snapshot/backfill design | Before/after fixture equality and rerun proof |
| V5-004 | P0 | Audience and partner role matrix | Negative auth/context-switch tests |
| V5-005 | P0 | Scoped repository/RLS conversion batches | Runtime DB role and pooled transaction tests |
| V5-006 | P1 | JSON schema plus Dart/TS config contracts | Contract fixtures accepted consistently |
| V5-007 | P1 | Theme adapters and publish editor | Default/partner/society screenshots and widget/browser checks |
| V5-008 | P1 | License lifecycle and capacity allocator | Boundary/concurrency/grace tests |
| V5-009 | P1 | Host registry and DNS verifier adapter | Unknown/forged/expired/transfer scenarios |
| V5-010 | P1 | App manifest and reusable Android pipeline | Package/signature/version/provenance checks |
| V5-011 | P0 | Notification/cache/offline audience closure | No cross-context delivery/replay evidence |
| V5-012 | P0 | Regression/rollback and closure register | Exact SHA, results, residual risks and bounded exit |

## 13. Test strategy and rollback details

Use narrow module tests during development; run required canonical checks for every PR and full regression at milestone boundaries. Shared contract/theme/auth/entitlement changes must trigger all dependent apps even if current path-based preflight would skip them. A passing structural script is not a substitute for behavioral verification.

Required fixture matrix: default brand; Partner A and Partner B; two societies within A; one within B; standalone society with Aaraagate branding; user in A and B; independent-home user; non-resident owner and current tenant; guard restricted to gate; provider with scoped booking access; expired license; pending transfer; unverified domain; legacy sessions/clients.

| Test layer | Required scenarios |
|---|---|
| Unit and contract | Precedence, schemas, feature ceilings, legacy grant parity, date boundaries, normalization, publication concurrency, unknown fields, asset validation |
| API authorization | ID substitution, lists/counts/exports, user/role enumeration, cross-partner writes, stale membership, partner revocation, domain/client spoofing, preserved gate SoD |
| PostgreSQL integration | USING/WITH CHECK; no context; owner/BYPASSRLS assumptions; cross-society nested references; raw SQL; pooling/rollback; global identity access boundaries |
| Async and money invariants | Worker revalidation after transfer, retry idempotency, no stale license reactivation, offline gate outbox context, unchanged owner/occupant notifications and original booking payment/price |
| Flutter/widget/browser | Default snapshots, society switching races, dark/light contrast, missing logos, long names, offline bootstrap, large text, navigation parity, host-isolated SSR/metadata/session |
| Push/storage/AI | Distribution-specific token handling, wrong-app delivery prevention, signed URL ownership/expiry, AI permission checks and no license/private-data disclosure |
| Packaging | Resident/Guard, default/two partners, demo/release separation, versionCode monotonicity, archive/ABI checks, signer fingerprints, install/update with same identity, tampered manifest rejection |
| Performance | Same-load baseline versus candidate at 50 societies; warm/cold config, partner lists, allocation contention and cache invalidation |
| Migration and rollback | Old clients/new server, old server/additive schema, interrupted/rerun backfill, prior revision restoration, safe policy-aware code rollback |

Rollback is layered. Config rollback republishes an earlier validated revision through an audited event; entitlement rollback restores prior approved grants rather than forging commercial status. App rollback is usually a forward build with a higher versionCode; do not assume a previously installed Android binary can downgrade. Web/API rollback uses a schema-compatible candidate proven against enabled policies. If no safe old binary exists, disable affected partner entrypoints and fix forward, leaving tenant protections intact.

Never drop new data tables as the immediate rollback step. If a later cleanup is warranted, archive and reconcile first under separate authorization. Never revert security improvements by broadly bypassing RLS. Define a tested emergency candidate and exact migration compatibility range before promoting an isolation change.

## 14. Git governance and affected module map

Verified live rulesets: develop requires PR plus strict Repository structure, API validation, Admin validation, Flutter validation and Dependency security checks; staging requires PR and Staging API smoke; main requires PR, the five strict engineering checks, one approving review, last-push approval and resolved review threads. No bypass actors are configured. Legacy branch-protection summaries are not a substitute for the active rulesets.

Future implementation flow remains `feature/* → develop → staging → main`. Start each slice from a verified current develop head; use focused, reviewable PRs. Consolidate staging/main promotion at an approved milestone boundary to limit commits. Main requires the user's explicit manual approval and applicable release gates; existing engineering merge permissions do not authorize promotion without separate promotion approval. No force pushes, bypasses or ancestry-repair branches during normal delivery.

| Existing module | Planned change |
|---|---|
| services/api/prisma/schema.prisma and migrations | Add ownership/branding/commercial tables and tested integrity/RLS migrations |
| services/api/src/prisma/prisma.service.ts | Extend existing scoped transaction use; separate privileged/global repositories |
| services/api/src/auth/* | Audience/partner context, scoped permissions/session switching; retain token rotation and gate SoD |
| services/api/src/entitlements/* | Compatibility grants and licensed capability ceiling; retain API semantics |
| New services/api/src/branding, partners, licensing, domains | Bounded modules inside existing NestJS API; AppModule registration |
| packages/types, packages/api-client, packages/config | Shared schemas/contracts and safe configuration conventions |
| apps/resident/lib/theme, main/auth/controller/data paths | Runtime config, audience/bootstrap, atomic context refresh; exact files confirmed in V5.0 |
| apps/guard/lib/theme, main and offline paths | Shared tokens/config, scoped outbox retention and distribution-aware registration |
| Proposed shared Dart branding package | Small reusable models/resolver/theme inputs for both apps |
| apps/admin/app/layout.tsx, brand-tokens.css and existing shell/auth/client paths | Host-aware metadata/tokens, scoped partner surfaces, safe session/cache behavior |
| API notifications/media/AI/reporting/background modules | Context revalidation and no cross-brand/society leakage; avoid business-rule rewrites |
| .github/workflows/resident-demo-apk.yml and resident-release-aab.yml | Reusable generation/build/provenance with unchanged default publication gates |
| New Guard packaging and manifest validation scripts | Role-specific artifact coverage with shared implementation |
| scripts/check-product-branding.sh, mastermind-preflight.sh and canonical CI | Default brand guard plus approved partner manifests; dependency-aware checks |
| docs/v5-release-manifest.json and architecture/contract/traceability docs | Track the owner-approved V5 program and bounded milestone evidence |

The planning review created no code or commits. The owner subsequently authorized implementation; focused feature PRs target develop. This roadmap does not authorize staging/main promotion or productionization.

## 15. Risks and decision register

| Risk or dependency | Impact | Mitigation or required decision |
|---|---|---|
| RLS incomplete consumers/global paths | Existing workflows fail or isolation remains partial | Inventory first; convert scoped repositories and workers; tested policies per table; full coverage gate |
| Brand confused with authority | Partner accesses another society | Separate IDs/context and negative tests; verified host is presentation only |
| Legacy rights lost through license ceiling | Existing paid functionality disappears | Exact effective-feature compatibility grants; no automatic downgrade |
| Partner expiration disables safety | Gate/SOS service disruption | Separate commercial restriction from explicit security suspension; protected core/grace policy |
| Dedicated apps proliferate | Build/support overhead exceeds white-label revenue | Runtime society branding; contract-gated partner distributions; bounded on-demand builds |
| Wrong signing identity/package | Failed updates or installation collision | Immutable distribution registry; existing artifact verification; per-distribution version/key checks |
| Host/SSR/CDN cache contamination | Partner identity or data leaks | Per-host config and session scope; no public caching of authenticated responses |
| Push identities mixed | Gate notifications delivered to wrong app | Distribution-aware registration/routing tests; Firebase client mapping |
| License billing mixed with maintenance | Accounting regression or unintended charge | Separate subscription domain; simulated/manual grants only; no payment collection scope |
| Transfer races and stale jobs | Old partner retains data visibility | Ownership version, transactional handoff, cache/session invalidation and worker revalidation |
| Public repo licensing unspecified | Distribution/resale rights unclear | Owner/legal rights decision; do not infer rights from visibility |
| Current develop advances during planning | Implementation diff conflicts | Pin review snapshot; rebase/review changed modules before implementation |

Decisions required before relevant slices: ownership of app IDs and signing keys; whether partner support may access society data and under which grants; allowed society color overrides; white-label attribution/footer policy; capacity and pricing basis; commercial grace/protected-core behavior; dedicated Guard apps as optional or mandatory; transfer and termination/data-export rights. Recommended defaults are embedded above so engineering specifications remain concrete; legal/commercial terms are not fabricated.

## 16. Definition of Done

V5 engineering completion requires all of the following:

1. One shared codebase with no partner/society forks or copied business modules; Aaraagate remains the built-in default.
2. Existing APIs, identities, navigation, user contexts, owner/occupant rules, services immutability and gate/finance segregation pass regression.
3. Partner/society boundaries verified at API, database, cache, storage, push, realtime, worker and AI boundaries; every data path classified.
4. Legacy entitlements retained exactly; new licenses cannot elevate features beyond approved ceilings; concurrency and grace behavior verified.
5. Validated runtime branding publishes/reverts safely; default and partner themes pass accessibility tests; brand changes do not require society-specific binaries.
6. Partner roles cannot inherit platform/gate powers; privileged changes and transfers are auditable.
7. Domain routing rejects unverified/forged hosts and isolates SSR/session/cache state in local/test environments.
8. Automated default/two-partner Resident and Guard APK/AAB artifacts prove identity, version, signature, demo separation and reproducible input provenance. Test signing is labeled accurately; no claim of store publication.
9. Additive migrations/backfills, old-client compatibility, policy-aware rollback and artifact update continuity are demonstrated.
10. Canonical CI plus focused security/behavioral tests pass on the exact candidate SHA; performance budgets and unresolved risks are recorded.
11. Documentation includes schema/API/RBAC/config contracts, ownership decisions, test evidence, migration/rollback runbooks and finite closure criteria.
12. Productionization, provider provisioning, legal execution and external field/store acceptance remain explicitly excluded; any residual defect is bounded and assigned.

Engineering evidence is not field or production acceptance. A proposed acceptance criterion is not a test result. Stop at this Definition of Done rather than extending the program automatically.

### V5.2.1 society session authority

Implementation resumes from develop `c2b80e16edb4e0f6f13f1d39a621d2ca0ef6bcdd`, preserving the completed V5.0.1, V5.0.2 and V5.1.0 slices. Bearer access and refresh now use the existing AuthContextService to revalidate active society membership or a dedicated active READ_ONLY_AUDITOR assignment. A revoked membership no longer returns a society principal with empty roles. Refresh rejects missing authority before consuming the replay marker or rotating tokens. Independent-home sessions remain society-less; partner ownership and memberships grant no society authority.

Local evidence: API lint, typecheck, build, selective preflight, compiled branding HTTP smoke and 83 authentication, occupancy, auditor permission and branding tests passed. The reproducible inventory is regenerated for the changed authentication path. CI scope now requires dependent Admin and both Flutter clients for runtime authentication, branding and entitlement changes; test-only changes retain narrow scope. Protected CI and merge remain pending; this slice does not implement database RLS, partner session audiences, transfers, licensing or complete V5.2 isolation. Staging/main promotion is excluded.

## 17. Source register

Repository links use the reviewed immutable SHA. All statements of current implementation above are based on these repository sources or the explicitly stated read-only live ruleset review.

- [Reviewed develop commit](https://github.com/auraakart/Aaraaweb/commit/4e3bc2e4af4e3f597557d119586d7ce60462d348)
- [Architecture README](https://github.com/auraakart/Aaraaweb/blob/4e3bc2e4af4e3f597557d119586d7ce60462d348/README.md)
- [Prisma schema](https://github.com/auraakart/Aaraaweb/blob/4e3bc2e4af4e3f597557d119586d7ce60462d348/services/api/prisma/schema.prisma)
- [Database tenant context helper](https://github.com/auraakart/Aaraaweb/blob/4e3bc2e4af4e3f597557d119586d7ce60462d348/services/api/src/prisma/prisma.service.ts)
- [Session service](https://github.com/auraakart/Aaraaweb/blob/4e3bc2e4af4e3f597557d119586d7ce60462d348/services/api/src/auth/session.service.ts)
- [Permissions guard](https://github.com/auraakart/Aaraaweb/blob/4e3bc2e4af4e3f597557d119586d7ce60462d348/services/api/src/auth/permissions.guard.ts)
- [Entitlement resolver](https://github.com/auraakart/Aaraaweb/blob/4e3bc2e4af4e3f597557d119586d7ce60462d348/services/api/src/entitlements/entitlement.service.ts)
- [User context rules](https://github.com/auraakart/Aaraaweb/blob/4e3bc2e4af4e3f597557d119586d7ce60462d348/docs/USER-CONTEXT-MODEL.md)
- [Resident theme](https://github.com/auraakart/Aaraaweb/blob/4e3bc2e4af4e3f597557d119586d7ce60462d348/apps/resident/lib/theme/aaraagate_theme.dart)
- [Guard theme](https://github.com/auraakart/Aaraaweb/blob/4e3bc2e4af4e3f597557d119586d7ce60462d348/apps/guard/lib/theme/aaraagate_guard_theme.dart)
- [Admin brand tokens](https://github.com/auraakart/Aaraaweb/blob/4e3bc2e4af4e3f597557d119586d7ce60462d348/apps/admin/app/brand-tokens.css)
- [Resident demo packaging](https://github.com/auraakart/Aaraaweb/blob/4e3bc2e4af4e3f597557d119586d7ce60462d348/.github/workflows/resident-demo-apk.yml)
- [Resident AAB packaging](https://github.com/auraakart/Aaraaweb/blob/4e3bc2e4af4e3f597557d119586d7ce60462d348/.github/workflows/resident-release-aab.yml)
- [Git governance](https://github.com/auraakart/Aaraaweb/blob/4e3bc2e4af4e3f597557d119586d7ce60462d348/docs/REPOSITORY-GOVERNANCE.md)
- [Services engineering closure](https://github.com/auraakart/Aaraaweb/blob/4e3bc2e4af4e3f597557d119586d7ce60462d348/docs/AARAAGATE-V4.90.18-SERVICES-3.1-CLOSURE.md)
- Live rulesets inspected on 11 October 2026: [develop](https://github.com/auraakart/Aaraaweb/rules/22026507), [staging](https://github.com/auraakart/Aaraaweb/rules/22026532), [main](https://github.com/auraakart/Aaraaweb/rules/22026560).
- [PostgreSQL RLS documentation](https://www.postgresql.org/docs/17/ddl-rowsecurity.html): role bypass, default-deny and USING/WITH CHECK considerations.
- [Flutter Android flavors](https://docs.flutter.dev/deployment/flavors): shared-source native configuration variants.
- [Android application identity](https://developer.android.com/build/configure-app-module): application ID and signing continuity for updates.

**Version history:** v1.0 planning review; V5.0.0 consolidates the owner-approved V5 development program on 11 October 2026. The original review observations remain snapshot-grounded.

## 18. V5 implementation entry point

V5.0.1 implements the default-brand contract before mutable partner configuration. GET /api/v1/branding/bootstrap returns only built-in Aaraagate presentation. GET /api/v1/context/config requires the existing bearer session and rechecks current membership before returning the selected active society name and existing effective entitlements. Independent-home sessions receive no society or society entitlements. Both responses use Cache-Control no-store; both reject query scope selectors. Caller-supplied partner/brand/society headers cannot select another context.

This foundation introduces no partner write API, licensing changes, database migration, custom-host routing, mobile theme change, app-identity change or additional infrastructure. Partner white-label activation remains blocked on V5.1 ownership and V5.2 isolation gates. Existing entitlement overrides remain intact. Future schema/config contracts build from this default without treating colors as authority.

Acceptance: public bootstrap performs no database lookup; private context rejects missing/revoked membership; scoped metadata and features remain unchanged; defaults cannot be mutated across requests; dependency wiring and HTTP auth/cache/query rejection are verified. V5.0.1 is only the start of V5, not completion of multibrand functionality.

Promotion policy: focused PRs to develop; no per-slice staging/main promotion. Consolidate a V5 release candidate only after V5.6 closure, unless the owner explicitly authorizes a separately scoped interim release. Never bypass existing release gates.

### V5.0.1 validation record

Local Node 22 and pnpm 10.15 validation: frozen dependency install and Prisma client generation; API lint, typecheck and build; 45 targeted tests across branding/session/permissions/entitlements; API route-contract and product-branding checks; repository-integrity, secret-pattern, main-validation-reuse and maintainability-hygiene checks. The compiled HTTP smoke exercises real Nest routing and BearerGuard with deterministic session/persistence fakes; it is wired after the API build in canonical CI. PostgreSQL isolation tests and full protected CI remain separate required evidence. V5.0.1 makes no database/RLS change and does not claim completion of V5.0 tenant-query inventory.

Protected CI status is recorded on the feature PR rather than fabricated here. No staging/main promotion is performed for this slice.

### V5.0.2 and V5.1.0 implementation record

V5.0.1 passed all protected checks and merged through PR #1209 at develop 8e87dbf8f809215db92e14dfd727c42ac7f76553. The tenant-access inventory is complete as a reproducible static source register: 249 tables, 2,123 access sites and 872 handlers, with authority classes, maintainers, exceptions and a prioritized isolation conversion queue. It demonstrates remaining isolation work, including no runtime tenant-context calls or migrated RLS policy statements; it is not a security certification. See [inventory and work queue](architecture/V5-TENANT-ACCESS-INVENTORY.md).

V5.1.0 adds built-in Aaraagate commercial ownership, separate partner roles and immutable legacy entitlement cutover evidence. It retains the live entitlement resolver, old-server INSERT defaults and society response contracts. Tests cover all 189 prior migrations, 64 compatibility fixtures, constraints, replay, deletion and atomic failure rollback. Snapshot evidence is not a subscription grant. See [schema, acceptance and rollback contract](architecture/V5-PARTNER-OWNERSHIP-COMPATIBILITY.md). Ownership history, transfer administration and actual legacy licensing conversion remain gated follow-up work. Staging/main and hosted migration execution are excluded.

### V5.1.0 protected validation closure

[PR #1210](https://github.com/auraakart/Aaraaweb/pull/1210) merged into develop at 2ee24a4ab6f302e0d767df3c31f18229883baf91. Exact validated runtime head: f2a28dda4c5c2531d3ac2c95be62341010b0b2a3. [Canonical CI evidence](https://github.com/auraakart/Aaraaweb/actions/runs/38132938204): repository structure, Mastermind preflight, API/Admin/Flutter full validation and all required merge gates passed; dependency-security gate passed with the package graph unchanged. Native PostgreSQL 16 clean deploy and historical upgrade/replay/atomic rollback tests passed, including all 64 compatibility fixtures and the exact legacy society response contract. Staging/main were not promoted. V5.0 baseline work beyond the tenant inventory and remaining V5.1/V5.2 work remain explicitly open in the manifest; this is development evidence, not productionization or tenant-isolation certification.

### V5.2.1 protected closure and V5.2.2 configuration boundary

PR #1212 passed all required gates, including full API, Admin and Flutter validation, and merged into develop at `806ab618eed144c23c231b96afc104a50605151c`. Validated head: `53a8ee739ab8c72d4ab911a2c59e3a97f1f88468`. The previous pending record is superseded by this closure.

V5.2.2 uses the existing tenant transaction helper for authenticated configuration and society detail. Configuration revalidates memberships and dedicated auditors through the same repository used by sessions, on the same transaction client as society metadata and effective entitlement reads. It preserves the default brand, feature overrides, society response fields and separate platform list/create paths. Independent context and public bootstrap open no society transaction. The optional entitlement transaction client preserves all existing callers. No RLS policies or partner authorization are activated.

Local validation: API lint/typecheck/build and 101 focused tests passed; 5 PostgreSQL tests were skipped locally because DATABASE_URL was absent. The new PostgreSQL configuration test covers wrong-society/stale-role denial, membership and auditor revocation, legacy overrides and context cleanup; canonical CI must execute it on native PostgreSQL before merge. Broader query conversion, worker boundaries and database policies remain open. Staging/main are unchanged.

### V5.2.2 protected closure and V5.2.3 gate assignment conversion

PR #1213 passed all required gates and full API/Admin/Flutter validation on `be55234e2b879b48344d62a1b7b1084cddd31df9`, and merged into develop at `6a364bf6880396524902229421aa215d545b513d`. Native PostgreSQL executed and passed the new configuration boundary test; the prior pending record is superseded.

V5.2.3 scopes gate assignment checks, list, assign and deactivate operations with transaction-local society context. Gate ownership checks, active security membership validation and mutation queries use only the supplied transaction client. Existing explicit SQL scope, gate/time-window filters, role permissions and response fields remain unchanged. The native PostgreSQL fixture covers foreign gates/users/deactivation targets, assignment window boundaries and inactive gates. Local API lint/typecheck/build and 27 focused tests passed; the PostgreSQL test was skipped locally without DATABASE_URL and remains a mandatory protected-CI result before merge. No RLS activation, main/staging promotion or hosted migration.


## V5.2.5 community event tenant transactions

V5.2.4 merged through PR #1215 as `a92428210ceddba03aef0aecd51ede1b25b08619` after canonical CI run [38145620048](https://github.com/auraakart/Aaraaweb/actions/runs/38145620048) passed on head `62465f42a19c8c9ef745afb2f5d2d4c82769318a`.

Community event resident/admin listing, creation, lifecycle and RSVP paths now use `withTenantContext` and its supplied transaction client. Existing explicit society and owner/occupant audience predicates, event/RSVP row locks, capacity enforcement, idempotent RSVP/lifecycle behavior and response fields remain intact. Unit tests reject fallback to the global client; a disposable PostgreSQL fixture covers foreign event rejection, owner-only audience, concurrent last-place RSVPs, unchanged RSVP retries, cancelled lifecycle and revoked occupancy.

V5.2.5 is implemented pending protected CI. The PostgreSQL fixture runs in the canonical API full test suite. This is one bounded governance conversion, not full governance isolation or database RLS activation. No schema, permission, entitlement, Android identity or client contract changes. Staging/main promotion remains excluded. A reviewed revert is the rollback path.

Local V5.2.5 validation: Node 22/pnpm 10.15 frozen install; API lint, typecheck and build; 37 focused event/poll unit tests passed; four database tests skipped without DATABASE_URL. Deterministic inventory, API route contract, community event contract, PostgreSQL parameter contract, repository integrity, product branding and secret-pattern checks passed. Native PostgreSQL and protected CI evidence remain pending.
