#!/usr/bin/env bash
set -euo pipefail

API_BASE_URL="${1:-}"
EXPECTED_SHA="${2:-}"
EVIDENCE_DIR="${3:-hosted-staging-evidence}"
ATTEMPTS="${HOSTED_STAGING_ATTEMPTS:-30}"
INTERVAL_SECONDS="${HOSTED_STAGING_INTERVAL_SECONDS:-20}"

if [[ ! "$EXPECTED_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Expected staging SHA must be a full lowercase Git commit SHA." >&2
  exit 2
fi

if [[ ! "$ATTEMPTS" =~ ^[0-9]+$ ]] || (( ATTEMPTS < 1 || ATTEMPTS > 60 )); then
  echo "HOSTED_STAGING_ATTEMPTS must be an integer between 1 and 60." >&2
  exit 2
fi
if [[ ! "$INTERVAL_SECONDS" =~ ^[0-9]+$ ]] || (( INTERVAL_SECONDS < 1 || INTERVAL_SECONDS > 60 )); then
  echo "HOSTED_STAGING_INTERVAL_SECONDS must be an integer between 1 and 60." >&2
  exit 2
fi

if ! normalized_url="$(API_BASE_URL="$API_BASE_URL" node <<'NODE'
const dns = require('dns').promises;
const net = require('net');
const raw = process.env.API_BASE_URL;
const privateIpv4 = /^(0\.|10\.|127\.|169\.254\.|192\.168\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|172\.(1[6-9]|2\d|3[01])\.)/;
const isPrivate = value => {
  const address = value.toLowerCase().replace(/^\[|\]$/g, '');
  if (net.isIPv4(address)) return privateIpv4.test(address);
  if (net.isIPv6(address)) {
    if (address === '::' || address === '::1' || /^(fc|fd|fe[89ab])/.test(address)) return true;
    if (address.startsWith('::ffff:')) return privateIpv4.test(address.slice(7));
  }
  return false;
};
(async () => {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('Hosted staging API base URL is invalid.');
  }
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
    (url.pathname !== '/' && url.pathname !== '') || hostname === 'localhost' || hostname.endsWith('.local') ||
    isPrivate(hostname)
  ) {
    throw new Error('Hosted staging must be a credential-free public HTTPS origin, not a local or private target.');
  }
  const addresses = await dns.lookup(hostname, { all: true });
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivate(address))) {
    throw new Error('Hosted staging hostname must resolve only to public addresses.');
  }
  console.log(url.origin);
})().catch(error => {
  console.error(error.message);
  process.exit(1);
});
NODE
)"; then
  exit 2
fi
API_BASE_URL="$normalized_url"

mkdir -p "$EVIDENCE_DIR"

accepted=false
last_error="Hosted endpoint was unavailable."
for (( attempt = 1; attempt <= ATTEMPTS; attempt++ )); do
  validation_output=""
  if curl --fail --silent --show-error --proto '=https' --tlsv1.2 \
      --connect-timeout 10 --max-time 30 \
      "$API_BASE_URL/api/v1/health/live" > "$EVIDENCE_DIR/liveness.json" 2>/dev/null && \
    curl --fail --silent --show-error --proto '=https' --tlsv1.2 \
      --connect-timeout 10 --max-time 30 \
      "$API_BASE_URL/api/v1/health/ready" > "$EVIDENCE_DIR/readiness.json" 2>/dev/null; then
    if validation_output="$(node scripts/validate-hosted-health.mjs \
      "$EVIDENCE_DIR/liveness.json" "$EVIDENCE_DIR/readiness.json" "$EXPECTED_SHA" 2>&1)"; then
      accepted=true
      break
    fi
    last_error="$validation_output"
  fi

  if (( attempt < ATTEMPTS )); then
    echo "Hosted staging candidate is not ready (attempt ${attempt}/${ATTEMPTS}); retrying in ${INTERVAL_SECONDS}s."
    sleep "$INTERVAL_SECONDS"
  fi
done

if [[ "$accepted" != "true" ]]; then
  echo "Hosted staging did not expose candidate ${EXPECTED_SHA} after ${ATTEMPTS} attempt(s): ${last_error}" >&2
  exit 1
fi

cat > "$EVIDENCE_DIR/hosted-staging-evidence.md" <<EOF
# Aaraagate hosted staging smoke

- Candidate SHA: ${EXPECTED_SHA}
- API origin: ${API_BASE_URL}
- Workflow run: ${GITHUB_RUN_ID:-local}
- Verified UTC: $(date -u +'%Y-%m-%dT%H:%M:%SZ')
- TLS endpoint: pass
- Liveness metadata: pass
- PostgreSQL readiness: pass
- Redis/auth-state readiness: pass

This evidence does not attest to managed backup/PITR, alert delivery, rollback execution or real-device UAT.
EOF

echo "Hosted staging smoke passed for ${EXPECTED_SHA}."
