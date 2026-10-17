import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ProductFeature, ProductTier, TIER_FEATURES } from '../entitlements/entitlement.types';

const sql = readFileSync(join(__dirname, '../../prisma/migrations/20261011113000_v5_partner_ownership_compatibility/migration.sql'), 'utf8');

describe('V5 compatibility cutover catalogue', () => {
  it('freezes exactly the feature ordering and tier mapping of the legacy resolver', () => {
    const rows = [...sql.matchAll(/\('([A-Z_]+)',(\d+),ARRAY\[([^\]]+)\]::text\[\]\)/g)];
    expect(rows.map(row => row[1])).toEqual(Object.values(ProductFeature));
    expect(rows.map(row => Number(row[2]))).toEqual(Object.values(ProductFeature).map((_, i) => i));
    for (const tier of Object.values(ProductTier)) {
      const effective = rows.filter(row => row[3].includes(`'${tier}'`)).map(row => row[1]);
      expect(effective).toEqual(Object.values(ProductFeature).filter(feature => TIER_FEATURES[tier].includes(feature)));
    }
  });
});
