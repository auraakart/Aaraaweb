import 'package:flutter_secure_storage/flutter_secure_storage.dart';

abstract class GuardPreferences {
  Future<String> readLanguage();
  Future<bool> readVoiceEnabled();
  Future<void> writeLanguage(String code);
  Future<void> writeVoiceEnabled(bool enabled);
}

class SecureGuardPreferences implements GuardPreferences {
  const SecureGuardPreferences({FlutterSecureStorage storage = const FlutterSecureStorage()}) : _storage = storage;
  final FlutterSecureStorage _storage;

  static const _languageKey = 'aaraagate.guard.language';
  static const _voiceKey = 'aaraagate.guard.voiceEnabled';

  @override Future<String> readLanguage() async => (await _storage.read(key: _languageKey)) ?? 'en';
  @override Future<bool> readVoiceEnabled() async => (await _storage.read(key: _voiceKey)) != 'false';
  @override Future<void> writeLanguage(String code) => _storage.write(key: _languageKey, value: code);
  @override Future<void> writeVoiceEnabled(bool enabled) => _storage.write(key: _voiceKey, value: enabled ? 'true' : 'false');
}

class MemoryGuardPreferences implements GuardPreferences {
  const MemoryGuardPreferences({this.language = 'en', this.voiceEnabled = true});
  final String language;
  final bool voiceEnabled;
  @override Future<String> readLanguage() async => language;
  @override Future<bool> readVoiceEnabled() async => voiceEnabled;
  @override Future<void> writeLanguage(String code) async {}
  @override Future<void> writeVoiceEnabled(bool enabled) async {}
}
