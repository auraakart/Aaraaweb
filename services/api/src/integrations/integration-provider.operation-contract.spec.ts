import { describe,expect,it } from 'vitest';
import { integrationOperationContracts,INTEGRATION_OPERATION_CONTRACT_VERSION } from './integration-provider.contract';
import { IntegrationRegistryService,type IntegrationFamily } from './integration-registry.service';

const families:IntegrationFamily[]=['OTP','WHATSAPP','PUSH','TELEPHONY_IVR','PAYMENT_GATEWAY','ACCESS_CONTROL','OBJECT_STORAGE','SMART_METER','ACCOUNTING_CONNECTOR'];

describe('V4.79.4 operation-level integration contracts',()=>{
  it('gives every registered provider family a versioned, bounded operation contract',()=>{
    for(const family of families){
      const operations=integrationOperationContracts(family);
      expect(operations.length).toBeGreaterThan(0);
      expect(new Set(operations.map(operation=>operation.operationId)).size).toBe(operations.length);
      expect(operations.every(operation=>operation.contractVersion===INTEGRATION_OPERATION_CONTRACT_VERSION)).toBe(true);
      expect(operations.every(operation=>operation.timeoutMs>=1000&&operation.timeoutMs<=120000)).toBe(true);
      expect(operations.every(operation=>operation.providerAuthority==='NONE'||operation.providerAuthority==='QUARANTINED_INPUT')).toBe(true);
    }
  });

  it('keeps payment/refund provider evidence non-authoritative and reconciliation-bound',()=>{
    const payment=integrationOperationContracts('PAYMENT_GATEWAY');
    const query=payment.find(operation=>operation.operationId==='QUERY_PAYMENT');
    const refund=payment.find(operation=>operation.operationId==='REQUEST_REFUND');
    for(const operation of [query,refund]){
      expect(operation).toMatchObject({
        idempotency:'REQUIRED',
        reconciliationRequired:true,
        callbackVerification:'SIGNED_REQUIRED',
        providerAuthority:'NONE',
        fieldEvidenceRequired:true,
      });
    }
  });

  it('keeps access commands idempotent with manual degradation and field evidence',()=>{
    const barrier=integrationOperationContracts('ACCESS_CONTROL').find(operation=>operation.operationId==='CONTROL_BARRIER');
    expect(barrier).toMatchObject({
      direction:'AARAAGATE_TO_PROVIDER',
      idempotency:'REQUIRED',
      providerAuthority:'NONE',
      fieldEvidenceRequired:true,
    });
    expect(barrier?.degradationMode).toContain('manual fallback');
  });

  it('includes operation contract completeness in conformance readiness',async()=>{
    const service=new IntegrationRegistryService({list:async()=>[]} as never);
    const rows=await service.conformance('society-1');
    expect(rows.every(row=>row.checks.operationContractsPresent)).toBe(true);
    expect(rows.every(row=>row.checks.operationContractsUnique)).toBe(true);
    expect(rows.every(row=>row.checks.boundedOperationTimeouts)).toBe(true);
    expect(rows.every(row=>row.checks.providerNeverAuthoritative)).toBe(true);
  });
});
