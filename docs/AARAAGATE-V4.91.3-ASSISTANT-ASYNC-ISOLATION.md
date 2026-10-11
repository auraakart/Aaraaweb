# V4.91.3 — Assistant cross-property / cross-session UX safety

**Baseline:** develop V4.91.2 b50753af671c9cf14a2c3ce7b16efb8294b13827.
**Bounded risk:** Stale speech transcripts and stale API answers could survive an authenticated API client or selected property change while the StatefulWidget was reused.

## Correction
- Introduce one monotonically increasing context epoch tied to property, authentication client, demo mode and preference scope.
- Clear cached policy topic, answer, typed query and listening/busy state; request an immediate speech stop.
- Discard all stale microphone transcript, no-audio/error status, assistant answer, catch/finally state and preference write rollback after epoch changes.
- Snapshot the correct API client at dispatch. Switching login while preserving the same unitId must not display old-session responses.
- Keep Assistant speech locked to English only; this does not change Helpdesk localization or actual backend access controls.

## Verification and stop
Two focused Flutter widget regressions: property switch while microphone future is unresolved, and client swap for same unit while API request is unresolved; new-session Ask still works. Preserve prior 320px/200%-text and explicit review/Ask. Require exact-head CI before merge to develop.

No broad redesign, new feature, production claim or real-device TalkBack attestation. Further UX beyond the verified context leak remains independently evaluated.
