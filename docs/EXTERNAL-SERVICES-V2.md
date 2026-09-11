# External Services V2

## Goal

Evolve Aaraagate External Services from a provider directory into a trusted home-services experience for both society residents and independent-home users without weakening society isolation or coupling external-service bookings to society maintenance billing.

## Product principles

1. Trust before promotion. Verification and service-quality badges are earned; paid placement is always labelled Featured/Sponsored.
2. Intent before provider browsing. Users should be able to start with a need (for example, `AC not cooling`) and reach suitable offerings quickly.
3. Relevant offers, not an ad feed. Promotions are contextual to category, service location and user intent.
4. Transparent decision data. Provider cards should prioritize provider name, verification/trust, rating, price/starting price and availability.
5. Household continuity. Completed service history and rebooking should become a durable household capability.
6. Independent-home parity. External services remain usable without society membership; society-only capabilities must not leak into that mode.
7. Existing booking, payment, dispatch and authorization paths remain the system of record.

## Delivery slices

### V2.1 — Discovery and provider storefront foundation

- Search across service/offering/provider/category text.
- Intent-first discovery UI.
- Cleaner information hierarchy: search -> common needs/categories -> providers -> contextual trust signals.
- Provider profile/storefront contract with logo, gallery, description, service area, pricing, availability and warranty metadata.
- Preserve existing consumer booking endpoints and location filtering.

### V2.2 — Offers and trust

- Structured offers with validity, service/category scope, location/society targeting, discount type/value, usage limit and terms.
- Provider trust states: Listed -> Verified -> Trusted/Premium.
- Featured/Sponsored remains a separate commercial attribute and never alters earned trust status.
- Ranking signals may include rating, completed jobs, response time, cancellation rate, complaints and repeat customers.

### V2.3 — Booking continuity and household service history

- Recent providers and favourites.
- Rebook from prior completed service.
- Household/property service history.
- Optional warranty/revisit metadata.
- Maintenance reminders only after the history model is proven useful.

### V2.4 — Independent-home expansion and monetization

- Independent-home navigation focused on Services, Offers, My Requests/Bookings, Service History and Profile.
- Provider subscription/featured-placement controls.
- Do not introduce marketplace commission until booking volume, support operations, refunds and tax treatment are validated.

## Trust semantics

- `LISTED`: available in the platform catalog but not carrying a quality claim.
- `VERIFIED`: business/provider identity and required platform checks completed.
- `TRUSTED` / `PREMIUM`: quality threshold based on configured operational criteria; cannot be purchased directly.
- `FEATURED` / `SPONSORED`: paid promotion only; must be visually labelled and kept separate from trust badges.

## Provider profile data contract

The storefront should support, incrementally:

- business name
- contact/display name where appropriate
- provider logo
- gallery/media
- description
- service categories and offerings
- price or starting price
- availability/response information
- service areas
- verified/trusted status
- rating average/count
- completed jobs
- warranty or revisit policy
- active offers
- call / WhatsApp / request / book actions subject to policy and privacy controls

Provider contact details must continue to respect current approval/privacy rules.

## Offer contract

A structured offer should include:

- provider and optional offering/category scope
- title and short description
- discount type (`PERCENT`, `FLAT`, `FIXED_PRICE`, `BUNDLE`)
- discount/value fields appropriate to the type
- starts-at / ends-at timestamps
- optional location/society targeting
- optional usage cap
- terms
- lifecycle (`DRAFT`, `ACTIVE`, `PAUSED`, `EXPIRED`)
- moderation/audit metadata

## Media controls

Provider-uploaded media must not be made public without platform controls. Minimum controls before self-service publishing:

- object-size/type limits
- malware-safe object handling
- moderation/review state
- report/remove path
- authorization on upload/update/delete
- no public exposure of private storage keys

## UX hierarchy

External Services home should prioritize:

1. Search / describe what you need
2. Service location
3. Common service categories / needs
4. Relevant provider results
5. Recent/favourite providers when available
6. Relevant offers
7. Explore all services

Avoid a promotion-heavy dashboard.

## V2.1 acceptance criteria

- Existing independent-home and society-unit location behavior remains unchanged.
- Existing verified-provider filtering remains intact.
- Search/filtering never expands access beyond the already returned authorized catalog.
- Existing bookings remain compatible.
- Existing trust endpoint failure remains non-blocking.
- UI has loading, empty, failure and retry states.
- Light/dark theme accessibility remains covered.
- New provider media/offer fields are additive and nullable until the backend slice is enabled.
- No changes to visitor, guard, maintenance billing, owner/tenant or society authorization behavior.

## Explicit non-goals for initial V2 slices

- provider bidding marketplace
- general-purpose chat
- live technician tracking
- loyalty wallet/points
- dynamic pricing
- complex AI recommendations
- automatic dispute arbitration

These may be revisited only after pilot evidence.
