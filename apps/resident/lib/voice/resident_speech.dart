import 'dart:async';

import 'package:speech_to_text/speech_to_text.dart';

abstract class ResidentSpeech {
  Future<String?> listenOnce({required String languageCode});
  Future<void> stop();
}

class DeviceResidentSpeech implements ResidentSpeech {
  DeviceResidentSpeech({SpeechToText? speech}) : _speech = speech ?? SpeechToText();

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
    try {
      final available = await _speech.initialize(
        onError: (_) {
          if (!completer.isCompleted) completer.complete(null);
        },
      );
      if (!available) return null;
      await _speech.listen(
        listenOptions: SpeechListenOptions(
          localeId: localeByLanguage[languageCode] ?? 'en_IN',
          listenFor: const Duration(seconds: 15),
          pauseFor: const Duration(seconds: 2),
          partialResults: false,
          cancelOnError: true,
        ),
        onResult: (result) {
          if (!result.finalResult || completer.isCompleted) return;
          final words = result.recognizedWords.trim();
          completer.complete(words.isEmpty ? null : words);
        },
      );
      return await completer.future.timeout(const Duration(seconds: 17), onTimeout: () => null);
    } catch (_) {
      return null;
    } finally {
      try {
        await _speech.stop();
      } catch (_) {
        // Device/plugin shutdown failures are non-fatal for the assistant draft flow.
      }
    }
  }

  @override
  Future<void> stop() async {
    try {
      await _speech.stop();
    } catch (_) {
      // Treat plugin/device stop failures as already stopped.
    }
  }
}

class SilentResidentSpeech implements ResidentSpeech {
  const SilentResidentSpeech();

  @override
  Future<String?> listenOnce({required String languageCode}) async => null;

  @override
  Future<void> stop() async {}
}
