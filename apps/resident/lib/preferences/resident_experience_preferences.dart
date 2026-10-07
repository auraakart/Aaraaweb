import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

abstract class ResidentPreferenceStore {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
}

class SecureResidentPreferenceStore implements ResidentPreferenceStore {
  SecureResidentPreferenceStore({FlutterSecureStorage? storage}) : _storage = storage ?? const FlutterSecureStorage();
  final FlutterSecureStorage _storage;
  @override
  Future<String?> read(String key) => _storage.read(key: key);
  @override
  Future<void> write(String key, String value) => _storage.write(key: key, value: value);
}

/// Device-local accessibility preference. Easy mode changes presentation only;
/// it never changes permissions, entitlements, property scope or server behavior.
class ResidentExperiencePreferences extends ChangeNotifier {
  ResidentExperiencePreferences({ResidentPreferenceStore? store}) : _store = store ?? SecureResidentPreferenceStore();
  final ResidentPreferenceStore _store;
  static const easyModeKey = 'resident.preference.easy_mode';
  bool _easyMode = false;
  bool get easyMode => _easyMode;

  Future<void> load() async {
    _easyMode = (await _store.read(easyModeKey)) == 'true';
    notifyListeners();
  }

  Future<void> setEasyMode(bool enabled) async {
    if (_easyMode == enabled) return;
    _easyMode = enabled;
    notifyListeners();
    await _store.write(easyModeKey, enabled ? 'true' : 'false');
  }
}
