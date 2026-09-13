import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (relativePath: string) => readFileSync(join(__dirname, relativePath), 'utf8');

describe('External Services V2.2 offer contract', () => {
  it('supports the planned structured offer types and contextual targets', () => {
    const migration = read('../../prisma/migrations/20260913082000_v22a_offer_contract_hardening/migration.sql');
    expect(migration).toContain("ADD VALUE IF NOT EXISTS 'FIXED_PRICE'");
    expect(migration).toContain("ADD VALUE IF NOT EXISTS 'BUNDLE'");
    expect(migration).toContain('ADD COLUMN "categoryId" uuid');
    expect(migration).toContain('ADD COLUMN "societyId" uuid');
    expect(migration).toContain('ADD COLUMN "postalCode" varchar(16)');
    expect(migration).toContain('"ServiceOffer_bundle_label_check"');
  });

  it('keeps offer discovery scoped to the already-authorized delivery location', () => {
    const source = read('consumer-offers.service.ts');
    expect(source).toContain('so."postalCode" IS NULL OR so."postalCode" = ${location.postalCode}');
    expect(source).toContain('so."societyId" IS NULL OR so."societyId" = ${location.societyId ?? null}::uuid');
    expect(source).toContain('COALESCE(so."categoryId", o."categoryId")');
    expect(source).toContain('${categoryId ?? null}::uuid IS NULL OR c."id" = ${categoryId ?? null}::uuid');
  });

  it('applies the same targeting boundary on provider storefront offers', () => {
    const source = read('consumer-provider-experience.service.ts');
    expect(source).toContain('so."postalCode" IS NULL OR so."postalCode" = ${location.postalCode}');
    expect(source).toContain('so."societyId" IS NULL OR so."societyId" = ${location.societyId ?? null}::uuid');
    expect(source).toContain("'PERCENT' | 'FLAT' | 'FIXED_PRICE' | 'BUNDLE'");
  });
});
