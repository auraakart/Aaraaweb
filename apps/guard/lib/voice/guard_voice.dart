import 'package:flutter_tts/flutter_tts.dart';

abstract class GuardVoice {
  Future<void> speak({required String text, required String languageCode});
  Future<void> stop();
}

class DeviceGuardVoice implements GuardVoice {
  DeviceGuardVoice({FlutterTts? tts}) : _tts = tts ?? FlutterTts();
  final FlutterTts _tts;

  static const localeByLanguage = <String, String>{
    'en': 'en-IN',
    'hi': 'hi-IN',
    'ta': 'ta-IN',
    'te': 'te-IN',
    'kn': 'kn-IN',
    'ml': 'ml-IN',
    'mr': 'mr-IN',
    'bn': 'bn-IN',
  };

  @override
  Future<void> speak({required String text, required String languageCode}) async {
    final normalized = text.trim();
    if (normalized.isEmpty) return;
    await _tts.stop();
    await _tts.setLanguage(localeByLanguage[languageCode] ?? 'en-IN');
    await _tts.setSpeechRate(0.46);
    await _tts.setVolume(1.0);
    await _tts.setPitch(1.0);
    await _tts.speak(normalized);
  }

  @override
  Future<void> stop() => _tts.stop();
}

class SilentGuardVoice implements GuardVoice {
  const SilentGuardVoice();
  @override Future<void> speak({required String text, required String languageCode}) async {}
  @override Future<void> stop() async {}
}
