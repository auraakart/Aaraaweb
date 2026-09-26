import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const must=(label,source,tokens)=>{const missing=tokens.filter(token=>!source.includes(token));if(missing.length){console.error(label+' missing: '+missing.join(', '));process.exit(1)}};
const backend=read('services/api/src/auth/permission.types.ts');
must('Backend Auditor authority',backend,[
  '[AppRole.AUDITOR]: [',
  'AppPermission.FINANCE_READ,',
  'AppPermission.SOCIETY_WORKFORCE_READ,'
]);
const access=read('apps/admin/lib/admin-access.ts');
must('Admin console Auditor reachability',access,["AUDITOR: ['overview']"]);
const overview=read('apps/admin/app/admin-overview.tsx');
must('Admin overview permission convergence',overview,[
  "const canReadHelpdesk=['SUPER_ADMIN','SOCIETY_ADMIN','COMMITTEE_MEMBER','FACILITY_MANAGER'].includes(session.role)",
  "const canReadNotices=['SUPER_ADMIN','SOCIETY_ADMIN','COMMITTEE_MEMBER','FACILITY_MANAGER'].includes(session.role)",
  "const canReadFinance=['SUPER_ADMIN','SOCIETY_ADMIN','COMMITTEE_MEMBER','ACCOUNTANT','AUDITOR'].includes(session.role)",
  "const canReadWorkforce=['SUPER_ADMIN','SOCIETY_ADMIN','FACILITY_MANAGER','COMMITTEE_MEMBER','SECURITY_SUPERVISOR','AUDITOR'].includes(session.role)",
  "canReadHelpdesk?api<Ticket[]>('/helpdesk/review/queue'",
  "canReadNotices?api<Notice[]>('/notices/manage'",
  '{canReadHelpdesk&&<>',
  '{canReadNotices&&<>'
]);
const finance=read('apps/admin/app/finance/page.tsx');
must('Finance Auditor read-only access',finance,[
  "const readRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','COMMITTEE_MEMBER','ACCOUNTANT','AUDITOR'])",
  "const manageRoles=new Set(['SUPER_ADMIN','ACCOUNTANT'])"
]);
const workforce=read('apps/admin/app/society-workforce/page.tsx');
must('Society Workforce Auditor read-only access',workforce,[
  "const readRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','FACILITY_MANAGER','COMMITTEE_MEMBER','SECURITY_SUPERVISOR','AUDITOR'])",
  "const manageRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','FACILITY_MANAGER'])"
]);
const root=JSON.parse(read('package.json'));
if(root.version!=='4.56.0'){console.error('V4.57 development must not cut release identity early.');process.exit(1)}
must('V4.57 truth',read('docs/AARAAGATE-V4.57-ADMIN-AUTHORIZATION-CONVERGENCE.md'),[
  'release identity remains 4.56.0',
  'does not add backend permissions',
  'Server authorization and segregation-of-duties checks remain authoritative'
]);
console.log('V4.57 Admin authorization convergence: PASS');
