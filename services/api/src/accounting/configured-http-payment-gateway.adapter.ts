import { Injectable } from '@nestjs/common';
import { GatewayOperationRequest, GatewayOperationResult, GatewayPaymentObservation, PaymentGatewayAdapter } from './payment-gateway.adapter';

@Injectable()
export class ConfiguredHttpPaymentGatewayAdapter implements PaymentGatewayAdapter{
  readonly provider=(process.env.PAYMENT_GATEWAY_RECONCILIATION_PROVIDER??'configured-http').trim();
  readonly environment=(process.env.PAYMENT_GATEWAY_RECONCILIATION_ENVIRONMENT??'sandbox').trim().toLowerCase();
  private readonly baseUrl=this.resolveBaseUrl();
  private readonly apiKey=this.resolveApiKey();

  isConfigured(){return (this.environment==='sandbox'&&!!this.baseUrl)||(this.environment==='live'&&!!this.baseUrl&&!!this.apiKey);}
  private resolveBaseUrl(){const key=this.environment==='live'?'PAYMENT_GATEWAY_RECONCILIATION_LIVE_BASE_URL':'PAYMENT_GATEWAY_RECONCILIATION_SANDBOX_BASE_URL';const explicit=(process.env[key]??'').trim();const legacy=this.environment==='sandbox'?(process.env.PAYMENT_GATEWAY_RECONCILIATION_BASE_URL??'').trim():'';return (explicit||legacy).replace(/\/$/,'');}
  private resolveApiKey(){const key=this.environment==='live'?'PAYMENT_GATEWAY_RECONCILIATION_LIVE_API_KEY':'PAYMENT_GATEWAY_RECONCILIATION_SANDBOX_API_KEY';const explicit=(process.env[key]??'').trim();const legacy=this.environment==='sandbox'?(process.env.PAYMENT_GATEWAY_RECONCILIATION_API_KEY??'').trim():'';return explicit||legacy;}
  private ensureConfigured(){if(!['sandbox','live'].includes(this.environment))throw new Error('Payment gateway reconciliation environment must be sandbox or live');if(!this.baseUrl)throw new Error(`Payment gateway reconciliation ${this.environment} bridge is not configured`);if(this.environment==='live'&&!this.apiKey)throw new Error('Live payment gateway reconciliation API key is not configured');}
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
