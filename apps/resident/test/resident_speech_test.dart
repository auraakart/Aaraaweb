import 'package:flutter_test/flutter_test.dart';
import 'package:aaraagate_resident/voice/resident_speech.dart';

void main() {
  test('resident voice uses eight Indian-language locale mappings', () {
    expect(DeviceResidentSpeech.localeByLanguage.keys, containsAll(<String>['en','hi','ta','te','kn','ml','mr','bn']));
    expect(DeviceResidentSpeech.localeByLanguage['ta'], 'ta_IN');
    expect(ResidentVoiceCopy.text('hi','review'), contains('मसौदा'));
    expect(ResidentVoiceCopy.text('xx','action'), 'Describe by voice');
  });

  test('silent speech keeps manual fallback deterministic', () async {
    expect(await const SilentResidentSpeech().listenOnce(languageCode:'ta'), isNull);
  });
}
