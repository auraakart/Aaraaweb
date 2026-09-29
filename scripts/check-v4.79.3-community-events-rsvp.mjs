import fs from 'node:fs';

const read=(path)=>fs.readFileSync(path,'utf8');
const requireTokens=(label,source,tokens)=>{
  const missing=tokens.filter((token)=>!source.includes(token));
  if(missing.length)throw new Error(label+' missing: '+missing.join(', '));
};

const migration=read('services/api/prisma/migrations/20260929104500_v4793_community_events_rsvp/migration.sql');
const service=read('services/api/src/governance/community-events.service.ts');
const controller=read('services/api/src/governance/community-events.controller.ts');
const resident=read('apps/resident/lib/screens/community_events_screen.dart');
const admin=read('apps/admin/app/community-events/page.tsx');

requireTokens('Community-event persistence',migration,['"CommunityEvent"','"CommunityEventRsvp"','OWNER_ONLY','PUBLISHED','CommunityEventRsvp_user_unique']);
requireTokens('Capacity and privacy boundary',service,['FOR UPDATE','Community event has reached capacity','COUNT(*)::int AS "goingCount"','uo."verified"=TRUE','e."audienceScope"=\'OWNER_ONLY\'']);
requireTokens('Entitlement/permission boundary',controller,['ProductFeature.NOTICES','AppPermission.NOTICE_READ','AppPermission.NOTICE_MANAGE',"'GOING','NOT_GOING'"]);
requireTokens('Resident RSVP UX',resident,['Community events','not a vote, quorum record','I’m going','Event full','myRsvp']);
requireTokens('Admin event lifecycle',admin,['Community events','OWNER_ONLY','RSVP aggregate','Publish','Cancel']);

if(service.includes('SELECT u."name"')||service.includes('SELECT u."phone"')){
  throw new Error('Community-event summaries must not expose RSVP participant identities.');
}
if(service.includes('GOVERNANCE_MANAGE')||controller.includes('GOVERNANCE_MANAGE')){
  throw new Error('Community event operations must not be coupled to statutory governance permission semantics.');
}
console.log('V4.79.3 community events + RSVP contract OK');
