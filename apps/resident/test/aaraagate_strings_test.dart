import 'dart:ui';
import 'package:flutter_test/flutter_test.dart';
import 'package:aaraagate_resident/localization/aaraagate_strings.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  tearDown(() {
    TestWidgetsFlutterBinding.instance.platformDispatcher.clearLocaleTestValue();
  });

  test('supports the eight V3 regional language codes', () {
    expect(
      AaraagateStrings.supportedLanguageCodes,
      containsAll(<String>['en', 'hi', 'ta', 'te', 'kn', 'ml', 'mr', 'bn']),
    );
  });

  test('uses Tamil critical gate actions when device locale is Tamil', () {
    TestWidgetsFlutterBinding.instance.platformDispatcher.localeTestValue = const Locale('ta', 'IN');
    final strings = AaraagateStrings.device();
    expect(strings.text('deny'), 'மறுக்கவும்');
    expect(strings.text('allowEntry'), 'நுழைய அனுமதி');
    expect(strings.text('createPass'), 'விருந்தினர் பாஸ் உருவாக்கவும்');
  });

  test('uses Hindi approval copy and formats values', () {
    TestWidgetsFlutterBinding.instance.platformDispatcher.localeTestValue = const Locale('hi', 'IN');
    final strings = AaraagateStrings.device();
    expect(strings.text('approvalRequired'), 'स्वीकृति आवश्यक');
    expect(strings.format('approvedSecurity', {'label': strings.text('cab')}), contains('कैब'));
  });

  test('falls back to English for unsupported device locale', () {
    TestWidgetsFlutterBinding.instance.platformDispatcher.localeTestValue = const Locale('fr', 'FR');
    final strings = AaraagateStrings.device();
    expect(strings.languageCode, 'en');
    expect(strings.text('allow'), 'Allow');
  });
}
