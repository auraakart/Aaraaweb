#!/usr/bin/env bash
set -euo pipefail

ui_paths=(
  apps/resident/lib
  apps/guard/lib
  apps/admin/app
)

if grep -RniE \
  --include='*.dart' \
  --include='*.tsx' \
  --include='*.ts' \
  --include='*.css' \
  'aaraa[[:space:]_-]*platforms' "${ui_paths[@]}"; then
  echo "ERROR: Corporate AaraaPlatforms naming must not appear in Aaraagate product UI source."
  exit 1
fi

echo "Product branding check passed."
