import { NextRequest, NextResponse } from 'next/server'
import { hostWebEnabled, hostResponseHeaders, resolveWebHost } from './lib/partner-host-policy'

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname
  if (!hostWebEnabled(process.env)) {
    return path.startsWith('/partner-host') ? new NextResponse('Unavailable', { status: 404, headers: hostResponseHeaders }) : NextResponse.next()
  }
  try {
    const host = resolveWebHost(request.headers, request.method, process.env)
    if (host.kind === 'PLATFORM') return path.startsWith('/partner-host') ? new NextResponse('Unavailable', { status: 404, headers: hostResponseHeaders }) : NextResponse.next()
    // Partner origins never serve society-admin or platform-portal pages.
    if (path !== '/' && !path.startsWith('/partner-host/') && path !== '/partner-host' && !path.startsWith('/_next/static/')) {
      return new NextResponse('Unavailable', { status: 404, headers: hostResponseHeaders })
    }
    // request.url uses Next's internal localhost origin in development. An
    // absolute rewrite to that URL re-enters middleware with the wrong Host.
    const response = path === '/' ? NextResponse.redirect(`https://${host.hostname}/partner-host`, 307) : NextResponse.next()
    for (const [name, value] of Object.entries(hostResponseHeaders)) response.headers.set(name, value)
    return response
  } catch { return new NextResponse('Unavailable', { status: 404, headers: hostResponseHeaders }) }
}
export const config = { matcher: '/:path*' }
