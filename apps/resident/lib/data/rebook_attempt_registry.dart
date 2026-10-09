import 'dart:convert';
import 'dart:math';

/// Keeps a stable request identity for an uncertain repeat-booking write.
/// No booking or payment is persisted here; the server remains authoritative.
class RebookAttemptRegistry {
  final _keys = <String, String>{};

  String _identity({
    required String bookingId,
    required DateTime scheduledFrom,
    required DateTime scheduledUntil,
  }) =>
      '$bookingId|${scheduledFrom.toUtc().toIso8601String()}|${scheduledUntil.toUtc().toIso8601String()}';

  String keyFor({
    required String bookingId,
    required DateTime scheduledFrom,
    required DateTime scheduledUntil,
  }) {
    final identity = _identity(
      bookingId: bookingId,
      scheduledFrom: scheduledFrom,
      scheduledUntil: scheduledUntil,
    );
    return _keys.putIfAbsent(identity, () {
      final random = Random.secure();
      final bytes = List<int>.generate(18, (_) => random.nextInt(256));
      return base64Url.encode(bytes).replaceAll('=', '');
    });
  }

  void confirmed({
    required String bookingId,
    required DateTime scheduledFrom,
    required DateTime scheduledUntil,
  }) {
    _keys.remove(_identity(
      bookingId: bookingId,
      scheduledFrom: scheduledFrom,
      scheduledUntil: scheduledUntil,
    ));
  }
}
