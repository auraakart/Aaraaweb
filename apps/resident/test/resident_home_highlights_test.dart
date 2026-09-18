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
}
