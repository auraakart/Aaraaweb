import type { Metadata } from 'next'
import './globals.css'
import './brand-tokens.css'

export const metadata: Metadata = {
  title: 'Aaraagate Admin',
  description: 'Society operations dashboard for Aaraagate.',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>
}
