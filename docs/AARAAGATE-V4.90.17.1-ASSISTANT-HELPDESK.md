# V4.90.17.1 — Assistant and Helpdesk complaint-entry separation

Complaint creation is owned by Helpdesk. The Resident Assistant no longer displays the permanent **Create complaint** action, or the contextual **Prepare complaint for review** action. Its unused proposal creation and confirmation code is removed. Read-only **Open complaints** is retained. Explicit create-complaint prompts can offer only **Open Helpdesk** navigation when a section callback exists; existing **Report in Helpdesk** feedback navigation remains.

The actual **New complaint** and **Submit complaint** workflow remains in `apps/resident/lib/screens/helpdesk_screen.dart`, including its validations and creation idempotency. There are no Helpdesk or backend changes.

Widget regression covers read-only status, no Assistant mutation calls, safe optional navigation and stale-question invalidation. Require the exact-head Flutter validation, widget tests, coverage and required CI gates before merging develop. Staging/main unchanged. The planned V4.90.18 Services 3.1 milestone is separate.
