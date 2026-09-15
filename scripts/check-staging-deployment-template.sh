#!/usr/bin/env bash
set -euo pipefail

SPEC="infrastructure/digitalocean/app.staging.template.yaml"
test -f "$SPEC"

required_literals=(
  "region: blr"
  "branch: staging"
  "deploy_on_push: true"
  "bash scripts/production-preflight.sh"
  "http_path: /api/v1/health/live"
  "http_path: /api/v1/health/ready"
  "kind: PRE_DEPLOY"
  "pnpm --filter @aaraagate/api prisma:migrate:deploy"
  "prefix: /api"
  "key: DATABASE_URL"
  "key: REDIS_URL"
  "key: CORS_ALLOWED_ORIGINS"
  "key: APP_VERSION"
  "key: GIT_SHA"
  "key: OTP_DELIVERY_PROVIDER"
  "key: MSG91_AUTH_KEY"
  "key: MSG91_OTP_TEMPLATE_ID"
  "key: FIREBASE_SERVICE_ACCOUNT_JSON"
  "key: PAYMENT_WEBHOOK_SECRET"
  "key: NEXT_PUBLIC_AARAGATE_API_BASE_URL"
)

for literal in "${required_literals[@]}"; do
  if ! grep -Fq -- "$literal" "$SPEC"; then
    echo "Staging deployment template is missing: $literal" >&2
    exit 1
  fi
done

if grep -Eq 'branch: (develop|main)$' "$SPEC"; then
  echo "Staging deployment components must track only the staging branch." >&2
  exit 1
fi
if grep -Eq 'value: (postgres(ql)?|redis(s)?|https?)://' "$SPEC"; then
  echo "Staging deployment template must not contain resolved URLs or credentials." >&2
  exit 1
fi

secret_keys=(
  DATABASE_URL
  REDIS_URL
  MSG91_AUTH_KEY
  MSG91_OTP_TEMPLATE_ID
  FIREBASE_SERVICE_ACCOUNT_JSON
  PAYMENT_WEBHOOK_SECRET
)
for key in "${secret_keys[@]}"; do
  if ! awk -v key="$key" '
    $0 ~ "^[[:space:]]*- key: " key "$" { found=1; next }
    found && $0 ~ "^[[:space:]]*type: SECRET$" { secured=1; exit }
    found && $0 ~ "^[[:space:]]*- key:" { exit }
    END { exit secured ? 0 : 1 }
  ' "$SPEC"; then
    echo "Staging deployment variable $key must be typed SECRET." >&2
    exit 1
  fi
done

echo "Staging deployment template contract validated."
