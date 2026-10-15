# Aaraagate V4.18 Completion Evidence — Document Repository & Records Governance Depth

Date: 2026-09-18  
Status: Repository closure evidence

## Functional slices

- V4.18.1 merged via PR #705: document operator depth.
- V4.18.2 merged via PR #706: controlled supersession and version lineage.
- V4.18.3 merged via PR #707: Resident society document clarity.
- V4.18.4: traceability, roadmap, completion evidence and score reconciliation.

## Repository evidence

### Operator workflow
- Property-owner-only uploads require an explicit tenant-scoped unit selector and supply the API-required `unitId`.
- Management rows expose building/unit context where applicable.
- Existing append-only `SocietyDocumentEvent` history is visible to authorized operators.

### Controlled supersession
- A published document may create at most one active replacement draft.
- Replacement drafts inherit category, audience and property scope and automatically increment the version.
- Publishing a replacement is transactional: the new version becomes PUBLISHED, the prior version becomes ARCHIVED and receives `supersededByDocumentId`, and append-only `VERSION_REPLACED` evidence is recorded.
- Archived/abandoned replacement drafts do not permanently block a future controlled replacement.
- Published evidence is never destructively overwritten.

### Resident document clarity
- Resident Community consumes `/documents/published`, the real server-authorized society document repository.
- Published documents show title, category, audience, current version, property context and replacement lineage where applicable.
- Document access uses `/documents/published/:documentId/download-intent`; the client does not construct or expose public object-storage paths.
- Governance document references remain a separate Community section.

### Security and storage boundaries
- Tenant/resource scoping and audience/property authorization remain server-side.
- Private storage keys remain society-scoped.
- Uploaded object metadata is verified before draft creation.
- File safety scanning remains required.
- Download access remains bounded by server-authorized intents.

## Validation evidence

V4.18.1, V4.18.2 and V4.18.3 functional heads passed required CI validation, security/privacy, role-UAT, policy, pilot-acceptance, staging-pilot, cross-role E2E and performance gates as applicable. V4.18.3 initially exposed a lazy-ListView widget-test defect; the test was corrected to scroll to the Society Documents section, after which Resident analysis/tests passed and required CI completed successfully. The Resident demo APK packaging workflow is supplementary evidence and is tracked separately from protected merge requirements.

## Score reconciliation

Repository-only evidence score: **9.10 / 10**.

Changed category:
- Administration/governance: **9.3 → 9.4**

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
- hosted object-storage acceptance or production provider behavior;
- statutory/legal validity of uploaded or published documents;
- retention-law or records-policy interpretation;
- representative-device/human document-workflow acceptance;
- customer or field document outcomes.

Production/field readiness therefore remains exactly **8.0**.
