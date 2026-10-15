# Repository Governance

Status reviewed: 2026-10-06

## Protected branches

GitHub repository rulesets were verified live for the canonical Aaraagate branches.

- **develop** — active ruleset; pull request required; strict Repository structure, API validation, Admin validation, Flutter validation and Dependency security checks; no bypass actors.
- **staging** — active ruleset; pull request required; Staging API smoke required; no bypass actors.
- **main** — active ruleset; pull request required; strict five engineering checks; one approving review; last-push approval; no bypass actors.

Source-code release scripts remain subordinate to these GitHub controls.

## Visibility and software-license decision

The repository is currently public and no software license file is present.

Aaraagate must not infer an open-source license merely from public GitHub visibility. No license or visibility change is made automatically because that is an owner/legal policy decision.

Before production launch, the release owner must explicitly choose one of the following and record the decision:

1. keep the repository public and publish the intended software-license terms; or
2. make the repository private and retain proprietary distribution controls.

Until that decision is made, repository code must not describe itself as open source or licensed for third-party reuse.

## Production boundary

Repository governance does not replace hosted security controls, production secrets management, signed Android distribution, backup/PITR verification, monitoring ownership, external-provider validation or field-pilot acceptance.
