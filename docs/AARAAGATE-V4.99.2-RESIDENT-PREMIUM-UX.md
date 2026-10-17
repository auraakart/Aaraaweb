# V4.99.2 — Resident premium action and reading UX

Baseline: develop `b4fd6e2add33bc4dfe5af11d43cf12353c613a0f`. Status: MERGED to develop through [PR #1433](https://github.com/auraakart/Aaraaweb/pull/1433). Root/API/Admin `4.99.2`; Resident/Guard `4.99.2+49902`. Develop integration only.

## Audit and retained design system

The current source already contains the V4.69 premium convergence: Material 3 light/dark themes, restrained surfaces, readable type, 48 logical-pixel controls, reduced-motion-aware press feedback, status transitions and pull-to-refresh. Replacing that foundation would duplicate approved work. The supplied image is a GitHub repository screenshot, not a current mobile screen; the supplied specification establishes product scope rather than screen geometry. This audit uses actual Flutter components, followed by rendered widget evidence.

Keep the exact primary constants `brand #0EABBE` and `brandDeep #05879A`, theme-derived accessible foreground pairs, partner branding overrides and existing semantic tones. No new hardcoded accent colors. The existing light and dark primary roles remain unchanged. Use the 4/8 spatial grid: 4, 8, 12, 16, 20, 24 and 32; 12px small/icon radii, 16px established card/control radii, 24px sheet/dialog radii; 48px minimum interactive targets and 52px primary action height. Keep headline/title/body/label text roles and unrestricted essential text scaling. A card radius of 12px was an example in the request; the established 16px card token remains consistent across the product.

Reference: [Flutter UI accessibility](https://docs.flutter.dev/ui/accessibility/ui-design-and-styling) and [accessibility testing](https://docs.flutter.dev/ui/accessibility/accessibility-testing). Acceptance targets are at least 4.5:1 for small text, 3:1 for essential non-text control boundaries, 48x48 logical-pixel interactive targets, labeled actions and usable 200% text. Existing automated contrast tests remain required. These checks are not a claim of complete WCAG certification or physical TalkBack/VoiceOver acceptance.

## Component / Screen Name: Shared action content and reading action bar

**UX Bottleneck Addressed:** A spinner replacing the entire label hides which operation is pending. Ad hoc footer placement makes actions disappear below long content.

**Design Enhancements:** `PremiumActionLabel` retains readable text beside a 20px indicator, exposes an in-progress semantic value, wraps labels, and respects reduced motion with a static hourglass. It also switches to static feedback while a modal route is current, preventing an indefinite spinner from running behind the payment or visitor-pass sheet. It does not add a nested action. `PremiumBottomActionBar` uses the existing surface role, 20px horizontal/12px vertical spacing and a safe area; Scaffold reserves its space rather than overlaying content. Existing 120/220ms surface/status transitions, soft shadows and refresh gestures are retained.

**Code / Style Implementation:** `apps/resident/lib/widgets/premium_ui.dart`:

```dart
FilledButton(
  onPressed: busy ? null : submit,
  // The button uses colorScheme.primary / onPrimary from the existing theme.
  child: PremiumActionLabel(label: 'Preparing payment…',
    icon: Icons.lock_outline_rounded, busy: busy),
)
```

## Component / Screen Name: Gate approval cards

**UX Bottleneck Addressed:** Pressing Deny previously activated the Allow button's spinner because both actions shared one busy flag. Removing the approval label also obscured the requested action. Unkeyed request cards could transfer local presentation state when the list changed.

**Design Enhancements:** Keep the prominent brand-filled Allow and quiet outlined Deny actions. Both remain locked during a pending decision, while only the selected action displays progress and both labels stay readable. Key cards by request ID. Preserve direct approval/denial, short cab/delivery windows, visitor cancellation confirmation and authoritative recovery.

**Code / Style Implementation:** `apps/resident/lib/screens/gate_screen.dart`:

```dart
OutlinedButton(
  onPressed: _busy ? null : () {
    _pendingAction = 'deny';
    _run(widget.onDeny!); // Existing single-flight mutation guard.
  },
  child: PremiumActionLabel(label: strings.text('deny'),
    busy: _busy && _pendingAction == 'deny'),
)
```

## Component / Screen Name: Maintenance billing and receipt history

**UX Bottleneck Addressed:** Invoice identities and long payment-status labels competed for the same horizontal space. A receipt's amount, property, invoice number and trailing button crowded a fixed ListTile, reducing readability at large type and restricting its useful tap area.

**Design Enhancements:** Reuse `PremiumSectionHeader` to stack status below identity at narrow widths/large text. Preserve the amount-first hierarchy and due/overdue semantics. Payment preparation retains a labeled indicator. The entire receipt surface opens the same verified receipt in one tap, with an explicit Receipt/chevron affordance, full property text and a single semantic button.

**Code / Style Implementation:** `apps/resident/lib/screens/billing_screen.dart`:

```dart
PremiumSurface(
  onTap: onReceipt,
  semanticLabel: 'Receipt for invoice ${payment['invoiceNumber'] ?? ''}',
  color: scheme.surfaceContainerLow,
  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
    PremiumIdentityHeader(icon: Icons.receipt_long_outlined,
      title: _money((payment['amountPaise'] as num?)?.toInt() ?? 0),
      supportingText: '${payment['buildingName']} · ${payment['unitNumber']}\nInvoice ${payment['invoiceNumber']}'),
    // The complete record is the action; no nested trailing button.
  ]),
)
```

Payment references, idempotency, server verification, receipts, AutoPay mandate boundaries and property scope are unchanged. No live payment capability is implied by visual polish.

## Component / Screen Name: Facility bookings, waitlist and cancellation sheet

**UX Bottleneck Addressed:** A fixed trailing action column squeezed reservation identity, time and deposit requirements. Long text made cancellation choices compete horizontally inside a non-scrolling sheet.

**Design Enhancements:** Give booking identity/time full usable width, follow with fee/deposit details and an adaptive action group. Pay deposit has the existing filled primary treatment; cancellation remains secondary on the record. Waitlist identity and Leave action no longer compete in a narrow row. Recovery snackbars expose an explicit dismiss control, so an error message can be cleared before retrying an underlying booking action. The cancellation sheet scrolls and stacks controls when needed; its destructive confirmation uses the existing error/onError pair. Date/time selection, fees, approval, capacity, waitlist and recovery semantics remain unchanged.

**Code / Style Implementation:** `apps/resident/lib/screens/amenities_screen.dart`:

```dart
PremiumActionGroup(
  primary: FilledButton(onPressed: busy ? null : onPayDeposit,
    child: const Text('Pay deposit')),
  secondary: TextButton(onPressed: busy ? null : onCancel,
    child: const Text('Cancel')),
)
```

Only actions allowed by the current server-derived status are rendered. No confirmation step is removed from booking cancellation.

## Component / Screen Name: Notice reading and acknowledgement

**UX Bottleneck Addressed:** A required acknowledgement was below the entire notice, demanding additional scrolling on a long announcement. Reading and locating the next action competed.

**Design Enhancements:** Place the same action in Scaffold's safe bottom area, keep the complete notice scrollable above it, show a labeled busy state and replace the action only after the controller confirms acknowledgement. Acknowledged status uses the existing success pair and visible text. The list's Action required/Latest updates grouping remains intact.

**Code / Style Implementation:** `apps/resident/lib/screens/notices_screen.dart`:

```dart
bottomNavigationBar: requiresAcknowledgement
  ? PremiumBottomActionBar(child: acknowledged
      ? const AaraagateStatusPill(label: 'Acknowledged',
          tone: AaraagateStatusTone.success)
      : FilledButton(onPressed: _acknowledging ? null : _acknowledge,
          child: PremiumActionLabel(label: 'Acknowledge notice',
            icon: Icons.task_alt_rounded, busy: _acknowledging)))
  : null,
```

## Validation and limits

- All 44 stable domain invariants, current release identity, maintainability, privacy/hygiene and diff checks pass locally.
- Five new shared-component cases cover dark/light and normal/reduced motion at 320px/200% type plus suspension/resumption across a modal; the existing gate concurrency test additionally verifies that Deny owns its progress indicator.
- Sixteen actual-screen cases cover Gate, Billing, Bookings and Notice in light/dark at 390px/100% and 320px/200%. They check layout exceptions, action reachability, long labels, whole-card verified receipt access, cancellation choices and a persistent notice footer with safe-area padding. Twenty rendered PNGs are retained under `coverage/resident-ux` in the [Resident coverage artifact](https://github.com/auraakart/Aaraaweb/actions/runs/39046291951/artifacts/12105468360). Representative Gate, invoice, receipt, booking and notice images were visually inspected across both themes and viewport/text settings. The capture fixture loads bundled SDK Roboto and Material Icons, explicitly supplies Roboto for otherwise unspecified button font families, and hides the debug banner; application color, spacing, shape and text-size values are retained. These are presentation fixtures, not live integration evidence.
- Existing contrast, large-text, gate mutation, billing recovery, facility booking/deposit/waitlist/cancellation and notice acknowledgement regressions passed in protected CI.
- No API/schema, financial authority, dependencies or five-tab navigation changes. Home/Gate/Services/Community/Profile, four Home quick actions and top-of-Home AI entry remain intact. No demo rebuild, staging/main promotion or iOS work.
- Human usability, device/screen-reader and independently operated acceptance remain open. Tap counts remain one for gate decisions and opening receipts; required financial/cancellation consent is retained. No measured task-time improvement or competitor rating is claimed.

## Protected release evidence

[CI 39046291951](https://github.com/auraakart/Aaraaweb/actions/runs/39046291951) completed successfully for exact head `fb9d8d98917c428442d34b11fb089da60d3091f9`, event `pull_request`, workflow `.github/workflows/ci.yml`. Actual develop merge `669add347e2e3dbe2ce1182972d7295f01315c83` retains tested tree `533380289ce82014c0d42d21339a78818711d02f`.

| Gate | Verified result |
| --- | --- |
| Changed Resident tests | 44 passed |
| Resident risk regression | 66 passed and coverage gate passed |
| Full Resident | 330 passed; analysis clean |
| Guard | 30 risk tests, 100 full tests; analysis clean |
| Admin | 166 browser tests, 18 canonical-session cases, build, actual SSR and TLS checks passed |
| API | 2,440 passed with 15 existing intentional skips; 86 risk tests; dedicated database checks passed |
| Repository / security | Structure, preflight, dependency security and required merge gates passed; all 44 local stable checks passed after final source corrections |

The new Resident coverage is 21 cases: 16 actual-screen cases and five shared feedback cases. Existing gate serialization and amenity deposit-retry cases were strengthened rather than replaced.

Validation found and corrected a compact receipt-test coordinate error and test-font capture configuration. Broader existing tests then exposed indefinite background progress behind a modal and a snackbar covering the relocated retry button; the shared route-aware indicator and explicit dismiss control fix those behaviours. The retry regression dismisses the visible message before using the underlying action and still asserts the same idempotency key. No assertions were suppressed, retries added, or CI gates bypassed. The final remote tree was compared with the local staged tree before validation.

The Android base TEST smoke job was scope-skipped. Rendered widget evidence is not physical-device, screen-reader, iOS or independent user acceptance. Staging/main and the published demo remain unchanged.
