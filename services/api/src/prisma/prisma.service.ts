import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

export const TENANT_CONTEXT_SETTING = 'app.aaraagate_society_id';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Establishes a transaction-local PostgreSQL tenant context for code that is
   * being migrated toward database-enforced row-level security.
   *
   * V4.81.1 does not enable RLS policies. The setting is local to this
   * transaction so pooled connections cannot leak a society context.
   */
  async withTenantContext<T>(
    societyId: string,
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    if (!UUID_PATTERN.test(societyId)) {
      throw new Error('A valid society UUID is required for tenant database context');
    }

    return this.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT set_config(${TENANT_CONTEXT_SETTING}, ${societyId}, true)`,
      );
      return operation(tx);
    });
  }
}
