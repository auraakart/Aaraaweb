# Aaraagate V4.80.7 — Amenity Deposit Payment Retry Safety

Date: 2026-09-30
Baseline: `develop@3e87422091016483f57788fba93600f3bbc00201`

## Problem

Amenity booking and waitlist mutations already recover safely from uncertain network outcomes, but refundable-deposit payment-order preparation still generated a fresh idempotency key on every tap.

The API is already idempotent and will return an existing active amenity-deposit payment, but the Resident UI discarded request identity after an uncertain response and could tell the user only that the operation failed.

## Fix

Resident now retains one amenity-deposit payment request identity per booking while payment is still required.

- A successful order response clears the retained identity.
- An authoritative 4xx rejection clears the identity because the server definitively rejected that attempt.
- A transport/5xx/unknown outcome preserves the identity and tells the resident to retry safely.
- Reloading authoritative booking state removes retained identities when the booking is no longer confirmed/payment-required.

## Safety boundary

The client does not mark a deposit paid, captured or successful. It only prepares the gateway order.

Gateway/provider confirmation remains the authority for payment completion and deposit state.

## Regression coverage

Resident widget coverage verifies:
- uncertain response followed by retry uses the exact same idempotency key;
- authoritative rejection clears the old key so a later valid attempt receives a new identity;
- successful retry returns the existing/prepared order without client-side payment-state invention.

No API schema, payment table, provider adapter, staging, or main change is introduced.
