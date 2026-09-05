from pathlib import Path

path = Path('apps/admin/app/admin-console.tsx')
text = path.read_text()
old = "const fresh={...stored,sessionId:String(next.sessionId),accessToken:String(next.accessToken),refreshToken:String(next.refreshToken)};sessionStorage.setItem('aaraagate.admin.session',JSON.stringify(fresh));setSession(fresh)"
new = "const fresh={...stored,sessionId:String(next.sessionId),accessToken:String(next.accessToken),refreshToken:String(next.refreshToken)};if(!adminRoles.has(fresh.role)||viewsForRole(fresh.role).length===0)throw new Error('Stored role no longer has console access');sessionStorage.setItem('aaraagate.admin.session',JSON.stringify(fresh));setSession(fresh)"
if new in text:
    raise SystemExit(0)
if old not in text:
    raise SystemExit('session restore block not found')
path.write_text(text.replace(old,new))
