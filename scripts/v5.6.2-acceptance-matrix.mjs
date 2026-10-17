// V5.6.2: exact, nonproduction preparation-only acceptance contract.
// No external attestation, artifact execution, promotion, or release is authorized.
const deny = reason => {throw new Error('V5.6.2 acceptance matrix: '+reason);};
const plain = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const requireKeys=(x,keys)=>{
 if(!plain(x)||Object.keys(x).sort().join('|')!==keys.slice().sort().join('|'))
  deny('unexpected contract keys');
};
const exactList=(actual,expected)=>{
 if(!Array.isArray(actual)||actual.length!==expected.length||
    new Set(actual).size!==expected.length||
    actual.slice().sort().join('|')!==expected.slice().sort().join('|'))
   deny('changed required dependencies or evidence kinds');
};
const specs=Object.freeze({
 'V56-TENANT-01':['TENANT','DENY_CROSS_PARTNER_DATA',['CI','TEST_DB'],['AUTH_NEGATIVE','DB_REPLAY']],
 'V56-TENANT-02':['TENANT','PRESERVE_OCCUPANT_GATE_ROUTING',['CI','TEST_DB'],['AUTH_NEGATIVE','USER_FLOW']],
 'V56-TENANT-03':['TENANT','PRESERVE_LEGACY_ENTITLEMENTS',['CI','TEST_DB'],['DB_REPLAY','USER_FLOW']],
 'V56-DOMAIN-01':['DOMAIN','REJECT_UNTRUSTED_HOST',['CI','TRUSTED_INGRESS'],['TLS_CAPTURE','AUTH_NEGATIVE']],
 'V56-DOMAIN-02':['DOMAIN','ISOLATE_HOST_COOKIES',['CI','TRUSTED_INGRESS'],['COOKIE_CAPTURE','AUTH_NEGATIVE']],
 'V56-ANDROID-01':['ANDROID','VERIFY_PARTNER_BINARY_IDENTITY',['INDEPENDENT_RUNNER','PARTNER_ARTIFACTS'],['APK_METADATA','ATTESTATION']],
 'V56-ANDROID-02':['ANDROID','NO_COINSTALL_COLLISION',['PARTNER_ARTIFACTS','TEST_DEVICE'],['DEVICE_MATRIX','USER_FLOW']],
 'V56-ANDROID-03':['ANDROID','DENY_IDENTITY_DOWNGRADE',['PARTNER_ARTIFACTS','TEST_DEVICE'],['APK_METADATA','DEVICE_MATRIX']],
 'V56-DATA-01':['MIGRATION','REPLAY_ADDITIVE_MIGRATIONS',['CI','TEST_DB'],['DB_REPLAY','RESTORE_LOG']],
 'V56-DATA-02':['MIGRATION','PRESERVE_DATA_ON_ROLLBACK',['TEST_DB','PARTNER_ARTIFACTS'],['RESTORE_LOG','USER_FLOW']],
 'V56-SAFETY-01':['SAFETY','PRESERVE_GATE_SOS',['CI','TEST_DB'],['AUTH_NEGATIVE','USER_FLOW']],
 'V56-SAFETY-02':['SAFETY','PRESERVE_PAYMENT_AUDIENCES',['CI','TEST_DB'],['AUTH_NEGATIVE','USER_FLOW']],
 'V56-QUALITY-01':['QUALITY','VERIFY_ACCESSIBILITY_PERFORMANCE',['CI','TEST_DEVICE'],['A11Y_PERF','USER_FLOW']],
 'V56-PROVENANCE-01':['PROVENANCE','MEASURE_INDEPENDENT_RUNTIME',['INDEPENDENT_RUNNER','TRUSTED_INGRESS'],['ATTESTATION','TLS_CAPTURE']],
 'V56-PROVENANCE-02':['PROVENANCE','BIND_CANDIDATE_TO_EVIDENCE',['CI','INDEPENDENT_RUNNER','PARTNER_ARTIFACTS'],['CI_RUN','APK_METADATA','ATTESTATION']]
});
export function assessV56Preparation(matrix,manifest){
 requireKeys(matrix,['schemaVersion','program','milestone','slice','environment','status','authority','candidateSha','externalAcceptanceVerified','cases']);
 if(matrix.schemaVersion!==1||matrix.program!=='Aaraagate V5'||matrix.milestone!=='V5.6'||
    matrix.slice!=='V5.6.2'||matrix.environment!=='TEST'||matrix.status!=='PREPARATION_ONLY'||
    matrix.candidateSha!==null||matrix.externalAcceptanceVerified!==false)
   deny('preparation cannot claim verified execution, identity or closure');
 requireKeys(matrix.authority,['productionizationIncluded','buildExecutionAuthorized','partnerDistributionApproved','releaseCandidateApproved','stagingPromotionApproved','mainPromotionApproved']);
 if(Object.values(matrix.authority).some(v=>v!==false))deny('release or build authority cannot be granted from planning');
 if(!Array.isArray(matrix.cases)||matrix.cases.length!==Object.keys(specs).length)
  deny('mandatory acceptance coverage missing');
 const seen=new Set();
 for(const c of matrix.cases){
  requireKeys(c,['id','category','expectedOutcome','description','dependsOn','evidenceKinds','executionStatus','evidenceRefs']);
  const required=specs[c.id];
  if(!required||seen.has(c.id))deny('unknown or duplicate acceptance case');
  seen.add(c.id);
  if(c.category!==required[0]||c.expectedOutcome!==required[1]||
     typeof c.description!=='string'||c.description.trim().length<25)
   deny('weakened acceptance expectation');
  exactList(c.dependsOn,required[2]);
  exactList(c.evidenceKinds,required[3]);
  if(c.executionStatus!=='NOT_EXECUTED'||!Array.isArray(c.evidenceRefs)||
     c.evidenceRefs.length!==0)
   deny('planning document must not contain forged test execution/evidence');
 }
 if(!plain(manifest)||manifest.programVersion!=='5.0.0'||
    manifest.status!=='IN_DEVELOPMENT'||manifest.productionizationIncluded!==false||
    manifest.repository!=='auraakart/Aaraaweb')
  deny('unexpected V5 release manifest identity or scope');
 const promotion=manifest.promotion;
 if(!plain(promotion)||promotion.target!=='develop'||
    promotion.staging!=='CONSOLIDATED_CANDIDATE_ONLY'||
    promotion.main!=='EXPLICIT_OWNER_APPROVAL_REQUIRED')
   deny('unauthorized branch promotion');
 const milestones=manifest.milestones;
 if(!Array.isArray(milestones))deny('no milestone register');
 const named=id=>milestones.filter(x=>x?.id===id);
 if(['V5.4','V5.5','V5.6'].some(id=>named(id).length!==1))
   deny('missing or duplicate dependent milestone');
 if(named('V5.4')[0].status!=='IN_PROGRESS'||
    named('V5.5')[0].status!=='IN_PROGRESS'||named('V5.6')[0].status!=='PLANNED'||
    !Array.isArray(named('V5.5')[0].remaining)||
    !named('V5.5')[0].remaining.some(x=>typeof x==='string'&&x.includes('trusted TEST runner')))
   deny('independent runner dependency or planned closure was removed');
 return Object.freeze({
  phase:'V5.6',preparationSlice:'V5.6.2',caseCount:seen.size,
  casesExecuted:0,independentEvidenceAccepted:false,
  closureReady:false,buildExecutionAuthorized:false,
  releaseCandidateApproved:false,stagingPromotionApproved:false,mainPromotionApproved:false
 });
}
