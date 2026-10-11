# V4.90.18.5 — Resident extra-work consent lost-response recovery

## Root cause and bounded correction
In V4.90.18.2, `respondToExtraWorkQuote` locked the resident booking but required the booking to remain `IN_PROGRESS` and selected only `PENDING` quotes. When the database committed an APPROVE/DECLINE but the HTTP response was lost, the resident's exact retry failed, especially after a provider completed the booking.

A quotation now returns its prior immutable decision receipt **only if** the same authorized booking owner sends the same APPROVE/DECLINE decision. A DECLINE retry must repeat the same trimmed reason. Concurrent attempts use the existing booking-first, quote-second `FOR UPDATE` lock order (also used for provider withdrawal). Opposite decisions, different decline reasons, withdrawals and mismatched recorded actors remain conflicts. New decisions are forbidden after service completion as before.

No schema, money, booking price, payment gateway, provider settlement or Helpdesk change; no new timeline event on exact replay. Unit tests cover completed/in-progress retry, rejection of changed decisions and actors, authorization before disclosure, and no duplicate write.

## Delay control
Latest `develop` must be confirmed before editing; one focused PR, changed-file test and exact-head CI gates before merge. Do not reimplement earlier V4.90.18.1–.4 features, or promote staging/main.

Remaining Services 3.1: durable provider draft recovery after page reload, richer dispute evidence exchange, finance acceptance for independently billed extra work, and real field UAT remain separate slices.
