import { describe, expect, it } from 'vitest';
import { residentAnswer } from './ai-resident-answer';

describe('V4.89.4 resident Assistant answer composition',()=>{
  it.each([null,undefined,'', ' ',false,true,[],{},-1,1.5,Infinity,NaN,Number.MAX_SAFE_INTEGER+1,'9007199254740992','1e3','0x10'].map(amountPaise=>({amountPaise})))('does not turn malformed money into a claimed invoice amount: $amountPaise',({amountPaise})=>{
    const answer=residentAnswer('maintenance due',{invoices:[{invoiceNumber:'INV',amountPaise,status:'ISSUED'}]},true);
    expect(answer).toContain('amount unavailable');
    expect(answer).not.toContain('₹');
  });
  it.each([0,'0',125000,'125000'])('preserves exact whole-paise amounts including legitimate zero: %j',amountPaise=>{
    const answer=residentAnswer('payment history',{payments:[{amountPaise,status:'CREATED'}]},true);
    expect(answer).toContain(Number(amountPaise)===0?'₹0.00':'₹1,250.00');
    expect(answer).toContain('does not prove settlement');
  });
  it('preserves paise at the safe-integer boundary without division rounding',()=>{
    expect(residentAnswer('payment history',{payments:[{amountPaise:Number.MAX_SAFE_INTEGER,status:'CREATED'}]},true)).toContain('₹9,00,71,99,25,47,409.91');
  });
  it('labels invoice face amount, not an unverified outstanding net balance',()=>{
    const answer=residentAnswer('maintenance payment due',{
      invoices:[{invoiceNumber:'INV-200',amountPaise:125000,status:'ISSUED'}],
    },true);
    expect(answer).toContain('INV-200');
    expect(answer).toContain('₹1,250.00');
    expect(answer).toContain('not a verified net outstanding balance');
  });

  it('shows only caller-supplied payment transactions, never a claimed settlement',()=>{
    const answer=residentAnswer('show my payment history',{
      payments:[{amountPaise:9900,status:'CREATED'}],
    },true);
    expect(answer).toContain('₹99.00');
    expect(answer).toContain('CREATED');
    expect(answer).toContain('does not prove settlement');
  });

  it('keeps restricted finance hidden when family role asks for dues',()=>{
    expect(residentAnswer('show maintenance due',{tickets:[{title:'Leak',status:'OPEN'}]},false))
      .toContain('not permitted');
    expect(residentAnswer('show my complaints',{tickets:[{title:'Leak',status:'OPEN'}]},false))
      .toContain('Leak (OPEN)');
  });

  it('does not fabricate missing invoices or bookings',()=>{
    expect(residentAnswer('my maintenance dues',{},true)).toContain('No eligible maintenance invoices');
    expect(residentAnswer('my booking status',{},true)).toContain('0 amenity booking(s)');
  });
});
