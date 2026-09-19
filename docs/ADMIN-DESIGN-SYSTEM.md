# Shared Admin design system

V4.22.0 extracts 16 components into `apps/admin/components/admin-ui`. Import from its `index.ts`. The foundation is available for migration; existing application routes remain unchanged in this slice.

## Ownership

`presentation.tsx` provides PageShell, PageHeader, QueuePanel, DetailPanel, ReadinessPanel, StatusPill, EmptyState, ErrorState, Timeline, EvidenceGrid and ActionBar. It has no client hooks, session access, API calls or domain decisions. `controls.tsx` is the client boundary for FormField, SelectField and the three button variants. It uses stable React IDs and forwards native refs and attributes.

`admin-ui.module.css` scopes styles to these components. Existing application CSS remains in place for unmigrated routes. It consumes the existing brand/surface/ink tokens and provides semantic fallbacks. The shared shell supplies spacing, radius, focus and control-height tokens. `--admin-action-brand` derives a darker action shade from the existing `--brand`, because white on the baseline `#05879a` is only about 4.25:1. The original brand token is unchanged. Alternate themes can override the existing tokens and `--admin-success-surface`, `--admin-success-ink`, `--admin-warning-surface`, `--admin-danger-surface`, `--admin-on-brand` and `--admin-on-danger`; no theme switcher is introduced.

Module code owns authentication, society context, authorization, selected-record state, loading state, confirmation, domain validation, requests and response interpretation. The design system never infers ready/approved states or decides who may execute an action.

## Composition

```tsx
import {
  PageShell, PageHeader, QueuePanel, DetailPanel, FormField,
  PrimaryButton, SecondaryButton, ErrorState, ActionBar,
} from '../../components/admin-ui'

// Within a client page, using its existing state and handlers:
<PageShell>
  <PageHeader title="Helpdesk operations" context={societyName}
    actions={<a href="/">Admin home</a>} />
  <PageShell.Columns>
    <QueuePanel title="Prioritized queue" count={tickets.length}
      state={queueState} error={<ErrorState title="Queue unavailable"
        action={<SecondaryButton onClick={reloadQueue}>Retry queue</SecondaryButton>} />}>
      {ticketButtons}
    </QueuePanel>
    <DetailPanel title="Selected ticket" state={detailState}>
      <form onSubmit={saveAssignment}>
        <FormField label="Assignment note" multiline value={note}
          onChange={event => setNote(event.target.value)} />
        <ActionBar feedback={resultMessage}>
          <PrimaryButton type="submit" loading={saving}>Save assignment</PrimaryButton>
        </ActionBar>
      </form>
    </DetailPanel>
  </PageShell.Columns>
</PageShell>
```

Use one PageShell/main and one PageHeader/h1 per page. Columns are optional; Finance tables need not become queue/detail views. Columns collapse at 800px. Wrap wide domain tables in a named scroll region at the module level.

## Component contracts

| Component | Inputs and behavior |
| --- | --- |
| PageShell | Native main attributes, children and optional className. `PageShell.Columns` supplies responsive two-column composition. |
| PageHeader | Required string title; optional context, description and actions nodes. |
| QueuePanel | Required title, optional count/actions/children, and ready/loading/error/empty state with caller-provided empty/error nodes. Queue selection remains native buttons or links supplied by the module. |
| DetailPanel | Same state/content contract as QueuePanel without count. Loading/error/empty states suppress stale children. Use empty state when no record is selected. |
| ReadinessPanel | Required title; supplied status label/tone, checks, blockers, nextActions, boundary and ready/loading/error state. Missing status is explicitly unavailable. Failed/loading state suppresses stale readiness evidence. |
| StatusPill | Required visible label and neutral/success/warning/danger/info tone. Default and unknown runtime tone use neutral presentation. Domain-to-label mapping belongs to the caller. |
| FormField | Native input attributes plus label/hint/error. Set multiline for a native textarea and matching textarea events/ref. Supports controlled and uncontrolled values. Visible errors join existing aria-describedby references and set aria-invalid. |
| SelectField | Native select attributes, options as children, label/hint/error and HTMLSelectElement ref. |
| PrimaryButton | Native button attributes/ref, loading and loadingLabel. Default type is button; explicitly request submit inside forms. |
| SecondaryButton | Same contract for supporting actions. Use an anchor for navigation. |
| DangerButton | Same contract for destructive actions. The caller supplies its confirmation/preview/permission guards and disabled state. |
| EmptyState | Required title; optional description and action. Do not substitute for loading, failure or denied access. |
| ErrorState | Required safe title; optional safe description and recovery action. Alert text and recovery control are separate so the control keeps normal keyboard semantics. |
| Timeline | Ordered events with stable id, label, timeLabel, optional machine-readable dateTime, actor and evidence node. Preserves supplied ordering; emptyLabel may replace the default. Never pass internal events to resident-visible views. |
| EvidenceGrid | Items with stable id, label, value and optional unavailableLabel. Null/undefined value is unavailable; zero remains zero. Only pass evidence already authorized by the module. |
| ActionBar | Children grouped under a configurable label; feedback announced through a persistent polite status region. Wraps actions; no sticky overlay. |

Pending buttons become disabled and aria-busy. The caller must set loading while its request is outstanding; this is not an idempotency mechanism or an authorization check. Keep the module's mutation guard and backend idempotency behavior. ReadinessPanel describes supplied evidence only. Error retries should reload data, not replay destructive mutations.

On record/society changes, cancel or discard obsolete detail responses and clear stale confirmation/preview state before rendering the new detail. Page-level focus management remains explicit; forwarded control refs support focusing invalid controls. Components must not unexpectedly steal focus on background refresh.

## Route inventory and migration order

Baseline: `develop` at `5360060a5f135a650d45a0a0cac0d16f94d4b364`, including the V4.22 planning PR. No module route is credited as migrated by this foundation.

All paths below are under `apps/admin/app/`.

| Slice | Exact route files | Existing presentation to consolidate | Status |
| --- | --- | --- | --- |
| V4.22.1 Helpdesk | `helpdesk/page.tsx` | Inline page/header, panels, readiness/evidence, forms, buttons and history styles | Pending V4.21 handoff reconciliation |
| V4.22.2 Privacy | `privacy-operations/page.tsx` | Inline case queue/detail, plan/confirmation, readiness, history and controls | Pending |
| V4.22.2 Platform Privacy | `platform/privacy/page.tsx` | Platform control presentation; preserve separate platform authorization | Pending boundary review and applicable shared controls |
| V4.22.3 Facilities | `facilities/page.tsx`, `facilities/operations/page.tsx`, `facilities/preventive/page.tsx`, `facilities/contracts/page.tsx`, `facilities/inventory/page.tsx`, `facilities/alerts/page.tsx`, `facilities/health/page.tsx` | `facilities/layout.tsx`, `facilities-workspace.css` and page presentation; retain domain-specific data views | Pending |
| V4.22.4 Documents | `documents/page.tsx` | Upload/replace forms, repository rows, action groups, history and local status styling | Pending |
| V4.22.5 Occupancy | `occupancy-lifecycle/page.tsx` | Lifecycle queue/detail, typed controls, readiness and evidence | Pending |
| V4.22.6 Finance | `finance/page.tsx`, `finance/opening-balances/page.tsx`, `finance/waivers/page.tsx`, `finance/operations/page.tsx`, `finance/procurement/page.tsx`, `finance/reconciliation/page.tsx`, `finance/bank-reconciliation/page.tsx`, `finance/statements/page.tsx`, `finance/payment-exceptions/page.tsx`, `finance/exports/page.tsx` | `finance/layout.tsx`, `finance-workspace.css`, route-level finance-workflow/exports CSS and page presentation | Pending |
| V4.22.6 Governance | `governance/page.tsx`, `governance/readiness/page.tsx`, `governance/polls/page.tsx` | Governance actions, readiness and evidence presentation | Pending |

Inventory total: 25 page routes and two module layouts. Related household approvals, amenities, vendors and other Admin domains retain existing behavior and are not silently added to this milestone.

## Tests and examples

`tests/admin-ui/fixture.tsx` is a runnable reference composition covering all 16 components, including native forms, controlled pending actions, errors/retry, no selection, unknown/failed readiness, confirmation, timelines and evidence. It loads the real application CSS in application order to detect selector collisions. The fixture server binds loopback only and is not an application route or a production endpoint.

```sh
corepack pnpm --filter @aaraagate/admin exec playwright install chromium
corepack pnpm --filter @aaraagate/admin test:ui
corepack pnpm --filter @aaraagate/admin typecheck
corepack pnpm --filter @aaraagate/admin lint:ui
corepack pnpm --filter @aaraagate/admin test
corepack pnpm --filter @aaraagate/admin build
```

The browser suite covers 360/768/1440px layouts, accessible names and automated accessibility checks, native form submission, pending double-clicks, keyboard selection, error/ref association, preserved values, destructive confirmation, missing readiness and evidence order. It also checks reduced motion, visible focus and a 200% CSS zoom layout simulation. CSS zoom is not a claim of real-device or every-browser zoom acceptance. Screenshots are generated in test-results for inspection and CI artifact retention.

At each migration, add module-specific behavior and authorization scenarios rather than counting fixture coverage as module acceptance. Do not replace existing source/domain regression coverage with screenshots.
