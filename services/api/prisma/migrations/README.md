# Prisma migrations

Production and CI databases must be updated with `pnpm --filter @aaraagate/api prisma:migrate:deploy` after a reviewed migration has been generated.

For local development, use `pnpm --filter @aaraagate/api prisma:migrate:dev --name <migration-name>` against a disposable/local database. Do not hand-author SQL migrations or run `migrate dev` against production.
