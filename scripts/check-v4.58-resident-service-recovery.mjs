import fs from 'node:fs';

const read=(p)=>fs.readFileSync(p,'utf8');
const must=(label,source,tokens)=>{
  const missing=tokens.filter((token)=>!source.includes(token));
  if(missing.length){
    console.error(label+' missing: '+missing.join(', '));
    process.exit(1);
  }
};

must('V4.58 resident controller',read('services/api/src/helpdesk/helpdesk.controller.ts'),[
  "@Post(':ticketId/reopen')",
  'AppPermission.HELPDESK_MANAGE_OWN',
  'this.helpdesk.reopenMine',
]);
must('V4.58 resident transactional ownership',read('services/api/src/helpdesk/helpdesk.service.ts'),[
  'async reopenMine',
  'FROM "UnitOccupancy" uo',
  'uo."active" = true',
  'uo."effectiveFrom" <= CURRENT_TIMESTAMP',
  'FOR UPDATE',
  "'REOPENED'",
  'reopenLocked',
]);
must('V4.58 Resident repository',read('apps/resident/lib/data/resident_repository.dart'),[
  "api.post('/api/v1/helpdesk/$ticketId/reopen'",
  "'note': note.trim()",
]);
must('V4.58 Resident recovery UI',read('apps/resident/lib/screens/helpdesk_screen.dart'),[
  "status == 'RESOLVED' || status == 'CLOSED'",
  "labelText: 'Why are you reopening this complaint?'",
  "'Reopen complaint'",
  'reopenHelpdeskTicket',
]);
must('V4.58 API regression',read('services/api/src/helpdesk/helpdesk.service.spec.ts'),[
  'scopes resident reopen to current occupancy inside the locked transaction',
  'records an audited REOPENED event for an owned resolved ticket',
]);
must('V4.58 Resident regression',read('apps/resident/test/helpdesk_service_recovery_test.dart'),[
  "expect(repository.reopenCalls,1)",
  "expect(repository.reopenReason,'The leak has returned')",
]);
must('V4.58 booking cancellation controller',read('services/api/src/services-marketplace/consumer-bookings.controller.ts'),[
  'class ConsumerBookingCancelDto',
  '@MinLength(3) @MaxLength(500) reason',
  'dto.reason',
]);
must('V4.58 booking cancellation transaction',read('services/api/src/services-marketplace/consumer-bookings.service.ts'),[
  'Cancellation reason must be between 3 and 500 characters',
  '"note", "occurredAt"',
  '${normalizedReason}, CURRENT_TIMESTAMP',
  'FOR UPDATE',
]);
must('V4.58 booking cancellation UI',read('apps/resident/lib/screens/consumer_bookings_screen.dart'),[
  "labelText: 'Why are you cancelling?'",
  "'Review & cancel'",
  "{'reason': reason}",
  'Reason saved to the timeline.',
]);
must('V4.58 booking cancellation regression',read('services/api/src/services-marketplace/consumer-bookings.service.spec.ts'),[
  "expect(sqlText(cancellationEvent)).toContain('\"note\"')",
  "expect(sqlValues(cancellationEvent)).toContain('Plans changed')",
  'rejects a cancellation without a meaningful reason before locking the booking',
]);
must('V4.58 development truth',read('docs/AARAAGATE-V4.58-RESIDENT-SERVICE-RECOVERY.md'),[
  'release identity remains 4.57.0',
  'does not claim a 4.58.0 release',
  'current-occupancy',
  'Audited service-booking cancellation reason',
]);
console.log('V4.58 Resident service-recovery development contract: PASS');
