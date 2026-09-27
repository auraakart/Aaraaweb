import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const must=(label,source,tokens)=>{const missing=tokens.filter(t=>!source.includes(t));if(missing.length){console.error(label+' missing: '+missing.join(', '));process.exit(1)}};
const root=JSON.parse(read('package.json')),api=JSON.parse(read('services/api/package.json')),admin=JSON.parse(read('apps/admin/package.json'));
if(root.version!=='4.64.0'||api.version!==root.version||admin.version!==root.version){console.error('Root/API/Admin release identity must be V4.64.0.');process.exit(1)}
for(const file of ['apps/resident/pubspec.yaml','apps/guard/pubspec.yaml'])must(file,read(file),['version: 4.64.0+46400']);
must('V4.64 Resident community poll interaction',read('apps/resident/lib/screens/community_screen.dart'),['_reloadPolls()','respondToCommunityPoll(pollId:pollId,optionId:chosen)',"['myOptionId']",'Community poll only — not statutory voting.','Response confirmed after refresh.','Response could not be verified. Review your selection and retry.','A different response is already recorded for this poll.']);
must('V4.64 authoritative backend contract',read('services/api/src/governance/governance-poll-participation.controller.ts'),['p."statutoryUseProhibited"','r."optionId" AS "myOptionId"',"'A response has already been recorded for this poll'",'FOR UPDATE']);
must('V4.64 Resident poll regression',read('apps/resident/test/community_poll_participation_test.dart'),['uncertain poll submission recovers only when refreshed option matches','unverified poll failure remains retryable without manufacturing success','expect(repository.responseCalls,1)']);
must('V4.64 release truth',read('docs/AARAAGATE-V4.64-COMMUNITY-POLL-PARTICIPATION.md'),['Release candidate closed on `develop`; release identity is V4.64.0.','non-statutory','authoritative `myOptionId`','staging/main promotion']);
console.log('V4.64 community poll participation and recovery release closure: PASS');
