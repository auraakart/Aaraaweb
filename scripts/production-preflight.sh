#!/usr/bin/env bash
set -euo pipefail

failures=0

fail() {
  printf 'ERROR: %s\n' "$1" >&2
  failures=$((failures + 1))
}

require_var() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    fail "${name} is required"
  fi
}

for name in \
  NODE_ENV \
  APP_VERSION \
  GIT_SHA \
  DATABASE_URL \
  REDIS_URL \
  CORS_ALLOWED_ORIGINS \
  OTP_DELIVERY_PROVIDER \
  MSG91_AUTH_KEY \
  MSG91_OTP_TEMPLATE_ID \
  FIREBASE_SERVICE_ACCOUNT_JSON \
  PAYMENT_WEBHOOK_SECRET \
  NEXT_PUBLIC_AARAGATE_API_BASE_URL; do
  require_var "$name"
done

if [[ "${NODE_ENV:-}" != "production" ]]; then
  fail "NODE_ENV must be production"
fi

if [[ "${OTP_DELIVERY_PROVIDER:-}" != "msg91" ]]; then
  fail "OTP_DELIVERY_PROVIDER must be msg91 for production"
fi

if [[ -n "${GIT_SHA:-}" && ( "${GIT_SHA}" == "unknown" || ${#GIT_SHA} -lt 7 ) ]]; then
  fail "GIT_SHA must identify the deployed release"
fi

if [[ -n "${DATABASE_URL:-}" && ! "${DATABASE_URL}" =~ ^postgres(ql)?:// ]]; then
  fail "DATABASE_URL must use a PostgreSQL URL"
fi

if [[ -n "${REDIS_URL:-}" && ! "${REDIS_URL}" =~ ^rediss?:// ]]; then
  fail "REDIS_URL must use redis:// or rediss://"
fi

if [[ -n "${CORS_ALLOWED_ORIGINS:-}" && "${CORS_ALLOWED_ORIGINS}" =~ (localhost|127\.0\.0\.1) ]]; then
  fail "CORS_ALLOWED_ORIGINS must not contain local development origins"
fi

if [[ -n "${NEXT_PUBLIC_AARAGATE_API_BASE_URL:-}" ]]; then
  if [[ ! "${NEXT_PUBLIC_AARAGATE_API_BASE_URL}" =~ ^https:// ]]; then
    fail "NEXT_PUBLIC_AARAGATE_API_BASE_URL must use HTTPS in production"
  fi
  if [[ "${NEXT_PUBLIC_AARAGATE_API_BASE_URL}" =~ (localhost|127\.0\.0\.1) ]]; then
    fail "NEXT_PUBLIC_AARAGATE_API_BASE_URL must not point to a local development host"
  fi
fi

if [[ -n "${PAYMENT_WEBHOOK_SECRET:-}" && ${#PAYMENT_WEBHOOK_SECRET} -lt 16 ]]; then
  fail "PAYMENT_WEBHOOK_SECRET must be at least 16 characters"
fi

if [[ -n "${FIREBASE_SERVICE_ACCOUNT_JSON:-}" ]]; then
  if ! FIREBASE_SERVICE_ACCOUNT_JSON="${FIREBASE_SERVICE_ACCOUNT_JSON}" node <<'NODE'
const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
try {
  const value = JSON.parse(raw);
  for (const key of ['project_id', 'client_email', 'private_key']) {
    if (!value[key] || typeof value[key] !== 'string') throw new Error(`missing ${key}`);
  }
} catch (error) {
  console.error(`Invalid FIREBASE_SERVICE_ACCOUNT_JSON: ${error.message}`);
  process.exit(1);
}
NODE
  then
    fail "FIREBASE_SERVICE_ACCOUNT_JSON must be valid service-account JSON"
  fi
fi

if (( failures > 0 )); then
  printf 'Production preflight failed with %d configuration error(s).\n' "$failures" >&2
  exit 1
fi

printf 'Production preflight passed: release metadata, database, Redis, OTP, FCM, payment webhook, CORS, and Admin API URL are configured.\n'
