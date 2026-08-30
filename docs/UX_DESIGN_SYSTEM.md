# aaraagate UX & UI Direction

## Design goal
Build a calm, premium, fast consumer experience for residents while providing a high-visibility operational interface for guards and a dense-but-organized workspace for admins.

Market benchmark review confirms that leading products already cover one-tap visitor approval, pre-approved QR/OTP access, guard workflows, offline operation, payments, complaints, amenities and community communication. aaraagate therefore competes on clarity and workflow quality rather than feature-count imitation.

## Resident UI
- Mobile-first.
- Home screen is task-oriented, not a feature catalogue.
- One primary action per contextual card.
- Quick actions: approve visitor, pre-approve guest, delivery, complaint, payment, SOS.
- Personalization based on current state: pending visitor, unpaid bill, active service request, notice.
- Bottom navigation should remain shallow: Home, Gate, Services, Community, Profile.
- Use progressive disclosure for secondary features.
- Every async screen has loading, empty, error and retry states.
- Critical security actions use explicit confirmation and clear result feedback.

## Guard UI
- Optimized for one-hand use and rapid gate processing.
- Large touch targets and high legibility.
- Minimal typing; prefer scan, select, recent/repeat visitor and voice-ready abstractions.
- Pending approvals remain visible while new entries can be queued.
- Offline state is explicit and never pretends server verification succeeded.
- Resident phone numbers and sensitive data are masked.
- Language selection is a first-class capability.

## Admin UI
- Responsive desktop-first dashboard with mobile fallback.
- Overview cards answer operational questions rather than showing vanity metrics.
- Search, filters, pagination and bulk actions are consistent across modules.
- Destructive actions require confirmation and are audited.
- Dense data appears in tables; decisions appear in cards; trends appear in charts.

## Visual language
- Contemporary Indian consumer SaaS aesthetic: generous whitespace, restrained surfaces, strong hierarchy and subtle motion.
- Avoid excessive gradients, excessive glassmorphism and crowded dashboards.
- Use semantic status colors only for status meaning, not decoration.
- Rounded surfaces and compact elevation are acceptable, but hierarchy must remain strong without color.
- Typography must prioritize readability on inexpensive Android devices.
- Build all UI from reusable design tokens and components.

## Accessibility and resilience
- Touch targets >= 44 logical pixels; guard workflows should exceed this where practical.
- Support dynamic text sizing.
- Never encode status by color alone.
- Provide offline and low-bandwidth feedback where relevant.
- Localization-ready from the foundation, with Indian languages added without restructuring screens.
