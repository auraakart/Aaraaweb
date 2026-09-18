export type AccountingConnectorDeliveryRequest={
  societyId:string;
  exportJobId:string;
  contractVersion:string;
  format:'CSV'|'JSONL';
  filename:string;
  contentType:string;
  sha256:string;
  content:Buffer;
  idempotencyKey:string;
};

export type AccountingConnectorDeliveryResult={
  status:'ACCEPTED'|'DELIVERED'|'FAILED'|'UNKNOWN';
  providerReceiptId?:string;
  failureCode?:string;
  failureMessage?:string;
};

/**
 * Provider-neutral boundary for downstream accounting systems.
 * Aaraagate owns the versioned export contract and immutable artifact; concrete
 * connectors only deliver that artifact and report transport/provider evidence.
 */
export interface AccountingConnectorAdapter{
  readonly provider:string;
  deliver(input:AccountingConnectorDeliveryRequest):Promise<AccountingConnectorDeliveryResult>;
}
