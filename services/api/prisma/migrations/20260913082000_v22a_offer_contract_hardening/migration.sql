ALTER TYPE "ServiceOfferDiscountType" ADD VALUE IF NOT EXISTS 'FIXED_PRICE';
ALTER TYPE "ServiceOfferDiscountType" ADD VALUE IF NOT EXISTS 'BUNDLE';

ALTER TABLE "ServiceOffer"
  ADD COLUMN "categoryId" uuid,
  ADD COLUMN "societyId" uuid,
  ADD COLUMN "postalCode" varchar(16),
  ADD COLUMN "bundleLabel" text;

ALTER TABLE "ServiceOffer"
  ADD CONSTRAINT "ServiceOffer_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "ServiceCategory"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "ServiceOffer_societyId_fkey"
    FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "ServiceOffer_bundle_label_check"
    CHECK ("discountType" <> 'BUNDLE' OR ("bundleLabel" IS NOT NULL AND length(trim("bundleLabel")) > 0));

CREATE INDEX "ServiceOffer_category_status_window_idx"
  ON "ServiceOffer" ("categoryId", "status", "startsAt", "endsAt");
CREATE INDEX "ServiceOffer_society_status_window_idx"
  ON "ServiceOffer" ("societyId", "status", "startsAt", "endsAt");
CREATE INDEX "ServiceOffer_postal_status_window_idx"
  ON "ServiceOffer" ("postalCode", "status", "startsAt", "endsAt");
