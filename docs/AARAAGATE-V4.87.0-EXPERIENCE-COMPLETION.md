# V4.87.0 — Experience Completion & Cross-role Validation

Baseline: develop `b52dce4d97a1df6efcc10b87fcd113ff0f2095cc` (premium Resident foundation, PR #1132). Release identity: Root/API/Admin `4.87.0`; Resident/Guard `4.87.0+48700`. Existing navigation, tenancy, occupancy, permissions and financial/booking confirmation rules remain authoritative.

## Consolidated sequence

| Slice | Implementation and acceptance |
|---|---|
| 1. Validate priority journeys | Existing Gate, Billing, Amenities and Notices tests plus 320px/200% text, light/dark contrast, reduced-motion and touch-size checks. Physical-device review remains external evidence. |
| 2. Complete Resident experience | Adaptive Home shortcuts, shared Staff/Profile headers, uncapped essential text, flexible Helpdesk target rows, full-size provider buttons, scalable service category rail, responsive Assistant/circle actions and keyboard-safe circle composer. |
| 3. Voice, discovery and governance | Recording locks query/draft/language controls until review. Core discovery renders before optional metadata, ignores older requests, has bounded loading/retry, and resets invalid addresses. Existing circle approval, identity, reports, expiry and deletion tests are retained. |
| 4. Admin and Guard convergence | 48px Admin controls, 56px Guard targets retained, quiet panels, consistent radii/grid, Guard AA foregrounds and control boundaries, reduced-motion feedback, non-truncated action labels. |
| 5. Regression and documentation | Targeted recovery regressions, full CI at this consolidated milestone, Admin browser/axe checks, release identity and source contracts, code review and this evidence matrix. |
| 6. Promotion | One consolidated staging candidate after develop checks pass. Main remains subject to independent manual approval; the stable demo APK is generated only from main. |

## Discovery behaviour and root cause

The previous catalogue loader awaited trust, favourites and recent-provider requests serially before rendering categories, locations or offerings. The shared API client supplies no request deadline; a stalled optional request could leave the screen waiting indefinitely. Overlapping category requests had no generation check, and a removed/unconfigured selected address could retain a stale key.

Core category/location queries now run together, publish their context, and query scoped offerings with a 20-second deadline per core request. Provider results become visible before optional trust/favourites/recent/deal metadata finishes. Optional requests run together with 8-second deadlines; failures are informational. Generation checks protect context, results, errors and metadata. A favourite revision check prevents late metadata from undoing a user's newer preference. Deadlines release the UI wait and ignore late results; they do not claim to cancel an upstream server operation.

Nearby means **serviceable for the selected address**. `ConsumerServiceLocationService.resolveLocation` enforces access to the home or society unit. `listServiceableOfferings` requires active offerings/categories, active VERIFIED providers, and an active provider service area matching the address postal code; offering-specific service areas apply when configured. This release preserves those checks and does not introduce distance ranking or unrestricted discovery.

## Preserved governance and safeguards

- Circle requests remain pending until an authorised society manager reviews them.
- Joined members retain server-resolved sender name/flat snapshots. Reports and manager moderation remain available.
- Optional authorised expiry retains the existing API lifecycle and deletion sweep; expiry is not implemented as a client-side timer.
- Speech results fill a reviewable draft and never submit automatically. Tamil locale/session handling remains covered by the existing speech tests.
- Service discovery, card presentation, availability, booking, payment and gate approval remain separate authorised operations.
- The five persistent destinations and four approved Home shortcuts are unchanged.

## Automated evidence

New tests cover stalled optional trust, stale category responses, core timeout/retry, unconfigured addresses, recording/action concurrency, circle composition with keyboard/200% text, Guard contrast and reduced motion. Existing Resident speech, circle governance/message order, service location/booking/recovery, property isolation and cross-role API tests remain regression gates. Admin browser contracts now require 48px buttons and retain axe, narrow layout, keyboard, error recovery, destructive confirmation and reduced-motion checks.

Run results and promotion references are recorded in the pull request and GitHub Actions. Repository code changes can be completed automatically; real microphone behaviour, TalkBack announcements, animation feel and physical-device efficiency are not inferred from unit/widget tests.

## Physical-device acceptance checklist (pending)

Use two Android screen sizes with light/dark mode, normal/200% text, keyboard open and TalkBack enabled:

1. Approve/deny a visitor; inspect duration and current occupant routing.
2. Review and pay the earliest maintenance bill in the demo; check cancellation/recovery and receipt readability.
3. Choose an amenity date/time and guests; review availability, approval and deposits.
4. Read/acknowledge a notice; check urgent versus informational states.
5. Record Tamil twice consecutively, retry after silence/permission denial, review the transcription, and verify no automatic submission.
6. Switch service location/category, search, simulate offline/retry, open a provider and start a booking. Verify displayed providers match the selected context.
7. Request a circle, inspect manager approval/rejection, verify sender flat, report a post, enter a long message with keyboard open, and verify expiry/deletion.
8. Run Guard offline retry/reconnect and Admin keyboard/destructive confirmation checks.

The checklist is an explicit acceptance task, not a claim that device UAT or production readiness is complete. Production infrastructure, live integrations, hardware certification and iOS rollout are excluded from this cycle.
