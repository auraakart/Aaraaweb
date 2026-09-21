import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('V4.35 marketplace completion contract', () => {
  const root=path.resolve(process.cwd());
  const migration=fs.readFileSync(path.join(root,'prisma/migrations/20260921153000_v435_marketplace_completion/migration.sql'),'utf8');
  const service=fs.readFileSync(path.join(root,'src/services-marketplace/provider-marketplace-completion.service.ts'),'utf8');
  const controller=fs.readFileSync(path.join(root,'src/services-marketplace/provider-marketplace-completion.controller.ts'),'utf8');
  const availability=fs.readFileSync(path.join(root,'src/services-marketplace/consumer-availability.service.ts'),'utf8');
  const providerOps=fs.readFileSync(path.join(root,'src/services-marketplace/consumer-provider-operator.service.ts'),'utf8');
  const consumerBookings=fs.readFileSync(path.join(root,'src/services-marketplace/consumer-bookings.service.ts'),'utf8');
  const privacy=fs.readFileSync(path.join(root,'src/privacy/privacy-subject-data.service.ts'),'utf8');

  it('keeps all V4.35 lifecycle records append-only or explicitly stateful',()=>{
    for(const table of ['ProviderOnboardingApplication','ProviderBookingProposal','ConsumerServiceCompletionEvidence','ConsumerServiceDispute','ConsumerOfferingAvailabilityException','ServiceOfferingProviderEvent']){
      expect(migration).toContain(`CREATE TABLE "${table}"`);
    }
    expect(migration).toContain('ProviderBookingProposal_one_pending_key');
    expect(migration).toContain('ConsumerServiceDispute_one_open_key');
  });

  it('preserves immutable booking price while allowing schedule counter-proposals',()=>{
    expect(service).toContain('CUSTOMER_ACCEPTED_PROVIDER_PROPOSAL');
    expect(service).toContain('"scheduledFrom"=');
    expect(service).toContain('"scheduledUntil"=');
    expect(service).not.toContain('UPDATE "ConsumerServiceBooking" SET "servicePricePaise"');
  });

  it('keeps disputes separate from booking, payment and settlement mutation',()=>{
    expect(controller).toContain("bookings/:id/disputes");
    expect(service).toContain('INSERT INTO "ConsumerServiceDispute"');
    expect(service).not.toContain('UPDATE "ConsumerServicePayment"');
    expect(service).not.toContain('UPDATE "ConsumerProviderSettlement');
  });

  it('applies date exceptions inside the authoritative booking availability path',()=>{
    expect(availability).toContain('ConsumerOfferingAvailabilityException');
    expect(availability).toContain("reason: 'DATE_CLOSED'");
    expect(availability).toContain('Service is closed for the selected date');
  });

  it('prevents counter-proposals from consuming their own booking capacity and withdraws stale proposals',()=>{
    expect(service).toContain('bookingId);');
    expect(availability).toContain('excludeBookingId?: string');
    expect(availability).toContain('"id" <>');
    expect(providerOps).toContain('withdrawPendingBookingProposal');
    expect(consumerBookings).toContain('UPDATE "ProviderBookingProposal"');
    expect(consumerBookings).toContain('"status"=\'WITHDRAWN\'');
  });

  it('prevents a user from acquiring multiple active provider mappings',()=>{
    expect(service).toContain('User already has an active provider operator mapping');
    expect(service).toContain('Applicant already has an active provider operator mapping');
    expect(service).toContain('pg_advisory_xact_lock');
  });

  it('keeps new V4.35 personal-data surfaces inside privacy access and minimisation',()=>{
    for(const table of ['ProviderOnboardingApplication','ProviderBookingProposal','ConsumerServiceCompletionEvidence','ConsumerServiceDispute','ServiceOfferingProviderEvent']){
      expect(privacy).toContain(table);
    }
    expect(privacy).toContain('providerApplicationsMinimised');
    expect(privacy).toContain('bookingProposalsMinimised');
    expect(privacy).toContain('completionEvidenceMinimised');
    expect(privacy).toContain('serviceDisputesMinimised');
  });

  it('requires platform provider verification permission for onboarding review and dispute resolution',()=>{
    const matches=controller.match(/RequiresPermissions\(AppPermission\.PLATFORM_PROVIDER_VERIFY\)/g)??[];
    expect(matches.length).toBeGreaterThanOrEqual(4);
  });
});
