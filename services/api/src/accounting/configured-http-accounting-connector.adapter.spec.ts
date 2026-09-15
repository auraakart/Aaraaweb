import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfiguredHttpAccountingConnectorAdapter } from './configured-http-accounting-connector.adapter';

const input={societyId:'11111111-1111-1111-1111-111111111111',exportJobId:'22222222-2222-2222-2222-222222222222',contractVersion:'aaraagate.accounting.journal.v1',format:'CSV' as const,filename:'journal.csv',contentType:'text/csv; charset=utf-8',sha256:'a'.repeat(64),content:Buffer.from('a,b\n1,2\n'),idempotencyKey:'delivery-1'};

describe('ConfiguredHttpAccountingConnectorAdapter',()=>{
  afterEach(()=>{vi.unstubAllGlobals();delete process.env.ACCOUNTING_CONNECTOR_BASE_URL;delete process.env.ACCOUNTING_CONNECTOR_API_KEY;delete process.env.ACCOUNTING_CONNECTOR_PROVIDER;});

  it('delivers the immutable artifact through the provider-neutral bridge contract',async()=>{
    process.env.ACCOUNTING_CONNECTOR_BASE_URL='https://bridge.example.test/';
    process.env.ACCOUNTING_CONNECTOR_API_KEY='secret';
    process.env.ACCOUNTING_CONNECTOR_PROVIDER='bridge-a';
    const fetchMock=vi.fn().mockResolvedValue(new Response(JSON.stringify({status:'DELIVERED',providerReceiptId:'receipt-1'}),{status:200,headers:{'Content-Type':'application/json'}}));
    vi.stubGlobal('fetch',fetchMock);
    const adapter=new ConfiguredHttpAccountingConnectorAdapter();
    await expect(adapter.deliver(input)).resolves.toEqual({status:'DELIVERED',providerReceiptId:'receipt-1'});
    expect(adapter.provider).toBe('bridge-a');
    const [url,init]=fetchMock.mock.calls[0] as [string,RequestInit];
    expect(url).toBe('https://bridge.example.test/accounting/exports');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({'Idempotency-Key':'delivery-1','X-Aaraagate-Society-Id':input.societyId,'X-Aaraagate-Export-Job-Id':input.exportJobId,'X-Aaraagate-Contract-Version':input.contractVersion,'X-Aaraagate-Artifact-Sha256':input.sha256,Authorization:'Bearer secret'});
    expect(Buffer.from(init.body as Uint8Array).equals(input.content)).toBe(true);
  });

  it('rejects an invalid provider status',async()=>{
    process.env.ACCOUNTING_CONNECTOR_BASE_URL='https://bridge.example.test';
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({status:'MAYBE'}),{status:200})));
    await expect(new ConfiguredHttpAccountingConnectorAdapter().deliver(input)).rejects.toThrow('invalid delivery result');
  });

  it('fails closed when the bridge is not configured',async()=>{
    await expect(new ConfiguredHttpAccountingConnectorAdapter().deliver(input)).rejects.toThrow('not configured');
  });
});
