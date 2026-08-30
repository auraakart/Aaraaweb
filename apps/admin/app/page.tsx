const metrics = [
  ['Residents', '248', 'Active households'],
  ['Visitors today', '37', '4 awaiting approval'],
  ['Open complaints', '12', '3 need attention'],
  ['Collections', '₹4.82L', 'This month'],
]

export default function AdminHome() {
  return <main className="shell">
    <aside className="sidebar">
      <div className="brand">aaraagate</div>
      <nav className="nav">
        {['Overview','Residents','Security','Visitors','Vehicles','Complaints','Payments','Notices','Settings'].map((item, i) => <a key={item} className={i === 0 ? 'active' : ''} href="#">{item}</a>)}
      </nav>
    </aside>
    <section className="content">
      <header className="header"><div><div className="eyebrow">Greenwood Residency</div><div className="title">Good morning, Admin</div></div><span className="pill">System operational</span></header>
      <div className="grid">{metrics.map(([label,value,caption]) => <div className="card" key={label}><div className="muted">{label}</div><div className="metric">{value}</div><div className="muted">{caption}</div></div>)}</div>
      <section className="section"><h2>Security attention</h2><table className="table"><thead><tr><th>Event</th><th>Gate</th><th>Status</th></tr></thead><tbody><tr><td>Visitor approvals</td><td>Gate 1</td><td><span className="pill">4 pending</span></td></tr><tr><td>Guard connectivity</td><td>Gate 2</td><td><span className="pill">Online</span></td></tr><tr><td>Unresolved incidents</td><td>All gates</td><td><span className="pill">0 open</span></td></tr></tbody></table></section>
    </section>
  </main>
}
