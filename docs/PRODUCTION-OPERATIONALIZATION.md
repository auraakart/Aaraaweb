# Aaraagate Production Operationalization

Updated: 2026-09-05

This milestone starts after Commercial V1 code release. It converts the validated repository release into a hosted pilot environment and a signed Android release candidate. Repository green status alone is not evidence of a live production system.

## 1. Hosting target

Provider: DigitalOcean, Bangalore (`blr`).

Production topology:
- App Platform service: `aaraagate-api`
- App Platform service: `aaraagate-admin`
- managed PostgreSQL in BLR
- managed Valkey in BLR, connected through `REDIS_URL`
- private/VPC connectivity for data services where available
- API liveness: `/api/v1/health/live`
- dependency-aware readiness: `/api/v1/health/ready`

Use `infrastructure/digitalocean/app.production.template.yaml` as the production application contract. Replace placeholders only in the provider control plane. Do not commit credentials or private connection URLs.

## 2. Required production configuration

The API production preflight must pass in the actual hosting environment before traffic is enabled.

Required runtime values:
- `NODE_ENV=production`
- `APP_VERSION`
- `GIT_SHA` matching the deployed `main` release
- `DATABASE_URL`
- `REDIS_URL`
- `CORS_ALLOWED_ORIGINS`
- `OTP_DELIVERY_PROVIDER=msg91`
- `MSG91_AUTH_KEY`
- `MSG91_OTP_TEMPLATE_ID`
- `FIREBASE_SERVICE_ACCOUNT_JSON`
- `PAYMENT_WEBHOOK_SECRET`
- `NEXT_PUBLIC_AARAGATE_API_BASE_URL`

Run `bash scripts/production-preflight.sh` in the live deployment environment immediately before enabling production traffic.

## 3. Database and recovery gate

Before pilot acceptance:
1. enable provider-managed PostgreSQL backups;
2. record backup frequency and retention;
3. record encryption-at-rest status;
4. record PITR window if supported by the selected plan;
5. restore one provider-managed recovery point into an isolated non-production database;
6. run migrations/startup verification against the restored target where safe;
7. record restore duration and result.

Never use the production database as the restore-drill target.

## 4. Monitoring and alerting gate

Enable and verify:
- deployment-failure alerts;
- domain/TLS failure alerts;
- API liveness monitoring;
- external readiness monitoring;
- PostgreSQL availability/storage alerts;
- Valkey availability/resource alerts;
- API 5xx/latency monitoring where supported;
- restart/resource-pressure alerts;
- an identified human escalation owner.

Every release/rollback record should include `APP_VERSION` and `GIT_SHA`.

## 5. Signed Android release

The Resident application must move from demo/debug APK packaging to a signed Android App Bundle for Play internal/closed testing.

Repository workflow: `.github/workflows/resident-release-aab.yml`.

Required GitHub Actions secrets:
- `ANDROID_UPLOAD_KEYSTORE_BASE64`
- `ANDROID_UPLOAD_KEYSTORE_PASSWORD`
- `ANDROID_UPLOAD_KEY_ALIAS`
- `ANDROID_UPLOAD_KEY_PASSWORD`

The upload keystore must be generated and retained outside the repository in a secure owner-controlled location. Losing the upload key creates avoidable release-management risk. Never commit the keystore, password, key alias/password file, or base64 value.

The release workflow must:
- run only by explicit manual dispatch from `main`;
- build with an HTTPS production API base URL;
- keep demo mode disabled;
- run Resident analysis/tests;
- build a release AAB;
- verify the AAB signature;
- upload the AAB as a time-limited GitHub Actions artifact.

A successful AAB build is still not Play release evidence. Record the Play internal/closed-test track, version, tester cohort and installation/upgrade result separately.

## 6. Pilot society gate

Use one controlled real society before broad rollout. Minimum pilot setup:
- society and subscription/entitlements;
- buildings, floors and units;
- owner + tenant/occupant combinations;
- society admin and operational roles;
- gates/guards;
- parking/vehicles;
- dues/invoices and owner/tenant payment visibility;
- notices with owner-only and owner+occupant audiences;
- domestic-help/workforce records;
- marketplace providers/offerings;
- representative helpdesk and visitor flows.

Execute the critical scenarios in `docs/UAT-PILOT-CHECKLIST.md` on real devices.

## 7. Exit criteria

Do not call Aaraagate operationally live until all are true:
- hosted API/Admin are reachable over production TLS domains;
- live production preflight passes;
- managed PostgreSQL and Valkey connectivity is verified;
- provider backup + isolated restore evidence exists;
- monitoring/alert routing is active;
- MSG91 OTP is verified end-to-end;
- FCM push is verified on a real device;
- payment webhook verification is proven in the configured gateway environment;
- signed Resident AAB is accepted into Play internal/closed testing;
- pilot UAT passes with no unresolved critical/high defect;
- rollback owner and previous known-good release are recorded.
