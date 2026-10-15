import 'resident_experience_preferences.dart';

/// Opt-in is tied to one authenticated session, society and selected property.
class AssistantLocalPreferences {
  AssistantLocalPreferences({ResidentPreferenceStore? store, String? scope})
      : _store = store ?? SecureResidentPreferenceStore(),
        _scope = scope?.trim();
  final ResidentPreferenceStore _store;
  final String? _scope;
  static const briefingShortcutKey = 'resident.assistant.briefing_shortcut_opt_in';
  String? get _scopedKey => (_scope?.isNotEmpty ?? false)
      ? briefingShortcutKey + '.' + Uri.encodeComponent(_scope!)
      : null;

  Future<bool> loadBriefingShortcut() async {
    final key = _scopedKey;
    if (key == null) return false;
    return (await _store.read(key)) == 'true';
  }

  Future<void> setBriefingShortcut(bool enabled) async {
    final key = _scopedKey;
    if (key == null) throw StateError('Authenticated Assistant preference context required');
    await _store.write(key, enabled ? 'true' : 'false');
  }
}
