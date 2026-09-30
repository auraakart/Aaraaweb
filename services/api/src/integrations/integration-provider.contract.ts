export const INTEGRATION_CONTRACT_VERSION = 'aaraagate.integration.v1' as const;

export type IntegrationRetryDisposition = 'IDEMPOTENT_RETRY' | 'DURABLE_BACKOFF' | 'MANUAL_FALLBACK' | 'NO_AUTOMATIC_RETRY';
export type IntegrationRetryOwner = 'AARAAGATE' | 'PROVIDER' | 'OPERATOR';

export type IntegrationContractMetadata = {
  contractVersion: typeof INTEGRATION_CONTRACT_VERSION;
  retryDisposition: IntegrationRetryDisposition;
  retryOwner: IntegrationRetryOwner;
  degradationMode: string;
};

export function integrationContractMetadata(family: string): IntegrationContractMetadata {
  switch (family) {
    case 'PAYMENT_GATEWAY':
      return { contractVersion: INTEGRATION_CONTRACT_VERSION, retryDisposition: 'IDEMPOTENT_RETRY', retryOwner: 'AARAAGATE', degradationMode: 'Preserve accounting truth and move unresolved provider state to reconciliation.' };
    case 'WHATSAPP':
      return { contractVersion: INTEGRATION_CONTRACT_VERSION, retryDisposition: 'NO_AUTOMATIC_RETRY', retryOwner: 'OPERATOR', degradationMode: 'Fail the optional WhatsApp handoff without bypassing authentication or notification policy.' };
    case 'PUSH':
      return { contractVersion: INTEGRATION_CONTRACT_VERSION, retryDisposition: 'DURABLE_BACKOFF', retryOwner: 'AARAAGATE', degradationMode: 'Keep in-app state authoritative and retry durable notification handoff.' };
    case 'TELEPHONY_IVR':
      return { contractVersion: INTEGRATION_CONTRACT_VERSION, retryDisposition: 'MANUAL_FALLBACK', retryOwner: 'OPERATOR', degradationMode: 'Keep the in-app gate request authoritative and require manual guard follow-up when telephony is unavailable.' };
    case 'ACCESS_CONTROL':
      return { contractVersion: INTEGRATION_CONTRACT_VERSION, retryDisposition: 'MANUAL_FALLBACK', retryOwner: 'OPERATOR', degradationMode: 'Keep authorization server-side and fall back to manual gate operation.' };
    case 'SMART_METER':
      return { contractVersion: INTEGRATION_CONTRACT_VERSION, retryDisposition: 'IDEMPOTENT_RETRY', retryOwner: 'PROVIDER', degradationMode: 'Quarantine invalid or unmapped readings without changing existing meter history.' };
    case 'ACCOUNTING_CONNECTOR':
      return { contractVersion: INTEGRATION_CONTRACT_VERSION, retryDisposition: 'DURABLE_BACKOFF', retryOwner: 'AARAAGATE', degradationMode: 'Retain immutable export artifacts and retry delivery without rewriting journals.' };
    case 'OTP':
      return { contractVersion: INTEGRATION_CONTRACT_VERSION, retryDisposition: 'NO_AUTOMATIC_RETRY', retryOwner: 'OPERATOR', degradationMode: 'Fail delivery safely; authentication is never bypassed when the provider is unavailable.' };
    case 'OBJECT_STORAGE':
      return { contractVersion: INTEGRATION_CONTRACT_VERSION, retryDisposition: 'NO_AUTOMATIC_RETRY', retryOwner: 'OPERATOR', degradationMode: 'Fail upload/download intent creation closed rather than accepting insecure direct storage.' };
    default:
      return { contractVersion: INTEGRATION_CONTRACT_VERSION, retryDisposition: 'NO_AUTOMATIC_RETRY', retryOwner: 'OPERATOR', degradationMode: 'Fail closed without bypassing domain authorization or state integrity.' };
  }
}


export const INTEGRATION_OPERATION_CONTRACT_VERSION='aaraagate.integration.operation.v1' as const;

export type IntegrationOperationDirection='AARAAGATE_TO_PROVIDER'|'PROVIDER_TO_AARAAGATE'|'BIDIRECTIONAL';
export type IntegrationOperationIdempotency='REQUIRED'|'RECOMMENDED'|'NOT_APPLICABLE';
export type IntegrationCallbackVerification='SIGNED_REQUIRED'|'PROVIDER_RECEIPT'|'NOT_APPLICABLE';
export type IntegrationProviderAuthority='NONE'|'QUARANTINED_INPUT';

export type IntegrationOperationContract={
  operationId:string;
  contractVersion:typeof INTEGRATION_OPERATION_CONTRACT_VERSION;
  direction:IntegrationOperationDirection;
  idempotency:IntegrationOperationIdempotency;
  timeoutMs:number;
  reconciliationRequired:boolean;
  callbackVerification:IntegrationCallbackVerification;
  providerAuthority:IntegrationProviderAuthority;
  fieldEvidenceRequired:boolean;
  degradationMode:string;
};

const op=(operationId:string,input:Omit<IntegrationOperationContract,'operationId'|'contractVersion'>):IntegrationOperationContract=>({
  operationId,
  contractVersion:INTEGRATION_OPERATION_CONTRACT_VERSION,
  ...input,
});

export function integrationOperationContracts(family:string):readonly IntegrationOperationContract[]{
  switch(family){
    case 'OTP':
      return [op('SEND_OTP',{direction:'AARAAGATE_TO_PROVIDER',idempotency:'RECOMMENDED',timeoutMs:10000,reconciliationRequired:false,callbackVerification:'PROVIDER_RECEIPT',providerAuthority:'NONE',fieldEvidenceRequired:false,degradationMode:'Fail authentication delivery closed; never bypass OTP verification.'})];
    case 'WHATSAPP':
      return [op('SEND_TEMPLATE',{direction:'AARAAGATE_TO_PROVIDER',idempotency:'RECOMMENDED',timeoutMs:15000,reconciliationRequired:false,callbackVerification:'PROVIDER_RECEIPT',providerAuthority:'NONE',fieldEvidenceRequired:false,degradationMode:'Keep the authenticated in-app workflow authoritative when optional template delivery fails.'})];
    case 'PUSH':
      return [op('SEND_PUSH',{direction:'AARAAGATE_TO_PROVIDER',idempotency:'REQUIRED',timeoutMs:10000,reconciliationRequired:false,callbackVerification:'PROVIDER_RECEIPT',providerAuthority:'NONE',fieldEvidenceRequired:false,degradationMode:'Retain durable notification state and retry without changing domain state.'})];
    case 'TELEPHONY_IVR':
      return [op('START_GATE_FALLBACK',{direction:'BIDIRECTIONAL',idempotency:'REQUIRED',timeoutMs:30000,reconciliationRequired:false,callbackVerification:'SIGNED_REQUIRED',providerAuthority:'NONE',fieldEvidenceRequired:true,degradationMode:'Require manual guard follow-up when telephony cannot complete.'})];
    case 'PAYMENT_GATEWAY':
      return [
        op('QUERY_PAYMENT',{direction:'BIDIRECTIONAL',idempotency:'REQUIRED',timeoutMs:15000,reconciliationRequired:true,callbackVerification:'SIGNED_REQUIRED',providerAuthority:'NONE',fieldEvidenceRequired:true,degradationMode:'Move unresolved gateway evidence to reconciliation without rewriting accounting truth.'}),
        op('REQUEST_REFUND',{direction:'BIDIRECTIONAL',idempotency:'REQUIRED',timeoutMs:30000,reconciliationRequired:true,callbackVerification:'SIGNED_REQUIRED',providerAuthority:'NONE',fieldEvidenceRequired:true,degradationMode:'Keep refund state pending until provider evidence reconciles with Aaraagate payment truth.'}),
      ];
    case 'ACCESS_CONTROL':
      return [
        op('HEALTH_CHECK',{direction:'BIDIRECTIONAL',idempotency:'NOT_APPLICABLE',timeoutMs:5000,reconciliationRequired:false,callbackVerification:'NOT_APPLICABLE',providerAuthority:'NONE',fieldEvidenceRequired:true,degradationMode:'Surface degraded device health while manual gate operation remains available.'}),
        op('CONTROL_BARRIER',{direction:'AARAAGATE_TO_PROVIDER',idempotency:'REQUIRED',timeoutMs:5000,reconciliationRequired:false,callbackVerification:'PROVIDER_RECEIPT',providerAuthority:'NONE',fieldEvidenceRequired:true,degradationMode:'Keep server authorization authoritative and require manual fallback on command failure.'}),
      ];
    case 'OBJECT_STORAGE':
      return [
        op('CREATE_SIGNED_UPLOAD',{direction:'AARAAGATE_TO_PROVIDER',idempotency:'RECOMMENDED',timeoutMs:10000,reconciliationRequired:false,callbackVerification:'NOT_APPLICABLE',providerAuthority:'NONE',fieldEvidenceRequired:false,degradationMode:'Fail closed rather than accepting an insecure direct upload.'}),
        op('CREATE_SIGNED_DOWNLOAD',{direction:'AARAAGATE_TO_PROVIDER',idempotency:'NOT_APPLICABLE',timeoutMs:10000,reconciliationRequired:false,callbackVerification:'NOT_APPLICABLE',providerAuthority:'NONE',fieldEvidenceRequired:false,degradationMode:'Fail closed rather than bypassing object authorization.'}),
      ];
    case 'SMART_METER':
      return [op('INGEST_READING',{direction:'PROVIDER_TO_AARAAGATE',idempotency:'REQUIRED',timeoutMs:15000,reconciliationRequired:true,callbackVerification:'SIGNED_REQUIRED',providerAuthority:'QUARANTINED_INPUT',fieldEvidenceRequired:true,degradationMode:'Quarantine invalid or unmapped readings before they can influence billing history.'})];
    case 'ACCOUNTING_CONNECTOR':
      return [op('DELIVER_EXPORT',{direction:'AARAAGATE_TO_PROVIDER',idempotency:'REQUIRED',timeoutMs:30000,reconciliationRequired:true,callbackVerification:'PROVIDER_RECEIPT',providerAuthority:'NONE',fieldEvidenceRequired:false,degradationMode:'Retain immutable export evidence and retry delivery without rewriting journals.'})];
    default:
      return [];
  }
}
