# Human-crafted Guard Field Operations section headings

Date: 2026-10-19
Source baseline: `develop` `de4d8cfbad2926574635a2e04ec40c7af472f4ee` (after protected merge of Parcel Intake #1472).

## Root-cause and scope
Repeated review against a stale conversational checkpoint delayed progress because earlier Guard/Parcel changes were already merged. After verifying the current head, source inspection found a separate UI issue: Field Operations uses rigid icon + heading + action rows for Material & move passes, Shift handover, and Incidents. Long text at 320dp with 200% font scaling can crowd operational action labels.

## Focused correction
- Extract a reusable `GuardFieldSectionHeader` widget from the minified Field Operations screen.
- Stack the action beneath its heading at text scale >130% or available width <320dp. Keep original one-row scanning at normal width and scale.
- Render action-free headings without extra empty rows.
- Preserve all action callbacks, guard business checks, alerts, server mutations, safety, brand colors, and section ordering.
- Five focused widget cases cover light/dark at standard and 200% text, action discoverability, button taps, and action-free headings.

## Validation boundaries
Require changed Guard tests, Flutter formatting and analysis, complete required CI gates before develop merge. Do not merge into staging/main or publish a new APK. Physical TalkBack, translations and security-operator usability are separate acceptance steps; widget checks do not substitute for them.
