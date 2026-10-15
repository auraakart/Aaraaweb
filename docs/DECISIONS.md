# Aaraagate Architecture Decision Log

Updated: 2026-09-12

## ADR-001 — Multi-tenant SaaS
Society is the primary operational tenant boundary. Every tenant-owned record and request must be scoped to a society identifier and authorized server-side. Cross-society access fails closed.

## ADR-002 — Separate Resident and Guard mobile apps
Build two Flutter applications sharing design tokens and domain contracts because their workflows, information density, hardware use and failure modes differ.

## ADR-003 — API-first backend
NestJS is the single application boundary for clients and integrations, centralizing authorization, validation, auditing, payment verification, entitlement enforcement and tenancy controls.

## ADR-004 — Guard offline architecture
Guard-side gate events use local durable storage plus idempotency keys and server synchronization so gate operations continue through low-signal conditions safely.

## ADR-005 — Minimal resident home
Home is state-driven and prioritizes pending actions and common journeys over a grid of every feature.

## ADR-006 — Hardware optional in V1
Design interfaces for future RFID/ANPR/boom-barrier integrations without requiring hardware for the first commercial release.

## ADR-007 — Server-side SaaS entitlements
Aaraagate uses per-society product tiers and feature entitlements with controlled overrides. Entitlements are enforced server-side; client visibility is a UX concern, not a security boundary. This enables Starter/Professional/Premium/Enterprise-style packaging without separate product forks.

## ADR-008 — Society-first isolation with future organization hierarchy
The domain model may later support property managers or organizations that manage multiple societies. Organization-level access is additive and explicitly delegated; it must never weaken the society boundary or imply unrestricted access across managed societies.

## ADR-009 — Transactional state changes for gate-critical workflows
Visitor approval/cancellation and gate check-in/check-out use database transactions and conditional state transitions where concurrency could otherwise produce duplicate or inconsistent access state.

## ADR-010 — Release promotion through staging
The release path is `develop` → green CI → `staging` → production-style migration/build/startup and critical smoke/E2E validation → UAT/security approval → `main` → production. Compilation alone is not a release signal.

## ADR-011 — CI and dependency security are release gates
Clean-database migrations, lint, typecheck, automated tests, production builds, Flutter validation and high/critical dependency audit are mandatory engineering gates. Failures are fixed in source/configuration rather than bypassed by weakening checks without a documented reason.

## ADR-012 — Portability over premature lock-in
Use proven managed services where they reduce operational risk, but keep the core application portable: Docker-friendly services, PostgreSQL as system of record, S3-compatible object storage, provider abstractions for OTP/notifications and infrastructure choices with clear migration paths.

## ADR-013 — Tier-one quality and long-term maintainability
Component and technology choices are evaluated for active maintenance, security posture, scalability, testability and upgrade path. Short-term hacks that introduce security, tenancy or operational debt are not accepted merely to increase feature count.

## ADR-014 — Household Services as a commercial platform domain
Household Services is not only a directory. The platform foundation supports categories, providers, society availability, offerings, bookings and ratings, allowing future commission/subscription monetization while deferring a dedicated provider app if necessary.

## ADR-015 — V2 keeps resident UX consumer-first
Aaraagate V2 adds substantial society ERP capability without turning the Resident app into an accounting/procurement console. Finance administration, governance administration, facility operations, procurement and privacy operations are web-first Admin/Operations workflows. Resident surfaces expose only the actions/status needed by that household/persona.

## ADR-016 — Consumer External Services and society vendors are separate domains
External Services marketplace providers serve residents/independent-home consumers. Society vendors/contractors serve the association through contracts/AMCs/procurement. A legal entity may participate in both, but authorization, contract, pricing, operational and reporting records remain separate.

## ADR-017 — Payment transaction truth and accounting truth are separate
Payment providers/gateways determine external transaction state. The society ledger records accounting consequences. Reconciliation links the two but never collapses them into a single mutable record. Accounting corrections use auditable reversal/adjustment semantics rather than destructive history rewriting.

## ADR-018 — State/bye-law-dependent behavior is policy-driven
Aaraagate does not encode one national legal procedure for every Indian society. Tenancy documentation, governance evidence, amenity rules, late-fee policy, parking rules, communication acknowledgements and other variable procedures are configurable and auditable at society/policy scope. Product copy avoids unsupported claims of legal validity.

## ADR-019 — V2 sensitive domains use explicit capabilities before implementation
Finance, governance, facilities, society vendors, documents and privacy operations receive explicit permissions before their APIs are added. This prevents new modules from inheriting broad Society Admin access by convenience and establishes segregation-of-duties tests as an architectural gate.

## ADR-020 — Privacy operations are workflow-driven, not blanket deletion
Aaraagate will represent privacy/data-principal requests as auditable cases with identity/scope checks, decision history and retention conflict handling. Destructive automation must fail safely when accounting, security, legal/dispute or configured retention obligations require preservation.

## ADR-021 — V2 remains a modular monolith initially
Accounting, governance, facilities, vendors, documents, privacy and parcel operations are introduced as bounded NestJS modules inside the existing API. Services are extracted only if scale, independent failure domains, security/regulatory separation or operational evidence justifies the added distributed-systems cost.
