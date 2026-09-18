import 'package:aaraagate_resident/data/api_client.dart';
import 'package:aaraagate_resident/screens/occupancy_lifecycle_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

class _OccupancyApi extends ApiClient {
  _OccupancyApi() : super(baseUrl: 'http://127.0.0.1:3000', accessToken: 'test');

  @override
  Future<dynamic> get(String path) async {
    if (path == '/api/v1/occupancy-lifecycle/self') {
      return [
        {
          'id':'request-1','unitId':'unit-1','kind':'MOVE_OUT','relation':'OWNER','status':'APPROVED',
          'effectiveAt':'2026-09-20T09:00:00.000Z',
        }
      ];
    }
    if (path == '/api/v1/occupancy-lifecycle/self/context') {
      return {
        'occupancies':[
          {
            'id':'occ-1','unitId':'unit-1','relation':'OWNER','effectiveFrom':'2026-01-01T00:00:00.000Z',
            'unit':{'id':'unit-1','number':'101','building':{'id':'b-1','name':'A Block','code':'A'}},
          }
        ],
        'ownedUnitIds':['unit-1'],
        'ownedUnits':[
          {
            'unitId':'unit-1','ownershipBps':10000,
            'unit':{'id':'unit-1','number':'101','building':{'id':'b-1','name':'A Block','code':'A'}},
          }
        ],
      };
    }
    if (path == '/api/v1/occupancy-lifecycle/self/request-1') {
      return {
        'id':'request-1','unitId':'unit-1','kind':'MOVE_OUT','relation':'OWNER','status':'APPROVED',
        'effectiveAt':'2026-09-20T09:00:00.000Z',
        'checklist':[
          {'id':'c-1','label':'Society dues cleared','required':true,'completedAt':'2026-09-18T10:00:00.000Z'},
          {'id':'c-2','label':'Gate/access revocation ready','required':true,'completedAt':null},
        ],
        'documents':[
          {'id':'d-1','kind':'MOVE_CLEARANCE','verifiedAt':null},
        ],
        'events':[
          {'id':'e-1','eventType':'REQUESTED','createdAt':'2026-09-17T10:00:00.000Z','note':'Moving next week'},
          {'id':'e-2','eventType':'APPROVED','createdAt':'2026-09-18T10:00:00.000Z'},
        ],
      };
    }
    throw ApiException(404,'Not found');
  }
}

void main() {
  testWidgets('resident move request shows property, next action and timeline', (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: OccupancyLifecycleScreen(api:_OccupancyApi(),activeUnitId:'unit-1'),
    ));
    await tester.pumpAndSettle();

    expect(find.textContaining('A Block · 101'), findsWidgets);
    expect(find.text('MOVE OUT'), findsOneWidget);

    await tester.tap(find.text('MOVE OUT'));
    await tester.pumpAndSettle();

    expect(find.text('What happens next'), findsOneWidget);
    expect(find.textContaining('required society handover checks are still open'), findsOneWidget);
    expect(find.text('Request timeline'), findsOneWidget);
    expect(find.text('APPROVED'), findsWidgets);
    expect(find.textContaining('Moving next week'), findsOneWidget);
  });
}
