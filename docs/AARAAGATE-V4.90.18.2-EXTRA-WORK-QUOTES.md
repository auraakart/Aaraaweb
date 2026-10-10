# Aaraagate V4.90.18.2 — Extra-work quotation consent

After V4.90.18.1, provider-suggested time changes and booking dispute history remain distinct from pricing. A provider operator can quote extra work on a provider-owned IN_PROGRESS booking. The quote snapshots work scope, whole-paise amount (maximum 100,000,000 paise), actor/time, and its permanent decision. One pending quote per booking is enforced by the database; identical retry returns its pending quote. The migration prevents rewrites to economic evidence, and prevents changing an already decided quote.

Resident booking owners see quote details and explicit **Approve extra work** / **Decline extra work** actions with confirmation, optional decline reason, and status history. Booking ownership is checked before listing or deciding. Decisions lock the booking and quote and append a booking event.

**Consent is not payment.** Quote approval does not mutate the booking's original price, issue an invoice, create a payment order, charge the resident or settle with a provider. Those require a separate authorized financial workflow and are deliberately excluded. Provider dashboard entry UI, live payment collection, productionization and staging/main promotion are likewise excluded.

Service and widget tests cover invalid paise values, cancelled/completed states, quote idempotency, consent evidence, no payment side effects, tenant isolation, and explicit on-device approval. Merge only after clean migration, full API and Flutter validation and required CI gates.

**Idempotency after approval:** Quote creation requires a persistent 8–120 character idempotency key. The booking/key pair is unique and immutable. Repeating an exact request returns its quote even after resident approval/decline or later booking completion; changed price/scope using that key is rejected. Provider clients must retain that key for retries.
