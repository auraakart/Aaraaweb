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
