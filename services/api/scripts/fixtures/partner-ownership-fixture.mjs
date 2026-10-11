// Frozen pre-V5 compatibility fixtures. These are test data, not a live resolver.
export const builtinPartnerId = '00000000-0000-4000-8000-000000000001';
export const migrationName = '20261011113000_v5_partner_ownership_compatibility';
export const features = ['VISITOR_MANAGEMENT','DELIVERY_MANAGEMENT','DOMESTIC_HELP','NOTICES','HELPDESK','SOS','HOUSEHOLD_SERVICES','MAINTENANCE_BILLING','PAYMENTS','SOCIETY_ACCOUNTING','AMENITIES','GOVERNANCE_POLLS','ADVANCED_REPORTS','WHATSAPP_AUTOMATION','AI_ASSISTANT','CUSTOM_INTEGRATIONS'];
export const tiers = {
  STARTER: [0,3,5], PROFESSIONAL: [0,1,2,3,4,5,6],
  PREMIUM: [0,1,2,3,4,5,6,7,8,9,10,12,13], ENTERPRISE: features.map((_, i) => i),
};
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
const json = value => `${literal(JSON.stringify(value))}::jsonb`;
export const fixtures = Object.entries(tiers).flatMap(([tier, indices], t) =>
  [{}, { VISITOR_MANAGEMENT: false, AI_ASSISTANT: true, UNKNOWN: true }, { NOTICES: 'false', SOS: 0 }, null, [], ['NOTICES'], 'legacy', false].flatMap((overrides, o) =>
    ['ACTIVE', 'SUSPENDED'].map((status, s) => ({
      id: `10000000-0000-4000-8000-${String(t * 16 + o * 2 + s + 1).padStart(12, '0')}`,
      tier, overrides, status,
      enabled: features.filter((f, i) => overrides && !Array.isArray(overrides) && typeof overrides[f] === 'boolean' ? overrides[f] : indices.includes(i)),
    }))));
export const seedSql = `
CREATE TEMP TABLE expected_compatibility (id uuid PRIMARY KEY, features jsonb NOT NULL);
${fixtures.map(f => `INSERT INTO "Society" ("id","name","code","status","productTier","featureOverrides","updatedAt") VALUES (${literal(f.id)},'Legacy fixture',${literal(f.id)},${literal(f.status)},${literal(f.tier)},${json(f.overrides)},CURRENT_TIMESTAMP);
INSERT INTO expected_compatibility VALUES (${literal(f.id)},${json(f.enabled)});`).join('\n')}
CREATE TEMP TABLE legacy_society AS SELECT "id", to_jsonb(s) AS data FROM "Society" s;
`;
export const verifyCutoverSql = `
DO $$ BEGIN
  IF (SELECT count(*) FROM "SocietyEntitlementCompatibility") <> ${fixtures.length} THEN RAISE EXCEPTION 'Snapshot count mismatch'; END IF;
  IF EXISTS (SELECT 1 FROM "Society" WHERE "partnerId" <> '${builtinPartnerId}' OR "ownershipVersion" <> 1) THEN RAISE EXCEPTION 'Ownership backfill mismatch'; END IF;
  IF EXISTS (SELECT 1 FROM "Society" s JOIN legacy_society l USING ("id") WHERE to_jsonb(s)-'partnerId'-'ownershipVersion' <> l.data) THEN RAISE EXCEPTION 'Legacy society changed'; END IF;
  IF EXISTS (SELECT 1 FROM "SocietyEntitlementCompatibility" c JOIN "Society" s ON s."id"=c."societyId" JOIN expected_compatibility e ON e.id=s."id" WHERE c."enabledFeatures" <> e.features OR c."sourceOverrides" <> s."featureOverrides" OR c."sourceProductTier" <> s."productTier" OR c."sourceMigration" <> '${migrationName}') THEN RAISE EXCEPTION 'Entitlement compatibility mismatch'; END IF;
END $$;
CREATE TEMP TABLE original_snapshots AS SELECT to_jsonb(c) AS data FROM "SocietyEntitlementCompatibility" c;
-- Old-server insert omits both new ownership columns.
INSERT INTO "Society" ("id","name","code","updatedAt") VALUES ('20000000-0000-4000-8000-000000000001','Old server','old-server',CURRENT_TIMESTAMP);
INSERT INTO "User" ("id","phone","updatedAt") VALUES ('30000000-0000-4000-8000-000000000001','v5-fixture-user',CURRENT_TIMESTAMP);
INSERT INTO "Partner" ("id","slug","displayName","status") VALUES ('40000000-0000-4000-8000-000000000001','fixture-partner','Fixture partner','ACTIVE');
INSERT INTO "PartnerMembership" ("partnerId","userId","role") SELECT '40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',r::"PartnerRole" FROM unnest(ARRAY['OWNER','BRAND_MANAGER','COMMERCIAL_ADMIN','SUPPORT']) r;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "Society" WHERE "code"='old-server' AND ("partnerId" <> '${builtinPartnerId}' OR "ownershipVersion" <> 1)) THEN RAISE EXCEPTION 'Old-server default incompatible'; END IF;
  IF (SELECT count(*) FROM "SocietyMembership" WHERE "userId"='30000000-0000-4000-8000-000000000001') <> 0 THEN RAISE EXCEPTION 'Partner membership granted society access'; END IF;
  BEGIN UPDATE "Society" SET "partnerId"='90000000-0000-4000-8000-000000000001' WHERE "code"='old-server'; RAISE EXCEPTION 'Missing owner accepted'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN UPDATE "Society" SET "ownershipVersion"=0 WHERE "code"='old-server'; RAISE EXCEPTION 'Invalid version accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN DELETE FROM "Partner" WHERE "id"='${builtinPartnerId}'; RAISE EXCEPTION 'Default partner deleted'; EXCEPTION WHEN SQLSTATE '55000' THEN NULL; END;
  BEGIN UPDATE "Partner" SET "id"='50000000-0000-4000-8000-000000000001' WHERE "id"='${builtinPartnerId}'; RAISE EXCEPTION 'Default partner reidentified'; EXCEPTION WHEN SQLSTATE '55000' THEN NULL; END;
  BEGIN UPDATE "Partner" SET "status"='TERMINATED' WHERE "id"='${builtinPartnerId}'; RAISE EXCEPTION 'Default partner terminated'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN INSERT INTO "PartnerMembership" ("partnerId","userId","role") VALUES ('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','OWNER'); RAISE EXCEPTION 'Duplicate membership accepted'; EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN DELETE FROM "Partner" WHERE "id"='40000000-0000-4000-8000-000000000001'; RAISE EXCEPTION 'Referenced partner deleted'; EXCEPTION WHEN foreign_key_violation OR SQLSTATE '23001' THEN NULL; END;
  BEGIN UPDATE "SocietyEntitlementCompatibility" SET "enabledFeatures"='[]'; RAISE EXCEPTION 'Snapshot mutable'; EXCEPTION WHEN SQLSTATE '55000' THEN NULL; END;
END $$;
-- Replays must preserve existing snapshots and non-default ownership.
UPDATE "Society" SET "productTier"='ENTERPRISE',"featureOverrides"='{}',"partnerId"='40000000-0000-4000-8000-000000000001',"ownershipVersion"=2 WHERE "id"='${fixtures[0].id}';
`;
export const verifyReplaySql = `
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM original_snapshots o WHERE NOT EXISTS (SELECT 1 FROM "SocietyEntitlementCompatibility" c WHERE to_jsonb(c)=o.data)) THEN RAISE EXCEPTION 'Replay rewrote snapshot'; END IF;
  IF NOT EXISTS (SELECT 1 FROM "Society" WHERE "id"='${fixtures[0].id}' AND "partnerId"='40000000-0000-4000-8000-000000000001' AND "ownershipVersion"=2) THEN RAISE EXCEPTION 'Replay reset ownership'; END IF;
END $$;
-- Existing deletion semantics still work for identity and society records.
DELETE FROM "User" WHERE "id"='30000000-0000-4000-8000-000000000001';
DELETE FROM "Society" WHERE "id"='${fixtures[1].id}';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "PartnerMembership") THEN RAISE EXCEPTION 'User delete did not cascade'; END IF;
  IF EXISTS (SELECT 1 FROM "SocietyEntitlementCompatibility" WHERE "societyId"='${fixtures[1].id}') THEN RAISE EXCEPTION 'Society delete did not cascade'; END IF;
END $$;
`;
// A conflicting reserved slug must fail atomically before legacy ownership changes.
export const failureFixtureSql = `
CREATE TABLE "Partner" ("id" uuid PRIMARY KEY,"slug" text NOT NULL,"displayName" text NOT NULL,"status" text NOT NULL,"createdAt" timestamptz DEFAULT now(),"updatedAt" timestamptz DEFAULT now(),CONSTRAINT "Partner_slug_key" UNIQUE("slug"));
INSERT INTO "Partner" ("id","slug","displayName","status") VALUES ('60000000-0000-4000-8000-000000000001','aaraagate','Conflicting fixture','ACTIVE');
`;
export const verifyAtomicRollbackSql = `
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='Society' AND column_name='partnerId') THEN RAISE EXCEPTION 'Failed migration left ownership column'; END IF;
  IF to_regclass('"PartnerMembership"') IS NOT NULL OR to_regclass('"SocietyEntitlementCompatibility"') IS NOT NULL THEN RAISE EXCEPTION 'Failed migration left new tables'; END IF;
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname='PartnerStatus' AND typnamespace=current_schema()::regnamespace) THEN RAISE EXCEPTION 'Failed migration left new enum'; END IF;
END $$;
DROP TABLE "Partner";
`;
