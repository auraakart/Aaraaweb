import fs from 'node:fs';

const read=path=>fs.readFileSync(path,'utf8');
const requireTokens=(label,source,tokens)=>{
  const missing=tokens.filter(token=>!source.includes(token));
  if(missing.length){console.error(`${label} missing: ${missing.join(', ')}`);process.exit(1);}
};

requireTokens('Controlled AI action',read('services/api/src/ai-operations/ai-operations.service.ts'),[
  'ASSIGN_HELPDESK_TICKET','proposeHelpdeskAssignment','impactPreview','autonomousExecution:false','confirmHelpdeskAssignment',
]);
requireTokens('Controlled Helpdesk stale preview',read('services/api/src/helpdesk/helpdesk.service.ts'),[
  'assignmentPreview','expectedUpdatedAt','Helpdesk ticket changed; refresh the action preview before confirming',
]);
requireTokens('Controlled Admin UX',read('apps/admin/app/ai-assistant/page.tsx'),[
  'Controlled action · Helpdesk assignment','Prepare assignment preview','Confirm assignment','autonomous execution: no',
]);
requireTokens('Treasurer control',read('services/api/src/accounting/finance-operations.service.ts'),[
  'treasurerControlCentre','unmatchedBank','unappliedCount','overrunLines','documentsMissingTaxEvidence','automaticPosting:false','automaticMatching:false',
]);
requireTokens('Treasurer Admin UX',read('apps/admin/app/finance/page.tsx'),[
  'Treasurer control centre','Unmatched bank items','Budget overrun lines','Missing GST/TDS evidence',
]);
requireTokens('Guard continuity',read('services/api/src/guard-operations/guard-shift-handover.service.ts'),[
  'handoverOlder30m','criticalIncidentOlder30m','gatesWithOpenIncidents','SUPERVISOR_ATTENTION',"clientOfflineQueueVisibility:'DEVICE_LOCAL_ONLY'",
]);
requireTokens('Resident workforce AI registration',read('services/api/src/ai-operations/ai-assistant.service.ts'),[
  'RESIDENT_WORKFORCE','WORKFORCE_READ_OWN','residentStatusMine(societyId,userId,unitId)','household staff domestic help worker workforce',
]);
requireTokens('Resident workforce evidence',read('services/api/src/workforce/workforce.service.ts'),[
  'residentStatusMine','unitOccupancy.findFirst','onLeaveToday','checkedInNow',
]);
requireTokens('Integration conformance',read('services/api/src/integrations/integration-registry.service.ts'),[
  'conformance(societyId:string)','FIELD_EVIDENCE_REQUIRED','certificationClaim:false','does not certify live provider acceptance',
]);
requireTokens('Privacy evidence',read('services/api/src/privacy/privacy.service.ts'),[
  'programEvidence','consentEvidence','caseEvidence','incidentEvidence','certificationClaim:false','not a DPDP',
]);
requireTokens('Tree-bound staging evidence',read('.github/workflows/staging-smoke.yml'),[
  'Candidate tree SHA','Current develop tree SHA','Current staging tree SHA','Current main tree SHA',
]);
requireTokens('Tree-bound main evidence',read('.github/workflows/release-readiness.yml'),[
  'Candidate tree SHA','Current staging tree SHA','Rollback tree SHA','Main candidate tree must exactly match current staging',
]);
requireTokens('V4.54 documentation',read('docs/AARAAGATE-V4.54-CONTROLLED-ACTION-OPERATIONAL-CONTROL.md'),[
  'Controlled Action Execution & Operational Control','prepare → preview impact → permission check → explicit confirmation','Treasurer Control Centre','NOT_EXECUTED',
]);
const pilot=JSON.parse(read('docs/v4.54-pilot-readiness-evidence.json'));
if(pilot.fieldPilotStatus!=='NOT_EXECUTED'){
  console.error('V4.54 repository must not claim field-pilot acceptance without external evidence.');
  process.exit(1);
}
if(pilot.approver!==null||pilot.societyPilotIdentifier!==null){
  console.error('V4.54 pilot evidence must remain unpopulated until a real pilot occurs.');
  process.exit(1);
}
console.log('V4.54 controlled-action and operational-control contracts are intact.');
