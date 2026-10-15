# V2 Governance Polls and Election Safety Boundary

Status: V2.3 implementation note

## Current supported workflow

Aaraagate supports non-statutory community polls for advisory and survey use. These polls are deliberately marked `statutoryUseProhibited=true` and are not a substitute for an AGM/SGM resolution process, statutory election, legally binding ballot, or any society process whose validity depends on applicable law, registered bye-laws, quorum, voter eligibility, proxy rules, weighted ownership, secret-ballot rules, or independent scrutiny.

Community poll behavior:
- one response per authenticated society user per poll;
- response option must belong to the same poll;
- responses are accepted only while the poll is OPEN and inside its configured time window;
- lifecycle changes are serialized with a database row lock inside one transaction;
- closed-poll results expose aggregate option counts only and do not expose voter identities;
- live results are not exposed while voting is open;
- statutory/non-community polls cannot be operated through the community-poll participation or lifecycle endpoints.

## Statutory/election workflow remains disabled

The V2 program permits optional election support only where the society's governing framework allows it. Aaraagate must not enable statutory voting merely by adding an `ELECTION` poll type.

Before statutory/election voting is enabled, a separate implementation must define and test at minimum:
- society-level policy enablement with a recorded policy/bye-law reference;
- eligible-electorate snapshot at ballot opening time;
- owner/occupant eligibility rules without assuming a nationwide default;
- joint-ownership, proxy, nomination, disqualification and weighted-vote rules only where configured;
- quorum/turnout semantics and evidence;
- secret-ballot/privacy model where required;
- immutable ballot and lifecycle audit evidence without exposing vote choice to ordinary administrators;
- challenge/recount/cancellation handling;
- role separation for ballot setup, opening/closing and result certification;
- migration, tenant-isolation, authorization and abuse-case tests.

Until those controls exist, statutory voting must fail closed.
