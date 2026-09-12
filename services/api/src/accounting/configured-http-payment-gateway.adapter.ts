import { Injectable } from '@nestjs/common';
import { GatewayOperationRequest, GatewayOperationResult, GatewayPaymentObservation, PaymentGatewayAdapter } from './payment-gateway.adapter';

@Injectable()
export class ConfiguredHttpPaymentGatewayAdapter implements PaymentGatewayAdapter{
  readonly provider=(process.env.PAYMENT_GATEWAY_RECONCILIATION_PROVIDER??'configured-http').trim();
  private readonly baseUrl=(process.env.PAYMENT_GATEWAY_RECONCILIATION_BASE_URL??'').replace(/\/$/,'');
  private readonly apiKey=process.env.PAYMENT_GATEWAY_RECONCILIATION_API_KEY??'';

  private ensureConfigured(){if(!this.baseUrl)throw new Error('Payment gateway reconciliation bridge is not configured');}
  private headers(idempotencyKey?:string){return {'Content-Type':'application/json',Accept:'application/json',...(this.apiKey?{Authorization:`Bearer ${this.apiKey}`}:{ }),...(idempotencyKey?{'Idempotency-Key':idempotencyKey}:{})};}
  private async json<T>(response:Response):Promise<T>{const text=await response.text();const body=text?JSON.parse(text):null;if(!response.ok)throw new Error(body?.message??`Gateway bridge request failed (${response.status})`);return body as T;}

  async queryPayment(paymentId:string):Promise<GatewayPaymentObservation>{
    this.ensureConfigured();
    const body=await this.json<{providerPaymentId?:string;providerStatus:string;amountPaise:number}>(await fetch(`${this.baseUrl}/payments/${encodeURIComponent(paymentId)}`,{headers:this.headers()}));
    if(!body?.providerStatus||!Number.isInteger(body.amountPaise)||body.amountPaise<0)throw new Error('Gateway bridge returned an invalid payment observation');
    return body;
  }

  async refund(input:GatewayOperationRequest):Promise<GatewayOperationResult>{
    this.ensureConfigured();
    if(!input.amountPaise||input.amountPaise<=0)throw new Error('Refund amount must be positive');
    const body=await this.json<GatewayOperationResult>(await fetch(`${this.baseUrl}/payments/${encodeURIComponent(input.paymentId)}/refunds`,{method:'POST',headers:this.headers(input.idempotencyKey),body:JSON.stringify({amountPaise:input.amountPaise,providerOperationId:input.providerOperationId})}));
    if(!['ACCEPTED','SETTLED','FAILED','UNKNOWN'].includes(body?.status))throw new Error('Gateway bridge returned an invalid operation result');
    return body;
  }
}
