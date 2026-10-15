-- Aaraagate V4.85 — Community Services 3.0
-- Additive marketplace policy/preferences/campaign tables. Existing booking,
-- payment, gate and provider records remain authoritative.

CREATE TABLE "ServiceOfferingExperiencePolicy" (
  "offeringId" UUID NOT NULL,
  "quickServiceEligible" BOOLEAN NOT NULL DEFAULT false,
  "targetArrivalMinutes" INTEGER,
  "includedWork" TEXT,
  "partsPolicy" TEXT,
  "extraWorkApprovalRequired" BOOLEAN NOT NULL DEFAULT true,
  "recurrenceCadences" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServiceOfferingExperiencePolicy_pkey" PRIMARY KEY ("offeringId"),
  CONSTRAINT "ServiceOfferingExperiencePolicy_quick_target_check"
    CHECK (
      ("quickServiceEligible" = false AND "targetArrivalMinutes" IS NULL)
      OR
      ("quickServiceEligible" = true AND "targetArrivalMinutes" BETWEEN 15 AND 240)
    ),
  CONSTRAINT "ServiceOfferingExperiencePolicy_recurrence_array_check"
    CHECK (jsonb_typeof("recurrenceCadences") = 'array')
);

ALTER TABLE "ServiceOfferingExperiencePolicy"
  ADD CONSTRAINT "ServiceOfferingExperiencePolicy_offering_fkey"
  FOREIGN KEY ("offeringId") REFERENCES "ServiceOffering"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ConsumerServiceRecurringPlan" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "offeringId" UUID NOT NULL,
  "locationType" VARCHAR(20) NOT NULL,
  "locationId" UUID NOT NULL,
  "locationLabel" TEXT NOT NULL,
  "cadence" VARCHAR(20) NOT NULL,
  "preferredWeekday" SMALLINT,
  "preferredTime" TIME,
  "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConsumerServiceRecurringPlan_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConsumerServiceRecurringPlan_location_type_check"
    CHECK ("locationType" IN ('HOME','SOCIETY_UNIT')),
  CONSTRAINT "ConsumerServiceRecurringPlan_cadence_check"
    CHECK ("cadence" IN ('WEEKLY','FORTNIGHTLY','MONTHLY','QUARTERLY')),
  CONSTRAINT "ConsumerServiceRecurringPlan_weekday_check"
    CHECK ("preferredWeekday" IS NULL OR "preferredWeekday" BETWEEN 1 AND 7),
  CONSTRAINT "ConsumerServiceRecurringPlan_status_check"
    CHECK ("status" IN ('ACTIVE','PAUSED','CANCELLED'))
);

ALTER TABLE "ConsumerServiceRecurringPlan"
  ADD CONSTRAINT "ConsumerServiceRecurringPlan_user_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConsumerServiceRecurringPlan"
  ADD CONSTRAINT "ConsumerServiceRecurringPlan_offering_fkey"
  FOREIGN KEY ("offeringId") REFERENCES "ServiceOffering"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "ConsumerServiceRecurringPlan_active_identity_key"
  ON "ConsumerServiceRecurringPlan"("userId","offeringId","locationType","locationId")
  WHERE "status" IN ('ACTIVE','PAUSED');
CREATE INDEX "ConsumerServiceRecurringPlan_user_status_idx"
  ON "ConsumerServiceRecurringPlan"("userId","status","updatedAt" DESC);

CREATE TABLE "CommunityServiceCampaign" (
  "id" UUID NOT NULL,
  "societyId" UUID NOT NULL,
  "offeringId" UUID NOT NULL,
  "createdByUserId" UUID NOT NULL,
  "title" VARCHAR(140) NOT NULL,
  "description" TEXT,
  "serviceDate" TIMESTAMPTZ(6) NOT NULL,
  "joinEndsAt" TIMESTAMPTZ(6) NOT NULL,
  "thresholdHomes" INTEGER NOT NULL,
  "maxHomes" INTEGER,
  "residentPricePaise" INTEGER NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'OPEN',
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommunityServiceCampaign_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CommunityServiceCampaign_threshold_check" CHECK ("thresholdHomes" BETWEEN 2 AND 5000),
  CONSTRAINT "CommunityServiceCampaign_max_check" CHECK ("maxHomes" IS NULL OR "maxHomes" >= "thresholdHomes"),
  CONSTRAINT "CommunityServiceCampaign_price_check" CHECK ("residentPricePaise" >= 0),
  CONSTRAINT "CommunityServiceCampaign_dates_check" CHECK ("joinEndsAt" < "serviceDate"),
  CONSTRAINT "CommunityServiceCampaign_status_check" CHECK ("status" IN ('OPEN','LOCKED','CANCELLED','COMPLETED'))
);

ALTER TABLE "CommunityServiceCampaign"
  ADD CONSTRAINT "CommunityServiceCampaign_society_fkey"
  FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommunityServiceCampaign"
  ADD CONSTRAINT "CommunityServiceCampaign_offering_fkey"
  FOREIGN KEY ("offeringId") REFERENCES "ServiceOffering"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommunityServiceCampaign"
  ADD CONSTRAINT "CommunityServiceCampaign_creator_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "CommunityServiceCampaign_society_status_join_idx"
  ON "CommunityServiceCampaign"("societyId","status","joinEndsAt");
CREATE INDEX "CommunityServiceCampaign_offering_date_idx"
  ON "CommunityServiceCampaign"("offeringId","serviceDate");

CREATE TABLE "CommunityServiceCampaignInterest" (
  "id" UUID NOT NULL,
  "campaignId" UUID NOT NULL,
  "societyId" UUID NOT NULL,
  "unitId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'JOINED',
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommunityServiceCampaignInterest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CommunityServiceCampaignInterest_status_check" CHECK ("status" IN ('JOINED','WITHDRAWN'))
);

ALTER TABLE "CommunityServiceCampaignInterest"
  ADD CONSTRAINT "CommunityServiceCampaignInterest_campaign_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "CommunityServiceCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommunityServiceCampaignInterest"
  ADD CONSTRAINT "CommunityServiceCampaignInterest_society_fkey"
  FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommunityServiceCampaignInterest"
  ADD CONSTRAINT "CommunityServiceCampaignInterest_unit_fkey"
  FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommunityServiceCampaignInterest"
  ADD CONSTRAINT "CommunityServiceCampaignInterest_user_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "CommunityServiceCampaignInterest_campaign_unit_key"
  ON "CommunityServiceCampaignInterest"("campaignId","unitId");
CREATE INDEX "CommunityServiceCampaignInterest_society_campaign_status_idx"
  ON "CommunityServiceCampaignInterest"("societyId","campaignId","status");
CREATE INDEX "CommunityServiceCampaignInterest_user_created_idx"
  ON "CommunityServiceCampaignInterest"("userId","createdAt" DESC);
