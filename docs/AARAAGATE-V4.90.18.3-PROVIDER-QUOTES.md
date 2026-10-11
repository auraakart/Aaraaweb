# V4.90.18.3 — Provider quotation authoring and status review

**Base:** develop `b616db4b61a3d75643eecae72be33aabf8a00d8a`. Completes the provider-facing side of the V4.90.18.2 explicit extra-work quote consent workflow.

The existing provider Bookings queue now offers **Propose extra work quote** only for IN_PROGRESS bookings. A provider operator enters a 10–1500 character scope and an exact rupee amount (max 2 decimals, positive, maximum ₹10,00,000). A persisted-in-component retry draft retains the same `idempotencyKey` if transport fails; UI offers **Retry saved quote** and a distinct **Discard local draft** action. Successful server responses are added to visible quote records. The **Review quote decisions** control retrieves provider-scoped approved/declined/pending history for the booking.

No new provider app, no direct payment gateway, no automatic repricing. Quotation approval remains resident-initiated in Resident Flutter. Existing provider offering, dispatch, booking time and completion controls remain in place.

**Limitations:** Draft retry identity survives rerenders but **not provider page reload**; the server binds the exact key permanently when submitted. After a reload, review existing quote decisions before submitting again. For a production-grade offline provider UI, a secure locally persisted draft policy and field UAT are separate work.

Node acceptance tests verify whole-paise conversion, disallowed imprecise inputs and key preservation; existing Admin operations suite includes it. Full Admin lint, typecheck, tests and required CI gates must pass before develop merge. Staging/main stay unchanged.
