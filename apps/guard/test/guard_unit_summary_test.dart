import 'package:flutter_test/flutter_test.dart';
import 'package:aaraagate_guard/models/guard_unit_summary.dart';

void main(){
  test('parses guard directory unit into typed summary',(){
    final unit=GuardUnitSummary.tryParse({'id':'unit-1','number':'204','building':{'name':'Block B','code':'B'}});
    expect(unit,isNotNull);
    expect(unit!.label,'Block B · 204');
    expect(unit.raw['id'],'unit-1');
  });

  test('rejects unit without building boundary',(){
    expect(GuardUnitSummary.tryParse({'id':'unit-1','number':'204'}),isNull);
  });
}
