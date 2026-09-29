# Aaraagate V4.79.2 — Amenity Refundable Deposit Lifecycle

Date: 2026-09-29  
Baseline: `develop@85b70e065de6528cdf4acbaa24ddf7d8eea7884a`

## Objective

Close the paid-amenity refundable-deposit gap without creating an amenity wallet or treating client/provider intent as settled money.

## Implemented

- Amenity policy may configure a refundable deposit plus a bounded payment window.
- Every booking snapshots its deposit amount and payment window so later policy edits do not rewrite an existing reservation contract.
- Approval-required bookings wait for approval before deposit payment becomes eligible.
- Instant and waitlist-promoted confirmed bookings expose a server deadline for deposit payment.
- Resident checkout creates the existing society `Payment` transaction truth with explicit purpose `AMENITY_DEPOSIT`; amount and payer are database-guarded against the booking snapshot.
- Maintenance invoice payments remain `MAINTENANCE_INVOICE`; captured amenity deposits are excluded from maintenance unapplied-cash calculations and cannot be allocated to receivables.
- Gateway capture moves the booking deposit to `CAPTURED`. Check-in is blocked until capture.
- Cancellation, revocation, completion and no-show never auto-forfeit or auto-refund captured money; they move captured deposits to `REFUND_REQUIRED`.
- Provider-confirmed refund moves the booking to `REFUNDED`. Existing PaymentRefund/reconciliation evidence remains the accounting/refund authority.
- Unpaid confirmed bookings past the server deposit deadline are safely cancelled by the existing scheduled-work mechanism and their slot may promote the next eligible waiter.

## Deposit states

`NOT_REQUIRED → APPROVAL_PENDING → PAYMENT_REQUIRED → CAPTURED → REFUND_REQUIRED → REFUNDED`

Unpaid or rejected commitments move to `VOIDED`. No state is inferred from a client-only success signal.

## Boundaries

No live gateway credential, automatic provider refund execution, deposit forfeiture policy, statutory/tax interpretation, or production acceptance is claimed. The provider adapter and reconciliation domains remain responsible for real external execution.
