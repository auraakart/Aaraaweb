# Aaraagate V4.80.2 — Society Knowledge Relevance Hardening

Date: 2026-09-29

## Objective

Improve the deterministic relevance of the existing Society Knowledge AI retrieval path without adding a vector database, external RAG provider, OCR dependency, hidden-document access or a second document authority.

## Implemented

- Query normalization still supports the existing Latin and Indian-script character ranges.
- Generic English intent/glue terms such as society, policy, document, show and common question words are removed when the query also contains distinctive terms.
- Generic-only queries fall back to their original normalized tokens so broad document discovery is not silently disabled.
- Long queries with four or more distinctive terms require at least two matching terms before a document can enter the final result set.
- Results are ranked first by distinctive-term coverage, then by the existing title/description/content weighting, then by publication recency.
- Each returned match now exposes matchedTerms, queryTermCount and coveragePercent as deterministic relevance evidence.
- The existing maximum of five results, published-version rule and document-audience authorization remain unchanged.

## Safety and authority boundary

This hardening changes retrieval relevance only. It does not summarize documents with an external model, infer legal meaning, bypass audience rules, search unpublished versions, mutate document state or widen AI permissions. The assistant must still return the existing no-source boundary when no eligible published match remains.

## Regression evidence

API unit coverage verifies that generic intent terms do not dominate retrieval when distinctive terms are present, weak one-term matches are rejected for longer queries, higher-coverage sources outrank newer weak sources, and generic-only queries retain a fallback path.
