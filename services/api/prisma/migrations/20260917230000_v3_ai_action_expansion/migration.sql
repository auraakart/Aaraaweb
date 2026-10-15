ALTER TABLE "AiOperationProposal"
  DROP CONSTRAINT "AiOperationProposal_action_check";

ALTER TABLE "AiOperationProposal"
  ADD CONSTRAINT "AiOperationProposal_action_check"
  CHECK ("action" IN ('CREATE_HELPDESK_TICKET','BOOK_AMENITY','CREATE_VISITOR_PASS'));
