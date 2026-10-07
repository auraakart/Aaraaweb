# Aaraagate V4.83.1 — Insta Services Entry

Date: 2026-10-07

## Purpose

V4.83.1 adds an explicit **Insta Services** option inside the Resident **Services** tab without creating a second marketplace implementation.

## Product behavior

- The existing society-approved **Home services** experience remains unchanged.
- A prominent **Insta Services** card appears near the top of the Services tab.
- Selecting it opens the existing consumer/local-services marketplace in resident mode.
- Resident-mode marketplace branding is shown as **Insta Services** / **Insta Services near you**.
- Existing service-location selection, provider profiles, offers, favorites, booking history, service history and booking flows are reused.
- The resident shell passes the existing authenticated consumer API client into the Services tab, so no parallel authentication or provider-discovery path is introduced.

## Trust and architecture boundaries

- Society-approved Home Services and Insta Services remain visually distinct.
- Insta Services does not imply society approval of an external provider.
- No new provider catalog, booking ledger, location store, payment flow or gate-authority model is introduced.
- The standalone independent-home service experience keeps its existing branding and behavior.
- Productionization, provider onboarding operations, real payment settlement and field acceptance remain outside this subversion.

## Release identity

- Root/API/Admin: 4.83.1
- Resident/Guard: 4.83.1+48301

Main remains unchanged until explicitly approved.
