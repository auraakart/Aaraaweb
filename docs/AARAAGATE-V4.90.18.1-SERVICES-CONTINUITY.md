# V4.90.18.1 — Services workflow continuity

**Base:** develop `6739a273b206f6c75ce6ec6fc3322e13282bbf0c`. **Focus:** existing provider booking modification and consumer dispute continuity.

### Confirmed gaps
The existing provider-suggested time workflow checks the booking state outside a database transaction, so cancellation can race a newly created pending proposal. An existing consumer service dispute can be opened and resolved by platform reviewers but has no resident booking-scoped history read, leaving residents unable to see whether the issue was resolved or dismissed. The resident post-service panel also does not reload case state after filing.

### Code change
- Serializes provider time proposals with the booking row `FOR UPDATE` inside a transaction. A cancelled/confirmed booking cannot receive a new proposal based on stale state. A pending proposal is rejected; unique-key races remain database-protected.
- Provides authenticated `GET /consumer/services/bookings/:id/disputes`, checking consumer ownership before returning tenant-scoped case history, including resolution notes. Provider and platform paths unchanged.
- Shows service issue history, review status and resolution text in the existing resident booking panel; refreshes after submission, disables duplicate issue/revisit CTA while a case is OPEN or UNDER_REVIEW.
- Adds targeted API and Flutter tests for locks, cancelled-booking rejection, authorization, history visibility and duplicate prevention.

### Out of scope / next sub-slice
Provider pricing/extra-work quote consent is **not** coupled with time change or payment handling. V4.90.18.2 should provide a separate, auditable quotation acceptance flow with explicit no-auto-charge semantics. No provider hardware, real payments, staging/main promotion or productionization claimed.

### Quality gate
Run changed-service API/Resident Flutter tests, full workflow and exact-head required merge gates before develop merge. Existing features remain intact.
