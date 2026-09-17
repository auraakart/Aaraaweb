import Link from 'next/link';
import type { ReactNode } from 'react';
import './operations-control.css';

export default function OperationsControlLayout({ children }: { children: ReactNode }) {
  return <>
    <nav aria-label="Operations and control workspace" className="ops-control-nav">
      <Link href="/emergency-operations">Emergency control</Link>
      <Link href="/privacy-operations">Privacy operations</Link>
      <Link href="/audit">Audit</Link>
      <Link href="/platform">Platform administration</Link>
    </nav>
    {children}
  </>;
}
