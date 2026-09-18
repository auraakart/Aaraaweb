import 'package:aaraagate_guard/voice/guard_voice.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('maps every advertised Indian Guard language to an India TTS locale', () {
    expect(DeviceGuardVoice.localeByLanguage, containsPair('en', 'en-IN'));
    expect(DeviceGuardVoice.localeByLanguage, containsPair('hi', 'hi-IN'));
    expect(DeviceGuardVoice.localeByLanguage, containsPair('ta', 'ta-IN'));
    expect(DeviceGuardVoice.localeByLanguage, containsPair('te', 'te-IN'));
    expect(DeviceGuardVoice.localeByLanguage, containsPair('kn', 'kn-IN'));
    expect(DeviceGuardVoice.localeByLanguage, containsPair('ml', 'ml-IN'));
    expect(DeviceGuardVoice.localeByLanguage, containsPair('mr', 'mr-IN'));
    expect(DeviceGuardVoice.localeByLanguage, containsPair('bn', 'bn-IN'));
  });
}
