import type { Metadata } from 'next'
import './globals.css'
import './brand-tokens.css'
import './admin-navigation.css'
import './admin-shell.css'
import './property-workspace.css'

export const metadata: Metadata = {
  title: 'Aaraagate Admin',
  description: 'Society operations dashboard for Aaraagate.',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>
}
