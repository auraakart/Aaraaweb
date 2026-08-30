import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Aaraagate — Connected Community Living',
  description: 'Security, visitors, community and everyday living for gated communities.',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>
}