# V2.4 Security & Privacy Automated Evidence

This document records automated supporting evidence for the V2.4 `V24-SECURITY-PRIVACY` gate. It does **not** complete or approve that gate. Human security/privacy review remains required before release acceptance.

## Automated controls checked

The CI script `scripts/check-v2-security-privacy-controls.mjs` verifies the following repository controls on every pull request:

- all privacy controllers are protected by bearer authentication, tenant isolation and permission guards;
- privacy read and manage permissions are both present on the privacy API surface;
- privacy operations receive the current tenant explicitly;
- privacy case handling includes access/correction/erasure request types, retention reason and legal-hold controls;
- consent handling includes withdrawal, minor-at-record, representative and evidence-reference fields;
- the privacy registry contains retention trigger/days, sensitive/minor-data flags, processor location and agreement reference fields;
- security incident handling includes affected-data categories, minor-data suspicion, incident lifecycle and grievance-contact handling;
- production preflight requires CORS configuration, Firebase service-account material and payment webhook secret, and enforces HTTPS for production API/object-storage endpoints;
- provider-media storage remains coupled to malware scanning when enabled;
- high/critical npm dependency auditing remains enforced in CI;
- API source code is rejected if it contains direct full-process-environment logging patterns.

## Evidence boundary

These checks establish repository-level and configuration-level evidence only. They do not establish that:

- a deployed environment has been independently penetration tested;
- society-specific retention/legal-basis configuration is correct;
- operational privacy procedures are being followed by staff;
- incident-response timings or external notification obligations have been legally validated;
- production secrets are rotated, independently audited, or stored in a particular secret-management product;
- a human privacy/security reviewer has accepted the overall V2 release.

Those items remain part of the manual V2.4 security/privacy gate and/or society pilot acceptance.
