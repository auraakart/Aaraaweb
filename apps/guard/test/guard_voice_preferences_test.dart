import 'package:aaraagate_guard/data/guard_preferences.dart';
import 'package:aaraagate_guard/data/guard_api.dart';
import 'package:aaraagate_guard/data/guard_session_store.dart';
import 'package:aaraagate_guard/data/offline_action_queue.dart';
import 'package:aaraagate_guard/guard_controller.dart';
import 'package:aaraagate_guard/voice/guard_voice.dart';
import 'package:flutter_test/flutter_test.dart';

class RecordingPreferences implements GuardPreferences {
  String language='en';
  bool voiceEnabled=true;
  @override Future<String> readLanguage() async=>language;
  @override Future<bool> readVoiceEnabled() async=>voiceEnabled;
  @override Future<void> writeLanguage(String code) async{language=code;}
  @override Future<void> writeVoiceEnabled(bool enabled) async{voiceEnabled=enabled;}
}
class RecordingVoice implements GuardVoice {
  String? text;
  String? languageCode;
  int stops=0;
  @override Future<void> speak({required String text,required String languageCode}) async{this.text=text;this.languageCode=languageCode;}
  @override Future<void> stop() async{stops++;}
}

void main(){
  test('language preference controls localized spoken access cue',() async{
    final preferences=RecordingPreferences();
    final voice=RecordingVoice();
    final controller=GuardController(
      api:GuardApi(baseUrl:'http://127.0.0.1:3000'),
      sessions:const GuardSessionStore(),
      offlineQueue:const OfflineActionQueue(),
      preferences:preferences,
      voice:voice,
    );
    await controller.setLanguage('ta');
    await controller.announce('voiceAccessApproved');
    expect(preferences.language,'ta');
    expect(voice.languageCode,'ta');
    expect(voice.text,contains('அனுமதி'));
  });

  test('disabling voice persists preference and stops speech',() async{
    final preferences=RecordingPreferences();
    final voice=RecordingVoice();
    final controller=GuardController(
      api:GuardApi(baseUrl:'http://127.0.0.1:3000'),
      sessions:const GuardSessionStore(),
      offlineQueue:const OfflineActionQueue(),
      preferences:preferences,
      voice:voice,
    );
    await controller.setVoiceEnabled(false);
    expect(preferences.voiceEnabled,isFalse);
    expect(voice.stops,1);
  });
}
