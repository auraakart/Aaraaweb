import 'package:aaraagate_guard/localization/guard_strings.dart';
import 'package:flutter_test/flutter_test.dart';

void main(){
  const requiredKeys=[
    'tools','language','operationsOverview','activeGate','realtime','connected','disconnected','offlineQueue','pendingActions','retrySync',
    'unitDirectory','searchUnit','noUnits','ready','reviewRequired','cachedDirectory','cachedLookup',
    'quick','parcels','staff','fieldOperations','schoolTransport','voiceCues','voiceCuesHelp',
    'gateOperations','signOut','securityShiftActive','selectGateBegin','scanPass','scanHint','scanQr','enterCredential','manualCredential','verify',
    'enter','exit','quickArrival','delivery','cab','walkInVisitor','waitingApproval','checkApproval','approvedEnter','close',
    'onlineClear','noQueuedActions','processing','voiceAccessApproved','voiceAccessBlocked','voiceWaitingApproval'
  ];

  test('all advertised guard languages contain critical operational and spoken vocabulary',(){
    for(final language in guardLanguages){
      final strings=GuardStrings(language.code);
      for(final key in requiredKeys){
        expect(strings.get(key),isNot(key),reason:'${language.code} missing $key');
        expect(strings.get(key).trim(),isNotEmpty,reason:'${language.code} empty $key');
      }
    }
  });
}
