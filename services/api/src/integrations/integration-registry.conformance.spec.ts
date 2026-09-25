import { describe, expect, it } from 'vitest';
import { IntegrationRegistryService } from './integration-registry.service';

describe('IntegrationRegistryService conformance',()=>{
  it('separates adapter readiness, society selection, field evidence and production activation',async()=>{
    const configuration={list:async()=>[
      {societyId:'society-1',family:'ACCESS_CONTROL',providerKey:'reference-adapters',enabled:true},
      {societyId:'society-1',family:'OBJECT_STORAGE',providerKey:'s3',enabled:false},
    ]};
    const service=new IntegrationRegistryService(configuration as never);
    const rows=await service.conformance('society-1');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every(row=>row.certificationClaim===false)).toBe(true);

    const access=rows.find(row=>row.family==='ACCESS_CONTROL');
    expect(access).toMatchObject({
      status:'FIELD_EVIDENCE_REQUIRED',
      adapterConfigurationReady:true,
      societySelectionReady:true,
      configurationReady:true,
      contractReady:true,
      fieldEvidenceRequired:true,
      productionActivationApproved:false,
    });
    expect(access?.boundary).toContain('society provider selection');

    const objectStorage=rows.find(row=>row.family==='OBJECT_STORAGE');
    expect(objectStorage).toMatchObject({
      societySelectionReady:false,
      societyEnabled:false,
      configurationReady:false,
      status:'CONFIGURATION_REQUIRED',
    });
    expect(objectStorage?.configurationBlockers).toContain('SOCIETY_SELECTION_DISABLED');
  });

  it('fails society-selectable readiness closed when the selection is missing or names another provider',async()=>{
    const configuration={list:async()=>[
      {societyId:'society-1',family:'SMART_METER',providerKey:'other-meter-provider',enabled:true},
    ]};
    const service=new IntegrationRegistryService(configuration as never);
    const rows=await service.conformance('society-1');

    const access=rows.find(row=>row.family==='ACCESS_CONTROL');
    expect(access).toMatchObject({configurationReady:false,status:'CONFIGURATION_REQUIRED',selectedProviderKey:null});
    expect(access?.configurationBlockers).toContain('SOCIETY_SELECTION_MISSING');

    const meter=rows.find(row=>row.family==='SMART_METER');
    expect(meter).toMatchObject({configurationReady:false,status:'CONFIGURATION_REQUIRED',selectedProviderKey:'other-meter-provider'});
    expect(meter?.configurationBlockers).toContain('SOCIETY_PROVIDER_MISMATCH');

    const ivr=rows.find(row=>row.family==='TELEPHONY_IVR');
    expect(ivr?.selectionRequired).toBe(false);
  });
});
