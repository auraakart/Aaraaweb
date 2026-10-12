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


## V5.2.6 resident directory tenant transactions

V5.2.5 is published through PR #1216 on validated source tree `3140270199010f0ac2198a1ab9af71b1669b0e61`; protected CI remains pending at this slice's starting point.

Resident directory profile reads/writes, visible listing, contact request history, requests, responses and withdrawals now use one society-scoped transaction per operation. Current owner/occupant checks and the self-only identity projection run on the supplied transaction client, including requester checks inside the contact-request pair lock transaction. Existing opt-in visibility, reciprocal pending-request exclusion, recipient/requester authority, current residency, consent notes and response fields remain unchanged. Acceptance does not reveal phone/email or grant messaging access.

Unit tests reject global-client fallback and revoked authority, cover invisible/foreign recipients and consent actor restrictions. The disposable PostgreSQL fixture exercises two societies, hidden profiles, cross-society access, reciprocal request races, wrong-actor response/withdrawal, accepted and withdrawn lifecycle, repeat response and revoked occupancy. Canonical API CI owns native database validation. No schema, RLS, permission, feature or client contract change; full V5 isolation remains open. Rollback is a reviewed revert of this slice. Staging/main promotion remains excluded.

Local V5.2.6 validation: API lint, typecheck and build passed; 20 directory/controller tests passed and one PostgreSQL fixture skipped without DATABASE_URL. The earlier combined directory/controller/event run passed 42 tests. Inventory regeneration/stale check reports 22 runtime context calls; adoption, API and PostgreSQL parameter contracts pass. Native PostgreSQL and protected CI remain required.


## V5.2.6 synchronization recovery

V5.2.5 merged through PR #1216 at `a276ae344ebc0e51a0a75afe6313b2b38a494e5b`. V5.2.6 canonical CI run 38154135594 passed all required validation gates, including full API and native PostgreSQL, on `0b6e2307be5f23ea87c93da431fbc888ea6685d6`; only the auto-merge step failed because develop advanced during validation. This recovery preserves both slices and refreshes the branch base. Protected checks must pass on the synchronized head before merge. Subsequent slices start only after the preceding develop merge is verified, avoiding stacked generated-register conflicts. Staging/main remain untouched.


## V5.2.7 community-circle tenant transactions

V5.2.6 merged through PR #1217 at `12d861fe02d6b056ceab415ed86822d0e8ac7ec9` after canonical CI run [38155971108](https://github.com/auraakart/Aaraaweb/actions/runs/38155971108) passed on synchronized head `db72cfc4b1ab9a05341f54e5cfbce5708c575d1e`, including native PostgreSQL and all required merge gates. The stale-base failure is closed.

Fifteen community-circle operations now establish tenant context. Resident authority, membership, parent lookup, sender identity, messages, requests, review, lifecycle, expiry updates and moderation use only the supplied transaction client. Helper clients are mandatory; resident requests share their existing transaction with name locking and insertion. SQL society/parent predicates, row/advisory locks, opt-in membership, sender snapshots, approval-only publication, latest-100 chronological history, hidden messages and idempotent join/leave behavior remain intact. Controller permissions and feature gates are unchanged.

The scheduled `deleteExpired` method remains a documented bounded platform exception (100 rows, FOR UPDATE SKIP LOCKED); it is not a resident API. Scheduler authorization/context conversion remains ISO-03 work. Unit tests reject global-client access, revoked residency and foreign parents. A disposable PostgreSQL fixture exercises two societies, duplicate-name races, membership privacy, foreign messages/moderation, report deduplication, request approval, closed/expired lifecycle, join/leave retries and revoked residency. Canonical API CI must execute the fixture before merge.

Local circle/controller/scheduler validation passed 43 tests. API lint/typecheck/build, inventory regeneration, API route/PostgreSQL parameter contracts, V4.82 circle trust contract, branding and secret scan passed. The optional V4.86 adoption script has a pre-existing stale Easy Mode source-token assertion in unchanged apps/resident/lib/main.dart; it is not a changed-slice validation failure. Native PostgreSQL remains required in protected CI. Runtime context calls increase from 22 to 37. This bounded conversion does not enable RLS, close ISO-04/ISO-03 or certify complete V5 isolation. Rollback is a reviewed revert. Staging/main promotion remains excluded.


## V5.2.8 governance core transactions and evidence atomicity

V5.2.7 merged through PR #1218 at `2d2dd11d1c844a4d793ef24284668c63a0585d82` after canonical CI run [38156639668](https://github.com/auraakart/Aaraaweb/actions/runs/38156639668) passed on `c10c14fb4bfd1b439a1f5a71023c50ecd01cc938`. Full API regression passed 1,706 tests (15 explicitly skipped); the new community-circle PostgreSQL fixture executed successfully. All required merge gates passed.

Eleven committee/meeting operations now establish society-scoped transactions. Parent and linked agenda/resolution checks, mutation, append-only evidence and meeting aggregate reads use the same supplied client. Public meeting reads delegate to a client-required internal helper, avoiding nested transactions during mutation response reads. Meeting creation/outcomes, agenda, resolutions and action creation now roll back when evidence fails; action updates retain existing atomicity and row locking. Committee tenure creation adds a society/member advisory lock before its overlap query so concurrent first-tenure requests cannot both pass an empty history. Existing response fields, date/quorum/status checks, identity lookup rules, controller permissions, feature entitlements and SQL scope predicates remain unchanged.

Unit tests reject global-client fallbacks, foreign parents and linked children, and propagate evidence failure. A disposable PostgreSQL fixture covers two societies, same-society foreign meetings, first-tenure races, lifecycle/evidence consistency and six failed-evidence rollbacks. It also proves evidence deletion remains forbidden. Fixture cleanup temporarily disables only its append-only delete trigger under a table lock within transactional DDL, deletes only generated society fixtures, and restores the trigger before commit; this is test-only and never a runtime path.

Local focused governance validation: 35 tests passed; native PostgreSQL fixture skipped without DATABASE_URL and must execute in canonical CI before merge. API lint/typecheck/build, inventory regeneration and API/PostgreSQL parameter, repository, branding and secret contracts passed. Runtime context calls increase from 37 to 48. No schema/RLS, partner audience or client contract changes. Remaining governance artifact/election controllers and other isolation batches remain open; this is not complete V5 isolation. Rollback is a reviewed revert. Staging/main promotion remains excluded.


## V5.2.9 governance document and poll artifact transactions

V5.2.8 merged through PR #1219 at `5c73fab6d3b242676687c0fea7d3251872ab39ca` after canonical CI run [38158624597](https://github.com/auraakart/Aaraaweb/actions/runs/38158624597) passed on `d03ef1bc69f40459baf7132433648698e025d0ec`. Full API regression passed 1,736 tests (15 explicitly skipped). The native governance fixture passed its cross-society/meeting negatives, first-tenure race, evidence immutability and six rollback paths.

Six governance artifact operations now establish society context. Document parent and linked-resolution checks, reads, insertion/verification and append-only evidence use the supplied transaction client. Poll parent validation moves inside the transaction that inserts the poll and its options. All helper clients are mandatory. Existing permissions, poll entitlements, nonstatutory-only rules, DTO/normalization behavior, response fields and explicit society/meeting predicates remain intact. Failed document evidence now rolls back insertion/verification; poll option failures retain full rollback.

Twenty transaction tests cover global-client fallbacks, foreign parents, linked resolutions, evidence failures, later option failure and actor/input validation. A disposable PostgreSQL fixture covers two societies, same-society foreign meetings/resolutions, document verification races and retries, failed-evidence rollback, and a real downstream option-length constraint rollback. Fixture-only cleanup restores the append-only delete trigger using transactional DDL/table locking and touches only generated society IDs. Canonical CI must execute the database fixture before merge.

Local artifact/controller/permission validation: 27 tests passed. API lint/typecheck/build, deterministic inventory and API/PostgreSQL parameter, repository, branding and secret checks passed. Native PostgreSQL remains required in protected CI. Runtime context calls increase from 48 to 54. No schema/RLS or partner audience changes. Community audience/detail reads, election/privacy/readiness controllers and other isolation batches remain open; this does not certify complete V5 isolation. Rollback is a reviewed revert. Staging/main promotion remains excluded.


## V5.2.10 existing community governance visibility transactions

V5.2.9 merged through PR #1220 at `d3967f146a627fb9c8e8993703ab8884df68a2e9` after canonical CI run 38159353051 passed on `fd6f7bf76d206dbd3b9404cbd3c3749b4c2c2463`. This supersedes the pending V5.2.9 record.

The four existing community governance handlers now use society-scoped transactions. Meeting visibility and the existing aggregate reader share one transaction client without nesting. A shared meeting row lock prevents concurrent audience changes while that detail response is assembled. Owner/occupant effective-date predicates, owner-only/community rules, document-parent audience filtering, permission guards and response shapes are preserved. Audience changes retain their existing row locks, atomic audit writes and idempotent retries, now with transaction-local society context. No feature is rebuilt and no schema, RLS policy or partner audience is activated. Concurrent relationship revocation is not claimed to be serialized by a meeting row lock.

Local validation: 48 focused service/controller/transaction tests, API lint/typecheck/build passed. The disposable PostgreSQL fixture checks foreign society rejection, owner/occupant and document-parent visibility, revoked occupancy, and three failed-audit rollback paths; it requires native PostgreSQL execution in protected CI before merge. Inventory records 58 runtime context calls. Remaining election and other isolation batches remain open. Staging/main promotion is excluded. Rollback is a reviewed revert.


## V5.2.11 existing election foundation transactions

V5.2.10 merged through PR #1221 at `9714207c62b7ac8651aa33ce390eeef78982d296` after canonical CI run 38161686487 passed on `444c4880ca59eb1759dd6febf9941eccdf3a4e42`. Full API regression passed 1,771 tests (15 explicitly skipped); the native community visibility and three audience-audit rollback cases passed. This supersedes the pending V5.2.10 record.

Five existing policy/electorate operations establish society context. Snapshot parent and member detail reads share the supplied client. Policy revision and snapshot creation retain their society row locks, monotonic versions, separation of duties, immutable evidence, effective owner/occupant eligibility and duplicate-owner precedence. Response fields, permissions, feature gates and disabled ballot casting are unchanged. No features, schema or database policies are introduced.

Local validation: 17 focused boundary tests and API lint/typecheck/build passed. The disposable PostgreSQL fixture checks two-society policy/snapshot isolation, owner/occupant deduplication, immutable captured membership after revocation, concurrent policy versions, disabled policy and same-author denial, and later member-insert rollback. Fixture-only transactional DDL restores each append-only delete trigger and deletes generated fixture societies only. Native PostgreSQL execution and protected CI remain required before merge. Runtime context calls increase from 58 to 63. Procedure, privacy, ballot, hold/readiness and other isolation slices remain open. Staging/main promotion is excluded; rollback is a reviewed revert.


## V5.2.12 existing election procedure and privacy evidence

V5.2.11 merged through PR #1222 at `75564a450ecb8b8360a35481263529b27f728db9` after canonical CI run 38162178749 passed on `8527e2eff55ddab75520c6b36d043d2c8abe5d62`. Full API regression passed 1,785 tests (15 explicitly skipped); the native electorate isolation, immutable capture, actor separation, concurrent policy versions and downstream rollback fixture passed. This supersedes the pending V5.2.11 record.

Four existing procedure/privacy reads and writes use society context. Writes now select the latest policy revision and reject it if disabled, matching their current-policy requirement. Previously filtering enabled revisions could silently select an older enabled policy after a newer revision disabled elections. Existing society locks, evidence versioning, append-only evidence, reference normalization, distinct policy/procedure/privacy actors, current read predicates and disabled execution/casting flags remain intact. No feature is rebuilt or activated.

Local validation: 20 focused tests and API lint/typecheck/build passed. Native PostgreSQL fixture requires protected CI: two-society rejection, same-author denial, concurrent procedure/privacy version allocation, failed oversized-reference insert, append-only evidence, latest disabled policy rejection despite older enabled revisions, and new-policy evidence rebinding. Disposable cleanup restores append-only triggers under transactional DDL and removes generated fixtures only. Runtime context calls increase from 63 to 67. Remaining ballot, hold/readiness and other isolation slices remain open. No schema/RLS or partner audience activation. Develop only; rollback is a reviewed revert.


## V5.2.13 existing election holds and readiness

V5.2.12 merged through PR #1223 at `9f2deeaf0209add86490b12ebb492f59971be96e` after canonical CI run 38162653650 passed on `0d59fe025791aaddd82ad6b95f81497d7e27d444`. Full API regression passed 1,799 tests (15 explicitly skipped); the native procedure/privacy isolation, latest-disabled-policy regression, concurrency and immutable evidence fixture passed. This supersedes the pending V5.2.12 record.

Existing hold list/open/resolve/cancel and readiness handlers use society context. Open and close retain their existing shared helper paths, society locks, parent checks, append-only sequence allocation and distinct-author closure. Readiness retains its single-query aggregate and all current-policy, review, approval, procedure/privacy and active-hold blockers. No workflow or response is rebuilt; execution/casting stay disabled.

Local validation: 20 focused tests and API lint/typecheck/build passed. Native PostgreSQL fixture requires protected CI and checks foreign ballots, duplicate hold concurrency, same-author denial, oversized-close failure without history mutation, resolve/reopen/cancel sequencing, readiness blocking/unblocking and disabled-policy rejection. Disposable cleanup restores append-only triggers transactionally and deletes generated fixtures only. Runtime context calls increase from 67 to 71. Ballot review/draft/decision conversion and other isolation batches remain open. No schema/RLS or partner audience activation; develop only. Rollback is a reviewed revert.

## V5.2.13 protected closure

PR #1224 merged into develop at `6e32d0ee572dd1f6652ba1502554c417b55bff8d`, testing runtime `9e8335a242725e8170623f90e6d2611de81b248f` in [CI 38163180918](https://github.com/auraakart/Aaraaweb/actions/runs/38163180918). All required gates passed: 1,812 API tests passed, 15 skipped, and the native PostgreSQL hold/readiness fixture passed.

## V5.2.14 existing ballot evidence transactions

The seven existing ballot controller operations now establish society context. Draft parent, options and latest decision reads use the same transaction client; review, draft/options and decision writes retain society locks, current enabled policy checks, reviewed-electorate prerequisites, append-only sequencing and distinct actors. Cancellation of stale policy-bound drafts remains available with a reason. Responses still disable execution and vote casting. No feature rebuild, schema/RLS or branding activation.

Validation: 25 focused tests; API lint, typecheck and build; deterministic tenant inventory and repository contracts. Native PostgreSQL fixture covers foreign parents/history, actor separation, concurrent review sequences and duplicate approval, draft/first-option rollback when the second insert fails, blocked review, disabled latest policy, failed cancellation rollback and terminal immutable decisions. Protected full CI remains required before merge. The broader V5.2 isolation queue stays open; no staging/main promotion.

## V5.2.14 protected closure

PR [#1225](https://github.com/auraakart/Aaraaweb/pull/1225) merged into develop at `91d1ffd839df925deb98b591ea44ab1a83decea5`. Canonical CI [38164444258](https://github.com/auraakart/Aaraaweb/actions/runs/38164444258) completed successfully on `7cb01012149c37288c8062027d61432374b12271`. The completed ballot evidence conversion is a bounded V5.2 slice, not general database RLS or multi-brand activation.

## V5.2.15 pooled tenant context concurrency and rollback evidence

Extend the existing native PostgreSQL `PrismaService.withTenantContext` integration tests rather than rebuilding the tenant context mechanism. Concurrent transactions interleave three different society IDs; each operation verifies its own transaction-local scope before and after a database round-trip. The test is valid for either a multi-connection or serializing CI pool and checks that an unscoped query afterward does not inherit any society. A separate test causes a real PostgreSQL statement failure, verifies the scoped transaction rolls back without leaving its tenant value in pooled work, and confirms that a later society context still works.

This is a test-only isolation regression slice: no runtime code, source-inventory digest, migrations, role matrix, RLS policies, API contracts, partner grants, features or product brand is changed. It does not certify full tenant isolation; ISO-01 through ISO-07, global schedulers, hosted role checks and database-enforced RLS remain open. Native PostgreSQL execution and protected CI are required before a develop merge. Staging and main promotion remain excluded. Revert this bounded test/docs change if a compatibility regression is confirmed.

## V5.2.15 protected closure

PR [#1226](https://github.com/auraakart/Aaraaweb/pull/1226) merged to develop at `c4b32e493cd22eaf9dfdc4c831d4d6b28f19135d` after canonical [CI 38195067713](https://github.com/auraakart/Aaraaweb/actions/runs/38195067713) completed successfully on head `08f50d3771606d28944fc9b80a712249a3fe23da`. The pooled-society concurrency and SQL-error rollback tests closed the bounded verification slice, not database RLS readiness.

## V5.2.16 privacy consent society transactions

Four existing `PrivacyConsentService` operations (list, record, withdraw and history) now establish society-scoped database transaction context and pass the same transaction client to parent lookups and child evidence writes. Subject and optional representative relationship validation and active data-category lookup move into the record transaction; current historical society-relationship semantics and purpose/minor evidence rules remain unchanged. History's consent-parent authorization check now occurs on the same client as event listing. Withdrawal acquires a consent-row lock before checking status, serializing concurrent repeat requests so successful withdrawal creates exactly one append-only event. A downstream event insertion failure rolls back the consent state update.

Unit tests prohibit global-client fallback, check foreign consent rejection, representative validation, shared client use, idempotent repeat withdrawal and error propagation. A disposable native PostgreSQL fixture covers two societies, foreign subject/representative and parent isolation, append-only evidence, concurrent withdrawals, and real oversized-event rollback. Canonical API CI must run this fixture; PostgreSQL triggers are restored in test-only transactional cleanup. The tenant-access inventory must be regenerated using the existing script and checked for drift because source access sites changed.

This is an ISO-03/ISO-04 privacy subpath and not all privacy or V5.2 tenant isolation. Controller guards, response shapes, migrations, feature gates, owner/tenant rights and brand configuration are unchanged. Runtime context calls increase by four, from 78 to 82. No RLS activation, staging/main promotion or productionization. Rollback via reviewed revert after protected checks.

## V5.2.16 protected closure

PR [#1227](https://github.com/auraakart/Aaraaweb/pull/1227) merged into develop at `d2f3daa2f3af65b7ba3bed1947ef3c9294129045`. Canonical [CI 38196375573](https://github.com/auraakart/Aaraaweb/actions/runs/38196375573) passed on validated head `a0054eceaab8105fa2e9109bf63f0296b8e7bb43`, including native PostgreSQL, full API validation, inventory check and protected merge gates.

## V5.2.17 privacy registry society transactions

All seven existing `PrivacyRegistryService` methods (category/processor list, create and activation, and registry history) establish society-scoped transactions through `PrismaService.withTenantContext`. Parent/category checks, writes and append-only evidence remain on the supplied transaction client. Existing society SQL predicates, `FOR SHARE` category locks, actor/permission checks in the controller, normalization, audit-event semantics and returned values are preserved. Neither RLS nor partner access is enabled.

Unit tests require the supplied tenant client for each read/write path, prohibit global-client fallback, cover foreign category/processor changes, category validation, evidence insertion failures and history society predicates. The native PostgreSQL fixture covers two societies, foreign category reference rejection, cross-society activation denial, scoped processor creation, disabled categories, append-only evidence, and duplicate-category failure without extra audit events. Fixture cleanup restores append-only triggers transactionally.

The deterministic tenant-access inventory must be regenerated using the existing script and remain green in canonical CI. There is no database migration, API/DTO/UI or permission change; no staging/main promotion or productionization. The V5.2 isolation queue and worker/RLS conversion remain open, and this slice can be reverted independently following review.

## V5.2.17 protected closure

PR [#1228](https://github.com/auraakart/Aaraaweb/pull/1228) merged into develop at `65b3419f54d9c99168cdec80e6be0833a3f0b25c` after canonical [CI 38197415670](https://github.com/auraakart/Aaraaweb/actions/runs/38197415670) passed on head `393c0e3a33cfedc708f2678dd3aef1e8d36171b9`.

## V5.2.18 privacy case intake and history society boundary

The existing `PrivacyService` now scopes society case intake, operator listing and case-history parent/event reads through `PrismaService.withTenantContext`. Subject historical relationship and active assignee checks run on the same transaction client as privacy case creation and append-only event evidence; existing SQL society predicates, API endpoints, authorization decorators, ownership/occupancy semantics and response shapes remain unchanged. Case history verifies the society-scoped parent on the same transaction connection as the audit events. Critically, an independent-home privacy request has `societyId = NULL`; its history remains an unscoped transaction rather than a fabricated society context, preserving its established product semantics.

Unit tests cover foreign subject/assignee rejection, no global-client fallback, atomic evidence error propagation, one-client parent/event history authorization, and independent-home history. A native PostgreSQL integration fixture covers two-society case creation/listing, cross-society history rejection, one-event append-only evidence and an independent-home self-service request. Disposable fixture cleanup restores the existing append-only trigger transactionally.

The deterministic V5 tenant-access inventory must be regenerated and checked against source. This is a bounded privacy intake/history slice; `listMine`, `selfContext`, `createMine`, `operatorContext`, `programReadiness`, `programEvidence`, `caseReadiness`, `updateStatus`, `updateLegalHold`, `updateRetentionReview`, erasure and worker/RLS conversion remain outside this slice. Do not claim blanket tenant isolation or statutory/privacy certification. No migration, API/permissions change, RLS activation, staging/main promotion or productionization. Roll back by reviewed revert.

## V5.2.18 protected closure

PR [#1229](https://github.com/auraakart/Aaraaweb/pull/1229) merged into develop at `e946b953adacd5250b55ea265293ae58af48854b`. Canonical [CI 38198067407](https://github.com/auraakart/Aaraaweb/actions/runs/38198067407) passed on validated runtime head `066c7369ef867768e45fea7857a906e93a75aae2`.

## V5.2.19 privacy case lifecycle race closure

The existing `PrivacyService` now handles `updateStatus`, `updateLegalHold` and `updateRetentionReview` within a single transaction that acquires the matching privacy-case row using `SELECT ... FOR UPDATE` before evaluating its existing state, erasure, legal-hold and retention rules. Society cases use the established `PrismaService.withTenantContext`; independent-home cases with nullable `societyId` keep an unscoped PostgreSQL transaction, with no invented society ID. The existing conditional UPDATE comparisons and same-transaction append-only `PrivacyRequestEvent` evidence are preserved. This removes stale pre-transaction policy checks, serializes competing changes, preserves idempotent reapplication of an already terminal status, and rolls back state when audit evidence cannot be inserted.

The focused unit suite covers locked revalidation, legal-hold precedence, retention-review invalidation, terminal-status idempotency, foreign-society fail-closed behavior, evidence failure propagation, and independent-home transaction selection. A native PostgreSQL fixture exercises two societies, unauthorized state attempts, erasure completion gates, hold invalidation, rollback from oversized event summary, duplicate terminal completion, independently scoped personal cases, and existing append-only audit triggers.

Run the existing deterministic tenant-access inventory generator and check for drift before merging. This is only the privacy case lifecycle mutation boundary. Readiness/reporting, self-service data paths, subject-data erasure, worker isolation and RLS remain open. No controller/DTO or schema change, no permission broadening, no staging/main promotion or productionization. Roll back through reviewed revert of the bounded slice.

## V5.2.19 protected closure

PR [#1230](https://github.com/auraakart/Aaraaweb/pull/1230) merged to develop at `5dfbced4cf80d51f0d63f730d73fc970d1cc16a0` after the corrected canonical [CI 38198822233](https://github.com/auraakart/Aaraaweb/actions/runs/38198822233) passed at head `675d6203ba529bb8c6e9c4d26e520ecbdbcb4408`. The early CI lint failure was closed by removing an unused PostgreSQL fixture import without changing production logic.

## V5.2.20 privacy reporting tenant context

The existing `PrivacyService.programReadiness`, `programEvidence`, and `caseReadiness` operations now use `PrismaService.withTenantContext(societyId, ...)` and execute society-filtered raw SQL exclusively through that transaction client. A single existing readiness computation, `programReadinessOnClient(tx, societyId)`, is shared between the public readiness endpoint and the evidence-reporting endpoint. The evidence endpoint does not create a nested transaction or use global-client fallback; all nine component queries of the evidence pack use the supplied tenant client. The case-readiness operation checks its society-scoped parent case on the same client before four surrounding program metrics are queried. Existing blocker ordering, metrics, response payloads, certification disclaimers, controller guards and API routes remain unchanged.

Unit tests assert one transaction boundary, no global fallback, expected blockers and readiness/evidence counts, cross-society parent rejection, and error propagation. A native PostgreSQL fixture creates two societies with divergent data categories, grievance contacts and cases, then checks independent metrics, evidence, per-case blockers and forbidden cross-society case reads; cleanup is isolated to the fixture.

This establishes the transaction-local tenant context, **not** a repeatable-read snapshot, database RLS, new authorization policy or legal compliance certification. Ordinary PostgreSQL READ COMMITTED semantics remain. Other privacy paths including `selfContext`, `operatorContext`, erasure and user-facing requests remain separate, alongside workforce and partner/isolation work. The deterministic tenant-access inventory must be regenerated and pass CI. No schema/client/permission changes, staging/main promotion or productionization. Revert only after review.

## V5.2.20 protected closure

PR [#1231](https://github.com/auraakart/Aaraaweb/pull/1231) merged into develop at `44fa81a086dcdbae5ddfce6e2cde29421dc33eca` after canonical [CI 38199991943](https://github.com/auraakart/Aaraaweb/actions/runs/38199991943) passed on head `0bd3c613f5cad82dffff4529997b3f4fb0fc4bdd`.

## V5.2.21 self-service, consent context and privacy operator audience

Reuse existing `PrivacyService` and the transaction-local `PrismaService.withTenantContext` boundary for society-scoped self-service listing, consent/category context, request-key creation and operator subject/assignee lookup. The `listMine` and `createMine` operations delegate to the already shared `withPrivacyCaseTransaction` helper; with a society UUID, use tenant-scoped transactions, and with no society, retain an ordinary database transaction for independent-home privacy requests. The database's globally unique `(subjectUserId, requestKey)` constraint, advisory transaction lock, duplicate-request semantics and append-only `SELF_SERVICE_CREATED` event remain intact across society contexts. The independent-home platform queue remains society-null only and is not converted to a fabricated tenant.

`selfContext` obtains both the active data categories of the selected society and only the authenticated user's consent records for that same society on one transaction client. `operatorContext` retains current/historical ownership/occupancy/membership relationship rules, active society member assignee filtering and returned names/phones, but executes both scoped SQL queries on one tenant client. No new entitlements or visibility grants are created; existing controller guards and authorization policies remain authoritative.

Unit tests verify society vs independent-home routing, request-key retry/conflicts, same-transaction audit event insertion, no global-client fallback, subject-only consent and operator audience scoping. A native PostgreSQL fixture exercises two distinct societies, independent-home requests, cross-society request-key conflict, consent separation, operator membership audiences, append-only event evidence and fixture-isolated cleanup. Regenerate the deterministic tenant-access inventory and require protected CI before merging.

This milestone does not enable RLS, alter the API or schema, authorize absent society memberships, or certify data-protection law compliance. Remaining subject-data export/erasure, other privacy services, worker isolation, multi-partner enforcement and RLS are separate slices. Staging/main remain unchanged; revert by reviewed rollback.

## V5.2.21 protected closure

PR [#1232](https://github.com/auraakart/Aaraaweb/pull/1232) merged to develop at `254b0533e64b4838c9bd6f2c6f6e413f73a91537` after [CI 38200747698](https://github.com/auraakart/Aaraaweb/actions/runs/38200747698) passed on validated head `afeff38840bdd1b7e2c0e21d1a5d2a15eae9515f`.

## V5.2.22 subject-data export and erasure transaction context

Reuse the existing `PrivacySubjectDataService` and shared `PrismaService.withTenantContext`. `exportMine` now authorizes the authenticated subject's completed ACCESS request on the same scoped transaction client as its existing user, privacy-case, and society-filtered data export queries. The society and personal export selections, redactions, response schema, maximum row limits and compliance disclaimers remain unchanged. It does not permit using a case from another society or belonging to a different user to export data.

`erasurePlan` reads the society-scoped ERASURE case and active relationship blockers through one tenant transaction, while society-less independent-home requests use the existing ordinary transaction and global account-relationship check. `executeErasure` uses a tenant-context transaction for society erasure and an unscoped transaction for independent-home requests. The existing advisory safeguards are **unchanged**: plan preflight occurs before the write transaction; within the write transaction the service acquires case and subject row locks, rechecks legal hold, explicit retention approval and active relationships, performs the existing scoped erasure/minimisation operations, marks the case completed and appends immutable evidence atomically. No new deletion or data-retention categories are introduced. This work is not an excuse to weaken either the in-transaction rechecks or the distinction between society and independent-home anonymisation.

Unit tests require the scoped transaction client, no global raw-query fallback, denial of foreign/other-subject exports, erasure-plan blockers and fresh in-transaction legal-hold and active-relationship checks. Native PostgreSQL tests cover two societies and independent-home cases, authorized completed ACCESS data exports, refusal of foreign/other-subject exports, isolated privacy-case records, erasure blockers and non-destructive refusal. Existing output fields and controller role/identity checks are preserved.

Deterministic tenant-access inventory regeneration and full protected CI are required. Tenant context does **not** by itself enforce PostgreSQL RLS; RLS policy enabling, further worker/service isolation, external integrations and productionization are separate. No schema, API, permission, staging or main branch modification. Roll back by reviewed revert.

## V5.2.22 protected closure

PR [#1233](https://github.com/auraakart/Aaraaweb/pull/1233) merged into develop at `1404bf7576dbe48e460d8a6180af7e84e22fae03` after final [CI 38201724033](https://github.com/auraakart/Aaraaweb/actions/runs/38201724033) passed for head `e6ef9f81410b01e6562be4e954fa0d7963d21453`.

## V5.2.23 privacy incident and grievance society context

The existing `PrivacyIncidentService` now uses `PrismaService.withTenantContext` for grievance contact retrieval/upsert, incident listings, incident creation, status transitions and event history. The existing incident-category and active-assignee validation occurs inside the **same tenant transaction** as incident creation and append-only evidence insertion; the category and membership records are read with `FOR SHARE` to keep those references stable during creation. SQL still explicitly filters by society. Existing DTOs, controller permissions, validation error messages, event types and response shapes are not changed.

Incident status updates now acquire the society-scoped parent row using `SELECT ... FOR UPDATE` **before** verifying whether an incident is closed and before writing the conditional update and append-only evidence. The prior 'already CLOSED' idempotency and refusal to reopen are preserved; concurrent status changes serialize on the parent row. Incident history checks the society-scoped parent and loads its audit events using one tenant client, with fail-closed behavior for foreign incidents.

Unit tests prove no global Prisma fallback, same-transaction category/assignee checks, audit insertion failure propagation, row locks, terminal idempotency, foreign parent denial and grief contact tenant context. Native PostgreSQL tests verify two societies, distinct categories/assignees/incidents, foreign access rejection, audit write rollback on oversized event note, closed-state idempotency, contact upsert isolation and existing append-only triggers. Fixture-only cleanup transactionally restores audit triggers.

Regenerate and check the V5 deterministic tenant-access inventory, and require the canonical protected CI gates before develop merge. This scope is **society privacy incident/grievance only**: independent-home privacy requests are unaffected and no society-less incident route is introduced. Tenant context is not PostgreSQL RLS. No new incident disclosure protocol, regulatory certification, schema/DTO/auth change, staging/main promotion or productionization. Roll back via reviewed revert.

## V5.2.23 protected closure

PR [#1234](https://github.com/auraakart/Aaraaweb/pull/1234) merged to develop at `7a87758a88b7f3cbc06a6a83c51c20515cb3aa93` after final [CI 38202811530](https://github.com/auraakart/Aaraaweb/actions/runs/38202811530) passed at validated head `b21721c175caa58a5126e160a4d9d4ea6c4ce013`.

## V5.2.24 targeted workforce leave tenant and concurrency hardening

A targeted inspection of the existing `services/api/src/workforce` files identified direct Prisma accesses in the established workforce leave, ratings and suspension paths; `workforce-leave.service.ts` had nine direct raw queries and no tenant-context wrapper. This slice **reuses** `WorkforceLeaveService` and `PrismaService.withTenantContext` instead of creating a replacement module. All six existing leave operations (`listMine`, `listSocietyActive`, `createMine`, `cancelMine`, `assertNoActiveLeave`, `activeAssignmentIds`) now use society-scoped transaction clients and retain their explicit society, current occupancy and assignment predicates. Empty assignment-id lookup retains its early return.

The important concurrency defect was a separate ownership lookup, overlap query and insert in `createMine`. A single tenant-scoped transaction now checks active resident occupancy and assignment ownership, acquires `FOR UPDATE OF wa` on the parent workforce assignment row, checks existing active leave overlap, and inserts leave. A second concurrent request on the same assignment must wait for the row lock, then re-evaluate overlap with a fresh READ COMMITTED statement. This prevents two overlapping leave records from racing through pre-insert checks. `cancelMine` now locks the active leave row `FOR UPDATE OF wl` during owner/occupancy verification and updates the same record only when still active, inside one transaction. Existing date limits, status errors and APIs are preserved.

Focused unit tests cover transaction selection, no global client fallback, parent-row locking, foreign assignment and resident denial, overlapping ranges, inactive/foreign cancellation, gate leave checks, review ID filtering and invalid-date fail-fast. A disposable native PostgreSQL fixture tests two society datasets, simultaneous overlapping create attempts for the same assignment, cross-society isolation, gate exclusion, authorized cancellation, and new leave booking after cancellation.

Outstanding scope remains explicitly open: workforce ratings, suspension workflows, general workforce access/reporting and partner boundaries, along with database RLS enabling and productionization. This does **not** claim that the entire large tenant-access inventory has been eliminated; the existing deterministic register is regenerated and checked as the canonical evidence for the specific changed slice. No schema or controller/DTO permission change. No staging/main promotion. Require protected CI and reviewed rollback.

## V5.2.24 protected closure

PR [#1235](https://github.com/auraakart/Aaraaweb/pull/1235) merged to develop at `630ee09b720c88bd17a5471d82b66b2f58bec976` after [CI 38208802762](https://github.com/auraakart/Aaraaweb/actions/runs/38208802762) passed at head `304357d3c675af613e8e44acb5b3f1b2beb03a6b`.

## V5.2.25 workforce rating and suspension tenant context

Reuse existing `WorkforceRatingService`, `WorkforceSuspensionService`, and `PrismaService.withTenantContext`. Resident rating list, write, and society score summary run exclusively through the scoped transaction client. Rating update now checks the current resident's UnitOccupancy and society assignment status under `FOR UPDATE OF wa` **inside the same tenant transaction** as the existing upsert, preserving the one-rating-per-assignment constraint, eligible APPROVED/SUSPENDED assignments, score bounds, summary calculations, and explicit society predicates. This closes a stale pre-write ownership/status check without creating a new rating model.

Suspension worker/assignment list and history reads use society-context transactions; history joins constrain worker and assignment society alongside the event society. Worker and assignment suspension/reinstatement transactions lock the current active society-specific row `FOR UPDATE` before the existing ORM state check, update and event write. Updates retain an explicit society predicate; terminal idempotence and audit event type/shape are unchanged. Assignment reinstatement additionally locks and rechecks the active verified worker to avoid worker verification changing between approval and commit. `recordEvent` remains in the **same transaction** and failure rolls back the state change. These are transition-consistency guarantees, not complete coverage of all workforce orchestration or global gate entry logic.

Unit tests cover tenant context on reads/writes, ownership and status refusals, locked transitions, no duplicate terminal events, worker verification guard, and audit failure propagation. A disposable native PostgreSQL two-society fixture covers rating and summary isolation, foreign member/assignment/worker denial, two simultaneous suspension attempts, worker/assignment reinstatement prerequisites, same-society audit history, and actual rollback after rejected audit foreign key. Targeted inventory regeneration and full protected CI must pass before develop merge.

**Not included:** enabling database RLS, changing controller roles/entitlements, physical gate device integration, broad workforce business logic, provider integration, productionization or promotion to staging/main. Remaining general workforce and partner-isolation gaps stay open. No schema or endpoint changes.

## V5.2.25 protected closure

PR [#1236](https://github.com/auraakart/Aaraaweb/pull/1236) merged at `4c6f9b4749bca0225e35c15fdedcf8047e8d8a09` after final [CI 38210861496](https://github.com/auraakart/Aaraaweb/actions/runs/38210861496) passed on head `a83a3dab8066ef37cf61b585079dd8b6a88f108c`.

## V5.2.26 core workforce authorization and gate-facing reads

Reuse existing `WorkforceService` and `PrismaService.withTenantContext`. An assignment reviewer decision and resident deactivation are each performed in one selected-society transaction: `SELECT ... FOR UPDATE` locks the active assignment before loading its status and checking either PENDING review or the resident's **current UnitOccupancy**, then mutates with an explicit society predicate. Review approval retains its existing worker verification workflow; review is terminal for any non-PENDING status. Deactivation still requires the actual current occupant (not a non-resident owner) and preserves the existing response shape.

Resident workforce status now checks UnitOccupancy and reads attendance/leave/payment summaries on one society transaction client. Gate eligibility listing uses the same tenant context while keeping active/verified worker, date, and schedule filters. The established serializable gate check-in/out and idempotency/notifications paths are **not rewritten** in this slice. This is not a claim that every gate or workforce SQL path is isolated.

Unit regression asserts locked state decisions, foreign society refusal, current occupancy before deactivation, same-client status reads and gate eligibility scopes. Disposable native PostgreSQL validates simultaneous reviewer decisions, foreign tenant/reviewer access refusal, current resident deactivation and immediate gate ineligibility. Deterministic tenant inventory refresh and canonical protected CI required. Future work: workforce creation/payment and remaining access paths, partner RBAC, final integration audit. No database migration, API, staging/main or productionization change.

## V5.2.26 protected closure

PR [#1237](https://github.com/auraakart/Aaraaweb/pull/1237) merged to develop at `043a879d6facd77e09677fe1c3893eb60fc6e9c4` after [CI 38213821926](https://github.com/auraakart/Aaraaweb/actions/runs/38213821926) passed on feature head `6b60b3d58184211a4087018f315fac9351af81a9`.

## V5.2.27 operational RBAC and partner-boundary closure

The existing AuthContextService already resolves operational permissions from society memberships and SocietyResponsibilityAssignment auditors. It does **not** import commercial PartnerMembership grants. This slice hardens the final trust boundary: require at least one verified, active role row belonging to both the authenticated user and the selected society, even if a repository accidentally returns extraneous cross-society or cross-user rows; deduplicate effective roles without broadening them. A selected society with no matching active roles fails with UnauthorizedException. TenantGuard now also requires an effective operational role, so an independent-home context or a partner-only context cannot exploit a societyId value by itself. The guard does not add any role, bypass gate-role segregation, or change session scope.

Negative unit tests include wrong society, wrong user, inactive membership, role selection/deduplication, missing society, commercial-only context and actual tenant acceptance. A disposable native PostgreSQL fixture assigns the same user to two distinct commercial partners/societies: an active commercial OWNER membership and inactive society admin role for society A cannot grant operational access; only a current TENANT society B membership authorizes B; after revocation, neither partner membership nor a previously active society role revives authority. Existing session refresh/revalidation and operational gate SoD remain in force.

Full protected CI, no schema/API/permission matrix rewrite or new partner portal. Worker and payroll access paths remain subject to V5.2.28 review. RLS enabling, productionization and stage/main release are separate.

## V5.2.27 protected closure

PR [#1238](https://github.com/auraakart/Aaraaweb/pull/1238) merged to develop at `e684fe728f85250bb5bc8ac91b09578b7a596743` after [CI 38214550398](https://github.com/auraakart/Aaraaweb/actions/runs/38214550398) passed at head `50f0121164555d195649b4bef5818de94495b685`.

## V5.2.28 household workforce private data and mutation context

Reuse existing `WorkforceService` with transaction-local `PrismaService.withTenantContext`; no replacement module. Worker creation now locks the selected household and rechecks the current user occupancy **inside the same society transaction** as worker and assignment upserts, preventing a previously authorized nonresident from mutating a household after occupancy has changed. Previously independent staff-payment assignment/occupancy authorization is now performed after the existing idempotency advisory lock, on the **same transaction client** as the existing idempotency-replay check and insert. The matching society assignment row is locked `FOR UPDATE`, protecting its identity and ensuring the current resident's relationship is revalidated even for an existing idempotency key. Existing salary/advance/bonus/reimbursement/adjustment fields, validation, private-record disclaimer and response shapes remain unchanged. This records private historical payment evidence only; it never executes a money transfer.

Private payment listing reuses its explicit `UnitOccupancy` and society SQL predicates with tenant transaction context. Attendance histories now authorize the selected assignment and current occupant and query the authoritative gate attendance and leave records **on one society transaction client**, preserving the established rule that missing gate evidence is not treated as absence. Exact max history and idempotency limits remain.

Targeted tests check no global-client fallback, authorization before private data query, foreign assignment denial, idempotency conflict and replay, worker creation ownership, and scoped attendance. Native two-society PostgreSQL test checks concurrent duplicate payment replay, foreign household/assignment access, occupancy revocation, authorized staff creation, and bounded attendance. Inventory regeneration and full protected CI required before merge. Remaining gaps and closure verification proceed in V5.2.29; RLS remains disabled and productionization separate.

## V5.2.28 protected closure

PR [#1239](https://github.com/auraakart/Aaraaweb/pull/1239) merged at `84093ace89bfc4e795e7ba043c727b5058cddaab` after [CI 38219450606](https://github.com/auraakart/Aaraaweb/actions/runs/38219450606) passed for feature head `7b4a714cb016fc07948a3b76a7ce87dc0da7114c`.

## V5.2.29 final gate eligibility recheck and V5.2 closure evidence

The existing `WorkforceService.gateCheckIn` is already a serializable idempotent mutation with a checked-in access record, gate mutation receipt and immutable audit evidence in a single transaction. However, before this slice, current gate/assignment/worker/occupant eligibility was checked only in a preflight read; an administrative status change or household move-out could occur before commit. The established serializable transaction now **revalidates** the gate with `FOR SHARE`, active APPROVED assignment with `FOR UPDATE OF wa`, and the active VERIFIED worker with `FOR SHARE`; it rechecks the latest allowed schedule/dates and reloads notification-enabled current `UnitOccupancy` from the same transaction. The authoritative current occupant, not a stale preflight contact, is used as the host user and for successful gate event notifications. Existing duplicate-check-in checks, leave blockers, receipts, audit events, guard-role controller restrictions and transaction retry/conflict handling are not replaced. Idempotent replay of an already executed action retains its established semantics.

Unit tests reject post-preflight gate/worker/assignment revocation, expired schedule and absent occupants before any visit/audit creation, and verify that a changed current tenant receives the successful notification instead of a former occupant. Existing gate serializable unit tests are adapted to the revalidation client. Protected CI and default-brand smoke are required before closure. The deterministic tenant-access inventory documents query boundaries; PostgreSQL RLS is not enabled by setting transaction context alone. No new schema, controller, hardware, staging/main or productionization change. See `docs/architecture/V5.2-AUDIENCE-ISOLATION-CLOSURE.md` for the security boundary matrix, limitations and acceptance evidence.

## V5.2.29 protected CI merge and V5.2 engineering closure

PR [#1240](https://github.com/auraakart/Aaraaweb/pull/1240) merged to develop at `3b9a2b2dcdeedf62f6ffc6fb3c614c4f6359a937` after final [CI 38220433996](https://github.com/auraakart/Aaraaweb/actions/runs/38220433996) passed on validated head `e095da5fc7c1449d414a3cfc89036f433ecd806d`. With 29/29 slices now fully validated and merged, V5.2 audience RBAC and tenant-isolation **engineering scope** is complete. Reconciliation to the release manifest is performed by this separate protected documentation closure PR. See `docs/architecture/V5.2-AUDIENCE-ISOLATION-CLOSURE.md` for acceptance scope and exclusions. This is not V5-wide closure: V5.0/V5.1 remain individually tracked, V5.3+ planned, and PostgreSQL RLS enabling, background worker boundaries, independent real-provider validation, infrastructure and productionization explicitly remain outside this milestone.
