# Infrastructure

Deployment, local development containers, database migration support and environment-specific infrastructure live here.

Never commit credentials or production secrets.

## Current hosted target

The initial hosted staging/production target is DigitalOcean Bangalore. See [`docs/HOSTING-DECISION.md`](../docs/HOSTING-DECISION.md) for the rationale and operational requirements.

`digitalocean/app.staging.template.yaml` is a reviewed starting template only. Replace every `REPLACE_*` value in the DigitalOcean control plane before deployment and keep secrets encrypted outside Git.

The application itself must remain provider-portable and continue to use standard PostgreSQL/Redis-compatible connections and environment variables.

For the complete local setup, environment files and mobile emulator addresses, see [`docs/LOCAL-DEVELOPMENT.md`](../docs/LOCAL-DEVELOPMENT.md).
