# aaraagate Architecture Decision Log

## ADR-001 — Multi-tenant SaaS
Society is the primary tenant boundary for operational data.

## ADR-002 — Separate Resident and Guard mobile apps
Build two Flutter applications sharing design tokens and domain contracts because their workflows, information density, hardware use and failure modes differ.

## ADR-003 — API-first backend
NestJS is the single application boundary for clients and integrations, centralizing authorization, validation, auditing, payment verification and tenancy enforcement.

## ADR-004 — Guard offline architecture
Guard-side gate events use local durable storage plus idempotency keys and server synchronization so gate operations continue through low-signal conditions safely.

## ADR-005 — Minimal resident home
Home is state-driven and prioritizes pending actions over a grid of every feature.

## ADR-006 — Hardware optional in V1
Design interfaces for future RFID/ANPR/boom-barrier integrations without requiring hardware for first commercial release.
