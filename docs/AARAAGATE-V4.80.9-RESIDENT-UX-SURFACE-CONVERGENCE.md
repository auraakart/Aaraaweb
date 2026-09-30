# Aaraagate V4.80.9 — Resident UX Surface Convergence

Date: 2026-09-30  
Baseline: `develop@0fd5756e2a569238ab2e679cfa760cc5c3d07501`

## Scope

V4.80.8 converged the highest-frequency Gate, Billing, Amenities and Notices flows. The next remaining premium-quality inconsistency was the top-level hierarchy of Helpdesk, Home Services and Profile.

This slice keeps the existing Aaraagate brand, navigation and backend contracts unchanged while removing screen-specific header patterns and unnecessary visual weight.

## Helpdesk

### Bottleneck

The primary `New complaint` action lived in a floating action button while the page itself began with a separate section heading. This split the task hierarchy and required extra bottom padding so the FAB would not obscure complaint cards.

### Change

- move `New complaint` into a labeled tonal action inside `PremiumPageIntro`;
- preserve the existing Helpdesk AppBar and complaint list;
- remove the floating action button;
- reduce list bottom padding from FAB-safe 104px to the standard 32px page rhythm;
- preserve complaint creation, voice input, recovery, SLA and ticket-detail behavior.

## Home Services

### Bottleneck

Home Services used its own headline/subtitle implementation while the rest of the Resident app increasingly uses the shared responsive premium intro.

### Change

- replace bespoke headline/subtitle markup with `PremiumPageIntro`;
- preserve search, category chips, grouped offerings, provider comparison, booking lifecycle and rating flows;
- retain existing 48px controls and semantic provider-card actions.

## Profile

### Bottleneck

Multi-property users saw a separate full-width property-switch card directly below the profile heading. The card duplicated context that logically belongs to the page header and added visual weight before household content.

### Change

- move the current property label into the page-intro eyebrow;
- expose a labeled `Switch property` tonal action in the intro when multiple property choices exist;
- remove the standalone switch-property surface;
- preserve the existing property picker, ownership/tenant relationship context and household/settings navigation;
- truncate long property labels safely in the shared eyebrow.

## Design-system consistency

Brand colors remain unchanged:
- primary teal `#0EABBE`
- deep teal `#05879A`

Existing spacing, 48px minimum touch targets, 20px card radius, 24px modal radius, semantic colors and dark/light surface hierarchy remain unchanged.

## Regression coverage

- Helpdesk now has explicit coverage proving the primary complaint action is inline in the page hierarchy and the FAB is absent.
- Home Services has large-accessibility-text coverage for the shared intro and search entry point.
- Existing service marketplace, Helpdesk recovery and property-scoped behavior tests remain authoritative.

## Exclusions

No API, schema, role, billing, service-marketplace, helpdesk workflow, property membership, production provider or main-branch change is included in V4.80.9.
