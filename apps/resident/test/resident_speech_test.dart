import 'package:flutter_test/flutter_test.dart';
import 'package:aaraagate_resident/voice/resident_speech.dart';

void main() {
  test('resident voice exposes clear language names and simple Speak copy', () {
    expect(
      ResidentVoiceCopy.languageLabels,
      {
        'en': 'English',
        'hi': 'हिंदी',
        'ta': 'தமிழ்',
        'te': 'తెలుగు',
        'kn': 'ಕನ್ನಡ',
        'ml': 'മലയാളം',
        'mr': 'मराठी',
        'bn': 'বাংলা',
      },
    );
    for (final language in ResidentVoiceCopy.languageLabels.keys) {
      expect(ResidentVoiceCopy.text(language, 'assistantAction'), isNot(contains('voice')));
      expect(ResidentVoiceCopy.text(language, 'assistantAction').trim(), isNotEmpty);
    }
    expect(ResidentVoiceCopy.text('xx', 'assistantAction'), 'Speak');
  });

  test('speech locale selection prefers exact, then same-language, then system fallback', () {
    expect(
      DeviceResidentSpeech.bestLocaleId(
        languageCode: 'ta',
        availableLocaleIds: const ['en_US', 'ta_IN', 'hi_IN'],
        systemLocaleId: 'en_US',
      ),
      'ta_IN',
    );
    expect(
      DeviceResidentSpeech.bestLocaleId(
        languageCode: 'en',
        availableLocaleIds: const ['en_GB', 'hi_IN'],
        systemLocaleId: 'hi_IN',
      ),
      'en_GB',
    );
    expect(
      DeviceResidentSpeech.bestLocaleId(
        languageCode: 'ml',
        availableLocaleIds: const ['en_US', 'hi_IN'],
        systemLocaleId: 'hi_IN',
      ),
      'hi_IN',
    );
  });

  test('silent speech keeps manual fallback deterministic', () async {
    expect(await const SilentResidentSpeech().listenOnce(languageCode: 'ta'), isNull);
  });
}
