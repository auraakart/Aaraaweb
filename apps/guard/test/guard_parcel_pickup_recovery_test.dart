import 'package:aaraagate_guard/data/guard_api.dart';
import 'package:aaraagate_guard/data/parcel_pickup_recovery.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('maps pickup-code failures to safe operational recovery', () {
    expect(
      guardParcelPickupRecovery(GuardApiException('Pickup code has not been issued')),
      contains('Ask the resident to generate a pickup code'),
    );
    expect(
      guardParcelPickupRecovery(GuardApiException('Pickup code has expired; resident must generate a new code')),
      contains('generate a new pickup code'),
    );
    expect(
      guardParcelPickupRecovery(GuardApiException('Pickup code locked after too many attempts')),
      contains('locked after too many attempts'),
    );
    expect(
      guardParcelPickupRecovery(GuardApiException('Invalid pickup code')),
      contains('Repeated failures can lock the code'),
    );
    expect(
      guardParcelPickupRecovery(GuardApiException('network down', transport: true)),
      contains('could not reach the server'),
    );
  });

  test('maps authorization failures without suggesting handover', () {
    expect(
      guardParcelPickupRecovery(GuardApiException('Unauthorized', statusCode: 401)),
      contains('Sign in again'),
    );
    expect(
      guardParcelPickupRecovery(GuardApiException('Forbidden', statusCode: 403)),
      contains('security supervisor'),
    );
  });
}
