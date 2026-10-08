# V4.86.3 — Resident voice session recovery

User reported Tamil being recognized as English and second Assistant recordings losing text on V4.86.2.

## Code findings and changes

- Locale selection previously fell back to the device/system language when the selected language was missing. Require a same-language locale, or show recognition-language availability guidance. Do not claim to fix device-engine transcription accuracy by changing UI copy.
- `notListening` indicates microphone capture ended, not that the final transcript arrived. Await final results or `done`, with the existing 22-second deadline retained.
- The speech plugin is a singleton whose first initialization callbacks remain installed. Share one resident adapter/callback owner across screens, initialize once, and cancel pending native work before and after a recording.
- Capture callbacks are bound to their recording completer; late results cannot populate a later draft. Use dictation mode for questions. Overlapping captures do not replace active callbacks.
- Assistant and complaint screens handle unsupported recognition language without losing typed drafts or remaining stuck in the listening state. Speech only drafts text; no automatic Ask/complaint submission.
- Release identity: 4.86.3; Resident/Guard build code 48603.

## Validation

Regression cases cover exact Tamil locale selection, missing Tamil refusing English fallback, notListening before final text, consecutive Tamil recordings, old callback isolation, one initialization, and final text after stop. Assistant widget regression covers two Tamil drafts without automatic submission. Shared release/adoption guards and diff checks pass locally; Flutter CI must run the adapter and widget tests before merge.

## Acceptance remaining

Re-test consecutive English and Tamil recordings on the reporting Android device after installing the rebuilt APK. Device recognition service and Tamil language availability determine actual accuracy; automated callback fixtures are not physical microphone/engine acceptance. Main promotion still requires independent GitHub approval.
