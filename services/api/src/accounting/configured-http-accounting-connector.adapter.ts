import { Injectable } from '@nestjs/common';
import { AccountingConnectorAdapter, AccountingConnectorDeliveryRequest, AccountingConnectorDeliveryResult } from './accounting-connector.adapter';

@Injectable()
export class ConfiguredHttpAccountingConnectorAdapter implements AccountingConnectorAdapter{
  readonly provider=(process.env.ACCOUNTING_CONNECTOR_PROVIDER??'configured-http').trim();
  private readonly baseUrl=(process.env.ACCOUNTING_CONNECTOR_BASE_URL??'').replace(/\/$/,'');
  private readonly apiKey=process.env.ACCOUNTING_CONNECTOR_API_KEY??'';

  readiness(){return {provider:this.provider,bridgeConfigured:!!this.baseUrl,apiKeyConfigured:!!this.apiKey};}
  private ensureConfigured(){if(!this.baseUrl)throw new Error('Accounting connector bridge is not configured');}
  private headers(input:AccountingConnectorDeliveryRequest){return {
    'Content-Type':input.contentType,
    Accept:'application/json',
    'Idempotency-Key':input.idempotencyKey,
    'X-Aaraagate-Society-Id':input.societyId,
    'X-Aaraagate-Export-Job-Id':input.exportJobId,
    'X-Aaraagate-Contract-Version':input.contractVersion,
    'X-Aaraagate-Export-Format':input.format,
    'X-Aaraagate-Artifact-Filename':input.filename,
    'X-Aaraagate-Artifact-Sha256':input.sha256,
    ...(this.apiKey?{Authorization:`Bearer ${this.apiKey}`}:{})
  };}
  private async json<T>(response:Response):Promise<T>{const text=await response.text();let body:unknown=null;try{body=text?JSON.parse(text):null}catch{throw new Error(`Accounting connector bridge returned invalid JSON (${response.status})`)}if(!response.ok){const message=typeof body==='object'&&body&&'message' in body?String((body as {message?:unknown}).message):`Accounting connector bridge request failed (${response.status})`;throw new Error(message)}return body as T;}

  async deliver(input:AccountingConnectorDeliveryRequest):Promise<AccountingConnectorDeliveryResult>{
    this.ensureConfigured();
    if(!input.content.length)throw new Error('Accounting export artifact is empty');
    if(!/^[a-f0-9]{64}$/i.test(input.sha256))throw new Error('Accounting export artifact digest is invalid');
    const result=await this.json<AccountingConnectorDeliveryResult>(await fetch(`${this.baseUrl}/accounting/exports`,{method:'POST',headers:this.headers(input),body:new Uint8Array(input.content)}));
    if(!['ACCEPTED','DELIVERED','FAILED','UNKNOWN'].includes(result?.status))throw new Error('Accounting connector bridge returned an invalid delivery result');
    return result;
  }
}
