import { describe, expect, it } from 'vitest';
import { IntegrationRegistryService } from './integration-registry.service';

describe('IntegrationRegistryService conformance',()=>{
  it('separates configuration, contract, field evidence and production activation',()=>{
    const service=new IntegrationRegistryService();
    const rows=service.conformance('society-1');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every(row=>row.certificationClaim===false)).toBe(true);

    const access=rows.find(row=>row.family==='ACCESS_CONTROL');
    expect(access).toMatchObject({
      status:'FIELD_EVIDENCE_REQUIRED',
      configurationReady:true,
      contractReady:true,
      fieldEvidenceRequired:true,
      productionActivationApproved:false,
    });
    expect(access?.boundary).toContain('Production activation stays false');

    const objectStorage=rows.find(row=>row.family==='OBJECT_STORAGE');
    if(objectStorage?.status==='CONTRACT_READY'){
      expect(objectStorage.productionActivationApproved).toBe(objectStorage.configurationReady&&objectStorage.contractReady);
    }
  });
});
