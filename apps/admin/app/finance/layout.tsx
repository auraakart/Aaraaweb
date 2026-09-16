import Link from 'next/link';
import type { ReactNode } from 'react';
import '../finance-workspace.css';

export default function FinanceLayout({ children }: { children: ReactNode }) {
  return <div className="finance-workspace">
    <nav aria-label="Finance workspace" className="finance-workspace-nav">
      <Link href="/finance">Receivables & accounting</Link>
      <Link href="/finance/operations">Expenses, payables & budgets</Link>
      <Link href="/finance/reconciliation">Reconciliation</Link>
      <Link href="/finance/payment-exceptions">Payment exceptions</Link>
      <Link href="/finance/exports">Accounting exports</Link>
    </nav>
    {children}
  </div>;
}
