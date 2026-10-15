import 'package:aaraagate_resident/main.dart';
import 'package:aaraagate_resident/auth/auth_repository.dart';
import 'package:aaraagate_resident/auth/resident_auth_controller.dart';
import 'package:aaraagate_resident/auth/session_store.dart';
import 'package:aaraagate_resident/preferences/resident_experience_preferences.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

class MemoryPreferences implements ResidentPreferenceStore {
  @override
  Future<String?> read(String key) async => null;
  @override
  Future<void> write(String key, String value) async {}
}

void main() {
  testWidgets('application shell preserves device scaling with and without Easy Mode', (tester) async {
    tester.view.physicalSize = const Size(320, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    tester.platformDispatcher.textScaleFactorTestValue = 2;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    final auth = ResidentAuthController(repository: AuthRepository(baseUrl: 'http://unused.invalid'), sessionStore: SessionStore());
    final preferences = ResidentExperiencePreferences(store: MemoryPreferences());
    addTearDown(auth.dispose);
    addTearDown(preferences.dispose);
    await tester.pumpWidget(AaraagateResidentApp(apiBaseUrl: 'http://unused.invalid', authController: auth, experiencePreferences: preferences));
    final context = tester.element(find.byType(CircularProgressIndicator).first);
    expect(MediaQuery.textScalerOf(context).scale(16), 32);
    expect(tester.takeException(), isNull);
    await preferences.setEasyMode(true);
    await tester.pump();
    expect(MediaQuery.textScalerOf(context).scale(16), 32);
    expect(tester.takeException(), isNull);
    tester.platformDispatcher.textScaleFactorTestValue = 1;
    await tester.pump();
    expect(MediaQuery.textScalerOf(context).scale(16), closeTo(17.92, .01));
  });
}
