import { describe,expect,it,vi } from 'vitest';
import { FinanceOperationsService } from './finance-operations.service';

function serviceWith(rows:Array<Record<string,unknown>>){
  return new FinanceOperationsService(
    {$queryRaw:vi.fn().mockResolvedValue(rows)} as never,
    {unappliedCashSummary:vi.fn()} as never,
  );
}

describe('V4.70 finance smart intake',()=>{
  it('flags an exact vendor invoice duplicate without mutating finance state',async()=>{
    const service=serviceWith([{
      id:'e1',expenseNumber:'EXP-10',vendorName:'LiftCare Pvt Ltd',invoiceReference:'LC-100',
      expenseDate:new Date('2026-09-20T00:00:00.000Z'),amountPaise:125000n,status:'DRAFT',
    }]);
    const result=await service.expenseIntakeAssessment('11111111-1111-4111-8111-111111111111',{
      vendorName:' liftcare pvt ltd ',invoiceReference:'lc-100',expenseDate:'2026-09-20',amountPaise:125000,
    });
    expect(result.status).toBe('DUPLICATE_EXACT');
    expect(result.candidates[0]).toMatchObject({
      classification:'DUPLICATE_EXACT',
      signals:expect.arrayContaining(['SAME_VENDOR','SAME_INVOICE_REFERENCE','SAME_AMOUNT','SAME_EXPENSE_DATE']),
    });
    expect(result.mutationPerformed).toBe(false);
    expect(result.automaticPosting).toBe(false);
  });

  it('prepares reviewed invoice text without persisting it and reuses duplicate assessment',async()=>{
    const service=serviceWith([]);
    const result=await service.documentIntakePreview(
      '11111111-1111-4111-8111-111111111111',
      'Vendor: LiftCare Pvt Ltd\nInvoice No: LC-200\nInvoice Date: 29/09/2026\nGSTIN: 33ABCDE1234F1Z5\nGrand Total: ₹12,500.50',
    );
    expect(result).toEqual(expect.objectContaining({
      quality:'COMPLETE',mutationPerformed:false,automaticPosting:false,humanReviewRequired:true,
      extracted:expect.objectContaining({vendorName:'LiftCare Pvt Ltd',invoiceReference:'LC-200',expenseDate:'2026-09-29',amountPaise:1250050,gstin:'33ABCDE1234F1Z5'}),
      source:expect.objectContaining({rawTextPersisted:false,sha256:expect.stringMatching(/^[0-9a-f]{64}$/)}),
      duplicateAssessment:expect.objectContaining({status:'CLEAR',mutationPerformed:false}),
    }));
  });

  it('keeps incomplete reviewed text non-mutating and does not manufacture missing fields',async()=>{
    const prisma={$queryRaw:vi.fn()};
    const service=new FinanceOperationsService(prisma as never,{unappliedCashSummary:vi.fn()} as never);
    const result=await service.documentIntakePreview(
      '11111111-1111-4111-8111-111111111111',
      'Invoice No: ONLY-REF\nThis reviewed source has no vendor, date or total.',
    );
    expect(result.quality).toBe('LIMITED');
    expect(result.extracted).toMatchObject({vendorName:null,invoiceReference:'ONLY-REF',expenseDate:null,amountPaise:null});
    expect(result.duplicateAssessment).toBeNull();
    expect(result.missingFields).toEqual(expect.arrayContaining(['vendorName','expenseDate','amountPaise']));
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('surfaces a nearby same-vendor amount for review rather than calling it a duplicate',async()=>{
    const service=serviceWith([{
      id:'e2',expenseNumber:'EXP-11',vendorName:'WaterWorks',invoiceReference:'WW-OLD',
      expenseDate:new Date('2026-09-19T00:00:00.000Z'),amountPaise:99000n,status:'POSTED',
    }]);
    const result=await service.expenseIntakeAssessment('11111111-1111-4111-8111-111111111111',{
      vendorName:'WaterWorks',invoiceReference:'WW-NEW',expenseDate:'2026-09-21',amountPaise:99000,
    });
    expect(result.status).toBe('REVIEW_SIMILAR');
    expect(result.candidates[0].classification).toBe('REVIEW_SIMILAR');
    expect(result.boundary).toContain('reviewer');
  });
});
