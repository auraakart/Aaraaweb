# Local development

The Aaraagate applications do not require hosted domains during development. URLs are supplied through environment configuration so production hosting can be added without source-code changes.

## Prerequisites

- Node.js 22
- pnpm 10.15.0
- Docker with Compose
- Flutter 3.24.0 for mobile development

## Configure the API

Copy `services/api/.env.example` to `services/api/.env`. The checked-in example contains development-only PostgreSQL, Redis and CORS values. Do not put production credentials in this file or commit the copied `.env` file.

The local API permits browser requests only from `http://localhost:3001`. Add multiple development origins as a comma-separated `CORS_ALLOWED_ORIGINS` value when required. Do not use `*` for authenticated endpoints.

## Configure the Admin portal

Copy `apps/admin/.env.example` to `apps/admin/.env.local`. The admin portal calls the API at `http://localhost:3000`.

## Start dependencies and applications

```bash
docker compose -f infrastructure/docker-compose.yml up -d
pnpm install
pnpm --filter @aaraagate/api prisma:generate
pnpm --filter @aaraagate/api prisma:migrate:deploy
pnpm --filter @aaraagate/api dev
```

In a second terminal:

```bash
pnpm --filter @aaraagate/admin dev -- --port 3001
```

Local endpoints:

- Admin: `http://localhost:3001`
- API: `http://localhost:3000`
- Health: `http://localhost:3000/api/v1/health`
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`

## Mobile API addresses

- Android emulator: `--dart-define=AARAGATE_API_BASE_URL=http://10.0.2.2:3000`
- iOS simulator: `--dart-define=AARAGATE_API_BASE_URL=http://localhost:3000`
- Physical device: use the development computer's private LAN address and keep both devices on the same trusted network.

Do not ship emulator, localhost or LAN addresses in release builds. Staging and production builds must receive hosted HTTPS URLs through their deployment environments.

## Future hosted environments

When hosting is provisioned, configure values in the deployment platform rather than committing another `.env` file:

```text
CORS_ALLOWED_ORIGINS=https://admin.aaraagate.com
NEXT_PUBLIC_AARAGATE_API_BASE_URL=https://api.aaraagate.com
```

These hostnames are reserved examples until DNS and hosting are active.
