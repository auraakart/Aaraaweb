import 'package:flutter_test/flutter_test.dart';
import 'package:aaraagate_resident/data/rebook_attempt_registry.dart';

void main() {
  test('retries use the same key for the same original booking and schedule', () {
    final registry = RebookAttemptRegistry();
    final from = DateTime.utc(2026, 11, 2, 10);
    final until = from.add(const Duration(hours: 1));

    final first = registry.keyFor(bookingId: 'old-booking', scheduledFrom: from, scheduledUntil: until);
    final retry = registry.keyFor(
      bookingId: 'old-booking',
      scheduledFrom: from.toLocal(),
      scheduledUntil: until.toLocal(),
    );

    expect(retry, first);
    expect(first.length, inInclusiveRange(8, 100));
    expect(registry.keyFor(bookingId: 'other-booking', scheduledFrom: from, scheduledUntil: until), isNot(first));
    expect(registry.keyFor(bookingId: 'old-booking', scheduledFrom: from.add(const Duration(hours: 1)), scheduledUntil: until.add(const Duration(hours: 1))), isNot(first));

    registry.confirmed(bookingId: 'old-booking', scheduledFrom: from, scheduledUntil: until);
    expect(registry.keyFor(bookingId: 'old-booking', scheduledFrom: from, scheduledUntil: until), isNot(first));
  });
}
