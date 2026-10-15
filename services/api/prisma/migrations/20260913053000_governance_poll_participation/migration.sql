ALTER TABLE "GovernancePollOption"
  ADD CONSTRAINT "GovernancePollOption_id_poll_key" UNIQUE ("id", "pollId");

CREATE TABLE "GovernancePollResponse" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "pollId" UUID NOT NULL,
  "optionId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GovernancePollResponse_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GovernancePollResponse_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "GovernancePoll"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "GovernancePollResponse_option_poll_fkey" FOREIGN KEY ("optionId", "pollId") REFERENCES "GovernancePollOption"("id", "pollId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "GovernancePollResponse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GovernancePollResponse_poll_user_key" UNIQUE ("pollId", "userId")
);

CREATE INDEX "GovernancePollResponse_poll_option_idx" ON "GovernancePollResponse"("pollId", "optionId");
CREATE INDEX "GovernancePollResponse_user_idx" ON "GovernancePollResponse"("userId", "createdAt" DESC);
