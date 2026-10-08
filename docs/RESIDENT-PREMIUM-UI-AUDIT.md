# Resident interface audit and implementation

Scope: shared Flutter theme and components, Gate, Billing, Amenities, and Notices. Audit based on the current source tree; the unavailable historical attachment was not used. Navigation, authorisation, payment verification, booking validation, and notice acknowledgement remain unchanged.

## Layout and token specification

| Token | Specification |
|---|---|
| Spacing | 4, 8, 12, 16, 20, 24, 32, 40 logical pixels |
| Page gutter | 20 logical pixels |
| Radius | 12 icon containers, 16 cards/controls, 24 sheets/dialogs |
| Touch targets | At least 48 × 48 logical pixels; primary buttons at least 52 high |
| Typography | Material 3 roles: 28 headline medium, 24 headline small, 22 title large, 16 title medium/body large, 14 body medium, 12 body small; headings 700, status labels 600 |
| Surfaces | Existing light/dark neutral surfaces; borderless content cards; elevation reserved for urgent arrivals and the billing summary |
| Motion | 120ms press/status feedback, 220ms surface changes, ease-out cubic; optional feedback disabled by platform reduced-motion setting |

Primary constants `brand` (#0EABBE) and `brandDeep` (#05879A), dark primary, and all generated semantic status container pairs are retained. White text on #05879A measures 4.25:1. The new light `onPrimary` (#001014) measures 4.56:1. Small secondary button labels use `onSurface`; teal remains in fills and icons. Input and outlined-control boundaries use neutral outline tones measuring over 3:1 against their surfaces. This is scoped contrast validation, not certification of every screen in the application.

## Component / Screen Name: Shared surfaces and headings

**UX Bottleneck Addressed:** Existing cards were already borderless, but spacing mixed 6/10/14/18px values; title weights competed with content; tiny tappable surfaces had no minimum dimensions. Section headings capped the user's chosen text scale, and optional animations ignored reduced motion.

**Design Enhancements:** 16px card radius, softer 4px-offset shadows, grid-aligned padding, 700-weight headings, natural heading reflow, minimum 48px interactive surfaces, reduced-motion-aware feedback. Noninteractive status badges remain compact and announce their status without relying on colour.

**Code / Style Implementation:**

```dart
PremiumSurface(
  onTap: openNotice,
  semanticLabel: 'Open society notice',
  padding: const EdgeInsets.all(AaraagateTokens.space4),
  child: Text(title, style: Theme.of(context).textTheme.titleMedium),
)
// Shared motion:
final duration = AaraagateMotion.duration(context, AaraagateMotion.quick);
// Theme keeps the existing primary token:
FilledButton.styleFrom(
  backgroundColor: Theme.of(context).colorScheme.primary,
  foregroundColor: Theme.of(context).colorScheme.onPrimary,
  minimumSize: const Size(48, 52),
)
```

## Component / Screen Name: Gate arrivals

**UX Bottleneck Addressed:** A 420px content breakpoint stacked both actions on almost every phone; status/identity layouts duplicated complex nesting; names and arrival details were truncated.

**Design Enhancements:** Shared 48px identity header; full names and arrival details wrap. Approve/deny remain adjacent where content width is at least 300px at standard text scale; narrow or enlarged text stacks with approval first. Arrival duration and credential validity remain visible; existing concurrency guards and server decisions are preserved.

**Code / Style Implementation:**

```dart
PremiumIdentityHeader(
  icon: Icons.person_outline_rounded,
  title: visitorName,
  supportingText: arrivalDetails,
  status: AaraagateStatusPill(label: status, tone: AaraagateStatusTone.warning),
)
```

## Component / Screen Name: Maintenance billing

**UX Bottleneck Addressed:** The amount label and status badge competed in a rigid row at large text sizes; explanatory checkout copy was longer than needed.

**Design Enhancements:** Wrapping status line, prominent total, next-due context, direct earliest-due payment action, concise verification copy. Secondary histories stay below outstanding bills. No extra payment screen or weakened confirmation is introduced.

**Code / Style Implementation:**

```dart
Wrap(
  spacing: AaraagateTokens.space3,
  runSpacing: AaraagateTokens.space2,
  children: [
    Text('Amount due', style: Theme.of(context).textTheme.labelLarge),
    AaraagateStatusPill(label: dueLabel, tone: AaraagateStatusTone.warning),
  ],
)
```

## Component / Screen Name: Facility catalogue and booking sheet

**UX Bottleneck Addressed:** The trailing approval badge squeezed facility names into a narrow column. Fixed 46px-wide date choices and a 68px rail did not accommodate accessibility text. Guest controls competed with the label in a rigid row.

**Design Enhancements:** Status below identity, readable descriptions, date choices at least 48px wide with rail dimensions responding to text scale, and wrapping guest controls. The existing single date/time sheet still discloses fees, approval, deposits, availability, and rules before submission.

**Code / Style Implementation:**

```dart
PremiumIdentityHeader(
  icon: Icons.sports_tennis_rounded,
  title: amenityName,
  supportingText: location,
  status: AaraagateStatusPill(label: bookingStatus),
)
// Date choice geometry grows with the user's font setting.
final scale = MediaQuery.textScalerOf(context).scale(1).clamp(1.0, double.infinity);
final dateWidth = 48 * scale;
final railHeight = 72 * scale;
```

## Component / Screen Name: Notice list and reader

**UX Bottleneck Addressed:** Teal small metadata on a pale surface fell short of the intended small-text contrast, and per-screen spacing drifted from shared tokens.

**Design Enhancements:** Quiet, contrasting metadata; urgent notices retain semantic error treatment and explicit labels. Action-required grouping, preview-to-reader navigation, and acknowledgement remain prominent. Shared surfaces, title weights, and button contrast apply to both list and reader.

**Code / Style Implementation:**

```dart
Text(
  metadata,
  style: Theme.of(context).textTheme.labelMedium?.copyWith(
    color: urgent
        ? Theme.of(context).colorScheme.error
        : Theme.of(context).colorScheme.onSurfaceVariant,
    fontWeight: FontWeight.w700,
  ),
)
```

## Validation

Added regression coverage for text/container contrast in both modes, 3:1 control boundaries, minimum interactive surface size, reduced motion, and identity wrapping at 320px/200% type. Existing gate, billing, amenity, notice, accessibility, and navigation tests run through the repository's Flutter CI. Physical-device usability, screen-reader behaviour, and animation feel still require device review; automated layout tests cannot establish zero cognitive friction or real-world tap efficiency.
