import 'package:aaraagate_resident/data/resident_home_highlights.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('prioritizes overdue dues and acknowledgement notices without crossing data sources', () {
    final items = ResidentHomeHighlights.build(
      now: DateTime(2026, 9, 18),
      invoices: [
        {'status': 'ISSUED', 'amountPaise': 125000, 'dueDate': '2026-09-10'},
        {'status': 'PAID', 'amountPaise': 990000, 'dueDate': '2026-09-01'},
      ],
      bookings: [
        {'status': 'CONFIRMED', 'scheduledFrom': '2026-09-19T10:00:00Z', 'offering': {'name': 'AC service'}},
      ],
      notices: [
        {'title': 'Water shutdown', 'publishedAt': '2026-09-18T08:00:00Z', 'requiresAcknowledgement': true},
      ],
    );

    expect(items.map((item) => item.kind), [
      ResidentHomeHighlightKind.billing,
      ResidentHomeHighlightKind.notice,
      ResidentHomeHighlightKind.service,
    ]);
    expect(items.first.title, contains('₹1250.00'));
    expect(items.first.urgency, ResidentHomeUrgency.immediate);
    expect(items[1].urgency, ResidentHomeUrgency.soon);
    expect(items.any((item) => item.title.contains('9900')), isFalse);
  });

  test('does not surface completed services or settled invoices as next actions', () {
    final items = ResidentHomeHighlights.build(
      now: DateTime(2026, 9, 18),
      invoices: [{'status': 'PAID', 'amountPaise': 100000, 'dueDate': '2026-09-01'}],
      bookings: [{'status': 'COMPLETED', 'scheduledFrom': '2026-09-17T10:00:00Z'}],
      notices: const [],
    );
    expect(items, isEmpty);
  });

  test('uses scheduledFrom for upcoming service ordering', () {
    final items = ResidentHomeHighlights.build(
      now: DateTime(2026, 9, 18),
      invoices: const [],
      notices: const [],
      bookings: [
        {'status': 'CONFIRMED', 'scheduledFrom': '2026-09-20T10:00:00Z', 'offering': {'name': 'Later'}},
        {'status': 'REQUESTED', 'scheduledFrom': '2026-09-19T10:00:00Z', 'offering': {'name': 'Sooner'}},
      ],
    );
    expect(items.single.title, 'Sooner');
  });

  test('surfaces high-priority helpdesk work ahead of routine updates', () {
    final items = ResidentHomeHighlights.build(
      now: DateTime(2026, 9, 18),
      invoices: const [],
      bookings: const [],
      notices: const [{'title': 'Pool cleaning', 'createdAt': '2026-09-18T08:00:00Z'}],
      tickets: const [
        {'title': 'Lift trapped intermittently', 'status': 'OPEN', 'priority': 'HIGH', 'updatedAt': '2026-09-18T09:00:00Z'},
      ],
    );
    expect(items.first.kind, ResidentHomeHighlightKind.helpdesk);
    expect(items.first.title, 'Lift trapped intermittently');
    expect(items.first.urgency, ResidentHomeUrgency.soon);
  });

  test('surfaces the latest unresolved payment attempt when it is more actionable than the due reminder', () {
    final items = ResidentHomeHighlights.build(
      now: DateTime(2026, 9, 18),
      invoices: const [
        {'id': 'invoice-a', 'status': 'ISSUED', 'amountPaise': 125000, 'dueDate': '2026-09-25'},
      ],
      payments: const [
        {'id': 'payment-new', 'invoiceId': 'invoice-a', 'status': 'FAILED', 'amountPaise': 125000, 'createdAt': '2026-09-18T10:00:00Z'},
        {'id': 'payment-old', 'invoiceId': 'invoice-a', 'status': 'AUTHORIZED', 'amountPaise': 125000, 'createdAt': '2026-09-18T09:00:00Z'},
      ],
      bookings: const [],
      notices: const [],
    );

    expect(items.single.kind, ResidentHomeHighlightKind.billing);
    expect(items.single.title, 'Payment needs attention · ₹1250.00');
    expect(items.single.subtitle, contains('retry from Billing'));
    expect(items.single.urgency, ResidentHomeUrgency.immediate);
  });

  test('ignores payment recovery history once the invoice is settled', () {
    final items = ResidentHomeHighlights.build(
      now: DateTime(2026, 9, 18),
      invoices: const [
        {'id': 'invoice-a', 'status': 'PAID', 'amountPaise': 125000, 'dueDate': '2026-09-10'},
      ],
      payments: const [
        {'id': 'payment-old', 'invoiceId': 'invoice-a', 'status': 'FAILED', 'amountPaise': 125000, 'createdAt': '2026-09-17T09:00:00Z'},
      ],
      bookings: const [],
      notices: const [],
    );

    expect(items, isEmpty);
  });

  test('acknowledged required notice no longer remains a soon action', () {
    final items = ResidentHomeHighlights.build(
      now: DateTime(2026, 9, 18),
      invoices: const [],
      bookings: const [],
      notices: const [
        {
          'id': 'notice-a',
          'title': 'Water shutdown',
          'publishedAt': '2026-09-18T08:00:00Z',
          'requiresAcknowledgement': true,
          'acknowledgedAt': '2026-09-18T09:00:00Z',
        },
      ],
    );

    expect(items.single.kind, ResidentHomeHighlightKind.notice);
    expect(items.single.subtitle, 'Acknowledged');
    expect(items.single.urgency, ResidentHomeUrgency.info);
  });
}
