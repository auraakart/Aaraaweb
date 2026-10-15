import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
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

  it('passes the pilot bridge contract over a real HTTP boundary with stable idempotency',async()=>{
    const content=Buffer.from('entryNumber,debitPaise,creditPaise\nJE-1,1000,0\n');
    const sha256=createHash('sha256').update(content).digest('hex');
    const pilotInput={...input,content,sha256,idempotencyKey:'pilot-delivery-1'};
    const receipts=new Map<string,string>();
    const received:Array<{method:string|undefined;url:string|undefined;authorization:string|undefined;idempotencyKey:string|undefined;sha256:string|undefined;body:Buffer}>=[];
    const server=createServer((request,response)=>{
      const chunks:Buffer[]=[];
      request.on('data',chunk=>chunks.push(Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk)));
      request.on('end',()=>{
        const body=Buffer.concat(chunks);
        const idempotencyKey=request.headers['idempotency-key'];
        const declaredSha=request.headers['x-aaraagate-artifact-sha256'];
        const actualSha=createHash('sha256').update(body).digest('hex');
        received.push({method:request.method,url:request.url,authorization:request.headers.authorization,idempotencyKey:typeof idempotencyKey==='string'?idempotencyKey:undefined,sha256:typeof declaredSha==='string'?declaredSha:undefined,body});
        if(request.method!=='POST'||request.url!=='/accounting/exports'||typeof idempotencyKey!=='string'||declaredSha!==actualSha){response.writeHead(422,{'Content-Type':'application/json'});response.end(JSON.stringify({message:'bridge contract violation'}));return;}
        const receipt=receipts.get(idempotencyKey)??`pilot-receipt-${receipts.size+1}`;
        receipts.set(idempotencyKey,receipt);
        response.writeHead(200,{'Content-Type':'application/json'});
        response.end(JSON.stringify({status:'DELIVERED',providerReceiptId:receipt}));
      });
    });
    await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
    try{
      const address=server.address();
      if(!address||typeof address==='string')throw new Error('Pilot bridge did not bind to a TCP port');
      process.env.ACCOUNTING_CONNECTOR_BASE_URL=`http://127.0.0.1:${address.port}`;
      process.env.ACCOUNTING_CONNECTOR_API_KEY='pilot-secret';
      process.env.ACCOUNTING_CONNECTOR_PROVIDER='pilot-local';
      const adapter=new ConfiguredHttpAccountingConnectorAdapter();
      const first=await adapter.deliver(pilotInput);
      const duplicate=await adapter.deliver(pilotInput);
      expect(first).toEqual({status:'DELIVERED',providerReceiptId:'pilot-receipt-1'});
      expect(duplicate).toEqual(first);
      expect(receipts.size).toBe(1);
      expect(received).toHaveLength(2);
      for(const request of received){
        expect(request).toMatchObject({method:'POST',url:'/accounting/exports',authorization:'Bearer pilot-secret',idempotencyKey:pilotInput.idempotencyKey,sha256});
        expect(request.body.equals(content)).toBe(true);
      }
    }finally{
      await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
    }
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
