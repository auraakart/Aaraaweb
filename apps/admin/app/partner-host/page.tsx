import { currentHostCredentials, hostApi, validatedHostContext } from '../../lib/partner-host-server'
import { parsePortfolio } from '../../lib/admin-partner'
import HostSignIn from './sign-in'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const metadata = { title: 'Partner workspace' }
export default async function HostPartnerPage() {
  try {
    const credentials = await currentHostCredentials()
    if (!credentials) return <HostSignIn />
    await validatedHostContext(credentials)
    const data = await hostApi(credentials.hostname, `/partners/${credentials.partnerId}/portfolio`, { accessToken: credentials.accessToken })
    const portfolio = parsePortfolio(data, credentials.partnerId)
    return <main className="login"><section className="loginCard"><h1>{portfolio.partner.name}</h1>
      <p>Your partner society portfolio</p><ul>{portfolio.societies.map(society => <li key={society.id}>{society.name} — {society.status}</li>)}</ul>
      {portfolio.hasMore && <p>Showing the first 50 societies.</p>}<HostSignIn signedIn /></section></main>
  } catch { return <HostSignIn unavailable /> }
}
