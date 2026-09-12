import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfiguredHttpPaymentGatewayAdapter } from './configured-http-payment-gateway.adapter';

const originalEnv={...process.env};
afterEach(()=>{process.env={...originalEnv};vi.restoreAllMocks();});

describe('ConfiguredHttpPaymentGatewayAdapter',()=>{
  it('queries payment observations from the configured bridge',async()=>{
    process.env.PAYMENT_GATEWAY_RECONCILIATION_BASE_URL='https://gateway.example';
    process.env.PAYMENT_GATEWAY_RECONCILIATION_PROVIDER='test-provider';
    process.env.PAYMENT_GATEWAY_RECONCILIATION_API_KEY='secret';
    const fetchMock=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({providerPaymentId:'pay_1',providerStatus:'CAPTURED',amountPaise:12345}),{status:200,headers:{'Content-Type':'application/json'}}));
    const adapter=new ConfiguredHttpPaymentGatewayAdapter();
    await expect(adapter.queryPayment('internal payment')).resolves.toEqual({providerPaymentId:'pay_1',providerStatus:'CAPTURED',amountPaise:12345});
    expect(fetchMock).toHaveBeenCalledWith('https://gateway.example/payments/internal%20payment',expect.objectContaining({headers:expect.objectContaining({Authorization:'Bearer secret'})}));
  });

  it('sends idempotent refund requests',async()=>{
    process.env.PAYMENT_GATEWAY_RECONCILIATION_BASE_URL='https://gateway.example/';
    const fetchMock=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({status:'ACCEPTED',providerOperationId:'rf_1'}),{status:200,headers:{'Content-Type':'application/json'}}));
    const adapter=new ConfiguredHttpPaymentGatewayAdapter();
    await expect(adapter.refund({paymentId:'pay-1',amountPaise:500,idempotencyKey:'idem-1'})).resolves.toEqual({status:'ACCEPTED',providerOperationId:'rf_1'});
    expect(fetchMock).toHaveBeenCalledWith('https://gateway.example/payments/pay-1/refunds',expect.objectContaining({method:'POST',headers:expect.objectContaining({'Idempotency-Key':'idem-1'}),body:JSON.stringify({amountPaise:500})}));
  });

  it('rejects malformed observations and bridge failures',async()=>{
    process.env.PAYMENT_GATEWAY_RECONCILIATION_BASE_URL='https://gateway.example';
    vi.spyOn(globalThis,'fetch').mockResolvedValueOnce(new Response(JSON.stringify({providerStatus:'CAPTURED',amountPaise:-1}),{status:200,headers:{'Content-Type':'application/json'}}));
    const adapter=new ConfiguredHttpPaymentGatewayAdapter();
    await expect(adapter.queryPayment('pay-1')).rejects.toThrow('invalid payment observation');
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(new Response(JSON.stringify({message:'provider unavailable'}),{status:503,headers:{'Content-Type':'application/json'}}));
    await expect(adapter.queryPayment('pay-1')).rejects.toThrow('provider unavailable');
  });
});
