# V2 Emergency Classification Foundation

This slice starts the V2-EMR emergency/incident hardening programme without changing the established SOS authorization model.

## Included
- Emergency category on SOS incidents: `MEDICAL`, `FIRE`, `SECURITY`, `LIFT`, `OTHER`.
- Severity on SOS incidents: `CRITICAL`, `HIGH`, `MEDIUM`.
- Backward-compatible defaults for existing clients: `OTHER` + `HIGH`.
- Society control-room listing prioritizes active incidents, then critical/high/medium severity, then recency.
- Trigger events record the initial category/severity classification for incident-history evidence.
- Existing current-occupancy requirement remains authoritative for resident-triggered SOS.
- Database constraints and an operational query index prevent invalid classifications and support responder queues.

## Deliberately deferred
- configurable escalation timers and responder routing;
- mass emergency broadcast/acknowledgement;
- selected household/family emergency-contact escalation;
- incident assignments/evidence beyond the existing SOS event trail;
- fallback delivery semantics outside normal notification flows.

These follow as separate reviewable V2-EMR batches.
