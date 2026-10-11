# V4.90.18.6 — Tab-scoped provider quotation recovery

**Base:** develop `b76df4136222d252c1497c9afc4eaf5a5f4f50ff`. **Problem:** after a submitted extra-work quote loses its HTTP response, the provider page only remembers the exact idempotency key in a React ref. Reloading the page destroys that identity and risks an accidental second proposal.

## Change
- Persist each unconfirmed quote **before** HTTP submission in browser `sessionStorage`, namespaced by active auth session and provider account. The booking ID, quoted scope, integer paise amount and exact idempotency key are preserved together.
- On reload, recover only valid 10–1500-character scopes, whole-paise prices and 8–120-character keys for current IN_PROGRESS provider bookings. Reject malformed, expired (24h), stale-booking and cross-provider/cross-session drafts.
- Do not submit automatically: show **Retry saved quote** and **Discard local draft**. Use the server's established booking-plus-key idempotency contract.
- Remove the local record on confirmed success, deliberate discard, or sign-out. Browser-tab closure also clears `sessionStorage`. If storage cannot be written, block submission rather than silently losing the recovery key.
- Do not store quote content in `localStorage`, logs, telemetry, URLs, or cross-provider storage. Do not alter consent, original booking price, payments or existing provider APIs.

## Quality and limitations
The Node quotation regression adds round-trip, expiry, malformed/invalid draft, active-booking, provider/session isolation and sign-out checks; existing Admin CI tests remain required. Tab-scoped recovery is **not** recovery after browser-tab closure, device loss or a new login, and does not constitute encrypted long-term local storage. Separate Services 3.1 work remains for richer dispute evidence, independently authorized extra-work billing and field UAT.

Merge only into develop after required exact-head checks. Staging/main remain unchanged.
