import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root=path.resolve(process.cwd());
const read=(relative:string)=>fs.readFileSync(path.join(root,relative),'utf8');

describe('V4.16 integration readiness boundaries',()=>{
  it('keeps payment providers behind the accounting gateway port',()=>{
    const source=read('src/accounting/payment-gateway.adapter.ts');
    expect(source).toContain('export interface PaymentGatewayAdapter');
    expect(source).toContain('queryPayment');
    expect(source).toContain('refund');
  });

  it('keeps WhatsApp behind a provider contract rather than domain coupling',()=>{
    const source=read('src/notifications/whatsapp.provider.ts');
    expect(source).toContain('export interface WhatsAppProvider');
    expect(source).toContain('sendTemplate');
  });

  it('keeps smart-gate hardware vendor-neutral with a simulator contract',()=>{
    const port=read('src/access-integration/access-device.adapter.ts');
    const simulator=read('src/access-integration/simulator-access-device.adapter.ts');
    expect(port).toContain('export interface AccessDeviceAdapter');
    expect(port).toContain("'CONTROL_BARRIER'");
    expect(simulator).toContain('implements AccessDeviceAdapter');
  });

  it('keeps object storage behind a fail-closed port',()=>{
    const port=read('src/services-marketplace/object-storage.port.ts');
    const adapter=read('src/services-marketplace/s3-compatible-object-storage.adapter.ts');
    expect(port).toContain('export interface ObjectStoragePort');
    expect(adapter).toContain('createObjectStorageAdapterFromEnv');
    expect(adapter).toMatch(/Unconfigured|unconfigured/i);
  });
});
