import Link from 'next/link'
import type { ReactNode } from 'react'
import './facilities-workspace.css'

const links = [
  { href: '/facilities', label: 'Assets & work orders' },
  { href: '/facilities/operations', label: 'Housekeeping & staff' },
  { href: '/facilities/health', label: 'Health' },
  { href: '/facilities/preventive', label: 'Preventive maintenance' },
  { href: '/facilities/alerts', label: 'Alerts' },
  { href: '/facilities/contracts', label: 'AMC & contracts' },
  { href: '/facilities/inventory', label: 'Inventory & spares' },
]

export default function FacilitiesLayout({ children }: { children: ReactNode }) {
  return <div className="facilities-workspace">
    <nav className="facilities-workspace__nav" aria-label="Facilities workspace">
      <div className="facilities-workspace__nav-title">
        <span>Facilities</span>
        <small>Assets, maintenance, risk and contracts</small>
      </div>
      <div className="facilities-workspace__links">
        {links.map(link => <Link key={link.href} href={link.href}>{link.label}</Link>)}
      </div>
    </nav>
    {children}
  </div>
}
