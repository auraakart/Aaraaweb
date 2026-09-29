import { describe,expect,it,vi } from 'vitest';
import { IntegrationRegistryService } from './integration-registry.service';

describe('V4.70 integration activation plan',()=>{
  it('converts conformance evidence into actionable blockers without certification claims',async()=>{
    const service=new IntegrationRegistryService();
    vi.spyOn(service,'conformance').mockResolvedValue([
      {family:'PUSH',provider:'firebase',health:'UNCONFIGURED',checks:{},missing:[],configurationBlockers:['ADAPTER_CONFIGURATION_NOT_READY'],status:'CONFIGURATION_REQUIRED',certificationClaim:false,adapterConfigurationReady:false,selectionRequired:true,societySelectionReady:false,selectedProviderKey:null,societyEnabled:null,configurationReady:false,contractReady:true,fieldEvidenceRequired:false,productionActivationApproved:false,boundary:'x'},
      {family:'ACCESS_CONTROL',provider:'reference-adapters',health:'READY',checks:{},missing:[],configurationBlockers:[],status:'FIELD_EVIDENCE_REQUIRED',certificationClaim:false,adapterConfigurationReady:true,selectionRequired:true,societySelectionReady:true,selectedProviderKey:'reference-adapters',societyEnabled:true,configurationReady:true,contractReady:true,fieldEvidenceRequired:true,productionActivationApproved:false,boundary:'x'},
      {family:'OBJECT_STORAGE',provider:'s3',health:'READY',checks:{},missing:[],configurationBlockers:[],status:'CONTRACT_READY',certificationClaim:false,adapterConfigurationReady:true,selectionRequired:true,societySelectionReady:true,selectedProviderKey:'s3',societyEnabled:true,configurationReady:true,contractReady:true,fieldEvidenceRequired:false,productionActivationApproved:true,boundary:'x'},
    ] as never);
    const plan=await service.activationPlan('society-1');
    expect(plan.status).toBe('CONFIGURATION_REQUIRED');
    expect(plan.summary).toMatchObject({total:3,activationReady:1,configurationRequired:1,fieldEvidenceRequired:1});
    expect(plan.items.find(item=>item.family==='PUSH')?.nextActions.join(' ')).toContain('deployment adapter configuration');
    expect(plan.items.find(item=>item.family==='ACCESS_CONTROL')?.nextActions.join(' ')).toContain('field-acceptance evidence');
    expect(plan.certificationClaim).toBe(false);
    expect(plan.mutationPerformed).toBe(false);
  });
});
