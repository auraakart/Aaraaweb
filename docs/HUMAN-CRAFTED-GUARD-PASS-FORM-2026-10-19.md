# Guard Create Gate Pass form: required-field feedback and large text

Date: 2026-10-19
Baseline: `develop` `f2c981247a4be477520e7ada6c4c12273c72d92a`, after successful Guard move pass presentation #1477.

## Source-level findings
The existing Create Gate Pass dialog offers a visibly enabled CREATE button even while reference, person/vendor, or items are missing. Tapping it silently returns without creating the pass; there is no actionable feedback. The modal's large-screen entry layout also has no responsive dropdown expansion for long movement labels.

## Scoped correction
- Extract the form into a bounded reusable GuardFieldPassDialog widget.
- Mark CREATE disabled until all three existing required fields contain non-whitespace text. Do not introduce new requirements or change the payload/permission enforcement.
- Expand the existing Movement dropdown to available width, retaining all four original values.
- Preserve trimmed reference/person/items/vehicle values and the original guard client createPass callback and gate identity.
- Five widget tests: light/dark × 390dp/100% and 320dp/200%, including progressive required-field enablement, exact unchanged submit payload, and cancel without submit.

## Scope boundaries
No API, tenancy, authorization, brand, safety policy, data model, material pass workflow, status or app navigation change. Require changed-test CI, Flutter analyzer/Guard regression, repository invariant contracts and green required merge gates. Physical TalkBack/multilingual/device/operator acceptance remains unverified by automated widget tests. No staging/main/APK change.
