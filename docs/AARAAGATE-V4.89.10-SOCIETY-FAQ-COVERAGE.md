# V4.89.10 — Common Society Question Coverage

- Extract high-frequency general society question classification into `ai-society-questions.ts` with explicit coverage for shared-facility eligibility/hours, waste segregation, pets, visitor rules, renovation/move-in, emergency contacts, office hours and event policies.
- All new intents reuse the existing audience-filtered, published `SocietyDocumentKnowledge` search; absent documented guidance produces a clear no-evidence response. No default timings, restrictions, fees or contact numbers are invented.
- Private personal requests and unrelated questions do not become society policy queries. Added table-driven resident regression tests for common question phrasings and unsupported privacy-sensitive prompts.
- This is routing/catalog coverage, not a claim of complete society content or a generative chatbot. Curation and publication of society-specific FAQs remain Admin responsibilities.
