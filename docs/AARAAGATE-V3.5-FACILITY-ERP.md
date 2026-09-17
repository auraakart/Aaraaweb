# Aaraagate V3.5 — Facility & Society Operations ERP

## Verified existing foundations
- Facility asset registry and lifecycle status
- AMC/contracts and preventive maintenance
- Work orders, completion evidence and alerts
- Vendor procurement, quote selection and purchase orders
- Purchase order to accounting expense linkage
- Utility meters, readings, tariffs, charges, invoices and integrations
- Patrol/security operations from V3.3

## V3.5 gap closure delivered
### Inventory and spares
- tenant-scoped inventory item master
- reorder threshold and on-hand balance
- append-only stock movements
- receipt, issue and adjustment flows
- optional facility work-order consumption linkage
- negative-stock prevention
- admin inventory surface

### Housekeeping and staff operations
- tenant-scoped housekeeping/staff operational tasks
- scheduling and due dates
- active-society staff assignment validation
- OPEN → IN_PROGRESS → COMPLETED/CANCELLED lifecycle
- mandatory completion evidence note
- append-only operational task events
- admin operations surface

## Exit gate
V3.5 is complete when clean migrations, API lint/typecheck/tests/build/readiness, Admin tests/typecheck/build, Resident/Guard regressions, dependency security and repository contracts are green on the milestone PR. `main` remains out of scope.
