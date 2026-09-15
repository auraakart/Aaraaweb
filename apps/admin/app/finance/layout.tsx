import Link from 'next/link';
import type { ReactNode } from 'react';

export default function FinanceLayout({ children }: { children: ReactNode }) {
  return <>
    <nav aria-label="Finance workspace" style={{maxWidth:1240,margin:'18px auto 0',padding:'0 22px',display:'flex',gap:10,flexWrap:'wrap'}}>
      <Link href="/finance" style={tab}>Receivables & accounting</Link>
      <Link href="/finance/operations" style={tab}>Expenses, payables & budgets</Link>
    </nav>
    {children}
  </>;
}

const tab={display:'inline-block',padding:'9px 13px',border:'1px solid #d8dee8',borderRadius:999,textDecoration:'none',fontWeight:700,color:'inherit',background:'#fff'};
