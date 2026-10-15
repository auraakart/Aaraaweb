export type GatewayPaymentObservation={
  providerPaymentId?:string;
  providerStatus:string;
  amountPaise:number;
};

export type GatewayOperationRequest={
  paymentId:string;
  providerOperationId?:string;
  amountPaise?:number;
  idempotencyKey:string;
};

export type GatewayOperationResult={
  status:'ACCEPTED'|'SETTLED'|'FAILED'|'UNKNOWN';
  providerOperationId?:string;
  failureCode?:string;
  failureMessage?:string;
};

/**
 * Boundary implemented by concrete payment providers outside accounting.
 * Accounting owns expected financial state; adapters only provide gateway evidence/actions.
 */
export interface PaymentGatewayAdapter{
  readonly provider:string;
  queryPayment(paymentId:string):Promise<GatewayPaymentObservation>;
  refund(input:GatewayOperationRequest):Promise<GatewayOperationResult>;
}
