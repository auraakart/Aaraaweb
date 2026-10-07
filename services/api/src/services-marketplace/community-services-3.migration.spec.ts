import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(__dirname, '../../prisma/migrations/20261007170000_v485_community_services_3/migration.sql'),
  'utf8',
);

describe('V4.85 community services migration', () => {
  it('keeps quick-service promises offering-scoped and bounded', () => {
    expect(migration).toContain('CREATE TABLE "ServiceOfferingExperiencePolicy"');
    expect(migration).toContain('"targetArrivalMinutes" BETWEEN 15 AND 240');
    expect(migration).toContain('FOREIGN KEY ("offeringId") REFERENCES "ServiceOffering"');
  });

  it('keeps recurring plans user-owned and non-payment-bearing', () => {
    expect(migration).toContain('CREATE TABLE "ConsumerServiceRecurringPlan"');
    expect(migration).toContain('"userId" UUID NOT NULL');
    expect(migration).toContain("CHECK (\"status\" IN ('ACTIVE','PAUSED','CANCELLED'))");
    expect(migration).not.toContain('paymentMethod');
    expect(migration).not.toContain('autoCharge');
  });

  it('counts community interest once per household unit', () => {
    expect(migration).toContain('CREATE TABLE "CommunityServiceCampaignInterest"');
    expect(migration).toContain('"CommunityServiceCampaignInterest_campaign_unit_key"');
    expect(migration).toContain('ON "CommunityServiceCampaignInterest"("campaignId","unitId")');
  });
});
