#!/usr/bin/env bash
set -euo pipefail

WORKFLOW=".github/workflows/hosted-staging-acceptance.yml"
SMOKE="scripts/hosted-staging-smoke.sh"
VALIDATOR="scripts/validate-hosted-health.mjs"

test -f "$WORKFLOW"
test -f "$SMOKE"
test -f "$VALIDATOR"
bash -n "$SMOKE"

required_literals=(
  "workflow_dispatch:"
  "branches: [staging]"
  "environment: staging"
  "vars.AARAAGATE_STAGING_API_BASE_URL"
  'git rev-parse origin/staging'
  'bash scripts/hosted-staging-smoke.sh'
  "Upload hosted staging evidence"
  "HOSTED_STAGING_ATTEMPTS"
  "retrying in"
  "--proto '=https' --tlsv1.2"
  "health/live"
  "health/ready"
  "ready.dependencies?.authState === 'redis-ok'"
)

for literal in "${required_literals[@]}"; do
  if ! grep -Fq -- "$literal" "$WORKFLOW" "$SMOKE" "$VALIDATOR"; then
    echo "Hosted staging contract is missing: $literal" >&2
    exit 1
  fi
done

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT
sha="0123456789abcdef0123456789abcdef01234567"
if bash "$SMOKE" "http://staging.example.com" "$sha" "$tmp_dir/http" >/dev/null 2>&1; then
  echo "Hosted staging smoke accepted an insecure HTTP target." >&2
  exit 1
fi
if bash "$SMOKE" "https://127.0.0.1" "$sha" "$tmp_dir/local" >/dev/null 2>&1; then
  echo "Hosted staging smoke accepted a local target." >&2
  exit 1
fi
if HOSTED_STAGING_ATTEMPTS=0 bash "$SMOKE" "https://staging.example.com" "$sha" "$tmp_dir/attempts" >/dev/null 2>&1; then
  echo "Hosted staging smoke accepted an invalid attempt count." >&2
  exit 1
fi

cat > "$tmp_dir/live.json" <<EOF
{"status":"ok","service":"aaraagate-api","environment":"production","version":"staging-2026.09.15","commit":"$sha"}
EOF
cat > "$tmp_dir/ready.json" <<EOF
{"status":"ready","service":"aaraagate-api","environment":"production","version":"staging-2026.09.15","commit":"$sha","dependencies":{"database":"ok","authState":"redis-ok"}}
EOF
node "$VALIDATOR" "$tmp_dir/live.json" "$tmp_dir/ready.json" "$sha"

cat > "$tmp_dir/unready.json" <<EOF
{"status":"ready","service":"aaraagate-api","environment":"production","version":"staging-2026.09.15","commit":"$sha","dependencies":{"database":"ok","authState":"memory-ok"}}
EOF
if node "$VALIDATOR" "$tmp_dir/live.json" "$tmp_dir/unready.json" "$sha" >/dev/null 2>&1; then
  echo "Hosted health validator accepted non-Redis authentication state." >&2
  exit 1
fi

echo "Hosted staging acceptance contract validated."
