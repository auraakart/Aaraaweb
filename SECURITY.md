# Security Policy

## Supported baseline

Security fixes are evaluated against the current protected Aaraagate release branches. Reproduce a suspected issue against the latest approved source before reporting it when possible.

## Reporting a vulnerability

Do not post credentials, tokens, resident data, payment evidence, access credentials, private documents, or exploitable security details in a public issue.

Use GitHub private vulnerability reporting / a private Security Advisory when that facility is available. Otherwise, contact the repository owner through an established private project channel before sharing sensitive evidence.

Include only the minimum evidence needed to reproduce the issue:

- affected release or commit SHA;
- affected application/API path;
- reproduction steps using synthetic data;
- expected versus observed authorization boundary;
- impact and whether cross-society, payment, gate, privacy, or account data is involved.

Never use real resident personal data to demonstrate a vulnerability.

## Handling rules

- Keep tenant/society boundaries intact while reproducing issues.
- Do not weaken authentication, authorization, audit, payment verification, or gate segregation merely to make a test pass.
- Secrets belong in approved external secret stores, never Git.
- Suspected credential exposure requires credential rotation in addition to code remediation.
- Security fixes must pass the normal protected CI/security gates before promotion.

## Scope

This policy describes repository security handling. It does not claim a bug-bounty program, response-time SLA, hosted production monitoring, or production incident-response capability.
