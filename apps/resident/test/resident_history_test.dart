import 'package:aaraagate_resident/data/resident_history.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('limits visible history and retains exact microsecond cursor', () {
    final rows = List.generate(51, (index) => <String,dynamic>{'id':'id-$index','historyTimestamp':'2026-10-22T00:00:00.123456Z'});
    final page = ResidentHistoryPage(rows);
    expect(page.items, hasLength(50));
    expect(page.next!.id, 'id-49');
    expect(page.next!.timestamp, endsWith('123456Z'));
    expect(() => page.items.add({}), throwsUnsupportedError);
  });
  test('does not silently lose older records when the server cursor is missing', () {
    expect(() => ResidentHistoryPage(List.generate(51, (_) => <String,dynamic>{'id':'x'})), throwsStateError);
  });
  test('showcase search retains current unit and literal title matching', () {
    final rows = [
      {'id':'1','unitId':'one','ticketNumber':'AG-1','title':'Lift','status':'OPEN'},
      {'id':'2','unitId':'two','ticketNumber':'AG-2','title':'Lift','status':'OPEN'},
    ];
    expect(showcaseHistory(rows,unitId:'one',search:'lift',status:'OPEN').map((row)=>row['id']), ['1']);
  });
}
