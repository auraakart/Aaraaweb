import 'dart:async';

import 'package:speech_to_text/speech_to_text.dart';

abstract class GuardSpeech {
  Future<String?> listenOnce({required String languageCode});
  Future<void> stop();
}

class DeviceGuardSpeech implements GuardSpeech {
  DeviceGuardSpeech({SpeechToText? speech}) : _speech = speech ?? SpeechToText();

  final SpeechToText _speech;

  static const localeByLanguage = <String, String>{
    'en': 'en_IN',
    'hi': 'hi_IN',
    'ta': 'ta_IN',
    'te': 'te_IN',
    'kn': 'kn_IN',
    'ml': 'ml_IN',
    'mr': 'mr_IN',
    'bn': 'bn_IN',
  };

  @override
  Future<String?> listenOnce({required String languageCode}) async {
    final completer = Completer<String?>();
    final available = await _speech.initialize(
      onError: (_) {
        if (!completer.isCompleted) completer.complete(null);
      },
    );
    if (!available) return null;

    try {
      await _speech.listen(
        localeId: localeByLanguage[languageCode] ?? 'en_IN',
        listenFor: const Duration(seconds: 10),
        pauseFor: const Duration(seconds: 2),
        partialResults: false,
        cancelOnError: true,
        onResult: (result) {
          if (!result.finalResult || completer.isCompleted) return;
          final words = result.recognizedWords.trim();
          completer.complete(words.isEmpty ? null : words);
        },
      );
      return await completer.future.timeout(
        const Duration(seconds: 12),
        onTimeout: () => null,
      );
    } finally {
      await _speech.stop();
    }
  }

  @override
  Future<void> stop() => _speech.stop();
}

class SilentGuardSpeech implements GuardSpeech {
  const SilentGuardSpeech();

  @override
  Future<String?> listenOnce({required String languageCode}) async => null;

  @override
  Future<void> stop() async {}
}
