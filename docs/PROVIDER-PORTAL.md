# Provider Operations Portal

The provider portal is available at `/provider` in the Admin web application. It uses the same OTP identity and Bearer-session APIs as the rest of Aaraagate, but provider authorization is independent of society roles.

## Authentication boundary

1. User signs in with the registered mobile number and OTP.
2. If the account has multiple society memberships, any active property context may be selected only to establish a normal Aaraagate session.
3. Provider access is then resolved server-side as `authenticated user -> active ConsumerProviderOperator -> active VERIFIED ServiceProvider`.
4. The portal never accepts a trusted provider ID from the browser.

A provider operator may also be a resident or society member. Those roles do not grant provider access, and provider access does not grant society administration permissions.

## V1 workspace

The portal exposes four operational views:

- **Bookings** — review provider-scoped external-service requests, accept/decline requested jobs, assign confirmed jobs to active field agents, and progress dispatch status.
- **Agents** — maintain the provider field-agent roster. Agents remain operational identities and are not login principals in this milestone.
- **Coverage** — maintain provider-level Indian PIN-code coverage and optional offering-specific coverage overrides.
- **Schedule** — maintain recurring weekly availability windows and slot capacity for provider-owned offerings.

All mutations reuse the existing provider-scoped backend services and shared availability, fulfilment and dispatch state machines.

## Session storage

The web client stores its provider session under `aaraagate.provider.session`, separate from the Admin console session. On page restore it refreshes the session and revalidates `/provider/services/me` before rendering provider data.

## Deliberate deferrals

This portal does not introduce field-agent authentication, live GPS, masked calling, route optimisation, payout/settlement, provider KYC application flows, production payment-gateway configuration or automatic society gate-entry linkage.
