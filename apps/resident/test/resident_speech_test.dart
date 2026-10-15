import 'dart:async';
import 'package:speech_to_text/speech_to_text.dart';
import 'package:speech_to_text/speech_recognition_result.dart';

import 'package:flutter_test/flutter_test.dart';
import 'package:aaraagate_resident/voice/resident_speech.dart';

class FakeDeviceSpeech extends SpeechToText {
  FakeDeviceSpeech() : super.withMethodChannel();
  SpeechStatusListener? status;
  SpeechResultListener? result;
  final options = <SpeechListenOptions>[];
  List<String> localesAvailable = ['en_US', 'ta-IN'];
  int initializations = 0;
  int cancellations = 0;
  Completer<void> started = Completer<void>();

  @override
  Future<bool> initialize({SpeechErrorListener? onError, SpeechStatusListener? onStatus,
    dynamic debugLogging = false, Duration finalTimeout = SpeechToText.defaultFinalTimeout,
    List<SpeechConfigOption>? options}) async {
    initializations++;
    status = onStatus;
    return true;
  }

  @override
  Future<List<LocaleName>> locales() async =>
      localesAvailable.map((id) => LocaleName(id, id)).toList();

  @override
  Future listen({SpeechResultListener? onResult, Duration? listenFor, Duration? pauseFor,
    String? localeId, SpeechSoundLevelChange? onSoundLevelChange, dynamic cancelOnError = false,
    dynamic partialResults = true, dynamic onDevice = false,
    ListenMode listenMode = ListenMode.confirmation, dynamic sampleRate = 0,
    SpeechListenOptions? listenOptions}) async {
    result = onResult;
    options.add(listenOptions!);
    status?.call('listening');
    started.complete();
  }

  @override
  Future<void> cancel() async {
    cancellations++;
    status?.call('done'); // Native completion from the preceding session.
    result = null;
  }

  @override
  Future<void> stop() async { status?.call('notListening'); }

  void words(String words, {bool finalResult = true}) => result?.call(
    SpeechRecognitionResult.fromJson({'alternates': [
      {'recognizedWords': words, 'confidence': 1.0}
    ], 'resultType': finalResult ? 2 : 0}));
}

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

  test('speech locale selection prefers exact, then same-language, never an unrelated system fallback', () {
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
      isNull,
    );
  });

  test('default speech wrappers share the one initialized plugin callback owner', () {
    expect(identical(DeviceResidentSpeech(), DeviceResidentSpeech()), isTrue);
  });

  test('Tamil selects Tamil; missing Tamil never starts an English recognizer', () async {
    final engine = FakeDeviceSpeech();
    final speech = DeviceResidentSpeech(speech: engine);
    final first = speech.listenOnce(languageCode: 'ta');
    await engine.started.future;
    expect(engine.options.single.localeId, 'ta-IN');
    expect(engine.options.single.listenMode, ListenMode.dictation);
    engine.words('எனது பராமரிப்பு கட்டணம் என்ன');
    expect(await first, 'எனது பராமரிப்பு கட்டணம் என்ன');
    engine.localesAvailable = ['en_US'];
    await expectLater(speech.listenOnce(languageCode: 'ta'),
      throwsA(isA<ResidentSpeechUnavailable>()));
    expect(engine.options, hasLength(1));
  });

  test('waits for final text after notListening and isolates a second recording', () async {
    final engine = FakeDeviceSpeech();
    final speech = DeviceResidentSpeech(speech: engine);
    var finished = false;
    final first = speech.listenOnce(languageCode: 'ta').then((value) { finished = true; return value; });
    await engine.started.future;
    final oldResult = engine.result!;
    engine.words('முதல்', finalResult: false);
    engine.status!('notListening');
    await Future<void>.delayed(Duration.zero);
    expect(finished, isFalse);
    engine.words('முதல் கேள்வி');
    expect(await first, 'முதல் கேள்வி');
    engine.started = Completer<void>();
    final second = speech.listenOnce(languageCode: 'ta');
    await engine.started.future;
    oldResult(SpeechRecognitionResult.fromJson({'alternates': [
      {'recognizedWords': 'old English result', 'confidence': 1.0}
    ], 'resultType': 2}));
    engine.status!('notListening');
    engine.words('இரண்டாவது கேள்வி');
    expect(await second, 'இரண்டாவது கேள்வி');
    expect(engine.initializations, 1);
    expect(engine.options, hasLength(2));
    expect(engine.cancellations, 4);
  });

  test('manual stop waits for final words rather than dropping them', () async {
    final engine = FakeDeviceSpeech();
    final speech = DeviceResidentSpeech(speech: engine);
    final capture = speech.listenOnce(languageCode: 'en');
    await engine.started.future;
    await speech.stop();
    engine.words('Show my maintenance dues');
    expect(await capture, 'Show my maintenance dues');
  });

  test('silent speech keeps manual fallback deterministic', () async {
    expect(await const SilentResidentSpeech().listenOnce(languageCode: 'ta'), isNull);
  });
}
