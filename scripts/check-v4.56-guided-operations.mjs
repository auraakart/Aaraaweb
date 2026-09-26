import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const must=(label,source,tokens)=>{const missing=tokens.filter(t=>!source.includes(t));if(missing.length){console.error(label+' missing: '+missing.join(', '));process.exit(1)}};
const admin=read('apps/admin/app/admin-overview.tsx');
must('V4.56 Admin guided operations',admin,[
  "actionLabel:'Open Helpdesk',view:'helpdesk'",
  "actionLabel:'Open Finance',href:'/finance'",
  "actionLabel:'Open workforce',href:'/society-workforce'",
  "actionLabel:'Open onboarding',href:'/onboarding'",
  "actionLabel:'Open Billing',view:'billing'",
  "actionLabel:'Open Amenities',href:'/amenities'",
  'if(item.view&&canOpen(item.view))',
  'if(item.href)window.location.href=item.href',
  'It is not predictive scoring and does not mutate any workflow.'
]);
const resident=read('apps/resident/lib/screens/home_screen.dart');
must('V4.56 Resident action clarity',resident,[
  "final urgencyLabel = urgency == ResidentHomeUrgency.immediate ? 'Act now'",
  "semanticLabel: '$urgencyLabel. $title. $subtitle. $actionLabel'",
  'label: urgencyLabel,'
]);
must('V4.56 Resident regression',read('apps/resident/test/home_action_inbox_dedup_test.dart'),[
  'Soon. Water seepage near kitchen. High priority · action in progress. Open helpdesk'
]);
const controller=read('apps/resident/lib/data/resident_data_controller.dart');
must('V4.56 payment-recovery scoping',controller,[
  'List<Map<String, dynamic>> maintenancePayments = const [];',
  "if (!hasFeature('PAYMENTS') || maintenanceInvoices.isEmpty) return;",
  "invoiceIds.contains(item['invoiceId']?.toString())",
  'Payment recovery is optional Home enrichment.'
]);
const highlights=read('apps/resident/lib/data/resident_home_highlights.dart');
must('V4.56 payment-recovery prioritization',highlights,[
  'final recoveryPayments = payments.where',
  "'Payment needs attention'",
  'Previous payment was not confirmed · retry from Billing',
  'Gateway authorization is awaiting final capture · do not pay again yet',
  'recoveryBilling.priority <= invoiceBilling.priority'
]);
must('V4.56 payment-recovery regression',read('apps/resident/test/multi_property_isolation_test.dart'),[
  "maintenancePayments.map((item) => item['id'])",
  'billing without PAYMENTS does not request payment history',
  'expect(repository.paymentCalls, 0)'
]);
const repository=read('apps/resident/lib/data/resident_repository.dart');
must('V4.56 notice acknowledgement repository',repository,[
  "api.patch('/api/v1/notices/$noticeId/acknowledge')"
]);
must('V4.56 notice acknowledgement controller',controller,[
  'Future<void> acknowledgeNotice(String noticeId)',
  "notice['requiresAcknowledgement'] != true",
  "result['acknowledgedAt'] == null",
  'await repository.acknowledgeNotice(noticeId);',
  'await _loadNotices();',
  'Notice acknowledgement could not be confirmed from the refreshed notice state.'
]);
const noticesScreen=read('apps/resident/lib/screens/notices_screen.dart');
must('V4.56 notice acknowledgement UX',noticesScreen,[
  'Acknowledgement required',
  'Acknowledge notice',
  'Notice acknowledged.',
  'Acknowledgement could not be saved. Please retry.',
  'animation: widget.controller'
]);
must('V4.56 acknowledgement state convergence',highlights,[
  'final pendingAcknowledgement = requiresAcknowledgement && !acknowledged;',
  'priority: pendingAcknowledgement ? 1 : 4',
  "'Acknowledged'"
]);
must('V4.56 notice acknowledgement regression',read('apps/resident/test/notices_acknowledgement_test.dart'),[
  'resident reviews and acknowledges a required notice',
  'failed acknowledgement remains retryable'
]);
must('V4.56 development truth',read('docs/AARAAGATE-V4.56-GUIDED-OPERATIONS.md'),[
  'release identity is not yet cut to 4.56.0',
  'performs no workflow mutation',
  'Server-side authorization'
]);
console.log('V4.56 guided operations development contract: PASS');
