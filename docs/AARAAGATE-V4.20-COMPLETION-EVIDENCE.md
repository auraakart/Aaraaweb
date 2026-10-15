# Aaraagate V4.20 Completion Evidence — Facilities, Assets & Work-Order Depth

Date: 2026-09-19  
Status: Repository closure evidence

## Functional slices

- V4.20.1 merged via PR #713: Facilities operator depth.
- V4.20.2 merged via PR #714: Asset/work-order readiness evidence.
- V4.20.3 merged via PR #715: Contract/preventive maintenance depth.
- V4.20.4: traceability, roadmap, completion evidence and score reconciliation.

## Repository evidence

### Operator workflow
- Facilities uses tenant-scoped active-assignee context under FACILITIES_READ.
- Work-order and preventive-plan assignment uses typed selectors.
- Work-order completion/cancellation uses persistent typed controls rather than browser prompts.
- Append-only work-order history includes actor names and lifecycle evidence.

### Readiness and prioritization
- Authorized operators receive descriptive assignment, overdue, asset-state and evidence-readiness signals.
- Critical active work is prioritized with next-action guidance.
- Existing work-order transition rules remain unchanged.

### Contract and preventive depth
- Service-contract rows expose linked preventive-plan title, active state and next-due date.
- Preventive-plan evidence drill-down exposes generated work orders, linked service contracts and related evidence records.
- Provider verification, tenant scoping and duplicate-safe preventive generation remain server-authoritative.
- Contract/evidence metadata does not establish legal, warranty or AMC validity.

## Validation evidence

V4.20.1, V4.20.2 and V4.20.3 functional heads passed required API/Admin/Flutter validation, dependency security, security/privacy, role-UAT, policy, pilot-acceptance, staging-pilot, cross-role E2E and performance gates as applicable. V4.20.3 additionally surfaced one narrow Admin regression-contract mismatch during validation; the regression was corrected to assert the rendered server boundary rather than duplicate backend wording, without weakening product checks.

## Score reconciliation

Repository-only evidence score: **9.13 / 10**.

Changed category:
- Administration/governance: **9.5 → 9.6**

Unchanged:
- Gate/security 9.3
- Resident experience/features 9.5
- Accounting/billing/ERP 9.0
- Amenities/community/services 9.1
- Architecture/platform design 9.1
- Differentiation potential 9.4
- Production/field readiness **8.0**

## External evidence still required

This closure does not establish:
- Facility Manager human UAT acceptance;
- physical inspection, asset-health or maintenance field outcomes;
- provider, warranty or AMC legal validity;
- representative-device/browser acceptance;
- hosted production behavior.

Production/field readiness therefore remains exactly **8.0**.
