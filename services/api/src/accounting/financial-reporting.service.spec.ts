import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { FinancialReportingController } from './financial-reporting.controller';
import { FinancialReportingService } from './financial-reporting.service';

describe('V3.2 financial reporting invariants', () => {
  it('keeps the balance sheet equation balanced when current result is included', async () => {
    const prisma = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([
          { accountId: 'asset', code: '1000', name: 'Bank', type: 'ASSET', amountPaise: '15000' },
          { accountId: 'liability', code: '2000', name: 'Payable', type: 'LIABILITY', amountPaise: '5000' },
          { accountId: 'equity', code: '3000', name: 'Corpus', type: 'EQUITY', amountPaise: '7000' },
        ])
        .mockResolvedValueOnce([{ income: 5000n, expense: 2000n }]),
    };
    const service = new FinancialReportingService(prisma as never);

    const result = await service.balanceSheet('society-a', '2026-09-17');

    expect(result.assetTotalPaise).toBe('15000');
    expect(result.liabilityTotalPaise).toBe('5000');
    expect(result.equityTotalPaise).toBe('7000');
    expect(result.currentResultPaise).toBe('3000');
    expect(result.balanceCheckPaise).toBe('0');
  });

  it('rejects invalid report dates and reversed date ranges before querying data', () => {
    const reports = {
      trialBalance: vi.fn(), incomeExpense: vi.fn(), balanceSheet: vi.fn(), defaulters: vi.fn(), fundStatement: vi.fn(),
    };
    const controller = new FinancialReportingController(reports as never);

    expect(() => controller.trialBalance('society-a', '17-09-2026')).toThrow(BadRequestException);
    expect(() => controller.incomeExpense('society-a', '2026-09-18', '2026-09-17')).toThrow(BadRequestException);
    expect(reports.trialBalance).not.toHaveBeenCalled();
    expect(reports.incomeExpense).not.toHaveBeenCalled();
  });
});
