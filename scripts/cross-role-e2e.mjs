const base=(process.env.AARAAGATE_E2E_BASE_URL??'http://127.0.0.1:3000').replace(/\/$/,'');
const tokens={
  resident:process.env.AARAAGATE_E2E_RESIDENT_TOKEN??'aaraagate-e2e-resident-token',
  guard:process.env.AARAAGATE_E2E_GUARD_TOKEN??'aaraagate-e2e-guard-token',
  admin:process.env.AARAAGATE_E2E_ADMIN_TOKEN??'aaraagate-e2e-admin-token',
};
const unitId='11111111-1111-4111-8111-111111118003';
const gateId='11111111-1111-4111-8111-111111118004';

async function request(role,path,{method='GET',body,headers={}}={}){
  const response=await fetch(`${base}${path}`,{
    method,
    headers:{Accept:'application/json','Content-Type':'application/json',Authorization:`Bearer ${tokens[role]}`,...headers},
    body:body===undefined?undefined:JSON.stringify(body),
  });
  const text=await response.text();
  let parsed=null;
  if(text){try{parsed=JSON.parse(text)}catch{parsed=text}}
  if(!response.ok)throw new Error(`${role} ${method} ${path} failed (${response.status}): ${typeof parsed==='string'?parsed:JSON.stringify(parsed)}`);
  return parsed;
}

const now=Date.now();
const invite=await request('resident','/api/v1/access-requests/visitor-invites',{
  method:'POST',
  body:{
    unitId,
    name:'E2E Visitor',
    phone:'+919999998099',
    purpose:'Cross-role regression',
    validFrom:new Date(now-60_000).toISOString(),
    validUntil:new Date(now+60*60_000).toISOString(),
  },
});
if(!invite?.request?.id||!invite?.credential)throw new Error('Resident invite did not return request and credential');
const requestId=invite.request.id;

const verified=await request('guard','/api/v1/access-requests/gate/verify',{
  method:'POST',
  body:{gateId,credential:invite.credential},
});
if(verified?.request?.id&&verified.request.id!==requestId)throw new Error('Guard verified a different request');

const checkedIn=await request('guard','/api/v1/access-requests/gate/check-in',{
  method:'POST',
  headers:{'Idempotency-Key':`e2e-in-${requestId}`},
  body:{gateId,credential:invite.credential},
});
if(checkedIn?.status!=='CHECKED_IN')throw new Error(`Expected CHECKED_IN, got ${checkedIn?.status}`);

const replay=await request('guard','/api/v1/access-requests/gate/check-in',{
  method:'POST',
  headers:{'Idempotency-Key':`e2e-in-${requestId}`},
  body:{gateId,credential:invite.credential},
});
if(replay?.id!==requestId||replay?.status!=='CHECKED_IN')throw new Error('Idempotent guard check-in replay changed outcome');

const checkedOut=await request('guard','/api/v1/access-requests/gate/check-out',{
  method:'POST',
  headers:{'Idempotency-Key':`e2e-out-${requestId}`},
  body:{gateId,credential:invite.credential},
});
if(checkedOut?.status!=='CHECKED_OUT')throw new Error(`Expected CHECKED_OUT, got ${checkedOut?.status}`);

const mine=await request('resident','/api/v1/access-requests/mine');
const residentRecord=Array.isArray(mine)?mine.find(row=>row.id===requestId):null;
if(!residentRecord||residentRecord.status!=='CHECKED_OUT')throw new Error('Resident did not observe final visitor status');

const from=new Date(now-10*60_000).toISOString();
const to=new Date(Date.now()+10*60_000).toISOString();
const report=await request('admin',`/api/v1/reports/access?subjectType=VISITOR&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&page=1&pageSize=25`);
const adminRecord=report?.items?.find?.(row=>row.id===requestId);
if(!adminRecord||adminRecord.status!=='CHECKED_OUT'||!adminRecord.enteredAt||!adminRecord.exitedAt){
  throw new Error('Admin report did not contain completed cross-role visitor evidence');
}

console.log(JSON.stringify({
  journey:'resident-visitor -> guard-check-in/out -> admin-report',
  requestId,
  residentStatus:residentRecord.status,
  adminStatus:adminRecord.status,
  enteredAt:adminRecord.enteredAt,
  exitedAt:adminRecord.exitedAt,
  idempotencyReplay:'verified',
  passed:true,
},null,2));
