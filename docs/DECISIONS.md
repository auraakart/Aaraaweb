# aaraagate Architecture Decision Log

## ADR-001 — Multi-tenant SaaS
**Decision:** Society is the primary tenant boundary for operational data.

**Reason:** The product serves multiple gated communities and the specification requires strong society-level isolation.

## ADR-002 — Separate Resident and Guard mobile apps
**Decision:** Build two Flutter applications sharing design tokens and domain contracts, rather than one role-switched app.

**Reason:** Their workflows, information density, hardware use and failure modes are fundamentally different.

## ADR-003 — API-first backend
**Decision:** NestJS is the single application boundary for clients and integrations.

**Reason:** It centralizes authorization, validation, auditing, payment verification and tenancy enforcement.

## ADR-004 — Guard offline architecture
**Decision:** Guard-side gate events use local durable storage plus idempotency keys and server synchronization.

**Reason:** Gate operations must continue through low-signal conditions without creating duplicate or unverifiable entries.

## ADR-005 — Minimal resident home
**Decision:** Home is state-driven and prioritizes pending actions over a grid of every feature.

**Reason:** Current consumer UX practice favors focused task completion over feature-heavy dashboards, while the product requirement explicitly calls for a simple and fast resident experience.

## ADR-006 — Hardware optional in V1
**Decision:** Design interfaces for future RFID/ANPR/boom-barrier integrations without requiring hardware for the first commercial release.

**Reason:** This keeps onboarding and pilot deployment lean while preserving future integration paths.
