import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const must=(label,source,tokens)=>{const missing=tokens.filter(t=>!source.includes(t));if(missing.length){console.error(label+' missing: '+missing.join(', '));process.exit(1)}};

const screen=read('apps/resident/lib/screens/amenities_screen.dart');
must('V4.61 amenity cancellation recovery',screen,[
  '_recoverCancellationFailure(booking, error)',
  'await _load();',
  "return 'Booking changed. Latest status: $status.';",
  "return 'Booking changed and is no longer in your current booking list.';",
  "message.toLowerCase().contains('slot is no longer available')",
  "if (message.isNotEmpty) return message.endsWith('.') ? message : '$message.';"
]);

must('V4.61 amenity cancellation regressions',read('apps/resident/test/amenities_screen_test.dart'),[
  'failed amenity cancellation reloads authoritative booking state before messaging',
  'Booking changed. Latest status: Cancelled.',
  'amenity cancellation cutoff preserves the server conflict reason',
  'Booking cannot be cancelled within 60 minutes of start time.'
]);

must('V4.61 development truth',read('docs/AARAAGATE-V4.61-AMENITY-CANCELLATION-RECOVERY.md'),[
  'runtime identity remains V4.60.0',
  'server rejection remains authoritative',
  'does not claim V4.61.0 release closure'
]);

console.log('V4.61 amenity cancellation recovery development contract: PASS');
