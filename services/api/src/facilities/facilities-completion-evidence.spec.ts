import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source=()=>readFileSync(join(__dirname,'facilities.controller.ts'),'utf8');
const migration=()=>readFileSync(join(__dirname,'../../prisma/migrations/20260914213000_v2_facilities_completion_evidence/migration.sql'),'utf8');

describe('Facilities completion evidence',()=>{
  it('requires a meaningful completion note at the API boundary',()=>{
    const s=source();
    expect(s).toContain("o.status==='COMPLETED'");
    expect(s).toContain('@MinLength(5)');
  });

  it('enforces completion evidence for new or updated completed work orders without fabricating legacy evidence',()=>{
    const sql=migration();
    expect(sql).toContain('FacilityWorkOrder_completion_evidence_check');
    expect(sql).toContain('length(btrim("completionNote")) >= 5');
    expect(sql).toContain('"completedAt" IS NOT NULL');
    expect(sql).toContain('NOT VALID');
  });
});
