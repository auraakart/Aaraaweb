import 'package:aaraagate_resident/data/api_client.dart';
import 'package:aaraagate_resident/data/resident_data_controller.dart';
import 'package:aaraagate_resident/data/resident_repository.dart';
import 'package:aaraagate_resident/screens/helpdesk_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

class _HelpdeskRepository extends ResidentRepository {
  _HelpdeskRepository():super(ApiClient(baseUrl:'http://127.0.0.1:3000',accessToken:'test'));

  @override
  Future<List<Map<String,dynamic>>> helpdeskTickets() async => [
    {
      'id':'ticket-1',
      'unitId':'unit-1',
      'title':'Water leak',
      'description':'Leak near the kitchen sink',
      'priority':'HIGH',
      'status':'RESOLVED',
      'category':'PLUMBING',
      'buildingName':'A Block',
      'unitNumber':'101',
      'computedSlaState':'MET',
      'firstResponseDueAt':'2026-09-19T04:00:00.000Z',
      'resolutionDueAt':'2026-09-19T08:00:00.000Z',
      'resolutionCode':'FIXED',
    }
  ];

  @override
  Future<List<Map<String,dynamic>>> helpdeskActivities(String ticketId) async => [
    {
      'id':'activity-1','type':'REOPENED','message':null,'actorName':'Society Admin',
      'toStatus':'IN_PROGRESS','occurredAt':'2026-09-19T03:00:00.000Z',
    },
    {
      'id':'activity-2','type':'STATUS_CHANGED','message':'Repair completed',
      'actorName':'Facility Manager','toStatus':'RESOLVED','occurredAt':'2026-09-19T05:00:00.000Z',
    },
  ];
}

void main(){
  testWidgets('resident helpdesk shows property, SLA targets, next action and recovery evidence',(tester) async{
    final repository=_HelpdeskRepository();
    final controller=ResidentDataController(repository,activeUnitId:'unit-1',fetchEntitlements:false);
    controller.households=[{'id':'house-1','unitId':'unit-1'}];

    await tester.pumpWidget(MaterialApp(home:HelpdeskScreen(controller:controller)));
    await tester.pumpAndSettle();

    expect(find.text('Water leak'),findsOneWidget);
    expect(find.textContaining('A Block · 101'),findsOneWidget);
    expect(find.text('SLA Met'),findsOneWidget);

    await tester.tap(find.text('Water leak'));
    await tester.pumpAndSettle();

    expect(find.text('Service recovery'),findsOneWidget);
    expect(find.text('What happens next'),findsOneWidget);
    expect(find.textContaining('marked this resolved'),findsOneWidget);
    expect(find.text('First response target'),findsOneWidget);
    expect(find.text('Resolution target'),findsOneWidget);
    expect(find.text('Resolution evidence'),findsOneWidget);
    expect(find.text('Fixed'),findsOneWidget);
    expect(find.text('Reopened'),findsOneWidget);

    controller.dispose();
  });
}
