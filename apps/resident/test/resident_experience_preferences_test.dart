import 'package:aaraagate_resident/preferences/resident_experience_preferences.dart';
import 'package:flutter_test/flutter_test.dart';

class _MemoryStore implements ResidentPreferenceStore {
  final values=<String,String>{};
  @override
  Future<String?> read(String key) async=>values[key];
  @override
  Future<void> write(String key,String value) async{values[key]=value;}
}

void main(){
  test('easy mode loads from device-local preference storage',() async{
    final store=_MemoryStore()..values[ResidentExperiencePreferences.easyModeKey]='true';
    final preferences=ResidentExperiencePreferences(store:store);
    await preferences.load();
    expect(preferences.easyMode,isTrue);
  });

  test('easy mode persists presentation choice only',() async{
    final store=_MemoryStore();
    final preferences=ResidentExperiencePreferences(store:store);
    await preferences.setEasyMode(true);
    expect(preferences.easyMode,isTrue);
    expect(store.values[ResidentExperiencePreferences.easyModeKey],'true');
    await preferences.setEasyMode(false);
    expect(store.values[ResidentExperiencePreferences.easyModeKey],'false');
  });
}
