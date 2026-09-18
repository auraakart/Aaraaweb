import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class GuardPreferences {
  const GuardPreferences({FlutterSecureStorage storage = const FlutterSecureStorage()}) : _storage = storage;
  final FlutterSecureStorage _storage;

  static const _languageKey = 'aaraagate.guard.language';
  static const _voiceKey = 'aaraagate.guard.voiceEnabled';

  Future<String> readLanguage() async => (await _storage.read(key: _languageKey)) ?? 'en';
  Future<bool> readVoiceEnabled() async => (await _storage.read(key: _voiceKey)) != 'false';
  Future<void> writeLanguage(String code) => _storage.write(key: _languageKey, value: code);
  Future<void> writeVoiceEnabled(bool enabled) => _storage.write(key: _voiceKey, value: enabled ? 'true' : 'false');
}
