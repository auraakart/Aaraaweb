# Aaraagate V4.86.1 — Assistant UX & Voice Hardening

Date: 2026-10-07

## Objective

V4.86.1 refines the Resident Aaraagate Assistant into a premium, scan-friendly surface and fixes the unreliable Resident speech-to-text flow without changing assistant authority, tenant scope, property scope, complaint confirmation rules or any production-hosting boundary.

## Premium Assistant UX

The Resident Assistant now keeps only the information required for the immediate task:

- a short “How can I help?” introduction;
- five compact quick actions for maintenance dues, open complaints, today’s visitor/staff activity, amenities and society updates;
- a corrected native-language selector;
- one simple voice action labelled “Speak” in the selected language;
- the question field, primary Ask action and explicit Create complaint action;
- a concise answer card plus compact source context.

Raw transport/debug-style fact keys are no longer rendered to residents. Structured facts remain available to the application response contract but are not exposed as key/value dumps in the Assistant UI.

## Speech reliability

The shared Resident speech helper now:

- initializes the speech plugin once per helper lifecycle instead of on every tap;
- resolves the requested language against speech-recognition locales actually installed on the device;
- falls back to the system or available locale when the exact Indian locale identifier is unavailable;
- enables partial results and preserves the latest usable transcript if recognition ends without a final result;
- completes cleanly when Android reports done/not-listening or an error occurs;
- keeps manual typing available when speech recognition is unavailable.

The Android demo packaging continues to enforce RECORD_AUDIO and speech-recognition query declarations.

## Language wording

The selector uses:

- English
- हिंदी
- தமிழ்
- తెలుగు
- ಕನ್ನಡ
- മലയാളം
- मराठी
- বাংলা

The previous “Ask by voice” wording is replaced by the simpler “Speak” concept, with equivalent concise native-language actions and clearer listening/review/fallback messages.

## Safety and authority boundary

No autonomous mutation is introduced.

- Assistant answers remain permission- and property-scoped.
- Voice only fills text; it does not submit, pay, approve or mutate data.
- Create complaint still uses the existing prepare → review → explicit confirmation workflow.
- No owner/current-occupant authority, gate authority, payment authority or tenant-isolation rule changes.
- Hosting/provider deployment and live external-provider certification remain outside this subversion.

## Validation

Focused coverage includes:

- Assistant premium UI and absence of raw fact-key rendering;
- voice transcript filling without automatic submission;
- explicit complaint confirmation;
- proposal invalidation after source-text edits;
- corrected eight-language labels/action copy;
- locale-selection fallback behavior;
- deterministic manual fallback through SilentResidentSpeech.

Root/API/Admin identify as 4.86.1 and Resident/Guard as 4.86.1+48601.
