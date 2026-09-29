# Aaraagate V4.64 — Community Poll Participation & Recovery

Date: 2026-09-27
Status: Release candidate closed on `develop`; release identity is V4.64.0.

## Objective

Complete the existing non-statutory community-poll capability on the Resident Community surface without introducing statutory voting semantics, a second poll model or client-side authority.

## Resident participation

Residents can open an eligible community poll, review its description and non-statutory boundary, select one server-provided option and explicitly confirm the response. Polls already answered show the authoritative recorded option and no longer expose a second response action. Closed polls remain reviewable but not actionable.

## Authoritative recovery

The backend remains authoritative for eligibility, audience scope, open/close timing, option membership and one-response-per-user enforcement. The Resident client never manufactures a successful response. After every response attempt it reloads the community-poll read model and accepts success only when authoritative `myOptionId` exactly matches the selected option.

If the POST outcome is uncertain but the refreshed option matches, the client reports recovered success without submitting a second response. If no option is confirmed, the action remains retryable. If a different option is already recorded, the client surfaces that conflict and withholds another mutation.

## Demo and regression parity

Demo mode retains poll responses in its local repository so the showcase follows the same one-response UX. Focused widget tests cover normal confirmation, commit-then-transport-failure recovery and an unverified failure that must remain retryable.

## Boundary

Community polls remain explicitly non-statutory. V4.64 does not add election/association statutory voting, change poll eligibility, widen governance permissions, expose results before backend policy allows them, or claim staging/main promotion, productionization or field acceptance.
