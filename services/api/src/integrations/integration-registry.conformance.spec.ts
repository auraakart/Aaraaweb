import { describe, expect, it } from 'vitest';
import { IntegrationRegistryService } from './integration-registry.service';

describe('IntegrationRegistryService conformance',()=>{
  it('keeps provider/hardware certification outside repository conformance',()=>{
    const service=new IntegrationRegistryService();
    const rows=service.conformance('society-1');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every(row=>row.certificationClaim===false)).toBe(true);
    expect(rows.find(row=>row.family==='ACCESS_CONTROL')?.status).toBe('FIELD_EVIDENCE_REQUIRED');
    expect(rows.find(row=>row.family==='ACCESS_CONTROL')?.boundary).toContain('does not certify');
  });
});
