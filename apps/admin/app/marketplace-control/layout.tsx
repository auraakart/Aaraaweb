import Link from 'next/link';
import type { ReactNode } from 'react';
import './marketplace-workspace.css';

export default function MarketplaceControlLayout({ children }: { children: ReactNode }) {
  return <>
    <nav aria-label="External Services workspace" className="marketplace-workspace-nav">
      <Link href="/marketplace-control">Marketplace control</Link>
      <Link href="/marketplace-control/operations">Services operations</Link>
      <Link href="/marketplace-control/commercial">Commercial controls</Link>
      <Link href="/platform/providers">Provider verification</Link>
      <Link href="/platform/provider-trust">Provider trust</Link>
    </nav>
    <div className="marketplace-workspace-shell">{children}</div>
  </>;
}
