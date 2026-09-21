# Aaraagate V4.29.8 — Pilot Evidence Capture Helper

Status: repository helper implemented; no field evidence is claimed.

The V4.28 manifest remains the source of truth for pilot KPI, role-script, external-proof, training and sign-off requirements. This helper validates individual non-sensitive evidence records before an operator references them from the manifest.

## Usage

Run:

`node scripts/check-v4.29-pilot-evidence-capture.mjs path/to/non-sensitive-evidence-record.json`

A record must identify the pilot, exact candidate SHA, manifest reference, responsible role, measurement window, expected threshold, observed result, disposition and a non-sensitive artifact reference.

The validator rejects common personal-data or credential field names and obvious credential-like values. It is a repository guardrail, not a substitute for privacy review.

The checked-in example is deliberately synthetic and cannot be treated as field evidence. The canonical `docs/v4.28-pilot-evidence.json` remains `PENDING_EXTERNAL` until a real named pilot supplies evidence through the controlled process.
