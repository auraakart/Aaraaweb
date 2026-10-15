import 'resident_repository.dart';

class ResidentGuestInviteAttempt {
  ResidentGuestInviteAttempt({
    required this.signature,
    required this.idempotencyKey,
    required this.validFrom,
    required Duration duration,
  }) : validUntil = validFrom.add(duration);

  final String signature;
  final String idempotencyKey;
  final DateTime validFrom;
  final DateTime validUntil;
}

class ResidentGuestInviteCoordinator {
  ResidentGuestInviteAttempt? _pending;
  Future<Map<String, dynamic>>? _inFlight;
  String? _inFlightSignature;

  Future<Map<String, dynamic>> run({
    required String unitId,
    required String name,
    String? phone,
    String? purpose,
    required Duration duration,
    required Future<Map<String, dynamic>> Function(ResidentGuestInviteAttempt attempt) execute,
  }) {
    final signature = [unitId, name.trim(), phone?.trim() ?? '', purpose?.trim() ?? '', duration.inSeconds.toString()].join('|');
    final inFlight = _inFlight;
    if (inFlight != null) {
      if (_inFlightSignature == signature) return inFlight;
      return Future.error(StateError('Another visitor pass is already being created'));
    }

    final previous = _pending;
    final attempt = previous != null && previous.signature == signature
        ? previous
        : ResidentGuestInviteAttempt(
            signature: signature,
            idempotencyKey: 'resident-visitor-${DateTime.now().microsecondsSinceEpoch}',
            validFrom: DateTime.now(),
            duration: duration,
          );
    _pending = attempt;
    final operation = execute(attempt).then((result) {
      if (identical(_pending, attempt)) _pending = null;
      return result;
    });
    _inFlight = operation;
    _inFlightSignature = signature;
    return operation.whenComplete(() {
      if (identical(_inFlight, operation)) {
        _inFlight = null;
        _inFlightSignature = null;
      }
    });
  }
}

Future<Map<String, dynamic>> executeResidentGuestInvite({
  required ResidentRepository repository,
  required String unitId,
  required String name,
  String? phone,
  String? purpose,
  required ResidentGuestInviteAttempt attempt,
}) async {
  final result = await repository.inviteVisitor(
    unitId: unitId,
    name: name,
    phone: phone,
    purpose: purpose,
    validFrom: attempt.validFrom,
    validUntil: attempt.validUntil,
    idempotencyKey: attempt.idempotencyKey,
  );
  final rawRequest = result['request'];
  final credential = result['credential']?.toString();
  if (rawRequest is! Map || credential == null || credential.isEmpty) {
    throw StateError('Visitor pass was not returned');
  }
  return {'credential': credential, 'request': Map<String, dynamic>.from(rawRequest)};
}
