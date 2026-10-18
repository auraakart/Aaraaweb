# Multilingual gate-access accessibility refinement — 2026-10-18

Baseline: `develop` `1a2ea2c88f6cb5110f64d2196a5991a121665728`. Previous opt-in admin dark-preview and payment-action slices are already merged. The recurrent progress gap is resolved by verifying the latest branch/PR/check state before new work and preventing accidental trailing whitespace before commit.

## Finding

The Gate card uses localized high-frequency controls in eight supported languages, but its screen-reader container label was assembled from English backend type/status names. This created mixed-language announcements for pending deliveries, visitor arrivals and cab journeys even when the visible action controls were in Hindi, Tamil, Telugu, Kannada, Malayalam, Marathi or Bengali.

## Bounded correction

Localize **only** the accessible Gate subject type and waiting/inside status using existing `AaraagateStrings` keys. Keep display labels, fallback for the other backend statuses/types, permission checks, mutations and serialized decisions unchanged. Add widget assertions across all eight supported languages, both themes, compact width, 200% text, visible button copy and accessible identity. No new dictionary terms are fabricated.

## Remaining acceptance

This is automated widget/semantic coverage, **not** live TalkBack, Hindi/Tamil content review by native speakers, large-device and low-end Android tests, voice quality, end-to-end language coverage or independent 9/10 usability certification. No dependency, theme token, navigation, backend, main or staging changes.
