CREATE TABLE "SocietyResponsibilityAssignment" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "responsibility" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SocietyResponsibilityAssignment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SocietyResponsibilityAssignment_responsibility_check" CHECK ("responsibility" IN ('READ_ONLY_AUDITOR')),
  CONSTRAINT "SocietyResponsibilityAssignment_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SocietyResponsibilityAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "SocietyResponsibilityAssignment_society_user_responsibility_key"
  ON "SocietyResponsibilityAssignment"("societyId", "userId", "responsibility");

CREATE INDEX "SocietyResponsibilityAssignment_society_responsibility_active_idx"
  ON "SocietyResponsibilityAssignment"("societyId", "responsibility", "active");

CREATE INDEX "SocietyResponsibilityAssignment_user_active_idx"
  ON "SocietyResponsibilityAssignment"("userId", "active");
