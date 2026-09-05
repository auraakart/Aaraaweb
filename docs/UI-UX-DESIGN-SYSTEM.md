# Aaraagate UI/UX Design System

## Purpose

Aaraagate adopts the colour language and visual energy of the supplied AaraaPlatforms logo while remaining an independently branded product. **Do not render the name “AaraaPlatforms” anywhere in the product UI.** The corporate logo is a palette and visual-language reference only.

## Product personality

**Smart living + trusted access + modern society management.**

The experience should feel calm, secure, modern and approachable rather than decorative or overly futuristic.

## Core palette

| Token | Value | Use |
| --- | --- | --- |
| Brand Deep | `#05879A` | Primary buttons, selected states, links, active navigation |
| Brand Bright | `#0EABBE` | Secondary accents, icon emphasis, gradients |
| Aqua Mid | `#6EC9D2` | Gradient tail, decorative emphasis |
| Aqua Soft | `#D4F2F4` | Tonal surfaces, selected navigation, chips |
| Canvas | `#F5FBFC` | Resident/Admin page background |
| Guard Canvas | `#F2FAFB` | Guard operational background |
| Surface | `#FFFFFF` | Cards, forms, panels |
| Ink | `#17323A` | Primary text |
| Muted | `#6A7F85` | Secondary text |
| Line | `#D5E8EB` | Borders and dividers |

Semantic colours stay semantic. Emergency/SOS remains red; warning remains amber; success stays green. Never recolour critical operational states merely to match the brand.

## Gradient

Use sparingly:

`linear-gradient(135deg, #05879A 0%, #0EABBE 58%, #6EC9D2 100%)`

Approved uses: primary hero accent, sign-in identity mark, progress accent and selected high-value call-to-action. Avoid full-screen gradients or gradient-heavy cards.

## Typography

- Use the platform/system sans-serif stack for reliability and performance.
- Page title: 28–32px desktop, platform headline on mobile, weight 800–900.
- Section title: weight 800.
- Card/action title: weight 700–800.
- Body: regular/medium with comfortable line height.
- Avoid all-caps except short Guard operational actions where fast scanning benefits.

## Shape and spacing

- Base spacing unit: 8px.
- Mobile horizontal page padding: 20–24px.
- Cards: 18–20px radius.
- Primary mobile controls: 52px minimum; Guard controls: 56px minimum.
- Navigation selected-state radius: 14px.
- Pills/chips: fully rounded.
- Shadows: subtle aqua-tinted shadows only; borders provide most surface separation.

## Resident app

Priorities: reassurance, simplicity and task completion.

- Home hierarchy: identity/context → attention items → dues/notices → quick actions → recent activity.
- Keep one obvious primary action in approval/payment flows.
- Quick actions must remain concise and recognizable.
- Parking bay is visible but not resident-editable.
- Avoid technical wording such as IDs, capability names or backend statuses when a human label exists.

## Guard app

Priorities: speed, contrast, large targets and offline confidence.

- Use the same brand family but fewer decorative treatments.
- Minimum 56px primary touch targets.
- Critical actions must be distinguishable by label and icon, not colour alone.
- Offline/queued state must remain clearly visible.
- Emergency/deny/error states retain semantic colours.

## Admin dashboard

Priorities: scanability, density without clutter and clear society context.

- White navigation surface, pale aqua selected state and deep teal active text.
- KPI cards use restrained borders and soft shadows.
- Primary actions may use the brand gradient.
- Dense data tables remain neutral; brand colour is for hierarchy, not decoration.
- Finance, privacy and security states remain explicit and role-aware.

## Accessibility and UX rules

1. Never rely on colour alone for status or permission state.
2. Maintain at least 44px touch targets; Guard defaults to 56px.
3. Preserve visible focus states on Admin.
4. Keep high-contrast primary text on light surfaces.
5. Use red only for error/destructive/SOS contexts.
6. Empty/loading/error states must always explain what the user can do next.
7. Keep animation under 200ms for interaction feedback; avoid decorative motion.
8. Avoid adding company branding, company name, or corporate marketing copy to product screens.

## Implementation ownership

- Resident theme: `apps/resident/lib/theme/aaraagate_theme.dart`
- Guard theme: `apps/guard/lib/theme/aaraagate_guard_theme.dart`
- Admin tokens: `apps/admin/app/brand-tokens.css`

New screens should consume these tokens/themes rather than introducing hard-coded brand colours.
