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
for(const [label,path] of [
  ['Finance Operations','apps/admin/app/finance/operations/page.tsx'],
  ['Bank Reconciliation','apps/admin/app/finance/bank-reconciliation/page.tsx'],
  ['GST / TDS','apps/admin/app/finance/tax/page.tsx'],
]){
  must(label+' Auditor read-only access',read(path),[
    "const readRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','COMMITTEE_MEMBER','ACCOUNTANT','AUDITOR'])",
    "const manageRoles=new Set(['SUPER_ADMIN','ACCOUNTANT'])"
  ]);
}
const workforce=read('apps/admin/app/society-workforce/page.tsx');
must('Society Workforce Auditor read-only access',workforce,[
  "const readRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','FACILITY_MANAGER','COMMITTEE_MEMBER','SECURITY_SUPERVISOR','AUDITOR'])",
  "const manageRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','FACILITY_MANAGER'])"
]);

const governance=read('apps/admin/app/governance/page.tsx');
must('Governance Auditor read-only access',governance,[
  "const readRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','COMMITTEE_MEMBER','AUDITOR'])",
  "const manageRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','COMMITTEE_MEMBER'])",
  "s.role==='AUDITOR'?'/audit':'/'",
  '{canManage&&<>'
]);
const facilities=read('apps/admin/app/facilities/page.tsx');
must('Facilities Auditor read-only access',facilities,[
  "const readRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','FACILITY_MANAGER','COMMITTEE_MEMBER','AUDITOR'])",
  "const manageRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','FACILITY_MANAGER'])",
  "s.role==='AUDITOR'?'/audit':'/'"
]);
const occupancy=read('apps/admin/app/occupancy-lifecycle/page.tsx');
must('Occupancy Auditor read-only access',occupancy,[
  "const readRoles=new Set([...manageRoles,'COMMITTEE_MEMBER','AUDITOR'])",
  "const manageRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','FACILITY_MANAGER'])",
  "s.role==='AUDITOR'?'/audit':'/'"
]);
const audit=read('apps/admin/app/audit/page.tsx');
must('Auditor workspace discovery',audit,[
  'Read-only operational workspaces',
  'href="/governance"',
  'href="/facilities"',
  'href="/occupancy-lifecycle"',
  'Mutation controls remain unavailable.'
]);

const parking=read('apps/admin/app/parking/page.tsx');
must('Parking configuration read/manage split',parking,[
  "const readRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','FACILITY_MANAGER','COMMITTEE_MEMBER','AUDITOR'])",
  "const manageRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN'])",
  "const canRead=!!session&&readRoles.has(session.role)",
  "const canManage=!!session&&manageRoles.has(session.role)",
  "if(!session||!canManage)return",
  "{canManage&&(editing?",
  "session?.role==='AUDITOR'?'/audit':'/'"
]);
const advancedParking=read('apps/admin/app/parking/advanced/page.tsx');
must('Advanced Parking read/manage split',advancedParking,[
  "const viewRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','FACILITY_MANAGER','COMMITTEE_MEMBER','AUDITOR','SECURITY_SUPERVISOR'])",
  "const manageRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','FACILITY_MANAGER'])",
  "if(x&&viewRoles.has(x.role))void load(x)",
  "if(!canView)return"
]);
const parkingPermits=read('apps/admin/app/parking/permits/page.tsx');
must('Parking permits least-privilege read path',parkingPermits,[
  "const viewRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','FACILITY_MANAGER','COMMITTEE_MEMBER','AUDITOR','SECURITY_SUPERVISOR'])",
  "if(canManage){const[s,v,p]=await Promise.all",
  "setSlots([]);setVisitors([]);setPermits(await api<Permit[]>('/parking/v2/permits'",
  "session.role==='AUDITOR'?'/audit':'/parking'"
]);
must('Auditor Parking discovery',audit,[
  'href="/parking"',
  'Vehicle and parking assignment evidence'
]);

const root=JSON.parse(read('package.json'));
const api=JSON.parse(read('services/api/package.json'));
const admin=JSON.parse(read('apps/admin/package.json'));
const currentVersion=root.version.split('.').map(Number);
const atLeastV457=currentVersion.length===3&&currentVersion.every(Number.isInteger)&&(currentVersion[0]>4||(currentVersion[0]===4&&currentVersion[1]>=57));
if(!atLeastV457||api.version!==root.version||admin.version!==root.version){console.error('Root/API/Admin release identity must remain aligned at V4.57.0 or newer.');process.exit(1)}
const runtimeVersionToken='version: '+root.version+'+';
if(!read('apps/resident/pubspec.yaml').includes(runtimeVersionToken)||!read('apps/guard/pubspec.yaml').includes(runtimeVersionToken)){console.error('Resident/Guard release identity must remain aligned with the current root release.');process.exit(1)}
must('V4.57 truth',read('docs/AARAAGATE-V4.57-ADMIN-AUTHORIZATION-CONVERGENCE.md'),[
  'Release candidate closed on develop; release identity is 4.57.0.',
  'does not add backend permissions',
  'Server authorization and segregation-of-duties checks remain authoritative',
  'V4.57 release closure'
]);
must('V4.57 release closure evidence',read('docs/AARAAGATE-V4.57-RELEASE-CLOSURE.md'),[
  'PR #912',
  'PR #913',
  'PR #914',
  '4.57.0+45700',
  'does not claim staging/main promotion'
]);
console.log('V4.57 Admin authorization release closure: PASS');
