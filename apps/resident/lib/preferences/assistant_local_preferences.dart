import 'resident_experience_preferences.dart';

/// Explicit device-local preference only. No notifications or transcripts.
class AssistantLocalPreferences {
  AssistantLocalPreferences({ResidentPreferenceStore? store})
      : _store = store ?? SecureResidentPreferenceStore();
  final ResidentPreferenceStore _store;
  static const briefingShortcutKey = 'resident.assistant.briefing_shortcut_opt_in';
  Future<bool> loadBriefingShortcut() async =>
      (await _store.read(briefingShortcutKey)) == 'true';
  Future<void> setBriefingShortcut(bool enabled) async =>
      _store.write(briefingShortcutKey, enabled ? 'true' : 'false');
}
