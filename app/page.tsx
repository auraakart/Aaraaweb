import { Bell, CalendarDays, CarFront, ChevronRight, CircleHelp, Home, Megaphone, Package, ShieldCheck, Siren, Users, Wrench } from 'lucide-react'

const quickActions = [
  ['Visitor', Users], ['Delivery', Package], ['Amenity', CalendarDays], ['Helpdesk', CircleHelp],
]

export default function HomePage() {
  return <main className="shell"><div className="app">
    <header className="topbar"><div><div className="eyebrow">Good morning</div><div className="title">Welcome home 👋</div></div><div className="avatar">AK</div></header>
    <section className="hero"><small>GREENWOOD RESIDENCY · A-1204</small><h1>Your community,<br/>at your fingertips.</h1><div className="hero-row"><button className="hero-action">Approve visitor</button><button className="hero-action">Pre-invite</button></div></section>
    <section className="section"><div className="section-head"><h2>Quick actions</h2><span>Everything nearby</span></div><div className="quick-grid">{quickActions.map(([label,Icon])=><button className="quick" key={label as string}><span className="quick-icon"><Icon size={18}/></span><span>{label as string}</span></button>)}</div></section>
    <section className="section"><div className="section-head"><h2>At the gate</h2><span>Live</span></div><div className="card"><div className="visitor"><div className="visitor-icon"><Users size={20}/></div><div className="visitor-main"><strong>No pending visitors</strong><p>We’ll alert you instantly when someone arrives.</p></div><span className="pill">Secure</span></div></div></section>
    <section className="section"><div className="section-head"><h2>Community updates</h2><span>View all</span></div><div className="card"><div className="notice"><div className="notice-badge"/><div><strong>Water supply maintenance</strong><p>Planned maintenance tomorrow from 10:00 AM to 1:00 PM.</p></div><ChevronRight size={17}/></div><div className="notice"><div className="notice-badge"/><div><strong>Independence Day gathering</strong><p>Residents are invited to the clubhouse lawn at 5:30 PM.</p></div><ChevronRight size={17}/></div></div></section>
    <nav className="bottom"><div className="nav active"><Home size={20}/><span>Home</span></div><div className="nav"><ShieldCheck size={20}/><span>Security</span></div><div className="nav"><Megaphone size={20}/><span>Community</span></div><div className="nav"><Wrench size={20}/><span>Services</span></div></nav>
  </div></main>
}