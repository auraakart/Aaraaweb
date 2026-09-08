import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:aaraagate_resident/auth/auth_repository.dart';
import 'package:aaraagate_resident/auth/resident_auth_controller.dart';
import 'package:aaraagate_resident/auth/session_store.dart';

class _DelayedAuthRepository extends AuthRepository {
  _DelayedAuthRepository() : super(baseUrl: 'http://localhost');

  final requestOtpCompleter = Completer<String>();

  @override
  Future<String> requestOtp(String phone) => requestOtpCompleter.future;
}

void main() {
  test('ignores async auth completion after controller disposal', () async {
    final repository = _DelayedAuthRepository();
    final controller = ResidentAuthController(
      repository: repository,
      sessionStore: SessionStore(),
    );

    final request = controller.requestOtp('+919999999999');
    controller.dispose();
    repository.requestOtpCompleter.complete('challenge-after-dispose');

    await expectLater(request, completes);
    expect(controller.challengeId, isNull);
    expect(controller.step, ResidentAuthStep.loading);
  });
}
