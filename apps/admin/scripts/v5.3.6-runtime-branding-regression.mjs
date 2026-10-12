import assert from 'node:assert/strict';
import {parseAdminSocietyBrand} from '../lib/admin-society-brand.ts';

const a='11111111-1111-4111-8111-111111111111';
const b='22222222-2222-4222-8222-222222222222';
const payload=(societyId=a,colors={primary:'#155E75',primaryDeep:'#164E63'},displayName='Courtyard Homes')=>({
  society:{id:societyId},
  branding:{schemaVersion:1,revision:'society-v1',brand:{
    id:'aaraagate',displayName,colors,
  }},
});
const accepted=parseAdminSocietyBrand(payload(),a);
assert.deepEqual(accepted,{displayName:'Courtyard Homes',primary:'#155E75',primaryDeep:'#164E63'});
assert.equal(parseAdminSocietyBrand(payload(b),a),null,'foreign selected society must not inject theme');
assert.equal(parseAdminSocietyBrand(payload(a,{primary:'#FFF000',primaryDeep:'#164E63'}),a),null,'white-text contrast must remain AA');
assert.equal(parseAdminSocietyBrand(payload(a,{primary:'#155E75',primaryDeep:'#FFFFFF'}),a),null,'nav contrast must remain AA');
assert.equal(parseAdminSocietyBrand(payload(a,{primary:'#155E75; background:red',primaryDeep:'#164E63'}),a),null,'arbitrary CSS is forbidden');
assert.equal(parseAdminSocietyBrand({...payload(),society:null},a),null);
assert.equal(parseAdminSocietyBrand({...payload(),branding:{...payload().branding,schemaVersion:2}},a),null);
assert.equal(parseAdminSocietyBrand({...payload(),branding:{...payload().branding,brand:{...payload().branding.brand,id:'partner-admin'}}},a),null);
assert.equal(parseAdminSocietyBrand(payload(a,undefined,' '.repeat(4)),a),null);
assert.equal(parseAdminSocietyBrand(payload(a,undefined,'X'.repeat(81)),a),null);
assert.equal(parseAdminSocietyBrand(null,a),null);
console.log('V5.3.6 Admin runtime society-brand validation: PASS');
