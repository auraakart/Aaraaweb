import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source=(name:string)=>readFileSync(join(__dirname,name),'utf8');
const migration=(name:string)=>readFileSync(join(__dirname,'../../prisma/migrations',name,'migration.sql'),'utf8');

describe('V2.1D facilities regression and security closure',()=>{
  it('keeps work-order access society-scoped and assignees limited to active society members',()=>{
    const s=source('facilities.controller.ts');
    expect(s).toContain('"societyId"=${societyId}::uuid');
    expect(s).toContain('FROM "SocietyMembership"');
    expect(s).toContain('"userId"=${userId}::uuid');
    expect(s).toContain('"active"=TRUE');
  });

  it('serializes work-order lifecycle changes and records audit events',()=>{
    const s=source('facilities.controller.ts');
    expect(s).toContain('this.prisma.$transaction');
    expect(s).toContain('FOR UPDATE');
    expect(s).toContain('INSERT INTO "FacilityWorkOrderEvent"');
    expect(s).toContain("'STATUS_CHANGED'");
  });

  it('keeps work-order history append-only at the database layer',()=>{
    const sql=migration('20260913074500_v21d_facilities_hardening');
    expect(sql).toContain('FacilityWorkOrderEvent is append-only');
    expect(sql).toContain('BEFORE UPDATE ON "FacilityWorkOrderEvent"');
    expect(sql).toContain('BEFORE DELETE ON "FacilityWorkOrderEvent"');
  });

  it('keeps preventive generation society-scoped, active-asset-only and idempotent',()=>{
    const s=source('facilities-preventive.service.ts');
    expect(s).toContain('p."societyId"=${societyId}::uuid');
    expect(s).toContain("a.\"status\"='ACTIVE'");
    expect(s).toContain('FOR UPDATE OF p');
    expect(s).toContain('ON CONFLICT ("maintenancePlanId","scheduledAt")');
    expect(s).toContain('actorUserId??p.createdByUserId');
  });

  it('keeps operational alerts society-scoped and deduplicated',()=>{
    const s=source('facilities-alerts.service.ts');
    const sql=migration('20260913074500_v21d_facilities_operational_alerts');
    expect(s).toContain('"societyId"=${societyId}::uuid');
    expect(s).toContain('ON CONFLICT ("societyId","dedupKey") DO NOTHING');
    expect(sql).toContain('CREATE UNIQUE INDEX "FacilityOperationalAlert_dedup_key" ON "FacilityOperationalAlert"("societyId","dedupKey")');
  });

  it('makes asset retirement irreversible and race-safe',()=>{
    const s=source('facilities-assets.controller.ts');
    expect(s).toContain('this.prisma.$transaction');
    expect(s).toContain('FOR UPDATE');
    expect(s).toContain("current==='RETIRED'&&dto.status!=='RETIRED'");
    expect(s).toContain('"societyId"=${societyId}::uuid');
  });

  it('keeps facilities health metrics strictly society-scoped',()=>{
    const s=source('facilities-preventive.service.ts');
    for(const table of ['FacilityAsset','FacilityMaintenancePlan','FacilityWorkOrder','FacilityOperationalAlert','FacilityServiceContract']){
      expect(s).toContain(`FROM \"${table}\" WHERE \"societyId\"=${'${societyId}'}::uuid`);
    }
  });
});
