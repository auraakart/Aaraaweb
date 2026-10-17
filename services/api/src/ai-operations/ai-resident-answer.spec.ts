import { describe, expect, it } from 'vitest';
import { residentAnswer } from './ai-resident-answer';

describe('V4.89.4 resident Assistant answer composition',()=>{
  // Synthetic English questions exercise the real composer. This corpus is a
  // regression benchmark, not an independently reviewed language-quality score.
  it.each([
    ['show my bills', 'INV-1'],
    ['open billing', 'INV-1'],
    ['show payments', 'INV-1'],
    ['maintenance payment due', 'INV-1'],
    ['show my receipts', '₹99.00'],
    ['what was my last paid transaction', '₹99.00'],
    ['show my payment history', '₹99.00'],
    ['show my helpdesk', 'Water leak (OPEN)'],
    ['show my booking status', '1 amenity booking(s)'],
  ])('grounds representative question "%s" in the intended records', (question, expected) => {
    const answer=residentAnswer(question,{
      invoices:[{invoiceNumber:'INV-1',amountPaise:125000,status:'ISSUED'}],
      payments:[{amountPaise:9900,status:'CREATED'}],
      tickets:[{title:'Water leak',status:'OPEN'}],
      amenityBookings:[{status:'CONFIRMED'}],
    },true);
    expect(answer).toContain(expected);
    if(expected==='INV-1')expect(answer).toContain('not a verified net outstanding balance');
    if(expected==='₹99.00')expect(answer).toContain('does not prove settlement');
  });
  it.each(['show my bills','open billing','show payments','show my receipts','what was my last paid transaction'])('keeps finance restricted for "%s"', question => {
    const answer=residentAnswer(question,{
      invoices:[{invoiceNumber:'PRIVATE-INVOICE',amountPaise:125000,status:'ISSUED'}],
      payments:[{amountPaise:9900,status:'COMPLETED'}],
    },false);
    expect(answer).toMatch(/not permitted|cannot view/);
    expect(answer).not.toContain('PRIVATE-INVOICE');
    expect(answer).not.toContain('₹');
  });
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
