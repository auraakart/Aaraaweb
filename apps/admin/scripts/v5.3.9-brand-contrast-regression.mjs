import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {parseAdminSocietyBrand} from '../lib/admin-society-brand.ts'

const societyId='11111111-1111-4111-8111-111111111111'
function context(primary,primaryDeep,society=societyId){
  return {society:{id:society},branding:{schemaVersion:1,revision:'society-'+society+'-v4',
    brand:{id:'aaraagate',displayName:'Accessible Courtyard',colors:{primary,primaryDeep}}}}
}
function luminance(hex){
  const channels=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255)
    .map(c=>c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4)
  return 0.2126*channels[0]+0.7152*channels[1]+0.0722*channels[2]
}
function contrast(a,b){
  const x=luminance(a),y=luminance(b)
  return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05)
}
for(const deep of ['#000000','#164E63','#155E75','#777777','#BBBBBB','#FFF000','#FFFFFF']){
  const brand=parseAdminSocietyBrand(context('#D4F2F4',deep),societyId)
  assert.ok(brand,'All six-digit palettes should render with a safe foreground')
  assert.ok(contrast(deep,brand.onPrimaryDeep)>=4.5,'Primary control contrast must satisfy WCAG AA: '+deep)
  assert.ok(contrast(brand.navigationInk,'#E6F3EC')>=4.5,'Navigation/control ink contrast must satisfy WCAG AA: '+deep)
}
assert.equal(parseAdminSocietyBrand(context('#FFF000','#FFFFFF'),societyId)?.onPrimaryDeep,'#000000')
assert.equal(parseAdminSocietyBrand(context('#155E75','#164E63'),societyId)?.onPrimaryDeep,'#FFFFFF')
assert.equal(parseAdminSocietyBrand(context('#155E75','#164E63','22222222-2222-4222-8222-222222222222'),societyId),null)
assert.equal(parseAdminSocietyBrand(context('red','#164E63'),societyId),null)
assert.equal(parseAdminSocietyBrand(context('#155E75','#FFFFFF;background:url(x)'),societyId),null)
const consoleSource=readFileSync(new URL('../app/admin-console.tsx',import.meta.url),'utf8')
const editorSource=readFileSync(new URL('../app/admin-society-brand-editor.tsx',import.meta.url),'utf8')
const css=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8')
for(const token of ["'--brand-on':activeBrand.onPrimaryDeep","'--brand-ink':activeBrand.navigationInk",'brandSnapshot?.identity===brandIdentity','style={brandStyle}']){
  assert.ok(consoleSource.includes(token),'Expected authenticated shell-scoped token '+token)
}
assert.ok(editorSource.includes('color:preview.onPrimaryDeep'))
assert.ok(!editorSource.includes('Both theme colors must support accessible white text'))
assert.ok(css.includes('.primary{background:var(--brand)!important;color:var(--brand-on,white);'))
assert.ok(css.includes('.nav button.active,.nav button:hover{background:var(--accent);color:var(--brand-ink,var(--brand))}'))
assert.ok(!css.includes('.primary{background:var(--brand)!important;color:white;'))
console.log('V5.3.9 cross-client contrast and Admin scoped foreground tokens: PASS')
