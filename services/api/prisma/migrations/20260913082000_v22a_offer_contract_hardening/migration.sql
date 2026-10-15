ALTER TYPE "ServiceOfferDiscountType" ADD VALUE IF NOT EXISTS 'FIXED_PRICE';
ALTER TYPE "ServiceOfferDiscountType" ADD VALUE IF NOT EXISTS 'BUNDLE';

-- PostgreSQL requires newly-added enum values to be committed before they can
-- be referenced by constraints. Keep this migration focused on introducing the
-- enum values; the structural offer-targeting changes follow in the next
-- migration so clean deploys and backup/restore drills remain transaction-safe.
