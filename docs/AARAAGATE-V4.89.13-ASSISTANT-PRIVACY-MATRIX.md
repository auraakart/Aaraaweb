# V4.89.13 — Society Copilot adversarial privacy acceptance

This is a narrow, dedicated API regression matrix added while V4.89 demo parity, FAQ, and navigation slices complete validation on develop. It is test-only and changes no API contracts.

## Threat scenarios

- A tenant, nonresident owner or former occupant attempts to read a household, gate/briefing, vehicle or parcel record from a unit where they lack active occupancy.
- A current tenant attempts to see the private pickup/tracking fields of an otherwise authorized parcel.
- Family-member roles attempt to read invoice/payment data while only authorized helpdesk context is requested.
- Published society knowledge searches retain their audience checks for tenants.
- Prompt text attempts to bypass policy; no unrestricted tool executes.
- A security-guard role cannot transform a society-level operational role into a resident-only parcel read.

Expected safeguards: server-checked selected society and unit, current occupant relationship and end dates, caller/recipient IDs, least-data projections, no mutation without a proposal/confirmation, audit without raw prompts.

All negative tests must pass alongside the existing full API suite before develop merge. Owner/tenant relationships and privileges on *different* properties must remain independent. This matrix is not a substitute for physical device testing, external penetration testing, or productionization.
