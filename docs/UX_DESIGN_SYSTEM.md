# aaraagate UX & UI Direction

## Design goal
Build a calm, premium, fast consumer experience for residents while providing a high-visibility operational interface for guards and a dense-but-organized workspace for admins.

## Resident UI
- Mobile-first and task-oriented.
- Quick actions: approve visitor, pre-approve guest, delivery, complaint, payment and SOS.
- Shallow navigation: Home, Gate, Services, Community, Profile.
- Progressive disclosure for secondary features.
- Every async screen has loading, empty, error and retry states.
- Critical security actions use explicit confirmation and clear result feedback.

## Guard UI
- Optimized for one-hand use and rapid gate processing.
- Large touch targets and high legibility.
- Minimal typing; prefer scan, select, recent/repeat visitor and voice-ready abstractions.
- Pending approvals remain visible while new entries can be queued.
- Offline state is explicit and never pretends server verification succeeded.
- Resident phone numbers and sensitive data are masked.
- Language selection is first-class.

## Admin UI
- Responsive desktop-first dashboard with mobile fallback.
- KPI cards answer operational questions rather than vanity metrics.
- Search, filters, pagination and bulk actions are consistent.
- Destructive actions require confirmation and are audited.
- Dense data appears in tables; decisions in cards; trends in charts.

## Visual language
- Contemporary Indian consumer SaaS aesthetic: generous whitespace, restrained surfaces, strong hierarchy and subtle motion.
- Avoid excessive gradients, glassmorphism and crowded dashboards.
- Use semantic status colors only for status meaning.
- Typography prioritizes readability on inexpensive Android devices.
- Build UI from reusable design tokens and components.

## Accessibility and resilience
- Touch targets >= 44 logical pixels; guard workflows should exceed this where practical.
- Support dynamic text sizing.
- Never encode status by color alone.
- Provide offline and low-bandwidth feedback where relevant.
- Localization-ready from the foundation.
