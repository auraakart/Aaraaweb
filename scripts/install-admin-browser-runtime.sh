#!/usr/bin/env bash
set -euo pipefail

# Download the pinned browser first. Hosted runners usually already provide the
# Linux runtime; do not update/upgrade it unless an actual launch requires it.
pnpm --filter @aaraagate/admin exec playwright install chromium
probe_browser() {
  pnpm --filter @aaraagate/admin exec node -e '
    const { chromium } = require("@playwright/test");
    (async () => {
      const browser = await chromium.launch({ headless: true, timeout: 10000 });
      await browser.close();
    })().catch(error => { console.error(error.message); process.exitCode = 1; });
  '
}
if probe_browser; then
  echo 'Admin Chromium runtime is ready; system dependency installation is unnecessary.'
else
  echo 'Chromium could not launch; install the supported Linux dependencies and verify again.'
  pnpm --filter @aaraagate/admin exec playwright install --with-deps chromium
  probe_browser
fi
