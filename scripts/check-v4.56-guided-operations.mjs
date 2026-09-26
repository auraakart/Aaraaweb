import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const must=(label,source,tokens)=>{const missing=tokens.filter(t=>!source.includes(t));if(missing.length){console.error(label+' missing: '+missing.join(', '));process.exit(1)}};
const admin=read('apps/admin/app/admin-overview.tsx');
must('V4.56 Admin guided operations',admin,[
  "actionLabel:'Open Helpdesk',view:'helpdesk'",
  "actionLabel:'Open Finance',href:'/finance'",
  "actionLabel:'Open workforce',href:'/society-workforce'",
  "actionLabel:'Open onboarding',href:'/onboarding'",
  "actionLabel:'Open Billing',view:'billing'",
  "actionLabel:'Open Amenities',href:'/amenities'",
  'if(item.view&&canOpen(item.view))',
  'if(item.href)window.location.href=item.href',
  'It is not predictive scoring and does not mutate any workflow.'
]);
const resident=read('apps/resident/lib/screens/home_screen.dart');
must('V4.56 Resident action clarity',resident,[
  "final urgencyLabel = urgency == ResidentHomeUrgency.immediate ? 'Act now'",
  "semanticLabel: '$urgencyLabel. $title. $subtitle. $actionLabel'",
  'label: urgencyLabel,'
]);
must('V4.56 Resident regression',read('apps/resident/test/home_action_inbox_dedup_test.dart'),[
  'Soon. Water seepage near kitchen. High priority · action in progress. Open helpdesk'
]);
must('V4.56 development truth',read('docs/AARAAGATE-V4.56-GUIDED-OPERATIONS.md'),[
  'release identity is not yet cut to 4.56.0',
  'performs no workflow mutation',
  'server authorization'
]);
console.log('V4.56 guided operations development contract: PASS');
