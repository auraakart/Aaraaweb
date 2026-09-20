import fs from 'node:fs'

const residentTheme=fs.readFileSync(new URL('../apps/resident/lib/theme/aaraagate_theme.dart',import.meta.url),'utf8')
const guardTheme=fs.readFileSync(new URL('../apps/guard/lib/theme/aaraagate_guard_theme.dart',import.meta.url),'utf8')
const residentMain=fs.readFileSync(new URL('../apps/resident/lib/main.dart',import.meta.url),'utf8')
const residentHome=fs.readFileSync(new URL('../apps/resident/lib/screens/home_screen.dart',import.meta.url),'utf8')

function requireToken(source,token,label){
  if(!source.includes(token)){
    console.error(`${label} missing: ${token}`)
    process.exit(1)
  }
}

const sharedThemeTokens=[
  'Color(0xFF0EABBE)',
  'Color(0xFF05879A)',
  'Color(0xFFF5FBFC)',
  'Color(0xFFD4F2F4)',
  'Color(0xFF17323A)',
  'Color(0xFFD5E8EB)',
  'Color(0xFFF8FCFD)',
  'Color(0xFFF0F8F9)',
  'Color(0xFFE8F4F6)',
  'Color(0xFFE7F1F3)',
  'Color(0xFF152126)',
  'Color(0xFF101A1E)',
  'Color(0xFF18262B)',
  'Color(0xFF1D2D32)',
  'Color(0xFF24373D)',
  'Color(0xFF385158)',
  'Color(0xFF293E44)',
]
for(const token of sharedThemeTokens){
  requireToken(residentTheme,token,'Resident shared presentation token')
  requireToken(guardTheme,token,'Guard shared presentation token')
}

for(const token of [
  'space1 = 4','space2 = 8','space3 = 12','space4 = 16','space5 = 20','space6 = 24',
  'radiusSmall = 12','radiusControl = 16','radiusCard = 20','radiusSheet = 24',
]){
  requireToken(residentTheme,token,'Resident core sizing token')
  requireToken(guardTheme,token,'Guard core sizing token')
}

// Guard operational density is intentionally larger/faster than Resident.
for(const token of ['minTouchTarget = 48','primaryActionHeight = 52']) requireToken(residentTheme,token,'Resident interaction contract')
for(const token of ['minTouchTarget = 56','primaryActionHeight = 64']) requireToken(guardTheme,token,'Guard operational interaction contract')
requireToken(residentTheme,'Duration(milliseconds: 120)','Resident motion contract')
requireToken(guardTheme,'Duration(milliseconds: 110)','Guard operational motion contract')

const navStart=residentMain.indexOf('const destinations = <NavigationDestination>[')
const navEnd=residentMain.indexOf('];',navStart)
if(navStart<0||navEnd<0){
  console.error('Resident persistent navigation block not found')
  process.exit(1)
}
const nav=residentMain.slice(navStart,navEnd)
const navLabels=[...nav.matchAll(/label: '([^']+)'/g)].map(m=>m[1])
const expectedNav=['Home','Gate','Services','Community','Profile']
if(JSON.stringify(navLabels)!==JSON.stringify(expectedNav)){
  console.error(`Resident persistent navigation changed: ${JSON.stringify(navLabels)}`)
  process.exit(1)
}
if(/AI|Assistant|Staff|Billing|Amenities|Helpdesk/.test(nav)){
  console.error('Resident persistent navigation contains a contextual/quick-action destination')
  process.exit(1)
}

const quickStart=residentHome.indexOf("title: 'Quick actions'")
const quickEnd=residentHome.indexOf('if (controller.entitlementsError',quickStart)
if(quickStart<0||quickEnd<0){
  console.error('Resident Quick actions block not found')
  process.exit(1)
}
const quick=residentHome.slice(quickStart,quickEnd)
const quickLabels=[...quick.matchAll(/label: '([^']+)'/g)].map(m=>m[1])
const expectedQuick=['Staff','Billing','Amenities','Helpdesk']
if(JSON.stringify(quickLabels)!==JSON.stringify(expectedQuick)){
  console.error(`Resident Quick actions changed: ${JSON.stringify(quickLabels)}`)
  process.exit(1)
}
for(const duplicate of ['Home','Gate','Services','Community','Profile']){
  if(quickLabels.includes(duplicate)){
    console.error(`Resident Quick actions duplicates persistent navigation: ${duplicate}`)
    process.exit(1)
  }
}

const assistantIndex=residentHome.indexOf('_AssistantEntryCard(onTap: onOpenAi)')
if(assistantIndex<0||assistantIndex>quickStart){
  console.error('AI Assistant must remain a contextual Home entry above Quick actions')
  process.exit(1)
}

console.log('V4.23 Resident/Guard presentation and navigation contract passed')
