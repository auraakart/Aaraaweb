import 'package:aaraagate_guard/localization/guard_strings.dart';
import 'package:flutter_test/flutter_test.dart';

void main(){
  const requiredKeys=['tools','language','operationsOverview','activeGate','realtime','connected','disconnected','offlineQueue','pendingActions','retrySync','unitDirectory','searchUnit','noUnits','ready','reviewRequired','cachedDirectory','cachedLookup'];
  test('all advertised guard languages contain the V4.2 operational vocabulary',(){
    for(final language in guardLanguages){
      final strings=GuardStrings(language.code);
      for(final key in requiredKeys){
        expect(strings.get(key),isNot(key),reason:'${language.code} missing $key');
        expect(strings.get(key).trim(),isNotEmpty,reason:'${language.code} empty $key');
      }
    }
  });
}
