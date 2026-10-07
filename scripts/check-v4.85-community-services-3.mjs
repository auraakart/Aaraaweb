import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(path, 'utf8');
const atLeast = (value, floor) => {
  const nums = String(value).match(/\d+/g)?.map(Number) ?? [];
  return floor.every((n, i) => (nums[i] ?? 0) > n || ((nums[i] ?? 0) === n && floor.slice(i + 1).every((m, j) => (nums[i + 1 + j] ?? 0) >= m)));
};

const migration=read('services/api/prisma/migrations/20261007170000_v485_community_services_3/migration.sql');
const trust=read('services/api/src/services-marketplace/service-provider-society-trust.service.ts');
const community=read('services/api/src/services-marketplace/community-services-3.service.ts');
const controller=read('services/api/src/services-marketplace/community-services-3.controller.ts');
const moduleSource=read('services/api/src/services-marketplace/services-marketplace.module.ts');
const operations=read('services/api/src/services-marketplace/services-marketplace-operations.service.ts');
const consumerLocation=read('services/api/src/services-marketplace/consumer-service-location.service.ts');
const resident=read('apps/resident/lib/screens/independent_services_screen.dart');
const booking=read('apps/resident/lib/screens/consumer_booking_screen.dart');
const storefront=read('apps/resident/lib/screens/provider_storefront_sheet.dart');
const providerPortal=read('apps/admin/app/provider/page.tsx');
const adminMarketplace=read('apps/admin/app/admin-commerce-panels.tsx');
const root=JSON.parse(read('package.json'));
const api=JSON.parse(read('services/api/package.json'));
const admin=JSON.parse(read('apps/admin/package.json'));
const residentPub=read('apps/resident/pubspec.yaml');
const guardPub=read('apps/guard/pubspec.yaml');

for (const table of ['ServiceOfferingExperiencePolicy','ConsumerServiceRecurringPlan','CommunityServiceCampaign','CommunityServiceCampaignInterest']) {
  assert.ok(migration.includes(`CREATE TABLE "${table}"`), `missing V4.85 table ${table}`);
}
assert.ok(migration.includes('CommunityServiceCampaignInterest_campaign_unit_key'),'community interest must be household-unit unique');
assert.ok(migration.includes('"targetArrivalMinutes" BETWEEN 15 AND 240'),'Quick target must stay bounded');
assert.ok(trust.includes('completedJobs >= 5')&&trust.includes('ratingAverage >= 4.2'),'Society Trusted must stay evidence-derived');
assert.ok(trust.includes('cancellationRate <= 0.15'),'Society Trusted cancellation threshold missing');
assert.ok(trust.includes('onTimeRate ?? 0')&&trust.includes('>= 0.8'),'Society Trusted arrival evidence threshold missing');
assert.ok(community.includes('Provider has not enabled this recurring cadence'),'Recurring preferences must respect provider policy');
assert.ok(community.includes('Locked community service deals cannot be withdrawn'),'Locked community deal withdrawal guard missing');
assert.ok(community.includes('Community resident price must be between zero and the normal service price'),'Community price ceiling missing');
assert.ok(controller.includes("Controller('consumer/services')"),'Consumer V4.85 routes missing');
assert.ok(controller.includes("Controller('provider/services/offerings')"),'Provider experience-policy routes missing');
assert.ok(controller.includes("Controller('services-marketplace/community-deals')"),'Society campaign routes missing');
assert.ok(moduleSource.includes('CommunityServices3Service')&&moduleSource.includes('ServiceProviderSocietyTrustService'),'V4.85 services not wired');
assert.ok(operations.includes('societyTrusted')&&operations.includes('experiencePolicy'),'Society service discovery enrichment missing');
assert.ok(consumerLocation.includes('ServiceOfferingExperiencePolicy')&&consumerLocation.includes('societyTrusted'),'Consumer discovery enrichment missing');
assert.ok(resident.includes('Community deals')&&resident.includes('Society Trusted')&&resident.includes('Recurring'),'Resident V4.85 discovery controls missing');
assert.ok(booking.includes('does not auto-book or auto-charge'),'Recurring safety copy missing');
assert.ok(storefront.includes('Price & service promise')&&storefront.includes('Society Trusted'),'Provider storefront transparency missing');
assert.ok(providerPortal.includes('Save service promise')&&providerPortal.includes('Warranty days'),'Provider service-promise controls missing');
assert.ok(adminMarketplace.includes('Society Service Day')&&adminMarketplace.includes('Publish community deal'),'Society campaign controls missing');

assert.ok(atLeast(root.version,[4,85,0]),'Root release identity must be V4.85.0+');
assert.equal(api.version,root.version,'API version must match root');
assert.equal(admin.version,root.version,'Admin version must match root');
for(const [path,content] of [['resident',residentPub],['guard',guardPub]]){
  assert.ok(content.includes('version: 4.85.0+48500'),`${path} release identity must be V4.85.0+48500`);
}
console.log('V4.85 Community Services 3.0 contract OK');
