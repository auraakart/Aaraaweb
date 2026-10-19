# Guard Field Operations: attention summary at large text

Date: 2026-10-19
Source baseline: `develop` `4a2ce92fa6ac894e206e67cce88171f474ae44a7` after merged Field Operations section headings #1473.

## Actual UI issue
The attention summary uses a fixed horizontal row for the status icon, long operational title and CLEAR/OPEN pill. On 320dp devices with 200% text this may crowd the current attention status. The upstream business priority calculations and action labels already exist and must not change.

## Implementation
- Extract a small presentational `GuardFieldAttentionHeader` from the existing Field Operations screen.
- At >130% system text or under 300dp content width, move the semantic status pill below the heading.
- Keep the existing familiar icon/title/badge alignment on standard sizes.
- Preserve prior warning/ready status tone, text, colors, screen-reader pill meaning, API, business calculations, guard authorizations and all action callbacks.
- Add eight light/dark × clear/urgent × normal/200% widget cases checking status identity, layout order and no exceptions.

## Validation
Require code style, changed Guard tests, broad Flutter and protected merge gates on the exact PR head. This is not physical-device or TalkBack acceptance. No staging/main/APK changes.
