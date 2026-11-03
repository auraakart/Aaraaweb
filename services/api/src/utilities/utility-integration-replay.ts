import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { utilityIntegrationMeterParents } from './utility-integration-parents';

type Receipt = {
  id: string; payloadHash: string; status: 'ACCEPTED' | 'QUARANTINED'; readingId: string | null;
  errorCode: string | null; errorMessage: string | null;
};

export async function utilityIntegrationReplay(tx: Prisma.TransactionClient, societyId: string, integrationId: string, key: string): Promise<Receipt | null> {
  const rows = await tx.$queryRaw<Array<Receipt & {parentsValid: boolean}>>(Prisma.sql`
    SELECT receipt."id",receipt."payloadHash",receipt."status",receipt."readingId",receipt."errorCode",receipt."errorMessage",
      (receipt."readingId" IS NULL OR EXISTS (
        SELECT 1 FROM "UtilityReading" reading JOIN "UtilityMeter" meter
          ON meter."id"=reading."meterId" AND meter."societyId"=reading."societyId"
        WHERE reading."id"=receipt."readingId" AND reading."societyId"=receipt."societyId"
          AND reading."integrationId"=receipt."integrationId" AND ${utilityIntegrationMeterParents('meter')}
      )) AS "parentsValid"
    FROM "UtilityIngestionReceipt" receipt
    WHERE receipt."integrationId"=${integrationId}::uuid AND receipt."societyId"=${societyId}::uuid AND receipt."idempotencyKey"=${key}
  `);
  if (!rows[0]) return null;
  const {parentsValid, ...receipt} = rows[0];
  if (!parentsValid) throw new ConflictException('Stored utility ingestion receipt has inconsistent parents');
  return receipt;
}
